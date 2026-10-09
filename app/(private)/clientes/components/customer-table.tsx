'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type MouseEvent } from 'react';

import { DataTable, type DataTableParams, type DataTableStates } from '@/components/shared/data-table';
import { buttonVariants } from '@/components/ui/button';
import type { CustomerView } from '@/lib/modules/clientes';
import type { ErrorState } from '@/lib/modules/errores';
import { cn } from '@/lib/utils';

import { CUSTOMER_TABLE_TEXTS } from './customer-labels';
import { buildCustomerColumns } from './customer-columns';
import { FIRST_PAGE, customerListHref, withSearchResetsPage } from './customer-list-params';
import { CustomerRowActions } from './customer-row-actions';
import { CustomerSheet } from './customer-sheet';

/**
 * La tabla de la lista de clientes.
 *
 * **Usa la tabla de datos compartida**, importada por su barrel publico: no se declara una
 * tabla propia, ni una barra de paginacion propia, y no se abre un solo archivo de
 * `components/shared/data-table/`.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo
 * y aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica
 * (`customerListHref`, derivada de `CUSTOMERS_ROUTE`). Esta pantalla no ordena, no filtra y no
 * recorta nada en el cliente: pinta las filas tal cual llegan.
 *
 * **Cargando, error y vacio sin busqueda los pinta `<DataTable>` en lugar de toda la tabla**, y en
 * esos estados no se pinta el envoltorio de aqui. El de cada navegacion posterior lo da esta
 * tabla, mientras esta en vuelo, sin desmontar nada.
 *
 * **La caja de busqueda esta sincronizada con «Atras»**, COPIA del mecanismo de
 * `order-table.tsx` sin tocar `components/shared`: es deuda con nombre, no una tercera
 * definicion del mismo problema.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo**: `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`.
 */

export const CUSTOMER_TABLE_ID = 'clientes';

export const CUSTOMER_TABLE_TESTID = 'customer-table';
export const CUSTOMER_LIST_NO_MATCHES_TESTID = 'customer-list-no-matches';
export const CUSTOMER_LIST_CLEAR_SEARCH_TESTID = 'customer-list-clear-search';
export const CUSTOMER_LIST_EMPTY_TESTID = 'customer-list-empty';
export const CUSTOMER_LIST_EMPTY_MESSAGE_TESTID = 'customer-list-empty-message';
export const CUSTOMER_LIST_FIRST_PAGE_TESTID = 'customer-list-first-page';
export const CUSTOMER_LIST_ERROR_TESTID = 'customer-list-error';
export const CUSTOMER_LIST_ERROR_MESSAGE_TESTID = 'customer-list-error-message';
export const CUSTOMER_LIST_ERROR_CODE_TESTID = 'customer-list-error-code';
export const CUSTOMER_LIST_RETRY_TESTID = 'customer-list-retry';
export const CUSTOMER_LIST_SKELETON_TESTID = 'customer-list-skeleton';
export const CUSTOMER_ROW_SKELETON_TESTID = 'customer-row-skeleton';

/** Un test ata esta cuenta al largo de `buildCustomerColumns(...)`. */
export const CUSTOMER_SKELETON_COLUMN_COUNT = 9;

/** Copy del vacio sin ningun cliente. */
export const CUSTOMER_EMPTY_MESSAGE = 'Todavía no hay clientes registrados.';
/** Copy del estado «sin coincidencias», distinto del de «no hay clientes». */
export const CUSTOMER_NO_MATCHES_MESSAGE = 'No hay clientes que coincidan con la búsqueda.';
/** Copy de la página que se quedó atrás, con término o filtro vigentes. */
export const CUSTOMER_OUT_OF_RANGE_MESSAGE = 'Esta página ya no tiene clientes.';

const CLEAR_SEARCH_LABEL = 'Limpiar la búsqueda';
const FIRST_PAGE_LABEL = 'Volver a la primera página';

// Con modificadores o boton central se deja al navegador abrir otra pestana.
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type CustomerTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

export type CustomerTableProps = CustomerTableStatusProps & {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega. */
  readonly customers: readonly CustomerView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Si la sesion trae `clientes.modificar`. Decision de presentacion, bajada por props. */
  readonly canModify: boolean;
  /**
   * Presente solo con cero filas y sin termino ni filtro vigentes: el vacio sustituye a toda la
   * tabla. Con `firstPageHref` es la pagina que se quedo atras, y entonces no se ofrece el alta.
   */
  readonly empty?: { readonly firstPageHref?: string };
  /**
   * Presente solo con cero filas y un termino vigente: pinta el estado «sin coincidencias»
   * DENTRO de la tabla, con la caja montada, en vez del vacio.
   */
  readonly noMatches?: { readonly clearHref: string };
  /**
   * Presente solo con cero filas, `page > totalPages` y un termino o filtro vigentes: la pagina
   * pedida se quedo sin elementos, pero sigue habiendo coincidencias en otra pagina. Mutuamente
   * excluyente con `noMatches`.
   */
  readonly outOfRange?: { readonly firstPageHref: string };
};

function buildStates(
  params: DataTableParams,
  canModify: boolean,
  error: ErrorState | undefined,
  empty: CustomerTableProps['empty'],
): DataTableStates {
  return {
    loading: {
      columns: CUSTOMER_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: CUSTOMER_TABLE_TEXTS.loading,
      testId: CUSTOMER_LIST_SKELETON_TESTID,
      rowTestId: CUSTOMER_ROW_SKELETON_TESTID,
      headCellClassName: 'h-4 w-full',
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            error,
            title: CUSTOMER_TABLE_TEXTS.error,
            testId: CUSTOMER_LIST_ERROR_TESTID,
            messageTestId: CUSTOMER_LIST_ERROR_MESSAGE_TESTID,
            codeTestId: CUSTOMER_LIST_ERROR_CODE_TESTID,
            retry: { kind: 'href', href: customerListHref(params) },
            retryTestId: CUSTOMER_LIST_RETRY_TESTID,
          },
        }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: CUSTOMER_LIST_EMPTY_TESTID,
            messageTestId: CUSTOMER_LIST_EMPTY_MESSAGE_TESTID,
            message:
              empty.firstPageHref === undefined
                ? CUSTOMER_EMPTY_MESSAGE
                : CUSTOMER_OUT_OF_RANGE_MESSAGE,
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: FIRST_PAGE_LABEL,
                    testId: CUSTOMER_LIST_FIRST_PAGE_TESTID,
                  },
                }),
            children: empty.firstPageHref === undefined && canModify ? <CustomerSheet /> : null,
          },
        }),
  };
}

export function CustomerTable({
  customers,
  params,
  totalPages,
  canModify,
  status = 'idle',
  error,
  empty,
  noMatches,
  outOfRange,
}: CustomerTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /*
    `boxEpoch` remonta la caja de busqueda: la instancia de `DataTableSearchField` guarda su
    borrador una vez al montarse, asi que sin remontarla seguiria mostrando el termino viejo
    tanto tras «Limpiar» como tras un cambio de `params.search` que no vino de la propia caja
    (Atras, otro enlace). `clearing` adelanta el vaciado del «Limpiar» mientras esa navegacion
    todavia esta en vuelo. COPIA de `order-table.tsx`.
  */
  const [boxEpoch, setBoxEpoch] = useState(0);
  const [clearing, setClearing] = useState(false);
  /*
    Compara durante el render (no en un efecto) para que el remonte llegue en el mismo commit,
    sin parpadeo. `pendingSearches` distingue el eco de la propia caja (se descarta, sin
    remontar) de un cambio externo (remonta).
  */
  const [pendingSearches, setPendingSearches] = useState<readonly string[]>([]);
  const [lastSearch, setLastSearch] = useState(params.search);
  if (params.search !== lastSearch) {
    setLastSearch(params.search);
    const index = pendingSearches.indexOf(params.search);
    if (index === -1) {
      setBoxEpoch((epoch) => epoch + 1);
    } else {
      setPendingSearches(pendingSearches.slice(index + 1));
    }
    // El eco de la limpieza o cualquier otro cambio real de `params.search` ya trae el termino
    // vigente: `clearing` deja de forzarlo para no pisar un cambio externo posterior (Atras).
    if (clearing) setClearing(false);
  }

  const columns = useMemo(
    () =>
      buildCustomerColumns({
        rowActions: (customer) => <CustomerRowActions customer={customer} canModify={canModify} />,
      }),
    [canModify],
  );

  /*
    La navegacion va DENTRO de una transicion, y su `isPending` es la senal de «algo esta en
    vuelo». Esa senal NO desmonta nada: se anuncia con `aria-busy` y un rotulo visible, atenuando
    la tabla, que sigue montada y sigue aceptando teclas.
  */
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const handleParamsChange = (next: DataTableParams) => {
    setClearing(false);
    const target = withSearchResetsPage(params, next);
    if (target.search !== params.search) {
      setPendingSearches((pending) => [...pending, target.search]);
    }
    navigate(customerListHref(target));
  };

  const handleClearSearch = (event: MouseEvent<HTMLAnchorElement>) => {
    if (noMatches === undefined || !isPlainClick(event)) return;
    event.preventDefault();
    setPendingSearches((pending) => [...pending, '']);
    setBoxEpoch((epoch) => epoch + 1);
    setClearing(true);
    navigate(noMatches.clearHref);
  };

  const visibleParams = clearing ? { ...params, search: '', page: FIRST_PAGE } : params;
  const replacedByState = status !== 'idle' || (customers.length === 0 && empty !== undefined);

  const table = (
    <DataTable
      key={boxEpoch}
      tableId={CUSTOMER_TABLE_ID}
      columns={columns}
      rows={customers}
      getRowId={(customer) => customer.id}
      params={visibleParams}
      totalPages={totalPages}
      onParamsChange={handleParamsChange}
      status={status}
      states={buildStates(params, canModify, error, empty)}
      texts={
        outOfRange !== undefined
          ? { ...CUSTOMER_TABLE_TEXTS, empty: CUSTOMER_OUT_OF_RANGE_MESSAGE }
          : noMatches === undefined
            ? CUSTOMER_TABLE_TEXTS
            : { ...CUSTOMER_TABLE_TEXTS, empty: CUSTOMER_NO_MATCHES_MESSAGE }
      }
      toolbarActions={canModify ? <CustomerSheet /> : undefined}
      emptyAction={
        outOfRange !== undefined ? (
          <Link
            href={outOfRange.firstPageHref}
            data-slot="button"
            data-testid={CUSTOMER_LIST_FIRST_PAGE_TESTID}
            className={cn(buttonVariants({ variant: 'outline', touch: true }))}
          >
            {FIRST_PAGE_LABEL}
          </Link>
        ) : noMatches === undefined ? undefined : (
          <div
            data-testid={CUSTOMER_LIST_NO_MATCHES_TESTID}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            <Link
              href={noMatches.clearHref}
              onClick={handleClearSearch}
              data-slot="button"
              data-testid={CUSTOMER_LIST_CLEAR_SEARCH_TESTID}
              className={cn(buttonVariants({ variant: 'outline', touch: true }))}
            >
              {CLEAR_SEARCH_LABEL}
            </Link>
          </div>
        )
      }
    />
  );

  if (replacedByState) return table;

  return (
    <div
      data-testid={CUSTOMER_TABLE_TESTID}
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{CUSTOMER_TABLE_TEXTS.loading}</p>
      ) : null}
      {table}
    </div>
  );
}
