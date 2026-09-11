// lib/modules/identity/domain/add-work-group-member.ts
import type { UserAccountStatus } from './account-status';
import { requirePermission, type Actor } from './actor';
// La MISMA funcion que decide quien sale en la lista de miembros (`list-work-group-members.ts`,
// R19) decide aqui POR QUE una persona que ya pertenece no se ve (R31). Es la unica traduccion de
// «lo que la columna dice» a «lo que significa ahora» (QC-78 R7): con dos, el mensaje del error y
// el contenido de la lista podrian divergir y nadie se enteraria.
import { effectiveAccountStatus } from './effective-account-status';
import {
  type IdentityError,
  UserNotFoundError,
  ValidationError,
  WorkGroupMemberExistsBlockedError,
  WorkGroupMemberExistsError,
  WorkGroupMemberExistsInactiveError,
  WorkGroupMemberExistsPendingError,
  WorkGroupNotFoundError,
} from './errors';
import { workGroupMemberSchema } from './work-group-input';

import type { MemberBlockReason, WorkGroupRepository } from '../ports/work-group-repository';

export type AddWorkGroupMemberDeps = {
  readonly workGroups: WorkGroupRepository;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * El motivo de ocultacion, si lo hay (R31). **Devuelve el estado efectivo cuando ese estado ES un
 * motivo, y `null` cuando no lo es**; no compara con ningun estado «bueno» a mano, que es
 * exactamente lo que QC-78 R7 pone en una sola funcion y lo que el test de alcance (T17) vigila.
 *
 * **Se EXPORTA porque `list-work-group-members.ts` la usa para decidir quien SALE en la lista**
 * (R19): una persona se ve cuando su estado efectivo no es motivo de ocultacion. Asi el «por que no
 * se ve» de R31 y el «quien se ve» de R19 salen literalmente de la MISMA expresion y no pueden
 * divergir —que es lo que `design.md > 5.1` pide—. Vive en este archivo, y no en uno nuevo, porque
 * es aqui donde nace el `MemberBlockReason` que el error necesita; mismo reparto que
 * `throwDuplicate`, exportada por `create-user.ts` y consumida por `update-user.ts`.
 *
 * El `switch` es EXHAUSTIVO sobre `UserAccountStatus`, y eso es el requisito, no el estilo: los
 * CUATRO estados se enumeran uno a uno y el caso inalcanzable se cierra asignando a `never`. Si
 * manana el catalogo de estados creciera, esta funcion **no compila** —el estado nuevo no seria
 * asignable a `never`— en vez de clasificarlo **en silencio** como «se ve», que es la forma de
 * fallo que importa aqui: un estado nuevo que nadie clasifico apareceria en la lista de miembros
 * (R19) y ademas elegiria el `code` equivocado al meter a quien ya pertenece (R31).
 *
 * **Antes esto era un `default: return null`, y era una promesa incumplida**: el comentario decia
 * «no compilaria» y el codigo hacia exactamente lo contrario. El comportamiento de HOY no cambia
 * —`'active'` sigue devolviendo `null`, que es lo que R19 pide—; lo que cambia es que ahora la
 * garantia es verdadera. Hallazgo menor del reviewer de QC-84, arreglado cumpliendo la promesa en
 * vez de rebajandola.
 */
export function blockReasonOf(status: UserAccountStatus): MemberBlockReason | null {
  switch (status) {
    case 'pending':
    case 'inactive':
    case 'blocked':
      return status;
    case 'active':
      // La unica cuenta que SE VE (R19). No es un «resto»: esta enumerada a proposito.
      return null;
    default: {
      const noClasificado: never = status;
      return noClasificado;
    }
  }
}

/**
 * Un motivo, un `code` (R31). **Tres y no uno** (`design.md > 7.2`): el `diagnostic` de QC-70 va al
 * registro del servidor y SOLO ahi, y el catalogo no interpola, asi que el motivo no puede viajar
 * como dato ni como texto de un codigo compartido. Ninguno de los tres es el de R30.
 */
const HIDDEN_MEMBER_ERROR = {
  pending: (): IdentityError => new WorkGroupMemberExistsPendingError(),
  inactive: (): IdentityError => new WorkGroupMemberExistsInactiveError(),
  blocked: (): IdentityError => new WorkGroupMemberExistsBlockedError(),
} satisfies Record<MemberBlockReason, () => IdentityError>;

/**
 * QC-84 T6 — Meter a **una** persona en un grupo de trabajo (R28–R33).
 *
 * `requirePermission(actor, 'usuarios.modificar')` PRIMERO, antes de `zod` y antes del puerto (R1,
 * R2, R3).
 *
 * **De a una, y nunca el conjunto completo** (R33, decision 6): `workGroupMemberSchema` es un
 * `strictObject` de dos identificadores y no existe ningun esquema que acepte una lista de miembros,
 * asi que el «mandar el conjunto entero» —donde dos encargados a la vez se pisan en silencio y el
 * error no puede decir a QUIEN se refiere— es **inexpresable**, no solo desaconsejado.
 *
 * **La fila se crea sea cual sea el estado de cuenta de la persona** (R28): `pending`, `active`,
 * `inactive` o `blocked`. La pertenencia no depende del estado; el estado solo decide si la persona
 * se VE en la lista (R19). Este caso de uso no mira el estado para dejar entrar a nadie —solo para
 * elegir el mensaje cuando la fila YA existia—.
 *
 * **La garantia de no duplicar es la clave primaria** `(work_group_id, user_id)` (R32), dentro de la
 * transaccion del adaptador: la lectura de la persona sirve SOLO para elegir el mensaje. Si dos
 * intentos simultaneos corren, el segundo choca contra la PK y se traduce al MISMO error que habria
 * dado la lectura: el mensaje puede llegar por dos caminos, la fila de mas no puede existir por
 * ninguno.
 *
 * **`hiddenBy` lo calcula ESTE dominio** (`design.md > 5.1`), no el adaptador: el puerto devuelve el
 * estado crudo y el plazo, y aqui se llama a `effectiveAccountStatus(view, now)` con el MISMO `now`
 * que se le paso al puerto. Si el estado efectivo no es un motivo de ocultacion, la persona se ve y
 * el error es el de R30; si lo es, el error es el suyo (R31, tres `code` distintos).
 */
export function createAddWorkGroupMember(
  deps: AddWorkGroupMemberDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  const now = deps.now ?? ((): Date => new Date());

  return async function addWorkGroupMember(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = workGroupMemberSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { workGroupId, userId } = parsed.data;
    // UN solo instante para la escritura y para el filtro: con dos relojes, un bloqueo que vence
    // entre medias daria un mensaje que no corresponde a lo que la lista muestra.
    const instant = now();

    const outcome = await deps.workGroups.addMemberAliveInCompany(
      actor.companyId,
      workGroupId,
      userId,
      instant,
    );

    if (outcome.kind === 'created') return;
    // R8, R9: no existe, esta dado de baja o es de otra empresa son el MISMO caso.
    if (outcome.kind === 'group_not_found') throw new WorkGroupNotFoundError();
    // R29: la persona inexistente, borrada o de otra empresa reutiliza el error que QC-66 ya creo
    // con exactamente ese significado. Un octavo `code` que repitiera la frase lo prohibe QC-70 R4.
    if (outcome.kind === 'user_not_found') throw new UserNotFoundError();

    const reason = blockReasonOf(effectiveAccountStatus(outcome.account, instant));

    // R30: ya pertenece Y se ve en la lista. No comparte `code` con ninguno de los tres de R31.
    if (reason === null) throw new WorkGroupMemberExistsError();

    throw HIDDEN_MEMBER_ERROR[reason]();
  };
}
