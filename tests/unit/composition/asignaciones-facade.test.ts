// QC-102 T5 — La FACHADA ya cableada del modulo `asignaciones` (`design.md > 2.5`).
//
// Lo que se afirma aqui es el CABLEADO, no el dominio: que `lib/composition` publica las CINCO
// operaciones del modulo —las cuatro de QC-87 mas la consulta EN LOTE de QC-102— y que la nueva se
// cablea con el MISMO repositorio y el MISMO directorio de personas, sin ningun adaptador nuevo y
// **sin `OrderCatalog`** (hallazgo H3: comprobar cada pedido costaria una consulta por pedido, que
// es justo lo que R4 prohibe).
//
// Como `tests/unit/composition/identity-facade.test.ts`: se sustituye el cliente Prisma entero
// —`lib/composition` arrastra todos los adaptadores del repo y no hace falta ni Postgres ni
// `DATABASE_URL`— y se ejercita el cableado REAL.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

import { asignaciones } from '@/lib/composition';

describe('QC-88 T8 (censo crecido por QC-63, QC-145, QC-168, QC-82 y QC-167) — la fachada de `asignaciones` lista sus VEINTE operaciones', () => {
  // El censo CRECE, no se afloja: primero llegaron las tres de la pantalla de ejecucion, luego
  // las tres de las vistas nuevas -`listFinishedOrders`, `listCompanyOrders`,
  // `listResponsibleCandidates`- y ahora las CUATRO del empaque de QC-168. Siguen nombradas UNA A
  // UNA y comparadas por igualdad exacta: una operacion futura que nadie declare aqui pone el caso
  // en rojo, que es justo lo que este censo promete.
  // 2026-10-06 (QC-82): crece con `cancelAssignedOrder` y `recordStepMove`.
  // 2026-10-08 (QC-167): crece con DOS operaciones de solo lectura del recorrido de ejecucion,
  // `listExecutionTraces` y `getExecutionTrace` (`design.md` de QC-167). Ninguna previa se quita.
  it('expone las doce anteriores, las CUATRO de QC-168, las DOS de QC-82 y las DOS de QC-167, y ninguna mas', () => {
    expect(Object.keys(asignaciones).sort()).toEqual([
      'assignResponsibles',
      'cancelAssignedOrder',
      'finishAssignedOrder',
      'finishPacking',
      'getAssignedOrderExecution',
      'getExecutionTrace',
      'getPackingOrder',
      'listAssignedOrders',
      'listCompanyOrders',
      'listExecutionTraces',
      'listFinishedOrders',
      'listOrderResponsibles',
      'listPackingOrders',
      'listResponsibleCandidates',
      'listResponsiblesForOrders',
      'recordStepMove',
      'removeWorkGroupFromOrder',
      'startAssignedOrder',
      'startPacking',
      'unassignResponsible',
    ]);
  });

  it('`getAssignedOrderExecution` rechaza sin `asignaciones.consultar` sin llegar a la base', async () => {
    // Mismo criterio que los de abajo: con el cliente Prisma doblado a `{}`, un `unauthorized`
    // demuestra a la vez que el cableado existe y que el permiso corta ANTES de ningun puerto.
    const error = await asignaciones
      .getAssignedOrderExecution({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`startAssignedOrder` rechaza sin `asignaciones.consultar` sin llegar a la base', async () => {
    const error = await asignaciones
      .startAssignedOrder({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`finishAssignedOrder` rechaza sin `asignaciones.consultar` sin llegar a la base', async () => {
    const error = await asignaciones
      .finishAssignedOrder({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`listResponsiblesForOrders` es una funcion de DOS argumentos: el actor y los identificadores', () => {
    // El actor entra por PARAMETRO, igual que en las otras cuatro: la composicion no lo resuelve
    // (quien lo construye con las dos caras de la sesion es el adaptador driving).
    expect(typeof asignaciones.listResponsiblesForOrders).toBe('function');
    expect(asignaciones.listResponsiblesForOrders).toHaveLength(2);
  });

  it('rechaza sin permiso sin llegar a la base: la frontera esta en el caso de uso, no aqui', async () => {
    // El cliente Prisma doblado es `{}`: si la operacion tocara el repositorio, reventaria con un
    // `TypeError` en vez de con `unauthorized`. Que salga `unauthorized` demuestra las dos cosas a
    // la vez —el cableado existe y el permiso corta ANTES de ningun puerto (R2)—.
    const error = await asignaciones
      .listResponsiblesForOrders({ id: 'u', companyId: 'c', permissions: [] }, [])
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`listAssignedOrders` es una funcion de DOS argumentos: el actor y la entrada', () => {
    expect(typeof asignaciones.listAssignedOrders).toBe('function');
    expect(asignaciones.listAssignedOrders).toHaveLength(2);
  });

  it('`listAssignedOrders` rechaza sin `asignaciones.consultar` sin llegar a la base (R5, R13)', async () => {
    // Mismo criterio que arriba: el cliente Prisma doblado es `{}`, asi que un `unauthorized`
    // demuestra a la vez que el cableado existe y que el permiso corta ANTES de ningun puerto.
    const error = await asignaciones
      .listAssignedOrders({ id: 'u', companyId: 'c', permissions: [] }, { page: 1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  // Las TRES operaciones nuevas: mismo criterio que las de arriba, el cliente Prisma doblado es
  // `{}`, asi que `unauthorized` demuestra el cableado sin llegar a ningun puerto.
  it('`listFinishedOrders` rechaza sin `terminados.consultar` sin llegar a la base', async () => {
    const error = await asignaciones
      .listFinishedOrders({ id: 'u', companyId: 'c', permissions: [] }, { page: 1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`listCompanyOrders` rechaza sin `pedidos.consultar` sin llegar a la base', async () => {
    const error = await asignaciones
      .listCompanyOrders({ id: 'u', companyId: 'c', permissions: [] }, { page: 1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`listResponsibleCandidates` rechaza sin `asignaciones.modificar` sin llegar a la base', async () => {
    const error = await asignaciones
      .listResponsibleCandidates({ id: 'u', companyId: 'c', permissions: [] }, {})
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  // Las CUATRO operaciones de QC-168: mismo criterio, el cliente Prisma doblado es `{}`, asi que
  // `unauthorized` demuestra el cableado sin llegar a ningun puerto.
  it('`listPackingOrders` rechaza sin `empaque.modificar` sin llegar a la base', async () => {
    const error = await asignaciones
      .listPackingOrders({ id: 'u', companyId: 'c', permissions: [] }, { page: 1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`getPackingOrder` rechaza sin `empaque.modificar` sin llegar a la base', async () => {
    const error = await asignaciones
      .getPackingOrder({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`startPacking` rechaza sin `empaque.modificar` sin llegar a la base', async () => {
    const error = await asignaciones
      .startPacking({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`finishPacking` rechaza sin `empaque.modificar` sin llegar a la base', async () => {
    const error = await asignaciones
      .finishPacking({ id: 'u', companyId: 'c', permissions: [] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('R26: `cancelAssignedOrder` rechaza sin `asignaciones.ejecutar` sin llegar a la base', async () => {
    const error = await asignaciones
      .cancelAssignedOrder({ id: 'u', companyId: 'c', permissions: ['asignaciones.consultar'] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('R26: `recordStepMove` rechaza sin `asignaciones.ejecutar` sin llegar a la base', async () => {
    const error = await asignaciones
      .recordStepMove({ id: 'u', companyId: 'c', permissions: ['asignaciones.consultar'] }, { orderId: 'o' })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });
});
