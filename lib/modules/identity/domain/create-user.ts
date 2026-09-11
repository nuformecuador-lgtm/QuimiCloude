// lib/modules/identity/domain/create-user.ts
import type { UserAccountStatus } from './account-status';
import { requirePermission, type Actor } from './actor';
// La UNICA conversion de la fecha civil `YYYY-MM-DD` al `Date` que pide el puerto, anclada en UTC.
// `update-user.ts` importa la MISMA, del mismo archivo: dos copias es como el alta y la edicion
// acaban guardando dias distintos para el mismo texto.
import { toBirthDate } from './birth-date';
import {
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  RoleNotFoundError,
  ValidationError,
} from './errors';
import { createUserSchema } from './user-input';

import type { InitialCredentialFactory } from '../ports/initial-credential-factory';
import type { DuplicateKey, UserAdminRepository } from '../ports/user-admin-repository';

export type CreateUserDeps = {
  readonly users: UserAdminRepository;
  /**
   * La credencial inicial, como PUERTO que devuelve solo el hash (R15, R16). El dominio no genera
   * nada al azar -no puede importar `node:crypto`- y, mas importante, **nunca tiene la credencial en
   * claro a mano**: no hay nada que filtrar por una traza de depuracion, por un mensaje de error «con
   * contexto» o por un `return` descuidado (`design.md > 4.1`, `> 12.3`).
   */
  readonly credentials: InitialCredentialFactory;
  /**
   * El puerto recibe un `now: Date` (`design.md > 7`) y ese instante no es una entrada del actor ni
   * algo que el borde valide: se resuelve como dependencia INYECTABLE, con `() => new Date()` por
   * defecto, para que el test pueda fijarlo sin tocar el reloj global. Aqui NO se lee `next/headers`
   * ni ninguna sesion: eso violaria R5 y R42.
   */
  readonly now?: () => Date;
};

/**
 * Estado con el que NACE la cuenta (R13). El `satisfies` es un ancla de compilacion: si QC-65
 * retirase `pending` del conjunto cerrado, esta linea **deja de compilar** en vez de escribir un
 * estado que la base ya no acepta.
 *
 * Se escribe el literal -y no `INITIAL_USER_ACCOUNT_STATUS`- porque esa constante de QC-65 esta
 * tipada como la UNION completa (`UserAccountStatus`), y el puerto exige el literal `'pending'` a
 * proposito, para que crear una cuenta que ya pueda entrar no sea expresable. Estrechar la constante
 * seria tocar un archivo de QC-65, que no es de esta task.
 */
const ACCOUNT_STATUS_AT_BIRTH = 'pending' satisfies UserAccountStatus;

/** Traduce la clave duplicada del puerto al error de dominio del campo que choco (R17). */
export function throwDuplicate(key: DuplicateKey): never {
  if (key === 'email') throw new DuplicateEmailError();
  if (key === 'username') throw new DuplicateUsernameError();
  throw new DuplicateDocumentError();
}

/**
 * Alta de usuario (R13, R14, R15, R16, R17, R18, R49).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de `zod` y antes de
 * tocar ningun puerto (R1, R2): si validara primero, un actor sin permiso con una entrada rota
 * recibiria `ValidationError` y sabria algo del sistema sin tener derecho a preguntarlo. El test de
 * autorizacion lo demuestra con dobles que **fallan si los llaman**.
 *
 * **La empresa sale del ACTOR y de ningun otro sitio** (R14): `createUserSchema` no admite
 * `companyId` -`strictObject` lo rechaza- y aqui se pasa `actor.companyId` como argumento propio del
 * puerto. No hay ninguna forma de crear un usuario en otra empresa.
 *
 * **El alta NO pasa ningun autor del cambio de estado** (R49, decision cerrada 18): la fila nace con
 * `account_status_changed_by` sin escribir -el `NULL` de QC-65 R10, «lo cambio el sistema, no una
 * persona»-. El puerto **no tiene** ese parametro justamente para que nadie lo rellene con el actor
 * por reflejo. El autor solo se escribe al MOVER el estado (R25, `set-user-account-status.ts`).
 *
 * **Devuelve solo el identificador** (R13). La credencial generada no sale por NINGUNA via (R16): no
 * en el resultado, no en ningun mensaje de error, no en ninguna traza; en este archivo no hay -y no
 * puede haber- ninguna escritura a la consola.
 */
export function createCreateUser(
  deps: CreateUserDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createUser(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // El hash se pide DESPUES de validar: no tiene sentido gastar un bcrypt por una entrada rota.
    const credentialHash = await deps.credentials.createCredentialHash();

    const result = await deps.users.create(
      actor.companyId,
      { ...parsed.data, birthDate: toBirthDate(parsed.data.birthDate) },
      credentialHash,
      ACCOUNT_STATUS_AT_BIRTH,
      now(),
    );

    // R17: el duplicado llega como resultado DISCRIMINADO -lo tradujo el adaptador desde el 23505 de
    // uno de los tres indices unicos de QC-47-, nunca como excepcion de Prisma, y nunca de una
    // consulta previa de existencia, que seria una carrera.
    if (typeof result === 'string') {
      if (result === 'role_not_found') throw new RoleNotFoundError();
      throwDuplicate(result);
    }

    return result;
  };
}
