// T7 — Composicion de la URL de lectura (`design.md > 7.2`, `> 9.3`; `tasks.md > T7`).
// Cierra R24, R25: se persiste la RUTA (no la URL) y la URL se compone SOLO al leer, con
// un doble de `RecipeImageStorage` -que aqui implementa `publicUrl` como quiera, sin
// firma ni caducidad-. Confirma que ningun caso de uso conoce el bucket ni la URL del
// proyecto: el doble es libre de componer la URL de cualquier forma determinista.

import { ADMIN_ROLE_NAME, type Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';

const ADMIN: Actor = { id: 'admin-1', roleName: ADMIN_ROLE_NAME };
const AHORA = new Date('2026-09-03T10:00:00.000Z');

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  lines: [],
};

// Un doble que compone una URL PUBLICA sin firma ni caducidad -sin parametros de query,
// sin expiracion-, exactamente lo que R25 exige y lo unico que R24 permite conocer del
// almacenamiento fuera de su adaptador real.
function montarAlmacenamiento(overrides: Partial<RecipeImageStorage> = {}): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/foto-nueva.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>(
      (path) => `https://bucket-publico.example.supabase.co/storage/v1/object/public/recetas-bucket/${path}`,
    ),
    ...overrides,
  };
}

function montarRepositorio(overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => null),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    ...overrides,
  };
}

function montarCatalogo(): ProductCatalog {
  return { findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []) };
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]);

describe('R24 — se persiste la ruta, no la URL', () => {
  it('persiste la ruta dentro del bucket y compone la URL al leer', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await createRecipe({ ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } }, ADMIN);

    const [datos] = (recipes.create as ReturnType<typeof vi.fn>).mock.calls[0] as [NewRecipe];
    // La ruta que persiste el repositorio es la que devuelve `upload`, NUNCA una URL
    // completa: sin `http`, sin el nombre del bucket compuesto.
    expect(datos.imagePath).toBe('recetas/foto-nueva.jpg');
    expect(datos.imagePath).not.toMatch(/^https?:\/\//);

    // Al LEER, `get-recipe` compone la URL a partir de esa ruta, llamando a `publicUrl`
    // del puerto -nunca construyendola a mano en el caso de uso-.
    const filaConImagen: RecipeRow = {
      id: 'receta-1',
      name: RECETA_VALIDA.name,
      description: null,
      steps: [],
      imagePath: 'recetas/foto-nueva.jpg',
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      createdAt: AHORA,
      updatedAt: AHORA,
      lines: [],
    };
    const recipesConDetalle = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaConImagen),
    });
    const getRecipe = createGetRecipe({ recipes: recipesConDetalle, products, images });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(images.publicUrl).toHaveBeenCalledWith('recetas/foto-nueva.jpg');
    expect(detalle.imageUrl).toBe(
      'https://bucket-publico.example.supabase.co/storage/v1/object/public/recetas-bucket/recetas/foto-nueva.jpg',
    );
  });

  it('una receta sin imagen no llama a publicUrl y devuelve imageUrl null', async () => {
    const filaSinImagen: RecipeRow = {
      id: 'receta-1',
      name: RECETA_VALIDA.name,
      description: null,
      steps: [],
      imagePath: null,
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      createdAt: AHORA,
      updatedAt: AHORA,
      lines: [],
    };
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaSinImagen),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });

    const detalle = await getRecipe('receta-1', ADMIN);

    expect(detalle.imageUrl).toBeNull();
    expect(images.publicUrl).not.toHaveBeenCalled();
  });
});

describe('R25 — la URL compuesta es publica, sin firma ni caducidad', () => {
  it('la URL que compone el caso de uso no lleva firma ni parametro de expiracion', async () => {
    const filaConImagen: RecipeRow = {
      id: 'receta-1',
      name: RECETA_VALIDA.name,
      description: null,
      steps: [],
      imagePath: 'recetas/foto.jpg',
      createdBy: ADMIN.id,
      updatedBy: ADMIN.id,
      createdAt: AHORA,
      updatedAt: AHORA,
      lines: [],
    };
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaConImagen),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });

    const detalle = await getRecipe('receta-1', ADMIN);

    expect(detalle.imageUrl).not.toBeNull();
    expect(detalle.imageUrl).not.toMatch(/token=|signature=|expires=|Expires=/i);
  });
});
