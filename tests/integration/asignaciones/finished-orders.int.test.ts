// tests/integration/asignaciones/finished-orders.int.test.ts
/**
 * «Terminados» contra Postgres real.
 *
 * En unidad, `list-finished-orders.test.ts` prueba el dominio con puertos de mentira: «los nulos
 * van al final» es una promesa del doble, no del `ORDER BY` real. Aqui corre
 * `listAliveSummariesInCompany` (`order-catalog-prisma.ts`) contra Postgres, con pedidos
 * `TERMINADO` de verdad y comprueba que el orden y la estabilidad entre paginas son del MOTOR, no
 * del mock. Los `ENTREGADO` antiguos ya no salen. La cadena entera se prueba con los casos de uso
 * reales -Finalizar, Comenzar/Terminar el empaque y Comenzar/Terminar el acondicionamiento-: es la
 * unica forma de demostrar que lo que termina en planta aparece despues con su fecha.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import { createFinishAssignedOrder } from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { createFinishConditioning } from '@/lib/modules/asignaciones/domain/finish-conditioning';
import { createFinishPacking } from '@/lib/modules/asignaciones/domain/finish-packing';
import { createListFinishedOrders } from '@/lib/modules/asignaciones/domain/list-finished-orders';
import { createStartConditioning } from '@/lib/modules/asignaciones/domain/start-conditioning';
import { createStartPacking } from '@/lib/modules/asignaciones/domain/start-packing';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { ROLE_ACONDICIONAMIENTO, ROLE_EMPACADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import {
  findAliveOrderTargetById,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import {
  createOrderWriteRepository,
  finishConditioningAliveOrder,
  startConditioningAliveOrder,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { assertTransition } from '@/lib/modules/pedidos/domain/order-transitions';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';

import { NOW, actorOf, createOrder, createPerson, crearLinea, inRolledBackTransaction } from './use-case-fixture';
import { realOrderSummaries } from '../../helpers/order-summaries';
import { executionOnClient } from '../../helpers/execution-transaction-on-client';

const summaryReaders = realOrderSummaries();

const PERMISOS_DEL_EMPACADOR = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
if (PERMISOS_DEL_EMPACADOR === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Empacador: este archivo no puede construir su actor');
}

const PERMISOS_DEL_ACONDICIONADOR = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO];
if (PERMISOS_DEL_ACONDICIONADOR === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Administrador de acondicionamiento');
}

/** Los permisos del Empacador mas `asignaciones.ejecutar`: quien ejecuta ve todos los terminados. */
const PERMISOS_CON_EJECUCION: readonly string[] = [...PERMISOS_DEL_EMPACADOR, 'asignaciones.ejecutar'];

/**
 * `OrderCatalog['transitionAliveById']` real: `assertTransition` seguida del mismo `UPDATE`
 * condicional, `setStatus` de `createOrderWriteRepository()` sobre el cliente global -aqui, el
 * proxy de la transaccion del test-. NO consume material: `finishAssignedOrder` de este
 * archivo solo ejercita el cambio de estado y `finished_at`, nunca la reserva.
 */
async function transitionAliveByIdReal(
  id: string,
  companyId: string,
  from: OrderStatus,
  to: OrderStatus,
  actorId: string,
  now: Date,
): ReturnType<OrderCatalog['transitionAliveById']> {
  assertTransition(from, to);
  // R15, R16: yendo a `POR_EMPACAR` el exito real vuelve a ser el literal `'ok'` -ya
  // no da de alta ningun lote-, asi que este doble no necesita distinguir el destino.
  return createOrderWriteRepository().setStatus(id, from, to, actorId, now, { companyId });
}

/** Cablea el caso de uso REAL sobre la `tx` del fixture, con los mismos adaptadores que
 *  `lib/composition` ata en produccion. */
function wireListFinishedOrders(tx: Parameters<typeof createOrderAssignmentRepository>[0]) {
  const orders: OrderCatalog = {
    findAliveById: findAliveOrderTargetById,
    listAliveSummariesByIds: summaryReaders.listAliveSummariesByIds,
    listAliveSummariesInCompany: summaryReaders.listAliveSummariesInCompany,
    listSummariesByIdsIncludingDeleted: summaryReaders.listSummariesByIdsIncludingDeleted,
    transitionAliveById: transitionAliveByIdReal,
    // R27: las dos escrituras REALES de empaque, mismo patron que `setStatus` arriba -las dos
    // `UPDATE` condicionales de `order-prisma.ts` sobre el proxy de la `tx` del fixture-.
    startPackingAliveById: (id, companyId, packerId, now) =>
      startPackingAliveOrder(id, packerId, now, { companyId }),
    // T14: `finishPackingAlive` ya vive en `OrderWriteRepository`, dentro de la unidad de
    // trabajo. Este archivo no ejercita el alta de producto terminado (T14 la prueba entera en
    // `finish-with-finished-goods.int.test.ts`), asi que el `'ok'` vuelve sin lineas.
    finishPackingAliveById: async (id, companyId, packerId, now) => {
      const outcome = await createOrderWriteRepository().finishPackingAlive(id, packerId, now, { companyId });
      return outcome.kind === 'ok' ? { kind: 'ok', finishedGoods: [] } : outcome.kind;
    },
    startConditioningAliveById: (id, companyId, conditionerId, now) =>
      startConditioningAliveOrder(id, conditionerId, now, { companyId }),
    finishConditioningAliveById: (id, companyId, conditionerId, now) =>
      finishConditioningAliveOrder(id, conditionerId, now, { companyId }),
  };
  const assignments = createOrderAssignmentRepository(tx);
  const execution = executionOnClient(tx, orders);

  return {
    orders,
    assignments,
    listFinishedOrders: createListFinishedOrders({
      orders,
      assignments,
      recipes: {
        findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
        findExecutionContentById: async () => {
          throw new Error('QC-145: listFinishedOrders no ejecuta ninguna receta');
        },
        findIdsMatchingName: async () => {
          throw new Error('QC-145: listFinishedOrders no busca recetas por nombre');
        },
        findAliveByNormalizedName: async () => {
          throw new Error('QC-145: listFinishedOrders no busca la receta viva por su nombre');
        },
      },
      people: assignmentDirectoryPrisma,
      presentations: { findRefs: findPresentationRefs, findByNormalizedNames: findPresentationsByNormalizedNames },
      units: {
        findRefs: findUnitRefs,
        listVisibleRefs: () => Promise.reject(new Error('no se usa')),
        findMassVolumeBridge: () => Promise.reject(new Error('no se usa')),
        findRefsSharingBaseInCompany: async () => {
          throw new Error('el listado solo resuelve la etiqueta de la unidad del pedido');
        },
      },
      now: () => NOW,
    }),
    finishAssignedOrder: createFinishAssignedOrder({
      assignments,
      orders,
      people: assignmentDirectoryPrisma,
      groups: assignmentDirectoryPrisma,
      ...execution,
      now: () => NOW,
    }),
    // R27: Comenzar y Terminar, mismos `orders` y mismo reloj que el resto del fixture.
    startPacking: createStartPacking({ orders, ...execution, now: () => NOW }),
    finishPacking: createFinishPacking({ orders, ...execution, now: () => NOW }),
    startConditioning: createStartConditioning({
      orders,
      people: assignmentDirectoryPrisma,
      groups: assignmentDirectoryPrisma,
      transaction: execution.transaction,
      now: () => NOW,
    }),
    // QC-219: este archivo no da de alta lotes de producto terminado (ver `finishPackingAliveById`
    // arriba), asi que cada linea del reparto se presenta con sus datos de lote ya escritos; se lee
    // por el proxy de la `tx` del fixture. La
    // regla de Terminar sin datos se prueba en `finish-conditioning-batch-data.int.test.ts`.
    finishConditioning: createFinishConditioning({
      orders,
      batches: {
        listOfOrder: async (companyId, orderId) =>
          (
            await prisma.orderPresentationLine.findMany({
              where: { companyId, orderId },
              select: { id: true, presentationId: true },
            })
          ).map((line) => ({
            batchId: line.id,
            orderPresentationLineId: line.id,
            presentationId: line.presentationId,
            lot: `L-${line.id}`,
            expiryDate: '2027-03-01',
            productionDate: '2026-03-01',
          })),
      },
      now: () => NOW,
    }),
  };
}

type FixtureTx = Parameters<typeof createOrder>[0];

/**
 * Un pedido `TERMINADO` sembrado a mano. Las restricciones de `orders` exigen `packed_by`,
 * `conditioned_by` y `finished_at` en `TERMINADO`, asi que nace `PENDIENTE` y pasa a `TERMINADO`
 * en una sola escritura con las tres columnas.
 */
async function terminado(
  fixture: FixtureTx,
  options: {
    readonly packedBy: string;
    readonly conditionedBy: string;
    readonly finishedAt: Date;
    readonly companyId?: string;
  },
): Promise<string> {
  const id = await createOrder(fixture, { status: 'PENDIENTE', companyId: options.companyId });
  await fixture.tx.order.update({
    where: { id },
    data: {
      status: 'TERMINADO',
      packedBy: options.packedBy,
      conditionedBy: options.conditionedBy,
      finishedAt: options.finishedAt,
    },
  });
  return id;
}

describe('asignaciones · listFinishedOrders con los permisos del Empacador (integracion)', () => {
  it('R17, R19, R20a, R31: con `asignaciones.ejecutar`, solo TERMINADO de toda la empresa, sin filtro por asignado; ni ENTREGADO, ni acondicionamiento, ni otra empresa', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const empacador = await createPerson(fixture, fixture.companyA);
      const otraPersona = await createPerson(fixture, fixture.companyA);
      const personaDeOtraEmpresa = await createPerson(fixture, fixture.companyB);

      const terminadoAjeno = await terminado(fixture, {
        packedBy: otraPersona,
        conditionedBy: otraPersona,
        finishedAt: NOW,
      });
      const pendiente = await createOrder(fixture, { status: 'PENDIENTE' });
      const terminadoDeOtraEmpresa = await terminado(fixture, {
        companyId: fixture.companyB,
        packedBy: personaDeOtraEmpresa,
        conditionedBy: personaDeOtraEmpresa,
        finishedAt: NOW,
      });

      // Un ENTREGADO antiguo, aunque tenga `finished_at`, ya no es «Terminados».
      const entregadoAntiguo = await createOrder(fixture, { status: 'ENTREGADO' });
      await fixture.tx.order.update({
        where: { id: entregadoAntiguo },
        data: { finishedAt: NOW, packedBy: otraPersona },
      });

      // Los dos estados de acondicionamiento tampoco.
      const porAcondicionar = await createOrder(fixture, { status: 'PENDIENTE' });
      await fixture.tx.order.update({
        where: { id: porAcondicionar },
        data: { status: 'POR_ACONDICIONAR', packedBy: otraPersona },
      });
      const enAcondicionamiento = await createOrder(fixture, { status: 'PENDIENTE' });
      await fixture.tx.order.update({
        where: { id: enAcondicionamiento },
        data: { status: 'EN_ACONDICIONAMIENTO', packedBy: otraPersona, conditionedBy: otraPersona },
      });

      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_CON_EJECUCION,
      };

      const pagina = await listFinishedOrders(actorEmpacador, { page: 1 });

      // Sale el TERMINADO aunque el Empacador NO sea su responsable: sin filtro por usuario
      // asignado. Nada mas sale.
      expect(pagina.items.map((item) => item.id)).toEqual([terminadoAjeno]);
      expect(pagina.total).toBe(1);
      void pendiente;
      void terminadoDeOtraEmpresa;
    });
  });

  it('R20, R31: recientes primero y, a igual fecha, por numero de pedido descendente, estable entre paginas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const quien = await createPerson(fixture, fixture.companyA);
      const MISMA_FECHA = new Date('2025-12-01T00:00:00.000Z');
      const conFechaAntigua = await terminado(fixture, {
        packedBy: quien,
        conditionedBy: quien,
        finishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const conFechaReciente = await terminado(fixture, {
        packedBy: quien,
        conditionedBy: quien,
        finishedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      // `TERMINADO` siempre lleva `finished_at`: el desempate es el numero. Se crean en este orden,
      // asi que `order_sequence` es creciente y el numero DESCENDENTE los pone al reves.
      const empatePrimero = await terminado(fixture, { packedBy: quien, conditionedBy: quien, finishedAt: MISMA_FECHA });
      const empateSegundo = await terminado(fixture, { packedBy: quien, conditionedBy: quien, finishedAt: MISMA_FECHA });

      const empacador = await createPerson(fixture, fixture.companyA);
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_CON_EJECUCION,
      };

      const primeraPagina = await listFinishedOrders(actorEmpacador, { page: 1, pageSize: 2 });
      const segundaPagina = await listFinishedOrders(actorEmpacador, { page: 2, pageSize: 2 });

      expect(primeraPagina.items.map((item) => item.id)).toEqual([conFechaReciente, conFechaAntigua]);
      expect(segundaPagina.items.map((item) => item.id)).toEqual([empateSegundo, empatePrimero]);
      expect(primeraPagina.total).toBe(4);

      // Estable entre paginas: leer otra vez la primera pagina da EXACTAMENTE lo mismo.
      const primeraPaginaDeNuevo = await listFinishedOrders(actorEmpacador, { page: 1, pageSize: 2 });
      expect(primeraPaginaDeNuevo.items.map((item) => item.id)).toEqual(
        primeraPagina.items.map((item) => item.id),
      );
    });
  });

  it('R27: finalizar por el caso de uso real deja el pedido POR_EMPACAR, y ese estado NO aparece en «Terminados»', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders, finishAssignedOrder } = wireListFinishedOrders(fixture.tx);

      const empacador = await createPerson(fixture, fixture.companyA);
      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [empacador], workGroupIds: [] },
        NOW,
      );

      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      // Antes de finalizar, no aparece: no esta TERMINADO todavia.
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // El Finalizar de QC-168 deja el pedido POR_EMPACAR, no ENTREGADO: el lote de producto
      // terminado que entra viene en la respuesta, pero `finished_at` lo escribe Terminar.
      // Finalizar exige `asignaciones.ejecutar`, que el Empacador no tiene.
      await finishAssignedOrder({ ...actorEmpacador, permissions: PERMISOS_CON_EJECUCION }, { orderId: pedido, stepPosition: null });

      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);
    });
  });

  it('R27, R31: Finalizar -> Comenzar/Terminar el empaque -> Comenzar/Terminar el acondicionamiento deja el pedido en «Terminados» con la fecha del ultimo Terminar', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const {
        listFinishedOrders,
        finishAssignedOrder,
        startPacking,
        finishPacking,
        startConditioning,
        finishConditioning,
      } = wireListFinishedOrders(fixture.tx);

      const operario = await createPerson(fixture, fixture.companyA);
      const empacador = await createPerson(fixture, fixture.companyA);
      const acondicionador = await createPerson(fixture, fixture.companyA);
      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [operario], workGroupIds: [] },
        NOW,
      );

      const actorOperario: Actor = {
        id: operario,
        companyId: fixture.companyA,
        permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'],
      };
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };
      const actorAcondicionador: Actor = {
        id: acondicionador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_ACONDICIONADOR,
      };
      const estadoDe = async (): Promise<string> =>
        (await fixture.tx.order.findUniqueOrThrow({ where: { id: pedido }, select: { status: true } })).status;

      // Finalizar: EN_CURSO -> POR_EMPACAR. Todavia no aparece en «Terminados».
      await finishAssignedOrder(actorOperario, { orderId: pedido, stepPosition: null });
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // R10: Comenzar exige al menos una linea de reparto real, o el pedido queda
      // `'without_distribution'` y no puede avanzar.
      await crearLinea(fixture.tx, fixture.companyA, pedido);

      // Comenzar el empaque: POR_EMPACAR -> EN_EMPAQUE, a nombre del Empacador. Sigue sin aparecer.
      await startPacking(actorEmpacador, { orderId: pedido });
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // Terminar el empaque: EN_EMPAQUE -> POR_ACONDICIONAR. Un POR_ACONDICIONAR NO aparece.
      const { numberText } = await finishPacking(actorEmpacador, { orderId: pedido });
      expect(numberText.length).toBeGreaterThan(0);
      expect(await estadoDe()).toBe('POR_ACONDICIONAR');
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // Comenzar el acondicionamiento: POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO. Tampoco aparece.
      await startConditioning(actorAcondicionador, { orderId: pedido, userIds: [operario], workGroupIds: [] });
      expect(await estadoDe()).toBe('EN_ACONDICIONAMIENTO');
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // Terminar el acondicionamiento: EN_ACONDICIONAMIENTO -> TERMINADO con `finished_at`, en el
      // instante que el fixture cablea como reloj (`NOW`), con el mismo numero visible.
      const terminar = await finishConditioning(actorAcondicionador, { orderId: pedido });
      expect(terminar.numberText).toBe(numberText);
      expect(await estadoDe()).toBe('TERMINADO');

      // Ahora si aparece en «Terminados» del Empacador -lo empaco el y `packedBy` se conserva-,
      // con la fecha de Terminar el acondicionamiento.
      const pagina = await listFinishedOrders(actorEmpacador, { page: 1 });
      expect(pagina.items).toEqual([expect.objectContaining({ id: pedido, finishedAt: NOW })]);
    });
  });

  it('R31: un ENTREGADO antiguo, con o sin `finished_at`, NO aparece en «Terminados»', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const empacador = await createPerson(fixture, fixture.companyA);
      const entregadoSinFecha = await createOrder(fixture, { status: 'ENTREGADO' });
      const entregadoConFecha = await createOrder(fixture, { status: 'ENTREGADO' });
      await fixture.tx.order.update({
        where: { id: entregadoConFecha },
        data: { finishedAt: NOW, packedBy: empacador },
      });

      const conEjecucion = await listFinishedOrders(
        { id: empacador, companyId: fixture.companyA, permissions: PERMISOS_CON_EJECUCION },
        { page: 1 },
      );
      const delEmpacador = await listFinishedOrders(
        { id: empacador, companyId: fixture.companyA, permissions: PERMISOS_DEL_EMPACADOR },
        { page: 1 },
      );

      expect(conEjecucion.items).toEqual([]);
      expect(conEjecucion.total).toBe(0);
      expect(delEmpacador.items).toEqual([]);
      void entregadoSinFecha;
    });
  });

  it('R18: sin `terminados.consultar` la consulta rechaza antes de tocar ningun puerto', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);
      const operador = await createPerson(fixture, fixture.companyA);

      await expect(
        listFinishedOrders(
          { id: operador, companyId: fixture.companyA, permissions: ['asignaciones.consultar'] },
          { page: 1 },
        ),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    });
  });

  it('R20, R31: dos empacadores sin `asignaciones.ejecutar` ven cada uno solo lo que empacaron, con total y paginas del conjunto filtrado', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const empacadorA = await createPerson(fixture, fixture.companyA);
      const empacadorB = await createPerson(fixture, fixture.companyA);
      const empacadorC = await createPerson(fixture, fixture.companyA);
      const acondicionador = await createPerson(fixture, fixture.companyA);

      async function terminadoPor(packedBy: string, finishedAt: Date): Promise<string> {
        return terminado(fixture, { packedBy, conditionedBy: acondicionador, finishedAt });
      }

      const deA1 = await terminadoPor(empacadorA, new Date('2026-03-01T00:00:00.000Z'));
      const deA2 = await terminadoPor(empacadorA, new Date('2026-03-02T00:00:00.000Z'));
      const deA3 = await terminadoPor(empacadorA, new Date('2026-03-03T00:00:00.000Z'));
      const deB = await terminadoPor(empacadorB, new Date('2026-03-04T00:00:00.000Z'));
      // `TERMINADO` siempre lleva empacador: el que no ven ni A ni B es de un tercero.
      const deC = await terminadoPor(empacadorC, new Date('2026-03-05T00:00:00.000Z'));

      const actorA: Actor = { id: empacadorA, companyId: fixture.companyA, permissions: PERMISOS_DEL_EMPACADOR };
      const actorB: Actor = { id: empacadorB, companyId: fixture.companyA, permissions: PERMISOS_DEL_EMPACADOR };

      const primeraDeA = await listFinishedOrders(actorA, { page: 1, pageSize: 2 });
      const segundaDeA = await listFinishedOrders(actorA, { page: 2, pageSize: 2 });
      expect(primeraDeA.items.map((item) => item.id)).toEqual([deA3, deA2]);
      expect(segundaDeA.items.map((item) => item.id)).toEqual([deA1]);
      expect(primeraDeA.total).toBe(3);
      expect(primeraDeA.totalPages).toBe(2);

      const deEmpacadorB = await listFinishedOrders(actorB, { page: 1 });
      expect(deEmpacadorB.items.map((item) => item.id)).toEqual([deB]);
      expect(deEmpacadorB.total).toBe(1);

      // Con `asignaciones.ejecutar` vuelven todos, tambien el del tercer empacador.
      const todos = await listFinishedOrders({ ...actorA, permissions: PERMISOS_CON_EJECUCION }, { page: 1 });
      expect(todos.items.map((item) => item.id)).toEqual([deC, deB, deA3, deA2, deA1]);
      expect(todos.total).toBe(5);
    });
  });
});
