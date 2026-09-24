import type { Prisma } from '@prisma/client';

import type { InventoryScope } from '../../../domain/inventory-scope';

/**
 * LA definicion de «de la empresa» del modulo `inventario` (QC-49 R13, `design.md > 5`). Se
 * escribe UNA sola vez, aqui.
 *
 * Antes de esta ficha no habia un punto unico: hay tres adaptadores driven y, dentro de ellos,
 * dos constructores de `where` mas nueve consultas sueltas de lectura y escritura. Escribir
 * `companyId: scope.companyId` en cada sitio serian doce copias que manana pueden divergir, y la
 * consulta numero trece —la que escriba otra ficha dentro de tres semanas— es la que se olvida y
 * le ensena a una empresa lo que no es suyo.
 *
 * REGLAS DE USO, que el test hace cumplir:
 *
 * - **Toda LECTURA compone el ambito con `AND`** con lo demas. NUNCA fundido en el mismo objeto
 *   que la busqueda: un `OR` de busqueda y el `companyId` al mismo nivel dejarian que un termino
 *   de busqueda AMPLIE lo visible, que es exactamente el fallo contra el que avisa QC-76.
 * - **Toda ESCRITURA sobre una fila existente** (`updateMany`, `deleteMany`, el `findFirst` de
 *   `addBatchToAlive`) lleva el ambito EN EL `where`, no en un `if` posterior sobre la fila ya
 *   leida: leer primero y decidir despues ya es haber leido lo ajeno. Mismo criterio con el que
 *   `deleted_at IS NULL` vive en el `where` desde QC-20 R16.
 * - **Toda CREACION escribe `companyId` desde aqui** (R17). La empresa no viaja nunca en
 *   `NewProduct`, `NewProductBatch` ni `PresentationData`: lo que no esta en el tipo no se puede
 *   escribir por accidente ni ELEGIR desde la entrada del llamante.
 *
 * NO AUTORIZA NADA: es un criterio de FILTRADO. El permiso ya se comprobo en la primera linea
 * del caso de uso, antes de llegar hasta aqui.
 */
function companyScope(scope: InventoryScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/**
 * Las dos envolturas de `where` existen SOLO PARA TIPAR: las dos delegan en `companyScope`, asi
 * que hay UNA definicion y no dos. Cambiar que significa «de la empresa» es cambiar una linea, y
 * las doce consultas del modulo cambian con ella.
 *
 * El tipo concreto por tabla (`ProductWhereInput`, …) es lo que hace que una consulta que
 * componga el ambito de la tabla equivocada NO COMPILE, en vez de filtrar por una columna que
 * casualmente se llama igual en otra tabla.
 *
 * `batchCompanyScope` y `movementCompanyScope` siguen la misma regla: cada una tiene su propio
 * consumidor de produccion (`findBatchesOfAliveProduct` y `findBatchMovements`, mas abajo en el
 * modulo), asi que no son exportaciones que solo use su propio test.
 */
export function productCompanyScope(scope: InventoryScope): Prisma.ProductWhereInput {
  return companyScope(scope);
}

export function presentationCompanyScope(scope: InventoryScope): Prisma.PresentationWhereInput {
  return companyScope(scope);
}

export function batchCompanyScope(scope: InventoryScope): Prisma.ProductBatchWhereInput {
  return companyScope(scope);
}

export function movementCompanyScope(scope: InventoryScope): Prisma.InventoryMovementWhereInput {
  return companyScope(scope);
}

/** Misma regla, para `reservation_movements`: su consumidor es `findBatchMovements`, que une los
 *  dos libros para el historial de un lote. */
export function reservationMovementCompanyScope(
  scope: InventoryScope,
): Prisma.ReservationMovementWhereInput {
  return companyScope(scope);
}

/**
 * LA MISMA definicion, en la forma que necesita una CREACION (R17, `design.md > 5`).
 *
 * Las dos envolturas de arriba estan tipadas como `…WhereInput`, y ahi `companyId` es
 * `UuidFilter | string` Y OPCIONAL: esparcirlas dentro del `data` de un `create` no compila
 * -Prisma exige `companyId: string`, obligatorio, en los tres `…UncheckedCreateInput`-. Sin esta
 * cuarta envoltura, las cuatro creaciones del modulo (`createProduct`, el producto y el LOTE de
 * `createWithFirstBatch`, el lote de `addBatchToAlive` y `createPresentation`) tendrian que
 * escribir `companyId: scope.companyId` a mano, que son cuatro copias mas de la definicion —
 * exactamente lo que este archivo existe para impedir.
 *
 * DELEGA en `companyScope`, asi que sigue habiendo UNA sola definicion: lo unico que cambia es
 * el tipo con el que se publica.
 */
export function companyScopeColumns(scope: InventoryScope): { readonly companyId: string } {
  return companyScope(scope);
}
