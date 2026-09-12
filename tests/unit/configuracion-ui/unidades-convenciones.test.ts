// QC-39 T12 — Guardias de convencion de la pantalla de unidades.
//
// Cubre **R8, R15, R30, R43, R44, R45, R46 y R49**
// (`specs/QC-39-pantalla-de-unidades/tasks.md > T12`).
//
// **Que hace este archivo y que NO.** La feature ya tiene guardias hermanas y este archivo no las
// reescribe: extiende lo que ellas miran y cierra lo que ninguna otra mira. Reparto explicito,
// para que nadie lo duplique manana:
//
// | Comprobacion                                                    | Donde vive                          |
// | --------------------------------------------------------------- | ----------------------------------- |
// | la constante de ruta existe, prefijo privado y los dos permisos   | `units-route-contract.test.ts`      |
// | `components/shared/data-table/` y `components/ui/` sin tocar      | `data-table-intacta-unidades.test`  |
// | el modulo `unidades` intacto salvo los seis retoques de R1-R6     | `unidades/modulo-intacto.test.ts`   |
// | carpeta `components/`, barrel y ausencia de imports profundos     | AQUI (R43)                          |
// | literal de la URL en TODOS los archivos de la ruta                | AQUI (R8)                           |
// | `fetch` a ruta propia, route handlers, actions por su ruta exacta | AQUI (R44)                          |
// | cliente que importa composicion, base de datos o el dominio       | AQUI (R46)                          |
// | `package.json` sin entradas nuevas, sobre el DIFF                 | AQUI (R45)                          |
// | la pantalla no repite la comprobacion de «unidad de sistema»      | AQUI (R30)                          |
// | ninguna tabla ni paginacion propias: se usa la compartida         | AQUI (R15)                          |
// | los `getBy*` de la carpeta no afirman sobre copy                  | AQUI (R49)                          |
//
// **Todo detector es una funcion PURA que ademas se ejercita contra una fuente sintetica con la
// violacion dentro.** Una guardia que solo se prueba contra el arbol real, que hoy esta limpio,
// pasa igual de verde si el detector esta roto: el caso negativo es lo unico que demuestra que
// muerde.
//
// **Si el commit base no esta disponible, las comprobaciones que dependen de el FALLAN
// RUIDOSAMENTE**, nunca se saltan: una guardia que se auto-desactiva cuando no puede mirar es
// indistinguible de una guardia rota.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

import { UNITS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La carpeta de la ruta, DERIVADA de la constante (R8): nunca escrita a mano. */
const CARPETA_DE_LA_RUTA = `app/(private)${UNITS_ROUTE}`;

/** La carpeta donde R43 obliga a que vivan los componentes propios de la ruta. */
const CARPETA_DE_COMPONENTES = `${CARPETA_DE_LA_RUTA}/components`;

/** El barrel por el que TODO consumidor externo debe entrar (R43). */
const BARREL_DE_LA_RUTA = `@/${CARPETA_DE_COMPONENTES}`;

/** Cuantos componentes propios tiene la ruta hoy, sin contar el barrel (`design.md > 1`). */
const COMPONENTES_ESPERADOS = 13;

/** Carpetas del repo que se barren buscando importes por ruta profunda (R43). */
const CARPETAS_DEL_REPO = ['app', 'components', 'lib', 'tests'] as const;

/** La carpeta de tests de esta pantalla, sobre la que va R49. */
const CARPETA_DE_TESTS = 'tests/unit/configuracion-ui';

/**
 * Lo unico que el App Router admite suelto en la raiz de la ruta (R43). Cualquier otro archivo
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

/** Las cuatro Server Actions del catalogo de unidades (R44). */
const RUTA_DE_LAS_ACCIONES = '@/lib/modules/unidades/adapters/driving/unit-actions';

const ACCIONES = [
  'listUnitsAction',
  'createUnitAction',
  'updateUnitAction',
  'deleteUnitAction',
] as const;

/** Barrel del modulo: por aqui salen contratos y tipos, JAMAS una Server Action (R44). */
const BARREL_DEL_MODULO = '@/lib/modules/unidades';

/** El manifiesto, que R45 declara intocable para esta feature. */
const MANIFIESTO = 'package.json';

/**
 * Las referencias que nombran la rama de integracion, en orden de preferencia. La base contra la
 * que se mide esta feature es el **merge-base** con `HEAD`, calculado en CADA ejecucion.
 *
 * AQUI VIVIO UN SHA CONGELADO (`516e9c0`, la punta de `origin/dev` al montar el worktree),
 * justificado con que «asi el criterio no cambia por debajo si `origin/dev` avanza». El argumento
 * era falso y el efecto, el contrario: `git diff <sha> -- <ruta>` compara arbol contra arbol, de
 * modo que en cuanto `dev` avanza el rango se traga TODO lo que `dev` trae y se lo atribuye a esta
 * feature.
 *
 * SE CORRIGIO EL 2026-09-12, desde la rama de QC-85, porque **se puso rojo de verdad**: QC-79
 * anadio `resend` a `package.json` en `dev` —una dependencia suya, aprobada por su propio ciclo— y
 * R45 empezo a decir que «la feature de unidades toca el manifiesto», sin que QC-39 hubiera abierto
 * un solo intocable. Es EXACTAMENTE el mismo fallo, con la misma cura, que ya escribieron
 * `data-table-intacta-unidades.test.ts` y `tests/unit/unidades/modulo-intacto.test.ts`, que
 * migraron antes —y a las que el comentario que habia aqui seguia citando como companeras de SHA
 * cuando hacia tiempo que no lo eran—.
 *
 * El merge-base conserva la propiedad que aquel comentario buscaba: la pregunta pasa a ser «que
 * anade MI rama sobre el `dev` ACTUAL», y el criterio no se afloja porque `dev` avance, porque lo
 * que `dev` aporta nunca cuenta como mio.
 */
const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

/** Separador de lineas de la salida de git, nombrado para no incrustar escapes sueltos. */
const SALTO_DE_LINEA = String.fromCharCode(10);

/**
 * El merge-base entre la primera referencia de `dev` disponible y `HEAD`, o `null` si no hay
 * ninguna a mano. `null` NO es verde: quien depende de la base se salta con el motivo escrito.
 */
function baseDeLaRama(): string | null {
  for (const referencia of REFERENCIAS_DE_DEV) {
    try {
      return git(['merge-base', referencia, 'HEAD']).trim();
    } catch {
      // Esa referencia no existe aqui: se prueba la siguiente.
    }
  }
  return null;
}

/** Se calcula una sola vez: el grafo no se mueve mientras corre la suite. */
const BASE_DE_LA_RAMA = baseDeLaRama();

/** El motivo que se escribe cuando no hay base: un salto explicito, nunca un verde silencioso. */
const SIN_BASE =
  `ninguna de las referencias ${REFERENCIAS_DE_DEV.join(', ')} esta disponible: no se puede ` +
  'calcular el merge-base, asi que esta guardia NO ha comprobado nada';

/**
 * LA PRECONDICION DE RAMA, con la misma forma que su hermana `data-table-intacta-unidades.test.ts`
 * —se copia a proposito, sin inventar una segunda—.
 *
 * Sin ella este archivo mide CUALQUIER rama con las reglas de alcance de QC-39, que es como R45 se
 * puso roja desde la rama de QC-85. La senal es CONJUNTIVA: el archivo central de la pantalla MAS
 * la carpeta de spec de la propia ficha, que nace y vive dentro del rango de QC-39 y no aparece
 * jamas en el rango de otra.
 */
const ARCHIVO_CENTRAL_DE_QC39 = `${CARPETA_DE_LA_RUTA}/page.tsx`;
const CARPETA_SPEC_DE_QC39 = 'specs/QC-39-pantalla-de-unidades/';

function esLaRamaDeQC39(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC39) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC39))
  );
}

/** Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-39. */
function saltarSiNoEsLaRamaDeQC39(ctx: Pick<TestContext, 'skip'>, base: string): void {
  const tocados = git(['diff', '--name-only', base, '--', '.'])
    .split(SALTO_DE_LINEA)
    .map((linea) => aPosix(linea.trim()))
    .filter((linea) => linea !== '');

  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que ' +
        'revisar, asi que este caso NO ha comprobado nada.',
    );
    return;
  }

  if (!esLaRamaDeQC39(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC39 +
        '` y `' +
        CARPETA_SPEC_DE_QC39 +
        '`: esta NO es la rama de QC-39, asi que este caso NO ha comprobado nada. R45 es el ' +
        'alcance de ESA ficha y no le aplica a ninguna otra.',
    );
  }
}

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

/** TODAS las fuentes de la ruta: `page.tsx`, el barrel y los trece componentes. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_DE_LA_RUTA);

/** Los componentes, sin el barrel: es de ellos de quien el barrel tiene que ser puerta. */
const COMPONENTES = FUENTES_DE_LA_RUTA.filter(
  (ruta) => ruta.startsWith(`${CARPETA_DE_COMPONENTES}/`) && !ruta.endsWith('/index.ts'),
);

/** Las que declaran frontera de cliente: R46 va sobre estas. */
const CLIENTES_DE_LA_RUTA = FUENTES_DE_LA_RUTA.filter((ruta) =>
  /^\s*['"]use client['"]/m.test(leer(ruta)),
);

/**
 * Los tests de la pantalla, sobre los que va R49.
 *
 * **Quedan fuera los dos archivos de convenciones —este y el de la pantalla hermana—, y no es una
 * excepcion de conveniencia**: sus casos negativos son fuentes SINTETICAS —cadenas que contienen
 * justo la violacion que el detector tiene que ver—, no consultas que se ejecuten contra ningun
 * DOM. Incluirlos obligaria a borrar los casos negativos, que son lo unico que demuestra que la
 * guardia muerde.
 */
const TESTS_DE_LA_PANTALLA = fuentesBajo(CARPETA_DE_TESTS).filter(
  (ruta) => !ruta.endsWith('convenciones.test.ts'),
);

// --------------------------------------------------------------------------------------------
// Detectores puros
// --------------------------------------------------------------------------------------------

/**
 * R8 — La URL escrita a mano, en las **tres** formas de escribir una cadena en TypeScript.
 * La tercera —la plantilla— es justo la que usaria quien montara la cadena de consulta a mano en
 * vez de derivarla de `unitListHref`.
 */
function literalesDeRuta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [`'${UNITS_ROUTE}`, `"${UNITS_ROUTE}`, `\`${UNITS_ROUTE}`].filter((forma) =>
    codigo.includes(forma),
  );
}

/** R43 — Un importe que entra por el archivo concreto en vez de por el barrel de la ruta. */
function importesProfundos(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const escapado = BARREL_DE_LA_RUTA.replace(/[[\]()]/g, (c) => `\\${c}`);
  const profundo = new RegExp(`from\\s+['"]${escapado}/[^'"]+['"]`, 'g');
  return codigo.match(profundo) ?? [];
}

/** Los nombres que un archivo DECLARA y exporta: lo que el barrel tiene que republicar (R43). */
function nombresExportados(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const declaraciones =
    /export\s+(?:async\s+)?(?:const|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g;
  return [...codigo.matchAll(declaraciones)].map((coincidencia) => coincidencia[1]);
}

/**
 * R44 — Una Server Action importada por el **barrel del modulo** en vez de por su ruta exacta.
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
 * R44 — Una Server Action **usada** sin haberla importado por su ruta exacta. Es la otra mitad:
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
 * R44 — `fetch` contra una ruta del propio origen. Toda lectura y toda escritura pasan por Server
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

/**
 * R46 — Lo que un componente de cliente NO puede importar.
 *
 * Los cuatro primeros arrastrarian Prisma al navegador. El quinto es propio de esta ficha: el
 * **dominio** de `unidades` no es contrato publico. Desde la pantalla solo se entra por el barrel
 * —tipos, `UnitView` y el catalogo ordenable— y por los adaptadores driving (R44); abrir
 * `domain/**` seria justo lo que R44 prohibe, y lo que la ampliacion de R1-R6 acota a seis
 * archivos del modulo que solo el bloque 1 podia tocar.
 */
const PROHIBIDO_EN_CLIENTE = [
  '@/lib/composition',
  '@/lib/shared/db',
  '@prisma/client',
  '@/db',
  `${BARREL_DEL_MODULO}/domain`,
] as const;

function importesProhibidosDeCliente(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return PROHIBIDO_EN_CLIENTE.filter((modulo) =>
    new RegExp(`from\\s*['"]${modulo.replace(/\//g, '\\/')}(['"/])`).test(codigo),
  );
}

/**
 * R30 — Usos de `isSystem` en la fuente de la pantalla.
 *
 * «Unidad de sistema» lo decide el service de QC-38, con su test. La pantalla lo lee para UNA sola
 * cosa: si la celda de acciones lleva algo o queda vacia (R29). Cualquier otro uso —ocultar una
 * columna, apagar un control, pintar una insignia, decidir si se envia una escritura— seria
 * repetir la comprobacion, que es exactamente lo que R30 prohibe.
 */
function usosDeIsSystem(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return codigo.match(/\bisSystem\b/g) ?? [];
}

/**
 * R15 — Una tabla propia.
 *
 * La lista se pinta con la tabla compartida por su barrel publico. Declarar aqui un `<table>`, un
 * `<thead>` o un `<tbody>` a mano seria haberla reescrito.
 */
const PRIMITIVAS_DE_TABLA = /<(table|thead|tbody|tfoot|TableHeader|TableBody)\b/;

function tablaPropia(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const encontrada = PRIMITIVAS_DE_TABLA.exec(codigo);
  return encontrada === null ? [] : [encontrada[1]];
}

/**
 * R49 — Consultas de Testing Library que afirman sobre **copy**.
 *
 * Solo se admiten dos familias: `ByRole` —el rol ARIA es contrato de accesibilidad, no texto de
 * interfaz— y `ByTestId`. Quedan fuera `ByText`, `ByLabelText`, `ByPlaceholderText`, `ByTitle`,
 * `ByAltText` y `ByDisplayValue`: todas identifican por una cadena que la interfaz puede
 * reescribir manana sin que cambie ni un comportamiento.
 *
 * Y dentro de `ByTestId`, el argumento tiene que ser una **constante** (un identificador) o, si es
 * literal, un `data-table*`: esos son los `data-testid` publicos de la tabla compartida, que son
 * contrato de otro componente y no copy de esta pantalla. Que la pantalla los use es, ademas, la
 * prueba de R15: si hubiera escrito su propia tabla, no existirian.
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

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: RAIZ, encoding: 'utf8' });
}

// --------------------------------------------------------------------------------------------
// R43 — Carpeta `components/`, barrel y ninguna ruta profunda
// --------------------------------------------------------------------------------------------

describe('los componentes de la ruta viven en `components/` y salen del barrel (R43)', () => {
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

  it('el barrel existe, no declara frontera de cliente y republica los trece componentes', () => {
    const barrel = `${CARPETA_DE_COMPONENTES}/index.ts`;
    expect(existsSync(join(RAIZ, barrel)), 'falta el barrel de la ruta').toBe(true);

    const fuente = leer(barrel);
    expect(
      /^\s*['"]use client['"]/m.test(fuente),
      'el barrel no puede ser frontera cliente/servidor: cada componente la declara',
    ).toBe(false);

    expect(COMPONENTES.length, 'el barrido no encontro los componentes').toBe(COMPONENTES_ESPERADOS);

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
      importesProfundos(`import { UnitTable } from '${BARREL_DE_LA_RUTA}/unit-table';`),
    ).not.toEqual([]);
    expect(importesProfundos(`import { UnitTable } from '${BARREL_DE_LA_RUTA}';`)).toEqual([]);
    // Leer un archivo por su ruta —lo que hacen varias guardias— no es importarlo.
    expect(
      importesProfundos(`readFileSync('${CARPETA_DE_COMPONENTES}/unit-form.tsx', 'utf8')`),
    ).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R8 — La URL, en una sola constante
// --------------------------------------------------------------------------------------------

describe('la ruta no escribe su propia URL a mano (R8)', () => {
  it('ningun archivo de la ruta contiene el literal de UNITS_ROUTE', () => {
    expect(
      FUENTES_DE_LA_RUTA.length,
      'el barrido no encontro las fuentes de la ruta',
    ).toBeGreaterThan(COMPONENTES_ESPERADOS);

    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      literalesDeRuta(leer(archivo)).map((forma) => `${archivo} incrusta ${forma}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante las tres formas, sin morder a lo legitimo', () => {
    expect(literalesDeRuta(`router.push('${UNITS_ROUTE}');`)).not.toEqual([]);
    expect(literalesDeRuta(`<Link href="${UNITS_ROUTE}" />`)).not.toEqual([]);
    expect(literalesDeRuta(`const href = \`${UNITS_ROUTE}?page=\${page}\`;`)).not.toEqual([]);
    // El nombre de la ruta en un comentario no es codigo, y el id de la tabla no es una URL.
    expect(literalesDeRuta(`// la pantalla vive en ${UNITS_ROUTE}`)).toEqual([]);
    expect(literalesDeRuta(`const UNIT_TABLE_ID = 'unidades';`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R44 — Todo pasa por las Server Actions del modulo
// --------------------------------------------------------------------------------------------

describe('toda lectura y toda escritura pasan por las Server Actions del modulo (R44)', () => {
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
    const porElBarrel = `import { listUnitsAction } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(porElBarrel)).not.toEqual([]);
    expect(accionesSinRutaExacta(porElBarrel)).not.toEqual([]);

    // El contrato publico SI sale por el barrel: tipos, `UnitView` y el catalogo ordenable.
    const soloContrato = `import { UNIT_QUERYABLE, type UnitView } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(soloContrato)).toEqual([]);
    expect(accionesSinRutaExacta(soloContrato)).toEqual([]);

    const porLaRutaExacta = `import { listUnitsAction } from '${RUTA_DE_LAS_ACCIONES}';`;
    expect(accionesPorElBarrel(porLaRutaExacta)).toEqual([]);
    expect(accionesSinRutaExacta(porLaRutaExacta)).toEqual([]);

    expect(fetchAPropia(`await fetch('/api/unidades');`)).not.toEqual([]);
    expect(fetchAPropia('await fetch(`../unidades`);')).not.toEqual([]);
    expect(fetchAPropia(`await fetch('https://ejemplo.test/x');`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R46 — Los componentes de cliente reciben los datos, no los buscan
// --------------------------------------------------------------------------------------------

describe('los componentes de cliente reciben los datos, no los buscan (R46)', () => {
  it('ninguno importa la composicion, Prisma, la base de datos ni el dominio de `unidades`', () => {
    expect(
      CLIENTES_DE_LA_RUTA.length,
      'la ruta deberia tener componentes de cliente',
    ).toBeGreaterThan(0);

    const culpables = CLIENTES_DE_LA_RUTA.flatMap((archivo) =>
      importesProhibidosDeCliente(leer(archivo)).map((modulo) => `${archivo} importa ${modulo}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante cada uno de los cinco importes prohibidos', () => {
    for (const modulo of PROHIBIDO_EN_CLIENTE) {
      expect(
        importesProhibidosDeCliente(`'use client';\nimport { x } from '${modulo}';`),
        `${modulo} deberia detectarse`,
      ).toContain(modulo);
    }

    expect(
      importesProhibidosDeCliente(
        `import type { UnitView } from '${BARREL_DEL_MODULO}/domain/unit-view';`,
      ),
      'el dominio no es contrato publico, ni siquiera para un tipo',
    ).not.toEqual([]);

    // Y no muerde al contrato publico ni a los adaptadores driving, que si son importables.
    expect(importesProhibidosDeCliente(`import { x } from '${BARREL_DEL_MODULO}';`)).toEqual([]);
    expect(importesProhibidosDeCliente(`import { x } from '${RUTA_DE_LAS_ACCIONES}';`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R30 — La pantalla no repite la comprobacion de «unidad de sistema»
// --------------------------------------------------------------------------------------------

describe('la pantalla no repite la comprobacion de «unidad de sistema» (R30)', () => {
  it('`isSystem` solo se lee en la celda de acciones, y en ningun otro archivo de la ruta', () => {
    const conIsSystem = FUENTES_DE_LA_RUTA.filter(
      (archivo) => usosDeIsSystem(leer(archivo)).length > 0,
    );

    expect(
      conIsSystem,
      `solo la celda de acciones puede leer isSystem; lo leen: ${conIsSystem.join(', ')}`,
    ).toEqual([`${CARPETA_DE_COMPONENTES}/unit-row-actions.tsx`]);
  });

  it('y ahi lo lee UNA sola vez: para decidir si la celda queda vacia (R29)', () => {
    const fuente = leer(`${CARPETA_DE_COMPONENTES}/unit-row-actions.tsx`);

    expect(usosDeIsSystem(fuente), 'mas de una lectura significa mas de una decision').toHaveLength(
      1,
    );
    expect(sinComentarios(fuente)).toContain('if (unit.isSystem) return null;');
  });

  it('ningun archivo de la ruta apaga, marca ni explica una fila de sistema', () => {
    // El reverso de R29 y R30: ni un control deshabilitado, ni una insignia, ni un `title`
    // explicativo condicionados por el ambito. Se mira sobre TODA la ruta, no solo sobre la celda.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const codigo = sinComentarios(leer(archivo));
      expect(codigo, `${archivo} apaga un control por ambito`).not.toMatch(
        /disabled=\{[^}]*isSystem/,
      );
      expect(codigo, `${archivo} explica el ambito`).not.toMatch(/title=\{[^}]*isSystem/);
    }
  });

  it('y la guardia FALLA ante una segunda lectura, sin morder al comentario que la explica', () => {
    expect(usosDeIsSystem('if (unit.isSystem) return null;')).toHaveLength(1);
    expect(
      usosDeIsSystem('if (unit.isSystem) return null;\nconst puede = !row.isSystem;'),
    ).toHaveLength(2);
    expect(usosDeIsSystem('// isSystem lo decide el service, no la pantalla')).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R15 — Ni tabla ni paginacion propias
// --------------------------------------------------------------------------------------------

describe('la lista usa la tabla compartida y no una propia (R15)', () => {
  it('ningun componente de la ruta declara una tabla a mano, salvo el esqueleto de carga', () => {
    // El esqueleto es la excepcion NOMBRADA: ocupa el hueco de la tabla antes de que exista
    // ninguna fila, asi que no puede montarse sobre `<DataTable>`, que necesita datos.
    const excepcion = `${CARPETA_DE_COMPONENTES}/unit-list-skeleton.tsx`;

    const culpables = FUENTES_DE_LA_RUTA.filter((archivo) => archivo !== excepcion).flatMap(
      (archivo) => tablaPropia(leer(archivo)).map((etiqueta) => `${archivo} declara <${etiqueta}>`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('la tabla de la pantalla entra por el barrel publico de la tabla compartida', () => {
    const codigo = sinComentarios(leer(`${CARPETA_DE_COMPONENTES}/unit-table.tsx`));

    expect(codigo).toMatch(/from\s+['"]@\/components\/shared\/data-table['"]/);
    expect(
      codigo,
      'la tabla compartida se importa por su barrel, no por ruta profunda',
    ).not.toMatch(/from\s+['"]@\/components\/shared\/data-table\/[^'"]+['"]/);
    expect(codigo).toContain('<DataTable');
  });

  it('y la guardia FALLA ante una tabla escrita a mano, sin morder a la compartida', () => {
    expect(tablaPropia('return <table className="w-full" />;')).not.toEqual([]);
    expect(tablaPropia('return <tbody>{filas}</tbody>;')).not.toEqual([]);
    expect(tablaPropia('return <DataTable columns={columns} rows={rows} />;')).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R45 — Ni una dependencia nueva
// --------------------------------------------------------------------------------------------

describe('la feature no anade ninguna dependencia (R45)', () => {
  it('la base de fusion con `dev` resuelve; si no, esta guardia se salta RUIDOSAMENTE', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    expect(() => git(['rev-parse', '--verify', `${BASE_DE_LA_RAMA}^{commit}`])).not.toThrow();
  });

  it('`package.json` no aparece en el diff contra la base de fusion', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC39(ctx, BASE_DE_LA_RAMA);

    const cambiados = git(['diff', '--name-only', BASE_DE_LA_RAMA, '--', MANIFIESTO])
      .split(SALTO_DE_LINEA)
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '');

    expect(cambiados, `la feature toca ${MANIFIESTO}: ${cambiados.join(', ')}`).toEqual([]);
  });

  it('y su contenido sigue siendo el de la base de fusion, entrada por entrada', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC39(ctx, BASE_DE_LA_RAMA);

    let enLaBase: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    try {
      enLaBase = JSON.parse(git(['show', `${BASE_DE_LA_RAMA}:${MANIFIESTO}`]));
    } catch (error) {
      throw new Error(
        `No se pudo leer ${BASE_DE_LA_RAMA}:${MANIFIESTO}, asi que R45 NO se ha comprobado. ` +
          `Esta guardia falla en vez de pasar en silencio. Causa: ${String(error)}`,
      );
    }

    const aqui = JSON.parse(leer(MANIFIESTO)) as typeof enLaBase;

    expect(aqui.dependencies ?? {}, 'las dependencias no son las de la base').toEqual(
      enLaBase.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'las de desarrollo no son las de la base').toEqual(
      enLaBase.devDependencies ?? {},
    );
  });
});

// --------------------------------------------------------------------------------------------
// R49 — Los tests no afirman sobre copy
// --------------------------------------------------------------------------------------------

describe('los tests de la pantalla identifican por rol, testid o constante (R49)', () => {
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

  it('y el barrido incluye de verdad los tests de unidades de esta carpeta', () => {
    // Sin esto, «ninguna consulta culpable» podria serlo por vacuidad: un filtro mal escrito que
    // dejara la lista sin archivos saldria igual de verde.
    expect(TESTS_DE_LA_PANTALLA).toContain(`${CARPETA_DE_TESTS}/unidades-viewport.test.tsx`);
    expect(TESTS_DE_LA_PANTALLA).toContain(`${CARPETA_DE_TESTS}/unit-columns.test.tsx`);
  });

  it('y la guardia FALLA ante las consultas por copy, sin morder a las legitimas', () => {
    // Las fuentes sinteticas se COMPONEN, no se escriben enteras: la guardia hermana
    // (`configuracion-convenciones.test.ts`, R35) barre esta misma carpeta y solo se exceptua a si
    // misma, asi que un `screen.getByText('...')` escrito aqui de una pieza la pondria roja. Con
    // `consulta(...)` la cadena solo existe en tiempo de ejecucion —que es cuando el detector la
    // mira— y el caso negativo se conserva intacto.
    const consulta = (verbo: string, familia: string, argumento: string) =>
      `screen.${verbo}By${familia}(${argumento})`;

    expect(consultasPorCopy(consulta('get', 'Text', `'Guardar'`))).not.toEqual([]);
    expect(consultasPorCopy(consulta('find', 'LabelText', `'Nombre'`))).not.toEqual([]);
    expect(consultasPorCopy(consulta('query', 'PlaceholderText', `'Buscar'`))).not.toEqual([]);
    expect(consultasPorCopy(consulta('get', 'TestId', `'unidad-guardar'`))).not.toEqual([]);

    expect(
      consultasPorCopy(consulta('get', 'Role', `'button', { name: editUnitLabel(x) }`)),
    ).toEqual([]);
    expect(consultasPorCopy(consulta('getAll', 'Role', `'row'`))).toEqual([]);
    expect(consultasPorCopy(consulta('get', 'TestId', 'UNIT_LIST_TESTID'))).toEqual([]);
    expect(consultasPorCopy(consulta('get', 'TestId', '`data-table-row-${unit.id}`'))).toEqual([]);
  });
});
