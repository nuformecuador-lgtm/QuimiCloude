import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ProductNamePicker } from '@/app/(private)/inventario/components/product-name-picker';
import {
  OrderCustomerPicker,
  PackagingSelect,
  RecipePicker,
  type OrderCustomerChoice,
  type RecipePickerOption,
} from '@/app/(private)/pedidos/components';
import {
  ProductPicker,
  type ProductPickerOption,
} from '@/app/(private)/produccion/formulas/components/product-picker';
import { PresentationSelect } from '@/components/shared/presentation-select';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { arbolAccesible, nuncaResuelve } from './arbol-accesible';

/**
 * Paridad de los seis buscadores asincronos: por cada estado del desplegable se congela el arbol
 * accesible y, aparte, lo que el arbol no ve: el texto del campo, lo que viajaria en el
 * `FormData` del formulario anfitrion, cada llamada a las Server Actions simuladas y cada aviso al
 * consumidor. Asi un cambio de cuando o con que se consulta tambien rompe la paridad.
 *
 * Los mocks son los de los tests de cada buscador (`packaging-select.test.tsx`,
 * `order-customer-picker.test.tsx`, `presentation-select-unit-filter.test.tsx`...). Los ids son
 * fijos, no `crypto.randomUUID()`, porque viajan en las llamadas congeladas.
 */

const { acciones, avisoMock, REFERENCIA } = vi.hoisted(() => ({
  acciones: {
    listProductsAction: vi.fn<(query: unknown) => Promise<unknown>>(),
    listRecipesAction: vi.fn<(query: unknown) => Promise<unknown>>(),
    listPresentationsAction: vi.fn<(query: unknown) => Promise<unknown>>(),
    createPresentationAction: vi.fn<(state: unknown, formData: FormData) => Promise<unknown>>(),
    searchOrderCustomersAction: vi.fn<(query: unknown, purpose: unknown) => Promise<unknown>>(),
  },
  avisoMock: vi.fn<(option: unknown) => void>(),
  REFERENCIA: '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d',
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: acciones.listProductsAction,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: acciones.listRecipesAction,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: acciones.listPresentationsAction,
  createPresentationAction: acciones.createPresentationAction,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  searchOrderCustomersAction: acciones.searchOrderCustomersAction,
}));

// La referencia del inesperado sale de un uuid aleatorio: fija, el snapshot no cambia de corrida
// en corrida.
vi.mock('@/lib/modules/observabilidad', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/modules/observabilidad')>()),
  newRequestId: () => REFERENCIA,
}));

// ---------------------------------------------------------------------------------------
// Utillaje comun
// ---------------------------------------------------------------------------------------

const FORM_TESTID = 'paridad-form';

/** El buscador dentro de un formulario: asi se lee lo que enviaria el anfitrion. */
function montar(buscador: ReactNode) {
  return render(<form data-testid={FORM_TESTID}>{buscador}</form>);
}

function serializarArgumento(argumento: unknown): unknown {
  return argumento instanceof FormData ? { FormData: Array.from(argumento.entries()) } : argumento;
}

function llamadas(mock: { mock: { calls: readonly (readonly unknown[])[] } }): unknown[] {
  return mock.mock.calls.map((argumentos) => argumentos.map(serializarArgumento));
}

/** Lo que el arbol accesible no recoge: el valor del campo, el `FormData` y las llamadas. */
function datos(campo: HTMLInputElement) {
  const form = screen.getByTestId<HTMLFormElement>(FORM_TESTID);
  return {
    campo: campo.value,
    formulario: Array.from(new FormData(form).entries()),
    acciones: Object.fromEntries(
      Object.entries(acciones).map(([nombre, mock]) => [nombre, llamadas(mock)]),
    ),
    avisos: llamadas(avisoMock),
  };
}

function congelar(campo: HTMLInputElement) {
  expect(arbolAccesible()).toMatchSnapshot('arbol');
  expect(datos(campo)).toMatchSnapshot('datos');
}

/** Base UI desmonta el desplegable un tick despues de cerrarlo: sin esperar, el snapshot podria
 * caer en el paso intermedio. */
async function esperarCerrado() {
  await waitFor(() =>
    expect(document.querySelector('[data-slot="autocomplete-content"]')).toBeNull(),
  );
}

/** jsdom no maqueta: se declara una lista sin margen por debajo y se dispara su `scroll`. */
function bajarAlFinal(lista: HTMLElement) {
  Object.defineProperty(lista, 'clientHeight', { value: 256, configurable: true });
  Object.defineProperty(lista, 'scrollHeight', { value: 256, configurable: true });
  Object.defineProperty(lista, 'scrollTop', { value: 0, configurable: true });
  fireEvent.scroll(lista);
}

function pagina(items: readonly unknown[], page = 1, totalPages = 1, pageSize = MAX_PAGE_SIZE) {
  return { status: 'success', data: { items, total: items.length, page, pageSize, totalPages } };
}

/** La pagina 1 con `totalPages` 2 y la 2 sin resolver: deja el buscador en «cargando mas». */
function primeraYLaSiguienteEnVuelo(items: readonly unknown[], pageSize = MAX_PAGE_SIZE) {
  return async (query: unknown) => {
    const { page } = query as { page: number };
    return page === 1 ? pagina(items, 1, 2, pageSize) : nuncaResuelve();
  };
}

const ERROR_DE_CATALOGO = { status: 'error', code: 'invalid_input', message: 'Consulta no valida.' };

/** Un producto del catalogo con todo lo que leen los tres buscadores que consultan productos. */
function producto(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    imagePath: null,
    stock: '150.0000',
    unitId: '00000000-0000-4000-8000-0000000000f1',
    qtyAlert: '10.0000',
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    reserved: '30.0000',
    available: '120.0000',
    presentationId: '00000000-0000-4000-8000-0000000000e1',
    presentationName: '500 ml',
    presentationContent: '500.0000',
    presentationUnitId: '00000000-0000-4000-8000-0000000000f2',
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------------------
// ProductPicker
// ---------------------------------------------------------------------------------------

describe('paridad de ProductPicker', () => {
  const TEST_ID = 'linea-0-product';
  const ACIDO: ProductPickerOption = { id: '10000000-0000-4000-8000-000000000001', name: 'Ácido cítrico', unitId: null };
  const AGUA: ProductPickerOption = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Agua desmineralizada',
    unitId: '00000000-0000-4000-8000-0000000000f1',
  };
  const SAL: ProductPickerOption = { id: '10000000-0000-4000-8000-000000000003', name: 'Sal', unitId: null };

  function montarPicker({
    value = '',
    label = 'Elige un ingrediente',
    items = [ACIDO, AGUA],
    totalPages = 1,
    excludedIds,
    error,
  }: {
    value?: string;
    label?: string;
    items?: readonly ProductPickerOption[];
    totalPages?: number;
    excludedIds?: readonly string[];
    error?: string;
  } = {}) {
    montar(
      <ProductPicker
        value={value}
        label={label}
        ariaLabel="Ingrediente de la línea 1"
        onSelect={avisoMock}
        error={error}
        testId={TEST_ID}
        initialPage={{ items, totalPages }}
        excludedIds={excludedIds}
        units={[]}
        productType={PRODUCT_TYPES.PRODUCT}
      />,
    );
  }

  const campo = () => screen.getByTestId<HTMLInputElement>(TEST_ID);

  beforeEach(() => {
    acciones.listProductsAction.mockResolvedValue(pagina([producto(SAL.id, SAL.name)]));
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarPicker();
    congelar(campo());
  });

  it('R1 — cerrado, con eleccion y error del campo', () => {
    montarPicker({ value: ACIDO.id, label: ACIDO.name, error: 'Elige un ingrediente.' });
    congelar(campo());
  });

  it('R1 R2 R8 — abierto con filas, de la primera pagina precargada y sin consultar', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await esperarInteractiva((await screen.findAllByTestId(`${TEST_ID}-option`))[0]);
    congelar(campo());
  });

  it('R1 R8 — hay mas: la primera pagina precargada declara otra', async () => {
    const user = setupUser();
    montarPicker({ totalPages: 2 });
    await user.click(campo());
    await screen.findByTestId(`${TEST_ID}-has-more`);
    congelar(campo());
  });

  it('R1 R2 R8 — excluidas las de otras lineas, salvo la de esta', async () => {
    const user = setupUser();
    montarPicker({
      value: ACIDO.id,
      label: ACIDO.name,
      items: [ACIDO, AGUA, SAL],
      excludedIds: [ACIDO.id, AGUA.id],
    });
    await user.click(campo());
    await screen.findAllByTestId(`${TEST_ID}-option`);
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarPicker();
    await user.type(campo(), 'sal');
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 R8 — cargando mas: la pagina 2 se pide al servidor al bajar al final', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarPicker({ totalPages: 2 });
    await user.click(campo());
    await screen.findByTestId(`${TEST_ID}-has-more`);
    bajarAlFinal(screen.getByTestId(`${TEST_ID}-popup`));
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    const user = setupUser();
    montarPicker({ items: [] });
    await user.click(campo());
    await screen.findByTestId(`${TEST_ID}-empty`);
    congelar(campo());
  });

  it('R1 R2 — error de carga, con el mensaje del servidor', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockResolvedValue(ERROR_DE_CATALOGO);
    montarPicker();
    await user.type(campo(), 'sal');
    await screen.findByTestId(`${TEST_ID}-load-error`);
    congelar(campo());
  });

  it('R1 R2 — elegir una opcion avisa y cierra', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await user.click(await esperarInteractiva((await screen.findAllByTestId(`${TEST_ID}-option`))[1]));
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });
});

// ---------------------------------------------------------------------------------------
// RecipePicker
// ---------------------------------------------------------------------------------------

describe('paridad de RecipePicker', () => {
  const CREMA: RecipePickerOption = {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Crema hidratante',
    imageUrl: null,
  };
  const GEL: RecipePickerOption = {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Gel antibacterial',
    imageUrl: '/imagenes/gel.png',
  };

  function montarPicker({
    items = [CREMA, GEL],
    totalPages = 1,
    defaultValue,
    defaultLabel,
    error,
  }: {
    items?: readonly RecipePickerOption[];
    totalPages?: number;
    defaultValue?: string;
    defaultLabel?: string;
    error?: string;
  } = {}) {
    montar(
      <RecipePicker
        initialPage={{ items, totalPages }}
        defaultValue={defaultValue}
        defaultLabel={defaultLabel}
        error={error}
        onSelect={avisoMock}
      />,
    );
  }

  const campo = () => screen.getByTestId<HTMLInputElement>('recipe-picker');

  beforeEach(() => {
    acciones.listRecipesAction.mockResolvedValue(pagina([GEL]));
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarPicker();
    congelar(campo());
  });

  it('R1 R2 — cerrado, con eleccion y error del campo', () => {
    montarPicker({ defaultValue: CREMA.id, defaultLabel: CREMA.name, error: 'Elige una receta.' });
    congelar(campo());
  });

  it('R1 R2 R8 — abierto con filas, de la primera pagina precargada y sin consultar', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await esperarInteractiva((await screen.findAllByTestId('recipe-picker-option'))[0]);
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    const user = setupUser();
    acciones.listRecipesAction.mockReturnValue(nuncaResuelve());
    montarPicker();
    await user.type(campo(), 'gel');
    await waitFor(() => expect(acciones.listRecipesAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 R8 — cargando mas: la pagina 2 se pide al servidor al bajar al final', async () => {
    const user = setupUser();
    acciones.listRecipesAction.mockReturnValue(nuncaResuelve());
    montarPicker({ totalPages: 2 });
    await user.click(campo());
    await screen.findAllByTestId('recipe-picker-option');
    bajarAlFinal(screen.getByTestId('recipe-picker-popup'));
    await waitFor(() => expect(acciones.listRecipesAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    const user = setupUser();
    montarPicker({ items: [] });
    await user.click(campo());
    await screen.findByTestId('recipe-picker-empty');
    congelar(campo());
  });

  it('R1 R2 — error de carga, con el mensaje del servidor', async () => {
    const user = setupUser();
    acciones.listRecipesAction.mockResolvedValue(ERROR_DE_CATALOGO);
    montarPicker();
    await user.type(campo(), 'gel');
    await screen.findByTestId('recipe-picker-load-error');
    congelar(campo());
  });

  it('R1 R2 — elegir una opcion la deja en el campo oculto y avisa', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await user.click(await esperarInteractiva((await screen.findAllByTestId('recipe-picker-option'))[1]));
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });

  it('R1 R2 — escribir otra cosa retira la eleccion y avisa con null', async () => {
    const user = setupUser();
    montarPicker({ defaultValue: CREMA.id, defaultLabel: CREMA.name });
    await user.type(campo(), 'x');
    await waitFor(() => expect(avisoMock).toHaveBeenCalledWith(null));
    await waitFor(() => expect(acciones.listRecipesAction).toHaveBeenCalledTimes(1));
    await screen.findAllByTestId('recipe-picker-option');
    congelar(campo());
  });
});

// ---------------------------------------------------------------------------------------
// PackagingSelect
// ---------------------------------------------------------------------------------------

describe('paridad de PackagingSelect', () => {
  const LITRO_ID = '00000000-0000-4000-8000-0000000000a1';
  const MILILITRO_ID = '00000000-0000-4000-8000-0000000000a2';
  const BOTELLA = producto('30000000-0000-4000-8000-000000000001', 'Botella PET 500 ml', {
    type: PRODUCT_TYPES.PACKAGING,
    presentationUnitId: MILILITRO_ID,
  });
  const BIDON_AGOTADO = producto('30000000-0000-4000-8000-000000000002', 'Bidón 1 L', {
    type: PRODUCT_TYPES.PACKAGING,
    available: '0.0000',
    presentationId: '00000000-0000-4000-8000-0000000000e2',
    presentationName: '1 L',
    presentationContent: '1.0000',
    presentationUnitId: LITRO_ID,
  });
  const SIN_CONTENIDO = producto('30000000-0000-4000-8000-000000000003', 'Garrafa sin contenido', {
    type: PRODUCT_TYPES.PACKAGING,
    presentationId: '00000000-0000-4000-8000-0000000000e3',
    presentationName: 'Garrafa',
    presentationContent: null,
    presentationUnitId: LITRO_ID,
  });

  function montarSelect(disabled?: boolean) {
    montar(
      <PackagingSelect unitIds={[LITRO_ID, MILILITRO_ID]} onSelect={avisoMock} disabled={disabled} />,
    );
  }

  const campo = () => screen.getByTestId<HTMLInputElement>('packaging-select');

  async function abrir() {
    const user = setupUser();
    await user.click(campo());
    return user;
  }

  beforeEach(() => {
    acciones.listProductsAction.mockResolvedValue(pagina([BOTELLA, BIDON_AGOTADO]));
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarSelect();
    congelar(campo());
  });

  it('R1 R15 — cerrado y deshabilitado', () => {
    montarSelect(true);
    congelar(campo());
  });

  it('R1 R2 — abierto con filas', async () => {
    montarSelect();
    await abrir();
    await esperarInteractiva((await screen.findAllByTestId('packaging-option'))[0]);
    congelar(campo());
  });

  it('R1 R2 — cerrado, con eleccion: elegir avisa y cierra', async () => {
    montarSelect();
    const user = await abrir();
    await user.click(await esperarInteractiva((await screen.findAllByTestId('packaging-option'))[1]));
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });

  it('R1 R2 — escribir otra cosa retira la eleccion y avisa con null', async () => {
    montarSelect();
    const user = await abrir();
    await user.click(await esperarInteractiva((await screen.findAllByTestId('packaging-option'))[0]));
    await user.type(campo(), 'x');
    await waitFor(() => expect(avisoMock).toHaveBeenLastCalledWith(null));
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(2));
    await screen.findAllByTestId('packaging-option');
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina', async () => {
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarSelect();
    await abrir();
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarSelect();
    const user = setupUser();
    await user.type(campo(), 'bot');
    await waitFor(() =>
      expect(acciones.listProductsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'bot' }),
      ),
    );
    congelar(campo());
  });

  it('R1 R2 — cargando mas, al bajar al final', async () => {
    acciones.listProductsAction.mockImplementation(primeraYLaSiguienteEnVuelo([BOTELLA]));
    montarSelect();
    await abrir();
    await screen.findAllByTestId('packaging-option');
    bajarAlFinal(screen.getByTestId('packaging-select-popup'));
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(2));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    acciones.listProductsAction.mockResolvedValue(pagina([]));
    montarSelect();
    await abrir();
    await screen.findByTestId('packaging-select-empty');
    congelar(campo());
  });

  it('R1 R11 — error de carga de catalogo', async () => {
    acciones.listProductsAction.mockResolvedValue(ERROR_DE_CATALOGO);
    montarSelect();
    await abrir();
    await screen.findByText('Consulta no valida.');
    congelar(campo());
  });

  it('R1 R11 — error de carga inesperado, con su referencia', async () => {
    acciones.listProductsAction.mockRejectedValue(new Error('red caida'));
    montarSelect();
    await abrir();
    await screen.findByTestId('packaging-select-load-error');
    congelar(campo());
  });

  it('R1 R13 — opcion no elegible: pulsarla no elige ni cierra', async () => {
    acciones.listProductsAction.mockResolvedValue(pagina([BOTELLA, SIN_CONTENIDO]));
    montarSelect();
    await abrir();
    const opciones = await screen.findAllByTestId('packaging-option');
    await esperarInteractiva(opciones[0]);
    fireEvent.click(opciones[1]);
    congelar(campo());
  });

  it('R1 R15 — sin permiso: avisa, no lista y no vuelve a consultar', async () => {
    acciones.listProductsAction.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    montarSelect();
    const user = await abrir();
    await screen.findByTestId('packaging-select-forbidden');
    await user.type(campo(), 'bot');
    congelar(campo());
  });
});

// ---------------------------------------------------------------------------------------
// ProductNamePicker
// ---------------------------------------------------------------------------------------

describe('paridad de ProductNamePicker', () => {
  const BOTELLA = producto('40000000-0000-4000-8000-000000000001', 'Botella PET 500 ml', {
    type: PRODUCT_TYPES.PACKAGING,
  });
  const TAPA = producto('40000000-0000-4000-8000-000000000002', 'Tapa rosca', {
    type: PRODUCT_TYPES.PACKAGING,
    qtyAlert: null,
  });

  function montarPicker({ defaultValue, error }: { defaultValue?: string; error?: string } = {}) {
    montar(
      <ProductNamePicker
        defaultValue={defaultValue}
        error={error}
        onSelect={avisoMock}
        productType={PRODUCT_TYPES.PACKAGING}
      />,
    );
  }

  const campo = () => screen.getByTestId<HTMLInputElement>('product-field-name');

  beforeEach(() => {
    acciones.listProductsAction.mockResolvedValue(pagina([BOTELLA, TAPA]));
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarPicker();
    congelar(campo());
  });

  it('R1 R2 — cerrado, con un nombre ya escrito y error del campo', () => {
    montarPicker({ defaultValue: 'Botella PET 500 ml', error: 'El nombre es obligatorio.' });
    congelar(campo());
  });

  it('R1 R2 — abierto con filas', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await esperarInteractiva((await screen.findAllByTestId('product-name-option'))[0]);
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarPicker();
    await user.click(campo());
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockReturnValue(nuncaResuelve());
    montarPicker();
    await user.type(campo(), 'tap');
    await waitFor(() =>
      expect(acciones.listProductsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'tap' }),
      ),
    );
    congelar(campo());
  });

  it('R1 R2 — cargando mas, al bajar al final', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockImplementation(primeraYLaSiguienteEnVuelo([BOTELLA]));
    montarPicker();
    await user.click(campo());
    await screen.findAllByTestId('product-name-option');
    bajarAlFinal(screen.getByTestId('product-name-popup'));
    await waitFor(() => expect(acciones.listProductsAction).toHaveBeenCalledTimes(2));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockResolvedValue(pagina([]));
    montarPicker();
    await user.click(campo());
    await screen.findByTestId('product-name-empty');
    congelar(campo());
  });

  it('R1 R11 — error de carga, con el mensaje del servidor', async () => {
    const user = setupUser();
    acciones.listProductsAction.mockResolvedValue(ERROR_DE_CATALOGO);
    montarPicker();
    await user.click(campo());
    await screen.findByTestId('product-name-load-error');
    congelar(campo());
  });

  it('R1 R2 — elegir una opcion deja su nombre en el campo espejo y avisa', async () => {
    const user = setupUser();
    montarPicker();
    await user.click(campo());
    await user.click(await esperarInteractiva((await screen.findAllByTestId('product-name-option'))[1]));
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });
});

// ---------------------------------------------------------------------------------------
// PresentationSelect
// ---------------------------------------------------------------------------------------

describe('paridad de PresentationSelect', () => {
  const KG = '00000000-0000-4000-8000-0000000000b1';
  const G = '00000000-0000-4000-8000-0000000000b2';
  const UNIDADES = [
    { id: KG, name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null },
    { id: G, name: 'Gramo', symbol: 'g', baseUnitId: KG, factor: '0.001' },
  ] as unknown as readonly UnitRef[];

  function presentacion(id: string, name: string, content: string | null, unitId = KG) {
    return {
      id,
      name,
      nameNormalized: name.toLowerCase(),
      unitId,
      content,
      createdAt: new Date('2026-01-15T10:00:00.000Z'),
      updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    };
  }

  const SACO = presentacion('50000000-0000-4000-8000-000000000001', 'Saco 25 kg', '25');
  const BOLSA = presentacion('50000000-0000-4000-8000-000000000002', 'Bolsa 500 g', '500', G);
  const GRANEL = presentacion('50000000-0000-4000-8000-000000000003', 'Granel', null);

  function montarSelect(props: Partial<Parameters<typeof PresentationSelect>[0]> = {}) {
    montar(<PresentationSelect onSelect={avisoMock} {...props} />);
  }

  const campo = () => screen.getByTestId<HTMLInputElement>('presentation-select');

  async function abrir() {
    const user = setupUser();
    await user.click(campo());
    return user;
  }

  beforeEach(() => {
    acciones.listPresentationsAction.mockResolvedValue(pagina([SACO, BOLSA]));
    acciones.createPresentationAction.mockResolvedValue({
      status: 'success',
      id: '50000000-0000-4000-8000-000000000009',
    });
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarSelect();
    congelar(campo());
  });

  it('R1 R2 — cerrado, con eleccion, ayuda y error del campo', () => {
    montarSelect({
      defaultValue: SACO.id,
      defaultLabel: SACO.name,
      helper: 'Cómo se vende el producto.',
      error: 'Elige una presentación.',
    });
    congelar(campo());
  });

  it('R1 R2 — cerrado, con eleccion sin etiqueta: la busca una vez en el servidor', async () => {
    montarSelect({ defaultValue: BOLSA.id });
    await waitFor(() => expect(campo()).toHaveValue(BOLSA.name));
    congelar(campo());
  });

  it('R1 R2 — abierto con filas, filtradas por unidad en el servidor', async () => {
    montarSelect({ unitIds: [KG, G], name: null });
    await abrir();
    await esperarInteractiva((await screen.findAllByTestId('presentation-option'))[0]);
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina', async () => {
    acciones.listPresentationsAction.mockReturnValue(nuncaResuelve());
    montarSelect();
    await abrir();
    await waitFor(() => expect(acciones.listPresentationsAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    acciones.listPresentationsAction.mockReturnValue(nuncaResuelve());
    montarSelect();
    const user = setupUser();
    await user.type(campo(), 'saco');
    await waitFor(() =>
      expect(acciones.listPresentationsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'saco' }),
      ),
    );
    congelar(campo());
  });

  it('R1 R2 — cargando mas, al bajar al final', async () => {
    acciones.listPresentationsAction.mockImplementation(primeraYLaSiguienteEnVuelo([SACO]));
    montarSelect();
    await abrir();
    await screen.findAllByTestId('presentation-option');
    bajarAlFinal(screen.getByTestId('presentation-popup'));
    await waitFor(() => expect(acciones.listPresentationsAction).toHaveBeenCalledTimes(2));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    acciones.listPresentationsAction.mockResolvedValue(pagina([]));
    montarSelect();
    await abrir();
    await screen.findByTestId('presentation-empty');
    congelar(campo());
  });

  it('R1 R11 — error de carga, con el mensaje del servidor', async () => {
    acciones.listPresentationsAction.mockResolvedValue(ERROR_DE_CATALOGO);
    montarSelect();
    await abrir();
    await screen.findByTestId('presentation-load-error');
    congelar(campo());
  });

  it('R1 R13 — con requireContent, la opcion sin contenido no se elige ni cierra', async () => {
    acciones.listPresentationsAction.mockResolvedValue(pagina([SACO, GRANEL]));
    montarSelect({ requireContent: true });
    await abrir();
    const opciones = await screen.findAllByTestId('presentation-option');
    await esperarInteractiva(opciones[0]);
    fireEvent.click(opciones[1]);
    congelar(campo());
  });

  it('R1 R2 — elegir una opcion deja su id en el campo espejo y avisa', async () => {
    montarSelect();
    const user = await abrir();
    await user.click(await esperarInteractiva((await screen.findAllByTestId('presentation-option'))[0]));
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });

  it('R1 R2 — borrar el campo retira la eleccion', async () => {
    montarSelect({ defaultValue: SACO.id, defaultLabel: SACO.name });
    const user = setupUser();
    await user.click(screen.getByTestId('presentation-select-clear'));
    await waitFor(() => expect(campo()).toHaveValue(''));
    await esperarCerrado();
    congelar(campo());
  });

  it('R1 — alta en linea abierta', async () => {
    montarSelect({ units: UNIDADES });
    const user = setupUser();
    await user.click(screen.getByTestId('presentation-create-open'));
    await screen.findByTestId('presentation-create');
    congelar(campo());
  });

  it('R1 R2 — alta en linea guardada: el FormData del alta y la nueva queda elegida', async () => {
    montarSelect({ units: UNIDADES });
    const user = setupUser();
    await user.click(screen.getByTestId('presentation-create-open'));
    await user.type(screen.getByTestId('presentation-create-name'), 'Cubeta 5 kg');
    await user.click(screen.getByTestId('presentation-unit-select'));
    await user.click(
      await esperarInteractiva((await screen.findAllByTestId('presentation-unit-option'))[0]),
    );
    await user.click(screen.getByTestId('presentation-create-submit'));
    await waitFor(() => expect(screen.queryByTestId('presentation-create')).toBeNull());
    await esperarCerrado();
    congelar(campo());
  });
});

// ---------------------------------------------------------------------------------------
// OrderCustomerPicker
// ---------------------------------------------------------------------------------------

describe('paridad de OrderCustomerPicker', () => {
  const ANA = { id: '60000000-0000-4000-8000-000000000001', name: 'Ana Garcia', isDeleted: false };
  const BRUNO = { id: '60000000-0000-4000-8000-000000000002', name: 'Bruno Lopez', isDeleted: true };

  function montarPicker({
    purpose = 'filter',
    value = null,
  }: { purpose?: 'assign' | 'filter'; value?: OrderCustomerChoice | null } = {}) {
    montar(
      <OrderCustomerPicker
        purpose={purpose}
        value={value}
        name="customerId"
        aria-label="Cliente"
        onChange={avisoMock}
      />,
    );
  }

  const campo = () =>
    within(screen.getByTestId('order-customer-picker')).getByRole<HTMLInputElement>('combobox');

  const lista = () => {
    const scroll = document.querySelector<HTMLElement>('[data-slot="autocomplete-scroll"]');
    if (scroll === null) throw new Error('El desplegable no esta montado.');
    return scroll;
  };

  async function abrir() {
    const user = setupUser();
    await user.click(campo());
    return user;
  }

  beforeEach(() => {
    acciones.searchOrderCustomersAction.mockResolvedValue(pagina([ANA, BRUNO], 1, 1, 10));
  });

  it('R1 — cerrado, sin eleccion', () => {
    montarPicker();
    congelar(campo());
  });

  it('R1 R2 — cerrado, con eleccion', () => {
    montarPicker({ purpose: 'assign', value: { kind: 'customer', customer: ANA } });
    congelar(campo());
  });

  it('R1 R2 — abierto con filas, con «Sin cliente» delante', async () => {
    montarPicker();
    await abrir();
    await esperarInteractiva((await screen.findAllByTestId('order-customer-picker-option'))[0]);
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina', async () => {
    acciones.searchOrderCustomersAction.mockReturnValue(nuncaResuelve());
    montarPicker({ purpose: 'assign' });
    await abrir();
    await waitFor(() => expect(acciones.searchOrderCustomersAction).toHaveBeenCalledTimes(1));
    congelar(campo());
  });

  it('R1 R2 — cargando la primera pagina de una busqueda escrita', async () => {
    acciones.searchOrderCustomersAction.mockReturnValue(nuncaResuelve());
    montarPicker({ purpose: 'assign' });
    const user = setupUser();
    await user.type(campo(), 'ana');
    await waitFor(() =>
      expect(acciones.searchOrderCustomersAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ana' }),
        'assign',
      ),
    );
    congelar(campo());
  });

  it('R1 R2 — cargando mas, al bajar al final', async () => {
    acciones.searchOrderCustomersAction.mockImplementation(primeraYLaSiguienteEnVuelo([ANA], 10));
    montarPicker({ purpose: 'assign' });
    await abrir();
    await screen.findAllByTestId('order-customer-picker-option');
    bajarAlFinal(lista());
    await waitFor(() => expect(acciones.searchOrderCustomersAction).toHaveBeenCalledTimes(2));
    congelar(campo());
  });

  it('R1 — vacio', async () => {
    acciones.searchOrderCustomersAction.mockResolvedValue(pagina([], 1, 1, 10));
    montarPicker({ purpose: 'assign' });
    await abrir();
    await screen.findByText('Sin resultados.');
    congelar(campo());
  });

  it('R1 R11 — error de carga', async () => {
    acciones.searchOrderCustomersAction.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    montarPicker({ purpose: 'assign' });
    await abrir();
    await screen.findByText(/No se pudo cargar/);
    congelar(campo());
  });

  it('R1 R2 — elegir una opcion deja su id en el campo oculto y avisa', async () => {
    montarPicker({ purpose: 'assign' });
    const user = await abrir();
    await user.click(
      await esperarInteractiva((await screen.findAllByTestId('order-customer-picker-option'))[0]),
    );
    await waitFor(() => expect(avisoMock).toHaveBeenCalledTimes(1));
    await esperarCerrado();
    congelar(campo());
  });
});
