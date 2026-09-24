// T2 (QC-146) — Adaptador driven de `PresentationCatalog` en `inventario`.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-catalog.test.ts`. Prueba el mapeo PURO (`toPresentationRef`),
// el atajo sin consulta de `findRefs([])` y que la consulta compone el ambito de empresa con el
// mismo punto unico del modulo. Que Postgres filtre de verdad, y que una presentacion de otra
// empresa no vuelva, lo prueba `tests/integration/inventario/company-scope-queries.int.test.ts`
// (R28).

import { Prisma } from '@prisma/client';

import {
  findPresentationRefs,
  toPresentationRef,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { presentationCompanyScope } from '@/lib/modules/inventario/adapters/driven/persistence/company-scope';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { presentation: { findMany } } }));

describe('toPresentationRef', () => {
  it('mapea id y name tal cual, y el contenido nulo como null', () => {
    const ref = toPresentationRef({ id: 'pr-1', name: 'Bidon 20L', content: null });
    expect(ref).toEqual({ id: 'pr-1', name: 'Bidon 20L', content: null });
  });

  // QC-150 (R38-R40): ampliacion nombrada del contrato -`PresentationRef` gana `content`-,
  // el que `pedidos` copia al crear o cambiar de presentacion.
  it('mapea el contenido con los 4 decimales de DECIMAL(14,4) (R38)', () => {
    const ref = toPresentationRef({
      id: 'pr-1',
      name: 'Bidon 20L',
      content: new Prisma.Decimal('1'),
    });
    expect(ref.content).toBe('1.0000');
  });

  it('la referencia publica no lleva ningun otro campo', () => {
    const ref = toPresentationRef({ id: 'pr-1', name: 'Bidon 20L', content: null });
    expect(Object.keys(ref).sort()).toEqual(['content', 'id', 'name']);
  });
});

describe('R28 — findRefs compone el ambito con presentationCompanyScope y con ids vacios no consulta', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('con ids vacios no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findPresentationRefs([], 'empresa-1')

    expect(refs).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('la consulta compone el ambito con presentationCompanyScope, en un AND aparte del filtro por ids', async () => {
    findMany.mockResolvedValue([])

    await findPresentationRefs(['pr-1', 'pr-2'], 'empresa-1')

    const args = findMany.mock.calls[0]?.[0]
    expect(args.where).toEqual({
      AND: [presentationCompanyScope({ companyId: 'empresa-1' }), { id: { in: ['pr-1', 'pr-2'] } }],
    })
    expect(args.select).toEqual({ id: true, name: true, content: true })
  })

  it('una presentacion de OTRA empresa se resuelve igual que una inexistente: no vuelve', async () => {
    findMany.mockResolvedValue([{ id: 'pr-propia', name: 'Bidon 20L', content: null }])

    const refs = await findPresentationRefs(['pr-propia', 'pr-de-otra-empresa'], 'empresa-1')

    expect(refs).toHaveLength(1)
    expect(refs.map((ref) => ref.id)).toEqual(['pr-propia'])
  })
})
