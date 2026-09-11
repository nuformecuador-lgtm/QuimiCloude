// lib/modules/identity/domain/list-work-group-members.ts
import { requirePermission, type Actor } from './actor';
// La MISMA expresion que elige el mensaje del duplicado oculto (R31) decide aqui quien SALE en la
// lista (R19): «se ve» es «su estado efectivo no es motivo de ocultacion». Con dos definiciones, el
// error podria decir «no se ve porque esta bloqueada» de alguien que la lista si muestra.
import { blockReasonOf } from './add-work-group-member';
import { buildDisplayName } from './display-name';
import { effectiveAccountStatus } from './effective-account-status';
import { ValidationError, WorkGroupNotFoundError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { WORK_GROUP_MEMBER_QUERYABLE } from './work-group-queryable';

import type { Page } from './page';
import type { WorkGroupMemberRow } from './work-group-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { MemberCandidate, WorkGroupRepository } from '../ports/work-group-repository';

/**
 * La paginacion, **inyectada** (`design.md > 5.3`). El 10 y el 25 viven en `lib/shared/pagination.ts`
 * y `domain/` **no puede importar `lib/shared/**`** (`docs/architecture.md > La regla de
 * dependencias`), asi que entran por `deps`, cableados en `lib/composition` sobre esa **misma**
 * implementacion —la que usa el resto de la aplicacion—.
 *
 * **Esto se aparta de QC-66 § 12.4**, que descarto inyectar la paginacion en el caso de uso, y el
 * motivo de apartarse es el que alli no existia: en el listado de usuarios el filtro y el corte
 * vivian los dos en SQL; aqui el filtro vive en el dominio (R19), asi que el corte tiene que vivir
 * **con el** o el total miente (R52). Ventaja anadida: el defecto y el tope quedan probados en
 * unitario (T19).
 *
 * La forma es estructural —no se importa ningun tipo de `lib/shared`—: quien la satisface es
 * `toOffsetLimit`/`buildPage` tal y como estan escritas hoy.
 */
export type PaginationPolicy = {
  /** Aplica el defecto de 10 y **acota** —no rechaza— el tope de 25 (R51). */
  toOffsetLimit(page: number, pageSize?: number): { readonly offset: number; readonly limit: number };
  /** El `pageSize` de la pagina es SIEMPRE el efectivo, el mismo que calculo `toOffsetLimit`. */
  buildPage<T>(items: readonly T[], total: number, page: number, pageSize: number): Page<T>;
};

export type ListWorkGroupMembersDeps = {
  readonly workGroups: WorkGroupRepository;
  readonly pagination: PaginationPolicy;
  /**
   * El log de los campos omitidos (QC-57 R6). Es **opcional aqui y obligatorio en
   * `list-work-groups.ts`** a proposito: las tres listas de `WORK_GROUP_MEMBER_QUERYABLE` estan
   * vacias (R22), asi que lo unico que se poda de esta consulta es un orden o una busqueda que
   * nadie declaro, y la firma que `design.md > 5.3` fija para esta factory es
   * `createListWorkGroupMembers({ workGroups, pagination })`. Cuando `lib/composition` lo cablea
   * —y lo cablea—, la omision se anota igual que en los otros seis listados.
   */
  readonly log?: ListQueryLog;
};

/** Nombre con el que esta consulta se identifica en el log de campos omitidos (QC-57 R6). */
const LIST_NAME = 'work-group-members';

/** El esquema no depende del actor ni de la consulta: se construye una vez. */
const listQuerySchema = createListQuerySchema();

/**
 * Quien SALE en la lista (R19, R20, R21). **La regla no se escribe aqui**: se pregunta a
 * `effectiveAccountStatus`, la unica funcion por la que pasan todos los lectores del estado de una
 * cuenta (QC-78 R7), que depende del **reloj** y del plazo de bloqueo y no solo de la columna.
 *
 * Es exactamente lo que hace verdaderos los dos precios que el humano escribio: la cuenta `pending`
 * recien creada no aparece y **vuelve sola** al activarse (R20), y la bloqueada desaparece y
 * **vuelve sola** al vencer el plazo (R21), las dos **sin ninguna escritura** —ni sobre la
 * pertenencia ni sobre la persona—. Con un `WHERE account_status = 'active'` a secas no se
 * cumpliria: una fila bloqueada por intentos fallidos puede seguir diciendo `active` en la columna
 * (QC-78 R11).
 */
function isVisible(candidate: MemberCandidate, now: Date): boolean {
  return blockReasonOf(effectiveAccountStatus(candidate, now)) === null;
}

/** Proyeccion a la fila de salida (R19): identificador y nombre mostrable, y **nada mas**. */
function toRow(candidate: MemberCandidate): WorkGroupMemberRow {
  return {
    id: candidate.id,
    // `buildDisplayName` ya existe y ya tiene tests: el nombre mostrable no se concatena a mano ni
    // aqui ni en el adaptador.
    displayName: buildDisplayName(candidate.firstNames, candidate.lastNames, candidate.username),
  };
}

/**
 * QC-84 T7 — Los miembros de un grupo de trabajo, filtrados por su estado EFECTIVO y paginados
 * **despues** de filtrar (R19–R23, R51–R54; `design.md > 5.2` y `> 5.3`).
 *
 * `requirePermission(actor, 'usuarios.consultar')` es la PRIMERA linea, antes de zod y antes de
 * tocar el puerto (R1, R2), y `usuarios.modificar` **no** lo concede (R3).
 *
 * **El `now` entra por PARAMETRO**, como en todo el modulo: aqui no hay `new Date()`. Es lo que
 * permite que el test de R21 «desbloquee» una cuenta **moviendo el reloj y sin escribir nada**; si
 * hiciera falta un `UPDATE`, el requisito estaria mal implementado.
 *
 * **El orden de los pasos es el requisito** (`design.md > 5.3`):
 *
 *   candidatos del puerto (SQL: vivos, de la empresa, ORDENADOS por apellidos, nombres e id)
 *     → filtro del estado efectivo, en el dominio y con `now`      ← R19, R20, R21
 *     → `total` = longitud del conjunto YA filtrado                ← R52
 *     → corte por (pagina, tamano EFECTIVO)                        ← R51, R53
 *     → `Page<WorkGroupMemberRow>`, la misma forma que el listado de grupos  ← R54
 *
 * **Cortar en memoria sobre una lista ordenada es estable por construccion** (R53): el orden y el
 * desempate por identificador son del SQL, y filtrar conserva el orden, asi que dos homonimas no
 * pueden intercambiarse entre paginas. Por eso el puerto no recibe pagina ni tamano: un `LIMIT`
 * antes del filtro daria paginas de tamano irregular y un total que promete personas que la pantalla
 * no muestra.
 *
 * **Esta consulta no escribe nada** (R23): el puerto solo expone lectura para este camino y aqui no
 * se llama a ningun metodo de escritura. El filtro de R19 es de lectura.
 *
 * El `workGroupId` viaja como argumento propio —no dentro del `query`— y el grupo inexistente, dado
 * de baja o de otra empresa responde `WorkGroupNotFoundError` (R8, R9): los tres, el mismo caso.
 */
export function createListWorkGroupMembers(
  deps: ListWorkGroupMembersDeps,
): (
  actor: Actor | null | undefined,
  workGroupId: string,
  input: unknown,
  now: Date,
) => Promise<Page<WorkGroupMemberRow>> {
  return async function listWorkGroupMembers(
    actor: Actor | null | undefined,
    workGroupId: string,
    input: unknown,
    now: Date,
  ): Promise<Page<WorkGroupMemberRow>> {
    requirePermission(actor, 'usuarios.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // Las tres listas blancas estan vacias (R22): lo que se poda aqui es un orden o una busqueda
    // que nadie declaro, y `sanitizeListQuery` los OMITE en vez de romper (QC-57 R5). De la consulta
    // compartida esta pantalla usa la pagina y el tamano, y los usa **en la misma forma** que el
    // listado de grupos (R54).
    const { query, ignored } = sanitizeListQuery(parsed.data, WORK_GROUP_MEMBER_QUERYABLE);
    deps.log?.ignoredFields(LIST_NAME, ignored);

    const candidates = await deps.workGroups.listMembersAliveInCompany(actor.companyId, workGroupId);
    if (candidates === 'not_found') throw new WorkGroupNotFoundError();

    const visible = candidates.filter((candidate) => isVisible(candidate, now));

    // El tamano EFECTIVO —defecto 10, tope acotado a 25— sale de la misma implementacion que usa el
    // resto de la aplicacion; pedir 100 devuelve 25, no un error (R51).
    const { offset, limit } = deps.pagination.toOffsetLimit(query.page, query.pageSize);

    return deps.pagination.buildPage(
      visible.slice(offset, offset + limit).map(toRow),
      // R52: el total cuenta EXACTAMENTE a las que pasan el filtro. Contar antes de filtrar
      // prometeria personas que ninguna pagina va a mostrar.
      visible.length,
      query.page,
      limit,
    );
  };
}
