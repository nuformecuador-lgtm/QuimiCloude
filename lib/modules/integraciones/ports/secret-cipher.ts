import type { SecretContext } from '../domain/secret-context';

/** Asíncrono aunque hoy cifre en local: así la firma no cambia si la clave sale a un KMS. */
export interface SecretCipher {
  encrypt(plaintext: string, context: SecretContext): Promise<string>;
  decrypt(stored: string, context: SecretContext): Promise<string>;
}
