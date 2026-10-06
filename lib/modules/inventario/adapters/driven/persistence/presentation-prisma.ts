import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizePresentationName } from '../../../domain/presentation-name';

import { companyScopeColumns, presentationCompanyScope } from './company-scope';
import {
  dateRangeCondition,
  normalizedSearchCondition,
  selectCondition,
  textCondition,
} from './list-query-sql';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { PresentationView } from '../../../domain/presentation-view';
import type { PresentationData } from '../../../ports/presentation-repository';

/** `presentations.content` -> cadena decimal, nunca `Prisma.Decimal` fuera del
 *  adaptador. Mismo camino que `fromDecimal`/`toDecimalInput` de `supplier-catalog-line-prisma.ts`. */
function fromContent(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(4);
}

function toContentInput(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

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
 * `presentations_name_normalized_key`) -> `'duplicate'`.
 *
 * QC-80: el `23503` (violacion de FK) llega ahora desde DOS sitios distintos y se traduce
 * **por funcion, nunca con un `catch` comun**:
 * - al BORRAR lo dispara `product_batches_presentation_id_fkey` (`ON DELETE RESTRICT`) ->
 *   `'in_use'`. **No** `products_presentation_id_fkey`, que es lo que este comentario decia
 *   hasta hoy: esa FK dejo de existir cuando QC-90 mudo la presentacion de `products` a
 *   `product_batches`.
 * - al CREAR o REEMPLAZAR solo puede venir de `presentations_unit_id_fkey`, o sea «esa
 *   unidad no existe» -> `'invalid_unit'` (R13).
 * Un `catch` compartido tendria que adivinar cual de las dos es, y adivinaria mal el dia
 * que aparezca una tercera FK.
 *
 * Prisma no expone el SQLSTATE crudo en `PrismaClientKnownRequestError`: expone SU
 * PROPIO codigo (`P2002` para violacion de unicidad, `P2003` para violacion de FK), que es
 * el equivalente estable de esos dos SQLSTATE para quien usa el cliente tipado -el
 * SQLSTATE original queda en `error.meta`, pero no hace falta leerlo para distinguir estos
 * dos casos, que es lo unico que exige el puerto-.
 *
 * QC-49 (R13, R14, R16, R17): TODA consulta y TODA escritura de este archivo lleva el AMBITO DE
 * EMPRESA, tomado del unico punto que lo define (`./company-scope`) y nunca escrito a mano. En
 * las lecturas y en el `updateMany`/`deleteMany` va EN EL `where`, en un `AND` de primer nivel y
 * jamas fundido al objeto de la busqueda; en el alta se escribe como columna. Una presentacion
 * de otra empresa devuelve `'not_found'`, el MISMO camino que «no existe»: la union discriminada
 * no crece y `PresentationView` no gana `companyId` (R19).
 *
 * QC-49 (R20, R23): dos cosas mas cambian de significado con la migracion, aunque no de codigo.
 * El `23505` ya no viene del unico GLOBAL sino de `presentations_company_name_unique`, asi que
 * `'duplicate'` solo choca DENTRO de la empresa -dos empresas pueden tener cada una su «Garrafa
 * 20 L»-. Y aparece un `23514` nuevo, el del disparador `presentations_check_unit_scope`: usar
 * una unidad de OTRA empresa. Se traduce a `'invalid_unit'`, que es lo que ya significa «esa
 * unidad no te sirve», sin anadir ningun resultado ni ningun codigo de error.
 *
 * `isUniqueNameViolation`, `isPresentationInUseViolation` e `isUnitForeignKeyViolation` afirman
 * sobre `error.code`,
 * nunca sobre el texto del mensaje (en esta maquina Postgres responde en espanol,
 * `design.md > 12`).
 */

/** R18, R20: `error.code === 'P2002'` es la unica violacion de unicidad posible aqui -desde
 * QC-49, `presentations_company_name_unique` (`company_id`, `name_normalized`) es el unico indice
 * unico de `presentations`; el GLOBAL `presentations_name_normalized_key` de QC-20 cayo en esa
 * misma migracion-. Lo que cambia no es el codigo sino su alcance: el choque es DENTRO de la
 * empresa, y dos empresas pueden tener cada una su «Garrafa 20 L». */
export function isUniqueNameViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** R21: `error.code === 'P2003'` **al borrar** solo puede venir de
 * `product_batches_presentation_id_fkey` (`ON DELETE RESTRICT`), la unica FK que apunta HACIA
 * `presentations` desde QC-90. Se lee: «esta presentacion esta en uso». */
export function isPresentationInUseViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** QC-80 (R13): `error.code === 'P2003'` **al crear o al reemplazar** solo puede venir de
 * `presentations_unit_id_fkey`, la unica FK que sale DE `presentations`. Se lee: «esa unidad
 * no existe en el catalogo». Es una funcion distinta de `isPresentationInUseViolation` aunque
 * hoy las dos miren el mismo codigo: lo que cambia no es el codigo, es lo que significa segun
 * la operacion, y separarlas es lo que impide que un `catch` comun lo confunda. */
export function isUnitForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * SQLSTATE de un error de Postgres, leido del campo ESTRUCTURADO del conector y nunca del texto
 * humano del mensaje (en esta maquina Postgres responde en espanol). Misma tecnica y mismo
 * criterio que `sqlStateOf` de `recipe-prisma.ts` y `order-prisma.ts`.
 *
 * Hace falta porque un `RAISE EXCEPTION` de plpgsql no tiene codigo `P####` propio: llega como
 * `P2010` con el SQLSTATE en `meta.code`, o como `PrismaClientUnknownRequestError` con el codigo
 * incrustado, estructurado, en el mensaje del conector.
 */
function sqlStateOf(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const match = /\bcode:\s*"(\d{5})"/.exec(error.message);
    if (match !== null) return match[1] as string;
  }
  return null;
}

/** El caso del disparador `presentations_check_unit_scope` (QC-49 R23,
 *  `20260911130000_inventory_company_scope/migration.sql > 5.b`). Es un IDENTIFICADOR en ingles
 *  que escribe el propio `RAISE EXCEPTION`, no texto que Postgres traduzca: buscarlo es lo mismo
 *  que hace `isDuplicateOrderNumber` con el nombre de su indice. */
const UNIT_FOREIGN_COMPANY_VIOLATION = 'presentations_unit_foreign_company';

/**
 * QC-49 (R23): `23514` **al crear o al reemplazar** una presentacion con una unidad de OTRA
 * empresa. Se lee: «esa unidad no te sirve», que es exactamente lo que ya significa
 * `'invalid_unit'` -por eso no nace ningun resultado nuevo en el puerto (`design.md > 6.3`)-.
 *
 * Es una funcion DISTINTA de `isUnitForeignKeyViolation` aunque las dos acaben en el mismo
 * resultado: una dice «esa unidad no existe» y la otra «existe, pero es de otra empresa». Lo que
 * cambia no es el destino de hoy, es el motivo, y separarlas es lo que impide que un `catch`
 * comun las confunda el dia que una de las dos tenga que decir otra cosa -mismo criterio con el
 * que este archivo ya separa sus dos `P2003`-.
 *
 * DOS condiciones, y hacen falta las dos: SQLSTATE `23514` **y** el nombre del caso en la carga
 * del error. Un `23514` que no se pueda identificar se RELANZA crudo en vez de traducirse a
 * ciegas: `presentations` no tiene hoy ningun otro `CHECK`, pero traducir por el codigo a secas
 * convertiria en `'invalid_unit'` cualquiera que se anada manana.
 */
function isUnitCompanyScopeViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  return `${detalle}\n${bruto}`.includes(UNIT_FOREIGN_COMPANY_VIOLATION);
}

/** Disparador `BEFORE UPDATE OF unit_id ON presentations`: sale con este nombre cuando la
 *  presentacion ya tiene algun lote y la unidad enviada es distinta de la actual. */
const UNIT_LOCKED_BY_BATCHES_TRIGGER = 'presentations_unit_locked_by_batches';

/** Mismo criterio que `isUnitCompanyScopeViolation`: SQLSTATE `23514` mas el nombre del
 *  disparador que lo lanzo, nunca el codigo a secas. */
function isUnitLockedViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  return `${detalle}\n${bruto}`.includes(UNIT_LOCKED_BY_BATCHES_TRIGGER);
}

/** QC-80 (R15): `unitId` entra en el `select` porque entra en el contrato de salida. Se
 *  exporta para que su test pueda afirmar la columna como dato y no como texto.
 *  `PRESENTATION_QUERYABLE` declara `unitId` solo como filtro (`select`), para el reparto en
 *  presentaciones del pedido; no es ordenable. */
export const presentationSelect = {
  id: true,
  name: true,
  nameNormalized: true,
  unitId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Fila de `presentationSelect` -> `PresentationView` (QC-80 R15). Pura y exportada, mismo
 *  criterio que `toProductView`: es lo unico del mapeo que se puede probar sin base. No
 *  reinterpreta nada; el `unitId` sale tal cual de la columna. */
export function toPresentationView(row: {
  id: string;
  name: string;
  nameNormalized: string;
  unitId: string;
  content: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}): PresentationView {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.nameNormalized,
    unitId: row.unitId,
    content: fromContent(row.content),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** R17, QC-80 (R11): `name` y `nameNormalized` llegan YA calculados por el dominio -este
 * adaptador no normaliza nada, `normalizePresentationName` es del dominio- y se escriben
 * junto a `unitId` en la MISMA escritura: no hay ningun camino que cree una presentacion sin
 * unidad. Aqui `P2003` es SIEMPRE `presentations_unit_id_fkey` (R13). */
export async function createPresentation(
  data: PresentationData,
  scope: InventoryScope,
): Promise<{ id: string } | 'duplicate' | 'invalid_unit'> {
  try {
    const created = await prisma.presentation.create({
      // QC-49 (R17): la empresa se escribe desde el unico punto que la define y NO desde
      // `PresentationData`, que deliberadamente no la lleva: lo que no esta en el tipo no se
      // puede elegir desde la entrada del llamante.
      data: {
        name: data.name,
        nameNormalized: data.nameNormalized,
        unitId: data.unitId,
        content: toContentInput(data.content),
        ...companyScopeColumns(scope),
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    if (isUnitForeignKeyViolation(error)) return 'invalid_unit';
    if (isUnitCompanyScopeViolation(error)) return 'invalid_unit';
    throw error;
  }
}

/** R17, R18, QC-80 (R12): reemplaza `name`, `nameNormalized` y `unitId` juntos -reemplazo
 * completo: la unidad anterior NO se conserva-. `updateMany` (no `update`) para poder
 * distinguir "no existe" (`count === 0`) de una excepcion de Prisma, sin depender de `P2025`.
 * Aqui `P2003` es SIEMPRE `presentations_unit_id_fkey` (R13), nunca «en uso»: un `UPDATE` de
 * `presentations` no puede violar la FK que apunta HACIA ella. */
export async function replacePresentation(
  id: string,
  data: PresentationData,
  scope: InventoryScope,
): Promise<'ok' | 'not_found' | 'duplicate' | 'invalid_unit' | 'unit_locked'> {
  try {
    const result = await prisma.presentation.updateMany({
      // QC-49 (R16): el AMBITO va en el `where`, no en un `if` sobre una fila leida antes.
      // Editar una presentacion de otra empresa deja `count` en 0 -o sea `'not_found'`- y NO
      // modifica la fila ajena. La empresa NO se reescribe: una presentacion no cambia de dueno.
      where: { AND: [presentationCompanyScope(scope), { id }] },
      data: {
        name: data.name,
        nameNormalized: data.nameNormalized,
        unitId: data.unitId,
        content: toContentInput(data.content),
      },
    });
    return result.count === 0 ? 'not_found' : 'ok';
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    if (isUnitLockedViolation(error)) return 'unit_locked';
    if (isUnitForeignKeyViolation(error)) return 'invalid_unit';
    if (isUnitCompanyScopeViolation(error)) return 'invalid_unit';
    throw error;
  }
}

/** R22: borrado FISICO (D6) -`presentations` no tiene `deleted_at`, y no se le anade aqui
 * (`design.md > 11.5`)-. `deleteMany` (no `delete`) para distinguir "no existe" de una
 * violacion de FK sin depender de `P2025`. R21: la FK bloquea aunque los productos duenos de
 * esos lotes esten borrados logicamente, porque `ON DELETE RESTRICT` mira las filas fisicas
 * de `product_batches`, no el `deleted_at` de su producto. */
export async function deletePresentationById(
  id: string,
  scope: InventoryScope,
): Promise<'deleted' | 'not_found' | 'in_use'> {
  try {
    // QC-49 (R16): el AMBITO en el `where` del `deleteMany`. Borrar una presentacion de otra
    // empresa no borra nada y devuelve `'not_found'`, el mismo camino que «no existe»: quien
    // sondea identificadores ajenos no aprende cuales existen.
    const result = await prisma.presentation.deleteMany({
      where: { AND: [presentationCompanyScope(scope), { id }] },
    });
    return result.count === 0 ? 'not_found' : 'deleted';
  } catch (error) {
    if (isPresentationInUseViolation(error)) return 'in_use';
    throw error;
  }
}

/**
 * Desempate ESTABLE por identificador (R10), por el mismo motivo que en productos: sin el, dos
 * filas empatadas por el criterio pedido pueden intercambiarse entre paginas.
 *
 * A diferencia de productos, el NOMBRE de una presentacion si es unico DENTRO DE SU EMPRESA
 * (`presentations_company_name_unique`, desde QC-49 R20). Y como este listado ya va acotado a una
 * sola empresa, dentro de sus filas el nombre es unico y ordenando por `name` el empate no puede
 * darse; ordenando por `createdAt` -dos altas del mismo instante- si.
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
 * aqui o cuando el valor no acota nada. `PRESENTATION_QUERYABLE` declara `createdAt`
 * (`dateRange`) y `unitId` (`select`); las otras formas se traducen igual -es trabajo del
 * adaptador- y hoy no llegan porque `sanitizeListQuery` las poda antes.
 *
 * `select` de `unitId`: una lista vacia no acota, igual que en el resto de listados. Los valores
 * que no son uuid se descartan antes de la consulta, porque `unit_id` es `uuid` y Postgres
 * rechazaria la consulta entera; si no queda ninguno, tampoco acota.
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
    case 'select': {
      if (field !== 'unitId') return null;
      const condition = selectCondition(value.values.filter(isUuid));
      return condition === null ? null : { unitId: condition };
    }
    case 'numberRange':
      return null;
  }
}

const uuidSchema = z.string().uuid();

function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
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
export function buildPresentationWhere(
  query: ListQuery,
  scope: InventoryScope,
): Prisma.PresentationWhereInput {
  const search = normalizedSearchCondition(query.search, normalizePresentationName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => presentationFilterWhere(field, value))
    .filter((condition): condition is Prisma.PresentationWhereInput => condition !== null);

  // QC-49 (R13, R14): el AMBITO es la capa de FUERA, en un `AND` de primer nivel, y la busqueda y
  // los filtros acotan DENTRO de el. Fundirlo al mismo nivel que un `OR` de busqueda dejaria que
  // un termino de busqueda ENSANCHE lo visible -la fila entraria por cumplir la busqueda, aunque
  // fuera de otra empresa-, que es el fallo exacto contra el que avisa QC-76.
  return {
    AND: [
      presentationCompanyScope(scope),
      {
        ...(search === null ? {} : { nameNormalized: search }),
        ...(filters.length === 0 ? {} : { AND: filters }),
      },
    ],
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
export async function listPresentations(
  query: ListQuery,
  scope: InventoryScope,
): Promise<Page<PresentationView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  // QC-49 (R14): el ambito entra en ESTE `where`, el mismo objeto que reciben el `findMany` y el
  // `count`, asi que el `total` tambien queda acotado a la empresa.
  const where = buildPresentationWhere(query, scope);

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

  return buildPage(items.map(toPresentationView), total, query.page, limit);
}
