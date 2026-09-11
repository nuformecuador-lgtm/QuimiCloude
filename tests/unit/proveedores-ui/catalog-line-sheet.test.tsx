import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import { CATALOG_LIST_EMPTY_TESTID, SUPPLIER_FIELD } from '@/app/(private)/proveedores/[id]/components';
import { PRESENTATION_FIELD } from '@/components/shared/presentation-select';
import {
  PRESENTATION_UNIT_ERROR_TESTID,
  PRESENTATION_UNIT_FIELD,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
} from '@/components/shared/presentation-unit-select';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import type {
  CreatePresentationFormState,
  PresentationListResult,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { createCatalogLineSchema, type CatalogLineView, type SupplierView } from '@/lib/modules/proveedores';
import type {
  CatalogLineListResult,
  CatalogLineMutationFormState,
  CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { SupplierQueryResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

import { NARROW_VIEWPORT, WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { PERMISSIONS } from '@/lib/modules/identity';

/**
 * Panel lateral de alta y edicion de la linea de catalogo: R26, R29, R30, R31, R32, R33, R37, R38,
 * R41, R45 y R48 (`specs/QC-44-pantalla-de-proveedores/tasks.md > T15`).
 *
 * **Se monta la pagina de detalle REAL**, no el formulario suelto: lo que R26 exige es que el alta
 * y la edicion ocurran en un panel **sobre la lista**, sin navegar y sin perder la pagina, y eso
 * solo se puede afirmar con el catalogo detras. Las Server Actions estan mockeadas -son el borde
 * de modulos que esta ficha no abre (R49)-, que es lo unico que permite ejercitar el formulario
 * sin base de datos.
 *
 * **R29 y R30 son tests en negativo a proposito**: que el formulario no ofrezca un articulo del
 * inventario ni pida una imagen es justo lo que una feature posterior puede reintroducir sin que
 * ningun assert positivo se ponga rojo. QC-52 borro esa columna del modelo; aqui se vigila que la
 * pantalla no la resucite.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre copy.
 */

const {
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
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
  createPresentationActionMock:
    vi.fn<
      (
        prev: CreatePresentationFormState,
        data: FormData,
      ) => Promise<CreatePresentationFormState>
    >(),
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

// Solo se sustituye el aviso de exito: `<Toaster />` lo monta el layout privado (R34) y esta
// pantalla no lo re-monta, asi que sin este doble el toast no tendria donde pintarse.
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: toastSuccessMock, dismiss: vi.fn() },
}));

const testId = {
  vacio: CATALOG_LIST_EMPTY_TESTID,
  tabla: 'data-table',
  abrirAlta: 'catalog-line-create-open',
  abrirEdicion: 'catalog-line-edit-open',
  panel: 'catalog-line-sheet',
  formulario: 'catalog-line-form',
  enviar: 'catalog-line-form-submit',
  cancelar: 'catalog-line-form-cancel',
  errorFormulario: 'catalog-line-form-error',
  proveedorOculto: 'catalog-line-supplier-id',
  selectorPresentacion: 'presentation-select',
  opcionPresentacion: 'presentation-option',
  abrirAltaPresentacion: 'presentation-create-open',
  nombrePresentacion: 'presentation-create-name',
  guardarPresentacion: 'presentation-create-submit',
  unidadDePresentacion: PRESENTATION_UNIT_SELECT_TESTID,
  opcionUnidadDePresentacion: PRESENTATION_UNIT_OPTION_TESTID,
  errorUnidadDePresentacion: PRESENTATION_UNIT_ERROR_TESTID,
  selectorUnidad: 'unit-select',
  opcionUnidad: 'unit-option',
  opcionSinUnidad: 'unit-option-none',
} as const;

/** Ids reales: los esquemas del contrato publico exigen uuid en proveedor, presentacion y unidad. */
const PROVEEDOR_ID = crypto.randomUUID();
const LINEA_ID = crypto.randomUUID();

const PRESENTACION = { id: crypto.randomUUID(), name: 'Tambor 200 L' };
const PRESENTACION_NUEVA = { id: crypto.randomUUID(), name: 'Saco 25 kg' };
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

/**
 * Los campos de texto de un alta valida. **Los importes llevan cuatro decimales a proposito**: son
 * cadenas que ninguna conversion a coma flotante devolveria intactas (R41).
 */
const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Sosa cáustica escamas',
  cost: '1234.5678',
  minPurchase: '0.1005',
  deliveryTime: '7',
};

/** Los SIETE campos de negocio de la linea, tal como los nombra el contrato (R29, R31). */
const CAMPOS_DE_NEGOCIO = [
  'name',
  PRESENTATION_FIELD,
  'unitId',
  'imagePath',
  'cost',
  'minPurchase',
  'deliveryTime',
] as const;

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
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function paginaDeLineas(
  items: readonly CatalogLineView[],
  extra: { page?: number; total?: number } = {},
): CatalogLineListResult {
  const total = extra.total ?? items.length;
  return {
    status: 'success',
    data: {
      items,
      total,
      page: extra.page ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE)),
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

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar un
 * componente `async`. El arbol que se monta sigue siendo el REAL de `page.tsx`.
 */
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

type Consulta = Record<string, string | string[] | undefined>;

async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await ProveedorDetallePage({
    params: Promise.resolve({ id: PROVEEDOR_ID }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(await resolverServerComponents(arbol));
}

/** Abre el panel de alta y espera a que el formulario este montado. */
async function abrirAlta(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(testId.abrirAlta));
  await screen.findByTestId(testId.formulario);
}

/** Abre el panel de edicion de la primera fila. */
async function abrirEdicion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getAllByTestId(testId.abrirEdicion)[0]);
  await screen.findByTestId(testId.formulario);
}

/** Rellena los campos de texto. Vacia primero: el panel puede venir precargado (edicion). */
async function rellenarFormulario(
  user: ReturnType<typeof setupUser>,
  valores: Readonly<Record<string, string>> = {},
) {
  for (const [campo, valor] of Object.entries({ ...ALTA_VALIDA, ...valores })) {
    const control = screen.getByTestId(`catalog-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
}

/** Elige la primera presentacion de la lista (R37). */
async function elegirPresentacion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(testId.selectorPresentacion));
  await user.click(await esperarInteractiva((await screen.findAllByTestId(testId.opcionPresentacion))[0]));
}

/** Elige la primera unidad de la lista (R40). */
async function elegirUnidad(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(testId.selectorUnidad));
  await user.click(await esperarInteractiva((await screen.findAllByTestId(testId.opcionUnidad))[0]));
}

/**
 * Elige la primera unidad en el alta rapida de presentacion (QC-80 R11). Es OTRO selector que el
 * de la linea (`testId.selectorUnidad`): aquel declara la unidad de la LINEA de catalogo.
 */
async function elegirUnidadDePresentacion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(testId.unidadDePresentacion));
  await user.click(
    await esperarInteractiva((await screen.findAllByTestId(testId.opcionUnidadDePresentacion))[0]),
  );
}

/** Lo que el formulario enviaria como presentacion: el campo oculto que monta el primitivo. */
function presentacionSeleccionada(): string | null {
  return document.querySelector<HTMLInputElement>(`input[name="${PRESENTATION_FIELD}"]`)?.value ?? null;
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
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: PRESENTACION_NUEVA.id });
  createCatalogLineActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  deleteCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
});

describe('linea de catalogo — el panel lateral (R26)', () => {
  it('el alta se abre en un panel lateral sobre el catalogo, sin navegar ni recargar la lista', async () => {
    // R26 — panel lateral, NO dialogo modal centrado y NO otra URL. Al cerrarse se vuelve al
    // catalogo con la MISMA pagina y el MISMO tamano: sale gratis porque el estado de lista vive
    // en la cadena de consulta, asi que no hay ni una consulta de mas ni una navegacion.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    const panel = screen.getByTestId(testId.panel);
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(within(panel).getByTestId(testId.formulario)).toBeInTheDocument();
    // El catalogo sigue detras: el panel se superpone, no sustituye la pantalla.
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();

    // El panel NO se cierra ni con Escape ni con un click fuera: lleva un formulario dentro y un
    // gesto involuntario no puede tirar lo que el usuario llevaba escrito. Solo «Cancelar» y la X.
    await user.keyboard('{Escape}');
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    const velo = document.querySelector('[data-slot="sheet-overlay"]');
    if (velo === null) throw new Error('el panel lateral no monta velo');
    await user.click(velo);
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    await user.click(screen.getByTestId(testId.cancelar));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(listCatalogLinesActionMock).toHaveBeenCalledTimes(1);
  });

  it('el estado vacio del catalogo ofrece anadir la primera linea y abre el mismo panel', async () => {
    // R23 (su accion) + R26 — sin ni una linea, lo unico util es anadir la primera.
    const user = setupUser();
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    await user.click(within(vacio).getByTestId(testId.abrirAlta));

    expect(await screen.findByTestId(testId.formulario)).toBeInTheDocument();
  });
});

describe('linea de catalogo — lo que el formulario NO ofrece (R29, R30)', () => {
  it('no ofrece ningun campo ni selector de articulo del inventario', async () => {
    // R29 en negativo — QC-52 borro esa columna del modelo y del contrato: no hay donde
    // guardarla, y el esquema es `strictObject`, asi que colarla daria `invalid_input`.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    // Los campos que el formulario envia son EXACTAMENTE los que el contrato conoce.
    const nombresDeCampo = Array.from(document.querySelectorAll('[name]'))
      .map((control) => control.getAttribute('name'))
      .sort();
    expect(nombresDeCampo).toEqual(
      [SUPPLIER_FIELD, 'name', PRESENTATION_FIELD, 'unitId', 'cost', 'minPurchase', 'deliveryTime'].sort(),
    );

    // Y ninguna de las formas en que un articulo del inventario podria volver a colarse.
    for (const prohibido of ['productId', 'product', 'articleId', 'inventoryItemId']) {
      expect(document.querySelector(`[name="${prohibido}"]`), prohibido).toBeNull();
    }
    // Los unicos dos selectores del panel son presentacion y unidad.
    const panel = screen.getByTestId(testId.panel);
    expect(within(panel).getAllByRole('combobox')).toHaveLength(2);
  });

  it('no pide ninguna imagen ni ofrece subirla, y no la emite al guardar', async () => {
    // R30 — la columna existe desde QC-52 y nadie la llena (`P1`). El adaptador ya trata su
    // ausencia como ausencia, asi que el campo simplemente no viaja.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    const panel = screen.getByTestId(testId.panel);
    expect(panel.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('[name="imagePath"]')).toBeNull();
    expect(within(panel).queryAllByRole('img')).toHaveLength(0);

    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));
    expect(createCatalogLineActionMock.mock.calls[0][1].get('imagePath')).toBeNull();
  });
});

describe('linea de catalogo — alta (R29, R37, R38, R41, R43)', () => {
  it('captura los campos de negocio y los envia por la operacion de alta, con el proveedor oculto', async () => {
    // R29, R43 — la mutacion sale por la Server Action del modulo; ningun `fetch` a rutas propias.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    // El proveedor viaja oculto y sale de la URL, no de un campo que el usuario pueda tocar.
    expect(screen.getByTestId(testId.proveedorOculto)).toHaveValue(PROVEEDOR_ID);

    await elegirPresentacion(user);
    await elegirUnidad(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const enviado = createCatalogLineActionMock.mock.calls[0][1];
    expect(enviado.get(SUPPLIER_FIELD)).toBe(PROVEEDOR_ID);
    expect(enviado.get(PRESENTATION_FIELD)).toBe(PRESENTACION.id);
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(enviado.get(campo), campo).toBe(valor);
    }
    // Y la edicion no se toco: son dos operaciones distintas.
    expect(updateCatalogLineActionMock).not.toHaveBeenCalled();
  });

  it('la presentacion es obligatoria y se puede alcanzar y crear desde el propio formulario', async () => {
    // R37, R38 — sin presentacion no se llama a la operacion; y cuando la que hace falta no
    // existe, se crea sin salir del panel, queda seleccionada y no se pierde lo ya escrito.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    // Sin presentacion no se guarda nada: la obligatoriedad la declara el propio campo -el
    // `input` oculto que monta el primitivo- y la vuelve a medir el esquema del contrato publico.
    expect(createCatalogLineActionMock).not.toHaveBeenCalled();
    expect(document.querySelector(`input[name="${PRESENTATION_FIELD}"]`)).toBeRequired();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    await user.click(screen.getByTestId(testId.abrirAltaPresentacion));
    await user.type(screen.getByTestId(testId.nombrePresentacion), PRESENTACION_NUEVA.name);

    // QC-80 (R17): con el nombre escrito pero SIN unidad, el alta no sale del navegador -la
    // validacion previa usa el mismo esquema que el servidor- y el fallo se pinta junto al campo.
    await user.click(screen.getByTestId(testId.guardarPresentacion));
    expect(await screen.findByTestId(testId.errorUnidadDePresentacion)).toBeInTheDocument();
    expect(createPresentationActionMock).not.toHaveBeenCalled();

    await elegirUnidadDePresentacion(user);
    await user.click(screen.getByTestId(testId.guardarPresentacion));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    // QC-80 (R11): la unidad VIAJA en el mismo envio que crea la presentacion. Este es el camino
    // que R11 prohibe que exista sin unidad.
    expect(createPresentationActionMock.mock.calls[0][1].get(PRESENTATION_UNIT_FIELD)).toBe(
      UNIDAD.id,
    );
    await waitFor(() => expect(presentacionSeleccionada()).toBe(PRESENTACION_NUEVA.id));
    // Lo ya escrito sigue donde estaba (R38).
    expect(screen.getByTestId('catalog-field-name')).toHaveValue(ALTA_VALIDA.name);

    await user.click(screen.getByTestId(testId.enviar));
    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));
    const enviado = createCatalogLineActionMock.mock.calls[0][1];
    expect(enviado.get(PRESENTATION_FIELD)).toBe(PRESENTACION_NUEVA.id);
    // La unidad de la PRESENTACION no se cuela en el envio de la LINEA: el selector embebido no
    // aporta ningun campo al formulario anfitrion, que sigue teniendo UN solo `unitId` -el suyo,
    // vacio porque nadie lo eligio (R40)-.
    expect(enviado.getAll(PRESENTATION_UNIT_FIELD)).toEqual(['']);
  });

  it('la unidad es opcional: sin elegirla, la linea se guarda sin unidad', async () => {
    // R40 apoyada en R29 — «sin unidad» viaja como vacio y el adaptador lo trata como ausencia.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));
    expect(createCatalogLineActionMock.mock.calls[0][1].get('unitId')).toBe('');
  });

  it('el costo y el minimo viajan como la MISMA cadena que se escribio, y no son controles numericos', async () => {
    // R41 — `0.1005` es exactamente el valor que una conversion a coma flotante no devuelve
    // intacto. Se comprueba lo que llega a la action, no lo que se ve.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    for (const campo of ['cost', 'minPurchase'] as const) {
      const control = screen.getByTestId(`catalog-field-${campo}`);
      expect(control, campo).toHaveAttribute('type', 'text');
      expect(control, campo).toHaveAttribute('inputmode', 'decimal');
    }

    await elegirPresentacion(user);
    await rellenarFormulario(user, { cost: '0.1005', minPurchase: '0.1005' });
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const enviado = createCatalogLineActionMock.mock.calls[0][1];
    expect(enviado.get('cost')).toBe('0.1005');
    expect(enviado.get('minPurchase')).toBe('0.1005');
  });
});

describe('linea de catalogo — edicion (R31, R46)', () => {
  it('precarga los valores actuales y envia el REEMPLAZO COMPLETO de los siete campos', async () => {
    // R31, R46 — los datos de la linea llegan al panel POR PROPS desde la seccion del catalogo:
    // abrirlo no dispara ninguna lectura extra, y el reemplazo viaja con todos los campos aunque
    // solo se cambie uno.
    const user = setupUser();
    const laLinea = linea();

    await renderPantalla();
    await abrirEdicion(user);

    expect(screen.getByTestId('catalog-field-name')).toHaveValue(laLinea.name);
    expect(screen.getByTestId('catalog-field-cost')).toHaveValue(laLinea.cost);
    expect(screen.getByTestId('catalog-field-minPurchase')).toHaveValue(laLinea.minPurchase);
    expect(screen.getByTestId('catalog-field-deliveryTime')).toHaveValue(laLinea.deliveryTime);
    expect(presentacionSeleccionada()).toBe(laLinea.presentationId);
    expect(screen.getByTestId(testId.selectorUnidad)).toHaveTextContent(UNIDAD.symbol);

    // Abrir la edicion no vuelve a consultar nada (R46).
    expect(listCatalogLinesActionMock).toHaveBeenCalledTimes(1);
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByTestId('catalog-field-name'));
    await user.type(screen.getByTestId('catalog-field-name'), 'Ácido cítrico monohidrato');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateCatalogLineActionMock).toHaveBeenCalledTimes(1));

    // La firma real es `(id, prevState, formData)`: el id llega aplicado parcialmente con `bind`.
    const [id, , enviado] = updateCatalogLineActionMock.mock.calls[0];
    expect(id).toBe(laLinea.id);
    expect(enviado.get('name')).toBe('Ácido cítrico monohidrato');
    expect(enviado.get(PRESENTATION_FIELD)).toBe(laLinea.presentationId);
    expect(enviado.get('unitId')).toBe(laLinea.unitId);
    expect(enviado.get('cost')).toBe(laLinea.cost);
    expect(enviado.get('minPurchase')).toBe(laLinea.minPurchase);
    expect(enviado.get('deliveryTime')).toBe(String(laLinea.deliveryTime));
    expect(createCatalogLineActionMock).not.toHaveBeenCalled();
  });

  it('no ofrece cambiar el proveedor de la linea', async () => {
    // R31 en negativo — el proveedor es lo unico que la edicion no puede cambiar, y no porque un
    // `if` lo filtre: `updateCatalogLineSchema` no tiene ese campo.
    const user = setupUser();

    await renderPantalla();
    await abrirEdicion(user);

    expect(screen.queryByTestId(testId.proveedorOculto)).toBeNull();
    expect(document.querySelector(`[name="${SUPPLIER_FIELD}"]`)).toBeNull();

    await user.click(screen.getByTestId(testId.enviar));
    await waitFor(() => expect(updateCatalogLineActionMock).toHaveBeenCalledTimes(1));
    expect(updateCatalogLineActionMock.mock.calls[0][2].get(SUPPLIER_FIELD)).toBeNull();
  });

  it('una linea sin unidad y sin minimo se precarga sin inventar valores', async () => {
    // R31 — los dos son opcionales en el contrato (QC-52) y `null` no puede romper la precarga.
    const user = setupUser();
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ unitId: null, minPurchase: null, deliveryTime: null })]),
    );

    await renderPantalla();
    await abrirEdicion(user);

    expect(screen.getByTestId('catalog-field-minPurchase')).toHaveValue('');
    expect(screen.getByTestId('catalog-field-deliveryTime')).toHaveValue(null);
    expect(screen.getByTestId(testId.selectorUnidad)).toHaveTextContent('Sin unidad');
  });
});

describe('linea de catalogo — errores por codigo estable (R32, R45)', () => {
  it('un duplicate_catalog_line se pinta junto al campo nombre, sin cerrar el panel ni perder lo escrito', async () => {
    // R32 (primera mitad) — el error identifica la pareja nombre + presentacion, asi que va JUNTO
    // al nombre. Y se decide por el `code` estable, nunca por el texto: el mensaje del fixture no
    // se parece a «duplicado».
    const user = setupUser();
    createCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_catalog_line',
      message: 'MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA',
    });

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const errorDeCampo = await screen.findByTestId('catalog-error-name');
    // QC-70 R32: el mensaje del back, tal cual, sin sustituirlo por uno propio del formulario.
    expect(errorDeCampo).toHaveTextContent('MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA');
    const campo = screen.getByTestId('catalog-field-name');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', errorDeCampo.id);
    // Va junto al campo, NO en la region de error del formulario.
    expect(screen.queryByTestId(testId.errorFormulario)).toBeNull();

    // El panel sigue abierto y no se pierde lo escrito (R32).
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    for (const [nombre, valor] of Object.entries(ALTA_VALIDA)) {
      if (nombre === 'deliveryTime') continue;
      expect(screen.getByTestId(`catalog-field-${nombre}`), nombre).toHaveValue(valor);
    }
    expect(presentacionSeleccionada()).toBe(PRESENTACION.id);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('un unauthorized se pinta en la region de error del formulario y conserva lo escrito', async () => {
    // R32 (segunda mitad) — `unauthorized` no identifica campo: va a la region `role="alert"`.
    const user = setupUser();
    createCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(region).toHaveAttribute('role', 'alert');
    expect(within(region).getByTestId('catalog-line-form-error-message')).toHaveTextContent(
      'No autorizado.',
    );
    expect(within(region).getByTestId('catalog-line-form-error-code')).toHaveTextContent(
      'unauthorized',
    );
    expect(screen.queryByTestId('catalog-error-name')).toBeNull();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-field-name')).toHaveValue(ALTA_VALIDA.name);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('un catalog_line_not_found ofrece volver a la lista desde la region de error del formulario', async () => {
    // R32 — la LINEA dejo de existir mientras el panel estaba abierto. El destino se deriva de
    // `SUPPLIERS_ROUTE` (R2), nunca de un literal.
    //
    // QC-70 R20: el codigo es el ABIERTO por caso. En la edicion el «no existe» que puede llegar
    // es el de la linea, y trae SU frase; el del proveedor tiene la suya (el caso de abajo).
    const user = setupUser();
    updateCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'catalog_line_not_found',
      message: 'La linea de catalogo solicitada no existe.',
    });

    await renderPantalla();
    await abrirEdicion(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const vuelta = await screen.findByTestId('catalog-line-form-back-to-list');
    expect(vuelta.getAttribute('href')).toBe(SUPPLIERS_ROUTE);
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(
      within(screen.getByTestId(testId.errorFormulario)).getByTestId(
        'catalog-line-form-error-message',
      ),
    ).toHaveTextContent('La linea de catalogo solicitada no existe.');
  });

  it('un supplier_not_found del ALTA ofrece la misma vuelta, pero con SU propia frase', async () => {
    // QC-70 R20, R32, `design.md > 4.3` (nota sobre el 3) — este formulario recibe DOS codigos de
    // «no existe» distintos: en el alta el que llega es el del PROVEEDOR. Antes de la apertura por
    // caso los dos eran `not_found` y la pantalla pintaba la misma frase para las dos situaciones.
    const user = setupUser();
    createCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_not_found',
      message: 'El proveedor solicitado no existe.',
    });

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const vuelta = await screen.findByTestId('catalog-line-form-back-to-list');
    expect(vuelta.getAttribute('href')).toBe(SUPPLIERS_ROUTE);
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    // La frase es la del proveedor, NO la de la linea: ese es el cambio que la apertura permite.
    expect(
      within(screen.getByTestId(testId.errorFormulario)).getByTestId(
        'catalog-line-form-error-message',
      ),
    ).toHaveTextContent('El proveedor solicitado no existe.');
  });

  it('la validacion previa aplica el MISMO esquema del contrato publico y ni llama a la operacion', async () => {
    // R45 — el formulario valida con `createCatalogLineSchema`, el mismo que el servidor: el
    // costo cero se corta aqui, sin reescribir la regla y sin ninguna libreria de formularios. El
    // assert compara contra el propio esquema, no contra un copy.
    const user = setupUser();
    const costoCero = {
      supplierId: PROVEEDOR_ID,
      name: ALTA_VALIDA.name,
      presentationId: PRESENTACION.id,
      cost: '0.0000',
    };
    expect(createCatalogLineSchema.safeParse(costoCero).success).toBe(false);

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user, { cost: '0.0000' });
    await user.click(screen.getByTestId(testId.enviar));

    expect(await screen.findByTestId('catalog-error-cost')).toBeInTheDocument();
    // La operacion NI SE LLAMA: el rechazo es de la validacion previa.
    expect(createCatalogLineActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-field-name')).toHaveValue(ALTA_VALIDA.name);
  });

  it('el tiempo de entrega se captura como entero y un valor con decimales no llega a la operacion', async () => {
    // R41 (su otra mitad) — `deliveryTime` SI es entero en el contrato (`z.number().int()`), asi
    // que aqui el control numerico del navegador es correcto: no hay importe que proteger. Un
    // valor con decimales se corta antes de llamar a la operacion, y si aun asi llegara, la
    // conversion del formulario lo rechazaria sin convertirlo en `NaN`.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);

    const control = screen.getByTestId('catalog-field-deliveryTime');
    expect(control).toHaveAttribute('type', 'number');
    expect(control).toHaveAttribute('step', '1');
    expect(control).toHaveAttribute('min', '0');

    await rellenarFormulario(user, { deliveryTime: '' });
    await user.type(control, '2.5');
    await user.click(screen.getByTestId(testId.enviar));

    expect(createCatalogLineActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
  });
});

describe('linea de catalogo — exito y plataforma (R33, R34, R48)', () => {
  it('un guardado con exito cierra el panel, avisa por toast y refresca el catalogo', async () => {
    // R33 — `router.refresh()` vuelve a ejecutar el Server Component del catalogo con la MISMA
    // URL. Sin `revalidatePath`: exigiria abrir el adaptador driving de QC-43 (R49).
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    // Y no se navego: se vuelve al catalogo con la misma pagina y el mismo tamano (R26).
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la pantalla no monta ninguna region de avisos propia', async () => {
    // R34 en negativo — la region la monta el layout privado y NO se monta una segunda.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(0);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('los campos y las acciones del panel se usan igual en viewport angosto y en ancho', async () => {
    // R48 — 44x44 px de area tactil, 16 px de fuente en los campos, nada detras de `:hover` y
    // ningun alto de pantalla en unidades que iOS calcula mal.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      const user = setupUser();

      await renderPantalla();
      await abrirAlta(user);

      for (const campo of ['name', 'cost', 'minPurchase', 'deliveryTime'] as const) {
        const control = screen.getByTestId(`catalog-field-${campo}`);
        expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
        expect(control.className, `${campo} a ${ancho}px`).toContain('text-base');
        expect(control.className, `${campo} a ${ancho}px`).toContain('md:text-base');
      }

      for (const accion of [testId.enviar, testId.cancelar]) {
        const boton = screen.getByTestId(accion);
        expect(boton, `${accion} a ${ancho}px`).toBeVisible();
        expect(boton.className, `${accion} a ${ancho}px`).toContain('min-h-11');
        expect(boton.className, `${accion} a ${ancho}px`).toContain('min-w-11');
      }

      const panel = screen.getByTestId(testId.panel);
      expect(panel.className).not.toContain('h-screen');
      expect(panel.className).not.toContain('100vh');

      cleanup();
    }
  });
});

describe('linea de catalogo — los siete campos declarados (R29)', () => {
  it('el formulario cubre los siete campos de negocio, con la imagen declarada como ausente', async () => {
    // R29 + R30 — los seis que se capturan estan presentes y el septimo, la ruta de imagen, es una
    // ausencia DECIDIDA (`requirements.md > P1`), no un campo que alguien olvido cablear.
    const user = setupUser();

    await renderPantalla();
    await abrirAlta(user);

    const capturados = CAMPOS_DE_NEGOCIO.filter((campo) => campo !== 'imagePath');
    for (const campo of capturados) {
      expect(document.querySelector(`[name="${campo}"]`), campo).not.toBeNull();
    }
    expect(document.querySelector('[name="imagePath"]')).toBeNull();
    expect(CAMPOS_DE_NEGOCIO).toHaveLength(7);
  });
});

/** QC-71 T9 — R17 y R18 en el formulario de linea de catalogo. */
describe('linea de catalogo — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    createCatalogLineActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    createCatalogLineActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await abrirAlta(user);
    await elegirPresentacion(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createCatalogLineActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByTestId('catalog-line-form-error-code')).toHaveTextContent(
      'unauthorized',
    );
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(screen.queryByText(REFERENCIA_DEL_CASO)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });
});
