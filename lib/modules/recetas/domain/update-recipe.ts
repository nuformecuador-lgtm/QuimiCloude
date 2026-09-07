import { requirePermission, type Actor } from './actor';
import { DuplicateNameError, NotFoundError, ValidationError } from './errors';
import { validateRecipeImage } from './recipe-image';
import { updateRecipeSchema } from './recipe-input';

import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository } from '../ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

/** Advertencia de un borrado de almacenamiento que fallo, con su contexto (R49). */
export type StorageWarning = {
  readonly operation: 'remove';
  readonly path: string;
  readonly message: string;
};

export type UpdateRecipeResult = {
  readonly id: string;
  readonly warnings: readonly StorageWarning[];
};

export type UpdateRecipeDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  readonly images: RecipeImageStorage;
  /** Ver el comentario identico en `create-recipe.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Intenta borrar `path` del almacenamiento sin dejar que un fallo propague ni se trague
 * en silencio (R49, decision de la pregunta 6): la edicion ya persistio y esta correcta,
 * asi que un `remove` que rechaza se convierte en advertencia CON CONTEXTO -que operacion
 * y sobre que ruta-, nunca en un `catch` vacio.
 */
async function removeImageSafely(
  images: RecipeImageStorage,
  path: string,
): Promise<StorageWarning | null> {
  try {
    await images.remove(path);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { operation: 'remove', path, message };
  }
}

/**
 * Edicion de receta (R6, R11, R13, R37, R45-R49). `requirePermission(actor, 'recetas.modificar')` es la
 * PRIMERA linea,
 * luego se valida la forma de `input` (`updateRecipeSchema`) y SOLO DESPUES se lee la
 * receta viva -para conocer su `imagePath` anterior y las lineas que ya tenia (R45)-,
 * respondiendo `NotFoundError` si no existe o ya esta borrada (R37). Ese orden evita
 * gastar una consulta a la base cuando el cuerpo de la peticion ya es invalido.
 */
export function createUpdateRecipe(
  deps: UpdateRecipeDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<UpdateRecipeResult> {
  const now = deps.now ?? (() => new Date());

  return async function updateRecipe(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<UpdateRecipeResult> {
    requirePermission(actor, 'recetas.modificar');

    const parsed = updateRecipeSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    const existing = await deps.recipes.findAliveById(id);
    if (existing === null) throw new NotFoundError();

    // R45, R46 (`design.md > 6`): diferencia de conjuntos. Solo se valida contra el
    // catalogo la linea NUEVA -la que no estaba ya en la receta-; la preexistente se
    // admite aunque su producto este borrado logicamente, sin preguntarle al catalogo.
    const idsYaEnLaReceta = new Set(existing.lines.map((line) => line.productId));
    const idsEnviados = data.lines.map((line) => line.productId);
    const idsANuevoValidar = idsEnviados.filter((productId) => !idsYaEnLaReceta.has(productId));

    if (idsANuevoValidar.length > 0) {
      const refs = await deps.products.findRefs(idsANuevoValidar);
      const foundIds = new Set(refs.map((ref) => ref.id));
      const missing = idsANuevoValidar.some((productId) => !foundIds.has(productId));
      if (missing) throw new ValidationError();
    }

    // R50: a diferencia de `productId` (que solo valida las lineas NUEVAS, R45/R46),
    // aqui se valida el `unitId` de TODAS las lineas de la lista FINAL en cada edicion
    // -no hay excepcion para lineas preexistentes: `Unit` no tiene borrado logico y R50
    // no la prevee-.
    const unitIdsEnviados = [...new Set(data.lines.map((line) => line.unitId))];
    if (unitIdsEnviados.length > 0) {
      const unitRefs = await deps.units.findRefs(unitIdsEnviados);
      const foundUnitIds = new Set(unitRefs.map((ref) => ref.id));
      const missingUnit = unitIdsEnviados.some((unitId) => !foundUnitIds.has(unitId));
      if (missingUnit) throw new ValidationError();
    }

    // R47 (`design.md > 7.1`, `> 9.3`): los TRES estados de `image`.
    let imagePath: string | null = existing.imagePath;
    let pathToRemove: string | null = null;

    if (data.image === undefined) {
      // omitido: conserva `imagePath`, no se llama al almacenamiento (R47).
    } else if (data.image === null) {
      // null explicito: quitarla. Persiste `imagePath: null` y borra el archivo anterior
      // -si tenia uno- DESPUES de que `replaceAlive` confirme (R47).
      imagePath = null;
      pathToRemove = existing.imagePath;
    } else {
      // { bytes }: nueva imagen. Sube ANTES de persistir, y borra la anterior DESPUES de
      // que `replaceAlive` confirme (R26, `design.md > 9.3`).
      const validation = validateRecipeImage(data.image.bytes);
      if (!validation.ok) throw new ValidationError();
      imagePath = await deps.images.upload({
        bytes: data.image.bytes,
        contentType: validation.contentType,
        extension: validation.extension,
      });
      pathToRemove = existing.imagePath;
    }

    const newRecipe: NewRecipe = {
      name: data.name,
      description: data.description ?? null,
      steps: data.steps,
      lines: data.lines,
      imagePath,
    };

    // R11, R12, R13: la conciliacion de las lineas y la transaccion viven en el
    // adaptador (`design.md > 8`), no aqui.
    const result = await deps.recipes.replaceAlive(id, newRecipe, actor.id, now());
    if (result === 'not_found') throw new NotFoundError();
    if (result === 'duplicate') throw new DuplicateNameError();

    // R26, R47, R48, R49: el borrado va DESPUES de que la base confirme, usa el MISMO
    // `remove` en los DOS caminos (reemplazar y quitar), y si falla NO revierte la
    // edicion ya persistida -se devuelve como advertencia con contexto-.
    const warnings: StorageWarning[] = [];
    if (pathToRemove !== null) {
      const warning = await removeImageSafely(deps.images, pathToRemove);
      if (warning !== null) warnings.push(warning);
    }

    return { id, warnings };
  };
}
