/**
 * Cuantas celdas por fila pinta el esqueleto de la lista (R15).
 *
 * **No se importa `buildProductColumns`** a proposito, y es el mismo reparto que ya tenia pedidos
 * con `ORDER_SKELETON_COLUMN_COUNT`: esa declaracion es una FACTORIA de **cliente** -sus celdas
 * montan el panel de edicion y el dialogo de baja- y este esqueleto lo renderiza un Server
 * Component. Importarla arrastraria la frontera de cliente hasta la pagina.
 *
 * Para que el numero no se quede atras en silencio, el test de esta ruta lo ata a la longitud
 * real de `buildProductColumns(...)`: cambiar una sin la otra pone la suite en rojo.
 *
 * Archivo aparte -y sin `'use client'`- justamente para poder importarse desde el servidor sin
 * tocar la declaracion de columnas.
 */
export const PRODUCT_SKELETON_COLUMN_COUNT = 7;
