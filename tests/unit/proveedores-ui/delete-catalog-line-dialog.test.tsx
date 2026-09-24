import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { CatalogLineView, SupplierView } from '@/lib/modules/proveedores';
import type {
  CatalogLineListResult,
  CatalogLineMutationFormState,
  CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type {
  CreateSupplierFormState,
  SupplierMutationFormState,
  SupplierQueryResult,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { supplierDetailRoute } from '@/lib/shared/routes';
import { PERMISSIONS } from '@/lib/modules/identity';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Baja de una linea de catalogo con confirmacion: R36, R33 y R47
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T16`).
 *
 * **Se monta la pagina de detalle REAL**: la baja se activa desde la fila del catalogo, asi que
 * probarla con el dialogo suelto no diria nada de como se llega a el.
 *
 * **El caso «sin confirmar» usa un doble que FALLA si se le llama**: comprobar solo que el mock no
 * registro llamadas deja pasar el dia en que alguien invoque la operacion desde otro sitio y el
 * contador se ponga a cero antes del assert. Un doble que revienta convierte la invocacion
 * prematura en un fallo ruidoso, que es lo que R36 exige vigilar.
 */

const {
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
  createSupplierActionMock,
  updateSupplierActionMock,
  deleteSupplierActionMock,
  listCatalogLinesActionMock,
  createCatalogLineActionMock,
  updateCatalogLineActionMock,
  deleteCatalogLineActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
  createPresentationActionMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  usePathnameMock: vi.fn<() => string>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSupplierActionMock: vi.fn<(id: string) => Promise<SupplierQueryResult>>(),
  createSupplierActionMock:
    vi.fn<(prev: CreateSupplierFormState, data: FormData) => Promise<CreateSupplierFormState>>(),
  updateSupplierActionMock:
    vi.fn<
      (
        id: string,
        prev: SupplierMutationFormState,
        data: FormData,
      ) => Promise<SupplierMutationFormState>
    >(),
  deleteSupplierActionMock:
    vi.fn<(prev: SupplierMutationFormState, data: FormData) => Promise<SupplierMutationFormState>>(),
  listCatalogLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<CatalogLineListResult>>(),
  createCatalogLineActionMock:
    vi.fn<
      (prev: CreateCatalogLineFormState, data: FormData) => Promise<CreateCatalogLineFormState>
    >(),
  updateCatalogLineActionMock:
    vi.fn<
      (
        id: string,
        prev: CatalogLineMutationFormState,
        data: FormData,
      ) => Promise<CatalogLineMutationFormState>
    >(),
  deleteCatalogLineActionMock:
    vi.fn<
      (prev: CatalogLineMutationFormState, data: FormData) => Promise<CatalogLineMutationFormState>
    >(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
  createPresentationActionMock: vi.fn(),
  toastSuccessMock: vi.fn<(message: string) => void>(),
}));

// QC-75 (T6): la pagina exige su permiso con `requirePagePermission`, que resuelve la sesion por
// `@/lib/composition`. Sin este mock la pantalla responderia 404 y este archivo no mediria nada.
// El usuario lleva el CATALOGO ENTERO, derivado de `PERMISSIONS` y nunca escrito a mano: aqui no
// se prueba autorizacion -eso es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`-, se
// prueba lo que se ve cuando SI se puede ver.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
  createSupplierAction: createSupplierActionMock,
  updateSupplierAction: updateSupplierActionMock,
  deleteSupplierAction: deleteSupplierActionMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  listCatalogLinesAction: listCatalogLinesActionMock,
  createCatalogLineAction: createCatalogLineActionMock,
  updateCatalogLineAction: updateCatalogLineActionMock,
  deleteCatalogLineAction: deleteCatalogLineActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: createPresentationActionMock,
}));

// La pagina de detalle monta la pieza de subida, que importa sus Server Actions por ruta exacta;
// esas acciones resuelven sus puertos por `@/lib/composition`, doblado aqui solo con `identity`.
// Sin estos dos dobles el archivo ni siquiera llega a montar la pantalla.
vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: vi.fn(),
}));

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: toastSuccessMock, dismiss: vi.fn() },
}));

const testId = {
  // La tabla compartida nombra la fila por el id de la linea (`data-table-row-<id>`).
  fila: /^data-table-row-/,
  abrirBaja: 'catalog-line-delete-open',
  dialogo: 'delete-catalog-line-dialog',
  mensaje: 'delete-catalog-line-message',
  idOculto: 'delete-catalog-line-id',
  cancelar: 'delete-catalog-line-cancel',
  confirmar: 'delete-catalog-line-confirm',
  error: 'delete-catalog-line-error',
} as const;

const PROVEEDOR_ID = crypto.randomUUID();
const LINEA_ID = crypto.randomUUID();
const PRESENTACION = { id: crypto.randomUUID(), name: 'Tambor 200 L' };
// QC-39 (T1): el listado devuelve `UnitView`; el fixture se completa con sus tres campos
// nuevos y ningun aserto de este archivo cambia de exigencia.
const UNIDAD = {
  id: crypto.randomUUID(),
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

function proveedor(): SupplierView {
  return {
    id: PROVEEDOR_ID,
    name: 'Químicos del Norte',
    nameNormalized: 'quimicos del norte',
    phone: '+52 81 1234 5678',
    email: 'ventas@quimicosdelnorte.example',
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
  };
}

function linea(overrides: Partial<CatalogLineView> = {}): CatalogLineView {
  return {
    id: LINEA_ID,
    supplierId: PROVEEDOR_ID,
    name: 'Ácido cítrico anhidro',
    presentationId: PRESENTACION.id,
    unitId: UNIDAD.id,
    imagePath: null,
    cost: '99.5000',
    minPurchase: '2.5000',
    deliveryTime: 3,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function paginaDeLineas(items: readonly CatalogLineView[]): CatalogLineListResult {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

function paginaDePresentaciones(): PresentationListResult {
  return {
    status: 'success',
    data: {
      items: [
        {
          ...PRESENTACION,
          nameNormalized: 'tambor 200 l',
          // QC-80 (R15): `PresentationView` declara su unidad. Un uuid cualquiera: esta
          // pantalla no la pinta -la unidad de la LINEA de catalogo es propia (R26)-.
          unitId: '11111111-1111-4111-8111-111111111111',
          content: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

/** Resuelve los Server Components `async`: `react-dom` en jsdom no sabe ejecutarlos. */
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

async function renderPantalla() {
  const arbol = await ProveedorDetallePage({
    params: Promise.resolve({ id: PROVEEDOR_ID }),
    searchParams: Promise.resolve({}),
  });
  return render(await resolverServerComponents(arbol));
}

/** Abre el dialogo de baja de la primera fila del catalogo. */
async function abrirBaja(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getAllByTestId(testId.abrirBaja)[0]);
  return screen.findByTestId(testId.dialogo);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({
    id: 'u-test-42',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
  usePathnameMock.mockReturnValue(supplierDetailRoute(PROVEEDOR_ID));
  getSupplierActionMock.mockResolvedValue({ status: 'success', data: proveedor() });
  listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea()]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listPresentationsActionMock.mockResolvedValue(paginaDePresentaciones());
  deleteCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
});

describe('baja de una linea de catalogo — sin confirmar (R36)', () => {
  it('cada fila ofrece la baja y abrir el dialogo NO invoca la operacion', async () => {
    // R36 — el doble FALLA si se le llama: una invocacion prematura tiene que reventar el test,
    // no limitarse a no incrementar un contador.
    const user = setupUser();
    deleteCatalogLineActionMock.mockImplementation(() => {
      throw new Error('la baja se invoco SIN confirmacion');
    });

    await renderPantalla();

    const fila = screen.getAllByTestId(testId.fila)[0];
    const dialogo = await abrirBaja(user);

    // El dialogo NOMBRA la linea y advierte de que no se puede deshacer.
    expect(within(dialogo).getByTestId(testId.mensaje)).toHaveTextContent(linea().name);
    expect(within(fila).getByTestId(testId.abrirBaja)).toBeInTheDocument();
    expect(deleteCatalogLineActionMock).not.toHaveBeenCalled();
  });

  it('cancelar cierra el dialogo sin invocar la operacion ni refrescar', async () => {
    // R36 — MIENTRAS el usuario no confirme, no se invoca nada.
    const user = setupUser();
    deleteCatalogLineActionMock.mockImplementation(() => {
      throw new Error('la baja se invoco tras CANCELAR');
    });

    await renderPantalla();
    await abrirBaja(user);

    await user.click(screen.getByTestId(testId.cancelar));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogo)).toBeNull());

    expect(deleteCatalogLineActionMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('cerrar con Escape tampoco invoca la operacion', async () => {
    // R36 — la unica via a la operacion es el boton de confirmar.
    const user = setupUser();
    deleteCatalogLineActionMock.mockImplementation(() => {
      throw new Error('la baja se invoco al cerrar con Escape');
    });

    await renderPantalla();
    await abrirBaja(user);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId(testId.dialogo)).toBeNull());

    expect(deleteCatalogLineActionMock).not.toHaveBeenCalled();
  });
});

describe('baja de una linea de catalogo — al confirmar (R36, R33)', () => {
  it('invoca la baja con el id en campo oculto, cierra, avisa por toast y refresca la lista', async () => {
    // R36 (segunda mitad) + R33 — el `id` viaja oculto, que es la forma que la action espera, y
    // por eso no necesita `bind`. El refresco vuelve a ejecutar el Server Component del catalogo.
    const user = setupUser();
    const laLinea = linea();

    await renderPantalla();
    const dialogo = await abrirBaja(user);

    expect(within(dialogo).getByTestId(testId.idOculto)).toHaveValue(laLinea.id);

    await user.click(screen.getByTestId(testId.confirmar));

    await waitFor(() => expect(deleteCatalogLineActionMock).toHaveBeenCalledTimes(1));
    expect(deleteCatalogLineActionMock.mock.calls[0][1].get('id')).toBe(laLinea.id);

    await waitFor(() => expect(screen.queryByTestId(testId.dialogo)).toBeNull());
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    // No se navego a ninguna parte: el catalogo conserva su pagina y su tamano (R26).
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('una baja rechazada mantiene el dialogo abierto con el mensaje a la vista', async () => {
    // R33 en negativo — cerrar el dialogo dejaria al usuario creyendo que la linea se dio de baja.
    const user = setupUser();
    deleteCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para dar de baja líneas.',
    });

    await renderPantalla();
    await abrirBaja(user);

    await user.click(screen.getByTestId(testId.confirmar));

    const error = await screen.findByTestId(testId.error);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No tienes permiso para dar de baja líneas.');
    expect(screen.getByTestId(testId.dialogo)).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('la baja de una linea nombra SOLO esa linea y no promete arrastrar nada', async () => {
    // R36 — a diferencia de la baja de un proveedor (R35), la de una linea no arrastra nada: la
    // linea es la hoja del arbol. El aviso de arrastre de la otra pantalla no puede aparecer aqui.
    const user = setupUser();
    const otra = linea({ id: crypto.randomUUID(), name: 'Hipoclorito de sodio' });
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea(), otra]));

    await renderPantalla();

    await user.click(screen.getAllByTestId(testId.abrirBaja)[1]);
    const dialogo = await screen.findByTestId(testId.dialogo);

    expect(within(dialogo).getByTestId(testId.mensaje)).toHaveTextContent(otra.name);
    expect(within(dialogo).getByTestId(testId.idOculto)).toHaveValue(otra.id);
    expect(screen.queryByTestId('delete-supplier-cascade')).toBeNull();
  });
});

describe('baja de una linea de catalogo — accesibilidad y plataforma (R47, R48)', () => {
  it('los controles se identifican por rol y cumplen el area tactil en angosto y en ancho', async () => {
    // R47, R48 — el disparador tiene nombre accesible propio porque su contenido es un icono, y
    // los tres controles miden al menos 44x44 px a los dos lados del breakpoint.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      const user = setupUser();

      await renderPantalla();

      const disparador = screen.getAllByTestId(testId.abrirBaja)[0];
      expect(disparador, `a ${ancho}px`).toHaveAccessibleName(`Dar de baja ${linea().name}`);
      expect(disparador.className, `a ${ancho}px`).toContain('min-h-11');
      expect(disparador.className, `a ${ancho}px`).toContain('min-w-11');

      const dialogo = await abrirBaja(user);
      expect(dialogo).toHaveAttribute('role', 'alertdialog');

      for (const accion of [testId.cancelar, testId.confirmar]) {
        const boton = within(dialogo).getByTestId(accion);
        expect(boton, `${accion} a ${ancho}px`).toBeVisible();
        expect(boton.className, `${accion} a ${ancho}px`).toContain('min-h-11');
        expect(boton.className, `${accion} a ${ancho}px`).toContain('min-w-11');
      }

      cleanup();
    }
  });
});

/** QC-71 T9 — R17 y R18 en el dialogo de baja de una linea de catalogo. */
describe('baja de una linea — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    deleteCatalogLineActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await abrirBaja(user);
    await user.click(screen.getByTestId(testId.confirmar));

    const region = await screen.findByTestId(testId.error);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para dar de baja líneas.',
    });

    await renderPantalla();
    await abrirBaja(user);
    await user.click(screen.getByTestId(testId.confirmar));

    const region = await screen.findByTestId(testId.error);
    expect(region).toHaveTextContent('No tienes permiso para dar de baja líneas.');
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(screen.queryByText(REFERENCIA_DEL_CASO)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
  });
});
