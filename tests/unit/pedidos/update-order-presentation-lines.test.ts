// tests/unit/pedidos/update-order-presentation-lines.test.ts — R7, R11-R14, R35, R36, R38, R41,
// R42, R46, R48, [D3'].
//
// `updateOrderPresentationLines` (`design.md > 4.2`): la edicion ACOTADA del reparto y la
// unidad, aparte de `updateOrder`. Bloquea la fila ANTES de validar, comprueba
// `REPARTO_EDITABLE_STATUSES` (no `assertTransition`), resuelve presentaciones y unidades, corre
// `validateDistribution` con la cantidad de la fila BLOQUEADA, y solo si todo pasa escribe la
// unidad y reemplaza el reparto, y sincroniza lo apartado de sus envases, dentro de la MISMA
// unidad de trabajo compartida con `inventario`.

import { describe, expect, it, vi } from 'vitest';

import {
  createUpdateOrderPresentationLines,
  REPARTO_EDITABLE_STATUSES,
  type UpdateOrderPresentationLinesDeps,
} from '@/lib/modules/pedidos/domain/update-order-presentation-lines';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { LockedOrderRow, OrderWriteRepository } from '@/lib/modules/pedidos/ports/order-write-repository';
import type { MaterialReservations, PresentationCatalog, ReservationOutcome } from '@/lib/modules/inventario';
import type { RecipeExecutionLine } from '@/lib/modules/recetas';
import {
  fakeFinishedGoodsIntake,
  fakeMaterialReservations,
  fakeOrderUnitOfWork,
  fakeRecipeExecutionReader,
} from '../../helpers/order-unit-of-work-double';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';
import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PEDIDO = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = 'admin-a';
const ACTOR: Actor = { id: ACTOR_ID, companyId: EMPRESA, permissions: ['pedidos.modificar'] };
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const OTRA_UNIDAD_COMPATIBLE = '10101010-1010-4101-8101-101010101010';
const OTRA_UNIDAD_INCOMPATIBLE = '20202020-2020-4202-8202-202020202020';
const PRESENTACION_A = '66666666-6666-4666-8666-666666666666';
const PRESENTACION_B = '99999999-9999-4999-8999-999999999999';

const AHORA = new Date('2026-09-27T10:00:00.000Z');

function filaBloqueada(overrides: Partial<OrderRow> = {}): LockedOrderRow {
  const base: OrderRow = {
    id: PEDIDO,
    number: { year: 2026, sequence: 7 },
    recipeId: 'receta-1',
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ACTOR_ID,
    updatedBy: ACTOR_ID,
    presentationLines: [],
    unitId: UNIT_ID,
  };
  return { ...base, ...overrides, reservedAt: null };
}

/** Doble de `OrderWriteRepository`: los metodos que este caso de uso llama -bloquear, escribir el
 *  reparto, mover el estado, vaciar el importe y fijar `reserved_at`-; el resto explota. */
function ordersDoble(
  fila: LockedOrderRow | null,
  updateResult: 'ok' | 'not_found' = 'ok',
): {
  readonly orders: OrderWriteRepository;
  readonly updatePresentationLinesAlive: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
  readonly setIngredientsCost: ReturnType<typeof vi.fn>;
  readonly setReservedAt: ReturnType<typeof vi.fn>;
} {
  const lockAliveById = vi.fn(async () => fila);
  const updatePresentationLinesAlive = vi.fn(async () => updateResult);
  const setStatus = vi.fn(async () => 'ok' as const);
  const setIngredientsCost = vi.fn(async () => 'ok' as const);
  const setReservedAt = vi.fn(async () => undefined);
  const orders = {
    lockAliveById,
    updatePresentationLinesAlive,
    setStatus,
    setIngredientsCost,
    setReservedAt,
    // El resto del puerto no lo llama este caso de uso: si lo hiciera, el test que lo comprueba
    // (mas abajo, "no toca...") fallaria por una llamada inesperada al doble.
    create: vi.fn(async () => {
      throw new Error('create no deberia llamarse');
    }),
    updateAlive: vi.fn(async () => {
      throw new Error('updateAlive no deberia llamarse');
    }),
    cancelAlive: vi.fn(async () => {
      throw new Error('cancelAlive no deberia llamarse');
    }),
    softDeleteAlive: vi.fn(async () => {
      throw new Error('softDeleteAlive no deberia llamarse');
    }),
  } as unknown as OrderWriteRepository;
  return { orders, updatePresentationLinesAlive, setStatus, setIngredientsCost, setReservedAt };
}

/** Catalogo de unidades: `UNIT_ID` -la del pedido, por defecto- siempre resuelve, ademas de las
 *  que el test anada. */
function catalogoDeUnidades(extra: ReadonlyMap<string, UnitConversion> = new Map()) {
  const UNIDAD_PEDIDO: UnitConversion = { id: UNIT_ID, baseUnitId: null, factor: null };
  const combinadas = new Map<string, UnitConversion>([[UNIT_ID, UNIDAD_PEDIDO], ...extra]);
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = combinadas.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  return { units: { findRefs, findRefsSharingBaseInCompany: vi.fn(async () => []) } as unknown as UnitCatalog, findRefs };
}

/** Envase de cada presentacion del catalogo: el reparto nombra envases, y cada uno lleva su
 *  presentacion fija. */
const ENVASE_A = 'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6';
const ENVASE_B = 'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9';
const ENVASE_DE: Readonly<Record<string, string>> = { [PRESENTACION_A]: ENVASE_A, [PRESENTACION_B]: ENVASE_B };

/** Catalogos de presentaciones y de envases: `PRESENTACION_A` (y su `ENVASE_A`) con
 *  `content`/`unitId` configurables; con `presentaciones` explicito, se reemplazan enteros (para
 *  probar mas de una linea o una ausente). */
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
  const packaging = fakePackagingCatalog(
    [...presentaciones].map(([presentationId, p]) =>
      packagingRef({ id: ENVASE_DE[presentationId] ?? presentationId, presentationId, content: p.content, unitId: p.unitId }),
    ),
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog, packaging, findRefs };
}

function montar(deps: {
  readonly orders: OrderWriteRepository;
  readonly catalogos?: ReturnType<typeof catalogoDePresentaciones>;
  readonly units?: UnitCatalog;
  readonly reservations?: MaterialReservations;
  readonly recipeLines?: readonly RecipeExecutionLine[];
}) {
  const reservations = deps.reservations ?? fakeMaterialReservations();
  const recipes = fakeRecipeExecutionReader({
    findExecutionContentById: vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: deps.recipeLines ?? [],
    })),
  });
  const catalogos = deps.catalogos ?? catalogoDePresentaciones();
  const fullDeps: UpdateOrderPresentationLinesDeps = {
    presentations: catalogos.presentations,
    packaging: catalogos.packaging,
    units: deps.units ?? catalogoDeUnidades().units,
    unitOfWork: fakeOrderUnitOfWork({
      orders: deps.orders,
      reservations,
      recipes,
      finishedGoods: fakeFinishedGoodsIntake(),
    }),
    now: () => AHORA,
  };
  return createUpdateOrderPresentationLines(fullDeps);
}

describe("updateOrderPresentationLines — R11-R14, [D3']: ventana de estados editables", () => {
  it('REPARTO_EDITABLE_STATUSES es exactamente PENDIENTE, EN_CURSO, POR_EMPACAR y BLOQUEADO (QC-138)', () => {
    expect(REPARTO_EDITABLE_STATUSES).toEqual(['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'BLOQUEADO']);
  });

  it.each<OrderStatus>(['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'BLOQUEADO'])(
    'acepta %s: ok',
    async (status) => {
      const { orders } = ordersDoble(filaBloqueada({ status }));
      const update = montar({ orders });

      await expect(
        update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
      ).resolves.toBe('ok');
    },
  );

  it.each<OrderStatus>(['EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'])(
    'rechaza %s con not_editable, sin escribir la unidad ni las lineas',
    async (status) => {
      const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ status }));
      const update = montar({ orders });

      await expect(
        update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
      ).resolves.toBe('not_editable');
      expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
    },
  );

  it('not_found: la fila no existe, esta de baja o es de otra empresa', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(null);
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] }),
    ).resolves.toBe('not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — bloquea antes de validar (R37, R48)', () => {
  it('llama lockAliveById con el pedido y el ambito de empresa antes de tocar ningun catalogo', async () => {
    const { orders } = ordersDoble(filaBloqueada());
    const cat = catalogoDePresentaciones();
    const update = montar({ orders, catalogos: cat });

    await update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] });

    expect(orders.lockAliveById).toHaveBeenCalledWith(PEDIDO, { companyId: EMPRESA });
  });
});

describe('updateOrderPresentationLines — orden de comprobacion (design.md > 4.2)', () => {
  it('unit_not_found: la unidad nueva no existe o no es visible, sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders, units: catalogoDeUnidades().units });

    await expect(
      update(PEDIDO, ACTOR, { unitId: 'unidad-inexistente', lines: [] }),
    ).resolves.toBe('unit_not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('QC-195 R11: packaging_not_found: una linea nombra un envase que no vuelve del catalogo', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders, catalogos: catalogoDePresentaciones(new Map()) });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('packaging_not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R35 / QC-195 R13: presentation_without_content (la presentacion del envase no tiene contenido), sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const cat = catalogoDePresentaciones(new Map([[PRESENTACION_A, { content: null, unitId: UNIT_ID }]]));
    const update = montar({ orders, catalogos: cat });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('presentation_without_content');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R7: incompatible_units, incluida la unidad NUEVA que deja el reparto inconvertible (R38)', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const units = catalogoDeUnidades(
      new Map([
        [OTRA_UNIDAD_INCOMPATIBLE, { id: OTRA_UNIDAD_INCOMPATIBLE, baseUnitId: null, factor: null }],
      ]),
    ).units;
    const catalogos = catalogoDePresentaciones(
      new Map([[PRESENTACION_A, { content: '5.0000', unitId: OTRA_UNIDAD_INCOMPATIBLE }]]),
    );
    const update = montar({ orders, units, catalogos });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('incompatible_units');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R36: exceeds_quantity cuando el reparto pasa de la cantidad de la fila BLOQUEADA, sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 3 }] }),
    ).resolves.toBe('exceeds_quantity');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — R8, R9: igual al total, menor, y vacio', () => {
  it('un reparto exactamente igual al total se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledTimes(1);
  });

  it('un reparto menor que el total se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledTimes(1);
  });

  it('R9: un reparto vacio (vaciar el reparto) se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    await expect(update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] })).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(PEDIDO, UNIT_ID, [], ACTOR_ID, AHORA, {
      companyId: EMPRESA,
    });
  });
});

describe('updateOrderPresentationLines — escritura conjunta y reemplazo completo', () => {
  it('guarda la unidad NUEVA y TODAS las lineas nuevas juntas, con el contenido copiado en este instante', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    // La unidad NUEVA del pedido (distinta de `UNIT_ID`) tiene que poder resolverse en el
    // catalogo, y las presentaciones se declaran en ESA misma unidad para que el reparto sea
    // convertible (R38): lo que se prueba aqui es que unidad y lineas se escriben JUNTAS, no la
    // conversion en si -esa ya la prueba `order-distribution.test.ts`-.
    const units = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_COMPATIBLE, { id: OTRA_UNIDAD_COMPATIBLE, baseUnitId: null, factor: null }]]),
    ).units;
    const catalogos = catalogoDePresentaciones(
      new Map([
        [PRESENTACION_A, { content: '3.0000', unitId: OTRA_UNIDAD_COMPATIBLE }],
        [PRESENTACION_B, { content: '2.0000', unitId: OTRA_UNIDAD_COMPATIBLE }],
      ]),
    );
    const update = montar({ orders, units, catalogos });

    await expect(
      update(PEDIDO, ACTOR, {
        unitId: OTRA_UNIDAD_COMPATIBLE,
        lines: [
          { packagingProductId: ENVASE_A, packages: 1 },
          { packagingProductId: ENVASE_B, packages: 1 },
        ],
      }),
    ).resolves.toBe('ok');

    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(
      PEDIDO,
      OTRA_UNIDAD_COMPATIBLE,
      [
        { presentationId: PRESENTACION_A, packages: 1, content: '3.0000', packagingProductId: ENVASE_A },
        { presentationId: PRESENTACION_B, packages: 1, content: '2.0000', packagingProductId: ENVASE_B },
      ],
      ACTOR_ID,
      AHORA,
      { companyId: EMPRESA },
    );
  });
});

describe('QC-195 updateOrderPresentationLines — lineas antiguas y dos envases con la misma presentacion', () => {
  it('R35: una linea antigua que llega igual a la guardada se conserva sin envase', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(
      filaBloqueada({ presentationLines: [{ presentationId: PRESENTACION_A, packages: 1, packagingProductId: null }] }),
    );
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 1 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(
      PEDIDO,
      UNIT_ID,
      [{ presentationId: PRESENTACION_A, packages: 1, content: '5.0000', packagingProductId: null }],
      ACTOR_ID,
      AHORA,
      { companyId: EMPRESA },
    );
  });

  it('R34: una linea antigua con los envases cambiados -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(
      filaBloqueada({ presentationLines: [{ presentationId: PRESENTACION_A, packages: 1, packagingProductId: null }] }),
    );
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 2 }] }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R34: una linea por presentacion que el pedido no tenia -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 1 }] }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R12: dos envases con la misma presentacion -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const GEMELO = 'eaeaeaea-eaea-4eae-8eae-eaeaeaeaeaea';
    const catalogos = {
      ...catalogoDePresentaciones(),
      packaging: fakePackagingCatalog([
        packagingRef({ id: ENVASE_A, presentationId: PRESENTACION_A, content: '1.0000', unitId: UNIT_ID }),
        packagingRef({ id: GEMELO, presentationId: PRESENTACION_A, content: '1.0000', unitId: UNIT_ID }),
      ]),
    };
    const update = montar({ orders, catalogos });

    await expect(
      update(PEDIDO, ACTOR, {
        unitId: UNIT_ID,
        lines: [
          { packagingProductId: ENVASE_A, packages: 1 },
          { packagingProductId: GEMELO, packages: 1 },
        ],
      }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — R46: no toca quantity ni receta; QC-195 R15, R20: la reserva si, porque el reparto aparta sus envases', () => {
  it('las dependencias declaradas son solo packaging, presentations, units, unitOfWork y now', () => {
    const fullDeps: UpdateOrderPresentationLinesDeps = {
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDePresentaciones().packaging,
      units: catalogoDeUnidades().units,
      unitOfWork: { run: () => Promise.reject(new Error('no se usa')) },
      now: () => AHORA,
    };
    expect(Object.keys(fullDeps).sort()).toEqual(['now', 'packaging', 'presentations', 'unitOfWork', 'units']);
  });

  it('R46: no escribe cantidad ni receta -ni create, ni updateAlive- y, con todo apartado, no mueve el estado', async () => {
    const { orders, setStatus } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    // Si este caso de uso llamara a `create`/`updateAlive`/`cancelAlive`/`softDeleteAlive`, los
    // dobles de `ordersDoble` lanzarian y esta llamada rechazaria en vez de resolver 'ok'.
    await expect(update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] })).resolves.toBe('ok');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('R15, R20: la reserva se sincroniza con la necesidad completa -receta y envases del reparto nuevo-, en la misma unidad de trabajo', async () => {
    const { orders, setReservedAt } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const reservations = fakeMaterialReservations();
    const update = montar({
      orders,
      reservations,
      recipeLines: [{ productId: 'materia', productName: null, percentage: '100.00' }],
    });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] }),
    ).resolves.toBe('ok');

    expect(reservations.syncForOrder).toHaveBeenCalledWith({
      orderId: PEDIDO,
      companyId: EMPRESA,
      requirement: [
        { productId: 'materia', quantity: '10' },
        { productId: ENVASE_A, quantity: '2' },
      ],
      actorId: ACTOR_ID,
      now: AHORA,
    });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, AHORA, { companyId: EMPRESA });
  });
});

describe('QC-195 updateOrderPresentationLines — falta de envases y bloqueo', () => {
  const FALTA: ReservationOutcome = { kind: 'insufficient', productIds: [ENVASE_A] };

  function conFalta() {
    return fakeMaterialReservations({ syncForOrder: vi.fn(async () => FALTA) });
  }

  const LINEAS = { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] };

  it.each<OrderStatus>(['PENDIENTE', 'BLOQUEADO'])(
    'R17: en %s, sin confirmacion, falta de envase -> would_block, sin mover estado ni importe',
    async (status) => {
      const { orders, setStatus, setIngredientsCost } = ordersDoble(filaBloqueada({ status, quantity: '10.0000' }));
      const update = montar({ orders, reservations: conFalta() });

      await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('would_block');
      expect(setStatus).not.toHaveBeenCalled();
      expect(setIngredientsCost).not.toHaveBeenCalled();
    },
  );

  it('R17: con la confirmacion, un PENDIENTE pasa a BLOQUEADO sin importe y sin reserved_at', async () => {
    const { orders, setStatus, setIngredientsCost, setReservedAt } = ordersDoble(
      filaBloqueada({ status: 'PENDIENTE', quantity: '10.0000', ingredientsCost: '12.0000' }),
    );
    const update = montar({ orders, reservations: conFalta() });

    await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('ok');
    expect(setStatus).toHaveBeenCalledWith(PEDIDO, 'PENDIENTE', 'BLOQUEADO', ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, null, { companyId: EMPRESA });
  });

  it('R17: con la confirmacion, un BLOQUEADO sigue BLOQUEADO sin volver a moverse', async () => {
    const { orders, setStatus } = ordersDoble(filaBloqueada({ status: 'BLOQUEADO', quantity: '10.0000' }));
    const update = montar({ orders, reservations: conFalta() });

    await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('ok');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it.each<OrderStatus>(['EN_CURSO', 'POR_EMPACAR'])(
    'R18: en %s, falta de envase -> insufficient_material aunque llegue la confirmacion',
    async (status) => {
      const { orders, setStatus } = ordersDoble(filaBloqueada({ status, quantity: '10.0000' }));
      const update = montar({ orders, reservations: conFalta() });

      await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('insufficient_material');
      expect(setStatus).not.toHaveBeenCalled();
    },
  );

  it('R19: un BLOQUEADO cuyo reparto nuevo ya queda cubierto pasa a PENDIENTE con reserved_at', async () => {
    const { orders, setStatus, setReservedAt } = ordersDoble(filaBloqueada({ status: 'BLOQUEADO', quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setStatus).toHaveBeenCalledWith(PEDIDO, 'BLOQUEADO', 'PENDIENTE', ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, AHORA, { companyId: EMPRESA });
  });

  it('R24: en POR_EMPACAR solo se sincronizan los envases: la receta ni se lee', async () => {
    const { orders } = ordersDoble(filaBloqueada({ status: 'POR_EMPACAR', quantity: '10.0000' }));
    const reservations = fakeMaterialReservations();
    const recipeLines = [{ productId: 'materia', productName: null, percentage: '100.00' }];
    const update = montar({ orders, reservations, recipeLines });

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(reservations.syncForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ requirement: [{ productId: ENVASE_A, quantity: '2' }] }),
    );
  });
});
