import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import { createCatalogLineSchema, type CatalogLineView, type SupplierView } from '@/lib/modules/proveedores';
import type {
  CatalogLineListResult,
  CatalogLineMutationFormState,
  CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { SupplierQueryResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { NARROW_VIEWPORT, WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { PERMISSIONS } from '@/lib/modules/identity';

/**
 * Material y medidas en el formulario de linea de catalogo, y la imagen conservada al editar.
 *
 * Mismo patron que `catalog-line-sheet.test.tsx`: se monta la pagina de detalle REAL, con las
 * Server Actions mockeadas -son el borde de modulos que esta ficha no abre-.
 */

const {
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
  listCatalogLinesActionMock,
  createCatalogLineActionMock,
  updateCatalogLineActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
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
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

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
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  listCatalogLinesAction: listCatalogLinesActionMock,
  createCatalogLineAction: createCatalogLineActionMock,
  updateCatalogLineAction: updateCatalogLineActionMock,
  deleteCatalogLineAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: vi.fn(),
}));

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: vi.fn(), dismiss: vi.fn() },
}));

const testId = {
  abrirAlta: 'catalog-line-create-open',
  abrirEdicion: 'catalog-line-edit-open',
  formulario: 'catalog-line-form',
  enviar: 'catalog-line-form-submit',
} as const;

const PROVEEDOR_ID = crypto.randomUUID();
const LINEA_ID = crypto.randomUUID();
const PRESENTACION = { id: crypto.randomUUID(), name: 'Tambor 200 L' };
const UNIDAD = {
  id: crypto.randomUUID(),
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Sosa cáustica escamas',
  cost: '1234.5678',
  minPurchase: '0.1005',
  deliveryTime: '7',
};

function proveedor(overrides: Partial<SupplierView> = {}): SupplierView {
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
    ...overrides,
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
    material: null,
    measurements: null,
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

function paginaVaciaDePresentaciones() {
  return {
    status: 'success' as const,
    data: {
      items: [
        {
          ...PRESENTACION,
          nameNormalized: 'tambor 200 l',
          unitId: '11111111-1111-4111-8111-111111111111',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    },
  };
}

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

async function abrirAlta(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(testId.abrirAlta));
  await screen.findByTestId(testId.formulario);
}

async function abrirEdicion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getAllByTestId(testId.abrirEdicion)[0]);
  await screen.findByTestId(testId.formulario);
}

async function elegirPresentacion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-select'));
  await user.click((await screen.findAllByTestId('presentation-option'))[0]);
}

async function rellenarAltaValida(user: ReturnType<typeof setupUser>) {
  for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
    const control = screen.getByTestId(`catalog-field-${campo}`);
    await user.clear(control);
    await user.type(control, valor);
  }
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
  listPresentationsActionMock.mockResolvedValue(paginaVaciaDePresentaciones());
  createCatalogLineActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
});

describe('linea de catalogo — material y medidas se ven y se escriben (R28)', () => {
  it('el alta ofrece material, diametro, alto y boca, y los envia con los names del contrato', async () => {
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    await elegirPresentacion(user);
    await rellenarAltaValida(user);

    await user.type(screen.getByTestId('catalog-field-material'), 'Vidrio ámbar');
    await user.type(screen.getByTestId('catalog-field-diameterValue'), '7.5');
    await user.type(screen.getByTestId('catalog-field-heightValue'), '12');
    await user.type(screen.getByTestId('catalog-field-mouth'), '28/410');

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));
    const enviado = createCatalogLineActionMock.mock.calls[0][1];
    expect(enviado.get('material')).toBe('Vidrio ámbar');
    expect(enviado.get('diameterValue')).toBe('7.5');
    expect(['mm', 'cm']).toContain(enviado.get('diameterUnit'));
    expect(enviado.get('heightValue')).toBe('12');
    expect(['mm', 'cm']).toContain(enviado.get('heightUnit'));
    expect(enviado.get('mouth')).toBe('28/410');
  });

  it('la edicion precarga material y medidas de la linea', async () => {
    const user = setupUser();
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([
        linea({
          material: 'Vidrio ámbar',
          measurements: {
            diameter: { value: '7.5000', unit: 'cm' },
            height: { value: '12.0000', unit: 'cm' },
            mouth: '28/410',
          },
        }),
      ]),
    );

    await renderPantalla();
    await abrirEdicion(user);

    expect(screen.getByTestId('catalog-field-material')).toHaveValue('Vidrio ámbar');
    expect(screen.getByTestId('catalog-field-diameterValue')).toHaveValue('7.5000');
    expect(screen.getByTestId('catalog-field-heightValue')).toHaveValue('12.0000');
    expect(screen.getByTestId('catalog-field-mouth')).toHaveValue('28/410');
    expect(screen.getByTestId('catalog-field-diameterUnit')).toHaveTextContent('cm');
    expect(screen.getByTestId('catalog-field-heightUnit')).toHaveTextContent('cm');
  });

  it('una linea sin material ni medidas precarga los campos vacios, sin inventar valores', async () => {
    const user = setupUser();

    await renderPantalla();
    await abrirEdicion(user);

    expect(screen.getByTestId('catalog-field-material')).toHaveValue('');
    expect(screen.getByTestId('catalog-field-diameterValue')).toHaveValue('');
    expect(screen.getByTestId('catalog-field-heightValue')).toHaveValue('');
    expect(screen.getByTestId('catalog-field-mouth')).toHaveValue('');
  });

  it('la validacion previa usa el mismo esquema del contrato: un material solo de espacios se corta', async () => {
    const user = setupUser();

    expect(
      createCatalogLineSchema.safeParse({
        supplierId: PROVEEDOR_ID,
        name: ALTA_VALIDA.name,
        presentationId: PRESENTACION.id,
        cost: ALTA_VALIDA.cost,
        material: '   ',
      }).success,
    ).toBe(true);

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarAltaValida(user);
    await user.type(screen.getByTestId('catalog-field-heightValue'), '0.0000');
    await user.click(screen.getByTestId(testId.enviar));

    // Un alto de cero no es un valor valido (misma regla que el costo): se corta antes de llamar
    // a la operacion.
    expect(await screen.findByTestId('catalog-error-heightValue')).toBeInTheDocument();
    expect(createCatalogLineActionMock).not.toHaveBeenCalled();
  });
});

describe('linea de catalogo — la imagen se conserva al editar (R29)', () => {
  it('la imagen viaja oculta con el valor de la linea y no se pierde al guardar sin tocarla', async () => {
    const user = setupUser();
    const laLinea = linea({
      imagePath: 'empresa-1/archivo-1/1-1.png',
      material: 'Vidrio ámbar',
      measurements: {
        diameter: { value: '7.5000', unit: 'cm' },
        height: null,
        mouth: null,
      },
    });
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([laLinea]));

    await renderPantalla();
    await abrirEdicion(user);

    const campoImagen = document.querySelector<HTMLInputElement>('input[name="imagePath"]');
    expect(campoImagen).toHaveAttribute('type', 'hidden');
    expect(campoImagen).toHaveValue(laLinea.imagePath);

    // Se cambia SOLO el costo, como en una revision de precios: material, medidas e imagen no
    // se tocan.
    await user.clear(screen.getByTestId('catalog-field-cost'));
    await user.type(screen.getByTestId('catalog-field-cost'), '150');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateCatalogLineActionMock).toHaveBeenCalledTimes(1));
    const [, , enviado] = updateCatalogLineActionMock.mock.calls[0];
    expect(enviado.get('imagePath')).toBe(laLinea.imagePath);
    expect(enviado.get('material')).toBe('Vidrio ámbar');
    expect(enviado.get('diameterValue')).toBe('7.5000');
    expect(enviado.get('heightValue')).toBe('');
    expect(enviado.get('mouth')).toBe('');
  });

  it('una linea sin imagen edita y guarda sin inventar ninguna ruta', async () => {
    const user = setupUser();

    await renderPantalla();
    await abrirEdicion(user);

    const campoImagen = document.querySelector<HTMLInputElement>('input[name="imagePath"]');
    expect(campoImagen).toHaveValue('');

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateCatalogLineActionMock).toHaveBeenCalledTimes(1));
    const [, , enviado] = updateCatalogLineActionMock.mock.calls[0];
    expect(enviado.get('imagePath')).toBe('');
  });
});

describe('linea de catalogo — plataforma en los campos nuevos (R37)', () => {
  it('material, medidas y sus selectores cumplen 44 px de objetivo y 16 px de fuente en angosto y en ancho', async () => {
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      const user = setupUser();

      await renderPantalla();
      await abrirAlta(user);

      for (const campo of ['material', 'diameterValue', 'heightValue', 'mouth'] as const) {
        const control = screen.getByTestId(`catalog-field-${campo}`);
        expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
        expect(control.className, `${campo} a ${ancho}px`).toContain('text-base');
      }

      for (const selector of ['diameterUnit', 'heightUnit'] as const) {
        const control = screen.getByTestId(`catalog-field-${selector}`);
        expect(control.className, `${selector} a ${ancho}px`).toContain('min-h-11');
        expect(control.className, `${selector} a ${ancho}px`).toContain('text-base');
      }

      cleanup();
    }
  });

  it('ninguna accion de los campos nuevos existe solo detras de :hover', async () => {
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    const panel = screen.getByTestId('catalog-line-sheet');
    const seccionMedidas = within(panel);
    for (const testid of ['catalog-field-material', 'catalog-field-mouth']) {
      expect(seccionMedidas.getByTestId(testid).className).not.toMatch(/\bhover:/);
    }
  });
});
