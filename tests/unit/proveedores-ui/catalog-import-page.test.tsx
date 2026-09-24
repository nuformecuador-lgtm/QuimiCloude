// La pagina de revision de una importacion de catalogo: su corte por permiso y
// sus estados de error sin ninguna fila.
//
// Mismo patron que `configuracion-ui/unit-page.test.tsx`: se mockea el proveedor de sesion —no
// `requirePagePermission`—, de modo que el corte se ejecuta de verdad, `assertPermission`
// incluido, y `notFound()`/`redirect()` estan dobladas para que LANCEN como en produccion.

import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { SupplierQueryResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type {
  ConfirmCatalogImportResult,
  PreviewCatalogImportResult,
} from '@/lib/modules/documentos/adapters/driving/catalog-import-actions';
import type { SupplierView } from '@/lib/modules/proveedores';

import CatalogImportPage from '@/app/(private)/proveedores/[id]/importar/[documentoId]/page';

const {
  getSessionUserMock,
  notFoundMock,
  redirectMock,
  getSupplierActionMock,
  listUnitsActionMock,
  previewCatalogImportActionMock,
  confirmCatalogImportActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn<(ruta: string) => never>(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getSupplierActionMock: vi.fn<(id: string) => Promise<SupplierQueryResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  previewCatalogImportActionMock: vi.fn<(input: unknown) => Promise<PreviewCatalogImportResult>>(),
  confirmCatalogImportActionMock: vi.fn<(input: unknown) => Promise<ConfirmCatalogImportResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/catalog-import-actions', () => ({
  previewCatalogImportAction: previewCatalogImportActionMock,
  confirmCatalogImportAction: confirmCatalogImportActionMock,
}));

/** Los DOS permisos que la pantalla exige. */
const PERMISOS_DE_LA_PANTALLA = ['proveedores.consultar', 'proveedores.modificar'] as const;

const SUPPLIER_ID = 'PROVEEDOR-ID-NO-VISIBLE';
const DOCUMENT_FILE_ID = 'ARCHIVO-ID-NO-VISIBLE';

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

function proveedor(): SupplierView {
  return {
    id: SUPPLIER_ID,
    name: 'Químicos del Norte',
    nameNormalized: 'quimicos del norte',
    phone: null,
    email: null,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: 'autor-no-visible',
    updatedBy: 'autor-no-visible',
  };
}

function vistaPreviaVacia(): PreviewCatalogImportResult {
  return { status: 'success', data: { rows: [], crops: [], newPresentations: [] } };
}

/** Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente. */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

/** Arbol que devuelve la pagina real, sin resolver: sigue siendo `async`. */
async function arbolDeLaPantalla() {
  return CatalogImportPage({
    params: Promise.resolve({ id: SUPPLIER_ID, documentoId: DOCUMENT_FILE_ID }),
  });
}

async function renderPantalla() {
  return render(await resolverServerComponents(await arbolDeLaPantalla()));
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(sesionCon(PERMISSIONS.map((permiso) => permiso.code)));
  getSupplierActionMock.mockResolvedValue({ status: 'success', data: proveedor() });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  previewCatalogImportActionMock.mockResolvedValue(vistaPreviaVacia());
});

afterEach(() => {
  cleanup();
});

describe('el corte por permiso ocurre antes de leer nada (R32)', () => {
  it('sin sesion redirige al login, y no responde 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPantalla()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getSupplierActionMock).not.toHaveBeenCalled();
    expect(previewCatalogImportActionMock).not.toHaveBeenCalled();
  });

  for (const ausente of PERMISOS_DE_LA_PANTALLA) {
    const presentes = PERMISOS_DE_LA_PANTALLA.filter((codigo) => codigo !== ausente);

    it(`sin \`${ausente}\` responde 404 y no llega a leer el proveedor ni el documento`, async () => {
      getSessionUserMock.mockResolvedValue(sesionCon(presentes));

      await expect(arbolDeLaPantalla()).rejects.toThrow();

      expect(notFoundMock).toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(getSupplierActionMock).not.toHaveBeenCalled();
      expect(listUnitsActionMock).not.toHaveBeenCalled();
      expect(previewCatalogImportActionMock).not.toHaveBeenCalled();
    });
  }

  it('con los DOS permisos entra y pide el proveedor, las unidades y la vista previa en paralelo', async () => {
    await renderPantalla();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getSupplierActionMock).toHaveBeenCalledWith(SUPPLIER_ID);
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
    expect(previewCatalogImportActionMock).toHaveBeenCalledWith({
      supplierId: SUPPLIER_ID,
      documentFileId: DOCUMENT_FILE_ID,
    });
    expect(screen.getByTestId('catalog-import-review')).toBeInTheDocument();
  });
});

describe('el documento que no se pudo interpretar o no esta disponible (R3, R6)', () => {
  it('presenta el rechazo `invalid_input`, sin ninguna fila', async () => {
    previewCatalogImportActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La entrada recibida no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId('catalog-import-error')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-import-error-code')).toHaveTextContent('invalid_input');
    expect(screen.queryByTestId('catalog-import-review')).toBeNull();
    expect(screen.queryByTestId(/^catalog-import-row-/)).toBeNull();
  });
});

describe('el proveedor de la ruta no existe (R4)', () => {
  it('presenta `supplier_not_found` y descarta la vista previa pedida en paralelo, sin mostrar ninguna fila', async () => {
    getSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_not_found',
      message: 'El proveedor solicitado no existe.',
    });

    await renderPantalla();

    // La pagina pide las tres cosas en paralelo (`Promise.all`): la vista previa SI se pide,
    // pero su resultado se descarta en cuanto el proveedor no existe.
    expect(previewCatalogImportActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('catalog-import-error')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-import-error-code')).toHaveTextContent('supplier_not_found');
    expect(screen.queryByTestId('catalog-import-review')).toBeNull();
  });
});
