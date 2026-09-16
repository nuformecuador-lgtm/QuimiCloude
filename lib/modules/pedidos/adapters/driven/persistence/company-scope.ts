import type { Prisma } from '@prisma/client';

import type { OrderScope } from '../../../domain/order-scope';

/**
 * LA definicion de «de la empresa» del modulo `pedidos` (QC-60 R18, `design.md > 5`). Se escribe
 * UNA sola vez, aqui.
 *
 * Antes de esta ficha no habia un punto unico: hay SIETE sitios que tocan `orders` -el alta en SQL
 * crudo, `findAliveOrderById`, `buildOrderWhere` (compartido por el `findMany` y el `count`),
 * `updateAliveOrder`, `cancelAliveOrder`, `softDeleteAliveOrder` y `findAliveOrderTargetById` del
 * catalogo-. Escribir `companyId: scope.companyId` en cada uno serian siete copias que manana
 * pueden divergir, y la consulta numero ocho -la que escriba otra ficha dentro de tres semanas- es
 * la que se olvida y le ensena a una empresa lo que no es suyo (decision cerrada 9).
 *
 * REGLAS DE USO, que la guardia estatica por funcion y los tests hacen cumplir:
 *
 * - **Toda LECTURA compone el ambito con `AND`** con lo demas, NUNCA fundido en el mismo objeto que
 *   los filtros: un `OR` y el `companyId` al mismo nivel dejarian que un filtro AMPLIE lo visible.
 *   En `buildOrderWhere` el ambito entra ANTES de los filtros y al mismo nivel que `deletedAt:
 *   null`, que es exactamente el sitio donde el codigo ya demuestra que no se olvida.
 * - **El `count` del listado usa LITERALMENTE el mismo objeto `where`** que el `findMany` (R19): el
 *   total no puede describir un conjunto distinto del que se devuelve.
 * - **Toda ESCRITURA que apunte a una fila existente** (los tres `updateMany`) lleva el ambito EN EL
 *   `where`, no en un `if` posterior sobre la fila ya leida: leer primero y decidir despues ya es
 *   haber leido lo ajeno. Mismo criterio con el que `deleted_at IS NULL` vive en el `where` desde
 *   QC-34 R40.
 * - **El ALTA escribe `companyId` desde `companyScopeColumns`** (R22). La empresa NO viaja en
 *   `NewOrder` ni en `createOrderSchema`: lo que no esta en el tipo no se puede escribir por
 *   accidente, y lo que el esquema no declara se rechaza por campo desconocido.
 * - **EL CASO RARO: el alta va en SQL crudo** y no puede recibir un `Prisma.OrderWhereInput`. Recibe
 *   `companyScopeColumns(scope).companyId` como PARAMETRO TIPADO del template tag (`::uuid`), jamas
 *   interpolado como cadena; y lo usa en los DOS sitios de la misma sentencia: la columna que
 *   escribe y el `WHERE` del subselect que calcula el maximo del correlativo (R24). Si el maximo se
 *   leyera de otra empresa -o de todas-, la serie de una empresa la moverian los pedidos de otra,
 *   que es literalmente lo que la decision cerrada 2 prohibe.
 *
 * **NO HAY NINGUNA EXCEPCION.** A diferencia de QC-49, que dejo `findProductRefs`
 * (`product-catalog-prisma.ts`) fuera de ambito por escrito (su R29) porque `recetas` lo llama sin
 * sesion, aqui **hasta `OrderCatalog` se acota** (`design.md > 6`, alternativa I descartada): sus
 * cuatro llamantes son casos de uso de `asignaciones` que ya tienen la empresa en su propio
 * `Actor`. La guardia de `design.md > 8` no lleva lista de excepciones, y eso es una mejora sobre el
 * precedente: una excepcion heredada sin heredar su motivo es un agujero con coartada.
 *
 * NO AUTORIZA NADA: es un criterio de FILTRADO. El permiso ya se comprobo en la primera linea del
 * caso de uso con `requirePermission`, antes de zod y antes de llegar hasta aqui (R28).
 */
function companyScope(scope: OrderScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/**
 * Las DOS envolturas existen SOLO PARA TIPAR: las dos delegan en `companyScope`, asi que hay UNA
 * definicion y no dos. Cambiar que significa «de la empresa» es cambiar una linea, y las siete
 * operaciones del modulo cambian con ella.
 *
 * El tipo concreto (`Prisma.OrderWhereInput`) es lo que hace que componer el ambito sobre la tabla
 * equivocada NO COMPILE, en vez de filtrar por una columna que casualmente se llama igual en otra
 * tabla.
 */
export function orderCompanyScope(scope: OrderScope): Prisma.OrderWhereInput {
  return companyScope(scope);
}

/**
 * LA MISMA definicion, en la forma que necesita una ESCRITURA (R22, R24).
 *
 * La envoltura de arriba esta tipada como `OrderWhereInput`, y ahi `companyId` es
 * `UuidFilter | string` Y OPCIONAL: no sirve ni para el `data` de una creacion tipada ni para sacar
 * la cadena que el template tag del alta tiene que parametrizar. Sin esta segunda envoltura, el
 * alta escribiria `scope.companyId` a mano -una copia mas de la definicion, y justo en la operacion
 * mas delicada del modulo-.
 */
export function companyScopeColumns(scope: OrderScope): { readonly companyId: string } {
  return companyScope(scope);
}
