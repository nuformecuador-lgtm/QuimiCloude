// lib/modules/identity/domain/create-user.ts
import type { UserAccountStatus } from './account-status';
import { requirePermission, type Actor } from './actor';
// La UNICA conversion de la fecha civil `YYYY-MM-DD` al `Date` que pide el puerto, anclada en UTC.
// `update-user.ts` importa la MISMA, del mismo archivo: dos copias es como el alta y la edicion
// acaban guardando dias distintos para el mismo texto.
import { toBirthDate } from './birth-date';
import { CredentialPolicyRejectedError } from './credential-rejected';
import { credentialSetupLinkExpiresAt } from './credential-setup-link';
import {
  ActionNotAllowedError,
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  RoleNotFoundError,
  ValidationError,
} from './errors';
import { createUserSchema } from './user-input';

import type { CredentialPolicyResult } from './credential-policy';

import type { CredentialSetupLinkRepository } from '../ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '../ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '../ports/credential-setup-secret-factory';
import type { PasswordHasher } from '../ports/password-hasher';
import type { DuplicateKey, UserAdminRepository } from '../ports/user-admin-repository';

export type CreateUserDeps = {
  readonly users: UserAdminRepository;
  /**
   * QC-79 R2: la politica COMPLETA de QC-19 -las seis reglas propias mas la lista de filtradas-,
   * inyectada como funcion igual que hace `seed-initial-access.ts`. Como funcion y no como puerto
   * porque la mitad de ella (`evaluateCredentialRules`) es dominio puro y solo la lista de
   * filtradas necesita un adaptador: quien las ata es `lib/composition`, que ya tiene una sola
   * `checkCredentialPolicy` cableada y no crea una segunda.
   */
  readonly checkCredentialPolicy: (candidate: string) => Promise<CredentialPolicyResult>;
  /** QC-5: la contrasena que escribio el administrador se persiste SOLO como su hash (R2, R5). */
  readonly passwordHasher: PasswordHasher;
  /** QC-79 R9, R10: el secreto del enlace y su huella. Sin parametros: no deriva de nada. */
  readonly secrets: CredentialSetupSecretFactory;
  /** QC-79 R7, R11: emitir el enlace. El dominio nunca ve una transaccion. */
  readonly links: CredentialSetupLinkRepository;
  /** QC-79 R7, R30: **devuelve un valor y no lanza**. Un fallo de correo no tumba el alta. */
  readonly mailer: CredentialSetupMailer;
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
 *
 * **QC-79 R3 lo deja igual de cierto en las dos ramas**: escribir la contrasena en el alta **no
 * activa** la cuenta. Con contrasena o sin ella, la cuenta nace en `pending`.
 */
const ACCOUNT_STATUS_AT_BIRTH = 'pending' satisfies UserAccountStatus;

/**
 * Como acabo el correo del alta (`design.md > 5.3`, R30).
 *
 * `'not_needed'` es la rama en la que el administrador escribio la contrasena: no hubo enlace y no
 * habia nada que enviar (R3). `'sent'` y `'failed'` son la rama del enlace, y **distinguirlas es el
 * requisito**: con `'failed'` el usuario queda creado igual, en `pending`, y la pantalla de QC-67
 * puede ofrecer el reenvio de R14.
 */
export type CreateUserMailOutcome = 'sent' | 'failed' | 'not_needed';

/** Lo que devuelve el alta. **No hay ningun campo de texto libre**, y eso es R5 escrito en el tipo:
 *  no existe hueco donde colar la contrasena ni el secreto del enlace sin romper el typecheck
 *  (`design.md > 4.7` punto 2). */
export type CreateUserResult = {
  readonly id: string;
  readonly mail: CreateUserMailOutcome;
};

/** Traduce la clave duplicada del puerto al error de dominio del campo que choco (R17). */
export function throwDuplicate(key: DuplicateKey): never {
  if (key === 'email') throw new DuplicateEmailError();
  if (key === 'username') throw new DuplicateUsernameError();
  throw new DuplicateDocumentError();
}

/**
 * **QC-79 R1, en UN solo sitio**: «la ausencia del campo y la cadena vacia DEBEN tratarse IGUAL».
 *
 * Un `<input>` vacio llega por `FormData` como `''`, no como ausente, y `createUserSchema` tiene
 * `min(1)`, asi que sin esto una contrasena vacia caeria como `invalid_input` en vez de significar
 * «el administrador no la escribio». Se normaliza **antes** del esquema y **aqui**, no en la Server
 * Action: si viviera en el borde, cada borde nuevo -la action, un seed, un test de integracion-
 * tendria que acordarse, que es exactamente como nacen dos comportamientos para la misma entrada.
 *
 * Solo toca esa clave y solo cuando vale exactamente `''`: todo lo demas se pasa tal cual, asi que
 * `strictObject` sigue rechazando cualquier clave desconocida (R1) y ninguna otra validacion se
 * relaja.
 */
function withEmptyCredentialAsAbsent(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  if (record.credential !== '') return input;
  const rest = { ...record };
  delete rest.credential;
  return rest;
}

/**
 * Alta de usuario (R13, R14, R16, R17, R18, R49 de QC-66; R1-R7 y R30 de QC-79).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de `zod` y antes de
 * tocar ningun puerto (QC-66 R1/R2, QC-79 R6): si validara primero, un actor sin permiso con una
 * entrada rota recibiria `ValidationError` y sabria algo del sistema sin tener derecho a
 * preguntarlo. Y **sin permiso no suena NINGUN puerto**: ni el repositorio, ni la fabrica del
 * secreto, ni el repositorio del enlace, ni el correo. El test de autorizacion lo demuestra con
 * dobles que **fallan si los llaman**.
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
 * ## Las DOS ramas de QC-79
 *
 * **Con contrasena** (R2, R3): se evalua contra la politica completa de QC-19 **ANTES de escribir
 * nada**; si la rechaza, se lanza con las reglas incumplidas y **no se crea ninguna fila, no se
 * emite ningun enlace y no se envia ningun correo**. Si la acepta, se persiste **solo** como hash de
 * QC-5. **NO se emite enlace y NO se manda correo**: `mail` es `'not_needed'`.
 *
 * **Sin contrasena** (R4, R7, R30): **no se genera ninguna al azar** —esto **ENMIENDA QC-66 R15**,
 * con esas palabras y no disimulado—. La fila nace con `{ kind: 'none' }`, y despues se emite el
 * enlace y se intenta enviarlo. Un fallo de correo **no deshace la creacion** y **no devuelve un
 * fallo del alta**: el usuario queda creado, en `pending`, con su enlace vivo, y `mail` es
 * `'failed'` para que QC-67 ofrezca el reenvio de R14.
 *
 * **`InitialCredentialFactory` ya no interviene en el alta**, por la misma razon: no hay nada que
 * generar al azar. El puerto y su adaptador siguen existiendo porque son de QC-6 / el seed.
 *
 * **El secreto del enlace NO sale de este caso de uso** (R13, `design.md > 4.7`): no se devuelve, no
 * entra en ningun error y no se escribe en ninguna traza. Va de la fabrica al puerto de correo y a
 * nada mas. Y la contrasena tampoco sale por ninguna via (R5): en este archivo no hay -y no puede
 * haber- ninguna escritura a la consola.
 */
export function createCreateUser(
  deps: CreateUserDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<CreateUserResult> {
  const now = deps.now ?? (() => new Date());

  return async function createUser(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<CreateUserResult> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = createUserSchema.safeParse(withEmptyCredentialAsAbsent(input));
    if (!parsed.success) throw new ValidationError();

    const { credential, ...data } = parsed.data;
    const instante = now();
    const datosDelPuerto = { ...data, birthDate: toBirthDate(data.birthDate) };

    if (credential !== undefined) {
      // R2: la politica ANTES de escribir nada. Ni fila, ni enlace, ni correo si la rechaza.
      const politica = await deps.checkCredentialPolicy(credential);
      if (!politica.ok) throw new CredentialPolicyRejectedError(politica.unmet);

      const value = await deps.passwordHasher.hash(credential);
      const creado = await deps.users.create(
        actor.companyId,
        datosDelPuerto,
        { kind: 'hash', value },
        ACCOUNT_STATUS_AT_BIRTH,
        instante,
      );
      // R3: no se emite enlace y no se manda correo. La cuenta nace igualmente en `pending`.
      return { id: resolveCreated(creado), mail: 'not_needed' };
    }

    // R4: sin contrasena NO se genera ninguna al azar. La fila nace sin credencial utilizable.
    const creado = await deps.users.create(
      actor.companyId,
      datosDelPuerto,
      { kind: 'none' },
      ACCOUNT_STATUS_AT_BIRTH,
      instante,
    );
    const id = resolveCreated(creado);

    // R7: el enlace se emite DESPUES de que la fila exista. `design.md > 10.2` acepta por escrito
    // la ventana entre las dos escrituras: su remedio ya esta especificado y es el reenvio de R14.
    const { secret, digest } = deps.secrets.create();
    const emision = await deps.links.issueForPendingUser({
      userId: id,
      // `null` a proposito (`design.md > 6.2`): se acaba de crear la fila con la empresa del actor
      // y no hay nada que reacotar. Quien pasa empresa SIEMPRE es el reenvio de R14/R15.
      companyId: null,
      digest,
      expiresAt: credentialSetupLinkExpiresAt(instante),
      now: instante,
    });

    if (typeof emision === 'object') {
      // El destinatario lo resuelve el repositorio y no el llamante: enviar a una direccion que
      // viniera por parametro seria un vector para usar el ERP como reenviador.
      return { id, mail: await deps.mailer.sendCredentialSetupLink({ to: emision.email, secret }) };
    }

    // `'superseded'`: otra emision simultanea gano y **ella** envio el correo (`design.md > 4.5`).
    // La perdedora no reintenta y no manda un segundo correo; responder `'sent'` es la verdad
    // observable, no una excusa. Para una carrera cuyo resultado es el correcto no se inventa un
    // error nuevo.
    if (emision === 'superseded') return { id, mail: 'sent' };

    // `'not_found'` / `'user_not_pending'` / `'issued'` sin destinatario no deberian ocurrir justo
    // despues de crear la fila en `pending`. Si ocurren, R30 manda: el usuario **queda creado** y
    // el alta NO falla; se dice que el correo no salio y QC-67 ofrece el reenvio de R14.
    return { id, mail: 'failed' };
  };
}

/**
 * R17: el duplicado llega como resultado DISCRIMINADO -lo tradujo el adaptador desde el 23505 de uno
 * de los tres indices unicos de QC-47-, nunca como excepcion de Prisma, y nunca de una consulta
 * previa de existencia, que seria una carrera. Se extrae a una funcion porque ahora hay DOS
 * llamadas a `create` -una por rama- y dos copias del `if` serian dos sitios donde olvidarlo.
 */
function resolveCreated(
  result: { id: string } | DuplicateKey | 'role_not_found' | 'action_not_allowed',
): string {
  if (typeof result === 'string') {
    if (result === 'role_not_found') throw new RoleNotFoundError();
    if (result === 'action_not_allowed') throw new ActionNotAllowedError();
    throwDuplicate(result);
  }
  return result.id;
}
