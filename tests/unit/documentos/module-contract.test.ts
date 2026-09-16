// Contrato del modulo `documentos` y su frontera.
//
// Vigila el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el comportamiento. Lo que se afirma:
//
//   (a) el modulo tiene `index.ts` en su raiz y solo carpetas `domain/`, `ports/` y `adapters/`;
//   (b) el barril reexporta EXCLUSIVAMENTE de `./domain`: nada de `ports/`, nada de `adapters/`;
//   (c) su cierre TRANSITIVO de imports no arrastra `'use server'`, `@prisma/client`, `next/*` ni
//       ningun SDK de almacenamiento o de conversion — la fuga real llega por un archivo
//       intermedio, no por el barril, y por eso se mira el cierre y no el archivo suelto;
//   (d) `domain/` y `ports/` no importan nada fuera de lo puro y del barril de otro modulo.
//
// La guardia generica ya prohibe parte de esto para CUALQUIER modulo. Aqui se deja escrito como
// requisito de ESTA feature, igual que hicieron los modulos anteriores, en vez de como efecto
// colateral de una guardia que manana podria cambiar de alcance.
//
// Este test no se conecta a la base ni hace red: solo lee archivos.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const MODULO = 'lib/modules/documentos';
const BARRIL = `${MODULO}/index.ts`;

function absOf(relPath: string): string {
  return join(repoRoot, ...relPath.split('/'));
}

function toPosix(file: string): string {
  return file.split(sep).join('/');
}

/**
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. La cabecera de este mismo
 * modulo nombra `'use server'` y `@prisma/client` al explicar que NO los arrastra; un barrido sobre
 * el texto crudo leeria esas advertencias como infracciones.
 *
 * El orden importa: primero los comentarios de LINEA y despues los de BLOQUE. Al reves, un `//` que
 * contenga una apertura de bloque abre un bloque falso que se traga el resto del archivo y el test
 * pasaria en verde sin mirar nada. `[^\n]` en vez de `.` porque en este repo los archivos llevan
 * CRLF y el `.` no casa `\r`.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function extractImportSpecifiers(source: string): readonly string[] {
  const stripped = stripComments(source);
  const patterns = [
    /import\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const specifiers = new Set<string>();
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) specifiers.add(match[1] as string);
  }
  return [...specifiers];
}

/** Solo los especificadores de una reexportacion `export ... from '...'`. */
export function extractExportFromSpecifiers(source: string): readonly string[] {
  return [...stripComments(source).matchAll(/export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  );
}

/** `'use server'` como PRIMERA sentencia no vacia del archivo (la regla real de Next). */
export function hasUseServerDirective(source: string): boolean {
  const first = stripComments(source)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (first === undefined) return false;
  return ["'use server'", '"use server"', "'use server';", '"use server";'].includes(first);
}

/** Especificador -> ruta del repo (POSIX, sin extension), o `null` si es un paquete externo. */
export function resolveSpecifier(fromRelPath: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return posix.normalize(specifier.slice(2));
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(fromRelPath), specifier));
  return null;
}

/** Lee un destino interno probando las extensiones del repo. `null` si no resuelve. */
function leerDelDisco(relBase: string): { relPath: string; content: string } | null {
  for (const candidato of [relBase, `${relBase}.ts`, `${relBase}.tsx`, `${relBase}/index.ts`]) {
    const abs = absOf(candidato);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return { relPath: candidato, content: readFileSync(abs, 'utf8') };
    }
  }
  return null;
}

/** Cierre TRANSITIVO de imports desde un archivo. */
export function collectClosure(
  entryRelPath: string,
  entryContent: string,
): { internos: ReadonlyMap<string, string>; externos: ReadonlySet<string> } {
  const internos = new Map<string, string>();
  const externos = new Set<string>();
  const vistos = new Set<string>([entryRelPath]);
  const pendientes = [{ relPath: entryRelPath, content: entryContent }];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as { relPath: string; content: string };
    for (const specifier of extractImportSpecifiers(actual.content)) {
      const target = resolveSpecifier(actual.relPath, specifier);
      if (target === null) {
        externos.add(specifier);
        continue;
      }
      const resuelto = leerDelDisco(target);
      if (resuelto === null || vistos.has(resuelto.relPath)) continue;
      vistos.add(resuelto.relPath);
      internos.set(resuelto.relPath, resuelto.content);
      pendientes.push(resuelto);
    }
  }
  return { internos, externos };
}

/** Todos los `.ts` del modulo, recursivamente, como rutas relativas en POSIX. */
function fuentesDelModulo(): readonly string[] {
  const salida: string[] = [];
  const recorrer = (absDir: string) => {
    for (const nombre of readdirSync(absDir)) {
      const ruta = join(absDir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (ruta.endsWith('.ts')) salida.push(toPosix(relative(repoRoot, ruta)));
    }
  };
  recorrer(absOf(MODULO));
  return salida.sort();
}

const CARPETAS_PERMITIDAS = ['adapters', 'domain', 'ports'];

/** Paquetes que el contrato no puede arrastrar, ni directa ni transitivamente. */
const EXTERNOS_PROHIBIDOS = /^(next(\/.*)?|react(-dom)?(\/.*)?|@prisma\/client|@supabase\/.*|unpdf|@napi-rs\/.*)$/;

/** Lo unico que `domain/` y `ports/` pueden importar de fuera del modulo. */
const PAQUETES_PUROS = ['zod'];

const entradasDelModulo = readdirSync(absOf(MODULO)).map((name) => ({
  name,
  isDirectory: statSync(join(absOf(MODULO), name)).isDirectory(),
}));
const fuentes = fuentesDelModulo();
const barril = readFileSync(absOf(BARRIL), 'utf8');

describe('documentos — contrato del modulo y frontera', () => {
  describe('(a) forma del modulo (R27)', () => {
    it('R27 — el modulo tiene index.ts en su raiz y ninguna carpeta fuera de domain/ports/adapters', () => {
      expect(entradasDelModulo.length, 'el modulo esta vacio').toBeGreaterThan(0);
      expect(entradasDelModulo.some((e) => e.name === 'index.ts' && !e.isDirectory)).toBe(true);
      const sueltos = entradasDelModulo.filter((e) => !e.isDirectory && e.name !== 'index.ts');
      expect(sueltos.map((e) => e.name)).toEqual([]);
      const carpetas = entradasDelModulo.filter((e) => e.isDirectory).map((e) => e.name);
      expect(carpetas.filter((nombre) => !CARPETAS_PERMITIDAS.includes(nombre))).toEqual([]);
    });

    it('R27 — el modulo no cuelga de recetas ni de proveedores: sus fuentes viven bajo su propia raiz', () => {
      expect(fuentes.length).toBeGreaterThan(0);
      expect(fuentes.every((ruta) => ruta.startsWith(`${MODULO}/`))).toBe(true);
      expect(fuentes).toContain(`${MODULO}/domain/actor.ts`);
      expect(fuentes).toContain(`${MODULO}/ports/document-storage.ts`);
    });
  });

  describe('(b) el barril reexporta SOLO de ./domain (R27)', () => {
    it('R27 — ninguna reexportacion del contrato sale de ports/ ni de adapters/', () => {
      const especificadores = extractExportFromSpecifiers(barril);
      expect(especificadores.length).toBeGreaterThan(0);
      for (const spec of especificadores) {
        const target = resolveSpecifier(BARRIL, spec);
        expect(target, `'${spec}' no resuelve a ningun archivo del repo`).not.toBeNull();
        expect(target as string, `'${spec}' esta fuera de ./domain`).toMatch(
          new RegExp(`^${MODULO}/domain/`),
        );
      }
    });

    it('R27 — el detector dispara: un barril que reexportara el puerto o un adaptador seria un hallazgo', () => {
      // Sin este caso, un `toMatch` mal escrito pasaria en verde sobre cualquier cosa.
      const malo = [
        "export type { DocumentStorage } from './ports/document-storage';",
        "export { subir } from './adapters/driving/document-upload-actions';",
      ].join('\n');
      const fuera = extractExportFromSpecifiers(malo)
        .map((spec) => resolveSpecifier(BARRIL, spec) as string)
        .filter((target) => !target.startsWith(`${MODULO}/domain/`));
      expect(fuera).toEqual([`${MODULO}/ports/document-storage`, `${MODULO}/adapters/driving/document-upload-actions`]);
    });
  });

  describe('(c) el contrato no arrastra servidor ni SDKs (R28)', () => {
    it("R28 — el cierre de imports del barril no trae 'use server', Prisma, next/*, Supabase ni la libreria de conversion", () => {
      expect(hasUseServerDirective(barril)).toBe(false);
      const { internos, externos } = collectClosure(BARRIL, barril);

      // El cierre alcanza de verdad al dominio: si el barril no llegara a ningun archivo, este caso
      // pasaria en verde sin haber mirado nada.
      expect([...internos.keys()]).toContain(`${MODULO}/domain/actor.ts`);

      for (const paquete of externos) {
        expect(EXTERNOS_PROHIBIDOS.test(paquete), `el contrato arrastra '${paquete}'`).toBe(false);
      }
      for (const [relPath, content] of internos) {
        expect(hasUseServerDirective(content), `${relPath} declara 'use server'`).toBe(false);
      }
    });
  });

  describe('(d) pureza de domain/ y ports/ (R28)', () => {
    it('R28 — ningun archivo de domain/ ni de ports/ importa plataforma, SDKs, lib/shared ni la composicion', () => {
      const puros = fuentes.filter(
        (ruta) => ruta.startsWith(`${MODULO}/domain/`) || ruta.startsWith(`${MODULO}/ports/`),
      );
      expect(puros.length).toBeGreaterThan(0);

      const hallazgos: string[] = [];
      for (const relPath of puros) {
        const contenido = readFileSync(absOf(relPath), 'utf8');
        for (const spec of extractImportSpecifiers(contenido)) {
          const target = resolveSpecifier(relPath, spec);
          if (target === null) {
            if (!PAQUETES_PUROS.includes(spec)) hallazgos.push(`${relPath} importa el paquete '${spec}'`);
            continue;
          }
          if (target.startsWith('lib/shared') || target.startsWith('lib/composition')) {
            hallazgos.push(`${relPath} importa '${spec}'`);
            continue;
          }
          if (target.startsWith(`${MODULO}/adapters/`)) {
            hallazgos.push(`${relPath} importa el adaptador '${spec}'`);
            continue;
          }
          // De otro modulo, solo su barril; del propio, solo domain/ y ports/.
          const otroModulo = /^lib\/modules\/([^/]+)/.exec(target)?.[1];
          if (otroModulo !== undefined && otroModulo !== 'documentos') {
            const esBarril = target === `lib/modules/${otroModulo}` || target === `lib/modules/${otroModulo}/index`;
            if (!esBarril) hallazgos.push(`${relPath} importa '${spec}', ruta profunda de otro modulo`);
          }
        }
      }
      expect(hallazgos).toEqual([]);
    });
  });

  describe('lo que el contrato publica (R27, R33)', () => {
    it('R27, R33 — el barril expone el actor, los dos errores, los limites, la ruta y el esquema', async () => {
      const contrato = await import('@/lib/modules/documentos');
      expect(typeof contrato.requirePermission).toBe('function');
      expect(typeof contrato.isPdfContent).toBe('function');
      expect(typeof contrato.buildDocumentPath).toBe('function');
      expect(typeof contrato.isPathInCompany).toBe('function');
      expect(typeof contrato.issueUploadLinksSchema.parse).toBe('function');

      // Los dos errores, con los codigos del catalogo cerrado y ninguno mas.
      expect(new contrato.UnauthorizedError()).toBeInstanceOf(contrato.DocumentosError);
      expect(new contrato.UnauthorizedError().code).toBe('unauthorized');
      expect(new contrato.ValidationError().code).toBe('invalid_input');

      // Y NO sale por aqui el codigo del permiso: lo que sale del modulo es la comprobacion.
      expect('DOCUMENT_UPLOAD_PERMISSION' in contrato).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// El contrato CONGELADO. Bloque NUEVO al final del archivo: no reordena ni reescribe nada de lo de
// arriba, que vigila la FORMA del modulo. Lo que se congela aqui es la LISTA: que el barril exporte
// exactamente lo previsto —ni un simbolo de mas, ni uno de menos— y que su cierre transitivo de
// imports siga sin arrastrar servidor.
//
// «Ni uno de menos» importa tanto como «ni uno de mas»: si alguien retira una constante del
// contrato, quien la consumia se la reescribe en su casa y el modulo pasa a tener dos definiciones
// del mismo numero. «Ni uno de mas» es lo que impide que un puerto o un adaptador se cuelen por la
// puerta grande.
//
// Cada regla se escribe como una FUNCION PURA y se prueba por sus DOS lados: sobre el arbol REAL
// —que tiene que estar limpio— y sobre una lista FABRICADA que la infringe —que tiene que dar
// hallazgo—. Un `toEqual([])` sobre el repo, solo, no demuestra que la regla muerda.
// ---------------------------------------------------------------------------------------------

/** Lo que el contrato publica EN EJECUCION: funciones, clases de error, constantes y el esquema. */
const EXPORTACIONES_DE_EJECUCION = [
  'requirePermission',
  'DocumentosError',
  'UnauthorizedError',
  'ValidationError',
  'MAX_FILES_PER_BATCH',
  'MAX_PDF_BYTES',
  'MAX_PDF_PAGES',
  'PAGE_RENDER_DPI',
  'PROVIDER_UPLOAD_LINK_TTL_SECONDS',
  'READ_LINK_TTL_SECONDS',
  'isPdfContent',
  'buildDocumentPath',
  'isPathInCompany',
  'issueUploadLinksSchema',
  'createIssueUploadLinks',
  'createConvertPdfs',
] as const;

/** Y lo que publica SOLO COMO TIPO: se borra al compilar, asi que no se ve en el objeto importado y
 *  hay que leerlo del fuente del barril. */
const EXPORTACIONES_DE_TIPO = [
  'Actor',
  'IssueUploadLinksDeps',
  'IssuedUploadBatch',
  'IssueUploadLinksInput',
  'ConversionFailure',
  'ConversionResult',
  'ConversionSuccess',
  'ConvertPdfDeps',
  'PdfOutput',
  'PdfToConvert',
] as const;

/** Nombres exportados SOLO como tipo por un barril, leidos del fuente: `export { type X } from ...`
 *  y `export type { X } from ...`. Se mira el codigo sin comentarios, no la prosa. */
export function extractTypeOnlyExportNames(source: string): readonly string[] {
  const nombres = new Set<string>();
  const sinComentarios = stripComments(source);
  for (const bloque of sinComentarios.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from/g)) {
    const bloqueEsDeTipos = bloque[1] !== undefined;
    for (const entrada of (bloque[2] as string).split(',')) {
      const texto = entrada.trim();
      if (texto.length === 0) continue;
      const entradaEsDeTipo = bloqueEsDeTipos || texto.startsWith('type ');
      if (!entradaEsDeTipo) continue;
      const nombre = texto.replace(/^type\s+/, '').split(/\s+as\s+/)[0] as string;
      nombres.add(nombre.trim());
    }
  }
  return [...nombres];
}

/** Sobra / falta contra la lista congelada. */
export function findFrozenListFindings(
  etiqueta: string,
  actuales: readonly string[],
  esperados: readonly string[],
): readonly string[] {
  const hallazgos: string[] = [];
  for (const nombre of actuales) {
    if (!esperados.includes(nombre)) hallazgos.push(`${etiqueta}: '${nombre}' NO estaba previsto`);
  }
  for (const nombre of esperados) {
    if (!actuales.includes(nombre)) hallazgos.push(`${etiqueta}: falta '${nombre}'`);
  }
  return hallazgos.sort();
}

/**
 * Paquetes que el contrato no puede arrastrar en NINGUN punto de su cierre: el framework, el cliente
 * de la base, el SDK del almacenamiento y la libreria de conversion. Los tres ultimos viven —y solo
 * pueden vivir— en los adaptadores driven.
 */
const PAQUETES_DE_SERVIDOR = /^(next(\/.*)?|react(-dom)?(\/.*)?|@prisma\/client|@supabase\/.*|unpdf|@napi-rs\/.*)$/;

/**
 * Los dos paquetes que los casos de abajo necesitan ESCRIBIR dentro de fuentes fabricados, para
 * demostrar que la regla muerde.
 *
 * Van en una constante y se interpolan, en vez de escribirse dentro del `import` de ejemplo, porque
 * otro barrido del modulo exige que cada uno de esos paquetes lo importe un UNICO archivo y recorre
 * tambien `tests/`: un `from '<paquete>'` escrito aqui, aunque sea dentro de una cadena, contaria
 * como un segundo importador y pondria en rojo una regla ajena a este archivo.
 */
const SDK_DE_ALMACENAMIENTO = '@supabase/storage-js';
const LIBRERIA_DE_CONVERSION = 'unpdf';

/**
 * Cierre transitivo de imports con el LECTOR INYECTADO: es lo que permite pasar la misma regla por
 * el arbol real y por un arbol fabricado. La version de arriba lee del disco a secas y por eso no
 * sirve para el caso que tiene que dar rojo.
 */
export function collectClosureWith(
  entryRelPath: string,
  entryContent: string,
  leer: (relBase: string) => { relPath: string; content: string } | null,
): { internos: ReadonlyMap<string, string>; externos: ReadonlySet<string> } {
  const internos = new Map<string, string>();
  const externos = new Set<string>();
  const vistos = new Set<string>([entryRelPath]);
  const pendientes = [{ relPath: entryRelPath, content: entryContent }];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as { relPath: string; content: string };
    for (const specifier of extractImportSpecifiers(actual.content)) {
      const target = resolveSpecifier(actual.relPath, specifier);
      if (target === null) {
        externos.add(specifier);
        continue;
      }
      const resuelto = leer(target);
      if (resuelto === null || vistos.has(resuelto.relPath)) continue;
      vistos.add(resuelto.relPath);
      internos.set(resuelto.relPath, resuelto.content);
      pendientes.push(resuelto);
    }
  }
  return { internos, externos };
}

/** Todo lo que el contrato NO puede arrastrar: servidor, SDKs y cualquier archivo de `adapters/`. */
export function findContractClosureFindings(
  entryRelPath: string,
  entryContent: string,
  leer: (relBase: string) => { relPath: string; content: string } | null,
): readonly string[] {
  const hallazgos: string[] = [];
  if (hasUseServerDirective(entryContent)) hallazgos.push(`${entryRelPath} declara 'use server'`);
  const { internos, externos } = collectClosureWith(entryRelPath, entryContent, leer);
  for (const paquete of externos) {
    if (PAQUETES_DE_SERVIDOR.test(paquete)) hallazgos.push(`el contrato arrastra '${paquete}'`);
  }
  for (const [relPath, content] of internos) {
    if (hasUseServerDirective(content)) {
      hallazgos.push(`el contrato arrastra '${relPath}', que declara 'use server'`);
    }
    if (relPath.startsWith(`${MODULO}/adapters/`)) {
      hallazgos.push(`el contrato arrastra el adaptador '${relPath}'`);
    }
  }
  return hallazgos.sort();
}

/** Lector real del disco: el MISMO que ya usa el cierre de arriba, no una segunda resolucion de
 *  extensiones que pudiera diverger de aquella. */
const lectorDelDisco = leerDelDisco;

describe('documentos — el contrato, congelado (R27, R28)', () => {
  describe('la lista de lo que publica (R27)', () => {
    it('R27 — el barril exporta EXACTAMENTE los simbolos de ejecucion previstos, ni uno mas ni uno menos', async () => {
      const contrato = await import('@/lib/modules/documentos');
      expect(
        findFrozenListFindings('ejecucion', Object.keys(contrato), EXPORTACIONES_DE_EJECUCION),
      ).toEqual([]);
    });

    it('R27 — y EXACTAMENTE los tipos previstos, leidos del fuente del barril', () => {
      expect(
        findFrozenListFindings('tipos', extractTypeOnlyExportNames(barril), EXPORTACIONES_DE_TIPO),
      ).toEqual([]);
      // El lector de tipos ve de verdad algo: si el patron dejara de casar, la comparacion de arriba
      // seguiria en verde solo si ademas la lista esperada estuviera vacia, y no lo esta.
      expect(extractTypeOnlyExportNames(barril).length).toBe(EXPORTACIONES_DE_TIPO.length);
    });

    it('R27 — la regla MUERDE: una lista fabricada con un puerto de mas y una constante de menos da hallazgo', () => {
      const fabricada = [
        ...EXPORTACIONES_DE_EJECUCION.filter((nombre) => nombre !== 'MAX_PDF_PAGES'),
        'DocumentStorage',
        'uploadRecipeImage',
      ];
      expect(findFrozenListFindings('ejecucion', fabricada, EXPORTACIONES_DE_EJECUCION)).toEqual([
        "ejecucion: 'DocumentStorage' NO estaba previsto",
        "ejecucion: 'uploadRecipeImage' NO estaba previsto",
        "ejecucion: falta 'MAX_PDF_PAGES'",
      ]);
      // Y el caso simetrico: la lista correcta no genera ningun hallazgo.
      expect(
        findFrozenListFindings('ejecucion', [...EXPORTACIONES_DE_EJECUCION], EXPORTACIONES_DE_EJECUCION),
      ).toEqual([]);
    });
  });

  describe('el cierre de imports del contrato (R28)', () => {
    it("R28 — el cierre real no arrastra 'use server', Prisma, next/*, el SDK del almacenamiento, la libreria de conversion ni ningun adaptador", () => {
      expect(findContractClosureFindings(BARRIL, barril, lectorDelDisco)).toEqual([]);
      // El cierre alcanza de verdad al dominio: sin esto, un barril que no resolviera nada pasaria
      // en verde sin haber mirado un solo archivo.
      const { internos } = collectClosureWith(BARRIL, barril, lectorDelDisco);
      expect([...internos.keys()]).toContain(`${MODULO}/domain/issue-upload-links.ts`);
      expect([...internos.keys()]).toContain(`${MODULO}/domain/convert-pdf.ts`);
    });

    it('R28 — la Server Action y los adaptadores driven existen en el arbol y NO son alcanzables desde el contrato', () => {
      // Lo que se afirma no es que no existan —existen, y son el trabajo de la ficha— sino que el
      // contrato no llega a ellos.
      const { internos } = collectClosureWith(BARRIL, barril, lectorDelDisco);
      expect(fuentes.some((ruta) => ruta.startsWith(`${MODULO}/adapters/`))).toBe(true);
      expect([...internos.keys()].filter((ruta) => ruta.startsWith(`${MODULO}/adapters/`))).toEqual([]);
    });

    it('R28 — la regla MUERDE: un arbol fabricado que cuelga un adaptador del barril da hallazgo', () => {
      // El barril fabricado esta impecable a simple vista: reexporta un solo simbolo. La fuga esta
      // un salto mas alla, que es la forma que toma de verdad.
      const arbol = new Map<string, string>([
        [BARRIL, "export { issueUploadLinksAction } from './adapters/driving/document-upload-actions';"],
        [
          `${MODULO}/adapters/driving/document-upload-actions.ts`,
          [
            "'use server';",
            `import { createClient } from '${SDK_DE_ALMACENAMIENTO}';`,
            "import { cookies } from 'next/headers';",
            'export async function issueUploadLinksAction() { return createClient(cookies()); }',
          ].join('\n'),
        ],
      ]);
      const leer = (relBase: string): { relPath: string; content: string } | null => {
        for (const candidato of [relBase, `${relBase}.ts`, `${relBase}/index.ts`]) {
          const content = arbol.get(candidato);
          if (content !== undefined) return { relPath: candidato, content };
        }
        return null;
      };

      const hallazgos = findContractClosureFindings(BARRIL, arbol.get(BARRIL) as string, leer);

      expect(hallazgos).toContainEqual(
        `el contrato arrastra el adaptador '${MODULO}/adapters/driving/document-upload-actions.ts'`,
      );
      expect(hallazgos).toContainEqual(
        `el contrato arrastra '${MODULO}/adapters/driving/document-upload-actions.ts', que declara 'use server'`,
      );
      expect(hallazgos).toContainEqual(`el contrato arrastra '${SDK_DE_ALMACENAMIENTO}'`);
      expect(hallazgos).toContainEqual("el contrato arrastra 'next/headers'");
    });

    it("R28 — y muerde tambien con un 'use server' en el propio barril, o con `unpdf` un salto mas alla", () => {
      expect(
        findContractClosureFindings(BARRIL, `'use server';\n${barril}`, lectorDelDisco),
      ).toContainEqual(`${BARRIL} declara 'use server'`);

      // Mutacion sobre el arbol REAL: un solo archivo de dominio sustituido, el barril intacto.
      const objetivo = `${MODULO}/domain/convert-pdf.ts`;
      const lectorMutado = (relBase: string): { relPath: string; content: string } | null => {
        const leido = lectorDelDisco(relBase);
        if (leido === null || leido.relPath !== objetivo) return leido;
        return {
          relPath: leido.relPath,
          content: `import { extractText } from '${LIBRERIA_DE_CONVERSION}';\n${leido.content}`,
        };
      };
      expect(findContractClosureFindings(BARRIL, barril, lectorMutado)).toContainEqual(
        `el contrato arrastra '${LIBRERIA_DE_CONVERSION}'`,
      );
    });
  });
});
