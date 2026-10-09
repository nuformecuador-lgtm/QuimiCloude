// QC-45 T9 — Guardias de convencion de la pantalla de presentaciones.
//
// Cubre **R2, R29, R30, R31, R32 y R35** (`specs/QC-45-pantalla-de-presentaciones/tasks.md > T9`).
//
// **Que hace este archivo y que NO.** La feature ya tiene dos guardias hermanas y este archivo no
// las reescribe: extiende lo que ellas miran y cierra lo que ninguna otra mira. Reparto explicito,
// para que nadie lo duplique manana:
//
// | Comprobacion                                              | Donde vive                          |
// | --------------------------------------------------------- | ----------------------------------- |
// | la constante de ruta existe, prefijo privado y fila rol     | `presentations-route-contract.test` |
// | `components/shared/data-table/` y `components/ui/` sin tocar| `data-table-intacta.test.ts`        |
// | carpeta `components/`, barrel y ausencia de imports profundos| AQUI (R29)                         |
// | literal de la URL en TODOS los archivos de la ruta          | AQUI (R2)                           |
// | `fetch` a ruta propia, route handlers, actions por su ruta   | AQUI (R30)                          |
// | cliente que importa composicion o el cliente de base de datos| AQUI (R32)                         |
// | `package.json` sin entradas nuevas y `components/ui/` intacta| AQUI, sobre el DIFF (R31)          |
// | los `getBy*` de la carpeta no afirman sobre copy             | AQUI (R35)                          |
//
// **Todo detector es una funcion PURA que ademas se ejercita contra una fuente sintetica con la
// violacion dentro.** Una guardia que solo se prueba contra el arbol real, que hoy esta limpio,
// pasa igual de verde si el detector esta roto: el caso negativo es lo unico que demuestra que
// muerde.
//
// **Si el rango git no esta disponible, las comprobaciones que dependen de el FALLAN
// RUIDOSAMENTE**, nunca se saltan (misma leccion que `data-table-intacta.test.ts` y que
// `tests/baseline-rojos.json`): una guardia que se auto-desactiva cuando no puede mirar es
// indistinguible de una guardia rota.
//
// **Los casos de R31 llevan ademas una PRECONDICION DE RAMA** (2026-09-12): solo miden si el rango
// es el de QC-45. El porque, con el caso que lo destapo, en el comentario de `esLaRamaDeQC45`. No
// es lo mismo que auto-desactivarse por no poder mirar: aqui se puede mirar, pero lo que se ve es
// el diff de OTRA ficha, sobre el que R31 no dice nada. Lo que no depende del rango —R2, R29, R30,
// R32, R35 y todos los casos negativos de los detectores— corre siempre.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La carpeta de la ruta, DERIVADA de la constante (R2): nunca escrita a mano. */
const CARPETA_DE_LA_RUTA = `app/(private)${PRESENTATIONS_ROUTE}`;

/** La carpeta donde R29 obliga a que vivan los componentes propios de la ruta. */
const CARPETA_DE_COMPONENTES = `${CARPETA_DE_LA_RUTA}/components`;

/** El barrel por el que TODO consumidor externo debe entrar (R29). */
const BARREL_DE_LA_RUTA = `@/${CARPETA_DE_COMPONENTES}`;

/** Carpetas del repo que se barren buscando importes por ruta profunda (R29). */
const CARPETAS_DEL_REPO = ['app', 'components', 'lib', 'tests'] as const;

/** La carpeta de tests de esta pantalla, sobre la que va R35. */
const CARPETA_DE_TESTS = 'tests/unit/configuracion-ui';

/**
 * Lo unico que el App Router admite suelto en la raiz de la ruta (R29). Cualquier otro archivo
 * ahi seria un componente propio fuera de `components/`.
 */
const ARCHIVOS_DEL_APP_ROUTER = [
  'page.tsx',
  'layout.tsx',
  'template.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'default.tsx',
] as const;

/** Las cuatro Server Actions del catalogo de presentacion (R30). */
const RUTA_DE_LAS_ACCIONES = '@/lib/modules/inventario/adapters/driving/presentation-actions';

const ACCIONES = [
  'listPresentationsAction',
  'createPresentationAction',
  'updatePresentationAction',
  'deletePresentationAction',
] as const;

/** Barrel del modulo: por aqui salen contratos y tipos, JAMAS una Server Action (R30). */
const BARREL_DEL_MODULO = '@/lib/modules/inventario';

/** Rutas que R31 declara intocables para esta feature. */
const INTOCABLES = {
  primitivas: 'components/ui/',
  manifiesto: 'package.json',
} as const;

/** El rango contra el que se compara el diff. `dev` es la rama de la que sale el worktree. */
const RANGO = 'dev...HEAD';

// --------------------------------------------------------------------------------------------
// Utilidades de lectura
// --------------------------------------------------------------------------------------------

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Ruta comparable en Windows y en POSIX. */
function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * Fuente sin comentarios: las guardias miran **codigo**, no prosa. Sin esto, la propia cabecera
 * de un archivo —que cita el literal que la guardia prohibe para explicar por que lo prohibe—
 * pondria la guardia roja, y el remedio seria dejar de documentar.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Todas las fuentes `.ts`/`.tsx` bajo `carpeta`, recursivo, en rutas relativas a la raiz. */
function fuentesBajo(carpeta: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(aPosix(relative(RAIZ, completa)));
      }
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontradas.sort();
}

/** TODAS las fuentes de la ruta: `page.tsx`, el barrel y los ocho componentes. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_DE_LA_RUTA);

/** Los componentes, sin el barrel: es de ellos de quien el barrel tiene que ser puerta. */
const COMPONENTES = FUENTES_DE_LA_RUTA.filter(
  (ruta) => ruta.startsWith(`${CARPETA_DE_COMPONENTES}/`) && !ruta.endsWith('/index.ts'),
);

/** Las que declaran frontera de cliente: R32 va sobre estas. */
const CLIENTES_DE_LA_RUTA = FUENTES_DE_LA_RUTA.filter((ruta) =>
  /^\s*['"]use client['"]/m.test(leer(ruta)),
);

/**
 * Los tests de la pantalla, sobre los que va R35.
 *
 * **Este mismo archivo queda fuera del barrido, y no es una excepcion de conveniencia**: sus
 * casos negativos son fuentes SINTETICAS —cadenas que contienen justo la violacion que el
 * detector tiene que ver—, no consultas que se ejecuten contra ningun DOM. Incluirlo obligaria a
 * borrar los casos negativos, que son lo unico que demuestra que la guardia muerde.
 */
const TESTS_DE_LA_PANTALLA = fuentesBajo(CARPETA_DE_TESTS).filter(
  (ruta) => !ruta.endsWith('configuracion-convenciones.test.ts'),
);

// --------------------------------------------------------------------------------------------
// Detectores puros
// --------------------------------------------------------------------------------------------

/**
 * R2 — La URL escrita a mano, en las **tres** formas de escribir una cadena en TypeScript.
 * La tercera —la plantilla— es justo la que usaria quien montara la cadena de consulta a mano en
 * vez de derivarla de `presentationListHref`.
 */
function literalesDeRuta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [`'${PRESENTATIONS_ROUTE}`, `"${PRESENTATIONS_ROUTE}`, `\`${PRESENTATIONS_ROUTE}`].filter(
    (forma) => codigo.includes(forma),
  );
}

/** R29 — Un importe que entra por el archivo concreto en vez de por el barrel de la ruta. */
function importesProfundos(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const escapado = BARREL_DE_LA_RUTA.replace(/[[\]()]/g, (c) => `\\${c}`);
  const profundo = new RegExp(`from\\s+['"]${escapado}/[^'"]+['"]`, 'g');
  return codigo.match(profundo) ?? [];
}

/** Los nombres que un archivo DECLARA y exporta: lo que el barrel tiene que republicar (R29). */
function nombresExportados(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const declaraciones =
    /export\s+(?:async\s+)?(?:const|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g;
  return [...codigo.matchAll(declaraciones)].map((coincidencia) => coincidencia[1]);
}

/**
 * R30 — Una Server Action importada por el **barrel del modulo** en vez de por su ruta exacta.
 * No es cosmetico: el barrel arrastra el contrato entero, y con el el servicio, a cualquier
 * modulo de cliente que lo importe.
 */
function accionesPorElBarrel(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const desdeElBarrel = new RegExp(
    `import\\s*{([^}]*)}\\s*from\\s*['"]${BARREL_DEL_MODULO}['"]`,
    'g',
  );

  const encontradas: string[] = [];
  for (const coincidencia of codigo.matchAll(desdeElBarrel)) {
    for (const nombre of ACCIONES) {
      if (new RegExp(`\\b${nombre}\\b`).test(coincidencia[1])) {
        encontradas.push(`${nombre} <- ${BARREL_DEL_MODULO}`);
      }
    }
  }
  return encontradas;
}

/**
 * R30 — Una Server Action **usada** sin haberla importado por su ruta exacta. Es la otra mitad:
 * `accionesPorElBarrel` ve el importe malo; esto ve el nombre usado sin el importe bueno, que es
 * como se colaria un `require`, un re-export intermedio o un barrel propio.
 */
function accionesSinRutaExacta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const porLaRutaExacta = new RegExp(
    `from\\s*['"]${RUTA_DE_LAS_ACCIONES.replace(/\//g, '\\/')}['"]`,
  ).test(codigo);
  if (porLaRutaExacta) return [];

  return ACCIONES.filter((nombre) => new RegExp(`\\b${nombre}\\b`).test(codigo)).map(
    (nombre) => `${nombre} sin importe desde ${RUTA_DE_LAS_ACCIONES}`,
  );
}

/**
 * R30 — `fetch` contra una ruta del propio origen. Toda lectura y toda escritura pasan por Server
 * Actions, asi que ningun `fetch` a una ruta propia —absoluta o relativa, cuelgue o no de
 * `/api`— es legitimo aqui. Un origen externo NO se prohibe: convertir esto en «ningun fetch
 * jamas» seria vigilar otra cosa.
 */
function fetchAPropia(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [/fetch\(\s*['"`]\//, /fetch\(\s*['"`]\.{1,2}\//]
    .filter((patron) => patron.test(codigo))
    .map((patron) => patron.source);
}

/** R32 — Lo que un componente de cliente NO puede importar sin arrastrar Prisma al navegador. */
const PROHIBIDO_EN_CLIENTE = [
  '@/lib/composition',
  '@/lib/shared/db',
  '@prisma/client',
  '@/db',
] as const;

function importesProhibidosDeCliente(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return PROHIBIDO_EN_CLIENTE.filter((modulo) =>
    new RegExp(`from\\s*['"]${modulo.replace(/\//g, '\\/')}(['"/])`).test(codigo),
  );
}

/**
 * R35 — Consultas de Testing Library que afirman sobre **copy**.
 *
 * Solo se admiten dos familias: `ByRole` —el rol ARIA es contrato de accesibilidad, no texto de
 * interfaz— y `ByTestId`. Quedan fuera `ByText`, `ByLabelText`, `ByPlaceholderText`, `ByTitle`,
 * `ByAltText` y `ByDisplayValue`: todas identifican por una cadena que la interfaz puede
 * reescribir manana sin que cambie ni un comportamiento.
 *
 * Y dentro de `ByTestId`, el argumento tiene que ser una **constante** (un identificador) o, si
 * es literal, un `data-table*`: esos son los `data-testid` publicos de la tabla compartida, que
 * son contrato de otro componente y no copy de esta pantalla. Que la pantalla los use es, ademas,
 * la prueba de R8: si hubiera escrito su propia tabla, no existirian.
 */
const FAMILIAS_PERMITIDAS = ['Role', 'TestId'] as const;
const PREFIJO_DE_LA_TABLA_COMPARTIDA = 'data-table';

function consultasPorCopy(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const consultas = /\b(?:get|find|query)(?:All)?By([A-Za-z]+)\s*\(\s*([^,)]*)/g;

  const culpables: string[] = [];
  for (const [, familia, argumento] of codigo.matchAll(consultas)) {
    if (!(FAMILIAS_PERMITIDAS as readonly string[]).includes(familia)) {
      culpables.push(`By${familia} identifica por copy`);
      continue;
    }
    if (familia !== 'TestId') continue;

    const crudo = argumento.trim();
    const esLiteral = /^['"`]/.test(crudo);
    if (esLiteral && !crudo.slice(1).startsWith(PREFIJO_DE_LA_TABLA_COMPARTIDA)) {
      culpables.push(`ByTestId con literal ${crudo}`);
    }
  }
  return culpables;
}

// --------------------------------------------------------------------------------------------
// El diff de la feature
// --------------------------------------------------------------------------------------------

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Archivos que esta rama ha tocado respecto de `dev`: los del rango **mas** los del arbol de
 * trabajo, para que la guardia muerda antes incluso de commitear. Lanza —a proposito— si el
 * rango no se puede calcular: quien lea el fallo tiene que enterarse de que la comprobacion no
 * se hizo, no creerse que salio verde.
 */
function archivosTocados(): readonly string[] {
  let delRango: string;
  try {
    delRango = git(`git diff --name-only ${RANGO}`);
  } catch (error) {
    throw new Error(
      `No se pudo calcular el diff \`${RANGO}\`, asi que R31 NO se ha comprobado. Esta guardia ` +
        `falla en vez de pasar en silencio (ver \`tests/baseline-rojos.json\`). Causa: ${String(error)}`,
    );
  }

  const tocados = new Set<string>();
  for (const linea of delRango.split('\n')) {
    const limpia = linea.trim();
    if (limpia.length > 0) tocados.add(aPosix(limpia));
  }

  for (const linea of git('git status --porcelain').split('\n')) {
    if (linea.trim().length === 0) continue;
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }

  return [...tocados].sort();
}

function intocablesTocados(rutas: readonly string[]): string[] {
  return rutas.filter(
    (ruta) => ruta.startsWith(INTOCABLES.primitivas) || ruta === INTOCABLES.manifiesto,
  );
}

/**
 * LA PRECONDICION DE RAMA (anadida el 2026-09-12 desde la rama de QC-85).
 *
 * Los casos de R31 sabian contra QUE comparar (`dev...HEAD` mas el arbol de trabajo) pero no
 * comprobaban QUE RAMA estaban midiendo. Mientras QC-45 vivia en su worktree eso no se notaba;
 * **en cuanto QC-45 se mergeo en `dev`, este archivo empezo a medir CUALQUIER rama con las reglas
 * de alcance de QC-45**. Lo destapo QC-85 (pantalla de grupos de trabajo) el 2026-09-12: su R37
 * autoriza anadir una primitiva por la CLI de shadcn —el unico camino permitido— y el archivo
 * resultante, **`components/ui/tabs.tsx`**, puso en rojo «no toca `package.json` ni
 * `components/ui/`» con `expected [ 'components/ui/tabs.tsx' ] to deeply equal []`. R31 es el
 * alcance de QC-45 y no le aplica a ninguna otra ficha.
 *
 * El agujero no era solo el rojo falso: era tambien el **verde falso**. Una rama ajena que no
 * tocara `components/ui/` ni el manifiesto salia verde aqui, y ese verde decia «he revisado el
 * diff de QC-45 y no anade dependencias» sin haber mirado el diff de QC-45 en absoluto.
 *
 * Es la misma leccion, y la misma cura, que `tests/unit/identity/account-status-scope.test.ts` y
 * `tests/unit/configuracion-ui/data-table-intacta-usuarios.test.ts`. **Se copia su forma a
 * proposito, sin inventar una tercera**: que el repo tenga varias maneras de decir lo mismo es la
 * mitad del problema que se esta arreglando.
 *
 * LA SENAL es CONJUNTIVA: el archivo central de la pantalla **mas** la carpeta de spec de la
 * propia ficha. La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de
 * QC-45 y no aparece jamas en el rango de otra ficha, que trae la SUYA.
 *
 * **Esto ENDURECE la precondicion, no relaja la comprobacion**: en la rama real de QC-45 las dos
 * senales estan presentes y los casos de R31 corren exactamente igual, con la misma lista cerrada
 * de `INTOCABLES` —que no se toca, y a la que no se le anade ninguna excepcion— y las mismas
 * igualdades. Fuera de su rama quedan `skipped`, nunca verdes.
 *
 * Solo la llevan los casos que miden el DIFF o comparan contra `dev` —los tres de R31 que dependen
 * del rango—. Los que afirman sobre el CONTENIDO del arbol (R2, R29, R30, R32, R35) y los casos
 * negativos de los detectores puros no dependen de la rama y corren siempre.
 */
const ARCHIVO_CENTRAL_DE_QC45 = `${CARPETA_DE_LA_RUTA}/page.tsx`;
const CARPETA_SPEC_DE_QC45 = 'specs/QC-45-pantalla-de-presentaciones/';

export function esLaRamaDeQC45(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC45) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC45))
  );
}

/** Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-45. */
function saltarSiNoEsLaRamaDeQC45(ctx: Pick<TestContext, 'skip'>): void {
  const tocados = archivosTocados();

  if (tocados.length === 0) {
    ctx.skip(
      `la rama no toca ningun archivo respecto de \`${RANGO}\`: no hay diff que revisar, asi que ` +
        'este caso NO ha comprobado nada. Ocurre al correr el gate sobre `dev` con el arbol limpio.',
    );
    return;
  }

  if (!esLaRamaDeQC45(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC45 +
        '` y `' +
        CARPETA_SPEC_DE_QC45 +
        '`: esta NO es la rama de QC-45, asi que este caso NO ha comprobado nada. R31 es el ' +
        'alcance de ESA ficha y no le aplica a ninguna otra.',
    );
  }
}

// --------------------------------------------------------------------------------------------
// R29 — Carpeta `components/`, barrel y ninguna ruta profunda
// --------------------------------------------------------------------------------------------

describe('los componentes de la ruta viven en `components/` y salen del barrel (R29)', () => {
  it('en la raiz de la ruta no hay mas que archivos del App Router', () => {
    const enLaRaiz = readdirSync(join(RAIZ, CARPETA_DE_LA_RUTA), { withFileTypes: true })
      .filter((entrada) => entrada.isFile())
      .map((entrada) => entrada.name);

    const sueltos = enLaRaiz.filter(
      (nombre) => !(ARCHIVOS_DEL_APP_ROUTER as readonly string[]).includes(nombre),
    );

    expect(sueltos, `componentes sueltos junto a page.tsx: ${sueltos.join(', ')}`).toEqual([]);
    expect(enLaRaiz, 'la ruta deberia tener su page.tsx').toContain('page.tsx');
  });

  it('el barrel existe, no declara frontera de cliente y republica los nueve componentes', () => {
    const barrel = `${CARPETA_DE_COMPONENTES}/index.ts`;
    expect(existsSync(join(RAIZ, barrel)), 'falta el barrel de la ruta').toBe(true);

    const fuente = leer(barrel);
    expect(
      /^\s*['"]use client['"]/m.test(fuente),
      'el barrel no puede ser frontera cliente/servidor: cada componente la declara',
    ).toBe(false);

    // Ocho: `presentation-unit-select.tsx` vive en `components/shared/` y el barrel lo republica
    // desde alli; el vacio, el error y el esqueleto los pinta la tabla compartida.
    expect(COMPONENTES.length, 'el barrido no encontro los componentes').toBe(8);

    const sinPublicar = COMPONENTES.filter((ruta) => {
      const base = ruta.slice(`${CARPETA_DE_COMPONENTES}/`.length).replace(/\.tsx?$/, '');
      return !sinComentarios(fuente).includes(`'./${base}'`);
    });

    expect(sinPublicar, `componentes que el barrel no republica: ${sinPublicar.join(', ')}`).toEqual(
      [],
    );
  });

  it('el barrel no se deja fuera ningun nombre publico de los componentes', () => {
    const fuente = sinComentarios(leer(`${CARPETA_DE_COMPONENTES}/index.ts`));

    const olvidados = COMPONENTES.flatMap((ruta) =>
      nombresExportados(leer(ruta))
        .filter((nombre) => !new RegExp(`\\b${nombre}\\b`).test(fuente))
        .map((nombre) => `${ruta} exporta ${nombre}, que el barrel no publica`),
    );

    expect(olvidados, olvidados.join(', ')).toEqual([]);
  });

  it('`page.tsx` entra por el barrel y no por ninguna ruta profunda', () => {
    const codigo = sinComentarios(leer(`${CARPETA_DE_LA_RUTA}/page.tsx`));

    expect(codigo).toContain("from './components'");
    expect(codigo, 'la pagina importa por ruta profunda').not.toMatch(
      /from\s+['"]\.\/components\/[^'"]+['"]/,
    );
  });

  it('nadie en el repo importa los componentes de la ruta por ruta profunda', () => {
    const profundos: string[] = [];

    for (const carpeta of CARPETAS_DEL_REPO) {
      for (const archivo of fuentesBajo(carpeta)) {
        // Dentro de la propia ruta los importes son RELATIVOS entre hermanos, que es lo correcto:
        // el barrel existe para los de fuera, y hacer que un componente entre por el barrel de su
        // propia carpeta crearia un ciclo.
        if (archivo.startsWith(`${CARPETA_DE_LA_RUTA}/`)) continue;

        for (const profundo of importesProfundos(leer(archivo))) {
          profundos.push(`${archivo}: ${profundo}`);
        }
      }
    }

    expect(profundos, `importes por ruta profunda: ${profundos.join(', ')}`).toEqual([]);
  });

  it('y la guardia FALLA ante un importe profundo, sin morder al importe por el barrel', () => {
    expect(
      importesProfundos(`import { PresentationTable } from '${BARREL_DE_LA_RUTA}/presentation-table';`),
    ).not.toEqual([]);
    expect(
      importesProfundos(`import { PresentationTable } from '${BARREL_DE_LA_RUTA}';`),
    ).toEqual([]);
    // Leer un archivo por su ruta —lo que hacen varias guardias— no es importarlo.
    expect(
      importesProfundos(`readFileSync('${CARPETA_DE_COMPONENTES}/presentation-form.tsx', 'utf8')`),
    ).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R2 — La URL, en una sola constante
// --------------------------------------------------------------------------------------------

describe('la ruta no escribe su propia URL a mano (R2)', () => {
  it('ningun archivo de la ruta contiene el literal de PRESENTATIONS_ROUTE', () => {
    expect(
      FUENTES_DE_LA_RUTA.length,
      'el barrido no encontro las fuentes de la ruta',
    ).toBeGreaterThan(7);

    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      literalesDeRuta(leer(archivo)).map((forma) => `${archivo} incrusta ${forma}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante las tres formas, sin morder a lo legitimo', () => {
    expect(literalesDeRuta(`router.push('${PRESENTATIONS_ROUTE}');`)).not.toEqual([]);
    expect(literalesDeRuta(`<Link href="${PRESENTATIONS_ROUTE}" />`)).not.toEqual([]);
    expect(
      literalesDeRuta(`const href = \`${PRESENTATIONS_ROUTE}?page=\${page}\`;`),
    ).not.toEqual([]);
    // El nombre de la ruta en un comentario no es codigo, y el id de la tabla no es una URL.
    expect(literalesDeRuta(`// la pantalla vive en ${PRESENTATIONS_ROUTE}`)).toEqual([]);
    expect(literalesDeRuta(`const PRESENTATION_TABLE_ID = 'presentaciones';`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R30 — Todo pasa por las Server Actions del modulo
// --------------------------------------------------------------------------------------------

describe('toda lectura y toda escritura pasan por las Server Actions del modulo (R30)', () => {
  it('ningun archivo de la ruta importa una Server Action desde el barrel del modulo', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      accionesPorElBarrel(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('ninguna Server Action se usa sin importarla por su ruta exacta', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      accionesSinRutaExacta(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('ningun archivo de la ruta hace fetch a una ruta del propio origen', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      fetchAPropia(leer(archivo)).map((patron) => `${archivo}: ${patron}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('la feature no crea ningun route handler', () => {
    const enLaRuta = FUENTES_DE_LA_RUTA.filter((archivo) => /\/route\.tsx?$/.test(archivo));
    expect(enLaRuta, `route handlers en la ruta: ${enLaRuta.join(', ')}`).toEqual([]);
  });

  it('y las guardias FALLAN ante el importe por el barrel y ante el fetch propio', () => {
    const porElBarrel = `import { listPresentationsAction } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(porElBarrel)).not.toEqual([]);
    expect(accionesSinRutaExacta(porElBarrel)).not.toEqual([]);

    // El contrato publico SI sale por el barrel: tipos, esquemas y el catalogo ordenable.
    const soloContrato = `import { PRESENTATION_QUERYABLE, type PresentationView } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(soloContrato)).toEqual([]);
    expect(accionesSinRutaExacta(soloContrato)).toEqual([]);

    const porLaRutaExacta = `import { listPresentationsAction } from '${RUTA_DE_LAS_ACCIONES}';`;
    expect(accionesPorElBarrel(porLaRutaExacta)).toEqual([]);
    expect(accionesSinRutaExacta(porLaRutaExacta)).toEqual([]);

    expect(fetchAPropia(`await fetch('/api/presentaciones');`)).not.toEqual([]);
    expect(fetchAPropia('await fetch(`../presentaciones`);')).not.toEqual([]);
    expect(fetchAPropia(`await fetch('https://ejemplo.test/x');`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R32 — Los componentes de cliente reciben los datos, no los buscan
// --------------------------------------------------------------------------------------------

describe('los componentes de cliente reciben los datos, no los buscan (R32)', () => {
  it('ninguno importa la composicion, Prisma ni el cliente de base de datos', () => {
    expect(
      CLIENTES_DE_LA_RUTA.length,
      'la ruta deberia tener componentes de cliente',
    ).toBeGreaterThan(0);

    const culpables = CLIENTES_DE_LA_RUTA.flatMap((archivo) =>
      importesProhibidosDeCliente(leer(archivo)).map((modulo) => `${archivo} importa ${modulo}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante cada uno de los cuatro importes prohibidos', () => {
    for (const modulo of PROHIBIDO_EN_CLIENTE) {
      expect(
        importesProhibidosDeCliente(`'use client';\nimport { x } from '${modulo}';`),
        `${modulo} deberia detectarse`,
      ).toContain(modulo);
    }
    // Y no muerde al contrato publico del modulo, que si es importable desde cliente.
    expect(importesProhibidosDeCliente(`import { x } from '${BARREL_DEL_MODULO}';`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R31 — Ni una dependencia nueva, ni una primitiva tocada
// --------------------------------------------------------------------------------------------

describe('la feature no anade dependencias ni abre las primitivas (R31)', () => {
  // Que el rango resuelva NO depende de la rama: si no resuelve, la guardia no puede mirar en
  // ninguna rama y tiene que enterarse todo el mundo. Se queda corriendo siempre.
  it(`\`git diff --name-only ${RANGO}\` resuelve; si no, esta guardia falla ruidosamente`, () => {
    expect(() => archivosTocados()).not.toThrow();
  });

  it('el detector muerde: comparando la carpeta de la ruta, el diff NO sale vacio', (ctx) => {
    saltarSiNoEsLaRamaDeQC45(ctx);

    // La no-vacuidad SI depende de la rama: «la feature ha tocado archivos» solo dice algo si la
    // rama es la de QC-45. Acotado a la carpeta de SU ruta, que en la rama de QC-45 cambia
    // siempre, para que «lista vacia» abajo no pueda serlo por vacuidad.
    const deLaRuta = archivosTocados().filter((ruta) =>
      ruta.startsWith(`${CARPETA_DE_LA_RUTA}/`),
    );

    expect(deLaRuta.length, 'la feature ha tocado archivos de su ruta').toBeGreaterThan(0);
  });

  it('no toca `package.json` ni `components/ui/`', (ctx) => {
    saltarSiNoEsLaRamaDeQC45(ctx);

    const prohibidos = intocablesTocados(archivosTocados());

    expect(prohibidos, `la feature toca archivos intocables: ${prohibidos.join(', ')}`).toEqual([]);
  });

  it('y el contenido de `package.json` sigue siendo el de `dev`', (ctx) => {
    saltarSiNoEsLaRamaDeQC45(ctx);

    let enDev: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      enDev = JSON.parse(git(`git show dev:${INTOCABLES.manifiesto}`));
    } catch (error) {
      throw new Error(
        `No se pudo leer \`dev:${INTOCABLES.manifiesto}\`, asi que R31 NO se ha comprobado. ` +
          `Esta guardia falla en vez de pasar en silencio. Causa: ${String(error)}`,
      );
    }

    const aqui = JSON.parse(leer(INTOCABLES.manifiesto)) as typeof enDev;

    expect(aqui.dependencies ?? {}, 'las dependencias no son las de dev').toEqual(
      enDev.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'las de desarrollo no son las de dev').toEqual(
      enDev.devDependencies ?? {},
    );
  });

  it('y la guardia del diff FALLA ante cada intocable, sin morder a lo que la feature si toca', () => {
    expect(intocablesTocados(['components/ui/table.tsx'])).not.toEqual([]);
    expect(intocablesTocados(['package.json'])).not.toEqual([]);

    expect(
      intocablesTocados([
        'lib/shared/routes.ts',
        // Ronda 2 (2026-09-08): antes aqui figuraba `lib/composition/route-role-rules.ts`, que
        // QC-75 BORRO junto con el mecanismo ruta->rol. Su relevo es la navegacion privada: otro
        // archivo HEREDADO que esta feature modifica -le anade la seccion «Configuración» y su
        // item (R33)- y que, como el manifiesto y las primitivas no, SI puede tocarse.
        'lib/shared/navigation/private-nav.ts',
        `${CARPETA_DE_COMPONENTES}/index.ts`,
        `${CARPETA_DE_LA_RUTA}/page.tsx`,
        `${CARPETA_DE_TESTS}/configuracion-convenciones.test.ts`,
      ]),
      'estos cinco son justo lo que la feature construye o amplia',
    ).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R35 — Los tests no afirman sobre copy
// --------------------------------------------------------------------------------------------

describe('los tests de la pantalla identifican por rol, testid o constante (R35)', () => {
  it('ninguna consulta de la carpeta identifica por texto de interfaz', () => {
    expect(
      TESTS_DE_LA_PANTALLA.length,
      'el barrido no encontro los tests de la pantalla',
    ).toBeGreaterThan(5);

    const culpables = TESTS_DE_LA_PANTALLA.flatMap((archivo) =>
      consultasPorCopy(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante las consultas por copy, sin morder a las legitimas', () => {
    expect(consultasPorCopy(`screen.getByText('Guardar')`)).not.toEqual([]);
    expect(consultasPorCopy(`screen.findByLabelText('Nombre')`)).not.toEqual([]);
    expect(consultasPorCopy(`screen.queryByPlaceholderText('Buscar')`)).not.toEqual([]);
    expect(consultasPorCopy(`screen.getByTestId('presentacion-guardar')`)).not.toEqual([]);

    expect(consultasPorCopy(`screen.getByRole('button', { name: editPresentationLabel(x) })`)).toEqual(
      [],
    );
    expect(consultasPorCopy(`screen.getAllByRole('row')`)).toEqual([]);
    expect(consultasPorCopy(`screen.getByTestId(PRESENTATION_LIST_TESTID)`)).toEqual([]);
    expect(consultasPorCopy('screen.getByTestId(`data-table-row-${item.id}`)')).toEqual([]);
  });
});
