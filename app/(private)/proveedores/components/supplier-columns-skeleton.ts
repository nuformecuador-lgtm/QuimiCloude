/**
 * Celdas por fila del esqueleto de la lista de proveedores.
 *
 * Archivo aparte y sin `'use client'`: el esqueleto lo pinta un Server Component, e importar
 * `buildSupplierColumns` arrastraria la frontera de cliente hasta la pagina. Un test ata este
 * numero a la longitud real de las columnas para que no se quede atras.
 */
export const SUPPLIER_SKELETON_COLUMN_COUNT = 6;
