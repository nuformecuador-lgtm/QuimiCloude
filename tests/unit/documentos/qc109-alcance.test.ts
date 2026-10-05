// Limites de alcance y de FORMA de QC-109, casi todos de ausencia. Los de diff se miden contra la
// base de fusion con `origin/dev` (o `dev`), contando arbol de trabajo y archivos sin seguimiento;
// los de codigo se leen del disco y se analizan con detectores puros, que ademas se prueban aparte
// con una entrada infractora inventada para saber que muerden.
//
// Fuera de su rama, los casos que preguntan a git se saltan: una guardia de «la rama no toca X» ya
// mergeada se pondria roja con el trabajo legitimo de la siguiente. En su rama, no poder calcular la
// base es rojo.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pdfStrategySchema } from '@/lib/modules/documentos/domain/pdf-strategy';

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

export const RAMA_DE_LA_FICHA = 'feature/QC-109-procesamiento-de-pdf-por-estrategia';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-109-procesamiento-de-pdf-por-estrategia/';

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
 * nuevo de esta ficha, que es donde un `e2e/` o un `package.json` tocado apareceria primero.
 */
function archivosDeLaRama(mergeBase: string): readonly string[] {
  const seguidos = git(['diff', '--name-only', mergeBase]);
  const sinSeguimiento = git(['ls-files', '--others', '--exclude-standard']);
  if (seguidos === null || sinSeguimiento === null) {
    throw new Error(
      `git no pudo listar el diff contra ${mergeBase}: R11, R16 y R17 NO se han comprobado, y en la ` +
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R11, R16 y R17 hablan de lo que hace ` +
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

/** Los archivos de la rama con su ancla, o `null` si el caso se ha saltado. */
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
      'y este caso pasaria en verde sin haber mirado el cambio de QC-109.',
  ).toBe(true);
  return archivos;
}

// ---------------------------------------------------------------------------------------------
// LOS ARCHIVOS NUEVOS DE LA FICHA
// ---------------------------------------------------------------------------------------------

const MODULO = 'lib/modules/documentos';

/**
 * Los archivos que introduce QC-109, tal como los enumera `design.md > 3`, con los tres de
 * `domain/prompts/` fuera y los dos del puerto y el adaptador de entorno de QC-129 dentro
 * (`[D7]`, `[D11]`): QC-129 `design.md > 4.1` y `4.2`.
 */
export const ARCHIVOS_NUEVOS = [
  `${MODULO}/domain/pdf-strategy.ts`,
  `${MODULO}/domain/process-pdf-by-strategy.ts`,
  `${MODULO}/ports/strategy-run-log.ts`,
  `${MODULO}/adapters/driven/observability/strategy-run-log-console.ts`,
  `${MODULO}/ports/strategy-prompt.ts`,
  `${MODULO}/adapters/driven/config/strategy-prompt-env.ts`,
] as const;

const BARREL = `${MODULO}/index.ts`;

function enDisco(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

export interface ArchivoLeido {
  readonly ruta: string;
  readonly fuente: string;
}

/** Lee los archivos de la ficha con ancla: un archivo vacio haria pasar en verde cualquier ausencia. */
function archivosNuevosLeidos(): readonly ArchivoLeido[] {
  const leidos = ARCHIVOS_NUEVOS.map((ruta) => ({ ruta, fuente: enDisco(ruta) }));
  for (const { ruta, fuente } of leidos) {
    expect(
      fuente.trim().length,
      `${ruta} se ha leido vacio: los casos de ausencia de esta guardia pasarian en verde sin mirar ` +
        'nada de verdad.',
    ).toBeGreaterThan(0);
  }
  expect(leidos).toHaveLength(6);
  return leidos;
}

// ---------------------------------------------------------------------------------------------
// LOS DETECTORES (puros)
// ---------------------------------------------------------------------------------------------

/** Los especificadores de todo import/export-from/require/import() de un archivo. */
export function especificadoresDe(fuente: string): string[] {
  const encontrados = new Set<string>();
  const patrones = [
    /\bimport\s+[^;']*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^;']*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const patron of patrones) {
    for (const coincidencia of fuente.matchAll(patron)) {
      const especificador = coincidencia[1];
      if (especificador !== undefined) encontrados.add(especificador);
    }
  }
  return [...encontrados].sort();
}

/** Modulos de plataforma que leerian disco o rutas en ejecucion, y el `cwd` que los acompana. */
export const MODULOS_DE_DISCO = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'path', 'node:path'] as const;

export function infraccionesDeDisco(archivos: readonly ArchivoLeido[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const especificador of especificadoresDe(fuente)) {
      if (MODULOS_DE_DISCO.includes(especificador as (typeof MODULOS_DE_DISCO)[number])) {
        hallazgos.push(`${ruta}: importa '${especificador}'`);
      }
    }
    if (fuente.includes('process.cwd')) hallazgos.push(`${ruta}: usa process.cwd`);
  }
  return hallazgos.sort();
}

/** Los literales de los limites del modulo, que viven SOLO en `domain/limits.ts` (R11). */
export const LITERALES_DE_LIMITE = [
  { etiqueta: '50 (MAX_PDF_PAGES)', patron: /(?<![\w.])50(?![\w.])/ },
  { etiqueta: '150 (PAGE_RENDER_DPI)', patron: /(?<![\w.])150(?![\w.])/ },
  { etiqueta: '60 (AI_READ_TIMEOUT_SECONDS)', patron: /(?<![\w.])60(?![\w.])/ },
  { etiqueta: '1000 (MILLISECONDS_PER_SECOND)', patron: /(?<![\w.])1000(?![\w.])/ },
  { etiqueta: '20 * 1024 * 1024 (MAX_PDF_BYTES)', patron: /1024/ },
] as const;

export function infraccionesDeLimites(archivos: readonly ArchivoLeido[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const { etiqueta, patron } of LITERALES_DE_LIMITE) {
      if (patron.test(fuente)) hallazgos.push(`${ruta}: escribe a mano ${etiqueta}`);
    }
    if (/['"][^'"]*limits['"]/.test(fuente)) hallazgos.push(`${ruta}: importa domain/limits.ts`);
  }
  return hallazgos.sort();
}

/** El proveedor de IA y los adaptadores, que el dominio y los puertos no pueden nombrar (R14). */
export const NOMBRES_PROHIBIDOS_EN_DOMINIO = [
  'gemini',
  'genai',
  '@google/genai',
  'anthropic',
  'adapters/',
] as const;

export function infraccionesDeProveedor(archivos: readonly ArchivoLeido[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    const enMinusculas = fuente.toLowerCase();
    for (const prohibido of NOMBRES_PROHIBIDOS_EN_DOMINIO) {
      if (enMinusculas.includes(prohibido)) hallazgos.push(`${ruta}: nombra '${prohibido}'`);
    }
  }
  return hallazgos.sort();
}

/** Lo unico que los archivos nuevos pueden importar de fuera de su propia carpeta (R16). */
export const IMPORTS_EXTERNOS_PERMITIDOS = ['zod', '@/lib/modules/errores'] as const;

export function infraccionesDeImport(archivos: readonly ArchivoLeido[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const especificador of especificadoresDe(fuente)) {
      const esRelativo = especificador.startsWith('.');
      const esDelModulo = especificador.startsWith(`@/${MODULO}`);
      const estaPermitido = IMPORTS_EXTERNOS_PERMITIDOS.includes(
        especificador as (typeof IMPORTS_EXTERNOS_PERMITIDOS)[number],
      );
      if (!esRelativo && !esDelModulo && !estaPermitido) {
        hallazgos.push(`${ruta}: importa '${especificador}'`);
      }
    }
  }
  return hallazgos.sort();
}

/** Archivos del diff que tocarian el build o las dependencias (R16). */
export const ARCHIVOS_DE_BUILD = ['package.json', 'pnpm-lock.yaml', 'tsconfig.json'] as const;

export function infraccionesDeBuild(archivos: readonly string[]): string[] {
  return archivos
    .filter(
      (a) =>
        ARCHIVOS_DE_BUILD.includes(a as (typeof ARCHIVOS_DE_BUILD)[number]) ||
        /^next\.config\.[a-z]+$/.test(a),
    )
    .sort();
}

/** Archivos del diff bajo `e2e/` (R17). */
export function infraccionesDeE2e(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('e2e/')).sort();
}

/** Los identificadores que un archivo EXPORTA por nombre. */
export function exportadosDe(fuente: string): string[] {
  const encontrados = new Set<string>();
  const patron = /\bexport\s+(?:declare\s+)?(?:const|let|var|function|async function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const coincidencia of fuente.matchAll(patron)) {
    const nombre = coincidencia[1];
    if (nombre !== undefined) encontrados.add(nombre);
  }
  return [...encontrados].sort();
}

/** El codigo sin comentarios: lo que un barril EXPLICA no es lo que publica. */
export function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Los nombres y las rutas que un barril REEXPORTA, comentarios aparte. */
export function reexportadosDe(fuente: string): {
  readonly nombres: string[];
  readonly rutas: string[];
} {
  const nombres = new Set<string>();
  const rutas = new Set<string>();
  const patron = /export\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const coincidencia of sinComentarios(fuente).matchAll(patron)) {
    for (const bruto of (coincidencia[1] ?? '').split(',')) {
      const nombre = bruto.replace(/\btype\b/, '').split(/\s+as\s+/)[0]?.trim();
      if (nombre !== undefined && nombre.length > 0) nombres.add(nombre);
    }
    const ruta = coincidencia[2];
    if (ruta !== undefined) rutas.add(ruta);
  }
  return { nombres: [...nombres].sort(), rutas: [...rutas].sort() };
}

/** Los campos declarados en los tipos de un archivo (`readonly x:` y `x(`/`x:` de la interfaz). */
export function camposDe(fuente: string): string[] {
  const encontrados = new Set<string>();
  for (const coincidencia of fuente.matchAll(/^\s*(?:readonly\s+)?([a-z][\w$]*)\s*[?]?\s*[:(]/gm)) {
    const nombre = coincidencia[1];
    if (nombre !== undefined) encontrados.add(nombre);
  }
  return [...encontrados].sort();
}

/**
 * Palabras de negocio en castellano. `catalogo` y `formula` no estan: son los dos literales del
 * enum, los unicos nombres no ingleses que `[D1]` autoriza.
 */
export const PALABRAS_NO_INGLESAS = [
  'estrategia',
  'registro',
  'pagina',
  'longitud',
  'ruta',
  'modo',
  'texto',
  'archivo',
  'lectura',
  'proceso',
  'resumen',
  'documento',
] as const;

export function identificadoresNoIngleses(nombres: readonly string[]): string[] {
  return nombres
    .filter((nombre) => {
      const enMinusculas = nombre.toLowerCase();
      return PALABRAS_NO_INGLESAS.some((palabra) => enMinusculas.includes(palabra));
    })
    .sort();
}

/** Archivos que pueden invocar la capacidad y no deben hacerlo todavia (R13). */
export function archivosQueInvocan(
  archivos: readonly ArchivoLeido[],
  simbolo: string,
): string[] {
  return archivos.filter(({ fuente }) => fuente.includes(simbolo)).map(({ ruta }) => ruta).sort();
}

/** Todos los archivos versionados bajo un prefijo, con su fuente. Ancla incluida en cada caso. */
function versionadosBajo(...prefijos: readonly string[]): readonly ArchivoLeido[] {
  const salida = git(['ls-files', ...prefijos]);
  if (salida === null) {
    throw new Error(`git no pudo listar los archivos bajo ${prefijos.join(', ')}: R13 NO se ha comprobado.`);
  }
  return lineas(salida)
    .filter((ruta) => /\.(ts|tsx|js|mjs)$/.test(ruta))
    .map((ruta) => ({ ruta, fuente: enDisco(ruta) }));
}

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA SIN GIT
// ---------------------------------------------------------------------------------------------

describe('QC-109 — la precondicion de rama', () => {
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
// R4 — DEROGADO POR QC-129 [D7]
// ---------------------------------------------------------------------------------------------

/**
 * QC-109 R4 decia que el texto del prompt entraba por `import`, como modulo, en tiempo de
 * compilacion. QC-129 `[D7]` deroga esa mitad: el texto ahora llega por una variable de entorno,
 * leida en la invocacion (`ports/strategy-prompt.ts`, `adapters/driven/config/strategy-prompt-env.ts`).
 * La otra mitad de R4 SIGUE VIGENTE: una variable de entorno no es disco ni red, asi que el
 * dominio y los archivos nuevos de la ficha siguen sin importar `fs`, sin importar `path` y sin
 * usar `process.cwd`.
 */
describe('QC-109 R4 — derogado por QC-129 [D7]: el texto ya no entra por import, pero sigue sin ser disco ni red', () => {
  it('R4 (mitad vigente): los tres archivos de prompts no existen y ningun archivo nuevo toca disco', () => {
    for (const ruta of [
      `${MODULO}/domain/prompts/index.ts`,
      `${MODULO}/domain/prompts/catalogo.json`,
      `${MODULO}/domain/prompts/formula.json`,
    ]) {
      expect(
        () => enDisco(ruta),
        `R4/R8: ${ruta} deberia haber desaparecido con QC-129 [D11] y sigue en disco.`,
      ).toThrow();
    }

    const infracciones = infraccionesDeDisco(archivosNuevosLeidos());
    expect(
      infracciones,
      'R4: una variable de entorno no es disco ni red, y los archivos nuevos de la ficha siguen sin ' +
        `leer ninguno de los dos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R4: el detector muerde con fs, node:path y process.cwd, y no con un archivo limpio', () => {
    expect(
      infraccionesDeDisco([
        { ruta: 'a.ts', fuente: "import { readFileSync } from 'fs';\n" },
        { ruta: 'b.ts', fuente: "import { join } from 'node:path';\n" },
        { ruta: 'c.ts', fuente: "const raiz = process.cwd();\n" },
        { ruta: 'd.ts', fuente: "import catalogo from './catalogo.json';\n" },
      ]).sort(),
    ).toEqual([
      "a.ts: importa 'fs'",
      "b.ts: importa 'node:path'",
      'c.ts: usa process.cwd',
    ]);
    expect(infraccionesDeDisco([{ ruta: 'd.ts', fuente: "import { z } from 'zod';\n" }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R6 — DEROGADO ENTERO POR QC-129 [D7] [D11]
// ---------------------------------------------------------------------------------------------

// QC-109 R6 exigia que cada `.json` de prompt se declarara `provisional: true` y remitiera a
// QC-129 como quien escribiria el texto definitivo. QC-129 borro los dos `.json` (`[D11]`): ya
// no queda ningun archivo que marcar como provisional, asi que el requisito no tiene sobre que
// comprobarse y este `describe` se borra entero, no se salta. La derogacion de R4 de mas arriba
// cubre la comprobacion de forma que sustituye a esta seccion.

// ---------------------------------------------------------------------------------------------
// R11 — NINGUN LIMITE PROPIO
// ---------------------------------------------------------------------------------------------

describe('QC-109 R11 — los limites no se reescriben ni se importan', () => {
  it('R11: ningun archivo nuevo escribe a mano un literal de limite ni importa domain/limits.ts', () => {
    const infracciones = infraccionesDeLimites(archivosNuevosLeidos());
    expect(
      infracciones,
      'R11: el tope de paginas, el de tamano, la resolucion y el plazo viven una sola vez en ' +
        '`domain/limits.ts`, y quien los necesita es la lectura de dentro, no esta capa:\n' +
        infracciones.join('\n'),
    ).toEqual([]);
  });

  it('R11: el detector muerde con cada literal y con el import, y no con un numero ajeno', () => {
    expect(infraccionesDeLimites([{ ruta: 'a.ts', fuente: 'const tope = 50;\n' }])).toEqual([
      'a.ts: escribe a mano 50 (MAX_PDF_PAGES)',
    ]);
    expect(infraccionesDeLimites([{ ruta: 'b.ts', fuente: 'const dpi = 150;\n' }])).toEqual([
      'b.ts: escribe a mano 150 (PAGE_RENDER_DPI)',
    ]);
    expect(infraccionesDeLimites([{ ruta: 'c.ts', fuente: 'const plazo = 60 * 1000;\n' }]).sort()).toEqual([
      'c.ts: escribe a mano 1000 (MILLISECONDS_PER_SECOND)',
      'c.ts: escribe a mano 60 (AI_READ_TIMEOUT_SECONDS)',
    ]);
    expect(infraccionesDeLimites([{ ruta: 'd.ts', fuente: 'const max = 20 * 1024 * 1024;\n' }])).toEqual([
      'd.ts: escribe a mano 20 * 1024 * 1024 (MAX_PDF_BYTES)',
    ]);
    expect(
      infraccionesDeLimites([{ ruta: 'e.ts', fuente: "import { MAX_PDF_PAGES } from './limits';\n" }]),
    ).toEqual(['e.ts: importa domain/limits.ts']);
    expect(infraccionesDeLimites([{ ruta: 'f.ts', fuente: 'const dos = 2;\nconst nota = "QC-129";\n' }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R13 — QUE PUBLICA EL BARREL, Y QUE NO LO INVOCA NADIE
// ---------------------------------------------------------------------------------------------

describe('QC-109 R13 — la capacidad se publica como fabrica y no la dispara nadie', () => {
  it('R13: el barrel exporta el esquema y la fabrica, y no el puerto, ni los prompts, ni el adaptador', () => {
    const barrel = enDisco(BARREL);
    expect(barrel.trim().length, `${BARREL} se ha leido vacio.`).toBeGreaterThan(0);

    // Lo que se mide son las REEXPORTACIONES, no el texto: el barril explica en comentarios que el
    // puerto y los prompts se quedan dentro, y buscar la palabra suelta confundiria la explicacion
    // con la infraccion.
    const { nombres, rutas } = reexportadosDe(barrel);
    expect(nombres.length, `${BARREL}: no se ha leido ninguna reexportacion.`).toBeGreaterThan(0);

    expect(nombres).toEqual(
      expect.arrayContaining([
        'pdfStrategySchema',
        'PdfStrategy',
        'createProcessPdfByStrategy',
        'ProcessPdfByStrategyDeps',
        'ProcessPdfByStrategyInput',
        'StrategyRunResult',
      ]),
    );

    const publicados = [
      ...nombres.filter((nombre) =>
        [
          'StrategyRunLog',
          'StrategyRunSummary',
          'MODE_BY_STRATEGY',
          'PROMPT_BY_STRATEGY',
          'StrategyPrompt',
        ].includes(nombre),
      ),
      ...rutas.filter((ruta) => /ports\/|prompts|adapters\/|\.json$/.test(ruta)),
    ].sort();
    expect(
      publicados,
      'R13: el puerto lo ve solo `lib/composition`, y los prompts son detalle interno de la ' +
        `estrategia: publicarlos invitaria a pasarlos por parametro desde fuera. Publicados de mas:\n${publicados.join('\n')}`,
    ).toEqual([]);
  });

  it('R13: el lector de reexportaciones distingue lo exportado de lo que solo se nombra en un comentario', () => {
    const fuente =
      "// NO — los PUERTOS (ports/**) ni los prompts: los ve solo lib/composition.\n" +
      "/* StrategyRunLog no sale por aqui. */\n" +
      "export { pdfStrategySchema, type PdfStrategy } from './domain/pdf-strategy';\n" +
      "export {\n  createProcessPdfByStrategy,\n  type StrategyRunResult,\n} from './domain/process-pdf-by-strategy';\n";
    expect(reexportadosDe(fuente)).toEqual({
      nombres: ['PdfStrategy', 'StrategyRunResult', 'createProcessPdfByStrategy', 'pdfStrategySchema'],
      rutas: ['./domain/pdf-strategy', './domain/process-pdf-by-strategy'],
    });

    const infractor =
      "export type { StrategyRunLog } from './ports/strategy-run-log';\n" +
      "export { PROMPT_BY_STRATEGY } from './domain/prompts';\n";
    expect(reexportadosDe(infractor)).toEqual({
      nombres: ['PROMPT_BY_STRATEGY', 'StrategyRunLog'],
      rutas: ['./domain/prompts', './ports/strategy-run-log'],
    });
  });

  it('R13: ningun archivo de app/ ni ningun adaptador driving invoca processPdfByStrategy', () => {
    const candidatos = versionadosBajo('app', 'lib/modules/*/adapters/driving');
    expect(
      candidatos.length,
      'R13: no se ha leido ningun archivo de app/ ni de adapters/driving/: este caso pasaria en ' +
        'verde sin haber mirado nada.',
    ).toBeGreaterThan(0);

    const invocan = archivosQueInvocan(candidatos, 'processPdfByStrategy');
    expect(
      invocan,
      'R13: quien dispara esta capacidad es la cola de QC-111; esta ficha solo la publica. ' +
        `Archivos que ya la invocan:\n${invocan.join('\n')}`,
    ).toEqual([]);
  });

  it('R13: el detector de invocaciones muerde con una llamada real y no con un nombre parecido', () => {
    expect(
      archivosQueInvocan(
        [
          { ruta: 'app/api/x/route.ts', fuente: 'await documentos.processPdfByStrategy(input);\n' },
          { ruta: 'lib/modules/documentos/adapters/driving/x.ts', fuente: 'processPdfByStrategy\n' },
          { ruta: 'app/page.tsx', fuente: 'await documentos.convertPdfs(input);\n' },
        ],
        'processPdfByStrategy',
      ),
    ).toEqual(['app/api/x/route.ts', 'lib/modules/documentos/adapters/driving/x.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R14 — NI PROVEEDOR NI ADAPTADOR EN domain/ NI EN ports/
// ---------------------------------------------------------------------------------------------

describe('QC-109 R14 — el dominio no conoce a la libreria de IA ni a ningun adaptador', () => {
  it('R14: ningun archivo de domain/ ni de ports/ del modulo nombra al proveedor ni a un adaptador', () => {
    const candidatos = versionadosBajo(`${MODULO}/domain`, `${MODULO}/ports`);
    const nuevos = ARCHIVOS_NUEVOS.filter((ruta) => ruta.endsWith('.ts') && !ruta.includes('/adapters/')).map(
      (ruta) => ({ ruta, fuente: enDisco(ruta) }),
    );
    const todos = [...candidatos, ...nuevos.filter((n) => !candidatos.some((c) => c.ruta === n.ruta))];

    expect(
      todos.length,
      'R14: no se ha leido ningun archivo de domain/ ni de ports/: este caso pasaria en verde sin ' +
        'mirar nada.',
    ).toBeGreaterThan(0);
    expect(
      todos.some(({ ruta }) => ruta === `${MODULO}/domain/process-pdf-by-strategy.ts`),
      'R14: el caso de uso de esta ficha no esta entre los archivos medidos.',
    ).toBe(true);

    const infracciones = infraccionesDeProveedor(todos);
    expect(
      infracciones,
      'R14: la capacidad se resuelve en el dominio contra los puertos existentes; la libreria que ' +
        `habla con el proveedor vive en el adaptador y el dominio no la nombra:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R14: el detector muerde con el nombre del proveedor y con una ruta de adaptador', () => {
    expect(
      infraccionesDeProveedor([
        { ruta: 'a.ts', fuente: "import { GoogleGenAI } from '@google/genai';\n" },
        { ruta: 'b.ts', fuente: '// el modelo Gemini responde en JSON\n' },
        { ruta: 'c.ts', fuente: "import { x } from '../adapters/driven/ai/ai-reader-genai';\n" },
        { ruta: 'd.ts', fuente: "import type { AiReader } from '../ports/ai-reader';\n" },
      ]).sort(),
    ).toEqual([
      "a.ts: nombra '@google/genai'",
      "a.ts: nombra 'genai'",
      "b.ts: nombra 'gemini'",
      "c.ts: nombra 'adapters/'",
      "c.ts: nombra 'genai'",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R15 — TODO EN INGLES SALVO LOS DOS LITERALES DEL ENUM
// ---------------------------------------------------------------------------------------------

describe('QC-109 R15 — los identificadores publicos estan en ingles', () => {
  it('R15: los simbolos y campos que introduce la ficha son los nombres ingleses esperados, y solo los literales del enum no lo son', () => {
    const nuevos = archivosNuevosLeidos().filter(({ ruta }) => ruta.endsWith('.ts'));
    const exportados = [...new Set(nuevos.flatMap(({ fuente }) => exportadosDe(fuente)))].sort();

    expect(exportados).toEqual(
      [
        'MODE_BY_STRATEGY',
        'StrategyPrompt',
        'PdfStrategy',
        'ProcessPdfByStrategyDeps',
        'ProcessPdfByStrategyInput',
        'StrategyRunLog',
        'StrategyRunResult',
        'StrategyRunSummary',
        'createProcessPdfByStrategy',
        'createStrategyRunLogConsole',
        'readStrategyPromptFromEnv',
        'pdfStrategySchema',
      ].sort(),
    );

    const campos = [...new Set(nuevos.flatMap(({ fuente }) => camposDe(fuente)))];
    expect(campos, 'R15: no se ha extraido ningun campo, el caso no comprobaria nada.').not.toEqual([]);
    expect(campos).toEqual(expect.arrayContaining(['strategy', 'mode', 'path', 'pages', 'textLength']));

    const sospechosos = identificadoresNoIngleses([...exportados, ...campos]);
    expect(
      sospechosos,
      `R15: todo identificador publico de esta ficha va en ingles. No ingleses:\n${sospechosos.join('\n')}`,
    ).toEqual([]);

    // La unica excepcion que `[D1]` autoriza: los dos VALORES del enum, que son nombres del negocio.
    expect(pdfStrategySchema.options.map((opcion) => opcion.value).sort()).toEqual([
      'catalogo',
      'formula',
    ]);
  });

  it('R15: el detector de castellano muerde con un nombre en espanol y no con uno ingles', () => {
    expect(identificadoresNoIngleses(['createStrategyRunLog', 'longitudDelTexto', 'paginas'])).toEqual([
      'longitudDelTexto',
      'paginas',
    ]);
    expect(identificadoresNoIngleses(['textLength', 'pages', 'strategy'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R16 — NI UNA DEPENDENCIA NUEVA
// ---------------------------------------------------------------------------------------------

describe('QC-109 R16 — sin dependencias nuevas y sin tocar el build', () => {
  it('R16: los archivos nuevos solo importan zod, codigo del propio modulo y el catalogo de errores', () => {
    const infracciones = infraccionesDeImport(archivosNuevosLeidos());
    expect(
      infracciones,
      'R16: una dependencia nueva no entra sin los cuatro checks, aprobacion humana y su fila en ' +
        `docs/dependencias.md. Imports de fuera del perimetro:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R16: el detector muerde con una libreria de fuera y no con zod, el catalogo de errores ni un relativo', () => {
    expect(
      infraccionesDeImport([
        { ruta: 'a.ts', fuente: "import dayjs from 'dayjs';\n" },
        { ruta: 'b.ts', fuente: "import { z } from 'zod';\n" },
        { ruta: 'c.ts', fuente: "import type { ErrorCode } from '@/lib/modules/errores';\n" },
        { ruta: 'd.ts', fuente: "import { MODE_BY_STRATEGY } from './pdf-strategy';\n" },
        { ruta: 'e.ts', fuente: "import { x } from '@/lib/modules/identity';\n" },
      ]).sort(),
    ).toEqual(["a.ts: importa 'dayjs'", "e.ts: importa '@/lib/modules/identity'"]);
  });

  it('R16: el diff de la rama no toca package.json, pnpm-lock.yaml, tsconfig.json ni next.config', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeBuild(archivos);
    expect(
      infracciones,
      'R16: @google/genai ya entro con QC-108 y esta ficha no necesita ninguna libreria mas; ' +
        'resolveJsonModule ya estaba activo, asi que tampoco hay build que tocar:\n' +
        infracciones.join('\n'),
    ).toEqual([]);
  });

  it('R16: el detector de build muerde con los cuatro y no con parecidos', () => {
    expect(
      infraccionesDeBuild([
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.json',
        'next.config.ts',
        'lib/modules/documentos/domain/prompts/catalogo.json',
        'docs/dependencias.md',
        'scripts/package-check.mjs',
      ]),
    ).toEqual(['next.config.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']);
  });
});

// ---------------------------------------------------------------------------------------------
// R17 — SIN E2E, CON MOTIVO
// ---------------------------------------------------------------------------------------------

describe('QC-109 R17 — la ficha no anade ninguna especificacion en e2e/', () => {
  it('R17: el diff de la rama no trae ningun archivo bajo e2e/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeE2e(archivos);
    expect(
      infracciones,
      'R17: no hay pantalla ni recorrido de usuario que ejercitar —esta capacidad no la invoca nadie ' +
        `todavia— y el E2E de la cadena lo pone QC-107. Archivos del diff bajo e2e/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R17: el detector muerde con un spec de e2e y no con lo que solo se le parece', () => {
    expect(
      infraccionesDeE2e([
        'e2e/documentos.spec.ts',
        'e2e/helpers/login.ts',
        'tests/unit/documentos/qc109-alcance.test.ts',
        'docs/e2e.md',
        'e2ex/otro.ts',
      ]),
    ).toEqual(['e2e/documentos.spec.ts', 'e2e/helpers/login.ts']);
  });
});
