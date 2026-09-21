// QC-35 T13 — Guardias de convencion de la feature de pedidos.
//
// Cubre **R2, R39, R40, R41, R42, R43, R46 y R47** (`specs/QC-35-pantalla-de-pedidos/tasks.md > T13`).
//
// **Que hace este archivo y que NO.** La feature ya tiene `order-route-contract.test.ts`, que
// vigila la constante de ruta, el prefijo privado, el barrel de la pagina y —sobre CUATRO
// archivos concretos— el literal de la URL. Este archivo **no lo reescribe**: extiende lo que
// alli se comprueba a **todos** los archivos de la ruta y cierra lo que ninguna otra guardia mira.
// Reparto explicito, para que nadie duplique manana:
//
// | Comprobacion                                          | Donde vive                        |
// | ------------------------------------------------------ | --------------------------------- |
// | la constante existe y nadie la redeclara                 | `order-route-contract.test.ts`    |
// | el prefijo privado y la fila ruta->rol                   | `order-route-contract.test.ts`    |
// | `page.tsx` importa del barrel y el barrel no es cliente  | `order-route-contract.test.ts`    |
// | literal `'/pedidos'` en CUATRO archivos                  | `order-route-contract.test.ts`    |
// | literal `'/pedidos'` en TODOS los de la ruta, y en plantilla | AQUI (R2)                     |
// | importe por ruta profunda DESDE FUERA de la ruta         | AQUI (R40)                        |
// | actions por ruta exacta, nunca por el barrel del modulo  | AQUI, toda la ruta (R41)          |
// | `fetch` a ruta propia y route handlers                   | AQUI (R41)                        |
// | cliente que importa composicion / Prisma / la BD         | AQUI (R43)                        |
// | `components/ui/` sin tocar y `package.json` sin cambios  | AQUI, sobre el DIFF (R42)         |
// | `lib/modules/**`, `db/**`, `lib/composition/index.ts`    | AQUI, sobre el DIFF (R46)         |
// | lo heredado no se re-crea ni se duplica                  | AQUI (R47)                        |
// | conversiones de importe a coma flotante                  | AQUI (R39)                        |
//
// **Como esta escrito: detector puro + barrido real + caso negativo.** Una guardia que solo mira
// el arbol de hoy es indistinguible de una guardia rota: pasa igual estando vacia. Aqui cada
// comprobacion es una **funcion pura** sobre el texto de un archivo (o sobre la lista de archivos
// tocados), que se usa dos veces: contra el arbol de verdad —donde debe devolver «sin
// violaciones»— y contra una fuente sintetica que **contiene a proposito** la violacion que la
// guardia vigila —donde debe devolver la violacion—. Asi el criterio de hecho de T13 («falla si se
// introduce la violacion») queda comprobado dentro de la propia suite, y no en una ejecucion
// manual que nadie repite.
//
// Los tres casos del diff no se pueden ver leyendo un archivo: son propiedades del **cambio**. Y,
// como en QC-44 y siguiendo `docs/verification.md > Rojos heredados`, cuando el rango
// `origin/dev..HEAD` no esta disponible el caso se **salta** en vez de ponerse rojo: un rango
// inexistente no es una violacion, es la ausencia de la comprobacion.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ORDERS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La carpeta de la ruta, DERIVADA de la constante (R2): nunca escrita a mano. */
const CARPETA_DE_LA_RUTA = `app/(private)${ORDERS_ROUTE}`;

/** El barrel por el que TODO consumidor externo debe entrar (R40). */
const BARREL_DE_LA_RUTA = `@/${CARPETA_DE_LA_RUTA}/components`;

/** Carpetas del repo que se barren buscando importes por ruta profunda (R40). */
const CARPETAS_DEL_REPO = ['app', 'components', 'lib', 'tests'] as const;

/** Marca con la que esta feature firma sus commits, para separarlos de lo que llega de `dev`. */
const MARCA_DE_LA_FEATURE = 'QC-35';

/** Rutas que R42, R46 y R47 declaran intocables para esta feature. */
const INTOCABLES = {
  primitivas: 'components/ui/',
  modulos: 'lib/modules/',
  baseDeDatos: 'db/',
  composicion: 'lib/composition/index.ts',
  manifiesto: 'package.json',
} as const;

/** Las seis operaciones de pedidos, mas las dos que alimentan los selectores (R41). */
const ACCIONES = {
  '@/lib/modules/pedidos/adapters/driving/order-actions': [
    'listOrdersAction',
    'getOrderAction',
    'createOrderAction',
    'updateOrderAction',
    'cancelOrderAction',
    'deleteOrderAction',
  ],
  '@/lib/modules/recetas/adapters/driving/recipe-actions': ['listRecipesAction'],
  '@/lib/modules/unidades/adapters/driving/unit-actions': ['listUnitsAction'],
} as const;

/** Barrel de cada modulo: por aqui salen contratos y esquemas, JAMAS una Server Action (R41). */
const BARRELES_DE_MODULO: Record<keyof typeof ACCIONES, string> = {
  '@/lib/modules/pedidos/adapters/driving/order-actions': '@/lib/modules/pedidos',
  '@/lib/modules/recetas/adapters/driving/recipe-actions': '@/lib/modules/recetas',
  '@/lib/modules/unidades/adapters/driving/unit-actions': '@/lib/modules/unidades',
};

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

/** TODAS las fuentes de la ruta: `page.tsx`, el barrel y los diecisiete componentes. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_DE_LA_RUTA);

/** Las que declaran frontera de cliente: R43 va sobre estas. */
const CLIENTES_DE_LA_RUTA = FUENTES_DE_LA_RUTA.filter((ruta) =>
  /^\s*['"]use client['"]/m.test(leer(ruta)),
);

// --------------------------------------------------------------------------------------------
// Detectores puros. Cada uno se ejercita contra el arbol real Y contra una fuente sintetica que
// contiene la violacion (el caso negativo que exige el criterio de hecho de T13).
// --------------------------------------------------------------------------------------------

/**
 * R2 — La URL escrita a mano, en las **tres** formas de escribir una cadena en TypeScript.
 * `'/pedidos'`, `"/pedidos"` y `` `/pedidos... ``: la tercera es justo la que usaria quien
 * quisiera montar la cadena de consulta a mano en vez de derivarla de `orderListHref`.
 */
function literalesDeRuta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [`'${ORDERS_ROUTE}`, `"${ORDERS_ROUTE}`, `\`${ORDERS_ROUTE}`].filter((forma) =>
    codigo.includes(forma),
  );
}

/** R40 — Un importe que entra por el archivo concreto en vez de por el barrel de la ruta. */
function importesProfundos(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const escapado = BARREL_DE_LA_RUTA.replace(/[[\]()]/g, (c) => `\\${c}`);
  const profundo = new RegExp(`from\\s+['"]${escapado}/[^'"]+['"]`, 'g');
  return codigo.match(profundo) ?? [];
}

/**
 * R41 — Una Server Action importada por el **barrel del modulo** en vez de por su ruta exacta.
 *
 * El barrel de `pedidos` lo dice el mismo: los adaptadores driving no pasan por el. Y no es
 * cosmetico: el barrel arrastra el contrato entero, que a su vez arrastra el servicio, a
 * cualquier modulo de cliente que lo importe.
 */
function accionesPorElBarrel(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const encontradas: string[] = [];

  for (const [rutaExacta, nombres] of Object.entries(ACCIONES)) {
    const barrel = BARRELES_DE_MODULO[rutaExacta as keyof typeof ACCIONES];
    // Solo el importe DESDE EL BARREL: `import { X, type Y } from '@/lib/modules/pedidos';`
    const desdeElBarrel = new RegExp(`import\\s*{([^}]*)}\\s*from\\s*['"]${barrel}['"]`, 'g');
    for (const coincidencia of codigo.matchAll(desdeElBarrel)) {
      const especificadores = coincidencia[1];
      for (const nombre of nombres) {
        if (new RegExp(`\\b${nombre}\\b`).test(especificadores)) {
          encontradas.push(`${nombre} <- ${barrel}`);
        }
      }
    }
  }

  return encontradas;
}

/**
 * R41 — Una Server Action **usada** sin haberla importado por su ruta exacta. Es la otra mitad:
 * `accionesPorElBarrel` ve el importe malo; esto ve el nombre usado sin el importe bueno, que es
 * como se colaria un `require`, un re-export intermedio o un barrel propio de la ruta.
 */
function accionesSinRutaExacta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const huerfanas: string[] = [];

  for (const [rutaExacta, nombres] of Object.entries(ACCIONES)) {
    const importaDeLaRutaExacta = new RegExp(
      `from\\s*['"]${rutaExacta.replace(/\//g, '\\/')}['"]`,
    ).test(codigo);
    if (importaDeLaRutaExacta) continue;

    for (const nombre of nombres) {
      if (new RegExp(`\\b${nombre}\\b`).test(codigo)) {
        huerfanas.push(`${nombre} sin importe desde ${rutaExacta}`);
      }
    }
  }

  return huerfanas;
}

/**
 * R41 — `fetch` contra una ruta del propio origen. Toda lectura y toda mutacion pasan por Server
 * Actions, asi que ningun `fetch` a una ruta propia —absoluta o relativa, cuelgue o no de
 * `/api`— es legitimo aqui.
 */
function fetchAPropia(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [/fetch\(\s*['"`]\//, /fetch\(\s*['"`]\.{1,2}\//]
    .filter((patron) => patron.test(codigo))
    .map((patron) => patron.source);
}

/** R43 — Lo que un componente de cliente NO puede importar sin arrastrar Prisma al navegador. */
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
 * R39 — Aritmetica de coma flotante sobre el importe.
 *
 * **ENMIENDA DEL 2026-09-08 (decision humana): el veto al control numerico del navegador SALE de
 * esta guardia.** La cantidad se captura ahora con el control numerico, asi que mantener la regla
 * dejaria la guardia en rojo permanente -y una guardia que siempre falla no protege nada porque
 * nadie la mira-. Lo que R39 protege de fondo SIGUE vigilado aqui: el importe no se convierte a
 * coma flotante ni se opera aritmeticamente con el en ningun archivo de la ruta, que es donde el
 * decimal se corrompe de verdad. El valor del control numerico llega igual como cadena al
 * `FormData` y lo valida el esquema del contrato.
 *
 * Tres reglas, con distinto alcance a proposito:
 *   - `parseFloat(` y `.toFixed(`: **prohibidos en toda la ruta**. No hay ni un uso legitimo:
 *     el correlativo es un entero formateado por el contrato y la paginacion no formatea nada.
 *   - `Number(`: prohibido **en una linea que nombre cantidad o precio**. Acotado porque
 *     `order-list-params.ts` lo usa legitimamente para la pagina y el tamano de pagina, que son
 *     enteros de la cadena de consulta y no importes.
 *   - `.replace(` sobre una linea de importe: prohibido en toda la ruta. Reescribir el decimal
 *     -cambiar el separador, recortar ceros- es la otra forma de dejar de enviar lo que se
 *     escribio, y es la que queda al alcance de la mano ahora que el control es numerico.
 *
 * `Number(` lleva `\b` por delante para no confundirse con `formatOrderNumber(`, que es
 * justamente la funcion del contrato que R10 obliga a usar.
 */
const CAMPOS_DE_IMPORTE = /quantity|unitPrice|price|importe|amount|total/i;

function conversionesDeImporte(fuente: string): string[] {
  const violaciones: string[] = [];

  sinComentarios(fuente)
    .split('\n')
    .forEach((linea, indice) => {
      const numero = indice + 1;
      if (/\bparseFloat\s*\(/.test(linea)) violaciones.push(`${numero}: parseFloat(`);
      if (/\.toFixed\s*\(/.test(linea)) violaciones.push(`${numero}: toFixed(`);
      if (/\bNumber\s*\(/.test(linea) && CAMPOS_DE_IMPORTE.test(linea)) {
        violaciones.push(`${numero}: Number( sobre un importe`);
      }
      if (/\.replace\s*\(/.test(linea) && CAMPOS_DE_IMPORTE.test(linea)) {
        violaciones.push(`${numero}: .replace( sobre un importe`);
      }
    });

  return violaciones;
}

/** R42, R46 — Archivos que la feature no puede haber tocado. */
/**
 * EXCEPCION NOMBRADA Y FECHADA a R42/R46 — decision humana del **2026-09-07**: la unidad y el
 * precio unitario SALEN del pedido, de la pantalla a la tabla `orders`.
 *
 * Un cambio asi no cabe dentro de «la pantalla no toca el modulo»: quitar dos columnas obliga a
 * tocar el esquema, una migracion, el dominio, el adaptador driven, el punto de composicion y la
 * propia pantalla. La alternativa honesta a esta lista era dejar la guardia en rojo de forma
 * permanente, que es peor: una guardia que siempre falla no protege nada porque nadie la mira.
 *
 * Es una lista por **prefijo exacto y cerrada**, no un patron: todo lo demas de `components/ui/`,
 * `lib/modules/`, `db/` y `lib/composition/index.ts` sigue vetado para esta feature, y
 * `package.json` NO tiene excepcion -ninguna dependencia entra por aqui-.
 */
const AUTORIZADO_2026_09_07: readonly string[] = [
  // El primitivo del autocomplete, del que cuelgan los dos selectores de la app.
  'components/ui/autocomplete.tsx',
  // El modulo `pedidos` entero: dominio, puertos y adaptadores pierden unidad y precio.
  'lib/modules/pedidos/',
  // El cableado, que deja de inyectar el catalogo de unidades a los cuatro casos de uso.
  'lib/composition/index.ts',
  // El esquema y la migracion que dropea `unit_id` y `unit_price` (con su `down.sql`).
  'db/schema.prisma',
  'db/migrations/20260907120000_orders_drop_unit_and_unit_price/',
];

function autorizado(ruta: string): boolean {
  return AUTORIZADO_2026_09_07.some((permitida) =>
    permitida.endsWith('/') ? ruta.startsWith(permitida) : ruta === permitida,
  );
}

function intocablesTocados(rutas: readonly string[]): string[] {
  return rutas.filter(
    (ruta) =>
      !autorizado(ruta) &&
      (ruta.startsWith(INTOCABLES.primitivas) ||
        ruta.startsWith(INTOCABLES.modulos) ||
        ruta.startsWith(INTOCABLES.baseDeDatos) ||
        ruta === INTOCABLES.composicion ||
        ruta === INTOCABLES.manifiesto),
  );
}

// --------------------------------------------------------------------------------------------
// El diff de la feature
// --------------------------------------------------------------------------------------------

function git(comando: string): string {
  return execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Archivos que **esta feature** ha tocado: los de sus commits propios en `origin/dev..HEAD` mas
 * los del arbol de trabajo, para que la guardia muerda antes incluso de commitear.
 *
 * Se filtra por la marca de la feature y no por el rango entero a proposito: la rama arrastra
 * fusiones de `dev` con trabajo ajeno, y atribuirselo a QC-35 pondria la guardia roja por algo
 * que QC-35 no hizo. Devuelve `null` cuando el rango no esta disponible.
 */
function archivosTocadosPorLaFeature(): string[] | null {
  let commits: string[];
  try {
    commits = git(`git log --no-merges --format=%H "--grep=${MARCA_DE_LA_FEATURE}" origin/dev..HEAD`)
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0);
  } catch {
    return null;
  }

  if (commits.length === 0) return null;

  // Un solo `git show` para todos los commits: arrancar `git` en Windows no es barato.
  const tocados = new Set<string>();
  for (const ruta of git(`git show --pretty=format: --name-only ${commits.join(' ')}`).split('\n')) {
    const limpia = ruta.trim();
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

/** Se calcula UNA vez al cargar el archivo: los tres casos del diff preguntan lo mismo. */
const TOCADOS_POR_LA_FEATURE = archivosTocadosPorLaFeature();

// --------------------------------------------------------------------------------------------
// Casos
// --------------------------------------------------------------------------------------------

describe('la ruta no escribe su propia URL a mano (R2)', () => {
  it('ningun archivo de la ruta contiene el literal de ORDERS_ROUTE', () => {
    // `order-route-contract.test.ts` ya lo comprueba sobre cuatro archivos y en una sola forma.
    // Aqui van los DIECIOCHO y las tres formas: comilla simple, doble y plantilla.
    expect(FUENTES_DE_LA_RUTA.length, 'el barrido no encontro las fuentes de la ruta').toBeGreaterThan(
      10,
    );

    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      literalesDeRuta(leer(archivo)).map((forma) => `${archivo} incrusta ${forma}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA si alguien incrusta la URL en cualquiera de las tres formas', () => {
    expect(literalesDeRuta(`router.push('${ORDERS_ROUTE}');`)).not.toEqual([]);
    expect(literalesDeRuta(`<Link href="${ORDERS_ROUTE}" />`)).not.toEqual([]);
    expect(literalesDeRuta(`const href = \`${ORDERS_ROUTE}?page=\${page}\`;`)).not.toEqual([]);
    // Y no muerde donde no debe: el nombre de la carpeta en un comentario, ni un id de tabla.
    expect(literalesDeRuta(`// la pantalla vive en ${ORDERS_ROUTE}`)).toEqual([]);
    expect(literalesDeRuta(`const ORDER_TABLE_ID = 'pedidos';`)).toEqual([]);
  });
});

describe('el barrel de la ruta es la unica puerta (R40)', () => {
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
      importesProfundos(`import { OrderTable } from '${BARREL_DE_LA_RUTA}/order-table';`),
    ).not.toEqual([]);
    expect(importesProfundos(`import { OrderTable } from '${BARREL_DE_LA_RUTA}';`)).toEqual([]);
    // Leer un archivo por su ruta —lo que hacen varias guardias— no es importarlo.
    expect(
      importesProfundos(`readFileSync('${CARPETA_DE_LA_RUTA}/components/order-form.tsx', 'utf8')`),
    ).toEqual([]);
  });
});

describe('las operaciones entran por su ruta exacta y nunca por el barrel del modulo (R41)', () => {
  it('ningun archivo de la ruta importa una Server Action desde el barrel de su modulo', () => {
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

  it('y las dos guardias FALLAN ante el importe por el barrel, sin morder al contrato publico', () => {
    const porElBarrel = `import { createOrderAction, type OrderSummary } from '@/lib/modules/pedidos';`;
    expect(accionesPorElBarrel(porElBarrel)).not.toEqual([]);
    expect(accionesSinRutaExacta(porElBarrel)).not.toEqual([]);

    // El contrato publico SI sale por el barrel: esquemas, tipos y `formatOrderNumber`.
    const soloContrato = `import { createOrderSchema, formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';`;
    expect(accionesPorElBarrel(soloContrato)).toEqual([]);
    expect(accionesSinRutaExacta(soloContrato)).toEqual([]);

    const porLaRutaExacta = `import { createOrderAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';`;
    expect(accionesPorElBarrel(porLaRutaExacta)).toEqual([]);
    expect(accionesSinRutaExacta(porLaRutaExacta)).toEqual([]);
  });
});

describe('la pantalla no llama a rutas propias ni las crea (R41)', () => {
  it('ningun archivo de la ruta hace fetch a una ruta del propio origen', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      fetchAPropia(leer(archivo)).map((patron) => `${archivo}: ${patron}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('la feature no crea ningun route handler en la superficie de pedidos', () => {
    // ACOTADO EL 2026-09-18 POR QC-111.
    //
    // Este caso hacia DOS afirmaciones. La primera -ningun `route.ts` bajo la ruta de pedidos, donde
    // R1 solo admite `page.tsx`- es la regla de arquitectura de verdad: una pantalla no se fabrica
    // rutas propias, y una mutacion desde un componente propio se hace con una Server Action
    // (`docs/architecture.md > Server Actions vs Route Handlers`). Esa se queda INTACTA.
    //
    // La segunda barria TODO `app/` exigiendo cero route handlers en el repositorio entero. Eso
    // media de mas: afirmaba sobre fichas ajenas lo que solo podia afirmar sobre la suya, asi que la
    // rompe cualquier feature posterior que anada un route handler LEGITIMO. Es lo que paso con el
    // webhook de la cola de QC-111, que esa misma tabla de `docs/architecture.md` manda resolver CON
    // Route Handler por venir de un tercero. Se borra la absoluta; no se pierde ninguna proteccion
    // sobre pedidos, que es lo unico que este archivo puede prometer.
    const enLaRuta = FUENTES_DE_LA_RUTA.filter((archivo) => /\/route\.tsx?$/.test(archivo));

    expect(enLaRuta, `route handlers en la ruta: ${enLaRuta.join(', ')}`).toEqual([]);
  });

  it('y el detector de route handlers MUERDE ante uno en la superficie de pedidos', () => {
    const conUnoEnPedidos = [
      `${CARPETA_DE_LA_RUTA}/page.tsx`,
      `${CARPETA_DE_LA_RUTA}/route.ts`,
    ].filter((archivo) => /\/route\.tsx?$/.test(archivo));

    expect(conUnoEnPedidos).toEqual([`${CARPETA_DE_LA_RUTA}/route.ts`]);

    const soloPantalla = [`${CARPETA_DE_LA_RUTA}/page.tsx`].filter((archivo) =>
      /\/route\.tsx?$/.test(archivo),
    );

    expect(soloPantalla).toEqual([]);
  });

  it('y la guardia del fetch FALLA ante una ruta propia, sin morder a una absoluta ajena', () => {
    expect(fetchAPropia(`await fetch('/api/pedidos');`)).not.toEqual([]);
    expect(fetchAPropia(`await fetch("/pedidos/list");`)).not.toEqual([]);
    expect(fetchAPropia('await fetch(`../pedidos`);')).not.toEqual([]);
    // Un origen externo no es una ruta propia: la guardia no lo prohibe (aqui no hay ninguno,
    // pero convertir esta guardia en «ningun fetch jamas» seria vigilar otra cosa).
    expect(fetchAPropia(`await fetch('https://ejemplo.test/x');`)).toEqual([]);
  });
});

describe('los componentes de cliente reciben los datos, no los buscan (R43)', () => {
  it('ninguno importa la composicion, Prisma ni el cliente de base de datos', () => {
    expect(CLIENTES_DE_LA_RUTA.length, 'la ruta deberia tener componentes de cliente').toBeGreaterThan(
      0,
    );

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
    expect(importesProhibidosDeCliente(`import { x } from '@/lib/modules/pedidos';`)).toEqual([]);
  });
});

describe('los importes viajan como cadena decimal (R39)', () => {
  it('la ruta no convierte el importe a coma flotante ni lo reescribe', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      conversionesDeImporte(leer(archivo)).map((detalle) => `${archivo}:${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante las cuatro formas, sin morder a lo legitimo', () => {
    expect(conversionesDeImporte('const q = parseFloat(order.quantity);')).not.toEqual([]);
    expect(conversionesDeImporte('const p = Number(order.unitPrice);')).not.toEqual([]);
    expect(conversionesDeImporte('const t = subtotal.toFixed(4);')).not.toEqual([]);
    expect(conversionesDeImporte("const q = quantity.replace(',', '.');")).not.toEqual([]);

    // Legitimo: el entero de la pagina, el correlativo del contrato y el control numerico, que
    // desde el 2026-09-08 es el de la cantidad y entrega su valor como cadena (ver el docblock).
    expect(conversionesDeImporte('const value = Number(raw);')).toEqual([]);
    expect(conversionesDeImporte('cell: (order) => formatOrderNumber(order.number),')).toEqual([]);
    expect(
      conversionesDeImporte('<Input name="quantity" type="number" step="any" />'),
    ).toEqual([]);
  });
});

describe('la feature no toca lo que tiene prohibido tocar (R42, R46)', () => {
  it('no edita ni crea nada en components/ui/', (ctx) => {
    // R42 — las primitivas entran por `npx shadcn add` y se dejan como llegan. Editarlas a mano
    // convierte una copia versionada de la libreria en un fork silencioso que nadie regenera.
    if (TOCADOS_POR_LA_FEATURE === null) {
      ctx.skip('el rango git origin/dev..HEAD no tiene commits de esta feature');
      return;
    }

    const primitivas = TOCADOS_POR_LA_FEATURE.filter(
      (ruta) => ruta.startsWith(INTOCABLES.primitivas) && !autorizado(ruta),
    );
    expect(primitivas, `la feature toca primitivas de UI: ${primitivas.join(', ')}`).toEqual([]);
  });

  it('no cambia package.json', (ctx) => {
    // R42 — ninguna dependencia nueva. Dos vias, porque miden cosas distintas: que la feature no
    // lo haya tocado, y que su contenido siga siendo el de `dev`.
    if (TOCADOS_POR_LA_FEATURE === null) {
      ctx.skip('el rango git origin/dev..HEAD no tiene commits de esta feature');
      return;
    }

    expect(
      TOCADOS_POR_LA_FEATURE.filter((ruta) => ruta === INTOCABLES.manifiesto),
      'la feature toca package.json',
    ).toEqual([]);

    const enDev = JSON.parse(git(`git show origin/dev:${INTOCABLES.manifiesto}`)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const aqui = JSON.parse(leer(INTOCABLES.manifiesto)) as typeof enDev;

    expect(aqui.dependencies ?? {}, 'las dependencias no son las de dev').toEqual(
      enDev.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'las dependencias de desarrollo no son las de dev').toEqual(
      enDev.devDependencies ?? {},
    );
  });

  it('no modifica los modulos, el esquema de datos ni el punto de composicion', (ctx) => {
    // R46 — los modulos se consumen solo por su contrato publico y sus adaptadores driving.
    // El intocable es el barrel `lib/composition/index.ts` y no la carpeta entera: QC-35 tuvo que
    // modificar otro archivo de `lib/composition` (la lista ruta->rol que R5 autorizaba, retirada
    // despues por QC-75), y esa distincion sigue siendo la razon del alcance.
    if (TOCADOS_POR_LA_FEATURE === null) {
      ctx.skip('el rango git origin/dev..HEAD no tiene commits de esta feature');
      return;
    }

    const prohibidos = intocablesTocados(TOCADOS_POR_LA_FEATURE);
    expect(prohibidos, `la feature toca archivos intocables: ${prohibidos.join(', ')}`).toEqual([]);
  });

  it('y la guardia del diff FALLA ante cada intocable, sin morder a lo que R5 autoriza', () => {
    expect(intocablesTocados(['components/ui/table.tsx'])).not.toEqual([]);
    expect(intocablesTocados(['package.json'])).not.toEqual([]);
    expect(intocablesTocados(['lib/modules/inventario/domain/product-view.ts'])).not.toEqual([]);
    expect(intocablesTocados(['db/migrations/20260903191204_orders/migration.sql'])).not.toEqual([]);

    // La excepcion del 2026-09-07 muerde SOLO lo que nombra, y su lista es cerrada.
    expect(intocablesTocados(['components/ui/autocomplete.tsx'])).toEqual([]);
    expect(intocablesTocados(['lib/modules/pedidos/domain/order-view.ts'])).toEqual([]);
    expect(intocablesTocados(['db/schema.prisma'])).toEqual([]);
    expect(intocablesTocados(['lib/composition/index.ts'])).toEqual([]);
    // Pero `package.json` NO esta autorizado ni siquiera por ella.
    expect(intocablesTocados(['package.json'])).not.toEqual([]);

    expect(
      intocablesTocados([
        'lib/shared/routes.ts',
        'lib/shared/navigation/private-nav.ts',
        'components/shared/data-table/data-table.tsx',
        `${CARPETA_DE_LA_RUTA}/page.tsx`,
      ]),
      'R5 y design.md > 6 autorizan estos cuatro',
    ).toEqual([]);
  });
});

describe('lo heredado se hereda montado y no se re-crea (R47)', () => {
  it('la ruta no declara su propio layout, barra lateral ni navegacion', () => {
    for (const nombre of ['layout.tsx', 'template.tsx', 'app-sidebar.tsx', 'private-nav.ts']) {
      expect(
        existsSync(join(RAIZ, CARPETA_DE_LA_RUTA, nombre)),
        `la ruta re-crea ${nombre}, que hereda del layout privado`,
      ).toBe(false);
      expect(
        existsSync(join(RAIZ, CARPETA_DE_LA_RUTA, 'components', nombre)),
        `la ruta re-crea ${nombre}, que hereda del layout privado`,
      ).toBe(false);
    }
  });

  it('la ruta no monta una segunda region de avisos', () => {
    // El `<Toaster />` lo monta el layout privado (QC-22 R22). `toast(...)` SI se llama desde
    // aqui —es emitir sobre la region heredada—, pero el componente no se vuelve a montar.
    const culpables = FUENTES_DE_LA_RUTA.filter((archivo) => {
      const codigo = sinComentarios(leer(archivo));
      return /<\s*Toaster\b/.test(codigo) || /\bToaster\b[^;]*from\s*['"]/.test(codigo);
    });

    expect(culpables, `montan una segunda region de avisos: ${culpables.join(', ')}`).toEqual([]);
  });

  it('la ruta no duplica la tabla de datos compartida: la importa por su barrel', () => {
    const propias = FUENTES_DE_LA_RUTA.filter((archivo) => /data-table/.test(archivo));
    expect(propias, `copias de la tabla compartida: ${propias.join(', ')}`).toEqual([]);

    const laTabla = `${CARPETA_DE_LA_RUTA}/components/order-table.tsx`;
    const codigo = sinComentarios(leer(laTabla));
    expect(codigo).toContain("from '@/components/shared/data-table'");
    // Nunca por ruta profunda dentro del componente compartido: el barrel es su puerta.
    expect(codigo).not.toMatch(/from '@\/components\/shared\/data-table\/[^']+'/);
  });

  it('las utilidades de test no se duplican: hay un solo helper de viewport', () => {
    expect(existsSync(join(RAIZ, 'tests/helpers/viewport.ts'))).toBe(true);

    // Una copia es un archivo que **es** el helper (mismo nombre de archivo), no uno que lo
    // importe: `pedidos-viewport.test.tsx` lo consume, que es justo lo que R47 quiere.
    const copias = fuentesBajo('tests').filter(
      (archivo) => /\/viewport\.tsx?$/.test(archivo) && archivo !== 'tests/helpers/viewport.ts',
    );
    expect(copias, `copias del helper de viewport: ${copias.join(', ')}`).toEqual([]);
  });
});
