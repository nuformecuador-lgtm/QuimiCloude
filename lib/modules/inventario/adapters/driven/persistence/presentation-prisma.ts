import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizePresentationName } from '../../../domain/presentation-name';

import {
  dateRangeCondition,
  normalizedSearchCondition,
  textCondition,
} from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { PresentationView } from '../../../domain/presentation-view';

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

/**
 * Desempate ESTABLE por identificador (R10), por el mismo motivo que en productos: sin el, dos
 * filas empatadas por el criterio pedido pueden intercambiarse entre paginas.
 *
 * A diferencia de productos, el NOMBRE de una presentacion si es unico
 * (`presentations_name_normalized_key`), asi que ordenando por `name` el empate no puede darse;
 * ordenando por `createdAt` -dos altas del mismo instante- si.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.PresentationOrderByWithRelationInput;

/** Orden POR DEFECTO: exactamente el de hoy, `name ASC, id ASC` (R11). */
/** Se construye en CADA llamada, no como constante compartida: Prisma exige un array
 *  mutable en `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la
 *  mutara para todos. */
function defaultOrderBy(): Prisma.PresentationOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11). Ninguna columna ordenable de
 * `presentations` es anulable (`name`, `created_at` y `updated_at` son NOT NULL), asi que aqui
 * no hay `nulls: 'last'` que declarar: no hay nulos que colocar. El `default` cae al orden por
 * defecto en vez de fallar, misma defensa en profundidad que en productos (R5).
 */
export function presentationOrderBy(
  sort: ListSort | null,
): Prisma.PresentationOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'updatedAt':
      return [{ updatedAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Un filtro del contrato -> la condicion de su columna. `null` cuando el campo no es filtrable
 * aqui o cuando el valor no acota nada. `PRESENTATION_QUERYABLE` solo declara `createdAt`
 * (`dateRange`); las otras formas se traducen igual -es trabajo del adaptador- y hoy no llegan
 * porque `sanitizeListQuery` las poda antes.
 *
 * `numberRange` no aparece: `presentations` no tiene ninguna columna numerica.
 */
function presentationFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.PresentationWhereInput | null {
  switch (value.kind) {
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      if (field === 'createdAt') return { createdAt: condition };
      if (field === 'updatedAt') return { updatedAt: condition };
      return null;
    }
    case 'text': {
      const condition = textCondition(value.value);
      if (condition === null) return null;
      if (field === 'name') return { name: condition };
      return null;
    }
    case 'select':
    case 'numberRange':
      return null;
  }
}

/**
 * `where` UNICO del listado de presentaciones: el mismo objeto para el `findMany` y para el
 * `count` (R14).
 *
 * **No lleva ninguna condicion de vida, y es deliberado**: `presentations` NO tiene
 * `deleted_at` (D6 de QC-20, verificado contra el esquema), el borrado es fisico y anadir aqui
 * un `deletedAt: null` no compilaria siquiera. Lo que en productos es R7, aqui no aplica.
 *
 * La busqueda va contra `name_normalized` normalizando el termino con la MISMA funcion que
 * escribe esa columna (`normalizePresentationName`, la que ya respalda la unicidad): buscar y
 * comparar no pueden discrepar (R19), y por eso «solucion» encuentra «Solución» (R18).
 */
export function buildPresentationWhere(query: ListQuery): Prisma.PresentationWhereInput {
  const search = normalizedSearchCondition(query.search, normalizePresentationName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => presentationFilterWhere(field, value))
    .filter((condition): condition is Prisma.PresentationWhereInput => condition !== null);

  return {
    ...(search === null ? {} : { nameNormalized: search }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `list` de `PresentationRepository` con el CONTRATO GENERICO de consulta (QC-57 R10, R11, R13,
 * R14, R15, R16, R18, R29). El `limit` que llega a Prisma y el `pageSize` que sale en el `Page`
 * son SIEMPRE el acotado que devuelve `toOffsetLimit`, nunca el que pidio el llamante -si no, un
 * `pageSize: 500` devolveria 25 elementos con un `Page` diciendo `pageSize: 500` y un
 * `totalPages` mentiroso-. Pedir de mas se ACOTA, no se rechaza (R29).
 *
 * Orden, filtro y busqueda los aplica el MOTOR sobre el conjunto completo y antes de paginar
 * (R13); `total` sale de un `count` con el MISMO `where` que el `findMany` (R14).
 */
export async function listPresentations(query: ListQuery): Promise<Page<PresentationView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildPresentationWhere(query);

  const [items, total] = await Promise.all([
    prisma.presentation.findMany({
      where,
      select: presentationSelect,
      orderBy: presentationOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.presentation.count({ where }),
  ]);

  return buildPage(items, total, query.page, limit);
}
