// lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { USER_ACCOUNT_STATUSES } from '../../../domain/account-status';
import { NO_CREDENTIAL_SENTINEL } from '../../../domain/credential-setup-link';
import { buildDisplayName } from '../../../domain/display-name';
import { ROLE_ADMINISTRADOR, ROLE_MAESTRO } from '../../../domain/roles';
import { changeRevokesSessions, floorToSecond } from '../../../domain/session-revocation';

import { insensitiveContainsCondition, selectCondition } from './list-query-sql';

import type { UserAccountStatus } from '../../../domain/account-status';
import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { UserDetail, UserRow } from '../../../domain/user-view';
import type {
  DuplicateKey,
  GuardedChange,
  GuardedOutcome,
  NewUser,
  NewUserCredential,
} from '../../../ports/user-admin-repository';

/**
 * QC-66 T13 — Implementa `UserAdminRepository` (`ports/user-admin-repository.ts`,
 * `design.md > 7`, `> 8`, `> 9`) con Prisma. Se exportan funciones SUELTAS, no un objeto ya
 * construido: quien ata el puerto a esta implementacion es SOLO `lib/composition/index.ts` (R42),
 * igual que hace `unit-write-prisma.ts` con `UnitWriteRepository`.
 *
 * Es el unico archivo de esta feature que importa `@prisma/client`, `@/lib/shared/db/prisma` y
 * `@/lib/shared/pagination` (`design.md > 1`). `prisma.user` y `prisma.role` son los dos modelos que
 * toca, y los dos son `/// @module identity`: no cruza ninguna frontera de modulo.
 *
 * CINCO propiedades de este adaptador son el requisito, no estilo:
 *
 *   1. **Ningun `findMany`/`findFirst` sin `select`, y las columnas se ENUMERAN** (R31, R32, R45):
 *      asi es como un `password_hash` acaba en un payload del cliente. Las dos proyecciones viven en
 *      `USER_ROW_SELECT` y `USER_DETAIL_SELECT`, y ni `passwordHash`, ni `mustChangeCredential`, ni
 *      `companyId`, ni `deletedAt`, ni `accountStatusChangedBy` estan en ninguna de las dos.
 *   2. **`company_id = ?` y `deleted_at IS NULL` van en el `where` de TODA lectura y de toda
 *      escritura** (R33, R34), nunca en un `if` posterior: el filtro es del puerto, por eso el nombre
 *      de los metodos lo dice, y por eso ningun caso de uso puede olvidarlo.
 *   3. **Los tres duplicados se traducen por COLUMNA** (`error.meta.target`), nunca por el nombre del
 *      indice: ver el bloque de constantes, que deja escrito lo que la base devuelve DE VERDAD.
 *   4. **El borrado es LOGICO** (R37): un `UPDATE` de `deleted_at`. En este archivo no hay —ni puede
 *      haber— ningun `delete`/`deleteMany` sobre `users`.
 *   5. **Los tres contadores de acceso de QC-19 los escribe SOLO `applyGuardedChange`, y solo
 *      cuando el destino del estado no es `blocked`** (QC-95, enmienda R45 de QC-66): el cambio
 *      de estado los limpia en la MISMA escritura. `create`, `updateAliveInCompany`,
 *      `findAliveInCompany` y `listAliveInCompany` no los leen ni los escriben —sus
 *      nombres de columna no aparecen en ningun `select` de este archivo—; el mecanismo de
 *      bloqueo por intentos fallidos es de QC-19/QC-78, y esas cuatro operaciones no lo tocan.
 *
 * **R38/R43: no se toca ningun objeto del esquema.** Los tres indices unicos funcionales y parciales
 * de QC-47 se consumen tal cual; esta feature no aporta ninguna migracion de esquema.
 */

/**
 * Estado de cuenta que cuenta como «administrador vivo que SI manda» para la invariante de R22.
 *
 * Se escribe el literal con `satisfies` —y no `SEED_ADMIN_ACCOUNT_STATUS`, que vale lo mismo— porque
 * esa constante de QC-65 significa «con que estado nace el administrador del seed» y no «que estado
 * cuenta para la guarda»: reutilizarla ataria dos decisiones distintas que pueden cambiar por
 * separado. El `satisfies` es el ancla de compilacion: si QC-65 retirase `active` del conjunto
 * cerrado, esta linea **deja de compilar** en vez de comparar contra un estado que la base ya no
 * acepta. Mismo patron que `ACCOUNT_STATUS_AT_BIRTH` en `domain/create-user.ts`.
 */
const ACTIVE_ACCOUNT_STATUS = 'active' satisfies UserAccountStatus;

/**
 * Proyeccion de la FILA del listado (R31). `firstNames`/`lastNames` se traen porque
 * `buildDisplayName` los necesita —no porque salgan: el tipo de salida es `UserRow` y solo tiene
 * `displayName`—. `role.name` es display y no autoriza nada (R4).
 */
const USER_ROW_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  username: true,
  email: true,
  accountStatus: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

/** Proyeccion de la FICHA individual (R32): los nueve campos editables, el rol resuelto, el estado
 *  con el instante de su ultimo cambio y las dos marcas de tiempo. Quince claves de salida, esas y
 *  ninguna mas. */
const USER_DETAIL_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  birthDate: true,
  email: true,
  phone: true,
  documentTypeCode: true,
  documentNumber: true,
  username: true,
  roleId: true,
  role: { select: { name: true } },
  accountStatus: true,
  accountStatusChangedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserRowPayload = Prisma.UserGetPayload<{ select: typeof USER_ROW_SELECT }>;
type UserDetailPayload = Prisma.UserGetPayload<{ select: typeof USER_DETAIL_SELECT }>;

/** Fila de Prisma -> `UserRow`. `displayName` lo compone **`buildDisplayName`** del dominio (R31),
 *  que ya existe y ya tiene tests: no se concatena a mano aqui, que es como nacen dos reglas
 *  distintas para el mismo nombre. */
function toUserRow(row: UserRowPayload): UserRow {
  return {
    id: row.id,
    displayName: buildDisplayName(row.firstNames, row.lastNames, row.username),
    username: row.username,
    email: row.email,
    roleName: row.role.name,
    accountStatus: row.accountStatus,
  };
}

/** Fila de Prisma -> `UserDetail`. Sin ninguna traduccion de negocio: `birthDate` sale como `Date`
 *  —la columna es `@db.Date`— y pasarla a `YYYY-MM-DD` es de la pantalla (QC-67). */
function toUserDetail(row: UserDetailPayload): UserDetail {
  return {
    id: row.id,
    firstNames: row.firstNames,
    lastNames: row.lastNames,
    birthDate: row.birthDate,
    email: row.email,
    phone: row.phone,
    documentTypeCode: row.documentTypeCode,
    documentNumber: row.documentNumber,
    username: row.username,
    roleId: row.roleId,
    roleName: row.role.name,
    accountStatus: row.accountStatus,
    accountStatusChangedAt: row.accountStatusChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Traduccion de los errores de Postgres a los resultados discriminados del puerto
// ---------------------------------------------------------------------------------------------

/**
 * Columnas que identifican a cada indice unico de `users`. Se discrimina por columna y nunca por el
 * nombre del indice: el nombre no llega fiable en `meta.target`.
 *
 * Los indices son funcionales y parciales (`lower(...)`, `WHERE deleted_at IS NULL`), y esto es lo
 * que Postgres anuncia en `meta.target`, medido con `@prisma/client@6.19.3`:
 *
 *   - correo, por empresa        -> `["company_id","lower(email)"]`
 *   - documento, por empresa     -> `["company_id","document_type_code","document_number"]`
 *   - usuario, en todo el sistema -> `["lower(username)"]`
 *   - correo, sin empresa        -> `["lower(email)"]`
 *   - documento, sin empresa     -> `["document_type_code","document_number"]`
 *
 * El `target` trae la expresion `lower(...)`, no el nombre pelado de la columna; por eso se compara
 * por subcadena. Las tres marcas son disjuntas entre esos cinco `target`, asi que el orden en que se
 * comprueban no cambia el resultado. Ni la marca ni el resultado llevan datos del otro usuario.
 */
const EMAIL_UNIQUE_MARKER = 'email';
const USERNAME_UNIQUE_MARKER = 'username';
const DOCUMENT_UNIQUE_MARKER = 'document_number';

/** `error.meta.target` puede llegar como cadena o como array de cadenas segun la version del motor:
 *  se normaliza a un array antes de mirarlo. Si no es inspeccionable —ausente, u otro tipo— se
 *  devuelve vacio: no se asume nada (mismo criterio conservador que `unit-write-prisma.ts`). */
function targetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) {
    return target.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Traduce una violacion de unicidad (`P2002`, SQLSTATE `23505`) a la clave duplicada del puerto
 * (R17). **Se afirma sobre el CODIGO, nunca sobre el texto del mensaje**: en esta maquina Postgres
 * responde en espanol.
 *
 * Un `target` que no incluya ninguna de las tres marcas devuelve `null` y el llamante **relanza**
 * (R41): clasificarlo como «ya existe ese correo» haria que un indice nuevo, que nadie mapeo
 * todavia, se anunciara con un mensaje que es mentira y que no deja rastro
 * (`docs/conventions.md > Manejo de errores`).
 */
function duplicateKeyOf(error: Prisma.PrismaClientKnownRequestError): DuplicateKey | null {
  const targets = targetsOf(error);
  const mentions = (marker: string): boolean => targets.some((target) => target.includes(marker));

  if (mentions(DOCUMENT_UNIQUE_MARKER)) return 'document';
  if (mentions(EMAIL_UNIQUE_MARKER)) return 'email';
  if (mentions(USERNAME_UNIQUE_MARKER)) return 'username';
  return null;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Violacion de clave ajena (`P2003`, SQLSTATE `23503`) -> `'role_not_found'` (R18, `design.md > 7`).
 *
 * **Medido contra la base real**: en este motor `meta` llega como
 * `{ modelName: 'User', constraint: null }`, asi que **no hay forma de saber QUE clave ajena se
 * rompio**. De las dos que la entrada de estos metodos puede romper —`users_role_id_fkey` y
 * `users_document_type_code_fkey`— el puerto solo nombra una, y el resultado unico es correcto para
 * lo que R18 exige («SI el rol o el tipo de documento indicados no existen, rechazar sin escribir
 * ninguna fila»): las dos se rechazan, sin escribir nada. Queda anotado en la bitacora por si alguien
 * quiere distinguirlas algun dia: haria falta otro resultado en el puerto y, al no venir el nombre de
 * la restriccion, una comprobacion previa del tipo de documento.
 */
function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * Traduce al resultado del puerto los DOS errores que una escritura de `users` puede devolver como
 * caso de negocio, y **relanza todo lo demas** (R41): ningun `catch` descarta un error aqui.
 */
function writeFailureOutcome(error: unknown): DuplicateKey | 'role_not_found' | null {
  if (isUniqueViolation(error)) return duplicateKeyOf(error);
  if (isForeignKeyViolation(error)) return 'role_not_found';
  return null;
}

/**
 * Los roles que la gestion de usuarios no concede, con una sola lectura por nombre. Devuelve aparte
 * el id del Administrador porque la edicion lo necesita para la guarda del ultimo administrador.
 */
async function readUnassignableRoles(
  client: Pick<Prisma.TransactionClient, 'role'>,
): Promise<{ administratorId: string | undefined; unassignableIds: ReadonlySet<string> }> {
  const roles = await client.role.findMany({
    where: { name: { in: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } },
    select: { id: true, name: true },
  });
  return {
    administratorId: roles.find((role) => role.name === ROLE_ADMINISTRADOR)?.id,
    unassignableIds: new Set(roles.map((role) => role.id)),
  };
}

// ---------------------------------------------------------------------------------------------
// Alta y ficha
// ---------------------------------------------------------------------------------------------

/**
 * `create` del puerto (R13, R14, R15, R17, R49) — **QC-79 T12: las dos ramas de la credencial**.
 *
 * La **empresa** y la **credencial** son argumentos propios: se escriben aqui y no salen de `data`,
 * asi que no hay ninguna forma de crear un usuario en otra empresa (R14).
 *
 * **QC-79 R4 ENMIENDA QC-66 R15, y se dice con esas palabras**: cuando llega `{ kind: 'none' }`
 * —el administrador no escribio contrasena— **no se genera ninguna al azar**; se escribe el
 * centinela `NO_CREDENTIAL_SENTINEL` del dominio y la fila queda sin ninguna credencial con la que
 * se pueda entrar. La mitad de R15 que sobrevive sigue intacta: cuando llega `{ kind: 'hash' }`, lo
 * que se persiste es **solo** el hash de QC-5 (QC-66 R16, QC-79 R5).
 *
 * **`users` NO cambia por esto** (R37): ni columna, ni indice, ni migracion. `password_hash` sigue
 * siendo `NOT NULL` y los tres indices unicos de QC-47 se consumen tal cual.
 *
 * Tres escrituras que son invariantes del alta y no eleccion del llamante:
 * `account_status` = el `'pending'` que el tipo del puerto fija (R13), `account_status_changed_at` =
 * `now`, y `must_change_credential` en **VERDADERO** (R13, decision cerrada 8).
 *
 * **Y una NO escritura, que es igual de requisito: `account_status_changed_by` no se toca** (R49,
 * decision cerrada 18). Queda `NULL`, que es el «lo cambio el sistema, no una persona» de QC-65 R10 —
 * lo mismo que hace el seed con el administrador inicial—. El puerto no tiene parametro de autor
 * justamente para que nadie lo rellene con el actor por reflejo, y aqui tampoco aparece.
 *
 * `created_at`/`updated_at` usan el `now` inyectado y no el `now()` de la base, para que el reloj sea
 * el mismo que fijo el caso de uso (precedente `supplier-prisma.ts`).
 *
 * La unicidad la garantizan **SOLO** los tres indices de QC-47, sin ningun `SELECT` previo —que seria
 * una carrera— (R17): por eso dos altas simultaneas con el mismo correo acaban con una sola fila.
 *
 * La unica lectura previa es la de los roles que no se asignan por esta via (Administrador y
 * Maestro): si el `roleId` pedido es uno de ellos se responde `'action_not_allowed'` sin escribir.
 * No es una comprobacion de unicidad ni una carrera: esos roles solo cambian por migracion o seed.
 */
export async function create(
  companyId: string,
  data: NewUser,
  credential: NewUserCredential,
  accountStatus: 'pending',
  now: Date,
): Promise<{ id: string } | DuplicateKey | 'role_not_found' | 'action_not_allowed'> {
  const { unassignableIds } = await readUnassignableRoles(prisma);
  if (unassignableIds.has(data.roleId)) return 'action_not_allowed';

  try {
    const created = await prisma.user.create({
      data: {
        companyId,
        firstNames: data.firstNames,
        lastNames: data.lastNames,
        birthDate: data.birthDate,
        email: data.email,
        phone: data.phone,
        documentTypeCode: data.documentTypeCode,
        documentNumber: data.documentNumber,
        username: data.username,
        roleId: data.roleId,
        // QC-79 T12 (R4): con `kind: 'none'` la fila nace **sin ninguna credencial utilizable**.
        // Se escribe el centinela del dominio -la cadena `'!'`, que no es un hash bcrypt valido- y
        // no se genera ninguna contrasena al azar. `users` no cambia (R37): la columna sigue siendo
        // `NOT NULL` y no hay migracion ninguna detras de esta linea.
        passwordHash: credential.kind === 'hash' ? credential.value : NO_CREDENTIAL_SENTINEL,
        mustChangeCredential: true,
        accountStatus,
        accountStatusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    const outcome = writeFailureOutcome(error);
    if (outcome !== null) return outcome;
    throw error;
  }
}

/**
 * `findAliveInCompany` del puerto (R32, R33, R34). `findFirst` con los TRES filtros en el `where`:
 * identificador, empresa y `deleted_at IS NULL`. Los tres «no» —no existe, borrado, de otra empresa—
 * devuelven el MISMO `null`, porque distinguirlos convertiria la ficha en un oraculo de existencia
 * sobre datos ajenos.
 */
export async function findAliveInCompany(
  companyId: string,
  id: string,
): Promise<UserDetail | null> {
  const row = await prisma.user.findFirst({
    where: { id, companyId, deletedAt: null },
    select: USER_DETAIL_SELECT,
  });
  return row === null ? null : toUserDetail(row);
}

// ---------------------------------------------------------------------------------------------
// Listado (R27-R31, R33, R34, R35)
// ---------------------------------------------------------------------------------------------

/**
 * Desempate ESTABLE por identificador (R30). **No es adorno, y por eso es una constante con nombre**:
 * dos personas pueden llamarse igual dentro de una misma empresa —nada lo prohibe— y sin este tercer
 * criterio el orden de las empatadas no esta definido, asi que Postgres puede devolverlas distinto en
 * cada consulta y una fila puede salir en dos paginas o en ninguna.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.UserOrderByWithRelationInput;

/**
 * Orden POR DEFECTO: `last_names ASC, first_names ASC, id ASC` (R30). Se construye en CADA llamada y
 * no como constante compartida: Prisma exige un array mutable en `orderBy`, y devolver siempre la
 * misma instancia dejaria que un llamante la mutara para todos.
 */
function defaultOrderBy(): Prisma.UserOrderByWithRelationInput[] {
  return [{ lastNames: 'asc' }, { firstNames: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma. Cuando llega una de las columnas de `USER_QUERYABLE` se
 * aplica **y se conserva `id ASC` como ultimo desempate** (R30, `design.md > 8.2`).
 *
 * Ninguna de las seis columnas ordenables es anulable, asi que no hace falta `nulls: 'last'`.
 * `accountStatus` es un enum de Postgres y ordena por orden de declaracion del enum, no por el
 * alfabetico: lo dice `domain/user-queryable.ts` y es la semantica que hereda de la base.
 *
 * El `default` NO puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta declarado,
 * pero el adaptador no puede depender de que su llamante lo haya hecho. Es defensa en profundidad, y
 * ademas mantiene cierta aqui la regla de QC-57 R5: un campo desconocido cae al orden por defecto, no
 * revienta la consulta.
 */
export function userOrderBy(sort: ListSort | null): Prisma.UserOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'lastNames':
      return [{ lastNames: dir }, TIE_BREAKER];
    case 'firstNames':
      return [{ firstNames: dir }, TIE_BREAKER];
    case 'username':
      return [{ username: dir }, TIE_BREAKER];
    case 'email':
      return [{ email: dir }, TIE_BREAKER];
    case 'accountStatus':
      return [{ accountStatus: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/** El valor es uno de los CUATRO estados de QC-65. El conjunto cerrado se importa, no se reescribe. */
function isUserAccountStatus(value: string): value is UserAccountStatus {
  return (USER_ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde (R29). Devuelve `null` —y el
 * filtro no aparece en el `where`— cuando el campo no es filtrable aqui o cuando el valor no acota
 * nada.
 *
 * **Los valores se acotan al conjunto cerrado de estados, y eso es obligatorio, no prudencia**:
 * `sanitizeListQuery` valida la FORMA del filtro (que `accountStatus` sea `select`) pero **no sus
 * valores**, y un `in: ['bogus']` contra una columna de tipo enum hace que Prisma lance
 * `PrismaClientValidationError` —verificado contra la base real—, o sea un 500 por un parametro raro.
 * Lo que no es un estado se descarta, y si no queda ninguno el filtro se OMITE (QC-57 R5: lo que el
 * contrato no entiende no puede romper la consulta), con lo que la respuesta son los cuatro estados.
 */
function userFilterWhere(field: string, value: ListFilterValue): Prisma.UserWhereInput | null {
  switch (value.kind) {
    case 'select': {
      if (field !== 'accountStatus') return null;
      const condition = selectCondition(value.values.filter(isUserAccountStatus));
      return condition === null ? null : { accountStatus: condition };
    }
    // `USER_QUERYABLE` no declara ningun filtro de texto ni de rango (`design.md > 8.1`): uno asi se
    // poda antes de llegar aqui y, si llegara, se omite en vez de romper la consulta (QC-57 R5).
    case 'text':
    case 'numberRange':
    case 'dateRange':
      return null;
  }
}

/**
 * `where` UNICO del listado: el MISMO objeto para el `findMany` y para el `count`, literalmente la
 * misma constante y no dos copias parecidas, para que el `total` describa exactamente el conjunto que
 * se pagina.
 *
 * Cuatro capas, y ninguna sobra:
 *
 *   1. **`companyId` y `deletedAt: null` SIEMPRE** (R33, R34). No son filtros que el llamante pueda
 *      quitar: `deletedAt` no es consultable en `USER_QUERYABLE` y `NEVER_QUERYABLE` lo poda ademas
 *      por su cuenta.
 *   2. **`id <> excludeUserId` SIEMPRE** (R35): el actor no se ve a si mismo. Es argumento
 *      OBLIGATORIO del puerto, no opcional, justo para que nadie lo olvide.
 *   3. **La busqueda sobre CUATRO columnas** (R28): `first_names`, `last_names`, `email` y
 *      `username`. R28 nombra tres cosas —el «nombre» (nombres o apellidos), el correo y el nombre de
 *      usuario— y el nombre son dos columnas en esta tabla, de ahi las cuatro. Insensible a
 *      mayusculas (`ILIKE`), coherente con que los indices unicos de QC-47 comparen `lower(...)`.
 *   4. **Los filtros, TODOS a la vez** (R29): un `AND` explicito, de modo que una fila sale solo si
 *      los cumple todos.
 *
 * Las cuatro se combinan con `AND` entre si: la busqueda es un `OR` **entre sus cuatro columnas**,
 * nunca un `OR` con el ambito —eso sacaria filas de otra empresa o borradas en cuanto alguien
 * buscara—.
 */
export function buildUserWhere(
  companyId: string,
  excludeUserId: string,
  query: ListQuery,
): Prisma.UserWhereInput {
  const search = insensitiveContainsCondition(query.search);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => userFilterWhere(field, value))
    .filter((condition): condition is Prisma.UserWhereInput => condition !== null);

  return {
    companyId,
    deletedAt: null,
    id: { not: excludeUserId },
    ...(search === null
      ? {}
      : {
          OR: [
            { firstNames: search },
            { lastNames: search },
            { email: search },
            { username: search },
          ],
        }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `listAliveInCompany` del puerto (R27-R31, R33, R34, R35).
 *
 * El `limit` que llega a Prisma —y el `pageSize` que sale en la `Page`— es el ACOTADO que devuelve
 * `toOffsetLimit`: defecto **10**, tope **25** (R27). Pedir 100 se **acota** a 25, no se rechaza;
 * pasarle el pedido a `buildPage` dejaria un `totalPages` mentiroso aunque el `LIMIT` del SQL fuera
 * correcto.
 *
 * **Orden, filtro y busqueda van al MOTOR y ANTES de paginar**, nunca a la pagina ya traida: filtrar
 * lo ya descargado dejaria un `total` mentiroso y una pagina incompleta. El `total` sale de un `count`
 * con el MISMO `where`, asi que describe el conjunto YA filtrado (R27).
 */
export async function listAliveInCompany(
  companyId: string,
  excludeUserId: string,
  query: ListQuery,
): Promise<Page<UserRow>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildUserWhere(companyId, excludeUserId, query);

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_ROW_SELECT,
      orderBy: userOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return buildPage(rows.map(toUserRow), total, query.page, limit);
}

// ---------------------------------------------------------------------------------------------
// La guarda del «ultimo administrador en active» (R22, R23) — EL UNICO SITIO DEL BLOQUEO
// ---------------------------------------------------------------------------------------------

/**
 * **Paso 1 de `design.md > 9.2`, y el UNICO sitio del repositorio donde se escribe el bloqueo.** Lo
 * reutilizan `applyGuardedChange` (estado y borrado) **y** `updateAliveInCompany` (el rol), que es lo
 * que protege el «un metodo y no tres» de `design.md > 9.3`: dos copias del bloqueo serian dos sitios
 * donde olvidarlo.
 *
 * Devuelve los identificadores de los usuarios de la empresa que son administradores **vivos y en
 * `active`**, con sus filas **bloqueadas** hasta el fin de la transaccion.
 *
 * **`FOR UPDATE` sobre el CONJUNTO, no un `count` suelto**, y eso es lo que serializa (R23): mientras
 * T1 tiene bloqueadas {A, B}, T2 **espera** en su propio `SELECT … FOR UPDATE`; cuando T1 confirma,
 * T2 **re-lee**, ve solo {B}, calcula que quedaria vacio y aborta. Sin `FOR UPDATE` las dos leerian
 * {A, B} en paralelo y las dos escribirian.
 *
 * Va en `$queryRaw` porque **Prisma no expresa `FOR UPDATE`** por su API. El aislamiento es el POR
 * DEFECTO (`READ COMMITTED`): no se usa `SERIALIZABLE` a proposito —el unico fenomeno peligroso aqui
 * es *write skew* sobre filas EXISTENTES y el bloqueo explicito lo cubre, sin pagar un bucle de
 * reintentos por `40001` que seria codigo nuevo y dificil de probar—.
 *
 * **Un `INSERT` concurrente de otro administrador no queda bloqueado y da igual**: solo puede ANADIR
 * administradores activos, nunca quitarlos, asi que no puede violar la invariante.
 *
 * **Ninguna restriccion de base puede expresar esto y no se intenta** (`design.md > 12.5`): un `CHECK`
 * es por fila, un indice unico dice «a lo sumo uno» y no «al menos uno», y un trigger o un contador
 * materializado serian objetos de esquema nuevos que R43 prohibe.
 *
 * El nombre del rol llega como ARGUMENTO (R24): nunca se escribe el literal.
 */
async function lockActiveAdministratorIds(
  tx: Prisma.TransactionClient,
  companyId: string,
  adminRoleName: string,
): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "users"
    WHERE "company_id" = ${companyId}::uuid
      AND "role_id" = (SELECT "id" FROM "roles" WHERE "name" = ${adminRoleName})
      AND "account_status" = ${ACTIVE_ACCOUNT_STATUS}::"UserAccountStatus"
      AND "deleted_at" IS NULL
    FOR UPDATE
  `);
  return rows.map((row) => row.id);
}

/**
 * **Pasos 2 y 3 de `design.md > 9.2`**: con el conjunto ya bloqueado, ¿el cambio pedido lo dejaria
 * VACIO?
 *
 * `targetLeavesTheSet` lo decide el llamante, que es quien sabe que se esta escribiendo: mover el
 * estado a algo que no sea `active` saca al objetivo, borrarlo lo saca siempre, y cambiarle el rol lo
 * saca si el rol nuevo no es el de administrador.
 *
 * Dos casos que **no** son un rechazo, y conviene leerlos despacio:
 *
 *   - **El objetivo no esta en el conjunto** (no es administrador, o no esta `active`, o no existe):
 *     la escritura no puede quitar a nadie del conjunto —como mucho lo AMPLIA, si el cambio lo vuelve
 *     administrador activo—, asi que se sigue adelante. Que el objetivo no exista lo detecta despues
 *     el `count` del `UPDATE`, que responde `'not_found'`.
 *   - **El conjunto ya estaba vacio**: la empresa ya no tiene ningun administrador en `active`, y R22
 *     protege «que el ULTIMO no deje de serlo», no «que aparezca uno». Abortar aqui dejaria una
 *     empresa sin administrador activo bloqueada para cualquier operacion sobre cualquier usuario.
 */
function wouldLeaveNoAdministrator(
  activeAdministratorIds: readonly string[],
  targetId: string,
  targetLeavesTheSet: boolean,
): boolean {
  if (!targetLeavesTheSet) return false;
  if (!activeAdministratorIds.includes(targetId)) return false;
  return activeAdministratorIds.filter((id) => id !== targetId).length === 0;
}

/**
 * QC-23 T14 (R33, R34, R35, R36, R38) — el trozo de `data` que sube el sello «sesiones validas
 * desde», o **nada**.
 *
 * Devuelve un objeto que se ESPARCE dentro del `data` del `UPDATE` que ya existe, y esa es toda la
 * gracia: el sello no viaja en una segunda escritura ni en una segunda transaccion, sino como una
 * columna mas del **MISMO** `UPDATE`. Si la escritura no se confirma, el sello no sube; si el sello
 * no puede subir, la escritura no se confirma (R38). Por eso aqui no hay ningun caso de uso
 * «revocar»: serian dos escrituras sobre la misma fila y una ventana en la que la cuenta ya esta
 * bloqueada pero sus cookies todavia valen (`design.md > 5.5`).
 *
 * **La DECISION no vive aqui**: vive en `changeRevokesSessions`, funcion pura del dominio, que es
 * quien sabe que `blocked` e `inactive` cortan, que `pending` y `active` no (R36), que el rol corta
 * solo si cambio de verdad (R35) y que el borrado corta siempre (R34). Un driven puede importar su
 * propio `domain/` (`docs/architecture.md > La regla de dependencias`), asi que la regla sigue
 * estando en un solo sitio testeable con objetos planos.
 *
 * **Truncado al segundo** (`floorToSecond`, `design.md > 2.3`): `iat` viaja en segundos dentro del
 * contenido firmado, y mezclar granularidades dejaria un hueco de hasta 999 ms.
 *
 * El objeto vacio cuando no corta no es un detalle de estilo: escribir `sessions_valid_from` con su
 * valor actual seria una escritura igual, y reactivar una cuenta NO debe tocar el sello (R37).
 */
function sessionStampFor(
  change: Parameters<typeof changeRevokesSessions>[0],
  now: Date,
): { readonly sessionsValidFrom?: Date } {
  return changeRevokesSessions(change) ? { sessionsValidFrom: floorToSecond(now) } : {};
}

/**
 * `updateAliveInCompany` del puerto (R19, R20, R22, R33, R34): **REEMPLAZO COMPLETO** de los nueve
 * campos editables, nunca un PATCH campo a campo.
 *
 * Lo que `data` **no** lleva es lo que este `UPDATE` no puede escribir (R20, R45): ni `company_id`,
 * ni `account_status` y sus dos acompanantes, ni `password_hash`, ni `must_change_credential`, ni
 * ningun contador de acceso.
 *
 * **Por que vive dentro de la misma transaccion con bloqueo** (R19 + R22, nota de `GuardedChange` en
 * el puerto): el **rol** es uno de los nueve campos y R19 es reemplazo completo, asi que pedir el
 * cambio de rol por separado serian dos escrituras y dos transacciones sobre la misma fila. **El
 * bloqueo no se copia**: se pide a `lockActiveAdministratorIds`, el mismo unico sitio que usa
 * `applyGuardedChange`.
 *
 * `ROLE_ADMINISTRADOR` se **importa** del dominio (R24) porque la firma del puerto esta fijada en
 * `design.md > 7` con cuatro argumentos y no se le anade un quinto: un driven puede importar su
 * propio `domain/`, y asi no nace ninguna constante nueva ni se escribe el literal a mano.
 *
 * `updateMany` y no `update`: si el usuario no existe, esta borrado o es de otra empresa, `count` sale
 * 0 y se devuelve `'not_found'` en vez de lanzar.
 */
export async function updateAliveInCompany(
  companyId: string,
  id: string,
  data: NewUser,
  now: Date,
): Promise<'ok' | 'not_found' | DuplicateKey | 'role_not_found' | 'last_administrator' | 'action_not_allowed'> {
  return prisma.$transaction(async (tx) => {
    // 1. El bloqueo, en su unico sitio.
    //
    // **Se toma SIEMPRE**, en cada edicion, sobre TODOS los administradores activos de la empresa:
    // no se mira antes si el objetivo es administrador ni si el `roleId` pedido cambia respecto al
    // actual. No es un descuido, es la unica forma correcta: comprobarlo ANTES del bloqueo seria
    // leer sin proteccion y decidir con ese dato -exactamente la carrera que R23 prohibe-, y la
    // comprobacion tendria que ser DENTRO de la transaccion, o sea despues del bloqueo, asi que no
    // ahorraria nada.
    //
    // **El coste aceptado, dicho entero**: esto SERIALIZA todas las ediciones de usuario de una
    // misma empresa detras del mismo conjunto de filas. Ningun requisito lo prohibe y con los
    // volumenes de hoy no se nota. Si algun dia molesta, el camino es ACOTAR el bloqueo, no
    // quitarlo: nunca de menos, que es lo que R22 exige.
    const activeAdministratorIds = await lockActiveAdministratorIds(tx, companyId, ROLE_ADMINISTRADOR);

    // 2 y 3. El conjunto que quedaria. El identificador del rol administrador se lee DENTRO de la
    // misma transaccion —es el mismo valor que resuelve la subconsulta del bloqueo— para saber si el
    // rol pedido saca al objetivo del conjunto. Si el rol no existiera, el conjunto bloqueado estaria
    // vacio y la guarda no se dispara; que el `roleId` pedido no exista lo traduce el `P2003` de
    // abajo.
    const { administratorId, unassignableIds } = await readUnassignableRoles(tx);
    // Ni el Administrador ni el Maestro se conceden por esta via. Se decide antes de la guarda del
    // ultimo administrador y antes de escribir: con `'action_not_allowed'` no se escribio nada.
    if (unassignableIds.has(data.roleId)) return 'action_not_allowed';
    const leavesTheSet = data.roleId !== administratorId;
    if (wouldLeaveNoAdministrator(activeAdministratorIds, id, leavesTheSet)) {
      // Se aborta ANTES de escribir: cuando el dominio recibe esto, no se escribio nada.
      return 'last_administrator';
    }

    // 3 bis. QC-23 T14 (R35, R38): ¿el rol cambia DE VERDAD? R19 es reemplazo completo y casi toda
    // edicion reescribe el mismo `role_id`, asi que cortar por el mero hecho de aparecer en el
    // `data` echaria a la persona cada vez que un administrador le corrige el telefono. Hace falta
    // el rol ACTUAL para saberlo, y se lee DENTRO de la misma transaccion, nunca antes de abrirla.
    //
    // La lectura no necesita su propio `FOR UPDATE`: toda edicion de un usuario de esta empresa
    // -esta y `applyGuardedChange`- pasa primero por `lockActiveAdministratorIds`, que serializa
    // las transacciones de la empresa detras del mismo conjunto de filas. El hueco declarado, para
    // que nadie lo descubra de sorpresa: si la empresa no tiene NINGUN administrador en `active`,
    // ese conjunto esta vacio, no bloquea nada y dos ediciones simultaneas del mismo usuario
    // podrian leer el mismo rol previo. El peor efecto posible es no subir el sello en una de las
    // dos, que es exactamente el estado en el que ya se queda una edicion que no cambia el rol.
    //
    // Si la fila no existe, esta borrada o es de otra empresa, `current` es `null`: no hay cambio
    // de rol que sellar y el `updateMany` de abajo responde `'not_found'` por su propio `where`.
    const current = await tx.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { roleId: true },
    });
    const roleStamp = sessionStampFor(
      { kind: 'role', changed: current !== null && current.roleId !== data.roleId },
      now,
    );

    // 4. La escritura, en la MISMA transaccion que el bloqueo.
    try {
      const { count } = await tx.user.updateMany({
        where: { id, companyId, deletedAt: null },
        data: {
          ...roleStamp,
          firstNames: data.firstNames,
          lastNames: data.lastNames,
          birthDate: data.birthDate,
          email: data.email,
          phone: data.phone,
          documentTypeCode: data.documentTypeCode,
          documentNumber: data.documentNumber,
          username: data.username,
          roleId: data.roleId,
          updatedAt: now,
        },
      });
      return count === 1 ? 'ok' : 'not_found';
    } catch (error) {
      // El duplicado y la clave ajena son resultados de NEGOCIO (R17, R18) y se devuelven como tales.
      // El `UPDATE` fallido aborta la transaccion, asi que esto no confirma ninguna escritura: se
      // verifico contra la base real que la fila queda intacta. Lo que no sea uno de los dos casos
      // traducidos se RELANZA (R41).
      const outcome = writeFailureOutcome(error);
      if (outcome !== null) return outcome;
      throw error;
    }
  });
}

/**
 * `applyGuardedChange` del puerto: las DOS operaciones guardadas que no son el rol —mover el estado de
 * cuenta y borrar— dentro de **una sola transaccion con el mismo bloqueo** (R22, R23, R25, R37,
 * `design.md > 9.2`, `> 9.3`). El dominio nunca ve una transaccion: pide el cambio y traduce el
 * resultado.
 *
 * Que saca al objetivo del conjunto de administradores activos:
 *
 *   - **borrado**: siempre. `deleted_at` deja de ser nulo, y el conjunto solo cuenta filas vivas.
 *   - **estado**: cuando el destino no es `active`. Los CUATRO valores valen como destino, `blocked`
 *     incluido (R26); mover a `active` solo puede AMPLIAR el conjunto.
 *
 * **El borrado es un `UPDATE` de `deleted_at`** (R37), jamas un `DELETE`: la fila se conserva entera y,
 * como los tres indices unicos de QC-47 son parciales sobre las vivas, el correo, el nombre de usuario
 * y el documento quedan LIBRES dentro de la empresa (R38).
 *
 * **Al mover el estado se escriben las TRES cosas** (R25): el valor, el instante y el **actor** como
 * autor. Aqui el autor nunca es nulo —el `NULL` de QC-65 R10 es solo el del nacimiento de la cuenta
 * (R49)—.
 *
 * **Los tres contadores de acceso de QC-19 se escriben aqui SOLO cuando el destino no es
 * `blocked`** (QC-95, enmienda R45 de QC-66): al salir de `blocked`, la misma escritura
 * que mueve el estado limpia los tres a la vez (cero, cero, null, via `clearedLockState`).
 * Cuando el destino es `blocked`, `lockState` llega `null` y las tres columnas
 * no aparecen en el `data` (R2).
 */
export async function applyGuardedChange(input: GuardedChange): Promise<GuardedOutcome> {
  return prisma.$transaction(async (tx) => {
    // 1. El bloqueo, el mismo unico sitio que usa `updateAliveInCompany`. El nombre del rol llega en
    // el argumento, resuelto por el caso de uso desde `ROLE_ADMINISTRADOR` (R24).
    const activeAdministratorIds = await lockActiveAdministratorIds(
      tx,
      input.companyId,
      input.adminRoleName,
    );

    // 2 y 3. El conjunto que quedaria tras la escritura pedida.
    const leavesTheSet =
      input.kind === 'delete' || input.accountStatus !== ACTIVE_ACCOUNT_STATUS;
    if (wouldLeaveNoAdministrator(activeAdministratorIds, input.id, leavesTheSet)) {
      return 'last_administrator';
    }

    // 3 bis. QC-23 T14 (R33, R34, R36, R38): el sello, decidido por la funcion pura del dominio.
    // El borrado corta siempre; el estado corta en `blocked` e `inactive` y NO en `pending` ni en
    // `active`. Va esparcido en el `data` de abajo, en el MISMO `UPDATE` y la MISMA transaccion:
    // si esta aborta -por `last_administrator` o por lo que sea-, el sello tampoco subio.
    const sessionStamp = sessionStampFor(
      input.kind === 'delete'
        ? { kind: 'delete' }
        : { kind: 'account_status', next: input.accountStatus },
      input.now,
    );

    // 4. La escritura, en la MISMA transaccion. `updateMany` con el ambito completo en el `where`
    // (R33, R34): un objetivo inexistente, borrado o de otra empresa da `count === 0`.
    const { count } = await tx.user.updateMany({
      where: { id: input.id, companyId: input.companyId, deletedAt: null },
      data:
        input.kind === 'delete'
          ? { ...sessionStamp, deletedAt: input.now, updatedAt: input.now }
          : {
              ...sessionStamp,
              accountStatus: input.accountStatus,
              accountStatusChangedAt: input.now,
              accountStatusChangedBy: input.changedBy,
              updatedAt: input.now,
              // QC-95 R1, R3: los tres contadores, solo cuando el destino no es `blocked`.
              ...(input.lockState === null ? {} : {
                failedLoginAttempts: input.lockState.failedAttempts,
                lockLevel: input.lockState.lockLevel,
                lockedUntil: input.lockState.lockedUntil,
              }),
            },
    });
    return count === 1 ? 'ok' : 'not_found';
  });
}
