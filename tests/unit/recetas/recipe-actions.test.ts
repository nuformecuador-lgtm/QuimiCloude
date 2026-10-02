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
  createRecipeVersionAction,
  deleteRecipeAction,
  getRecipeAction,
  listRecipesAction,
  listRecipeVersionsAction,
  updateRecipeAction,
  updateRecipeVersionAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  UnauthorizedError,
} from '@/lib/modules/recetas';
import { errorMessage } from '@/lib/modules/errores';

const {
  createRecipeMock,
  getRecipeMock,
  listRecipesMock,
  updateRecipeMock,
  deleteRecipeMock,
  createRecipeVersionMock,
  updateRecipeVersionMock,
  listRecipeVersionsMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
  getRecipeMock: vi.fn(),
  listRecipesMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  deleteRecipeMock: vi.fn(),
  createRecipeVersionMock: vi.fn(),
  updateRecipeVersionMock: vi.fn(),
  listRecipeVersionsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  recetas: {
    createRecipe: createRecipeMock,
    getRecipe: getRecipeMock,
    listRecipes: listRecipesMock,
    updateRecipe: updateRecipeMock,
    deleteRecipe: deleteRecipeMock,
    createRecipeVersion: createRecipeVersionMock,
    updateRecipeVersion: updateRecipeVersionMock,
    listRecipeVersions: listRecipeVersionsMock,
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

/** QC-50 (R13): la empresa sale SOLO de aqui; `SessionUser` no la trae. */
const ADMIN_SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'empresa-1',
  roleName: 'Administrador',
};

const ADMIN_ACTOR = {
  id: 'user-admin-1',
  companyId: 'empresa-1',
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
      percentage: '100.00',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
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
      ADMIN_ACTOR,
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
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la
      // peticion —el mismo que se escribio en la linea del registro—, y su ausencia ya no
      // compila (R16). El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
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

const ORIGINAL_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const VALID_VERSION_INPUT = {
  name: 'Sin perfume',
  lines: [{ productId: '11111111-1111-4111-8111-111111111111', percentage: '100.00' }],
};

describe('createRecipeVersionAction — R38', () => {
  it.each([
    ['sin nombre', { name: '   ' }],
    ['con lineas que no suman 100', { name: 'Sin perfume', lines: [{ ...VALID_VERSION_INPUT.lines[0], percentage: '90.00' }] }],
    ['con lineas vacias', { name: 'Sin perfume', lines: [] }],
    ['que no es un objeto', 'no-es-un-objeto'],
  ])('R38: rechaza la entrada invalida (%s) sin llamar al caso de uso', async (_caso, entrada) => {
    const resultado = await createRecipeVersionAction(ORIGINAL_ID, entrada);

    expect(resultado).toEqual({ status: 'error', code: 'invalid_input', message: errorMessage('invalid_input') });
    expect(createRecipeVersionMock).not.toHaveBeenCalled();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('R2: sin lineas es valida y llega al caso de uso con la original y el actor de la sesion', async () => {
    createRecipeVersionMock.mockResolvedValue({ id: VERSION_ID });

    const resultado = await createRecipeVersionAction(ORIGINAL_ID, { name: 'Sin perfume' });

    expect(resultado).toEqual({ status: 'success', id: VERSION_ID });
    expect(createRecipeVersionMock).toHaveBeenCalledWith(
      ORIGINAL_ID,
      expect.objectContaining({ name: 'Sin perfume' }),
      ADMIN_ACTOR,
    );
  });

  it.each([
    ['R4: desde una version', new ActionNotAllowedError(), 'action_not_allowed'],
    ['R5: original inexistente', new RecipeNotFoundError(), 'recipe_not_found'],
    ['R12: nombre duplicado', new RecipeDuplicateNameError(), 'recipe_duplicate_name'],
    ['R38: sin permiso', new UnauthorizedError(), 'unauthorized'],
  ] as const)('%s → estado de error traducido', async (_caso, error, codigo) => {
    createRecipeVersionMock.mockRejectedValue(error);

    const resultado = await createRecipeVersionAction(ORIGINAL_ID, VALID_VERSION_INPUT);

    expect(resultado).toEqual({ status: 'error', code: codigo, message: errorMessage(codigo) });
  });
});

describe('updateRecipeVersionAction — R38', () => {
  it.each([
    ['sin lineas', { name: 'Sin perfume' }],
    ['con lineas que no suman 100', { name: 'Sin perfume', lines: [{ ...VALID_VERSION_INPUT.lines[0], percentage: '99.99' }] }],
    ['sin nombre', { ...VALID_VERSION_INPUT, name: '' }],
  ])('R38: rechaza la entrada invalida (%s) sin llamar al caso de uso', async (_caso, entrada) => {
    const resultado = await updateRecipeVersionAction(VERSION_ID, entrada);

    expect(resultado).toEqual({ status: 'error', code: 'invalid_input', message: errorMessage('invalid_input') });
    expect(updateRecipeVersionMock).not.toHaveBeenCalled();
  });

  it('con entrada valida llama al caso de uso con la version y el actor de la sesion', async () => {
    updateRecipeVersionMock.mockResolvedValue({ id: VERSION_ID });

    const resultado = await updateRecipeVersionAction(VERSION_ID, VALID_VERSION_INPUT);

    expect(resultado).toEqual({ status: 'success' });
    expect(updateRecipeVersionMock).toHaveBeenCalledWith(
      VERSION_ID,
      expect.objectContaining({ name: 'Sin perfume' }),
      ADMIN_ACTOR,
    );
  });

  it('R7: editar una original por esta via devuelve accion no permitida traducida', async () => {
    updateRecipeVersionMock.mockRejectedValue(new ActionNotAllowedError());

    const resultado = await updateRecipeVersionAction(ORIGINAL_ID, VALID_VERSION_INPUT);

    expect(resultado).toEqual({
      status: 'error',
      code: 'action_not_allowed',
      message: errorMessage('action_not_allowed'),
    });
  });
});

describe('listRecipeVersionsAction — R10, R38', () => {
  it('devuelve las versiones del caso de uso en exito', async () => {
    const versiones = [
      {
        id: VERSION_ID,
        name: 'Sin perfume',
        displayName: 'Crema · Sin perfume',
        isUnderReview: false,
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ];
    listRecipeVersionsMock.mockResolvedValue(versiones);

    const resultado = await listRecipeVersionsAction(ORIGINAL_ID);

    expect(resultado).toEqual({ status: 'success', data: versiones });
    expect(listRecipeVersionsMock).toHaveBeenCalledWith(ORIGINAL_ID, ADMIN_ACTOR);
  });

  it.each([
    ['R10: original inexistente, de baja o version', new RecipeNotFoundError(), 'recipe_not_found'],
    ['R38: sin permiso', new UnauthorizedError(), 'unauthorized'],
  ] as const)('%s → estado de error traducido', async (_caso, error, codigo) => {
    listRecipeVersionsMock.mockRejectedValue(error);

    const resultado = await listRecipeVersionsAction(ORIGINAL_ID);

    expect(resultado).toEqual({ status: 'error', code: codigo, message: errorMessage(codigo) });
  });
});

describe('QC-50 R13 — la empresa sale de getSessionContext y nunca de la entrada', () => {
  const INVOCACIONES: ReadonlyArray<{
    readonly nombre: string;
    readonly mock: ReturnType<typeof vi.fn>;
    readonly invocar: () => Promise<unknown>;
  }> = [
    {
      nombre: 'createRecipeAction',
      mock: createRecipeMock,
      invocar: () => createRecipeAction(VALID_RECIPE_INPUT),
    },
    {
      nombre: 'updateRecipeAction',
      mock: updateRecipeMock,
      invocar: () => updateRecipeAction('receta-1', VALID_RECIPE_INPUT),
    },
    {
      nombre: 'deleteRecipeAction',
      mock: deleteRecipeMock,
      invocar: () => deleteRecipeAction('receta-1'),
    },
    {
      nombre: 'getRecipeAction',
      mock: getRecipeMock,
      invocar: () => getRecipeAction('receta-1'),
    },
    {
      nombre: 'listRecipesAction',
      mock: listRecipesMock,
      invocar: () => listRecipesAction({ page: 1, pageSize: 10 }),
    },
    {
      nombre: 'createRecipeVersionAction',
      mock: createRecipeVersionMock,
      invocar: () => createRecipeVersionAction(ORIGINAL_ID, { name: 'Sin perfume' }),
    },
    {
      nombre: 'updateRecipeVersionAction',
      mock: updateRecipeVersionMock,
      invocar: () => updateRecipeVersionAction(VERSION_ID, VALID_VERSION_INPUT),
    },
    {
      nombre: 'listRecipeVersionsAction',
      mock: listRecipeVersionsMock,
      invocar: () => listRecipeVersionsAction(ORIGINAL_ID),
    },
  ];

  function actorRecibido(mock: ReturnType<typeof vi.fn>): unknown {
    const llamada = mock.mock.calls.at(-1);
    if (llamada === undefined) throw new Error('el caso de uso no fue llamado');
    return llamada.at(-1);
  }

  it('todas las actions piden LAS DOS caras de la sesion y componen el actor con la empresa', async () => {
    for (const { nombre, mock, invocar } of INVOCACIONES) {
      vi.clearAllMocks();
      getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
      getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
      mock.mockResolvedValue({ id: 'x', items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });

      await invocar();

      expect(getSessionUserMock, nombre).toHaveBeenCalledTimes(1);
      expect(getSessionContextMock, nombre).toHaveBeenCalledTimes(1);
      expect(actorRecibido(mock), nombre).toEqual(ADMIN_ACTOR);
    }
  });

  it('sin contexto de sesion el actor es null ENTERO, no un actor a medias sin empresa', async () => {
    // Lo que se impide es un actor a medias, con `companyId: undefined`: el ambito que
    // llegaria a la consulta no seria de nadie. El caso de uso -aqui mockeado- sigue siendo
    // quien rechaza (R12 de QC-74, `authorization.test.ts`): esta action nunca lee el
    // repositorio por su cuenta, asi que lo unico que puede fijar aqui es que el actor que
    // le entrega al caso de uso sea `null` entero, nunca uno con la empresa a medias.
    const AUSENCIAS = [
      { etiqueta: 'sin contexto de sesion', user: ADMIN_SESSION_USER, context: null },
      { etiqueta: 'sin usuario de sesion', user: null, context: ADMIN_SESSION_CONTEXT },
      { etiqueta: 'sin ninguna de las dos', user: null, context: null },
    ];

    for (const { etiqueta, user, context } of AUSENCIAS) {
      for (const { nombre, mock, invocar } of INVOCACIONES) {
        vi.clearAllMocks();
        getSessionUserMock.mockResolvedValue(user);
        getSessionContextMock.mockResolvedValue(context);
        mock.mockRejectedValue(new UnauthorizedError());

        const resultado = await invocar();

        expect(actorRecibido(mock), `${nombre} ${etiqueta}`).toBeNull();
        expect(resultado, `${nombre} ${etiqueta}`).toEqual({
          status: 'error',
          code: 'unauthorized',
          message: expect.any(String),
        });
      }
    }
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
