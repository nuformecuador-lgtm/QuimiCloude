// QC-219 (D13) — «Entregados» del acondicionador: solo ENTREGADO, solo los que acondiciono el
// actor, filtrado en la consulta, con la misma fila, orden y paginacion que su «Terminados».
import { describe, expect, it } from 'vitest';

import { createListConditionedOrders } from '@/lib/modules/asignaciones/domain/list-conditioned-orders';
import { createListDeliveredConditionedOrders } from '@/lib/modules/asignaciones/domain/list-delivered-conditioned-orders';
import { AsignacionesError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import {
  ACONDICIONADOR,
  ANA,
  BETO,
  EMPRESA,
  PEDIDO_1,
  actoresSinElPermiso,
  montar,
  persona,
  receta,
  resumen,
} from './conditioning-doubles';

describe('R26 — listDeliveredConditionedOrders exige el permiso antes de validar y sin tocar ningun puerto', () => {
  it.each(actoresSinElPermiso(SEED_ROLE_PERMISSIONS, [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]))(
    'R26: rechaza con `unauthorized` a %s, aun con una entrada invalida',
    async (_nombre, actor) => {
      const { deps, todos } = montar();

      const resultado = createListDeliveredConditionedOrders(deps)(actor, { page: 0 });

      await expect(resultado).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(resultado).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    },
  );

  it('R26: `terminados.consultar` o `pedidos.consultar` no sustituyen al permiso', async () => {
    for (const permiso of ['terminados.consultar', 'pedidos.consultar']) {
      const { deps, todos } = montar();
      await expect(
        createListDeliveredConditionedOrders(deps)({ ...ACONDICIONADOR, permissions: [permiso] }, { page: 1 }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    }
  });
});

describe('R20 — la entrada es exactamente `{ page, pageSize? }`', () => {
  it.each([
    ['page 0', { page: 0 }],
    ['una clave de mas', { page: 1, conditionedBy: BETO }],
    ['no es un objeto', 7],
  ])('R20: %s se rechaza con `invalid_input` sin tocar ningun puerto', async (_nombre, entrada) => {
    const { deps, todos } = montar();

    const resultado = createListDeliveredConditionedOrders(deps)(ACONDICIONADOR, entrada);

    await expect(resultado).rejects.toBeInstanceOf(ValidationError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('R20 — solo ENTREGADO, solo los que acondiciono el actor, con el orden de «Terminados»', () => {
  it('R20: consulta la empresa del actor con solo ENTREGADO, `finished_recent_first` y `conditionedBy` = el actor', async () => {
    const { deps, listAliveSummariesInCompany } = montar();

    await createListDeliveredConditionedOrders(deps)(ACONDICIONADOR, { page: 2, pageSize: 25 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledTimes(1);
    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(EMPRESA, ['ENTREGADO'], 'finished_recent_first', 2, 25, {
      conditionedBy: ANA,
    });
  });

  it('R20: el filtro sale siempre del actor', async () => {
    const { deps, listAliveSummariesInCompany } = montar();

    await createListDeliveredConditionedOrders(deps)({ ...ACONDICIONADOR, id: BETO }, { page: 1 });

    expect(listAliveSummariesInCompany.mock.calls[0]?.[5]).toEqual({ conditionedBy: BETO });
  });

  it('R20: la fila, el total y la paginacion son los mismos que daria «Terminados» con la misma consulta', async () => {
    const entregado = new Date('2026-10-05T09:00:00.000Z');
    const opciones = {
      items: [
        resumen(PEDIDO_1, {
          status: 'ENTREGADO',
          conditionedBy: ANA,
          finishedAt: entregado,
          presentationLines: [{ presentationId: 'pres-1', packages: 3, packagingName: 'Garrafa' }],
        }),
      ],
      total: 12,
      refs: [receta()],
      presentations: [{ id: 'pres-1', name: 'Garrafa 5 L' }] as never,
      rows: [{ orderId: PEDIDO_1, userId: BETO, workGroupId: null, workGroupName: null }],
      people: [persona(BETO, 'Beto Ruiz')],
    };

    const entregados = await createListDeliveredConditionedOrders(montar(opciones).deps)(ACONDICIONADOR, {
      page: 2,
      pageSize: 5,
    });
    const terminados = await createListConditionedOrders(montar(opciones).deps)(ACONDICIONADOR, { page: 2, pageSize: 5 });

    expect(entregados).toEqual(terminados);
    expect(entregados.total).toBe(12);
    expect(entregados.totalPages).toBe(3);
    expect(entregados.items[0]).toMatchObject({ id: PEDIDO_1, numberText: '2026-0000007', finishedAt: entregado });
  });
});
