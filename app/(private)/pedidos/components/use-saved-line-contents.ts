'use client';

import { useEffect, useState } from 'react';

import { listPresentationsAction } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { PresentationContent } from './order-distribution-coverage';
import type { OrderDistributionLine } from './use-order-distribution-availability';

type Target = { readonly id: string; readonly name: string };

const FIRST_PAGE = 1;

/** El catalogo no filtra por id: se busca por nombre y se recorren sus paginas hasta dar con el. */
async function findPresentation(target: Target): Promise<PresentationContent | null> {
  for (let page = FIRST_PAGE; ; page += 1) {
    const result = await listPresentationsAction({
      page,
      pageSize: MAX_PAGE_SIZE,
      search: target.name,
    });
    if (result.status === 'error') return null;
    const found = result.data.items.find((item) => item.id === target.id);
    if (found !== undefined) return { content: found.content, unitId: found.unitId };
    if (page >= result.data.totalPages) return null;
  }
}

function parseTargets(key: string): Target[] {
  const raw: unknown = JSON.parse(key);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) =>
    Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ? [{ id: entry[0], name: entry[1] }]
      : [],
  );
}

/**
 * Contenido y unidad de las presentaciones de las lineas ya guardadas, que llegan sin ellos.
 * Mientras no se resuelven, la presentacion no esta en el mapa.
 */
export function useSavedPresentationContents(
  lines: readonly OrderDistributionLine[],
): ReadonlyMap<string, PresentationContent> {
  const [resolved, setResolved] = useState<ReadonlyMap<string, PresentationContent>>(
    () => new Map(),
  );

  const key = JSON.stringify(
    lines.flatMap((line) =>
      line.unitId === null && line.presentationName !== null
        ? [[line.presentationId, line.presentationName]]
        : [],
    ),
  );

  useEffect(() => {
    const targets = parseTargets(key);
    if (targets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      targets.map(async (target) => [target.id, await findPresentation(target)] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setResolved((previous) => {
          const next = new Map(previous);
          for (const [id, presentation] of entries) {
            if (presentation !== null) next.set(id, presentation);
          }
          return next;
        });
      })
      // Sin resolver la linea no muestra lo que cubre; no hay nada mas que hacer con el fallo.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [key]);

  return resolved;
}
