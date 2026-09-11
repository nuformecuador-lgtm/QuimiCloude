import { listCatalogLinesAction } from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { DataTableParams } from '@/components/shared/data-table';
import type { UnitRef } from '@/lib/modules/unidades';

import { buildCatalogDirectories } from './catalog-directories';
import { CatalogLineSheet } from './catalog-line-sheet';
import { CatalogListEmpty } from './catalog-list-empty';
import { CatalogListError } from './catalog-list-error';
import { FIRST_PAGE, catalogListHref } from './catalog-list-params';
import { CatalogTable } from './catalog-table';

type CatalogListSectionProps = {
  readonly supplierId: string;
  /**
   * Los parametros de lista YA ACOTADOS por `parseCatalogListParams`. Se pasan ENTEROS a la
   * operacion de consulta: `DataTableParams` es campo a campo la forma que `createListQuerySchema`
   * espera (QC-57), asi que aqui no se traduce ni se inventa ninguna clave.
   */
  readonly params: DataTableParams;
  /**
   * Catalogo de unidades, pedido **una sola vez** por la pagina de detalle con `listUnitsAction()`
   * y bajado por props (R46, `design.md > 8.2`). Desde aqui viaja al panel lateral de la linea
   * -`CatalogLineSheet` -> `CatalogLineForm` -> `UnitSelect`-, tanto en el estado vacio como en
   * las acciones de fila. **Ningun componente de cliente las pide por su cuenta.**
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
 * porque entonces no hay ningun identificador que resolver. El de unidades no cuesta ninguna
 * consulta: se construye con las `units` que ya bajaron por props (R46).
 *
 * **Un catalogo vacio NO se pinta como tabla sin filas** (R23, R25): son tres situaciones
 * distintas -fallo, catalogo vacio y pagina que se quedo atras tras una baja- y cada una dice lo
 * suyo.
 */
export async function CatalogListSection({
  supplierId,
  params,
  units,
}: CatalogListSectionProps) {
  const result = await listCatalogLinesAction(supplierId, params);

  if (result.status === 'error') {
    return <CatalogListError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <CatalogListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? catalogListHref(supplierId, { ...params, page: FIRST_PAGE })
            : undefined
        }
      >
        {/* R23 — lo unico util en un catalogo vacio es anadir la primera linea, y se ofrece a
            mano. El estado vacio no conoce el panel: lo recibe como slot. */}
        <CatalogLineSheet supplierId={supplierId} units={units} />
      </CatalogListEmpty>
    );
  }

  // Las unidades ya vienen resueltas por la pagina: el diccionario las reutiliza en vez de
  // volver a pedirlas (R46).
  const directories = await buildCatalogDirectories(units);

  return (
    <div className="flex flex-col gap-4" data-testid="catalog-list">
      <div className="flex justify-end">
        <CatalogLineSheet supplierId={supplierId} units={units} />
      </div>
      {/*
        La paginacion y el tamano de pagina los pinta la tabla compartida desde el 2026-09-07:
        `catalog-list-toolbar.tsx` desaparecio y con el la barra propia de esta ruta.
      */}
      {/*
        Editar y dar de baja las monta la propia tabla (correccion del 2026-09-07). Entraban por
        un SLOT `rowActions` para que la tabla no conociera el panel ni el dialogo, pero esta
        seccion es un Server Component y una funcion NO cruza la frontera servidor->cliente:
        la pantalla reventaba con «Functions cannot be passed directly to Client Components».
        Desde aqui bajan datos -`supplierId` y `units`-, nunca comportamiento. Las acciones
        siguen SIEMPRE visibles: nada detras de `:hover` (R48).
      */}
      <CatalogTable
        lines={items}
        directories={directories}
        params={{ ...params, page: currentPage }}
        totalPages={totalPages}
        supplierId={supplierId}
        units={units}
      />
    </div>
  );
}
