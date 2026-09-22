// Limites de alcance y de FORMA de QC-111, casi todos de ausencia. Los de diff se miden contra la
// base de fusion con `origin/dev` (o `dev`), contando arbol de trabajo y archivos sin seguimiento;
// los de codigo se leen del disco y se analizan con detectores puros, que ademas se prueban aparte
// con una entrada infractora inventada para saber que muerden.
//
// Fuera de su rama, los casos que preguntan a git se saltan: una guardia de «la rama no toca X» ya
// mergeada se pondria roja con el trabajo legitimo de la siguiente. En su rama, no poder calcular la
// base es rojo.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/modules/errores';

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

/** El codigo sin comentarios de linea ni de bloque: una mencion en un comentario no es una llamada. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ---------------------------------------------------------------------------------------------
// LA RAMA Y SU DIFF
// ---------------------------------------------------------------------------------------------

export const RAMA_DE_LA_FICHA = 'feature/QC-111-procesamiento-de-pdf-en-cola';

/** Ancla anti-vacuidad: la carpeta del spec solo existe en el rango de esta rama. */
const CARPETA_SPEC = 'specs/QC-111-procesamiento-de-pdf-en-cola/';

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
      `git no pudo listar el diff contra ${mergeBase}: R25 y R27 NO se han comprobado, y en la ` +
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R25 y R27 hablan de lo que hace ` +
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
      'y este caso pasaria en verde sin haber mirado el cambio de QC-111.',
  ).toBe(true);
  return archivos;
}

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

// ---------------------------------------------------------------------------------------------
// LA PRECONDICION, PROBADA SIN GIT
// ---------------------------------------------------------------------------------------------

describe('QC-111 — la precondicion de rama', () => {
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
// R7 — LA FIRMA SE VERIFICA ANTES DE INTERPRETAR EL CUERPO
// ---------------------------------------------------------------------------------------------

const RUTA_DEL_WEBHOOK = 'lib/modules/documentos/adapters/driving/document-job-route.ts';

/**
 * La posicion del primer `verify(` frente a la del primer `safeParse(`/`JSON.parse(` en el TEXTO
 * del archivo. `null` si a alguno de los dos no se le encuentra: sin los dos terminos no hay orden
 * que comparar.
 */
export function verificaAntesDeInterpretar(fuente: string): boolean | null {
  const posicionVerify = fuente.indexOf('verify(');
  const posicionParseo = Math.min(
    ...['safeParse(', 'JSON.parse('].map((termino) => {
      const posicion = fuente.indexOf(termino);
      return posicion === -1 ? Infinity : posicion;
    }),
  );
  if (posicionVerify === -1 || !Number.isFinite(posicionParseo)) return null;
  return posicionVerify < posicionParseo;
}

describe('QC-111 R7 — el Route Handler verifica la firma antes de interpretar el cuerpo', () => {
  it('R7: en document-job-route.ts, verify( aparece antes que safeParse(/JSON.parse(', () => {
    const fuente = enDisco(RUTA_DEL_WEBHOOK);
    expect(
      verificaAntesDeInterpretar(fuente),
      'R7: una firma que falla no debe producir ningun otro efecto; si el cuerpo se interpreta ' +
        'antes de comprobar la firma, un mensaje falsificado ya habria sido parseado.',
    ).toBe(true);
  });

  it('R7: el detector muerde con el orden invertido y no con el orden correcto', () => {
    expect(
      verificaAntesDeInterpretar(
        "const candidate = JSON.parse(rawBody);\nconst signed = await x.verify({ rawBody, signature });\n",
      ),
    ).toBe(false);
    expect(
      verificaAntesDeInterpretar(
        "const signed = await x.verify({ rawBody, signature });\nconst candidate = JSON.parse(rawBody);\n",
      ),
    ).toBe(true);
    expect(verificaAntesDeInterpretar('const nada = 1;\n')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// R8 — NI PERMISO, NI COOKIE, NI ACTOR DE SESION EN EL WEBHOOK
// ---------------------------------------------------------------------------------------------

export const SIMBOLOS_DE_SESION = [
  'requirePermission',
  'cookies',
  'getSessionUser',
  'getSessionContext',
  'runInRequestScope',
] as const;

export function infraccionesDeSesion(archivos: readonly { ruta: string; fuente: string }[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const simbolo of SIMBOLOS_DE_SESION) {
      if (fuente.includes(simbolo)) hallazgos.push(`${ruta}: nombra '${simbolo}'`);
    }
  }
  return hallazgos.sort();
}

describe('QC-111 R8 — el Route Handler no comprueba permiso ni resuelve actor de sesion', () => {
  it('R8: ni document-job-route.ts ni app/api/documentos/trabajos/route.ts nombran nada de sesion', () => {
    const archivos = [
      { ruta: RUTA_DEL_WEBHOOK, fuente: enDisco(RUTA_DEL_WEBHOOK) },
      { ruta: 'app/api/documentos/trabajos/route.ts', fuente: enDisco('app/api/documentos/trabajos/route.ts') },
    ];
    const infracciones = infraccionesDeSesion(archivos);
    expect(
      infracciones,
      'R8: no hay usuario delante de este webhook; el unico control de entrada es la firma de R7. ' +
        `Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R8: el detector muerde con cada simbolo de sesion y no con un nombre parecido', () => {
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
// R12 — SIN RECORTE DE IMAGENES (ENMENDADO por QC-110)
// ---------------------------------------------------------------------------------------------
//
// La propia QC-111 dejo escrito `[D7]` que "QC-110 engancha su paso cuando exista". Ese dia
// llego: bajo `lib/modules/documentos/ports/` existen `crop-storage.ts`, `image-cropper.ts` y
// `crop-region-log.ts`, y
// `run-document-job.ts` invoca el recorte cuando la estrategia es `catalogo`. Los dos casos que
// afirmaban esa ausencia se han QUITADO porque dejaron de ser ciertos, no porque el recorte sea
// aceptable en cualquier otro sitio: siguen sin serlo, y eso lo vigila ahora `qc110-alcance.test.ts`.
// Lo que sigue vivo de R12 se conserva: `db/schema.prisma` sigue sin ninguna columna de salida
// para el recorte, que es ademas R15 de QC-110. El detector `nombraRecorte` tampoco se retira:
// cambia de signo, y el caso de abajo demuestra que sigue mordiendo sobre los nombres reales.

export const PALABRAS_DE_RECORTE = ['recorte', 'crop', 'bounding-box', 'boundingbox', 'coordenadas'] as const;

export function nombraRecorte(texto: string): string[] {
  const enMinusculas = texto.toLowerCase();
  return PALABRAS_DE_RECORTE.filter((palabra) => enMinusculas.includes(palabra));
}

describe('QC-111 R12 — enmendado: el recorte de imagenes ya existe (QC-110)', () => {
  it('R12: db/schema.prisma no declara ninguna columna de salida para el recorte', () => {
    const esquema = enDisco('db/schema.prisma');
    expect(
      nombraRecorte(esquema),
      'R12: DocumentFile no tiene ninguna columna de salida para el recorte de imagenes.',
    ).toEqual([]);
  });

  it('R12: el detector muerde con cada palabra de recorte y no con un texto ajeno', () => {
    expect(nombraRecorte('cropBoundingBox.ts')).toEqual(['crop', 'boundingbox']);
    expect(nombraRecorte('el RECORTE de la imagen trae sus COORDENADAS')).toEqual(['recorte', 'coordenadas']);
    expect(nombraRecorte('pdf-converter-unpdf.ts')).toEqual([]);
  });

  it('R12: el detector sigue mordiendo ahora que el recorte existe: los tres puertos nuevos lo nombran', () => {
    const puertos = readdirSync(join(repoRoot, 'lib/modules/documentos/ports'));
    const conRecorte = puertos.filter((nombre) => nombraRecorte(nombre).length > 0).sort();
    expect(
      conRecorte,
      'R12 enmendado: el detector no se desactivo, cambio de signo. Ahora AFIRMA que los puertos ' +
        `del recorte existen y se llaman como se espera. Nombres bajo ports/:\n${puertos.join('\n')}`,
    ).toEqual(['crop-region-log.ts', 'crop-storage.ts', 'image-cropper.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R17 y R19 — CADUCIDAD SIN CRON Y SIN SEGUNDO ROUTE HANDLER
// ---------------------------------------------------------------------------------------------

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

export function rutasDeRouteHandler(archivos: readonly string[]): string[] {
  return archivos.filter((archivo) => archivo.replace(/\\/g, '/').endsWith('/route.ts')).sort();
}

describe('QC-111 R17 y R19 — la caducidad no trae cron ni un segundo Route Handler', () => {
  it('R17/R19: app/api/ contiene exactamente un route.ts en todo el arbol', () => {
    const archivos = listarArchivos(join(repoRoot, 'app/api'));
    const routeHandlers = rutasDeRouteHandler(archivos);
    expect(
      routeHandlers,
      'R19: la caducidad se evalua AL CONSULTAR el estado, sin cron; un segundo route.ts seria un ' +
        `segundo Route Handler con su propio calendario. Encontrados:\n${routeHandlers.join('\n')}`,
    ).toHaveLength(1);
    expect(routeHandlers[0]?.replace(/\\/g, '/')).toContain('app/api/documentos/trabajos/route.ts');
  });

  it('R17/R19: el detector de route.ts muerde con la ruta real y no con un archivo que solo se le parece', () => {
    expect(
      rutasDeRouteHandler([
        '/repo/app/api/documentos/trabajos/route.ts',
        '/repo/app/api/webhooks/storage/route.ts',
        '/repo/app/api/documentos/route.tsx',
        '/repo/lib/modules/documentos/adapters/driving/document-job-route.ts',
      ]),
    ).toEqual(['/repo/app/api/documentos/trabajos/route.ts', '/repo/app/api/webhooks/storage/route.ts']);
  });

  it('R19: no hay ningun vercel.json en la raiz con crons declarados', () => {
    let manifiesto: string | null = null;
    try {
      manifiesto = enDisco('vercel.json');
    } catch {
      manifiesto = null;
    }
    expect(
      manifiesto,
      'R19: la caducidad no monta ningun calendario; un vercel.json con crons seria exactamente eso.',
    ).toBeNull();
  });

  it('R19: ningun archivo nuevo del modulo documentos declara un calendario', () => {
    const archivos = listarArchivos(join(repoRoot, 'lib/modules/documentos'));
    const conCalendario = archivos.filter((archivo) => {
      const contenido = readFileSync(archivo, 'utf8');
      return /\bcrons?\b/i.test(contenido) || /\bschedule\b/i.test(contenido);
    });
    expect(
      conCalendario.map((a) => a.replace(repoRoot, '').replace(/\\/g, '/')),
      'R19: nada en el modulo documentos programa una tarea; la caducidad se evalua al consultar.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R20 — LAS FILAS NO SE BORRAN NUNCA
// ---------------------------------------------------------------------------------------------

const RUTA_DEL_REPOSITORIO = 'lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma.ts';
const TABLAS_SIN_BORRADO = ['document_batches', 'document_files'] as const;

/**
 * Un borrado fisico sobre `document_batches`/`document_files`: `.delete(`, `.deleteMany(` o SQL
 * crudo (`DELETE FROM`/`TRUNCATE`) que mencione a alguna de las dos tablas en la misma linea o en
 * las tres siguientes, que es donde un `$queryRaw`/`Prisma.sql` seguiria nombrandolas.
 */
export function infraccionesDeBorrado(fuente: string): string[] {
  const lineasDelArchivo = fuente.split('\n');
  const hallazgos: string[] = [];
  lineasDelArchivo.forEach((linea, indice) => {
    const esBorradoPrisma = /\.\s*(delete|deleteMany)\s*\(/.test(linea);
    const esBorradoSql = /\bDELETE\s+FROM\b|\bTRUNCATE\b/i.test(linea);
    if (!esBorradoPrisma && !esBorradoSql) return;

    const ventana = lineasDelArchivo.slice(indice, indice + 4).join('\n');
    for (const tabla of TABLAS_SIN_BORRADO) {
      if (ventana.includes(tabla)) {
        hallazgos.push(`linea ${indice + 1}: borrado sobre '${tabla}'`);
      }
    }
  });
  return [...new Set(hallazgos)].sort();
}

describe('QC-111 R20 — ninguna operacion del repositorio Prisma borra fisicamente una fila', () => {
  it('R20: document-batch-repository-prisma.ts no ejecuta delete, deleteMany, DELETE FROM ni TRUNCATE sobre las dos tablas', () => {
    const fuente = enDisco(RUTA_DEL_REPOSITORIO);
    const infracciones = infraccionesDeBorrado(fuente);
    expect(
      infracciones,
      'R20: las filas de tanda y de archivo se conservan sin plazo; la poda es ficha propia el dia ' +
        `que el volumen la justifique. Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R20: el detector muerde con cada forma de borrado y no con un update ni un borrado de otra tabla', () => {
    expect(
      infraccionesDeBorrado('await prisma.documentFile.delete({ where: { id } }); // document_files\n'),
    ).toEqual(["linea 1: borrado sobre 'document_files'"]);
    expect(
      infraccionesDeBorrado(
        'await prisma.documentBatch.deleteMany({\n  where: { companyId },\n}); // document_batches\n',
      ),
    ).toEqual(["linea 1: borrado sobre 'document_batches'"]);
    expect(
      infraccionesDeBorrado('await prisma.$queryRaw(Prisma.sql`DELETE FROM "document_files" WHERE id = ${id}`);\n'),
    ).toEqual(["linea 1: borrado sobre 'document_files'"]);
    expect(
      infraccionesDeBorrado('await prisma.$queryRaw(Prisma.sql`TRUNCATE "document_batches"`);\n'),
    ).toEqual(["linea 1: borrado sobre 'document_batches'"]);
    expect(
      infraccionesDeBorrado('await prisma.documentFile.update({ where: { id }, data: { status: "done" } });\n'),
    ).toEqual([]);
    expect(infraccionesDeBorrado('await prisma.session.delete({ where: { id } }); // sessions\n')).toEqual([]);
  });

  it('R20: DocumentBatch y DocumentFile no declaran deleted_at', () => {
    const esquema = enDisco('db/schema.prisma');
    const bloqueDeBatch = esquema.match(/model DocumentBatch \{[\s\S]*?\n\}/)?.[0] ?? '';
    const bloqueDeFile = esquema.match(/model DocumentFile \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(bloqueDeBatch.length, 'no se ha leido el modelo DocumentBatch').toBeGreaterThan(0);
    expect(bloqueDeFile.length, 'no se ha leido el modelo DocumentFile').toBeGreaterThan(0);
    expect(bloqueDeBatch).not.toContain('deleted_at');
    expect(bloqueDeBatch).not.toContain('deletedAt');
    expect(bloqueDeFile).not.toContain('deleted_at');
    expect(bloqueDeFile).not.toContain('deletedAt');
  });
});

// ---------------------------------------------------------------------------------------------
// R22 — NINGUN CODIGO DE ERROR NUEVO
// ---------------------------------------------------------------------------------------------

describe('QC-111 R22 — ningun codigo de error nuevo sale del modulo', () => {
  it('R22: domain/errors.ts sigue declarando exactamente las cinco clases que ya tenia', () => {
    const fuente = enDisco('lib/modules/documentos/domain/errors.ts');
    const clases = [...fuente.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).sort();
    expect(
      clases,
      `R22: una clase nueva en errors.ts es, casi siempre, un codigo nuevo. Clases encontradas:\n${clases.join('\n')}`,
    ).toEqual(['AiUnavailableError', 'DocumentosError', 'UnauthorizedError', 'UnexpectedError', 'ValidationError']);
  });

  it('R22: failure-kind.ts y run-document-job.ts solo nombran codigos del catalogo cerrado', () => {
    const catalogo = new Set(ERROR_CODES);
    expect(catalogo.size, 'el catalogo de errores se ha leido vacio').toBeGreaterThan(0);

    for (const ruta of ['lib/modules/documentos/domain/failure-kind.ts', 'lib/modules/documentos/domain/run-document-job.ts']) {
      const fuente = enDisco(ruta);
      const literales = [...fuente.matchAll(/'([a-z][a-z_]*)'/g)].map((m) => m[1]!);
      const pareceCodigo = literales.filter((literal) => literal.includes('_') || catalogo.has(literal as never));
      const desconocidos = pareceCodigo.filter((literal) => !catalogo.has(literal as never));
      expect(
        desconocidos,
        `R22: ${ruta} nombra un literal que parece codigo de error y no esta en el catalogo cerrado:\n${desconocidos.join(', ')}`,
      ).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// R24 — MODULO documentos, DOMINIO SIN PLATAFORMA, CABLEADO SOLO EN COMPOSITION
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

export const ESPECIFICADORES_PROHIBIDOS_EN_DOMINIO = ['@upstash/qstash', 'next/', '@prisma/client'] as const;

export function infraccionesDePlataforma(archivos: readonly { ruta: string; fuente: string }[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    for (const especificador of especificadoresDe(fuente)) {
      const prohibido = ESPECIFICADORES_PROHIBIDOS_EN_DOMINIO.some((p) => especificador.startsWith(p));
      if (prohibido) hallazgos.push(`${ruta}: importa '${especificador}'`);
    }
  }
  return hallazgos.sort();
}

/** Todos los .ts versionados bajo un prefijo, con su fuente. */
function versionadosBajo(...prefijos: readonly string[]): readonly { ruta: string; fuente: string }[] {
  const salida = git(['ls-files', ...prefijos]);
  if (salida === null) {
    throw new Error(`git no pudo listar los archivos bajo ${prefijos.join(', ')}: R24 NO se ha comprobado.`);
  }
  return lineas(salida)
    .filter((ruta) => ruta.endsWith('.ts'))
    .map((ruta) => ({ ruta, fuente: enDisco(ruta) }));
}

describe('QC-111 R24 — el dominio y los puertos no conocen la plataforma, y el cableado vive en composition', () => {
  it('R24: domain/ y ports/ de documentos no importan @upstash/qstash, next/* ni @prisma/client', () => {
    const candidatos = versionadosBajo('lib/modules/documentos/domain', 'lib/modules/documentos/ports');
    expect(candidatos.length, 'no se ha leido ningun archivo de domain/ ni de ports/').toBeGreaterThan(0);

    const infracciones = infraccionesDePlataforma(candidatos);
    expect(
      infracciones,
      `R24: el dominio pide un PUERTO cuando "necesita" la plataforma; la implementacion va en un ` +
        `adaptador driven. Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R24: el detector muerde con cada especificador prohibido y no con uno permitido', () => {
    expect(
      infraccionesDePlataforma([
        { ruta: 'a.ts', fuente: "import { Client } from '@upstash/qstash';\n" },
        { ruta: 'b.ts', fuente: "import { cookies } from 'next/headers';\n" },
        { ruta: 'c.ts', fuente: "import { Prisma } from '@prisma/client';\n" },
        { ruta: 'd.ts', fuente: "import { z } from 'zod';\n" },
      ]).sort(),
    ).toEqual(["a.ts: importa '@upstash/qstash'", "b.ts: importa 'next/headers'", "c.ts: importa '@prisma/client'"]);
  });

  it('R24: el cableado puerto -> adaptador de la cola solo aparece en lib/composition', () => {
    const candidatosProhibidos = versionadosBajo(
      'lib/modules/documentos/domain',
      'lib/modules/documentos/ports',
      'app',
    ).filter(({ ruta }) => !ruta.startsWith('lib/composition'));
    const infracciones = candidatosProhibidos.filter(({ fuente }) =>
      /processingQueueQstash|queueSignatureQstash/.test(fuente),
    );
    expect(
      infracciones.map((a) => a.ruta),
      'R24: atar un puerto a su implementacion fuera de lib/composition es exactamente lo que esta regla prohibe.',
    ).toEqual([]);

    const composicion = enDisco('lib/composition/index.ts');
    expect(composicion).toContain('processingQueueQstash');
    expect(composicion).toContain('queueSignatureQstash');
  });
});

// ---------------------------------------------------------------------------------------------
// R25 — @upstash/qstash ES LA UNICA DEPENDENCIA NUEVA
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

describe('QC-111 R25 — @upstash/qstash es la unica dependencia nueva, y @upstash/redis no entra', () => {
  it('R25: la unica dependencia nueva respecto de dev es @upstash/qstash', (ctx) => {
    const mergeBase = baseOSalto(ctx);
    if (mergeBase === null) return;

    const enDev = nombresDeDependencias(enLaBase(mergeBase, 'package.json'));
    const enLaRama = nombresDeDependencias(enDisco('package.json'));
    expect(enDev.length, 'el package.json de la base no declara dependencias').toBeGreaterThan(20);

    const nuevas = dependenciasNuevas(enDev, enLaRama);
    expect(
      nuevas,
      `R25: la fila de docs/dependencias.md y la aprobacion humana de F1.4 cubren solo esta ` +
        `dependencia. Nuevas encontradas: ${nuevas.join(', ')}`,
    ).toEqual(['@upstash/qstash']);
  });

  it('R25: @upstash/redis no esta en package.json', () => {
    expect(nombresDeDependencias(enDisco('package.json'))).not.toContain('@upstash/redis');
  });

  it('R25: docs/dependencias.md trae la fila de @upstash/qstash aprobada', () => {
    const contenido = enDisco('docs/dependencias.md');
    const fila = contenido.split('\n').find((linea) => linea.includes('`@upstash/qstash`'));
    expect(fila, 'R25: no se encuentra ninguna fila de @upstash/qstash en docs/dependencias.md').toBeDefined();
    expect(fila).toContain('aprobada');
  });

  it('R25: el detector de dependencias nuevas muerde con una tercera y no con un cambio de version', () => {
    const manifiestoBase = JSON.stringify({
      dependencies: { zod: '^4.4.3' },
      devDependencies: { vitest: '^3.0.0' },
    });
    const conQstash = JSON.stringify({
      dependencies: { zod: '^4.4.3', '@upstash/qstash': '^2.11.3' },
      devDependencies: { vitest: '^3.0.0' },
    });
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conQstash)),
    ).toEqual(['@upstash/qstash']);

    const conRedisTambien = conQstash.replace(
      '"@upstash/qstash":"^2.11.3"',
      '"@upstash/qstash":"^2.11.3","@upstash/redis":"^1.0.0"',
    );
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(conRedisTambien)),
    ).toEqual(['@upstash/qstash', '@upstash/redis']);

    const soloOtraVersion = manifiestoBase.replace('"zod":"^4.4.3"', '"zod":"^4.5.0"');
    expect(
      dependenciasNuevas(nombresDeDependencias(manifiestoBase), nombresDeDependencias(soloOtraVersion)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R26 — NINGUN TEST DEL MODULO LLAMA A LA RED
// ---------------------------------------------------------------------------------------------

/**
 * Las dos senales de que un test podria hablar de verdad con la red: una llamada a `fetch(`, o un
 * `import`/`require` REAL del especificador `@upstash/qstash` -el que ejecuta el SDK sin doblar-.
 *
 * Un literal `http://`/`https://` NO se mide aparte: los tests de este modulo ya usan dominios de
 * relleno (`https://app.invalido/...`) como valor fijo para un `Request` local o una variable de
 * entorno, nunca para llamar de verdad; medir la cadena sin mas convertiria esa practica legitima
 * en una infraccion. Lo que R26 prohibe es la llamada, y eso lo cubre `fetch(`. Cuando el modulo
 * necesita doblar la libreria lo hace con `vi.mock('@upstash/qstash', ...)`, que es una LLAMADA a
 * `vi.mock`, no un `import`, y por eso `especificadoresDe` no lo confunde con uno.
 */
export function infraccionesDeRed(archivos: readonly { ruta: string; fuente: string }[]): string[] {
  const hallazgos: string[] = [];
  for (const { ruta, fuente } of archivos) {
    const util = sinComentarios(fuente);
    if (/\bfetch\s*\(/.test(util)) hallazgos.push(`${ruta}: llama a fetch(`);
    if (especificadoresDe(util).includes('@upstash/qstash')) {
      hallazgos.push(`${ruta}: importa '@upstash/qstash' fuera de un vi.mock`);
    }
  }
  return hallazgos.sort();
}

describe('QC-111 R26 — ningun test de documentos llama a la red', () => {
  it('R26: ningun archivo de tests/unit/documentos/ llama a fetch( ni importa @upstash/qstash fuera de un vi.mock', () => {
    const directorio = join(repoRoot, 'tests/unit/documentos');
    const archivos = listarArchivos(directorio)
      .filter((ruta) => ruta.endsWith('.test.ts') && !ruta.endsWith('qc111-alcance.test.ts'))
      .map((ruta) => ({ ruta: ruta.replace(repoRoot, '').replace(/\\/g, '/'), fuente: readFileSync(ruta, 'utf8') }));
    expect(archivos.length, 'no se ha leido ningun test de tests/unit/documentos/').toBeGreaterThan(0);

    const infracciones = infraccionesDeRed(archivos);
    expect(
      infracciones,
      'R26: la cola, el almacenamiento y la IA se sustituyen por dobles; el gate corre sin red. ' +
        `Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R26: el detector muerde con fetch( y con un import real fuera de mock; no con un vi.mock, una URL de relleno ni un comentario', () => {
    expect(infraccionesDeRed([{ ruta: 'a.ts', fuente: 'await fetch("/interno");\n' }])).toEqual([
      'a.ts: llama a fetch(',
    ]);
    expect(
      infraccionesDeRed([{ ruta: 'b.ts', fuente: "import { Receiver } from '@upstash/qstash';\n" }]),
    ).toEqual(["b.ts: importa '@upstash/qstash' fuera de un vi.mock"]);
    expect(
      infraccionesDeRed([
        {
          ruta: 'c.ts',
          fuente: "vi.mock('@upstash/qstash', () => ({ Receiver: vi.fn() }));\n",
        },
      ]),
    ).toEqual([]);
    expect(
      infraccionesDeRed([
        { ruta: 'd.ts', fuente: "process.env.QSTASH_TARGET_URL = 'https://app.invalido/x';\n" },
      ]),
    ).toEqual([]);
    expect(
      infraccionesDeRed([{ ruta: 'e.ts', fuente: '// no llamamos a fetch( aqui, es un comentario\n' }]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R27 — SIN RECORRIDO E2E NUEVO
// ---------------------------------------------------------------------------------------------

export function infraccionesDeEspecE2eNueva(archivos: readonly string[]): string[] {
  return archivos.filter((a) => a.startsWith('e2e/') && a.endsWith('.spec.ts')).sort();
}

describe('QC-111 R27 — la ficha no anade ningun recorrido E2E nuevo', () => {
  it('R27: el diff de la rama no trae ningun .spec.ts nuevo bajo e2e/', (ctx) => {
    const archivos = archivosOSalto(ctx);
    if (archivos === null) return;
    const infracciones = infraccionesDeEspecE2eNueva(archivos);
    expect(
      infracciones,
      'R27: no hay ninguna pantalla que un navegador pueda visitar; el recorrido E2E queda diferido ' +
        `a QC-107, con el motivo escrito. Archivos del diff bajo e2e/:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });

  it('R27: el detector muerde con un .spec.ts nuevo de e2e/ y no con lo que solo se le parece', () => {
    expect(
      infraccionesDeEspecE2eNueva([
        'e2e/documentos-cola.spec.ts',
        'e2e/helpers/login.ts',
        'tests/unit/documentos/qc111-alcance.test.ts',
        'docs/e2e.md',
      ]),
    ).toEqual(['e2e/documentos-cola.spec.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R2 — LA ESTRATEGIA ES POR TANDA, NUNCA POR ARCHIVO
// ---------------------------------------------------------------------------------------------

describe('QC-111 R2 — la estrategia vive en la tanda, no en el archivo', () => {
  it('R2: db/schema.prisma declara strategy en DocumentBatch y NO en DocumentFile', () => {
    const esquema = enDisco('db/schema.prisma');
    const bloqueDeBatch = esquema.match(/model DocumentBatch \{[\s\S]*?\n\}/)?.[0] ?? '';
    const bloqueDeFile = esquema.match(/model DocumentFile \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(bloqueDeBatch.length, 'no se ha leido el modelo DocumentBatch').toBeGreaterThan(0);
    expect(bloqueDeFile.length, 'no se ha leido el modelo DocumentFile').toBeGreaterThan(0);

    expect(/\bstrategy\b/.test(bloqueDeBatch)).toBe(true);
    expect(
      /\bstrategy\b/i.test(bloqueDeFile),
      'R2: un archivo con su propia estrategia rompe [D3] -la tanda decide una vez para todos-.',
    ).toBe(false);
  });

  it('R2: ningun tipo nuevo del modulo permite pasar una estrategia por archivo', () => {
    const fuenteDeMensaje = enDisco('lib/modules/documentos/domain/queue-message.ts');
    expect(
      /\bstrategy\b/i.test(fuenteDeMensaje),
      'R2: el mensaje que la cola entrega por archivo no lleva estrategia propia; la lee de la tanda.',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// R1 y R21 — EL ESQUEMA: EMPRESA, RLS FORZADO, down.sql Y FK COMPUESTA
// ---------------------------------------------------------------------------------------------

const CARPETA_DE_LA_MIGRACION = 'db/migrations/20260918130000_document_batches_and_files';

describe('QC-111 R1 y R21 — las dos tablas declaran empresa, RLS forzado y su down.sql', () => {
  it('R1/R21: DocumentBatch y DocumentFile declaran companyId', () => {
    const esquema = enDisco('db/schema.prisma');
    const bloqueDeBatch = esquema.match(/model DocumentBatch \{[\s\S]*?\n\}/)?.[0] ?? '';
    const bloqueDeFile = esquema.match(/model DocumentFile \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(bloqueDeBatch).toMatch(/companyId\s+String\s+@map\("company_id"\)/);
    expect(bloqueDeFile).toMatch(/companyId\s+String\s+@map\("company_id"\)/);
  });

  it('R21: la migracion activa ENABLE y FORCE ROW LEVEL SECURITY para las dos tablas', () => {
    const migracion = enDisco(`${CARPETA_DE_LA_MIGRACION}/migration.sql`);
    for (const tabla of TABLAS_SIN_BORRADO) {
      expect(migracion).toContain(`ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY;`);
      expect(migracion).toContain(`ALTER TABLE "${tabla}" FORCE ROW LEVEL SECURITY;`);
    }
  });

  it('R21: la migracion trae su down.sql', () => {
    const down = enDisco(`${CARPETA_DE_LA_MIGRACION}/down.sql`);
    expect(down.trim().length, 'down.sql se ha leido vacio').toBeGreaterThan(0);
    expect(down).toContain('DROP TABLE "document_files"');
    expect(down).toContain('DROP TABLE "document_batches"');
  });

  it('R1: la FK de document_files hacia su tanda es compuesta, con company_id dentro', () => {
    const migracion = enDisco(`${CARPETA_DE_LA_MIGRACION}/migration.sql`);
    const fkCompuesta = migracion.match(
      /ALTER TABLE "document_files" ADD CONSTRAINT "[^"]+"\s*\n\s*FOREIGN KEY \("batch_id", "company_id"\) REFERENCES "document_batches"\("id", "company_id"\)/,
    );
    expect(
      fkCompuesta,
      'R1: sin la FK compuesta, una fila de document_files podria declarar una empresa distinta de ' +
        'la de su propia tanda.',
    ).not.toBeNull();
  });
});
