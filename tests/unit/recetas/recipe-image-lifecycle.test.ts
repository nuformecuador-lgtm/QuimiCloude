// T17 — Ciclo de vida de la imagen en la edicion (`design.md > 7.1`, `> 9.3`;
// `tasks.md > T17`). Cierra R47, R48, R49: los tres estados de `image` (omitido / nueva /
// null), que los DOS caminos de borrado -reemplazar y quitar- llaman al MISMO `remove`
// del puerto, y que un `remove` que rechaza NO hace fallar la edicion y devuelve la
// advertencia con contexto.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

// QC-74 (R16, R18): el actor ya no lleva nombre de rol, lleva el conjunto de permisos.
// Los dos codigos de `recetas`, que es lo que exigen los cinco casos de uso.
const ADMIN: Actor = { id: 'admin-1', permissions: ['recetas.consultar', 'recetas.modificar'] };
const AHORA = new Date('2026-09-03T10:00:00.000Z');

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  lines: [],
};

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]);

function filaCon(imagePath: string | null): RecipeRow {
  return {
    id: 'receta-1',
    name: RECETA_VALIDA.name,
    description: null,
    steps: [],
    imagePath,
    createdBy: ADMIN.id,
    updatedBy: ADMIN.id,
    createdAt: AHORA,
    updatedAt: AHORA,
    lines: [],
  };
}

function montarRepositorio(overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaCon('recetas/anterior.jpg')),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    ...overrides,
  };
}

function montarAlmacenamiento(overrides: Partial<RecipeImageStorage> = {}): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/nueva.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
    ...overrides,
  };
}

function montarCatalogo(): ProductCatalog {
  return { findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []) };
}

/** Doble simple de `UnitCatalog`: este archivo prueba el ciclo de vida de la imagen
 *  (R47-R49), no R50, y todas sus recetas van sin lineas -no hace falta variar el doble. */
function montarCatalogoUnidades(): UnitCatalog {
  return {
    findRefs: vi.fn<UnitCatalog['findRefs']>(async () => []),
    findRefsSharingBaseInCompany: vi.fn<UnitCatalog['findRefsSharingBaseInCompany']>(async () => []),
  };
}

describe('R47 — image omitido conserva la imagen sin tocar el almacenamiento', () => {
  it('image omitido conserva imagePath existente, no llama a upload ni a remove', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    await updateRecipe('receta-1', RECETA_VALIDA, ADMIN);

    expect(images.upload).not.toHaveBeenCalled();
    expect(images.remove).not.toHaveBeenCalled();
    const [, datos] = (recipes.replaceAlive as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      NewRecipe,
    ];
    expect(datos.imagePath).toBe('recetas/anterior.jpg');
  });
});

describe('R47 — image null deja la receta sin ruta y borra el archivo', () => {
  it('image null persiste imagePath NULL y borra el archivo anterior', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    const resultado = await updateRecipe('receta-1', { ...RECETA_VALIDA, image: null }, ADMIN);

    expect(images.upload).not.toHaveBeenCalled();
    expect(images.remove).toHaveBeenCalledWith('recetas/anterior.jpg');
    const [, datos] = (recipes.replaceAlive as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      NewRecipe,
    ];
    expect(datos.imagePath).toBeNull();
    expect(resultado.warnings).toEqual([]);
  });

  it('image null sobre una receta que ya no tenia imagen no llama a remove', async () => {
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaCon(null)),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    await updateRecipe('receta-1', { ...RECETA_VALIDA, image: null }, ADMIN);

    expect(images.remove).not.toHaveBeenCalled();
  });
});

describe('R26 — image { bytes } sube, persiste la ruta nueva y borra la anterior', () => {
  it('sube la imagen nueva, persiste su ruta y borra la anterior', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    const resultado = await updateRecipe(
      'receta-1',
      { ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } },
      ADMIN,
    );

    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(images.remove).toHaveBeenCalledWith('recetas/anterior.jpg');
    const [, datos] = (recipes.replaceAlive as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      NewRecipe,
    ];
    expect(datos.imagePath).toBe('recetas/nueva.jpg');
    expect(resultado.warnings).toEqual([]);
  });
});

describe('R48 — un solo remove para los dos caminos de borrado', () => {
  it('reemplazar y quitar la imagen llaman al mismo remove del puerto, que es la unica operacion de borrado', async () => {
    const products = montarCatalogo();

    // Camino 1: reemplazar.
    const imagesReemplazo = montarAlmacenamiento();
    const recipesReemplazo = montarRepositorio();
    const updateReemplazo = createUpdateRecipe({
      recipes: recipesReemplazo,
      products,
      units: montarCatalogoUnidades(),
      images: imagesReemplazo,
      now: () => AHORA,
    });
    await updateReemplazo('receta-1', { ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } }, ADMIN);

    // Camino 2: quitar.
    const imagesQuitar = montarAlmacenamiento();
    const recipesQuitar = montarRepositorio();
    const updateQuitar = createUpdateRecipe({
      recipes: recipesQuitar,
      products,
      units: montarCatalogoUnidades(),
      images: imagesQuitar,
      now: () => AHORA,
    });
    await updateQuitar('receta-1', { ...RECETA_VALIDA, image: null }, ADMIN);

    // El puerto `RecipeImageStorage` no tiene ningun otro metodo de borrado que
    // `remove`: no hay `clearImage`, `deleteObject` ni equivalente (`design.md > 12.10`).
    // Los dos caminos, sobre dobles independientes, llaman exactamente a ESE metodo con
    // la misma ruta -es la unica operacion posible.
    expect(imagesReemplazo.remove).toHaveBeenCalledWith('recetas/anterior.jpg');
    expect(imagesQuitar.remove).toHaveBeenCalledWith('recetas/anterior.jpg');
    expect(Object.keys(imagesReemplazo)).toContain('remove');
  });
});

describe('R49 — un remove que falla no revierte la edicion', () => {
  it('si el remove falla la edicion no se revierte y devuelve la advertencia con su contexto', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento({
      remove: vi.fn<RecipeImageStorage['remove']>(async () => {
        throw new Error('el bucket no respondio');
      }),
    });
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    // No debe lanzar ni propagar el fallo de `remove`: la edicion resuelve igual.
    const resultado = await updateRecipe('receta-1', { ...RECETA_VALIDA, image: null }, ADMIN);

    expect(resultado.id).toBe('receta-1');
    expect(resultado.warnings).toHaveLength(1);
    expect(resultado.warnings[0]).toMatchObject({
      operation: 'remove',
      path: 'recetas/anterior.jpg',
    });
    expect(resultado.warnings[0].message).toContain('el bucket no respondio');
    // La edicion ya quedo persistida: `replaceAlive` se llamo antes de que `remove`
    // fallara, y el fallo posterior no la deshace.
    expect(recipes.replaceAlive).toHaveBeenCalledTimes(1);
  });

  it('el mismo caso con el camino de reemplazo tambien devuelve la advertencia sin revertir', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento({
      remove: vi.fn<RecipeImageStorage['remove']>(async () => {
        throw new Error('timeout de red');
      }),
    });
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    const resultado = await updateRecipe(
      'receta-1',
      { ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } },
      ADMIN,
    );

    expect(resultado.warnings).toHaveLength(1);
    expect(resultado.warnings[0].operation).toBe('remove');
    expect(recipes.replaceAlive).toHaveBeenCalledTimes(1);
  });
});
