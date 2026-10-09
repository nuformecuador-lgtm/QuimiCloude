// Guardia: los dobles de E2E de cada modulo no se encienden solos y no se eligen a ciegas.
// Vigila una VARIABLE por fila de `VIGILADAS`: hoy la de `documentos` y la de `integraciones`. Cada
// fila dice donde esta escrita su decision.
//
// Dos motivos de rojo por fila, y uno por cada mitad de la decision:
//
//   1. ACTIVACION — ningun archivo versionado que no sea `playwright.config.ts` pone la variable
//      con algo dentro. Si alguien la activara en un `.env.example`, en un script o en un flujo de
//      CI, la aplicacion usaria los dobles sin que nada avisara.
//   2. ELECCION — `lib/composition` no cablea ninguno de los dobles de la fila sin CONSULTAR su
//      variable. Un doble cableado a pelo es el mismo agujero por la otra puerta.
//
// Recorre ARCHIVOS, no el grafo de imports —por eso vive en `tests/guards/`—: ningun grafo
// seleccionaria la configuracion de Playwright ni un `.env.example`. Copia la forma de
// `guard-envio-de-correo.test.ts`: censo en memoria, funciones puras sobre el censo y un caso de
// SENSIBILIDAD por motivo que demuestra que la guardia muerde.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** El UNICO archivo versionado autorizado a ACTIVAR cualquiera de las variables. */
const ACTIVADOR_AUTORIZADO = 'playwright.config.ts';

/** El UNICO archivo que ata puerto -> adaptador, y por tanto el unico que puede elegir un doble. */
const COMPOSICION = 'lib/composition/index.ts';

type Vigilada = {
  /** La variable. Se escribe una sola vez y de aqui salen los patrones. */
  readonly variable: string;
  /** La consulta que tiene que acompanar a toda eleccion de uno de sus dobles. */
  readonly consulta: string;
  /** Sus dobles, sin extension: asi valen para el import con alias `@/`. */
  readonly dobles: readonly string[];
  /** Donde esta escrita la decision, y el requisito que la exige. */
  readonly design: string;
  readonly requisito: string;
  /** Un nombre importable de su primer doble, para el caso de sensibilidad de la eleccion. */
  readonly ejemplo: string;
};

const VIGILADAS: readonly Vigilada[] = [
  {
    variable: 'DOCUMENTS_E2E_DOUBLES',
    consulta: 'documentsE2EDoublesEnabled(',
    dobles: [
      'lib/modules/documentos/adapters/driven/storage/document-storage-memory',
      'lib/modules/documentos/adapters/driven/queue/processing-queue-inline',
      'lib/modules/documentos/adapters/driven/ai/ai-reader-canned',
      'lib/modules/documentos/adapters/driven/storage/crop-storage-memory',
      'lib/modules/documentos/adapters/driven/storage/crop-catalog-memory',
    ],
    design: 'specs/QC-107-componente-de-carga-de-archivos/design.md > 8',
    requisito: 'R20',
    ejemplo: 'documentStorageMemory',
  },
  {
    variable: 'INTEGRATIONS_E2E_DOUBLES',
    consulta: 'integrationsE2EDoublesEnabled(',
    dobles: ['lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned'],
    design: 'specs/QC-237-conexion-whatsapp-por-empresa/design.md > 9',
    requisito: 'R41',
    ejemplo: 'whatsappGraphClientCanned',
  },
];

/** Carpetas que nunca se recorren: no son fuente versionada del repo. */
const CARPETAS_IGNORADAS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.worktrees',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);

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

/** Todo el fuente versionado del repo, en rutas relativas a la raiz y con `/` siempre. */
function fuentesDelRepo(): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string, raiz: boolean) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue;
        if (raiz && CARPETAS_FUERA_DEL_CENSO.has(entrada.name)) continue;
        recorrer(completa, false);
        continue;
      }
      if (esCensable(entrada.name)) {
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'));
      }
    }
  };

  recorrer(RAIZ, true);
  return encontradas;
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
function patronDeActivacion(variable: string): RegExp {
  return new RegExp(`${variable}\\s*[:=]\\s*['"\`]?[^\\s'"\`,;)}]`);
}

/** Los archivos de un censo cualquiera que ACTIVAN la variable. Puro, para poder alimentarlo a mano. */
function activadoresDe(censo: ReadonlyMap<string, string>, variable: string): string[] {
  const patron = patronDeActivacion(variable);
  return [...censo.entries()]
    .filter(([, fuente]) => patron.test(fuente))
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
 * Las declaraciones que NOMBRAN un doble de la fila sin consultar su variable. La propia linea de
 * `import` no cuenta: importar no es elegir.
 */
function eleccionesSinConsulta(fuente: string, vigilada: Vigilada): string[] {
  const nombres = vigilada.dobles.flatMap((doble) => bindingsDelDoble(fuente, doble));

  return declaracionesDe(fuente)
    .filter((declaracion) => !declaracion.trimStart().startsWith('import '))
    .filter((declaracion) =>
      nombres.some((nombre) => new RegExp(`\\b${nombre}\\b`).test(declaracion)),
    )
    .filter((declaracion) => !declaracion.includes(vigilada.consulta))
    .map((declaracion) => declaracion.trim().split('\n')[0]);
}

it('el recorrido cubre el fuente del repo y no se ha quedado vacio (R20, R41)', () => {
  // Sin esto, un fallo del recorrido dejaria los casos de abajo en verde por vacuidad: la
  // guardia mas peligrosa es la que pasa porque no mira nada.
  expect(
    CENSO.size,
    'el recorrido deberia encontrar cientos de archivos; si encuentra pocos, ya no esta ' +
      'mirando el arbol y la guardia esta pasando en vacio',
  ).toBeGreaterThan(100);

  for (const ruta of [ACTIVADOR_AUTORIZADO, COMPOSICION, '.env.example']) {
    expect(CENSO.has(ruta), `${ruta} no aparece en el recorrido: o se renombro o se borro`).toBe(true);
  }
});

describe.each(VIGILADAS)('guardia: los dobles de E2E de $variable ($design, $requisito)', (vigilada) => {
  const { variable, consulta, dobles, design, requisito, ejemplo } = vigilada;

  it(`cada doble que enumera la fila existe (${requisito})`, () => {
    for (const doble of dobles) {
      expect(
        existsSync(join(RAIZ, `${doble}.ts`)),
        `${doble}.ts lo enumera ${design} y no existe: si el inventario de dobles cambia de ` +
          'verdad, cambia primero el design.md',
      ).toBe(true);
    }
  });

  it(`solo ${ACTIVADOR_AUTORIZADO} activa ${variable} (${requisito})`, () => {
    expect(
      activadoresDe(CENSO, variable),
      `${variable} solo puede encenderse desde ${ACTIVADOR_AUTORIZADO} (${design}). ` +
        'Si SOBRA uno: su ausencia significa los adaptadores REALES, asi que encenderla en un ' +
        'archivo versionado deja la aplicacion con los dobles sin que nada avise. Si FALTA: el ' +
        'recorrido de extremo a extremo necesita esa linea en `webServer.env` para correr sin red.',
    ).toEqual([ACTIVADOR_AUTORIZADO]);
  });

  it(`${COMPOSICION} no elige ningun doble sin consultar ${variable} (${requisito})`, () => {
    const fuente = CENSO.get(COMPOSICION) ?? '';

    expect(
      dobles.flatMap((doble) => bindingsDelDoble(fuente, doble)).length,
      `${COMPOSICION} deberia importar los dobles de ${design}; si no importa ninguno, este caso ` +
        'estaria pasando en vacio',
    ).toBeGreaterThanOrEqual(dobles.length);

    expect(
      eleccionesSinConsulta(fuente, vigilada),
      `Toda eleccion de un doble en ${COMPOSICION} tiene que pasar por \`${consulta})\`: un doble ` +
        'cableado a pelo se lleva la aplicacion entera a los dobles sin que ninguna variable lo ' +
        `pida. La bifurcacion es UNA y esta escrita en ${design}.`,
    ).toEqual([]);
  });

  it(`SENSIBILIDAD: activar ${variable} en otro archivo pondria esta guardia en rojo (${requisito})`, () => {
    // Se simula sobre el censo EN MEMORIA: no se escribe ningun archivo en el arbol.
    for (const forma of [`${variable}=1`, `${variable}: '1'`, `process.env.${variable} = 'si'`]) {
      const censoContaminado = new Map(CENSO);
      censoContaminado.set('scripts/arranque-inventado.mjs', forma);

      expect(activadoresDe(censoContaminado, variable), `la forma \`${forma}\` deberia detectarse`).toEqual([
        ACTIVADOR_AUTORIZADO,
        'scripts/arranque-inventado.mjs',
      ]);
    }

    // Y la linea VACIA de `.env.example` no cuenta: declararla no es activarla.
    const censoConLineaVacia = new Map(CENSO);
    censoConLineaVacia.set('otro/.env.example', `${variable}=\n`);
    expect(activadoresDe(censoConLineaVacia, variable)).toEqual([ACTIVADOR_AUTORIZADO]);
  });

  it(`SENSIBILIDAD: elegir un doble sin consultar ${variable} pondria esta guardia en rojo (${requisito})`, () => {
    const aCiegas = [
      `import { ${ejemplo} } from '@/${dobles[0]}';`,
      `const elegido: Puerto = ${ejemplo};`,
    ].join('\n');

    expect(eleccionesSinConsulta(aCiegas, vigilada)).toEqual([`const elegido: Puerto = ${ejemplo};`]);

    const consultando = [
      `import { ${ejemplo} } from '@/${dobles[0]}';`,
      `const elegido: Puerto = ${consulta})`,
      `  ? ${ejemplo}`,
      '  : real;',
    ].join('\n');

    expect(eleccionesSinConsulta(consultando, vigilada)).toEqual([]);
  });

  it(`SENSIBILIDAD: la consulta de OTRA variable no vale como consulta de ${variable} (${requisito})`, () => {
    const otra = VIGILADAS.find((fila) => fila.variable !== variable);
    expect(otra, 'la tabla deberia tener al menos dos filas').toBeTruthy();
    const conLaOtra = [
      `import { ${ejemplo} } from '@/${dobles[0]}';`,
      `const elegido: Puerto = ${otra?.consulta ?? ''})`,
      `  ? ${ejemplo}`,
      '  : real;',
    ].join('\n');

    expect(eleccionesSinConsulta(conLaOtra, vigilada)).toEqual([`const elegido: Puerto = ${otra?.consulta ?? ''})`]);
  });
});
