// T8 — El gancho de reglas ruta→rol (`design.md > 4.3`, R12).
//
// Dominio puro: sin `next/*`, sin cookies, sin base de datos. Las reglas se evaluan contra el
// rol que viaja FIRMADO en la cookie (D15), nunca contra una consulta a la base.
//
// Ojo (R29): que una regla case y deje pasar NO es una autorizacion. Lo unico que decide este
// modulo es si se enseña una pantalla; la autorizacion sobre datos y operaciones se valida en
// el service (`docs/architecture.md > Acceso a datos y autorizacion`).

import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

/** Una regla: bajo `prefix`, solo entra quien tenga uno de estos roles (por nombre). */
export type RouteRoleRule = {
  readonly prefix: string;
  readonly roles: readonly string[];
};

/**
 * Conjunto declarado de reglas ruta→rol.
 *
 * QC-9 construyo el gancho —el tipo, la busqueda y su uso en `decideRouteAccess`— y dejo esta
 * lista **vacia a proposito (D8, R12)**, con el encargo escrito de que «la primera sera la
 * pantalla de productos, solo Administrador». **Esa primera regla es la de abajo**, que trae
 * QC-22 (R4): la lista ya no esta vacia, y sigue sin estar a medias.
 *
 * Toda ruta privada que NO case con ninguna fila sigue abierta a cualquier sesion valida, y eso
 * es el comportamiento especificado: cada ficha de modulo añade su fila, junto con su test.
 *
 * `ADMIN_ROLE_NAME` se toma del **barrel** de `inventario` —nunca por ruta profunda y nunca como
 * el literal `'Administrador'`—: un tercer literal del mismo rol es justo la deuda que `actor.ts`
 * ya declaro. `domain/**` → `@/lib/modules/N` lo permite `docs/architecture.md > La regla de
 * dependencias`.
 */
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [
  { prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] },
];

/** `true` si `pathname` cae bajo `prefix` respetando los limites de segmento. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * La regla aplicable a `pathname`, o `null` si ninguna casa. **Gana el prefijo mas largo que
 * case**, para que `/productos/nuevo` pueda ser mas estricta que `/productos`; sin ese criterio
 * el resultado dependeria del orden de la lista, que nadie garantiza al añadir una fila.
 */
export function findRouteRule(
  rules: readonly RouteRoleRule[],
  pathname: string,
): RouteRoleRule | null {
  return rules
    .filter((rule) => matchesPrefix(pathname, rule.prefix))
    .reduce<RouteRoleRule | null>(
      (mejor, rule) => (mejor === null || rule.prefix.length > mejor.prefix.length ? rule : mejor),
      null,
    );
}
