// «Terminados» del acondicionador: solo TERMINADO, solo los que acondiciono el actor, filtrado en la
// consulta, con la misma fila que el «Terminados» del Empacador.
import { describe, expect, it } from 'vitest';

import { createListConditionedOrders } from '@/lib/modules/asignaciones/domain/list-conditioned-orders';
import { createListFinishedOrders } from '@/lib/modules/asignaciones/domain/list-finished-orders';
import { AsignacionesError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import type { ListFinishedOrdersDeps } from '@/lib/modules/asignaciones/domain/list-finished-orders';

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

describe('R19 — listConditionedOrders exige el permiso antes de validar y sin tocar ningun puerto', () => {
  it.each(actoresSinElPermiso(SEED_ROLE_PERMISSIONS, [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]))(
    'R19: rechaza con `unauthorized` a %s, aun con una entrada invalida',
    async (_nombre, actor) => {
      const { deps, todos } = montar();

      const resultado = createListConditionedOrders(deps)(actor, { page: 0 });

      await expect(resultado).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(resultado).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    },
  );
});

describe('R20 — la entrada es exactamente `{ page, pageSize? }` con enteros positivos', () => {
  it.each([
    ['page 0', { page: 0 }],
    ['pageSize negativo', { page: 1, pageSize: -5 }],
    ['page decimal', { page: 2.5 }],
    ['una clave de mas', { page: 1, conditionedBy: BETO }],
    ['no es un objeto', 7],
  ])('R20: %s se rechaza con `invalid_input` sin tocar ningun puerto', async (_nombre, entrada) => {
    const { deps, todos } = montar();

    const resultado = createListConditionedOrders(deps)(ACONDICIONADOR, entrada);

    await expect(resultado).rejects.toBeInstanceOf(ValidationError);
    await expect(resultado).rejects.toMatchObject({ code: 'invalid_input' });
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });
});

describe('R11 — solo TERMINADO, solo los que acondiciono el actor, filtrado en la consulta', () => {
  it('R11: consulta la empresa del actor con solo TERMINADO, el orden de terminados y `conditionedBy` = el actor', async () => {
    const { deps, listAliveSummariesInCompany } = montar();

    await createListConditionedOrders(deps)(ACONDICIONADOR, { page: 2, pageSize: 25 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledTimes(1);
    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(EMPRESA, ['TERMINADO'], 'finished_recent_first', 2, 25, {
      conditionedBy: ANA,
    });
  });

  it('R11: un ENTREGADO, aunque lo acondicionara el actor, no entra: el estado no esta en la consulta', async () => {
    const { deps, listAliveSummariesInCompany } = montar();

    await createListConditionedOrders(deps)(ACONDICIONADOR, { page: 1 });

    const estados = listAliveSummariesInCompany.mock.calls[0]?.[1];
    expect(estados).toEqual(['TERMINADO']);
    expect(estados).not.toContain('ENTREGADO');
  });

  it('R11: el filtro no se toma de la entrada: es siempre el id del actor', async () => {
    const otroActor = { ...ACONDICIONADOR, id: BETO };
    const { deps, listAliveSummariesInCompany } = montar();

    await createListConditionedOrders(deps)(otroActor, { page: 1 });

    expect(listAliveSummariesInCompany.mock.calls[0]?.[5]).toEqual({ conditionedBy: BETO });
  });

  it('R11: el total y la paginacion son los de la consulta filtrada', async () => {
    const { deps } = montar({ items: [resumen(PEDIDO_1, { status: 'TERMINADO' })], total: 12 });

    const pagina = await createListConditionedOrders(deps)(ACONDICIONADOR, { page: 2, pageSize: 5 });

    expect(pagina.total).toBe(12);
    expect(pagina.page).toBe(2);
    expect(pagina.totalPages).toBe(3);
  });

  it('R11: la fila es la del «Terminados» del Empacador: numero, receta, cantidad, reparto, unidad, fecha y responsables', async () => {
    const terminado = new Date('2026-10-01T09:00:00.000Z');
    const { deps } = montar({
      items: [
        resumen(PEDIDO_1, {
          status: 'TERMINADO',
          conditionedBy: ANA,
          finishedAt: terminado,
          unitId: null,
          presentationLines: [{ presentationId: 'pres-1', packages: 3, packagingName: 'Garrafa' }],
        }),
      ],
      refs: [receta()],
      presentations: [{ id: 'pres-1', name: 'Garrafa 5 L' }] as never,
      rows: [{ orderId: PEDIDO_1, userId: BETO, workGroupId: null, workGroupName: null }],
      people: [persona(BETO, 'Beto Ruiz')],
    });

    const [fila] = (await createListConditionedOrders(deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila).toEqual({
      id: PEDIDO_1,
      numberText: '2026-0000007',
      recipeName: 'Jabon liquido',
      quantity: '10.0000',
      presentationLines: [
        { presentationId: 'pres-1', presentationName: 'Garrafa 5 L', packages: 3, packagingName: 'Garrafa' },
      ],
      unitId: null,
      unitLabel: null,
      finishedAt: terminado,
      responsibles: [{ userId: BETO, displayName: 'Beto Ruiz', origin: { kind: 'direct' } }],
    });
  });
});

describe('R13 — no exige `terminados.consultar` ni `pedidos.consultar`, y el Terminados del Empacador no cambia', () => {
  it('R13: con solo `acondicionamiento.modificar` lista, sin `terminados.consultar` ni `pedidos.consultar`', async () => {
    const soloElPermiso = { ...ACONDICIONADOR, permissions: ['acondicionamiento.modificar'] };
    const { deps, listAliveSummariesInCompany } = montar();

    await expect(createListConditionedOrders(deps)(soloElPermiso, { page: 1 })).resolves.toMatchObject({ total: 0 });
    expect(listAliveSummariesInCompany).toHaveBeenCalledTimes(1);
  });

  it('R13: `terminados.consultar` o `pedidos.consultar` no sustituyen al permiso del acondicionador', async () => {
    for (const permiso of ['terminados.consultar', 'pedidos.consultar']) {
      const { deps, todos } = montar();
      await expect(
        createListConditionedOrders(deps)({ ...ACONDICIONADOR, permissions: [permiso] }, { page: 1 }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    }
  });

  it('R13: listFinishedOrders sigue exigiendo `terminados.consultar` y rechaza al acondicionador', async () => {
    const { deps, todos } = montar();

    await expect(
      createListFinishedOrders(deps as unknown as ListFinishedOrdersDeps)(ACONDICIONADOR, { page: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });

  it('R13: listFinishedOrders sigue filtrando por `packedBy` a quien no ejecuta, nunca por `conditionedBy`', async () => {
    const empacador = { id: ANA, companyId: EMPRESA, permissions: ['terminados.consultar'] };
    const { deps, listAliveSummariesInCompany } = montar();

    await createListFinishedOrders(deps as unknown as ListFinishedOrdersDeps)(empacador, { page: 1 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledWith(
      EMPRESA,
      ['TERMINADO'],
      'finished_recent_first',
      1,
      undefined,
      { packedBy: ANA },
    );
  });
});
