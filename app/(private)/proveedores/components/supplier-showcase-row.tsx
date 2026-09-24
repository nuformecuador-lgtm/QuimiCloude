'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

import { listShowcaseLinesAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { ShowcaseRow as ShowcaseRowData } from '@/lib/modules/proveedores';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { ShowcaseLineCard } from './showcase-line-card';

const TOUCH_TARGET = 'min-h-11 min-w-11';

type SupplierShowcaseRowProps = {
  readonly row: ShowcaseRowData;
  /** Mismo filtro de producto con el que se pidió la tanda: «cargar más» recorre el mismo conjunto. */
  readonly productSearch: string;
};

/** Une líneas nuevas sin repetir un `id` ya presente (un reintento tras un fallo parcial podría traerlo). */
function appendWithoutDuplicates<T extends { readonly id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): readonly T[] {
  const knownIds = new Set(current.map((line) => line.id));
  return [...current, ...incoming.filter((line) => !knownIds.has(line.id))];
}

export function SupplierShowcaseRow({ row, productSearch }: SupplierShowcaseRowProps) {
  const [lines, setLines] = useState(row.lines);
  const [hasMoreLines, setHasMoreLines] = useState(row.hasMoreLines);
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
      const result = await listShowcaseLinesAction(row.id, { page: nextPage, productSearch });

      if (result.status === 'success') {
        setLines((current) => appendWithoutDuplicates(current, result.data.items));
        setHasMoreLines(result.data.hasMore);
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
  }, [loadedPage, productSearch, row.id]);

  return (
    <li className="flex flex-col gap-2 py-3" data-testid={`supplier-showcase-row-${row.id}`}>
      {/*
        El texto de un `<a>` flex es un item anonimo que no encoge; por eso va en un `span`.
      */}
      <Link
        href={supplierDetailRoute(row.id)}
        className="inline-flex min-h-11 min-w-11 max-w-full items-center justify-start rounded-lg font-medium underline-offset-4 hover:underline"
        aria-label={`Ver el detalle de ${row.name}`}
        data-testid="supplier-detail-link"
      >
        <span className="min-w-0 break-words">{row.name}</span>
      </Link>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="supplier-showcase-row-empty">
          Sin productos todavía.{' '}
          <Link
            href={supplierDetailRoute(row.id)}
            className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline"
          >
            Ver ficha del proveedor
          </Link>
        </p>
      ) : (
        <section aria-label={`Productos de ${row.name}`}>
          <ul
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
            tabIndex={0}
          >
            {lines.map((line) => (
              <ShowcaseLineCard key={line.id} line={line} />
            ))}
          </ul>

          {hasMoreLines && !failed ? (
            <button
              type="button"
              className={TOUCH_TARGET}
              aria-label={`Cargar más productos de ${row.name}`}
              aria-busy={loading}
              disabled={loading}
              onClick={loadMore}
              data-testid="supplier-showcase-row-load-more"
            >
              Cargar más
            </button>
          ) : null}

          {failed ? (
            <div role="alert" className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">No se pudieron cargar más productos.</p>
              <button
                type="button"
                className={TOUCH_TARGET}
                aria-label={`Reintentar carga de productos de ${row.name}`}
                aria-busy={loading}
                disabled={loading}
                onClick={loadMore}
                data-testid="supplier-showcase-row-retry"
              >
                Reintentar
              </button>
            </div>
          ) : null}
        </section>
      )}
    </li>
  );
}
