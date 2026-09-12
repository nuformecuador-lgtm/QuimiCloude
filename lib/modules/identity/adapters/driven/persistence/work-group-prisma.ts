// lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts
/**
 * QC-84 T8 — Implementacion Prisma del puerto `WorkGroupRepository` (`design.md > 5`, `> 5.1`).
 *
 * **Es el UNICO archivo de esta feature que importa `@prisma/client`**, y el unico que sabe que
 * `work_groups` y `work_group_members` existen. El dominio no ve ni una transaccion ni un codigo
 * de Postgres: lo que sale de aqui son los resultados discriminados que el puerto declara.
 *
 * Cuatro decisiones que son requisito y no estilo:
 *
 *   1. **`company_id = ?` y `deleted_at IS NULL` viven en el `where` de CADA metodo** (R8, R9). No
 *      hay ninguna consulta que no los lleve, y por eso ningun caso de uso puede olvidarlos.
 *   2. **Ningun `findMany` pelado**: los `select` ENUMERAN columnas (R19, R26). Lo que no esta en
 *      la lista no puede escaparse a un payload del navegador —asi es exactamente como un
 *      `passwordHash` acaba fuera—.
 *   3. **La unicidad del nombre la garantiza el indice, no una lectura previa** (R12): no hay
 *      ningun `SELECT` por igualdad antes del `INSERT`, que seria una carrera. El `P2002` que nace
 *      del `23505` de `work_groups_name_unique` se traduce a `'duplicate_name'`.
 *   4. **`softDelete` es un `UPDATE` de `deleted_at` (R37); `removeMember` es un `DELETE` fisico
 *      (R34).** Los dos se llaman distinto a proposito (QC-83, decision 5).
 *
 * El 10 y el 25 del listado de grupos entran por `lib/shared/pagination`, **consumido aqui** —el
 * dominio no puede importar `lib/shared/**`—. La lista de MIEMBROS no se pagina aqui y es
 * deliberado (`design.md > 5.3`): la pagina la corta el caso de uso DESPUES de filtrar por el
 * estado efectivo, porque cortar antes daria paginas irregulares y un total mentiroso (R51, R52).
 */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { insensitiveContainsCondition } from './list-query-sql';

import type { ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { WorkGroupRow } from '../../../domain/work-group-view';
import type { AddMemberOutcome, MemberCandidate } from '../../../ports/work-group-repository';

// ---------------------------------------------------------------------------------------------
// Proyecciones: columnas ENUMERADAS, nunca un `findMany` sin `select`
// ---------------------------------------------------------------------------------------------

/** R26: la fila del listado son DOS columnas. Ni `nameNormalized`, ni `companyId`, ni
 *  `deletedAt`, ni marcas de tiempo: lo que no se muestra no se lee. */
const WORK_GROUP_ROW_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.WorkGroupSelect;

/** R19: lo que `MemberCandidate` necesita y NADA mas. El estado y el plazo salen CRUDOS —quien
 *  los traduce es `effectiveAccountStatus` en el dominio (QC-78 R7)—, y los tres campos de nombre
 *  son los que `buildDisplayName` consume. Ni correo, ni documento, ni `passwordHash`. */
const MEMBER_CANDIDATE_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  username: true,
  accountStatus: true,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

type WorkGroupRowPayload = Prisma.WorkGroupGetPayload<{ select: typeof WORK_GROUP_ROW_SELECT }>;
type MemberCandidatePayload = Prisma.UserGetPayload<{ select: typeof MEMBER_CANDIDATE_SELECT }>;

function toWorkGroupRow(row: WorkGroupRowPayload): WorkGroupRow {
  return { id: row.id, name: row.name };
}

function toMemberCandidate(row: MemberCandidatePayload): MemberCandidate {
  return {
    id: row.id,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    username: row.username,
    accountStatus: row.accountStatus,
    lockedUntil: row.lockedUntil,
  };
}

// ---------------------------------------------------------------------------------------------
// Traduccion del 23505 a los resultados discriminados del puerto
// ---------------------------------------------------------------------------------------------

/**
 * Marcas con las que se reconoce el choque contra `work_groups_name_unique` —el indice unico
 * COMPUESTO, FUNCIONAL (`lower(name_normalized)`) y PARCIAL (`WHERE deleted_at IS NULL`) que
 * QC-83 escribio a mano en su `migration.sql`, y que por eso NO esta en `db/schema.prisma`—.
 *
 * Se miran DOS marcas y no una por el hallazgo que QC-25 dejo escrito y QC-76 confirmo contra
 * Postgres real: cuando el conector traduce el `23505` de un indice asi a `P2002`, `meta.target`
 * trae normalmente las COLUMNAS (`name_normalized`), no el nombre del indice; pero este indice es
 * ademas FUNCIONAL, y que el conector devuelva entonces el NOMBRE del indice es un desconocido
 * que no se apuesta (regla 6 de `CLAUDE.md`). Reconocer las dos formas no puede dar un falso
 * positivo: ninguna otra restriccion de `work_groups` menciona ninguna de las dos.
 */
const WORK_GROUP_NAME_UNIQUE_MARKERS = ['name_normalized', 'work_groups_name_unique'] as const;

/**
 * Marcas del choque contra la clave primaria `(work_group_id, user_id)` —`work_group_members_pkey`,
 * la UNICA garantia de R32: la fila de mas no puede existir aunque dos intentos corran a la vez—.
 * Mismo motivo para mirar columnas y nombre a la vez. Es la unica restriccion UNICA de esa tabla,
 * asi que ningun otro `P2002` puede venir de ahi.
 */
const WORK_GROUP_MEMBER_PKEY_MARKERS = [
  'work_group_members_pkey',
  'work_group_id',
  'user_id',
] as const;

/** `meta.target` llega como cadena o como array segun la version del motor; si no es
 *  inspeccionable se devuelve vacio y NO se asume nada (mismo criterio conservador que
 *  `user-admin-prisma.ts` y `recipe-prisma.ts`). */
function targetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) {
    return target.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function mentionsAny(
  error: Prisma.PrismaClientKnownRequestError,
  markers: readonly string[],
): boolean {
  const targets = targetsOf(error);
  return markers.some((marker) => targets.some((target) => target.includes(marker)));
}

/**
 * `true` SOLO cuando el duplicado es el del nombre (R12, R17). Un `P2002` con un `target` que no
 * menciona ninguna marca conocida se RELANZA a proposito: anunciar «ya existe un grupo con ese
 * nombre» por un indice que nadie mapeo todavia seria mentira y no dejaria rastro
 * (`docs/conventions.md > Manejo de errores`).
 */
function isDuplicateNameViolation(error: unknown): boolean {
  return isUniqueViolation(error) && mentionsAny(error, WORK_GROUP_NAME_UNIQUE_MARKERS);
}

/** `true` SOLO cuando el duplicado es el de la pertenencia (R30, R32). */
function isDuplicateMemberViolation(error: unknown): boolean {
  return isUniqueViolation(error) && mentionsAny(error, WORK_GROUP_MEMBER_PKEY_MARKERS);
}

// ---------------------------------------------------------------------------------------------
// Escritura del grupo (R10-R12, R16, R17, R37, R38)
// ---------------------------------------------------------------------------------------------

/** `createInCompany` del puerto. `name` y `nameNormalized` se escriben JUNTOS, con lo que dio el
 *  caso de uso: este adaptador NO vuelve a normalizar nada, para que no puedan diverger dos
 *  definiciones de «mismo nombre» (R13). */
export async function createInCompany(
  companyId: string,
  name: string,
  nameNormalized: string,
): Promise<{ id: string } | 'duplicate_name'> {
  try {
    const created = await prisma.workGroup.create({
      data: { companyId, name, nameNormalized },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isDuplicateNameViolation(error)) return 'duplicate_name';
    throw error;
  }
}

/**
 * `renameAliveInCompany` del puerto (R16, R17). **Una sola escritura** para el nombre y su forma
 * canonica: dos dejarian una ventana con la fila incoherente.
 *
 * El ambito completo va en el `where` del `updateMany` (R8, R9): un grupo inexistente, dado de
 * baja o de otra empresa da `count === 0`, que para el dominio es el MISMO caso. `updatedAt` no
 * se escribe a mano —lo pone `@updatedAt` del cliente—.
 */
export async function renameAliveInCompany(
  companyId: string,
  id: string,
  name: string,
  nameNormalized: string,
): Promise<'ok' | 'not_found' | 'duplicate_name'> {
  try {
    const { count } = await prisma.workGroup.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { name, nameNormalized },
    });
    return count === 1 ? 'ok' : 'not_found';
  } catch (error) {
    if (isDuplicateNameViolation(error)) return 'duplicate_name';
    throw error;
  }
}

/**
 * `softDeleteAliveInCompany` del puerto: baja LOGICA, un `UPDATE` de `deleted_at` y **jamas** un
 * `DELETE` (R37, R38). La fila entera y TODAS sus pertenencias quedan intactas (decision 8), y
 * ninguna asignacion de pedido se toca —no puede: este archivo no nombra esa tabla (R39, R50)—.
 *
 * Como el indice unico del nombre es PARCIAL, este `UPDATE` **libera** el nombre (R41): otro
 * grupo vivo puede tomarlo desde el instante siguiente. Dar de baja un grupo ya dado de baja es
 * `'not_found'`, porque el `where` exige `deleted_at IS NULL` (R9).
 */
export async function softDeleteAliveInCompany(
  companyId: string,
  id: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.workGroup.updateMany({
    where: { id, companyId, deletedAt: null },
    data: { deletedAt: now, updatedAt: now },
  });
  return count === 1 ? 'ok' : 'not_found';
}

// ---------------------------------------------------------------------------------------------
// Listado de grupos (R24-R27): ES AQUI donde se pagina
// ---------------------------------------------------------------------------------------------

/** El desempate estable de R25. No es adorno: cuando el orden pedido es `createdAt` el empate es
 *  trivial, y sin desempate un grupo podria salir en dos paginas o en ninguna. */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.WorkGroupOrderByWithRelationInput;

function defaultOrderBy(): Prisma.WorkGroupOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/** Traduce el orden YA SANEADO por `WORK_GROUP_QUERYABLE` (el caso de uso poda lo que no este
 *  declarado). El `default` no es codigo muerto: un `columnId` que llegara sin declarar cae al
 *  orden por defecto en vez de romper la consulta (QC-57 R5). */
export function workGroupOrderBy(
  sort: ListSort | null,
): Prisma.WorkGroupOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * El `where` del listado: empresa, vivos y —si la hay— la busqueda.
 *
 * **Que columna toca la busqueda es de ESTE archivo** y no del contrato: `WORK_GROUP_QUERYABLE`
 * declara `searchable: true` y nada mas. Se busca por `name`, el nombre que el operador ve, con
 * comparacion insensible a mayusculas; **no** por `nameNormalized`, que es la forma con la que
 * compara el indice y no lo que nadie escribe en una caja de busqueda.
 */
export function buildWorkGroupWhere(
  companyId: string,
  query: ListQuery,
): Prisma.WorkGroupWhereInput {
  const search = insensitiveContainsCondition(query.search);

  return {
    companyId,
    deletedAt: null,
    ...(search === null ? {} : { name: search }),
  };
}

/** `listAliveInCompany` del puerto (R24-R26). El defecto de 10 y el tope de 25 salen de
 *  `lib/shared/pagination`, la MISMA implementacion que usa el resto de la aplicacion: pedir 100
 *  devuelve 25, no un error. */
export async function listAliveInCompany(
  companyId: string,
  query: ListQuery,
): Promise<Page<WorkGroupRow>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildWorkGroupWhere(companyId, query);

  const [rows, total] = await Promise.all([
    prisma.workGroup.findMany({
      where,
      select: WORK_GROUP_ROW_SELECT,
      orderBy: workGroupOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.workGroup.count({ where }),
  ]);

  return buildPage(rows.map(toWorkGroupRow), total, query.page, limit);
}

// ---------------------------------------------------------------------------------------------
// Pertenencias (R19, R22, R28-R32, R34-R36)
// ---------------------------------------------------------------------------------------------

/** El grupo VIVO de la empresa, o `null`. Es el paso 1 de las tres operaciones de pertenencia, y
 *  esta escrito una sola vez: el ambito de R8/R9 no se copia en tres sitios. */
async function findAliveGroupId(
  tx: Prisma.TransactionClient,
  companyId: string,
  id: string,
): Promise<string | null> {
  const row = await tx.workGroup.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * `listMembersAliveInCompany` del puerto (R19, R22).
 *
 * Son DOS consultas y no un `include` porque `WorkGroupMember` **no declara ninguna relacion** en
 * el esquema: sus dos claves ajenas son COMPUESTAS con `company_id` y estan escritas a mano en el
 * `migration.sql` de QC-83 (su `design.md > 2.2`), asi que Prisma no las conoce. Se leen los
 * identificadores de las pertenencias y despues las personas vivas de la empresa.
 *
 * **El orden lo pone el SQL** (`last_names, first_names, id`, R22) sobre la consulta de personas:
 * el caso de uso filtra y corta, y filtrar CONSERVA el orden, asi que el desempate por
 * identificador que impide que dos homonimas se intercambien entre paginas (R53) viene ya dado.
 *
 * **No hay `skip` ni `take`, y no es un olvido** (`design.md > 5.3`): cortar antes del filtro del
 * estado efectivo daria paginas de tamano irregular y un total que promete personas que la
 * pantalla no muestra (R51, R52).
 */
export async function listMembersAliveInCompany(
  companyId: string,
  id: string,
): Promise<MemberCandidate[] | 'not_found'> {
  const groupId = await findAliveGroupId(prisma, companyId, id);
  if (groupId === null) return 'not_found';

  const memberships = await prisma.workGroupMember.findMany({
    where: { workGroupId: groupId, companyId },
    select: { userId: true },
  });
  // Un grupo vivo SIN miembros devuelve un array vacio, que es un caso distinto de `'not_found'`.
  if (memberships.length === 0) return [];

  const rows = await prisma.user.findMany({
    where: {
      id: { in: memberships.map((membership) => membership.userId) },
      companyId,
      // R19: la persona dada de baja no es miembro vivo. La pertenencia sobrevive a su baja
      // —ninguna FK reacciona a un `UPDATE`—, asi que quien filtra al leer es esta consulta.
      deletedAt: null,
    },
    select: MEMBER_CANDIDATE_SELECT,
    orderBy: [{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toMemberCandidate);
}

/**
 * `addMemberAliveInCompany` del puerto: UNA transaccion de tres pasos (`design.md > 5.1`).
 *
 *   1. El grupo vivo de la empresa -> `'group_not_found'` (R8, R9).
 *   2. La persona viva de la empresa -> `'user_not_found'` (R29: inexistente, borrada o de otra
 *      empresa son el MISMO caso).
 *   3. El `INSERT` de la pertenencia. **La garantia de no duplicar es ESTE paso, no el 2** (R32):
 *      si dos intentos simultaneos corren, el segundo choca contra `work_group_members_pkey` y se
 *      traduce al mismo resultado que habria dado la lectura. El mensaje puede llegar por dos
 *      caminos; la fila de mas no puede existir por ninguno.
 *
 * El paso 2 existe por dos motivos independientes del 3: distinguir «persona inexistente» de
 * «persona duplicada» (R29 vs R30) y entregar el estado CRUDO con el que el DOMINIO elige el
 * mensaje de R31. Aqui no se cocina ningun motivo: eso seria la segunda copia de la regla que
 * QC-78 R7 puso en una sola funcion.
 *
 * La fila se crea SEA CUAL SEA el estado de cuenta de esa persona (R28): pertenecer no depende del
 * estado. El `INSERT` fallido aborta la transaccion, asi que devolver `'already_member'` no
 * confirma ninguna escritura.
 */
export async function addMemberAliveInCompany(
  companyId: string,
  id: string,
  userId: string,
  now: Date,
): Promise<AddMemberOutcome> {
  return prisma.$transaction(async (tx) => {
    const groupId = await findAliveGroupId(tx, companyId, id);
    if (groupId === null) return { kind: 'group_not_found' };

    const user = await tx.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: MEMBER_CANDIDATE_SELECT,
    });
    if (user === null) return { kind: 'user_not_found' };

    try {
      await tx.workGroupMember.create({
        data: { workGroupId: groupId, userId: user.id, companyId, createdAt: now, updatedAt: now },
        select: { workGroupId: true },
      });
      return { kind: 'created' };
    } catch (error) {
      if (isDuplicateMemberViolation(error)) {
        return { kind: 'already_member', account: toMemberCandidate(user) };
      }
      throw error;
    }
  });
}

/**
 * `removeMemberAliveInCompany` del puerto: `DELETE` **FISICO** de la fila de pertenencia (R34).
 * Es la excepcion explicita al borrado logico del repo, y la escribio QC-83 R18: la pertenencia no
 * es una transaccion, es una relacion viva. No toca a la persona, no toca sus pertenencias a otros
 * grupos y no da de baja el grupo aunque fuera su ultimo miembro (R35).
 *
 * Los dos «no encontrado» se distinguen dentro de la MISMA transaccion porque son dos mensajes
 * distintos: `'group_not_found'` es R8/R9 y `'member_not_found'` es R36 —la persona puede existir
 * perfectamente; lo que falta es la fila de PERTENENCIA—.
 */
export async function removeMemberAliveInCompany(
  companyId: string,
  id: string,
  userId: string,
): Promise<'ok' | 'group_not_found' | 'member_not_found'> {
  return prisma.$transaction(async (tx) => {
    const groupId = await findAliveGroupId(tx, companyId, id);
    if (groupId === null) return 'group_not_found';

    const { count } = await tx.workGroupMember.deleteMany({
      where: { workGroupId: groupId, userId, companyId },
    });
    return count === 1 ? 'ok' : 'member_not_found';
  });
}
