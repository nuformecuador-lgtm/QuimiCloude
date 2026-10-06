// lib/modules/identity/domain/list-work-group-candidates.ts
import { requirePermission, type Actor } from './actor';
import { canJoinWorkGroup } from './add-work-group-member';
import { buildDisplayName } from './display-name';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { WORK_GROUP_CANDIDATE_QUERYABLE } from './work-group-queryable';

import type { PaginationPolicy } from './list-work-group-members';
import type { Page } from './page';

import type { ListQueryLog } from '../ports/list-query-log';
import type {
  WorkGroupCandidate,
  WorkGroupCandidateReader,
} from '../ports/work-group-candidate-reader';

/**
 * Una persona que se puede meter en un grupo: solo lo que el buscador pinta. Sin estado de cuenta
 * porque todas las que salen estan efectivamente activas.
 */
export type WorkGroupCandidateRow = {
  readonly id: string;
  readonly displayName: string;
  readonly roleName: string;
};

export type ListWorkGroupCandidatesDeps = {
  readonly candidates: WorkGroupCandidateReader;
  readonly pagination: PaginationPolicy;
  readonly log?: ListQueryLog;
};

const LIST_NAME = 'work-group-candidates';

const listQuerySchema = createListQuerySchema();

function toRow(candidate: WorkGroupCandidate): WorkGroupCandidateRow {
  return {
    id: candidate.id,
    displayName: buildDisplayName(candidate.firstNames, candidate.lastNames, candidate.username),
    roleName: candidate.roleName,
  };
}

/**
 * Las personas que se pueden meter en un grupo: vivas, de la empresa del actor y con estado
 * EFECTIVO activo en `now`. Filtra antes de paginar para que `total` cuente solo a las que salen;
 * el filtro va en memoria porque depende del reloj y su unica definicion es `canJoinWorkGroup`.
 *
 * Exige `usuarios.modificar` y no `usuarios.consultar`: esta lista solo sirve para elegir a quien
 * meter, y meter exige `usuarios.modificar`.
 *
 * Excluye al propio actor, igual que el listado de usuarios que el buscador usaba antes.
 */
export function createListWorkGroupCandidates(
  deps: ListWorkGroupCandidatesDeps,
): (
  actor: Actor | null | undefined,
  input: unknown,
  now: Date,
) => Promise<Page<WorkGroupCandidateRow>> {
  return async function listWorkGroupCandidates(
    actor: Actor | null | undefined,
    input: unknown,
    now: Date,
  ): Promise<Page<WorkGroupCandidateRow>> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, WORK_GROUP_CANDIDATE_QUERYABLE);
    deps.log?.ignoredFields(LIST_NAME, ignored);

    const all = await deps.candidates.listCandidatesAliveInCompany(
      actor.companyId,
      actor.id,
      query.search,
    );
    const active = all.filter((candidate) => canJoinWorkGroup(candidate, now));

    const { offset, limit } = deps.pagination.toOffsetLimit(query.page, query.pageSize);

    return deps.pagination.buildPage(
      active.slice(offset, offset + limit).map(toRow),
      active.length,
      query.page,
      limit,
    );
  };
}
