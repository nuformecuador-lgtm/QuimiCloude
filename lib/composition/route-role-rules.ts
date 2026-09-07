// QC-22 T3 (corregido dos veces), QC-54 T8 — La lista concreta de reglas ruta→rol, como CABLEADO.
//
// **Vive en `lib/composition/` desde el 2026-09-03, por decision humana.** El motivo que sigue
// vigente: nombrar una ruta exige `INVENTORY_ROUTE` de `lib/shared/routes`, y el dominio de
// `identity` no puede importar `lib/shared` (`docs/architecture.md > La regla de dependencias`).
// El rol, en cambio, ya no exige nada de `lib/composition`: `identity/domain/roles.ts` es su
// unica fuente y su barrel la publica (QC-54 T1), asi que este archivo la importa como cualquier
// otro consumidor.
//
// Este archivo tiene que poder cargar en el BORDE: `middleware.ts` lo alcanza a traves de
// `identity/adapters/driving/route-guard-middleware.ts`. Por eso no importa Prisma, ni
// `next/headers`, ni `lib/composition/index.ts` (que si cablea Prisma). Lo hace cumplir
// `tests/guards/guard-middleware-edge.test.ts`, que recorre el cierre de imports desde la raiz.
//
// El TIPO `RouteRoleRule` y la BUSQUEDA `findRouteRule` siguen en el dominio de `identity`, que
// es donde se decide QUE regla gana. Aqui solo esta la LISTA.
//
// Esto NO es una frontera de autorizacion (R29 de QC-9): que una regla deje pasar solo significa
// que se enseña una pantalla. La autorizacion sobre datos y operaciones se valida en el caso de
// uso, antes del repositorio.

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import type { RouteRoleRule } from '@/lib/modules/identity';
import {
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

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
 * `ROLE_ADMINISTRADOR` se toma del **barrel** de `identity` —nunca por ruta profunda—, que es su
 * unica fuente (QC-54). Y `INVENTORY_ROUTE` sale de `lib/shared/routes`, unica constante de esa
 * ruta en el repositorio: declarar aqui otra es como se acaba con `/dashboard` y `/panel`
 * conviviendo.
 */
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [
  { prefix: INVENTORY_ROUTE, roles: [ROLE_ADMINISTRADOR] },
  { prefix: FORMULAS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
  // QC-44 R6 — la pantalla de proveedores, solo Administrador. UNA sola fila: la busqueda casa
  // por segmentos, asi que este prefijo cubre la lista y `/proveedores/<id>`. Reutiliza el
  // `ROLE_ADMINISTRADOR` que este archivo ya importa del barrel de `identity`: un segundo import
  // del mismo valor desde el barrel de `proveedores` seria la misma constante entrando dos veces
  // por dos puertas.
  { prefix: SUPPLIERS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
  // QC-35 R5 — la pantalla de pedidos, solo Administrador. UNA sola fila: no hay pagina de
  // detalle, y la busqueda casa por segmentos igualmente. Reutiliza el `ROLE_ADMINISTRADOR` que
  // este archivo ya importa del barrel de `identity` —su unica fuente desde QC-54—: un segundo
  // import del mismo valor desde el barrel de `pedidos` seria la misma constante entrando dos
  // veces por dos puertas. La fila solo anade una constante de `lib/shared/routes`, ya en el
  // cierre de imports, asi que este archivo sigue cargando en el BORDE (`guard-middleware-edge`).
  { prefix: ORDERS_ROUTE, roles: [ROLE_ADMINISTRADOR] },
];
