// Las dos Server Actions de la revision de una importacion de catalogo (T12), probadas contra
// dobles: sin sesion real, sin red y sin base. Lo que se afirma aqui es el REPARTO -la accion NO
// DECIDE NADA-: resuelve el actor con las dos caras de la sesion, valida con el esquema del
// contrato, entrega y traduce el error por su `code`.

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UnauthorizedError, ValidationError } from '@/lib/modules/documentos';
import { DOCUMENT_UPLOAD_PERMISSION } from '@/lib/modules/documentos/domain/actor';
import { supplierDetailRoute } from '@/lib/shared/routes';

import type { Actor, CatalogImportPreview, CatalogImportSummary } from '@/lib/modules/documentos';

const { getSessionUserMock, getSessionContextMock, previewCatalogImportMock, confirmCatalogImportMock } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    previewCatalogImportMock: vi.fn(),
    confirmCatalogImportMock: vi.fn(),
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
    previewCatalogImport: previewCatalogImportMock,
    confirmCatalogImport: confirmCatalogImportMock,
  },
}));

import {
  confirmCatalogImportAction,
  previewCatalogImportAction,
} from '@/lib/modules/documentos/adapters/driving/catalog-import-actions';

const PERSONA = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';

const SESSION_USER = {
  id: PERSONA,
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: [DOCUMENT_UPLOAD_PERMISSION],
};

const SESSION_CONTEXT = { userId: PERSONA, companyId: EMPRESA, roleName: 'Administrador' };

const ACTOR_ESPERADO: Actor = {
  id: PERSONA,
  companyId: EMPRESA,
  permissions: [DOCUMENT_UPLOAD_PERMISSION],
};

const PREVIEW_ENTRADA_VALIDA = { supplierId: PROVEEDOR, documentFileId: ARCHIVO };

const CONFIRM_ENTRADA_VALIDA = {
  supplierId: PROVEEDOR,
  documentFileId: ARCHIVO,
  lines: [],
  newPresentationUnits: [],
};

const PREVIEW_VACIA: CatalogImportPreview = { rows: [], crops: [], newPresentations: [] };

const RESUMEN_VACIO: CatalogImportSummary = { created: 0, updated: 0, unchanged: 0, presentationsCreated: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('documentos — la Server Action de la vista previa de una importacion de catalogo', () => {
  it('entrada invalida: `invalid_input` y el caso de uso NO se llama', async () => {
    const resultado = await previewCatalogImportAction({ supplierId: 'no-es-un-uuid' });

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(previewCatalogImportMock).not.toHaveBeenCalled();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('entrada valida: entrega el actor y la entrada ya tipada, y devuelve la vista previa', async () => {
    previewCatalogImportMock.mockResolvedValue(PREVIEW_VACIA);

    const resultado = await previewCatalogImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toEqual({ status: 'success', data: PREVIEW_VACIA });
    expect(previewCatalogImportMock).toHaveBeenCalledWith(ACTOR_ESPERADO, PREVIEW_ENTRADA_VALIDA);
  });

  it('sin sesion: el caso de uso recibe un actor null, y su rechazo se traduce por el `code`', async () => {
    getSessionUserMock.mockResolvedValue(null);
    previewCatalogImportMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await previewCatalogImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(previewCatalogImportMock).toHaveBeenCalledWith(null, PREVIEW_ENTRADA_VALIDA);
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('un rechazo de validacion del dominio se traduce sin filtrar su diagnostico', async () => {
    const error = new ValidationError('fila 1: incompleta (name)');
    previewCatalogImportMock.mockRejectedValue(error);

    const resultado = await previewCatalogImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(JSON.stringify(resultado)).not.toContain('incompleta');
  });

  it('un error ajeno al dominio sale como `unexpected`, con referencia y sin filtrar su texto', async () => {
    previewCatalogImportMock.mockRejectedValue(new Error('la IA respondio 500'));

    const resultado = await previewCatalogImportAction(PREVIEW_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'unexpected', reference: REQUEST_ID_DE_PRUEBA });
    expect(JSON.stringify(resultado)).not.toContain('la IA respondio 500');
  });

  it("declara 'use server' como primera sentencia y no se reexporta desde el contrato del modulo", async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const raizDelRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const fuente = readFileSync(
      join(raizDelRepo, 'lib', 'modules', 'documentos', 'adapters', 'driving', 'catalog-import-actions.ts'),
      'utf8',
    );
    const primeraSentencia = fuente
      .split('\n')
      .map((linea) => linea.trim())
      .find((linea) => linea.length > 0);
    expect(primeraSentencia).toBe("'use server';");

    const barril = readFileSync(join(raizDelRepo, 'lib', 'modules', 'documentos', 'index.ts'), 'utf8');
    expect(barril).not.toContain('catalog-import-actions');
  });
});

describe('documentos — la Server Action de la confirmacion de una importacion de catalogo', () => {
  it('entrada invalida: `invalid_input`, el caso de uso NO se llama y no revalida ninguna ruta', async () => {
    const resultado = await confirmCatalogImportAction({ supplierId: PROVEEDOR });

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(confirmCatalogImportMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('entrada valida: entrega el actor y la entrada ya tipada, y devuelve el resumen', async () => {
    confirmCatalogImportMock.mockResolvedValue(RESUMEN_VACIO);

    const resultado = await confirmCatalogImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toEqual({ status: 'success', data: RESUMEN_VACIO });
    expect(confirmCatalogImportMock).toHaveBeenCalledWith(ACTOR_ESPERADO, CONFIRM_ENTRADA_VALIDA);
  });

  it('un exito revalida la pagina de detalle del proveedor de la entrada, y solo esa', async () => {
    confirmCatalogImportMock.mockResolvedValue(RESUMEN_VACIO);

    await confirmCatalogImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(supplierDetailRoute(PROVEEDOR));
  });

  it('un rechazo del caso de uso NO revalida ninguna ruta', async () => {
    confirmCatalogImportMock.mockRejectedValue(new ValidationError('fila 1: duplicada'));

    const resultado = await confirmCatalogImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(JSON.stringify(resultado)).not.toContain('duplicada');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('un error ajeno al dominio sale como `unexpected`, con referencia y sin filtrar su texto', async () => {
    confirmCatalogImportMock.mockRejectedValue(new Error('violacion de restriccion en supplier_catalog_lines'));

    const resultado = await confirmCatalogImportAction(CONFIRM_ENTRADA_VALIDA);

    expect(resultado).toMatchObject({ status: 'error', code: 'unexpected', reference: REQUEST_ID_DE_PRUEBA });
    expect(JSON.stringify(resultado)).not.toContain('violacion de restriccion');
  });
});
