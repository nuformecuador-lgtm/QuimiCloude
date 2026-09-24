// QC-75 T15 — las convenciones NEGATIVAS de la ficha: ningun comodin (R15), ningun backend nuevo
// (R22) y ningun `notFound()` en el layout privado (decision cerrada nº 3).
//
// Los dos requisitos dicen lo que esta ficha NO hace, y un requisito de ausencia no se demuestra
// leyendo codigo: se demuestra midiendo. Aqui se mide sobre dos superficies distintas:
//
//   * R15 sobre el DATO: se importa `PERMISSIONS` del contrato publico de `identity` y se deriva
//     de el todo lo que se afirma (cuantos son, que modulos existen, que acciones hay). Ningun
//     censo escrito a mano en paralelo al catalogo: si manana alguien cuela un `cuenta.*` o un
//     `*.todo`, el catalogo cambia y estas aserciones caen solas.
//
//   * R22 sobre el DIFF DE LA RAMA (`git diff --name-only origin/dev...HEAD`, tres puntos: el
//     merge-base, no la punta de `dev`). No un censo del arbol: un censo congelaria archivos de
//     features AJENAS y se pondria rojo por trabajo legitimo de otro. El diff solo habla de lo
//     que ESTA rama cambia, que es exactamente el alcance de R22.
//
// MATIZ IMPORTANTE sobre `lib/modules/identity/**`: en esta ficha SI cambia —el helper nuevo
// `require-page-permission.ts`, el barrel, `route-access.ts` al retirar el corte por rol (R16)—,
// asi que `identity` NO entra entero en la lista de intocables. Lo que R22 protege no es el modulo
// de autenticacion: es (a) el MODELO DE PERMISOS de QC-74 —esquema, migraciones, catalogo y
// seed— y (b) los casos de uso de los MODULOS DE NEGOCIO. Por eso la lista congelada nombra
// archivos concretos de `identity` (el catalogo y el seed) en vez de la carpeta entera.
//
// Sobre la dependencia nueva: este archivo comprueba que `package.json` no GANO claves respecto
// al merge-base, que es una pregunta sobre esta rama. Va JUNTO CON
// `tests/guards/guard-dependencias-aprobadas.test.ts` —que ya existe, no se toca aqui, y responde
// la pregunta complementaria: que toda dependencia declarada tenga su fila en
// `docs/dependencias.md`—. Ninguno de los dos sustituye al otro.
//
// La tercera convencion —el layout privado no llama a `notFound()`— se mide sobre el FUENTE del
// layout real, y su bloque de abajo explica por que es una regla y no una opinion.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// ---------------------------------------------------------------------------------------------
// R15 — el catalogo cerrado, sin comodines
// ---------------------------------------------------------------------------------------------

/**
 * Los dieciocho codigos del catalogo, escritos a mano A PROPOSITO: son el contrato que este test
 * congela.
 * Eran diez en QC-74; QC-38 sumo `unidades.modificar` al darle escritura a `unidades`, enmendando
 * QC-74 R2; QC-66 sumo `usuarios.consultar` y `usuarios.modificar`, enmendando QC-74 R1; QC-86 suma
 * `asignaciones.consultar` y `asignaciones.modificar`, volviendo a enmendar la regla del numero
 * cerrado; la siguiente enmienda suma `terminados.consultar`, volviendo a enmendar la regla de
 * nombres de modulo; la ultima suma `clientes.consultar` y `clientes.modificar` (las cinco
 * enmiendas estan escritas en `lib/modules/identity/domain/permissions.ts`).
 */
export const CODIGOS_QC74 = [
  'dashboard.consultar',
  'inventario.consultar',
  'inventario.modificar',
  'recetas.consultar',
  'recetas.modificar',
  'unidades.consultar',
  'unidades.modificar',
  'proveedores.consultar',
  'proveedores.modificar',
  'pedidos.consultar',
  'pedidos.modificar',
  'usuarios.consultar',
  'usuarios.modificar',
  'asignaciones.consultar',
  'asignaciones.modificar',
  'terminados.consultar',
  'clientes.consultar',
  'clientes.modificar',
] as const;

/** Los siete modulos de negocio del ERP. Eran cinco hasta que QC-86 sumo `asignaciones`; esta
 *  ficha suma `clientes`. */
export const MODULOS_DE_NEGOCIO = [
  'inventario',
  'recetas',
  'proveedores',
  'pedidos',
  'unidades',
  'asignaciones',
  'clientes',
] as const;

/**
 * Nombres de modulo que serian un comodin disfrazado: una «cuenta» que todos los roles llevan
 * siempre, un `todo`/`admin` que abre el ERP entero, o el comodin literal. La decision cerrada
 * nº2 del 2026-09-07 los prohibe por escrito.
 */
export const MODULOS_COMODIN = ['cuenta', 'todo', 'admin', 'all', 'global', '*'];

/** Acciones que valdrian para cualquier cosa. `modificar` cubre el borrado (QC-74 R3), no es esto. */
export const ACCIONES_COMODIN = ['todo', 'todas', 'all', 'admin', 'gestionar', '*'];

type PermisoLeido = { code: string; module: string; action: string };

/**
 * Los comodines de una lista de permisos, con el motivo. Pura y exportada para poder demostrar
 * con casos sinteticos que la regla DISPARA, y no solo que hoy no hay nada que la dispare.
 */
export function comodinesDe(permisos: readonly PermisoLeido[]): string[] {
  const hallazgos: string[] = [];
  for (const permiso of permisos) {
    if (MODULOS_COMODIN.includes(permiso.module)) {
      hallazgos.push(`${permiso.code}: modulo comodin "${permiso.module}"`);
    }
    if (ACCIONES_COMODIN.includes(permiso.action)) {
      hallazgos.push(`${permiso.code}: accion comodin "${permiso.action}"`);
    }
    if (permiso.code.includes('*')) {
      hallazgos.push(`${permiso.code}: el codigo contiene "*"`);
    }
    if (permiso.code !== `${permiso.module}.${permiso.action}`) {
      hallazgos.push(`${permiso.code}: el codigo no es "<modulo>.<accion>"`);
    }
  }
  return hallazgos;
}

describe('QC-75 R15 — el catalogo sigue siendo el de QC-74, sin comodines', () => {
  const catalogo: readonly PermisoLeido[] = PERMISSIONS;

  it('tiene exactamente dieciocho codigos, los dieciocho del catalogo', () => {
    expect(catalogo).toHaveLength(18);
    expect(catalogo.map((permiso) => permiso.code).sort()).toEqual([...CODIGOS_QC74].sort());
  });

  it('ningun permiso es un comodin ni de modulo ni de accion', () => {
    const hallazgos = comodinesDe(catalogo);
    expect(
      hallazgos,
      'QC-75 R15: el catalogo gano un permiso comodin o de «cuenta». La decision cerrada nº2 ' +
        'del 2026-09-07 lo prohibe: las rutas de la cuenta no exigen permiso de modulo, no ' +
        'llevan un permiso propio que todos los roles tienen siempre.\n' +
        hallazgos.join('\n'),
    ).toEqual([]);
  });

  it('los modulos son exactamente los siete de negocio mas dashboard y usuarios', () => {
    const modulos = [...new Set(catalogo.map((permiso) => permiso.module))].sort();
    // `unidades` ya esta entre los de negocio, `asignaciones` entro ahi con QC-86 y `clientes`
    // con esta ficha; el catalogo suma `dashboard`, que es una pantalla y no un modulo del ERP
    // (QC-74 R4: solo `consultar`), `usuarios`, que NO es ninguna carpeta de `lib/modules/` -los
    // usuarios viven dentro de `identity`-, y `terminados`, que tampoco es carpeta de
    // `lib/modules/`: la misma enmienda que ya se hizo con `usuarios`.
    const esperados = [...new Set([...MODULOS_DE_NEGOCIO, 'dashboard', 'usuarios', 'terminados'])].sort();
    expect(modulos).toEqual(esperados);
    expect(modulos).toContain('unidades');
  });

  it('las acciones del catalogo son solo consultar y modificar', () => {
    const acciones = [...new Set(catalogo.map((permiso) => permiso.action))].sort();
    expect(acciones).toEqual(['consultar', 'modificar']);
  });

  it('la regla dispara con un catalogo fabricado que si trae comodines', () => {
    const fabricado: PermisoLeido[] = [
      { code: 'cuenta.consultar', module: 'cuenta', action: 'consultar' },
      { code: 'inventario.todo', module: 'inventario', action: 'todo' },
      { code: '*.*', module: '*', action: '*' },
    ];
    const hallazgos = comodinesDe(fabricado);
    expect(hallazgos.length).toBeGreaterThanOrEqual(3);
    expect(hallazgos.join('\n')).toContain('cuenta.consultar');
    expect(hallazgos.join('\n')).toContain('inventario.todo');
  });

  it('y NO dispara con un catalogo fabricado que respeta la convencion', () => {
    const fabricado: PermisoLeido[] = [
      { code: 'inventario.consultar', module: 'inventario', action: 'consultar' },
      { code: 'pedidos.modificar', module: 'pedidos', action: 'modificar' },
    ];
    expect(comodinesDe(fabricado)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R22 — ningun backend nuevo
// ---------------------------------------------------------------------------------------------

/**
 * Los archivos que esta ficha NO puede tocar. Nombrados uno a uno o por prefijo de carpeta:
 *
 *   * el esquema y las migraciones — el modelo de datos es de QC-74 y ya esta;
 *   * el seed: el script (`scripts/seed.ts`), el caso de uso (`seed-initial-access.ts`) y los dos
 *     literales que siembra (`permissions.ts` con el catalogo y `SEED_ROLE_PERMISSIONS`,
 *     `roles.ts` con `SEED_ROLES`). Estos cuatro son los UNICOS archivos de `identity` que entran
 *     aqui: el resto del modulo SI cambia en esta ficha (ver la cabecera);
 *   * `lib/modules/<m>/domain/**` de los seis modulos de negocio — sus casos de uso.
 */
export const RUTAS_CONGELADAS: readonly string[] = [
  'db/schema.prisma',
  'db/migrations/',
  'scripts/seed.ts',
  'lib/modules/identity/domain/seed-initial-access.ts',
  'lib/modules/identity/domain/permissions.ts',
  'lib/modules/identity/domain/roles.ts',
  ...MODULOS_DE_NEGOCIO.map((modulo) => `lib/modules/${modulo}/domain/`),
];

/**
 * Los archivos de una lista que caen bajo una ruta congelada. Pura y exportada: la lista de
 * archivos puede venir del git real o ser fabricada, y asi se demuestra que la regla muerde.
 */
export function infraccionesDeBackend(archivos: readonly string[]): string[] {
  return archivos
    .filter((archivo) =>
      RUTAS_CONGELADAS.some((congelada) =>
        congelada.endsWith('/') ? archivo.startsWith(congelada) : archivo === congelada,
      ),
    )
    .sort();
}

/** Los archivos del diff de la rama contra el merge-base, o `null` si el rango no existe. */
function archivosDeLaRama(): string[] | null {
  try {
    const salida = execSync('git diff --name-only origin/dev...HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const archivos = salida
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0);
    // Estando en `dev` —o sin remoto— el rango existe pero esta VACIO: no hay nada que medir.
    // `docs/verification.md` documenta que dos archivos del baseline se ponian rojos justo por
    // esto y que lo correcto es SALTAR explicitamente. Devolver `null` es esa senal; lo que no
    // vale es devolver `[]` y pasar en verde sin haber comprobado nada.
    return archivos.length > 0 ? archivos : null;
  } catch {
    return null;
  }
}

/** Las claves de `dependencies` + `devDependencies` de un `package.json` ya parseado. */
export function nombresDeDependencias(packageJson: unknown): string[] {
  const pkg = packageJson as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort();
}

/** Las dependencias que estan en `despues` y no en `antes`. Pura: se prueba con datos fabricados. */
export function dependenciasAnadidas(
  antes: readonly string[],
  despues: readonly string[],
): string[] {
  const previas = new Set(antes);
  return despues.filter((nombre) => !previas.has(nombre)).sort();
}

/** Lee un archivo del repo en una revision dada, o `null` si no se puede. */
function leerEnRevision(revision: string, rutaRelativa: string): string | null {
  try {
    return execSync(`git show ${revision}:${rutaRelativa}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function mergeBaseConDev(): string | null {
  try {
    return execSync('git merge-base origin/dev HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

describe('QC-75 R22 — esta ficha no anade backend', () => {
  const archivos = archivosDeLaRama();

  // ESTA GUARDIA SOLO APLICA EN LA RAMA DE QC-75. En cualquier otra no hay nada que medir, porque
  // las reglas de abajo son sobre el alcance de ESTA ficha y no sobre el de las demas.
  //
  // Antes esto era un FALLO en vez de un salto, y el efecto era que el centinela ponia en rojo el
  // gate completo de TODAS las demas ramas -visto desde QC-38 el 2026-09-08: dos casos rojos, uno
  // por no encontrar `private-nav.ts` en el diff y otro marcando como «intocable» el catalogo de
  // permisos, que QC-38 amplia con permiso del humano-. Como el gate completo es obligatorio antes
  // de cada PR (regla 5 de `CLAUDE.md`), bloqueaba el F2.4 de todo el repo.
  //
  // SEGUNDO EPISODIO DE LA MISMA CLASE, y por eso la precondicion se endurece aqui. Hasta ahora la
  // senal era SOLO `private-nav.ts` en el rango, y eso no identifica una rama: ese archivo es el
  // registro COMPARTIDO del menu, asi que lo toca toda ficha que anade un item. Lo descubrio QC-39
  // el 2026-09-08 al anadir el item de Unidades: el centinela creyo que la rama de QC-39 era la de
  // QC-75 y fallo senalando como «intocables» `lib/modules/unidades/domain/list-units.ts` y
  // `unit-view.ts`, que el spec de QC-39 autoriza por escrito (R1-R6 y `design.md > 1`). Un salto
  // ya no basta: si la deteccion miente, el salto se convierte en un rojo ajeno.
  //
  // La senal pasa a ser CONJUNTIVA: el archivo central MAS la carpeta de spec de la propia ficha.
  // La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-75 -sus tres
  // archivos se escribieron en los commits de esa rama, junto al cambio de `private-nav.ts`- y no
  // aparece jamas en el rango de ninguna otra ficha, que trae la SUYA. No se usa este mismo archivo
  // de test como senal justamente porque otras fichas lo enmiendan al chocar con el, como esta.
  //
  // Esto ENDURECE la precondicion, no relaja la comprobacion: en la rama real de QC-75 ambas senales
  // estan presentes y los casos de abajo corren exactamente igual y con la misma severidad.
  const ARCHIVO_CENTRAL = 'lib/shared/navigation/private-nav.ts';
  const CARPETA_SPEC = 'specs/QC-75-menu-y-rutas-por-permiso/';
  const traeElArchivoCentral = archivos !== null && archivos.includes(ARCHIVO_CENTRAL);
  const traeLaCarpetaSpec =
    archivos !== null && archivos.some((archivo) => archivo.startsWith(CARPETA_SPEC));
  const esLaRamaDeQC75 = traeElArchivoCentral && traeLaCarpetaSpec;

  // ANCLA ANTI-VACUIDAD. Sin esto, un rango roto —o una corrida desde `dev`— dejaria los tres
  // casos de abajo en verde sin haber mirado nada, que es el anti-patron de la «validacion
  // opcional» de `docs/verification.md`. Aqui el rango se mide una vez y se afirma que trae
  // trabajo reconocible de QC-75 antes de sacar conclusiones de su contenido.
  it('el rango de la rama trae archivos y contiene el trabajo de QC-75', (ctx) => {
    if (archivos === null) {
      ctx.skip(
        'el rango git origin/dev...HEAD no esta disponible o esta vacio (corriendo desde `dev`, ' +
          'o sin remoto `origin`): este caso NO ha comprobado nada.',
      );
      return;
    }

    if (!esLaRamaDeQC75) {
      ctx.skip(
        'el rango trae archivos pero no trae a la vez `' + ARCHIVO_CENTRAL + '` y `' + CARPETA_SPEC +
          '`: esta NO es la rama de QC-75 -tocar solo el registro compartido del menu lo hace ' +
          'cualquier ficha que anade un item-, asi que la guardia no aplica y este caso NO ha ' +
          'comprobado nada.',
      );
      return;
    }

    expect(archivos.length).toBeGreaterThan(0);
    expect(
      archivos,
      'el rango existe pero no trae el archivo central de QC-75: probablemente esta midiendo ' +
        'otra cosa, asi que lo que digan los casos de R22 no vale.',
    ).toContain(ARCHIVO_CENTRAL);
  });

  it('no toca el esquema, las migraciones, el seed ni el dominio de los seis modulos de negocio', (ctx) => {
    if (archivos === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso NO ha comprobado nada.');
      return;
    }
    if (!esLaRamaDeQC75) {
      ctx.skip(
        'el rango no trae a la vez el archivo central y la carpeta de spec de QC-75: esta NO es ' +
          'su rama y R22 no le aplica.',
      );
      return;
    }

    const infracciones = infraccionesDeBackend(archivos);
    expect(
      infracciones,
      'QC-75 R22: esta ficha consume el modelo de permisos de QC-74 y no crea backend. Archivos ' +
        `intocables que aparecen en el diff de la rama:\n${infracciones.join('\n')}\n` +
        'Ojo: `lib/modules/identity/**` SI cambia en esta ficha (helper de permiso de pantalla, ' +
        'barrel, retirada del corte por rol); lo congelado de `identity` son solo el catalogo y ' +
        'el seed.',
    ).toEqual([]);
  });

  it('la regla de backend dispara con una lista fabricada y no con una limpia', () => {
    const fabricadaSucia = [
      'lib/shared/navigation/private-nav.ts',
      'db/schema.prisma',
      'db/migrations/20260101000000_permisos/migration.sql',
      'scripts/seed.ts',
      'lib/modules/pedidos/domain/create-order.ts',
      'lib/modules/identity/domain/permissions.ts',
    ];
    expect(infraccionesDeBackend(fabricadaSucia)).toEqual([
      'db/migrations/20260101000000_permisos/migration.sql',
      'db/schema.prisma',
      'lib/modules/identity/domain/permissions.ts',
      'lib/modules/pedidos/domain/create-order.ts',
      'scripts/seed.ts',
    ]);

    // El simetrico: trabajo legitimo de QC-75, incluido el de `identity`, que NO es infraccion.
    const fabricadaLimpia = [
      'app/(private)/layout.tsx',
      'app/(private)/not-found.tsx',
      'lib/shared/navigation/private-nav.ts',
      'lib/modules/identity/adapters/driving/require-page-permission.ts',
      'lib/modules/identity/domain/route-access.ts',
      'lib/modules/identity/index.ts',
      'lib/modules/pedidos/adapters/driving/order-actions.ts',
    ];
    expect(infraccionesDeBackend(fabricadaLimpia)).toEqual([]);
  });

  it('package.json no gano dependencias respecto al merge-base con dev', (ctx) => {
    // 2026-09-18: acotado a la rama de QC-75 con la MISMA precondicion conjuntiva que sus dos
    // hermanos de arriba -no aplicaba solo a este caso-. Sin ella, cualquier otra rama que sume
    // una dependencia propia y aprobada (QC-111 suma `@upstash/qstash`, aprobada junto con su
    // Route Handler) hacia fallar este caso por una pregunta que no es la suya: la de si ESTA
    // rama es la de QC-75. Fuera de esa rama, la pregunta complementaria -que toda dependencia
    // declarada tenga su fila en `docs/dependencias.md`- ya la responde
    // `tests/guards/guard-dependencias-aprobadas.test.ts`, que esta verde y no se toca. En la
    // rama real de QC-75 este caso sigue midiendo exactamente igual.
    if (!esLaRamaDeQC75) {
      ctx.skip(
        'el rango no trae a la vez el archivo central y la carpeta de spec de QC-75: esta NO es ' +
          'su rama y R22 no le aplica.',
      );
      return;
    }

    const base = mergeBaseConDev();
    const packageBase = base === null ? null : leerEnRevision(base, 'package.json');
    const packageHead = leerEnRevision('HEAD', 'package.json');

    if (packageBase === null || packageHead === null) {
      ctx.skip(
        'no se pudo leer `package.json` en el merge-base con origin/dev (sin remoto, o rango no ' +
          'disponible): este caso NO ha comprobado nada.',
      );
      return;
    }

    const antes = nombresDeDependencias(JSON.parse(packageBase));
    const despues = nombresDeDependencias(JSON.parse(packageHead));
    expect(antes.length, 'el package.json del merge-base no declara dependencias').toBeGreaterThan(
      0,
    );

    const anadidas = dependenciasAnadidas(antes, despues);
    expect(
      anadidas,
      `QC-75 R22 y decision cerrada «¿Libreria nueva? No»: dependencias nuevas en esta rama: ${anadidas.join(', ')}. ` +
        'Ninguna dependencia entra sin los cuatro checks y aprobacion humana. La pregunta ' +
        'complementaria —que toda dependencia declarada tenga su fila en docs/dependencias.md— ' +
        'la responde tests/guards/guard-dependencias-aprobadas.test.ts, que ya existe y no se toca.',
    ).toEqual([]);
  });

  it('la comparacion de dependencias dispara con listas fabricadas', () => {
    expect(dependenciasAnadidas(['next', 'react'], ['next', 'react'])).toEqual([]);
    expect(dependenciasAnadidas(['next', 'react'], ['next', 'next-themes', 'react'])).toEqual([
      'next-themes',
    ]);
    // Quitar una dependencia no es una infraccion de R22: la regla es asimetrica a proposito.
    expect(dependenciasAnadidas(['next', 'react'], ['react'])).toEqual([]);
  });

  it('nombresDeDependencias junta dependencies y devDependencies', () => {
    expect(
      nombresDeDependencias({ dependencies: { react: '19' }, devDependencies: { vitest: '4' } }),
    ).toEqual(['react', 'vitest']);
    expect(nombresDeDependencias({})).toEqual([]);
  });

  it('las rutas congeladas nombran archivos que existen hoy en el repo', () => {
    // Que la lista no se pudra: si manana se renombra `scripts/seed.ts`, esta guardia deja de
    // vigilar el seed sin que nadie se entere. Solo se comprueban las entradas de archivo
    // concreto; los prefijos de carpeta se validan por su cuenta mas abajo.
    const ficheros = RUTAS_CONGELADAS.filter((ruta) => !ruta.endsWith('/'));
    const inexistentes = ficheros.filter((ruta) => !existsSync(join(repoRoot, ruta)));
    expect(
      inexistentes,
      `Rutas congeladas que ya no existen: ${inexistentes.join(', ')}. Actualiza la lista o la ` +
        'guardia queda vigilando el vacio.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision cerrada nº 3 — el layout privado NUNCA llama a `notFound()`
// ---------------------------------------------------------------------------------------------
//
// Por que esto es una REGLA y no una opinion de estilo. `notFound()` lanzado desde una `page.tsx`
// lo captura el limite `not-found` mas cercano POR ENCIMA de la pagina —`app/(private)/not-found.tsx`—
// y ese limite se pinta DENTRO de los layouts de su segmento y superiores: el 404 sale envuelto en
// la barra lateral, con el menu ya filtrado, la cabecera y el control de cerrar sesion (R8, R14).
//
// Mover ese mismo `notFound()` al layout invierte el resultado: un `notFound()` lanzado en un layout
// hace FALLAR ese layout, asi que el limite que responde es el de ARRIBA y el 404 se renderiza FUERA
// del armazon privado. El resultado es un 404 pelado: sin menu y —lo grave— sin control de cerrar
// sesion. Quien no tenga ningun permiso ve esa pantalla en TODA ruta privada y queda encerrado, con
// la unica salida de borrar la cookie a mano. Eso es exactamente lo que la decision cerrada nº 3
// existe para evitar (`design.md > 2.3` y el JSDoc de `app/(private)/not-found.tsx`).
//
// Hoy lo unico que cazaria esa regresion es el E2E: el test mas lento y el que corre mas tarde. Esta
// comprobacion es de FUENTE a proposito, para que caiga en el gate rapido.

/**
 * Copia deliberada de `stripComments` de `tests/guards/guard-autorizacion-por-permiso.test.ts`.
 *
 * Hace falta porque el layout MENCIONA `notFound()` en su JSDoc A PROPOSITO, justo para advertir de
 * que no se debe llamar ahi. Sin descontar comentarios, esta regla naceria roja por documentar su
 * propia razon de ser.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se cierra en el siguiente
 * cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga todo lo que haya en medio,
 * codigo incluido. Es una trampa ya medida en `guard-firma-sesion-unica.test.ts` y repetida en
 * `guard-rol-administrador-unico.test.ts`: un comentario de linea con un comodin de ruta dejaba un
 * archivo reducido a su ultima linea y la guardia pasaba en VERDE sin haber mirado nada. Quitando
 * primero la linea entera, esa apertura desaparece con ella. No lo "simplifiques" de vuelta: el caso
 * de regresion de mas abajo vigila exactamente esto.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Los hallazgos de un fuente de layout, ya sin comentarios. Pura y exportada, como el resto de
 * guardias del repo, para poder demostrar con fuentes fabricados que la regla DISPARA y no solo que
 * hoy no hay nada que la dispare.
 *
 * Se vigilan DOS cosas:
 *
 * 1. La INVOCACION (`notFound(`), que es lo prohibido de verdad: la palabra suelta no rompe nada.
 * 2. El IMPORT del identificador. Se prohibe TAMBIEN, y no por celo: el layout no tiene ningun
 *    motivo legitimo para importar `notFound` —el corte por permiso va en cada `page.tsx` con
 *    `requirePagePermission`—, y vigilar solo la llamada deja pasar el alias
 *    (`import { notFound as fuera }` + `fuera()`), que produce exactamente el mismo 404 pelado.
 *    Prohibir la puerta de entrada cierra la familia entera en vez de una sola de sus formas.
 */
export function hallazgosDeNotFoundEnLayout(fuente: string): string[] {
  const codigo = stripComments(fuente);
  const hallazgos: string[] = [];
  if (/\bnotFound\s*\(/.test(codigo)) {
    hallazgos.push('invoca notFound(...)');
  }
  if (/import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from/.test(codigo)) {
    hallazgos.push('importa el identificador notFound');
  }
  return hallazgos;
}

const RUTA_LAYOUT_PRIVADO = 'app/(private)/layout.tsx';
const RUTA_NOT_FOUND_PRIVADO = 'app/(private)/not-found.tsx';

const COMO_ARREGLARLO =
  `${RUTA_LAYOUT_PRIVADO} no puede llamar (ni importar) notFound(). Un notFound() lanzado en un ` +
  'layout hace fallar ese layout, asi que responde el limite `not-found` de ARRIBA y el 404 sale ' +
  'FUERA de la barra lateral: sin menu y sin control de cerrar sesion, con lo que quien no tenga ' +
  'ningun permiso queda encerrado (decision cerrada nº 3, `design.md > 2.3`). El corte por permiso ' +
  'va en cada `page.tsx` con `requirePagePermission`, que si se pinta dentro del armazon privado ' +
  `gracias a ${RUTA_NOT_FOUND_PRIVADO}.`;

describe('QC-75 decision cerrada nº 3 — el layout privado no dispara el 404', () => {
  const rutaLayout = join(repoRoot, RUTA_LAYOUT_PRIVADO);

  // ANCLA ANTI-VACUIDAD. Sin esto, una ruta mal escrita —o el archivo movido— dejaria la regla en
  // verde sin haber leido nada, que es el anti-patron de `docs/verification.md`.
  it('el layout privado existe y su fuente trae el armazon que se afirma', () => {
    expect(
      existsSync(rutaLayout),
      `no existe ${RUTA_LAYOUT_PRIVADO}: la regla no estaria mirando nada`,
    ).toBe(true);

    const fuente = readFileSync(rutaLayout, 'utf8');
    expect(fuente.length).toBeGreaterThan(500);
    expect(fuente).toContain('PrivateLayout');
    expect(fuente).toContain('filterNavItemsByPermissions');
  });

  it('el layout REAL no invoca ni importa notFound', () => {
    const fuente = readFileSync(rutaLayout, 'utf8');
    const hallazgos = hallazgosDeNotFoundEnLayout(fuente);
    expect(hallazgos, `${RUTA_LAYOUT_PRIVADO}: ${hallazgos.join(', ')}. ${COMO_ARREGLARLO}`).toEqual(
      [],
    );
  });

  it('y ese verde es el de un archivo que SI habla de notFound en su JSDoc', () => {
    // El descuento de comentarios es load-bearing, no decorativo: el layout advierte por escrito de
    // esta misma regla. Si alguien quitara `stripComments`, la regla naceria roja; si alguien
    // quitara la advertencia del layout, este caso avisa de que el descuento ya no se esta probando.
    const fuente = readFileSync(rutaLayout, 'utf8');
    expect(fuente).toContain('notFound()');
    // Se afirma sobre un booleano y no con `not.toContain` sobre el fuente entero: cuando este caso
    // cae, el diff de un archivo de 130 lineas tapa el mensaje del caso de arriba, que es el que
    // dice que hacer.
    expect(
      stripComments(fuente).includes('notFound'),
      `${RUTA_LAYOUT_PRIVADO} nombra notFound fuera de un comentario. ${COMO_ARREGLARLO}`,
    ).toBe(false);
  });

  // El simetrico positivo: la regla completa es «el 404 se dispara desde las paginas y se pinta en
  // `not-found.tsx`, nunca desde el layout». Prohibir solo la mitad dejaria pasar que alguien
  // borrara el limite privado y el 404 saliera pelado igual.
  it('el limite 404 de la zona privada existe y es el que pinta la pantalla', () => {
    const rutaNotFound = join(repoRoot, RUTA_NOT_FOUND_PRIVADO);
    expect(
      existsSync(rutaNotFound),
      `falta ${RUTA_NOT_FOUND_PRIVADO}: sin ese limite el 404 lo responde el de la raiz y sale ` +
        'fuera del layout privado, que es justo lo que la decision cerrada nº 3 evita.',
    ).toBe(true);
    expect(readFileSync(rutaNotFound, 'utf8')).toContain('private-not-found');
  });

  it('dispara con un layout fabricado que llama a notFound()', () => {
    const fabricado = [
      "import { notFound } from 'next/navigation';",
      '',
      'export default async function PrivateLayout({ children }) {',
      '  const user = await identity.getSessionUser();',
      '  if (user.permissions.length === 0) notFound();',
      '  return <div>{children}</div>;',
      '}',
    ].join('\n');

    expect(hallazgosDeNotFoundEnLayout(fabricado)).toEqual([
      'invoca notFound(...)',
      'importa el identificador notFound',
    ]);
  });

  it('dispara tambien con el alias, que una regla de solo-la-llamada dejaria pasar', () => {
    const conAlias = [
      "import { notFound as fuera } from 'next/navigation';",
      'export default function PrivateLayout() { fuera(); }',
    ].join('\n');

    expect(hallazgosDeNotFoundEnLayout(conAlias)).toEqual(['importa el identificador notFound']);
  });

  it('NO dispara con un layout que solo lo menciona en un comentario de linea y en un JSDoc', () => {
    const soloProsa = [
      '/**',
      ' * Este layout NO debe llamar nunca a notFound(): lanzado aqui hace fallar el layout y el 404',
      ' * saldria sin menu ni boton de salir.',
      ' */',
      "import { redirect } from 'next/navigation';",
      '',
      '// el corte por permiso va en la page con requirePagePermission, no con notFound() aqui',
      'export default function PrivateLayout({ children }) { return <div>{children}</div>; }',
    ].join('\n');

    expect(hallazgosDeNotFoundEnLayout(soloProsa)).toEqual([]);
  });

  // Regresion del cegado de stripComments: mismo caso que en guard-rol-administrador-unico.test.ts.
  it('no se ciega: un comentario de linea con un comodin de ruta NO esconde la llamada de debajo', () => {
    const cegado = [
      '// las guardias barren app/** con las mismas reglas',
      "import { notFound } from 'next/navigation';",
      'export default function PrivateLayout() { notFound(); }',
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const revalidate = 0;',
    ].join('\n');

    expect(
      hallazgosDeNotFoundEnLayout(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione una ruta con comodin abre un bloque falso, ' +
        'se traga el codigo que tenga debajo y esta regla pasa en verde sin mirar el archivo.',
    ).toEqual(['invoca notFound(...)', 'importa el identificador notFound']);

    // Y el mismo fuente sin la linea de comentario tiene que dar lo mismo: lo que se afirma es que
    // el comentario NO cambia el veredicto, no que el fuente case por casualidad.
    expect(hallazgosDeNotFoundEnLayout(cegado.split('\n').slice(1).join('\n'))).toEqual([
      'invoca notFound(...)',
      'importa el identificador notFound',
    ]);
  });
});
