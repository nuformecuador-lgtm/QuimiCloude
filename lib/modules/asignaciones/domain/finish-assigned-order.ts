// lib/modules/asignaciones/domain/finish-assigned-order.ts
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import {
  InvalidTransitionError,
  MaterialShortageError,
  OrderNotFoundError,
  RecipeWithoutLinesError,
  ValidationError,
} from './errors';
import { assertOrderAcceptsWrites } from './order-state';

import type {
  NewAssignment,
  OrderAssignmentRepository,
} from '../ports/order-assignment-repository';
import type {
  PeopleDirectory,
  PermissionCode,
  WorkGroupDirectory,
} from '@/lib/modules/identity';

import { formatOrderNumber, type OrderAssignmentTarget, type OrderCatalog } from '@/lib/modules/pedidos';

const finishAssignedOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
});

export type FinishAssignedOrderDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly people: PeopleDirectory;
  readonly groups: WorkGroupDirectory;
  readonly now?: () => Date;
};

/**
 * Finalizar ya no da de alta ningun lote de producto terminado -eso se
 * traslada a Terminar el empaque-, asi que ya no hay envases ni producto que devolver aqui.
 */
export type FinishAssignedOrderResult = {
  readonly numberText: string;
};

/**
 * Solo `EN_CURSO` puede finalizarse. `ENTREGADO`, `CANCELADO`, `POR_EMPACAR` y `EN_EMPAQUE` los
 * rechaza `assertOrderAcceptsWrites`, con el error propio de cada uno; el unico estado que esa
 * funcion admite sin ser `EN_CURSO` es `PENDIENTE` -abrir la pantalla del pedido ya lo habria
 * dejado `EN_CURSO`, asi que llegar aqui es un Finalizar disparado antes de eso-, y se rechaza
 * con `invalid_transition` en vez de un error propio, porque ese estado no tiene uno.
 */
function assertFinishable(order: OrderAssignmentTarget): void {
  if (order.status === 'EN_CURSO') return;
  assertOrderAcceptsWrites(order);
  throw new InvalidTransitionError();
}

/** Lo que distingue a un empacador es este permiso, leido en cada persona: nunca el nombre de su rol. */
const EMPAQUE_MODIFICAR: PermissionCode = 'empaque.modificar';

/**
 * Asegura filas de responsable para los empacadores vinculados al pedido y devuelve los
 * identificadores de las que CREO. Lee los equipos vinculados EN VIVO —al finalizar es cuando
 * se sabe quien tiene que empacar— y nunca borra ni reescribe filas; el nombre que se congela
 * es el vivo a ese instante. Corre ANTES de la transicion, con el pedido aun `EN_CURSO`.
 */
async function ensurePackerAssignments(
  deps: FinishAssignedOrderDeps,
  companyId: string,
  orderId: string,
  now: Date,
): Promise<readonly string[]> {
  const rows = await deps.assignments.listByOrderInCompany(companyId, orderId);

  const assignedIds = new Set(rows.map((row) => row.userId));
  const groupIds: string[] = [];
  const seenGroups = new Set<string>();
  for (const row of rows) {
    if (row.workGroupId !== null && !seenGroups.has(row.workGroupId)) {
      seenGroups.add(row.workGroupId);
      groupIds.push(row.workGroupId);
    }
  }

  const snapshots = await Promise.all(
    groupIds.map((workGroupId) => deps.groups.findSnapshotAliveInCompany(companyId, workGroupId, now)),
  );

  const candidateIds = new Set<string>(assignedIds);
  const originByUser = new Map<string, { workGroupId: string; workGroupName: string }>();
  for (const snapshot of snapshots) {
    // Grupo dado de baja o ajeno: se salta sin distinguir los casos.
    if (snapshot === null) continue;
    for (const memberId of snapshot.activeMemberIds) {
      candidateIds.add(memberId);
      if (!originByUser.has(memberId)) {
        originByUser.set(memberId, { workGroupId: snapshot.id, workGroupName: snapshot.name });
      }
    }
  }
  if (candidateIds.size === 0) return [];

  const refs = await deps.people.findAliveRefsInCompany(companyId, [...candidateIds], now);

  const toInsert: NewAssignment[] = [];
  for (const ref of refs) {
    if (assignedIds.has(ref.id)) continue;
    if (!ref.isActive) continue;
    if (!ref.permissions.includes(EMPAQUE_MODIFICAR)) continue;
    const origin = originByUser.get(ref.id);
    toInsert.push({
      orderId,
      userId: ref.id,
      companyId,
      workGroupId: origin?.workGroupId ?? null,
      workGroupName: origin?.workGroupName ?? null,
    });
  }
  // Sin candidatos no se toca la base.
  if (toInsert.length === 0) return [];

  // Orden total por `userId` para que el lote sea determinista aunque el directorio no prometa orden.
  toInsert.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  await deps.assignments.insertMissing(toInsert, now);
  return toInsert.map((row) => row.userId);
}

/**
 * Deshace lo que `ensurePackerAssignments` creó, una fila por llamada (R6). Best-effort a
 * propósito: si la compensación falla, no oculta el error ORIGINAL de la transición, y la fila
 * huérfana es inocua (el empaque no exige asignación y el congelado impide reescribirla).
 */
async function compensatePackerAssignments(
  deps: FinishAssignedOrderDeps,
  companyId: string,
  orderId: string,
  createdIds: readonly string[],
): Promise<void> {
  for (const userId of createdIds) {
    try {
      await deps.assignments.deleteOne(companyId, orderId, userId);
    } catch {
      // Best-effort, ver arriba: un fallo aquí no sustituye al error de la transición.
    }
  }
}

/**
 * Deja el pedido en `POR_EMPACAR`, no en `ENTREGADO`: el Empacador lo entrega despues, con
 * Terminar. No recibe ni admite ningun dato de lo marcado: la entrada es solo el identificador
 * del pedido, y nada de lo recorrido en pantalla se persiste.
 *
 * Devuelve el numero visible del pedido para que la lista, al volver, pueda confirmar que
 * queda por empacar, junto con los envases y el producto terminado que recibio el lote. Se lee
 * ANTES de transicionar: una vez `POR_EMPACAR`, el pedido ya no aparece entre los estados de
 * trabajo que consulta `listAliveSummariesByIds`.
 *
 * `transitionAliveById` consume el material por dentro: `'insufficient_material'` se traduce a
 * `MaterialShortageError` y `'recipe_without_lines'` a `RecipeWithoutLinesError`, las dos
 * propias de este modulo para que el adaptador driving las traduzca con su propio `instanceof`.
 *
 * Antes de transicionar asegura filas de responsable para los empacadores vinculados al pedido
 * (ver `ensurePackerAssignments`): si la transicion falla despues, compensa lo creado y propaga
 * el error original.
 */
export function createFinishAssignedOrder(
  deps: FinishAssignedOrderDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FinishAssignedOrderResult> {
  return async function finishAssignedOrder(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FinishAssignedOrderResult> {
    requirePermission(actor, 'asignaciones.consultar');

    const parsed = finishAssignedOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId } = parsed.data;

    const ids = await deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id);
    if (!ids.includes(orderId)) throw new OrderNotFoundError();

    let order: OrderAssignmentTarget | null = await deps.orders.findAliveById(
      orderId,
      actor.companyId,
    );
    if (order === null) throw new OrderNotFoundError();
    assertFinishable(order);

    const summaryPage = await deps.orders.listAliveSummariesByIds(
      actor.companyId,
      [orderId],
      [order.status],
      1,
      1,
    );
    const summary = summaryPage.items[0];
    if (summary === undefined) throw new OrderNotFoundError();
    const numberText = formatOrderNumber(summary.number);

    const now = deps.now?.() ?? new Date();
    // El auto-asignado del empacador, ANTES de transicionar y UNA sola vez: el reintento
    // `stale` solo repite la transicion. Si esta falla despues, se compensa lo creado.
    const createdPackerIds = await ensurePackerAssignments(deps, actor.companyId, orderId, now);
    for (;;) {
      const result = await deps.orders.transitionAliveById(
        orderId,
        actor.companyId,
        order.status,
        'POR_EMPACAR',
        actor.id,
        now,
      );
      if (result === 'ok') return { numberText };
      // La transicion fallo con el pedido aun `EN_CURSO`: se deshace lo creado y se propaga
      // el error original, con el mismo mapeo de siempre.
      await compensatePackerAssignments(deps, actor.companyId, orderId, createdPackerIds);
      if (result === 'not_found') throw new OrderNotFoundError();
      if (result === 'insufficient_material') throw new MaterialShortageError();
      if (result === 'recipe_without_lines') throw new RecipeWithoutLinesError();
      // 'stale': alguien lo movio entre la lectura y esta llamada. Se relee y se reintenta
      // contra el estado real.
      order = await deps.orders.findAliveById(orderId, actor.companyId);
      if (order === null) throw new OrderNotFoundError();
      assertFinishable(order);
    }
  };
}
