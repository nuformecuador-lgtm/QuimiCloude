export const DASHBOARD_ROUTE = '/dashboard';

export const LOGIN_ROUTE = '/login';

/**
 * Pantalla de productos del catalogo (QC-22, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` —donde nacio como placeholder— porque el
 * middleware y la regla ruta->rol de `identity` la necesitan y **no pueden depender de la
 * navegacion**, que arrastra etiquetas, iconos y agrupacion de UI. `private-nav.ts` ya importa de
 * este archivo, asi que la flecha no se invierte ni aparece un ciclo.
 */
export const INVENTORY_ROUTE = '/inventario';

/**
 * Pantalla de recetas de produccion (QC-26, R3).
 *
 * Vive aqui y no en `navigation/private-nav.ts` —donde nacio como placeholder— porque el
 * middleware y la regla ruta->rol de `identity` la necesitan y **no pueden depender de la
 * navegacion**, que arrastra etiquetas, iconos y agrupacion de UI. `private-nav.ts` ya importa de
 * este archivo, asi que la flecha no se invierte ni aparece un ciclo.
 */
export const FORMULAS_ROUTE = '/produccion/formulas';

/** Ruta de alta de una receta nueva, derivada de `FORMULAS_ROUTE` (QC-26, R4). */
export const NEW_RECIPE_ROUTE = `${FORMULAS_ROUTE}/nueva`;

/** Ruta de edicion de una receta existente, derivada de `FORMULAS_ROUTE` (QC-26, R5, R6). */
export function recipeEditRoute(id: string): string {
  return `${FORMULAS_ROUTE}/${id}`;
}

/**
 * Pantalla de proveedores (QC-44, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. A diferencia de `INVENTORY_ROUTE` y `FORMULAS_ROUTE`, esta
 * constante **nace** aqui —no se muda desde la navegacion—, asi que no necesita reexport de
 * compatibilidad: nadie la importaba antes de `private-nav`.
 */
export const SUPPLIERS_ROUTE = '/proveedores';

/**
 * Ruta de la pagina de detalle de un proveedor, derivada de `SUPPLIERS_ROUTE` (QC-44, R3).
 *
 * Mismo patron que `recipeEditRoute`: ningun archivo de producto incrusta la URL del detalle como
 * literal, se construye siempre aqui.
 */
export function supplierDetailRoute(id: string): string {
  return `${SUPPLIERS_ROUTE}/${id}`;
}

/**
 * Pantalla de pedidos (QC-35, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. Como `SUPPLIERS_ROUTE`, esta constante **nace** aqui —no se muda
 * desde la navegacion—, asi que no necesita reexport de compatibilidad: nadie la importaba antes.
 *
 * **No hay helper de ruta de detalle**: no hay pagina de detalle de un pedido (R1). La lista, el
 * alta, la edicion, la cancelacion y el borrado ocurren todos en esta misma ruta.
 */
export const ORDERS_ROUTE = '/pedidos';

/** Ruta aun inexistente (S6): hoy devuelve 404 y el slug definitivo esta sin confirmar. */
export const FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena';

/**
 * Prefijos de URL que cuelgan de `app/(private)/` y, por tanto, exigen sesion valida (R1).
 *
 * `(private)` es un route group: **no aparece en la URL**, asi que el middleware no puede
 * deducir del camino que una ruta es privada y hay que declararlo. Para que la declaracion no se
 * quede atras del arbol de archivos, `tests/guards/guard-rutas-privadas-cubiertas.test.ts`
 * compara esta lista con las carpetas que tienen `page.tsx` bajo `app/(private)/`: una pantalla
 * nueva sin prefijo que la cubra pone el gate en rojo con su nombre, y un prefijo que ya no
 * corresponde a ninguna pantalla, tambien.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  DASHBOARD_ROUTE,
  INVENTORY_ROUTE,
  FORMULAS_ROUTE,
  // QC-44 R5: UNA sola entrada cubre la lista y el detalle. La guardia y el middleware comparan
  // por segmentos (`route === prefix || route.startsWith(prefix + '/')`), asi que
  // `/proveedores/<id>` ya cae dentro; una segunda fila para el detalle seria redundante.
  SUPPLIERS_ROUTE,
  // QC-35 R4: la pantalla de pedidos. `(private)` no aparece en la URL, asi que sin esta fila
  // `/pedidos` se serviria SIN sesion. Una sola entrada: no hay pagina de detalle (R1).
  ORDERS_ROUTE,
] as const;
