'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { ErrorAlert } from '@/components/shared/error-alert';
import { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
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
import { trimDecimal } from '@/lib/shared/ui/decimal-display';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { NO_UNIT_VALUE, UNIT_FIELD, UnitSelect } from './unit-select';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md`, y R48 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/** Campo oculto con el proveedor al que pertenece la linea. Solo viaja en el ALTA (R31). */
export const SUPPLIER_FIELD = 'supplierId';

/**
 * Campo oculto con la ruta de la imagen ya asignada a la linea. El formulario no ofrece subir ni
 * quitar una imagen: solo conserva la que ya tenia, precargada en la edicion y vacia en el alta.
 */
export const IMAGE_PATH_FIELD = 'imagePath';

/**
 * Los campos de la linea que se capturan con un `<input>` de texto. La presentacion, la unidad y
 * las unidades de cada medida NO estan aqui: cada una tiene su propio selector
 * (`PresentationSelect`, `UnitSelect`, `MeasurementUnitSelect`), que aporta su valor al
 * `FormData` por el `input` oculto del primitivo.
 */
const TEXT_FIELDS = [
  'name',
  'cost',
  'minPurchase',
  'deliveryTime',
  'material',
  'diameterValue',
  'heightValue',
  'mouth',
] as const;

type TextFieldName = (typeof TEXT_FIELDS)[number];

/** Selectores de unidad de cada medida: valores cerrados `mm`/`cm`, sin conversion. */
const MEASUREMENT_UNIT_FIELDS = ['diameterUnit', 'heightUnit'] as const;

type MeasurementUnitFieldName = (typeof MEASUREMENT_UNIT_FIELDS)[number];

/** Todo lo que el formulario puede senalar como campo con error (R32). */
type CatalogFieldName =
  | TextFieldName
  | typeof PRESENTATION_FIELD
  | typeof UNIT_FIELD
  | MeasurementUnitFieldName;

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
  material: 'Escribe hasta 120 caracteres, o déjalo vacío.',
  diameterValue: 'Escribe un valor mayor que cero, con hasta 4 decimales.',
  diameterUnit: 'Elige mm o cm.',
  heightValue: 'Escribe un valor mayor que cero, con hasta 4 decimales.',
  heightUnit: 'Elige mm o cm.',
  mouth: 'Escribe hasta 40 caracteres, o déjalo vacío.',
};

const FIELD_LABELS: Record<TextFieldName, string> = {
  name: 'Nombre',
  cost: 'Costo',
  minPurchase: 'Mínimo de compra',
  deliveryTime: 'Tiempo de entrega (días)',
  material: 'Material',
  diameterValue: 'Diámetro',
  heightValue: 'Alto',
  mouth: 'Boca',
};

type FieldErrors = Partial<Record<CatalogFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R32 prohibe perderlo. */
type FieldValues = Record<CatalogFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` -un archivo `'use server'` no puede exportar constantes, y las actions de
 * `proveedores` lo dejaron escrito- y su estado de error se recoge ENTERO.
 */
type CatalogLineFormState =
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

/** Unidad preseleccionada de una medida sin valor precargado. Ninguna medida es obligatoria. */
const DEFAULT_MEASUREMENT_UNIT = 'cm';

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
  for (const field of MEASUREMENT_UNIT_FIELDS) {
    values[field] = readString(formData, field);
  }
  return values;
}

/**
 * Localiza, para un problema de validacion, el campo del formulario que lo senala. Los de
 * `measurements` viajan anidados en el esquema (`measurements.diameter.value`, etc.); el resto
 * son directos.
 */
function resolveFieldFromIssuePath(path: readonly PropertyKey[]): CatalogFieldName | undefined {
  const [first, second, third] = path;
  if (first === 'measurements') {
    if (second === 'diameter') return third === 'unit' ? 'diameterUnit' : 'diameterValue';
    if (second === 'height') return third === 'unit' ? 'heightUnit' : 'heightValue';
    if (second === 'mouth') return 'mouth';
    return undefined;
  }
  const field = String(first ?? '');
  return field in FIELD_MESSAGES ? (field as CatalogFieldName) : undefined;
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
 * **Los campos de negocio**: nombre, presentacion **obligatoria**, unidad **opcional**, costo,
 * minimo de compra, tiempo de entrega, material y medidas (diametro, alto y boca). La imagen
 * viaja en un campo oculto que solo conserva la ya asignada -el formulario no ofrece subirla,
 * quitarla ni cambiarla-.
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
 * **La edicion es reemplazo completo de los campos de negocio**: el formulario los precarga
 * todos y los envia todos, aunque solo se cambie uno, porque `updateCatalogLineSchema` los pide
 * todos. Y **no ofrece cambiar el proveedor**: `updateCatalogLineAction` ni siquiera lee
 * `supplierId` del formulario, asi que el campo oculto solo existe en el alta.
 *
 * **R41 - los importes viajan como cadena decimal**: `cost` y `minPurchase` se capturan con
 * `type="text"` e `inputMode="decimal"`, nunca con un control numerico del navegador, cuyo valor
 * pasa por el binario de coma flotante. Aqui no se convierte, no se redondea y no se opera con
 * ellos: se leen del `FormData` y se entregan tal cual.
 *
 * La PRECARGA de la edicion les quita los ceros de relleno desde el 2026-09-17 (`trimDecimal`):
 * «12.5000» se precarga «12.5». Recortar ceros NO cambia el numero -y por eso es seguro sobre un
 * campo cuyo valor se vuelve a guardar-, mientras que redondear si lo cambiaria: un costo de
 * 0.1255 reabierto y guardado se convertiria en 0.13 sin que nadie lo pidiera, y la columna
 * admite cuatro decimales justamente porque alguien los usa. Por eso la tabla redondea a dos y
 * este formulario no: son dos trabajos distintos.
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

    const diameterValue = values.diameterValue.trim();
    const heightValue = values.heightValue.trim();

    /*
      Los campos de negocio, en la forma que el esquema espera. `imagePath` viaja tal cual lo
      trajo el campo oculto: el formulario no ofrece cambiarlo, solo conservarlo.
    */
    const fields = {
      name: values.name,
      presentationId: values.presentationId,
      unitId: blankToUndefined(values.unitId),
      imagePath: blankToUndefined(readString(formData, IMAGE_PATH_FIELD)),
      cost: values.cost,
      minPurchase: blankToUndefined(values.minPurchase),
      deliveryTime: deliveryTime === 'invalid' ? undefined : deliveryTime,
      material: blankToUndefined(values.material),
      measurements: {
        diameter: diameterValue === '' ? null : { value: diameterValue, unit: values.diameterUnit },
        height: heightValue === '' ? null : { value: heightValue, unit: values.heightUnit },
        mouth: blankToUndefined(values.mouth) ?? null,
      },
    };

    // El alta lleva ademas el proveedor; la edicion NO puede llevarlo (R31), y no porque un `if`
    // lo filtre: `updateCatalogLineSchema` no tiene ese campo y es `strictObject`.
    const parsed =
      line === undefined
        ? createCatalogLineSchema.safeParse({ supplierId, ...fields })
        : updateCatalogLineSchema.safeParse(fields);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = resolveFieldFromIssuePath(issue.path);
        if (field !== undefined && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        serverError: { status: 'error', code: INVALID_INPUT_CODE, message: FORM_ERROR_MESSAGE },
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
        serverError: result,
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

  /*
    Es el ERROR, no un booleano: asi el render estrecha por `code` y le pide el identificador al
    inesperado sin ningun `as` (QC-71 R17, R18).
  */
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;
  /*
    Los DOS «no existe» dejan al panel sin nada que guardar, asi que los dos ofrecen la vuelta a
    la lista (R20, `design.md > 4.3` nota sobre el 3). Se comprueban por separado y no con un
    unico codigo generico **porque cada uno trae su propia frase del catalogo** -«La linea de
    catalogo solicitada no existe.» y «El proveedor solicitado no existe.»-, que es exactamente
    lo que la pantalla no podia distinguir antes de QC-70.
  */
  const isMissing =
    state.status === 'error' &&
    (state.serverError.code === CATALOG_LINE_NOT_FOUND_CODE ||
      state.serverError.code === SUPPLIER_NOT_FOUND_CODE);
  const isEdit = line !== undefined;

  // `deliveryTime` es un entero en el contrato; se precarga como texto sin operar con el.
  const deliveryTimeFromLine = line?.deliveryTime === null ? '' : String(line?.deliveryTime ?? '');
  const unitFromLine = initialValue(UNIT_FIELD, line?.unitId ?? NO_UNIT_VALUE);

  // Material y medidas: ausentes en el alta, precargados en la edicion.
  const measurements = line?.measurements ?? null;
  const diameterUnitFromLine = initialValue(
    'diameterUnit',
    measurements?.diameter?.unit ?? DEFAULT_MEASUREMENT_UNIT,
  );
  const heightUnitFromLine = initialValue(
    'heightUnit',
    measurements?.height?.unit ?? DEFAULT_MEASUREMENT_UNIT,
  );

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

        {/*
          La imagen viaja oculta y con el valor de la linea: el formulario no ofrece subirla ni
          quitarla, asi que enviarla vacia -o distinta de la que ya tenia- solo puede pasar aqui
          si alguien reemplaza este campo por su cuenta.
        */}
        <input
          type="hidden"
          name={IMAGE_PATH_FIELD}
          defaultValue={line?.imagePath ?? ''}
          data-testid="catalog-line-image-path"
        />

        {formError === undefined ? null : (
          // Region de error del formulario: aqui van los rechazos que no senalan campo.
          <ErrorAlert
            error={formError}
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            testId="catalog-line-form-error"
            renderCatalogued={(catalogued) => (
              <>
                <p data-testid="catalog-line-form-error-message">{catalogued.message}</p>
                <p className="text-xs" data-testid="catalog-line-form-error-code">
                  {catalogued.code}
                </p>
              </>
            )}
            after={
              isMissing ? (
                // La linea o el proveedor dejaron de existir mientras el panel estaba abierto;
                // cual de las dos lo dice el mensaje de arriba.
                <Link
                  href={SUPPLIERS_ROUTE}
                  className={`${touchTarget} inline-flex items-center underline underline-offset-4`}
                  data-testid="catalog-line-form-back-to-list"
                >
                  {BACK_TO_LIST_LABEL}
                </Link>
              ) : null
            }
          />
        )}

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
          defaultValue={initialValue('cost', trimDecimal(line?.cost ?? ''))}
          error={fieldErrors.cost}
        />

        <CatalogField
          name="minPurchase"
          label={FIELD_LABELS.minPurchase}
          inputMode="decimal"
          pattern={DECIMAL_INPUT_PATTERN}
          defaultValue={initialValue('minPurchase', trimDecimal(line?.minPurchase ?? ''))}
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

        <CatalogField
          name="material"
          label={FIELD_LABELS.material}
          defaultValue={initialValue('material', line?.material ?? '')}
          error={fieldErrors.material}
        />

        {/*
          Medidas: diametro y alto llevan su propio valor y su propia unidad (mm o cm), sin
          convertir. La boca es texto libre -un acabado de rosca no es una longitud-.
        */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <CatalogField
              name="diameterValue"
              label={FIELD_LABELS.diameterValue}
              inputMode="decimal"
              pattern={DECIMAL_INPUT_PATTERN}
              defaultValue={initialValue('diameterValue', measurements?.diameter?.value ?? '')}
              error={fieldErrors.diameterValue}
            />
            <MeasurementUnitSelect
              key={`diameterUnit-${diameterUnitFromLine}`}
              name="diameterUnit"
              label="Unidad de diámetro"
              defaultValue={diameterUnitFromLine}
              error={fieldErrors.diameterUnit}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <CatalogField
              name="heightValue"
              label={FIELD_LABELS.heightValue}
              inputMode="decimal"
              pattern={DECIMAL_INPUT_PATTERN}
              defaultValue={initialValue('heightValue', measurements?.height?.value ?? '')}
              error={fieldErrors.heightValue}
            />
            <MeasurementUnitSelect
              key={`heightUnit-${heightUnitFromLine}`}
              name="heightUnit"
              label="Unidad de alto"
              defaultValue={heightUnitFromLine}
              error={fieldErrors.heightUnit}
            />
          </div>

          <CatalogField
            name="mouth"
            label={FIELD_LABELS.mouth}
            defaultValue={initialValue('mouth', measurements?.mouth ?? '')}
            error={fieldErrors.mouth}
          />
        </div>
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
        className={`${touchTarget} ${FIELD_TEXT}`}
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

/** Las dos unidades de medida que la linea acepta, sin conversion entre ellas. */
const MEASUREMENT_UNIT_OPTIONS = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
] as const;

type MeasurementUnitSelectProps = {
  readonly name: MeasurementUnitFieldName;
  readonly label: string;
  readonly defaultValue: string;
  readonly error?: string;
};

/**
 * Unidad de una medida (diametro o alto): lista cerrada de dos opciones, sin texto libre y sin
 * ofrecer ninguna conversion entre ellas.
 */
function MeasurementUnitSelect({ name, label, defaultValue, error }: MeasurementUnitSelectProps) {
  const labelId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <Select name={name} defaultValue={defaultValue} items={MEASUREMENT_UNIT_OPTIONS}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${touchTarget} ${FIELD_TEXT}`}
          data-testid={`catalog-field-${name}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEASUREMENT_UNIT_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-testid={`catalog-option-${name}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            className={touchTarget}
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
      touch
      disabled={pending}
      aria-busy={pending}
      data-testid="catalog-line-form-submit"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
