import type { RecipeSummary } from '@/lib/modules/recetas';

/**
 * Declaracion de las columnas de la tabla de recetas (R8, R9, `design.md > 4.3`).
 *
 * Las columnas son DATOS, no JSX: la tabla las recorre y el test de R8/R9 itera esta misma
 * declaracion en vez de listar los literales uno a uno. Anadir una columna es anadir una fila
 * aqui, y eso es justo lo que el test en negativo de R9 vigila.
 *
 * Archivo sin `'use client'` a proposito: solo declara datos y funciones puras de presentacion,
 * asi que lo pueden importar tanto el Server Component de la lista como los componentes de
 * cliente sin arrastrar frontera alguna.
 */

/**
 * Campos de `RecipeSummary` que la decision del 2026-09-03 deja FUERA de la tabla (R9): el
 * identificador tecnico y los dos ids de autoria, que el backend guarda como identificadores y
 * nadie resuelve a nombres.
 */
type HiddenRecipeField = 'id' | 'createdBy' | 'updatedBy';

/**
 * Clave valida de columna. **Es la primera defensa de R9, y es de tipos**: escribir
 * `key: 'createdBy'` en la tabla de abajo no compila. El test en negativo sigue haciendo falta
 * -el tipo no impide anadir una columna con un `key` valido que pinte el autor-, pero el error
 * mas probable se detiene antes de llegar al test.
 */
export type RecipeColumnKey = Exclude<keyof RecipeSummary, HiddenRecipeField>;

export type RecipeColumn = {
  readonly key: RecipeColumnKey;
  readonly label: string;
  readonly testId: string;
  /** Alineacion del contenido: los numeros a la derecha, el texto a la izquierda. */
  readonly align: 'start' | 'end';
  /**
   * Texto de la celda. Devuelve SIEMPRE cadena: la tabla no formatea nada por su cuenta.
   * La columna de imagen es la unica excepcion visual -se pinta con un componente propio- y
   * por eso no aparece aqui: la declaracion cubre solo las columnas de TEXTO (R8).
   */
  readonly value: (recipe: RecipeSummary) => string;
};

/** Marca de "sin dato" para las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla. Determinista aqui,
 * legible en cualquier maquina.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Las columnas de negocio de texto (R8): nombre, descripcion, numero de pasos, creado y
 * actualizado. La imagen se pinta aparte, en su propia celda (`RecipeTable`), porque no es
 * texto: `imageUrl` se usa TAL CUAL o se pinta un marcador (R18), y una columna declarativa que
 * devuelve cadena no puede representar eso sin inventar un formato propio.
 */
export const RECIPE_COLUMNS: readonly RecipeColumn[] = [
  {
    key: 'name',
    label: 'Nombre',
    testId: 'recipe-column-name',
    align: 'start',
    value: (recipe) => recipe.name,
  },
  {
    key: 'description',
    label: 'Descripción',
    testId: 'recipe-column-description',
    align: 'start',
    value: (recipe) => recipe.description ?? EMPTY_CELL,
  },
  {
    key: 'stepCount',
    label: 'Pasos',
    testId: 'recipe-column-stepCount',
    align: 'end',
    value: (recipe) => String(recipe.stepCount),
  },
  {
    key: 'createdAt',
    label: 'Creado',
    testId: 'recipe-column-createdAt',
    align: 'start',
    value: (recipe) => formatDate(recipe.createdAt),
  },
  {
    key: 'updatedAt',
    label: 'Actualizado',
    testId: 'recipe-column-updatedAt',
    align: 'start',
    value: (recipe) => formatDate(recipe.updatedAt),
  },
];
