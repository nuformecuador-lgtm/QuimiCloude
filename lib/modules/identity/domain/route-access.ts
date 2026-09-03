// T9 — La decision de acceso a una ruta (`design.md > 4.1`, R2, R7, R10-R13, R20).
//
// **Dominio puro.** Ni `next/*`, ni cookies, ni base de datos, ni `lib/shared`: los prefijos
// privados, las rutas y las reglas ENTRAN COMO PARAMETROS. Eso es lo que permite ejercitar toda
// la politica de acceso con objetos planos, sin levantar Next (R20); el adaptador driving se
// limita a traducir `NextRequest` -> entrada y decision -> `NextResponse`.
//
// **R29 — esto no es la frontera de autorizacion, y esta escrito aqui a proposito porque un rol
// dentro de una cookie invita justo al error contrario.** La decision devuelve `allow` o
// `redirect`, y NADA MAS: no expone capacidades, no devuelve permisos y ningun service debe
// preguntarle. La autorizacion sobre datos y operaciones se valida en el service, antes de
// tocar el repositorio (`docs/architecture.md > Acceso a datos y autorizacion`). Lo unico que
// hace esta funcion es evitar enseñar una pantalla que el usuario no va a poder usar. Ademas, el
// rol que evalua es el FIRMADO al emitir la cookie: envejece hasta 8 h (R30) y su invalidacion
// inmediata es QC-23.

import { RETURN_PARAM, buildLoginRedirect, resolveReturnPath } from './return-path';
import { findRouteRule, type RouteRoleRule } from './route-role-rules';

/**
 * Estado de sesion tal y como lo ve la decision. `roleName` es el rol FIRMADO en la cookie
 * (D15) y no es anulable: un contenido firmado sin rol valido no llega hasta aqui, se resuelve
 * como «sin sesion» antes (R28).
 */
export type RouteAccessSession =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'authenticated'; readonly sub: string; readonly roleName: string };

export type RouteAccessInput = {
  /** Camino pedido, sin cadena de consulta: `/dashboard/reportes`. */
  readonly pathname: string;
  /** Cadena de consulta con su `?`, o cadena vacia: `?desde=ayer`. */
  readonly search: string;
  readonly session: RouteAccessSession;
  /** Prefijos de URL privados declarados (`design.md > 7`). Entran como parametro (R20). */
  readonly privatePrefixes: readonly string[];
  /**
   * Reglas ruta→rol. Entran como parametro (R12): la decision no las declara ni sabe donde
   * viven. Hoy las aporta `ROUTE_ROLE_RULES`, que ya NO esta vacio y ya NO vive en `domain/`:
   * lo mudo QC-22 a `lib/composition/route-role-rules.ts` -la lista concreta es CABLEADO- y
   * trae su primera fila, la pantalla de inventario solo para Administrador.
   */
  readonly rules: readonly RouteRoleRule[];
  readonly routes: { readonly login: string; readonly dashboard: string };
};

/**
 * Por que se redirige. No cambia el destino: existe para que los tests afirmen el motivo y no
 * solo el destino, y para que un log futuro no tenga que reconstruirlo.
 */
export type RedirectReason = 'unauthenticated' | 'already-authenticated' | 'forbidden';

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

/** `true` si esa persona, con su rol, puede ver esa ruta segun las reglas declaradas. */
function isAllowedByRules(
  rules: readonly RouteRoleRule[],
  pathname: string,
  roleName: string,
): boolean {
  const regla = findRouteRule(rules, pathname);
  return regla === null || regla.roles.includes(roleName);
}

/**
 * Decide que hacer con una peticion. El ORDEN de los pasos **es** la politica
 * (`design.md > 4.1`):
 *
 * 1. Ruta no privada y no login -> `allow` (R11).
 * 2. Ruta privada + anonimo -> al login con la ruta pedida como destino de vuelta (R2, R7).
 * 3. Login + sesion -> al destino de vuelta valido si lo hay, si no al dashboard (R10).
 * 4. Ruta privada + sesion + regla que exige un rol que no tiene -> al DASHBOARD, nunca al
 *    login: «no autorizado» no es «no autenticado» (R13).
 * 5. Resto -> `allow`.
 */
export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const { pathname, search, session, privatePrefixes, rules, routes } = input;

  const esPrivada = privatePrefixes.some((prefijo) => isUnderPrefix(pathname, prefijo));
  const esLogin = pathname === routes.login;

  // 1 — Lo publico se sirve sin redireccion alguna (R11).
  if (!esPrivada && !esLogin) return ALLOW;

  // 2 — Ruta privada sin sesion: al login, llevando la ruta pedida con su query (R2, R7).
  if (esPrivada && session.kind === 'anonymous') {
    return {
      kind: 'redirect',
      to: buildLoginRedirect(routes.login, pathname, search),
      reason: 'unauthenticated',
    };
  }

  // 3 — El login con sesion valida no se sirve: se aterriza donde el usuario queria ir (R10).
  if (esLogin && session.kind === 'authenticated') {
    return {
      kind: 'redirect',
      to: returnPathFromSearch(search, routes.dashboard),
      reason: 'already-authenticated',
    };
  }

  // 4 — Sesion valida sin el rol que la ruta exige: al dashboard (R13).
  if (esPrivada && session.kind === 'authenticated') {
    if (!isAllowedByRules(rules, pathname, session.roleName)) {
      // Si el propio dashboard tampoco estuviera autorizado —el caso obvio es que la ruta no
      // autorizada SEA el dashboard—, redirigir ahi seria el bucle que R13 prohibe. Se deja
      // pasar: el corte real lo pone el service, no esta funcion (R29).
      if (!isAllowedByRules(rules, routes.dashboard, session.roleName)) return ALLOW;

      return { kind: 'redirect', to: routes.dashboard, reason: 'forbidden' };
    }
  }

  // 5 — Todo lo demas pasa: login sin sesion incluido (R11).
  return ALLOW;
}
