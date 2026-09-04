import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { toast } from 'sonner';

import EditarRecetaPage from '@/app/(private)/produccion/formulas/[id]/page';
import { RecipeForm } from '@/app/(private)/produccion/formulas/components';
import { MAX_IMAGE_BYTES, type RecipeDetail, type RecipeLineView } from '@/lib/modules/recetas';
import type {
  CreateRecipeFormState,
  RecipeQueryResult,
  UpdateRecipeFormState,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { ProductListResult } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import type { ProductView } from '@/lib/modules/inventario';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

/**
 * El formulario de receta, en sus dos modos (T21, R20-R24, R26-R38;
 * `specs/QC-26-pantalla-de-recetas/tasks.md > T21`, `design.md > 5`-`> 8`).
 *
 * **`createRecipeAction`, `updateRecipeAction`, `getRecipeAction`, `listUnitsAction` y
 * `listProductsAction` están mockeadas**: son el borde de módulos ajenos ya `done` (QC-25, QC-20,
 * QC-32) que esta ficha no abre; sustituirlas es lo único que permite ejercitar el formulario sin
 * base de datos.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre
 * literales de copy. Donde aparece texto es dato del fixture -un nombre de producto, un mensaje
 * que devuelve una action mockeada-, no copy propio de la pantalla.
 *
 * **Interacciones con `@testing-library/user-event`, nunca `fireEvent`** -incluido el arrastre de
 * pasos (R33), que se conduce con la API de puntero real de `user-event` (`user.pointer(...)`),
 * y su equivalente por teclado (R34), con `user.tab()`/`user.keyboard(...)`.
 *
 * **jsdom no mide layout**: todo `getBoundingClientRect()` devuelve un rectángulo vacío, y
 * `dnd-kit` -tanto el sensor de puntero como `sortableKeyboardCoordinates`- decide "arriba/abajo"
 * comparando esos rectángulos. Sin una medida real, ninguna prueba de arrastre podría distinguir
 * una fila de otra. `installStepRowRectStub()` (más abajo, comentado) resuelve esto en el test
 * -nunca debilitando la aserción-: asigna a cada fila de paso un rectángulo vertical propio según
 * su posición real en el DOM, exactamente lo que un navegador real mediría.
 */

const {
  routerMock,
  createRecipeActionMock,
  updateRecipeActionMock,
  getRecipeActionMock,
  listProductsActionMock,
  listUnitsActionMock,
} = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createRecipeActionMock: vi.fn<(input: unknown) => Promise<CreateRecipeFormState>>(),
  updateRecipeActionMock: vi.fn<(id: string, input: unknown) => Promise<UpdateRecipeFormState>>(),
  getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<ProductListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  createRecipeAction: createRecipeActionMock,
  updateRecipeAction: updateRecipeActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

/**
 * Margen de tiempo (review de QC-26, MAYOR 1). Estos casos montan el formulario entero y lo
 * conducen con decenas de interacciones reales de `user-event` sobre selectores con popup; en
 * aislado los mas largos rondaban 1,7-1,9 s contra el `testTimeout` por defecto de 5000 ms, y
 * ese margen de 2,7x NO aguantaba la paralelizacion de la suite completa: R30 y R31 expiraban
 * de forma reproducible.
 *
 * Se corrigen las DOS causas, sin tocar ni una asercion:
 *
 * 1) `setupUser()` (mas abajo) elimina la espera artificial entre eventos, que era la mitad del
 *    coste. Los eventos que se emiten son EXACTAMENTE los mismos.
 * 2) Este `testTimeout` da margen de sobra para la carga de la suite entera. No es un parche
 *    para un test lento: es el reconocimiento de que un test de formulario completo con popups
 *    no se mide con el mismo cronometro que uno de funcion pura.
 *
 * Es un timeout mas largo, NO un `retry`: un test que solo pasa a veces seguiria siendo rojo.
 */
vi.setConfig({ testTimeout: 30_000 });

// --- Fixtures: UUID con forma válida para `recipeLineSchema` (productId/unitId son z.string().uuid()) ---
const PRODUCT_1_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_2_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_PAGE2_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_LITRO_ID = '44444444-4444-4444-8444-444444444444';
const UNIT_GRAMO_ID = '55555555-5555-4555-8555-555555555555';
const RECIPE_ID = '66666666-6666-4666-8666-666666666666';

const UNITS: readonly UnitRef[] = [
  { id: UNIT_LITRO_ID, name: 'Litro', symbol: 'L' },
  // Unidad SIN símbolo: el selector debe presentar su nombre (R30).
  { id: UNIT_GRAMO_ID, name: 'Gramo', symbol: null },
];

const PRODUCT_1_NAME = 'Ácido cítrico';
const PRODUCT_2_NAME = 'Sosa cáustica';
const PRODUCT_PAGE2_NAME = 'Glicerina de página 2';

const PRODUCT_PAGE_1 = { items: [{ id: PRODUCT_1_ID, name: PRODUCT_1_NAME }, { id: PRODUCT_2_ID, name: PRODUCT_2_NAME }], totalPages: 2 };

function productView(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: PRODUCT_PAGE2_ID,
    name: PRODUCT_PAGE2_NAME,
    presentationId: 'presentation-1',
    presentationName: 'Bidón',
    stock: 10,
    qtyAlert: null,
    unitId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function lineView(overrides: Partial<RecipeLineView> = {}): RecipeLineView {
  return {
    id: 'line-1',
    productId: PRODUCT_1_ID,
    productName: PRODUCT_1_NAME,
    quantity: '1.0000',
    unitId: UNIT_LITRO_ID,
    ...overrides,
  };
}

function recipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE_ID,
    name: 'Detergente industrial',
    description: 'Fórmula base',
    imageUrl: null,
    stepCount: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: ['Mezclar'],
    lines: [lineView()],
    ...overrides,
  };
}

/**
 * `userEvent.setup()` con `delay: null` (review de QC-26, MAYOR 1). Por defecto `user-event`
 * intercala un `setTimeout(0)` entre CADA evento -por cada tecla, por cada movimiento de
 * puntero-, y en estos casos eso son cientos de saltos al event loop. `delay: null` quita solo
 * esa espera artificial: la secuencia de eventos que recibe el DOM es identica (mismos
 * `pointerdown`/`mousedown`/`focus`/`keydown`/`input`...), y siguen activas TODAS las
 * comprobaciones de `user-event` -incluida la de `pointer-events`, que es la que impide
 * "hacer clic" en un control tapado o deshabilitado-. No se relaja nada: solo se deja de
 * esperar a nada.
 */
function setupUser(): UserEvent {
  return userEvent.setup({ delay: null });
}

function renderCreateForm() {
  return render(<RecipeForm mode="create" units={UNITS} initialProductPage={PRODUCT_PAGE_1} />);
}

function renderEditForm(recipe: RecipeDetail) {
  return render(
    <RecipeForm mode="edit" recipe={recipe} units={UNITS} initialProductPage={PRODUCT_PAGE_1} />,
  );
}

/** Selecciona un producto ya presente en la primera página, sin pedir otra página al backend. */
async function chooseProductForLine(user: UserEvent, index: number, productName: string) {
  await user.click(screen.getByTestId(`recipe-line-product-${index}`));
  await user.click(await screen.findByRole('option', { name: productName }));
}

/** Selecciona una unidad del catálogo por su etiqueta visible (símbolo o, en su ausencia, nombre). */
async function chooseUnitForLine(user: UserEvent, index: number, unitLabel: string) {
  await user.click(screen.getByTestId(`recipe-line-unit-${index}`));
  await user.click(await screen.findByRole('option', { name: unitLabel }));
}

/** Añade una línea completa y válida en la posición `index` (siguiente hueco libre). */
async function addValidLine(
  user: UserEvent,
  index: number,
  { productName = PRODUCT_1_NAME, unitLabel = 'L', quantity = '1' } = {},
) {
  // La fila 0 ya está en pantalla al abrir el formulario (fila en blanco de arranque); las
  // siguientes se piden con el `+` de la anterior.
  if (index > 0) await user.click(screen.getByTestId(`recipe-line-add-${index - 1}`));
  await chooseProductForLine(user, index, productName);
  await chooseUnitForLine(user, index, unitLabel);
  await user.type(screen.getByTestId(`recipe-line-quantity-${index}`), quantity);
}

// --- Imagen: firmas de contenido reales (`recipe-image.ts`), no solo la extensión del nombre. ---
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function validPngFile(name = 'foto.png'): File {
  const bytes = new Uint8Array([...PNG_SIGNATURE, ...new Array(16).fill(0)]);
  return new File([bytes], name, { type: 'image/png' });
}

function tooLargeFile(name = 'grande.png'): File {
  const bytes = new Uint8Array(MAX_IMAGE_BYTES + 16);
  bytes.set(PNG_SIGNATURE);
  return new File([bytes], name, { type: 'image/png' });
}

function unsupportedFormatFile(name = 'documento.png'): File {
  // `type: 'image/png'` a propósito: el input declara `accept="image/jpeg,image/png,image/webp"`
  // y `user-event` filtra por ese atributo antes de disparar `change` -mismo criterio que un
  // navegador real, que fija `file.type` por la EXTENSIÓN, no por el contenido-. Lo que este
  // caso ejercita es justo lo que R38 exige: `validateRecipeImage` detecta el formato por la
  // FIRMA de los bytes, nunca por el `Content-Type` que declara el cliente (`recipe-image.ts`),
  // así que un archivo de texto disfrazado de `.png` debe rechazarse igual.
  const bytes = new TextEncoder().encode('esto no es una imagen, es texto plano');
  return new File([bytes], name, { type: 'image/png' });
}

// --- Alto de fila estable para el stub de layout de `dnd-kit` (ver comentario de cabecera). ---
const ROW_HEIGHT = 60;

/**
 * Da a cada fila de paso -y a sus descendientes- un `getBoundingClientRect()` acorde a su
 * posición REAL dentro de `<ol data-testid="recipe-steps-list">` (T21, R33, R34).
 *
 * **Por qué hace falta**: jsdom no hace layout, así que sin este stub CADA fila mediría
 * `{top:0, left:0, width:0, height:0}` y `dnd-kit` -tanto `closestCenter` para el ratón como
 * `sortableKeyboardCoordinates` para el teclado- no podría distinguir "la fila de abajo" de "la
 * fila de arriba": las dos pruebas de arrastre pasarían en falso sin mover nada.
 *
 * **Está explícitamente comentado y se instala/desinstala por test** (nunca queda global): es un
 * estándar de layout para el entorno de test, no una relajación de lo que se afirma -las
 * aserciones siguen mirando el payload real que recibe la operación-.
 */
function installStepRowRectStub(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const row = this.closest('[data-testid="recipe-step-row"]');
    if (row !== null) {
      const list = row.parentElement;
      const rows = list === null ? [row] : Array.from(list.children);
      const index = Math.max(0, rows.indexOf(row));
      const top = index * ROW_HEIGHT;
      const rect = {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 320,
        bottom: top + ROW_HEIGHT,
        width: 320,
        height: ROW_HEIGHT,
      };
      return { ...rect, toJSON: () => rect } as DOMRect;
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/** Tabula hasta alcanzar `target`, demostrando que es alcanzable de verdad con el tabulador (R34). */
async function tabUntil(user: UserEvent, target: Element, max = 60): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    if (document.activeElement === target) return;
    await user.tab();
  }
  throw new Error('No se alcanzó el elemento con Tab dentro del límite de saltos.');
}

let toastSuccessSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createRecipeActionMock.mockResolvedValue({ status: 'success', id: RECIPE_ID });
  updateRecipeActionMock.mockResolvedValue({ status: 'success' });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [productView()], total: 3, page: 2, pageSize: MAX_PAGE_SIZE, totalPages: 2 },
  });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: UNITS });
  toastSuccessSpy = vi.spyOn(toast, 'success');
  // jsdom no implementa `URL.createObjectURL`/`revokeObjectURL` (API de navegador real): se
  // resuelve aquí, explícitamente, en vez de en producción.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:recipe-image-preview'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('R20 — cancelar o terminar devuelve a la lista', () => {
  it('el botón de cancelar es un enlace real a la lista, no un panel ni un diálogo', () => {
    renderCreateForm();

    const cancelar = screen.getByTestId('recipe-form-cancel');
    expect(cancelar.tagName).toBe('A');
    expect(cancelar).toHaveAttribute('href', FORMULAS_ROUTE);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('terminar con éxito también devuelve a la lista (mismo camino que R24)', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta que termina');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
  });
});

describe('R21 — precarga de la edición y receta inexistente', () => {
  it('precarga el detalle y conserva la línea cuyo productName es null, reenviándola intacta', async () => {
    const user = setupUser();
    const recipe = recipeDetail({
      name: 'Receta existente',
      description: 'Una descripción',
      steps: ['Paso uno', 'Paso dos'],
      lines: [
        lineView({
          id: 'line-baja',
          productId: PRODUCT_1_ID,
          productName: null,
          quantity: '3.2500',
          unitId: UNIT_LITRO_ID,
        }),
      ],
    });

    renderEditForm(recipe);

    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Receta existente');
    expect(screen.getByTestId('recipe-field-description')).toHaveValue('Una descripción');
    expect(screen.getByTestId('recipe-step-text-0')).toHaveValue('Paso uno');
    expect(screen.getByTestId('recipe-step-text-1')).toHaveValue('Paso dos');
    expect(screen.getByTestId('recipe-line-quantity-0')).toHaveValue('3.2500');
    // Producto dado de baja (R53): la línea se conserva y se marca, no se descarta.
    expect(screen.getByTestId('recipe-line-unavailable-0')).toBeInTheDocument();

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateRecipeActionMock.mock.calls[0] as [string, { lines: unknown[] }];
    expect(payload.lines).toEqual([
      { productId: PRODUCT_1_ID, quantity: '3.2500', unitId: UNIT_LITRO_ID },
    ]);
  });

  it('una receta inexistente presenta el estado de «no encontrada», no un formulario vacío', async () => {
    getRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_found',
      message: 'Esta receta no existe o fue borrada.',
    });

    const tree = await EditarRecetaPage({ params: Promise.resolve({ id: RECIPE_ID }) });
    render(tree);

    const notFound = screen.getByTestId('recipe-not-found');
    expect(notFound).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('recipe-form')).toBeNull();
    expect(getRecipeActionMock).toHaveBeenCalledWith(RECIPE_ID);
  });
});

describe('R22 — el guardado envía la lista final completa en una sola invocación', () => {
  it('quitar una línea la saca de la lista enviada; cero llamadas por línea ni por paso', async () => {
    const user = setupUser();
    const recipe = recipeDetail({
      lines: [
        lineView({ id: 'line-a', productId: PRODUCT_1_ID, quantity: '1.0000' }),
        lineView({ id: 'line-b', productId: PRODUCT_2_ID, productName: PRODUCT_2_NAME, quantity: '2.0000' }),
      ],
      steps: ['Mezclar', 'Calentar'],
    });

    renderEditForm(recipe);
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-line-remove-1'));
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateRecipeActionMock.mock.calls[0] as [
      string,
      { lines: { productId: string }[]; steps: string[] },
    ];
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]?.productId).toBe(PRODUCT_1_ID);
    expect(payload.steps).toEqual(['Mezclar', 'Calentar']);
  });
});

describe('R23 — un guardado rechazado no navega, no pierde lo escrito y muestra el error en línea', () => {
  it('el error se presenta en la región del formulario y el nombre editado sigue en el DOM', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado para editar esta receta.',
    });
    renderEditForm(recipeDetail());

    await user.clear(screen.getByTestId('recipe-field-name'));
    await user.type(screen.getByTestId('recipe-field-name'), 'Nombre editado a mano');

    await user.click(screen.getByTestId('recipe-form-submit'));

    const error = await screen.findByTestId('recipe-form-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('recipe-form-error-message')).toHaveTextContent(
      'No autorizado para editar esta receta.',
    );
    expect(screen.getByTestId('recipe-form-error-code')).toHaveTextContent('unauthorized');

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastSuccessSpy).not.toHaveBeenCalled();

    // Lo escrito NO se pierde: sigue en el campo, no se limpió al rechazar.
    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Nombre editado a mano');
  });
});

describe('R24 — un guardado con éxito navega, avisa por toast y refresca', () => {
  it('createRecipeAction con éxito navega a la lista, avisa y refresca', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta nueva');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
  });
});

describe('R26 — la validación previa usa los esquemas del contrato', () => {
  it('un nombre vacío -que el esquema rechaza- no invoca la operación', async () => {
    const user = setupUser();
    renderCreateForm();

    // El nombre queda vacío a propósito: `recipeNameSchema` exige `.trim().min(1)`.
    await user.click(screen.getByTestId('recipe-form-submit'));

    const error = await screen.findByTestId('recipe-error-name');
    expect(error).toBeInTheDocument();
    expect(screen.getByTestId('recipe-field-name')).toHaveAttribute('aria-invalid', 'true');
    expect(createRecipeActionMock).not.toHaveBeenCalled();
  });
});

describe('R27 — añadir y quitar líneas; una receta sin ninguna se guarda', () => {
  it('añadir y luego quitar la única línea deja la receta sin líneas, y así se guarda', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta sin ingredientes');

    await addValidLine(user, 0);
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);

    await user.click(screen.getByTestId('recipe-line-remove-0'));
    // Sigue viéndose UNA fila, pero es la de arranque: no está en el estado, así que el payload
    // viaja sin líneas igual que antes de que existiera esa fila (R27).
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payload] = createRecipeActionMock.mock.calls[0] as [{ lines: unknown[] }];
    expect(payload.lines).toEqual([]);
  });
});

describe('R28 — el selector de producto alcanza la segunda página sin filtrar en cliente', () => {
  it('pide la página 2 al backend y permite elegir un producto que no estaba descargado', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.click(screen.getByTestId('recipe-line-product-0'));

    await user.click(screen.getByTestId('recipe-line-product-0-next'));

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE }),
    );

    const opcionPagina2 = await screen.findByRole('option', { name: PRODUCT_PAGE2_NAME });
    await user.click(opcionPagina2);

    expect(screen.getByTestId('recipe-line-product-0')).toHaveValue(PRODUCT_PAGE2_NAME);
  });

  it('escribir en el selector BUSCA EN EL BACKEND, no sobre la página ya descargada', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-line-product-0'), 'áci');

    // La prueba de que no filtra en cliente es que el término VIAJA al backend: si el
    // componente recortara `items` por su cuenta, esta llamada no existiría.
    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenCalledWith({
        page: 1,
        pageSize: MAX_PAGE_SIZE,
        search: 'áci',
      }),
    );
  });
});

describe('R30 — la unidad viaja como id; sin símbolo se presenta por su nombre', () => {
  it('elige Litro (con símbolo "L") y luego Gramo (sin símbolo, mostrado por su nombre) y envía su id', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta con unidades');
    await chooseProductForLine(user, 0, PRODUCT_1_NAME);

    await chooseUnitForLine(user, 0, 'L');
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('L');

    await chooseUnitForLine(user, 0, 'Gramo');
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('Gramo');

    await user.type(screen.getByTestId('recipe-line-quantity-0'), '5');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payload] = createRecipeActionMock.mock.calls[0] as [{ lines: { unitId: string }[] }];
    expect(payload.lines[0]?.unitId).toBe(UNIT_GRAMO_ID);
  });
});

describe('R31 — dos líneas del mismo producto y una cantidad inválida no se envían', () => {
  it('un ingrediente ya usado se ofrece DESHABILITADO en las demás líneas: no se puede repetir', async () => {
    // R16 desde la interfaz. La regla vive en `createRecipeSchema` y su test está en
    // `tests/unit/recetas/recipe-input.test.ts`; lo que se afirma AQUÍ es que el formulario ya
    // no deja llegar hasta ahí -el repetido es imposible de elegir, no solo rechazado al
    // enviar-. Se ofrece deshabilitado y no oculto: esconderlo haría creer que el producto no
    // existe en el catálogo.
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta sin repetidos');
    await addValidLine(user, 0, { quantity: '1' });

    await user.click(screen.getByTestId('recipe-line-add-0'));
    await user.click(screen.getByTestId('recipe-line-product-1'));

    // El nombre accesible de la opción vetada lleva el motivo detrás, de ahí la expresión regular.
    const repetido = await screen.findByRole('option', { name: new RegExp(`^${PRODUCT_1_NAME}`) });
    expect(repetido).toBeDisabled();

    await user.click(repetido);
    expect(screen.getByTestId('recipe-line-product-1')).toHaveValue('');
  });

  it('una cantidad que el esquema rechaza presenta el error junto a la línea afectada', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta con cantidad inválida');
    await chooseProductForLine(user, 0, PRODUCT_1_NAME);
    await chooseUnitForLine(user, 0, 'L');
    await user.type(screen.getByTestId('recipe-line-quantity-0'), 'abc'); // no cumple el patrón decimal

    await user.click(screen.getByTestId('recipe-form-submit'));

    const error = await screen.findByTestId('recipe-line-quantity-error-0');
    expect(error).toBeInTheDocument();
    expect(screen.getByTestId('recipe-line-quantity-0')).toHaveAttribute('aria-invalid', 'true');
    expect(createRecipeActionMock).not.toHaveBeenCalled();
  });
});

describe('R32 — los pasos se añaden, editan y quitan, y se envían en el orden mostrado', () => {
  it('añadir tres pasos, editar uno y quitar otro deja el orden esperado en el payload', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta con pasos');

    await user.click(screen.getByTestId('recipe-step-add'));
    await user.type(screen.getByTestId('recipe-step-text-0'), 'Mezclar');
    await user.click(screen.getByTestId('recipe-step-add'));
    await user.type(screen.getByTestId('recipe-step-text-1'), 'Calentar de mas');
    await user.click(screen.getByTestId('recipe-step-add'));
    await user.type(screen.getByTestId('recipe-step-text-2'), 'Enfriar');

    // Editar el paso 2: corrige "Calentar de mas" -> "Calentar".
    await user.clear(screen.getByTestId('recipe-step-text-1'));
    await user.type(screen.getByTestId('recipe-step-text-1'), 'Calentar');

    // Quitar el paso 3 ("Enfriar"): el orden final debe ser ['Mezclar', 'Calentar'].
    await user.click(screen.getByTestId('recipe-step-remove-2'));

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: string[] }];
    expect(payload.steps).toEqual(['Mezclar', 'Calentar']);
  });
});

describe('R33 — reordenar por arrastre (ratón) cambia el orden enviado', () => {
  it('arrastrar el primer paso hasta la tercera posición reordena el payload', async () => {
    const user = setupUser();
    const uninstall = installStepRowRectStub();
    try {
      renderCreateForm();
      await user.type(screen.getByTestId('recipe-field-name'), 'Receta con arrastre por ratón');

      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-0'), 'Mezclar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-1'), 'Calentar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-2'), 'Enfriar');

      const handle = screen.getByTestId('recipe-step-handle-0');

      // Arrastre real con el RATÓN, conducido con la API de puntero de `user-event` -nunca
      // `fireEvent`-: pointerdown en el asa, más de los 8 px del `activationConstraint` hacia
      // abajo (R50: un simple toque no debe activar el arrastre), hasta la tercera fila.
      await user.pointer([
        { keys: '[MouseLeft>]', target: handle, coords: { clientX: 10, clientY: ROW_HEIGHT / 2 } },
        { target: handle, coords: { clientX: 10, clientY: ROW_HEIGHT + 20 } },
        {
          target: handle,
          coords: { clientX: 10, clientY: ROW_HEIGHT * 2 + ROW_HEIGHT / 2 },
        },
        { keys: '[/MouseLeft]' },
      ]);

      await user.click(screen.getByTestId('recipe-form-submit'));

      await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
      const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: string[] }];
      expect(payload.steps).not.toEqual(['Mezclar', 'Calentar', 'Enfriar']);
      expect(payload.steps).toHaveLength(3);
      expect(payload.steps).toEqual(['Calentar', 'Enfriar', 'Mezclar']);
    } finally {
      uninstall();
    }
  });
});

describe('R34 — el equivalente por teclado reordena y el asa anuncia su posición', () => {
  it('Tab hasta el asa, Espacio para tomar, flecha para mover y Espacio para soltar cambian el payload', async () => {
    const user = setupUser();
    const uninstall = installStepRowRectStub();
    try {
      renderCreateForm();
      await user.type(screen.getByTestId('recipe-field-name'), 'Receta con arrastre por teclado');

      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-0'), 'Mezclar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-1'), 'Calentar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await user.type(screen.getByTestId('recipe-step-text-2'), 'Enfriar');

      const primeraAsa = screen.getByTestId('recipe-step-handle-0');

      // El nombre accesible del asa INCLUYE la posición actual (R34): con 3 pasos, la
      // primera dice "1" de "3". Si se reescribiera sin la posición, esto se pondría en rojo.
      expect(primeraAsa).toHaveAccessibleName(expect.stringContaining('1'));
      expect(primeraAsa).toHaveAccessibleName(expect.stringContaining('3'));

      // Alcanzable SOLO con el tabulador -sin usar `.focus()`-: se demuestra tabulando de
      // verdad desde donde haya quedado el foco.
      await tabUntil(user, primeraAsa);
      expect(document.activeElement).toBe(primeraAsa);

      await user.keyboard(' '); // Espacio: toma el paso (KeyboardCode.Space -> "start")
      await user.keyboard('{ArrowDown}'); // mueve una posición hacia abajo
      await user.keyboard(' '); // Espacio: suelta (KeyboardCode.Space -> "end")

      await user.click(screen.getByTestId('recipe-form-submit'));

      await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
      // La aserción que importa: el ORDEN DEL PAYLOAD que recibe la operación cambió con el
      // teclado. Si se borrara el `KeyboardSensor` (o su `coordinateGetter`), este `ArrowDown`
      // no movería nada y esta aserción -no una que solo mirase el `role` del asa- se pondría
      // en rojo (`design.md > 7`, riesgo 5).
      const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: string[] }];
      expect(payload.steps).toEqual(['Calentar', 'Mezclar', 'Enfriar']);
    } finally {
      uninstall();
    }
  });
});

describe('R37 — vista previa de la imagen y bloqueo de un segundo envío', () => {
  it('elegir un archivo válido muestra su vista previa, y el envío en curso impide un segundo envío', async () => {
    const user = setupUser();
    let resolveCreate!: (value: CreateRecipeFormState) => void;
    createRecipeActionMock.mockImplementation(
      () =>
        new Promise<CreateRecipeFormState>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderCreateForm();
    await user.type(screen.getByTestId('recipe-field-name'), 'Receta con imagen');

    expect(screen.getByTestId('recipe-image-preview-placeholder')).toBeInTheDocument();
    await user.upload(screen.getByTestId('recipe-image-input'), validPngFile());

    const preview = await screen.findByTestId('recipe-image-preview');
    expect(preview).toHaveAttribute('src', 'blob:recipe-image-preview');
    expect(screen.queryByTestId('recipe-image-preview-placeholder')).toBeNull();

    const submit = screen.getByTestId('recipe-form-submit');
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');

    // Segundo click MIENTRAS el envío está en curso: no dispara una segunda invocación. Si se
    // quitara `disabled={isPending}` del botón, este click volvería a llamar a `handleSubmit`
    // y la aserción de abajo se pondría en rojo.
    await user.click(submit);
    expect(createRecipeActionMock).toHaveBeenCalledTimes(1);

    resolveCreate({ status: 'success', id: RECIPE_ID });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
  });
});

describe('R38 — un archivo rechazado no llega al payload y su error queda junto al campo', () => {
  it('un archivo demasiado grande se rechaza sin invocar la operación', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.upload(screen.getByTestId('recipe-image-input'), tooLargeFile());

    const error = await screen.findByTestId('recipe-image-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('recipe-image-preview')).toBeNull();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    // El archivo rechazado NUNCA se adjuntó: el campo sigue "untouched" (sin la clave `image`).
    expect('image' in (createRecipeActionMock.mock.calls[0]?.[0] as object)).toBe(false);
    expect(screen.getByTestId('recipe-image-error')).toBeInTheDocument();
  });

  it('un archivo con formato no aceptado se rechaza sin invocar la operación', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.upload(screen.getByTestId('recipe-image-input'), unsupportedFormatFile());

    const error = await screen.findByTestId('recipe-image-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(screen.queryByTestId('recipe-image-preview')).toBeNull();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    expect('image' in (createRecipeActionMock.mock.calls[0]?.[0] as object)).toBe(false);
    expect(screen.getByTestId('recipe-image-error')).toBeInTheDocument();
  });
});
