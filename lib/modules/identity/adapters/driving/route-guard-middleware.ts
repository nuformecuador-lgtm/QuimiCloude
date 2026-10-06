// QC-9 T13 — El portero, como ADAPTADOR DRIVING (`design.md > 6`).
//
// Todo lo que hace este archivo es traducir: `NextRequest` -> entrada del dominio, y decision del
// dominio -> `NextResponse`. Ni decide que ruta es privada, ni compone la URL de vuelta, ni juzga
// la caducidad: eso vive en `domain/` y se ejercita sin Next (R20). Si aqui aparece un `if` sobre
// rutas, esta en el archivo equivocado.
//
// **Esto NO es la frontera de autorizacion, y desde QC-75 ni siquiera lo aparenta.** El
// middleware solo decide `allow` o `redirect` a partir de la SESION: firma, caducidad y empresa.
// Ya no lee ningun rol ni ningun permiso (QC-75 R16): el corte por permiso vive en cada pantalla,
// que abre con `requirePagePermission('<modulo>.consultar')`, y no puede vivir aqui porque
// resolver un permiso exige consultar la base, que es justo lo que el borde tiene prohibido
// (QC-75 R18). La autorizacion sobre datos y operaciones se valida en el service, antes de tocar
// el repositorio (`docs/architecture.md > Acceso a datos y autorizacion`). Un permiso
// implementado solo como corte de ruta no cuenta como implementado.
//
// **`/login` con sesion viva y sin destino de vuelta redirige a `ASSIGNED_ORDERS_ROUTE`**: el
// dashboard esta oculto del menu, asi que se aterriza en asignacion. El borde no conoce los
// permisos: quien no tenga el de esa pantalla recibe el 404 del layout privado, con su menu a la
// izquierda para seguir. Resolverlo aqui exigiria una consulta en el borde, que es lo prohibido.
//
// Lo que este archivo NO puede hacer, y por que:
// - **No toca la cookie (R5).** Solo `NextResponse.next()` y `NextResponse.redirect()`. Ni
//   `cookies.set` ni `cookies.delete`, nunca: la sesion dura 8 h absolutas desde su emision y
//   renovarla al leerla las convertiria en deslizantes sin que nadie lo decidiera.
// - **No toca la base (R4 de QC-9, R18 de QC-75).** No importa `@/lib/composition` (que cablea
//   Prisma) ni ningun repositorio: solo `@/lib/composition/edge`. Todo lo que decide sale del
//   contenido FIRMADO de la cookie, no de una consulta.

// QC-71 T4 — EL IDENTIFICADOR DE PETICION SE ENGANCHA AQUI (`design.md > 1`, R4, R5, R6).
//
// Por que aqui y no en `middleware.ts`: la raiz es un cascaron con una linea de reexport y el
// `matcher`, y `tests/unit/middleware-root-contract.test.ts` exige por TEXTO que no haya ninguna
// decision en ella. Encadenar dos middlewares alli seria reabrir el contrato de QC-9 desde una
// ficha de plataforma, e inventar un punto de composicion que la tabla de dependencias no
// autoriza en `lib/composition`. Este adaptador, en cambio, no gana ninguna REGLA: gana un
// cableado. Como se genera el id y como se llama la cabecera viven en el modulo
// `observabilidad`, no aqui.
//
// **El id va en la cabecera de PETICION y NUNCA en la de respuesta (R6).** `NextResponse.next({
// request: { headers } })` reescribe la peticion que llega AL SERVIDOR, que es lo unico que
// permite a la Server Action leerlo con `headers()`. Ponerlo en `response.headers` lo mandaria
// al NAVEGADOR —expondria un dato interno en cada peticion, incluidas las publicas— y ademas la
// accion no lo veria nunca. Ese es el error clasico, y `tests/unit/identity/route-guard-request-id.test.ts`
// lo ancla afirmando que `response.headers.get('x-request-id')` es `null`.
//
// Se usa `set` y no `append`: si el cliente manda su propio `x-request-id`, su valor se
// SUSTITUYE (R5). Lo que entra por el navegador es entrada del usuario y no puede acabar en una
// linea de log sin validar.
//
// El camino `redirect` NO lleva id a proposito (`design.md > 2`): cuando el portero redirige no
// corre nada despues en el servidor, asi que nadie leeria esa cabecera. No se inventa un canal
// que nadie lee.

import { NextResponse, type NextRequest } from 'next/server';

import { identityEdge, observabilidadEdge } from '@/lib/composition/edge';
import {
  decideRouteAccess,
  isSessionExpired,
  type RouteAccessSession,
} from '@/lib/modules/identity';
import {
  ASSIGNED_ORDERS_ROUTE,
  LOGIN_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SESSION_ENDED_PARAM,
} from '@/lib/shared/routes';

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

  // Hay sesion valida, y eso es TODO lo que el borde necesita saber. El contenido firmado sigue
  // trayendo `roleName` —la cookie es de QC-8/QC-9 y la cabecera lo pinta como nombre visible—,
  // pero aqui no se lee: ninguna decision del middleware depende del rol (QC-75 R16).
  return { kind: 'authenticated', sub: claims.sub };
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
    routes: { login: LOGIN_ROUTE, landing: ASSIGNED_ORDERS_ROUTE },
    // QC-78 R29 — el nombre de la marca entra como parametro, igual que los prefijos y las rutas:
    // el literal vive en `lib/shared/routes.ts` y el dominio no puede importarlo. Sin esta linea
    // el campo queda `undefined`, la regla 3 dispara siempre y el bucle vuelve; por eso hay un
    // test que la vigila en vez de confiar en que nadie la borre.
    sessionEndedParam: SESSION_ENDED_PARAM,
  });

  if (decision.kind !== 'allow') {
    return NextResponse.redirect(new URL(decision.to, request.nextUrl));
  }

  // Camino `allow`: la peticion sigue hacia el servidor con su identificador propio (R4). Se
  // clona la cabecera entrante para no mutar la de la `NextRequest`, y `set` sobrescribe el
  // valor que hubiera puesto el cliente (R5).
  const headers = new Headers(request.headers);
  headers.set(observabilidadEdge.requestIdHeader, observabilidadEdge.newRequestId());

  return NextResponse.next({ request: { headers } });
}
