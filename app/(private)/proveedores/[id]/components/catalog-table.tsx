'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { CatalogLineListItem } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';

import { CatalogLineSheet } from './catalog-line-sheet';
import { buildCatalogColumns } from './catalog-columns';
import { CATALOG_SKELETON_COLUMN_COUNT } from './catalog-columns-skeleton';
import { EMPTY_CATALOG_DIRECTORIES, type CatalogDirectories } from './catalog-directories';
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
 * **Cargando, error y catalogo vacio los pinta `<DataTable>` en lugar de toda la tabla**, y en
 * esos estados no se pinta el envoltorio de aqui. El de cada navegacion posterior lo da esta
 * tabla, mientras esta en vuelo, sin desmontarla.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R13): `components/ui/table.tsx`, que
 * la tabla compartida usa por dentro, envuelve la tabla en un contenedor con `overflow-x-auto`.
 * No se edita el primitivo (R44) ni se anade columna pegajosa a mano: el fijado lo ofrece la
 * tabla compartida.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const CATALOG_TABLE_ID = 'proveedor-catalogo';

/** Distinto del vacio de la lista de proveedores: los dos vacios significan cosas distintas. */
export const CATALOG_LIST_EMPTY_TESTID = 'catalog-list-empty';

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

type CatalogTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

export type CatalogTableProps = CatalogTableStatusProps & {
  readonly lines: readonly CatalogLineListItem[];
  readonly directories?: CatalogDirectories;
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
  /**
   * Presente solo con cero lineas: el vacio sustituye a toda la tabla. Con `firstPageHref` es la
   * pagina que se quedo atras.
   */
  readonly empty?: { readonly firstPageHref?: string };
};

function buildStates(
  params: DataTableParams,
  supplierId: string,
  units: readonly UnitRef[],
  error: ErrorState | undefined,
  empty: CatalogTableProps['empty'],
): DataTableStates {
  return {
    loading: {
      columns: CATALOG_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: 'Cargando el catálogo del proveedor…',
      testId: 'catalog-table-skeleton',
      rowTestId: 'catalog-row-skeleton',
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            error,
            title: 'No se pudo cargar la información del proveedor.',
            testId: 'catalog-list-error',
            messageTestId: 'catalog-list-error-message',
            codeTestId: 'catalog-list-error-code',
            retry: { kind: 'refresh' },
            retryTestId: 'catalog-list-retry',
          },
        }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: CATALOG_LIST_EMPTY_TESTID,
            message:
              empty.firstPageHref === undefined
                ? 'Este proveedor todavía no tiene líneas de catálogo.'
                : 'Esta página ya no tiene líneas de catálogo.',
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: 'catalog-list-first-page',
                  },
                }),
            children: <CatalogLineSheet supplierId={supplierId} units={units} />,
          },
        }),
  };
}

export function CatalogTable({
  lines,
  directories = EMPTY_CATALOG_DIRECTORIES,
  params,
  totalPages,
  supplierId,
  units,
  status = 'idle',
  error,
  empty,
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

  const table = (
    <DataTable
      tableId={CATALOG_TABLE_ID}
      columns={columns}
      rows={lines}
      getRowId={(line) => line.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => navigate(catalogListHref(supplierId, next))}
      status={status}
      states={buildStates(params, supplierId, units, error, empty)}
      texts={CATALOG_TABLE_TEXTS}
    />
  );

  if (status !== 'idle' || (lines.length === 0 && empty !== undefined)) return table;

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
      {table}
    </div>
  );
}
