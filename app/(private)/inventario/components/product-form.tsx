'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { createProductSchema, type ProductView } from '@/lib/modules/inventario';
import {
  createProductAction,
  updateProductAction,
} from '@/lib/modules/inventario/adapters/driving/product-actions';

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

/** Campos enteros. `FormData` solo entrega cadenas, asi que se convierten antes de validar. */
const INT_FIELDS = ['stock', 'qtyAlert'] as const;

type ProductFieldName = (typeof TEXT_FIELDS)[number] | (typeof INT_FIELDS)[number];

const ALL_FIELDS: readonly ProductFieldName[] = [
  ...TEXT_FIELDS,
  ...INT_FIELDS,
];

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: los mensajes de zod estan
 * en ingles y describen el esquema, no lo que el usuario tiene que hacer.
 */
const FIELD_MESSAGES: Record<ProductFieldName, string> = {
  name: 'Escribe un nombre de 1 a 120 caracteres.',
  stock: 'Debe ser un número entero de 0 o más.',
  qtyAlert: 'Debe ser un número entero de 0 o más.',
};

const FIELD_LABELS: Record<ProductFieldName, string> = {
  name: 'Nombre',
  stock: 'Existencia',
  qtyAlert: 'Alerta de cantidad',
};

type FieldErrors = Partial<Record<ProductFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R20 prohibe perderlo. */
type FieldValues = Record<ProductFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` -QC-20 explica por que no exporta ninguna constante inicial- y su estado
 * de error se recoge ENTERO.
 *
 * **QC-71 (R17): `serverError` guarda el `ErrorState` completo, no `code` y `message` sueltos.**
 * La copia campo a campo que habia aqui perdia el `reference` del error inesperado -el unico dato
 * con el que quien reporta el fallo puede decir cual buscar en los registros-. Y un
 * `reference?: string` en este tipo local reabriria el mismo agujero por el otro lado: un
 * opcional deja construir un inesperado SIN identificador. Asi que aqui vive la union cerrada tal
 * cual, y el estrechamiento por `code` sigue valiendo en el render.
 */
type ProductFormState =
  | { status: 'idle' }
  | { status: 'success' }
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
 * QC-71 (R16, R18): `satisfies` en vez de anotacion. Sigue comprobando que el codigo pertenece al
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

/**
 * Traduce una cadena de `FormData` al numero que espera el esquema. Una cadena vacia es "campo
 * omitido" (es lo que el esquema admite como `nullish`); una cadena presente que no es un entero
 * es un error de ESE campo, y se dice ahi -en vez de dejar que la action devuelva un unico
 * mensaje generico para los cuatro campos numericos-.
 */
function parseInteger(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'invalid';
  return Number(trimmed);
}

type ProductFormProps = {
  /** Producto que se edita. Ausente en el alta (R19). */
  readonly product?: ProductView;
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R21). */
  readonly onSaved: () => void;
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
 * **La validacion previa usa el MISMO esquema que valida el servidor** (`createProductSchema`,
 * importado del contrato publico de `inventario`, que es client-safe): asi los mensajes por campo
 * salen de la misma regla, sin reescribir ninguna. El servidor revalida igual; el cliente nunca
 * es la frontera.
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
export function ProductForm({ product, onSaved }: ProductFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;

  /**
   * Autocompletado al elegir un producto existente (decision humana del 2026-09-09): solo
   * alerta de cantidad. La existencia la escribe el usuario -es el inventario ACTUAL del
   * producto nuevo, no el del elegido-.
   */
  const [template, setTemplate] = useState<{
    readonly qtyAlert: string;
  } | null>(null);

  function applyTemplate(option: ProductNameOption) {
    setTemplate({
      qtyAlert: option.qtyAlert === null ? '' : String(option.qtyAlert),
    });
  }

  async function save(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
    const values = readValues(formData);
    const fieldErrors: FieldErrors = {};

    const numbers: Partial<Record<(typeof INT_FIELDS)[number], number>> = {};
    for (const field of INT_FIELDS) {
      const parsed = parseInteger(values[field]);
      if (parsed === 'invalid') {
        fieldErrors[field] = FIELD_MESSAGES[field];
        continue;
      }
      if (parsed !== undefined) numbers[field] = parsed;
    }

    // Costos: el costo de compra NO es un campo de inventario (R5, QC-52). Solo se registra en
    // los lotes, y la ficha que recoja lotes anadira el campo cuando toque.

    const candidate = {
      name: values.name,
      ...numbers,
    };

    const parsed = createProductSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as ProductFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        serverError: { status: 'error', code: INVALID_INPUT_CODE, message: FORM_ERROR_MESSAGE },
        fieldErrors,
        values,
      };
    }

    const result =
      product === undefined
        ? await createProductAction({ status: 'idle' }, formData)
        : await updateProductAction(product.id, { status: 'idle' }, formData);

    if (result.status === 'error') {
      // `invalid_input`, `product_not_found` y `unauthorized` NO identifican campo: van a la region de
      // error del formulario, que es lo que R20 pide para ese caso.
      //
      // QC-71 (R17): el estado de la operacion se guarda ENTERO. Antes se copiaban `code` y
      // `message` a mano, y esa copia tiraba el `reference` del error inesperado por el camino.
      return {
        status: 'error',
        serverError: result,
        fieldErrors: {},
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

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del producto que se edita. */
  const initialValue = (field: ProductFieldName, fromProduct: string): string =>
    values?.[field] ?? fromProduct;

  // Todo error de campo tiene ya SU campo en pantalla: desde QC-52 el formulario no tiene
  // ningun campo oculto, asi que no hay rechazo que se quede sin sitio donde pintarse. La region
  // de error del formulario queda para los rechazos que NO senalan campo.
  //
  // Es el ERROR, no un booleano: asi el render puede estrechar por `code` y pedirle el
  // identificador al inesperado sin ningun `as` (QC-71 R17, R18).
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
        // QC-71 (R17, R18): el error INESPERADO lo pinta el componente compartido, que anade el
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

      {/* La presentacion se mudo a `product_batches` (2026-09-09): el producto ya no la tiene;
        la lleva el LOTE. El alta no la pide: la ficha que cargue lotes la pedira ahi. */}

      <ProductField
        name="stock"
        label={FIELD_LABELS.stock}
        type="number"
        required
        helper="Las unidades que hay ahora mismo. Se guarda tal cual, sin recalcularse a partir de ningún movimiento."
        defaultValue={initialValue('stock', product?.stock?.toString() ?? '')}
        error={fieldErrors.stock}
      />

      {/*
        AQUI IBA LA UNIDAD, y su ausencia es deliberada (decision humana del 2026-09-03).

        R23 la pedia como TEXTO LIBRE porque eso era lo que la columna guardaba. El merge de QC-32
        (`modelo-unidades`) tumbo esa premisa mientras esta feature seguia en vuelo: `ProductView`
        ya no trae `unit: string | null` sino `unitId: UnitId | null`, una clave foranea al
        catalogo. Un campo de texto ya no vale, y un selector **no se puede construir hoy**: el
        contrato publico de `lib/modules/unidades` solo publica `normalizeUnitName` y los tipos,
        sin ninguna operacion para listar el catalogo.

        Asi que el producto se da de alta SIN unidad -`unitId` es nulable en el esquema, la base
        lo admite- y el selector lo montara la ficha que corresponda cuando QC-38
        (`crud-de-unidades`) exponga como listar unidades. Poner aqui un campo que escriba un UUID
        a mano seria peor que no tener campo.
      */}

      <ProductField
        name="qtyAlert"
        label={FIELD_LABELS.qtyAlert}
        type="number"
        required
        helper="Cantidad a partir de la cual quieres que se avise de que queda poco. Hoy solo se guarda: todavía no dispara ningún aviso."
        defaultValue={initialValue('qtyAlert', template?.qtyAlert ?? product?.qtyAlert?.toString() ?? '')}
        error={fieldErrors.qtyAlert}
      />

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
