// lib/modules/identity/adapters/driven/persistence/work-group-candidates-prisma.ts
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { buildUserWhere } from './user-admin-prisma';

import type { WorkGroupCandidate } from '../../../ports/work-group-candidate-reader';

const CANDIDATE_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  username: true,
  accountStatus: true,
  lockedUntil: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

/**
 * `listCandidatesAliveInCompany` del puerto. El `where` es el del listado de usuarios para que la
 * busqueda case con las mismas columnas que el buscador usaba antes. Sin `skip`/`take`: el estado
 * efectivo se filtra en el dominio y el corte va despues.
 */
export async function listCandidatesAliveInCompany(
  companyId: string,
  excludeUserId: string,
  search: string,
): Promise<WorkGroupCandidate[]> {
  const rows = await prisma.user.findMany({
    where: buildUserWhere(companyId, excludeUserId, {
      page: 1,
      sort: null,
      filters: {},
      search,
    }),
    select: CANDIDATE_SELECT,
    orderBy: [{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    username: row.username,
    accountStatus: row.accountStatus,
    lockedUntil: row.lockedUntil,
    roleName: row.role.name,
  }));
}
