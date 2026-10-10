// Guardia: los dobles del modulo `documentos` no se encienden solos y no se eligen a ciegas
// (QC-107 R20, `specs/QC-107-componente-de-carga-de-archivos/design.md > 8`).
//
// Dos motivos de rojo, y uno por cada mitad de la decision:
//
//   1. ACTIVACION — ningun archivo versionado que no sea `playwright.config.ts` pone
//      `DOCUMENTS_E2E_DOUBLES` con algo dentro. Si alguien la activara en un `.env.example`, en un
//      script o en un flujo de CI, la aplicacion guardaria los PDF en un mapa en memoria y leeria
//      con una IA de guion sin que nada avisara.
//   2. ELECCION — `lib/composition` no cablea ninguno de los tres dobles sin CONSULTAR esa
//      variable. Un doble cableado a pelo es el mismo agujero por la otra puerta.
//
// Recorre ARCHIVOS, no el grafo de imports —por eso vive en `tests/guards/`—: ningun grafo
// seleccionaria la configuracion de Playwright ni un `.env.example`. Copia la forma de
// `guard-envio-de-correo.test.ts`: censo en memoria, funciones puras sobre el censo y un caso de
// SENSIBILIDAD por motivo que demuestra que la guardia muerde.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DESIGN = 'specs/QC-107-componente-de-carga-de-archivos/design.md';

/** La variable vigilada. Se escribe una sola vez y de aqui salen los dos patrones. */
const VARIABLE = 'DOCUMENTS_E2E_DOUBLES';

/** El UNICO archivo versionado autorizado a ACTIVARLA (`design.md > 8`). */
const ACTIVADOR_AUTORIZADO = 'playwright.config.ts';

/** El UNICO archivo que ata puerto -> adaptador, y por tanto el unico que puede elegir un doble. */
const COMPOSICION = 'lib/composition/index.ts';

/** Los dobles del modulo `documentos` para el E2E, sin extension: asi valen para el import con alias `@/`. */
const DOBLES = [
  'lib/modules/documentos/adapters/driven/storage/document-storage-memory',
  'lib/modules/documentos/adapters/driven/queue/processing-queue-inline',
  'lib/modules/documentos/adapters/driven/ai/ai-reader-canned',
  'lib/modules/documentos/adapters/driven/storage/crop-storage-memory',
  'lib/modules/documentos/adapters/driven/storage/crop-catalog-memory',
] as const;

/** La consulta que tiene que acompanar a toda eleccion de un doble. */
const CONSULTA = 'documentsE2EDoublesEnabled(';

/**
 * `tests/` y `e2e/` quedan FUERA del censo de activacion a proposito, mismo criterio que
 * `guard-envio-de-correo.test.ts` con su libreria: el test que comprueba la bifurcacion tiene que
 * poder poner la variable en su propio proceso para afirmar que la rama cambia. Lo que no puede
 * existir es un archivo de PRODUCCION, de configuracion o de despliegue que la encienda.
 */
const CARPETAS_FUERA_DEL_CENSO = new Set(['tests', 'e2e']);

/**
 * Extensiones que se miran: codigo, configuracion y plantillas de entorno, que son los sitios desde
 * los que una variable puede llegar a un proceso. La prosa (`.md`) queda fuera: un design.md NOMBRA
 * la variable para explicarla y eso no enciende nada.
 */
const EXTENSIONES = ['.ts', '.tsx', '.mjs', '.cjs', '.js', '.json', '.yml', '.yaml', '.sh'];

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function sinComentarios(fuente: string): string {
  return fuente
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(
        limpia.startsWith('//') ||
        limpia.startsWith('*') ||
        limpia.startsWith('/*') ||
        limpia.startsWith('#')
      );
    })
    .join('\n');
}

function esCensable(nombre: string): boolean {
  return EXTENSIONES.some((extension) => nombre.endsWith(extension)) || nombre === '.env.example';
}

/**
 * Todo el fuente VERSIONABLE del repo, en rutas relativas a la raiz y con `/` siempre: lo que git
 * ya sigue mas lo nuevo que aun no se ha anadido, y nunca lo que `.gitignore` deja fuera. La lista
 * sale de `git ls-files`, no del disco: un archivo local ignorado —`feature_list.json`, la copia
 * del board que puede NOMBRAR la variable en la descripcion de una ficha— no se versiona, no llega
 * a ningun proceso de CI ni de despliegue y no puede encender nada. `-z` separa con NUL: ninguna
 * ruta se entrecomilla ni se parte, tampoco en Windows.
 */
function fuentesDelRepo(): string[] {
  const argumentos = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  const salida = execFileSync('git', argumentos, {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const rutas = new Set(salida.split('\0').filter((ruta) => ruta.length > 0));

  return [...rutas].filter(
    (ruta) =>
      !CARPETAS_FUERA_DEL_CENSO.has(ruta.split('/')[0]) &&
      esCensable(ruta.split('/').at(-1) ?? '') &&
      // Un archivo seguido pero borrado en el arbol de trabajo sigue en el indice: no hay que leer.
      existsSync(join(RAIZ, ruta)),
  );
}

/**
 * El CENSO: ruta -> fuente sin comentarios. Se construye una vez y las comprobaciones trabajan
 * sobre el, lo que permite los casos de SENSIBILIDAD —anadir un archivo ficticio en memoria— sin
 * escribir nada en el arbol.
 */
const CENSO = new Map<string, string>(
  fuentesDelRepo().map((ruta) => [ruta, sinComentarios(leer(ruta))]),
);

/**
 * ACTIVARLA es ponerle un valor con algo dentro: `NOMBRE=valor`, `NOMBRE: 'valor'` o
 * `process.env.NOMBRE = 'valor'`. El nombre tiene que estar a la IZQUIERDA de la asignacion, asi
 * que la linea que lo declara como literal —el `const` del lector de entorno— no cuenta, y la linea
 * vacia y documentada de `.env.example` —el nombre, el signo y fin de linea— tampoco: detras del
 * signo no queda nada.
 */
const PATRON_DE_ACTIVACION = new RegExp(`${VARIABLE}\\s*[:=]\\s*['"\`]?[^\\s'"\`,;)}]`);

/** Los archivos de un censo cualquiera que ACTIVAN la variable. Puro, para poder alimentarlo a mano. */
function activadoresDe(censo: ReadonlyMap<string, string>): string[] {
  return [...censo.entries()]
    .filter(([, fuente]) => PATRON_DE_ACTIVACION.test(fuente))
    .map(([ruta]) => ruta)
    .sort();
}

/** Los nombres que `lib/composition` importa de un doble. Vacio si no lo importa. */
function bindingsDelDoble(fuente: string, doble: string): string[] {
  const importacion = new RegExp(`import\\s*{([^}]*)}\\s*from\\s*['"]@/${doble}['"]`).exec(fuente);
  if (importacion === null) return [];
  return importacion[1]
    .split(',')
    .map((parte) => parte.replace(/^\s*type\s+/, '').split(' as ')[0].trim())
    .filter((nombre) => nombre.length > 0);
}

/**
 * Trocea el fuente en DECLARACIONES de primer nivel: en este archivo cada `import`, cada `const` y
 * cada `function` de columna cero abre una. Es el ambito en el que se mira si una eleccion consulta
 * o no la variable.
 */
function declaracionesDe(fuente: string): string[] {
  return fuente.split(/\n(?=(?:export )?(?:const|let|function) |import )/);
}

/**
 * Las declaraciones que NOMBRAN un doble sin consultar la variable. La propia linea de `import` no
 * cuenta: importar no es elegir.
 */
function eleccionesSinConsulta(fuente: string): string[] {
  const nombres = DOBLES.flatMap((doble) => bindingsDelDoble(fuente, doble));

  return declaracionesDe(fuente)
    .filter((declaracion) => !declaracion.trimStart().startsWith('import '))
    .filter((declaracion) =>
      nombres.some((nombre) => new RegExp(`\\b${nombre}\\b`).test(declaracion)),
    )
    .filter((declaracion) => !declaracion.includes(CONSULTA))
    .map((declaracion) => declaracion.trim().split('\n')[0]);
}

describe(`guardia: los dobles de extremo a extremo de \`documentos\` (${DESIGN} > 8, R20)`, () => {
  it('el recorrido cubre el fuente del repo y no se ha quedado vacio (R20)', () => {
    // Sin esto, un fallo del recorrido dejaria los casos de abajo en verde por vacuidad: la
    // guardia mas peligrosa es la que pasa porque no mira nada.
    expect(
      CENSO.size,
      'el recorrido deberia encontrar cientos de archivos; si encuentra pocos, ya no esta ' +
        'mirando el arbol y la guardia esta pasando en vacio',
    ).toBeGreaterThan(100);

    for (const ruta of [ACTIVADOR_AUTORIZADO, COMPOSICION, '.env.example']) {
      expect(
        CENSO.has(ruta),
        `${ruta} no aparece en el recorrido: o se renombro o se borro`,
      ).toBe(true);
    }

    for (const doble of DOBLES) {
      expect(
        existsSync(join(RAIZ, `${doble}.ts`)),
        `${doble}.ts lo enumera ${DESIGN} > 8 y no existe: si el inventario de dobles cambia de ` +
          'verdad, cambia primero el design.md',
      ).toBe(true);
    }
  });

  it(`solo ${ACTIVADOR_AUTORIZADO} activa ${VARIABLE} (R20)`, () => {
    expect(
      activadoresDe(CENSO),
      `${VARIABLE} solo puede encenderse desde ${ACTIVADOR_AUTORIZADO} (${DESIGN} > 8). ` +
        'Si SOBRA uno: su ausencia significa los adaptadores REALES, asi que encenderla en un ' +
        'archivo versionado deja la aplicacion guardando los PDF en un mapa en memoria y leyendo ' +
        'con una IA de guion sin que nada avise. Si FALTA: el recorrido de extremo a extremo ' +
        'necesita esa linea en `webServer.env` para correr sin red.',
    ).toEqual([ACTIVADOR_AUTORIZADO]);
  });

  it(`${COMPOSICION} no elige ningun doble sin consultar ${VARIABLE} (R20)`, () => {
    const fuente = CENSO.get(COMPOSICION) ?? '';

    expect(
      DOBLES.flatMap((doble) => bindingsDelDoble(fuente, doble)).length,
      `${COMPOSICION} deberia importar los tres dobles de ${DESIGN} > 8; si no importa ninguno, ` +
        'este caso estaria pasando en vacio',
    ).toBeGreaterThanOrEqual(DOBLES.length);

    expect(
      eleccionesSinConsulta(fuente),
      `Toda eleccion de un doble en ${COMPOSICION} tiene que pasar por \`${CONSULTA})\`: un doble ` +
        'cableado a pelo se lleva la aplicacion entera a los dobles sin que ninguna variable lo ' +
        `pida. La bifurcacion es UNA y esta escrita en ${DESIGN} > 8.`,
    ).toEqual([]);
  });

  it(`SENSIBILIDAD: activar ${VARIABLE} en otro archivo pondria esta guardia en rojo (R20)`, () => {
    // Se simula sobre el censo EN MEMORIA: no se escribe ningun archivo en el arbol.
    for (const forma of [`${VARIABLE}=1`, `${VARIABLE}: '1'`, `process.env.${VARIABLE} = 'si'`]) {
      const censoContaminado = new Map(CENSO);
      censoContaminado.set('scripts/arranque-inventado.mjs', forma);

      expect(activadoresDe(censoContaminado), `la forma \`${forma}\` deberia detectarse`).toEqual([
        ACTIVADOR_AUTORIZADO,
        'scripts/arranque-inventado.mjs',
      ]);
    }

    // Y la linea VACIA de `.env.example` no cuenta: declararla no es activarla.
    const censoConLineaVacia = new Map(CENSO);
    censoConLineaVacia.set('otro/.env.example', `${VARIABLE}=\n`);
    expect(activadoresDe(censoConLineaVacia)).toEqual([ACTIVADOR_AUTORIZADO]);
  });

  it('SENSIBILIDAD: elegir un doble sin consultar la variable pondria esta guardia en rojo (R20)', () => {
    const aCiegas = [
      `import { documentStorageMemory } from '@/${DOBLES[0]}';`,
      'const documentStorage: DocumentStorage = documentStorageMemory;',
    ].join('\n');

    expect(eleccionesSinConsulta(aCiegas)).toEqual([
      'const documentStorage: DocumentStorage = documentStorageMemory;',
    ]);

    const consultando = [
      `import { documentStorageMemory } from '@/${DOBLES[0]}';`,
      'const documentStorage: DocumentStorage = documentsE2EDoublesEnabled()',
      '  ? documentStorageMemory',
      '  : documentStorageSupabase;',
    ].join('\n');

    expect(eleccionesSinConsulta(consultando)).toEqual([]);
  });
});
