// lib/modules/asignaciones/domain/list-responsible-candidates.ts
/**
 * Caso de uso «candidatos para el selector de responsables».
 *
 * Exige `asignaciones.modificar`: es la misma condicion con la que hoy se decide si el panel de
 * asignacion se pinta o no, no un permiso de lectura nuevo. La lista de personas depende SOLO de
 * ese permiso; no vuelve a comprobar `usuarios.consultar` ni degrada a vacio si falta.
 *
 * Devuelve las personas vivas de la empresa que pueden ser responsables (`canBeResponsible`).
 * Solo entran cuentas activas: el filtro lo define y lo aplica `identity`. El rechazo de
 * `assignResponsibles` al asignar queda como segunda barrera.
 *
 * Dominio PURO: `zod` y tipos del propio modulo o del contrato publico de `identity`. Sin
 * `next/*`, sin `@prisma/client`, sin adaptadores y sin `@/lib/shared/**`.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { canBeResponsible } from './responsible-eligibility';

import { ACTIVE_ACCOUNTS_ONLY, type PeopleDirectory } from '@/lib/modules/identity';

/**
 * Tope de personas devueltas. Mismo numero que `MAX_PAGE_SIZE` (`lib/shared/pagination.ts`);
 * declarado aqui porque el dominio de un modulo no puede importar `lib/shared`.
 */
export const MAX_CANDIDATES = 25;

const listResponsibleCandidatesSchema = z.strictObject({});

export type ResponsibleCandidate = {
  readonly id: string;
  readonly displayName: string;
};

export type ListResponsibleCandidatesDeps = {
  readonly people: PeopleDirectory;
  readonly now?: () => Date;
};

export function createListResponsibleCandidates(
  deps: ListResponsibleCandidatesDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<readonly ResponsibleCandidate[]> {
  return async function listResponsibleCandidates(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<readonly ResponsibleCandidate[]> {
    requirePermission(actor, 'asignaciones.modificar');

    const parsed = listResponsibleCandidatesSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const now = deps.now?.() ?? new Date();
    const people = await deps.people.listAliveInCompany(
      actor.companyId,
      now,
      MAX_CANDIDATES,
      ACTIVE_ACCOUNTS_ONLY,
    );

    return people
      .filter((person) => canBeResponsible(person))
      .map((person) => ({ id: person.id, displayName: person.displayName }));
  };
}
