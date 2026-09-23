'use client';

import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DEFAULT_ORDER_PRIORITY,
  EDITABLE_STATUS_VALUES,
  ORDER_PRIORITY_VALUES,
  createOrderSchema,
  updateOrderSchema,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import {
  createOrderAction,
  updateOrderAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { getRecipeAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeQueryResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeLineView } from '@/lib/modules/recetas';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import type { UnitView } from '@/lib/modules/unidades';
// Solo el TIPO, del contrato publico de `inventario`: la arista `pedidos -> inventario` ya
// existe (`design.md > 5.1`).
import type { OrderCoverage } from '@/lib/modules/inventario';
import { trimDecimal } from '@/lib/shared/ui/decimal-display';
import { OrderField } from './order-field';
import { OrderIngredientsTable } from './order-ingredients-table';
import { OrderRecipeImage } from './order-recipe-image';
import {
  RECIPE_FIELD,
  RecipePicker,
  type RecipePickerOption,
  type RecipePickerPage,
} from './recipe-picker';
import {
  EMPTY_RESPONSIBLES_CATALOG,
  OrderResponsibles,
  type OrderResponsiblesCatalog,
} from './order-responsibles';
import { isFinalOrderStatus } from './order-row-actions';
import { ORDER_PRIORITY_LABELS, ORDER_STATUS_LABELS, OrderCoverageBadge } from './order-status-badge';

/**
 * QC-102 T14 — EN QUE SECCION abre el panel (R23, R24).
 *
 * Es una union de dos literales y no un booleano `openResponsibles` a proposito: el dia que el
 * panel tenga una tercera seccion, anadirla aqui rompe el `typecheck` de quien no la contemple.
 *
 * **No hay panel nuevo, ni ruta nueva, ni pantalla aparte**: el panel es EL MISMO
 * (`SheetContent`), y esto solo decide a donde va el foco al abrirlo.
 */
export type OrderSheetSection = 'form' | 'responsibles';

/** La seccion de responsables, dentro del panel que ya existe. Se localiza por este `data-testid`. */
export const ORDER_SHEET_RESPONSIBLES_TESTID = 'order-sheet-responsibles';

/** QC-141 T14, R35 — la etiqueta de cobertura de la hoja. */
export const ORDER_SHEET_COVERAGE_TESTID = 'order-sheet-coverage';

/**
 * Formulario de alta y edicion de pedido (R26-R30, R33, R34, R39, R45, `design.md > 8`).
 *
 * **Mismo patron no controlado ya mergeado en `product-form.tsx` y `supplier-form.tsx`**:
 * `<form action>` + `useActionState`, con el literal `{ status: 'idle' }` **construido aqui**
 * -un archivo `'use server'` no puede exportar constantes, y las actions de `pedidos` lo dejaron
 * escrito-. **Sin ninguna libreria de formularios** (R33, R42): la tabla de decisiones de esta
 * ficha la veta expresamente remitiendo a QC-22, no se instalo nada y no se corrio el CLI para la
 * primitiva de formulario. (Los nombres de los paquetes descartados no se escriben aqui, para que
 * una guardia de fuente que los busque no encuentre un falso positivo.)
 *
 * **La validacion previa usa LOS MISMOS esquemas que valida el servidor** (`createOrderSchema` /
 * `updateOrderSchema`, del barrel de `pedidos`, que es client-safe): el patron decimal, el «mayor
 * que cero» de la cantidad, el cero admitido en el precio y los conjuntos cerrados salen de ahi y
 * no se reescriben (R33). El servidor revalida igual: el cliente nunca es la frontera.
 *
 * **`bind` y no un argumento de mas**: `updateOrderAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera. Aplicarle parcialmente el
 * `id` es el patron estandar de React y evita tocar el adaptador driving de QC-34, que R46
 * prohibe abrir.
 *
 * **R26 — el alta lleva LOS CINCO campos de negocio y nada mas**: ni estado, ni motivo, ni
 * correlativo, ni fecha de solicitud, ni autoria. El estado de alta es siempre `PENDIENTE` y lo
 * pone el caso de uso; el correlativo lo entrega la secuencia de la base; los autores salen de la
 * sesion.
 *
 * **R27 — la prioridad es OPCIONAL con su defecto VISIBLE**, no implicito: un campo ausente del
 * formulario es ausencia para `readOptionalFormString`, pero un campo VACIO es error, asi que
 * este formulario emite **siempre** un valor valido y arranca con `DEFAULT_ORDER_PRIORITY`
 * preseleccionada.
 *
 * **R28, R29 — la edicion precarga y es REEMPLAZO COMPLETO** de los cinco campos mas el estado, y
 * es el UNICO sitio donde el estado se cambia. El selector de estado ofrece
 * `EDITABLE_STATUS_VALUES`, que **excluye `CANCELADO` por construccion** -se deriva de
 * `ORDER_STATUS_VALUES` en el contrato, no se escribe a mano aqui-: el unico camino a `CANCELADO`
 * es `cancelOrderAction`.
 *
 * **R30 — no hay campo de fecha de solicitud** en ningun modo: la pone el sistema.
 *
 * **R34 — la traduccion de errores es por `code`, NUNCA por texto** (`design.md > 8`): el mensaje
 * que devuelve la operacion se pinta, pero quien decide DONDE se pinta es el codigo estable. Un
 * rechazo no cierra el panel ni pierde lo escrito: React 19 resetea los campos no controlados de
 * un `<form action>` al completarse la action, asi que el estado de fallo devuelve los valores
 * escritos y cada campo los recupera por `defaultValue`.
 *
 * **Los INGREDIENTES de la receta elegida se muestran en el propio panel** (2026-09-09): al
 * elegir una receta -o al abrir la edicion, donde ya viene elegida- se pide su detalle
 * (`getRecipeAction`) y se pinta la tabla con los datos de los productos. El JOIN con `products`
 * lo hace el detalle de `recetas`; la unidad se resuelve aqui con el catalogo que baja por props
 * (R43). El id de la receta elegida viaja igual por el `FormData`; la tabla no anade ningun campo
 * al envio.
 */

/** Los CINCO campos de negocio, con el MISMO nombre que el adaptador driving lee del `FormData`. */
/**
 * QC-35bis (decision humana del 2026-09-07): eran CINCO. La unidad y el precio unitario salieron
 * del pedido -del formulario, del contrato del modulo y de la tabla `orders`-, asi que esta lista
 * tiene CUATRO campos. Sigue siendo la unica fuente: `readValues` la recorre para armar el
 * `FormData` que la action lee, de modo que anadir un campo aqui y no en el formulario -o al
 * reves- no es posible sin que algo se note.
 */
export const ORDER_BUSINESS_FIELDS = [RECIPE_FIELD, 'quantity', PRESENTATION_FIELD, 'priority'] as const;

/** Campo que SOLO existe en la edicion (R26, R29). */
export const ORDER_STATUS_FIELD = 'status';

export const ORDER_PRIORITY_SELECT_TESTID = 'order-priority-select';
export const ORDER_PRIORITY_OPTION_TESTID = 'order-priority-option';
export const ORDER_STATUS_SELECT_TESTID = 'order-status-select';
export const ORDER_STATUS_OPTION_TESTID = 'order-status-option';
export const ORDER_FORM_TESTID = 'order-form';
export const ORDER_FORM_TITLE_TESTID = 'order-form-title';
export const ORDER_FORM_ERROR_TESTID = 'order-form-error';
export const ORDER_FORM_SUBMIT_TESTID = 'order-form-submit';
export const ORDER_FORM_CANCEL_TESTID = 'order-form-cancel';

type OrderFieldName =
  | (typeof ORDER_BUSINESS_FIELDS)[number]
  | typeof ORDER_STATUS_FIELD;

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const CREATE_TITLE = 'Nuevo pedido';
const EDIT_TITLE = 'Editar pedido';

/** Separador entre receta y cantidad en el titulo. Es el signo de multiplicar, no la letra equis. */
const TITLE_SEPARATOR = '×';

/**
 * Titulo del panel a partir de lo elegido (decision humana del 2026-09-08): `<receta> × <cantidad>`
 * y, sin cantidad todavia, solo la receta. Devuelve `null` cuando no hay receta elegida, que es la
 * senal de que el panel debe volver a su rotulo.
 *
 * La cantidad se pinta TAL CUAL se escribio: no se convierte, no se redondea y no se formatea.
 */
function describeOrder(recipeName: string, quantity: string): string | null {
  const receta = recipeName.trim();
  if (receta === '') return null;

  const cantidad = quantity.trim();
  return cantidad === '' ? receta : `${receta} ${TITLE_SEPARATOR} ${cantidad}`;
}

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: sus mensajes describen el
 * esquema, no lo que el usuario tiene que hacer. **La REGLA sigue siendo la del esquema**; aqui
 * solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Readonly<Record<OrderFieldName, string>> = {
  recipeId: 'Elige una receta de la lista.',
  quantity: 'Escribe una cantidad decimal mayor que cero.',
  presentationId: 'Elige una presentación de la lista.',
  priority: 'Elige una de las prioridades disponibles.',
  status: 'Elige uno de los estados disponibles.',
};

const FIELD_LABELS = {
  quantity: 'Cantidad',
  priority: 'Prioridad',
  status: 'Estado',
} as const;

/**
 * Donde se pinta cada `code` estable de `pedidos/domain/errors.ts` (`design.md > 8`). Los codigos
 * que NO estan aqui -`order_not_found`, `duplicate_number`, `unauthorized`, `invalid_input` sin
 * campo senalado- van a la region `role="alert"` del formulario.
 *
 * QC-70 (R20): las claves se tipan con `ErrorCode`, la union CERRADA del catalogo. **Ningun valor
 * cambia** -los dos codigos que esta pantalla mapea ya eran inequivocos y R19 los congela-; lo que
 * cambia es que una clave mal escrita, o un codigo que el catalogo no declare, deja de compilar.
 * `Partial` porque el mapa es deliberadamente incompleto: solo los codigos que senalan UN campo.
 */
const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, OrderFieldName>>> = {
  recipe_not_found: RECIPE_FIELD,
  // `unit_not_found` ya no existe como codigo del modulo (2026-09-07): sin unidad en el pedido,
  // no hay nada que pueda emitirlo, y mantener la entrada seria mapear un error imposible.
  presentation_not_found: PRESENTATION_FIELD,
  invalid_transition: ORDER_STATUS_FIELD,
};

/**
 * QC-70 (R21): el codigo que este formulario FABRICA cuando su propia validacion previa rechaza
 * la entrada sale del catalogo -tipado `ErrorCode`-, en vez de ser un literal suelto. El valor no
 * cambia. El MENSAJE que lo acompana (`FORM_ERROR_MESSAGE`) es del formulario y se queda: la
 * validacion del front no se toca (R31, `design.md > 6 bis`).
 *
 * QC-71 (R16, R18): `satisfies` en vez de anotacion, para que el tipo se quede en el literal y
 * pueda construir la rama CATALOGADA de `ErrorState`. Con `: ErrorCode` el tipo incluiria el
 * codigo generico y este literal exigiria un `reference` que aqui no existe: el rechazo lo
 * fabrica el formulario, no el servidor.
 */
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

type FieldErrors = Partial<Record<OrderFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R34 prohibe perderlo. */
type FieldValues = Partial<Record<OrderFieldName, string>>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }`.
 */
type OrderFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /**
       * El error TAL CUAL: el de la operacion, o el `invalid_input` que fabrica la validacion
       * previa.
       *
       * **QC-71 (R17): entero, no copiado campo a campo.** La copia de `code` y `message` perdia
       * el `reference` del error inesperado; un `reference?: string` local reabriria el agujero
       * por el otro lado. Se guarda la union cerrada y el render estrecha por `code`.
       */
      serverError: ErrorState;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: OrderFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData, isEdit: boolean): FieldValues {
  const values: FieldValues = {};
  for (const field of ORDER_BUSINESS_FIELDS) {
    values[field] = readString(formData, field);
  }
  if (isEdit) {
    values[ORDER_STATUS_FIELD] = readString(formData, ORDER_STATUS_FIELD);
  }
  return values;
}

/**
 * Invoca la operacion que toca y normaliza su resultado. El alta devuelve ademas el id creado y
 * su correlativo; aqui no hace falta ninguno de los dos: lo unico que el formulario necesita
 * saber es si fallo y con que codigo.
 */
async function submit(
  order: OrderSummary | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | ErrorState> {
  if (order === undefined) {
    const result = await createOrderAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updateOrderAction.bind(null, order.id);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

/**
 * Estado inicial del selector de edicion. `EDITABLE_STATUS_VALUES` no incluye `CANCELADO`, y un
 * pedido cancelado no llega hasta aqui -sus acciones de fila estan deshabilitadas (R24)-, pero el
 * desplegable tiene que arrancar con un valor que EXISTA entre sus opciones.
 */
function editableStatusOf(order: OrderSummary): string {
  const match = EDITABLE_STATUS_VALUES.find((value) => value === order.status);
  return match ?? EDITABLE_STATUS_VALUES[0];
}

export type OrderFormProps = {
  /** Pedido que se edita. Ausente en el alta (R26). */
  readonly order?: OrderSummary;
  /** Primera pagina del catalogo de recetas, por props (R43). */
  readonly recipes: RecipePickerPage;
  /**
   * Catalogo de unidades, por props (R43): resuelve la unidad de cada ingrediente de la
   * receta elegida. `recetas` no resuelve unidades (R50), asi que lo hace esta pantalla.
   */
  readonly units: readonly UnitView[];
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R35). */
  readonly onSaved: () => void;
  /**
   * QC-102 R26 — los responsables que **la fila del listado ya trajo**. Al abrir el panel NO se
   * consulta nada: se pinta lo que ya esta en memoria.
   */
  readonly responsibles?: readonly OrderResponsible[];
  /** QC-102 R27, R28 — catalogos y `canWrite`, por props desde el servidor. */
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /**
   * QC-141 T14, R35 — la cobertura que **la fila del listado ya trajo**. `undefined` con el lote
   * caido: la hoja no pinta la etiqueta, igual que `loadResponsiblesCatalog` se degrada sin decir
   * nada (H1).
   */
  readonly coverage?: OrderCoverage;
  /** QC-102 R24 — en que seccion abre. Por defecto, el formulario de siempre. */
  readonly section?: OrderSheetSection;
};

export function OrderForm({
  order,
  recipes,
  units,
  onSaved,
  responsibles = [],
  responsiblesCatalog = EMPTY_RESPONSIBLES_CATALOG,
  coverage,
  section = 'form',
}: OrderFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const isEdit = order !== undefined;

  /**
   * QC-102 T14 — La seccion de responsables, DENTRO de este mismo panel (R23). Cuando el panel se
   * abre desde la entrada «Responsables» de la fila, el foco va aqui: sin scroll a ciegas y sin
   * obligar a recorrer el formulario. `scrollIntoView` se llama solo si existe —jsdom no lo
   * implementa— y el contenedor es `tabIndex={-1}` para poder recibir foco sin entrar en el orden
   * de tabulacion.
   */
  const responsiblesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (section !== 'responsibles') return;
    const node = responsiblesRef.current;
    if (node === null) return;
    node.focus({ preventScroll: true });
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' });
  }, [section]);

  /*
    Eleccion VIGENTE de receta: con ella se pintan la CABECERA, la IMAGEN y la tabla de
    ingredientes, y decide si Guardar esta habilitado. Lo que se ENVIA sigue saliendo del
    `FormData` -el id de la receta del `input` oculto del selector y la cantidad del propio campo-;
    este estado es solo el reflejo en pantalla de esa eleccion.

    La pone `onSelect` cuando se elige una opcion de la lista, y el propio selector la RETIRA con
    `null` cuando lo escrito deja de coincidir con lo elegido (decision humana del 2026-09-09): la
    receta «crema 1» no puede guardarse con el campo diciendo «crema 1a». En la edicion el nombre
    se sabe desde el principio -viene en el resumen del pedido- pero la imagen no: `OrderSummary`
    no la trae, asi que hasta que se elija una receta se ve el marcador.
  */
  const [recipe, setRecipe] = useState<RecipePickerOption | null>(
    order === undefined
      ? null
      : { id: order.recipeId, name: order.recipeName ?? '', imageUrl: null },
  );
  // La cantidad guardada llega con la escala de la columna («15.0000») y aqui se precarga SIN
  // sus ceros de relleno: `trimDecimal` deja «15», no «15.00». NO redondea, y la diferencia
  // importa porque este valor es el que se vuelve a guardar: recortar ceros no cambia el
  // numero, redondearlo si -una cantidad de 0.1255 reabierta y guardada se convertiria en
  // 0.13 sin que nadie lo pidiera-.
  const [quantity, setQuantity] = useState(trimDecimal(order?.quantity ?? ''));

  const recipeName = recipe?.name ?? '';
  const recipeImageUrl = recipe?.imageUrl ?? null;
  /** Id de la receta elegida: decide si la tabla de ingredientes se monta. */
  const recipeId = recipe?.id ?? '';
  /** Guardar solo se habilita con una receta elegida: sin receta no hay pedido (decision 2026-09-09). */
  const canSave = recipe !== null;

  /*
    Los ingredientes de la receta elegida. Se piden al SERVIDOR al elegir receta -en el alta- o al
    montar el panel -en la edicion, donde la receta ya viene elegida-: el detalle de `recetas` hace
    el JOIN con `products` (`ProductCatalog.findRefs`) y trae por linea el nombre y la existencia
    del producto en la unidad de la linea, mas la cantidad y la unidad de la linea.

    `ingredientsRequestRef` descarta la respuesta de una receta ya superada: elegir A y luego B no
    debe dejar que la linea de A pise a la de B cuando llegue la respuesta mas lenta. Es el mismo
    problema de carreras que ya resuelve el hook del selector de recetas, aqui a mano porque esta
    consulta la dispara un gesto puntual y no hay motor compartido que la cubra.
  */
  const [ingredients, setIngredients] = useState<readonly RecipeLineView[]>([]);
  // En la edicion la receta ya viene elegida al montar el panel: la carga inicial SIEMPRE arranca
  // en vuelo, asi que el estado arranca en `true` y el efecto no tiene que pintarlo a posteriori.
  const [ingredientsLoading, setIngredientsLoading] = useState(isEdit);
  const [ingredientsError, setIngredientsError] = useState<string | null>(null);
  const ingredientsRequestRef = useRef(0);

  /**
   * Aplica el detalle de una receta al estado, SOLO si sigue siendo la receta elegida: el de una
   * eleccion anterior, si llega despues, se descarta. Es la unica funcion que escribe el estado de
   * los ingredientes, y siempre se invoca DENTRO de un callback `.then` -nunca sincrono desde el
   * efecto (`react-hooks/set-state-in-effect`)-.
   */
  const applyIngredientsResult = useCallback(
    (requestId: number, result: RecipeQueryResult) => {
      if (requestId !== ingredientsRequestRef.current) return;

      setIngredientsLoading(false);
      if (result.status === 'error') {
        setIngredients([]);
        setIngredientsError(result.message);
        return;
      }
      setIngredients(result.data.lines);
      setIngredientsError(null);
    },
    [],
  );

  /** Pide el detalle de una receta y deja su resultado en `applyIngredientsResult`. */
  const loadIngredients = useCallback(
    (selectedId: string) => {
      const requestId = ++ingredientsRequestRef.current;
      void getRecipeAction(selectedId).then((result) => applyIngredientsResult(requestId, result));
    },
    [applyIngredientsResult],
  );

  /** La edicion arranca con la receta ya elegida: sus ingredientes se piden al montar. */
  useEffect(() => {
    if (order?.recipeId) void loadIngredients(order.recipeId);
  }, [loadIngredients, order?.recipeId]);

  /** `null` = el selector retiro la eleccion (lo escrito deja de coincidir): se apaga todo. */
  function chooseRecipe(option: RecipePickerOption | null) {
    if (option === null) {
      setRecipe(null);
      setIngredients([]);
      setIngredientsError(null);
      return;
    }
    setRecipe({ id: option.id, name: option.name, imageUrl: option.imageUrl });
    setIngredientsLoading(true);
    setIngredientsError(null);
    loadIngredients(option.id);
  }

  async function save(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
    const values = readValues(formData, isEdit);

    // El esquema de la edicion es el del alta MAS el estado (reemplazo completo, R28). Se nombran
    // los dos para que quede escrito de donde sale cada regla.
    const parsed = isEdit
      ? updateOrderSchema.safeParse(values)
      : createOrderSchema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as OrderFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }

      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        serverError: { status: 'error', code: INVALID_INPUT_CODE, message: FORM_ERROR_MESSAGE },
        fieldErrors,
        values,
      };
    }

    const result = await submit(order, formData);

    if (result.status === 'error') {
      // R34: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
      const field = CODE_TO_FIELD[result.code];
      return {
        status: 'error',
        serverError: result,
        fieldErrors: field === undefined ? {} : { [field]: result.message },
        values,
      };
    }

    return { status: 'success' };
  }

  const [state, formAction] = useActionState(save, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    onSaved();
  }, [state, onSaved]);

  const fieldErrors = state.status === 'error' ? state.fieldErrors : {};
  const values = state.status === 'error' ? state.values : undefined;

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del pedido. */
  const initialValue = (field: OrderFieldName, fromOrder: string): string =>
    values?.[field] ?? fromOrder;

  /*
    Es el ERROR, no un booleano: asi el render estrecha por `code` y le pide el identificador al
    inesperado sin ningun `as` (QC-71 R17, R18).
  */
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar vive en el pie y
      `useFormStatus()` lo sigue viendo, porque el formulario es su ancestro.

      `w-full` en angosto y, a partir de `sm`, `minScreenWidth={70}`: el panel ocupa el 70% de la
      pantalla -el minimo gana al tope `sm:max-w-md`, que sigue de suelo si alguien quita la prop-.
      `pb-[env(safe-area-inset-bottom)]` para que el pie no quede bajo la barra de gestos de iOS
      (R45). El desbordamiento vertical lo absorbe el CUERPO, no el panel.
    */
    <SheetContent
      side="right"
      minScreenWidth={70}
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="order-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': ORDER_FORM_TESTID }}
      footer={<FormActions canSave={canSave} />}
    >
      <SheetHeader>
        <SheetTitle data-testid={ORDER_FORM_TITLE_TESTID}>
          {describeOrder(recipeName, quantity) ?? (isEdit ? EDIT_TITLE : CREATE_TITLE)}
        </SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos del pedido. Se guardan todos los campos.'
            : 'Completa los datos del pedido. La fecha y el número los pone el sistema.'}
        </SheetDescription>
        {/*
          QC-141 T14, R35 — la cobertura, SOLO en la edicion: el alta todavia no tiene pedido del
          que apartar nada. `undefined` (lote caido) no pinta nada, mismo criterio que
          `loadResponsiblesCatalog` (H1): el panel no da una explicacion, simplemente calla.
        */}
        {isEdit && coverage !== undefined ? (
          <div data-testid={ORDER_SHEET_COVERAGE_TESTID}>
            <OrderCoverageBadge coverage={coverage} />
          </div>
        ) : null}
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {formError === undefined ? null : (
          // Region de error del formulario (R34): aqui van los rechazos que no senalan campo.
          //
          // QC-71 (R17, R18): el error INESPERADO lo pinta el componente compartido, que anade el
          // identificador de la peticion. El CATALOGADO se pinta como siempre y sin identificador.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={ORDER_FORM_ERROR_TESTID}
          >
            {formError.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={formError} />
            ) : (
              <>
                <p data-testid="order-form-error-message">{formError.message}</p>
                <p className="text-xs" data-testid="order-form-error-code">
                  {formError.code}
                </p>
              </>
            )}
          </div>
        )}

        {/*
          Rejilla de 12: la imagen ocupa 3 columnas y los campos las 9 restantes, uno al lado del
          otro y alineados por arriba. Por debajo de `sm` la rejilla es de una sola columna -en un
          movil, 3 de 12 no da para ninguna imagen legible-, asi que la imagen queda encima.

          El hueco de la imagen esta SIEMPRE, con marcador mientras no haya receta elegida o su
          `imageUrl` sea nula, para que la columna no cambie de ancho al elegir la primera.
        */}
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <OrderRecipeImage imageUrl={recipeImageUrl} name={recipeName} />
          </div>

          <div className="flex flex-col gap-4 sm:col-span-9">
            <RecipePicker
              initialPage={recipes}
              onSelect={chooseRecipe}
              defaultValue={initialValue(RECIPE_FIELD, order?.recipeId ?? '')}
              defaultLabel={order?.recipeName ?? ''}
              error={fieldErrors.recipeId}
            />

            {/*
              Cantidad: control NUMERICO del navegador (enmienda humana del 2026-09-08 a R39). Con
              `step="any"` para que el decimal no choque contra el paso entero por defecto. El valor
              sigue viajando como cadena en el `FormData` y sigue validandolo el esquema del contrato.

              Al SOLTAR EL FOCO el valor se coloca a DOS decimales y sin ceros finales (decision
              humana del 2026-09-09): «25.00» y «25.0» quedan como «25», «25.3» y «25.08» conservan
              sus decimales. El `FormData` viaja con el valor ya colocado.
            */}
            <OrderField
              name="quantity"
              label={FIELD_LABELS.quantity}
              required
              type="number"
              step="any"
              inputMode="decimal"
              roundDecimals={2}
              defaultValue={initialValue('quantity', trimDecimal(order?.quantity ?? ''))}
              onValueChange={setQuantity}
              error={fieldErrors.quantity}
            />

            {/*
              Sin la prop `units`: este panel no ofrece dar de alta una presentacion nueva, solo
              elegir una existente del catalogo.
            */}
            <PresentationSelect
              defaultValue={initialValue(PRESENTATION_FIELD, order?.presentationId ?? '')}
              defaultLabel={order?.presentationName ?? ''}
              error={fieldErrors.presentationId}
            />

            {/* R27: prioridad opcional, con el defecto del contrato PRESELECCIONADO y VISIBLE. */}
            <SelectField
              name="priority"
              label={FIELD_LABELS.priority}
              defaultValue={initialValue('priority', order?.priority ?? DEFAULT_ORDER_PRIORITY)}
              options={ORDER_PRIORITY_VALUES.map((value) => ({
                value,
                label: ORDER_PRIORITY_LABELS[value],
              }))}
              triggerTestId={ORDER_PRIORITY_SELECT_TESTID}
              optionTestId={ORDER_PRIORITY_OPTION_TESTID}
              error={fieldErrors.priority}
            />

            {/*
              R26 y R29: el selector de estado existe SOLO en la edicion, y ofrece exactamente
              `EDITABLE_STATUS_VALUES` -sin `CANCELADO`, por construccion del contrato-.
            */}
            {isEdit ? (
              <SelectField
                name={ORDER_STATUS_FIELD}
                label={FIELD_LABELS.status}
                defaultValue={initialValue(ORDER_STATUS_FIELD, editableStatusOf(order))}
                options={EDITABLE_STATUS_VALUES.map((value) => ({
                  value,
                  label: ORDER_STATUS_LABELS[value],
                }))}
                triggerTestId={ORDER_STATUS_SELECT_TESTID}
                optionTestId={ORDER_STATUS_OPTION_TESTID}
                error={fieldErrors.status}
              />
            ) : null}
          </div>
        </div>

        {/*
          Los ingredientes de la receta elegida: se montan solo con receta elegida -en la edicion
          ya lo esta al abrir el panel-. El JOIN con `products` lo hace el detalle de `recetas`;
          aqui se pinta la tabla con los datos que ya vienen resueltos.
        */}
        {recipeId === '' ? null : (
          <OrderIngredientsTable
            lines={ingredients}
            units={units}
            quantity={quantity}
            loading={ingredientsLoading}
            error={ingredientsError}
          />
        )}

        {/*
          QC-102 R23 — LA SECCION DE RESPONSABLES, dentro del panel que ya existe. No hay panel
          nuevo, ni ruta nueva, ni pantalla aparte: es una seccion mas del mismo `SheetContent`.

          Solo en la EDICION: sin pedido creado no hay a quien asignar, y las tres operaciones de
          QC-87 piden un `orderId` que en el alta todavia no existe.

          R26: lo que pinta son los responsables que **la fila ya trajo**; no se consulta nada al
          abrir. R29: con el pedido en estado final, `isFinal` apaga los controles de escritura
          —y la seccion no dice por que—.
        */}
        {order === undefined ? null : (
          <div
            ref={responsiblesRef}
            tabIndex={-1}
            data-testid={ORDER_SHEET_RESPONSIBLES_TESTID}
            data-section={section}
          >
            <OrderResponsibles
              orderId={order.id}
              responsibles={responsibles}
              canWrite={responsiblesCatalog.canWrite}
              isFinal={isFinalOrderStatus(order.status)}
              people={responsiblesCatalog.people}
              workGroups={responsiblesCatalog.workGroups}
            />
          </div>
        )}
      </div>
    </SheetContent>
  );
}

type SelectFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly triggerTestId: string;
  readonly optionTestId: string;
  readonly error?: string;
};

/**
 * Desplegable no controlado de un conjunto CERRADO del contrato (prioridad, estado). El valor
 * viaja en el `FormData` por el `input` oculto que monta el primitivo; el conjunto de opciones
 * llega ya derivado del contrato, nunca escrito a mano aqui.
 */
function SelectField({
  name,
  label,
  defaultValue,
  options,
  triggerTestId,
  optionTestId,
  error,
}: SelectFieldProps) {
  const labelId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <Select name={name} defaultValue={defaultValue} items={[...options]}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={triggerTestId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-testid={optionTestId}
              data-value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`order-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Acciones del pie: cancelar y guardar. **Cancelar es `type="button"`** -y no un submit- porque
 * desde que el panel entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria.
 * Cierra por el primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura,
 * y al no navegar la URL conserva pagina, tamano, orden y filtros (R25).
 */
function FormActions({ canSave }: { canSave: boolean }) {
  return (
    <>
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            className={TOUCH_TARGET}
            data-testid={ORDER_FORM_CANCEL_TESTID}
          />
        }
      >
        Cancelar
      </SheetClose>
      <SaveButton canSave={canSave} />
    </>
  );
}

/**
 * Boton de envio. Componente aparte por una necesidad tecnica: `useFormStatus()` solo lee el
 * estado del `<form>` ANCESTRO, asi que dentro del componente que renderiza el `<form>`
 * devolveria siempre `pending: false` y el boton no se deshabilitaria nunca.
 *
 * Esta deshabilitado mientras no hay una receta ELEGIDA (decision humana del 2026-09-09) y
 * mientras la action esta en vuelo. Sin receta valida no tiene sentido llamar a la operacion: el
 * esquema del contrato la rechazaria igual, pero el boton le dice al usuario lo que le espera.
 */
function SaveButton({ canSave }: { canSave: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending || !canSave}
      aria-busy={pending}
      data-testid={ORDER_FORM_SUBMIT_TESTID}
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
