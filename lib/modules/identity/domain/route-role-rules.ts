// T8 — El gancho de reglas ruta→rol (`design.md > 4.3`, R12).
//
// Dominio puro: sin `next/*`, sin cookies, sin base de datos. Las reglas se evaluan contra el
// rol que viaja FIRMADO en la cookie (D15), nunca contra una consulta a la base.
//
// Ojo (R29): que una regla case y deje pasar NO es una autorizacion. Lo unico que decide este
// modulo es si se enseña una pantalla; la autorizacion sobre datos y operaciones se valida en
// el service (`docs/architecture.md > Acceso a datos y autorizacion`).

/** Una regla: bajo `prefix`, solo entra quien tenga uno de estos roles (por nombre). */
export type RouteRoleRule = {
  readonly prefix: string;
  readonly roles: readonly string[];
};

/**
 * Conjunto declarado de reglas ruta→rol.
 *
 * **Esta VACIO A PROPOSITO (D8, R12), no a medias.** QC-9 construye el gancho —el tipo, la
 * busqueda y su uso en `decideRouteAccess`— pero no declara ninguna regla: las reglas concretas
 * las trae la ficha de cada modulo (la primera sera la pantalla de productos, solo
 * Administrador). Mientras esta lista este vacia, toda sesion valida pasa a cualquier ruta
 * privada, y eso es el comportamiento especificado.
 *
 * Si estas leyendo esto pensando en «arreglarlo» rellenandolo: no hay nada roto. Añade la fila
 * en la ficha que introduce la pantalla, junto con su test.
 */
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [];

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
