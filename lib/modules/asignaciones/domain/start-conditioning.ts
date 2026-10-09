// lib/modules/asignaciones/domain/start-conditioning.ts
/**
 * Comenzar el acondicionamiento: `POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO` con el actor como quien
 * acondiciona y, en la misma transaccion, el equipo que lo acompana. Sin comprobacion de
 * asignacion: cualquier actor con `acondicionamiento.modificar` puede tomar cualquier pedido vivo
 * de su empresa que este `POR_ACONDICIONAR`. No toca inventario.
 *
 * Los errores del pedido se deciden antes que los del equipo, y el equipo solo se resuelve si el
 * pedido esta `POR_ACONDICIONAR`: repetir Comenzar sobre el propio pedido no lee ni escribe equipo.
 */
import { requirePermission, type Actor } from './actor';
import { assertLooseTeamMembers, composeConditioningTeam, startConditioningSchema } from './conditioning-team';
import {
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  ValidationError,
  WorkGroupNotFoundError,
  type AsignacionesError,
} from './errors';
import { ExecutionAbortedError, isExecutionSuccess, type ExecutionWriteOutcome } from './execution-entry';

import type { NewConditioningTeamMember } from '../ports/conditioning-team-repository';
import type { ExecutionTransaction } from '../ports/execution-transaction';
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';
import type { OrderCatalog } from '@/lib/modules/pedidos';

export type StartConditioningDeps = {
  readonly orders: OrderCatalog;
  readonly people: PeopleDirectory;
  readonly groups: WorkGroupDirectory;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};

function startConditioningError(outcome: ExecutionWriteOutcome): AsignacionesError {
  if (outcome === 'taken') return new OrderConditioningTakenError();
  if (outcome === 'not_conditionable') return new OrderNotConditionableError();
  return new OrderNotFoundError();
}

async function resolveTeam(
  deps: StartConditioningDeps,
  orderId: string,
  companyId: string,
  userIds: readonly string[],
  workGroupIds: readonly string[],
  now: Date,
): Promise<readonly NewConditioningTeamMember[]> {
  const [loose, snapshots] = await Promise.all([
    userIds.length > 0 ? deps.people.findAliveRefsInCompany(companyId, userIds, now) : [],
    Promise.all(workGroupIds.map((workGroupId) => deps.groups.findSnapshotAliveInCompany(companyId, workGroupId, now))),
  ]);

  // Las dos lecturas terminan antes de mirar ninguna: el orden de los rechazos no depende de cual
  // conteste antes.
  assertLooseTeamMembers(loose, userIds);
  const groups = snapshots.map((snapshot) => {
    if (snapshot === null) throw new WorkGroupNotFoundError();
    return snapshot;
  });

  const memberIds = [...new Set(groups.flatMap((group) => group.activeMemberIds))];
  const members = memberIds.length > 0 ? await deps.people.findAliveRefsInCompany(companyId, memberIds, now) : [];

  return composeConditioningTeam(orderId, companyId, loose, userIds, groups, members);
}

export function createStartConditioning(
  deps: StartConditioningDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function startConditioning(actor: Actor | null | undefined, input: unknown): Promise<void> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = startConditioningSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { orderId, userIds, workGroupIds } = parsed.data;
    const companyId = actor.companyId;

    const target = await deps.orders.findAliveById(orderId, companyId);
    if (target === null) throw new OrderNotFoundError();
    if (target.status !== 'POR_ACONDICIONAR' && target.status !== 'EN_ACONDICIONAMIENTO') {
      throw new OrderNotConditionableError();
    }

    const now = deps.now?.() ?? new Date();
    // `EN_ACONDICIONAMIENTO` va directo a la escritura sin equipo: el `UPDATE` exige
    // `POR_ACONDICIONAR`, asi que solo puede responder `already_mine` o `taken`.
    const team =
      target.status === 'POR_ACONDICIONAR'
        ? await resolveTeam(deps, orderId, companyId, userIds, workGroupIds, now)
        : [];

    try {
      await deps.transaction.run(async ({ conditioning, team: teamWriter }) => {
        const result = await conditioning.startConditioningAliveById(orderId, companyId, actor.id, now);
        if (result === 'already_mine') return;
        if (!isExecutionSuccess(result)) throw new ExecutionAbortedError(result);
        await teamWriter.insertAll(team);
      });
    } catch (error) {
      if (error instanceof ExecutionAbortedError) throw startConditioningError(error.outcome);
      throw error;
    }
  };
}
