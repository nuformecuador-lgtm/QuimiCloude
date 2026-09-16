// Limites de alcance de la rama, todos de ausencia. Los de diff se miden contra la base de fusion
// con `origin/dev` (o `dev`), contando arbol de trabajo y archivos sin seguimiento; los de codigo se
// leen comparando el archivo de disco con su version en esa misma base.
//
// Fuera de su rama, los casos que preguntan a git se saltan: una guardia de «la rama no toca X» ya
// mergeada se pondria roja con el trabajo legitimo de la siguiente, y acabaria apagada en el
// baseline. En su rama, no poder calcular la base es rojo.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

export const RAMA_DE_LA_FICHA = 'feature/QC-106-endpoint-de-carga-de-pdf';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-106-endpoint-de-carga-de-pdf/';

/** `origin/dev` primero: un `dev` local atrasado arrastraria al rango trabajo ajeno ya mergeado. */
const BASES = ['origin/dev', 'dev'] as const;

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function ramaActual(): string | null {
  const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'])?.trim();
  return rama === undefined || rama.length === 0 ? null : rama;
}

function mergeBaseDeLaRama(): string | null {
  for (const base of BASES) {
    const sha = git(['merge-base', base, 'HEAD'])?.trim();
    if (sha !== undefined && sha.length > 0) return sha;
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
 * Commits y arbol de trabajo, mas los archivos sin seguimiento: `git diff` no los ve y son justo lo
 * nuevo, que es donde una pantalla o una migracion aparecerian primero.
 */
function archivosDeLaRama(mergeBase: string): readonly string[] {
  const seguidos = git(['diff', '--name-only', mergeBase]);
  const sinSeguimiento = git(['ls-files', '--others', '--exclude-standard']);
  if (seguidos === null || sinSeguimiento === null) {
    throw new Error(
      `git no pudo listar el diff contra ${mergeBase}: R14/R29/R34 NO se han comprobado, y en la ` +
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
    return {
      tipo: 'saltar',
      motivo: 'no se pudo leer la rama actual con git: este caso NO ha comprobado nada.',
    };
  }
  if (rama !== RAMA_DE_LA_FICHA) {
    return {
      tipo: 'saltar',
      motivo:
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R14, R29, R30, R33 y R34 hablan de ` +
        'lo que hace ESTA ficha, no de lo que haga quien pase despues. Este caso NO ha comprobado nada.',
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

/** La base de fusion, un `skip` ruidoso fuera de la rama, o un rojo si en ella no se puede calcular. */
function baseOSalto(ctx: { skip: (nota?: string) => void }): string | null {
  const listo = preparar(rama, base);
  if (listo.tipo === 'saltar') {
    ctx.skip(listo.motivo);
    return null;
  }
  if (listo.tipo === 'fallar') throw new Error(listo.motivo);
  return listo.mergeBase;
}

/** Los archivos de la rama con su ancla, o `null` si el caso se ha saltado. */
function archivosOSalto(ctx: { skip: (nota?: string) => void }): readonly string[] | null {
  const mergeBase = baseOSalto(ctx);
  if (mergeBase === null) return null;

  const archivos = archivosDeLaRama(mergeBase);
  expect(
    archivos.some((archivo) => archivo.startsWith(CARPETA_SPEC)),
    `el diff contra ${mergeBase} no trae nada bajo ${CARPETA_SPEC}: el rango esta mal calculado y ` +
      'este caso pasaria en verde sin haber mirado el cambio de QC-106.',
  ).toBe(true);
  return archivos;
}

// ---------------------------------------------------------------------------------------------
// LOS DETECTORES DEL DIFF (puros)
// ---------------------------------------------------------------------------------------------

/** La pantalla, sus componentes y el recorrido de navegador, los tres a la vez. */
export const PREFIJOS_DE_INTERFAZ = ['app/', 'components/', 'e2e/'] as const;

export function infraccionesDeInterfaz(archivos: readonly string[]): string[] {
  return archivos.filter((a) => PREFIJOS_DE_INTERFAZ.some((prefijo) => a.startsWith(prefijo))).sort();
}

/** `db/` entero: el schema, la migracion y su `down.sql` viven todos ahi. */
export function infraccionesDeBaseDeDatos(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('db/')).sort();
}

export function infraccionesDeRouteHandler(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('app/api/')).sort();
}

/** Las dos que el humano aprobo para esta ficha, y ninguna mas. */
export const DEPENDENCIAS_APROBADAS_DE_LA_FICHA = ['@napi-rs/canvas', 'unpdf'] as const;

export function nombresDeDependencias(manifiesto: string): string[] {
  const json = JSON.parse(manifiesto) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [
    ...new Set([...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})]),
  ].sort();
}

export function dependenciasNuevas(base: readonly string[], rama: readonly string[]): string[] {
  const enLaBase = new Set(base);
  return rama.filter((nombre) => !enLaBase.has(nombre)).sort();
}

// ---------------------------------------------------------------------------------------------
// LECTURA DE CODIGO (pura)
// ---------------------------------------------------------------------------------------------

export interface ArchivoComparado {
  readonly ruta: string;
  readonly enLaBase: string;
  readonly enLaRama: string;
}

/**
 * Los finales de linea se normalizan porque el arbol de trabajo en Windows puede tener CRLF donde el
 * objeto de git guarda LF: eso es la copia local, no un cambio de contenido.
 */
function sinRetornos(texto: string): string {
  return texto.split('\r\n').join('\n');
}

export function archivosQueCambiaron(comparados: readonly ArchivoComparado[]): string[] {
  return comparados
    .filter(({ enLaBase, enLaRama }) => sinRetornos(enLaBase) !== sinRetornos(enLaRama))
    .map(({ ruta }) => ruta)
    .sort();
}

const CATALOGO_DE_ERRORES = 'lib/modules/errores/domain/error-codes.ts';
const CATALOGO_DE_PERMISOS = 'lib/modules/identity/domain/permissions.ts';

/** El archivo tal como esta en la base de fusion. Que git no lo pueda leer es rojo, no un vacio. */
function enLaBase(mergeBase: string, rutaRelativa: string): string {
  const contenido = git(['show', `${mergeBase}:${rutaRelativa}`]);
  if (contenido === null) {
    throw new Error(
      `git no pudo leer ${rutaRelativa} en ${mergeBase}: la comparacion contra dev NO se ha hecho, ` +
        'y en la rama de la ficha eso es rojo.',
    );
  }
  return contenido;
}

function enDisco(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

/** Compara un intocable contra su version en la base, con ancla de que se ha leido algo real. */
function comparar(mergeBase: string, rutaRelativa: string, marca: string): ArchivoComparado {
  const base = enLaBase(mergeBase, rutaRelativa);
  expect(
    base,
    `${rutaRelativa} en ${mergeBase} no contiene '${marca}': se esta comparando contra un archivo ` +
      'que no es el que la guardia cree, y el caso pasaria en verde sin mirar nada.',
  ).toContain(marca);
  return { ruta: rutaRelativa, enLaBase: base, enLaRama: enDisco(rutaRelativa) };
}

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA SIN GIT
// ---------------------------------------------------------------------------------------------

describe('QC-106 T11 — la precondicion de rama', () => {
  it('fuera de la rama de la ficha se salta ruidosamente, y en ella mide o falla', () => {
    const enDev = preparar('dev', 'abc123');
    expect(enDev.tipo).toBe('saltar');
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada');
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'");

    expect(preparar('feature/QC-999-lo-que-venga', 'abc123').tipo).toBe('saltar');
    expect(preparar(null, 'abc123').tipo).toBe('saltar');

    expect(preparar(RAMA_DE_LA_FICHA, null).tipo).toBe('fallar');
    expect((preparar(RAMA_DE_LA_FICHA, null) as { motivo: string }).motivo).toContain('merge-base');
    expect(preparar(RAMA_DE_LA_FICHA, 'abc123')).toEqual({ tipo: 'medir', mergeBase: 'abc123' });
  });
});

// ---------------------------------------------------------------------------------------------
// LA PANTALLA Y EL RECORRIDO DE NAVEGADOR
// ---------------------------------------------------------------------------------------------

describe('QC-106 R34 — el diff no toca app/**, components/** ni e2e/**', () => {
  it('R34: el diff de la rama no trae ningun archivo bajo app/, components/ ni e2e/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeInterfaz(archivos);
    expect(
      infracciones,
      'QC-106 R34: la pantalla de carga de PDF es QC-107, no esta ficha, y sin flujo navegable no hay ' +
        `E2E que escribir. Archivos del diff que cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R34: el detector muerde con app/, components/ y e2e/, y no con lo que solo se les parece', () => {
    expect(
      infraccionesDeInterfaz([
        'lib/modules/documentos/index.ts',
        'components/ui/button.tsx',
        'app/(private)/documentos/page.tsx',
        'e2e/documentos.spec.ts',
        'apps/otro/app.ts',
        'lib/shared/components/x.ts',
        'docs/e2e.md',
      ]),
    ).toEqual([
      'app/(private)/documentos/page.tsx',
      'components/ui/button.tsx',
      'e2e/documentos.spec.ts',
    ]);
    expect(
      infraccionesDeInterfaz([
        'lib/x.ts',
        'tests/unit/documentos/qc106-alcance.test.ts',
        'tests/e2e-helpers/x.ts',
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// NI TABLA, NI MIGRACION, NI down.sql
// ---------------------------------------------------------------------------------------------

describe('QC-106 R14 y R30 — el diff no toca db/**', () => {
  it('R14: el diff de la rama no trae ningun archivo bajo db/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeBaseDeDatos(archivos);
    expect(
      infracciones,
      'QC-106 R14: las dos operaciones no escriben ni leen una sola fila, asi que esta ficha no anade ' +
        `modelo, ni migracion, ni down.sql. Archivos del diff bajo db/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R30: y por lo tanto no introduce ningun identificador de base —tabla, columna o indice—', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    expect(
      archivos.filter((a) => a === 'db/schema.prisma' || a.startsWith('db/migrations/')),
      'QC-106 R30: un identificador de base nuevo solo puede entrar por el schema o por una migracion, ' +
        'y esta ficha no toca ninguno de los dos.',
    ).toEqual([]);
  });

  it('R14: el detector muerde con el schema, la migracion y su down, y no con parecidos', () => {
    expect(
      infraccionesDeBaseDeDatos([
        'db/schema.prisma',
        'db/migrations/20260916000000_documentos/migration.sql',
        'db/migrations/20260916000000_documentos/down.sql',
        'lib/modules/documentos/index.ts',
      ]),
    ).toEqual([
      'db/migrations/20260916000000_documentos/down.sql',
      'db/migrations/20260916000000_documentos/migration.sql',
      'db/schema.prisma',
    ]);
    expect(infraccionesDeBaseDeDatos(['docs/db.md', 'scripts/db-rollback.ts', 'lib/db/x.ts'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// SERVER ACTION, NO ROUTE HANDLER
// ---------------------------------------------------------------------------------------------

describe('QC-106 R29 — ningun archivo nuevo bajo app/api/', () => {
  it('R29: el diff de la rama no trae ningun archivo bajo app/api/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeRouteHandler(archivos);
    expect(
      infracciones,
      'QC-106 R29: la emision de enlaces se expone como Server Action; los Route Handlers los estrena ' +
        `QC-111. Archivos del diff bajo app/api/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R29: el detector muerde con un route handler y no con una Server Action del modulo', () => {
    expect(
      infraccionesDeRouteHandler([
        'app/api/documentos/route.ts',
        'app/api/webhooks/storage/route.ts',
        'lib/modules/documentos/adapters/driving/issue-upload-links.ts',
      ]),
    ).toEqual(['app/api/documentos/route.ts', 'app/api/webhooks/storage/route.ts']);
    expect(
      infraccionesDeRouteHandler(['app/(private)/documentos/page.tsx', 'lib/shared/api/x.ts']),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// LOS DOS CATALOGOS CERRADOS, INTACTOS
// ---------------------------------------------------------------------------------------------

describe('QC-106 R33 y R30 — el catalogo de errores y el de permisos son los de dev', () => {
  it('R33: error-codes.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, CATALOGO_DE_ERRORES, 'export const ERROR_CODES');
    expect(
      archivosQueCambiaron([comparado]),
      `QC-106 R33: esta ficha usa unicamente 'unauthorized' e 'invalid_input' del catalogo cerrado y no ` +
        `anade, renombra ni enmienda ninguna entrada. ${CATALOGO_DE_ERRORES} cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('R30: permissions.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, CATALOGO_DE_PERMISOS, 'export const PERMISSIONS');
    expect(
      archivosQueCambiaron([comparado]),
      'QC-106 R30: esta ficha exige un permiso YA existente, asi que el catalogo cerrado de permisos no ' +
        `gana, pierde ni renombra ninguna entrada. ${CATALOGO_DE_PERMISOS} cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('R33: el comparador muerde con una entrada anadida y no con finales de linea distintos', () => {
    const base = "export const ERROR_CODES = [\n  'unauthorized',\n  'invalid_input',\n] as const;\n";
    expect(archivosQueCambiaron([{ ruta: 'a.ts', enLaBase: base, enLaRama: base }])).toEqual([]);
    expect(
      archivosQueCambiaron([
        { ruta: 'a.ts', enLaBase: base, enLaRama: base.split('\n').join('\r\n') },
      ]),
    ).toEqual([]);
    expect(
      archivosQueCambiaron([
        {
          ruta: 'error-codes.ts',
          enLaBase: base,
          enLaRama: base.replace("'invalid_input',", "'invalid_input',\n  'pdf_unreadable',"),
        },
        { ruta: 'permissions.ts', enLaBase: base, enLaRama: base },
      ]),
    ).toEqual(['error-codes.ts']);
    // Quitar una entrada tambien es cambiar el catalogo, no solo anadirla.
    expect(
      archivosQueCambiaron([
        { ruta: 'a.ts', enLaBase: base, enLaRama: base.replace("  'invalid_input',\n", '') },
      ]),
    ).toEqual(['a.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// DEPENDENCIAS: EXACTAMENTE LAS DOS APROBADAS
// ---------------------------------------------------------------------------------------------

describe('QC-106 R24 y R26 — la rama anade exactamente las dos dependencias aprobadas', () => {
  it('R24: las unicas dependencias nuevas respecto de dev son las dos aprobadas en F1.4', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;

    const enDev = nombresDeDependencias(enLaBase(mergeBase, 'package.json'));
    const enLaRama = nombresDeDependencias(enDisco('package.json'));
    // Ancla: un manifiesto que no se hubiera leido daria dos listas vacias y un verde vacuo.
    expect(enDev.length, 'el package.json de la base no declara dependencias').toBeGreaterThan(20);
    expect(enLaRama).toContain('zod');

    const nuevas = dependenciasNuevas(enDev, enLaRama);
    expect(
      nuevas,
      'QC-106 R24: esta ficha instalo las dos dependencias que el humano aprobo en F1.4, con su fila en ' +
        `docs/dependencias.md, y ninguna mas. Dependencias nuevas encontradas: ${nuevas.join(', ')}`,
    ).toEqual([...DEPENDENCIAS_APROBADAS_DE_LA_FICHA]);
  });

  it('R26: @supabase/storage-js no entra como dependencia nueva', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    expect(
      nombresDeDependencias(enLaBase(mergeBase, 'package.json')),
      'QC-106 R26: el cliente de Storage ya estaba aprobado e instalado antes de esta ficha; si no ' +
        'estuviera en la base, esta rama lo estaria incorporando como dependencia nueva.',
    ).toContain('@supabase/storage-js');
  });

  it('R24: el detector muerde con una tercera dependencia y no con un cambio de version', () => {
    const manifiestoBase = JSON.stringify({
      dependencies: { zod: '^4.4.3', '@supabase/storage-js': '^2.115.0' },
      devDependencies: { vitest: '^3.0.0' },
    });
    const conLasDosAprobadas = JSON.stringify({
      dependencies: {
        zod: '^4.4.3',
        '@supabase/storage-js': '^2.115.0',
        unpdf: '1.8.1',
        '@napi-rs/canvas': '1.0.9',
      },
      devDependencies: { vitest: '^3.0.0' },
    });
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conLasDosAprobadas)),
    ).toEqual([...DEPENDENCIAS_APROBADAS_DE_LA_FICHA]);

    const conUnaTercera = conLasDosAprobadas.replace('"unpdf":"1.8.1"', '"unpdf":"1.8.1","pdf-lib":"1.17.1"');
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conUnaTercera)),
    ).toEqual(['@napi-rs/canvas', 'pdf-lib', 'unpdf']);

    // Una colada como devDependency es igual de nueva.
    const enDev = conLasDosAprobadas.replace('"vitest":"^3.0.0"', '"vitest":"^3.0.0","tsx":"^4.0.0"');
    expect(dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(enDev))).toEqual([
      '@napi-rs/canvas',
      'tsx',
      'unpdf',
    ]);

    // Subir la version de una que ya estaba no es anadir nada.
    const soloOtraVersion = manifiestoBase.replace('"zod":"^4.4.3"', '"zod":"^4.5.0"');
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(soloOtraVersion)),
    ).toEqual([]);
  });
});
