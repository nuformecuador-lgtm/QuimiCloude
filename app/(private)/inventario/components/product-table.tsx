'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { listProductBatchesAction } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { ErrorState } from '@/lib/modules/errores';
import { productDisplayName, type ProductBatchView, type ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { AdjustBatchDialog } from './adjust-batch-dialog';
import { BatchHistory } from './batch-history';
import { DeleteProductDialog } from './delete-product-dialog';
import {
  PRODUCT_DEFAULT_PINNED_COLUMNS,
  buildProductColumns,
  productUnitLabel,
} from './product-columns';
import { productListHref } from './product-list-params';
import { ProductBatchesPanel } from './product-batches-panel';
import { ProductSheet } from './product-sheet';

const TOUCH_TARGET = 'min-h-11 min-w-11';

type BatchesLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: readonly ProductBatchView[] }
  | ErrorState;

type ProductBatchesSheetProps = {
  readonly product: ProductView;
  readonly units?: readonly UnitRef[];
  /** Falla cerrado: el permiso baja por props, esta pantalla no lo resuelve. */
  readonly canAdjust: boolean;
};

/**
 * Panel lateral con los lotes de un producto. Pide los lotes al abrirse por primera vez y
 * los vuelve a pedir tras un ajuste, para que la existencia nueva se vea.
 */
function ProductBatchesSheet({ product, units, canAdjust }: ProductBatchesSheetProps) {
  const [state, setState] = useState<BatchesLoadState>({ status: 'idle' });
  const displayName = productDisplayName(product.name, productUnitLabel(product, units));

  function fetchBatches() {
    setState({ status: 'loading' });
    void listProductBatchesAction(product.id).then((result) => {
      setState(result.status === 'success' ? { status: 'success', data: result.data } : result);
    });
  }

  function handleOpenChange(open: boolean) {
    if (open && state.status === 'idle') fetchBatches();
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            className={TOUCH_TARGET}
            aria-label={`Lotes de ${displayName}`}
            data-testid="product-batches-open"
          />
        }
      >
        Lotes
      </SheetTrigger>
      <SheetContent data-testid="product-batches-sheet">
        <SheetHeader>
          <SheetTitle>{displayName}</SheetTitle>
        </SheetHeader>

        {state.status === 'loading' ? (
          <p data-testid="product-batches-loading">Cargando lotes…</p>
        ) : null}

        {state.status === 'error' ? (
          <p role="alert" data-testid="product-batches-error">
            {state.message}
          </p>
        ) : null}

        {state.status === 'success' ? (
          <ProductBatchesPanel
            batches={state.data}
            units={units}
            renderBatchDetail={(batch) => (
              <BatchHistory batchId={batch.id} batchLot={batch.lot} />
            )}
            renderBatchActions={(batch) => (
              <AdjustBatchDialog
                batch={batch}
                canAdjust={canAdjust}
                onAdjusted={fetchBatches}
              />
            )}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

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
 * **`status` sigue siendo SIEMPRE `'idle'`**, y el «cargando» de R15 ya NO viene de remontar la
 * pantalla: la `key` del `<Suspense>` de la pagina desaparecio (2026-09-07) porque remontaba la
 * tabla entera en cada cambio de consulta y borraba el foco del campo de busqueda o de filtro que
 * se estaba escribiendo. Ahora la navegacion va en una transicion y, mientras esta en vuelo, esta
 * pantalla lo anuncia con `aria-busy` y un rotulo, y atenua la tabla, sin desmontarla. El error
 * y el vacio siguen pintandose FUERA de `<DataTable>` (R14, R16), y el `fallback` del
 * `<Suspense>` cubre la primera carga con `ProductTableSkeleton`.
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
};

export function ProductTable({
  products,
  params,
  totalPages,
  units,
  canAdjust = false,
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
            <ProductSheet product={product} />
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
      <DataTable
        tableId={PRODUCT_TABLE_ID}
        columns={columns}
        rows={products}
        getRowId={(product) => product.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(productListHref(next))}
        status="idle"
        texts={PRODUCT_TABLE_TEXTS}
        defaultPinnedColumns={PRODUCT_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
