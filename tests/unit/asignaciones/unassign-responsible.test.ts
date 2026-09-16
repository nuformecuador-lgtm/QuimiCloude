// QC-87 T8 — `unassignResponsible` (R29, R30, R31 y, en su parte de este caso de uso, R1, R2,
// R8-R12).
//
// Dobles del puerto con un ALMACEN EN MEMORIA, no solo espias: R29 dice «una fila y NINGUNA otra»,
// y eso solo se demuestra mirando lo que QUEDA. Los espias van ademas, porque «ninguna otra» tiene
// una segunda mitad —que el caso de uso no llame a ningun otro metodo del puerto— que el almacen no
// puede ver.
//
// Se afirma siempre sobre el `code`, nunca sobre el texto (R43).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUnassignResponsible } from '@/lib/modules/asignaciones/domain/unassign-responsible';
import {
  OrderAssignmentNotFoundError,
  ValidationError,
  type AsignacionesError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { OrderAssignmentTarget, OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PEDIDO = '11111111-1111-4111-8111-111111111111';
const OTRO_PEDIDO = '12121212-1212-4212-8212-121212121212';
const GRUPO = '55555555-5555-4555-8555-555555555555';

const ANA = '21111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const CARLOS = '23333333-3333-4333-8333-333333333333';
const DIEGO = '24444444-4444-4444-8444-444444444444';

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.modificar'] };

type Fila = {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

/**
 * El estado de partida, escrito para que «ninguna otra» tenga cuatro maneras distintas de fallar:
 * otra persona del MISMO grupo en el MISMO pedido, una suelta, la MISMA persona en OTRO pedido y
 * una fila de OTRA empresa.
 */
function estadoInicial(): Fila[] {
  return [
    {
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: ANA,
      workGroupId: GRUPO,
      workGroupName: 'Turno de manana',
    },
    {
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: BEA,
      workGroupId: GRUPO,
      workGroupName: 'Turno de manana',
    },
    { companyId: EMPRESA, orderId: PEDIDO, userId: CARLOS, workGroupId: null, workGroupName: null },
    {
      companyId: EMPRESA,
      orderId: OTRO_PEDIDO,
      userId: ANA,
      workGroupId: null,
      workGroupName: null,
    },
    {
      companyId: OTRA_EMPRESA,
      orderId: PEDIDO,
      userId: DIEGO,
      workGroupId: null,
      workGroupName: null,
    },
  ];
}

let filas: Fila[];
let assignments: ReturnType<typeof crearRepositorio>;
let orders: { findAliveById: ReturnType<typeof vi.fn> };

/** El doble del puerto: `deleteOne` borra la fila cuya TRIPLETA empresa+pedido+persona coincide.
 *  Es la semantica del adaptador de T5, y la que el mutante tiene que poder romper. */
function crearRepositorio() {
  return {
    insertMissing: vi.fn(async () => 0),
    listByOrderInCompany: vi.fn(async () => []),
    deleteOne: vi.fn(async (companyId: string, orderId: string, userId: string) => {
      const indice = filas.findIndex(
        (f) => f.companyId === companyId && f.orderId === orderId && f.userId === userId,
      );
      if (indice === -1) return 'not_found' as const;
      filas.splice(indice, 1);
      return 'ok' as const;
    }),
    deleteByWorkGroup: vi.fn(async () => 0),
  };
}

function pedido(status: OrderStatus): OrderAssignmentTarget {
  return { id: PEDIDO, status };
}

function crearCasoDeUso(estado: OrderStatus | null = 'EN_CURSO') {
  orders = { findAliveById: vi.fn(async () => (estado === null ? null : pedido(estado))) };
  assignments = crearRepositorio();
  return createUnassignResponsible({
    orders: orders as unknown as OrderCatalog,
    assignments: assignments as unknown as OrderAssignmentRepository,
  });
}

function ningunPuertoTocado(): void {
  expect(orders.findAliveById).not.toHaveBeenCalled();
  expect(assignments.deleteOne).not.toHaveBeenCalled();
  expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
  expect(assignments.insertMissing).not.toHaveBeenCalled();
  expect(assignments.listByOrderInCompany).not.toHaveBeenCalled();
}

beforeEach(() => {
  filas = estadoInicial();
});

describe('QC-87 — unassignResponsible', () => {
  describe('R29 — borra UNA fila y ninguna otra', () => {
    it('saca a la persona indicada del pedido indicado', async () => {
      const unassign = crearCasoDeUso();

      await expect(unassign(ACTOR, { orderId: PEDIDO, userId: ANA })).resolves.toBeUndefined();

      // Los argumentos EXACTOS: la empresa es la del ACTOR (R5) y no un dato de entrada, y va
      // primera —una llamada que la olvidara no compilaria (puerto, propiedad 1)—.
      expect(assignments.deleteOne).toHaveBeenCalledTimes(1);
      expect(assignments.deleteOne).toHaveBeenCalledWith(EMPRESA, PEDIDO, ANA);
    });

    it('deja intactas las demas del grupo, las sueltas, las de otros pedidos y las de otra empresa', async () => {
      const unassign = crearCasoDeUso();

      await unassign(ACTOR, { orderId: PEDIDO, userId: ANA });

      expect(filas).toEqual([
        {
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: BEA,
          workGroupId: GRUPO,
          workGroupName: 'Turno de manana',
        },
        {
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: CARLOS,
          workGroupId: null,
          workGroupName: null,
        },
        {
          companyId: EMPRESA,
          orderId: OTRO_PEDIDO,
          userId: ANA,
          workGroupId: null,
          workGroupName: null,
        },
        {
          companyId: OTRA_EMPRESA,
          orderId: PEDIDO,
          userId: DIEGO,
          workGroupId: null,
          workGroupName: null,
        },
      ]);
    });

    it('no usa ningun borrado masivo ni escribe nada', async () => {
      const unassign = crearCasoDeUso();

      await unassign(ACTOR, { orderId: PEDIDO, userId: ANA });

      expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
      expect(assignments.insertMissing).not.toHaveBeenCalled();
    });
  });

  describe('R30 — desasignar a quien no es responsable', () => {
    it("traduce el 'not_found' del puerto a `order_assignment_not_found`", async () => {
      const unassign = crearCasoDeUso();

      // CARLOS es responsable de PEDIDO; DIEGO no lo es (su fila es de otra empresa).
      const error = await unassign(ACTOR, { orderId: PEDIDO, userId: DIEGO }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(OrderAssignmentNotFoundError);
      expect((error as AsignacionesError).code).toBe('order_assignment_not_found');
    });

    it('no deja ningun efecto', async () => {
      const unassign = crearCasoDeUso();

      await unassign(ACTOR, { orderId: PEDIDO, userId: DIEGO }).catch(() => undefined);

      expect(filas).toEqual(estadoInicial());
    });
  });

  describe('R31 — la entrada no puede expresar varias filas', () => {
    it('una lista de personas es entrada invalida y no toca el puerto de borrado', async () => {
      const unassign = crearCasoDeUso();

      const error = await unassign(ACTOR, { orderId: PEDIDO, userIds: [ANA, BEA] }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as AsignacionesError).code).toBe('invalid_input');
      expect(assignments.deleteOne).not.toHaveBeenCalled();
      expect(filas).toEqual(estadoInicial());
    });

    it('`userId` de sobra o sin pedido tampoco pasan', async () => {
      const unassign = crearCasoDeUso();

      await expect(unassign(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(ValidationError);
      await expect(unassign(ACTOR, { userId: ANA })).rejects.toBeInstanceOf(ValidationError);
      await expect(
        unassign(ACTOR, { orderId: PEDIDO, userId: ANA, workGroupId: GRUPO }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(assignments.deleteOne).not.toHaveBeenCalled();
    });

    it('CASO NEGATIVO DE TIPO: el puerto no ofrece ningun borrado masivo por pedido', () => {
      const repositorio = crearRepositorio() as unknown as OrderAssignmentRepository;

      // @ts-expect-error — R31: no existe `deleteByOrder`. Si alguien lo anadiera al puerto para
      // «limpiar los responsables de un pedido», esta linea dejaria de dar error y el test caeria.
      expect(repositorio.deleteByOrder).toBeUndefined();
    });

    it('un identificador que no es uuid tampoco pasa (R42)', async () => {
      const unassign = crearCasoDeUso();

      await expect(
        unassign(ACTOR, { orderId: 'no-es-un-uuid', userId: ANA }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(unassign(ACTOR, { orderId: PEDIDO, userId: 'ana' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(unassign(ACTOR, null)).rejects.toBeInstanceOf(ValidationError);

      expect(assignments.deleteOne).not.toHaveBeenCalled();
      expect(orders.findAliveById).not.toHaveBeenCalled();
      expect(filas).toEqual(estadoInicial());
    });
  });

  describe('R29 — no modifica el pedido, la persona ni el grupo', () => {
    it('con el pedido solo se LEE: el contrato de `pedidos` no ofrece ninguna escritura', async () => {
      const unassign = crearCasoDeUso();

      await unassign(ACTOR, { orderId: PEDIDO, userId: ANA });

      // La unica interaccion con el pedido es su lectura por identificador.
      expect(orders.findAliveById).toHaveBeenCalledTimes(1);

      const catalogo = orders as unknown as OrderCatalog;
      // @ts-expect-error — `OrderCatalog` (design.md > 2.1) solo tiene `findAliveById`: este caso de
      // uso NO PUEDE tocar el pedido ni por descuido. Si alguien le anadiera un metodo de escritura,
      // esta linea dejaria de dar error y el test caeria.
      expect(catalogo.update).toBeUndefined();
    });

    it('no hay ninguna dependencia hacia la persona ni hacia el grupo', () => {
      crearCasoDeUso();

      // R29 en su parte de «ni la persona ni el grupo»: las deps son DOS. Un `PeopleDirectory` o un
      // `WorkGroupDirectory` de mas no compila, asi que desasignar no puede tocarlos.
      expect(
        createUnassignResponsible({
          orders: orders as unknown as OrderCatalog,
          assignments: assignments as unknown as OrderAssignmentRepository,
          // @ts-expect-error — no hay hueco para un directorio de personas en estas deps.
          people: { findAliveRefsInCompany: vi.fn() },
        }),
      ).toBeInstanceOf(Function);
    });
  });

  describe('R1, R2 — sin permiso no se toca ningun puerto', () => {
    const denegados: readonly (readonly [string, Actor | null | undefined])[] = [
      ['actor nulo', null],
      ['actor ausente', undefined],
      ['sin conjunto de permisos', { id: ANA, companyId: EMPRESA } as unknown as Actor],
      ['con el conjunto vacio', { id: ANA, companyId: EMPRESA, permissions: [] }],
      [
        'con otros permisos pero no el suyo',
        {
          id: ANA,
          companyId: EMPRESA,
          permissions: ['pedidos.consultar', 'asignaciones.consultar'],
        },
      ],
    ];

    for (const [nombre, actor] of denegados) {
      it(`${nombre}: rechaza con 'unauthorized' sin leer ni escribir nada`, async () => {
        const unassign = crearCasoDeUso();

        const error = await unassign(actor, { orderId: PEDIDO, userId: ANA }).catch(
          (e: unknown) => e,
        );

        expect((error as AsignacionesError).code).toBe('unauthorized');
        ningunPuertoTocado();
        expect(filas).toEqual(estadoInicial());
      });
    }

    it('el permiso se exige ANTES que el esquema: entrada basura sin permiso da `unauthorized`', async () => {
      const unassign = crearCasoDeUso();

      const error = await unassign(null, { basura: true }).catch((e: unknown) => e);

      expect((error as AsignacionesError).code).toBe('unauthorized');
      ningunPuertoTocado();
    });
  });

  describe('R8, R10, R11, R12 — la tabla de estados de `design.md > 4`', () => {
    it('PENDIENTE y EN_CURSO admiten desasignar (R9)', async () => {
      for (const estado of ['PENDIENTE', 'EN_CURSO'] as const) {
        filas = estadoInicial();
        const unassign = crearCasoDeUso(estado);
        await expect(unassign(ACTOR, { orderId: PEDIDO, userId: ANA })).resolves.toBeUndefined();
      }
    });

    it('ENTREGADO congela: `order_delivered_frozen` y ningun borrado', async () => {
      const unassign = crearCasoDeUso('ENTREGADO');

      const error = await unassign(ACTOR, { orderId: PEDIDO, userId: ANA }).catch(
        (e: unknown) => e,
      );

      expect((error as AsignacionesError).code).toBe('order_delivered_frozen');
      expect(assignments.deleteOne).not.toHaveBeenCalled();
      expect(filas).toEqual(estadoInicial());
    });

    it('CANCELADO da un codigo DISTINTO del de ENTREGADO', async () => {
      const unassign = crearCasoDeUso('CANCELADO');

      const error = await unassign(ACTOR, { orderId: PEDIDO, userId: ANA }).catch(
        (e: unknown) => e,
      );

      expect((error as AsignacionesError).code).toBe('order_cancelled_not_assignable');
      expect((error as AsignacionesError).code).not.toBe('order_delivered_frozen');
      expect(assignments.deleteOne).not.toHaveBeenCalled();
    });

    it('R12: «no existe» NO es «entregado» — son codigos distintos sobre la misma operacion', async () => {
      const inexistente = crearCasoDeUso(null);
      const noExiste = await inexistente(ACTOR, { orderId: PEDIDO, userId: ANA }).catch(
        (e: unknown) => e,
      );

      const entregado = crearCasoDeUso('ENTREGADO');
      const congelado = await entregado(ACTOR, { orderId: PEDIDO, userId: ANA }).catch(
        (e: unknown) => e,
      );

      expect((noExiste as AsignacionesError).code).toBe('order_not_found');
      expect((congelado as AsignacionesError).code).toBe('order_delivered_frozen');
      expect((noExiste as AsignacionesError).code).not.toBe((congelado as AsignacionesError).code);
    });

    it('la decision se toma sobre la LECTURA del pedido, no en el `WHERE` del borrado (R12)', async () => {
      const unassign = crearCasoDeUso('ENTREGADO');

      await unassign(ACTOR, { orderId: PEDIDO, userId: ANA }).catch(() => undefined);

      // Se leyo el pedido y NO se llamo al borrado: si el estado viviera en el `where`, el puerto
      // se habria llamado igual y el error habria sido `order_assignment_not_found`.
      // QC-60 (R27): la empresa del ACTOR entra por la firma del catalogo.
      expect(orders.findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
      expect(assignments.deleteOne).not.toHaveBeenCalled();
    });
  });
});
