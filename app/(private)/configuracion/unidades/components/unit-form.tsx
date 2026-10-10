'use client';

import { useActionState, useEffect, useId } from 'react';

import { ErrorAlert } from '@/components/shared/error-alert';
import { FormSheet } from '@/components/shared/form-sheet';
import { SelectField } from '@/components/shared/select-field';
import { TextField } from '@/components/shared/text-field';
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
import type { UnitView } from '@/lib/modules/unidades';
import {
  createUnitAction,
  updateUnitAction,
} from '@/lib/modules/unidades/adapters/driving/unit-actions';

import { formatFactor, unitLabel } from './unit-equivalence';

/**
 * Formulario de alta y edicion de unidad (R33, R34, R35, R36, R37, R48; `design.md > 8`).
 *
 * **Mismo patron no controlado ya mergeado** en `presentation-form.tsx`, `order-form.tsx` y
 * `product-form.tsx`: `<form action>` + `useActionState`, con el literal `{ status: 'idle' }`
 * construido aqui —un archivo `'use server'` solo puede exportar funciones async, asi que
 * `unit-actions.ts` no puede publicar un `INITIAL_STATE`—. **Ninguna libreria nueva** (R45).
 *
 * **SIN prevalidacion en el cliente, al reves que la pantalla hermana** (`design.md > 8`,
 * alternativa D descartada): `createUnitSchema` y `updateUnitSchema` **no salen del barrel** de
 * `unidades`, y publicarlos ampliaria el contrato del modulo mas alla de lo que R3 acota. Valida
 * el servidor y esta pantalla pinta lo que devuelva. Coste asumido: un viaje al servidor para un
 * nombre vacio.
 *
 * **AUSENTE no es VACIO, y es el punto donde es mas facil equivocarse** (R34). Las actions leen el
 * `FormData` con `formData.has(clave)` y NO con el valor: un simbolo enviado como cadena vacia no
 * significa «sin simbolo», significa `invalid_input`; y un `baseUnitId` vacio rompe la pareja
 * `baseUnitId`+`factor` que el esquema exige junta o ausente. Por eso el envio se **limpia** antes
 * de invocar la operacion (`buildUnitFormData`): las claves que el usuario no declara no viajan.
 *
 * **La edicion es REEMPLAZO COMPLETO de los cuatro campos** (R35): se precargan los cuatro valores
 * actuales y se envian los cuatro. Con envio parcial no se distingue «no lo toques» de «borralo»,
 * y aqui hay dos campos que se pueden vaciar.
 *
 * **El selector de «deriva de» solo ofrece unidades BASE**, mas la opcion de no derivar de
 * ninguna, y nunca la propia unidad que se edita (R36). La pantalla **no valida** la derivacion:
 * la ofrece bien y deja que el error de dominio mande.
 *
 * **Los errores se reparten por `code` ESTABLE, jamas por el texto** (R37): `unit_duplicate_name`
 * junto al nombre, `duplicate_symbol` junto al simbolo, `invalid_derivation` junto al selector, y
 * todo lo demas —`invalid_input`, `unit_not_found`, `system_unit`, `unauthorized`— en la region
 * `role="alert"` del formulario. Un rechazo **no cierra el panel** y no pierde lo escrito.
 *
 * QC-70 (R17, R18, R21): los codigos que esta pantalla reparte salen del CATALOGO UNICO y su
 * mapa esta tipado con `ErrorCode`. Antes era `Record<string, ...>` con `duplicate_name` escrito
 * a mano, y ese es exactamente el fallo que no se ve: renombrado el codigo en el dominio, el mapa
 * dejaba de encontrarlo, el typecheck seguia verde y el mensaje se caia a la region generica.
 */

/** Los nombres del `FormData` que lee el adaptador driving (`unit-actions.ts`). */
export const UNIT_NAME_FIELD = 'name';
export const UNIT_SYMBOL_FIELD = 'symbol';
export const UNIT_BASE_FIELD = 'baseUnitId';
export const UNIT_FACTOR_FIELD = 'factor';

/** Fuente unica de los CUATRO campos que este formulario captura (R33). */
export const UNIT_BUSINESS_FIELDS = [
  UNIT_NAME_FIELD,
  UNIT_SYMBOL_FIELD,
  UNIT_BASE_FIELD,
  UNIT_FACTOR_FIELD,
] as const;

/**
 * Valor de la opcion «no deriva de ninguna»: cadena vacia. **No viaja nunca al servidor** —cuando
 * esta elegida, la clave `baseUnitId` no se envia (R34)—; es solo la forma de representar «sin
 * derivacion» dentro del selector, que necesita un valor para cada opcion.
 */
export const NO_BASE_UNIT_VALUE = '';

/** Etiqueta de la opcion «no deriva de ninguna». Constante: ningun test depende del copy (R49). */
export const NO_BASE_UNIT_LABEL = 'No deriva de ninguna';

/** `data-testid` del `SheetContent`, que lo pinta ESTE archivo, no `unit-sheet.tsx`. */
export const UNIT_SHEET_TESTID = 'unit-sheet';

export const UNIT_FORM_TESTID = 'unit-form';
export const UNIT_FORM_ERROR_TESTID = 'unit-form-error';
export const UNIT_FORM_ERROR_CODE_TESTID = 'unit-form-error-code';
export const UNIT_FORM_SUBMIT_TESTID = 'unit-form-submit';
export const UNIT_FORM_CANCEL_TESTID = 'unit-form-cancel';
export const UNIT_FIELD_NAME_TESTID = 'unit-field-name';
export const UNIT_FIELD_SYMBOL_TESTID = 'unit-field-symbol';
export const UNIT_FIELD_BASE_TESTID = 'unit-field-base';
export const UNIT_FIELD_FACTOR_TESTID = 'unit-field-factor';
export const UNIT_OPTION_NO_BASE_TESTID = 'unit-option-no-base';
export const UNIT_OPTION_BASE_TESTID = 'unit-option-base';
export const UNIT_ERROR_NAME_TESTID = 'unit-error-name';
export const UNIT_ERROR_SYMBOL_TESTID = 'unit-error-symbol';
export const UNIT_ERROR_BASE_TESTID = 'unit-error-base';

type UnitFieldName = (typeof UNIT_BUSINESS_FIELDS)[number];

const FIELD_LABELS: Readonly<Record<UnitFieldName, string>> = {
  name: 'Nombre',
  symbol: 'Símbolo',
  baseUnitId: 'Deriva de',
  factor: 'Factor',
};

/**
 * Donde se pinta cada `code` estable de `unidades/domain/errors.ts` (R37). Los que NO estan aqui
 * —`invalid_input`, `unit_not_found`, `system_unit`, `unauthorized`— van a la region `role="alert"`
 * del formulario. `unit_in_use` no puede llegar: solo lo emite el borrado, que vive en su dialogo.
 *
 * Las claves son del CATALOGO UNICO (QC-70 R21): el tipo es `ErrorCode`, asi que un codigo mal
 * escrito -o retirado del catalogo- rompe el typecheck aqui mismo en vez de caer callado al
 * mensaje por defecto. Mismo mapa y mismo tipo que `presentation-form.tsx`.
 */
const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, UnitFieldName>>> = {
  unit_duplicate_name: UNIT_NAME_FIELD,
  duplicate_symbol: UNIT_SYMBOL_FIELD,
  invalid_derivation: UNIT_BASE_FIELD,
};

type FieldErrors = Partial<Record<UnitFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R37 prohibe perderlo. */
type FieldValues = Partial<Record<UnitFieldName, string>>;

type UnitFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /**
       * El error de la operacion TAL CUAL. Su `code` es lo que decide DONDE se pinta el mensaje.
       *
       * **QC-71 (R17): entero, no copiado campo a campo.** La copia de `code` y `message` perdia
       * el `reference` del error inesperado; un `reference?: string` local reabriria el agujero
       * por el otro lado. Se guarda la union cerrada y el render estrecha por `code`.
       */
      serverError: ErrorState;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: UnitFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values: FieldValues = {};
  for (const field of UNIT_BUSINESS_FIELDS) values[field] = readString(formData, field);
  return values;
}

/**
 * El envio LIMPIO que recibe la operacion (R34, `design.md > 8`).
 *
 * - `name` viaja siempre y **tal cual**: recortarlo aqui seria una segunda copia de una regla que
 *   ya vive en el esquema del dominio.
 * - `symbol` viaja **solo si el usuario declaro alguno**. Un simbolo en blanco es «no declaro
 *   simbolo», no «simbolo vacio», que el esquema rechazaria.
 * - `baseUnitId` y `factor` viajan **juntos o ninguno**: la equivalencia es una pareja. Sin
 *   derivacion elegida no se envia ninguna de las dos claves, que es lo que significa «unidad
 *   base».
 * - Con derivacion elegida pero **factor en blanco**, la clave `factor` **tampoco se envia**. R34
 *   es tajante: en ninguna de las tres claves viaja jamas una cadena vacia. Enviar `''` no seria
 *   «sin factor»: el esquema del modulo lee las claves con `formData.has(clave)`, asi que la
 *   presencia de `factor` significa «hay factor» y su valor vacio es un valor INVALIDO. Se manda
 *   entonces la pareja incompleta —`baseUnitId` sin `factor`— y la rechaza el dominio con su
 *   codigo, que es justo lo que R36 pide: no validar por cuenta propia, ofrecerlo bien y dejar
 *   que el error de dominio mande.
 */
export function buildUnitFormData(raw: FormData): FormData {
  const clean = new FormData();
  clean.set(UNIT_NAME_FIELD, readString(raw, UNIT_NAME_FIELD));

  const symbol = readString(raw, UNIT_SYMBOL_FIELD).trim();
  if (symbol !== '') clean.set(UNIT_SYMBOL_FIELD, symbol);

  const baseUnitId = readString(raw, UNIT_BASE_FIELD).trim();
  if (baseUnitId !== NO_BASE_UNIT_VALUE) {
    clean.set(UNIT_BASE_FIELD, baseUnitId);

    const factor = readString(raw, UNIT_FACTOR_FIELD).trim();
    if (factor !== '') clean.set(UNIT_FACTOR_FIELD, factor);
  }

  return clean;
}

/**
 * Invoca la operacion que toca y normaliza su resultado. El alta devuelve ademas el id creado;
 * aqui no hace falta: lo unico que el formulario necesita saber es si fallo y con que codigo.
 *
 * **`bind` y no un argumento de mas**: `updateUnitAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera.
 */
async function submit(
  unitId: string | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | ErrorState> {
  if (unitId === undefined) {
    const result = await createUnitAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updateUnitAction.bind(null, unitId);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

export type UnitFormProps = {
  /** Unidad que se edita. Ausente en el alta (R32). */
  readonly unit?: UnitView;
  /** Unidades BASE del ambito visible, para el selector de «deriva de» (R36). */
  readonly baseUnits: readonly UnitView[];
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R38). */
  readonly onSaved: () => void;
};

export function UnitForm({ unit, baseUnits, onSaved }: UnitFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const baseLabelId = `${fieldId}-${UNIT_BASE_FIELD}-label`;
  const baseErrorId = `${fieldId}-${UNIT_BASE_FIELD}-error`;
  const isEdit = unit !== undefined;

  async function save(_previous: UnitFormState, formData: FormData): Promise<UnitFormState> {
    const values = readValues(formData);
    const result = await submit(unit?.id, buildUnitFormData(formData));

    if (result.status === 'error') {
      // R37: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
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
  /*
    Es el ERROR, no un booleano: asi el render estrecha por `code` y le pide el identificador al
    inesperado sin ningun `as` (QC-71 R17, R18).
  */
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;

  /**
   * Valores iniciales: lo escrito en el intento fallido; si no, los de la unidad que se edita
   * (R35). El factor se precarga **canonicalizado** —`Decimal(14,4)` devuelve `1000.0000`— para
   * que editar una unidad y guardarla sin tocar nada no reescriba el campo con ceros de relleno.
   */
  const initialName = values?.name ?? unit?.name ?? '';
  const initialSymbol = values?.symbol ?? unit?.symbol ?? '';
  const initialBase = values?.baseUnitId ?? unit?.baseUnitId ?? NO_BASE_UNIT_VALUE;
  const editedFactor = unit?.factor ?? null;
  const initialFactor = values?.factor ?? (editedFactor === null ? '' : formatFactor(editedFactor));

  /** R36: solo unidades BASE, y nunca la propia unidad que se edita. */
  const options = baseUnits.filter((candidate) => candidate.id !== unit?.id);

  return (
    <FormSheet
      title={isEdit ? 'Editar unidad' : 'Nueva unidad'}
      description={
        isEdit ? 'Cambia los datos de la unidad de medida.' : 'Describe la nueva unidad de medida.'
      }
      formAction={formAction}
      testIds={{
        sheet: UNIT_SHEET_TESTID,
        form: UNIT_FORM_TESTID,
        cancel: UNIT_FORM_CANCEL_TESTID,
        submit: UNIT_FORM_SUBMIT_TESTID,
      }}
    >
      {formError === undefined ? null : (
        <ErrorAlert
          error={formError}
          id={formErrorId}
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          testId={UNIT_FORM_ERROR_TESTID}
          renderCatalogued={(catalogued) => (
            <>
              <p>{catalogued.message}</p>
              <p className="text-xs" data-testid={UNIT_FORM_ERROR_CODE_TESTID}>
                {catalogued.code}
              </p>
            </>
          )}
        />
      )}

      <TextField
        id={`${fieldId}-${UNIT_NAME_FIELD}`}
        name={UNIT_NAME_FIELD}
        label={FIELD_LABELS.name}
        defaultValue={initialName}
        remountOnDefault
        required
        autoComplete="off"
        testId={UNIT_FIELD_NAME_TESTID}
        errorTestId={UNIT_ERROR_NAME_TESTID}
        error={fieldErrors.name}
      />

      <TextField
        id={`${fieldId}-${UNIT_SYMBOL_FIELD}`}
        name={UNIT_SYMBOL_FIELD}
        label={FIELD_LABELS.symbol}
        defaultValue={initialSymbol}
        remountOnDefault
        autoComplete="off"
        testId={UNIT_FIELD_SYMBOL_TESTID}
        errorTestId={UNIT_ERROR_SYMBOL_TESTID}
        error={fieldErrors.symbol}
      />

      <SelectField
        name={UNIT_BASE_FIELD}
        label={FIELD_LABELS.baseUnitId}
        noneOption={{
          label: NO_BASE_UNIT_LABEL,
          value: NO_BASE_UNIT_VALUE,
          testId: UNIT_OPTION_NO_BASE_TESTID,
        }}
        options={options.map((option) => ({ label: unitLabel(option), value: option.id }))}
        defaultValue={initialBase}
        remountOnDefault
        labelId={baseLabelId}
        errorId={baseErrorId}
        triggerTestId={UNIT_FIELD_BASE_TESTID}
        optionTestId={UNIT_OPTION_BASE_TESTID}
        error={fieldErrors.baseUnitId}
        errorTestId={UNIT_ERROR_BASE_TESTID}
      />

      {/*
        `inputMode="decimal"` y nunca `type="number"`: el `number` del navegador reintroduce coma
        flotante y separador decimal local en un factor que se maneja como texto exacto.
      */}
      <TextField
        id={`${fieldId}-${UNIT_FACTOR_FIELD}`}
        name={UNIT_FACTOR_FIELD}
        label={FIELD_LABELS.factor}
        defaultValue={initialFactor}
        remountOnDefault
        inputMode="decimal"
        autoComplete="off"
        testId={UNIT_FIELD_FACTOR_TESTID}
      />
    </FormSheet>
  );
}
