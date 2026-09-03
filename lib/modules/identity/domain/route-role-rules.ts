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

// **La lista concreta de reglas NO vive aqui.** Vive en `lib/composition/route-role-rules.ts`,
// porque para nombrar una ruta necesita `INVENTORY_ROUTE` de `lib/shared/routes` —y `domain/` no
// puede importar `lib/shared` (`docs/architecture.md > La regla de dependencias`)— y para nombrar
// el rol necesita `ADMIN_ROLE_NAME` del barrel de `inventario` **como valor**, que solo
// `lib/composition` puede importar asi. QC-22 la puso aqui por un momento, y luego en
// `adapters/driving/`, y cada parada encendio una guardia distinta: la lista es CABLEADO —que
// ruta pide que rol—, no logica de negocio. Lo que si es dominio, y se queda, es el TIPO de
// arriba y la BUSQUEDA de abajo, que se ejercitan sin Next, sin cookies y sin base (R20 de QC-9).
//
// Consecuencia buscada: `findRouteRule` y `decideRouteAccess` reciben las reglas POR PARAMETRO,
// asi que el dominio nunca lee una lista global y cada test declara las suyas.

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
