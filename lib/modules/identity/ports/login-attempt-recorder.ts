import type { AccountLockState } from '../domain/account-lock';

/**
 * El dominio **calcula** el estado del bloqueo (`nextLockState`) y el puerto solo lo
 * persiste: la politica de escalada no se reparte entre dominio y adaptador.
 */
export interface LoginAttemptRecorder {
  record(userId: string, state: AccountLockState): Promise<void>;
}
