// La pagina de revision de una importacion de formula: su corte por permiso, sus dos lecturas en
// paralelo y sus estados de error sin ninguna fila.
//
// Mismo patron que `proveedores-ui/catalog-import-page.test.tsx`: se mockea el proveedor de
// sesion -no `requirePagePermission`-, de modo que el corte se ejecuta de verdad,
// `assertPermission` incluido, y `notFound()`/`redirect()` estan dobladas para que LANCEN como en
// produccion.

import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT_TYPES, type ProductView } from '@/lib/modules/inventario';
import type { ProductListResult } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { PERMISSIONS } from '@/lib/modules/identity';
import { LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type {
  ConfirmFormulaImportResult,
  PreviewFormulaImportResult,
} from '@/lib/modules/documentos/adapters/driving/formula-import-actions';
import type { FormulaImportPreview } from '@/lib/modules/documentos';

import FormulaImportPage from '@/app/(private)/produccion/formulas/importar/[documentoId]/page';

const {
  getSessionUserMock,
  notFoundMock,
  redirectMock,
  listUnitsActionMock,
  listProductsActionMock,
  previewFormulaImportActionMock,
  confirmFormulaImportActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn<(ruta: string) => never>(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<ProductListResult>>(),
  previewFormulaImportActionMock: vi.fn<(input: unknown) => Promise<PreviewFormulaImportResult>>(),
  confirmFormulaImportActionMock: vi.fn<(input: unknown) => Promise<ConfirmFormulaImportResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

// El arbol de la pagina arrastra el barrel de fórmulas entero (`RecipeStepsField`,
// `FormulaPdfUpload`...), que a su vez importa `recipe-actions.ts`: sin `observabilidad` en el
// doble el import de esa rama no carga.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/formula-import-actions', () => ({
  previewFormulaImportAction: previewFormulaImportActionMock,
  confirmFormulaImportAction: confirmFormulaImportActionMock,
}));

/** Los DOS permisos que la pantalla exige (R32). */
const PERMISOS_DE_LA_PANTALLA = ['recetas.consultar', 'recetas.modificar'] as const;

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

function productView(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: 'PRODUCTO-ID-NO-VISIBLE',
    name: 'Hipoclorito de sodio',
    imagePath: null,
    stock: '0',
    unitId: null,
    qtyAlert: null,
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function vistaPreviaVacia(): FormulaImportPreview {
  return { name: null, description: null, ingredients: [], steps: [], packingSteps: [], nameClash: null };
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
  return FormulaImportPage({ params: Promise.resolve({ documentoId: DOCUMENT_FILE_ID }) });
}

async function renderPantalla() {
  return render(await resolverServerComponents(await arbolDeLaPantalla()));
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(sesionCon(PERMISSIONS.map((permiso) => permiso.code)));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [productView()], total: 1, page: 1, pageSize: 200, totalPages: 1 },
  });
  previewFormulaImportActionMock.mockResolvedValue({ status: 'success', data: vistaPreviaVacia() });
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
    expect(previewFormulaImportActionMock).not.toHaveBeenCalled();
  });

  for (const ausente of PERMISOS_DE_LA_PANTALLA) {
    const presentes = PERMISOS_DE_LA_PANTALLA.filter((codigo) => codigo !== ausente);

    it(`sin \`${ausente}\` responde 404 y no llega a leer nada`, async () => {
      getSessionUserMock.mockResolvedValue(sesionCon(presentes));

      await expect(arbolDeLaPantalla()).rejects.toThrow();

      expect(notFoundMock).toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(listUnitsActionMock).not.toHaveBeenCalled();
      expect(listProductsActionMock).not.toHaveBeenCalled();
      expect(previewFormulaImportActionMock).not.toHaveBeenCalled();
    });
  }

  it('con los DOS permisos entra y pide las unidades, los productos y la vista previa en paralelo', async () => {
    await renderPantalla();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
    expect(listProductsActionMock).toHaveBeenCalledTimes(1);
    expect(previewFormulaImportActionMock).toHaveBeenCalledWith({ documentFileId: DOCUMENT_FILE_ID });
    expect(screen.getByTestId('formula-import-review')).toBeInTheDocument();
  });
});

/**
 * Quita los identificadores que React (`useId`) y `dnd-kit` regeneran en cada montaje -nunca
 * estables entre dos renders de la MISMA suite, aunque si lo son entre dos peticiones reales a la
 * pantalla-: sin esto, la comparacion de R2 fallaria por un contador interno que no tiene nada
 * que ver con lo que la pantalla pinta.
 */
function sinIdentificadoresVolatiles(html: string): string {
  return html
    .replace(/id="_r_\d+_"/g, 'id="_r_"')
    .replace(/aria-labelledby="_r_\d+_"/g, 'aria-labelledby="_r_"')
    .replace(/id="Dnd(DescribedBy|LiveRegion)-\d+"/g, 'id="Dnd$1"');
}

describe('la pantalla se puede abrir de nuevo y muestra lo mismo (R2)', () => {
  it('dos renders con la misma respuesta pintan lo mismo', async () => {
    const primero = render(await resolverServerComponents(await arbolDeLaPantalla()));
    const primerHtml = sinIdentificadoresVolatiles(primero.container.innerHTML);
    cleanup();

    const segundo = render(await resolverServerComponents(await arbolDeLaPantalla()));
    const segundoHtml = sinIdentificadoresVolatiles(segundo.container.innerHTML);

    expect(segundoHtml).toBe(primerHtml);
    expect(previewFormulaImportActionMock).toHaveBeenCalledTimes(2);
    expect(previewFormulaImportActionMock).toHaveBeenNthCalledWith(1, { documentFileId: DOCUMENT_FILE_ID });
    expect(previewFormulaImportActionMock).toHaveBeenNthCalledWith(2, { documentFileId: DOCUMENT_FILE_ID });
  });
});

describe('el archivo que no se pudo interpretar o no esta disponible (R3, R32)', () => {
  it('presenta el rechazo `invalid_input`, sin ninguna fila y con enlace de vuelta al listado', async () => {
    previewFormulaImportActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La entrada recibida no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId('formula-import-error')).toBeInTheDocument();
    expect(screen.getByTestId('formula-import-error-message')).toHaveTextContent(
      'No se pudo abrir esta revisión.',
    );
    expect(screen.getByTestId('formula-import-error-code')).toHaveTextContent('invalid_input');
    expect(screen.getByTestId('formula-import-error-back-link')).toBeInTheDocument();
    expect(screen.queryByTestId('formula-import-review')).toBeNull();
    expect(screen.queryByTestId(/^formula-import-row-/)).toBeNull();
  });

  it('con las unidades en error tampoco muestra ninguna fila', async () => {
    listUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La entrada recibida no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId('formula-import-error')).toBeInTheDocument();
    expect(screen.queryByTestId('formula-import-review')).toBeNull();
    expect(previewFormulaImportActionMock).toHaveBeenCalledTimes(1);
  });
});
