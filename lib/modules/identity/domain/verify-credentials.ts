import { isLocked, nextLockState } from './account-lock';
import { loginInputSchema, type LoginInput } from './credentials';
import { createSessionTicket } from './session';

import type { LoginAttemptRecorder } from '../ports/login-attempt-recorder';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SessionWriter } from '../ports/session-writer';
import type { UserCredentialsReader } from '../ports/user-credentials-reader';

/**
 * Caso de uso de autenticacion (`design.md > 2`). La decision entera vive aqui, en el
 * dominio: la Server Action solo traduce `FormData` y redirige, y la base, el hashing y la
 * cookie entran por puertos (R17). Este archivo no conoce la base, el framework ni nada
 * compartido: solo el contrato de sus puertos.
 */
export type VerifyCredentialsDeps = {
  readonly users: UserCredentialsReader;
  readonly attempts: LoginAttemptRecorder;
  readonly hasher: PasswordHasher;
  readonly session: SessionWriter;
};

/**
 * Texto cualquiera que se hashea para tener contra que verificar cuando el usuario no existe
 * (R6). No es la credencial de nadie: su unico proposito es gastar el mismo trabajo de bcrypt.
 *
 * El nombre evita el segmento `password` a proposito, igual que `CREDENTIAL_MAX_LENGTH`: la
 * guardia `guard-password-never-plaintext` marca todo identificador que nombre la contrasena
 * y no acabe en `hash`.
 */
export const DECOY_SECRET = 'senuelo-de-tiempo-constante-qc7';

/**
 * Unico resultado de fallo, compartido y congelado: usuario inexistente, contrasena mala y
 * cuenta bloqueada devuelven **exactamente** esto (R2, R3, R28). Si cada camino construyera su
 * propio objeto, cualquier dia uno de ellos se llevaria un campo de mas y el login pasaria a
 * ser un oraculo. Congelado para que ningun consumidor pueda mutarlo.
 */
const REJECTED: { ok: boolean } = Object.freeze({ ok: false });

export function createVerifyCredentials(
  deps: VerifyCredentialsDeps,
): (input: LoginInput) => Promise<{ ok: boolean }> {
  // Se cachea la PROMESA, no el valor: dos intentos concurrentes con usuario inexistente
  // reutilizan el mismo calculo en vez de pagar dos veces el coste del hasher (R7).
  let decoyHashPromise: Promise<string> | null = null;

  function decoyHash(): Promise<string> {
    // Se produce con el hasher del sistema, no con un literal copiado a mano: asi hereda su
    // coste automaticamente y no se desfasa si cambia la configuracion del hashing (R7).
    decoyHashPromise ??= deps.hasher.hash(DECOY_SECRET);
    return decoyHashPromise;
  }

  return async function verifyCredentials(input: LoginInput): Promise<{ ok: boolean }> {
    const parsed = loginInputSchema.safeParse(input);
    // Entrada invalida se corta antes de tocar ningun puerto: ni base, ni hash, ni sesion (R8).
    if (!parsed.success) return REJECTED;

    // Un solo reloj por invocacion: comparar el bloqueo con un instante y escribir el
    // siguiente con otro dejaria ventanas de milisegundos imposibles de razonar.
    const now = new Date();

    // El nombre de usuario se normaliza (R4); la contrasena no se toca ni se recorta, porque
    // un espacio inicial o final es parte de la credencial.
    const usuario = await deps.users.findActiveByUsername(parsed.data.username.trim().toLowerCase());

    if (usuario === null) {
      // Se verifica igualmente contra el señuelo para que un usuario inexistente cueste lo
      // mismo que uno real (R6), y no se escribe nada: crear o actualizar una fila delataria
      // por efecto lateral que el usuario existe o no (R31).
      await deps.hasher.verify(parsed.data.password, await decoyHash());
      return REJECTED;
    }

    // Siempre exactamente una verificacion de hash, tambien en el camino bloqueado (R29): si
    // el bloqueo cortara antes, responderia en microsegundos y seria un oraculo de tiempo.
    const correcta = await deps.hasher.verify(parsed.data.password, usuario.passwordHash);

    // Cuenta bloqueada: no entra ni con la contrasena correcta (R24) y no se escribe nada,
    // para que martillearla no alargue el bloqueo ni suba el nivel (R25).
    if (isLocked(usuario, now)) return REJECTED;

    if (!correcta) {
      await deps.attempts.record(usuario.id, nextLockState(usuario, 'failure', now));
      return REJECTED;
    }

    await deps.attempts.record(usuario.id, nextLockState(usuario, 'success', now));
    // Verificar y LUEGO emitir. Si la emision lanza (secreto ausente, R13) la excepcion se
    // propaga y nadie queda autenticado sin sesion: `loginAction` no llega a redirigir.
    await deps.session.startSession(createSessionTicket(usuario.id, now));

    return { ok: true };
  };
}
