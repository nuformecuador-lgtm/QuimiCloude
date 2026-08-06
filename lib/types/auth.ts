import { z } from 'zod';

/**
 * Contrato de datos del login (`design.md > 4`). CONGELADO en la feature 7: la
 * feature 10 sustituye la verificacion real de credenciales sin cambiar estos tipos.
 */

export const loginInputSchema = z.object({
  username: z.string().trim().min(1),
  // La contrasena NO se recorta: un espacio inicial o final es parte de la credencial.
  password: z.string().min(1),
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

export const DASHBOARD_ROUTE = '/dashboard';

/** Ruta aun inexistente (S6): hoy devuelve 404 y el slug definitivo esta sin confirmar. */
export const FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena';
