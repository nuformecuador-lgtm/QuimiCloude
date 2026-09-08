'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';

import { CatalogLineSheet } from './catalog-line-sheet';
import { CATALOG_DEFAULT_PINNED_COLUMNS, buildCatalogColumns } from './catalog-columns';
import type { CatalogDirectories } from './catalog-directories';
import { catalogListHref } from './catalog-list-params';
import { DeleteCatalogLineDialog } from './delete-catalog-line-dialog';

/**
 * Tabla del catalogo de un proveedor (R12, R13, R21, R22, R30, R41, R48; `design.md > 6`).
 *
 * **MIGRADA A LA TABLA COMPARTIDA el 2026-09-07 (decision humana).** Antes esta ruta declaraba su
 * propia tabla con `components/ui/table.tsx` y su propia barra de paginacion
 * (`catalog-list-toolbar.tsx`, que DESAPARECE). Ahora monta `components/shared/data-table`, la
 * misma que ya usan inventario, pedidos y recetas.
 *
 * **Ahora es `'use client'`**, y antes no: la tabla compartida es interactiva -emite
 * `onParamsChange`-. El Server Component sigue siendo `CatalogListSection`, que es quien pide los
 * datos y quien construye los diccionarios UNA vez (R22, R46); aqui solo llegan filas ya
 * resueltas, los diccionarios, las unidades y los parametros con los que se pidieron.
 *
 * **Las acciones de fila NO son un slot** (correccion del 2026-09-07): esta tabla monta ella
 * misma `CatalogLineSheet` y `DeleteCatalogLineDialog`. El diseno original las recibia como
 * `rowActions`, una funcion que `CatalogListSection` construia; pero esa seccion es un Server
 * Component y una funcion no cruza la frontera servidor->cliente, asi que la pantalla reventaba
 * con «Functions cannot be passed directly to Client Components». De la seccion bajan datos
 * (`supplierId`, `units`), no comportamiento.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion con la cadena de consulta canonica. Esta pantalla **no ordena,
 * no filtra y no busca en el cliente**: la lista vuelve a pedirse sobre el conjunto entero. El
 * destino sale de `catalogListHref`, que deriva de `supplierDetailRoute`: ningun archivo de la
 * ruta escribe la URL como literal.
 *
 * **`searchable` se queda en su defecto (`true`)**: `SUPPLIER_CATALOG_LINE_QUERYABLE.searchable`
 * es `true` y `listCatalogLines` resuelve la busqueda, asi que la caja no miente.
 *
 * **`status` es SIEMPRE `'idle'`**: el error y el catalogo vacio se pintan FUERA de
 * `<DataTable>`, cada uno con su copy y sus acciones (R23, R25). El «cargando» de R24 ya no viene
 * de remontar la pantalla -la `key` del `<Suspense>` desaparecio el 2026-09-07 porque borraba el
 * foco del campo que se estaba escribiendo-: la navegacion va en una transicion y, mientras esta
 * en vuelo, esta pantalla lo anuncia y atenua la tabla sin desmontarla. El `fallback` del
 * `<Suspense>` sigue cubriendo la primera carga con `CatalogTableSkeleton`.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R13): `components/ui/table.tsx`, que
 * la tabla compartida usa por dentro, envuelve la tabla en un contenedor con `overflow-x-auto`.
 * No se edita el primitivo (R44) ni se anade columna pegajosa a mano: el fijado lo ofrece la
 * tabla compartida.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const CATALOG_TABLE_ID = 'proveedor-catalogo';

/**
 * Textos del componente compartido. Viven aqui -y no en el componente- porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R47): los
 * controles se localizan por rol o por `data-testid`.
 */
export const CATALOG_TABLE_TEXTS: DataTableTexts = {
  empty: 'Este proveedor no tiene líneas de catálogo.',
  loading: 'Cargando el catálogo…',
  error: 'No se pudo cargar el catálogo del proveedor.',
  search: 'Buscar en el catálogo',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Líneas por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

export type CatalogTableProps = {
  readonly lines: readonly CatalogLineView[];
  readonly directories: CatalogDirectories;
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Proveedor al que pertenece el catalogo: de el sale el destino de cada navegacion. */
  readonly supplierId: string;
  /**
   * Catalogo de unidades que necesita el panel lateral de la linea, pedido UNA vez por la pagina
   * de detalle y bajado por props (R46). Es un dato, no un comportamiento: cruza la frontera
   * servidor->cliente sin problema.
   */
  readonly units: readonly UnitRef[];
};

export function CatalogTable({
  lines,
  directories,
  params,
  totalPages,
  supplierId,
  units,
}: CatalogTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /*
    Las acciones de fila se montan AQUI, en el cliente, y no llegan como `slot` desde
    `CatalogListSection`: esa seccion es un Server Component, y una funcion no cruza la frontera
    servidor->cliente («Functions cannot be passed directly to Client Components»). Con el slot,
    la pantalla del proveedor reventaba al pintarse. Lo que baja de la seccion son datos
    -`supplierId` y `units`-, y esta tabla los enchufa al panel y al dialogo, igual que hace
    `product-table.tsx` en inventario. Las acciones siguen SIEMPRE visibles: nada tras `:hover`
    (R48).
  */
  const columns = useMemo(
    () =>
      buildCatalogColumns({
        directories,
        rowActions: (line) => (
          <>
            <CatalogLineSheet supplierId={supplierId} units={units} line={line} />
            <DeleteCatalogLineDialog line={line} />
          </>
        ),
      }),
    [directories, supplierId, units],
  );

  /*
    La navegacion va DENTRO de una transicion (`startTransition`), y su `isPending` es la senal de
    «algo esta en vuelo» mientras el servidor recalcula la lista (2026-09-07).

    Esa senal NO desmonta nada: antes la daba la `key` del `<Suspense>` de la pagina, que
    remontaba el subarbol entero en cada cambio de consulta y con el borraba el foco del campo que
    se estaba escribiendo -escribir en la busqueda o en un filtro de texto perdia el cursor en
    cuanto salia la peticion-. Tampoco se pasa `status="loading"` a la tabla compartida por lo
    mismo: ese estado sustituye cabecera y filas por el esqueleto, y el foco se iria igual. Se
    anuncia con `aria-busy` y un rotulo visible, atenuando la tabla, que sigue montada y sigue
    aceptando teclas.
  */
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="catalog-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {/*
        La senal de «en vuelo»: un rotulo visible con el texto de `CATALOG_TABLE_TEXTS.loading` y la
        tabla atenuada. Para la tecnologia de asistencia la lleva `aria-busy` en el
        contenedor -no una segunda region viva: la zona privada tiene EXACTAMENTE una, la de
        avisos que monta el layout privado, y varios tests lo afirman-. La tabla NO se desmonta ni
        se bloquea: se puede seguir escribiendo en la barra de filtros mientras se recalcula.
      */}
      {isPending ? (
        <p className="text-xs text-muted-foreground">{CATALOG_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={CATALOG_TABLE_ID}
        columns={columns}
        rows={lines}
        getRowId={(line) => line.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(catalogListHref(supplierId, next))}
        status="idle"
        texts={CATALOG_TABLE_TEXTS}
        defaultPinnedColumns={CATALOG_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
