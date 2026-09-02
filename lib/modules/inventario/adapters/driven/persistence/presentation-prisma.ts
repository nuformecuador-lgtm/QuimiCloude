import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Page, PageQuery } from '../../../domain/page';
import type { PresentationView } from '../../../ports/presentation-repository';

/**
 * Implementa los cuatro metodos de `PresentationRepository` (`design.md > 7`, T10). Unico
 * sitio del modulo que importa `@prisma/client` y `@/lib/shared/db/prisma`, y el unico que
 * llama a `lib/shared/pagination`. Se exportan funciones sueltas -no un objeto ya
 * construido- porque quien ata el puerto a esta implementacion es SOLO
 * `lib/composition/index.ts` (T11), igual que hace `identity` con
 * `session-user-prisma.ts`.
 *
 * El dominio nunca ve un codigo de Postgres: aqui se traduce el SQLSTATE a los
 * resultados discriminados del puerto. `23505` (indice unico
 * `presentations_name_normalized_key`) -> `'duplicate'`; `23503` (la FK
 * `products_presentation_id_fkey` con `ON DELETE RESTRICT`) al borrar -> `'in_use'`.
 *
 * Prisma no expone el SQLSTATE crudo en `PrismaClientKnownRequestError`: expone SU
 * PROPIO codigo (`P2002` para violacion de unicidad, `P2003` para violacion de FK), que es
 * el equivalente estable de esos dos SQLSTATE para quien usa el cliente tipado -el
 * SQLSTATE original queda en `error.meta`, pero no hace falta leerlo para distinguir estos
 * dos casos, que es lo unico que exige el puerto-. `isUniqueNameViolation` e
 * `isPresentationForeignKeyViolation` afirman sobre `error.code`, nunca sobre el texto del
 * mensaje (en esta maquina Postgres responde en espanol, `design.md > 12`).
 */

/** R18, R20: `error.code === 'P2002'` es la unica violacion de unicidad posible aqui -el
 * indice `presentations_name_normalized_key` es el unico indice unico de `presentations`-. */
export function isUniqueNameViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** R21: `error.code === 'P2003'` al borrar solo puede venir de `products_presentation_id_fkey`
 * (`ON DELETE RESTRICT`), la unica FK que referencia `presentations`. */
export function isPresentationForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

const presentationSelect = {
  id: true,
  name: true,
  nameNormalized: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** R17: `name` y `nameNormalized` llegan YA calculados por el dominio -este adaptador no
 * normaliza nada, `normalizePresentationName` es del dominio- y se escriben juntos, en la
 * misma escritura. */
export async function createPresentation(
  name: string,
  nameNormalized: string,
): Promise<{ id: string } | 'duplicate'> {
  try {
    const created = await prisma.presentation.create({
      data: { name, nameNormalized },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/** R17, R18: reemplaza `name` y `nameNormalized` juntos. `updateMany` (no `update`) para
 * poder distinguir "no existe" (`count === 0`) de una excepcion de Prisma, sin depender de
 * `P2025`. */
export async function renamePresentation(
  id: string,
  name: string,
  nameNormalized: string,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const result = await prisma.presentation.updateMany({
      where: { id },
      data: { name, nameNormalized },
    });
    return result.count === 0 ? 'not_found' : 'ok';
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/** R22: borrado FISICO (D6) -`presentations` no tiene `deleted_at`, y no se le anade aqui
 * (`design.md > 11.5`)-. `deleteMany` (no `delete`) para distinguir "no existe" de una
 * violacion de FK sin depender de `P2025`. R21: la FK bloquea aunque los productos
 * asignados esten borrados logicamente, porque `ON DELETE RESTRICT` mira las filas
 * fisicas de `products`, no su `deleted_at`. */
export async function deletePresentationById(id: string): Promise<'deleted' | 'not_found' | 'in_use'> {
  try {
    const result = await prisma.presentation.deleteMany({ where: { id } });
    return result.count === 0 ? 'not_found' : 'deleted';
  } catch (error) {
    if (isPresentationForeignKeyViolation(error)) return 'in_use';
    throw error;
  }
}

/** R23, R24, R26, R27, R35, R36: paginacion con `lib/shared/pagination`. El `limit` que
 * llega a Prisma y el `pageSize` que sale en el `Page` son SIEMPRE el acotado que devuelve
 * `toOffsetLimit`, nunca el `pageSize` que pidio el llamante -si no, un `pageSize: 500`
 * devolveria 25 elementos con un `Page` diciendo `pageSize: 500` y un `totalPages`
 * mentiroso-. `total` sale de un `count` con el MISMO `where` que el `findMany` -aqui
 * vacio, porque la lista de presentaciones no filtra nada-. Orden estable
 * `name ASC, id ASC` (D19, R26, R35).
 */
export async function listPresentations(query: PageQuery): Promise<Page<PresentationView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = {};

  const [items, total] = await Promise.all([
    prisma.presentation.findMany({
      where,
      select: presentationSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.presentation.count({ where }),
  ]);

  return buildPage(items, total, query.page, limit);
}
