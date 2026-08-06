'use server';

import { redirect } from 'next/navigation';

import { verifyCredentials } from '@/lib/services/login-stub';
import {
  DASHBOARD_ROUTE,
  GENERIC_CREDENTIALS_ERROR,
  REQUIRED_FIELD_ERROR,
  loginInputSchema,
  type LoginFormState,
} from '@/lib/types/auth';

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function toFieldErrors(paths: readonly PropertyKey[][]): {
  username?: string;
  password?: string;
} {
  const fieldErrors: { username?: string; password?: string } = {};
  for (const path of paths) {
    const field = path[0];
    if (field === 'username' || field === 'password') {
      fieldErrors[field] = REQUIRED_FIELD_ERROR;
    }
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
      fieldErrors: toFieldErrors(parsed.error.issues.map((issue) => issue.path)),
    };
  }

  const result = await verifyCredentials(parsed.data);

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
