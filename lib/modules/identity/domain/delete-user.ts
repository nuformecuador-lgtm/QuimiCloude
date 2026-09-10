// lib/modules/identity/domain/delete-user.ts
import { requirePermission, type Actor } from './actor';
import { LastAdministratorError, NotFoundError, SelfOperationError } from './errors';
import { ROLE_ADMINISTRADOR } from './roles';

import type { UserAdminRepository } from '../ports/user-admin-repository';

export type DeleteUserDeps = {
  readonly users: UserAdminRepository;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Borrado de usuario (R21, R22, R33, R34, R37, R39).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de tocar el puerto
 * (R1, R2). Este caso de uso no tiene entrada que validar: solo un identificador.
 *
 * **Borrado LOGICO y sin recuperacion** (R37, R39, decision cerrada 3): el puerto marca `deleted_at`
 * y conserva la fila entera, jamas un `DELETE`. No existe ninguna operacion de recuperar ni ningun
 * listado de borrados -lo que no se puede expresar no se puede hacer por descuido-, y si la persona
 * vuelve se crea de nuevo: su correo, su nombre de usuario y su documento quedaron LIBRES dentro de
 * la empresa porque los tres indices unicos de QC-47 solo miran filas vivas (R38).
 *
 * **R24: el nombre del rol administrador se IMPORTA** de `./roles` y viaja al puerto como argumento.
 * No nace ninguna constante nueva y el literal no se escribe en ningun archivo de esta feature; lo
 * unico que se compara contra el es el rol del usuario OBJETIVO, y eso pasa dentro de la transaccion
 * del adaptador. El rol del ACTOR no participa (R4).
 */
export function createDeleteUser(
  deps: DeleteUserDeps,
): (actor: Actor | null | undefined, id: string) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteUser(actor: Actor | null | undefined, id: string): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    // R21, primera guarda del administrador (decision cerrada 9a): nadie se borra a si mismo, y no se
    // modifica ninguna fila. Va ANTES del puerto. `SelfOperationError` es DISTINTO de `not_found` a
    // proposito: la pantalla de QC-67 tiene que poder decir «no puedes borrarte» sin mentir, y aqui
    // no hay ningun oraculo que proteger -el actor no descubre nada que no sepa ya de su propia fila-.
    if (id === actor.id) throw new SelfOperationError();

    // R22: la invariante «la empresa conserva >= 1 usuario vivo con rol administrador en `active`» la
    // hace cumplir `applyGuardedChange` DENTRO de su transaccion con bloqueo de fila (`design.md >
    // 9.2`). Aqui se PIDE el cambio y se TRADUCE el resultado: el service decide, la atomicidad es
    // del adaptador.
    const outcome = await deps.users.applyGuardedChange({
      kind: 'delete',
      companyId: actor.companyId,
      id,
      adminRoleName: ROLE_ADMINISTRADOR,
      now: now(),
    });

    if (outcome === 'ok') return;
    // R33, R34: no existe, esta borrado ya, o es de otra empresa son el MISMO caso.
    if (outcome === 'not_found') throw new NotFoundError();
    throw new LastAdministratorError();
  };
}
