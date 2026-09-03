// QC-9 T13 — El portero, como ADAPTADOR DRIVING (`design.md > 6`).
//
// Todo lo que hace este archivo es traducir: `NextRequest` -> entrada del dominio, y decision del
// dominio -> `NextResponse`. Ni decide que ruta es privada, ni compone la URL de vuelta, ni juzga
// la caducidad: eso vive en `domain/` y se ejercita sin Next (R20). Si aqui aparece un `if` sobre
// rutas, esta en el archivo equivocado.
//
// **R29 — esto NO es la frontera de autorizacion, y hace falta decirlo aqui porque un rol dentro
// de una cookie invita justo al error contrario.** El middleware solo decide `allow` o `redirect`:
// si se enseña una pantalla o no. La autorizacion sobre datos y operaciones se valida en el
// service, antes de tocar el repositorio (`docs/architecture.md > Acceso a datos y autorizacion`).
// Un permiso implementado solo como corte de ruta no cuenta como implementado.
//
// Lo que este archivo NO puede hacer, y por que:
// - **No toca la cookie (R5).** Solo `NextResponse.next()` y `NextResponse.redirect()`. Ni
//   `cookies.set` ni `cookies.delete`, nunca: la sesion dura 8 h absolutas desde su emision y
//   renovarla al leerla las convertiria en deslizantes sin que nadie lo decidiera.
// - **No toca la base (R4).** No importa `@/lib/composition` (que cablea Prisma) ni ningun
//   repositorio: solo `@/lib/composition/edge`. El rol con el que decide sale del contenido
//   FIRMADO de la cookie (R26), no de una consulta.

import { NextResponse, type NextRequest } from 'next/server';

import { identityEdge } from '@/lib/composition/edge';
import {
  decideRouteAccess,
  isSessionExpired,
  type RouteAccessSession,
} from '@/lib/modules/identity';
import { ROUTE_ROLE_RULES } from './route-role-rules';
import { DASHBOARD_ROUTE, LOGIN_ROUTE, PRIVATE_ROUTE_PREFIXES } from '@/lib/shared/routes';

/**
 * Lee la sesion del valor crudo de la cookie y la traduce al estado que espera el dominio.
 *
 * **Falla cerrado (R18).** El `try` esta acotado a la verificacion, y la unica excepcion prevista
 * es `SESSION_SECRET` ausente o mas corto que el minimo, que hace lanzar a `readSessionSecret()`.
 * Cualquier excepcion se traduce a `anonymous`: en el borde, una excepcion no capturada devolveria
 * 500 en CADA navegacion —el login incluido— y dejaria al usuario sin sitio adonde ir. Fallar
 * cerrado lo manda al login, que es publico.
 *
 * El `catch` NO es vacio (`docs/conventions.md > Manejo de errores`): registra el mensaje del
 * error, que por QC-8 R9 nunca contiene el valor del secreto. Se registra el mensaje y no el
 * error entero para no volcar una traza con el entorno en cada peticion.
 *
 * La caducidad se juzga con `isSessionExpired`, **la misma funcion del dominio que ya usa QC-8**
 * (R3): una segunda nocion de «caducada» en el borde es exactamente el fallo que esta ficha
 * existe para evitar. Una sesion caducada es indistinguible de no tener sesion.
 */
async function readSession(rawValue: string | undefined, now: Date): Promise<RouteAccessSession> {
  if (rawValue === undefined) return { kind: 'anonymous' };

  let claims: Awaited<ReturnType<typeof identityEdge.sessionTokenVerifier.verify>>;
  try {
    claims = await identityEdge.sessionTokenVerifier.verify(rawValue);
  } catch (error) {
    console.warn(
      `[middleware] no se pudo verificar la sesion, se trata como anonima: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { kind: 'anonymous' };
  }

  if (claims === null || isSessionExpired(claims, now)) return { kind: 'anonymous' };

  // D15: el rol sale del contenido FIRMADO. El borde no consulta la base (R4, R26). Envejece
  // hasta 8 h (R30) y su invalidacion inmediata es QC-23.
  return { kind: 'authenticated', sub: claims.sub, roleName: claims.roleName };
}

/**
 * Handler del middleware. Lo reexporta `middleware.ts` en la raiz, que ademas declara el
 * `matcher`; ese archivo no contiene ninguna decision (R20, R22).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const rawValue = request.cookies.get(identityEdge.sessionTokenVerifier.cookieName)?.value;
  const session = await readSession(rawValue, new Date());

  const decision = decideRouteAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    session,
    privatePrefixes: PRIVATE_ROUTE_PREFIXES,
    rules: ROUTE_ROLE_RULES,
    routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
  });

  return decision.kind === 'allow'
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.to, request.nextUrl));
}
