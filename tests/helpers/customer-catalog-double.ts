// Doble de `CustomerCatalog` para los tests unitarios de `pedidos` que no tratan del cliente:
// sin clientes en la empresa, como el adaptador real ante un id ajeno o inexistente.
import { vi } from 'vitest';

import type { CustomerCatalog } from '@/lib/modules/clientes';

export function fakeCustomerCatalog(): CustomerCatalog & {
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>;
  readonly findAliveRefById: ReturnType<typeof vi.fn>;
  readonly searchRefs: ReturnType<typeof vi.fn>;
} {
  return {
    findRefsIncludingDeleted: vi.fn(async () => []),
    findAliveRefById: vi.fn(async () => null),
    searchRefs: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })),
  };
}
