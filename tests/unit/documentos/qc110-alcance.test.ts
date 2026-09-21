// Limites de alcance y de FORMA de QC-110, casi todos de ausencia. Los de diff se miden contra la
// base de fusion con `origin/dev` (o `dev`), contando arbol de trabajo y archivos sin seguimiento;
// los de codigo se leen del disco y se analizan con detectores puros, que ademas se prueban aparte
// con una entrada infractora inventada para saber que muerden.
//
// Fuera de su rama, los casos que preguntan a git se saltan: una guardia de «la rama no toca X» ya
// mergeada se pondria roja con el trabajo legitimo de la siguiente. En su rama, no poder calcular la
// base es rojo.
//
// R11 no trae caso propio aqui: `canvas-no-empaquetado.test.ts` ya lo cubre completo, con control
// positivo incluido (`@napi-rs/canvas` en `serverExternalPackages` y citado en
// `pdf-converter-unpdf.ts`), y duplicarlo aqui solo abultaria el archivo sin anadir cobertura.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

function enDisco(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

function existeEnDisco(rutaRelativa: string): boolean {
  try {
    readFileSync(join(repoRoot, rutaRelativa));
    return true;
  } catch {
    return false;
  }
}

/** Todos los archivos bajo un directorio del repo, recorrido a mano (sin depender de git). */
function listarArchivos(directorioAbsoluto: string): string[] {
  const encontrados: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(directorioAbsoluto);
  } catch {
    return encontrados;
  }
  for (const entrada of entradas) {
    const ruta = join(directorioAbsoluto, entrada);
    const info = statSync(ruta);
    if (info.isDirectory()) {
      encontrados.push(...listarArchivos(ruta));
    } else {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

function relativa(rutaAbsoluta: string): string {
  return rutaAbsoluta.replace(repoRoot, '').replace(/\\/g, '/').replace(/^\//, '');
}

// ---------------------------------------------------------------------------------------------
// LA RAMA Y SU DIFF
// ---------------------------------------------------------------------------------------------

export const RAMA_DE_LA_FICHA = 'feature/QC-110-recorte-de-imagenes-del-pdf';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-110-recorte-de-imagenes-del-pdf/';

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
      `git no pudo listar el diff contra ${mergeBase}: esta guardia NO se ha comprobado, y en la ` +
        'rama de la ficha eso es rojo, no un salto.',
    );
  }
  return [...new Set([...lineas(seguidos), ...lineas(sinSeguimiento)])].sort();
}

/**
 * Los archivos NUEVOS de la rama: los que `git diff --name-status` marca `A` (anadidos, con
 * seguimiento) mas los que todavia no tienen seguimiento. Un archivo modificado (`M`) no es nuevo
 * aunque este dentro del diff.
 */
function archivosNuevosDeLaRama(mergeBase: string): readonly string[] {
  const estados = git(['diff', '--name-status', mergeBase]);
  const sinSeguimiento = git(['ls-files', '--others', '--exclude-standard']);
  if (estados === null || sinSeguimiento === null) {
    throw new Error(
      `git no pudo listar el diff contra ${mergeBase}: esta guardia NO se ha comprobado, y en la ` +
        'rama de la ficha eso es rojo, no un salto.',
    );
  }
  const anadidosConSeguimiento = lineas(estados)
    .map((linea) => linea.split(/\s+/))
    .filter(([estado]) => estado === 'A')
    .map(([, ruta]) => ruta)
    .filter((ruta): ruta is string => ruta !== undefined && ruta.length > 0);
  return [...new Set([...anadidosConSeguimiento, ...lineas(sinSeguimiento)])].sort();
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': esta guardia habla de lo que hace ` +
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
    `el diff contra ${mergeBase} no trae nada bajo ${CARPETA_SPEC}: el rango esta mal calculado ` +
      'y este caso pasaria en verde sin haber mirado el cambio de QC-110.',
  ).toBe(true);
  return archivos;
}

/** Los archivos NUEVOS de la rama con su ancla, o `null` si el caso se ha saltado. */
function archivosNuevosOSalto(ctx: { skip: (nota?: string) => void }): readonly string[] | null {
  const mergeBase = baseOSalto(ctx);
  if (mergeBase === null) return null;

  const archivos = archivosNuevosDeLaRama(mergeBase);
  expect(
    archivos.some((archivo) => archivo.startsWith(CARPETA_SPEC)),
    `el diff contra ${mergeBase} no trae nada nuevo bajo ${CARPETA_SPEC}: el rango esta mal ` +
      'calculado y este caso pasaria en verde sin haber mirado el cambio de QC-110.',
  ).toBe(true);
  return archivos;
}

function enLaBase(mergeBase: string, rutaRelativa: string): string | null {
  return git(['show', `${mergeBase}:${rutaRelativa}`]);
}

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA SIN GIT
// ---------------------------------------------------------------------------------------------

describe('QC-110 — la precondicion de rama', () => {
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
// R8 — `sharp` DETRAS DE SU PUERTO, EN UN SOLO ARCHIVO, CABLEADO SOLO EN COMPOSITION
// ---------------------------------------------------------------------------------------------

const ADAPTADOR_DE_SHARP = 'lib/modules/documentos/adapters/driven/image/image-cropper-sharp.ts';
const ADAPTADOR_DE_CROP_STORAGE = 'lib/modules/documentos/adapters/driven/storage/crop-storage-supabase.ts';

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

/** Los archivos, de entre los dados, cuyos especificadores importan exactamente `sharp`. */
export function archivosQueImportanSharp(archivos: readonly { ruta: string; fuente: string }[]): string[] {
  return archivos
    .filter(({ fuente }) => especificadoresDe(fuente).includes('sharp'))
    .map(({ ruta }) => ruta)
    .sort();
}

const EXTENSIONES_DE_CODIGO = new Set(['.ts', '.tsx', '.mjs', '.js']);

/** Todos los archivos de codigo bajo los directorios de produccion y `db/`, con su fuente. */
function archivosDeCodigoDeProduccion(): { ruta: string; fuente: string }[] {
  const directorios = ['lib', 'app', 'components', 'hooks', 'scripts', 'db'];
  const archivos: { ruta: string; fuente: string }[] = [];
  for (const directorio of directorios) {
    for (const rutaAbsoluta of listarArchivos(join(repoRoot, directorio))) {
      const extension = rutaAbsoluta.slice(rutaAbsoluta.lastIndexOf('.'));
      if (!EXTENSIONES_DE_CODIGO.has(extension)) continue;
      archivos.push({ ruta: relativa(rutaAbsoluta), fuente: readFileSync(rutaAbsoluta, 'utf8') });
    }
  }
  return archivos;
}

describe('QC-110 R8 — sharp vive detras de su puerto, en un solo archivo', () => {
  it('R8: en todo lib/, app/, components/, hooks/, scripts/ y db/, sharp se importa en un unico archivo', () => {
    const candidatos = archivosDeCodigoDeProduccion();
    expect(candidatos.length, 'no se ha leido ningun archivo de produccion').toBeGreaterThan(50);

    const infractores = archivosQueImportanSharp(candidatos);
    expect(
      infractores,
      `R8: sharp DEBE aparecer en exactamente un archivo, el adaptador driven del recorte. ` +
        `Archivos que lo importan:\n${infractores.join('\n')}`,
    ).toEqual([ADAPTADOR_DE_SHARP]);
  });

  it('R8: el detector de importadores de sharp muerde con un import inventado y no con un especificador parecido', () => {
    expect(
      archivosQueImportanSharp([
        { ruta: 'a.ts', fuente: "import sharp from 'sharp';\n" },
        { ruta: 'b.ts', fuente: "const sharp = require('sharp');\n" },
        { ruta: 'c.ts', fuente: "import { algo } from 'sharp-utils';\n" },
        { ruta: 'd.ts', fuente: "import { z } from 'zod';\n" },
      ]),
    ).toEqual(['a.ts', 'b.ts']);
  });

  it('R8: domain/ y ports/ del modulo documentos no nombran sharp', () => {
    const candidatos = [
      ...listarArchivos(join(repoRoot, 'lib/modules/documentos/domain')),
      ...listarArchivos(join(repoRoot, 'lib/modules/documentos/ports')),
    ].map((rutaAbsoluta) => ({ ruta: relativa(rutaAbsoluta), fuente: readFileSync(rutaAbsoluta, 'utf8') }));
    expect(candidatos.length, 'no se ha leido ningun archivo de domain/ ni ports/').toBeGreaterThan(0);

    const infractores = archivosQueImportanSharp(candidatos);
    expect(
      infractores,
      'R8: el dominio pide un PUERTO cuando "necesita" sharp; la implementacion va en el adaptador ' +
        `driven, nunca en domain/ ni en ports/. Hallazgos:\n${infractores.join('\n')}`,
    ).toEqual([]);
  });

  it('R8: el cableado puerto -> adaptador de la imagen solo aparece en lib/composition', () => {
    const candidatos = [
      ...archivosDeCodigoDeProduccion().filter(({ ruta }) => !ruta.startsWith('lib/composition')),
    ];
    const infracciones = candidatos.filter(
      ({ ruta, fuente }) =>
        ruta !== ADAPTADOR_DE_SHARP &&
        ruta !== ADAPTADOR_DE_CROP_STORAGE &&
        (fuente.includes('image-cropper-sharp') || fuente.includes('crop-storage-supabase')),
    );
    expect(
      infracciones.map((a) => a.ruta),
      'R8: atar un puerto a su implementacion fuera de lib/composition es exactamente lo que esta ' +
        `regla prohibe. Hallazgos:\n${infracciones.map((a) => a.ruta).join('\n')}`,
    ).toEqual([]);

    const composicion = enDisco('lib/composition/index.ts');
    expect(composicion).toContain('image-cropper-sharp');
    expect(composicion).toContain('crop-storage-supabase');
  });

  it('R8: el detector del cableado muerde con una cita fuera de composition y no con la de dentro', () => {
    const candidatos = [
      { ruta: 'lib/composition/index.ts', fuente: "import { cropImage } from '.../image-cropper-sharp';\n" },
      { ruta: 'lib/modules/otro/adapters/driving/algo.ts', fuente: "import { cropImage } from '.../image-cropper-sharp';\n" },
      { ruta: 'lib/modules/otro/domain/nada.ts', fuente: "export const nada = 1;\n" },
    ];
    const infracciones = candidatos.filter(
      ({ ruta, fuente }) => !ruta.startsWith('lib/composition') && fuente.includes('image-cropper-sharp'),
    );
    expect(infracciones.map((a) => a.ruta)).toEqual(['lib/modules/otro/adapters/driving/algo.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R9 — sharp ES LA UNICA DEPENDENCIA NUEVA, Y SU FILA ESTA APROBADA
// ---------------------------------------------------------------------------------------------

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

describe('QC-110 R9 — sharp es la unica dependencia nueva, y su fila esta aprobada', () => {
  it('R9: la unica dependencia nueva respecto de dev es sharp', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;

    const manifiestoBase = enLaBase(mergeBase, 'package.json');
    if (manifiestoBase === null) {
      throw new Error(`git no pudo leer package.json en ${mergeBase}: R9 NO se ha comprobado.`);
    }
    const enDev = nombresDeDependencias(manifiestoBase);
    const enLaRama = nombresDeDependencias(enDisco('package.json'));
    expect(enDev.length, 'el package.json de la base no declara dependencias').toBeGreaterThan(20);

    const nuevas = dependenciasNuevas(enDev, enLaRama);
    expect(
      nuevas,
      `R9: la fila de docs/dependencias.md y la aprobacion humana de F1.4 cubren solo esta ` +
        `dependencia. Nuevas encontradas: ${nuevas.join(', ')}`,
    ).toEqual(['sharp']);
  });

  it('R9: docs/dependencias.md trae la fila de sharp aprobada', () => {
    const contenido = enDisco('docs/dependencias.md');
    const fila = contenido.split('\n').find((linea) => linea.includes('`sharp`'));
    expect(fila, 'R9: no se encuentra ninguna fila de sharp en docs/dependencias.md').toBeDefined();
    expect(fila).toContain('aprobada');
  });

  it('R9: el detector de dependencias nuevas muerde con una tercera y no con un cambio de version', () => {
    const manifiestoBase = JSON.stringify({
      dependencies: { zod: '^4.4.3' },
      devDependencies: { vitest: '^3.0.0' },
    });
    const conSharp = JSON.stringify({
      dependencies: { zod: '^4.4.3', sharp: '^0.35.4' },
      devDependencies: { vitest: '^3.0.0' },
    });
    expect(dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conSharp))).toEqual([
      'sharp',
    ]);

    const conOtraTambien = conSharp.replace('"sharp":"^0.35.4"', '"sharp":"^0.35.4","otra-lib":"^1.0.0"');
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conOtraTambien)),
    ).toEqual(['otra-lib', 'sharp']);

    const soloOtraVersion = manifiestoBase.replace('"zod":"^4.4.3"', '"zod":"^4.5.0"');
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(soloOtraVersion)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R15 y R20 — SIN TABLA, SIN COLUMNA, SIN MIGRACION: LOS RECORTES VIVEN SOLO EN EL BUCKET
// ---------------------------------------------------------------------------------------------

export function migracionesNuevasEnElDiff(archivos: readonly string[]): string[] {
  return archivos.filter((archivo) => archivo.startsWith('db/migrations/')).sort();
}

describe('QC-110 R15 y R20 — el diff no toca db/ y no trae ninguna migracion nueva', () => {
  it('R15/R20: el diff contra dev no trae ningun archivo bajo db/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;

    const infracciones = archivos.filter((archivo) => archivo.startsWith('db/'));
    expect(
      infracciones,
      'R15: los recortes viven solo en el bucket, sin tabla ni columna ni migracion. ' +
        `Archivos del diff bajo db/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R15/R20: db/schema.prisma en la rama es identico al de la base de fusion', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;

    const esquemaEnBase = enLaBase(mergeBase, 'db/schema.prisma');
    if (esquemaEnBase === null) {
      throw new Error(`git no pudo leer db/schema.prisma en ${mergeBase}: R15 NO se ha comprobado.`);
    }
    expect(enDisco('db/schema.prisma')).toBe(esquemaEnBase);
  });

  it('R15/R20: el detector de migraciones nuevas muerde con una carpeta bajo db/migrations/ y no con un archivo ajeno', () => {
    expect(
      migracionesNuevasEnElDiff([
        'db/migrations/20260921000000_crops/migration.sql',
        'db/migrations/20260921000000_crops/down.sql',
        'lib/modules/documentos/domain/crop-region.ts',
        'db/schema.prisma',
      ]),
    ).toEqual(['db/migrations/20260921000000_crops/down.sql', 'db/migrations/20260921000000_crops/migration.sql']);
  });
});

// ---------------------------------------------------------------------------------------------
// R19 — NINGUN ARCHIVO NUEVO COMPRUEBA PERMISO NI RESUELVE SESION
// ---------------------------------------------------------------------------------------------

export const SIMBOLOS_DE_SESION = [
  'requirePermission',
  'cookies',
  'getSessionUser',
  'getSessionContext',
  'runInRequestScope',
] as const;

// Reescrito aqui (no importado de qc111-alcance.test.ts): cada guardia de alcance de este repo es
// autosuficiente, y asi lo hacen qc109-alcance.test.ts y qc111-alcance.test.ts.
export function infraccionesDeSesion(archivos: readonly { ruta: string; fuente: string }[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const simbolo of SIMBOLOS_DE_SESION) {
      if (fuente.includes(simbolo)) hallazgos.push(`${ruta}: nombra '${simbolo}'`);
    }
  }
  return hallazgos.sort();
}

describe('QC-110 R19 — ningun archivo nuevo comprueba permiso ni resuelve sesion', () => {
  it('R19: ningun archivo .ts nuevo bajo lib/modules/documentos nombra un simbolo de sesion', (ctx) => {
    const nuevos = archivosNuevosOSalto(ctx);
    if (nuevos === null) return;

    const candidatos = nuevos
      .filter((ruta) => ruta.startsWith('lib/modules/documentos/') && ruta.endsWith('.ts'))
      .filter((ruta) => existeEnDisco(ruta))
      .map((ruta) => ({ ruta, fuente: enDisco(ruta) }));
    expect(candidatos.length, 'no se ha leido ningun archivo nuevo de lib/modules/documentos').toBeGreaterThan(0);

    const infracciones = infraccionesDeSesion(candidatos);
    expect(
      infracciones,
      'R19: el paso de recorte corre dentro del trabajo de la cola, donde no hay nadie delante; ' +
        `quien valida es quien encola. Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R19: el detector muerde con cada simbolo de sesion y no con un nombre parecido', () => {
    expect(
      infraccionesDeSesion([
        { ruta: 'a.ts', fuente: "await requirePermission(actor, 'x');\n" },
        { ruta: 'b.ts', fuente: "import { cookies } from 'next/headers';\n" },
        { ruta: 'c.ts', fuente: 'const user = await getSessionUser();\n' },
        { ruta: 'd.ts', fuente: 'const ctx = getSessionContext();\n' },
        { ruta: 'e.ts', fuente: 'runInRequestScope(ctx, fn);\n' },
        { ruta: 'f.ts', fuente: 'const galletas = "nada de sesion por aqui";\n' },
      ]),
    ).toEqual([
      "a.ts: nombra 'requirePermission'",
      "b.ts: nombra 'cookies'",
      "c.ts: nombra 'getSessionUser'",
      "d.ts: nombra 'getSessionContext'",
      "e.ts: nombra 'runInRequestScope'",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R23 — SIN RECORRIDO E2E NUEVO
// ---------------------------------------------------------------------------------------------

export function infraccionesDeEspecE2eNueva(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('e2e/') && a.endsWith('.spec.ts')).sort();
}

describe('QC-110 R23 — la ficha no anade ningun recorrido E2E nuevo', () => {
  it('R23: el diff de la rama no trae ningun .spec.ts nuevo bajo e2e/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeEspecE2eNueva(archivos);
    // El paso de recorte no tiene pantalla: corre dentro del trabajo de la cola, sin nada que un
    // navegador pueda visitar. Un E2E real exigiria URL publica, cuenta de cola y clave del
    // proveedor de IA, con lo que el gate dejaria de correr sin red (R23, `[D15]`).
    expect(
      infracciones,
      `R23: sin pantalla que visitar, el E2E queda diferido. Archivos del diff bajo e2e/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R23: el detector muerde con un .spec.ts nuevo de e2e/ y no con lo que solo se le parece', () => {
    expect(
      infraccionesDeEspecE2eNueva([
        'e2e/documentos-recorte.spec.ts',
        'e2e/helpers/login.ts',
        'tests/unit/documentos/qc110-alcance.test.ts',
        'docs/e2e.md',
      ]),
    ).toEqual(['e2e/documentos-recorte.spec.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R22 — NINGUN TEST NUEVO LLAMA A LA RED NI IMPORTA sharp FUERA DEL TEST DEL ADAPTADOR
// ---------------------------------------------------------------------------------------------

const TEST_DEL_ADAPTADOR_DE_SHARP = 'tests/unit/documentos/image-cropper-sharp.test.ts';

// La funcion global de red, partida en dos trozos: escribirla entera y seguida de un parentesis
// haria que la propia guardia R26 de qc111-alcance.test.ts -que barre TODO tests/unit/documentos/
// sin excluir este archivo- se mordiera la cola al leer su propio texto.
const NOMBRE_DE_FETCH = ['fe', 'tch'].join('');

/**
 * Las dos senales de que un test podria hablar de verdad con la red o con el binario nativo: una
 * llamada a la funcion global de red, o un import/require REAL del especificador `sharp` fuera del
 * test que ejercita el adaptador con un PNG local.
 */
export function infraccionesDeRedOSharp(
  archivos: readonly { ruta: string; fuente: string }[],
): string[] {
  const patronDeLlamada = new RegExp(`\\b${NOMBRE_DE_FETCH}\\s*\\(`);
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    if (patronDeLlamada.test(fuente)) hallazgos.push(`${ruta}: invoca la funcion global de red`);
    if (ruta !== TEST_DEL_ADAPTADOR_DE_SHARP && especificadoresDe(fuente).includes('sharp')) {
      hallazgos.push(`${ruta}: importa 'sharp' fuera del test del adaptador`);
    }
  }
  return hallazgos.sort();
}

describe('QC-110 R22 — ningun test nuevo llama a la red ni importa sharp fuera de su adaptador', () => {
  it('R22: ningun archivo .test.ts nuevo bajo tests/unit/documentos invoca la red ni importa sharp fuera de su adaptador', (ctx) => {
    const nuevos = archivosNuevosOSalto(ctx);
    if (nuevos === null) return;

    // El propio archivo (qc110-alcance.test.ts) menciona 'sharp' como cadena para sus propias
    // afirmaciones (R8, R9); se excluye porque no IMPORTA la libreria, solo la nombra en texto.
    const candidatos = nuevos
      .filter((ruta) => ruta.startsWith('tests/unit/documentos/') && ruta.endsWith('.test.ts'))
      .filter((ruta) => ruta !== 'tests/unit/documentos/qc110-alcance.test.ts')
      .filter((ruta) => existeEnDisco(ruta))
      .map((ruta) => ({ ruta, fuente: enDisco(ruta) }));
    expect(candidatos.length, 'no se ha leido ningun test nuevo de tests/unit/documentos').toBeGreaterThan(0);

    const infracciones = infraccionesDeRedOSharp(candidatos);
    expect(
      infracciones,
      'R22: la IA, el almacenamiento y el recorte se sustituyen por dobles; el gate corre sin red. ' +
        `Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R22: el detector muerde con una llamada a la red y con un import real de sharp fuera de su adaptador; no dentro de el', () => {
    const llamadaInventada = 'await ' + NOMBRE_DE_FETCH + '("/interno");\n';
    expect(infraccionesDeRedOSharp([{ ruta: 'a.test.ts', fuente: llamadaInventada }])).toEqual([
      'a.test.ts: invoca la funcion global de red',
    ]);
    expect(
      infraccionesDeRedOSharp([{ ruta: 'crop-catalog-images.test.ts', fuente: "import sharp from 'sharp';\n" }]),
    ).toEqual(["crop-catalog-images.test.ts: importa 'sharp' fuera del test del adaptador"]);
    expect(
      infraccionesDeRedOSharp([{ ruta: TEST_DEL_ADAPTADOR_DE_SHARP, fuente: "import sharp from 'sharp';\n" }]),
    ).toEqual([]);
  });
});
