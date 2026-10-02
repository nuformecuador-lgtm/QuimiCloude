// QC-138 T13 — lo que la ficha NO debe cambiar (R37, R39) ni ofrecer (R21).
//
// Permisos y dependencias se comparan con el padre de la rama -el `merge-base` con `origin/dev`-,
// no con una cifra: otra ficha puede sumar un permiso o una dependencia aprobada en paralelo y eso
// no es trabajo de esta. Si no hay git o no hay `origin/dev`, el caso falla diciendolo: «no pude
// mirar» no es un verde.
//
// El borrado fisico y los identificadores de base se miran sobre el fuente, sin historia: todo
// `lib/**` y las dos migraciones de la ficha.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { createOrderSchema, updateOrderSchema } from '@/lib/modules/pedidos';

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

function git(comando: string): string {
  return execSync(comando, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** El padre de la rama. Lanza con un motivo legible si no se puede resolver. */
function padreDeLaRama(): string {
  try {
    return git('git merge-base HEAD origin/dev');
  } catch (error) {
    throw new Error(
      'No se pudo resolver `git merge-base HEAD origin/dev`, asi que este caso no se ha ' +
        `comprobado. Hace falta git y la ref origin/dev. Causa: ${String(error)}`,
    );
  }
}

function enElPadre(ruta: string): string {
  const padre = padreDeLaRama();
  try {
    return git(`git show ${padre}:${ruta}`);
  } catch (error) {
    throw new Error(`No se pudo leer ${ruta} en ${padre}. Causa: ${String(error)}`);
  }
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// ---------------------------------------------------------------------------------------------
// R37 — ningun permiso nuevo
// ---------------------------------------------------------------------------------------------

/** Los codigos `code: '<modulo>.<accion>'` de un fuente de catalogo de permisos. */
export function codigosDePermiso(fuente: string): string[] {
  return [...stripComments(fuente).matchAll(/\bcode\s*:\s*'([a-z_]+\.[a-z_]+)'/g)]
    .map((match) => match[1] as string)
    .sort();
}

describe('R37 — el catalogo de permisos no gana ningun codigo', () => {
  it('R37: todo codigo del catalogo actual ya estaba en el catalogo del padre de la rama', () => {
    const delPadre = new Set(codigosDePermiso(enElPadre('lib/modules/identity/domain/permissions.ts')));
    expect(delPadre.size, 'el catalogo del padre no se pudo leer').toBeGreaterThan(0);

    const nuevos = PERMISSIONS.map((permiso) => permiso.code)
      .filter((code) => !delPadre.has(code))
      .sort();

    expect(nuevos, `Codigos de permiso nuevos: ${nuevos.join(', ')}`).toEqual([]);
  });

  it('R37: crear y editar siguen con pedidos.modificar, y la revision con inventario.modificar', () => {
    const codigos = PERMISSIONS.map((permiso) => permiso.code);
    expect(codigos.filter((code) => code.startsWith('pedidos.')).sort()).toEqual([
      'pedidos.consultar',
      'pedidos.modificar',
    ]);
    expect(codigos.filter((code) => code.startsWith('inventario.')).sort()).toEqual([
      'inventario.consultar',
      'inventario.modificar',
    ]);
  });

  it('el extractor ve un codigo sintetico nuevo y no ve uno comentado', () => {
    const sintetico = "{ code: 'pedidos.desbloquear', module: 'pedidos' }\n// code: 'pedidos.otro'";
    expect(codigosDePermiso(sintetico)).toEqual(['pedidos.desbloquear']);
  });
});

// ---------------------------------------------------------------------------------------------
// R39 — package.json sin dependencias nuevas
// ---------------------------------------------------------------------------------------------

type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

function paquetesDe(pkg: PackageJson): string[] {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort();
}

describe('R39 — package.json no gana dependencias', () => {
  it('R39: ningun paquete declarado falta en el package.json del padre de la rama', () => {
    const delPadre = new Set(paquetesDe(JSON.parse(enElPadre('package.json')) as PackageJson));
    const actuales = paquetesDe(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as PackageJson);

    const nuevos = actuales.filter((nombre) => !delPadre.has(nombre));

    expect(nuevos, `Dependencias nuevas: ${nuevos.join(', ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R39 — ningun borrado fisico de pedidos ni de reservas
// ---------------------------------------------------------------------------------------------

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees']);

function listarFuentes(dir: string): string[] {
  let nombres: string[];
  try {
    nombres = readdirSync(dir);
  } catch {
    return [];
  }
  return nombres.flatMap((nombre) => {
    const completa = join(dir, nombre);
    if (statSync(completa).isDirectory()) return IGNORED_DIRS.has(nombre) ? [] : listarFuentes(completa);
    return ['.ts', '.tsx'].includes(extname(nombre)) ? [completa] : [];
  });
}

const BORRADO_FISICO = [
  /\.order\s*\.\s*delete(Many)?\s*\(/,
  /\.reservationMovement\s*\.\s*delete(Many)?\s*\(/,
  /DELETE\s+FROM\s+"?(orders|reservation_movements)"?/i,
];

/** `true` si el fuente, sin comentarios, borra fisicamente un pedido o un asiento de reserva. */
export function borraPedidosOReservas(fuente: string): boolean {
  const codigo = stripComments(fuente);
  return BORRADO_FISICO.some((patron) => patron.test(codigo));
}

function migracionesDeLaFicha(): string[] {
  const base = join(repoRoot, 'db', 'migrations');
  return readdirSync(base)
    .filter((nombre) => /_(order_status_blocked|orders_blocked_index)$/.test(nombre))
    .sort();
}

describe('R39 — nada borra fisicamente pedidos ni reservas', () => {
  it('R39: ningun archivo de lib/** borra filas de orders ni de reservation_movements', () => {
    const culpables = listarFuentes(join(repoRoot, 'lib'))
      .filter((ruta) => borraPedidosOReservas(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.slice(repoRoot.length + 1).split(sep).join('/'));

    expect(culpables).toEqual([]);
  });

  it('R39: las migraciones de la ficha, de subida y de bajada, no borran pedidos ni reservas', () => {
    const migraciones = migracionesDeLaFicha();
    expect(migraciones).toHaveLength(2);
    for (const migracion of migraciones) {
      for (const archivo of ['migration.sql', 'down.sql']) {
        const sql = readFileSync(join(repoRoot, 'db', 'migrations', migracion, archivo), 'utf8')
          .split('\n')
          .map((linea) => linea.replace(/--.*$/, ''))
          .join('\n');
        expect(borraPedidosOReservas(sql), `${migracion}/${archivo}`).toBe(false);
      }
    }
  });

  it('el detector ve un borrado sintetico y no uno comentado', () => {
    expect(borraPedidosOReservas('await tx.order.deleteMany({ where: {} })')).toBe(true);
    expect(borraPedidosOReservas('await db.reservationMovement.delete({ where: { id } })')).toBe(true);
    expect(borraPedidosOReservas('await tx.$executeRaw`DELETE FROM "orders" WHERE id = 1`')).toBe(true);
    expect(borraPedidosOReservas('// tx.order.deleteMany() no se usa')).toBe(false);
    expect(borraPedidosOReservas('await tx.order.updateMany({ data: { deletedAt: now } })')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// R39 — identificadores nuevos de base en ingles
// ---------------------------------------------------------------------------------------------

/** Las palabras que pueden formar un identificador nuevo de esta ficha. El valor del enum es la
 *  unica excepcion en castellano, por la convencion de los estados existentes. */
const PALABRAS_EN_INGLES = new Set(['order', 'orders', 'status', 'blocked', 'company', 'created', 'index', 'idx', 'id', 'at']);
const VALOR_DEL_ENUM = 'BLOQUEADO';

/** Los identificadores que una migracion CREA: indices, tablas, columnas, restricciones y tipos. */
export function identificadoresCreados(sql: string): string[] {
  const sinComentarios = sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
  const patrones = [
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi,
    /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi,
    /ADD\s+CONSTRAINT\s+"?(\w+)"?/gi,
    /CREATE\s+TYPE\s+"?(\w+)"?/gi,
  ];
  return patrones.flatMap((patron) => [...sinComentarios.matchAll(patron)].map((match) => match[1] as string));
}

function palabrasDe(identificador: string): string[] {
  return identificador
    .replace(/^\d+_/, '')
    .split(/_|(?=[A-Z])/)
    .filter((palabra) => palabra.length > 0)
    .map((palabra) => palabra.toLowerCase());
}

describe('R39 — los identificadores nuevos de base van en ingles', () => {
  it('R39: el nombre de las dos migraciones y lo que crea la de subida esta en ingles', () => {
    const identificadores = migracionesDeLaFicha().flatMap((migracion) => [
      migracion,
      ...identificadoresCreados(readFileSync(join(repoRoot, 'db', 'migrations', migracion, 'migration.sql'), 'utf8')),
    ]);
    expect(identificadores).toContain('orders_blocked_company_created_idx');

    const fuera = identificadores.filter((id) => palabrasDe(id).some((palabra) => !PALABRAS_EN_INGLES.has(palabra)));

    expect(fuera, `Identificadores con palabras fuera del ingles esperado: ${fuera.join(', ')}`).toEqual([]);
  });

  it('R39: el unico literal en castellano que anade la ficha es el valor del enum', () => {
    const [deEnum] = migracionesDeLaFicha().filter((nombre) => nombre.endsWith('_order_status_blocked'));
    const sql = readFileSync(join(repoRoot, 'db', 'migrations', deEnum as string, 'migration.sql'), 'utf8')
      .split('\n')
      .map((linea) => linea.replace(/--.*$/, ''))
      .join('\n');

    expect([...sql.matchAll(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'(\w+)'/gi)].map((m) => m[1])).toEqual([
      VALOR_DEL_ENUM,
    ]);
  });

  it('el extractor ve un identificador sintetico en castellano', () => {
    const sintetico = 'CREATE INDEX "pedidos_bloqueados_idx" ON "orders" ("company_id");';
    const ids = identificadoresCreados(sintetico);
    expect(ids).toEqual(['pedidos_bloqueados_idx']);
    expect(palabrasDe(ids[0] as string).some((palabra) => !PALABRAS_EN_INGLES.has(palabra))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// R21 — no hay accion manual de desbloqueo
// ---------------------------------------------------------------------------------------------

/** Lo que un export tendria que llamarse para ser una accion manual de desbloqueo o de estado. */
const NOMBRE_DE_DESBLOQUEO = /unblock|desbloque|setStatus|changeStatus|updateStatus|forceStatus|overrideStatus/i;

/** Los nombres que un fuente TypeScript exporta: declaraciones y listas `export { ... }`. */
export function nombresExportados(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const declarados = [
    ...codigo.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+(\w+)/g),
  ].map((match) => match[1] as string);
  const listados = [...codigo.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((match) =>
    (match[1] as string)
      .split(',')
      .map((parte) => parte.trim().replace(/^type\s+/, ''))
      .filter((parte) => parte.length > 0)
      .map((parte) => (parte.split(/\s+as\s+/).pop() as string).trim()),
  );
  return [...new Set([...declarados, ...listados])].sort();
}

function leer(ruta: string): string {
  return readFileSync(join(repoRoot, ...ruta.split('/')), 'utf8');
}

/** El bloque de texto que empieza en `inicio` y acaba en el primer `cierre` posterior. */
function bloqueEntre(fuente: string, inicio: string, cierre: string): string {
  const desde = fuente.indexOf(inicio);
  if (desde < 0) throw new Error(`no se encontro «${inicio}»`);
  const hasta = fuente.indexOf(cierre, desde + inicio.length);
  if (hasta < 0) throw new Error(`no se encontro el cierre de «${inicio}»`);
  return fuente.slice(desde, hasta + cierre.length);
}

describe('R21 — no hay accion manual de desbloqueo', () => {
  it('R21: el contrato de pedidos no exporta nada que desbloquee o fije el estado a mano', async () => {
    const nombres = nombresExportados(leer('lib/modules/pedidos/index.ts'));
    const enEjecucion = Object.keys(await import('@/lib/modules/pedidos'));

    // El lector de exports ve todo lo que el barrel publica de verdad: si no, el filtro no prueba nada.
    expect(enEjecucion.filter((nombre) => !nombres.includes(nombre))).toEqual([]);
    expect(nombres).toContain('createReviewBlockedOrders');

    expect(nombres.filter((nombre) => NOMBRE_DE_DESBLOQUEO.test(nombre))).toEqual([]);
  });

  it('R21: las Server Actions de pedidos son solo alta, edicion, cancelacion, borrado, consultas y cotizacion', () => {
    const fuente = leer('lib/modules/pedidos/adapters/driving/order-actions.ts');
    const acciones = [...stripComments(fuente).matchAll(/\bexport\s+async\s+function\s+(\w+)/g)].map(
      (match) => match[1] as string,
    );

    expect(acciones).toEqual(
      expect.arrayContaining([
        'createOrderAction',
        'updateOrderAction',
        'cancelOrderAction',
        'deleteOrderAction',
        'getOrderAction',
        'listOrdersAction',
        'listOrderCoverageAction',
        'quoteOrderCostAction',
      ]),
    );
    expect(nombresExportados(fuente).filter((nombre) => NOMBRE_DE_DESBLOQUEO.test(nombre))).toEqual([]);
    expect(stripComments(fuente)).not.toMatch(/\breviewBlockedOrders\b|\bcreateReviewBlockedOrders\b/);
  });

  it('R21: el esquema del formulario de pedido no declara estado y descarta uno que llegue', () => {
    expect(Object.keys(createOrderSchema.shape).sort()).toEqual([
      'confirmBlocked',
      'presentationId',
      'priority',
      'quantity',
      'recipeId',
      'recipeVersionId',
    ]);

    const conEstado = {
      recipeId: '00000000-0000-4000-8000-000000000001',
      presentationId: '00000000-0000-4000-8000-000000000002',
      quantity: '10',
      status: 'PENDIENTE',
    };
    for (const esquema of [createOrderSchema, updateOrderSchema]) {
      const resultado = esquema.parse(conEstado);
      expect(resultado).not.toHaveProperty('status');
    }
  });

  it('R21: la revision de bloqueados solo la dispara el aviso de inventario, no la fachada ni una action', () => {
    const composicion = stripComments(leer('lib/composition/index.ts'));

    expect(composicion).not.toMatch(/\bexport\s+(?:const|function|async\s+function)\s+reviewBlockedOrders\b/);
    expect(composicion).not.toMatch(/\bexport\s*\{[^}]*\breviewBlockedOrders\b[^}]*\}/);

    const fachada = bloqueEntre(composicion, 'export const pedidos = {', '} as const;');
    expect(fachada).not.toMatch(/\breviewBlockedOrders\b/);
    const clavesDeLaFachada = [...fachada.matchAll(/^ {2}(\w+)\s*[:,]/gm)].map((match) => match[1] as string);
    expect(clavesDeLaFachada).toContain('createOrder');
    expect(clavesDeLaFachada.filter((clave) => NOMBRE_DE_DESBLOQUEO.test(clave))).toEqual([]);

    // Fuera de su declaracion, el unico que la llama es el aviso de existencia que sube.
    const aviso = bloqueEntre(composicion, 'const stockIncreaseListener', '\n};');
    const sinDeclaracion = composicion.replace(/const\s+reviewBlockedOrders\s*=/, '').replace(aviso, '');
    expect(aviso).toMatch(/\breviewBlockedOrders\s*\(/);
    expect(sinDeclaracion).not.toMatch(/\breviewBlockedOrders\b/);

    const driving = listarFuentes(join(repoRoot, 'lib'))
      .filter((ruta) => ruta.split(sep).join('/').includes('/adapters/driving/'))
      .concat(listarFuentes(join(repoRoot, 'app')))
      .filter((ruta) => /\b(?:create)?[Rr]eviewBlockedOrders\b/.test(stripComments(readFileSync(ruta, 'utf8'))))
      .map((ruta) => ruta.slice(repoRoot.length + 1).split(sep).join('/'));
    expect(driving).toEqual([]);
  });

  it('el criterio detecta una action sintetica de desbloqueo y no una legitima', () => {
    const sintetico = [
      "'use server';",
      'export async function unblockOrderAction(id: string) {}',
      'export async function createOrderAction() {}',
      'export { desbloquearPedido, cancelOrder as cancelar };',
      '// export async function setStatusAction() {}',
    ].join('\n');

    expect(nombresExportados(sintetico)).toEqual(['cancelar', 'createOrderAction', 'desbloquearPedido', 'unblockOrderAction']);
    expect(nombresExportados(sintetico).filter((nombre) => NOMBRE_DE_DESBLOQUEO.test(nombre))).toEqual([
      'desbloquearPedido',
      'unblockOrderAction',
    ]);
    expect(NOMBRE_DE_DESBLOQUEO.test('unblockOrder')).toBe(true);
    expect(NOMBRE_DE_DESBLOQUEO.test('createReviewBlockedOrders')).toBe(false);
  });
});
