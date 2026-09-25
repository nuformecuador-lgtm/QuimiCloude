import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeCustomerText } from '../../../domain/customer-text';

import { companyScopeColumns, customerCompanyScope } from './company-scope';
import { dateRangeCondition } from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { CustomerScope } from '../../../domain/customer-scope';
import type { NewCustomer, CustomerView } from '../../../domain/customer-view';

/**
 * Implementa `CustomerRepository` (`design.md > 8`) con Prisma. Junto con `company-scope.ts` es
 * el UNICO archivo del modulo que importa `@prisma/client`. Ninguna consulta nombra otro modelo.
 *
 * `deleted_at IS NULL` va en el `where` de toda lectura y de toda escritura que exija que la
 * fila siga viva, nunca en un `if` posterior: el filtro es del puerto, y por eso ningun caso de
 * uso puede olvidarlo.
 */

/** `select` unico para las dos lecturas. `deleted_at`, `company_id` y las tres formas
 *  normalizadas NO salen: nunca son dato de salida (R22, R47). */
const CUSTOMER_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  city: true,
  phone: true,
  email: true,
  address: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_SELECT }>;

/** Fila de Prisma -> `CustomerView` del puerto. Sin ninguna traduccion de negocio. */
function toCustomerView(row: CustomerRow): CustomerView {
  return {
    id: row.id,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    city: row.city,
    phone: row.phone,
    email: row.email,
    address: row.address,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * `create` de `CustomerRepository` (R9, R13, R21, R42). Escribe `created_by` Y `updated_by` con
 * el mismo `actorId`, y los seis datos junto con las tres formas normalizadas que ya trae
 * `data`: este adaptador no vuelve a normalizar nada.
 */
export async function createCustomer(
  data: NewCustomer,
  actorId: string,
  now: Date,
  scope: CustomerScope,
): Promise<{ id: string }> {
  const created = await prisma.customer.create({
    data: {
      ...companyScopeColumns(scope),
      firstNames: data.firstNames,
      firstNamesNormalized: data.firstNamesNormalized,
      lastNames: data.lastNames,
      lastNamesNormalized: data.lastNamesNormalized,
      city: data.city,
      cityNormalized: data.cityNormalized,
      phone: data.phone,
      email: data.email,
      address: data.address,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/** `findAliveById` (R22, R23): `deleted_at IS NULL` y el ambito de empresa en el `where`. */
export async function findAliveCustomerById(
  id: string,
  scope: CustomerScope,
): Promise<CustomerView | null> {
  const row = await prisma.customer.findFirst({
    where: { id, deletedAt: null, ...customerCompanyScope(scope) },
    select: CUSTOMER_SELECT,
  });
  return row === null ? null : toCustomerView(row);
}

/**
 * `updateAlive` (R20, R21, R23). `updateMany` con `deletedAt: null` en el `where`: si el
 * cliente no existe, ya esta dado de baja o es de otra empresa, `count` sale 0 y se devuelve
 * `'not_found'` en vez de lanzar. `data` NUNCA incluye `createdBy` ni `createdAt` (R21).
 */
export async function updateAliveCustomer(
  id: string,
  data: NewCustomer,
  actorId: string,
  now: Date,
  scope: CustomerScope,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.customer.updateMany({
    where: { id, deletedAt: null, ...customerCompanyScope(scope) },
    data: {
      firstNames: data.firstNames,
      firstNamesNormalized: data.firstNamesNormalized,
      lastNames: data.lastNames,
      lastNamesNormalized: data.lastNamesNormalized,
      city: data.city,
      cityNormalized: data.cityNormalized,
      phone: data.phone,
      email: data.email,
      address: data.address,
      updatedAt: now,
      updatedBy: actorId,
    },
  });
  return count === 1 ? 'ok' : 'not_found';
}

/**
 * `softDeleteAlive` (R21, R24). Borrado LOGICO: marca `deleted_at` y sella `updated_at`/
 * `updated_by`, nunca `prisma.customer.delete`. Sin transaccion: el cliente no arrastra ninguna
 * tabla hija.
 */
export async function softDeleteAliveCustomer(
  id: string,
  actorId: string,
  now: Date,
  scope: CustomerScope,
): Promise<boolean> {
  const { count } = await prisma.customer.updateMany({
    where: { id, deletedAt: null, ...customerCompanyScope(scope) },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return count === 1;
}

/** Desempate ESTABLE por identificador (R29). */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.CustomerOrderByWithRelationInput;

/** Orden POR DEFECTO: `lastNames ASC, firstNames ASC, id ASC` (P3). Se construye en CADA
 *  llamada, no como constante compartida: Prisma exige un array mutable en `orderBy`. */
function defaultOrderBy(): Prisma.CustomerOrderByWithRelationInput[] {
  return [{ lastNames: 'asc' }, { firstNames: 'asc' }, TIE_BREAKER];
}

/** `sort` del contrato -> `orderBy` de Prisma. Ninguna de las columnas ordenables de
 *  `CUSTOMER_QUERYABLE` es anulable, asi que no hace falta `nulls: 'last'`. */
function customerOrderBy(sort: ListSort | null): Prisma.CustomerOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'firstNames':
      return [{ firstNames: dir }, TIE_BREAKER];
    case 'lastNames':
      return [{ lastNames: dir }, TIE_BREAKER];
    case 'city':
      return [{ city: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'updatedAt':
      return [{ updatedAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. `city` va contra
 * `cityNormalized` con el mismo `normalizeCustomerText` que escribio la columna (R47, `design.md
 * > 17.3`): filtrar por «bogota» tiene que encontrar «Bogotá», sobre la MISMA columna que la
 * busqueda usa. Un valor que queda vacio al normalizar deja el filtro sin efecto.
 */
function customerFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.CustomerWhereInput | null {
  switch (value.kind) {
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      return field === 'createdAt' ? { createdAt: condition } : null;
    }
    case 'text': {
      if (field !== 'city') return null;
      const normalized = normalizeCustomerText(value.value);
      return normalized === '' ? null : { cityNormalized: { contains: normalized } };
    }
    case 'select':
    case 'numberRange':
      return null;
  }
}

/**
 * Termino de busqueda -> `AND` de `OR` sobre las tres columnas normalizadas (R30, R41, `design.md
 * > 17.3`). El termino se parte por espacios; cada palabra se normaliza con
 * `normalizeCustomerText` y las vacias se descartan -asi «juan pérez» encuentra a *Juan* /
 * *Pérez* aunque vivan en columnas distintas, y un termino hecho solo de simbolos equivale a no
 * buscar. Sin `mode: 'insensitive'`: las columnas ya estan en minusculas y sin acentos.
 */
function searchCondition(search: string): readonly Prisma.CustomerWhereInput[] | null {
  const words = search
    .split(/\s+/)
    .map((word) => normalizeCustomerText(word))
    .filter((word) => word !== '');
  if (words.length === 0) return null;

  return words.map((word) => ({
    OR: [
      { firstNamesNormalized: { contains: word } },
      { lastNamesNormalized: { contains: word } },
      { cityNormalized: { contains: word } },
    ],
  }));
}

/**
 * `where` UNICO del listado de clientes: el mismo objeto para el `findMany` y para el `count`
 * (R11, R31). `deletedAt: null` y el ambito de empresa siempre, al mismo nivel y nunca fundidos
 * con la busqueda ni con los filtros.
 */
function buildCustomerWhere(query: ListQuery, scope: CustomerScope): Prisma.CustomerWhereInput {
  const search = searchCondition(query.search) ?? [];
  const filters = Object.entries(query.filters)
    .map(([field, value]) => customerFilterWhere(field, value))
    .filter((condition): condition is Prisma.CustomerWhereInput => condition !== null);
  const conditions = [...search, ...filters];

  return {
    deletedAt: null,
    ...customerCompanyScope(scope),
    ...(conditions.length === 0 ? {} : { AND: conditions }),
  };
}

/**
 * `listAlive` con el contrato generico de consulta (R26-R31). El `limit` que llega a Prisma -y
 * el `pageSize` que sale en el `Page`- es el ACOTADO que devuelve `toOffsetLimit`, nunca el que
 * pidio el llamante. `total` sale de un `count` con el MISMO `where` que el `findMany`.
 */
export async function listAliveCustomers(
  query: ListQuery,
  scope: CustomerScope,
): Promise<Page<CustomerView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildCustomerWhere(query, scope);

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: customerOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return buildPage(rows.map(toCustomerView), total, query.page, limit);
}


