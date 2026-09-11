// lib/modules/identity/domain/get-user.ts
import { requirePermission, type Actor } from './actor';
import { UserNotFoundError } from './errors';

import type { UserDetail } from './user-view';

import type { UserAdminRepository } from '../ports/user-admin-repository';

export type GetUserDeps = {
  readonly users: UserAdminRepository;
};

/**
 * Ficha individual de un usuario por identificador (R32, R33, R34, R35).
 *
 * Consultar TAMBIEN exige un permiso -`usuarios.consultar`- y es la PRIMERA linea, antes de tocar el
 * puerto (R1): la ficha de una persona no es menos sensible que el alta. Y **`usuarios.modificar` NO
 * la abre** (R3): no hay implicacion entre permisos, lo garantiza `assertPermission`.
 *
 * **El rol del actor no se lee, no se recibe y no se compara** (R4): lo unico que autoriza es el
 * permiso.
 *
 * Los cuatro «no» responden lo MISMO, `not_found`, y eso es el requisito (R33, R34, R35): no existe,
 * esta borrado logicamente, es de otra empresa, o es el propio actor. Distinguirlos convertiria esta
 * ficha en un **oraculo de existencia** sobre datos ajenos -un actor de la empresa A sondeando
 * identificadores de la empresa B sabria cuales son reales-.
 *
 * De esos cuatro, tres los filtra el PUERTO (`findAliveInCompany`: `deleted_at IS NULL` y
 * `company_id = ?`) y el cuarto se comprueba aqui, porque el puerto no conoce al actor. Esta feature
 * **no anade ninguna consulta de «mis datos»** (R35, decision cerrada 12): el dia que alguien la pida
 * sera una consulta propia, no un hueco en esta.
 */
export function createGetUser(
  deps: GetUserDeps,
): (actor: Actor | null | undefined, id: string) => Promise<UserDetail> {
  return async function getUser(
    actor: Actor | null | undefined,
    id: string,
  ): Promise<UserDetail> {
    requirePermission(actor, 'usuarios.consultar');

    // R35: el actor no se ve a si mismo ni pidiendo su propio identificador. Va ANTES del puerto: no
    // se consulta lo que no se va a devolver.
    if (id === actor.id) throw new UserNotFoundError();

    const user = await deps.users.findAliveInCompany(actor.companyId, id);
    if (user === null) throw new UserNotFoundError();
    return user;
  };
}
