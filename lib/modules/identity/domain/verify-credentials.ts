import { isLocked, nextLockState, type AccountLockState } from './account-lock';
import { loginInputSchema, type LoginInput } from './credentials';
import { createSessionTicket } from './session';

import type { LoginAttemptRecorder } from '../ports/login-attempt-recorder';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SessionWriter } from '../ports/session-writer';
import type {
  AuthenticatableUser,
  UserCredentialsReader,
} from '../ports/user-credentials-reader';

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

/**
 * Reintentos del registro condicional de un fallo antes de rendirse.
 *
 * Diez sobran: en cada ronda gana **exactamente un** `compareAndSet`, asi que tras 5 rondas
 * ganadoras la cuenta queda bloqueada y todos los demas intentos, al releer, ven el bloqueo y
 * salen sin escribir. Un intento cualquiera necesita 5-6 rondas como mucho.
 */
const MAX_INTENTOS_DE_REGISTRO = 10;

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

  // Se calienta al construir para que ningun intento pague el hash del senuelo ademas de su
  // verificacion (asimetria de tiempo, aunque sea de una sola muestra por proceso).
  const calentamiento = decoyHash();
  // El .catch no sustituye a la promesa cacheada: solo evita un unhandled rejection si el
  // hasher falla antes de que nadie la espere. Quien la espere de verdad seguira viendo el error.
  void calentamiento.catch(() => {});

  /**
   * Registra un intento fallido sin perder cuenta de los que corren en paralelo.
   *
   * La escritura es CONDICIONAL al estado que se leyo: entre la lectura y la escritura hay
   * ~110 ms de bcrypt, y con una escritura absoluta N intentos simultaneos leerian el mismo
   * contador y lo dejarian todos en el mismo valor —el bloqueo de R22 no se dispararia jamas
   * justo frente al unico atacante que importa, el que lanza los intentos en paralelo—. Si el
   * `compareAndSet` pierde la carrera, se relee y se **recalcula la politica** sobre el estado
   * fresco: la escalada la sigue decidiendo `nextLockState`, nunca el adaptador.
   *
   * El `isLocked` de aqui se evalua sobre una copia que pudo envejecer durante esos ~110 ms, asi
   * que no basta: al CAS se le pasa el mismo `now` para que la propia base rechace la escritura
   * si la fila esta bloqueada. Sin eso, un intento con estado obsoleto podria borrar un bloqueo
   * vivo (ver `compareAndSetLoginAttempt`).
   *
   * Este bucle NO llama al hasher: el numero de verificaciones por intento sigue siendo uno
   * exacto en los tres caminos (R6, R29).
   */
  async function registrarFallo(
    visto: AuthenticatableUser,
    usuarioNormalizado: string,
    now: Date,
  ): Promise<void> {
    let estado: AccountLockState = visto;
    for (let intento = 0; intento < MAX_INTENTOS_DE_REGISTRO; intento += 1) {
      // Si al releer la cuenta ya esta bloqueada, no se escribe NADA: martillearla no la
      // alarga ni sube el nivel (R25).
      if (isLocked(estado, now)) return;
      const siguiente = nextLockState(estado, 'failure', now);
      // `now` va al puerto: la escritura tiene que rechazarla la base si la fila esta bloqueada
      // en ese instante, porque `estado` es una copia que pudo quedar obsoleta durante bcrypt.
      if (await deps.attempts.compareAndSet(visto.id, estado, siguiente, now)) return;
      // Perdio la carrera: se relee y se recalcula la politica sobre el estado FRESCO.
      const fresco = await deps.users.findActiveByUsername(usuarioNormalizado);
      // Borrado o renombrado entre medias: no se escribe nada (R31).
      if (fresco === null || fresco.id !== visto.id) return;
      estado = fresco;
    }
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
    const usuarioNormalizado = parsed.data.username.trim().toLowerCase();
    const usuario = await deps.users.findActiveByUsername(usuarioNormalizado);

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
      await registrarFallo(usuario, usuarioNormalizado, now);
      return REJECTED;
    }

    // El exito si se escribe de forma incondicional: su estado es todo ceros, o sea que **no
    // depende del valor previo**. Es idempotente y no tiene el problema de
    // lectura-modificacion-escritura que obliga al camino de fallo a ir con `compareAndSet`.
    await deps.attempts.set(usuario.id, nextLockState(usuario, 'success', now));
    // Verificar y LUEGO emitir. Si la emision lanza (secreto ausente, R13) la excepcion se
    // propaga y nadie queda autenticado sin sesion: `loginAction` no llega a redirigir.
    // El rol que se firma sale de la BASE (`usuario.roleName`, leido por el puerto en la misma
    // consulta que autentica) y jamas de la entrada: `LoginInput` solo trae usuario y
    // contrasena, y nada de este archivo puede meter un rol por otra via (QC-9 R26).
    // La empresa, igual (QC-48 R1, R2, R5): sale de la ficha de esa persona
    // (`usuario.companyId`, misma consulta), no se pregunta en el login, no se acepta desde la
    // entrada y no tiene valor por defecto — una empresa por defecto seria una inventada.
    await deps.session.startSession(
      createSessionTicket(usuario.id, usuario.roleName, usuario.companyId, now),
    );

    return { ok: true };
  };
}
