import { listCatalogLinesAction } from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { buildCatalogDirectories } from './catalog-directories';
import { CatalogListEmpty } from './catalog-list-empty';
import { CatalogListError } from './catalog-list-error';
import { buildCatalogListQuery, type CatalogPageSize } from './catalog-list-params';
import { CatalogListToolbar } from './catalog-list-toolbar';
import { CatalogTable } from './catalog-table';

/** La primera pagina, a la que vuelve el estado vacio cuando la pedida se quedo atras. */
const FIRST_PAGE = 1;

type CatalogListSectionProps = {
  readonly supplierId: string;
  readonly page: number;
  readonly pageSize: CatalogPageSize;
  /**
   * Catalogo de unidades, pedido **una sola vez** por la pagina de detalle con `listUnitsAction()`
   * y bajado por props (R46, `design.md > 8.2`). Es el punto por el que T15 enchufa el panel
   * lateral de la linea -`CatalogLineSheet` -> `CatalogLineForm` -> `UnitSelect`-, tanto en el
   * estado vacio como en las acciones de fila; declararlo ya evita que T15 tenga que cambiar la
   * firma de la pagina y del propio Server Component.
   */
  readonly units: readonly UnitRef[];
};

/**
 * Seccion del catalogo: pide los datos y despacha a uno de los tres estados (R21, R23, R25,
 * `design.md > 6`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina de detalle envuelve en `<Suspense>`, de modo que el
 * esqueleto de R24 aparece solo mientras esta consulta esta en vuelo.
 *
 * **R7**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite `requireAdmin`
 * y no se ocultan columnas por rol: la autorizacion la aporta el caso de uso, y si responde
 * `unauthorized` se pinta el estado de error **sin una sola linea del catalogo**.
 *
 * **Los diccionarios se construyen UNA vez, aqui, y solo cuando hay filas que pintar** (R22,
 * `design.md > 6.2`): nunca por fila, y nunca cuando la consulta fallo o el catalogo esta vacio,
 * porque entonces no hay ningun identificador que resolver.
 *
 * **Un catalogo vacio NO se pinta como tabla sin filas** (R23, R25): son tres situaciones
 * distintas -fallo, catalogo vacio y pagina que se quedo atras tras una baja- y cada una dice lo
 * suyo.
 */
export async function CatalogListSection({
  supplierId,
  page,
  pageSize,
  units,
}: CatalogListSectionProps) {
  // Las unidades viajan hasta aqui para que T15 las entregue al panel lateral de la linea sin
  // cambiar ninguna firma. Todavia no hay panel: esta tanda cierra la parte de LECTURA del
  // catalogo (T10-T14). Se marca como deliberadamente sin consumir en lugar de dejar de pedirlas
  // y tener que volver a cablearlas.
  void units;

  const result = await listCatalogLinesAction(supplierId, { page, pageSize });

  if (result.status === 'error') {
    return <CatalogListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <CatalogListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? `${supplierDetailRoute(supplierId)}?${buildCatalogListQuery({
                page: FIRST_PAGE,
                pageSize,
              })}`
            : undefined
        }
      />
    );
  }

  const directories = await buildCatalogDirectories();

  return (
    <div className="flex flex-col gap-4" data-testid="catalog-list">
      <CatalogTable lines={items} directories={directories} />
      <CatalogListToolbar page={currentPage} pageSize={pageSize} totalPages={totalPages} />
    </div>
  );
}
