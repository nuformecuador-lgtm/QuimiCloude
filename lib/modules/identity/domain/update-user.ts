// lib/modules/identity/domain/update-user.ts
import { requirePermission, type Actor } from './actor';
// La MISMA conversion que usa el alta, desde su propio archivo: una sola implementacion.
import { toBirthDate } from './birth-date';
import { throwDuplicate } from './create-user';
import {
  LastAdministratorError,
  RoleNotFoundError,
  SelfOperationError,
  UserNotFoundError,
  ValidationError,
} from './errors';
import { updateUserSchema } from './user-input';

import type { UserAdminRepository } from '../ports/user-admin-repository';

export type UpdateUserDeps = {
  readonly users: UserAdminRepository;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de usuario (R19, R20, R21, R22, R33, R34).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de `zod` y antes de
 * tocar el puerto (R1, R2).
 *
 * **REEMPLAZO COMPLETO de los nueve campos editables, sin edicion parcial** (R19): el esquema es el
 * MISMO del alta, no un `partial()`, asi que no existe ninguna operacion por campo suelto. Y **no
 * cambia la empresa, el estado de cuenta, el hash de la credencial, la marca de cambio de credencial
 * ni ningun contador de acceso** (R20, R45): `updateUserSchema` los RECHAZA -`strictObject`- y
 * `NewUser` no los lleva, asi que una entrada que los traiga no escribe ninguno de ellos.
 *
 * **R22 vive en la transaccion del adaptador, no en un `if` de aqui**: el cambio de rol es una de las
 * tres operaciones guardadas (`design.md > 9.1`) y no se puede separar de los otros ocho campos
 * -R19 es reemplazo completo-, asi que viaja dentro de `updateAliveInCompany`, cuyo adaptador aplica
 * el mismo bloqueo de fila. Este caso de uso **pide** el cambio y **traduce** `'last_administrator'`;
 * el service decide, la atomicidad es del adaptador (`design.md > 9.3`).
 */
export function createUpdateUser(
  deps: UpdateUserDeps,
): (actor: Actor | null | undefined, id: string, input: unknown) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateUser(
    actor: Actor | null | undefined,
    id: string,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R21, primera guarda del administrador (decision cerrada 9a): no se cambia el PROPIO rol, y no
    // se modifica ninguna fila. Esta edicion es REEMPLAZO COMPLETO y el rol es uno de los nueve
    // campos (R19), asi que una edicion de la propia fila ES, inevitablemente, una escritura del
    // propio rol: no hay forma de pedir «los otros ocho» por separado.
    //
    // ***P3 SIGUE ABIERTA Y ESTA CLAUSULA NO LA CIERRA*** (`requirements.md > P3`): que el actor
    // pueda editar sus propios datos que NO son el rol no esta decidido, y aqui no se decide. Lo que
    // se rechaza es exactamente lo que R21 nombra -el cambio del propio rol-, y se rechaza aqui
    // porque la forma de la operacion no permite distinguirlo del resto del reemplazo.
    // SI el humano cierra P3 en «tampoco se edita a si mismo», es **una clausula mas en este mismo
    // sitio** y nada que reorganizar; si la cierra en «puede editarse todo menos el rol», lo que
    // cambia es esta linea -habria que comparar el rol pedido contra el actual- y el caso de test que
    // la acompana. Mientras siga abierta, el actor tampoco puede LLEGAR a su propia ficha, y eso es
    // consecuencia de R35 (`get-user.ts`), no una decision sobre P3.
    if (id === actor.id) throw new SelfOperationError();

    const result = await deps.users.updateAliveInCompany(
      actor.companyId,
      id,
      { ...parsed.data, birthDate: toBirthDate(parsed.data.birthDate) },
      now(),
    );

    if (result === 'ok') return;
    // R33, R34: no existe, esta borrado o es de otra empresa son el MISMO caso, y el filtro vive en el
    // puerto (`…AliveInCompany`), no en un `if` de aqui.
    if (result === 'not_found') throw new UserNotFoundError();
    // R22: el adaptador aborto DENTRO de su transaccion, asi que no se escribio nada.
    if (result === 'last_administrator') throw new LastAdministratorError();
    if (result === 'role_not_found') throw new RoleNotFoundError();
    throwDuplicate(result);
  };
}
