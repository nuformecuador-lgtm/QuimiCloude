// El detalle del acondicionador: la misma fila de «Por acondicionar» para un pedido, y el mismo
// `order_not_found` en todos los casos que no debe abrir.
import { describe, expect, it } from 'vitest';

import { createGetConditioningOrder } from '@/lib/modules/asignaciones/domain/get-conditioning-order';
import { createListConditioningOrders } from '@/lib/modules/asignaciones/domain/list-conditioning-orders';
import {
  AsignacionesError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import type { AssignedOrderSummary } from '@/lib/modules/pedidos';

import {
  ACONDICIONADOR,
  ANA,
  BETO,
  EMPRESA,
  PEDIDO_1,
  UNIDAD,
  actoresSinElPermiso,
  montar,
  persona,
  receta,
  resumen,
} from './conditioning-doubles';

const LINEAS = [
  { presentationId: 'pres-500', packages: 12, packagingName: '500 g' },
  { presentationId: 'pres-1k', packages: 4, packagingName: '1 kg' },
];

function montarCon(item: AssignedOrderSummary | null) {
  return montar({
    items: item === null ? [] : [item],
    refs: [receta()],
    people: [persona(ANA, 'Ana Lopez'), persona(BETO, 'Beto Ruiz')],
    presentations: [
      { id: 'pres-500', name: 'Bolsa 500 g' },
      { id: 'pres-1k', name: 'Bolsa 1 kg' },
    ] as never,
    units: [{ id: UNIDAD, name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null }],
  });
}

describe('R19 — getConditioningOrder exige el permiso antes de validar y sin tocar ningun puerto', () => {
  it.each(actoresSinElPermiso(SEED_ROLE_PERMISSIONS, [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]))(
    'R19: rechaza con `unauthorized` a %s, aun con un id que no es uuid',
    async (_nombre, actor) => {
      const { deps, todos } = montar();

      const resultado = createGetConditioningOrder(deps)(actor, { orderId: 'no-es-uuid' });

      await expect(resultado).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(resultado).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    },
  );
});

describe('R20 — la entrada es exactamente `{ orderId: <uuid> }`', () => {
  it.each([
    ['id que no es uuid', { orderId: 'pedido-1' }],
    ['sin orderId', {}],
    ['una clave de mas', { orderId: PEDIDO_1, extra: 1 }],
    ['orderId numerico', { orderId: 7 }],
    ['no es un objeto', PEDIDO_1],
  ])('R20: %s se rechaza con `invalid_input` sin tocar ningun puerto', async (_nombre, entrada) => {
    const { deps, todos } = montar();

    const resultado = createGetConditioningOrder(deps)(ACONDICIONADOR, entrada);

    await expect(resultado).rejects.toBeInstanceOf(ValidationError);
    await expect(resultado).rejects.toMatchObject({ code: 'invalid_input' });
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('R15 — el detalle muestra la misma fila que la lista', () => {
  it('R15: consulta ese pedido de la empresa del actor con los tres estados que abre el detalle', async () => {
    const { deps, listAliveSummariesByIds } = montarCon(resumen(PEDIDO_1));

    await createGetConditioningOrder(deps)(ACONDICIONADOR, { orderId: PEDIDO_1 });

    expect(listAliveSummariesByIds).toHaveBeenCalledWith(
      EMPRESA,
      [PEDIDO_1],
      ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'],
      1,
      1,
    );
  });

  it.each([
    ['POR_ACONDICIONAR sin quien acondiciona', resumen(PEDIDO_1, { presentationLines: LINEAS })],
    [
      'EN_ACONDICIONAMIENTO de otra persona',
      resumen(PEDIDO_1, { status: 'EN_ACONDICIONAMIENTO', conditionedBy: BETO, presentationLines: LINEAS }),
    ],
    [
      'EN_ACONDICIONAMIENTO del propio actor',
      resumen(PEDIDO_1, { status: 'EN_ACONDICIONAMIENTO', conditionedBy: ANA, presentationLines: LINEAS }),
    ],
    [
      'TERMINADO que acondiciono el propio actor',
      resumen(PEDIDO_1, {
        status: 'TERMINADO',
        conditionedBy: ANA,
        finishedAt: new Date('2026-10-02T00:00:00.000Z'),
        presentationLines: LINEAS,
      }),
    ],
  ])('R15: %s abre con los mismos valores que su fila de la lista', async (_nombre, item) => {
    const detalle = montarCon(item);
    const lista = montarCon(item);

    const fila = await createGetConditioningOrder(detalle.deps)(ACONDICIONADOR, { orderId: PEDIDO_1 });
    const [deLaLista] = (await createListConditioningOrders(lista.deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila).toEqual(deLaLista);
    expect(fila.status).toBe(item.status);
    expect(fila.numberText).toBe('2026-0000007');
    expect(fila.recipeName).toBe('Jabon liquido');
    expect(fila.quantity).toBe('10.0000');
    expect(fila.unitLabel).toBe('kg');
    expect(fila.presentationLines.map((linea) => [linea.packages, linea.packagingName])).toEqual([
      [12, '500 g'],
      [4, '1 kg'],
    ]);
    const nombres: Record<string, string> = { [ANA]: 'Ana Lopez', [BETO]: 'Beto Ruiz' };
    expect(fila.conditionedByName).toBe(item.conditionedBy === null ? null : nombres[item.conditionedBy]);
  });
});

describe('R17 — el mismo `order_not_found` en todos los casos que el detalle no abre', () => {
  it('R17: un pedido que no existe, esta de baja o es de otra empresa (la consulta no lo devuelve)', async () => {
    const { deps } = montarCon(null);

    const resultado = createGetConditioningOrder(deps)(ACONDICIONADOR, { orderId: PEDIDO_1 });

    await expect(resultado).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(resultado).rejects.toMatchObject({ code: 'order_not_found' });
  });

  it('R17: un ENTREGADO, aunque lo acondicionara el actor, no esta entre los estados consultados', async () => {
    const { deps, listAliveSummariesByIds } = montarCon(null);

    await expect(createGetConditioningOrder(deps)(ACONDICIONADOR, { orderId: PEDIDO_1 })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    const estados = listAliveSummariesByIds.mock.calls[0]?.[2];
    expect(estados).not.toContain('ENTREGADO');
    for (const fuera of ['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE', 'CANCELADO', 'BLOQUEADO']) {
      expect(estados).not.toContain(fuera);
    }
  });

  it.each([
    ['TERMINADO que acondiciono otra persona', BETO],
    ['TERMINADO sin quien acondiciona', null],
  ])('R17: %s es `order_not_found`, sin componer la fila', async (_nombre, conditionedBy) => {
    const { deps, findRefsIncludingDeleted, findRefsIncludingDeletedInCompany } = montarCon(
      resumen(PEDIDO_1, { status: 'TERMINADO', conditionedBy, finishedAt: new Date('2026-10-02T00:00:00.000Z') }),
    );

    const resultado = createGetConditioningOrder(deps)(ACONDICIONADOR, { orderId: PEDIDO_1 });

    await expect(resultado).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(resultado).rejects.toMatchObject({ code: 'order_not_found' });
    expect(findRefsIncludingDeleted).not.toHaveBeenCalled();
    expect(findRefsIncludingDeletedInCompany).not.toHaveBeenCalled();
  });

  it('R17: todos los casos lanzan el mismo error, con el mismo codigo y mensaje', async () => {
    const casos = [
      montarCon(null),
      montarCon(resumen(PEDIDO_1, { status: 'TERMINADO', conditionedBy: BETO, finishedAt: new Date() })),
      montarCon(resumen(PEDIDO_1, { status: 'TERMINADO', conditionedBy: null, finishedAt: new Date() })),
    ];
    const errores = await Promise.all(
      casos.map(({ deps }) =>
        createGetConditioningOrder(deps)(ACONDICIONADOR, { orderId: PEDIDO_1 }).catch((error: unknown) => error),
      ),
    );

    const firmas = errores.map((error) => {
      const e = error as OrderNotFoundError;
      return [e.constructor.name, e.code, e.message];
    });
    expect(new Set(firmas.map((firma) => JSON.stringify(firma))).size).toBe(1);
    expect(firmas[0]?.[1]).toBe('order_not_found');
  });
});
