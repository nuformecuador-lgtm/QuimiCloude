'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition, type ReactNode } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { ErrorState as OperationError } from '@/lib/modules/errores';
import type { ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { DeleteProductDialog } from './delete-product-dialog';
import { buildProductColumns } from './product-columns';
import { PRODUCT_SKELETON_COLUMN_COUNT } from './product-columns-skeleton';
import { productListHref } from './product-list-params';
import { ProductBatchesSheet } from './product-batches-sheet';
import { ProductSheet } from './product-sheet';
import { ProductTypeTabs } from './product-type-tabs';

/**
 * Tabla del catalogo (R6-R11, `design.md > 4.3`, `> 7`).
 *
 * **MIGRADA A LA TABLA COMPARTIDA el 2026-09-07 (decision humana).** Antes esta ruta declaraba su
 * propia tabla con `components/ui/table.tsx` y su propia barra de paginacion
 * (`product-list-toolbar.tsx`, que DESAPARECE). Ahora monta `components/shared/data-table`, la
 * misma que ya usan pedidos y recetas, importada por su barrel publico. Lo que se gana, ademas de
 * no mantener tres tablas: orden por cabecera, filtros de rango, busqueda, fijado de columnas y
 * un solo sitio donde se arreglan los tres.
 *
 * **Ahora es `'use client'`**, y antes no: la tabla compartida es interactiva -emite
 * `onParamsChange`- y las celdas de accion montan el panel y el dialogo. El Server Component
 * sigue siendo `ProductListSection`, que es quien pide los datos (R30); aqui solo llegan filas ya
 * resueltas y los parametros con los que se pidieron.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion con la cadena de consulta canonica. Esta pantalla **no ordena,
 * no filtra y no busca en el cliente**: la lista vuelve a pedirse sobre el conjunto entero. El
 * destino sale de `productListHref` (R2): ningun archivo de la ruta escribe la URL como literal.
 *
 * **`searchable` se queda en su defecto (`true`)**, al contrario que en pedidos:
 * `PRODUCT_QUERYABLE.searchable` es `true` y `listProducts` resuelve la busqueda contra la columna
 * normalizada con su indice de trigramas, asi que la caja de busqueda no miente.
 *
 * **El «cargando» de una navegacion no remonta la pantalla**: la `key` del `<Suspense>` de la
 * pagina desaparecio (2026-09-07) porque remontaba la tabla entera en cada cambio de consulta y
 * borraba el foco del campo de busqueda o de filtro que se estaba escribiendo. Ahora la navegacion
 * va en una transicion y, mientras esta en vuelo, esta pantalla lo anuncia con `aria-busy` y un
 * rotulo, y atenua la tabla, sin desmontarla. La primera carga, el error y el catalogo vacio los
 * pinta la tabla compartida en lugar de toda la tabla.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R9): `components/ui/table.tsx`, que
 * la tabla compartida usa por dentro, envuelve la tabla en un contenedor con `overflow-x-auto`.
 * No se edita el primitivo (R29) ni se anade columna pegajosa a mano: el fijado de columnas lo
 * ofrece la tabla compartida.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const PRODUCT_TABLE_ID = 'inventario';

/**
 * Textos del componente compartido. Viven aqui -y no en el componente- porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales: los controles se
 * localizan por rol o por `data-testid`.
 */
export const PRODUCT_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay productos que mostrar.',
  loading: 'Cargando productos…',
  error: 'No se pudo cargar el catálogo.',
  search: 'Buscar producto',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Productos por página',
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

export type ProductTableProps = {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega. */
  readonly products: readonly ProductView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Catalogo de unidades, para resolver el simbolo de la existencia en la columna. */
  readonly units?: readonly UnitRef[];
  /**
   * Permiso `inventario.modificar`, resuelto en el servidor y bajado por props. Defecto `false`:
   * falla cerrado, como el resto de esta ruta.
   */
  readonly canAdjust?: boolean;
  /** Defecto `'idle'`. `'loading'` es la primera carga, el `fallback` del `<Suspense>`. */
  readonly status?: ProductTableStatus;
  /** El error de la consulta, entero; solo se pinta con `status="error"`. */
  readonly error?: OperationError;
  /** El catalogo vacio, que la seccion pasa solo sin busqueda ni filtro activos. */
  readonly empty?: ProductTableEmpty;
};

export type ProductTableStatus = 'idle' | 'loading' | 'error';

export type ProductTableEmpty = {
  /** Solo cuando la pagina pedida se quedo sin elementos tras un borrado. */
  readonly firstPageHref?: string;
  /** La accion de crear el primer producto. */
  readonly action?: ReactNode;
};

/**
 * Los estados que sustituyen a toda la tabla. Los comparte la pestana de producto terminado:
 * las dos listas cargan y fallan igual.
 */
export function productTableStates({
  pageSize,
  error,
  empty,
}: {
  readonly pageSize: number;
  readonly error?: OperationError;
  readonly empty?: ProductTableEmpty;
}): DataTableStates {
  return {
    loading: {
      columns: PRODUCT_SKELETON_COLUMN_COUNT,
      rows: pageSize,
      label: PRODUCT_TABLE_TEXTS.loading,
      testId: 'product-table-skeleton',
      rowTestId: 'product-row-skeleton',
    },
    error:
      error === undefined
        ? undefined
        : {
            error,
            title: PRODUCT_TABLE_TEXTS.error,
            testId: 'product-list-error',
            messageTestId: 'product-list-error-message',
            codeTestId: 'product-list-error-code',
            retry: { kind: 'refresh' },
            retryTestId: 'product-list-retry',
          },
    empty:
      empty === undefined
        ? undefined
        : {
            testId: 'product-list-empty',
            message:
              empty.firstPageHref === undefined
                ? 'Todavía no hay productos en el catálogo.'
                : 'Esta página ya no tiene productos.',
            firstPage:
              empty.firstPageHref === undefined
                ? undefined
                : {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: 'product-list-first-page',
                  },
            children: empty.action,
          },
  };
}

export function ProductTable({
  products,
  params,
  totalPages,
  units,
  canAdjust = false,
  status = 'idle',
  error,
  empty,
}: ProductTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Las acciones de fila se enchufan aqui, no en la declaracion de columnas: asi esa declaracion
  // no importa el panel ni el dialogo. `useMemo` para que la identidad del array no cambie en
  // cada render y la tabla compartida no se reconstruya entera.
  const columns = useMemo(
    () =>
      buildProductColumns({
        rowActions: (product) => (
          <>
            <ProductBatchesSheet product={product} units={units} canAdjust={canAdjust} />
            <ProductSheet product={product} units={units} />
            <DeleteProductDialog product={product} />
          </>
        ),
        units,
      }),
    [units, canAdjust],
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
      tableId={PRODUCT_TABLE_ID}
      columns={columns}
      rows={products}
      getRowId={(product) => product.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => navigate(productListHref(next))}
      status={status}
      texts={PRODUCT_TABLE_TEXTS}
      states={productTableStates({ pageSize: params.pageSize, error, empty })}
    />
  );

  // Fuera de las filas, el estado sustituye a la pantalla entera: sin pestanas ni envoltorio.
  if (status !== 'idle' || (products.length === 0 && empty !== undefined)) {
    return table;
  }

  return (
    <div
      data-testid="product-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {/*
        La senal de «en vuelo»: un rotulo visible con el texto de `PRODUCT_TABLE_TEXTS.loading`
        y la tabla atenuada. Para la tecnologia de asistencia la lleva `aria-busy` en el
        contenedor -no una segunda region viva: la zona privada tiene EXACTAMENTE una, la de
        avisos que monta el layout privado, y varios tests lo afirman-. La tabla NO se desmonta ni
        se bloquea: se puede seguir escribiendo en la barra de filtros mientras se recalcula.
      */}
      {isPending ? (
        <p className="text-xs text-muted-foreground">{PRODUCT_TABLE_TEXTS.loading}</p>
      ) : null}
      <ProductTypeTabs params={params} onNavigate={navigate} />
      {table}
    </div>
  );
}
