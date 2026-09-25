import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { PERMISSIONS } from '@/lib/modules/identity';
import { RECIPE_QUERYABLE } from '@/lib/modules/recetas';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import { FORMULAS_ROUTE, NEW_RECIPE_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

/**
 * Guardias de codigo, sin DOM: lo que la ruta promete no hacer (incrustar la ruta, repetir la
 * autorizacion, filtrar en cliente, convertir la cantidad a numero...) es invisible renderizando.
 *
 * A diferencia de inventario, la ruta tiene subrutas propias (`nueva/` y `[id]/`), asi que las
 * carpetas legitimas son tres y no solo `components/`.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** El route group `(private)` no aporta segmento de URL. */
const CARPETA_RUTA = join('app', '(private)', FORMULAS_ROUTE.replace(/^\//, ''));
const PAGE_PATH = join(CARPETA_RUTA, 'page.tsx');
const COMPONENTES_PATH = join(CARPETA_RUTA, 'components');
const BARREL_PATH = join(COMPONENTES_PATH, 'index.ts');

/** `[id]` va escrito a mano: el App Router exige los corchetes y ninguna constante los da. */
const NUEVA_SUFIJO = NEW_RECIPE_ROUTE.slice(FORMULAS_ROUTE.length + 1);
const CARPETA_NUEVA = join(CARPETA_RUTA, NUEVA_SUFIJO);
const PAGE_NUEVA_PATH = join(CARPETA_NUEVA, 'page.tsx');
const CARPETA_EDICION = join(CARPETA_RUTA, '[id]');
const PAGE_EDICION_PATH = join(CARPETA_EDICION, 'page.tsx');

const LAYOUT_PRIVADO_PATH = join('app', '(private)', 'layout.tsx');

const LITERALES_DE_RUTA = [`'${FORMULAS_ROUTE}'`, `"${FORMULAS_ROUTE}"`, `\`${FORMULAS_ROUTE}`];

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return leer(rutaRelativa)
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

/** Sin esto, un fallo apuntaria a una linea que no existe en el archivo que hay que abrir. */
function lineasOriginales(rutaRelativa: string): number[] {
  const numeros: number[] = [];

  leer(rutaRelativa)
    .split('\n')
    .forEach((linea, indice) => {
      const limpia = linea.trim();
      if (!(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'))) {
        numeros.push(indice + 1);
      }
    });

  return numeros;
}

/** `fuentesBajo` devuelve separadores POSIX tambien en Windows. */
function enRutaDePosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

function fuentesBajo(carpetaRelativa: string): string[] {
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
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'));
      }
    }
  };

  recorrer(join(RAIZ, carpetaRelativa));
  return encontradas.sort();
}

const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_RUTA);

const ARCHIVOS_DE_LA_LISTA = [
  join(COMPONENTES_PATH, 'recipe-columns.tsx'),
  join(COMPONENTES_PATH, 'recipe-columns-skeleton.ts'),
  join(COMPONENTES_PATH, 'recipe-table.tsx'),
  join(COMPONENTES_PATH, 'recipe-table-skeleton.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-empty.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-error.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-params.ts'),
  join(COMPONENTES_PATH, 'recipe-list-section.tsx'),
  join(COMPONENTES_PATH, 'delete-recipe-dialog.tsx'),
  PAGE_PATH,
].map((ruta) => ruta.split('\\').join('/'));

const COLUMNAS_PATH = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-columns.tsx'));
const PARSER_PATH = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-list-params.ts'));

/** Los archivos por los que pasan las filas entre la operacion de listado y la tabla compartida. */
const ARCHIVOS_DE_TABLA_Y_COLUMNAS = [
  join(COMPONENTES_PATH, 'recipe-list-section.tsx'),
  join(COMPONENTES_PATH, 'recipe-table.tsx'),
  join(COMPONENTES_PATH, 'recipe-columns.tsx'),
  join(COMPONENTES_PATH, 'recipe-columns-skeleton.ts'),
  join(COMPONENTES_PATH, 'recipe-table-skeleton.tsx'),
].map(enRutaDePosix);

/** Operaciones de array que reordenan, descartan o recortan una coleccion. */
const OPERACIONES_SOBRE_FILAS = [
  '.sort(',
  '.toSorted(',
  '.reverse(',
  '.toReversed(',
  '.filter(',
  '.slice(',
  '.splice(',
  '.toSpliced(',
] as const;

/**
 * Recortes que no tocan ninguna coleccion: la celda de fecha corta la cadena ISO de UN valor. Se
 * nombran por texto exacto para que cualquier otro `.slice(` siga contando.
 */
const RECORTES_DE_TEXTO_PERMITIDOS = ['.toISOString().slice('] as const;

/**
 * `recipe-step-schema.ts` exporta un tipo de `@tiptap/core`. Reexportarlo desde el barrel dejaria
 * que cualquier archivo dependiera del editor sin escribir `@tiptap`, que es el literal que busca
 * `tests/guards/guard-editor-aislado.test.ts`. Por nombre y no por patron, para que la regla siga
 * valiendo para el resto de `components/`.
 */
const FUERA_DEL_BARREL = ['recipe-step-schema.ts'];

const FUENTES_DE_CLIENTE = FUENTES_DE_LA_RUTA.filter((ruta) => leer(ruta).includes("'use client'"));

/** Se buscan como etiqueta de apertura JSX: `AlertDialogAction` tambien aparece en el import. */
const CONTROLES_VIGILADOS = [
  'Button',
  'SelectTrigger',
  'Input',
  'AutocompleteInput',
  'AutocompleteItem',
  'AlertDialogAction',
  'Link',
] as const;

/** Fijan 16 px porque son lo que el usuario lee mientras escribe o elige. */
const CONTROLES_CON_FUENTE: readonly string[] = ['Input', 'AutocompleteInput', 'AutocompleteItem'];

/**
 * Las acciones que navegan son enlaces con aspecto de boton (`data-slot="button"`): sin este filtro
 * se saldrian de la guardia del area tactil. Los enlaces de texto corriente quedan fuera.
 */
function vigilaLaEtiqueta(nombre: string, texto: string): boolean {
  return nombre !== 'Link' || texto.includes('data-slot="button"');
}

/** Una regex no lee entera una etiqueta JSX de varias lineas o con `className={`${A} ${B}`}`. */
function finDeExpresion(codigo: string, inicio: number, cierre: '>' | '}'): number {
  let profundidad = 0;
  let comilla: string | null = null;

  for (let i = inicio; i < codigo.length; i += 1) {
    const caracter = codigo[i];

    if (comilla !== null) {
      if (caracter === '\\') i += 1;
      else if (caracter === comilla) comilla = null;
      continue;
    }
    if (caracter === "'" || caracter === '"' || caracter === '`') {
      comilla = caracter;
      continue;
    }
    if (caracter === '{') {
      profundidad += 1;
      continue;
    }
    if (caracter === '}') {
      profundidad -= 1;
      if (cierre === '}' && profundidad === 0) return i + 1;
      continue;
    }
    if (cierre === '>' && caracter === '>' && profundidad === 0) return i + 1;
  }

  return -1;
}

function etiquetasDeApertura(
  codigo: string,
  nombre: string,
  lineas: number[],
): { texto: string; linea: number }[] {
  const encontradas: { texto: string; linea: number }[] = [];
  const patron = new RegExp(`<${nombre}(?![A-Za-z0-9_$])`, 'g');
  let encaje: RegExpExecArray | null;

  while ((encaje = patron.exec(codigo)) !== null) {
    const fin = finDeExpresion(codigo, encaje.index, '>');
    expect(fin, `no se pudo leer la etiqueta <${nombre}> entera`).toBeGreaterThan(-1);
    encontradas.push({
      texto: codigo.slice(encaje.index, fin),
      linea: lineas[codigo.slice(0, encaje.index).split('\n').length - 1] ?? 0,
    });
  }

  return encontradas;
}

function valorDeAtributo(etiqueta: string, nombre: string): string | null {
  const inicio = etiqueta.indexOf(`${nombre}=`);
  if (inicio === -1) return null;

  const abre = inicio + nombre.length + 1;
  const caracter = etiqueta[abre];

  if (caracter === '{') {
    const fin = finDeExpresion(etiqueta, abre, '}');
    return fin === -1 ? null : etiqueta.slice(abre, fin);
  }
  if (caracter === '"' || caracter === "'") {
    const fin = etiqueta.indexOf(caracter, abre + 1);
    return fin === -1 ? null : etiqueta.slice(abre, fin + 1);
  }
  return null;
}

/**
 * Los componentes agrupan la clase en constantes (`const TOUCH_TARGET = 'min-h-11 min-w-11'`):
 * buscar `min-h-11` solo en el `className` daria falsos rojos.
 */
function constantesConLaClase(codigo: string, clase: string): string[] {
  const nombres: string[] = [];
  const patron = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2/g;
  let encaje: RegExpExecArray | null;

  while ((encaje = patron.exec(codigo)) !== null) {
    if (encaje[3].includes(clase)) nombres.push(encaje[1]);
  }

  return nombres;
}

function llevaLaClase(className: string | null, clase: string, constantes: string[]): boolean {
  if (className === null) return false;
  if (className.includes(clase)) return true;
  return constantes.some((nombre) => new RegExp(`(?<![\\w$])${nombre}(?![\\w$])`).test(className));
}

function identificaAlControl(etiqueta: string): string {
  return (
    valorDeAtributo(etiqueta, 'data-testid') ??
    valorDeAtributo(etiqueta, 'aria-label') ??
    valorDeAtributo(etiqueta, 'id') ??
    'sin identificador'
  );
}

function ningunArchivoContiene(prohibidos: readonly string[], fuentes = FUENTES_DE_LA_RUTA) {
  for (const ruta of fuentes) {
    const codigo = fuenteSinComentarios(ruta);
    for (const prohibido of prohibidos) {
      expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
    }
  }
}

// Predicado puro y exportado para poder ponerlo rojo a mano: en una rama recien abierta el rango
// `origin/dev...HEAD` no trae archivos y el caso no comprobaria nada.
//
// Cada ruta permitida se nombra una a una porque el rango mide la rama que corre el gate, no la
// que introdujo el cambio: un patron dejaria pasar cualquier cosa.
const AMPLIACION_RECETAS_QC34 = [
  'lib/modules/recetas/index.ts',
  'lib/modules/recetas/domain/recipe-catalog.ts',
  'lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts',
];

const AUTORIZACION_POR_PERMISO_QC74 = [
  'lib/modules/recetas/domain/actor.ts',
  'lib/modules/recetas/domain/errors.ts',
  'lib/modules/recetas/domain/get-recipe.ts',
  'lib/modules/recetas/domain/list-recipes.ts',
  'lib/modules/recetas/domain/create-recipe.ts',
  'lib/modules/recetas/domain/update-recipe.ts',
  'lib/modules/recetas/domain/delete-recipe.ts',
  'lib/modules/recetas/adapters/driving/recipe-actions.ts',
];

const RENOMBRADO_DE_COMENTARIOS_QC70 = [
  'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts',
];

// QC-50 aisla recetas por empresa. Este contrato solo mira el DIFF contra `origin/dev`, asi que
// con los cambios sin commitear el caso pasaba en verde igual -no muerde hasta que hay commit-.
// Son tres archivos nuevos/modificados, ninguno mas:
//   * `domain/recipe-scope.ts` (nuevo): el tipo del ambito del modulo -la empresa en cuyo
//     nombre se consulta o se escribe-. Dominio puro: no autoriza, solo nombra el ambito.
//   * `adapters/driven/persistence/company-scope.ts` (nuevo): el punto UNICO donde se escribe
//     «de la empresa» al armar el filtro/los datos de Prisma, para que ninguna consulta ni
//     escritura del modulo lo repita por su cuenta y diverja.
//   * `ports/recipe-repository.ts` (modificado): los cinco metodos ganan el ambito en la FIRMA,
//     que es lo que hace que una llamada que lo omita no compile.
const AISLAMIENTO_POR_EMPRESA_QC50 = [
  'lib/modules/recetas/domain/recipe-scope.ts',
  'lib/modules/recetas/adapters/driven/persistence/company-scope.ts',
  'lib/modules/recetas/ports/recipe-repository.ts',
];

const MIGRACION_QC34 = [
  'db/schema.prisma',
  'db/migrations/20260904135210_order_cancellation/migration.sql',
  'db/migrations/20260904135210_order_cancellation/down.sql',
];

const MIGRACION_QC47 = [
  'db/migrations/20260904180600_companies_and_user_company/migration.sql',
  'db/migrations/20260904180600_companies_and_user_company/down.sql',
];

const MIGRACIONES_LEGITIMAS = [
  'db/migrations/20260907120000_orders_drop_unit_and_unit_price/migration.sql',
  'db/migrations/20260907120000_orders_drop_unit_and_unit_price/down.sql',
  'db/migrations/20260907183034_permissions_and_role_permissions/migration.sql',
  'db/migrations/20260907183034_permissions_and_role_permissions/down.sql',
];

const MIGRACION_QC83 = [
  'db/migrations/20260908210000_work_groups_and_members/migration.sql',
  'db/migrations/20260908210000_work_groups_and_members/down.sql',
];

const MIGRACION_QC66 = [
  'db/migrations/20260910120000_user_permissions_catalog/migration.sql',
  'db/migrations/20260910120000_user_permissions_catalog/down.sql',
];

const MIGRACION_QC80 = [
  'db/migrations/20260911120000_presentation_unit/migration.sql',
  'db/migrations/20260911120000_presentation_unit/down.sql',
];

const MIGRACION_QC86 = [
  'db/migrations/20260911120000_order_assignments/migration.sql',
  'db/migrations/20260911120000_order_assignments/down.sql',
];

const MIGRACION_QC49 = [
  'db/migrations/20260911130000_inventory_company_scope/migration.sql',
  'db/migrations/20260911130000_inventory_company_scope/down.sql',
];

const MIGRACION_QC23 = [
  'db/migrations/20260912103000_session_revocation/migration.sql',
  'db/migrations/20260912103000_session_revocation/down.sql',
];

const MIGRACION_QC81 = [
  'db/migrations/20260913120000_product_batch_lot_and_purchase_date/migration.sql',
  'db/migrations/20260913120000_product_batch_lot_and_purchase_date/down.sql',
];

// La migracion que da empresa a los pedidos: no toca ninguna tabla de recetas.
const MIGRACION_QC60 = [
  'db/migrations/20260915120000_orders_company_scope/migration.sql',
  'db/migrations/20260915120000_orders_company_scope/down.sql',
];

// La migracion que da empresa a las recetas (QC-50): `recipes` gana `company_id` NOT NULL y el
// unico de nombre pasa de global a `(company_id, name_normalized)`. Este contrato mira el DIFF
// contra `origin/dev`, asi que con los cambios sin commitear pasaba en verde igual -no muerde
// hasta que hay commit-.
const MIGRACION_QC50 = [
  'db/migrations/20260916120000_recipes_company_scope/migration.sql',
  'db/migrations/20260916120000_recipes_company_scope/down.sql',
];

// QC-68 (2026-09-17): el listado de pedidos busca por nombre de receta, y esa busqueda tiene
// que ver tambien las recetas dadas de baja -un pedido conserva la suya aunque la den de baja-.
// El indice parcial de QC-57 lleva `WHERE deleted_at IS NULL` y el planificador no puede usarlo
// para una consulta sin ese predicado, asi que hace falta un segundo indice GIN de trigramas
// TOTAL, sin `WHERE`, sobre la misma columna `recipes.name_normalized`. Migracion legitima de
// `db/`, ninguna otra tabla ni columna cambia.
const MIGRACION_QC68 = [
  'db/migrations/20260917130000_recipes_search_index_including_deleted/migration.sql',
  'db/migrations/20260917130000_recipes_search_index_including_deleted/down.sql',
];

// La migracion que da a producto su unidad de referencia y la existencia acumulada de sus lotes:
// no toca ninguna tabla de recetas.
const MIGRACION_QC121 = [
  'db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql',
  'db/migrations/20260918130000_product_unit_and_stored_stock/down.sql',
];

// QC-147 (2026-09-22): la linea de receta pasa de cantidad absoluta a PORCENTAJE. Toca la
// aritmetica nueva (`domain/recipe-percentage.ts`), el contrato de entrada y la vista de la
// linea (`recipe-input.ts`, `recipe-view.ts`), los tres casos de uso que la escriben o la leen
// (`create-recipe.ts`, `get-recipe.ts`, `update-recipe.ts`), el catalogo y el puerto del
// repositorio (`recipe-catalog.ts`, `ports/recipe-repository.ts`), los dos adaptadores de
// persistencia (`recipe-catalog-prisma.ts`, `recipe-prisma.ts`) y el barrel del contrato
// publico (`index.ts`). Exactamente los archivos que el diff de esta rama toca bajo
// `lib/modules/recetas/`, ninguno mas.
const CANTIDADES_EN_PORCENTAJE_QC147 = [
  'lib/modules/recetas/index.ts',
  'lib/modules/recetas/domain/create-recipe.ts',
  'lib/modules/recetas/domain/get-recipe.ts',
  'lib/modules/recetas/domain/recipe-catalog.ts',
  'lib/modules/recetas/domain/recipe-input.ts',
  'lib/modules/recetas/domain/recipe-percentage.ts',
  'lib/modules/recetas/domain/recipe-view.ts',
  'lib/modules/recetas/domain/update-recipe.ts',
  'lib/modules/recetas/ports/recipe-repository.ts',
  'lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts',
  'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts',
];

// La migracion que convierte la cantidad de la linea de receta a porcentaje: `recipes_lines`
// gana la columna de porcentaje y `db/schema.prisma` refleja el modelo nuevo.
const MIGRACION_QC147 = [
  'db/schema.prisma',
  'db/migrations/20260922160000_recipe_lines_percentage/migration.sql',
  'db/migrations/20260922160000_recipe_lines_percentage/down.sql',
];

export const RECETAS_PERMITIDAS: readonly string[] = [
  ...AMPLIACION_RECETAS_QC34,
  ...AUTORIZACION_POR_PERMISO_QC74,
  ...RENOMBRADO_DE_COMENTARIOS_QC70,
  ...AISLAMIENTO_POR_EMPRESA_QC50,
  ...CANTIDADES_EN_PORCENTAJE_QC147,
];

export const DB_PERMITIDAS: readonly string[] = [
  ...MIGRACION_QC34,
  ...MIGRACION_QC47,
  ...MIGRACIONES_LEGITIMAS,
  ...MIGRACION_QC83,
  ...MIGRACION_QC66,
  ...MIGRACION_QC80,
  ...MIGRACION_QC86,
  ...MIGRACION_QC49,
  ...MIGRACION_QC23,
  ...MIGRACION_QC81,
  ...MIGRACION_QC60,
  ...MIGRACION_QC50,
  ...MIGRACION_QC68,
  ...MIGRACION_QC121,
  ...MIGRACION_QC147,
];

/** Espera rutas con separadores POSIX, como las devuelve `git diff --name-only`. */
export function fueraDelAlcanceDeLaRama(
  diff: readonly string[],
  permitidas: { recetas?: readonly string[]; db?: readonly string[] } = {},
): { tocaRecetas: string[]; tocaDb: string[] } {
  const recetas = permitidas.recetas ?? RECETAS_PERMITIDAS;
  const db = permitidas.db ?? DB_PERMITIDAS;

  return {
    tocaRecetas: diff
      .filter((ruta) => ruta.startsWith('lib/modules/recetas/'))
      .filter((ruta) => !recetas.includes(ruta)),
    tocaDb: diff.filter((ruta) => ruta.startsWith('db/')).filter((ruta) => !db.includes(ruta)),
  };
}

describe('contrato de la ruta de recetas', () => {
  it('las tres rutas existen donde las ubican FORMULAS_ROUTE, NEW_RECIPE_ROUTE y recipeEditRoute', () => {
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);

    expect(NEW_RECIPE_ROUTE).toBe(`${FORMULAS_ROUTE}/nueva`);
    expect(existsSync(join(RAIZ, PAGE_NUEVA_PATH)), `deberia existir ${PAGE_NUEVA_PATH}`).toBe(
      true,
    );

    expect(recipeEditRoute('sonda-de-prueba')).toBe(`${FORMULAS_ROUTE}/sonda-de-prueba`);
    expect(existsSync(join(RAIZ, PAGE_EDICION_PATH)), `deberia existir ${PAGE_EDICION_PATH}`).toBe(
      true,
    );

    expect(FUENTES_DE_LA_RUTA.length).toBeGreaterThan(1);
  });

  it('ningun archivo de produccion incrusta el literal de la ruta y private-nav reexporta, no redeclara', () => {
    const conElLiteral: string[] = [];

    for (const carpeta of ['app', 'components', 'lib', 'hooks']) {
      if (!existsSync(join(RAIZ, carpeta))) continue;
      for (const ruta of fuentesBajo(carpeta)) {
        if (ruta === 'lib/shared/routes.ts') continue;
        const codigo = fuenteSinComentarios(ruta);
        if (LITERALES_DE_RUTA.some((literal) => codigo.includes(literal))) conElLiteral.push(ruta);
      }
    }

    expect(conElLiteral, 'el literal de la ruta solo puede vivir en lib/shared/routes.ts').toEqual(
      [],
    );

    expect(leer('lib/shared/routes.ts')).toContain('export const FORMULAS_ROUTE');

    expect(fuenteSinComentarios('lib/shared/navigation/private-nav.ts')).not.toContain(
      'const FORMULAS_ROUTE =',
    );
    expect(leer('lib/shared/navigation/private-nav.ts')).toContain('export { FORMULAS_ROUTE }');

    const enlaces = PRIVATE_NAV_ITEMS.filter((item): item is NavLink => item.kind === 'link');
    const recetasComoHijo = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).filter((item): item is NavLink => item.kind === 'link' && item.href === FORMULAS_ROUTE);
    expect([...enlaces, ...recetasComoHijo].some((enlace) => enlace.href === FORMULAS_ROUTE)).toBe(
      true,
    );
  });

  it('la pantalla no repite la comprobacion de permiso ni decide autorizacion sobre los datos', () => {
    // La autorizacion sobre los datos es de los casos de uso de `recetas`: comparar permisos o
    // resolver la sesion aqui seria otra regla que nadie mantiene sincronizada.
    ningunArchivoContiene([
      'requireAdmin',
      // No casa con `requirePagePermission`, que es lo que las paginas deben llamar.
      'requirePermission(',
      'assertPermission',
      'ADMIN_ROLE_NAME',
      'decideRouteAccess',
      'next/headers',
    ]);

    // Ampliacion estrecha: el listado consulta la sesion SOLO para decidir si monta la subida de
    // documentos, nunca para autorizar datos de recetas. Cualquier otro archivo de la ruta sigue
    // sin poder tocar la sesion.
    const PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR = enRutaDePosix(PAGE_PATH);

    ningunArchivoContiene(
      ['getSessionUser'],
      FUENTES_DE_LA_RUTA.filter((ruta) => ruta !== PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR),
    );

    const paginaDeListado = fuenteSinComentarios(PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR);
    expect(
      paginaDeListado.split('getSessionUser').length - 1,
      `${PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR} usa getSessionUser mas de una vez`,
    ).toBe(1);
    expect(
      paginaDeListado,
      `${PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR} solo puede usar la sesion para decidir si monta la subida`,
    ).toMatch(/canUploadDocuments\(\s*await\s+identity\.getSessionUser\(\)\s*\)/);
    // La linea que llama a la sesion no puede llevar ademas un permiso de recetas: eso volveria a
    // ser autorizar datos, no decidir si se monta la subida.
    const lineaConSesion = paginaDeListado
      .split('\n')
      .find((linea) => linea.includes('getSessionUser'));
    expect(lineaConSesion, `no se encontro la linea con getSessionUser`).toBeDefined();
    expect(
      lineaConSesion,
      `${PAGINA_QUE_CONSULTA_SESION_PARA_SUBIR}: la linea de la sesion no puede llevar un permiso de recetas`,
    ).not.toMatch(/recetas\.\w+/);
  });

  // El permiso que exigen las pantallas y el de su item de menu tienen que ser el mismo codigo: se
  // deriva del catalogo en vez de escribirse a mano.
  it('las tres pantallas exigen recetas.consultar y el item de menu declara ese mismo permiso (QC-75 R5, R6)', () => {
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'recetas' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener recetas.consultar').toBeDefined();

    for (const pagina of [PAGE_PATH, PAGE_NUEVA_PATH, PAGE_EDICION_PATH]) {
      expect(fuenteSinComentarios(pagina), `${pagina} deberia exigir su permiso`).toContain(
        `requirePagePermission('${permiso?.code}')`,
      );
    }

    const enlace = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item): item is NavLink => item.kind === 'link' && item.href === FORMULAS_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });

  it('R2, R3: la lista no puede pintar quien creo o modifico una receta ni su descripcion', () => {
    // Lo prohibido es leer o declarar esos campos como columna, no nombrarlos: la declaracion de
    // columnas los nombra justo para excluirlos del tipo.
    ningunArchivoContiene([
      '.createdBy',
      '.updatedBy',
      "key: 'createdBy'",
      "key: 'updatedBy'",
      "'recipe-column-createdBy'",
      "'recipe-column-updatedBy'",
    ]);

    const columnas = fuenteSinComentarios(COLUMNAS_PATH);
    expect(columnas).toContain('Exclude<keyof RecipeSummary');
    expect(columnas).toContain("'createdBy'");
    expect(columnas).toContain("'updatedBy'");

    // Mismo criterio que la autoria: el nombre solo puede aparecer para excluirlo del tipo de id.
    expect(columnas).toContain("'description'");
    expect(columnas, `${COLUMNAS_PATH} no debe leer la descripcion`).not.toContain('.description');
    expect(columnas, `${COLUMNAS_PATH} no debe declarar la columna de descripcion`).not.toMatch(
      /id:\s*['"`]description['"`]/,
    );
  });

  it('pintar una pagina de lista cuesta una sola invocacion de listado y ningun archivo de la lista lleva la marca de producto de baja', () => {
    // Pintar en la lista la marca de producto de baja exigiria una consulta de detalle por fila.
    ningunArchivoContiene(
      ['recipe-line-unavailable', 'recipe-lines-unavailable-notice'],
      ARCHIVOS_DE_LA_LISTA,
    );

    ningunArchivoContiene(['getRecipeAction'], ARCHIVOS_DE_LA_LISTA);

    let invocacionesDeListado = 0;
    for (const ruta of FUENTES_DE_LA_RUTA) {
      const veces = fuenteSinComentarios(ruta).split('listRecipesAction(').length - 1;
      invocacionesDeListado += veces;
    }
    expect(invocacionesDeListado, 'listRecipesAction debe invocarse una sola vez en toda la ruta').toBe(
      1,
    );
  });

  it('R10: ningun archivo de tabla o columnas ordena, filtra ni recorta las filas recibidas', () => {
    for (const ruta of ARCHIVOS_DE_TABLA_Y_COLUMNAS) {
      let codigo = fuenteSinComentarios(ruta);
      for (const permitido of RECORTES_DE_TEXTO_PERMITIDOS) {
        codigo = codigo.split(permitido).join('');
      }
      for (const operacion of OPERACIONES_SOBRE_FILAS) {
        expect(codigo, `${ruta} no debe aplicar «${operacion}» a las filas`).not.toContain(
          operacion,
        );
      }
    }

    // Las filas llegan a la tabla compartida tal cual las devolvio la operacion de listado.
    const seccion = fuenteSinComentarios(ARCHIVOS_DE_TABLA_Y_COLUMNAS[0]);
    expect(seccion).toMatch(/recipes=\{items\}/);
    const tabla = fuenteSinComentarios(ARCHIVOS_DE_TABLA_Y_COLUMNAS[1]);
    expect(tabla).toMatch(/rows=\{recipes\}/);

    // Ordenar es cosa del servidor: la ruta no arma consultas.
    ningunArchivoContiene(['orderBy']);
  });

  it('R11: el parser deriva los campos de RECIPE_QUERYABLE del barrel y no mantiene copia a mano', () => {
    const parser = fuenteSinComentarios(PARSER_PATH);

    expect(parser).toMatch(
      /import\s*\{[^}]*\bRECIPE_QUERYABLE\b[^}]*\}\s*from\s*'@\/lib\/modules\/recetas';/,
    );
    expect(parser, 'el parser no puede leer la lista blanca por ruta profunda').not.toContain(
      "'@/lib/modules/recetas/",
    );
    expect(parser).toContain('RECIPE_QUERYABLE.sortable');
    expect(parser).toContain('RECIPE_QUERYABLE.filterable');
    expect(parser).toContain('RECIPE_QUERYABLE.searchable');

    // El unico literal de campo admitido es el id de la columna del filtro de fecha, que la
    // tabla compartida necesita para indexar `filters`; cualquier otro seria una copia.
    const campos = [
      ...new Set([...RECIPE_QUERYABLE.sortable, ...Object.keys(RECIPE_QUERYABLE.filterable)]),
    ];
    expect(campos.length).toBeGreaterThan(0);

    const lineas = parser.split('\n');
    for (const campo of campos) {
      const literales = [`'${campo}'`, `"${campo}"`, `\`${campo}\``];
      for (const linea of lineas) {
        if (!literales.some((literal) => linea.includes(literal))) continue;
        expect(
          linea,
          `${PARSER_PATH} escribe a mano el campo «${campo}» fuera de CREATED_AT_COLUMN_ID`,
        ).toMatch(/^export const CREATED_AT_COLUMN_ID = /);
      }
    }
  });

  it('la imagen se pinta con la direccion que entrega la consulta y ningun archivo compone una URL de almacenamiento', () => {
    ningunArchivoContiene(['process.env', 'NEXT_PUBLIC_SUPABASE', 'supabase', '.storage.']);

    const columnas = fuenteSinComentarios(COLUMNAS_PATH);
    expect(columnas).toContain('recipe.imageUrl');
    expect(columnas).not.toContain('${recipe.imageUrl}');
  });

  it('el guardado sale por createRecipeAction o updateRecipeAction y no existe ninguna operacion por linea ni por paso', () => {
    const formulario = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'recipe-form.tsx').split('\\').join('/'),
    );
    expect(formulario).toContain('createRecipeAction');
    expect(formulario).toContain('updateRecipeAction');

    const permitidas = new Set([
      'createRecipeAction',
      'updateRecipeAction',
      'deleteRecipeAction',
      'getRecipeAction',
      'listRecipesAction',
      'listProductsAction',
      'listUnitsAction',
    ]);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      const codigo = fuenteSinComentarios(ruta);
      const patron = /([A-Za-z][A-Za-z0-9_]*Action)\(/g;
      let encaje: RegExpExecArray | null;
      while ((encaje = patron.exec(codigo)) !== null) {
        expect(
          permitidas.has(encaje[1]),
          `${ruta}: «${encaje[1]}» no es una de las siete operaciones publicadas`,
        ).toBe(true);
      }
    }
  });

  it('el layout privado monta la region de avisos y la ruta no monta otra', () => {
    // Una segunda region de avisos competiria con la del layout por anunciar lo mismo.
    const layout = fuenteSinComentarios(LAYOUT_PRIVADO_PATH);
    expect(layout).toContain('@/components/ui/sonner');
    expect(layout).toContain('<Toaster');

    ningunArchivoContiene(['<Toaster', '@/components/ui/sonner']);
  });

  it('el selector de producto no filtra en cliente y pide el tamano de pagina importado', () => {
    const selector = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'product-picker.tsx').split('\\').join('/'),
    );
    expect(selector).not.toContain('.filter(');
    expect(selector).toContain('listProductsAction({ page');
    expect(selector).toContain('pageSize: MAX_PAGE_SIZE');
    expect(selector).not.toMatch(/pageSize:\s*25/);

    ningunArchivoContiene(['.filter('], [
      join(COMPONENTES_PATH, 'product-picker.tsx').split('\\').join('/'),
    ]);
  });

  it('el porcentaje nunca se convierte a numero en ningun archivo de la ruta', () => {
    ningunArchivoContiene(['parseFloat(', 'Number.parseFloat(', 'toFixed(']);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      for (const linea of fuenteSinComentarios(ruta).split('\n')) {
        if (!linea.includes('percentage')) continue;
        expect(linea, `${ruta}: el porcentaje no puede pasar por «Number(»`).not.toContain('Number(');
      }
    }
  });

  it('la pantalla obtiene las unidades solo por listUnitsAction y ninguna operacion de escritura de unidades entra en esta feature', () => {
    ningunArchivoContiene([
      'createUnit',
      'updateUnit',
      'deleteUnit',
      'renameUnit',
      'unit-catalog-prisma',
      'unit-prisma',
      'prisma.unit',
    ]);

    const paginaAlta = fuenteSinComentarios(PAGE_NUEVA_PATH.split('\\').join('/'));
    const paginaEdicion = fuenteSinComentarios(PAGE_EDICION_PATH.split('\\').join('/'));
    expect(paginaAlta).toContain('listUnitsAction');
    expect(paginaEdicion).toContain('listUnitsAction');
  });

  it('la feature no toca lib/modules/recetas ni db/', () => {
    let diff: string[] = [];
    let rangoDisponible = true;
    try {
      const salida = execSync('git diff --name-only origin/dev...HEAD', {
        cwd: RAIZ,
        encoding: 'utf8',
      });
      diff = salida.split('\n').map((linea) => linea.trim()).filter((linea) => linea.length > 0);
    } catch {
      rangoDisponible = false;
    }

    expect(
      rangoDisponible,
      'el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada',
    ).toBe(true);

    // Esta comprobacion protege la ruta de recetas-ui, no cualquier rama del repo: un diff
    // vacio de esa carpeta no significa "nada que revisar", significa que quien corre este
    // archivo no es la dueña de la ruta y no le corresponde afirmar nada sobre lib/modules/recetas
    // ni db/ -afirmarlo igual la convertia en un barrido global que se disparaba con cualquier
    // rama ajena que tocara ese modulo por un motivo legitimo propio-.
    const carpetaRutaPosix = `${enRutaDePosix(CARPETA_RUTA)}/`;
    const tocaLaRuta = diff.some((ruta) => ruta.startsWith(carpetaRutaPosix));
    if (!tocaLaRuta) {
      return;
    }

    // Una entrada cuyo archivo se borro o renombro dejaria la ruta abierta sin que nadie lo note.
    for (const ruta of [...RECETAS_PERMITIDAS, ...DB_PERMITIDAS]) {
      expect(
        existsSync(join(RAIZ, ruta)),
        `«${ruta}» figura como ruta permitida pero ya no existe: si se borro o se renombro, ` +
          'quita tambien su entrada de la lista de la ficha que la nombro',
      ).toBe(true);
    }

    const { tocaRecetas, tocaDb } = fueraDelAlcanceDeLaRama(diff);

    expect(
      tocaRecetas,
      'ningun archivo de lib/modules/recetas/ fuera de las ampliaciones nombradas deberia estar en el diff',
    ).toEqual([]);
    expect(
      tocaDb,
      'ningun archivo de db/ fuera de las migraciones nombradas deberia estar en el diff',
    ).toEqual([]);
  });

  it('package.json solo incorpora los tres paquetes de arrastre aprobados y sus filas declaran el check fallido', () => {
    // El porque de la excepcion esta en `docs/dependencias.md`.
    const packageJson = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const instaladas = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };

    for (const paquete of ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']) {
      expect(instaladas, `deberia estar instalado «${paquete}»`).toHaveProperty(paquete);
    }

    const dependencias = leer('docs/dependencias.md');
    for (const paquete of ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']) {
      const fila = dependencias
        .split('\n')
        .find((linea) => linea.includes(`\`${paquete}\``));
      expect(fila, `deberia existir la fila de «${paquete}» en docs/dependencias.md`).toBeDefined();
      expect(fila).toContain('excepcion');
      expect(fila).toContain('CHECK 2');
    }

    const conDndKit: string[] = [];
    for (const ruta of FUENTES_DE_LA_RUTA) {
      if (fuenteSinComentarios(ruta).includes('@dnd-kit')) conDndKit.push(ruta);
    }
    expect(conDndKit).toEqual([join(COMPONENTES_PATH, 'recipe-steps-field.tsx').split('\\').join('/')]);
  });

  it('los componentes de ruta se exponen por el barrel, las tres paginas importan solo del barrel y no queda ningun componente suelto', () => {
    // Regla de `docs/architecture.md > Componentes`.
    const barrel = fuenteSinComentarios(BARREL_PATH.split('\\').join('/'));

    for (const ruta of FUENTES_DE_LA_RUTA) {
      if (!ruta.includes('/components/') || ruta.endsWith('/index.ts')) continue;
      const nombreDeArchivo = ruta.split('/').pop() as string;
      if (FUERA_DEL_BARREL.includes(nombreDeArchivo)) {
        // Tambien tiene que seguir existiendo, o la excepcion serviria para dejar de exponer
        // componentes sin que nadie se entere.
        const modulo = `./${nombreDeArchivo.replace(/\.tsx?$/, '')}`;
        expect(
          existsSync(join(RAIZ, ruta)),
          `${nombreDeArchivo} figura como excepcion del barrel pero ya no existe: si se ha ` +
            'borrado o renombrado, quita tambien la excepcion',
        ).toBe(true);
        expect(
          barrel,
          `${nombreDeArchivo} NO puede reexportarse desde el barrel (ver FUERA_DEL_BARREL)`,
        ).not.toContain(`from '${modulo}'`);
        continue;
      }
      const modulo = `./${nombreDeArchivo.replace(/\.tsx?$/, '')}`;
      expect(barrel, `el barrel debe reexportar ${modulo}`).toContain(`from '${modulo}'`);
    }

    const paginaLista = fuenteSinComentarios(PAGE_PATH.split('\\').join('/'));
    expect(paginaLista).toContain("from './components'");
    expect(paginaLista).not.toContain("from './components/");

    const paginaNueva = fuenteSinComentarios(PAGE_NUEVA_PATH.split('\\').join('/'));
    expect(paginaNueva).toContain("from '../components'");
    expect(paginaNueva).not.toContain("from '../components/");

    const paginaEdicion = fuenteSinComentarios(PAGE_EDICION_PATH.split('\\').join('/'));
    expect(paginaEdicion).toContain("from '../components'");
    expect(paginaEdicion).not.toContain("from '../components/");

    // La frontera cliente/servidor se declara en cada componente, no en el barrel.
    expect(barrel).not.toContain('use client');

    const CARPETAS_LEGITIMAS = ['components', 'nueva', '[id]'];
    const raizDeLaRuta = readdirSync(join(RAIZ, CARPETA_RUTA), { withFileTypes: true });
    const archivosDeAppRouter = ['page.tsx', 'layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx'];

    const carpetasEncontradas = raizDeLaRuta.filter((entrada) => entrada.isDirectory()).map((entrada) => entrada.name);
    expect([...carpetasEncontradas].sort()).toEqual([...CARPETAS_LEGITIMAS].sort());

    for (const entrada of raizDeLaRuta) {
      if (entrada.isDirectory()) continue;
      expect(archivosDeAppRouter, `${entrada.name} no es un archivo del App Router`).toContain(
        entrada.name,
      );
    }

    for (const carpeta of [CARPETA_NUEVA, CARPETA_EDICION]) {
      const entradas = readdirSync(join(RAIZ, carpeta), { withFileTypes: true });
      for (const entrada of entradas) {
        expect(entrada.isDirectory(), `${carpeta} no deberia tener subcarpetas`).toBe(false);
        expect(
          archivosDeAppRouter,
          `${carpeta}/${entrada.name} no es un archivo del App Router`,
        ).toContain(entrada.name);
      }
    }
  });

  it('ningun archivo de la ruta usa fetch a rutas API propias', () => {
    // Lo prohibe `docs/architecture.md`: las mutaciones van por Server Actions.
    ningunArchivoContiene(['fetch(', "'/api/", '"/api/', 'axios', 'XMLHttpRequest']);
  });

  it('las primitivas de components/ui que usa la ruta existen y ninguna se escribio a mano', () => {
    // Las primitivas vienen del CLI de shadcn/ui.
    for (const primitiva of ['table.tsx', 'select.tsx', 'alert-dialog.tsx', 'button.tsx', 'input.tsx', 'label.tsx', 'skeleton.tsx', 'autocomplete.tsx']) {
      expect(
        existsSync(join(RAIZ, 'components', 'ui', primitiva)),
        `falta components/ui/${primitiva}`,
      ).toBe(true);
    }

    ningunArchivoContiene(['<table', '<dialog', 'role="dialog"', 'createPortal']);
  });

  it('los componentes de cliente no importan composicion, Prisma ni sesion por su cuenta', () => {
    // Los datos bajan por props desde el Server Component o salen de una Server Action.
    expect(FUENTES_DE_CLIENTE.length).toBeGreaterThan(0);

    ningunArchivoContiene(
      ['@/lib/composition', '@prisma/client', 'prisma.', 'supabase', 'next/headers'],
      FUENTES_DE_CLIENTE,
    );
  });

  it('no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente', () => {
    // Sobre la fuente porque jsdom no puede observar nada de esto.
    const utilidadesQueOcultan = ['hidden', 'invisible', 'opacity-0', 'sr-only', 'scale-0'];

    let controlesVigilados = 0;
    const archivosConControles = new Set<string>();

    for (const ruta of FUENTES_DE_LA_RUTA) {
      const codigo = fuenteSinComentarios(ruta);

      expect(codigo, `${ruta} no debe usar 100vh`).not.toContain('100vh');

      for (const linea of codigo.split('\n')) {
        if (!linea.includes('hover:') && !linea.includes('group-hover:')) continue;
        for (const utilidad of utilidadesQueOcultan) {
          expect(
            linea,
            `${ruta}: «hover» no puede ser la unica via de revelar «${utilidad}»`,
          ).not.toContain(utilidad);
        }
      }

      // Control a control: medido por archivo, un campo entero puede perder la clase sin que nada
      // se ponga rojo.
      const constantesTactiles = constantesConLaClase(codigo, 'min-h-11');
      const constantesDeFuente = constantesConLaClase(codigo, 'text-base');

      for (const nombre of CONTROLES_VIGILADOS) {
        const todasLasEtiquetas = etiquetasDeApertura(codigo, nombre, lineasOriginales(ruta));

        // Si el lector no ve una etiqueta que el archivo escribe, la guardia pasaria sin mirarla.
        if (codigo.includes(`<${nombre}`)) {
          expect(
            todasLasEtiquetas.length,
            `${ruta}: escribe <${nombre} pero la guardia no leyo ninguna etiqueta`,
          ).toBeGreaterThan(0);
        }

        const etiquetas = todasLasEtiquetas.filter(({ texto }) => vigilaLaEtiqueta(nombre, texto));

        for (const { texto, linea } of etiquetas) {
          const className = valorDeAtributo(texto, 'className');
          const control = `${ruta}:${linea} <${nombre}> (${identificaAlControl(texto)})`;
          controlesVigilados += 1;
          archivosConControles.add(ruta);

          expect(
            llevaLaClase(className, 'min-h-11', constantesTactiles),
            `${control} debe forzar el area tactil en SU className (min-h-11, literal o via constante local)`,
          ).toBe(true);

          if (CONTROLES_CON_FUENTE.includes(nombre)) {
            expect(
              llevaLaClase(className, 'text-base', constantesDeFuente),
              `${control} debe fijar 16px en SU className (text-base, literal o via constante local)`,
            ).toBe(true);
          }
        }
      }
    }

    expect(controlesVigilados, 'R50 no esta vigilando ningun control').toBeGreaterThan(0);
    expect(archivosConControles.size).toBeGreaterThan(0);
  });

  it('la feature no duplica el armazon heredado: layout, sidebar, avisos y primitivas siguen siendo unicos', () => {
    expect(existsSync(join(RAIZ, LAYOUT_PRIVADO_PATH))).toBe(true);
    expect(existsSync(join(RAIZ, 'components', 'private', 'app-sidebar.tsx'))).toBe(true);

    // Solo bajo la ruta de recetas: contar los `layout.tsx` de `app/(private)` entera pondria esto
    // rojo cuando otra ruta anada legitimamente un layout anidado.
    expect(existsSync(join(RAIZ, CARPETA_RUTA)), `deberia existir ${CARPETA_RUTA}`).toBe(true);
    expect(
      FUENTES_DE_LA_RUTA.length,
      `${CARPETA_RUTA} no tiene fuentes: el censo de layouts no comprobaria nada`,
    ).toBeGreaterThan(0);
    expect(
      FUENTES_DE_LA_RUTA.filter((ruta) => ruta.endsWith('/layout.tsx')),
      `ningun archivo bajo ${CARPETA_RUTA} puede ser un layout: la ruta hereda el de la zona privada`,
    ).toEqual([]);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      expect(ruta, 'la ruta no declara su propio layout').not.toContain('/layout.tsx');
      expect(ruta, 'la ruta no re-crea la barra lateral').not.toContain('sidebar');
    }

    ningunArchivoContiene(['<main', 'SidebarInset', 'SidebarProvider', 'AppSidebar']);

    expect(
      fuentesBajo('lib').filter((ruta) =>
        fuenteSinComentarios(ruta).includes('export const PRIVATE_NAV_ITEMS'),
      ),
    ).toHaveLength(1);
  });
});

/**
 * Que el asistente de lectura solo se alcance desde el modal de vista previa no lo puede afirmar un
 * test de DOM: una `page.tsx` nueva que lo montase renderizaria perfectamente.
 */
describe('QC-64 R12 — el asistente de lectura no tiene ruta propia', () => {
  const SENALES_DEL_ASISTENTE = ['StepReader', 'step-reader'] as const;

  /** El separador de linea, sin escribirlo como escape en un literal. */
  const SALTO_DE_LINEA = String.fromCharCode(10);

  const IMPORTS_DEL_ASISTENTE = [
    '@/components/shared/step-reader',
    'components/shared/step-reader',
  ] as const;

  const UNICO_MONTADOR = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-form.tsx'));

  /**
   * SEGUNDO montador, anadido el 2026-09-17: la pantalla de ejecucion de un pedido asignado lo
   * MONTA por props, que es lo que la cabecera del propio asistente dejo previsto -«podra montarlo
   * pasandole otro `onFinish` sin tocar una linea de aqui»-. R12 sigue intacta: lo que prohibe es
   * que el asistente tenga RUTA PROPIA, no que se monte desde otra pantalla. Se nombra el archivo
   * EXACTO, nunca la carpeta.
   */
  const MONTADOR_DE_EJECUCION =
    'app/(private)/asignacion/[id]/components/order-execution-screen.tsx';

  /**
   * Por nombre y no por carpeta: un test nuevo que lo montase en otro sitio tiene que salir en la
   * lista. Este mismo archivo esta porque escribe el nombre para poder prohibirlo.
   */
  const TESTS_QUE_LO_NOMBRAN = [
    'tests/unit/recetas-ui/step-reader.test.tsx',
    'tests/unit/recetas-ui/recipe-route-contract.test.ts',
    'tests/guards/guard-editor-aislado.test.ts',
    'tests/unit/asignaciones-ui/order-execution-screen.test.tsx',
  ] as const;

  it('ninguna page.tsx del repo monta el asistente', () => {
    const paginas = fuentesBajo('app').filter((ruta) => ruta.endsWith('/page.tsx'));
    expect(paginas.length, 'no se encontro ninguna page.tsx: la guardia no comprobaria nada').
      toBeGreaterThan(0);

    for (const pagina of paginas) {
      const codigo = fuenteSinComentarios(pagina);
      for (const senal of SENALES_DEL_ASISTENTE) {
        expect(
          codigo,
          `${pagina} monta el asistente: R12 dice que solo se alcanza por el modal de vista previa`,
        ).not.toContain(senal);
      }
    }
  });

  it('lib/shared/routes.ts no gana ninguna constante para el asistente y publica exactamente las de hoy', () => {
    const rutas = fuenteSinComentarios('lib/shared/routes.ts');

    const alude = /asistente|lectura|leer|ejecucion|ejecutar|reader|read|run|execute|paso|step|guia|wizard/i;
    for (const linea of rutas.split(SALTO_DE_LINEA)) {
      const declaracion = /export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/.exec(linea);
      if (declaracion === null) continue;
      expect(
        declaracion[1],
        `«${declaracion[1]}» parece una ruta del asistente, y R12 dice que no tiene ninguna`,
      ).not.toMatch(alude);
      expect(linea, `${declaracion[1]} apunta a una URL del asistente`).not.toMatch(
        /['"`]\/[^'"`]*(step|paso|lectura|leer|ejecutar|ejecucion|reader)[^'"`]*['"`]/i,
      );
    }

    // Igualdad exacta: una constante nueva que se llame de otra forma no pasaria el patron de
    // arriba, y asi tiene que pasar por aqui y por quien la revise.
    const exportadas = [...rutas.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)].map(
      (encaje) => encaje[1],
    );
    expect(exportadas.sort()).toEqual(
      [
        'ASSIGNED_ORDERS_ROUTE',
        'CREDENTIAL_SETUP_ROUTE',
        'DASHBOARD_ROUTE',
        // Alta el 2026-09-17: la trae el aviso de entrega de QC-63. NO es una ruta ni una funcion
        // de ruta: es el NOMBRE DE UN PARAMETRO DE CONSULTA de la lista de pedidos asignados
        // (`?entregado=<numero>`), que la pantalla de ejecucion pone al volver y la lista lee para
        // pintar la confirmacion. Verificado antes de darla de alta: no estrena ninguna ruta del
        // asistente de lectura -no la marca el patron de arriba ni apunta a ninguna URL-, asi que
        // R12 de QC-64 sigue INTACTA. La lista sigue siendo CERRADA y por igualdad exacta: una
        // constante mas vuelve a ponerla en rojo.
        'DELIVERED_ORDER_PARAM',
        'FORGOT_PASSWORD_ROUTE',
        'FORMULAS_ROUTE',
        'INVENTORY_ROUTE',
        'LOGIN_ROUTE',
        // No es una pantalla: el destino del login tras un corte de sesion, derivado de LOGIN_ROUTE.
        'LOGIN_ROUTE_SESSION_ENDED',
        'NEW_RECIPE_ROUTE',
        'ORDERS_ROUTE',
        'PRESENTATIONS_ROUTE',
        'PRIVATE_ROUTE_PREFIXES',
        // No es una ruta: el nombre del parametro de LOGIN_ROUTE_SESSION_ENDED.
        'SESSION_ENDED_PARAM',
        'SUPPLIERS_ROUTE',
        'UNITS_ROUTE',
        'assignedOrderRoute',
        'credentialSetupRoute',
        'USERS_ROUTE',
        'recipeEditRoute',
        // Alta el 2026-09-24: la revision de un catalogo importado desde PDF, derivada de
        // `supplierDetailRoute` (`/proveedores/<id>/importar/<archivo>`). No es del asistente de
        // lectura: no la marca el patron de arriba ni apunta a ninguna de sus URL. La lista sigue
        // CERRADA.
        'supplierCatalogImportRoute',
        'supplierDetailRoute',
      ].sort(),
    );
  });

  it('el asistente solo se importa desde recipe-form.tsx', () => {
    const importadores: string[] = [];

    for (const carpeta of ['app', 'components', 'lib', 'hooks', 'tests', 'e2e']) {
      if (!existsSync(join(RAIZ, carpeta))) continue;
      for (const ruta of fuentesBajo(carpeta)) {
        if ((TESTS_QUE_LO_NOMBRAN as readonly string[]).includes(ruta)) continue;
        const codigo = fuenteSinComentarios(ruta);
        if (IMPORTS_DEL_ASISTENTE.some((importado) => codigo.includes(importado))) {
          importadores.push(ruta);
        }
      }
    }

    expect(importadores.sort()).toEqual([MONTADOR_DE_EJECUCION, UNICO_MONTADOR].sort());
  });

  it('el listado del catalogo no enlaza ni menciona el asistente', () => {
    // La tabla y la seccion de lista son las dos puertas por las que entraria ese enlace.
    for (const archivo of ['recipe-table.tsx', 'recipe-list-section.tsx']) {
      const codigo = fuenteSinComentarios(enRutaDePosix(join(COMPONENTES_PATH, archivo)));
      for (const senal of SENALES_DEL_ASISTENTE) {
        expect(codigo, `${archivo} no puede enlazar el asistente`).not.toContain(senal);
      }
    }
  });
});
