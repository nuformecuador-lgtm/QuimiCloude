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
 * NO HAY ENVOLTURA DE LOTE, y es deliberado (decidido el 2026-09-11 al cerrar la revision F2.2).
 * Hubo una -`batchCompanyScope`, `Prisma.ProductBatchWhereInput`- y se BORRO por no tener ningun
 * consumidor de produccion: `product_batches` NO TIENE NINGUNA LECTURA PROPIA en este modulo. Su
 * unica lectura llega por la fila de producto de `addBatchToAlive`, que ya va acotada con
 * `productCompanyScope`, y sus dos escrituras son creaciones, que se acotan con
 * `companyScopeColumns` -otro tipo, `…UncheckedCreateInput`, no un `where`-. Una exportacion que
 * solo usa su propio test no filtra ninguna consulta: parece cobertura y no lo es.
 *
 * El dia que haga falta un `where` de lote -QC-81, con la unicidad `(empresa, lote)`- se
 * reintroduce **con su consumidor en la misma tanda**, delegando en `companyScope` igual que
 * estas dos. Volver a escribirla cuesta tres lineas; dejarla suelta cuesta una afirmacion falsa
 * sobre lo que el modulo filtra.
 */
export function productCompanyScope(scope: InventoryScope): Prisma.ProductWhereInput {
  return companyScope(scope);
}

export function presentationCompanyScope(scope: InventoryScope): Prisma.PresentationWhereInput {
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
 * el tipo con el que se publica. No hay ninguna envoltura por tabla porque la columna se llama
 * igual y es `string` obligatoria en las tres. Esta es, ademas, la unica via por la que el ambito
 * llega a `product_batches`: el lote se ESCRIBE con empresa y no se LEE por su cuenta.
 */
export function companyScopeColumns(scope: InventoryScope): { readonly companyId: string } {
  return companyScope(scope);
}
