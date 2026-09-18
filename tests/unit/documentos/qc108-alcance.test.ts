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

export const RAMA_DE_LA_FICHA = 'feature/QC-108-lectura-de-pdf-con-gemini';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-108-lectura-de-pdf-con-gemini/';

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
      `git no pudo listar el diff contra ${mergeBase}: R17/R18/R19/R20/R24 NO se han comprobado, y en ` +
        'la rama de la ficha eso es rojo, no un salto.',
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R17, R18, R19, R20 y R24 hablan de ` +
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
      'este caso pasaria en verde sin haber mirado el cambio de QC-108.',
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

/** Ningun adaptador driving nuevo del modulo `documentos`: la capacidad es interna (R17). */
export function infraccionesDeDriving(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('lib/modules/documentos/adapters/driving/')).sort();
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

const CATALOGO_DE_PERMISOS = 'lib/modules/identity/domain/permissions.ts';
const PUERTO_DE_CONVERSION = 'lib/modules/documentos/ports/pdf-converter.ts';
const ADAPTADOR_DE_CONVERSION = 'lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts';
const INDICES_DE_INVENTARIO = 'tests/integration/inventario/list-query-indexes.int.test.ts';

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

describe('QC-108 T11 — la precondicion de rama', () => {
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

describe('QC-108 R19 — el diff no toca app/**, components/** ni e2e/**', () => {
  it('R19: el diff de la rama no trae ningun archivo bajo app/, components/ ni e2e/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeInterfaz(archivos);
    expect(
      infracciones,
      'QC-108 R19: esta ficha no anade ningun recorrido navegable —la pantalla es QC-107—, asi que su ' +
        `verificacion es unitaria y el E2E queda diferido. Archivos del diff que cruzan la frontera:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R19: el detector muerde con app/, components/ y e2e/, y no con lo que solo se les parece', () => {
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
        'tests/unit/documentos/qc108-alcance.test.ts',
        'tests/e2e-helpers/x.ts',
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// NI TABLA, NI MIGRACION, NI down.sql
// ---------------------------------------------------------------------------------------------

describe('QC-108 R20 — el diff no toca db/**', () => {
  it('R20: el diff de la rama no trae ningun archivo bajo db/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeBaseDeDatos(archivos);
    expect(
      infracciones,
      'QC-108 R20: leer un PDF con la IA no crea, lee ni escribe ninguna fila, asi que esta ficha no ' +
        `anade modelo, ni migracion, ni down.sql. Archivos del diff bajo db/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R24: y por lo tanto no introduce ningun identificador de base —tabla, columna o indice—', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    expect(
      archivos.filter((a) => a === 'db/schema.prisma' || a.startsWith('db/migrations/')),
      'QC-108 R24: un identificador de base nuevo solo puede entrar por el schema o por una migracion, ' +
        'y esta ficha no toca ninguno de los dos porque no crea ninguna tabla.',
    ).toEqual([]);
  });

  it('R20: el detector muerde con el schema, la migracion y su down, y no con parecidos', () => {
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
// CAPACIDAD INTERNA: NI ADAPTADOR DRIVING NUEVO
// ---------------------------------------------------------------------------------------------

describe('QC-108 R17 — ningun adaptador driving nuevo bajo documentos/', () => {
  it('R17: el diff de la rama no trae ningun archivo nuevo bajo adapters/driving/ de documentos', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeDriving(archivos);
    expect(
      infracciones,
      'QC-108 R17: la lectura con IA es una capacidad interna que invoca la cola de QC-111; no se ' +
        `expone como Server Action, Route Handler ni ruta. Archivos del diff bajo adapters/driving/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R17: el detector muerde con un driving de documentos y no con un driven o de otro modulo', () => {
    expect(
      infraccionesDeDriving([
        'lib/modules/documentos/adapters/driving/issue-upload-links.ts',
        'lib/modules/documentos/adapters/driving/read-pdf-action.ts',
        'lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts',
        'lib/modules/identity/adapters/driving/login-action.ts',
      ]),
    ).toEqual([
      'lib/modules/documentos/adapters/driving/issue-upload-links.ts',
      'lib/modules/documentos/adapters/driving/read-pdf-action.ts',
    ]);
    expect(
      infraccionesDeDriving(['app/api/documentos/route.ts', 'lib/modules/documentos/domain/read-pdf-with-ai.ts']),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// LOS INTOCABLES, IDENTICOS A DEV
// ---------------------------------------------------------------------------------------------

describe('QC-108 R18, R4 — permisos y puerto de conversion son los de dev', () => {
  it('R18: permissions.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, CATALOGO_DE_PERMISOS, 'export const PERMISSIONS');
    expect(
      archivosQueCambiaron([comparado]),
      'QC-108 R18: el permiso de esta operacion ya lo corto QC-106 en la emision de enlaces de subida; ' +
        `esta ficha no comprueba permiso ni anade entrada al catalogo cerrado. ${CATALOGO_DE_PERMISOS} ` +
        `cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('R4: ports/pdf-converter.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, PUERTO_DE_CONVERSION, 'PdfConverter');
    expect(
      archivosQueCambiaron([comparado]),
      'QC-108 R4: el modo imagen reutiliza el PdfConverter que QC-106 ya dejo montado; esta ficha no le ' +
        `anade, renombra ni cambia ningun metodo. ${PUERTO_DE_CONVERSION} cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('R4: adapters/driven/pdf/pdf-converter-unpdf.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, ADAPTADOR_DE_CONVERSION, 'unpdf');
    expect(
      archivosQueCambiaron([comparado]),
      `QC-108 R4: esta ficha no re-implementa la conversion, asi que ${ADAPTADOR_DE_CONVERSION} no se ` +
        `modifica ni un caracter. Cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('el intocable de QC-68 sigue intocado: list-query-indexes.int.test.ts es identico al de dev', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;
    const comparado = comparar(mergeBase, INDICES_DE_INVENTARIO, 'describe(');
    expect(
      archivosQueCambiaron([comparado]),
      `QC-108 no tiene ninguna razon para tocar ${INDICES_DE_INVENTARIO}: es un intocable declarado por ` +
        `la feature QC-68, ajena a esta ficha. Cambio respecto de ${mergeBase}.`,
    ).toEqual([]);
  });

  it('el comparador muerde con un contenido distinto y no con finales de linea distintos', () => {
    const contenido = 'export const PERMISSIONS = [\n  \'inventory.read\',\n] as const;\n';
    expect(archivosQueCambiaron([{ ruta: 'a.ts', enLaBase: contenido, enLaRama: contenido }])).toEqual([]);
    expect(
      archivosQueCambiaron([
        { ruta: 'a.ts', enLaBase: contenido, enLaRama: contenido.split('\n').join('\r\n') },
      ]),
    ).toEqual([]);
    expect(
      archivosQueCambiaron([
        {
          ruta: 'permissions.ts',
          enLaBase: contenido,
          enLaRama: contenido.replace("'inventory.read',", "'inventory.read',\n  'documents.ai_read',"),
        },
        { ruta: 'pdf-converter.ts', enLaBase: contenido, enLaRama: contenido },
      ]),
    ).toEqual(['permissions.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// NOTA: LAS DOS CONDICIONES «SI T0 SALIO NO» DE T11 NO APLICAN A ESTA GUARDIA
// ---------------------------------------------------------------------------------------------
//
// `tasks.md > T11` pide, condicionalmente, afirmar que `error-codes.ts`/`error-catalog.ts` y
// `package.json` quedan intactos SI las dos puertas de T0 salieron «no». En la aprobacion de F1.4
// el humano dijo «si» a las DOS: la octava enmienda al catalogo (`ai_unavailable`) y la dependencia
// `@google/genai`. Por eso esos tres archivos SI cambian en esta rama, y esta guardia no los afirma
// intactos: hacerlo pondria el gate en rojo contra una enmienda ya aprobada.
