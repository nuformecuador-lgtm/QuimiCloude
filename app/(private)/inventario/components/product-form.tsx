'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import {
  createProductSchema,
  updateProductSchema,
  MANUAL_PRODUCT_TYPE_VALUES,
  PRODUCT_TYPES,
  type ProductView,
  type ProductType,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import {
  createProductAction,
  updateProductAction,
} from '@/lib/modules/inventario/adapters/driving/product-actions';

import { PresentationSelect } from '@/components/shared/presentation-select';
import { SharedSelect } from '@/components/shared/shared-select';

import { sanitizeQuantityInput } from './product-cost-amount';
import { ProductBatchDateField, formatDateLocalISO } from './product-batch-date-field';
import { ProductCostFields } from './product-cost-fields';
import { ProductField } from './product-field';
import { ProductNamePicker, type ProductNameOption } from './product-name-picker';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Campos de texto del producto.
 *
 * **La unidad tampoco esta**, y no por descuido: ver el comentario del formulario mas abajo.
 *
 * **El costo tampoco**: QC-52 lo saco del producto entero -junto con la compra minima y el
 * tiempo de entrega- porque son terminos comerciales del catalogo de cada proveedor. Ya no hay
 * campo, ni oculto, ni valor precargado que enviar (R5).
 */
const TEXT_FIELDS = ['name'] as const;

/** Campo decimal del producto: cadena de hasta 4 decimales, como la columna. */
const PRODUCT_DECIMAL_FIELDS = ['qtyAlert'] as const;

/** Campo select del producto. */
const PRODUCT_SELECT_FIELDS = ['type'] as const;

/**
 * Campos del LOTE que el alta pide junto al producto (`product_batches`), incluida su existencia.
 * Solo existen en el ALTA: la edicion no pinta ninguno, no los envia y valida con un esquema que
 * ni los conoce.
 *
 * `purchaseDate` siempre viaja con un valor -nunca vacia, "hoy" por defecto- y SOLO vive en el
 * lote (`product_batches`): los tres tipos, incluido Instrumento, crean lote. Solo existe en el
 * ALTA: la edicion no lo pinta ni lo envia.
 */
const BATCH_FIELDS = [
  'stock',
  'presentationId',
  'unitCost',
  'totalCost',
  'lot',
  'expiryDate',
  'purchaseDate',
] as const;

type ProductFieldName =
  | (typeof TEXT_FIELDS)[number]
  | (typeof PRODUCT_DECIMAL_FIELDS)[number]
  | (typeof PRODUCT_SELECT_FIELDS)[number]
  | (typeof BATCH_FIELDS)[number];

const ALL_FIELDS: readonly ProductFieldName[] = [
  ...TEXT_FIELDS,
  ...PRODUCT_DECIMAL_FIELDS,
  ...PRODUCT_SELECT_FIELDS,
  ...BATCH_FIELDS,
];

/**
 * Campos que se validan como decimal antes de llamar al esquema: el del producto y la existencia
 * del lote. Viajan como CADENA -el esquema los valida como tal-; aqui solo se comprueba la forma
 * para poder senalar el campo exacto, en vez de dejar que un unico mensaje generico cubra los dos.
 */
const DECIMAL_FIELDS = [...PRODUCT_DECIMAL_FIELDS, 'stock'] as const;

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: los mensajes de zod estan
 * en ingles y describen el esquema, no lo que el usuario tiene que hacer.
 */
const FIELD_MESSAGES: Record<ProductFieldName, string> = {
  name: 'Escribe un nombre de 1 a 120 caracteres.',
  type: 'Elige un tipo de producto.',
  stock: 'Debe ser un número decimal de 0 o más, con hasta 4 decimales.',
  qtyAlert: 'Debe ser un número decimal de 0 o más, con hasta 4 decimales.',
  presentationId: 'Elige una presentación.',
  // «Mayor que 0» porque la columna lleva `CHECK (unit_cost > 0)`. Y dos decimales, no los cuatro
  // del esquema: el campo ya no deja teclear mas, asi que prometer cuatro mandaria a escribir algo
  // que el propio campo rechaza.
  unitCost: 'Debe ser un importe mayor que 0, con hasta 2 decimales.',
  totalCost: 'Debe ser un importe mayor que 0, con hasta 2 decimales.',
  lot: 'Escribe un lote de 1 a 60 caracteres.',
  expiryDate: 'Escribe una fecha válida.',
  purchaseDate: 'Elige la fecha de compra.',
};

/** Falta el par de costos entero. Se pinta en LOS DOS campos: cualquiera de ellos resuelve. */
const COST_REQUIRED_MESSAGE = 'Escribe el costo unitario o el costo total; basta con uno.';

/** Los unicos tipos que el select ofrece: un producto terminado no nace a mano. */
const TYPE_OPTION_LABELS: Record<(typeof MANUAL_PRODUCT_TYPE_VALUES)[number], string> = {
  [PRODUCT_TYPES.PRODUCT]: 'Producto',
  [PRODUCT_TYPES.MACHINE]: 'Instrumento',
  [PRODUCT_TYPES.PACKAGING]: 'Envase',
};
const TYPE_OPTIONS = MANUAL_PRODUCT_TYPE_VALUES.map((type) => ({
  value: type,
  label: TYPE_OPTION_LABELS[type],
}));

/** Etiqueta del tipo cuando se edita un producto terminado: solo se muestra, no se elige. */
const FINISHED_PRODUCT_LABEL = 'Producto terminado';

const FIELD_LABELS: Record<ProductFieldName, string> = {
  name: 'Nombre',
  type: 'Tipo',
  stock: 'Existencia',
  qtyAlert: 'Alerta de cantidad',
  presentationId: 'Presentación',
  unitCost: 'Costo unitario',
  totalCost: 'Costo total',
  lot: 'Lote',
  expiryDate: 'Fecha de expiración',
  purchaseDate: 'Fecha de compra',
};

/** Determina si un campo debe mostrarse segun el tipo de producto seleccionado. */
function shouldShowField(field: ProductFieldName, productType: ProductType | undefined): boolean {
  // Instrumento (MACHINE): solo existencia y fecha de compra entre los campos del lote;
  // sin presentacion, costos, lote, caducidad ni alerta (2026-09-23).
  if (productType === PRODUCT_TYPES.MACHINE) {
    const hiddenForMachine: ProductFieldName[] = [
      'qtyAlert',
      'presentationId',
      'unitCost',
      'totalCost',
      'lot',
      'expiryDate',
    ];
    return !hiddenForMachine.includes(field);
  }
  // Para Envase (PACKAGING), no tiene fecha de vencimiento
  if (productType === PRODUCT_TYPES.PACKAGING) {
    const hiddenForPackaging: ProductFieldName[] = ['expiryDate'];
    return !hiddenForPackaging.includes(field);
  }
  return true;
}

type FieldErrors = Partial<Record<ProductFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R20 prohibe perderlo. */
type FieldValues = Record<ProductFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` -QC-20 explica por que no exporta ninguna constante inicial- y su estado
 * de error se recoge ENTERO.
 *
 * **`serverError` guarda el `ErrorState` completo, no `code` y `message` sueltos.**
 * La copia campo a campo que habia aqui perdia el `reference` del error inesperado -el unico dato
 * con el que quien reporta el fallo puede decir cual buscar en los registros-. Y un
 * `reference?: string` en este tipo local reabriria el mismo agujero por el otro lado: un
 * opcional deja construir un inesperado SIN identificador. Asi que aqui vive la union cerrada tal
 * cual, y el estrechamiento por `code` sigue valiendo en el render.
 */
type ProductFormState =
  | { status: 'idle' }
  | { status: 'success'; lot?: string }
  | {
      status: 'error';
      /** El error TAL CUAL: el de la operacion, o el `invalid_input` que fabrica la validacion previa. */
      serverError: ErrorState;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: ProductFormState = { status: 'idle' };

/**
 * QC-70 (R21): el codigo que este formulario FABRICA cuando la entrada ni llega a formarse sale
 * del catalogo y se tipa con `ErrorCode`, la union cerrada. Su valor no cambia.
 *
 * El mensaje de al lado NO sale del catalogo y se queda como esta (R31, `design.md > 6 bis`): es
 * el texto de una comprobacion PROPIA del formulario, no de un error que emita el back.
 *
 * `satisfies` en vez de anotacion. Sigue comprobando que el codigo pertenece al
 * catalogo, pero deja el tipo en el literal, que es lo que permite construir con el la rama
 * CATALOGADA de `ErrorState` -la que no lleva identificador ni puede llevarlo-. Con `: ErrorCode`
 * el tipo incluiria tambien el codigo generico, y entonces este literal no compilaria sin un
 * `reference` que aqui no existe: el rechazo lo fabrica el formulario, no el servidor.
 */
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values = {} as Record<ProductFieldName, string>;
  for (const field of ALL_FIELDS) {
    values[field] = readString(formData, field);
  }
  return values;
}

/** El mismo patron que valida el esquema: decimal sin signo, hasta 4 decimales (`decimal(14,4)`). */
const DECIMAL_FIELD_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * Comprueba la forma de una cadena de `FormData` SIN convertirla: el esquema la sigue validando
 * como cadena decimal, nunca como `number` -un decimal de cuatro cifras no cabe en el binario de
 * coma flotante sin arriesgar el redondeo-. Una cadena vacia es "campo omitido" (lo que el
 * esquema admite como `nullish`); una presente que no tiene forma de decimal es un error de ESE
 * campo, y se dice ahi -en vez de dejar que la action devuelva un unico mensaje generico para los
 * dos campos decimales-.
 */
function parseDecimalField(raw: string): string | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!DECIMAL_FIELD_PATTERN.test(trimmed)) return 'invalid';
  return trimmed;
}

/**
 * Campo de texto OPCIONAL del lote. Una cadena vacia -o de solo espacios- es "campo omitido", que
 * es lo que el esquema admite como `nullish`; el resto viaja **tal cual, sin convertir**.
 *
 * Los dos importes pasan por aqui y **siguen siendo cadena** (R4): un costo no toca el binario de
 * coma flotante en ningun punto del camino, y por eso su campo tampoco es `type="number"`.
 */
function readOptionalText(raw: string): string | undefined {
  return raw.trim() === '' ? undefined : raw;
}

/**
 * Copy de un rechazo. Los issues de forma -longitud, patron, uuid, entero- se dicen con el copy
 * de ESTE archivo, porque el de zod esta en ingles y describe el esquema. Los CRUZADOS del costo
 * llegan como `code: 'custom'` desde el esquema compartido, ya en castellano y ya colgados de su
 * campo (R8: el de «solo total sin existencia» cuelga de `stock`), asi que se muestran tal cual.
 *
 * La unica excepcion es R11 -no viene ningun costo-: el esquema cuelga ese issue de los DOS
 * campos de costo y aqui tiene copy propio, porque decir «basta con uno» es lo que resuelve el
 * problema. Se reconoce por que los dos costos venian vacios, no por el texto del issue.
 */
function fieldMessage(
  field: ProductFieldName,
  issue: { readonly code: string; readonly message: string },
  faltanLosDosCostos: boolean,
): string {
  if (issue.code !== 'custom') return FIELD_MESSAGES[field];
  if (faltanLosDosCostos && (field === 'unitCost' || field === 'totalCost')) {
    return COST_REQUIRED_MESSAGE;
  }
  return issue.message;
}

type ProductFormProps = {
  /** Producto que se edita. Ausente en el alta (R19). */
  readonly product?: ProductView;
  /**
   * Catalogo de unidades para el alta rapida de presentacion del selector (QC-80 R11). Baja por
   * props desde la pagina, que lo pide una sola vez (QC-44 R46); este formulario no consulta
   * nada. Sin el, el alta rapida no se ofrece y la presentacion se elige entre las existentes.
   */
  readonly units?: readonly UnitRef[];
  /**
   * Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar.
   *
   * El argumento es el lote que devolvio el servidor, para que el aviso pueda nombrarlo. La
   * edicion no conoce ningun lote y llama sin argumento: por eso es opcional.
   */
  readonly onSaved: (lot?: string) => void;
};

/**
 * Formulario de alta y edicion de producto (R18-R21, R23, `design.md > 5`).
 *
 * **Mismo patron que el login ya mergeado**: `<form action>` con campos NO controlados +
 * `useActionState`. **Sin ninguna libreria de formularios**: P2 quedo resuelta el 2026-09-03 en
 * que no entra ninguna dependencia nueva, asi que no se instalo la primitiva `form` de shadcn/ui
 * ni lo que arrastra. Tampoco hay peticiones a rutas de API propias ni estado local por campo.
 * (Los nombres de los dos paquetes descartados no se escriben aqui, para que una guardia de
 * fuente que los busque no encuentre un falso positivo.)
 *
 * **La validacion previa usa el MISMO esquema que valida el servidor**, importado del contrato
 * publico de `inventario`, que es client-safe: `createProductSchema` en el ALTA
 * -union discriminada por tipo, QC-90 R25 y el tipo de producto- y `updateProductSchema` en la
 * EDICION, que no conoce el lote (R26). Asi los mensajes por campo salen de la misma regla, sin
 * reescribir ninguna, y un rechazo cae en el MISMO campo en los dos lados: es lo que hace que R8
 * -«solo costo total con existencia 0»- se pinte en el campo de la EXISTENCIA sin una linea de
 * reparto propia, porque el esquema cuelga ese issue de `['stock']`. El servidor revalida igual;
 * el cliente nunca es la frontera.
 *
 * **R19 — la edicion es reemplazo completo**: el formulario precarga todos los valores actuales y
 * envia todos los campos, porque `updateProductSchema` es el mismo esquema del alta. No hay envio
 * por campos sueltos.
 *
 * **R20 — un rechazo no cierra el panel ni pierde lo escrito**: React 19 resetea los campos no
 * controlados de un `<form action>` al completarse la action, asi que el estado de fallo devuelve
 * los valores escritos y cada campo los recupera por `defaultValue` (mismo mecanismo que
 * `login-form.tsx`, incluida la `key` de montaje que evita el aviso de Base UI cuando el
 * `defaultValue` de un campo no controlado cambia despues de montarse).
 */
export function ProductForm({ product, units, onSaved }: ProductFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;

  /** Tipo de producto seleccionado. Parte del tipo del producto que se edita (o PRODUCT en alta). */
  const [productType, setProductType] = useState<ProductType>(product?.type ?? PRODUCT_TYPES.PRODUCT);

  /**
   * Autocompletado al elegir un producto existente (decision humana del 2026-09-09, ampliada el
   * 2026-09-10 con la presentacion): alerta de cantidad y presentacion. La existencia y los
   * costos los escribe el usuario -son los del lote que esta dando de alta, no los del producto
   * elegido-.
   *
   * **La presentacion llega vacia mientras el alta siga sin back**: `listProductsAction` devuelve
   * `ProductView`, que desde el 2026-09-09 ya no la lleva -se mudo al lote-. El hilo esta puesto
   * de punta a punta y el selector se rellena solo en cuanto la consulta traiga la presentacion
   * del ultimo lote; hasta entonces el campo queda en blanco y se elige a mano.
   */
  const [template, setTemplate] = useState<{
    readonly qtyAlert: string;
    readonly presentationId: string;
    readonly presentationName: string;
    readonly type: ProductType;
  } | null>(null);

  function applyTemplate(option: ProductNameOption) {
    setTemplate({
      qtyAlert: option.qtyAlert ?? '',
      presentationId: option.presentationId ?? '',
      presentationName: option.presentationName ?? '',
      type: option.type ?? PRODUCT_TYPES.PRODUCT,
    });
    setQtyAlertValue(option.qtyAlert ?? '');
  }

  async function save(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
    const values = readValues(formData);
    const fieldErrors: FieldErrors = {};

    const decimals: Partial<Record<(typeof DECIMAL_FIELDS)[number], string>> = {};
    for (const field of DECIMAL_FIELDS) {
      const parsed = parseDecimalField(values[field]);
      if (parsed === 'invalid') {
        fieldErrors[field] = FIELD_MESSAGES[field];
        continue;
      }
      if (parsed !== undefined) decimals[field] = parsed;
    }

    const isCreate = product === undefined;
    const unitCost = readOptionalText(values.unitCost);
    const totalCost = readOptionalText(values.totalCost);
    const type = (values.type || PRODUCT_TYPES.PRODUCT) as ProductType;
    const isMachine = type === PRODUCT_TYPES.MACHINE;
    const isPackaging = type === PRODUCT_TYPES.PACKAGING;

    /*
      EXACTAMENTE las claves del esquema, ni una mas (R24): los dos esquemas son `strictObject`,
      y en zod v4 una clave de sobra sale como un issue `unrecognized_keys` con `path: []` -la
      lista va en `issue.keys`-, o sea sin campo donde pintarse. Por eso los importes viajan
      aunque esten vacios, como `undefined`: `undefined` es "campo omitido" para un `nullish`,
      mientras que la clave de un campo inventado seria un rechazo mudo.

      Dos constructores y no uno con campos condicionales, porque son dos contratos distintos:
      el alta valida producto + primer lote (R25) y la edicion NO conoce el lote (R26).
      Ambos son uniones discriminadas por `type`: en el ALTA los tres tipos llevan lote -MACHINE
      sin qtyAlert, PACKAGING sin expiryDate-; en la EDICION MACHINE no lleva qtyAlert.
    */
    const parsed = isCreate
      ? createProductSchema.safeParse(
          isMachine
            ? {
                name: values.name,
                type: PRODUCT_TYPES.MACHINE,
                stock: decimals.stock,
                purchaseDate: readOptionalText(values.purchaseDate),
              }
            : {
                name: values.name,
                type,
                qtyAlert: decimals.qtyAlert,
                stock: decimals.stock,
                presentationId: values.presentationId,
                unitCost,
                totalCost,
                lot: readOptionalText(values.lot),
                // PACKAGING no acepta expiryDate; PRODUCT si.
                ...(isPackaging ? {} : { expiryDate: readOptionalText(values.expiryDate) }),
                purchaseDate: readOptionalText(values.purchaseDate),
              },
        )
      : updateProductSchema.safeParse(
          isMachine
            ? { name: values.name, type: PRODUCT_TYPES.MACHINE }
            : { name: values.name, type, ...decimals },
        );

    if (!parsed.success) {
      const faltanLosDosCostos = isCreate && unitCost === undefined && totalCost === undefined;

      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as ProductFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = fieldMessage(field, issue, faltanLosDosCostos);
        }
      }
    }

    // `!parsed.success` ademas del recuento: un rechazo cuyo issue no señale ningun campo de la
    // pantalla -el `unrecognized_keys` de arriba es el unico que hoy podria- no puede acabar
    // llamando a la operacion en silencio. Sin campo que marcar, se pinta en la region del
    // formulario, que es justo para lo que esta.
    if (!parsed.success || Object.keys(fieldErrors).length > 0) {
      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        serverError: { status: 'error', code: INVALID_INPUT_CODE, message: FORM_ERROR_MESSAGE },
        fieldErrors,
        values,
      };
    }

    // Dos ramas y no una con un `result` compartido: `createProductAction` y `updateProductAction`
    // devuelven estados de exito DISTINTOS -solo el del alta trae `lot`- y estrechar por
    // `isCreate` no estrecha el TIPO de un `result` ya unificado. Separar la rama es lo que deja
    // leer `result.lot` sin un `as`.
    if (isCreate) {
      const result = await createProductAction({ status: 'idle' }, formData);

      if (result.status === 'error') {
        // `invalid_input`, `product_not_found` y `unauthorized` NO identifican campo: van a la
        // region de error del formulario.
        //
        // El estado de la operacion se guarda ENTERO. Antes se copiaban `code` y `message` a
        // mano, y esa copia tiraba el `reference` del error inesperado por el camino.
        return { status: 'error', serverError: result, fieldErrors: {}, values };
      }

      // `status === 'idle'` no lo devuelve nunca la action en la practica, pero el tipo lo
      // incluye: sin lote que guardar, se trata igual que la edicion.
      return result.status === 'success' ? { status: 'success', lot: result.lot } : { status: 'success' };
    }

    const result = await updateProductAction(product.id, { status: 'idle' }, formData);

    if (result.status === 'error') {
      return { status: 'error', serverError: result, fieldErrors: {}, values };
    }

    return { status: 'success' };
  }

  const [state, formAction] = useActionState(save, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    onSaved(state.lot);
  }, [state, onSaved]);

  const fieldErrors = state.status === 'error' ? state.fieldErrors : {};
  const values = state.status === 'error' ? state.values : undefined;

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del producto que se edita. */
  const initialValue = (field: ProductFieldName, fromProduct: string): string =>
    values?.[field] ?? fromProduct;

  /**
   * La existencia y la alerta de cantidad son CONTROLADAS -y no `defaultValue` + `key`, como el
   * resto del formulario-, porque necesitan filtrar lo tecleado (coma a punto) mientras se
   * escribe, igual que los dos importes del lote (`ProductCostFields`). Un intento fallido no
   * pierde nada: el estado de React nunca se destruye entre reintentos, asi que lo escrito
   * sigue ahi sin necesidad de restaurarlo desde `values`.
   */
  const [stockValue, setStockValue] = useState(() => initialValue('stock', ''));
  const [qtyAlertValue, setQtyAlertValue] = useState(() =>
    initialValue('qtyAlert', template?.qtyAlert ?? product?.qtyAlert ?? ''),
  );

  // Todo error de campo tiene ya SU campo en pantalla: desde QC-52 el formulario no tiene
  // ningun campo oculto, asi que no hay rechazo que se quede sin sitio donde pintarse. La region
  // de error del formulario queda para los rechazos que NO senalan campo.
  //
  // Es el ERROR, no un booleano: asi el render puede estrechar por `code` y pedirle el
  // identificador al inesperado sin ningun `as`.
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;

  const isEdit = product !== undefined;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar puede vivir en el pie
      -donde R31 lo quiere, sin estirarse al ancho- y `useFormStatus()` lo sigue viendo, porque
      el formulario es su ancestro. Por eso este componente monta el panel y no solo los campos.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi: el primitivo trae `w-3/4`, que en un
      telefono deja el formulario en una columna incomoda. `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS. El desbordamiento vertical lo
      absorbe el CUERPO, no el panel: asi la cabecera y el pie no se van con el scroll.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="product-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': 'product-form' }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar producto' : 'Nuevo producto'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos del producto. Se guardan todos los campos.'
            : 'Completa los datos del producto.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {formError === undefined ? null : (
        // Region de error del formulario (R20): aqui van los rechazos que no senalan un campo.
        //
        // El error INESPERADO lo pinta el componente compartido, que anade el
        // identificador de la peticion. El error DEL CATALOGO se pinta exactamente como siempre
        // -mismos `data-testid`, mismo marcado- y sin identificador ninguno.
        <div
          role="alert"
          id={formErrorId}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="product-form-error"
        >
          {formError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={formError} />
          ) : (
            <>
              <p data-testid="product-form-error-message">{formError.message}</p>
              <p className="text-xs" data-testid="product-form-error-code">
                {formError.code}
              </p>
            </>
          )}
        </div>
      )}

      {/*
        En el ALTA el nombre es un autocomplete que busca productos existentes; al elegir uno se
        autocompletan presentacion y alerta (decision humana del 2026-09-09). En la EDICION el
        nombre sigue siendo un campo de texto plano: no hay otro producto del que copiar nada.
      */}
      {isEdit ? (
        <ProductField
          name="name"
          label={FIELD_LABELS.name}
          type="text"
          required
          defaultValue={initialValue('name', product?.name ?? '')}
          error={fieldErrors.name}
        />
      ) : (
        <ProductNamePicker
          defaultValue={initialValue('name', '')}
          error={fieldErrors.name}
          onSelect={applyTemplate}
        />
      )}

      {/*
        Tipo de producto. Un producto terminado no se elige a mano (R3): el select solo ofrece
        MANUAL_PRODUCT_TYPE_VALUES. Al editar uno, el tipo se muestra fijo y viaja en un campo
        oculto -sigue siendo FINISHED_PRODUCT-, en vez de un select que nunca podria ofrecerlo.

        Para el resto, el select determina que campos se muestran en el formulario. Por
        defecto: Producto. Instrumento oculta: alerta, presentacion, costos, lote y caducidad
        -solo quedan existencia y fecha de compra-. Envase oculta: fecha de expiracion.
      */}
      {isEdit && productType === PRODUCT_TYPES.FINISHED_PRODUCT ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-type`}>{FIELD_LABELS.type}</Label>
          <p
            id={`${fieldId}-type`}
            className="flex min-h-11 items-center rounded-md border px-3 text-base text-muted-foreground"
            data-testid="product-field-type-readonly"
          >
            {FINISHED_PRODUCT_LABEL}
          </p>
          <input
            type="hidden"
            name="type"
            value={PRODUCT_TYPES.FINISHED_PRODUCT}
            data-testid="product-hidden-type"
          />
        </div>
      ) : (
        <SharedSelect
          name="type"
          label={FIELD_LABELS.type}
          required
          defaultValue={initialValue('type', template?.type ?? product?.type ?? PRODUCT_TYPES.PRODUCT)}
          error={fieldErrors.type}
          options={TYPE_OPTIONS}
          onChange={(value) => setProductType(value as ProductType)}
        />
      )}

      {/*
        Presentacion (obligatoria en el alta, 2026-09-10). La presentacion es del LOTE, no del
        producto (2026-09-09), asi que solo se pide al dar de alta: en la EDICION el producto no
        tiene ninguna que cambiar. Se reusa el selector compartido -mismo control que proveedores,
        con su alta en linea-.

        `key`: el selector fija su valor inicial al montarse, asi que elegir un producto existente
        -o recuperar lo escrito tras un rechazo- lo remonta con el valor nuevo. El campo sigue sin
        estar controlado, igual que `ProductField`.
      */}
      {isEdit ? null : shouldShowField('presentationId', productType) && (
        <PresentationSelect
          key={`${initialValue('presentationId', '')}-${template?.presentationId ?? ''}`}
          defaultValue={initialValue('presentationId', template?.presentationId ?? '')}
          defaultLabel={template?.presentationName ?? ''}
          error={fieldErrors.presentationId}
          // QC-80 (R10, R11): crear una presentacion desde aqui tambien exige unidad. El catalogo
          // baja por props desde la pagina, que lo pide una sola vez; este formulario no consulta
          // nada. Sin catalogo, el alta rapida no se ofrece y solo se puede elegir una existente.
          units={units}
          helper="La presentación en la que llega este lote (bidón de 20 L, saco de 25 kg…). Si no está en la lista, créala aquí mismo sin salir del panel."
        />
      )}

      {isEdit ? null : shouldShowField('stock', productType) && (
        <ProductField
          name="stock"
          label={FIELD_LABELS.stock}
          type="text"
          inputMode="decimal"
          required
          helper="La existencia con la que entra este lote al inventario."
          value={stockValue}
          onChange={(event) => setStockValue(sanitizeQuantityInput(event.currentTarget.value))}
          error={fieldErrors.stock}
        />
      )}

      {/*
        AQUI IBA LA UNIDAD, y su ausencia es deliberada: la declara la PRESENTACION
        (`presentations.unit_id`, obligatoria), y `products.unit_id` -expuesto como
        `ProductView.unitId`- es un dato que se lee, nunca uno que este formulario envie. El
        alta, por tanto, no manda `unitId` -y si lo mandara, el esquema es `strictObject` y lo
        rechazaria con `invalid_input`-.
      */}

      {shouldShowField('qtyAlert', productType) && (
        <ProductField
          name="qtyAlert"
          label={FIELD_LABELS.qtyAlert}
          type="text"
          inputMode="decimal"
          required
          helper="Cantidad a partir de la cual quieres que se avise de que queda poco. Hoy solo se guarda: todavía no dispara ningún aviso."
          value={qtyAlertValue}
          onChange={(event) => setQtyAlertValue(sanitizeQuantityInput(event.currentTarget.value))}
          error={fieldErrors.qtyAlert}
        />
      )}

      {/*
        Resto del primer lote (2026-09-10). Solo en el ALTA, y todos opcionales salvo la regla del
        par de costos: tiene que venir el unitario O el total, y basta con uno.

        Los dos costos son `type="text"` con teclado decimal, NO `type="number"`: un importe no
        pasa por el binario de coma flotante -es la misma razon por la que el dominio lo mueve
        como cadena decimal-. Van juntos en `ProductCostFields` porque se rellenan el uno al otro
        con la existencia y filtran lo tecleado: son un par, no dos campos sueltos.
      */}
      {isEdit ? null : (
        <>
          {shouldShowField('unitCost', productType) && (
            <ProductCostFields
              unitCostLabel={FIELD_LABELS.unitCost}
              totalCostLabel={FIELD_LABELS.totalCost}
              initialUnitCost={initialValue('unitCost', '')}
              initialTotalCost={initialValue('totalCost', '')}
              unitCostError={fieldErrors.unitCost}
              totalCostError={fieldErrors.totalCost}
            />
          )}

          {shouldShowField('lot', productType) && (
            <ProductField
              name="lot"
              label={FIELD_LABELS.lot}
              type="text"
              helper="El identificador del lote que trae el proveedor, tal cual viene en el envase. Déjalo vacío para que el sistema lo asigne."
              defaultValue={initialValue('lot', '')}
              error={fieldErrors.lot}
            />
          )}

          {shouldShowField('expiryDate', productType) && (
            <ProductField
              name="expiryDate"
              label={FIELD_LABELS.expiryDate}
              type="date"
              helper="La fecha en la que este lote caduca. Opcional: hoy solo se guarda, todavía no dispara ningún aviso."
              defaultValue={initialValue('expiryDate', '')}
              error={fieldErrors.expiryDate}
            />
          )}

          {/*
            El componente ya cae en "hoy" si no recibe valor, pero aqui SIEMPRE se le pasa uno -el
            de un intento fallido, o el de hoy- para que la recuperacion tras un rechazo y el valor
            por defecto compartan la misma via. En los tres tipos es un campo del lote.
          */}
          {shouldShowField('purchaseDate', productType) && (
            <ProductBatchDateField
              initialValue={initialValue('purchaseDate', formatDateLocalISO(new Date()))}
              error={fieldErrors.purchaseDate}
            />
          )}
        </>
      )}

      </div>
    </SheetContent>
  );
}

/**
 * Acciones del pie: cancelar y guardar, en ese orden de lectura y alineadas a la derecha por el
 * pie del panel. **Cancelar es `type="button"`** -y no un submit- porque desde que el panel
 * entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria. Cierra por el
 * primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura.
 */
function FormActions() {
  return (
    <>
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            className={TOUCH_TARGET}
            data-testid="product-form-cancel"
          />
        }
      >
        Cancelar
      </SheetClose>
      <SaveButton />
    </>
  );
}

/**
 * Boton de envio. Archivo aparte no, componente aparte si, y por la misma necesidad tecnica que
 * en el login: `useFormStatus()` solo lee el estado del `<form>` ANCESTRO, asi que dentro del
 * componente que renderiza el `<form>` devolveria siempre `pending: false`.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending}
      aria-busy={pending}
      data-testid="product-form-submit"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
