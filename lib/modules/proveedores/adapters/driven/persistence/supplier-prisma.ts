import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Page, PageQuery } from '../../../domain/page';
import type { NewSupplier, SupplierView } from '../../../domain/supplier-view';

/**
 * Implementa `SupplierRepository` (`design.md > 7`) con Prisma. Junto con
 * `supplier-catalog-line-prisma.ts` es uno de los DOS unicos archivos del modulo
 * `proveedores` que importan `@prisma/client`, `@/lib/shared/db/prisma` y
 * `@/lib/shared/pagination`.
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura y de toda escritura que exija que
 * la fila siga viva, nunca en un `if` posterior (R22): el filtro es del puerto, y por eso
 * ningun caso de uso puede olvidarlo.
 *
 * PROHIBIDO tocar `users` y `products`: `created_by`/`updated_by` viajan como
 * identificadores en crudo (R26, `design.md > 6.1`). Ni `include`, ni `select`, ni
 * `$queryRaw` hacia esas tablas.
 */

/** `select` unico para las dos lecturas. `deleted_at` NO sale: nunca es dato de salida. */
const SUPPLIER_SELECT = {
  id: true,
  name: true,
  nameNormalized: true,
  phone: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.SupplierSelect;

type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof SUPPLIER_SELECT }>;

/** Fila de Prisma -> `SupplierView` del puerto. Sin ninguna traduccion de negocio. */
export function toSupplierView(row: SupplierRow): SupplierView {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.nameNormalized,
    phone: row.phone,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Columna que protege el indice unico PARCIAL de `suppliers` (`suppliers_name_unique`,
 * escrito a mano en la migracion de QC-42: Prisma no modela indices parciales, y por eso no
 * aparece en `db/schema.prisma`). Mismo criterio verificado empiricamente en QC-25 para
 * `recipes_name_unique`: cuando el conector traduce el `23505` de un indice asi a `P2002`,
 * `error.meta.target` trae la(s) COLUMNA(S), nunca el nombre del indice.
 */
const SUPPLIER_NAME_UNIQUE_COLUMN = 'name_normalized';

/**
 * `P2002` cuenta como nombre duplicado SOLO cuando la columna que disparo la violacion es
 * la del nombre normalizado (R15). Hoy `suppliers` no tiene ningun otro unico, pero
 * traducir cualquier `23505` a «nombre repetido» seria incorrecto en cuanto lo tuviera, y
 * ese fue un hallazgo real de la revision de QC-25.
 *
 * Si `meta.target` no viniera, NO se asume: mejor relanzar el error crudo que traducirlo
 * mal (mismo criterio conservador que `recipe-prisma.ts`).
 */
export function isUniqueNameViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return target.includes(SUPPLIER_NAME_UNIQUE_COLUMN);
  if (Array.isArray(target)) return target.includes(SUPPLIER_NAME_UNIQUE_COLUMN);
  return false;
}

/**
 * `create` de `SupplierRepository` (R7, R8, R16).
 *
 * Escribe `created_by` Y `updated_by` con el mismo `actorId`: al nacer, el autor de la
 * creacion y el de la ultima modificacion son la misma persona (R8). `name` y
 * `name_normalized` se escriben JUNTOS, con lo que dio el caso de uso (R16): este adaptador
 * no vuelve a normalizar nada, para que no puedan diverger dos definiciones.
 *
 * `createdAt`/`updatedAt` usan el `now` inyectado, no el `now()` de la base, para que el
 * reloj sea el mismo que fijo el caso de uso.
 */
export async function createSupplier(
  data: NewSupplier,
  actorId: string,
  now: Date,
): Promise<{ id: string } | 'duplicate'> {
  try {
    const created = await prisma.supplier.create({
      data: {
        name: data.name,
        nameNormalized: data.nameNormalized,
        phone: data.phone,
        email: data.email,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    // R15, R17: la unicidad la garantiza SOLO el indice, sin `SELECT` previo -eso seria una
    // carrera-. El dominio recibe un resultado discriminado, jamas un SQLSTATE.
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/** `findAliveById` (R22, R24): `deleted_at IS NULL` en el `where`, no en un `if` posterior. */
export async function findAliveSupplierById(id: string): Promise<SupplierView | null> {
  const row = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    select: SUPPLIER_SELECT,
  });
  return row === null ? null : toSupplierView(row);
}

/**
 * `updateAlive` (R8, R14, R15, R22, R24).
 *
 * `updateMany` con `deletedAt: null` en el `where` y no `update`: si el proveedor no existe
 * o ya esta dado de baja, `count` sale 0 y se devuelve `'not_found'` en vez de lanzar.
 *
 * `data` NUNCA incluye `createdBy`: conservar el autor de la creacion es la mitad de R8 que
 * solo se puede demostrar aqui, y se demuestra contra Postgres en T17.
 */
export async function updateAliveSupplier(
  id: string,
  data: NewSupplier,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const { count } = await prisma.supplier.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: data.name,
        nameNormalized: data.nameNormalized,
        phone: data.phone,
        email: data.email,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1 ? 'ok' : 'not_found';
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/**
 * `softDeleteAlive` (R8, R22, R23, R24). Borrado LOGICO: marca `deleted_at` -y sella
 * `updated_at`/`updated_by`-, NUNCA `prisma.supplier.delete`. La fila se conserva entera, y
 * como el indice unico del nombre es PARCIAL sobre los vivos, el nombre queda libre (R15).
 */
export async function softDeleteAliveSupplier(
  id: string,
  actorId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.supplier.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return count === 1;
}

/**
 * `listAlive` (R18, R19, R21, R22).
 *
 * El `limit` que llega a Prisma -y el `pageSize` que sale en el `Page`- es el ACOTADO que
 * devuelve `toOffsetLimit`, nunca el que pidio el llamante: pasarle el pedido a `buildPage`
 * dejaria un `totalPages` mentiroso aunque el `LIMIT` de SQL fuera correcto.
 *
 * Orden `name ASC, id ASC` (R21). El desempate por `id` no es adorno: el nombre solo es
 * unico entre los vivos, y aunque hoy eso baste, cuesta cero y evita que dos proveedores se
 * intercambien entre paginas.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany`.
 */
export async function listAliveSuppliers(query: PageQuery): Promise<Page<SupplierView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where: Prisma.SupplierWhereInput = { deletedAt: null };

  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  return buildPage(rows.map(toSupplierView), total, query.page, limit);
}
