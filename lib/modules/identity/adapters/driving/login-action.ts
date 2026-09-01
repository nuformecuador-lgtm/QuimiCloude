'use server';

import { redirect } from 'next/navigation';

import { identity } from '@/lib/composition';
import { loginInputSchema } from '@/lib/modules/identity';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';
import {
  GENERIC_CREDENTIALS_ERROR,
  PASSWORD_TOO_LONG_ERROR,
  REQUIRED_FIELD_ERROR,
  type LoginFormState,
} from './login-form-state';

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Traduce los problemas de zod a errores de campo. Distingue `too_big` del resto: sin
 * eso, una contrasena demasiado larga se anunciaria como "campo obligatorio" (R10).
 */
function toFieldErrors(issues: readonly { code: string; path: readonly PropertyKey[] }[]): {
  username?: string;
  password?: string;
} {
  const fieldErrors: { username?: string; password?: string } = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field !== 'username' && field !== 'password') continue;
    fieldErrors[field] =
      field === 'password' && issue.code === 'too_big'
        ? PASSWORD_TOO_LONG_ERROR
        : REQUIRED_FIELD_ERROR;
  }
  return fieldErrors;
}

/**
 * Server Action del login. **Contrato congelado** (`design.md > 3`): la feature 10
 * sustituye el cuerpo de la verificacion y anade la cookie de sesion, sin cambiar
 * esta firma ni la forma de `LoginFormState`.
 */
export async function loginAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  void prevState;

  const username = readField(formData, 'username');
  const password = readField(formData, 'password');

  // `attemptId` nuevo por invocacion: es lo que permite al cliente distinguir un
  // resultado nuevo de un re-render del mismo resultado (R21).
  const attemptId = crypto.randomUUID();

  const parsed = loginInputSchema.safeParse({ username, password });

  if (!parsed.success) {
    return {
      status: 'invalid',
      attemptId,
      username,
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }

  const result = await identity.verifyCredentials(parsed.data);

  if (!result.ok) {
    return {
      status: 'error',
      attemptId,
      username: parsed.data.username,
      message: GENERIC_CREDENTIALS_ERROR,
    };
  }

  // Fuera de todo try/catch: `redirect()` senaliza con una excepcion de control
  // (`NEXT_REDIRECT`) y tragarsela romperia R17 en silencio.
  redirect(DASHBOARD_ROUTE);
}
