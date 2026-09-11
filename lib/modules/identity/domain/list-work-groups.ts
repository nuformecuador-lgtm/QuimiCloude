// lib/modules/identity/domain/list-work-groups.ts
import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { WORK_GROUP_QUERYABLE } from './work-group-queryable';

import type { Page } from './page';
import type { WorkGroupRow } from './work-group-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { WorkGroupRepository } from '../ports/work-group-repository';

export type ListWorkGroupsDeps = {
  readonly workGroups: WorkGroupRepository;
  /** El log de los campos omitidos (QC-57 R6), igual que en `list-users.ts` y en los otros cinco. */
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (QC-57 R6). */
const LIST_NAME = 'work-groups';

/** El esquema no depende del actor ni de la consulta: se construye una vez. */
const listQuerySchema = createListQuerySchema();

/**
 * QC-84 T7 — Listado paginado de los grupos de trabajo de la empresa (R24–R27).
 *
 * Es el contrato de QC-57 **que `identity` ya tiene** desde QC-66: no se copia nada y por eso esta
 * ficha **no toca** `tests/guards/guard-contrato-listados.test.ts`. Los cinco pasos van en ESTE
 * orden y **el orden es el requisito**, exactamente como en `list-users.ts`:
 *
 *   1. `requirePermission(actor, 'usuarios.consultar')` PRIMERO, siempre (R1, R2). Antes de zod y
 *      antes de tocar el puerto: si validara primero, un actor no autorizado con una consulta rota
 *      recibiria `ValidationError` y sabria algo del sistema sin tener derecho a preguntarlo. Y
 *      `usuarios.modificar` **no** lo concede (R3).
 *   2. zod DENTRO del caso de uso (R14). Valida la FORMA; un campo no declarado no puede hacer
 *      fallar la consulta (QC-57 R5), asi que de eso no se ocupa el esquema.
 *   3. `sanitizeListQuery` contra `WORK_GROUP_QUERYABLE` (QC-57 R4, R5): lo que no esta declarado se
 *      poda —`deletedAt` ademas por su cuenta, con `NEVER_QUERYABLE` (R9, R40)—.
 *   4. el log de lo podado (QC-57 R6).
 *   5. el puerto, con la consulta **YA SANEADA**.
 *
 * El defecto de 10 y el tope de 25 (R24), el orden `name ASC, id ASC` con desempate estable (R25) y
 * la columna que toca la busqueda son del **adaptador driven**, el unico que puede importar
 * `lib/shared/pagination` y conocer la base. **Este listado SI pagina en SQL**, a diferencia del de
 * miembros (`design.md > 5.3`): su filtro —empresa y vivos— es expresable en el `WHERE` sin copiar
 * ninguna regla de dominio.
 *
 * Dos exclusiones que no estan aqui porque son del puerto, y por eso nadie puede olvidarlas: los
 * grupos dados de baja (R9) y los de otra empresa (R8).
 *
 * La firma nace ABIERTA a proposito (R27): declarar un campo consultable mas es una linea en
 * `WORK_GROUP_QUERYABLE` y **no cambia la forma de la consulta**, asi que la pantalla de QC-85 no
 * tiene que reabrirla. Es la leccion QC-38 → QC-39.
 */
export function createListWorkGroups(
  deps: ListWorkGroupsDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<Page<WorkGroupRow>> {
  return async function listWorkGroups(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<Page<WorkGroupRow>> {
    requirePermission(actor, 'usuarios.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, WORK_GROUP_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.workGroups.listAliveInCompany(actor.companyId, query);
  };
}
