import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';

import EditarRecetaPage from '@/app/(private)/produccion/formulas/[id]/page';
import { RecipeForm } from '@/app/(private)/produccion/formulas/components';
import { errorMessage } from '@/lib/modules/errores';
import {
  MAX_IMAGE_BYTES,
  type RecipeDetail,
  type RecipeLineView,
  type RecipeStepView,
} from '@/lib/modules/recetas';
import type {
  CreateRecipeFormState,
  RecipeQueryResult,
  UpdateRecipeFormState,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { ProductListResult } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { UnitView } from '@/lib/modules/unidades';
import type { ProductView } from '@/lib/modules/inventario';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';
import { PERMISSIONS } from '@/lib/modules/identity';

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
 * **QC-64 (T7, T8): el campo de un paso ya NO es un `<input type="text">`, es el area editable
 * del editor enriquecido** (R1). Eso cambia COMO se escribe en el, no QUE se afirma: donde antes
 * habia `user.type(...)` + `toHaveValue(...)` ahora se escribe con `escribirEnPaso(...)` -un
 * pegado real, que es lo que ProseMirror procesa de verdad- y se afirma sobre el DOCUMENTO que
 * recibe la operacion o sobre el texto del area editable. Ninguna asercion se ha relajado: los
 * casos siguen comprobando lo mismo -el orden de los pasos enviados, lo que llega al payload y lo
 * que se ve precargado-, solo que contra el control que la pantalla tiene ahora.
 *
 * **Stubs de jsdom para ProseMirror.** Viven AQUI y no en `tests/setup.ts` ni en
 * `vitest.config.mts` -compartidos, con ramas en vuelo-, igual que en
 * `recipe-step-editor.test.tsx`. Rellenan geometria que jsdom no calcula nunca
 * (`Range.getClientRects`, `elementFromPoint`) y transportan el portapapeles; ninguno finge el
 * comportamiento que se afirma.
 *
 * **jsdom no mide layout**: todo `getBoundingClientRect()` devuelve un rectángulo vacío, y
 * `dnd-kit` -tanto el sensor de puntero como `sortableKeyboardCoordinates`- decide "arriba/abajo"
 * comparando esos rectángulos. Sin una medida real, ninguna prueba de arrastre podría distinguir
 * una fila de otra. `installStepRowRectStub()` (más abajo, comentado) resuelve esto en el test
 * -nunca debilitando la aserción-: asigna a cada fila de paso un rectángulo vertical propio según
 * su posición real en el DOM, exactamente lo que un navegador real mediría.
 */

const {
  getSessionUserMock,
  routerMock,
  createRecipeActionMock,
  updateRecipeActionMock,
  getRecipeActionMock,
  listProductsActionMock,
  listUnitsActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
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
 * aislado los mas largos rondaban 1,7-1,9 s contra el `testTimeout` que por entonces era el de
 * Vitest por defecto, 5000 ms (desde QC-58 los tres proyectos declaran 15000 ms), y
 * ese margen de 2,7x NO aguantaba la paralelizacion de la suite completa: R30 y R31 expiraban
 * de forma reproducible.
 *
 * Se corrigen las DOS causas, sin tocar ni una asercion:
 *
 * 1) `setupUser()` elimina la espera artificial entre eventos, que era la mitad del coste. Los
 *    eventos que se emiten son EXACTAMENTE los mismos. Desde QC-58 ya no se define aqui: vive
 *    en `tests/helpers/user-event.ts` y lo usa todo el repo. Este archivo fue el precedente.
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

// QC-39 (T1): el listado devuelve `UnitView` -equivalencia y `isSystem` incluidos-. El
// selector sigue tipado con `UnitRef` y no se entera: `UnitView` lo extiende (R4).
const UNITS: readonly UnitView[] = [
  // Dos unidades BASE de grupos distintos: ninguna deriva de la otra, así que los productos de
  // este archivo -que no tienen ningún lote, así que su unidad derivada es `null`- ven el
  // catálogo completo (QC-26bis, QC-80 R23).
  { id: UNIT_LITRO_ID, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
  // Unidad SIN símbolo: el selector debe presentar su nombre (R30).
  {
    id: UNIT_GRAMO_ID,
    name: 'Gramo',
    symbol: null,
    baseUnitId: null,
    factor: null,
    isSystem: true,
  },
];

const PRODUCT_1_NAME = 'Ácido cítrico';
const PRODUCT_2_NAME = 'Sosa cáustica';
const PRODUCT_PAGE2_NAME = 'Glicerina de página 2';

/**
 * Página 1 precargada del selector de ingrediente. Los dos productos llegan con `unitId: null`
 * porque **todavía no tienen ningún lote** (QC-80 R23): la unidad de un ingrediente se deriva de
 * la presentación de su lote más reciente, así que sin lote no hay con qué acotar el selector.
 */
const PRODUCT_PAGE_1 = {
  items: [
    { id: PRODUCT_1_ID, name: PRODUCT_1_NAME, unitId: null },
    { id: PRODUCT_2_ID, name: PRODUCT_2_NAME, unitId: null },
  ],
  totalPages: 2,
};

function productView(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: PRODUCT_PAGE2_ID,
    name: PRODUCT_PAGE2_NAME,
    imagePath: null,
    stock: 10,
    stockByUnit: [],
    qtyAlert: null,
    // QC-80 (R22, R23): la unidad del producto es DERIVADA de la presentacion de su lote mas
    // reciente. `null` = todavia no tiene ningun lote.
    latestBatchUnitId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
    productStock: 10,
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
    steps: [stepView('Mezclar')],
    lines: [lineView()],
    ...overrides,
  };
}

function renderCreateForm() {
  return render(<RecipeForm mode="create" units={UNITS} initialProductPage={PRODUCT_PAGE_1} />);
}

function renderEditForm(recipe: RecipeDetail) {
  return render(
    <RecipeForm mode="edit" recipe={recipe} units={UNITS} initialProductPage={PRODUCT_PAGE_1} />,
  );
}

/**
 * Lleva el desplegable del selector de ingrediente al final de su scroll, que es el gesto con el
 * que R28 pide la página siguiente desde el cambio de mecanismo del 2026-09-07.
 *
 * Las tres medidas se definen a mano porque jsdom NO calcula layout: `scrollHeight`,
 * `clientHeight` y `scrollTop` valen 0 en todo elemento, así que sin ponerlas ninguna prueba
 * podría distinguir "al final" de "al principio". Los valores son los que un navegador mediría
 * con la lista desplazada hasta abajo.
 *
 * El evento se emite tal cual y no con `user-event`: desplazar una lista no es un evento de
 * puntero ni de teclado -lo produce el motor de scroll del navegador-, así que `user-event` no
 * tiene API para ello. Es la misma excepción que ya se documenta para los stubs de geometría.
 */
function scrollAlFinalDelSelector(testId: string, altoVisible = 256) {
  const lista = screen.getByTestId(`${testId}-popup`);
  Object.defineProperty(lista, 'clientHeight', { value: altoVisible, configurable: true });
  Object.defineProperty(lista, 'scrollHeight', { value: altoVisible * 3, configurable: true });
  Object.defineProperty(lista, 'scrollTop', { value: altoVisible * 2, configurable: true });
  act(() => {
    lista.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/** Selecciona un producto ya presente en la primera página, sin pedir otra página al backend. */
async function chooseProductForLine(user: UserEvent, index: number, productName: string) {
  await user.click(screen.getByTestId(`recipe-line-product-${index}`));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: productName })));
}

/** Selecciona una unidad del catálogo por su etiqueta visible (símbolo o, en su ausencia, nombre). */
async function chooseUnitForLine(user: UserEvent, index: number, unitLabel: string) {
  await user.click(screen.getByTestId(`recipe-line-unit-${index}`));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: unitLabel })));
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

/**
 * Paso tal y como lo devuelve el detalle (QC-62): un DOCUMENTO, no `{ body, type }`. El
 * documento minimo -un parrafo con un fragmento- para los casos que solo necesitan un paso con
 * texto; los que hablan de marcas o de listas de verificacion escriben el suyo entero.
 */
function stepView(text: string): RecipeStepView {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] };
}

/**
 * Texto plano de los pasos de un payload: aplana los parrafos igual que hace la pantalla. Sirve
 * para afirmar sobre el ORDEN de los pasos enviados sin repetir el documento entero.
 */
function stepTexts(steps: readonly RecipeStepView[]): string[] {
  return steps.map((step) =>
    step.blocks
      .filter((block) => block.kind === 'paragraph')
      .map((block) => block.spans.map((span) => span.text).join(''))
      .join('\n'),
  );
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

// --- Stubs de jsdom que ProseMirror necesita (ver comentario de cabecera) ---
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => {
      const rects: DOMRect[] = [];
      return Object.assign(rects, {
        item: (index: number) => rects[index] ?? null,
      }) as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
  // ProseMirror la llama al resolver la posicion de un clic dentro del area editable. jsdom no
  // hace layout, asi que no hay ningun elemento en ninguna coordenada: `null` es la respuesta
  // honesta, y ProseMirror ya sabe tratarla.
  if (typeof document.elementFromPoint !== 'function') {
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () =>
      null;
  }
});

/**
 * Pega texto en el area editable de un paso. Es un evento `paste` REAL -con la unica API del
 * portapapeles que ProseMirror lee-, no una escritura directa en el DOM: quien decide que
 * documento sale de ahi es el esquema cerrado del editor, que corre de verdad.
 */
function pegarEn(destino: Element, texto: string): void {
  const clipboardData = {
    types: ['text/plain'],
    getData: () => texto,
    files: [] as unknown as FileList,
  };
  const evento = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(evento, 'clipboardData', { value: clipboardData });
  destino.dispatchEvent(evento);
}

/** Texto visible de cada paso, en el ORDEN en que las filas estan en el DOM. */
function textosVisiblesDeLosPasos(): string[] {
  return screen
    .getAllByTestId('recipe-step-row')
    .map((fila) => fila.querySelector('[contenteditable="true"]')?.textContent ?? '');
}

/**
 * Afirma que NO hay ningun selector de tipo de paso en la pantalla (R10): ni el `<select>` que
 * hubo hasta QC-62, ni un grupo de radios, ni ningun control equivalente que clasifique el paso
 * entero. Se comprueba tambien por ROL ARIA -no solo por `data-testid`-, que es lo que hace que
 * un control nuevo con otro nombre tampoco pase.
 */
function esperarSinSelectorDeTipo(): void {
  const campoDePasos = screen.getByTestId('recipe-steps-field');
  expect(campoDePasos.querySelector('select')).toBeNull();
  expect(campoDePasos.querySelector('input[type="radio"]')).toBeNull();
  expect(screen.queryByTestId('recipe-step-type-0')).toBeNull();
  expect(screen.queryByTestId('recipe-step-type-1')).toBeNull();
  expect(screen.queryAllByRole('radiogroup')).toHaveLength(0);
  expect(screen.queryByRole('combobox', { name: /tipo del paso/i })).toBeNull();
  // Ni etiquetas de tipo: el unico «Lista de verificacion» que puede quedar es el BOTON de la
  // barra de formato del editor, que produce una construccion DENTRO del documento y no una
  // clasificacion del paso entero.
  for (const nodo of screen.queryAllByText(/lista de verificaci/i)) {
    expect(nodo.closest('[role="toolbar"]')).not.toBeNull();
  }
}

/** El area editable del paso `index`. Conserva el `data-testid` heredado de QC-26 (R24). */
function areaDePaso(index: number): HTMLElement {
  return screen.getByTestId(`recipe-step-text-${index}`);
}

/** Escribe `texto` en el paso `index` (equivale al `user.type` sobre el `<input>` de QC-26). */
async function escribirEnPaso(index: number, texto: string): Promise<void> {
  const editable = areaDePaso(index);
  editable.focus();
  pegarEn(editable, texto);
  await waitFor(() => expect(editable).toHaveTextContent(texto));
}

/** Reescribe el paso `index` de cero: selecciona todo con el teclado y escribe encima. */
async function reescribirPaso(user: UserEvent, index: number, texto: string): Promise<void> {
  const editable = areaDePaso(index);
  editable.focus();
  await user.keyboard('{Control>}a{/Control}');
  pegarEn(editable, texto);
  await waitFor(() => expect(editable).toHaveTextContent(texto));
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
  getSessionUserMock.mockResolvedValue({
    id: 'u-test-42',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
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
      steps: [stepView('Paso uno'), stepView('Paso dos')],
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
    // El campo del paso es AHORA el area editable del editor (R1): se afirma sobre su texto,
    // no sobre `value`, que un `contenteditable` no tiene.
    expect(areaDePaso(0)).toHaveTextContent('Paso uno');
    expect(areaDePaso(1)).toHaveTextContent('Paso dos');
    // El campo es `type="number"` desde el 2026-09-08, y `toHaveValue` lee entonces
    // `valueAsNumber`: `'3.2500'` se compara como `3.25`. Es una lectura del DOM, NO una
    // conversion del dato -el `expect` del payload de mas abajo sigue exigiendo la cadena
    // `'3.2500'` intacta, que es lo que R29 protege de verdad-.
    expect(screen.getByTestId('recipe-line-quantity-0')).toHaveValue(3.25);
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
    // QC-70 (R20): el código abierto por caso, `recipe_not_found`. (R32): la página pinta el
    // `message` que devuelve la operación -el del catálogo-, no una frase propia para ese código.
    getRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_not_found',
      message: errorMessage('recipe_not_found'),
    });

    const tree = await EditarRecetaPage({ params: Promise.resolve({ id: RECIPE_ID }) });
    render(tree);

    const notFound = screen.getByTestId('recipe-not-found');
    expect(notFound).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('recipe-not-found-message')).toHaveTextContent(
      errorMessage('recipe_not_found'),
    );
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
      steps: [stepView('Mezclar'), stepView('Calentar')],
    });

    renderEditForm(recipe);
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-line-remove-1'));
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateRecipeActionMock.mock.calls[0] as [
      string,
      { lines: { productId: string }[]; steps: RecipeStepView[] },
    ];
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]?.productId).toBe(PRODUCT_1_ID);
    expect(stepTexts(payload.steps)).toEqual(['Mezclar', 'Calentar']);
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

describe('R23 (QC-70 R20, R32) — el nombre repetido llega con su código abierto', () => {
  it('un nombre repetido se presenta junto al campo nombre con el mensaje del back', async () => {
    // QC-70 (R20): el formulario compara `recipe_duplicate_name`, el código abierto por caso.
    // (R32): junto al campo va el `message` de la operación, no un texto propio del formulario.
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_duplicate_name',
      message: errorMessage('recipe_duplicate_name'),
    });
    renderEditForm(recipeDetail());

    await user.click(screen.getByTestId('recipe-form-submit'));

    const error = await screen.findByTestId('recipe-error-name');
    expect(error).toHaveTextContent(errorMessage('recipe_duplicate_name'));
    // No cae en la región general ni en el estado de «no encontrada».
    expect(screen.queryByTestId('recipe-form-error')).toBeNull();
    expect(screen.queryByTestId('recipe-form-not-found')).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
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
  // El mecanismo cambió el 2026-09-07 (decisión humana): la página siguiente ya no se pide con un
  // botón «Siguiente» dentro del desplegable, sino al llegar al final de su scroll. Lo que R28
  // exige de fondo -alcanzar CUALQUIER producto del catálogo sin filtrar en cliente- se afirma
  // igual de fuerte: la página 2 la sirve el backend y su producto se puede elegir.
  it('anexa la página 2 al llegar al final del desplegable y permite elegir un producto que no estaba descargado', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.click(screen.getByTestId('recipe-line-product-0'));

    // La página 1 baja precargada por props (R49): abrir el desplegable no consulta al backend.
    await screen.findByRole('option', { name: PRODUCT_1_NAME });
    expect(listProductsActionMock).not.toHaveBeenCalled();

    scrollAlFinalDelSelector('recipe-line-product-0');

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE }),
    );

    const opcionPagina2 = await screen.findByRole('option', { name: PRODUCT_PAGE2_NAME });
    // La página 2 se ANEXA: lo ya visible no se pierde al bajar.
    expect(screen.getByRole('option', { name: PRODUCT_1_NAME })).toBeInTheDocument();

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

describe('QC-80 R23 — un ingrediente SIN NINGÚN LOTE no bloquea la línea ni impide guardar', () => {
  it('el selector de unidad queda habilitado, ofrece el catálogo entero y la receta se envía', async () => {
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta de un ingrediente sin lotes');
    // `PRODUCT_1` no tiene lotes: su `latestBatchUnitId` es `null` y llega como `unitId: null`.
    await chooseProductForLine(user, 0, PRODUCT_1_NAME);

    // No se bloquea: sin lote no hay dato con el que acotar, pero se escriben recetas antes de
    // comprar el ingrediente.
    expect(screen.getByTestId('recipe-line-unit-0')).toBeEnabled();

    // Y ofrece el catálogo entero, no una lista vacía ni un grupo recortado.
    await user.click(screen.getByTestId('recipe-line-unit-0'));
    const opciones = await screen.findAllByTestId('recipe-line-unit-0-option');
    expect(opciones.map((opcion) => opcion.textContent ?? '').sort()).toEqual(['Gramo', 'L']);
    await user.click(await esperarInteractiva(await screen.findByRole('option', { name: 'L' })));

    await user.type(screen.getByTestId('recipe-line-quantity-0'), '2');
    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payload] = createRecipeActionMock.mock.calls[0] as [
      { lines: { productId: string; unitId: string }[] },
    ];
    expect(payload.lines[0]).toMatchObject({ productId: PRODUCT_1_ID, unitId: UNIT_LITRO_ID });
  });
});

describe('R31 — dos líneas del mismo producto y una cantidad inválida no se envían', () => {
  it('un ingrediente ya usado NO se ofrece en las demás líneas: no se puede repetir', async () => {
    // R16 desde la interfaz. La regla vive en `createRecipeSchema` y su test está en
    // `tests/unit/recetas/recipe-input.test.ts`; lo que se afirma AQUÍ es que el formulario ya
    // no deja llegar hasta ahí -el repetido es imposible de elegir, no solo rechazado al
    // enviar-: el ingrediente ya usado se aparta de la lista de las demás líneas.
    const user = setupUser();
    renderCreateForm();

    await user.type(screen.getByTestId('recipe-field-name'), 'Receta sin repetidos');
    await addValidLine(user, 0, { quantity: '1' });

    await user.click(screen.getByTestId('recipe-line-add-0'));
    await user.click(screen.getByTestId('recipe-line-product-1'));

    // La opción del ingrediente ya usado NO se ofrece en la segunda línea...
    expect(await screen.findByTestId('recipe-line-product-1-popup')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: PRODUCT_1_NAME })).toBeNull();
    // ...pero sigue estando en la línea que lo usa: no se veta a sí mismo.
    await user.click(screen.getByTestId('recipe-line-product-0'));
    expect(await screen.findByRole('option', { name: PRODUCT_1_NAME })).toBeInTheDocument();
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
    await escribirEnPaso(0, 'Mezclar');
    await user.click(screen.getByTestId('recipe-step-add'));
    await escribirEnPaso(1, 'Calentar de mas');
    await user.click(screen.getByTestId('recipe-step-add'));
    await escribirEnPaso(2, 'Enfriar');

    // Editar el paso 2: corrige "Calentar de mas" -> "Calentar".
    await reescribirPaso(user, 1, 'Calentar');

    // Quitar el paso 3 ("Enfriar"): el orden final debe ser ['Mezclar', 'Calentar'].
    await user.click(screen.getByTestId('recipe-step-remove-2'));

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: RecipeStepView[] }];
    expect(stepTexts(payload.steps)).toEqual(['Mezclar', 'Calentar']);
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
      await escribirEnPaso(0, 'Mezclar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(1, 'Calentar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(2, 'Enfriar');

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
      const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: RecipeStepView[] }];
      expect(stepTexts(payload.steps)).not.toEqual(['Mezclar', 'Calentar', 'Enfriar']);
      expect(payload.steps).toHaveLength(3);
      expect(stepTexts(payload.steps)).toEqual(['Calentar', 'Enfriar', 'Mezclar']);
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
      await escribirEnPaso(0, 'Mezclar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(1, 'Calentar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(2, 'Enfriar');

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
      const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: RecipeStepView[] }];
      expect(stepTexts(payload.steps)).toEqual(['Calentar', 'Mezclar', 'Enfriar']);
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

describe('QC-64 R9 — la precarga de edición NO aplana: el documento llega al editor entero', () => {
  it('R9: un paso con marcas y lista de verificación se precarga completo y vuelve idéntico al guardar', async () => {
    const user = setupUser();
    // Documento con TODO lo que el contrato admite y el puente de QC-62 perdía: marcas sobre
    // fragmentos concretos, un párrafo en blanco y una lista de verificación con dos elementos.
    const documento: RecipeStepView = {
      blocks: [
        {
          kind: 'paragraph',
          spans: [
            { text: 'Mezclar ' },
            { text: 'despacio', bold: true },
            { text: ' y ' },
            { text: 'en frío', italic: true },
          ],
        },
        { kind: 'paragraph', spans: [] },
        {
          kind: 'checklist',
          items: [{ spans: [{ text: 'Balanza calibrada' }] }, { spans: [{ text: 'Guantes' }] }],
        },
      ],
    };

    renderEditForm(recipeDetail({ steps: [documento] }));

    const editable = await screen.findByTestId('recipe-step-text-0');

    // 1. El texto entero está, incluido el de la lista de verificación: nada se perdió.
    expect(editable).toHaveTextContent('Mezclar despacio y en frío');
    expect(editable).toHaveTextContent('Balanza calibrada');
    expect(editable).toHaveTextContent('Guantes');

    // 2. Las MARCAS siguen siendo marcas, no texto plano: un aplanado las habría borrado.
    expect(editable.querySelector('strong')?.textContent).toBe('despacio');
    expect(editable.querySelector('em')?.textContent).toBe('en frío');

    // 3. Y la lista de verificación sigue siendo una lista con sus DOS elementos.
    expect(editable.querySelectorAll('li[data-type="taskItem"]')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateRecipeActionMock.mock.calls[0] as [string, { steps: RecipeStepView[] }];
    // La aserción que de verdad cierra R9: lo que se reenvía es EL MISMO documento. Si la
    // precarga aplanara -o el editor perdiera un elemento al montarlo-, esto sería rojo.
    expect(payload.steps).toEqual([documento]);
  });
});

describe('QC-64 R1 y R10 — el campo del paso es el editor, y no hay selector de tipo de paso', () => {
  it('R1: el campo de un paso es el área editable del editor, no un <input type="text">', async () => {
    const user = setupUser();
    renderEditForm(recipeDetail({ steps: [stepView('Mezclar')] }));

    const campo = await screen.findByTestId('recipe-step-text-0');
    expect(campo).toHaveAttribute('contenteditable', 'true');
    expect(campo.tagName).not.toBe('INPUT');
    expect(campo.tagName).not.toBe('TEXTAREA');
    // La barra de formato del editor está montada, con sus tres controles y ninguno más.
    expect(screen.getByRole('button', { name: 'Negrilla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cursiva' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista de verificacion' })).toBeInTheDocument();

    // Un paso nuevo tampoco trae un campo de texto plano.
    await user.click(screen.getByTestId('recipe-step-add'));
    const nuevo = await screen.findByTestId('recipe-step-text-1');
    expect(nuevo).toHaveAttribute('contenteditable', 'true');

    // Y en NINGUNA fila de pasos queda un `<input type="text">` ni un `<textarea>`.
    for (const fila of screen.getAllByTestId('recipe-step-row')) {
      expect(fila.querySelector('input[type="text"]')).toBeNull();
      expect(fila.querySelector('textarea')).toBeNull();
    }
  });

  it('R10: no hay selector de tipo de paso en el alta ni en la edición: ni select, ni radios, ni control equivalente', async () => {
    const user = setupUser();

    // --- Modo EDICIÓN ---
    renderEditForm(recipeDetail({ steps: [stepView('Mezclar')] }));
    await screen.findByTestId('recipe-step-text-0');
    esperarSinSelectorDeTipo();

    await user.click(screen.getByTestId('recipe-step-add'));
    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(2);
    esperarSinSelectorDeTipo();

    cleanup();

    // --- Modo ALTA ---
    renderCreateForm();
    await user.click(screen.getByTestId('recipe-step-add'));
    await screen.findByTestId('recipe-step-text-0');
    esperarSinSelectorDeTipo();
  });
});

describe('QC-64 R24 — el arrastre por teclado sigue funcionando con el editor dentro de la fila', () => {
  it('R24: tomar el asa con Espacio, mover con las flechas y soltar cambia el orden del payload aunque cada paso monte un editor', async () => {
    const user = setupUser();
    const uninstall = installStepRowRectStub();
    try {
      renderCreateForm();
      await user.type(screen.getByTestId('recipe-field-name'), 'Receta con editor y arrastre');

      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(0, 'Mezclar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(1, 'Calentar');
      await user.click(screen.getByTestId('recipe-step-add'));
      await escribirEnPaso(2, 'Enfriar');

      // El editor ESTÁ montado dentro de cada fila -es lo que este caso añade sobre el R34
      // heredado, que corría con un `<input>`-: si el arrastre se rompiera al meterlo, esta
      // prueba lo delataría.
      for (const fila of screen.getAllByTestId('recipe-step-row')) {
        expect(fila.querySelector('[contenteditable="true"]')).not.toBeNull();
      }

      // Escribir dentro del editor NO inicia ningún arrastre: el `KeyboardSensor` sólo actúa con
      // el foco en el asa, y el foco acaba de estar en el área editable del último paso
      // (`design.md > 8`). Si los dos teclados se pisaran, el orden ya habría cambiado aquí.
      expect(textosVisiblesDeLosPasos()).toEqual(['Mezclar', 'Calentar', 'Enfriar']);

      const primeraAsa = screen.getByTestId('recipe-step-handle-0');
      await tabUntil(user, primeraAsa);
      expect(document.activeElement).toBe(primeraAsa);

      await user.keyboard(' '); // toma el paso
      await user.keyboard('{ArrowDown}'); // lo mueve una posición
      await user.keyboard(' '); // lo suelta

      await user.click(screen.getByTestId('recipe-form-submit'));

      await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
      const [payload] = createRecipeActionMock.mock.calls[0] as [{ steps: RecipeStepView[] }];
      expect(stepTexts(payload.steps)).toEqual(['Calentar', 'Mezclar', 'Enfriar']);
    } finally {
      uninstall();
    }
  });
});

describe('QC-64 R11, R13 y R22 — la vista previa lee lo que hay escrito y no guarda nada', () => {
  /** Todas las operaciones que este archivo dobla. R11 y R22 exigen que NINGUNA se invoque. */
  const TODAS_LAS_ACCIONES = [
    createRecipeActionMock,
    updateRecipeActionMock,
    getRecipeActionMock,
    listProductsActionMock,
    listUnitsActionMock,
  ] as const;

  /** Ninguna operacion del modulo se invoco, y tampoco se navego fuera del formulario. */
  function esperarQueNoSeInvocoNingunaAccion(): void {
    for (const accion of TODAS_LAS_ACCIONES) {
      expect(accion).not.toHaveBeenCalled();
    }
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  }

  /** Rellena el formulario con los MISMOS datos siempre: es lo que hace comparables los payloads. */
  async function rellenarFormulario(user: UserEvent, textoDelPaso: string): Promise<void> {
    await user.type(screen.getByTestId('recipe-field-name'), 'Receta con vista previa');
    await user.type(screen.getByTestId('recipe-field-description'), 'Una descripcion');
    await user.click(screen.getByTestId('recipe-step-add'));
    await escribirEnPaso(0, textoDelPaso);
  }

  /** Abre el modal y devuelve su contenido, ya en pantalla. */
  async function abrirLaVistaPrevia(user: UserEvent): Promise<HTMLElement> {
    await user.click(screen.getByTestId('recipe-form-preview-open'));
    return await screen.findByTestId('recipe-form-preview');
  }

  it('R11: abrir la vista previa no invoca ninguna operacion y monta el asistente sobre los pasos escritos EN ESE INSTANTE', async () => {
    const user = setupUser();
    renderCreateForm();

    await rellenarFormulario(user, 'Mezclar despacio');
    // Se reescribe el paso ANTES de abrir: lo que el asistente presenta tiene que ser esto
    // ultimo, no lo primero que se escribio ni lo que hubiera guardado.
    await reescribirPaso(user, 0, 'Calentar a fuego lento');

    const modal = await abrirLaVistaPrevia(user);

    // El asistente esta montado DENTRO del modal, con el texto que hay escrito ahora mismo.
    expect(within(modal).getByTestId('step-reader')).toBeInTheDocument();
    expect(within(modal).getByText('Calentar a fuego lento')).toBeInTheDocument();
    expect(within(modal).getByTestId('step-reader-position')).toHaveTextContent('1');

    // R11: ni guarda, ni invoca ninguna operacion del modulo, ni navega.
    esperarQueNoSeInvocoNingunaAccion();
  });

  it('R13: cerrar la vista previa con Esc devuelve el formulario intacto y el foco al boton que la abrio, y el payload es el mismo que sin haberla abierto', async () => {
    const user = setupUser();

    // --- A) Referencia: el mismo formulario, SIN abrir nunca la vista previa ---
    renderCreateForm();
    await rellenarFormulario(user, 'Mezclar despacio');
    await user.click(screen.getByTestId('recipe-form-submit'));
    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payloadSinVistaPrevia] = createRecipeActionMock.mock.calls[0] as [unknown];

    cleanup();
    vi.clearAllMocks();
    createRecipeActionMock.mockResolvedValue({ status: 'success', id: RECIPE_ID });

    // --- B) El mismo formulario, abriendo y cerrando la vista previa por el camino ---
    renderCreateForm();
    await rellenarFormulario(user, 'Mezclar despacio');

    const modal = await abrirLaVistaPrevia(user);
    expect(within(modal).getByTestId('step-reader')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('recipe-form-preview')).toBeNull());
    // El asistente se DESMONTA: no queda escondido en el DOM.
    expect(screen.queryByTestId('step-reader')).toBeNull();

    // Todo lo escrito sigue como estaba: nombre, descripcion y el paso.
    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Receta con vista previa');
    expect(screen.getByTestId('recipe-field-description')).toHaveValue('Una descripcion');
    expect(areaDePaso(0)).toHaveTextContent('Mezclar despacio');

    // Y el foco vuelve al boton que abrio el modal, no al principio del documento.
    await waitFor(() => expect(screen.getByTestId('recipe-form-preview-open')).toHaveFocus());

    await user.click(screen.getByTestId('recipe-form-submit'));
    await waitFor(() => expect(createRecipeActionMock).toHaveBeenCalledTimes(1));
    const [payloadConVistaPrevia] = createRecipeActionMock.mock.calls[0] as [unknown];

    // La asercion que cierra R13: haber abierto la vista previa no cambio NADA de lo que se envia.
    expect(payloadConVistaPrevia).toEqual(payloadSinVistaPrevia);
  });

  it('R22: Finalizar cierra el modal y no guarda ni navega', async () => {
    const user = setupUser();
    renderCreateForm();

    await rellenarFormulario(user, 'Mezclar despacio');
    const modal = await abrirLaVistaPrevia(user);

    // Un unico paso sin lista de verificacion: el ultimo, asi que la accion es Finalizar y nada
    // la bloquea (R15, R18).
    await user.click(within(modal).getByTestId('step-reader-finish'));

    await waitFor(() => {
      expect(screen.queryByTestId('recipe-form-preview')).toBeNull();
      expect(screen.queryByTestId('step-reader')).toBeNull();
    });

    // R22: cerrar por Finalizar tampoco guarda ni navega, y el formulario sigue entero.
    esperarQueNoSeInvocoNingunaAccion();
    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Receta con vista previa');
    expect(areaDePaso(0)).toHaveTextContent('Mezclar despacio');
  });
});

/** QC-71 T9 — R17 y R18 en el formulario de receta. */
describe('formulario de receta — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue(errorInesperado());
    renderEditForm(recipeDetail());

    await user.click(screen.getByTestId('recipe-form-submit'));

    const region = await screen.findByTestId('recipe-form-error');
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado para editar esta receta.',
    });
    renderEditForm(recipeDetail());

    await user.click(screen.getByTestId('recipe-form-submit'));

    const region = await screen.findByTestId('recipe-form-error');
    expect(within(region).getByTestId('recipe-form-error-code')).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(screen.queryByText(REFERENCIA_DEL_CASO)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
  });
});
