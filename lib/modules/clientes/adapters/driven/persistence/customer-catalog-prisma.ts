import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { isCustomerId } from '../../../domain/customer-id';

import { customerCompanyScope } from './company-scope';
import { searchCondition } from './customer-prisma';

import type { CustomerRef, CustomerRefSearch } from '../../../domain/customer-catalog';
import type { CustomerScope } from '../../../domain/customer-scope';
import type { Page } from '../../../domain/page';

/** Lo unico que sale de un cliente hacia otro modulo. `deletedAt` solo para derivar `isDeleted`. */
const CUSTOMER_REF_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  deletedAt: true,
} satisfies Prisma.CustomerSelect;

type CustomerRefRow = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_REF_SELECT }>;

function toCustomerRef(row: CustomerRefRow): CustomerRef {
  return {
    id: row.id,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    isDeleted: row.deletedAt !== null,
  };
}

/** Sin filtro de `deletedAt`: un pedido sigue mostrando el cliente que se dio de baja despues. */
export async function findCustomerRefsIncludingDeleted(
  ids: readonly string[],
  scope: CustomerScope,
): Promise<readonly CustomerRef[]> {
  // Un id sin forma de uuid haria fallar la consulta entera en Postgres en vez de no casar.
  const validIds = ids.filter((id) => isCustomerId(id));
  if (validIds.length === 0) return [];

  const rows = await prisma.customer.findMany({
    where: { id: { in: validIds }, ...customerCompanyScope(scope) },
    select: CUSTOMER_REF_SELECT,
  });
  return rows.map(toCustomerRef);
}

export async function findAliveCustomerRefById(id: string, scope: CustomerScope): Promise<CustomerRef | null> {
  if (!isCustomerId(id)) return null;

  const row = await prisma.customer.findFirst({
    where: { id, deletedAt: null, ...customerCompanyScope(scope) },
    select: CUSTOMER_REF_SELECT,
  });
  return row === null ? null : toCustomerRef(row);
}

/** Misma busqueda por palabra que el listado de clientes, para que los dos encuentren lo mismo. */
export async function searchCustomerRefs(
  query: CustomerRefSearch,
  scope: CustomerScope,
): Promise<Page<CustomerRef>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const search = searchCondition(query.search);
  const where: Prisma.CustomerWhereInput = {
    ...customerCompanyScope(scope),
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(search === null ? {} : { AND: [...search] }),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: CUSTOMER_REF_SELECT,
      orderBy: [{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return buildPage(rows.map(toCustomerRef), total, query.page, limit);
}
