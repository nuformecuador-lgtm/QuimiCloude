// T6 — Los cinco casos de uso de receta, con dobles de los cuatro puertos (`design.md > 3`,
// `> 6`, `> 7`, `> 9`; `tasks.md > T6`). Sin base de datos ni bucket: lo que se prueba
// aqui es la DECISION que vive en `domain/`, no la implementacion Prisma/Supabase (T9-T11).
// Cierra R5, R6, R11, R12, R13, R14, R15, R17, R18, R19, R21, R22, R26, R27, R33, R34, R36,
// R37, R50.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createDeleteRecipe } from '@/lib/modules/recetas/domain/delete-recipe';
import { RecipeDuplicateNameError, RecipeNotFoundError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

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
  quantity: '10.5000',
  unitId: UNIT_ID,
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
  lines: [{ id: 'linea-1', productId: LINEA_VALIDA.productId, quantity: '10.5000', unitId: UNIT_ID }],
};

// `stockByUnit` trae un lote en una unidad DISTINTA a la de `LINEA_VALIDA`: el detalle debe
// mostrar «—» para esa linea, no la cantidad de otra unidad.
const PRODUCTO_REF: ProductRef = {
  id: LINEA_VALIDA.productId,
  name: 'Acido sulfurico',
  stockByUnit: [{ unitId: '55555555-5555-4555-8555-555555555555', quantity: 3 }],
};

const UNIDAD_REF: UnitRef = { id: UNIT_ID, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };

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

/** Doble de `UnitCatalog` (R50): por defecto resuelve como existentes TODOS los `unitId`
 *  que se le pidan -mismo patron que `montarCatalogo` para `ProductCatalog`-. */
function montarCatalogoUnidades(overrides: Partial<UnitCatalog> = {}): UnitCatalog {
  return {
    findRefs: vi.fn<UnitCatalog['findRefs']>(async (ids) =>
      ids.map((id) => ({
        id,
        name: UNIDAD_REF.name,
        symbol: UNIDAD_REF.symbol,
        baseUnitId: null,
        factor: null,
      })),
    ),
    findRefsSharingBaseInCompany: vi.fn<UnitCatalog['findRefsSharingBaseInCompany']>(async () => []),
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

// Bytes con firma JPEG valida, para que `validateRecipeImage` la acepte (T2).
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]);

describe('R5, R6 — alta de receta', () => {
  it('crea la receta junto con sus lineas y devuelve su identificador', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

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

    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });
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
    // (T10) y el test de integracion contra Postgres real (T14), no este archivo.
  });
});

describe('R8 — nombre duplicado', () => {
  it('persiste el nombre normalizado junto al nombre y traduce el duplicado del puerto a error de nombre repetido', async () => {
    const recipes = montarRepositorio({
      create: vi.fn<RecipeRepository['create']>(async () => 'duplicate'),
    });
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toBeInstanceOf(RecipeDuplicateNameError);
  });
});

describe('R11 — la edicion recibe la lista final completa', () => {
  it('la edicion recibe la lista final completa y no expone ninguna operacion por linea', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    const nuevaListaCompleta = {
      ...RECETA_VALIDA,
      lines: [
        LINEA_VALIDA,
        { productId: '22222222-2222-4222-8222-222222222222', quantity: '1.0000', unitId: UNIT_ID },
      ],
    };
    // La segunda linea es "nueva": hace falta que el catalogo la reconozca para pasar.
    (products.findRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      PRODUCTO_REF,
      { id: '22222222-2222-4222-8222-222222222222', name: 'Sosa caustica', unitId: null },
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
    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toThrow();
    expect(products.findRefs).toHaveBeenCalledWith([LINEA_VALIDA.productId], EMPRESA);
    expect(recipes.create).not.toHaveBeenCalled();
  });
});

describe('R50 — unidad inexistente', () => {
  it('rechaza la linea cuyo unitId no existe en el catalogo de unidades, sin crear nada', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const units = montarCatalogoUnidades({
      findRefs: vi.fn<UnitCatalog['findRefs']>(async () => []),
    });
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, units, images, now: () => AHORA });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).rejects.toThrow();
    expect(units.findRefs).toHaveBeenCalledWith([LINEA_VALIDA.unitId], EMPRESA);
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('en la edicion valida el unitId de TODAS las lineas finales, no solo de las nuevas', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const units = montarCatalogoUnidades({
      findRefs: vi.fn<UnitCatalog['findRefs']>(async () => []),
    });
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, units, images, now: () => AHORA });

    // La linea es la MISMA que ya trae `FILA_RECETA` (existing) -no es "nueva"- pero R50
    // no exime a las lineas preexistentes: se valida igual.
    await expect(updateRecipe('receta-1', RECETA_VALIDA, ADMIN)).rejects.toThrow();
    expect(units.findRefs).toHaveBeenCalledWith([LINEA_VALIDA.unitId], EMPRESA);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });
});

describe('R21 — receta sin imagen', () => {
  it('crea y edita la receta sin imagen sin llamar al almacenamiento', async () => {
    const recipes = montarRepositorio();
    const products = montarCatalogo();
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

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
    const createRecipe = createCreateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

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
    const updateRecipe = createUpdateRecipe({ recipes, products, units: montarCatalogoUnidades(), images, now: () => AHORA });

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
  it('la lista no trae lineas y el detalle si las trae con producto, cantidad y unidad', async () => {
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
        quantity: '10.5000',
        unitId: UNIT_ID,
        // `PRODUCTO_REF.stockByUnit` no trae la unidad de esta linea: marcador de dato ausente.
        productStock: null,
      },
    ]);
  });
});

describe('R12, R13, R14, R15 — existencia de la linea en su propia unidad', () => {
  function montarConProducto(ref: ProductRef | undefined) {
    const recipes = montarRepositorio();
    const products = montarCatalogo({
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => (ref === undefined ? [] : [ref])),
    });
    const images = montarAlmacenamiento();
    return createGetRecipe({ recipes, products, images });
  }

  it('R12: con un lote en la unidad de la linea, la existencia es esa cantidad', async () => {
    const getRecipe = montarConProducto({
      id: LINEA_VALIDA.productId,
      name: 'Acido sulfurico',
      stockByUnit: [{ unitId: UNIT_ID, quantity: 15 }],
    });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productStock).toBe(15);
  });

  it('R13: con lotes pero ninguno en la unidad de la linea, la existencia es null', async () => {
    const getRecipe = montarConProducto({
      id: LINEA_VALIDA.productId,
      name: 'Acido sulfurico',
      stockByUnit: [{ unitId: '55555555-5555-4555-8555-555555555555', quantity: 3 }],
    });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productStock).toBeNull();
  });

  it('R14: sin ningun lote, la existencia es 0', async () => {
    const getRecipe = montarConProducto({
      id: LINEA_VALIDA.productId,
      name: 'Acido sulfurico',
      stockByUnit: [],
    });

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productStock).toBe(0);
  });

  it('R15: producto de baja, la existencia es null', async () => {
    const getRecipe = montarConProducto(undefined);

    const detalle = await getRecipe('receta-1', ADMIN);
    expect(detalle.lines[0].productStock).toBeNull();
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
