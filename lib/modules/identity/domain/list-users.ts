// lib/modules/identity/domain/list-users.ts
import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { USER_QUERYABLE } from './user-queryable';

import type { Page } from './page';
import type { UserRow } from './user-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { UserAdminRepository } from '../ports/user-admin-repository';

export type ListUsersDeps = {
  readonly users: UserAdminRepository;
  /**
   * El log de los campos omitidos (QC-57 R6). **No aparece en `design.md > 7` ni en `> 11`, y hace
   * falta**: `sanitizeListQuery` devuelve `{ query, ignored }` y los CINCO modulos con listado, sin
   * excepcion, tienen su `ports/list-query-log.ts` y llaman a `ignoredFields` en su caso de uso de
   * listado. Es QC-57 R6, no una decision nueva de esta ficha: se cierra por precedente unanime y
   * queda anotado en la bitacora.
   */
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (QC-57 R6). */
const LIST_NAME = 'users';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Listado paginado de usuarios con el CONTRATO GENERICO de consulta de QC-57 (R27-R31, R36).
 *
 * Los cinco pasos van en ESTE orden y **el orden es el requisito**:
 *
 *   1. `requirePermission(actor, 'usuarios.consultar')` PRIMERO, siempre (R1, R2). Antes de zod y
 *      antes de tocar el puerto: si validara primero, un actor no autorizado con una consulta rota
 *      recibiria `ValidationError` y sabria algo del sistema sin tener derecho a preguntarlo. Y
 *      `usuarios.modificar` no lo concede (R3).
 *   2. zod DENTRO del caso de uso (R18). Valida la FORMA; un campo no declarado no puede hacer fallar
 *      la consulta (QC-57 R5), asi que de eso no se ocupa el esquema.
 *   3. `sanitizeListQuery` contra `USER_QUERYABLE` (QC-57 R4, R5): lo que no esta declarado se poda.
 *   4. el log de lo podado (QC-57 R6).
 *   5. el puerto, con la consulta **YA SANEADA**.
 *
 * El defecto de 10 y el tope de 25 (R27), el orden `last_names, first_names, id` con desempate
 * estable (R30), las columnas que toca la busqueda (R28) y el filtro por estado (R29) son del
 * **adaptador driven**, que es el unico que puede importar `lib/shared/pagination` y conocer la base.
 *
 * La firma es la del contrato compartido y nace ABIERTA a proposito (R36, decision cerrada 11):
 * declarar un campo consultable mas es una linea en `USER_QUERYABLE` y **no cambia la forma de la
 * consulta**, asi que la pantalla de QC-67 no tiene que reabrirla. Es la leccion de QC-38 -> QC-39.
 *
 * Dos exclusiones que no estan aqui porque son del puerto y por eso nadie puede olvidarlas: los
 * borrados logicos (R34) y los usuarios de otra empresa (R33). La tercera -el propio actor, R35-
 * viaja como argumento OBLIGATORIO `excludeUserId`.
 */
export function createListUsers(
  deps: ListUsersDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<UserRow>> {
  return async function listUsers(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<UserRow>> {
    requirePermission(actor, 'usuarios.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, USER_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.users.listAliveInCompany(actor.companyId, actor.id, query);
  };
}
