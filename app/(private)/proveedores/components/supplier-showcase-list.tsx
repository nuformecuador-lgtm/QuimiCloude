'use client';

import { useCallback, useRef, useState } from 'react';

import { listSupplierShowcaseAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { ShowcaseRow as ShowcaseRowData } from '@/lib/modules/proveedores';

import { ShowcaseLoadTrigger } from './showcase-load-trigger';
import type { ShowcaseFilters } from './supplier-showcase-params';
import { SupplierShowcaseRow } from './supplier-showcase-row';

const TOUCH_TARGET = 'min-h-11 min-w-11';

export type SupplierShowcaseInitialPage = {
  readonly items: readonly ShowcaseRowData[];
  readonly hasMore: boolean;
};

type SupplierShowcaseListProps = {
  readonly initialPage: SupplierShowcaseInitialPage;
  readonly filters: ShowcaseFilters;
};

/** Une filas nuevas sin repetir un `id` ya presente (una tanda repetida tras un reintento). */
function appendWithoutDuplicates<T extends { readonly id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): readonly T[] {
  const knownIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !knownIds.has(item.id))];
}

/**
 * Lista con carga perezosa del catálogo visual de proveedores.
 *
 * Acumula las filas ya traídas, descarta cualquier `id` repetido y mantiene un solo vuelo en
 * curso a la vez con una referencia mutable —el estado de React por sí solo no basta, porque dos
 * clics seguidos verían el mismo valor de `loading` antes del primer repintado—. Se detiene en
 * cuanto la última tanda dice que no hay más.
 *
 * Si una tanda falla, el aviso al pie sustituye al centinela: mientras está puesto, no se pide
 * ninguna tanda más, ni por scroll ni por temporizador. «Reintentar» repite exactamente la misma
 * página que falló, y solo la retira si esta vez tiene éxito.
 */
export function SupplierShowcaseList({ initialPage, filters }: SupplierShowcaseListProps) {
  const [rows, setRows] = useState(initialPage.items);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loadedPage, setLoadedPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    const nextPage = loadedPage + 1;

    try {
      const result = await listSupplierShowcaseAction({
        page: nextPage,
        supplierSearch: filters.supplierSearch,
        productSearch: filters.productSearch,
      });

      if (result.status === 'success') {
        setRows((current) => appendWithoutDuplicates(current, result.data.items));
        setHasMore(result.data.hasMore);
        setLoadedPage(nextPage);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      // La Server Action rechaza (no resuelve) ante un fallo de transporte, no de negocio.
      setFailed(true);
    }

    setLoading(false);
    inFlight.current = false;
  }, [filters.productSearch, filters.supplierSearch, loadedPage]);

  return (
    <ul className="flex flex-col divide-y" data-testid="supplier-showcase-list" aria-busy={loading}>
      {rows.map((row) => (
        <SupplierShowcaseRow key={row.id} row={row} productSearch={filters.productSearch} />
      ))}

      {hasMore && !failed ? (
        <li>
          <ShowcaseLoadTrigger onVisible={loadMore} disabled={loading} />
        </li>
      ) : null}

      {failed ? (
        <li role="alert" className="flex items-center gap-3 p-4">
          <p className="text-sm text-muted-foreground">No se pudieron cargar más proveedores.</p>
          <button
            type="button"
            className={TOUCH_TARGET}
            aria-busy={loading}
            disabled={loading}
            onClick={loadMore}
            data-testid="supplier-showcase-list-retry"
          >
            Reintentar
          </button>
        </li>
      ) : null}
    </ul>
  );
}
