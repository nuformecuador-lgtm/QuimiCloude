// QC-87 T8 — `removeWorkGroupFromOrder` (R32, R33, R34 y, en su parte, R1, R2, R8-R12).
//
// La PREGUNTA ABIERTA 3 del spec quedo CERRADA a favor de esta mitad (decision del humano,
// 2026-09-13): «quitar un grupo del pedido» es de QC-87 y no de QC-102, asi que R32-R34 se prueban
// aqui tal como estan escritos.
//
// El doble del puerto lleva ALMACEN EN MEMORIA con la semantica del adaptador de T5: borra las
// filas de ESA empresa, ESE pedido y ESE `work_group_id` congelado. Sin almacen, «ninguna otra»
// (R32) no seria comprobable; sin espias, «no se pregunta por el grupo» tampoco.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRemoveWorkGroupFromOrder,
  type RemoveWorkGroupFromOrderDeps,
} from '@/lib/modules/asignaciones/domain/remove-work-group-from-order';
import { ValidationError, type AsignacionesError } from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { OrderAssignmentTarget, OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PEDIDO = '11111111-1111-4111-8111-111111111111';
const OTRO_PEDIDO = '12121212-1212-4212-8212-121212121212';

/** El grupo que se quita. En el fixture esta **DADO DE BAJA Y RENOMBRADO DESPUES** de aplicarse:
 *  las filas conservan el nombre que tenia ENTONCES (QC-86, R28). */
const GRUPO_DE_BAJA = '55555555-5555-4555-8555-555555555555';
const OTRO_GRUPO = '66666666-6666-4666-8666-666666666666';
const GRUPO_SIN_FILAS = '77777777-7777-4777-8777-777777777777';

const ANA = '21111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const CARLOS = '23333333-3333-4333-8333-333333333333';
const DIEGO = '24444444-4444-4444-8444-444444444444';
const ELENA = '25555555-5555-4555-8555-555555555555';

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.modificar'] };

type Fila = {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

/**
 * Cinco maneras distintas de que «ninguna otra» (R32) falle: dos filas del grupo que se quita, una
 * SUELTA en el mismo pedido, una de OTRO grupo en el mismo pedido, una del MISMO grupo en OTRO
 * pedido y una del MISMO grupo en OTRA empresa.
 *
 * `Turno de manana` es el nombre CONGELADO: el grupo se llama hoy de otra forma y esta dado de
 * baja. Nada de eso aparece en el fixture del directorio de grupos porque este caso de uso **no
 * tiene directorio de grupos entre sus dependencias**, que es exactamente R32.
 */
function estadoInicial(): Fila[] {
  return [
    {
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: ANA,
      workGroupId: GRUPO_DE_BAJA,
      workGroupName: 'Turno de manana',
    },
    {
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: BEA,
      workGroupId: GRUPO_DE_BAJA,
      workGroupName: 'Turno de manana',
    },
    { companyId: EMPRESA, orderId: PEDIDO, userId: CARLOS, workGroupId: null, workGroupName: null },
    {
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: DIEGO,
      workGroupId: OTRO_GRUPO,
      workGroupName: 'Laboratorio',
    },
    {
      companyId: EMPRESA,
      orderId: OTRO_PEDIDO,
      userId: ELENA,
      workGroupId: GRUPO_DE_BAJA,
      workGroupName: 'Turno de manana',
    },
    {
      companyId: OTRA_EMPRESA,
      orderId: PEDIDO,
      userId: ELENA,
      workGroupId: GRUPO_DE_BAJA,
      workGroupName: 'Turno de manana',
    },
  ];
}

let filas: Fila[];
let assignments: ReturnType<typeof crearRepositorio>;
let orders: { findAliveById: ReturnType<typeof vi.fn> };

function crearRepositorio() {
  return {
    insertMissing: vi.fn(async () => 0),
    listByOrderInCompany: vi.fn(async () => []),
    deleteOne: vi.fn(async () => 'not_found' as const),
    deleteByWorkGroup: vi.fn(async (companyId: string, orderId: string, workGroupId: string) => {
      const quedan = filas.filter(
        (f) =>
          !(f.companyId === companyId && f.orderId === orderId && f.workGroupId === workGroupId),
      );
      const borradas = filas.length - quedan.length;
      filas = quedan;
      return borradas;
    }),
  };
}

function pedido(status: OrderStatus): OrderAssignmentTarget {
  return { id: PEDIDO, status };
}

function crearCasoDeUso(estado: OrderStatus | null = 'EN_CURSO') {
  orders = { findAliveById: vi.fn(async () => (estado === null ? null : pedido(estado))) };
  assignments = crearRepositorio();
  return createRemoveWorkGroupFromOrder({
    orders: orders as unknown as OrderCatalog,
    assignments: assignments as unknown as OrderAssignmentRepository,
  });
}

function ningunPuertoTocado(): void {
  expect(orders.findAliveById).not.toHaveBeenCalled();
  expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
  expect(assignments.deleteOne).not.toHaveBeenCalled();
  expect(assignments.insertMissing).not.toHaveBeenCalled();
  expect(assignments.listByOrderInCompany).not.toHaveBeenCalled();
}

beforeEach(() => {
  filas = estadoInicial();
});

describe('QC-87 — removeWorkGroupFromOrder', () => {
  describe('R32 — un grupo DADO DE BAJA Y RENOMBRADO DESPUES se quita igual', () => {
    it('borra sus filas aunque el grupo ya no exista: se borra por el id CONGELADO en la fila', async () => {
      const quitar = crearCasoDeUso();

      const resultado = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA });

      expect(resultado).toEqual({ removed: 2 });
      expect(assignments.deleteByWorkGroup).toHaveBeenCalledTimes(1);
      expect(assignments.deleteByWorkGroup).toHaveBeenCalledWith(EMPRESA, PEDIDO, GRUPO_DE_BAJA);
    });

    it('no le pregunta a nadie si el grupo sigue vivo: sus dependencias son DOS y ninguna es un directorio', async () => {
      const quitar = crearCasoDeUso();

      await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA });

      // Lo unico que se lee es el PEDIDO (R8-R12). Si alguien anadiera una comprobacion de
      // «el grupo existe», tendria que meter un `WorkGroupDirectory` en las deps y este caso de
      // uso dejaria de compilar con las dos que tiene.
      expect(orders.findAliveById).toHaveBeenCalledTimes(1);
      // QC-60 (R27): la empresa del ACTOR entra por la firma del catalogo.
      expect(orders.findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
    });

    it('deja la suelta, la de otro grupo, la de otro pedido y la de otra empresa', async () => {
      const quitar = crearCasoDeUso();

      await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA });

      expect(filas).toEqual([
        {
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: CARLOS,
          workGroupId: null,
          workGroupName: null,
        },
        {
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: DIEGO,
          workGroupId: OTRO_GRUPO,
          workGroupName: 'Laboratorio',
        },
        {
          companyId: EMPRESA,
          orderId: OTRO_PEDIDO,
          userId: ELENA,
          workGroupId: GRUPO_DE_BAJA,
          workGroupName: 'Turno de manana',
        },
        {
          companyId: OTRA_EMPRESA,
          orderId: PEDIDO,
          userId: ELENA,
          workGroupId: GRUPO_DE_BAJA,
          workGroupName: 'Turno de manana',
        },
      ]);
      // Explicito, porque es el mutante que este test existe para matar: si el borrado alcanzara
      // tambien a las sueltas, CARLOS no estaria.
      expect(filas.some((f) => f.userId === CARLOS && f.workGroupId === null)).toBe(true);
      expect(filas.some((f) => f.userId === DIEGO && f.workGroupId === OTRO_GRUPO)).toBe(true);
    });

    it('quitar OTRO grupo no toca las del primero', async () => {
      const quitar = crearCasoDeUso();

      const resultado = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: OTRO_GRUPO });

      expect(resultado).toEqual({ removed: 1 });
      // Las CUATRO del otro grupo siguen ahi: las dos de este pedido, la de otro pedido y la de
      // otra empresa.
      expect(filas.filter((f) => f.workGroupId === GRUPO_DE_BAJA)).toHaveLength(4);
    });

    it('CASO NEGATIVO DE TIPO: ni borrado masivo por pedido ni `update` en el puerto', () => {
      const repositorio = crearRepositorio() as unknown as OrderAssignmentRepository;

      // @ts-expect-error — R32: el unico borrado por grupo es `deleteByWorkGroup`. Un
      // `deleteByOrder` habilitaria el «borrar y reinsertar» que `design.md > 10` marca como riesgo
      // n.o 1; si alguien lo anadiera, esta linea dejaria de dar error y el test caeria.
      expect(repositorio.deleteByOrder).toBeUndefined();
      // @ts-expect-error — QC-86 R8/R9: la asignacion se crea o se borra, nunca se EDITA. Sin
      // `update` no hay forma de reescribir el nombre congelado de una fila que sobreviva.
      expect(repositorio.update).toBeUndefined();
    });

    it('CASO NEGATIVO DE TIPO: no hay hueco para un directorio de grupos en las deps (R32)', () => {
      const quitarDeps: RemoveWorkGroupFromOrderDeps = {
        orders: { findAliveById: vi.fn(async () => pedido('EN_CURSO')) } as unknown as OrderCatalog,
        assignments: crearRepositorio() as unknown as OrderAssignmentRepository,
        // @ts-expect-error — preguntar si el grupo sigue vivo es exactamente lo que R32 prohibe:
        // dejaria filas de un grupo dado de baja imposibles de quitar por pantalla.
        groups: { findSnapshotAliveInCompany: vi.fn() },
      };

      expect(createRemoveWorkGroupFromOrder(quitarDeps)).toBeInstanceOf(Function);
    });
  });

  describe('R33 — sin filas de ese grupo, exito con cero', () => {
    it('devuelve `{ removed: 0 }` y NO lanza', async () => {
      const quitar = crearCasoDeUso();

      await expect(
        quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_SIN_FILAS }),
      ).resolves.toEqual({ removed: 0 });
      expect(filas).toEqual(estadoInicial());
    });

    it('tampoco lanza al quitar dos veces seguidas el mismo grupo', async () => {
      const quitar = crearCasoDeUso();

      const primera = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA });
      const segunda = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA });

      expect(primera).toEqual({ removed: 2 });
      expect(segunda).toEqual({ removed: 0 });
    });
  });

  describe('R34 — devuelve CUANTAS elimino', () => {
    it('el numero es el del puerto, no un conteo a mano', async () => {
      const quitar = crearCasoDeUso();
      assignments.deleteByWorkGroup.mockResolvedValueOnce(7);

      await expect(quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA })).resolves.toEqual(
        { removed: 7 },
      );
    });
  });

  describe('R42 — la entrada del borde', () => {
    it('sin pedido, sin grupo, con lista de grupos o con campos de sobra: `invalid_input` sin tocar el puerto', async () => {
      const entradas: readonly unknown[] = [
        { workGroupId: GRUPO_DE_BAJA },
        { orderId: PEDIDO },
        { orderId: PEDIDO, workGroupIds: [GRUPO_DE_BAJA, OTRO_GRUPO] },
        { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA, userId: ANA },
        { orderId: 'no-es-un-uuid', workGroupId: GRUPO_DE_BAJA },
        null,
      ];

      for (const entrada of entradas) {
        const quitar = crearCasoDeUso();
        const error = await quitar(ACTOR, entrada).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as AsignacionesError).code).toBe('invalid_input');
        expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
        expect(filas).toEqual(estadoInicial());
      }
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
          permissions: ['pedidos.consultar', 'pedidos.modificar', 'asignaciones.consultar'],
        },
      ],
    ];

    for (const [nombre, actor] of denegados) {
      it(`${nombre}: rechaza con 'unauthorized' sin leer ni escribir nada`, async () => {
        const quitar = crearCasoDeUso();

        const error = await quitar(actor, {
          orderId: PEDIDO,
          workGroupId: GRUPO_DE_BAJA,
        }).catch((e: unknown) => e);

        expect((error as AsignacionesError).code).toBe('unauthorized');
        ningunPuertoTocado();
        expect(filas).toEqual(estadoInicial());
      });
    }
  });

  describe('R8, R10, R11, R12 — la MISMA tabla de estados que desasignar', () => {
    it('PENDIENTE y EN_CURSO admiten quitar el grupo (R9)', async () => {
      for (const estado of ['PENDIENTE', 'EN_CURSO'] as const) {
        filas = estadoInicial();
        const quitar = crearCasoDeUso(estado);
        await expect(
          quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA }),
        ).resolves.toEqual({ removed: 2 });
      }
    });

    it('ENTREGADO congela: tampoco SALE nadie', async () => {
      const quitar = crearCasoDeUso('ENTREGADO');

      const error = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA }).catch(
        (e: unknown) => e,
      );

      expect((error as AsignacionesError).code).toBe('order_delivered_frozen');
      expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
      expect(filas).toEqual(estadoInicial());
    });

    it('CANCELADO da un codigo DISTINTO del de ENTREGADO', async () => {
      const quitar = crearCasoDeUso('CANCELADO');

      const error = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA }).catch(
        (e: unknown) => e,
      );

      expect((error as AsignacionesError).code).toBe('order_cancelled_not_assignable');
      expect((error as AsignacionesError).code).not.toBe('order_delivered_frozen');
      expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
    });

    it('POR_EMPACAR y EN_EMPAQUE congelan: `order_produced_frozen` sin quitar a nadie (R33)', async () => {
      for (const estado of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
        filas = estadoInicial();
        const quitar = crearCasoDeUso(estado);

        const error = await quitar(ACTOR, { orderId: PEDIDO, workGroupId: GRUPO_DE_BAJA }).catch(
          (e: unknown) => e,
        );

        expect((error as AsignacionesError).code).toBe('order_produced_frozen');
        expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
        expect(filas).toEqual(estadoInicial());
      }
    });

    it('R12: «no existe» NO es «entregado»', async () => {
      const inexistente = crearCasoDeUso(null);
      const noExiste = await inexistente(ACTOR, {
        orderId: PEDIDO,
        workGroupId: GRUPO_DE_BAJA,
      }).catch((e: unknown) => e);

      const entregado = crearCasoDeUso('ENTREGADO');
      const congelado = await entregado(ACTOR, {
        orderId: PEDIDO,
        workGroupId: GRUPO_DE_BAJA,
      }).catch((e: unknown) => e);

      expect((noExiste as AsignacionesError).code).toBe('order_not_found');
      expect((congelado as AsignacionesError).code).toBe('order_delivered_frozen');
      expect((noExiste as AsignacionesError).code).not.toBe((congelado as AsignacionesError).code);
      expect(assignments.deleteByWorkGroup).not.toHaveBeenCalled();
    });
  });
});
