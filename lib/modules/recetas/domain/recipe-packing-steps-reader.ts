import type { RecipeId } from './recipe-catalog';
import type { RecipeStepView } from './recipe-view';

/**
 * Contrato aparte de `RecipeCatalog` para el empaque: lo recibe solo quien empaca, y por su forma
 * no puede devolver los pasos del operador.
 */
export interface RecipePackingStepsReader {
  /** Los pasos de envasado con que se empaca una receta, INCLUIDA UNA DADA DE BAJA. Una version
   *  devuelve los de su original. `null` = el id no existe o es de otra empresa. */
  findPackingStepsById(id: RecipeId, companyId: string): Promise<readonly RecipeStepView[] | null>;
}
