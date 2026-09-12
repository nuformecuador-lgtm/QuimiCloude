'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetClose } from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import {
  WORK_GROUP_NAME_MAX_LENGTH,
  createWorkGroupSchema,
  normalizeWorkGroupName,
  renameWorkGroupSchema,
} from '@/lib/modules/identity';
import {
  createWorkGroupAction,
  renameWorkGroupAction,
  type CreateWorkGroupFormState,
  type WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';

/**
 * El formulario del alta y del renombrado de un grupo de trabajo (R21, R22, R23, R24;
 * `design.md > 5.1` y `> 5.2`).
 *
 * **UN SOLO CAMPO, el nombre** (R22). Ni empresa, ni nombre normalizado, ni marca de baja, ni
 * ninguna lista de miembros: los dos esquemas del modulo son `strictObject`, asi que una clave de
 * mas no se ignoraria —fallaria con `invalid_input`—, y meter a alguien en un grupo es su propia
 * operacion, de a una (`work-group-members.tsx`).
 *
 * **DOS comprobaciones en vivo, las dos DERIVADAS DEL CONTRATO y ninguna escrita a mano**
 * (R21, R22):
 *
 *   1. **Forma** — `createWorkGroupSchema` / `renameWorkGroupSchema` con `safeParse` en cada
 *      pulsacion: recorte de espacios, no vacio y `WORK_GROUP_NAME_MAX_LENGTH`. El esquema no se
 *      copia ni se reescribe; se importa del contrato, que es dominio puro y por tanto importable
 *      desde cliente.
 *   2. **Contenido** — `normalizeWorkGroupName(name) !== ''`. Esa funcion es la UNICA definicion
 *      de «mismo nombre de grupo» (QC-83 R3) y quita todo lo que no sea alfanumerico: si su
 *      resultado es vacio, el nombre no tiene ni una letra ni un numero. **Aqui NO se escribe
 *      ninguna expresion propia de «letra o numero»**: seria una segunda definicion libre de
 *      divergir el dia que la normalizacion cambie, y R21 pide expresamente que se derive de ella.
 *
 * Mientras cualquiera de las dos falle, el aviso se pinta bajo el campo —`aria-invalid` y
 * `aria-describedby`— y **el envio no ocurre**: ni `createWorkGroupAction` ni
 * `renameWorkGroupAction` llegan a invocarse. Asi «!!!» y «¿¿¿», que normalizan los dos a vacio y
 * colisionarian en el indice unico de QC-83, dejan de ser alcanzables desde la pantalla. **El
 * backend no se toca**: su R12 sigue siendo la garantia real, porque otro cliente podria
 * intentarlo.
 *
 * **El error de FORMA se mira por la RUTA del issue**, no por el exito global del `safeParse`: en
 * el renombrado el esquema valida tambien `workGroupId`, que no lo escribe nadie —viene de la
 * fila— y que por tanto no puede convertirse en un aviso bajo el campo del nombre.
 *
 * **Las actions llegan por su RUTA EXACTA** (R36), jamas desde `@/lib/modules/identity`: un
 * `'use server'` en el cierre transitivo del contrato lo haria inimportable desde un componente de
 * cliente. Y el estado inicial `{ status: 'idle' }` **lo construye este archivo**, porque un
 * archivo `'use server'` no puede exportar constantes.
 *
 * **Donde se pinta un rechazo lo decide el `code`, nunca el texto** (R24):
 * `work_group_duplicate_name` va **en linea, junto al campo**; cualquier otro codigo va a la
 * region de error del formulario. En los dos casos el panel **sigue abierto** y **no se pierde lo
 * escrito**, porque el campo es controlado y su valor vive en este componente.
 */

/** Los nombres de `FormData` que leen las dos actions. Uno por campo, y son estos dos. */
export const WORK_GROUP_NAME_FIELD = 'name';
export const WORK_GROUP_ID_FIELD = 'workGroupId';

export const WORK_GROUP_FORM_TESTID = 'work-group-form';
export const WORK_GROUP_NAME_FIELD_TESTID = 'work-group-field-name';
export const WORK_GROUP_NAME_ERROR_TESTID = 'work-group-error-name';
export const WORK_GROUP_FORM_ERROR_TESTID = 'work-group-form-error';
export const WORK_GROUP_FORM_ERROR_CODE_TESTID = 'work-group-form-error-code';
export const WORK_GROUP_FORM_SUBMIT_TESTID = 'work-group-form-submit';
export const WORK_GROUP_FORM_CANCEL_TESTID = 'work-group-form-cancel';
export const WORK_GROUP_FORM_ID_TESTID = 'work-group-form-id';

/** Objetivo tactil minimo (44x44 px) y fuente >= 16 px en TODOS los anchos (R40). */
const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const NAME_LABEL = 'Nombre del grupo';
const SUBMIT_LABEL = 'Guardar';
const PENDING_SUBMIT_LABEL = 'Guardando…';
const CANCEL_LABEL = 'Cancelar';

/**
 * Que le pasa al nombre escrito. **Dos motivos, uno por comprobacion** (R21, R22): ningun test
 * afirma sobre el texto del aviso —se localiza por `data-testid` y se compara, si hace falta,
 * contra estas constantes exportadas (R41)—.
 */
export type WorkGroupNameIssue = 'shape' | 'no-alphanumeric';

export const WORK_GROUP_NAME_ISSUE_MESSAGES: Readonly<Record<WorkGroupNameIssue, string>> = {
  shape: `Escribe un nombre de entre 1 y ${WORK_GROUP_NAME_MAX_LENGTH} caracteres.`,
  'no-alphanumeric': 'El nombre debe tener al menos una letra o un número.',
};

/**
 * La validacion en vivo, **exportada** para que el panel y los tests la usen sin reimplementarla
 * (R21). `workGroupId` ausente es el alta; presente, el renombrado.
 *
 * Devuelve `null` cuando el nombre es enviable. Es la MISMA funcion que decide si el boton envia y
 * si el aviso se pinta: no hay dos criterios.
 */
export function workGroupNameIssue(name: string, workGroupId?: string): WorkGroupNameIssue | null {
  const parsed =
    workGroupId === undefined
      ? createWorkGroupSchema.safeParse({ [WORK_GROUP_NAME_FIELD]: name })
      : renameWorkGroupSchema.safeParse({
          [WORK_GROUP_ID_FIELD]: workGroupId,
          [WORK_GROUP_NAME_FIELD]: name,
        });

  if (
    !parsed.success &&
    parsed.error.issues.some((issue) => issue.path[0] === WORK_GROUP_NAME_FIELD)
  ) {
    return 'shape';
  }

  // La UNICA definicion de «mismo nombre de grupo», importada del contrato (R21).
  return normalizeWorkGroupName(name) === '' ? 'no-alphanumeric' : null;
}

/**
 * El estado del envio. El error se guarda **entero** —no aplanado a `string`—: asi el render
 * estrecha por `code` y el inesperado conserva su identificador de peticion (QC-71 R17).
 */
type WorkGroupFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; serverError: ErrorState };

/** R36: lo construye ESTA pantalla, porque un archivo `'use server'` no exporta constantes. */
const INITIAL_STATE: WorkGroupFormState = { status: 'idle' };

/**
 * Alta o renombrado, segun haya grupo o no (R23). El renombrado **no toca a los miembros**: manda
 * el identificador y el nombre, y el esquema del borde no admite ninguna lista.
 */
async function submit(
  workGroupId: string | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | ErrorState> {
  if (workGroupId === undefined) {
    const idle: CreateWorkGroupFormState = { status: 'idle' };
    const result = await createWorkGroupAction(idle, formData);
    // El `id` creado se IGNORA a proposito: no hay pagina de detalle a la que navegar, y meter
    // gente es abrir el panel otra vez sobre el grupo ya creado (`design.md > 5`).
    return result.status === 'error' ? result : { status: 'success' };
  }

  const idle: WorkGroupMutationFormState = { status: 'idle' };
  const result = await renameWorkGroupAction(idle, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

export type WorkGroupFormProps = {
  /**
   * El grupo que se renombra, o `null` en el alta. **La fila entera basta**: trae `{ id, name }` y
   * el formulario necesita `name`, asi que aqui NO hay una segunda lectura de ficha —QC-84 no
   * publica ninguna consulta de grupo individual y esta pantalla no la echa de menos—.
   */
  readonly group: { readonly id: string; readonly name: string } | null;
  /** Exito: cerrar, avisar y refrescar lo decide el panel (R35). */
  readonly onSaved: () => void;
};

export function WorkGroupForm({ group, onSaved }: WorkGroupFormProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-${WORK_GROUP_NAME_FIELD}`;
  const nameErrorId = `${nameId}-error`;
  const formErrorId = `${fieldId}-form-error`;

  const workGroupId = group?.id;
  const [name, setName] = useState(group?.name ?? '');
  /** Hasta que no se escribe, no se rine: el campo del alta nace vacio a proposito. */
  const [touched, setTouched] = useState(false);

  async function save(
    _previous: WorkGroupFormState,
    formData: FormData,
  ): Promise<WorkGroupFormState> {
    // R21, segunda barrera: aunque alguien fuerce el envio, la operacion NO se invoca con un
    // nombre que la pantalla ya sabe invalido.
    if (workGroupNameIssue(name, workGroupId) !== null) return { status: 'idle' };

    const result = await submit(workGroupId, formData);
    return result.status === 'error'
      ? { status: 'error', serverError: result }
      : { status: 'success' };
  }

  const [state, formAction] = useActionState(save, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    onSaved();
  }, [state, onSaved]);

  const issue = workGroupNameIssue(name, workGroupId);
  const serverError = state.status === 'error' ? state.serverError : undefined;

  // R24: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
  const duplicateName =
    serverError !== undefined && serverError.code === 'work_group_duplicate_name'
      ? serverError.message
      : undefined;
  const formError =
    serverError !== undefined && duplicateName === undefined ? serverError : undefined;

  const liveMessage = touched && issue !== null ? WORK_GROUP_NAME_ISSUE_MESSAGES[issue] : undefined;
  const nameMessage = liveMessage ?? duplicateName;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={WORK_GROUP_FORM_TESTID}>
      {/* El sujeto del renombrado viaja como campo OCULTO: nadie lo escribe (R23). */}
      {workGroupId === undefined ? null : (
        <input
          type="hidden"
          name={WORK_GROUP_ID_FIELD}
          value={workGroupId}
          readOnly
          data-testid={WORK_GROUP_FORM_ID_TESTID}
        />
      )}

      {formError === undefined ? null : (
        // Region de error del formulario (R24): aqui van los rechazos que no senalan al campo.
        <div
          role="alert"
          id={formErrorId}
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={WORK_GROUP_FORM_ERROR_TESTID}
          data-code={formError.code}
        >
          {formError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={formError} />
          ) : (
            <>
              <p>{formError.message}</p>
              <p className="text-xs" data-testid={WORK_GROUP_FORM_ERROR_CODE_TESTID}>
                {formError.code}
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>{NAME_LABEL}</Label>
        <Input
          id={nameId}
          name={WORK_GROUP_NAME_FIELD}
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          className={`min-h-11 ${FIELD_TEXT}`}
          aria-invalid={nameMessage === undefined ? undefined : true}
          aria-describedby={nameMessage === undefined ? undefined : nameErrorId}
          data-testid={WORK_GROUP_NAME_FIELD_TESTID}
        />
        {nameMessage === undefined ? null : (
          <p
            id={nameErrorId}
            role="alert"
            className="text-sm text-destructive"
            data-testid={WORK_GROUP_NAME_ERROR_TESTID}
            data-code={liveMessage === undefined && serverError !== undefined ? serverError.code : undefined}
            data-issue={liveMessage === undefined ? undefined : (issue ?? undefined)}
          >
            {nameMessage}
          </p>
        )}
      </div>

      <FormActions disabled={issue !== null} />
    </form>
  );
}

/** Las dos salidas del formulario, siempre visibles y siempre enfocables (R40). */
function FormActions({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            className={TOUCH_TARGET}
            data-testid={WORK_GROUP_FORM_CANCEL_TESTID}
          />
        }
      >
        {CANCEL_LABEL}
      </SheetClose>
      <Button
        type="submit"
        className={TOUCH_TARGET}
        disabled={disabled || pending}
        aria-busy={pending}
        data-testid={WORK_GROUP_FORM_SUBMIT_TESTID}
      >
        {pending ? PENDING_SUBMIT_LABEL : SUBMIT_LABEL}
      </Button>
    </div>
  );
}
