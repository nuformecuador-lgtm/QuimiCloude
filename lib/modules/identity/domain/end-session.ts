// QC-23 T11 — Cerrar sesion en ESTE dispositivo, y solo en este (`design.md > 5.1`; R20, R21,
// R22, R23, R24, R48).
//
// **Por que existe este archivo, si hasta ayer no hacia falta.** Hasta QC-23, `lib/composition`
// cableaba `endSession: clearSession` DIRECTO al adaptador, y `ports/session-reader.ts` lo
// justificaba por escrito: «cerrar sesion no tiene caso de uso a proposito — borrar la cookie no
// encierra ninguna decision de negocio». **QC-23 lo deja de ser cierto**, y se dice con estas
// palabras en vez de disimularlo (el comentario de aquel puerto queda anotado): ahora cerrar
// sesion encierra tres decisiones —que sesion se cierra, que pasa si no se puede registrar, y en
// que orden— y las tres son de negocio.
//
// Dominio puro: sin `next/*`, sin Prisma, sin `lib/shared/**` y sin adaptadores. Lo unico que
// importa son tipos de su propio `domain/` y de sus `ports/`.

import type { SessionCheckLog } from '../ports/session-check-log';
import type { SessionEraser } from '../ports/session-eraser';
import type { SessionReader } from '../ports/session-reader';
import type { SessionRevocationRepository } from '../ports/session-revocation-repository';

export type EndSessionDeps = {
  /** De donde sale el `sid` que se cierra: la sesion EN CURSO, nunca un parametro (R21). */
  readonly session: SessionReader;
  /** Quien escribe la fila del registro y purga de paso las caducadas de esa persona (R39). */
  readonly revocations: SessionRevocationRepository;
  /** Quien retira la cookie, exactamente como se retira hoy (R22). */
  readonly cookie: SessionEraser;
  /** A donde va la causa si el registro del cierre no se pudo escribir (R23). */
  readonly log: SessionCheckLog;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Cierra la sesion en curso (R20-R24).
 *
 * **La firma del caso de uso es la que exige la fachada: sin parametros y sin valor de retorno.**
 * La clave de `lib/composition` sigue llamandose `endSession`, asi que `logoutAction()` NO CAMBIA
 * NI UNA LINEA (R21, contrato congelado por QC-11) y su test sigue verde sin tocarlo: esa es la
 * red de esta migracion. Lo que cambia es el EFECTO, no la firma (decision cerrada 15).
 *
 * **El orden ES el requisito** (`design.md > 5.1`):
 *
 * 1. Leer los claims. Si no hay sesion, **solo** se borra la cookie y se sale: no hay `sid` que
 *    registrar, y registrar «nada» seria una fila inventada.
 * 2. `revokeSession` — una fila en el registro para ESE `sid`, mas la purga de las caducadas de
 *    esa persona, en la misma transaccion (R39). Cerrar dos veces el mismo `sid` no es un error:
 *    el `23505` del indice unico lo traduce el adaptador a exito (R12).
 * 3. `clear()`, **SIEMPRE** —por eso va en un `finally` y no detras del paso 2—, tambien si el
 *    paso 2 lanzo (R23). Fallar el cierre dejaria a la persona DENTRO, que es peor que la copia
 *    del token que sobrevive hasta su caducidad natural; y la causa no queda en silencio.
 *
 * **Cierra ESE `sid` y solo ese (R20), y NO sube el sello de nadie (R24).** Quien sale en el
 * movil sigue dentro en la oficina: este caso de uso no invoca `stampAll` y no puede hacerlo,
 * porque sus dependencias no le dan ninguna otra via. Las demas sesiones vivas de esa persona
 * siguen resolviendo.
 */
export function createEndSession(deps: EndSessionDeps): () => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function endSession(): Promise<void> {
    try {
      const claims = await deps.session.readClaims();

      // Paso 1. Sin sesion legible no hay nada que registrar; el `finally` retira la cookie
      // igual, que es lo que hace esta operacion idempotente para quien la invoca dos veces.
      if (claims !== null) {
        // Paso 2. R20: el `sid` de la sesion EN CURSO, y `expiresAt` es la caducidad NATURAL del
        // token que se cierra —lo que hace posible la purga de R39, porque pasada esa fecha la
        // fila ya no protege de nada—.
        await deps.revocations.revokeSession({
          sessionId: claims.sessionId,
          userId: claims.sub,
          expiresAt: claims.expiresAt,
          now: now(),
        });
      }
    } catch (error) {
      // El `catch` NO esta vacio (`docs/conventions.md > Manejo de errores`): la causa queda en
      // el registro del SERVIDOR —el identificador de peticion lo pone el ADAPTADOR de este
      // puerto, no este dominio, por QC-71 R9— y el cierre sigue adelante (R23). Es la respuesta
      // escrita a la pregunta abierta 1 del spec: el cierre nunca se bloquea y el fallo nunca
      // queda en silencio.
      //
      // **El diagnostico nunca lleva el `sid`** (`design.md > 7`): un identificador de sesion es
      // material de autenticacion —con el y la firma correcta se entra—, mismo criterio con el
      // que QC-79 prohibio el secreto del enlace. Tampoco lleva `sub` ni PII.
      deps.log.log(diagnosticoDe(error));
    } finally {
      // Paso 3. R22, R23: SIEMPRE. Tambien si el paso 2 lanzo, y tambien si no habia sesion.
      await deps.cookie.clear();
    }
  };
}

/**
 * La CAUSA en texto, para el registro del servidor y solo para el (R23).
 *
 * Se queda con el mensaje del error y nunca con el objeto entero: un error de Prisma arrastra la
 * consulta, sus parametros y los nombres de tabla, y por ahi se cuela PII en un log. Lo que no es
 * `Error` se describe por su tipo, sin volcar su contenido, por lo mismo. Gemela de la de
 * `resolve-session.ts`, que cubre el camino de LECTURA; esta cubre el de ESCRITURA.
 *
 * No recibe los claims, asi que colar el `sid` por descuido no es posible.
 */
function diagnosticoDe(error: unknown): string {
  const causa = error instanceof Error ? error.message : typeof error;
  return `end-session: el cierre de sesion no se pudo registrar (${causa})`;
}
