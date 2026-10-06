// La pantalla de importación y el enlace que lleva a ella. Se dobla el proveedor de sesión, no
// `requirePagePermission`, así que el corte se ejecuta de verdad y `notFound()`/`redirect()`
// lanzan como en producción.

import { cleanup, render, screen } from '@testing-library/react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InventarioPage from '@/app/(private)/inventario/page';
import InventoryImportPage, { maxDuration } from '@/app/(private)/inventario/importar/page';
import { IMPORT_SCREEN_TESTID, IMPORT_TITLE_TESTID } from '@/app/(private)/inventario/importar/components';
import { PERMISSIONS } from '@/lib/modules/identity';
import type { ProductFormUnitsResult } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { INVENTORY_IMPORT_ROUTE, LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';

const { getSessionUserMock, notFoundMock, redirectMock, listUnitsActionMock, listProductFormUnitsActionMock } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn<(ruta: string) => never>(() => {
      throw new Error('NEXT_REDIRECT');
    }),
    listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
    listProductFormUnitsActionMock: vi.fn<() => Promise<ProductFormUnitsResult>>(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
  createUnitAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductFormUnitsAction: listProductFormUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/inventory-import-actions', () => ({
  previewInventoryImportAction: vi.fn(),
  confirmInventoryImportAction: vi.fn(),
}));

const TODOS_LOS_PERMISOS = PERMISSIONS.map((permiso) => permiso.code);

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

/** Busca en el árbol devuelto por un Server Component un elemento cuyo `href` sea `href`. */
function contieneEnlaceA(nodo: ReactNode, href: string): boolean {
  if (Array.isArray(nodo)) return nodo.some((hijo: ReactNode) => contieneEnlaceA(hijo, href));
  if (!isValidElement(nodo)) return false;
  const props = (nodo as ReactElement<{ href?: unknown; children?: ReactNode }>).props;
  if (props.href === href) return true;
  return contieneEnlaceA(props.children, href);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(sesionCon(TODOS_LOS_PERMISOS));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
});

afterEach(() => {
  cleanup();
});

describe('pantalla /inventario/importar', () => {
  it('R2 sin inventario.modificar responde 404 y no pide nada', async () => {
    getSessionUserMock.mockResolvedValue(
      sesionCon(TODOS_LOS_PERMISOS.filter((codigo) => codigo !== 'inventario.modificar')),
    );

    await expect(InventoryImportPage()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(listUnitsActionMock).not.toHaveBeenCalled();
  });

  it('R2 sin sesión redirige al login y no responde 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(InventoryImportPage()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('R2 con inventario.modificar pinta la pantalla y pide las unidades una vez', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['inventario.modificar']));

    render(await InventoryImportPage());

    expect(screen.getByTestId(IMPORT_TITLE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(IMPORT_SCREEN_TESTID)).toBeInTheDocument();
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
  });

  it('si las unidades no se pueden leer, la pantalla se pinta igual', async () => {
    listUnitsActionMock.mockResolvedValue({ status: 'error', code: 'unauthorized', message: 'x' });

    render(await InventoryImportPage());

    expect(screen.getByTestId(IMPORT_SCREEN_TESTID)).toBeInTheDocument();
  });

  it('declara el tiempo máximo de la petición para la confirmación', () => {
    expect(maxDuration).toBe(300);
  });
});

describe('enlace «Importar» en /inventario', () => {
  async function arbolDeInventario(): Promise<ReactNode> {
    return InventarioPage({ searchParams: Promise.resolve({}) });
  }

  it('R2 aparece con inventario.modificar y lleva a la ruta de importación', async () => {
    expect(contieneEnlaceA(await arbolDeInventario(), INVENTORY_IMPORT_ROUTE)).toBe(true);
  });

  it('R2 no aparece sin inventario.modificar', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['inventario.consultar']));

    expect(contieneEnlaceA(await arbolDeInventario(), INVENTORY_IMPORT_ROUTE)).toBe(false);
  });
});
