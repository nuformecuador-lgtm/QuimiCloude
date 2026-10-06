// Las dos Server Actions de la revision de una importacion de formula, probadas contra
// dobles: sin sesion real, sin red y sin base. Lo que se afirma aqui es el REPARTO -la accion NO
// DECIDE NADA-: resuelve el actor con las dos caras de la sesion, valida con el esquema del
// contrato, entrega y traduce el error por su `code`, probando las tres familias de error en
// orden (R20, R24, R29, R31).

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UnauthorizedError, ValidationError } from '@/lib/modules/documentos';
import { FORMULA_IMPORT_PERMISSION } from '@/lib/modules/documentos/domain/actor';
import {
  ActionNotAllowedError as RecetasActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
} from '@/lib/modules/recetas';
import { UnauthorizedError as InventarioUnauthorizedError } from '@/lib/modules/inventario';
import { FORMULAS_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

import type { Actor, FormulaImportPreview, FormulaImportSummary } from '@/lib/modules/documentos';

const { getSessionUserMock, getSessionContextMock, previewFormulaImportMock, confirmFormulaImportMock } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    previewFormulaImportMock: vi.fn(),
    confirmFormulaImportMock: vi.fn(),
  }));

const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  documentos: {
    previewFormulaImport: previewFormulaImportMock,
    confirmFormulaImport: confirmFormulaImportMock,
  },
}));

import {
  confirmFormulaImportAction,
  previewFormulaImportAction,
} from '@/lib/modules/documentos/adapters/driving/formula-import-actions';

const PERSONA = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const RECETA = '55555555-5555-4555-8555-555555555555';

const SESSION_USER = {
  id: PERSONA,
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: [FORMULA_IMPORT_PERMISSION],
};

const SESSION_CONTEXT = { userId: PERSONA, companyId: EMPRESA, roleName: 'Administrador' };

const ACTOR_ESPERADO: Actor = {
  id: PERSONA,
  companyId: EMPRESA,
  permissions: [FORMULA_IMPORT_PERMISSION],
};

const PREVIEW_ENTRADA_VALIDA = { documentFileId: ARCHIVO };

const CONFIRM_ENTRADA_VALIDA = {
  documentFileId: ARCHIVO,
  name: 'Desengrasante industrial',
  description: null,
  lines: [],
  steps: [],
  replaceRecipeId: null,
};

const PREVIEW_VACIA: FormulaImportPreview = {
  name: null,
  description: null,
  ingredients: [],
  steps: [],
  packingSteps: [],
  nameClash: null,
};

const RESUMEN: FormulaImportSummary = {
  recipeId: RECETA,
  outcome: 'created',
  rawMaterialsCreated: 0,
  rawMaterialsReused: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('documentos — la Server Action de la vista previa de una importacion de formula', () => {
  it('entrada invalida: `invalid_input` y el caso de uso NO se llama, sin leer la sesion', async () => {
    const resultado = await previewFormulaImportAction({ documentFileId: 'no-es-un-uuid' });

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(previewFormulaImportMock).not.toHaveBeenCalled();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('entrada valida: entrega el actor y la entrada ya tipada, y devuelve la vista previa', async () => {
    previewFormulaImportMock.mockResolvedValue(PREVIEW_VACIA);

    const resultado = await previewFormulaImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toEqual({ status: 'success', data: PREVIEW_VACIA });
    expect(previewFormulaImportMock).toHaveBeenCalledWith(ACTOR_ESPERADO, PREVIEW_ENTRADA_VALIDA);
  });

  it('sin sesion: el caso de uso recibe un actor null, y su rechazo se traduce por el `code`', async () => {
    getSessionUserMock.mockResolvedValue(null);
    previewFormulaImportMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await previewFormulaImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(previewFormulaImportMock).toHaveBeenCalledWith(null, PREVIEW_ENTRADA_VALIDA);
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('un rechazo de validacion de `documentos` se traduce sin filtrar su diagnostico', async () => {
    const error = new ValidationError('formula-import: no se pudo interpretar');
    previewFormulaImportMock.mockRejectedValue(error);

    const resultado = await previewFormulaImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(JSON.stringify(resultado)).not.toContain('no se pudo interpretar');
  });

  it('un error ajeno a las tres familias sale como `unexpected`, con referencia y sin filtrar su texto', async () => {
    previewFormulaImportMock.mockRejectedValue(new Error('la base no respondio'));

    const resultado = await previewFormulaImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'unexpected', reference: REQUEST_ID_DE_PRUEBA });
    expect(JSON.stringify(resultado)).not.toContain('la base no respondio');
  });

  it("declara 'use server' como primera sentencia y no se reexporta desde el contrato del modulo", async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const raizDelRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const fuente = readFileSync(
      join(raizDelRepo, 'lib', 'modules', 'documentos', 'adapters', 'driving', 'formula-import-actions.ts'),
      'utf8',
    );
    const primeraSentencia = fuente
      .split('\n')
      .map((linea) => linea.trim())
      .find((linea) => linea.length > 0);
    expect(primeraSentencia).toBe("'use server';");

    const barril = readFileSync(join(raizDelRepo, 'lib', 'modules', 'documentos', 'index.ts'), 'utf8');
    expect(barril).not.toContain('formula-import-actions');
  });
});

describe('documentos — la Server Action de la confirmacion de una importacion de formula', () => {
  it('entrada invalida: `invalid_input`, el caso de uso NO se llama y no revalida ninguna ruta', async () => {
    const resultado = await confirmFormulaImportAction({ documentFileId: ARCHIVO });

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(confirmFormulaImportMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('entrada valida: entrega el actor y la entrada ya tipada, y devuelve el resumen', async () => {
    confirmFormulaImportMock.mockResolvedValue(RESUMEN);

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toEqual({ status: 'success', data: RESUMEN });
    expect(confirmFormulaImportMock).toHaveBeenCalledWith(ACTOR_ESPERADO, { ...CONFIRM_ENTRADA_VALIDA, packingSteps: [] });
  });

  it('un exito revalida el listado de formulas y la ficha de la receta resultante, y solo esas dos', async () => {
    confirmFormulaImportMock.mockResolvedValue(RESUMEN);

    await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, FORMULAS_ROUTE);
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, recipeEditRoute(RECETA));
  });

  it('un rechazo del caso de uso NO revalida ninguna ruta', async () => {
    confirmFormulaImportMock.mockRejectedValue(new ValidationError('formula-import: revision invalida'));

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(JSON.stringify(resultado)).not.toContain('revision invalida');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R20 — `RecipeDuplicateNameError` de `recetas` sale con SU codigo, no `unexpected_error`', async () => {
    confirmFormulaImportMock.mockRejectedValue(new RecipeDuplicateNameError());

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'recipe_duplicate_name' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R20 — `RecipeNotFoundError` de `recetas` sale con SU codigo, no `unexpected_error`', async () => {
    confirmFormulaImportMock.mockRejectedValue(new RecipeNotFoundError());

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'recipe_not_found' });
  });

  it('R24 — `ActionNotAllowedError` de `recetas` sale con SU codigo, no `unexpected_error`', async () => {
    confirmFormulaImportMock.mockRejectedValue(new RecetasActionNotAllowedError());

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'action_not_allowed' });
  });

  it('R31 — `UnauthorizedError` de `inventario` sale con SU codigo, no `unexpected_error`', async () => {
    confirmFormulaImportMock.mockRejectedValue(new InventarioUnauthorizedError());

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('un error ajeno a las tres familias sale como `unexpected`, con referencia y sin filtrar su texto', async () => {
    confirmFormulaImportMock.mockRejectedValue(new Error('violacion de restriccion en recipe_lines'));

    const resultado = await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'unexpected', reference: REQUEST_ID_DE_PRUEBA });
    expect(JSON.stringify(resultado)).not.toContain('violacion de restriccion');
  });

  it('R29 — la confirmacion entrega una sesion por invocacion, igual que la vista previa', async () => {
    confirmFormulaImportMock.mockResolvedValue(RESUMEN);

    await confirmFormulaImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });
});
