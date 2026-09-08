'use server';

import { redirect } from 'next/navigation';

import { identity } from '@/lib/composition';
import { RETURN_PARAM, loginInputSchema, resolveReturnPath } from '@/lib/modules/identity';
import {
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
} from '@/lib/shared/navigation/private-nav';
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

  // QC-9 R8 — se aterriza en la pantalla que el usuario habia pedido, no siempre en el
  // dashboard. El campo oculto llega del formulario, o sea que es ENTRADA EXTERNA: un POST
  // fabricado puede traer `https://evil.example` y sacar al usuario del ERP justo despues de
  // autenticarse. Por eso se revalida aqui con `resolveReturnPath`, aunque la pantalla de login
  // ya lo hubiera validado al pintarlo: la validacion del cliente no cuenta, y esta es la unica
  // que protege de verdad (R9, `design.md > 8`).
  //
  // QC-75 R11, R12 — el RESPALDO deja de ser siempre el dashboard: cuando no hay destino de
  // vuelta valido se aterriza en el primer enlace del menu YA FILTRADO por los permisos de quien
  // acaba de entrar (`design.md > 3`). El ORDEN NO CAMBIA respecto de QC-9: si el destino de
  // vuelta es interno y valido, sigue mandando el (R13); lo unico que cambia es el respaldo.
  //
  // **La lectura de la sesion va DESPUES de `verifyCredentials`, y eso es lo que la hace
  // posible**: la sesion se emite dentro de ese caso de uso (`domain/verify-credentials.ts`
  // llama a `startSession` antes de devolver `ok: true`), y el almacen de Next refleja las
  // escrituras pendientes dentro de la misma Server Action, asi que aqui ya se lee la sesion
  // recien emitida.
  //
  // **Es una consulta extra por INICIO DE SESION, no por peticion.** R19 prohibe anadir
  // consultas por peticion a la navegacion —el menu de cada pantalla sale de la lectura de
  // sesion que el layout privado ya hacia—, y esto no es navegacion: ocurre una vez, al entrar.
  // La alternativa —ampliar el resultado de `verifyCredentials` para que trajera al usuario y
  // sus permisos— esta descartada por escrito (`design.md > 8`, alternativa nº 3): ese resultado
  // es un contrato CONGELADO desde QC-7 (`{ ok: boolean }`, con un unico objeto de rechazo
  // compartido para que el login no sea un oraculo), y devolver datos del usuario en el
  // resultado del login abre la puerta a que un camino de fallo se lleve un campo de mas.
  const user = await identity.getSessionUser();

  // **`DASHBOARD_ROUTE` como ultimo respaldo cubre R12 sin inventar ninguna ruta.** Si el menu
  // filtrado queda vacio, esa persona tampoco tiene `dashboard.consultar` —el dashboard es un
  // item mas del menu—, asi que `/dashboard` respondera exactamente el 404 dentro del layout
  // privado que pide la decision cerrada nº 3, con su cabecera y su control de cerrar sesion.
  // **No es un caso feliz disfrazado**: es el mismo 404 de R7, alcanzado sin codigo nuevo. Y,
  // explicitamente (R12): NO se devuelve al login, NO se muestra error de credenciales y NO hay
  // pantalla de «sin acceso» — las credenciales eran correctas y decir lo contrario seria mentir.
  // El `user === null` es defensivo (sesion ilegible justo despues de emitirse) y cae al mismo
  // respaldo.
  const fallback =
    (user === null
      ? null
      : firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions))) ??
    DASHBOARD_ROUTE;

  const destino = resolveReturnPath(readField(formData, RETURN_PARAM), fallback);

  // Fuera de todo try/catch: `redirect()` senaliza con una excepcion de control
  // (`NEXT_REDIRECT`) y tragarsela romperia R17 en silencio.
  redirect(destino);
}
