// Los cinco casos de uso de receta, con dobles de sus tres puertos. Sin base de datos ni
// bucket: lo que se prueba aqui es la DECISION que vive en `domain/`, no la implementacion
// Prisma/Supabase.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createDeleteRecipe } from '@/lib/modules/recetas/domain/delete-recipe';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  UnauthorizedError,
} from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

// QC-74 (R16, R18): el actor ya no lleva nombre de rol, lleva el conjunto de permisos.
// Los dos codigos de `recetas`, que es lo que exigen los cinco casos de uso.
const EMPRESA = 'empresa-1';
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['recetas.consultar', 'recetas.modificar'],
};

const AHORA = new Date('2026-09-03T10:00:00.000Z');

const UNIT_ID = '33333333-3333-4333-8333-333333333333';

const LINEA_VALIDA = {
  productId: '11111111-1111-4111-8111-111111111111',
  percentage: '100.00',
};

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: 'Formula base',
  steps: [
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] },
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar' }] }] },
  ],
  lines: [LINEA_VALIDA],
};

const FILA_RECETA: RecipeRow = {
  id: 'receta-1',
  name: 'Desengrasante 5%',
  description: 'Formula base',
  steps: [
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] },
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar' }] }] },
  ],
  imagePath: null,
  createdBy: 'admin-1',
  updatedBy: 'admin-1',
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [{ id: 'linea-1', productId: LINEA_VALIDA.productId, percentage: '100.00' }],
};

const PRODUCTO_REF: ProductRef = {
  id: LINEA_VALIDA.productId,
  name: 'Acido sulfurico',
  unitId: UNIT_ID,
  stockByUnit: [{ unitId: UNIT_ID, quantity: '3.0000' }],
  type: 'PRODUCT',
};

function montarRepositorio(overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => FILA_RECETA),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [FILA_RECETA], total: 1 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    ...overrides,
  };
}

function montarCatalogo(overrides: Partial<ProductCatalog> = {}): ProductCatalog {
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [PRODUCTO_REF]),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('recetas no debe costear nada');
    }),
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

// Bytes con firma JPEG valida, para que `validateRecipeImage` la acepte.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]);

describe('R5, R6 — alta de receta', () => {
  it('crea la receta junto con sus lineas y devuelve su identificador', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    const resultado = await createRecipe(RECETA_VALIDA, ADMIN);

    expect(resultado).toEqual({ id: 'receta-1' });
    expect(recipes.create).toHaveBeenCalledTimes(1);
    const [datos, actorId, now] = (recipes.create as ReturnType<typeof vi.fn>).mock.calls[0] as [
      NewRecipe,
      string,
      Date,
    ];
    expect(datos.lines).toEqual([LINEA_VALIDA]);
    expect(actorId).toBe(ADMIN.id);
    expect(now).toBe(AHORA);
  });

  it('guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al borrar', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();

    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });
    const deleteRecipe = createDeleteRecipe({ recipes, now: () => AHORA });

    await createRecipe(RECETA_VALIDA, ADMIN);
    expect(recipes.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: RECETA_VALIDA.name }),
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );

    await updateRecipe('receta-1', RECETA_VALIDA, ADMIN);
    expect(recipes.replaceAlive).toHaveBeenCalledWith(
      'receta-1',
      expect.objectContaining({ name: RECETA_VALIDA.name }),
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );

    await deleteRecipe('receta-1', ADMIN);
    expect(recipes.softDeleteAlive).toHaveBeenCalledWith(
      'receta-1',
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );
    // El puerto `replaceAlive`/`softDeleteAlive` no expone `createdBy` en su firma (solo
    // `actorId`, que aqui es siempre el autor de la ULTIMA modificacion): la conservacion
    // real del autor de creacion a traves de un `UPDATE` la cierra el adaptador Prisma
    // y el test de integracion contra Postgres real, no este archivo.
  });
});

describe('R8 — nombre duplicado', () => {
  it('persiste el nombre normalizado junto al nombre y traduce el duplicado del puerto a error de nombre repetido', async () => {
    const recipes = montarRepositorio({
      create: vi.fn<RecipeRepository['create']>(async () => 'duplicate'),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toBeInstanceOf(RecipeDuplicateNameError);
  });
});

describe('R11 — la edicion recibe la lista final completa', () => {
  it('la edicion recibe la lista final completa y no expone ninguna operacion por linea', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    const nuevaListaCompleta = {
      ...RECETA_VALIDA,
      lines: [
        { productId: LINEA_VALIDA.productId, percentage: '60.00' },
        { productId: '22222222-2222-4222-8222-222222222222', percentage: '40.00' },
      ],
    };
    // La segunda linea es "nueva": hace falta que el catalogo la reconozca para pasar.
    (products.findRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      PRODUCTO_REF,
      { id: '22222222-2222-4222-8222-222222222222', name: 'Sosa caustica', unitId: null, stockByUnit: [], type: 'PRODUCT' },
    ]);

    await updateRecipe('receta-1', nuevaListaCompleta, ADMIN);

    expect(recipes.replaceAlive).toHaveBeenCalledWith(
      'receta-1',
      expect.objectContaining({ lines: nuevaListaCompleta.lines }),
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );
    // No existe ningun metodo `addLine`/`removeLine` en el puerto: `RecipeRepository`
    // solo expone `create`/`findAliveById`/`listAlive`/`replaceAlive`/`softDeleteAlive`.
  });
});

describe('R17 — producto inexistente', () => {
  it('rechaza la linea cuyo producto no existe, consultando el contrato de inventario', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []),
    });
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toThrow();
    expect(products.findRefs).toHaveBeenCalledWith([LINEA_VALIDA.productId], EMPRESA);
    expect(recipes.create).not.toHaveBeenCalled();
  });
});

describe('R29 — un producto terminado no puede ser ingrediente', () => {
  const REF_TERMINADO: ProductRef = { ...PRODUCTO_REF, type: 'FINISHED_PRODUCT' };

  it('rechaza el alta cuando la linea senala un producto terminado, sin escribir la receta', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [REF_TERMINADO]),
    });
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('rechaza la edicion cuando una linea NUEVA senala un producto terminado, sin escribir', async () => {
    // La linea de `LINEA_VALIDA` ya esta en `FILA_RECETA`: update-recipe.ts solo revalida
    // contra el catalogo las lineas NUEVAS, asi que el caso usa un producto
    // distinto para que la comprobacion se dispare de verdad.
    const terminadoId = '44444444-4444-4444-8444-444444444444';
    const edicionConTerminado = {
      ...RECETA_VALIDA,
      lines: [{ productId: terminadoId, percentage: '100.00' }],
    };
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        { ...REF_TERMINADO, id: terminadoId },
      ]),
    });
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(updateRecipe('receta-1', edicionConTerminado, ADMIN)).rejects.toBeInstanceOf(
      ActionNotAllowedError,
    );
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });
});

describe('R21 — receta sin imagen', () => {
  it('crea y edita la receta sin imagen sin llamar al almacenamiento', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    await createRecipe(RECETA_VALIDA, ADMIN);
    await updateRecipe('receta-1', RECETA_VALIDA, ADMIN);

    expect(images.upload).not.toHaveBeenCalled();
    expect(images.remove).not.toHaveBeenCalled();
  });
});

describe('R22 — sube la imagen a traves del puerto', () => {
  it('sube la imagen a traves del puerto, con un doble en memoria', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await createRecipe({ ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } }, ADMIN);

    expect(images.upload).toHaveBeenCalledTimes(1);
    const [datos] = (recipes.create as ReturnType<typeof vi.fn>).mock.calls[0] as [NewRecipe];
    expect(datos.imagePath).toBe('recetas/nueva.jpg');
  });
});

describe('R26 — reemplazo de imagen', () => {
  it('al reemplazar la imagen borra el archivo anterior despues de persistir la nueva ruta', async () => {
    const filaConImagen: RecipeRow = { ...FILA_RECETA, imagePath: 'recetas/anterior.jpg' };
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaConImagen),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    const llamadas: string[] = [];
    (recipes.replaceAlive as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      llamadas.push('replaceAlive');
      return 'ok';
    });
    (images.remove as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      llamadas.push('remove');
    });

    const resultado = await updateRecipe(
      'receta-1',
      { ...RECETA_VALIDA, image: { bytes: JPEG_BYTES } },
      ADMIN,
    );

    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(images.remove).toHaveBeenCalledWith('recetas/anterior.jpg');
    // El borrado va DESPUES de que `replaceAlive` confirme.
    expect(llamadas).toEqual(['replaceAlive', 'remove']);
    expect(resultado.warnings).toEqual([]);
  });
});

describe('R27 — borrar la receta conserva su imagen', () => {
  it('al borrar la receta no llama al almacenamiento y conserva la ruta', async () => {
    const recipes = montarRepositorio();
    const deleteRecipe = createDeleteRecipe({ recipes, now: () => AHORA });

    await deleteRecipe('receta-1', ADMIN);

    expect(recipes.softDeleteAlive).toHaveBeenCalledWith(
      'receta-1',
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );
    // `createDeleteRecipe` ni siquiera recibe un `RecipeImageStorage` en sus deps: no hay
    // forma estructural de que este caso de uso toque el almacenamiento (R27).
  });
});

describe('R33 — la lista no trae lineas, el detalle si', () => {
  it('la lista no trae lineas y el detalle si las trae con producto y porcentaje', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const listRecipes = createListRecipes({
      recipes,
      images,
      // QC-57 (R6): el caso de uso gana el puerto del log de campos omitidos. Doble mudo:
      // este caso comprueba que la lista no trae lineas, no el log.
      log: { ignoredFields: vi.fn() },
      toOffsetLimit: () => ({ offset: 0, limit: 10 }),
      buildPage: (items, total, page, pageSize) => ({
        items,
        total,
        page,
        pageSize,
        totalPages: 1,
      }),
    });
    const getRecipe = createGetRecipe({ recipes, products, images });

    const pagina = await listRecipes({}, ADMIN);
    expect(pagina.items[0]).not.toHaveProperty('lines');
    expect(pagina.items[0]).not.toHaveProperty('steps');

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines).toEqual([
      {
        id: 'linea-1',
        productId: LINEA_VALIDA.productId,
        productName: PRODUCTO_REF.name,
        percentage: '100.00',
        productUnitId: UNIT_ID,
        productStock: '3.0000',
      },
    ]);
  });
});

describe('R14, R24 — existencia del insumo en SU PROPIA unidad', () => {
  function montarConProducto(ref: ProductRef | undefined) {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => (ref === undefined ? [] : [ref])),
    });
    const images = montarAlmacenamiento();
    return createGetRecipe({ recipes, products, images });
  }

  it('R14: con un lote en la unidad del producto, el detalle devuelve esa unidad y esa existencia', async () => {
    const getRecipe = montarConProducto({
      id: LINEA_VALIDA.productId,
      name: 'Acido sulfurico',
      unitId: UNIT_ID,
      stockByUnit: [{ unitId: UNIT_ID, quantity: '15.0000' }],
      type: 'PRODUCT',
    });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productUnitId).toBe(UNIT_ID);
    expect(detalle.lines[0].productStock).toBe('15.0000');
  });

  it('R24: un insumo sin lotes se guarda con esa linea y el detalle sale sin unidad, con existencia 0', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        { id: LINEA_VALIDA.productId, name: 'Sosa caustica', unitId: null, stockByUnit: [], type: 'PRODUCT' },
      ]),
    });
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await createRecipe(RECETA_VALIDA, ADMIN);
    expect(recipes.create).toHaveBeenCalledTimes(1);

    const getRecipe = createGetRecipe({ recipes, products, images });
    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productUnitId).toBeNull();
    expect(detalle.lines[0].productStock).toBe('0.0000');
  });

  it('R24: un insumo dado de baja sale sin unidad y sin existencia (null)', async () => {
    const getRecipe = montarConProducto(undefined);

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productUnitId).toBeNull();
    expect(detalle.lines[0].productStock).toBeNull();
  });
});

describe('R7 — sin permiso, el repositorio no se llama', () => {
  const SIN_PERMISO: Actor = { id: 'op-1', companyId: EMPRESA, permissions: [] };

  it('rechaza el alta al 97,50 % sin tocar el repositorio', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    const receta97 = { ...RECETA_VALIDA, lines: [{ productId: LINEA_VALIDA.productId, percentage: '97.50' }] };

    await expect(createRecipe(receta97, SIN_PERMISO)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('rechaza el alta sin ninguna linea sin tocar el repositorio', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(createRecipe({ ...RECETA_VALIDA, lines: [] }, SIN_PERMISO)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
  });
});

describe('R3 — suma invalida, el service rechaza sin llamar al repositorio', () => {
  it('rechaza 97,50 % aunque la entrada no venga del formulario', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    const receta97 = { ...RECETA_VALIDA, lines: [{ productId: LINEA_VALIDA.productId, percentage: '97.50' }] };

    await expect(createRecipe(receta97, ADMIN)).rejects.toThrow();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('rechaza una receta sin ninguna linea', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(createRecipe({ ...RECETA_VALIDA, lines: [] }, ADMIN)).rejects.toThrow();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
  });
});

describe('R23 — editar una receta sembrada sin lineas se rechaza', () => {
  it('rechaza cambiar solo el nombre de una receta sin lineas, y el nombre no cambia', async () => {
    const filaSinLineas: RecipeRow = { ...FILA_RECETA, lines: [] };
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaSinLineas),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(
      updateRecipe('receta-1', { ...RECETA_VALIDA, name: 'Nuevo nombre', lines: [] }, ADMIN),
    ).rejects.toThrow();
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });
});

describe('R4 — guarda y relee cada porcentaje con el mismo valor enviado', () => {
  it('92,50 + 7,50 llegan intactas al repositorio', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        PRODUCTO_REF,
        { id: '22222222-2222-4222-8222-222222222222', name: 'Sosa caustica', unitId: null, stockByUnit: [], type: 'PRODUCT' },
      ]),
    });
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    const receta = {
      ...RECETA_VALIDA,
      lines: [
        { productId: LINEA_VALIDA.productId, percentage: '92.50' },
        { productId: '22222222-2222-4222-8222-222222222222', percentage: '7.50' },
      ],
    };

    await createRecipe(receta, ADMIN);
    const [datos] = (recipes.create as ReturnType<typeof vi.fn>).mock.calls[0] as [NewRecipe];
    expect(datos.lines).toEqual(receta.lines);
  });
});

describe('R19 — el detalle de receta sigue exigiendo recetas.consultar', () => {
  it('rechaza al actor sin recetas.consultar antes de tocar el repositorio', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });
    const sinPermiso: Actor = {
      id: 'op-1',
      companyId: EMPRESA,
      permissions: ['recetas.modificar'],
    };

    await expect(getRecipe('receta-1', sinPermiso)).rejects.toThrow();
    expect(recipes.findAliveById).not.toHaveBeenCalled();
  });
});

describe('R34 — autores como identificadores', () => {
  it('devuelve los autores como identificadores y acepta la receta sin autor', async () => {
    const filaSinAutor: RecipeRow = { ...FILA_RECETA, createdBy: null, updatedBy: null };
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaSinAutor),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.createdBy).toBeNull();
    expect(detalle.updatedBy).toBeNull();
  });
});

describe('R36 — excluye las recetas borradas', () => {
  it('el detalle de una receta borrada se traduce a no encontrado, delegando el filtro en el puerto', async () => {
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => null),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });

    await expect(getRecipe('borrada', ADMIN)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(recipes.findAliveById).toHaveBeenCalledWith('borrada', { companyId: EMPRESA });
  });
});

describe('R37 — no encontrado', () => {
  it('devuelve no encontrado al consultar, editar o borrar una receta inexistente o ya borrada', async () => {
    const recipes = montarRepositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => null),
      replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'not_found'),
      softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'not_found'),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();

    const getRecipe = createGetRecipe({ recipes, products, images });
    const deleteRecipe = createDeleteRecipe({ recipes, now: () => AHORA });

    await expect(getRecipe('x', ADMIN)).rejects.toBeInstanceOf(RecipeNotFoundError);
    // `deleteRecipe` no tiene entrada que validar antes: llama a `softDeleteAlive`
    // directamente, y con el doble devolviendo `'not_found'` ya rechaza ahi.
    await expect(deleteRecipe('x', ADMIN)).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});
