// T13 — Server Actions de receta (`design.md > 5`; `tasks.md > T13`). Mockea
// `@/lib/composition` igual que `product-actions.test.ts` de `inventario`: la action se
// testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R38 (la action rechaza la entrada invalida ANTES de llamar al caso de uso) y R39
// (no existe ningun route handler bajo app/api/recetas ni app/api/recipes), ademas de
// que el actor sale de `identity.getSessionUser()` y que una advertencia de borrado NO
// convierte la edicion en error para el llamante.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createRecipeAction,
  deleteRecipeAction,
  getRecipeAction,
  listRecipesAction,
  updateRecipeAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { RecipeNotFoundError, UnauthorizedError } from '@/lib/modules/recetas';
import { errorMessage } from '@/lib/modules/errores';

const {
  createRecipeMock,
  getRecipeMock,
  listRecipesMock,
  updateRecipeMock,
  deleteRecipeMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
  getRecipeMock: vi.fn(),
  listRecipesMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  deleteRecipeMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
  recetas: {
    createRecipe: createRecipeMock,
    getRecipe: getRecipeMock,
    listRecipes: listRecipesMock,
    updateRecipe: updateRecipeMock,
    deleteRecipe: deleteRecipeMock,
  },
}));

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  // QC-74 (R11): la sesion trae el conjunto de permisos vigente; el actor se arma con EL.
  permissions: ['recetas.consultar', 'recetas.modificar'],
};

const VALID_RECIPE_INPUT = {
  name: 'Desengrasante 5%',
  description: 'Formula base',
  steps: [
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] },
    { blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar' }] }] },
  ],
  lines: [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: '10.0000',
      unitId: '22222222-2222-4222-8222-222222222222',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
});

describe('createRecipeAction — R38', () => {
  it('rechaza la entrada invalida sin llamar a recetas.createRecipe', async () => {
    const resultado = await createRecipeAction({ ...VALID_RECIPE_INPUT, name: '   ' });

    expect(resultado.status).toBe('error');
    if (resultado.status !== 'error') throw new Error('estado inesperado');
    expect(resultado.code).toBe('invalid_input');
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it('con entrada valida llama al caso de uso con el actor resuelto de la sesion', async () => {
    createRecipeMock.mockResolvedValue({ id: 'receta-1' });

    const resultado = await createRecipeAction(VALID_RECIPE_INPUT);

    expect(resultado).toEqual({ status: 'success', id: 'receta-1' });
    expect(createRecipeMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: VALID_RECIPE_INPUT.name }),
      { id: ADMIN_SESSION_USER.id, permissions: ADMIN_SESSION_USER.permissions },
    );
  });

  it('sin sesion, el actor que llega al caso de uso es null (falla cerrado, R3)', async () => {
    getSessionUserMock.mockResolvedValue(null);
    createRecipeMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await createRecipeAction(VALID_RECIPE_INPUT);

    expect(createRecipeMock).toHaveBeenCalledWith(expect.anything(), null);
    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: expect.any(String),
    });
  });
});

describe('updateRecipeAction — R38, R47-R49', () => {
  it('rechaza la entrada invalida sin llamar a recetas.updateRecipe', async () => {
    const resultado = await updateRecipeAction('receta-1', { ...VALID_RECIPE_INPUT, lines: 'no-es-lista' });

    expect(resultado).toEqual({ status: 'error', code: 'invalid_input', message: expect.any(String) });
    expect(updateRecipeMock).not.toHaveBeenCalled();
  });

  it('una advertencia de borrado de almacenamiento NO convierte la edicion en error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    updateRecipeMock.mockResolvedValue({
      id: 'receta-1',
      warnings: [{ operation: 'remove', path: 'recetas/anterior.jpg', message: 'el bucket no respondio' }],
    });

    const resultado = await updateRecipeAction('receta-1', VALID_RECIPE_INPUT);

    expect(resultado).toEqual({ status: 'success' });
    // La advertencia se REGISTRA, no se descarta en silencio (R49, docs/conventions.md).
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('recetas/anterior.jpg');
    errorSpy.mockRestore();
  });

  it('sin advertencias no registra nada', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    updateRecipeMock.mockResolvedValue({ id: 'receta-1', warnings: [] });

    await updateRecipeAction('receta-1', VALID_RECIPE_INPUT);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('deleteRecipeAction, getRecipeAction, listRecipesAction — traduccion de errores', () => {
  it('deleteRecipeAction traduce RecipeNotFoundError a su code estable', async () => {
    deleteRecipeMock.mockRejectedValue(new RecipeNotFoundError());

    const resultado = await deleteRecipeAction('receta-inexistente');

    // QC-70 (R17): el codigo generico `not_found` desaparecio; el caso concreto de receta
    // es `recipe_not_found`, la misma entrada del catalogo que emite `pedidos`.
    expect(resultado).toEqual({ status: 'error', code: 'recipe_not_found', message: expect.any(String) });
  });

  it('getRecipeAction devuelve los datos del caso de uso en exito', async () => {
    getRecipeMock.mockResolvedValue({ id: 'receta-1' });

    const resultado = await getRecipeAction('receta-1');

    expect(resultado).toEqual({ status: 'success', data: { id: 'receta-1' } });
  });

  it('listRecipesAction pasa la consulta tal cual al caso de uso (la valida el dominio)', async () => {
    listRecipesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });

    await listRecipesAction({ page: 2 });

    expect(listRecipesMock).toHaveBeenCalledWith({ page: 2 }, expect.anything());
  });

  // QC-70 (R12, R13): antes de esta ficha la action RELANZABA el error ajeno, y este caso lo
  // fijaba con `rejects.toThrow('fallo de infraestructura')`. La decision cerrada del
  // 2026-09-08 lo cambia: se traduce al codigo generico con mensaje neutro del catalogo, y el
  // detalle real solo va al log del servidor. Lo que el caso sigue fijando -que el error NO se
  // traga en silencio y que el texto interno no llega a quien llama- se comprueba igual, ahora
  // sobre el estado devuelto.
  it('un error que no es de dominio se traduce a `unexpected` sin filtrar el detalle interno', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deleteRecipeMock.mockRejectedValue(new Error('fallo de infraestructura'));

    const resultado = await deleteRecipeAction('receta-1');

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
    });
    // Ningun campo del estado -ni el mensaje, ni uno anadido por descuido- lleva el texto
    // interno del error original (R13).
    for (const valor of Object.values(resultado)) {
      expect(String(valor)).not.toContain('fallo de infraestructura');
    }
    expect(JSON.stringify(resultado)).not.toContain('fallo de infraestructura');
    // No se traga: el error original llega al registro del servidor (R14).
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('R39 — no existe ningun route handler de recetas', () => {
  it('app/api/recetas y app/api/recipes no existen', () => {
    function findRepoRoot(startDir: string): string {
      let dir = startDir;
      for (;;) {
        try {
          existsSync(join(dir, 'package.json'));
          if (existsSync(join(dir, 'package.json'))) return dir;
          throw new Error('sigue buscando');
        } catch {
          const parent = dirname(dir);
          if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
          dir = parent;
        }
      }
    }

    const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    expect(existsSync(join(repoRoot, 'app', 'api', 'recetas'))).toBe(false);
    expect(existsSync(join(repoRoot, 'app', 'api', 'recipes'))).toBe(false);
  });
});
