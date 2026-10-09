// «Por acondicionar»: los POR_ACONDICIONAR y EN_ACONDICIONAMIENTO de la empresa, sin filtro por
// asignacion ni por quien acondiciona, con el reparto completo y el nombre de quien acondiciona.
import { describe, expect, it } from 'vitest';

import { createListConditioningOrders } from '@/lib/modules/asignaciones/domain/list-conditioning-orders';
import { AsignacionesError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import {
  ACONDICIONADOR,
  ANA,
  BETO,
  EMPRESA,
  PEDIDO_1,
  PEDIDO_2,
  UNIDAD,
  actoresSinElPermiso,
  montar,
  persona,
  receta,
  resumen,
} from './conditioning-doubles';

describe('R19 — listConditioningOrders exige el permiso antes de validar y sin tocar ningun puerto', () => {
  it.each(actoresSinElPermiso(SEED_ROLE_PERMISSIONS, [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]))(
    'R19: rechaza con `unauthorized` a %s, aun con una entrada invalida',
    async (_nombre, actor) => {
      const { deps, todos } = montar();

      const resultado = createListConditioningOrders(deps)(actor, { page: 0 });

      await expect(resultado).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(resultado).rejects.toBeInstanceOf(AsignacionesError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    },
  );
});

describe('R20 — la entrada es exactamente `{ page, pageSize? }` con enteros positivos', () => {
  it.each([
    ['page 0', { page: 0 }],
    ['page negativa', { page: -1 }],
    ['page decimal', { page: 1.5 }],
    ['pageSize 0', { page: 1, pageSize: 0 }],
    ['page como texto', { page: '1' }],
    ['una clave de mas', { page: 1, extra: true }],
    ['no es un objeto', 'pagina 1'],
    ['null', null],
  ])('R20: %s se rechaza con `invalid_input` sin tocar ningun puerto', async (_nombre, entrada) => {
    const { deps, todos } = montar();

    const resultado = createListConditioningOrders(deps)(ACONDICIONADOR, entrada);

    await expect(resultado).rejects.toBeInstanceOf(ValidationError);
    await expect(resultado).rejects.toMatchObject({ code: 'invalid_input' });
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });

  it('R20: `{ page }` sin `pageSize` y `{}` (page por defecto 1) son validas', async () => {
    const { deps, listAliveSummariesInCompany } = montar();
    const listar = createListConditioningOrders(deps);

    await listar(ACONDICIONADOR, { page: 2 });
    await listar(ACONDICIONADOR, {});

    expect(listAliveSummariesInCompany.mock.calls[0]?.[3]).toBe(2);
    expect(listAliveSummariesInCompany.mock.calls[1]?.[3]).toBe(1);
  });
});

describe('R6 — la consulta: toda la empresa, los dos estados, el orden de trabajo, sin filtro por persona', () => {
  it('R6: consulta la empresa del actor con POR_ACONDICIONAR y EN_ACONDICIONAMIENTO, `work_queue` y sin filtro', async () => {
    const { deps, listAliveSummariesInCompany } = montar();

    await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 3, pageSize: 25 });

    expect(listAliveSummariesInCompany).toHaveBeenCalledTimes(1);
    const [empresa, estados, orden, page, pageSize, filtro] = listAliveSummariesInCompany.mock.calls[0] ?? [];
    expect(empresa).toBe(EMPRESA);
    expect(estados).toEqual(['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO']);
    expect(orden).toBe('work_queue');
    expect(page).toBe(3);
    expect(pageSize).toBe(25);
    expect(filtro).toBeUndefined();
  });

  it('R6: el total y la paginacion son los de la consulta, no los de la pagina en memoria', async () => {
    const { deps } = montar({ items: [resumen(PEDIDO_1)], total: 31 });

    const pagina = await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 2, pageSize: 10 });

    expect(pagina.total).toBe(31);
    expect(pagina.page).toBe(2);
    expect(pagina.pageSize).toBe(10);
    expect(pagina.totalPages).toBe(4);
  });
});

describe('R7 — cada fila trae numero, receta, reparto completo, estado y quien acondiciona', () => {
  it('R7: el reparto sale entero y en el orden de alta, con el nombre del envase y de la presentacion', async () => {
    const lineas = [
      { presentationId: 'pres-500', packages: 12, packagingName: '500 g' },
      { presentationId: 'pres-1k', packages: 4, packagingName: '1 kg' },
      { presentationId: 'pres-2k', packages: 1, packagingName: null },
    ];
    const { deps } = montar({
      items: [resumen(PEDIDO_1, { presentationLines: lineas })],
      refs: [receta()],
      presentations: [
        { id: 'pres-1k', name: 'Bolsa 1 kg' },
        { id: 'pres-500', name: 'Bolsa 500 g' },
      ] as never,
    });

    const [fila] = (await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila?.presentationLines).toEqual([
      { presentationId: 'pres-500', presentationName: 'Bolsa 500 g', packages: 12, packagingName: '500 g' },
      { presentationId: 'pres-1k', presentationName: 'Bolsa 1 kg', packages: 4, packagingName: '1 kg' },
      { presentationId: 'pres-2k', presentationName: null, packages: 1, packagingName: null },
    ]);
  });

  it('R7: numero formateado, receta, cantidad con unidad y estado; sin reparto, la lista vacia', async () => {
    const { deps } = montar({
      items: [resumen(PEDIDO_1)],
      refs: [receta()],
      units: [{ id: UNIDAD, name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null }],
    });

    const [fila] = (await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila).toEqual({
      id: PEDIDO_1,
      numberText: '2026-0000007',
      recipeName: 'Jabon liquido',
      quantity: '10.0000',
      unitId: UNIDAD,
      unitLabel: 'kg',
      presentationLines: [],
      status: 'POR_ACONDICIONAR',
      conditionedByName: null,
      conditionedById: null,
    });
  });

  it('R7: la receta que ya no se encuentra queda en `null`', async () => {
    const { deps } = montar({ items: [resumen(PEDIDO_1)], refs: [] });

    const [fila] = (await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila?.recipeName).toBeNull();
  });

  it('R7: en POR_ACONDICIONAR no hay quien acondiciona; en EN_ACONDICIONAMIENTO sale su nombre', async () => {
    const { deps, findRefsIncludingDeletedInCompany } = montar({
      items: [
        resumen(PEDIDO_1),
        resumen(PEDIDO_2, { status: 'EN_ACONDICIONAMIENTO', conditionedBy: BETO }),
      ],
      people: [persona(BETO, 'Beto Ruiz')],
    });

    const { items } = await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 1 });

    expect(items.map((fila) => [fila.status, fila.conditionedByName, fila.conditionedById])).toEqual([
      ['POR_ACONDICIONAR', null, null],
      ['EN_ACONDICIONAMIENTO', 'Beto Ruiz', BETO],
    ]);
    // El nombre se resuelve incluyendo a las personas dadas de baja, una sola vez por id.
    expect(findRefsIncludingDeletedInCompany).toHaveBeenCalledWith(EMPRESA, [BETO], expect.any(Date));
  });

  it('R7: quien acondiciona dada de baja sigue con su nombre, porque el directorio la incluye', async () => {
    const { deps } = montar({
      items: [resumen(PEDIDO_2, { status: 'EN_ACONDICIONAMIENTO', conditionedBy: ANA })],
      people: [{ id: ANA, displayName: 'Ana Baja', isActive: false, permissions: [] }],
    });

    const [fila] = (await createListConditioningOrders(deps)(ACONDICIONADOR, { page: 1 })).items;

    expect(fila?.conditionedByName).toBe('Ana Baja');
  });
});
