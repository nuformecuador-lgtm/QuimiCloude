// tests/unit/pedidos/resolve-distribution.test.ts — R6, R7, R35, R36, R41, R42.
//
// `resolveDistribution` es el paso compartido de `createOrder`/`updateOrder`: resuelve las
// lineas del borde contra los catalogos de presentaciones y de unidades, corre
// `validateDistribution` y traduce su primer fallo. Aqui se prueba SOLO esa traduccion y la
// resolucion -`validateDistribution` en si ya tiene su propio archivo
// (`order-distribution.test.ts`).

import { describe, expect, it, vi } from 'vitest';

import {
  IncompatibleUnitsError,
  OrderDistributionExceedsQuantityError,
  PresentationNotFoundError,
  PresentationWithoutContentError,
  UnitNotFoundError,
} from '@/lib/modules/pedidos/domain/errors';
import { resolveDistribution } from '@/lib/modules/pedidos/domain/resolve-distribution';

import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const PRESENTACION_A = '66666666-6666-4666-8666-666666666666';
const PRESENTACION_B = '11111111-2222-4333-8444-555555555555';

function catalogos(opciones: {
  readonly presentaciones?: ReadonlyMap<string, { readonly content: string | null; readonly unitId: string }>;
  readonly unidades?: ReadonlyMap<string, { readonly baseUnitId: string | null; readonly factor: string | null }>;
} = {}) {
  const presentaciones = opciones.presentaciones ?? new Map([[PRESENTACION_A, { content: '5.0000', unitId: UNIT_ID }]]);
  const unidades = opciones.unidades ?? new Map([[UNIT_ID, { baseUnitId: null, factor: null }]]);

  const findRefsPresentaciones = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = presentaciones.get(id);
      return p === undefined ? [] : [{ id, name: 'Presentacion', content: p.content, unitId: p.unitId }];
    }),
  );
  const findRefsUnidades = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const u = unidades.get(id);
      return u === undefined ? [] : [{ id, ...u }];
    }),
  );

  return {
    presentations: { findRefs: findRefsPresentaciones } as unknown as PresentationCatalog,
    units: { findRefs: findRefsUnidades, findRefsSharingBaseInCompany: vi.fn(async () => []) } as unknown as UnitCatalog,
    findRefsPresentaciones,
    findRefsUnidades,
  };
}

describe('resolveDistribution', () => {
  it('R41: unidad del pedido ausente del catalogo -> UnitNotFoundError, sin llamar a presentaciones si no hay lineas', async () => {
    const cat = catalogos({ unidades: new Map() });

    await expect(
      resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, []),
    ).rejects.toBeInstanceOf(UnitNotFoundError);
  });

  it('una presentacion ausente del catalogo de la empresa -> PresentationNotFoundError', async () => {
    const cat = catalogos({ presentaciones: new Map() });

    await expect(
      resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
        { presentationId: PRESENTACION_A, packages: 1 },
      ]),
    ).rejects.toBeInstanceOf(PresentationNotFoundError);
  });

  it('R35: presentacion sin contenido -> PresentationWithoutContentError con el id en el diagnostico', async () => {
    const cat = catalogos({ presentaciones: new Map([[PRESENTACION_A, { content: null, unitId: UNIT_ID }]]) });

    const error = await resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 1 },
    ]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PresentationWithoutContentError);
    expect((error as PresentationWithoutContentError).diagnostic).toBe(PRESENTACION_A);
  });

  it('R7: unidad de la presentacion sin base comun con la del pedido -> IncompatibleUnitsError', async () => {
    const OTRA_UNIDAD = '88888888-8888-4888-8888-888888888888';
    const cat = catalogos({
      presentaciones: new Map([[PRESENTACION_A, { content: '5.0000', unitId: OTRA_UNIDAD }]]),
      unidades: new Map([
        [UNIT_ID, { baseUnitId: null, factor: null }],
        [OTRA_UNIDAD, { baseUnitId: null, factor: null }],
      ]),
    });

    await expect(
      resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
        { presentationId: PRESENTACION_A, packages: 1 },
      ]),
    ).rejects.toBeInstanceOf(IncompatibleUnitsError);
  });

  it('R36: el reparto pasa del total -> OrderDistributionExceedsQuantityError', async () => {
    const cat = catalogos();

    await expect(
      resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
        { presentationId: PRESENTACION_A, packages: 3 },
      ]),
    ).rejects.toBeInstanceOf(OrderDistributionExceedsQuantityError);
  });

  it('R6, R8: sin fallo, devuelve las lineas con el contenido copiado en este instante', async () => {
    const cat = catalogos();

    const lineas = await resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 2 },
    ]);

    expect(lineas).toEqual([{ presentationId: PRESENTACION_A, packages: 2, content: '5.0000' }]);
  });

  it('R9: sin ninguna linea, se acepta sin consultar el catalogo de presentaciones', async () => {
    const cat = catalogos();

    const lineas = await resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, []);

    expect(lineas).toEqual([]);
    expect(cat.findRefsPresentaciones).not.toHaveBeenCalled();
  });

  it('UNA sola llamada a `UnitCatalog.findRefs`, con los ids UNICOS de la unidad del pedido y las presentaciones distintas', async () => {
    const cat = catalogos({
      presentaciones: new Map([
        [PRESENTACION_A, { content: '2.0000', unitId: UNIT_ID }],
        [PRESENTACION_B, { content: '1.0000', unitId: UNIT_ID }],
      ]),
    });

    await resolveDistribution(cat.presentations, cat.units, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 1 },
      { presentationId: PRESENTACION_B, packages: 1 },
    ]);

    expect(cat.findRefsUnidades).toHaveBeenCalledTimes(1);
    expect(cat.findRefsUnidades).toHaveBeenCalledWith([UNIT_ID], COMPANY_ID);
  });
});
