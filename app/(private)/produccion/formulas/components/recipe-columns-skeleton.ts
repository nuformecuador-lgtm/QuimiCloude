/**
 * Celdas por fila del esqueleto de la lista de recetas.
 *
 * Archivo aparte y sin `'use client'`: el esqueleto lo pinta un Server Component, e importar
 * `buildRecipeColumns` arrastraria la frontera de cliente hasta la pagina. Un test ata este numero
 * a la longitud real de las columnas para que no se quede atras.
 */
export const RECIPE_SKELETON_COLUMN_COUNT = 6;
