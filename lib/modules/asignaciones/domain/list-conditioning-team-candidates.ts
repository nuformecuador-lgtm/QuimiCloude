// lib/modules/asignaciones/domain/list-conditioning-team-candidates.ts
/**
 * Las personas y los grupos que se ofrecen para el equipo de acondicionamiento. Exige solo
 * `acondicionamiento.modificar`: el acondicionador no tiene `asignaciones.modificar` ni
 * `usuarios.consultar`, y los dos directorios de `identity` no piden permiso propio.
 *
 * Personas con el mismo tope y orden que el selector de responsables, tope aplicado antes de
 * filtrar. De cada grupo, cuantas personas aportaria hoy y cuantas cuentas activas quedan fuera por
 * supervisar los pedidos de la empresa.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { isConditioningTeamEligible } from './conditioning-team';
import { ValidationError } from './errors';
import { MAX_CANDIDATES } from './list-responsible-candidates';

import { ACTIVE_ACCOUNTS_ONLY, type PeopleDirectory, type WorkGroupDirectory } from '@/lib/modules/identity';

const listConditioningTeamCandidatesSchema = z.strictObject({});

export type ConditioningTeamCandidatePerson = {
  readonly id: string;
  readonly displayName: string;
};

export type ConditioningTeamCandidateGroup = {
  readonly id: string;
  readonly name: string;
  /** Miembros que entrarian en el equipo si se comenzara ahora. */
  readonly contributes: number;
  /** Miembros con la cuenta activa que no entran por supervisar los pedidos de la empresa. */
  readonly excludedAdministrators: number;
};

export type ConditioningTeamCandidates = {
  readonly people: readonly ConditioningTeamCandidatePerson[];
  readonly workGroups: readonly ConditioningTeamCandidateGroup[];
};

export type ListConditioningTeamCandidatesDeps = {
  readonly people: PeopleDirectory;
  readonly groups: WorkGroupDirectory;
  readonly now?: () => Date;
};

export function createListConditioningTeamCandidates(
  deps: ListConditioningTeamCandidatesDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<ConditioningTeamCandidates> {
  return async function listConditioningTeamCandidates(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<ConditioningTeamCandidates> {
    // Autorizar va antes de validar la entrada y antes de tocar ningun puerto.
    requirePermission(actor, 'acondicionamiento.modificar');

    const parsed = listConditioningTeamCandidatesSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const now = deps.now?.() ?? new Date();
    const [people, snapshots] = await Promise.all([
      deps.people.listAliveInCompany(actor.companyId, now, MAX_CANDIDATES, ACTIVE_ACCOUNTS_ONLY),
      deps.groups.listSnapshotsAliveInCompany(actor.companyId, now, MAX_CANDIDATES),
    ]);

    const memberIds = [...new Set(snapshots.flatMap((group) => group.activeMemberIds))];
    const members =
      memberIds.length > 0 ? await deps.people.findAliveRefsInCompany(actor.companyId, memberIds, now) : [];
    const membersById = new Map(members.map((person) => [person.id, person] as const));

    return {
      people: people
        .filter((person) => isConditioningTeamEligible(person))
        .map((person) => ({ id: person.id, displayName: person.displayName })),
      workGroups: snapshots.map((group) => {
        let contributes = 0;
        let excludedAdministrators = 0;
        for (const userId of group.activeMemberIds) {
          const person = membersById.get(userId);
          if (person === undefined || !person.isActive) continue;
          if (isConditioningTeamEligible(person)) contributes += 1;
          else excludedAdministrators += 1;
        }
        return { id: group.id, name: group.name, contributes, excludedAdministrators };
      }),
    };
  };
}
