// QC-79 T14 — REENVIAR EL ENLACE (`design.md > 4.5`, `> 5.3`, `> 5.4`; R14, R15, R16, R30).
//
// Dominio puro (R32): sin `next/*`, sin `react*`, sin `@prisma/client`, sin `lib/shared/**`, sin
// adaptadores y sin el barrel del propio modulo -que crearia un ciclo-. La fabrica del secreto, la
// persistencia del enlace y el envio entran por PUERTOS, y quien los ata es `lib/composition`.
//
// **Esta es la otra punta de la decision cerrada 7 y el UNICO reintento que existe** (R31): no hay
// cola, ni cron, ni reintento automatico. Si el correo del alta no salio -o si la persona lo
// perdio, o si el enlace caduco-, alguien con `usuarios.modificar` pulsa reenviar y aqui se emite
// uno nuevo. Esta ficha no construye ninguna maquinaria de trabajo en segundo plano.
import { requirePermission, type Actor } from './actor';
import { resendCredentialSetupLinkSchema } from './credential-setup-input';
import { credentialSetupLinkExpiresAt } from './credential-setup-link';
import { UserNotFoundError, UserNotPendingError, ValidationError } from './errors';

import type { CredentialSetupLinkRepository } from '../ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '../ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '../ports/credential-setup-secret-factory';

export type IssueCredentialSetupLinkDeps = {
  /** R9, R10: el secreto del enlace y su huella. Sin parametros: no deriva de nada. */
  readonly secrets: CredentialSetupSecretFactory;
  /** R11, R16: el anterior muere y el nuevo nace, en UNA transaccion. */
  readonly links: CredentialSetupLinkRepository;
  /** R30: **devuelve un valor y no lanza**. Un fallo de correo no es un fallo de la operacion. */
  readonly mailer: CredentialSetupMailer;
  /**
   * El instante entra como dependencia INYECTABLE, con `() => new Date()` por defecto. **Aqui no
   * es un detalle de comodidad: es R16.** El plazo de 7 dias se cuenta desde ESTE instante -el del
   * reenvio- y no desde la emision original, y el test lo fija para poder afirmarlo.
   */
  readonly now?: () => Date;
};

/**
 * Lo que devuelve el reenvio (`design.md > 5.3`).
 *
 * **No hay ningun campo de texto libre, y eso es R13 escrito en el tipo**: no existe hueco donde
 * colar el secreto del enlace sin romper el typecheck (`design.md > 4.7` punto 2). Tampoco sale el
 * correo del destinatario, que es PII y que ademas el llamante no necesita: ya lo ve en el listado.
 */
export type IssueCredentialSetupLinkResult = {
  /** `'sent'` o `'failed'`. Distinguirlos ES el requisito (R30): con `'failed'` QC-67 puede decir
   *  que el enlace esta vivo pero el correo no salio, y ofrecer reenviar otra vez. */
  readonly mail: 'sent' | 'failed';
};

/**
 * Reenvia a una persona el enlace con el que establecera su contrasena (R14, R15, R16).
 *
 * ## El permiso es la PRIMERA linea, y falla cerrado (R14)
 *
 * `requirePermission(actor, 'usuarios.modificar')` va antes de `zod` y antes de tocar ningun
 * puerto, con el actor **por parametro** -nunca leido aqui de una sesion-. Si validara primero, un
 * actor sin permiso con una entrada rota recibiria `invalid_input` y sabria algo del sistema sin
 * tener derecho a preguntarlo. Y sin permiso **no suena NINGUN puerto**: ni la fabrica del secreto,
 * ni el repositorio del enlace, ni el correo. El test lo demuestra con dobles que **fallan si los
 * llaman**, que es la unica forma de probar una NO llamada.
 *
 * ## El ambito sale del ACTOR (R15)
 *
 * Se pasa SIEMPRE `companyId: actor.companyId`, **a diferencia del alta**, que pasa `null` porque
 * acaba de crear la fila con la empresa del actor y no tiene nada que reacotar
 * (`design.md > 6.2`). Aqui el identificador del usuario llega del llamante, asi que el ambito es
 * lo unico que impide reenviar el enlace de alguien de otra empresa. El esquema de entrada **no
 * admite `companyId`** (`strictObject`), asi que no hay forma de elegirlo.
 *
 * ## Los dos rechazos, y por que uno se distingue y el otro no
 *
 *   - `'not_found'` -> `UserNotFoundError`. Cubre «no existe», «esta borrado» y «es de otra
 *     empresa», los tres con el mismo codigo (QC-66 R33, R34): responder distinto convertiria el
 *     reenvio en un oraculo de existencia entre empresas.
 *   - `'user_not_pending'` -> `UserNotPendingError`, que **SI se distingue**, a proposito
 *     (`design.md > 5.4`): quien reenvia trae `usuarios.modificar` y ya ve el estado de cuenta de
 *     esa persona en el listado de QC-66, asi que el codigo no le revela nada nuevo; a cambio
 *     permite a QC-67 decir «esta cuenta ya esta activa» en vez de mentir. Esto **no** contradice
 *     la respuesta unica de R22: alli no hay actor ni permiso, cualquiera con el enlace llama, y
 *     por eso alli «ya no esta en pending» se responde con `CredentialLinkInvalidError`.
 *
 * En los dos casos **no se escribe ninguna fila y no se envia ningun correo**: el repositorio
 * resuelve al usuario dentro de la misma transaccion en la que insertaria, asi que el rechazo llega
 * antes de que exista nada que deshacer.
 *
 * ## Un fallo de correo NO es un fallo de la operacion (R30)
 *
 * El enlace queda emitido y vivo aunque el proveedor este caido; lo que cambia es el `mail` del
 * resultado. El puerto devuelve un VALOR y no lanza precisamente para que esto sea estructural y no
 * dependa de que nadie olvide un `try/catch` (`design.md > 7.1`).
 */
export function createIssueCredentialSetupLink(
  deps: IssueCredentialSetupLinkDeps,
): (
  actor: Actor | null | undefined,
  input: unknown,
) => Promise<IssueCredentialSetupLinkResult> {
  const now = deps.now ?? ((): Date => new Date());

  return async function issueCredentialSetupLink(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<IssueCredentialSetupLinkResult> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = resendCredentialSetupLinkSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const instante = now();

    // El secreto se genera ANTES de saber si el usuario sirve, porque el puerto necesita su huella
    // para intentar el `INSERT` en la misma transaccion en la que resuelve al usuario -y una
    // consulta previa de existencia seria justo la carrera que R11 prohibe-. Si el usuario no
    // sirve, este secreto **no se persiste y no se envia**: muere aqui sin salir a ningun sitio.
    const { secret, digest } = deps.secrets.create();

    const emision = await deps.links.issueForPendingUser({
      userId: parsed.data.userId,
      // SIEMPRE la empresa del actor (R15). Ver arriba por que el alta pasa `null` y esto no.
      companyId: actor.companyId,
      digest,
      // R16: los 7 dias cuentan desde el instante del REENVIO, no desde la emision original. No
      // existe ninguna forma de prolongar un enlace ya emitido: extenderlo es emitir uno nuevo, y
      // eso es exactamente lo que hace esta linea (R8).
      expiresAt: credentialSetupLinkExpiresAt(instante),
      now: instante,
    });

    if (typeof emision === 'object') {
      // El destinatario lo resuelve el repositorio y no el llamante (`design.md > 6.2`): enviar a
      // una direccion que viniera por parametro seria un vector para usar el ERP como reenviador.
      return { mail: await deps.mailer.sendCredentialSetupLink({ to: emision.email, secret }) };
    }

    if (emision === 'not_found') throw new UserNotFoundError();
    if (emision === 'user_not_pending') throw new UserNotPendingError();

    if (emision === 'superseded') {
      // La carrera de `design.md > 4.5`: otra emision simultanea gano el indice unico parcial y
      // **ella** envio el correo. La perdedora **no reintenta y no manda un segundo correo** -su
      // secreto ni siquiera llego a persistirse-, y responde exito porque «hay un enlace vivo y se
      // envio» es la verdad observable. Para una carrera cuyo resultado es el que se queria no se
      // inventa un error nuevo.
      return { mail: 'sent' };
    }

    // `'issued'` sin destinatario: el enlace quedo emitido pero el repositorio no devolvio a quien
    // escribir, asi que no hay nada que enviar. No deberia ocurrir -el adaptador devuelve el correo
    // cuando la emision sale bien-, y si ocurre manda R30: la operacion **no falla**, se dice que el
    // correo no salio y QC-67 vuelve a ofrecer el reenvio. Mismo criterio, y misma rama, que el
    // alta de `create-user.ts`.
    return { mail: 'failed' };
  };
}
