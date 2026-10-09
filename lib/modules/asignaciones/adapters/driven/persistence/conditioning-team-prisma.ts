import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type {
  ConditioningTeamMemberRow,
  ConditioningTeamRepository,
  NewConditioningTeamMember,
} from '../../../ports/conditioning-team-repository';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function createConditioningTeamRepository(db: PrismaLike = prisma): ConditioningTeamRepository {
  return {
    async insertAll(rows: readonly NewConditioningTeamMember[]): Promise<number> {
      // Sin `skipDuplicates`: un choque de PK es un error de programacion y tiene que ser ruidoso.
      const result = await db.orderConditioningTeamMember.createMany({
        data: rows.map((row) => ({
          orderId: row.orderId,
          userId: row.userId,
          companyId: row.companyId,
          workGroupId: row.workGroupId,
          workGroupName: row.workGroupName,
          position: row.position,
        })),
      });
      return result.count;
    },

    async listByOrderInCompany(
      companyId: string,
      orderId: string,
    ): Promise<readonly ConditioningTeamMemberRow[]> {
      return db.orderConditioningTeamMember.findMany({
        where: { companyId, orderId },
        orderBy: { position: 'asc' },
        select: { userId: true, workGroupId: true, workGroupName: true },
      });
    },
  };
}
