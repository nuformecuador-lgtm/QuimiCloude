// QC-22 T3 (corregido dos veces) — La lista concreta de reglas ruta→rol, como CABLEADO.
//
// **Vive en `lib/composition/` desde el 2026-09-03, por decision humana.** El recorrido, porque
// las dos paradas anteriores explican por que esta es la buena:
//   1. `identity/domain/`: imposible. Nombrar una ruta exige `INVENTORY_ROUTE` de
//      `lib/shared/routes`, y el dominio no puede importar `lib/shared`
//      (`docs/architecture.md > La regla de dependencias`).
//   2. `identity/adapters/driving/`: apagaba `guard-arquitectura-modulos` pero encendia el
//      centinela de `tests/unit/inventario/schema/inventario-schema.test.ts`, que exige que todo
//      import del barrel de `inventario` hecho fuera de `lib/composition/` sea `import type`.
//      `ADMIN_ROLE_NAME` es un VALOR en ejecucion, asi que `import type` no sirve, y las salidas
//      alternativas —declarar `/inventario` como literal propio dentro de `identity`, o mudar
//      `ADMIN_ROLE_NAME`— estan descartadas: las dos duplican una constante unica.
//   3. `lib/composition/`: la capa de cableado del repo. La tabla de dependencias le permite
//      importar barriles de modulos **como valor** y `lib/shared/**`, asi que el centinela queda
//      satisfecho POR CONSTRUCCION y no por una exencion escrita a mano.
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

import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario';
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
 * `ADMIN_ROLE_NAME` se toma del **barrel** de `inventario` —nunca por ruta profunda y nunca como
 * `import type`, porque es un valor que se evalua—: un tercer literal del mismo rol es justo la
 * deuda que `actor.ts` ya declaro. Y `INVENTORY_ROUTE` sale de `lib/shared/routes`, unica
 * constante de esa ruta en el repositorio: declarar aqui otra es como se acaba con `/dashboard` y
 * `/panel` conviviendo.
 */
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [
  { prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] },
  { prefix: FORMULAS_ROUTE, roles: [ADMIN_ROLE_NAME] },
  // QC-44 R6 — la pantalla de proveedores, solo Administrador. UNA sola fila: la busqueda casa
  // por segmentos, asi que este prefijo cubre la lista y `/proveedores/<id>`. Reutiliza el
  // `ADMIN_ROLE_NAME` que este archivo ya importa del barrel de `inventario`: un segundo import
  // del mismo valor desde el barrel de `proveedores` seria la misma constante entrando dos veces
  // por dos puertas, y un literal nuevo del rol es la deuda que `actor.ts` ya declaro.
  { prefix: SUPPLIERS_ROUTE, roles: [ADMIN_ROLE_NAME] },
  // QC-35 R5 — la pantalla de pedidos, solo Administrador. UNA sola fila: no hay pagina de
  // detalle, y la busqueda casa por segmentos igualmente. Reutiliza el `ADMIN_ROLE_NAME` que
  // este archivo ya importa del barrel de `inventario`: un segundo import del mismo valor desde
  // el barrel de `pedidos` seria la misma constante entrando dos veces por dos puertas. La fila
  // solo anade una constante de `lib/shared/routes`, ya en el cierre de imports, asi que este
  // archivo sigue cargando en el BORDE (`guard-middleware-edge`).
  { prefix: ORDERS_ROUTE, roles: [ADMIN_ROLE_NAME] },
];
