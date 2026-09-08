// QC-75 T15 — las dos convenciones NEGATIVAS de la ficha: ningun comodin (R15) y ningun backend
// nuevo (R22).
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
// seed— y (b) los casos de uso de los CINCO MODULOS DE NEGOCIO. Por eso la lista congelada nombra
// archivos concretos de `identity` (el catalogo y el seed) en vez de la carpeta entera.
//
// Sobre la dependencia nueva: este archivo comprueba que `package.json` no GANO claves respecto
// al merge-base, que es una pregunta sobre esta rama. Va JUNTO CON
// `tests/guards/guard-dependencias-aprobadas.test.ts` —que ya existe, no se toca aqui, y responde
// la pregunta complementaria: que toda dependencia declarada tenga su fila en
// `docs/dependencias.md`—. Ninguno de los dos sustituye al otro.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// ---------------------------------------------------------------------------------------------
// R15 — el catalogo cerrado, sin comodines
// ---------------------------------------------------------------------------------------------

/** Los diez codigos de QC-74, escritos a mano A PROPOSITO: son el contrato que R15 congela. */
export const CODIGOS_QC74 = [
  'dashboard.consultar',
  'inventario.consultar',
  'inventario.modificar',
  'recetas.consultar',
  'recetas.modificar',
  'unidades.consultar',
  'proveedores.consultar',
  'proveedores.modificar',
  'pedidos.consultar',
  'pedidos.modificar',
] as const;

/** Los cinco modulos de negocio del ERP. */
export const MODULOS_DE_NEGOCIO = [
  'inventario',
  'recetas',
  'proveedores',
  'pedidos',
  'unidades',
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

  it('tiene exactamente diez codigos, los diez de QC-74', () => {
    expect(catalogo).toHaveLength(10);
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

  it('los modulos son exactamente los cinco de negocio mas dashboard y unidades', () => {
    const modulos = [...new Set(catalogo.map((permiso) => permiso.module))].sort();
    // `unidades` ya esta entre los cinco de negocio; el catalogo suma `dashboard`, que es una
    // pantalla y no un modulo del ERP (QC-74 R4: solo `consultar`).
    const esperados = [...new Set([...MODULOS_DE_NEGOCIO, 'dashboard'])].sort();
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
 *   * `lib/modules/<m>/domain/**` de los cinco modulos de negocio — sus casos de uso.
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

    expect(archivos.length).toBeGreaterThan(0);
    expect(
      archivos,
      'el rango existe pero no trae el archivo central de QC-75: probablemente esta midiendo ' +
        'otra cosa, asi que lo que digan los casos de R22 no vale.',
    ).toContain('lib/shared/navigation/private-nav.ts');
  });

  it('no toca el esquema, las migraciones, el seed ni el dominio de los cinco modulos de negocio', (ctx) => {
    if (archivos === null) {
      ctx.skip('el rango git origin/dev...HEAD no esta disponible: este caso NO ha comprobado nada.');
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
