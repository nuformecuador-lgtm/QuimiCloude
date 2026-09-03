// QC-22 T3 (corregido) — La lista concreta de reglas ruta→rol, como CONFIGURACION del borde.
//
// Vive en `adapters/driving/` y no en `domain/` porque nombrar una ruta exige `INVENTORY_ROUTE`
// de `lib/shared/routes`, y `domain/` no puede importar `lib/shared` (`docs/architecture.md >
// La regla de dependencias`). `driving` si puede: es su fila de la tabla. El TIPO `RouteRoleRule`
// y la BUSQUEDA `findRouteRule` siguen en el dominio, que es donde se decide QUE regla gana.
//
// Esto NO es una frontera de autorizacion (R29 de QC-9): que una regla deje pasar solo significa
// que se enseña una pantalla. La autorizacion sobre datos y operaciones se valida en el caso de
// uso, antes del repositorio.

import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario';
import type { RouteRoleRule } from '@/lib/modules/identity';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

/**
 * Conjunto declarado de reglas ruta→rol.
 *
 * QC-9 construyo el gancho —el tipo, la busqueda y su uso en `decideRouteAccess`— y dejo la lista
 * **vacia a proposito (D8, R12)**, con el encargo escrito de que «la primera sera la pantalla de
 * productos, solo Administrador». **Esa primera regla es la de abajo**, que trae QC-22 (R4).
 *
 * Toda ruta privada que NO case con ninguna fila sigue abierta a cualquier sesion valida, y eso
 * es el comportamiento especificado: cada ficha de modulo añade su fila, junto con su test.
 *
 * `ADMIN_ROLE_NAME` se toma del **barrel** de `inventario` —nunca por ruta profunda y nunca como
 * el literal `'Administrador'`—: un tercer literal del mismo rol es justo la deuda que `actor.ts`
 * ya declaro. Y `INVENTORY_ROUTE` sale de `lib/shared/routes`, unica constante de esa ruta en el
 * repositorio: declarar aqui otra es como se acaba con `/dashboard` y `/panel` conviviendo.
 */
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [
  { prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] },
];
