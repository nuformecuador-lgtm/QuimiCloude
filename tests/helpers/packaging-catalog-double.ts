// Doble de `PackagingCatalog` para los tests unitarios de `pedidos`: devuelve solo los envases que
// se le dan, como el adaptador real con un id que no es un envase vivo de la empresa.
import { vi } from 'vitest';

import type { PackagingCatalog, PackagingCostingBatch, PackagingRef } from '@/lib/modules/inventario';

export function fakePackagingCatalog(
  refs: readonly PackagingRef[] = [],
  batches: readonly PackagingCostingBatch[] = [],
): PackagingCatalog & {
  readonly findRefs: ReturnType<typeof vi.fn>;
  readonly findCostingBatches: ReturnType<typeof vi.fn>;
} {
  const findRefs = vi.fn(async (ids: readonly string[]) => refs.filter((ref) => ids.includes(ref.id)));
  const findCostingBatches = vi.fn(async (ids: readonly string[]) =>
    batches.filter((batch) => ids.includes(batch.productId)),
  );
  return { findRefs, findCostingBatches };
}

/** Un envase con presentacion fija; lo que no se indique, con valores de relleno. */
export function packagingRef(overrides: Partial<PackagingRef> & Pick<PackagingRef, 'id'>): PackagingRef {
  return {
    name: 'Envase',
    presentationId: '00000000-0000-4000-8000-0000000000aa',
    presentationName: 'Presentacion del envase',
    content: '1.0000',
    unitId: '00000000-0000-4000-8000-0000000000bb',
    available: '0.0000',
    ...overrides,
  };
}
