// lib/modules/asignaciones/domain/conditioning-team.ts
/**
 * La entrada de Comenzar el acondicionamiento y la composicion del equipo que lo acompana.
 * Puro: sin puertos, sin reloj.
 */
import { z } from 'zod';

import {
  ConditioningTeamEmptyError,
  ConditioningTeamMemberNotAllowedError,
  UserNotAssignableError,
  UserNotFoundError,
} from './errors';
import { canBeResponsible } from './responsible-eligibility';

import type { NewConditioningTeamMember } from '../ports/conditioning-team-repository';
import type { PersonRef, WorkGroupSnapshot } from '@/lib/modules/identity';

// Copia de la de `assignment-input.ts`, que no la exporta: un repetido se rechaza, no se deduplica.
const uniqueIdList = z
  .array(z.string().uuid())
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'la lista no admite identificadores repetidos',
  });

export const startConditioningSchema = z
  .strictObject({
    orderId: z.string().uuid(),
    userIds: uniqueIdList,
    workGroupIds: uniqueIdList,
  })
  .refine((input) => input.userIds.length > 0 || input.workGroupIds.length > 0, {
    message: 'hay que indicar al menos una persona o un grupo',
  });

export type StartConditioningInput = z.infer<typeof startConditioningSchema>;

/** Elegible para el equipo: cuenta activa y no supervisa los pedidos de toda la empresa. */
export function isConditioningTeamEligible(person: PersonRef): boolean {
  return person.isActive && canBeResponsible(person);
}

/**
 * Rechaza la primera persona suelta no elegible, en el orden pedido. `loose` es lo que `identity`
 * devolvio para `requestedUserIds`: la que falta no existe, esta de baja o es de otra empresa.
 */
export function assertLooseTeamMembers(loose: readonly PersonRef[], requestedUserIds: readonly string[]): void {
  const looseById = new Map(loose.map((person) => [person.id, person] as const));
  for (const userId of requestedUserIds) {
    const person = looseById.get(userId);
    if (person === undefined) throw new UserNotFoundError();
    if (!person.isActive) throw new UserNotAssignableError();
    if (!canBeResponsible(person)) throw new ConditioningTeamMemberNotAllowedError();
  }
}

/**
 * `members` es lo que `identity` devolvio para la union de los `activeMemberIds` de `groups`. Una
 * persona suelta no elegible rechaza entera; un miembro de grupo no elegible se omite. Gana el
 * primer camino por el que llega cada persona: primero las sueltas, despues cada grupo.
 */
export function composeConditioningTeam(
  orderId: string,
  companyId: string,
  loose: readonly PersonRef[],
  requestedUserIds: readonly string[],
  groups: readonly WorkGroupSnapshot[],
  members: readonly PersonRef[],
): readonly NewConditioningTeamMember[] {
  assertLooseTeamMembers(loose, requestedUserIds);

  const eligibleMemberIds = new Set(
    members.filter((person) => isConditioningTeamEligible(person)).map((person) => person.id),
  );

  const origins = new Map<string, { workGroupId: string | null; workGroupName: string | null }>();
  for (const userId of requestedUserIds) {
    if (!origins.has(userId)) origins.set(userId, { workGroupId: null, workGroupName: null });
  }
  for (const group of groups) {
    for (const userId of group.activeMemberIds) {
      if (origins.has(userId) || !eligibleMemberIds.has(userId)) continue;
      origins.set(userId, { workGroupId: group.id, workGroupName: group.name });
    }
  }

  if (origins.size === 0) throw new ConditioningTeamEmptyError();

  return [...origins.entries()].map(([userId, origin], position) => ({
    orderId,
    userId,
    companyId,
    workGroupId: origin.workGroupId,
    workGroupName: origin.workGroupName,
    position,
  }));
}
