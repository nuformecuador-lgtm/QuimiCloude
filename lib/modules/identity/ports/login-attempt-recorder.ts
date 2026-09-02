import type { AccountLockState } from '../domain/account-lock';

/**
 * El dominio **calcula** el estado del bloqueo (`nextLockState`) y el puerto solo lo
 * persiste: la politica de escalada no se reparte entre dominio y adaptador.
 *
 * Son dos primitivas de escritura y no una porque el registro de un fallo es una
 * lectura-modificacion-escritura con ~110 ms de bcrypt en medio: si la escritura fuera
 * incondicional, N intentos en paralelo leerian el mismo contador y escribirian todos el
 * mismo valor, y la cuenta no llegaria nunca a los 5 fallos que la bloquean (R22). Por eso
 * el fallo se escribe con `compareAndSet` y el dominio reintenta sobre el estado fresco.
 */
export interface LoginAttemptRecorder {
  /**
   * Escritura CONDICIONAL: aplica `siguiente` solo si el estado almacenado sigue siendo
   * `esperado`. Devuelve true si afecto a la fila, false si otro intento se adelanto.
   */
  compareAndSet(
    userId: string,
    esperado: AccountLockState,
    siguiente: AccountLockState,
  ): Promise<boolean>;
  /** Escritura INCONDICIONAL. Solo para estados que no dependen del valor previo. */
  set(userId: string, estado: AccountLockState): Promise<void>;
}
