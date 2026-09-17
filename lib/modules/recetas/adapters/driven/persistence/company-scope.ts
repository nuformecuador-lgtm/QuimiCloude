import type { Prisma } from '@prisma/client';

import type { RecipeScope } from '../../../domain/recipe-scope';

/**
 * La unica definicion de «de la empresa» del modulo `recetas`; toda consulta o escritura de
 * `recipes` la toma de aqui para que no haya copias que diverjan.
 *
 * - Las lecturas la componen con `AND`, nunca fundida con la busqueda ni con los filtros: un
 *   `OR` al mismo nivel que `companyId`, o fundirla con `nameNormalized`, dejaria que un
 *   termino de busqueda ampliara lo visible mas alla de la propia empresa.
 * - El `count` de un listado usa LITERALMENTE el mismo objeto `where` que el `findMany`: un
 *   `total` calculado con un ambito distinto describiria un conjunto que la pagina no muestra.
 * - Las escrituras sobre una fila existente la llevan en el `where`, no en un `if` posterior:
 *   leer primero y decidir despues ya es haber leido lo ajeno.
 * - El alta escribe la columna desde `companyScopeColumns`, no desde este `where`: en
 *   `Prisma.RecipeWhereInput` la columna es un filtro OPCIONAL (`UuidFilter | string`), y algo
 *   opcional no sirve para parametrizar un `create`.
 * - Las lineas de una receta (`recipe_lines`) NO llevan ambito propio, y eso no es una
 *   excepcion a esta regla: su empresa es la de la receta a la que pertenecen, ya probada por
 *   el `updateMany` acotado que corre antes, dentro de la misma transaccion. No hay ninguna
 *   otra excepcion en este modulo.
 */
function companyScope(scope: RecipeScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/**
 * Las dos envolturas delegan en `companyScope` y existen solo para tipar. `Prisma.RecipeWhereInput`
 * hace que componer el ambito sobre otra tabla no compile.
 */
export function recipeCompanyScope(scope: RecipeScope): Prisma.RecipeWhereInput {
  return companyScope(scope);
}

/**
 * La misma definicion para una escritura: en `RecipeWhereInput` `companyId` es opcional y puede
 * ser un filtro, asi que no sirve para parametrizar el `data` de un `create`.
 */
export function companyScopeColumns(scope: RecipeScope): { readonly companyId: string } {
  return companyScope(scope);
}
