// Guardia de alcance de QC-121: afirma el ESTADO NUEVO en positivo, sobre fuentes nombradas y
// sobre fuentes fabricadas. No mira ningun diff: lee las mismas fuentes que ya usa el resto del
// arnes y las compara con casos construidos a mano, al estilo de `qc91-alcance.test.ts`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Copia local de los extractores de `qc91-alcance.test.ts` y `guard-libro-de-inventario.test.ts`:
 * importar esos archivos directamente ejecutaria tambien sus `describe` de nivel superior por
 * efecto secundario, duplicando sus suites dentro de esta.
 */
function stripComments(fuente: string): string {
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

function leer(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);
const SUFIJOS_FUENTE = ['.ts', '.tsx'];

/** Los archivos fuente bajo una carpeta, en ruta relativa al repo y con `/` siempre. */
function archivosBajoCarpeta(carpetaRelativa: string): string[] {
  const encontrados: string[] = [];
  const base = join(repoRoot, carpetaRelativa);

  const recorrer = (directorio: string, relativa: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      const relativaHija = relativa === '' ? entrada.name : `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue;
        recorrer(completa, relativaHija);
        continue;
      }
      if (SUFIJOS_FUENTE.some((sufijo) => entrada.name.endsWith(sufijo))) {
        encontrados.push(`${carpetaRelativa}/${relativaHija}`);
      }
    }
  };

  recorrer(base, '');
  return encontrados.sort();
}

// -------------------------------------------------------------------------------------------
// EXTRACTORES SOBRE TYPESCRIPT: balance de llaves, cuerpo de funcion/tipo (calco de qc91)
// -------------------------------------------------------------------------------------------

function cierreDeParametros(codigo: string, aperturaParametros: number): number {
  let profundidad = 0;
  for (let i = aperturaParametros; i < codigo.length; i += 1) {
    if (codigo[i] === '(') profundidad += 1;
    if (codigo[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

function llaveDeCuerpoTrasParametros(codigo: string, cierreParametros: number): number {
  let profundidadAngulos = 0;
  let profundidadLlavesDeTipo = 0;
  for (let i = cierreParametros + 1; i < codigo.length; i += 1) {
    const caracter = codigo[i];
    if (caracter === '<') {
      profundidadAngulos += 1;
    } else if (caracter === '>') {
      profundidadAngulos = Math.max(0, profundidadAngulos - 1);
    } else if (caracter === '{') {
      if (profundidadAngulos === 0 && profundidadLlavesDeTipo === 0) return i;
      profundidadLlavesDeTipo += 1;
    } else if (caracter === '}') {
      profundidadLlavesDeTipo = Math.max(0, profundidadLlavesDeTipo - 1);
    }
  }
  return -1;
}

/** El cuerpo de `export [async] function <nombre>(...) { ... }`, o `null` si no existe con esa forma. */
function cuerpoDeFuncion(fuente: string, nombre: string): string | null {
  const codigo = stripComments(fuente);
  for (const prefijo of ['export async function ', 'export function ']) {
    const inicio = codigo.indexOf(`${prefijo}${nombre}(`);
    if (inicio === -1) continue;
    const cierreParametros = cierreDeParametros(codigo, codigo.indexOf('(', inicio));
    if (cierreParametros === -1) return null;
    const llave = llaveDeCuerpoTrasParametros(codigo, cierreParametros);
    if (llave === -1) return null;
    let profundidad = 0;
    for (let i = llave; i < codigo.length; i += 1) {
      if (codigo[i] === '{') profundidad += 1;
      if (codigo[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) return codigo.slice(inicio, i + 1);
      }
    }
    return null;
  }
  return null;
}

function bloqueTrasEncabezado(codigoSinComentarios: string, encabezado: string): string | null {
  const inicio = codigoSinComentarios.indexOf(encabezado);
  if (inicio === -1) return null;
  const llave = codigoSinComentarios.indexOf('{', inicio);
  if (llave === -1) return null;
  let profundidad = 0;
  let fin = -1;
  for (let i = llave; i < codigoSinComentarios.length; i += 1) {
    if (codigoSinComentarios[i] === '{') profundidad += 1;
    if (codigoSinComentarios[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  return fin === -1 ? null : codigoSinComentarios.slice(inicio, fin + 1);
}

/** El cuerpo de `export type <nombre> = { ... }`, o `null` si el tipo no existe con esa forma. */
function cuerpoDeTipo(fuente: string, nombre: string): string | null {
  return bloqueTrasEncabezado(stripComments(fuente), `export type ${nombre} = {`);
}

type FuncionExportada = { readonly nombre: string; readonly inicio: number; readonly fin: number };

/** Todas las `export [async] function <nombre>(...) { ... }` de una fuente ya sin comentarios,
 *  con su rango de cuerpo balanceado por llaves. */
function funcionesExportadas(codigoSinComentarios: string): FuncionExportada[] {
  const funciones: FuncionExportada[] = [];
  const patronEncabezado = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let encabezado: RegExpExecArray | null;
  while ((encabezado = patronEncabezado.exec(codigoSinComentarios)) !== null) {
    const nombre = encabezado[1];
    const aperturaParametros = codigoSinComentarios.indexOf('(', encabezado.index);
    const cierreParametros = cierreDeParametros(codigoSinComentarios, aperturaParametros);
    if (cierreParametros === -1) continue;
    const llave = llaveDeCuerpoTrasParametros(codigoSinComentarios, cierreParametros);
    if (llave === -1) continue;
    let profundidad = 0;
    let fin = -1;
    for (let i = llave; i < codigoSinComentarios.length; i += 1) {
      if (codigoSinComentarios[i] === '{') profundidad += 1;
      if (codigoSinComentarios[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin === -1) continue;
    funciones.push({ nombre, inicio: encabezado.index, fin });
  }
  return funciones;
}

const METODOS_DE_ESCRITURA = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;
const PATRON_ESCRITURA_DE_LOTE = new RegExp(
  `\\.productBatch\\.(?:${METODOS_DE_ESCRITURA.join('|')})\\s*\\(`,
  'g',
);

/**
 * Cada llamada que cambia una fila de `product_batches`, con el nombre de la funcion exportada
 * que la contiene -o `null` si no vive dentro de ninguna-. Puro: no toca disco.
 */
function caminosDeEscritura(fuente: string): Array<{ readonly nombreFuncion: string | null }> {
  const codigo = stripComments(fuente);
  const funciones = funcionesExportadas(codigo);
  const patron = new RegExp(PATRON_ESCRITURA_DE_LOTE.source, 'g');
  const caminos: Array<{ readonly nombreFuncion: string | null }> = [];
  let match: RegExpExecArray | null;
  while ((match = patron.exec(codigo)) !== null) {
    const indice = match.index;
    const contenedora = funciones.find((f) => indice >= f.inicio && indice <= f.fin);
    caminos.push({ nombreFuncion: contenedora ? contenedora.nombre : null });
  }
  return caminos;
}

/** Los nombres, unicos y ordenados, de las funciones exportadas que escriben `product_batches`. */
function funcionesQueEscribenLotes(fuente: string): string[] {
  const nombres = new Set<string>();
  for (const camino of caminosDeEscritura(fuente)) {
    if (camino.nombreFuncion !== null) nombres.add(camino.nombreFuncion);
  }
  return [...nombres].sort();
}

/**
 * `consumeBatchStock` es la UNICA excepcion a proposito. Una entrega puede consumir de VARIOS
 * lotes del MISMO producto, y `consumeForOrder` -en `reservation-prisma.ts`, driven del mismo
 * modulo- recalcula una vez por producto DESPUES de todos los decrementos, no una vez por lote:
 * sumar `product_batches` de nuevo en cada iteracion seria trabajo repetido para el mismo
 * resultado. El recalculo sigue pasando, en la misma transaccion: solo se mueve de sitio.
 *
 * Nota (2026-10-09, QC-219 R27): `writeFinishedBatchLabels` es la segunda excepcion. Escribe lote,
 * vencimiento y dia de produccion, no `stock`, asi que no hay nada que recalcular. Que no escriba
 * `stock` lo vigilan `qc91-alcance.test.ts` y `guard-libro-de-inventario.test.ts`.
 */
const EXCEPCIONES_SIN_RECALCULO = new Set(['consumeBatchStock', 'writeFinishedBatchLabels']);

/** De las que escriben lotes, las que NO llaman a `recalculateProductStock` en su propio cuerpo. */
function funcionesSinRecalculo(fuente: string): string[] {
  return funcionesQueEscribenLotes(fuente).filter((nombre) => {
    if (EXCEPCIONES_SIN_RECALCULO.has(nombre)) return false;
    const cuerpo = cuerpoDeFuncion(fuente, nombre);
    return cuerpo === null || !/recalculateProductStock\s*\(/.test(cuerpo);
  });
}

// -------------------------------------------------------------------------------------------
// R29 (mitigacion de D4) — toda funcion exportada que escribe product_batches recalcula stock
// -------------------------------------------------------------------------------------------

const PRODUCT_PRISMA = 'lib/modules/inventario/adapters/driven/persistence/product-prisma.ts';
const CAMINOS_ESPERADOS = [
  'addBatchToAlive',
  'adjustBatchStock',
  'consumeBatchStock',
  'createWithFirstBatch',
  'receiveFinishedGoods',
  'addImportedFinishedGoodsBatch',
  'writeFinishedBatchLabels',
  // QC-223 2026-10-08: la salida de producto terminado recalcula en su cuerpo; no es excepcion.
  'dispatchFinishedGoods',
  // QC-224 2026-10-09: la vuelta al lote de una entrega anulada recalcula en su cuerpo; no es excepcion.
  'returnFinishedGoods',
];
const CENSO_ESPERADO = CAMINOS_ESPERADOS.map((nombre) => `${PRODUCT_PRISMA}::${nombre}`).sort();

describe('QC-121 R29 — toda escritura exportada de product_batches recalcula products.stock', () => {
  const construirCamino = (nombre: string, metodo: string, conRecalculo: boolean) =>
    [
      `export async function ${nombre}(tx) {`,
      `  await tx.productBatch.${metodo}({ data: {} });`,
      conRecalculo ? '  await recalculateProductStock(tx, id, scope);' : '',
      '}',
    ]
      .filter((linea) => linea !== '')
      .join('\n');

  /** Los nueve caminos fabricados; `sinRecalculoEn` deja ese uno sin la llamada.
   *  `consumeBatchStock` nace SIN recalculo -es la excepcion-, salvo que se pida a el
   *  explicitamente. QC-223 2026-10-08: + `dispatchFinishedGoods`. QC-219 2026-10-09: +
   *  `writeFinishedBatchLabels` (excepcion: no cambia existencias). QC-224 2026-10-09: +
   *  `returnFinishedGoods`. Son nueve. */
  const fuenteCuatroCaminos = (sinRecalculoEn: string | null): string =>
    [
      construirCamino('createWithFirstBatch', 'create', sinRecalculoEn !== 'createWithFirstBatch'),
      construirCamino('addBatchToAlive', 'create', sinRecalculoEn !== 'addBatchToAlive'),
      construirCamino('adjustBatchStock', 'update', sinRecalculoEn !== 'adjustBatchStock'),
      construirCamino('consumeBatchStock', 'updateMany', sinRecalculoEn === 'consumeBatchStock'),
      construirCamino('receiveFinishedGoods', 'create', sinRecalculoEn !== 'receiveFinishedGoods'),
      construirCamino('addImportedFinishedGoodsBatch', 'create', sinRecalculoEn !== 'addImportedFinishedGoodsBatch'),
      construirCamino('writeFinishedBatchLabels', 'update', sinRecalculoEn === 'writeFinishedBatchLabels'),
      construirCamino('dispatchFinishedGoods', 'updateMany', sinRecalculoEn !== 'dispatchFinishedGoods'),
      construirCamino('returnFinishedGoods', 'update', sinRecalculoEn !== 'returnFinishedGoods'),
    ].join('\n\n');

  // QC-219 + QC-224 2026-10-09: siete -> nueve.
  it('verde: los nueve caminos fabricados, cada uno con su recalculo (o su excepcion)', () => {
    const fuente = fuenteCuatroCaminos(null);
    expect(funcionesQueEscribenLotes(fuente)).toEqual(CAMINOS_ESPERADOS.slice().sort());
    expect(funcionesSinRecalculo(fuente)).toEqual([]);
  });

  for (const nombre of CAMINOS_ESPERADOS.filter((n) => !EXCEPCIONES_SIN_RECALCULO.has(n))) {
    it(`rojo: ${nombre} sin su recalculo queda marcado`, () => {
      const fuente = fuenteCuatroCaminos(nombre);
      expect(funcionesSinRecalculo(fuente)).toEqual([nombre]);
    });
  }

  it('verde: consumeBatchStock SIN recalculo en su cuerpo no queda marcado -es la excepcion-', () => {
    const fuente = fuenteCuatroCaminos('consumeBatchStock');
    expect(funcionesSinRecalculo(fuente)).toEqual([]);
  });

  it('R27 (QC-219): writeFinishedBatchLabels SIN recalculo en su cuerpo no queda marcado -es la excepcion-', () => {
    const fuente = fuenteCuatroCaminos('writeFinishedBatchLabels');
    expect(funcionesSinRecalculo(fuente)).toEqual([]);
  });

  // QC-223 2026-10-08: con siete caminos reales, el fabricado de mas es el octavo.
  // QC-219 + QC-224 2026-10-09: con nueve caminos reales, el fabricado de mas es el decimo.
  it('rojo: un decimo camino fabricado sin recalculo tambien queda marcado', () => {
    const fuente = `${fuenteCuatroCaminos(null)}\n\n${construirCamino('rogueWrite', 'create', false)}`;
    expect(funcionesSinRecalculo(fuente)).toEqual(['rogueWrite']);
  });

  it('verde: el codigo real de product-prisma.ts pasa el detector', () => {
    const fuente = leer(PRODUCT_PRISMA);
    expect(funcionesQueEscribenLotes(fuente)).toEqual(CAMINOS_ESPERADOS.slice().sort());
    expect(funcionesSinRecalculo(fuente)).toEqual([]);
  });

  // QC-223 2026-10-08: seis -> siete. QC-219 2026-10-09: siete -> ocho.
  // QC-224 2026-10-09: ocho -> nueve.
  it('el censo real bajo lib/ es exactamente esos nueve caminos, ni uno mas', () => {
    const archivos = archivosBajoCarpeta('lib');
    expect(archivos.length).toBeGreaterThan(50);

    const etiquetas = archivos.flatMap((archivo) =>
      funcionesQueEscribenLotes(leer(archivo)).map((nombre) => `${archivo}::${nombre}`),
    );
    expect(etiquetas.sort()).toEqual(CENSO_ESPERADO);

    const sinRecalculo = archivos.flatMap((archivo) =>
      funcionesSinRecalculo(leer(archivo)).map((nombre) => `${archivo}::${nombre}`),
    );
    expect(sinRecalculo).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// Quien llama a consumeBatchStock llama tambien a recalculateProductStock
// -------------------------------------------------------------------------------------------

type FuncionDeNivelSuperior = { readonly nombre: string; readonly cuerpo: string };

/**
 * Toda funcion declarada con `function` en el nivel superior del archivo -exportada o no,
 * sincrona o `async`-. Un metodo dentro del objeto que ella devuelve (como `consumeForOrder`
 * dentro de `createMaterialReservations`) queda dentro de SU cuerpo, asi que no hace falta
 * detectarlo aparte: `EXCEPCIONES_SIN_RECALCULO` (mas arriba) traslada la garantia de
 * `consumeBatchStock` a quien la envuelve, "en su cuerpo o en el de la funcion que la envuelve
 * dentro del mismo archivo".
 */
function funcionesDeNivelSuperior(fuente: string): FuncionDeNivelSuperior[] {
  const codigo = stripComments(fuente);
  const funciones: FuncionDeNivelSuperior[] = [];
  const patronEncabezado = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let encabezado: RegExpExecArray | null;
  while ((encabezado = patronEncabezado.exec(codigo)) !== null) {
    const antes = codigo.slice(0, encabezado.index);
    const profundidadAntes = (antes.match(/\{/g)?.length ?? 0) - (antes.match(/\}/g)?.length ?? 0);
    if (profundidadAntes !== 0) continue; // solo funciones del nivel superior del archivo

    const aperturaParametros = codigo.indexOf('(', encabezado.index);
    const cierreParametros = cierreDeParametros(codigo, aperturaParametros);
    if (cierreParametros === -1) continue;
    const llave = llaveDeCuerpoTrasParametros(codigo, cierreParametros);
    if (llave === -1) continue;
    let profundidad = 0;
    let fin = -1;
    for (let i = llave; i < codigo.length; i += 1) {
      if (codigo[i] === '{') profundidad += 1;
      if (codigo[i] === '}') {
        profundidad -= 1;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin === -1) continue;
    funciones.push({ nombre: encabezado[1], cuerpo: codigo.slice(llave, fin + 1) });
  }
  return funciones;
}

/** Las funciones de nivel superior cuyo cuerpo llama a `consumeBatchStock` sin llamar tambien,
 *  en el mismo cuerpo, a `recalculateProductStock`. */
function funcionesQueConsumenSinRecalculo(fuente: string): string[] {
  return funcionesDeNivelSuperior(fuente)
    .filter((funcion) => /consumeBatchStock\s*\(/.test(funcion.cuerpo))
    .filter((funcion) => !/recalculateProductStock\s*\(/.test(funcion.cuerpo))
    .map((funcion) => funcion.nombre);
}

describe('QC-121 R28 — quien llama a consumeBatchStock recalcula products.stock', () => {
  it('rojo (R28): una funcion fabricada que consume sin recalcular queda marcada', () => {
    const fuente = [
      'export async function fakeConsumerSinRecalculo(db) {',
      '  await consumeBatchStock(db, { batchId, quantity }, now, scope);',
      '}',
    ].join('\n');
    expect(funcionesQueConsumenSinRecalculo(fuente)).toEqual(['fakeConsumerSinRecalculo']);
  });

  it('verde (R28): una funcion fabricada que consume y recalcula no queda marcada', () => {
    const fuente = [
      'export async function fakeConsumerConRecalculo(db) {',
      '  await consumeBatchStock(db, { batchId, quantity }, now, scope);',
      '  await recalculateProductStock(db, productId, scope);',
      '}',
    ].join('\n');
    expect(funcionesQueConsumenSinRecalculo(fuente)).toEqual([]);
  });

  it('verde (R28): ninguna funcion real de lib/ que llama a consumeBatchStock queda sin su recalculo', () => {
    const archivos = archivosBajoCarpeta('lib');
    expect(archivos.length).toBeGreaterThan(50);

    const llamantes = archivos.flatMap((archivo) =>
      funcionesDeNivelSuperior(leer(archivo))
        .filter((funcion) => /consumeBatchStock\s*\(/.test(funcion.cuerpo))
        .map((funcion) => `${archivo}::${funcion.nombre}`),
    );
    expect(llamantes.length).toBeGreaterThan(0); // el detector encuentra a los llamantes reales

    const sinRecalculo = archivos.flatMap((archivo) =>
      funcionesQueConsumenSinRecalculo(leer(archivo)).map((nombre) => `${archivo}::${nombre}`),
    );
    expect(sinRecalculo).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// R12 — ninguna migracion crea un disparador o funcion que escriba products.stock
// -------------------------------------------------------------------------------------------

const MIGRACIONES_DIR = 'db/migrations';

function carpetasDeMigracion(): string[] {
  const base = join(repoRoot, MIGRACIONES_DIR);
  return readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => `${MIGRACIONES_DIR}/${entrada.name}/migration.sql`)
    .filter((ruta) => existsSync(join(repoRoot, ruta)))
    .sort();
}

/** Los cuerpos de `CREATE [OR REPLACE] FUNCTION ... AS $tag$ ... $tag$`, sin la etiqueta ni comentarios. */
function cuerposDeFuncionSql(sql: string): string[] {
  const codigo = stripComments(sql);
  const patron = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?AS\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$/g;
  const cuerpos: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = patron.exec(codigo)) !== null) {
    cuerpos.push(match[2]);
  }
  return cuerpos;
}

/** `true` si el cuerpo de una funcion/disparador escribe `products.stock`, por `UPDATE` o por
 *  asignacion directa a la fila (`NEW."stock" := ...`). */
function cuerpoEscribeProductsStock(cuerpo: string): boolean {
  const conUpdate = /UPDATE\s+"?products"?\b[\s\S]*?SET\b[\s\S]*?"?stock"?\s*(?:=|:=)/i.test(cuerpo);
  const conAsignacionDeFila = /NEW\.\s*"?stock"?\s*:=/i.test(cuerpo);
  return conUpdate || conAsignacionDeFila;
}

/** `true` si hay una columna `stock` `GENERATED ALWAYS AS (...)`: mira si `stock` aparece justo
 *  antes de `GENERATED ALWAYS AS`, como en una definicion de columna. */
function migracionTieneColumnaStockGenerada(sql: string): boolean {
  const codigo = stripComments(sql);
  const patron = /GENERATED\s+ALWAYS\s+AS/gi;
  let match: RegExpExecArray | null;
  while ((match = patron.exec(codigo)) !== null) {
    const ventana = codigo.slice(Math.max(0, match.index - 80), match.index);
    if (/stock/i.test(ventana)) return true;
  }
  return false;
}

/** Los hallazgos de R12 sobre una migracion: vacio si ninguna funcion/disparador escribe `stock`
 *  y no hay columna generada. El relleno de una unica vez (`UPDATE` fuera de toda funcion) queda
 *  fuera a proposito: R12 prohibe el mecanismo permanente, no el relleno de la migracion. */
function migracionViolaR12(sql: string): string[] {
  const hallazgos: string[] = [];
  for (const cuerpo of cuerposDeFuncionSql(sql)) {
    if (cuerpoEscribeProductsStock(cuerpo)) hallazgos.push('una funcion o disparador escribe products.stock');
  }
  if (migracionTieneColumnaStockGenerada(sql)) hallazgos.push('columna stock GENERATED');
  return hallazgos;
}

describe('QC-121 R12 — ninguna migracion mantiene products.stock con un disparador o columna generada', () => {
  it('rojo: una funcion/disparador fabricada con UPDATE "products" SET "stock" se detecta', () => {
    const sql = [
      'CREATE OR REPLACE FUNCTION fake_recalc_products_stock()',
      '  RETURNS TRIGGER AS $fake_tag$',
      'BEGIN',
      '  UPDATE "products" SET "stock" = NEW."stock" WHERE "id" = NEW."product_id";',
      '  RETURN NEW;',
      'END;',
      '$fake_tag$ LANGUAGE plpgsql;',
    ].join('\n');
    expect(migracionViolaR12(sql)).toEqual(['una funcion o disparador escribe products.stock']);
  });

  it('rojo: una funcion/disparador fabricada con NEW."stock" := se detecta', () => {
    const sql = [
      'CREATE OR REPLACE FUNCTION fake_set_new_stock()',
      '  RETURNS TRIGGER AS $fake_tag2$',
      'BEGIN',
      '  NEW."stock" := NEW."stock" + 1;',
      '  RETURN NEW;',
      'END;',
      '$fake_tag2$ LANGUAGE plpgsql;',
    ].join('\n');
    expect(migracionViolaR12(sql)).toEqual(['una funcion o disparador escribe products.stock']);
  });

  it('rojo: una columna "stock" GENERATED ALWAYS AS se detecta', () => {
    const sql = 'ALTER TABLE "products" ADD COLUMN "stock" INTEGER GENERATED ALWAYS AS (0) STORED;';
    expect(migracionViolaR12(sql)).toEqual(['columna stock GENERATED']);
  });

  it('verde: el relleno de una unica vez, fuera de toda funcion, no cuenta como disparador', () => {
    const sql = [
      'UPDATE "products" AS p',
      'SET "stock" = totals."total"',
      'FROM (SELECT product_id, SUM(stock) AS total FROM product_batches GROUP BY product_id) AS totals',
      'WHERE p."id" = totals.product_id;',
    ].join('\n');
    expect(migracionViolaR12(sql)).toEqual([]);
  });

  it('verde: una funcion/disparador fabricada que no toca stock no se detecta', () => {
    const sql = [
      'CREATE OR REPLACE FUNCTION fake_check_unit()',
      '  RETURNS TRIGGER AS $fake_tag3$',
      'BEGIN',
      '  IF NEW."unit_id" IS NULL THEN',
      '    RETURN NEW;',
      '  END IF;',
      '  RETURN NEW;',
      'END;',
      '$fake_tag3$ LANGUAGE plpgsql;',
    ].join('\n');
    expect(migracionViolaR12(sql)).toEqual([]);
  });

  it('verde: una columna GENERATED que no es "stock" no se detecta', () => {
    const sql = 'ALTER TABLE "products" ADD COLUMN "full_name" TEXT GENERATED ALWAYS AS (name) STORED;';
    expect(migracionViolaR12(sql)).toEqual([]);
  });

  it('verde: ninguna migracion real crea un disparador, funcion o columna generada que escriba products.stock', () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.length).toBeGreaterThan(20);
    for (const ruta of carpetas) {
      const hallazgos = migracionViolaR12(leer(ruta));
      expect(hallazgos, `${ruta}: ${hallazgos.join(', ')}`).toEqual([]);
    }
  });
});

// -------------------------------------------------------------------------------------------
// R2 — NewProduct no declara unidad ni existencia
// -------------------------------------------------------------------------------------------

const PRODUCT_VIEW = 'lib/modules/inventario/domain/product-view.ts';

describe('QC-121 R2 — NewProduct no lleva unidad ni existencia', () => {
  it('rojo: un NewProduct fabricado con unitId se detecta', () => {
    const fuente = ['export type NewProduct = {', '  readonly name: string;', '  readonly unitId: string | null;', '};'].join(
      '\n',
    );
    const cuerpo = cuerpoDeTipo(fuente, 'NewProduct');
    expect(cuerpo).not.toBeNull();
    expect(/\bunitId\b/.test(cuerpo as string)).toBe(true);
  });

  it('rojo: un NewProduct fabricado con stock se detecta', () => {
    const fuente = ['export type NewProduct = {', '  readonly name: string;', '  readonly stock: number;', '};'].join('\n');
    const cuerpo = cuerpoDeTipo(fuente, 'NewProduct');
    expect(cuerpo).not.toBeNull();
    expect(/\bstock\b/.test(cuerpo as string)).toBe(true);
  });

  // QC-199 anade `unitId` opcional para el alta de insumo: se admite solo como id opcional; la
  // unidad como texto y la existencia siguen fuera.
  it('verde: el NewProduct real no declara stock ni unidad como texto, y unitId solo como id opcional', () => {
    const cuerpo = cuerpoDeTipo(leer(PRODUCT_VIEW), 'NewProduct');
    expect(cuerpo, 'NewProduct no existe con esa forma: el sujeto de esta prueba cambio').not.toBeNull();
    const codigo = stripComments(cuerpo as string);
    expect(/\bstock\b/.test(codigo)).toBe(false);
    expect(/\bunit(?:Name|Symbol|Label|Code)?\s*\??\s*:/.test(codigo)).toBe(false);
    const declaraciones = codigo.match(/\bunitId\b[^;\n]*/g) ?? [];
    expect(declaraciones).toEqual(['unitId?: string']);
  });
});

// -------------------------------------------------------------------------------------------
// R25 — sin borrado fisico de productos ni de lotes, e identificadores de la migracion en ingles
// -------------------------------------------------------------------------------------------

const MODULO_INVENTARIO = 'lib/modules/inventario';
const MIGRACION_QC121 = 'db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql';

/** Borrado fisico de `products` o `product_batches`, tipado o en SQL crudo. */
function borradoFisicoDeProductosOLotes(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];
  if (/\.product\.(?:delete|deleteMany)\s*\(/.test(codigo)) hallazgos.push('metodo de borrado sobre product');
  if (/\.productBatch\.(?:delete|deleteMany)\s*\(/.test(codigo)) hallazgos.push('metodo de borrado sobre productBatch');
  if (/DELETE\s+FROM\s+"?products"?\b/i.test(codigo)) hallazgos.push('DELETE crudo sobre products');
  if (/DELETE\s+FROM\s+"?product_batches"?\b/i.test(codigo)) hallazgos.push('DELETE crudo sobre product_batches');
  return hallazgos;
}

describe('QC-121 R25 — sin borrado fisico de productos ni de lotes', () => {
  it('rojo: .product.delete( se detecta', () => {
    expect(borradoFisicoDeProductosOLotes('await tx.product.delete({ where: { id } });')).toEqual([
      'metodo de borrado sobre product',
    ]);
  });

  it('rojo: .productBatch.deleteMany( se detecta', () => {
    expect(borradoFisicoDeProductosOLotes('await tx.productBatch.deleteMany({ where: {} });')).toEqual([
      'metodo de borrado sobre productBatch',
    ]);
  });

  it('rojo: DELETE FROM "products" crudo se detecta', () => {
    expect(
      borradoFisicoDeProductosOLotes('await tx.$executeRaw`DELETE FROM "products" WHERE id = ${id}`;'),
    ).toEqual(['DELETE crudo sobre products']);
  });

  it('rojo: DELETE FROM "product_batches" crudo se detecta', () => {
    expect(
      borradoFisicoDeProductosOLotes('await tx.$executeRaw`DELETE FROM "product_batches" WHERE id = ${id}`;'),
    ).toEqual(['DELETE crudo sobre product_batches']);
  });

  it('verde: el borrado logico (updateMany con deletedAt) no cuenta como borrado fisico', () => {
    expect(
      borradoFisicoDeProductosOLotes('await prisma.product.updateMany({ where: {}, data: { deletedAt: now } });'),
    ).toEqual([]);
  });

  it('verde: un comentario que mencione borrar un producto no es codigo que lo borre', () => {
    expect(borradoFisicoDeProductosOLotes('// aqui NO se llama a tx.product.delete(...)')).toEqual([]);
  });

  it('verde: ningun archivo real de lib/modules/inventario borra fisicamente productos ni lotes', () => {
    const archivos = archivosBajoCarpeta(MODULO_INVENTARIO);
    expect(archivos.length).toBeGreaterThan(10);
    for (const archivo of archivos) {
      const hallazgos = borradoFisicoDeProductosOLotes(leer(archivo));
      expect(hallazgos, `${archivo}: ${hallazgos.join(', ')}`).toEqual([]);
    }
  });

  it('verde: la migracion de esta ficha no borra fisicamente productos ni lotes', () => {
    expect(borradoFisicoDeProductosOLotes(leer(MIGRACION_QC121))).toEqual([]);
  });
});

/** Extrae, con una lista de patrones nombrados, los identificadores nuevos de una migracion. */
function identificadoresNuevosDeMigracion(sql: string) {
  const codigo = stripComments(sql);
  const extraer = (patron: RegExp): string[] => {
    const nombres: string[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(patron.source, 'g');
    while ((match = re.exec(codigo)) !== null) nombres.push(match[1]);
    return [...new Set(nombres)].sort();
  };

  return {
    columnas: extraer(/ADD COLUMN "([a-z0-9_]+)"/),
    restricciones: extraer(/ADD CONSTRAINT "([a-z0-9_]+)"/),
    indices: extraer(/CREATE INDEX "([a-z0-9_]+)"/),
    disparadores: extraer(/CREATE TRIGGER "([a-z0-9_]+)"/),
    funciones: extraer(/CREATE (?:OR REPLACE )?FUNCTION ([a-z0-9_]+)\(/),
  };
}

/** Palabras en espanol que no deberian aparecer en un identificador nuevo de esquema. */
const PALABRAS_EN_ESPANOL = [
  'unidad',
  'existencia',
  'producto',
  'presentacion',
  'bloqueo',
  'disparador',
  'funcion',
  'restriccion',
  'indice',
  'columna',
  'candado',
];

const IDENTIFICADORES_ESPERADOS = {
  columnas: ['stock', 'unit_id'].sort(),
  restricciones: ['products_stock_non_negative', 'products_unit_id_fkey'].sort(),
  indices: ['products_stock_idx', 'products_unit_id_idx'].sort(),
  disparadores: ['presentations_check_unit_locked_trigger', 'product_batches_check_unit_trigger'].sort(),
  funciones: ['presentations_check_unit_locked', 'product_batches_check_unit'].sort(),
};

describe('QC-121 R25 — los identificadores nuevos de la migracion son ingles ASCII', () => {
  it('detector: extrae los identificadores de una migracion fabricada', () => {
    const sql = [
      'ALTER TABLE "products" ADD COLUMN "unit_id" UUID;',
      'ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);',
      'CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");',
      'CREATE TRIGGER "product_batches_check_unit_trigger"',
      '  BEFORE INSERT ON "product_batches"',
      '  FOR EACH ROW EXECUTE FUNCTION product_batches_check_unit();',
      'CREATE OR REPLACE FUNCTION product_batches_check_unit() RETURNS TRIGGER AS $fake_tag$',
      'BEGIN RETURN NEW; END;',
      '$fake_tag$ LANGUAGE plpgsql;',
    ].join('\n');

    const encontrados = identificadoresNuevosDeMigracion(sql);
    expect(encontrados.columnas).toEqual(['unit_id']);
    expect(encontrados.restricciones).toEqual(['products_stock_non_negative']);
    expect(encontrados.indices).toEqual(['products_unit_id_idx']);
    expect(encontrados.disparadores).toEqual(['product_batches_check_unit_trigger']);
    expect(encontrados.funciones).toEqual(['product_batches_check_unit']);
  });

  it('rojo: una palabra en espanol dentro de un identificador fabricado se detecta', () => {
    const nombre = 'productos_existencia_idx';
    expect(PALABRAS_EN_ESPANOL.some((palabra) => nombre.includes(palabra))).toBe(true);
  });

  it('rojo: un identificador fabricado con acentos o enie no pasa el patron ASCII', () => {
    expect(/^[a-z][a-z0-9_]*$/.test('unidad_relación_idx')).toBe(false);
  });

  it('verde: los identificadores reales de la migracion de esta ficha son exactamente los esperados y en ingles ASCII', () => {
    const sql = leer(MIGRACION_QC121);
    const encontrados = identificadoresNuevosDeMigracion(sql);

    expect(encontrados.columnas).toEqual(IDENTIFICADORES_ESPERADOS.columnas);
    expect(encontrados.restricciones).toEqual(IDENTIFICADORES_ESPERADOS.restricciones);
    expect(encontrados.indices).toEqual(IDENTIFICADORES_ESPERADOS.indices);
    expect(encontrados.disparadores).toEqual(IDENTIFICADORES_ESPERADOS.disparadores);
    expect(encontrados.funciones).toEqual(IDENTIFICADORES_ESPERADOS.funciones);

    const todos = [
      ...encontrados.columnas,
      ...encontrados.restricciones,
      ...encontrados.indices,
      ...encontrados.disparadores,
      ...encontrados.funciones,
    ];
    expect(todos.length).toBeGreaterThan(0);
    for (const nombre of todos) {
      expect(/^[a-z][a-z0-9_]*$/.test(nombre), `${nombre} no es ASCII en minusculas con guion bajo`).toBe(true);
      for (const palabra of PALABRAS_EN_ESPANOL) {
        expect(nombre.includes(palabra), `${nombre} contiene la palabra en espanol '${palabra}'`).toBe(false);
      }
    }
  });
});
