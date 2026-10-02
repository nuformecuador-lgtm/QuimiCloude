// QC-50 T25 — `company-scope.test.ts`: las DOS envolturas del unico punto de consulta del
// modulo `recetas` devuelven el MISMO objeto (R14), y ninguna salida publica del modulo lleva
// `companyId` (R19).
//
// La primera afirmacion es la prueba de que hay UNA sola definicion de «de la empresa» y no dos
// copias que puedan divergir en silencio: si manana alguien reescribe una de las dos
// envolturas a mano en vez de delegar en la privada, este test lo nota.
//
// La segunda ataca el punto donde una fuga seria mas facil de cometer sin darse cuenta: el
// detalle de una receta (`getRecipe`) y el resumen de la lista (`listRecipes`) RECONSTRUYEN el
// objeto de salida campo a campo -no lo devuelven tal cual sale del repositorio-, y esa
// reconstruccion es justo el sitio donde un `...row` perezoso colaria `companyId` al navegador.
// Por eso el doble del repositorio devuelve una fila con un `companyId` "de mas" -algo que la
// implementacion REAL nunca hace, `RecipeRow` ni siquiera declara el campo- y el test exige que
// el mapeo lo descarte de todos modos.

import { describe, expect, it, vi } from 'vitest';

import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';

import {
  companyScopeColumns,
  recipeCompanyScope,
} from '@/lib/modules/recetas/adapters/driven/persistence/company-scope';

import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';

const ACTOR = { id: 'actor-1', companyId: 'empresa-1', permissions: ['recetas.consultar'] };

describe('QC-50 R14 — una sola definicion de "de la empresa", sin copias que diverjan', () => {
  it('`recipeCompanyScope` y `companyScopeColumns` devuelven el MISMO objeto para el mismo ambito', () => {
    const scope: RecipeScope = { companyId: 'empresa-1' };

    expect(recipeCompanyScope(scope)).toStrictEqual(companyScopeColumns(scope));
    expect(recipeCompanyScope(scope)).toStrictEqual({ companyId: 'empresa-1' });
    expect(companyScopeColumns(scope)).toStrictEqual({ companyId: 'empresa-1' });
  });

  it('ninguna de las dos envolturas anade ni omite ninguna clave, para ambitos distintos', () => {
    for (const companyId of ['empresa-a', 'empresa-b', '00000000-0000-4000-8000-000000000000']) {
      const scope: RecipeScope = { companyId };
      expect(Object.keys(recipeCompanyScope(scope))).toEqual(['companyId']);
      expect(recipeCompanyScope(scope)).toStrictEqual(companyScopeColumns(scope));
    }
  });
});

/**
 * Una fila "con fuga": lleva un `companyId` que `RecipeRow` no declara (el tipo real del
 * repositorio no tiene ese campo). Simula el unico modo en que la empresa podria colarse hasta
 * el navegador -una implementacion que un dia haga `{ ...row }` en vez de listar los campos uno
 * a uno-, sin depender de la base de datos real.
 */
const FILA_CON_FUGA = {
  id: 'receta-1',
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  imagePath: null,
  createdBy: 'actor-1',
  updatedBy: 'actor-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lines: [],
  original: null,
  companyId: 'empresa-1',
} as unknown as RecipeRow;

function imagenesMudas(): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
  };
}

function catalogoProductosVacio(): ProductCatalog {
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('recetas no debe costear nada');
    }),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
      throw new Error('recetas no debe leer envases de empaque');
    }),
  };
}

describe('QC-50 R19 — ninguna salida publica del modulo lleva `companyId`', () => {
  it('el DETALLE de una receta (`getRecipe`) no expone `companyId` aunque la fila del repositorio la traiga', async () => {
    const recipes = {
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => FILA_CON_FUGA),
    } as unknown as RecipeRepository;

    const detalle = await createGetRecipe({
      recipes,
      products: catalogoProductosVacio(),
      images: imagenesMudas(),
    })('receta-1', ACTOR);

    expect(detalle).not.toHaveProperty('companyId');
    expect(Object.keys(detalle)).not.toContain('companyId');
    expect(JSON.stringify(detalle)).not.toContain('empresa-1');
  });

  it('el RESUMEN de la lista (`listRecipes`) no expone `companyId` aunque la fila del repositorio la traiga', async () => {
    const recipes = {
      listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({
        rows: [FILA_CON_FUGA],
        total: 1,
      })),
    } as unknown as RecipeRepository;

    const pagina = await createListRecipes({
      recipes,
      images: imagenesMudas(),
      log: { ignoredFields: vi.fn() },
      toOffsetLimit: () => ({ offset: 0, limit: 10 }),
      buildPage: (items, total, page, pageSize) => ({ items, total, page, pageSize, totalPages: 1 }),
    })({ page: 1 }, ACTOR);

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]).not.toHaveProperty('companyId');
    expect(Object.keys(pagina.items[0] as object)).not.toContain('companyId');
    expect(JSON.stringify(pagina)).not.toContain('empresa-1');
  });

  // El estado que devuelven las Server Actions (`recipe-actions.ts`) es un envoltorio literal
  // -`{ status: 'success', data }`- sobre EXACTAMENTE lo que devuelven `getRecipe`/`listRecipes`;
  // no reconstruye ni anade ningun campo. Probado el mapeo aqui, en el dominio, queda probado
  // tambien lo que la action expone: no hay un segundo sitio donde `companyId` pudiera colarse
  // de vuelta despues de que el caso de uso ya lo descarto.
});
