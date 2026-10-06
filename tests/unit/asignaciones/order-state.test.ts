// tests/unit/asignaciones/order-state.test.ts
//
// QC-87 T7 — La tabla de estados de `design.md > 4`, CELDA A CELDA, para `assignResponsibles`
// (R8, R9, R10, R11, R12).
//
// **Este archivo es el test del riesgo 4 de `design.md > 10`**: «que la comprobacion de estado
// acabe en el `WHERE` de la escritura». Si eso pasara, «el pedido no existe» y «el pedido esta
// entregado» devolverian LO MISMO —cero filas afectadas— y la pantalla diria `order_not_found` de
// un pedido que el usuario esta viendo. Por eso aqui no basta con comprobar que las dos rechazan:
// se comprueba que rechazan con `code` DISTINTO, que la LECTURA del pedido ocurrio, y que el puerto
// de escritura **no se llamo** en ningun caso rechazado.
//
// La consulta (R13) NO pasa por esta tabla y no se prueba aqui: es T9.
//
// Cubre R8, R9, R10, R11, R12, R33.

import { describe, expect, it, vi } from 'vitest';

import {
  createAssignResponsibles,
  type AssignResponsiblesDeps,
} from '@/lib/modules/asignaciones/domain/assign-responsibles';
import { AsignacionesError } from '@/lib/modules/asignaciones/domain/errors';
import { assertOrderAcceptsWrites } from '@/lib/modules/asignaciones/domain/order-state';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';
import type { OrderAssignmentTarget, OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

/** Un uuid valido y legible a partir de un solo digito hexadecimal. */
function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const PEDIDO = uuid('a');
const PERSONA = uuid('1');
const AHORA = new Date('2026-09-13T10:00:00.000Z');

const ACTOR: Actor = { id: uuid('9'), companyId: EMPRESA, permissions: ['asignaciones.modificar'] };

/**
 * Los dobles de los CUATRO puertos. `order` es lo que devuelve `findAliveById`: `null` es «no
 * existe o esta dado de baja» (R8) y un objeto con su estado es cada una de las otras cuatro filas
 * de la tabla.
 */
function montar(order: OrderAssignmentTarget | null): {
  readonly deps: AssignResponsiblesDeps;
  readonly orders: { findAliveById: ReturnType<typeof vi.fn> };
  readonly assignments: Record<keyof OrderAssignmentRepository, ReturnType<typeof vi.fn>>;
} {
  const orders = { findAliveById: vi.fn(async () => order) };
  const assignments = {
    insertMissing: vi.fn(async (rows: readonly unknown[]) => rows.length),
    listByOrderInCompany: vi.fn(async () => []),
    // QC-102 T1: el puerto gano un quinto metodo (la consulta EN LOTE). El doble lo declara
    // para seguir satisfaciendo la interfaz; ningun caso de uso de QC-87 lo invoca.
    listByOrdersInCompany: vi.fn(async () => []),
    deleteOne: vi.fn(async () => 'ok' as const),
    deleteByWorkGroup: vi.fn(async () => 0),
    listOrderIdsByUserInCompany: vi.fn(async () => []),
  };
  const people = {
    findAliveRefsInCompany: vi.fn(async (_c: string, ids: readonly string[]) =>
      ids.map((id) => ({ id, displayName: `Persona ${id}`, isActive: true })),
    ),
    findRefsIncludingDeletedInCompany: vi.fn(async () => []),
  };
  const groups = { findSnapshotAliveInCompany: vi.fn(async () => null) };

  return {
    deps: {
      assignments: assignments as unknown as OrderAssignmentRepository,
      orders: orders as unknown as OrderCatalog,
      people: people as unknown as PeopleDirectory,
      groups: groups as unknown as WorkGroupDirectory,
    },
    orders,
    assignments,
  };
}

const ENTRADA = { orderId: PEDIDO, userIds: [PERSONA], workGroupIds: [] };

/** El `code` del error que lanzo, o `'sin error'` si no lanzo ninguno. */
async function codigoDe(order: OrderAssignmentTarget | null): Promise<string> {
  const { deps } = montar(order);
  try {
    await createAssignResponsibles(deps)(ACTOR, ENTRADA, AHORA);
    return 'sin error';
  } catch (error) {
    expect(error).toBeInstanceOf(AsignacionesError);
    return (error as AsignacionesError).code;
  }
}

describe('QC-87 — la tabla de estados del pedido, celda a celda (design.md > 4)', () => {
  /**
   * La tabla ENTERA para `assignResponsibles`. Se escribe como datos y no como cinco `it` sueltos
   * para que anadir un estado nuevo sea anadir una fila, y para que la tabla del test se lea igual
   * que la del `design.md`.
   */
  const TABLA: readonly (readonly [OrderStatus | 'no existe', string])[] = [
    ['PENDIENTE', 'sin error'],
    ['EN_CURSO', 'sin error'],
    ['BLOQUEADO', 'sin error'],
    ['POR_EMPACAR', 'order_produced_frozen'],
    ['EN_EMPAQUE', 'order_produced_frozen'],
    ['ENTREGADO', 'order_delivered_frozen'],
    ['CANCELADO', 'order_cancelled_not_assignable'],
    ['no existe', 'order_not_found'],
  ];

  for (const [estado, esperado] of TABLA) {
    it(`pedido ${estado} -> ${esperado} (R8, R9, R10, R11, R33)`, async () => {
      const order =
        estado === 'no existe' ? null : ({ id: PEDIDO, status: estado } as OrderAssignmentTarget);
      expect(await codigoDe(order)).toBe(esperado);
    });
  }

  it('los TRES estados que admiten escritura SI llegan al puerto de escritura (R9, R33)', async () => {
    for (const status of ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO'] as const) {
      const { deps, assignments } = montar({ id: PEDIDO, status });
      await expect(createAssignResponsibles(deps)(ACTOR, ENTRADA, AHORA)).resolves.toEqual({
        added: 1,
      });
      expect(assignments.insertMissing, status).toHaveBeenCalledTimes(1);
    }
  });

  it('R33: un BLOQUEADO admite la escritura de responsables, sin que eso lo vuelva arrancable', async () => {
    // Se le puede poner responsable a un pedido que todavia no tiene material: quien lo asigne no
    // lo va a poder iniciar hasta que entren lotes, y eso lo rechazan otros casos de uso, con otro
    // error. Aqui lo que se afirma es que la escritura de responsables SI pasa y llega al puerto.
    const { deps, assignments } = montar({ id: PEDIDO, status: 'BLOQUEADO' });

    await expect(createAssignResponsibles(deps)(ACTOR, ENTRADA, AHORA)).resolves.toEqual({
      added: 1,
    });
    expect(assignments.insertMissing).toHaveBeenCalledTimes(1);
    expect(assignments.deleteOne).not.toHaveBeenCalled();
  });

  it('los estados que NO admiten escritura no tocan el puerto de escritura (R10, R11, R8, R33)', async () => {
    const casos: readonly (OrderAssignmentTarget | null)[] = [
      { id: PEDIDO, status: 'POR_EMPACAR' },
      { id: PEDIDO, status: 'EN_EMPAQUE' },
      { id: PEDIDO, status: 'ENTREGADO' },
      { id: PEDIDO, status: 'CANCELADO' },
      null,
    ];

    for (const order of casos) {
      const { deps, assignments } = montar(order);
      await expect(createAssignResponsibles(deps)(ACTOR, ENTRADA, AHORA)).rejects.toBeInstanceOf(
        AsignacionesError,
      );
      // «NO DEBE crear, modificar ni eliminar ninguna asignacion suya»: ni una sola llamada, a
      // ningun metodo del repositorio.
      expect(assignments.insertMissing).not.toHaveBeenCalled();
      expect(assignments.deleteOne).not.toHaveBeenCalled();
      expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
    }
  });

  /**
   * **R12 — el test del riesgo 4.** Un pedido que NO existe y un pedido ENTREGADO que SI existe
   * tienen que dar errores DISTINTOS. La forma de romperlo es meter el estado en el `WHERE` de la
   * escritura: entonces los dos casos afectarian cero filas y los dos acabarian en el mismo error.
   */
  it('R12: inexistente y ENTREGADO-que-existe dan codigos DISTINTOS', async () => {
    const inexistente = await codigoDe(null);
    const entregado = await codigoDe({ id: PEDIDO, status: 'ENTREGADO' });

    expect(inexistente).toBe('order_not_found');
    expect(entregado).toBe('order_delivered_frozen');
    expect(entregado).not.toBe(inexistente);
  });

  it('R12: la decision se toma sobre la LECTURA del pedido, que ocurre de verdad', async () => {
    const { deps, orders, assignments } = montar({ id: PEDIDO, status: 'ENTREGADO' });

    await expect(createAssignResponsibles(deps)(ACTOR, ENTRADA, AHORA)).rejects.toMatchObject({
      code: 'order_delivered_frozen',
    });

    // Hubo LECTURA del pedido, por su identificador y sin ninguna condicion de estado...
    expect(orders.findAliveById).toHaveBeenCalledTimes(1);
    // QC-60 (R27): la empresa del ACTOR entra por la firma del catalogo.
    expect(orders.findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
    // ...y NO hubo escritura: el estado no pudo viajar en el `WHERE` de ninguna, porque no hubo
    // ninguna.
    expect(assignments.insertMissing).not.toHaveBeenCalled();
  });

  describe('`assertOrderAcceptsWrites` por si misma', () => {
    it('R8: `null` —no existe o esta de baja— es `order_not_found`', () => {
      expect(() => assertOrderAcceptsWrites(null)).toThrow(AsignacionesError);
      try {
        assertOrderAcceptsWrites(null);
        expect.unreachable('tenia que haber lanzado');
      } catch (error) {
        expect((error as AsignacionesError).code).toBe('order_not_found');
      }
    });

    it('R9: los dos estados abiertos pasan sin lanzar', () => {
      expect(() => assertOrderAcceptsWrites({ id: PEDIDO, status: 'PENDIENTE' })).not.toThrow();
      expect(() => assertOrderAcceptsWrites({ id: PEDIDO, status: 'EN_CURSO' })).not.toThrow();
    });

    /**
     * El mapa de `order-state.ts` es TOTAL sobre `OrderStatus` (`satisfies Record<...>`), asi que
     * un estado nuevo en QC-34 rompe el TYPECHECK en vez de colarse como «admitida». Aqui se
     * comprueba lo unico que un test en tiempo de ejecucion puede comprobar: que los SIETE
     * estados que hoy existen estan clasificados, ninguno de ellos por defecto.
     */
    it('R35: los siete estados de hoy estan clasificados, ninguno por descuido (R33)', () => {
      const clasificado = (status: OrderStatus): 'admite' | string => {
        try {
          assertOrderAcceptsWrites({ id: PEDIDO, status });
          return 'admite';
        } catch (error) {
          return (error as AsignacionesError).code;
        }
      };

      expect({
        PENDIENTE: clasificado('PENDIENTE'),
        EN_CURSO: clasificado('EN_CURSO'),
        BLOQUEADO: clasificado('BLOQUEADO'),
        POR_EMPACAR: clasificado('POR_EMPACAR'),
        EN_EMPAQUE: clasificado('EN_EMPAQUE'),
        ENTREGADO: clasificado('ENTREGADO'),
        CANCELADO: clasificado('CANCELADO'),
      }).toEqual({
        PENDIENTE: 'admite',
        EN_CURSO: 'admite',
        BLOQUEADO: 'admite',
        POR_EMPACAR: 'order_produced_frozen',
        EN_EMPAQUE: 'order_produced_frozen',
        ENTREGADO: 'order_delivered_frozen',
        CANCELADO: 'order_cancelled_not_assignable',
      });
    });
  });
});
