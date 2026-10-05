import { UnauthorizedError } from '@/lib/modules/inventario/domain/errors';
import { createListProductFormUnits } from '@/lib/modules/inventario/domain/list-product-form-units';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

const EMPRESA = 'company-a';

const UNIDADES: readonly UnitRef[] = [
  { id: 'kg', name: 'kilogramo', symbol: 'kg', baseUnitId: null, factor: null },
  { id: 'u', name: 'unidad', symbol: 'u', baseUnitId: null, factor: null },
];

function catalogo() {
  return { listVisibleRefs: vi.fn<UnitCatalog['listVisibleRefs']>(async () => UNIDADES) };
}

describe('createListProductFormUnits', () => {
  it('R20 con inventario.modificar y sin unidades.consultar devuelve las unidades visibles', async () => {
    const units = catalogo();
    const actor: Actor = { id: 'user-1', companyId: EMPRESA, permissions: ['inventario.modificar'] };

    const resultado = await createListProductFormUnits({ units })(actor);

    expect(resultado).toEqual(UNIDADES);
    expect(units.listVisibleRefs).toHaveBeenCalledTimes(1);
    expect(units.listVisibleRefs).toHaveBeenCalledWith(EMPRESA);
  });

  it('R20 sin inventario.modificar rechaza con error de permiso y no consulta unidades', async () => {
    const actores: ReadonlyArray<Actor | null | undefined> = [
      { id: 'user-1', companyId: EMPRESA, permissions: [] },
      { id: 'user-1', companyId: EMPRESA, permissions: ['inventario.consultar', 'unidades.consultar'] },
      null,
      undefined,
    ];

    for (const actor of actores) {
      const units = catalogo();
      await expect(createListProductFormUnits({ units })(actor)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(units.listVisibleRefs).not.toHaveBeenCalled();
    }
  });
});
