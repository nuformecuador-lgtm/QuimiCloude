// QC-9 T9, QC-75 T11 — La decision de acceso a una ruta (`design.md > 4`, R16, R17, R18).
//
// **Dominio puro.** Ni `next/*`, ni cookies, ni base de datos, ni `lib/shared`: los prefijos
// privados y las rutas ENTRAN COMO PARAMETROS. Eso es lo que permite ejercitar toda la politica
// de acceso con objetos planos, sin levantar Next (R20 de QC-9); el adaptador driving se limita
// a traducir `NextRequest` -> entrada y decision -> `NextResponse`.
//
// **Esta funcion ya NO evalua ningun rol ni ningun permiso, y aqui esta el porque.** Hasta QC-75
// existia una lista ruta→rol que se consultaba en este punto; se retiro
// entera (QC-75 R16). El corte por permiso vive ahora en cada pantalla, que abre con
// `requirePagePermission('<modulo>.consultar')` y responde 404 a quien no lo tenga. Y no puede
// vivir aqui: resolver un permiso exige consultar la base, y el borde decide **sin tocar la
// base** (QC-75 R18, lo hace cumplir `tests/guards/guard-middleware-edge.test.ts`). El rol que
// viaja firmado en la cookie no sirve de sustituto —envejece hasta 8 h y no dice nada de los
// permisos vigentes—, asi que esta decision se queda con lo unico que el borde puede comprobar
// solo: si hay sesion o no.
//
// Consecuencia: lo que decide esta funcion es `allow` o `redirect`, y NADA MAS. No expone
// capacidades, no devuelve permisos y ningun service debe preguntarle. La autorizacion sobre
// datos y operaciones se valida en el service, antes de tocar el repositorio
// (`docs/architecture.md > Acceso a datos y autorizacion`).

import { RETURN_PARAM, buildLoginRedirect, resolveReturnPath } from './return-path';

/**
 * Estado de sesion tal y como lo ve la decision: hay sesion valida o no la hay. **No lleva el
 * rol**: nada de lo que decide esta funcion depende de el (QC-75 R16). La cookie lo sigue
 * firmando —es de QC-8/QC-9 y la cabecera lo pinta como nombre visible—, pero el borde ya no
 * decide con el.
 */
export type RouteAccessSession =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'authenticated'; readonly sub: string };

export type RouteAccessInput = {
  /** Camino pedido, sin cadena de consulta: `/dashboard/reportes`. */
  readonly pathname: string;
  /** Cadena de consulta con su `?`, o cadena vacia: `?desde=ayer`. */
  readonly search: string;
  readonly session: RouteAccessSession;
  /** Prefijos de URL privados declarados (`design.md > 7`). Entran como parametro (R20). */
  readonly privatePrefixes: readonly string[];
  readonly routes: { readonly login: string; readonly dashboard: string };
};

/**
 * Por que se redirige. No cambia el destino: existe para que los tests afirmen el motivo y no
 * solo el destino, y para que un log futuro no tenga que reconstruirlo.
 */
export type RedirectReason = 'unauthenticated' | 'already-authenticated';

export type RouteAccessDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'redirect'; readonly to: string; readonly reason: RedirectReason };

const ALLOW: RouteAccessDecision = { kind: 'allow' };

function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** El destino de vuelta que trae la cadena de consulta, ya validado como interno (R9). */
function returnPathFromSearch(search: string, fallback: string): string {
  const candidato = new URLSearchParams(search).get(RETURN_PARAM);
  return resolveReturnPath(candidato, fallback);
}

/**
 * Decide que hacer con una peticion. El ORDEN de los pasos **es** la politica
 * (`design.md > 4`):
 *
 * 1. Ruta no privada y no login -> `allow` (R11 de QC-9).
 * 2. Ruta privada + anonimo -> al login con la ruta pedida como destino de vuelta (QC-75 R17).
 * 3. Login + sesion -> al destino de vuelta valido si lo hay, si no al dashboard (QC-75 R17).
 * 4. Resto -> `allow`: **una ruta privada con sesion valida pasa, sea cual sea el rol**
 *    (QC-75 R16). Quien no tenga el permiso de esa pantalla recibe su 404 en la pagina.
 */
export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const { pathname, search, session, privatePrefixes, routes } = input;

  const esPrivada = privatePrefixes.some((prefijo) => isUnderPrefix(pathname, prefijo));
  const esLogin = pathname === routes.login;

  // 1 — Lo publico se sirve sin redireccion alguna.
  if (!esPrivada && !esLogin) return ALLOW;

  // 2 — Ruta privada sin sesion: al login, llevando la ruta pedida con su query (R17).
  if (esPrivada && session.kind === 'anonymous') {
    return {
      kind: 'redirect',
      to: buildLoginRedirect(routes.login, pathname, search),
      reason: 'unauthenticated',
    };
  }

  // 3 — El login con sesion valida no se sirve: se aterriza donde el usuario queria ir, y si no
  // trae destino de vuelta, en el dashboard (R17). Ese respaldo no mira permisos porque el borde
  // no puede: quien no tenga `dashboard.consultar` recibira alli el 404 del layout privado, con
  // su menu a la izquierda para seguir (`design.md > 3`, R18).
  if (esLogin && session.kind === 'authenticated') {
    return {
      kind: 'redirect',
      to: returnPathFromSearch(search, routes.dashboard),
      reason: 'already-authenticated',
    };
  }

  // 4 — Todo lo demas pasa: una ruta privada con sesion valida pasa SEA CUAL SEA EL ROL (R16), y
  // el login sin sesion tambien.
  return ALLOW;
}
