/**
 * Cuantas celdas por fila pinta el esqueleto del catalogo (R24).
 *
 * **No se importa `buildCatalogColumns`** a proposito, y es el mismo reparto que ya tenian pedidos
 * e inventario: esa declaracion es una FACTORIA de **cliente** -sus celdas montan el panel de
 * edicion y el dialogo de baja- y este esqueleto lo renderiza un Server Component. Importarla
 * arrastraria la frontera de cliente hasta la pagina de detalle.
 *
 * Para que el numero no se quede atras en silencio, el test de esta ruta lo ata a la longitud real
 * de `buildCatalogColumns(...)`: cambiar una sin la otra pone la suite en rojo.
 */
export const CATALOG_SKELETON_COLUMN_COUNT = 10;
