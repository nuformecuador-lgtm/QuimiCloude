import { z } from 'zod';

/**
 * Contrato de datos del login (`design.md > 4`). CONGELADO en la feature 7: la
 * feature 10 sustituye la verificacion real de credenciales sin cambiar estos tipos.
 */

/**
 * Maximo de caracteres de la contrasena en el login (`design.md > 5`, R10). bcrypt solo
 * tiene en cuenta los primeros 72 BYTES: 64 caracteres dejan margen para acentos y emojis
 * sin que ninguna entrada razonable llegue a truncarse en silencio.
 *
 * El nombre evita el segmento `password` a proposito: `PASSWORD_MAX_LENGTH` pone en rojo
 * la guardia `guard-password-never-plaintext` (feature 1), que marca todo identificador
 * declarado que nombre la contrasena y no acabe en `hash`. Se adapta el nombre, no la
 * guardia (`design.md > 2`).
 */
export const CREDENTIAL_MAX_LENGTH = 64;

export const loginInputSchema = z.object({
  username: z.string().trim().min(1),
  // La contrasena NO se recorta: un espacio inicial o final es parte de la credencial.
  password: z.string().min(1).max(CREDENTIAL_MAX_LENGTH),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Union discriminada por `status`. Ningun miembro tiene un campo `password` (R15):
 * el tipo es la garantia. No hay `status: 'success'`: el exito sale por `redirect` (R17).
 * `attemptId` esta en los dos estados de fallo y NO en `idle`, que es lo que hace
 * cumplible R21.
 */
export type LoginFormState =
  | { status: 'idle' }
  | {
      status: 'invalid';
      attemptId: string;
      username: string;
      fieldErrors: { username?: string; password?: string };
    }
  | { status: 'error'; attemptId: string; username: string; message: string };

export const LOGIN_INITIAL_STATE: LoginFormState = { status: 'idle' };

/** Copy provisional (S4). Los tests afirman sobre esta constante, nunca sobre el literal. */
export const GENERIC_CREDENTIALS_ERROR = 'Usuario o contraseña incorrectos.';

/**
 * Copy provisional (S4) del error de campo obligatorio (R9, R10). Vive aqui, como
 * constante exportada, para que ni la action ni los tests dependan del literal.
 */
export const REQUIRED_FIELD_ERROR = 'Este campo es obligatorio.';

/** Copy del error de contrasena demasiado larga (R10). Los tests afirman sobre la constante. */
export const PASSWORD_TOO_LONG_ERROR = `La contraseña no puede superar los ${CREDENTIAL_MAX_LENGTH} caracteres.`;
