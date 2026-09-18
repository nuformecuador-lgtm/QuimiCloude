// Limites de alcance de la rama, todos de ausencia. Los de diff se miden contra la base de fusion
// con `origin/dev` (o `dev`), contando arbol de trabajo y archivos sin seguimiento; los de codigo
// se leen del modulo.
//
// Fuera de su rama, los casos de diff se saltan: una guardia de «la rama no toca X» ya mergeada se
// pondria roja con el trabajo legitimo de la siguiente. En su rama, no poder calcular la base es rojo.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as inventario from '@/lib/modules/inventario';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------------------------
// LA RAMA Y SU DIFF
// ---------------------------------------------------------------------------------------------

export const RAMA_DE_LA_FICHA = 'feature/QC-81-lote-y-fecha-de-compra';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-81-lote-y-fecha-de-compra/';

/** `origin/dev` primero: un `dev` local atrasado arrastraria al rango trabajo ajeno ya mergeado. */
const BASES = ['origin/dev', 'dev'] as const;

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function ramaActual(): string | null {
  const rama = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return rama === null || rama.length === 0 ? null : rama;
}

function mergeBaseDeLaRama(): string | null {
  for (const base of BASES) {
    const sha = git(['merge-base', base, 'HEAD']);
    if (sha !== null && sha.length > 0) return sha;
  }
  return null;
}

function lineas(salida: string | null): string[] {
  if (salida === null) return [];
  return salida
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}

/**
 * Commits y arbol de trabajo, mas los archivos sin seguimiento: `git diff` no los ve y son justo
 * lo nuevo.
 */
function archivosDeLaRama(mergeBase: string): readonly string[] {
  const seguidos = git(['diff', '--name-only', mergeBase]);
  const sinSeguimiento = git(['ls-files', '--others', '--exclude-standard']);
  if (seguidos === null || sinSeguimiento === null) {
    throw new Error(
      `git no pudo listar el diff contra ${mergeBase}: R28/R29/R30 NO se han comprobado, y en la ` +
        'rama de la ficha eso es rojo, no un salto.',
    );
  }
  return [...new Set([...lineas(seguidos), ...lineas(sinSeguimiento)])].sort();
}

export type Preparacion =
  | { readonly tipo: 'saltar'; readonly motivo: string }
  | { readonly tipo: 'fallar'; readonly motivo: string }
  | { readonly tipo: 'medir'; readonly mergeBase: string };

/** La precondicion en un solo sitio. Pura: se prueba sin git. */
export function preparar(rama: string | null, mergeBase: string | null): Preparacion {
  if (rama === null) {
    return { tipo: 'saltar', motivo: 'no se pudo leer la rama actual con git: este caso NO ha comprobado nada.' };
  }
  if (rama !== RAMA_DE_LA_FICHA) {
    return {
      tipo: 'saltar',
      motivo:
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R28, R29 y R30 hablan de lo que hace ` +
        'ESTA ficha, no de lo que haga quien pase despues. Este caso NO ha comprobado nada.',
    };
  }
  if (mergeBase === null) {
    return {
      tipo: 'fallar',
      motivo:
        `estamos en '${RAMA_DE_LA_FICHA}' y no se pudo calcular el merge-base con ${BASES.join(' ni con ')}: ` +
        'la guardia no puede mirar el diff de su propia ficha, y eso es rojo.',
    };
  }
  return { tipo: 'medir', mergeBase };
}

const rama = ramaActual();
const base = mergeBaseDeLaRama();

/** Los archivos de la rama, un `skip` ruidoso fuera de ella, o un rojo si en ella no puede mirar. */
function archivosOSalto(ctx: { skip: (nota?: string) => void }): readonly string[] | null {
  const listo = preparar(rama, base);
  if (listo.tipo === 'saltar') {
    ctx.skip(listo.motivo);
    return null;
  }
  if (listo.tipo === 'fallar') throw new Error(listo.motivo);

  const archivos = archivosDeLaRama(listo.mergeBase);
  expect(
    archivos.some((archivo) => archivo.startsWith(CARPETA_SPEC)),
    `el diff contra ${listo.mergeBase} no trae nada bajo ${CARPETA_SPEC}: el rango esta mal calculado ` +
      'y este caso pasaria en verde sin haber mirado el cambio de QC-81.',
  ).toBe(true);
  return archivos;
}

// ---------------------------------------------------------------------------------------------
// LOS DETECTORES DEL DIFF (puros)
// ---------------------------------------------------------------------------------------------

export function infraccionesDePantalla(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('app/') || a.startsWith('components/')).sort();
}

/**
 * Unico E2E que el diff puede traer: su preparacion crea un lote con `prisma.productBatch.create`
 * y dejo de compilar cuando `lot` y `purchase_date` pasaron a obligatorios. Cualquier otro archivo
 * bajo `e2e/` da rojo.
 */
export const E2E_TOLERADO = 'e2e/aislamiento-inventario.spec.ts';

export function infraccionesDeE2e(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('e2e/') && a !== E2E_TOLERADO).sort();
}

export function infraccionesDeDependencias(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a === 'package.json' || a === 'pnpm-lock.yaml').sort();
}

// ---------------------------------------------------------------------------------------------
// LECTURA DE CODIGO
// ---------------------------------------------------------------------------------------------

/**
 * Quita comentarios respetando cadenas y plantillas. No son dos `replace` en cadena a proposito:
 * los dos ordenes posibles tienen su trampa (un `//` con una apertura de bloque dentro abre un
 * bloque falso; un `*` + `/` detras de un `//` dentro de un bloque lo deja abierto) y cualquiera
 * de las dos se traga codigo en silencio. Un recorrido caracter a caracter no tiene ninguna.
 */
export function stripComments(fuente: string): string {
  let salida = '';
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      salida += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const inicio = i;
      i += 1;
      while (i < fuente.length && fuente[i] !== c) {
        if (fuente[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      salida += fuente.slice(inicio, i);
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

/** Parte un identificador en palabras: `addBatchToAlive` -> add, batch, to, alive. */
function palabras(identificador: string): readonly string[] {
  return identificador
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.$]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 0);
}

const PALABRAS_DE_AJUSTE_O_CONSUMO = new Set([
  'adjust',
  'adjusts',
  'adjustment',
  'adjustments',
  'ajuste',
  'ajustes',
  'ajustar',
  'consume',
  'consumes',
  'consumption',
  'consumo',
  'consumir',
  'deduct',
  'descontar',
]);

/**
 * Una suma es como se calcularia la existencia por lotes, y un incremento o decremento como se
 * escribiria un ajuste o un consumo. `max(` no cuenta: no suma nada.
 */
export function hallazgosDeAjusteOSuma(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];
  if (/\b_sum\b/.test(codigo)) hallazgos.push('agrega con _sum');
  if (/\bsum\s*\(/i.test(codigo)) hallazgos.push('suma con SUM(...)');
  if (/\b(?:increment|decrement)\s*:/.test(codigo)) hallazgos.push('incrementa o decrementa una columna');
  const identificadores = codigo.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const deAjuste = [
    ...new Set(
      identificadores.filter((id) => palabras(id).some((p) => PALABRAS_DE_AJUSTE_O_CONSUMO.has(p))),
    ),
  ].sort();
  for (const id of deAjuste) hallazgos.push(`nombra un ajuste o consumo: ${id}`);
  return hallazgos;
}

/** El cuerpo de `export async function <nombre>(` hasta el siguiente `export`, o `null`. */
function cuerpoDe(codigo: string, nombre: string): string | null {
  const inicio = codigo.indexOf(`export async function ${nombre}(`);
  if (inicio === -1) return null;
  const fin = codigo.indexOf('\nexport ', inicio + 1);
  return codigo.slice(inicio, fin === -1 ? codigo.length : fin);
}

/** Si la existencia del producto se recalculara al agregar un lote, seria en `addBatchToAlive`. */
export function hallazgosDeStockDeProducto(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];

  const alta = cuerpoDe(codigo, 'createWithFirstBatch');
  if (alta === null) {
    hallazgos.push('no existe createWithFirstBatch: el sujeto de R31 cambio');
  } else if (!/stock:\s*product\.stock\s*\?\?\s*null/.test(alta)) {
    hallazgos.push('createWithFirstBatch ya no escribe products.stock con `product.stock ?? null` (QC-90)');
  }

  const agregar = cuerpoDe(codigo, 'addBatchToAlive');
  if (agregar === null) {
    hallazgos.push('no existe addBatchToAlive: el sujeto de R31 cambio');
  } else {
    if (/\.product\.(?:update|updateMany|upsert)\s*\(/.test(agregar)) {
      hallazgos.push('addBatchToAlive escribe en products con la API tipada');
    }
    if (/UPDATE\s+"?products"?\s/i.test(agregar)) {
      hallazgos.push('addBatchToAlive escribe en products con SQL crudo');
    }
  }
  return hallazgos;
}

const PALABRAS_DE_LOTE = new Set(['batch', 'batches', 'lot', 'lots', 'lote', 'lotes']);

/** `create` y `add` no estan: el alta de lotes si existe. */
const OPERACIONES_PROHIBIDAS = new Set([
  'list', 'listar', 'get', 'find', 'fetch', 'read', 'query', 'search', 'buscar', 'obtener',
  'update', 'edit', 'patch', 'modify', 'actualizar', 'editar', 'modificar',
  'delete', 'remove', 'destroy', 'archive', 'borrar', 'eliminar',
]);

export function operacionesDeLoteProhibidas(nombres: readonly string[]): string[] {
  return nombres
    .filter((nombre) => {
      const partes = palabras(nombre);
      return (
        partes.some((p) => PALABRAS_DE_LOTE.has(p)) && partes.some((p) => OPERACIONES_PROHIBIDAS.has(p))
      );
    })
    .sort();
}

/** Los metodos declarados en una `interface` de puerto (`  nombre(` al principio de linea). */
function metodosDePuerto(fuente: string): string[] {
  return [...stripComments(fuente).matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1] ?? '');
}

function archivosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTs(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida.sort();
}

function leer(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

const MODULO = 'lib/modules/inventario';
const ADAPTADOR_DE_PRODUCTO = `${MODULO}/adapters/driven/persistence/product-prisma.ts`;
const PUERTO_DE_PRODUCTO = `${MODULO}/ports/product-repository.ts`;

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA SIN GIT
// ---------------------------------------------------------------------------------------------

describe('QC-81 T11 — la precondicion de rama', () => {
  it('fuera de la rama de QC-81 se salta ruidosamente, y en ella mide o falla', () => {
    const enDev = preparar('dev', 'abc123');
    expect(enDev.tipo).toBe('saltar');
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada');
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'");

    expect(preparar('feature/QC-999-lo-que-venga', 'abc123').tipo).toBe('saltar');
    expect(preparar(null, 'abc123').tipo).toBe('saltar');

    expect(preparar(RAMA_DE_LA_FICHA, null).tipo).toBe('fallar');
    expect(preparar(RAMA_DE_LA_FICHA, 'abc123')).toEqual({ tipo: 'medir', mergeBase: 'abc123' });
  });
});

// ---------------------------------------------------------------------------------------------
// LA PANTALLA
// ---------------------------------------------------------------------------------------------

describe('QC-81 R28 — el diff no toca app/** ni components/**', () => {
  it('R28: el diff de la rama no trae ningun archivo bajo app/ ni components/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDePantalla(archivos);
    expect(
      infracciones,
      'QC-81 R28: la pantalla del lote y la fecha de compra es QC-103, no esta ficha. Archivos del ' +
        `diff que cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R28: el detector muerde con app/ y components/, y no con lo que solo se les parece', () => {
    expect(
      infraccionesDePantalla([
        'lib/modules/inventario/index.ts',
        'components/ui/button.tsx',
        'app/(private)/inventario/components/product-form.tsx',
        'apps/otro/app.ts',
        'lib/shared/components/x.ts',
      ]),
    ).toEqual(['app/(private)/inventario/components/product-form.tsx', 'components/ui/button.tsx']);
    expect(infraccionesDePantalla(['lib/x.ts', 'tests/unit/app/y.test.ts'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// E2E, CON LA EXCEPCION ACOTADA
// ---------------------------------------------------------------------------------------------

describe('QC-81 R29 — ningun E2E nuevo ni modificado, salvo la excepcion aprobada', () => {
  it('R29: bajo e2e/ el diff trae como mucho exactamente el spec tolerado', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeE2e(archivos);
    expect(
      infracciones,
      'QC-81 R29: el recorrido de navegador se difiere a QC-103. La unica excepcion, aprobada por el ' +
        `humano el 2026-09-15, es la preparacion del lote de ${E2E_TOLERADO}. Archivos del diff ` +
        `fuera de ella:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R29: un diff sintetico con otro archivo bajo e2e/ da rojo', () => {
    expect(infraccionesDeE2e([E2E_TOLERADO, 'e2e/inventario.spec.ts'])).toEqual(['e2e/inventario.spec.ts']);
    expect(infraccionesDeE2e(['e2e/qc81-lotes.spec.ts'])).toEqual(['e2e/qc81-lotes.spec.ts']);
    // «Exactamente» es exactamente: ni un hermano con el mismo prefijo, ni un helper de e2e.
    expect(infraccionesDeE2e([`${E2E_TOLERADO}.bak`, 'e2e/helpers/seed.ts'])).toEqual([
      'e2e/aislamiento-inventario.spec.ts.bak',
      'e2e/helpers/seed.ts',
    ]);
  });

  it('R29: un diff sintetico con solo el archivo tolerado (o sin e2e) da verde', () => {
    expect(infraccionesDeE2e([E2E_TOLERADO, 'lib/modules/inventario/index.ts'])).toEqual([]);
    expect(infraccionesDeE2e(['lib/modules/inventario/index.ts'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// DEPENDENCIAS
// ---------------------------------------------------------------------------------------------

describe('QC-81 R30 — package.json y pnpm-lock.yaml intactos', () => {
  it('R30: el diff de la rama no toca package.json ni pnpm-lock.yaml', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeDependencias(archivos);
    expect(
      infracciones,
      'QC-81 R30: esta ficha no anade, quita ni actualiza ninguna dependencia. Archivos del diff que ' +
        `cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R30: el detector muerde con el manifiesto y con el lock solo, y no con parecidos', () => {
    expect(infraccionesDeDependencias(['package.json', 'lib/x.ts'])).toEqual(['package.json']);
    expect(infraccionesDeDependencias(['pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml']);
    expect(infraccionesDeDependencias(['docs/dependencias.md', 'lib/package.json.ts'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// NI EXISTENCIA POR LOTE NI AJUSTE
// ---------------------------------------------------------------------------------------------

// 2026-09-17: este barrido completo del modulo solo tiene sentido mientras la ausencia
// de ajuste o suma es una regla de la propia rama que introduce lote y fecha de compra.
// Fuera de ella, cualquier trabajo legitimo que si nombre un ajuste (como el propio
// ajuste de inventario) lo pondria en rojo sin haber tocado nada de esta ficha, igual
// que ya se acota a sus tres vecinas de este archivo.
describe('QC-81 R31 — ni existencia por lote (QC-91) ni ajuste de inventario (QC-92)', () => {
  it('R31: ningun archivo del modulo inventario suma lotes, ajusta ni consume', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const archivosDelModulo = archivosTs(join(repoRoot, MODULO));
    const relativos = archivosDelModulo.map((ruta) => relative(repoRoot, ruta).split('\\').join('/'));
    // Ancla: sin archivos, el `toEqual([])` de abajo seria verde sin mirar nada.
    expect(archivosDelModulo.length).toBeGreaterThan(10);
    expect(relativos).toContain(ADAPTADOR_DE_PRODUCTO);

    const hallazgos = archivosDelModulo.flatMap((ruta, i) =>
      hallazgosDeAjusteOSuma(readFileSync(ruta, 'utf8')).map((h) => `${relativos[i]}: ${h}`),
    );
    expect(
      hallazgos,
      'QC-81 R31: la existencia por lote es QC-91 y el ajuste de inventario es QC-92. Hallazgos:\n' +
        hallazgos.join('\n'),
    ).toEqual([]);
  });

  it('R31: fuera de su rama el detector sigue mordiendo sobre el modulo real', () => {
    const archivosDelModulo = archivosTs(join(repoRoot, MODULO));
    const relativos = archivosDelModulo.map((ruta) => relative(repoRoot, ruta).split('\\').join('/'));
    const hallazgos = archivosDelModulo.flatMap((ruta, i) =>
      hallazgosDeAjusteOSuma(readFileSync(ruta, 'utf8')).map((h) => `${relativos[i]}: ${h}`),
    );
    expect(hallazgos.length).toBeGreaterThan(0);
    expect(hallazgos.some((h) => h.includes('adjustment'))).toBe(true);
  });

  it('R31: los detectores muerden con fuentes fabricados y no con uno limpio', () => {
    expect(
      hallazgosDeAjusteOSuma('const t = await tx.productBatch.aggregate({ _sum: { stock: true } });'),
    ).toEqual(['agrega con _sum']);
    expect(hallazgosDeAjusteOSuma('await tx.$queryRaw`SELECT SUM("stock") FROM product_batches`;')).toEqual([
      'suma con SUM(...)',
    ]);
    expect(
      hallazgosDeAjusteOSuma('await tx.product.update({ where, data: { stock: { decrement: 3 } } });'),
    ).toEqual(['incrementa o decrementa una columna']);
    expect(hallazgosDeAjusteOSuma('export function createAdjustInventory() {}')).toEqual([
      'nombra un ajuste o consumo: createAdjustInventory',
    ]);
    expect(hallazgosDeAjusteOSuma('export const consumirLote = () => 1;')).toEqual([
      'nombra un ajuste o consumo: consumirLote',
    ]);

    // Limpios: el correlativo con `max(`, y la PROSA que menciona el ajuste en un comentario.
    expect(
      hallazgosDeAjusteOSuma(
        '// el ajuste de inventario es QC-92\n/* consumo: QC-91 */\n' +
          'const top = await tx.$queryRaw`SELECT max(("lot")::bigint) FROM "product_batches"`;',
      ),
    ).toEqual([]);
    // Un comentario de linea con apertura de bloque NO se traga el codigo de debajo.
    expect(hallazgosDeAjusteOSuma('// nada /* aqui\nconst x = { _sum: 1 };\n/** fin */')).toEqual([
      'agrega con _sum',
    ]);
  });

  it('R31: el detector de products.stock muerde si el alta deja de escribirlo o si agregar lote lo toca', () => {
    const limpio = [
      'export async function createWithFirstBatch(product, batch) {',
      '  await tx.product.create({ data: { stock: product.stock ?? null } });',
      '}',
      'export async function addBatchToAlive(productId, batch) {',
      '  const alive = await tx.product.findFirst({ where: { id: productId } });',
      '  await tx.productBatch.create({ data: {} });',
      '}',
    ].join('\n');
    expect(hallazgosDeStockDeProducto(limpio)).toEqual([]);

    expect(hallazgosDeStockDeProducto(limpio.replace('stock: product.stock ?? null', 'stock: 0'))).toEqual([
      'createWithFirstBatch ya no escribe products.stock con `product.stock ?? null` (QC-90)',
    ]);
    expect(
      hallazgosDeStockDeProducto(
        limpio.replace(
          'await tx.productBatch.create({ data: {} });',
          'await tx.productBatch.create({ data: {} });\n  await tx.product.update({ where: { id: productId }, data: { stock: 9 } });',
        ),
      ),
    ).toEqual(['addBatchToAlive escribe en products con la API tipada']);
    expect(
      hallazgosDeStockDeProducto(
        limpio.replace('await tx.productBatch.create({ data: {} });', 'await tx.$executeRaw`UPDATE "products" SET stock = 1`;'),
      ),
    ).toEqual(['addBatchToAlive escribe en products con SQL crudo']);
    expect(hallazgosDeStockDeProducto('export const nada = 1;')).toEqual([
      'no existe createWithFirstBatch: el sujeto de R31 cambio',
      'no existe addBatchToAlive: el sujeto de R31 cambio',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// NI LISTAR, NI EDITAR, NI BORRAR LOTES
// ---------------------------------------------------------------------------------------------

describe('QC-81 R32 — el contrato de inventario no expone listar, editar ni borrar lotes', () => {
  it('R32: ningun export del contrato publico denota listar, editar ni borrar lotes', () => {
    // Las claves del barrel YA CARGADO, no un regex sobre su texto: una operacion es un valor.
    const claves = Object.keys(inventario).sort();
    expect(claves.length, 'el barrel de inventario no expone exports de valor').toBeGreaterThan(10);
    expect(claves).toContain('createProductWithFirstBatchSchema');

    const infractores = operacionesDeLoteProhibidas(claves);
    expect(
      infractores,
      `QC-81 R32 (se mantiene QC-90 R30): el contrato expone operaciones de lote prohibidas: ${infractores.join(', ')}`,
    ).toEqual([]);
  });

  it('R32: y el puerto de producto tampoco declara ninguna', () => {
    const metodos = metodosDePuerto(leer(PUERTO_DE_PRODUCTO));
    // Ancla: si el extractor no viera metodos, el `toEqual([])` de abajo seria vacio.
    expect(metodos).toContain('createWithFirstBatch');
    expect(metodos).toContain('addBatchToAlive');
    expect(operacionesDeLoteProhibidas(metodos)).toEqual([]);
  });

  it('R32: el detector muerde con listar, editar y borrar lotes, y no con el alta', () => {
    expect(
      operacionesDeLoteProhibidas([
        'createProductWithFirstBatchSchema',
        'PRODUCT_BATCH_LOT_MAX_LENGTH',
        'addBatchToAlive',
        'listProductBatches',
        'updateLot',
        'deleteBatch',
        'createGetProduct',
      ]),
    ).toEqual(['deleteBatch', 'listProductBatches', 'updateLot']);
  });
});
