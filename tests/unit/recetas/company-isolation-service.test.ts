// QC-50 T25 — El rechazo cruzado EN EL SERVICE, con dobles (R12, R16, R17, R18, R21, R23, R28).
//
// `docs/architecture.md > Acceso a datos y autorizacion`: Prisma conecta como dueno de las
// tablas y no setea claims, asi que ninguna policy de RLS filtra nada. La frontera real es el
// caso de uso. Este archivo prueba esa frontera SIN base de datos: la integracion contra
// Postgres (T22/T23) prueba que el `where` filtra de verdad; aqui se prueba lo que el caso de
// uso DECIDE y lo que PASA a sus cuatro puertos -repositorio, catalogo de productos, catalogo
// de unidades y almacenamiento-.
//
// DOS CLASES DE DOBLE, a proposito (mismo criterio que `tests/unit/pedidos/company-isolation-
// service.test.ts` de QC-60):
//
//   - Un ALMACEN EN MEMORIA con recetas de DOS empresas, que se comporta como el adaptador
//     promete (`null` / `'not_found'` para lo ajeno) y que registra lo que queda escrito. «No
//     se escribe ninguna fila» (R21) solo se demuestra mirando lo que QUEDA, no contando
//     llamadas.
//   - Espias sobre cada metodo, porque la otra mitad -que el ambito que llega al puerto es el
//     DEL ACTOR y nunca uno sacado de la entrada (R12)- solo se ve en los argumentos.
//
// NUNCA `UnauthorizedError` ante una receta ajena (`design.md > 9`, decision cerrada 10):
// distinguir «no puedes» de «no existe» sobre datos de otra empresa es un ORACULO DE
// EXISTENCIA -quien sondea identificadores aprenderia que recetas tienen las demas-. Por eso
// no basta con `toBeInstanceOf(RecipeNotFoundError)`: se compara el error de la receta ajena
// con el de un identificador que NO EXISTE EN NINGUNA empresa y se exige que sean
// indistinguibles -misma clase, mismo `code`, mismo mensaje-.
//
// Todas las afirmaciones de error van sobre la CLASE y el `code` estable, nunca sobre el texto.

import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createDeleteRecipe } from '@/lib/modules/recetas/domain/delete-recipe';
import { RecipeNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';

import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';

/** Los dos codigos que este modulo puede exigir. Ninguno nuevo nace en esta ficha (R28). */
const CONSULTAR = 'recetas.consultar';
const MODIFICAR = 'recetas.modificar';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

const RECETA_A = '33333333-3333-4333-8333-333333333333';
const RECETA_B = '44444444-4444-4444-8444-444444444444';
/** Un identificador que no existe en NINGUNA empresa: la referencia contra la que se mide que
 *  lo ajeno sea indistinguible de lo inexistente. */
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const PRODUCTO_A = '55555555-5555-4555-8555-555555555555';
const PRODUCTO_B = '66666666-6666-4666-8666-666666666666';
const PRODUCTO_INEXISTENTE = '77777777-7777-4777-8777-777777777777';

const AHORA = new Date('2026-09-16T10:00:00.000Z');

/** Actor con exactamente los permisos que se le pasen, y ninguno mas. */
function actorCon(companyId: string, ...permisos: readonly string[]): Actor {
  return { id: 'actor-1', companyId, permissions: permisos };
}

const ACTOR_A: Actor = actorCon(EMPRESA_A, CONSULTAR, MODIFICAR);

// Una entrada valida ya no puede ir sin lineas -0 lineas suman 0,00 %-, asi que lleva una
// linea al 100 % del producto de la PROPIA empresa del actor.
const ENTRADA_ALTA_VALIDA = {
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  lines: [{ productId: PRODUCTO_A, percentage: '100.00' }],
};

const ENTRADA_EDICION_VALIDA = { ...ENTRADA_ALTA_VALIDA };

function filaBase(id: string, overrides: Partial<RecipeRow> = {}): RecipeRow {
  return {
    id,
    name: 'Desengrasante 5%',
    description: null,
    steps: [],
    imagePath: null,
    createdBy: 'actor-0',
    updatedBy: 'actor-0',
    createdAt: AHORA,
    updatedAt: AHORA,
    lines: [],
    tools: [],
    original: null,
    ...overrides,
  };
}

type Guardado = { row: RecipeRow; companyId: string; deleted: boolean };

/**
 * Almacen con UNA receta de A y UNA de B. Cada metodo hace lo que el adaptador promete: lo que
 * no es de la empresa del ambito vuelve como `null` / `'not_found'` y NO se toca.
 */
function almacen() {
  const filas = new Map<string, Guardado>([
    [RECETA_A, { row: filaBase(RECETA_A), companyId: EMPRESA_A, deleted: false }],
    [RECETA_B, { row: filaBase(RECETA_B), companyId: EMPRESA_B, deleted: false }],
  ]);
  const altas: { companyId: string }[] = [];
  let contador = 0;

  const visible = (id: string, scope: RecipeScope): Guardado | null => {
    const guardado = filas.get(id);
    if (guardado === undefined || guardado.deleted) return null;
    return guardado.companyId === scope.companyId ? guardado : null;
  };

  const create = vi.fn(
    async (data: NewRecipe, actorId: string, now: Date, scope: RecipeScope) => {
      contador += 1;
      const id = `receta-nueva-${contador}`;
      const row: RecipeRow = {
        id,
        name: data.name,
        description: data.description,
        steps: data.steps,
        imagePath: data.imagePath,
        createdBy: actorId,
        updatedBy: actorId,
        createdAt: now,
        updatedAt: now,
        lines: data.lines.map((line, index) => ({ id: `linea-${contador}-${index}`, ...line })),
        tools: [],
        original: null,
      };
      filas.set(id, { row, companyId: scope.companyId, deleted: false });
      altas.push({ companyId: scope.companyId });
      return { id };
    },
  );

  const findAliveById = vi.fn(async (id: string, scope: RecipeScope) => {
    const guardado = visible(id, scope);
    return guardado === null ? null : guardado.row;
  });

  const listAlive = vi.fn(async (_offset: number, _limit: number, _query: unknown, scope: RecipeScope) => {
    const rows = [...filas.values()]
      .filter((guardado) => !guardado.deleted && guardado.companyId === scope.companyId)
      .map((guardado) => guardado.row);
    return { rows, total: rows.length };
  });

  const replaceAlive = vi.fn(
    async (id: string, data: NewRecipe, actorId: string, now: Date, scope: RecipeScope) => {
      const guardado = visible(id, scope);
      if (guardado === null) return 'not_found' as const;
      guardado.row = {
        ...guardado.row,
        name: data.name,
        description: data.description,
        steps: data.steps,
        imagePath: data.imagePath,
        updatedBy: actorId,
        updatedAt: now,
        lines: data.lines.map((line, index) => ({ id: `linea-${id}-${index}`, ...line })),
      };
      return 'ok' as const;
    },
  );

  const softDeleteAlive = vi.fn(async (id: string, actorId: string, now: Date, scope: RecipeScope) => {
    const guardado = visible(id, scope);
    if (guardado === null) return 'not_found' as const;
    guardado.deleted = true;
    guardado.row = { ...guardado.row, updatedBy: actorId, updatedAt: now };
    return 'ok' as const;
  });

  const espias = { create, findAliveById, listAlive, replaceAlive, softDeleteAlive };

  return {
    recipes: espias as unknown as RecipeRepository,
    espias,
    filas,
    altas,
  };
}

/** Catalogo de productos: solo los de la empresa preguntada se resuelven (R21, R22). */
function catalogoProductos() {
  const productos = new Map<string, { companyId: string; name: string }>([
    [PRODUCTO_A, { companyId: EMPRESA_A, name: 'Producto de A' }],
    [PRODUCTO_B, { companyId: EMPRESA_B, name: 'Producto de B' }],
  ]);
  const findRefs = vi.fn(async (ids: readonly string[], companyId: string) =>
    ids.flatMap((id) => {
      const producto = productos.get(id);
      return producto !== undefined && producto.companyId === companyId
        ? [{ id, name: producto.name, stock: null }]
        : [];
    }),
  );
  return { products: { findRefs } as unknown as ProductCatalog, findRefs };
}

function almacenamientoMudo(): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
  };
}

/** Los cinco casos de uso cableados contra un almacen y un catalogo concreto. */
function casosDeUso(recipes: RecipeRepository, products: ProductCatalog, images: RecipeImageStorage) {
  const now = () => AHORA;
  return {
    createRecipe: createCreateRecipe({ recipes, products, images, now }),
    getRecipe: createGetRecipe({ recipes, products, images }),
    listRecipes: createListRecipes({
      recipes,
      images,
      log: { ignoredFields: vi.fn() },
      toOffsetLimit: () => ({ offset: 0, limit: 10 }),
      buildPage: (items, total, page, pageSize) => ({ items, total, page, pageSize, totalPages: 1 }),
    }),
    updateRecipe: createUpdateRecipe({ recipes, products, images, now }),
    deleteRecipe: createDeleteRecipe({ recipes, now }),
  };
}

/** Monta los cinco casos de uso sobre un almacen y un catalogo nuevos, todo de una vez. */
function montarTodo() {
  const a = almacen();
  const prod = catalogoProductos();
  const img = almacenamientoMudo();
  return { a, prod, img, c: casosDeUso(a.recipes, prod.products, img) };
}

async function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('QC-50 R12 — los cinco casos de uso pasan al puerto el ambito DEL ACTOR, nunca el de la entrada', () => {
  it('cada llamada al puerto lleva exactamente `{ companyId: actor.companyId }` como ULTIMO argumento', async () => {
    const { a, c } = montarTodo();

    await c.createRecipe({ ...ENTRADA_ALTA_VALIDA, companyId: EMPRESA_B, company_id: EMPRESA_B }, ACTOR_A);
    await c.getRecipe(RECETA_A, ACTOR_A);
    await c.listRecipes({ page: 1 }, ACTOR_A);
    await c.updateRecipe(RECETA_A, { ...ENTRADA_EDICION_VALIDA, companyId: EMPRESA_B }, ACTOR_A);
    await c.deleteRecipe(RECETA_A, ACTOR_A);

    const llamadas = Object.entries(a.espias).flatMap(([metodo, espia]) =>
      espia.mock.calls.map((args) => [metodo, args as readonly unknown[]] as const),
    );

    // Los cinco metodos del puerto se ejercitaron: sin esto, uno que nadie llamo pasaria el bucle.
    expect(new Set(llamadas.map(([metodo]) => metodo))).toEqual(
      new Set(['create', 'findAliveById', 'listAlive', 'replaceAlive', 'softDeleteAlive']),
    );

    for (const [metodo, args] of llamadas) {
      expect(args[args.length - 1], `${metodo}: el ambito es el del actor`).toStrictEqual({
        companyId: EMPRESA_A,
      });
    }

    // La empresa de la entrada no llega al puerto por NINGUN camino, ni siquiera serializada
    // dentro de otro argumento.
    expect(JSON.stringify(llamadas)).not.toContain(EMPRESA_B);
  });
});

describe('QC-50 R16, R17 — receta de otra empresa: como inexistente, y NUNCA `UnauthorizedError`', () => {
  const CASOS = [
    ['getRecipe', (c: ReturnType<typeof casosDeUso>, id: string) => c.getRecipe(id, ACTOR_A)],
    [
      'updateRecipe',
      (c: ReturnType<typeof casosDeUso>, id: string) => c.updateRecipe(id, ENTRADA_EDICION_VALIDA, ACTOR_A),
    ],
    ['deleteRecipe', (c: ReturnType<typeof casosDeUso>, id: string) => c.deleteRecipe(id, ACTOR_A)],
  ] as const;

  for (const [nombre, invocar] of CASOS) {
    it(`${nombre}: receta de OTRA empresa -> RecipeNotFoundError, nunca UnauthorizedError, indistinguible de un id que no existe`, async () => {
      const ajeno = montarTodo();
      const antes = new Map(ajeno.a.filas);
      const errorAjeno = await capturar(invocar(ajeno.c, RECETA_B));

      expect(errorAjeno, nombre).toBeInstanceOf(RecipeNotFoundError);
      expect(errorAjeno, `${nombre}: oraculo de existencia`).not.toBeInstanceOf(UnauthorizedError);
      expect((errorAjeno as RecipeNotFoundError).code).toBe('recipe_not_found');

      const inexistente = montarTodo();
      const errorInexistente = await capturar(invocar(inexistente.c, RECETA_INEXISTENTE));
      expect(errorInexistente).toBeInstanceOf(RecipeNotFoundError);

      // INDISTINGUIBLE de lo que no existe: misma clase, mismo `code`, mismo mensaje.
      expect({
        clase: (errorAjeno as Error).constructor.name,
        code: (errorAjeno as RecipeNotFoundError).code,
        message: (errorAjeno as Error).message,
      }).toEqual({
        clase: (errorInexistente as Error).constructor.name,
        code: (errorInexistente as RecipeNotFoundError).code,
        message: (errorInexistente as Error).message,
      });

      // R17: ninguna fila cambio -ni la de B ni la de A-. `replaceAlive`/`softDeleteAlive`
      // SI pueden haberse invocado -es lo que el adaptador acotado promete-, pero devuelven
      // `'not_found'` sin tocar nada: por eso lo que se afirma es el ESTADO del almacen, no el
      // conteo de llamadas. `create` en cambio nunca tiene motivo para dispararse aqui.
      expect(ajeno.a.filas).toEqual(antes);
      expect(ajeno.a.espias.create).not.toHaveBeenCalled();
    });

    it(`${nombre}: CONTROL POSITIVO -con el MISMO almacen, la receta propia si se alcanza`, async () => {
      const propio = montarTodo();
      expect(await capturar(invocar(propio.c, RECETA_A))).toBeNull();
    });
  }

  it('R16: la ficha de una receta ajena no devuelve NI UN dato de la fila', async () => {
    const { c, prod } = montarTodo();
    const error = await capturar(c.getRecipe(RECETA_B, ACTOR_A));

    const serializado = JSON.stringify({ ...(error as object), message: (error as Error).message });
    expect(serializado).not.toContain(RECETA_B);
    // Ni se pregunto al catalogo de productos por lineas de una receta que no se debia ver.
    expect(prod.findRefs).not.toHaveBeenCalled();
  });

  it('R15 (lado service): el listado de A no trae la receta de B', async () => {
    const { c } = montarTodo();
    const pagina = await c.listRecipes({ page: 1 }, ACTOR_A);
    expect(pagina.items.map((item) => item.id)).toEqual([RECETA_A]);
    expect(pagina.total).toBe(1);
  });
});

describe('QC-50 R28 — el PERMISO se exige ANTES que el ambito', () => {
  /** Dobles que EXPLOTAN: sin permiso, no se puede tocar ningun puerto. */
  function explosivos() {
    const explota = (nombre: string) =>
      vi.fn(() => {
        throw new Error(`${nombre} no debe llamarse sin permiso`);
      });
    const recipes = {
      create: explota('recipes.create'),
      findAliveById: explota('recipes.findAliveById'),
      listAlive: explota('recipes.listAlive'),
      replaceAlive: explota('recipes.replaceAlive'),
      softDeleteAlive: explota('recipes.softDeleteAlive'),
    };
    const products = { findRefs: explota('products.findRefs') };
    const images = {
      upload: explota('images.upload'),
      remove: explota('images.remove'),
      publicUrl: explota('images.publicUrl'),
    };
    const log = { ignoredFields: explota('log.ignoredFields') };

    return {
      recipes: recipes as unknown as RecipeRepository,
      products: products as unknown as ProductCatalog,
      images: images as unknown as RecipeImageStorage,
      log,
      espias: [
        ...Object.values(recipes),
        ...Object.values(products),
        ...Object.values(images),
        log.ignoredFields,
      ],
    };
  }

  type Explosivos = ReturnType<typeof explosivos>;

  const CINCO = [
    [
      'createRecipe',
      (d: Explosivos, actor: Actor | null | undefined) =>
        createCreateRecipe(d)(ENTRADA_ALTA_VALIDA, actor),
    ],
    ['getRecipe', (d: Explosivos, actor: Actor | null | undefined) => createGetRecipe(d)(RECETA_A, actor)],
    [
      'listRecipes',
      (d: Explosivos, actor: Actor | null | undefined) =>
        createListRecipes({
          ...d,
          toOffsetLimit: () => ({ offset: 0, limit: 10 }),
          buildPage: (items, total, page, pageSize) => ({ items, total, page, pageSize, totalPages: 1 }),
        })({ page: 1 }, actor),
    ],
    [
      'updateRecipe',
      (d: Explosivos, actor: Actor | null | undefined) =>
        createUpdateRecipe(d)(RECETA_A, ENTRADA_EDICION_VALIDA, actor),
    ],
    ['deleteRecipe', (d: Explosivos, actor: Actor | null | undefined) => createDeleteRecipe(d)(RECETA_A, actor)],
  ] as const;

  for (const [nombre, invocar] of CINCO) {
    it(`${nombre}: actor SIN permiso Y de OTRA empresa -> UnauthorizedError, sin tocar NINGUN puerto`, async () => {
      // Si el ambito se evaluara antes que el permiso, este actor recibiria `recipe_not_found`
      // en vez de `unauthorized`, y R28 exige exactamente el orden contrario: el permiso gana.
      const d = explosivos();
      const intruso = actorCon(EMPRESA_B, 'otro.permiso');

      const error = await capturar(invocar(d, intruso));
      expect(error, nombre).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).code).toBe('unauthorized');
      for (const espia of d.espias) expect(espia, nombre).not.toHaveBeenCalled();
    });

    it(`${nombre}: la empresa NO AUTORIZA por si sola -ser de la MISMA empresa sin el permiso no abre nada`, async () => {
      const d = explosivos();
      const mismaEmpresaSinPermiso = actorCon(EMPRESA_A);

      const error = await capturar(invocar(d, mismaEmpresaSinPermiso));
      expect(error, nombre).toBeInstanceOf(UnauthorizedError);
      for (const espia of d.espias) expect(espia, nombre).not.toHaveBeenCalled();
    });
  }

  it('actor ausente, sin conjunto de permisos, con el conjunto vacio o sin el campo -> rechazan igual, en los cinco casos, sin tocar ningun puerto', async () => {
    const actoresInvalidos: ReadonlyArray<{
      readonly etiqueta: string;
      readonly actor: Actor | null | undefined;
    }> = [
      { etiqueta: 'actor undefined', actor: undefined },
      { etiqueta: 'actor null', actor: null },
      { etiqueta: 'conjunto de permisos vacio', actor: actorCon(EMPRESA_B) },
      { etiqueta: 'sin campo de permisos', actor: { id: 'x', companyId: EMPRESA_B } as unknown as Actor },
    ];

    for (const { etiqueta, actor } of actoresInvalidos) {
      for (const [nombre, invocar] of CINCO) {
        const d = explosivos();
        const error = await capturar(invocar(d, actor));
        expect(error, `${nombre} con ${etiqueta}`).toBeInstanceOf(UnauthorizedError);
        for (const espia of d.espias) expect(espia, `${nombre} con ${etiqueta}`).not.toHaveBeenCalled();
      }
    }
  });

  it('no nace ningun permiso nuevo: siguen siendo `recetas.consultar` y `recetas.modificar`', () => {
    expect(CONSULTAR).toBe('recetas.consultar');
    expect(MODIFICAR).toBe('recetas.modificar');
  });
});

describe('QC-50 R21 — un producto que no es de la empresa de la receta, en una linea de alta o de edicion', () => {
  it('alta con una linea de producto AJENO -> ValidationError, igual que uno inexistente, sin escribir ninguna fila', async () => {
    const ajeno = montarTodo();
    const entradaAjena = {
      ...ENTRADA_ALTA_VALIDA,
      lines: [{ productId: PRODUCTO_B, percentage: '100.00' }],
    };

    const errorAjeno = await capturar(ajeno.c.createRecipe(entradaAjena, ACTOR_A));
    expect(errorAjeno).toBeInstanceOf(ValidationError);
    expect(ajeno.a.espias.create).not.toHaveBeenCalled();

    const inexistente = montarTodo();
    const entradaInexistente = {
      ...ENTRADA_ALTA_VALIDA,
      lines: [{ productId: PRODUCTO_INEXISTENTE, percentage: '100.00' }],
    };
    const errorInexistente = await capturar(inexistente.c.createRecipe(entradaInexistente, ACTOR_A));

    // Igual que un producto inexistente: misma clase, mismo `code`.
    expect((errorInexistente as Error).constructor.name).toBe((errorAjeno as Error).constructor.name);
    expect((errorInexistente as ValidationError).code).toBe((errorAjeno as ValidationError).code);
    expect(inexistente.a.espias.create).not.toHaveBeenCalled();
  });

  it('edicion con una linea NUEVA de producto AJENO -> ValidationError, la receta no se toca', async () => {
    const { a, c } = montarTodo();
    const antes = new Map(a.filas);
    const entrada = {
      ...ENTRADA_EDICION_VALIDA,
      lines: [{ productId: PRODUCTO_B, percentage: '100.00' }],
    };

    const error = await capturar(c.updateRecipe(RECETA_A, entrada, ACTOR_A));
    expect(error).toBeInstanceOf(ValidationError);
    expect(a.espias.replaceAlive).not.toHaveBeenCalled();
    expect(a.filas).toEqual(antes);
  });

  it('CONTROL POSITIVO: un producto de la PROPIA empresa se acepta en el alta y en la edicion', async () => {
    const { c } = montarTodo();
    const entrada = {
      ...ENTRADA_ALTA_VALIDA,
      lines: [{ productId: PRODUCTO_A, percentage: '100.00' }],
    };

    await expect(c.createRecipe(entrada, ACTOR_A)).resolves.toBeDefined();
    await expect(c.updateRecipe(RECETA_A, entrada, ACTOR_A)).resolves.toBeDefined();
  });
});

// La linea de receta ya no lleva unidad: el bloque que probaba el escaneo por empresa de
// `UnitCatalog` sobre la unidad de una linea deja de tener materia y se retira sin
// sustituto, sin ningun `unitId` de linea que validar.

describe('QC-50 R18 — la empresa de la entrada se descarta; la fila se escribe con la del ACTOR', () => {
  it('un alta con `companyId`/`company_id` en la entrada escribe con la empresa del actor, y esos campos nunca llegan al puerto', async () => {
    const { a, c } = montarTodo();

    const { id } = await c.createRecipe(
      { ...ENTRADA_ALTA_VALIDA, companyId: EMPRESA_B, company_id: EMPRESA_B },
      ACTOR_A,
    );

    expect(a.altas).toEqual([{ companyId: EMPRESA_A }]);
    expect(a.espias.create).toHaveBeenCalledTimes(1);

    const args = a.espias.create.mock.calls[0] as unknown as readonly unknown[];
    expect(args[args.length - 1], 'ambito que llega a create').toStrictEqual({ companyId: EMPRESA_A });

    const datos = args[0];
    expect(typeof datos === 'object' && datos !== null).toBe(true);
    expect(datos).not.toHaveProperty('companyId');
    expect(datos).not.toHaveProperty('company_id');
    expect(JSON.stringify(args)).not.toContain(EMPRESA_B);

    expect(a.filas.get(id)?.companyId).toBe(EMPRESA_A);
  });
});
