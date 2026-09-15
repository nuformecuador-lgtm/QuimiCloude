// QC-23 T13 — Cerrar todas las sesiones de una persona MENOS LA ACTUAL (`design.md > 5.3`; R30,
// R31, R32, R49).
//
// Es el gancho invocable que **QC-36** (cambiar mi propia contrasena) usara cuando exista su
// pantalla: quien cambia la contrasena sigue trabajando, y el resto de sus dispositivos vuelven
// al login (decision cerrada 2). Aqui queda implementado y probado; la pantalla es de QC-36 y
// esta ficha no la construye.
//
// Dominio puro: sin `next/*`, sin Prisma, sin `lib/shared/**` y sin adaptadores.

import { requireActor, type Actor } from './actor';
import { UserNotFoundError } from './errors';
import { createSessionTicket } from './session';
import { firstIssuedAtAfterStamp, floorToSecond } from './session-revocation';

import type { SessionIdFactory } from '../ports/session-id-factory';
import type { SessionRevocationRepository } from '../ports/session-revocation-repository';
import type { SessionWriter } from '../ports/session-writer';

/**
 * La sesion EN CURSO de quien invoca, en la forma minima que hace falta para volver a emitirla.
 *
 * `roleName` es la foto firmada del instante del login, y se reemite tal cual: esta operacion
 * cierra sesiones, no revisa el rol.
 *
 * `companyId` **no se lee**, y esto es deliberado. La empresa con la que se SELLA y la empresa con
 * la que se REEMITE tienen que ser el mismo dato o el corte se puede escapar por la rendija; asi
 * que las dos salen de `actor.companyId`, que es quien trae el ambito de autorizacion de esta
 * llamada. Hoy los dos valores coinciden por construccion —la sesion resuelta alimenta a los
 * dos—, y si algun dia divergieran, tomar el del actor es lo correcto: sellar una empresa y
 * reemitir otra entrega una cookie fuera del ambito que se acaba de autorizar. Viaja en el tipo
 * porque `design.md > 5.3` fija asi la forma de `CurrentSession`, y porque obliga a que quien
 * invoque tenga una sesion RESUELTA delante.
 *
 * `sessionId` es el `sid` de la sesion que se esta reemplazando, y **tampoco se lee**: el `sid` nuevo
 * lo produce `SessionIdFactory` (R2) y el viejo NO se registra en el registro de sesiones
 * cerradas, porque el sello ya lo deja invalido —una fila mas seria una segunda escritura que no
 * cambia ninguna respuesta—. Viaja en el tipo porque es lo que obliga a que quien invoque tenga
 * una sesion RESUELTA delante y no un `Actor` suelto.
 */
export type CurrentSession = {
  readonly roleName: string;
  readonly companyId: string;
  readonly sessionId: string;
};

export type EndOtherSessionsDeps = {
  readonly revocations: SessionRevocationRepository;
  /** Quien transporta la sesion reemitida (la cookie firmada). */
  readonly sessions: SessionWriter;
  /** Quien produce el `sid` nuevo: el dominio no puede tener fuentes de azar propias (R2). */
  readonly ids: SessionIdFactory;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Deja invalidas todas las sesiones vivas del actor **menos la actual**, que se reemite (R30,
 * R31).
 *
 * **Autorizacion: solo sobre uno mismo** (R27, R29). No hay parametro de objetivo y por eso no
 * hace falta ningun codigo: `requireActor(actor)` en la PRIMERA LINEA, antes de tocar el puerto,
 * y fallando cerrado. Quien quiera cerrarle las sesiones a OTRA persona tiene `endAllSessions`,
 * que si exige `usuarios.modificar`.
 *
 * Los tres pasos, en orden:
 *
 * 1. `requireActor`.
 * 2. `stampAll` con el sello TRUNCADO AL SEGUNDO (`design.md > 2.3`): a partir de ahi, toda
 *    sesion con `iat <= sello` es invalida —incluida una ajena emitida EN EL MISMO SEGUNDO del
 *    sello, que es el agujero que la comparacion `<=` cierra— y tambien la del propio actor.
 * 3. Reemision: un ticket NUEVO con `sid` NUEVO e `issuedAt = firstIssuedAtAfterStamp(sello)`, o
 *    sea el primer instante que sobrevive al sello (R31). La desigualdad no se reescribe aqui:
 *    la aporta `session-revocation.ts`, que es su unico cuerpo en el repositorio.
 *
 * **Los pasos 2 y 3 NO son atomicos entre si, y no pueden serlo**: uno escribe en Postgres y el
 * otro en una cookie. Si el 3 falla, el actor tambien acaba en el login — **fallo cerrado**, que
 * es el lado correcto por el que caer, y esta escrito y aceptado en `design.md > 5.3`.
 *
 * **La caducidad NO cambia** (R49): el ticket nuevo lo fabrica el mismo `createSessionTicket` de
 * siempre, con su ventana de 8 h ABSOLUTAS desde la emision. No hay renovacion deslizante y
 * ninguna peticion ordinaria reemite nada: esta es la unica reemision fuera del login, y abre una
 * sesion nueva con su propia ventana en vez de prolongar la vieja.
 */
export function createEndOtherSessions(
  deps: EndOtherSessionsDeps,
): (actor: Actor | null | undefined, current: CurrentSession) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function endOtherSessions(
    actor: Actor | null | undefined,
    current: CurrentSession,
  ): Promise<void> {
    // Paso 1. R27 — PRIMERA LINEA, antes de tocar el puerto.
    requireActor(actor);

    // Paso 2. El sello sube y mata TODO lo emitido en ese segundo o antes, incluida la sesion
    // desde la que se invoca. El ambito —empresa y vivo— vive en el puerto, igual que en
    // `endAllSessions`.
    const sello = floorToSecond(now());
    const resultado = await deps.revocations.stampAll({
      userId: actor.id,
      companyId: actor.companyId,
      validFrom: sello,
    });

    // Fallo cerrado: si el sello no subio —ficha borrada entre medias, o de otra empresa— NO se
    // reemite nada. Reemitir aqui seria entregar una sesion nueva a quien acaba de perder la
    // ficha. Mismo error y mismo criterio que `endAllSessions` (R28).
    if (resultado === 'not_found') throw new UserNotFoundError();

    // Paso 3. R31 — la sesion actual sobrevive, pero como una sesion NUEVA: `sid` nuevo (R2) e
    // `issuedAt` estrictamente posterior al sello. `createSessionTicket` calcula su `expiresAt`
    // como siempre, `issuedAt + 8 h` (R49).
    //
    // La empresa sale de `actor.companyId`, LA MISMA con la que se acaba de sellar arriba, y no de
    // `current.companyId`: un solo dato para las dos cosas. Ver el comentario de `CurrentSession`.
    await deps.sessions.startSession(
      createSessionTicket(
        actor.id,
        current.roleName,
        actor.companyId,
        deps.ids.newSessionId(),
        firstIssuedAtAfterStamp(sello),
      ),
    );
  };
}
