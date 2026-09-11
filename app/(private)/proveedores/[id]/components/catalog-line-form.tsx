'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ErrorCode } from '@/lib/modules/errores';
import {
  createCatalogLineSchema,
  updateCatalogLineSchema,
  type CatalogLineView,
} from '@/lib/modules/proveedores';
import {
  createCatalogLineAction,
  updateCatalogLineAction,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import { NO_UNIT_VALUE, UNIT_FIELD, UnitSelect } from './unit-select';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md`, y R48 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/** Campo oculto con el proveedor al que pertenece la linea. Solo viaja en el ALTA (R31). */
export const SUPPLIER_FIELD = 'supplierId';

/**
 * Los campos de la linea que se capturan con un `<input>` de texto. La presentacion y la unidad
 * NO estan aqui: cada una tiene su propio selector (`PresentationSelect`, `UnitSelect`), que
 * aporta su valor al `FormData` por el `input` oculto del primitivo.
 *
 * **`imagePath` tampoco esta, y es una ausencia deliberada** (R30): la columna existe en la base
 * desde QC-52 y **nadie la llena** (`requirements.md > P1`). El formulario no la pide, no la
 * ofrece subir y **no la emite**; el adaptador driving ya trata su ausencia como ausencia.
 */
const TEXT_FIELDS = ['name', 'cost', 'minPurchase', 'deliveryTime'] as const;

type TextFieldName = (typeof TEXT_FIELDS)[number];

/** Todo lo que el formulario puede senalar como campo con error (R32). */
type CatalogFieldName = TextFieldName | typeof PRESENTATION_FIELD | typeof UNIT_FIELD;

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: los mensajes de zod estan
 * en ingles y describen el esquema, no lo que el usuario tiene que hacer. **La REGLA sigue siendo
 * la del esquema** -el patron decimal, el costo mayor que cero, el largo maximo del nombre y la
 * obligatoriedad de la presentacion son suyos-; aqui solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Record<CatalogFieldName, string> = {
  name: 'Escribe un nombre de 1 a 120 caracteres.',
  presentationId: 'Elige una presentación.',
  unitId: 'Elige una unidad de la lista o deja la línea sin unidad.',
  cost: 'Escribe un costo mayor que cero, con hasta 4 decimales.',
  minPurchase: 'Escribe un mínimo de compra de 0 o más, con hasta 4 decimales.',
  deliveryTime: 'Escribe el tiempo de entrega en días enteros.',
};

const FIELD_LABELS: Record<TextFieldName, string> = {
  name: 'Nombre',
  cost: 'Costo',
  minPurchase: 'Mínimo de compra',
  deliveryTime: 'Tiempo de entrega (días)',
};

type FieldErrors = Partial<Record<CatalogFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R32 prohibe perderlo. */
type FieldValues = Record<CatalogFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` -un archivo `'use server'` no puede exportar constantes, y las actions de
 * `proveedores` lo dejaron escrito- y su `code` y `message` se recogen tal cual.
 */
type CatalogLineFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** Codigo ESTABLE de la operacion, o `invalid_input` si el rechazo es de la validacion previa. */
      code: ErrorCode;
      message: string;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: CatalogLineFormState = { status: 'idle' };

/**
 * Codigos estables que este formulario distingue. Salen del catalogo cerrado de
 * `lib/modules/errores` (R20, R21): `satisfies ErrorCode` conserva el literal para comparar y a
 * la vez obliga a que exista alli, de modo que uno mal escrito no compila (R2).
 *
 * **Este archivo es el motivo por el que la apertura por caso hacia falta** (`design.md > 4.3`,
 * nota sobre el 3). Hasta QC-70 recibia UN solo `not_found` que significaba dos cosas -la linea
 * no existe (editar/borrar) o el PROVEEDOR no existe (alta)- y pintaba la misma frase para las
 * dos. Ahora son dos codigos con dos mensajes de catalogo, y el formulario trata **los dos**.
 */
const DUPLICATE_CATALOG_LINE_CODE = 'duplicate_catalog_line' satisfies ErrorCode;
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
/** La linea dejo de existir: solo puede llegar desde la edicion o el borrado. */
const CATALOG_LINE_NOT_FOUND_CODE = 'catalog_line_not_found' satisfies ErrorCode;
/** El proveedor dejo de existir: es el que llega al ALTA de una linea. */
const SUPPLIER_NOT_FOUND_CODE = 'supplier_not_found' satisfies ErrorCode;

// Texto de la validacion PROPIA del formulario. R31 lo deja intacto: el catalogo manda sobre lo
// que emite el back, no sobre lo que el formulario comprueba por su cuenta.
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';
const BACK_TO_LIST_LABEL = 'Volver a la lista de proveedores';

/**
 * Forma de `DECIMAL(14,4)` como atributo `pattern` del control: **es una ayuda del navegador, no
 * la regla**. Quien decide sigue siendo el esquema del contrato publico, que corre antes de
 * llamar a la operacion y otra vez en el servidor. Se escribe sin anclas porque el atributo
 * `pattern` ya las aplica.
 */
const DECIMAL_INPUT_PATTERN = '\\d{1,10}(\\.\\d{1,4})?';

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values = {} as FieldValues;
  for (const field of TEXT_FIELDS) {
    values[field] = readString(formData, field);
  }
  values[PRESENTATION_FIELD] = readString(formData, PRESENTATION_FIELD);
  values[UNIT_FIELD] = readString(formData, UNIT_FIELD);
  return values;
}

/** Un opcional vacio es AUSENCIA, igual que lo trata el adaptador driving. */
function blankToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

/**
 * `deliveryTime` es el UNICO campo numerico de la linea (`z.number().int()`), asi que hay que
 * convertirlo antes de medirlo con el esquema. Una cadena no entera se rechaza aqui en vez de
 * colarse como `NaN`, que `z.number().int()` trataria como numero valido.
 *
 * **`Number.parseInt` y no la funcion de conversion global**: este archivo tambien habla del
 * costo y del minimo de compra, y la guardia de R41 prohibe en el toda conversion numerica que
 * pudiera aplicarse a un importe. La distincion no es cosmetica: el entero se convierte porque el
 * contrato lo pide entero; los importes **nunca** se convierten (R41).
 */
function parseDeliveryTime(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  return Number.parseInt(trimmed, 10);
}

type CatalogLineFormProps = {
  /** Proveedor al que pertenece la linea. En la edicion **no se puede cambiar** (R31). */
  readonly supplierId: string;
  /** Linea que se edita. Ausente en el alta (R29). */
  readonly line?: CatalogLineView;
  /** Unidades existentes. Llegan por props desde el Server Component de la pagina (R46). */
  readonly units: readonly UnitRef[];
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R33). */
  readonly onSaved: () => void;
};

/**
 * Formulario de alta y edicion de una linea de catalogo (R26, R29-R33, R37, R38, R41, R45, R48;
 * `design.md > 7`, `> 8`, `> 9`).
 *
 * **Los siete campos de negocio, con la ausencia de la imagen declarada** (R29, R30): nombre,
 * presentacion **obligatoria**, unidad **opcional**, costo, minimo de compra y tiempo de entrega.
 * El septimo -la ruta de imagen- no se pide ni se emite, por decision humana del 2026-09-04.
 *
 * **NINGUN selector, campo ni referencia a un articulo del inventario** (R29). No es un olvido:
 * QC-52 borro esa columna del modelo y del contrato, asi que no existe donde guardarla. El
 * esquema del contrato publico es `strictObject`, de modo que colarla daria `invalid_input` en
 * vez de ignorarse en silencio.
 *
 * **Mismo patron no controlado ya mergeado** (`product-form.tsx`, `supplier-form.tsx`):
 * `<form action>` + `useActionState`, sin ninguna libreria de formularios (R45). La validacion
 * previa usa `createCatalogLineSchema` / `updateCatalogLineSchema` del contrato publico de
 * `proveedores`, que es client-safe: no se reescribe ninguna regla y el servidor revalida igual.
 *
 * **R31 - la edicion es reemplazo completo de los SIETE campos**: el formulario los precarga
 * todos y los envia todos, aunque solo se cambie uno, porque `updateCatalogLineSchema` los pide
 * todos. Y **no ofrece cambiar el proveedor**: `updateCatalogLineAction` ni siquiera lee
 * `supplierId` del formulario, asi que el campo oculto solo existe en el alta.
 *
 * **R41 - los importes viajan como cadena decimal**: `cost` y `minPurchase` se capturan con
 * `type="text"` e `inputMode="decimal"`, nunca con un control numerico del navegador, cuyo valor
 * pasa por el binario de coma flotante. Aqui no se convierte, no se redondea y no se opera con
 * ellos: se leen del `FormData` y se entregan tal cual.
 *
 * **R32 - un rechazo no cierra el panel ni pierde lo escrito**: React 19 resetea los campos no
 * controlados al completarse la action, asi que el estado de fallo devuelve los valores escritos
 * y cada campo -incluidos los dos selectores- los recupera por `defaultValue`.
 */
export function CatalogLineForm({ supplierId, line, units, onSaved }: CatalogLineFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;

  async function save(
    _previous: CatalogLineFormState,
    formData: FormData,
  ): Promise<CatalogLineFormState> {
    const values = readValues(formData);
    const fieldErrors: FieldErrors = {};

    const deliveryTime = parseDeliveryTime(values.deliveryTime);
    if (deliveryTime === 'invalid') {
      fieldErrors.deliveryTime = FIELD_MESSAGES.deliveryTime;
    }

    /*
      Los SIETE campos de negocio, en la forma que el esquema espera. `imagePath` se declara como
      ausente EN VEZ de omitirse: asi queda escrito que la decision es no emitirlo (R30) y no un
      campo que alguien olvido cablear.
    */
    const fields = {
      name: values.name,
      presentationId: values.presentationId,
      unitId: blankToUndefined(values.unitId),
      imagePath: undefined,
      cost: values.cost,
      minPurchase: blankToUndefined(values.minPurchase),
      deliveryTime: deliveryTime === 'invalid' ? undefined : deliveryTime,
    };

    // El alta lleva ademas el proveedor; la edicion NO puede llevarlo (R31), y no porque un `if`
    // lo filtre: `updateCatalogLineSchema` no tiene ese campo y es `strictObject`.
    const parsed =
      line === undefined
        ? createCatalogLineSchema.safeParse({ supplierId, ...fields })
        : updateCatalogLineSchema.safeParse(fields);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as CatalogFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        code: INVALID_INPUT_CODE,
        message: FORM_ERROR_MESSAGE,
        fieldErrors,
        values,
      };
    }

    /*
      `bind` y no un argumento de mas: `updateCatalogLineAction` tiene la firma
      `(id, prevState, formData)`, que no es la que `useActionState` espera. Aplicarle
      parcialmente el `id` es el patron estandar de React para eso, y evita tocar el adaptador
      driving de QC-43, que R49 prohibe abrir.
    */
    const result =
      line === undefined
        ? await createCatalogLineAction({ status: 'idle' }, formData)
        : await updateCatalogLineAction.bind(null, line.id)({ status: 'idle' }, formData);

    if (result.status === 'error') {
      return {
        status: 'error',
        code: result.code,
        message: result.message,
        /*
          La traduccion es por `code`, NUNCA por texto (R32, `design.md > 7`): el mensaje que
          devuelve la operacion se pinta, pero quien decide DONDE se pinta es el codigo estable.
          `duplicate_catalog_line` SI identifica campo -la pareja nombre + presentacion-, y se
          pinta junto al nombre. `invalid_input`, los dos «no existe» y `unauthorized` no senalan
          ninguno: van a la region de error del formulario.

          QC-70 (R32): la frase que se pinta es la DEL BACK, no un texto propio para ese mismo
          codigo. Antes habia aqui un `DUPLICATE_CATALOG_LINE_MESSAGE` local que tapaba la del
          catalogo.
        */
        fieldErrors: result.code === DUPLICATE_CATALOG_LINE_CODE ? { name: result.message } : {},
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

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el de la linea. */
  const initialValue = (field: CatalogFieldName, fromLine: string): string =>
    values?.[field] ?? fromLine;

  const showFormError = state.status === 'error' && Object.keys(fieldErrors).length === 0;
  /*
    Los DOS «no existe» dejan al panel sin nada que guardar, asi que los dos ofrecen la vuelta a
    la lista (R20, `design.md > 4.3` nota sobre el 3). Se comprueban por separado y no con un
    unico codigo generico **porque cada uno trae su propia frase del catalogo** -«La linea de
    catalogo solicitada no existe.» y «El proveedor solicitado no existe.»-, que es exactamente
    lo que la pantalla no podia distinguir antes de QC-70.
  */
  const isMissing =
    state.status === 'error' &&
    (state.code === CATALOG_LINE_NOT_FOUND_CODE || state.code === SUPPLIER_NOT_FOUND_CODE);
  const isEdit = line !== undefined;

  // `deliveryTime` es un entero en el contrato; se precarga como texto sin operar con el.
  const deliveryTimeFromLine = line?.deliveryTime === null ? '' : String(line?.deliveryTime ?? '');
  const unitFromLine = initialValue(UNIT_FIELD, line?.unitId ?? NO_UNIT_VALUE);

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar vive en el pie y
      `useFormStatus()` lo sigue viendo, porque el formulario es su ancestro.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi, y `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS (R48). El desbordamiento vertical lo
      absorbe el CUERPO, no el panel.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="catalog-line-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': 'catalog-line-form' }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar línea de catálogo' : 'Nueva línea de catálogo'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos de la línea. Se guardan todos los campos.'
            : 'Completa los datos de la línea. La presentación es obligatoria y la unidad es opcional.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/*
          El proveedor viaja en un campo oculto y SOLO en el alta (R31): la edicion no puede
          cambiarlo, y `updateCatalogLineAction` ni siquiera lo lee del formulario.
        */}
        {isEdit ? null : (
          <input
            type="hidden"
            name={SUPPLIER_FIELD}
            defaultValue={supplierId}
            data-testid="catalog-line-supplier-id"
          />
        )}

        {showFormError ? (
          // Region de error del formulario (R32): aqui van los rechazos que no senalan campo.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid="catalog-line-form-error"
          >
            <p data-testid="catalog-line-form-error-message">{state.message}</p>
            <p className="text-xs" data-testid="catalog-line-form-error-code">
              {state.code}
            </p>
            {isMissing ? (
              // `catalog_line_not_found` o `supplier_not_found`: la linea o el proveedor dejaron
              // de existir mientras el panel estaba abierto. Cual de las dos cosas paso lo dice
              // el mensaje del catalogo, arriba. El destino sale de la constante de ruta, nunca
              // de un literal (R2).
              <Link
                href={SUPPLIERS_ROUTE}
                className={`${TOUCH_TARGET} inline-flex items-center underline underline-offset-4`}
                data-testid="catalog-line-form-back-to-list"
              >
                {BACK_TO_LIST_LABEL}
              </Link>
            ) : null}
          </div>
        ) : null}

        <CatalogField
          name="name"
          label={FIELD_LABELS.name}
          required
          defaultValue={initialValue('name', line?.name ?? '')}
          error={fieldErrors.name}
        />

        {/*
          Presentacion OBLIGATORIA, con el selector promovido a `components/shared/` (R37, R38):
          alcanza cualquier presentacion existente con «Cargar más» y permite crear una sin salir
          del formulario, dejandola seleccionada y sin perder lo ya escrito.
        */}
        <PresentationSelect
          defaultValue={initialValue(PRESENTATION_FIELD, line?.presentationId ?? '') || undefined}
          error={fieldErrors.presentationId}
          // QC-80 (R10, R11): el alta rapida de presentacion tambien exige unidad. Se le pasa el
          // MISMO catalogo que ya baja por props hasta esta pantalla (R46), pedido una sola vez
          // por la pagina de detalle; el selector no consulta nada por su cuenta.
          units={units}
        />

        {/*
          Unidad OPCIONAL (R40). La `key` fuerza el remontaje cuando el valor a precargar cambia
          tras un intento fallido: el selector es no controlado y su valor inicial solo se lee al
          montarse.
        */}
        <UnitSelect
          key={`unit-${unitFromLine}`}
          units={units}
          defaultValue={unitFromLine}
          error={fieldErrors.unitId}
        />

        <CatalogField
          name="cost"
          label={FIELD_LABELS.cost}
          required
          // R41: cadena decimal de punta a punta. NUNCA `type="number"`.
          inputMode="decimal"
          pattern={DECIMAL_INPUT_PATTERN}
          defaultValue={initialValue('cost', line?.cost ?? '')}
          error={fieldErrors.cost}
        />

        <CatalogField
          name="minPurchase"
          label={FIELD_LABELS.minPurchase}
          inputMode="decimal"
          pattern={DECIMAL_INPUT_PATTERN}
          defaultValue={initialValue('minPurchase', line?.minPurchase ?? '')}
          error={fieldErrors.minPurchase}
        />

        {/*
          El tiempo de entrega SI es un entero en el contrato (`z.number().int()`), asi que aqui
          el control numerico del navegador es correcto: no hay importe que proteger.
        */}
        <CatalogField
          name="deliveryTime"
          label={FIELD_LABELS.deliveryTime}
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={initialValue('deliveryTime', deliveryTimeFromLine)}
          error={fieldErrors.deliveryTime}
        />
      </div>
    </SheetContent>
  );
}

type CatalogFieldProps = {
  /** Nombre del campo en el `FormData`. De el salen tambien los `data-testid`. */
  readonly name: TextFieldName;
  readonly label: string;
  readonly required?: boolean;
  readonly defaultValue: string;
  /** Mensaje de error del campo (R32). Se pinta en linea y marca el input como invalido. */
  readonly error?: string;
  /**
   * `text` salvo en el tiempo de entrega. **Los dos importes son siempre `text`** (R41): el valor
   * de un `type="number"` pasa por el binario de coma flotante.
   */
  readonly type?: 'number';
  readonly step?: string;
  readonly min?: string;
  readonly inputMode?: 'decimal' | 'numeric';
  /** Ayuda del navegador sobre la forma del valor. La REGLA sigue siendo la del esquema. */
  readonly pattern?: string;
};

/**
 * Un campo de texto de la linea: etiqueta, control y error en linea (R32, R41, R48).
 *
 * **Sin `maxLength`**: el largo maximo es del esquema (`CATALOG_LINE_NAME_MAX_LENGTH`) y quien lo
 * aplica es el, en el cliente y en el servidor. Un `maxLength` truncaria en silencio lo pegado en
 * vez de decir que sobra.
 *
 * **`key={defaultValue}`** por lo mismo que en `supplier-field.tsx`: Base UI avisa cuando el
 * `defaultValue` de un campo no controlado cambia despues de montarse, y la clave fuerza un
 * remontaje justo en ese salto. El campo sigue sin estar controlado.
 *
 * **Fuente de 16 px y alto de 44 px en todos los anchos** (R48): por debajo de 16 px Safari en
 * iOS hace zoom sobre el campo al enfocarlo.
 */
function CatalogField({
  name,
  label,
  required,
  defaultValue,
  error,
  type,
  step,
  min,
  inputMode,
  pattern,
}: CatalogFieldProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-${name}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>

      <Input
        key={defaultValue}
        id={inputId}
        name={name}
        type={type ?? 'text'}
        step={step}
        min={min}
        inputMode={inputMode}
        pattern={pattern}
        required={required}
        defaultValue={defaultValue}
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`catalog-field-${name}`}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`catalog-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Acciones del pie: cancelar y guardar. **Cancelar es `type="button"`** -y no un submit- porque
 * desde que el panel entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria.
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
            data-testid="catalog-line-form-cancel"
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
 * Boton de envio. Componente aparte por una necesidad tecnica: `useFormStatus()` solo lee el
 * estado del `<form>` ANCESTRO, asi que dentro del componente que renderiza el `<form>` devolveria
 * siempre `pending: false` y el boton no se deshabilitaria nunca.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending}
      aria-busy={pending}
      data-testid="catalog-line-form-submit"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
