// tests/unit/pedidos/order-presentation-availability.test.ts — R6, R7, R39, `design.md > 3`.
//
// `quoteOrderPresentationAvailability` (T11): resuelve la unidad del pedido y las de cada
// presentacion del reparto contra los catalogos y REUTILIZA `validateDistribution` (T20) para
// el disponible. Nunca lanza por el reparto -es de solo lectura, R39-: solo `requirePermission`
// y `zod` pueden rechazar la llamada entera.

import { describe, expect, it, vi } from 'vitest';

import { UnauthorizedError, ValidationError } from '@/lib/modules/pedidos/domain/errors';
import { createQuoteOrderPresentationAvailability } from '@/lib/modules/pedidos/domain/order-presentation-availability';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ACTOR: Actor = { id: 'admin-a', companyId: EMPRESA, permissions: ['pedidos.modificar'] };

const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const OTRA_UNIDAD_COMPATIBLE = '10101010-1010-4101-8101-101010101010';
const OTRA_UNIDAD_INCOMPATIBLE = '20202020-2020-4202-8202-202020202020';
const PRESENTACION_A = '66666666-6666-4666-8666-666666666666';
const PRESENTACION_B = '99999999-9999-4999-8999-999999999999';

/** Catalogo de unidades: `UNIT_ID` -la del pedido, por defecto- siempre resuelve, ademas de las
 *  que el test anada. Mismo patron que `update-order-presentation-lines.test.ts`. */
function catalogoDeUnidades(extra: ReadonlyMap<string, UnitConversion> = new Map()) {
  const UNIDAD_PEDIDO: UnitConversion = { id: UNIT_ID, baseUnitId: null, factor: null };
  const combinadas = new Map<string, UnitConversion>([[UNIT_ID, UNIDAD_PEDIDO], ...extra]);
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = combinadas.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  return { units: { findRefs, findRefsSharingBaseInCompany: vi.fn(async () => []) } as unknown as UnitCatalog };
}

function catalogoDePresentaciones(
  presentaciones: ReadonlyMap<string, { readonly content: string | null; readonly unitId: string }> = new Map([
    [PRESENTACION_A, { content: '5.0000', unitId: UNIT_ID }],
  ]),
) {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = presentaciones.get(id);
      return p === undefined ? [] : [{ id, name: 'Presentacion', content: p.content, unitId: p.unitId }];
    }),
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog };
}

function montar(overrides: { readonly presentations?: PresentationCatalog; readonly units?: UnitCatalog } = {}) {
  return createQuoteOrderPresentationAvailability({
    presentations: overrides.presentations ?? catalogoDePresentaciones().presentations,
    units: overrides.units ?? catalogoDeUnidades().units,
  });
}

describe('quoteOrderPresentationAvailability — R12: exige permiso antes de tocar cualquier catalogo', () => {
  it('sin actor, rechaza con UnauthorizedError sin llamar a ningun catalogo', async () => {
    const presentations = catalogoDePresentaciones().presentations;
    const units = catalogoDeUnidades().units;
    const quote = montar({ presentations, units });

    await expect(
      quote({ quantity: '10', unitId: UNIT_ID, presentationLines: [] }, null),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.findRefs).not.toHaveBeenCalled();
  });

  it('sin el permiso pedidos.modificar, rechaza con UnauthorizedError', async () => {
    const quote = montar();
    const sinPermiso: Actor = { id: 'x', companyId: EMPRESA, permissions: ['pedidos.consultar'] };

    await expect(
      quote({ quantity: '10', unitId: UNIT_ID, presentationLines: [] }, sinPermiso),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('quoteOrderPresentationAvailability — R55: entrada invalida rechaza en el borde', () => {
  it('una cantidad que no es un decimal valido rechaza con ValidationError', async () => {
    const quote = montar();

    await expect(
      quote({ quantity: 'no-es-un-numero', unitId: UNIT_ID, presentationLines: [] }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('quoteOrderPresentationAvailability — R6: unidades iguales y convertibles', () => {
  it('unidades iguales: el disponible sale exacto en la unidad del pedido', async () => {
    const quote = montar();

    const resultado = await quote(
      {
        quantity: '100',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 5 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'ok', available: '75' });
  });

  it('unidades convertibles: la presentacion en otra unidad con base comun se convierte antes de sumar', async () => {
    const units = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_COMPATIBLE, { id: OTRA_UNIDAD_COMPATIBLE, baseUnitId: UNIT_ID, factor: '0.001' }]]),
    ).units;
    const presentations = catalogoDePresentaciones(
      new Map([[PRESENTACION_A, { content: '100', unitId: OTRA_UNIDAD_COMPATIBLE }]]),
    ).presentations;
    const quote = montar({ units, presentations });

    // 2 envases x 100 (en la unidad chica) x 0.001 = 0.2 en la unidad del pedido.
    const resultado = await quote(
      {
        quantity: '1',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 2 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'ok', available: '0.8' });
  });
});

describe('quoteOrderPresentationAvailability — R7: unidades incompatibles marca la linea', () => {
  it('sin base comun con la unidad del pedido, devuelve incompatible_units con la presentacion', async () => {
    const units = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_INCOMPATIBLE, { id: OTRA_UNIDAD_INCOMPATIBLE, baseUnitId: null, factor: null }]]),
    ).units;
    const presentations = catalogoDePresentaciones(
      new Map([[PRESENTACION_A, { content: '5.0000', unitId: OTRA_UNIDAD_INCOMPATIBLE }]]),
    ).presentations;
    const quote = montar({ units, presentations });

    const resultado = await quote(
      {
        quantity: '100',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 1 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'incompatible_units', presentationId: PRESENTACION_A });
  });
});

describe('quoteOrderPresentationAvailability — R8: reparto igual al total, disponible 0, valido', () => {
  it('el reparto exactamente igual al total no rechaza: disponible 0', async () => {
    const quote = montar();

    const resultado = await quote(
      {
        quantity: '10',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 2 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'ok', available: '0' });
  });
});

describe('quoteOrderPresentationAvailability — R36, R39: reparto que excede, disponible negativo, no rechaza', () => {
  it('el reparto que pasa del total devuelve exceeds_quantity con el disponible negativo, sin lanzar', async () => {
    const quote = montar();

    const resultado = await quote(
      {
        quantity: '10',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 3 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'exceeds_quantity', available: '-5' });
  });
});

describe('quoteOrderPresentationAvailability — resolucion de catalogos', () => {
  it('unit_not_found: la unidad del pedido no existe o no es visible para la empresa', async () => {
    const quote = montar();
    const UNIDAD_INEXISTENTE = '55555555-5555-4555-8555-555555555555';

    const resultado = await quote(
      { quantity: '10', unitId: UNIDAD_INEXISTENTE, presentationLines: [] },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'unit_not_found' });
  });

  it('presentation_not_found: una linea nombra una presentacion que no vuelve del catalogo', async () => {
    const presentations = catalogoDePresentaciones(new Map()).presentations;
    const quote = montar({ presentations });

    const resultado = await quote(
      {
        quantity: '10',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 1 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'presentation_not_found' });
  });

  it('R35: presentation_without_content, sin lanzar', async () => {
    const presentations = catalogoDePresentaciones(
      new Map([[PRESENTACION_A, { content: null, unitId: UNIT_ID }]]),
    ).presentations;
    const quote = montar({ presentations });

    const resultado = await quote(
      {
        quantity: '10',
        unitId: UNIT_ID,
        presentationLines: [{ presentationId: PRESENTACION_A, packages: 1 }],
      },
      ACTOR,
    );

    expect(resultado).toEqual({ kind: 'presentation_without_content', presentationId: PRESENTACION_A });
  });

  it('sin ninguna linea, el disponible es la cantidad entera del pedido', async () => {
    const quote = montar();

    const resultado = await quote({ quantity: '42.5000', unitId: UNIT_ID, presentationLines: [] }, ACTOR);

    expect(resultado).toEqual({ kind: 'ok', available: '42.5000' });
  });

  it('dos lineas: una sola llamada a units.findRefs con los ids UNICOS que hacen falta', async () => {
    const unidades = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_COMPATIBLE, { id: OTRA_UNIDAD_COMPATIBLE, baseUnitId: null, factor: null }]]),
    );
    const presentations = catalogoDePresentaciones(
      new Map([
        [PRESENTACION_A, { content: '1', unitId: UNIT_ID }],
        [PRESENTACION_B, { content: '1', unitId: OTRA_UNIDAD_COMPATIBLE }],
      ]),
    ).presentations;
    const quote = montar({ units: unidades.units, presentations });

    await quote(
      {
        quantity: '10',
        unitId: UNIT_ID,
        presentationLines: [
          { presentationId: PRESENTACION_A, packages: 1 },
          { presentationId: PRESENTACION_B, packages: 1 },
        ],
      },
      ACTOR,
    );

    // Una llamada para la unidad del pedido (`unitId`) y otra para las de las presentaciones
    // (con los ids UNICOS que le faltan): dos en total, ninguna repite `UNIT_ID`.
    expect(unidades.units.findRefs).toHaveBeenCalledTimes(2);
    expect(unidades.units.findRefs).toHaveBeenNthCalledWith(2, [OTRA_UNIDAD_COMPATIBLE], EMPRESA);
  });
});
