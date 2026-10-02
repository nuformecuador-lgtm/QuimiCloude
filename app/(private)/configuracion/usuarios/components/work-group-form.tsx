'use client';

import { useActionState, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import {
  DataTable,
  createDefaultParams,
  type DataTableColumn,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
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
import { Skeleton } from '@/components/ui/skeleton';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import {
  WORK_GROUP_NAME_MAX_LENGTH,
  createWorkGroupSchema,
  normalizeWorkGroupName,
  renameWorkGroupSchema,
  type Page,
  type UserRow,
} from '@/lib/modules/identity';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';
import {
  addWorkGroupMemberAction,
  createWorkGroupAction,
  renameWorkGroupAction,
  type CreateWorkGroupFormState,
  type WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';

/**
 * El formulario del alta y del renombrado de un grupo de trabajo (R21, R22, R23, R24;
 * `design.md > 5.1` y `> 5.2`), y el selector de candidatos que los dos modos comparten.
 *
 * **Es quien posee el `<SheetContent>` ENTERO** -cabecera, cuerpo con scroll y pie fijo-, igual
 * que `UserForm` (`user-form.tsx`): monta `isForm` con `formProps={{ action: formAction, ... }}`
 * y `footer={<FormActions .../>}`, asi Guardar/Cancelar quedan FIJOS fuera del area que hace
 * scroll, igual que en todos los demas paneles del repo. `WORK_GROUP_SHEET_TESTID` vive AQUI por
 * la misma razon: es quien pinta el `data-testid` de ese `SheetContent`.
 *
 * **`children` lo pinta este archivo, pero lo decide `work-group-sheet.tsx`**: el panel pasa
 * `WorkGroupMembers` como hijo (solo en la edicion) para que el bloque de miembros reales quede
 * DENTRO del mismo cuerpo con scroll, sin que este archivo tenga que importar
 * `work-group-members.tsx` -eso crearia el ciclo que la nota de `WorkGroupMemberPicker` describe
 * mas abajo-.
 *
 * **UN SOLO CAMPO VIAJA A `createWorkGroupAction`/`renameWorkGroupAction`: el nombre** (R22). Ni
 * empresa, ni nombre normalizado, ni marca de baja, ni ninguna lista de miembros en ese `FormData`:
 * los dos esquemas del modulo son `strictObject`, asi que una clave de mas no se ignoraria
 * —fallaria con `invalid_input`—, y meter a alguien en un grupo **sigue siendo su propia
 * operacion, de a una**, con `addWorkGroupMemberAction`. Lo que este archivo anade es que, en el
 * ALTA, esa eleccion puede empezar ANTES de que el grupo exista: se guarda en estado local y se
 * manda, una llamada por persona, justo despues de que el grupo se cree (ver `submit`).
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
 *
 * **`WorkGroupMemberPicker` vive AQUI, no en `work-group-members.tsx`**, para que los dos modos lo
 * reutilicen sin crear un ciclo de imports: `work-group-members.tsx` ya importa `WORK_GROUP_ID_FIELD`
 * de aqui, asi que si este archivo necesitara algo de vuelta de alla, los dos se importarian
 * mutuamente. Es autosuficiente —trae su propio `DataTableParams` local y su propio termino de
 * busqueda— y, a diferencia del buscador antiguo, **consulta `listUsersAction` SIEMPRE**: con el
 * termino vacio trae la primera pagina de TODAS las personas, no solo cuando hay busqueda. Quien lo
 * monta decide que hacer con la persona elegida —anadirla de inmediato (`work-group-members.tsx`,
 * edicion) o guardarla en una lista pendiente (este archivo, alta)—; el picker solo entrega el
 * candidato ENTERO por `onAdd`, nunca solo su identificador, porque la lista de pendientes del alta
 * necesita el nombre mostrable y no hay a quien pedirselo despues.
 *
 * **La tabla, el buscador y la paginacion del picker son los de `components/shared/data-table`**
 * (QC-55), montados con `<DataTable>` por su barrel publico: no se declara una tabla propia, ni un
 * buscador propio, ni una barra de paginacion propia. **El cargando y el error de la consulta se
 * pintan FUERA de `<DataTable>`**, con el mismo `Skeleton`/region de error de siempre: su `status`
 * es SIEMPRE `'idle'` y solo se monta cuando la consulta ya resolvio en `'ready'`.
 */

/** Los nombres de `FormData` que leen las dos actions del nombre. Uno por campo, y son estos dos. */
export const WORK_GROUP_NAME_FIELD = 'name';
export const WORK_GROUP_ID_FIELD = 'workGroupId';

/** El segundo nombre de `FormData` de las dos operaciones de miembro. El primero lo declara este
 *  mismo archivo (`WORK_GROUP_ID_FIELD`): cada nombre publico sale de UN solo archivo. */
export const WORK_GROUP_MEMBER_ID_FIELD = 'userId';

/** `data-testid` del panel lateral. Lo declara este archivo, que es quien pinta el `SheetContent`. */
export const WORK_GROUP_SHEET_TESTID = 'work-group-sheet';

export const WORK_GROUP_FORM_TESTID = 'work-group-form';
export const WORK_GROUP_NAME_FIELD_TESTID = 'work-group-field-name';
export const WORK_GROUP_NAME_ERROR_TESTID = 'work-group-error-name';
export const WORK_GROUP_FORM_ERROR_TESTID = 'work-group-form-error';
export const WORK_GROUP_FORM_ERROR_CODE_TESTID = 'work-group-form-error-code';
export const WORK_GROUP_FORM_SUBMIT_TESTID = 'work-group-form-submit';
export const WORK_GROUP_FORM_CANCEL_TESTID = 'work-group-form-cancel';
export const WORK_GROUP_FORM_ID_TESTID = 'work-group-form-id';

export const WORK_GROUP_PENDING_MEMBER_TESTID = 'work-group-pending-member';
export const WORK_GROUP_PENDING_MEMBER_REMOVE_TESTID = 'work-group-pending-member-remove';

export const WORK_GROUP_CANDIDATES_LOADING_TESTID = 'work-group-candidates-loading';
export const WORK_GROUP_CANDIDATES_ERROR_TESTID = 'work-group-candidates-error';

/** Clave de persistencia del fijado de columnas del picker. Distinta de `WORK_GROUP_TABLE_ID`. */
export const WORK_GROUP_MEMBER_PICKER_TABLE_ID = 'grupo-candidatos';

/** Objetivo tactil minimo (44x44 px) y fuente >= 16 px en TODOS los anchos (R40). */
const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const CREATE_TITLE = 'Nuevo grupo';
const EDIT_TITLE = 'Editar grupo';
const CREATE_DESCRIPTION = 'Ponle nombre al grupo de trabajo.';
const EDIT_DESCRIPTION = 'Cambia el nombre del grupo y gestiona sus miembros.';

const NAME_LABEL = 'Nombre del grupo';
const SUBMIT_LABEL = 'Guardar';
const PENDING_SUBMIT_LABEL = 'Guardando…';
const CANCEL_LABEL = 'Cancelar';

const PENDING_MEMBERS_TITLE = 'Miembros iniciales';
const PENDING_MEMBER_REMOVE_LABEL = 'Quitar';

const PICKER_SEARCH_LABEL = 'Buscar personas para añadir';
const PICKER_ADD_LABEL = 'Agregar';
const PICKER_ADDED_LABEL = 'Agregado';
const PICKER_NAME_COLUMN_LABEL = 'Nombre';
const PICKER_ROLE_COLUMN_LABEL = 'Rol';
const PICKER_ACTIONS_COLUMN_LABEL = 'Acciones';
const PICKER_EMPTY_MESSAGE = 'No hay personas que coincidan con la búsqueda.';
const PICKER_LOADING_MESSAGE = 'Cargando personas…';
const PICKER_ERROR_MESSAGE = 'No se pudo cargar la lista de personas.';

/** Textos del componente compartido para el picker (plantilla: `WORK_GROUP_TABLE_TEXTS`). Ningun
 *  test afirma sobre estos literales (R41): los controles se localizan por rol o `data-testid`. */
const WORK_GROUP_MEMBER_PICKER_TEXTS: DataTableTexts = {
  empty: PICKER_EMPTY_MESSAGE,
  loading: PICKER_LOADING_MESSAGE,
  error: PICKER_ERROR_MESSAGE,
  search: PICKER_SEARCH_LABEL,
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Personas por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

/**
 * Que le pasa al nombre escrito. **Dos motivos, uno por comprobacion** (R21, R22): ningun test
 * afirma sobre el texto del aviso —se localiza por `data-testid` exportado, y se compara, si hace
 * falta, contra estas constantes exportadas (R41)—.
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

/** El aviso de que el grupo se creo pero no todos los miembros pendientes entraron. */
function pendingMembersFailureMessage(fallidas: number): string {
  return `Grupo creado, pero no se pudo añadir a ${fallidas} persona${fallidas === 1 ? '' : 's'}.`;
}

/**
 * Alta o renombrado, segun haya grupo o no (R23). El renombrado **no toca a los miembros**: manda
 * el identificador y el nombre, y el esquema del borde no admite ninguna lista.
 *
 * En el ALTA, `pendingMembers` son las personas elegidas en el picker ANTES de que el grupo
 * existiera. Se anaden DESPUES de crear el grupo, **de a una** —mismo esquema del borde que usa
 * `work-group-members.tsx` en la edicion—: el grupo YA se creo, asi que un fallo al anadir a
 * alguien no deshace esa creacion; solo se avisa, ademas del exito normal.
 */
async function submit(
  workGroupId: string | undefined,
  formData: FormData,
  pendingMembers: readonly UserRow[],
): Promise<{ status: 'success' } | ErrorState> {
  if (workGroupId === undefined) {
    const idle: CreateWorkGroupFormState = { status: 'idle' };
    const result = await createWorkGroupAction(idle, formData);
    if (result.status === 'error') return result;
    // La action nunca resuelve en `idle`: es solo el estado de PARTIDA de este mismo archivo
    // (R36). Esta rama es inalcanzable en la practica; TypeScript la exige para estrechar `id`.
    if (result.status === 'idle') return { status: 'success' };

    let fallidas = 0;
    for (const member of pendingMembers) {
      const memberData = new FormData();
      memberData.set(WORK_GROUP_ID_FIELD, result.id);
      memberData.set(WORK_GROUP_MEMBER_ID_FIELD, member.id);
      const idleMember: WorkGroupMutationFormState = { status: 'idle' };
      const memberResult = await addWorkGroupMemberAction(idleMember, memberData);
      if (memberResult.status === 'error') fallidas += 1;
    }

    if (fallidas > 0) toast.error(pendingMembersFailureMessage(fallidas));

    return { status: 'success' };
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
  /**
   * Lo que `work-group-sheet.tsx` pinta AL FINAL del cuerpo con scroll —`WorkGroupMembers`, solo en
   * la edicion—. Llega por `children` y no por un import directo: `work-group-members.tsx` ya
   * importa de este archivo, y lo contrario cerraria un ciclo (ver nota de `WorkGroupMemberPicker`
   * en la cabecera).
   */
  readonly children?: ReactNode;
};

export function WorkGroupForm({ group, onSaved, children }: WorkGroupFormProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-${WORK_GROUP_NAME_FIELD}`;
  const nameErrorId = `${nameId}-error`;
  const formErrorId = `${fieldId}-form-error`;

  const workGroupId = group?.id;
  const isEdit = workGroupId !== undefined;
  const [name, setName] = useState(group?.name ?? '');
  /** Hasta que no se escribe, no se rine: el campo del alta nace vacio a proposito. */
  const [touched, setTouched] = useState(false);
  /** SOLO tiene efecto en el alta: en la edicion no se pinta nada con este estado (ver mas abajo). */
  const [pendingMembers, setPendingMembers] = useState<readonly UserRow[]>([]);

  async function save(
    _previous: WorkGroupFormState,
    formData: FormData,
  ): Promise<WorkGroupFormState> {
    // R21, segunda barrera: aunque alguien fuerce el envio, la operacion NO se invoca con un
    // nombre que la pantalla ya sabe invalido.
    if (workGroupNameIssue(name, workGroupId) !== null) return { status: 'idle' };

    const result = await submit(workGroupId, formData, pendingMembers);
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
    <SheetContent
      side="right"
      minScreenWidth={70}
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid={WORK_GROUP_SHEET_TESTID}
      data-mode={isEdit ? 'edit' : 'create'}
      data-work-group-id={workGroupId ?? ''}
      isForm
      formProps={{ action: formAction, 'data-testid': WORK_GROUP_FORM_TESTID }}
      footer={<FormActions disabled={issue !== null} />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? EDIT_TITLE : CREATE_TITLE}</SheetTitle>
        <SheetDescription>{isEdit ? EDIT_DESCRIPTION : CREATE_DESCRIPTION}</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
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

        {/* SOLO en el alta: el grupo todavia no existe, asi que lo elegido aqui vive en estado
            local hasta que `submit` lo mande, de a una, tras la creacion. En la edicion este bloque
            no se pinta: la gestion de miembros reales es cosa de `work-group-sheet.tsx` ->
            `WorkGroupMembers`, que llega por `children`. */}
        {workGroupId === undefined ? (
          <div className="flex flex-col gap-4">
            <PendingMembersList
              members={pendingMembers}
              onRemove={(id) =>
                setPendingMembers((previous) => previous.filter((member) => member.id !== id))
              }
            />
            <WorkGroupMemberPicker
              busy={false}
              selectedIds={pendingMembers.map((member) => member.id)}
              onAdd={(candidate) =>
                setPendingMembers((previous) =>
                  previous.some((member) => member.id === candidate.id)
                    ? previous
                    : [...previous, candidate],
                )
              }
            />
          </div>
        ) : null}

        {children}
      </div>
    </SheetContent>
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

/**
 * Las personas elegidas en el alta ANTES de que el grupo exista (sin servidor: solo estado local
 * de este formulario). "Quitar" las saca del array; no hay paginacion porque es, como mucho, lo
 * que esta misma persona acaba de elegir en esta sesion.
 */
function PendingMembersList({
  members,
  onRemove,
}: {
  readonly members: readonly UserRow[];
  readonly onRemove: (id: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" aria-label={PENDING_MEMBERS_TITLE}>
      {members.map((member) => (
        <li
          key={member.id}
          className="flex flex-wrap items-center justify-between gap-2"
          data-testid={WORK_GROUP_PENDING_MEMBER_TESTID}
          data-user-id={member.id}
        >
          <span className="text-sm">{member.displayName}</span>
          <Button
            type="button"
            variant="outline"
            className={TOUCH_TARGET}
            aria-label={`${PENDING_MEMBER_REMOVE_LABEL}: ${member.displayName}`}
            data-testid={WORK_GROUP_PENDING_MEMBER_REMOVE_TESTID}
            onClick={() => onRemove(member.id)}
          >
            {PENDING_MEMBER_REMOVE_LABEL}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Los tres estados de la consulta de candidatos. Cada uno resuelto lleva la CLAVE —termino, pagina
 *  y tamano— a la que pertenece, mismo criterio que usa `work-group-members.tsx` para su lista. */
type CandidatesState =
  | { status: 'loading' }
  | { status: 'error'; key: string; error: ErrorState }
  | { status: 'ready'; key: string; data: Page<UserRow> };

export type WorkGroupMemberPickerProps = {
  readonly busy: boolean;
  /** Ids ya elegidos (miembros actuales en edicion, o pendientes en el alta): su fila se
   *  deshabilita y el boton dice "Agregado" en vez de "Agregar". */
  readonly selectedIds: readonly string[];
  /** Entrega el CANDIDATO ENTERO, no solo el id: el alta necesita `displayName` para su lista
   *  de pendientes antes de que el grupo exista (no hay a quien preguntarle el nombre despues). */
  readonly onAdd: (candidate: UserRow) => void;
};

/**
 * El buscador y la tabla paginada de personas, reutilizable por el alta y por la edicion (R28,
 * extendido: ya no hace falta escribir nada para que se vea). Trae su PROPIO `DataTableParams`
 * local: quien lo monta no gestiona nada de eso, solo decide que pasa cuando se elige a alguien.
 *
 * **Monta `<DataTable>` de `components/shared/data-table` por su barrel publico** (QC-55): la
 * tabla, el buscador con rebote y la paginacion son los compartidos por todo el repo, no una copia
 * de este archivo. **Cargando y error se pintan FUERA de `<DataTable>`**, con el mismo `Skeleton`/
 * region de error de siempre (R29): `status` es SIEMPRE `'idle'` y la tabla solo se monta cuando
 * la consulta ya resolvio en `'ready'`.
 *
 * **Consulta `listUsersAction` SIEMPRE**, con `search: params.search` —cadena vacia si no se ha
 * escrito nada—: con el termino vacio trae la primera pagina de TODAS las personas. `DataTable` ya
 * reboza su propio buscador (`SEARCH_DEBOUNCE_MS`) antes de llamar a `onParamsChange`, asi que este
 * archivo no reboza una segunda vez. Mismo patron de «la respuesta solo vale si es la de la clave
 * vigente» que usa el resto del modulo para que una respuesta tardia de otra pagina o de otro
 * termino no pinte lo que no toca.
 */
export function WorkGroupMemberPicker({ busy, selectedIds, onAdd }: WorkGroupMemberPickerProps) {
  const [params, setParams] = useState<DataTableParams>(() => createDefaultParams());
  const [candidates, setCandidates] = useState<CandidatesState>({ status: 'loading' });

  const { page, pageSize, search } = params;
  const key = `${search}#${page}#${pageSize}`;

  useEffect(() => {
    let cancelled = false;

    // La consulta de personas de QC-66, tal cual la publica el modulo (R28).
    void listUsersAction({ page, pageSize, sort: null, filters: {}, search }).then((result) => {
      if (cancelled) return;
      setCandidates(
        result.status === 'error'
          ? { status: 'error', key, error: result }
          : { status: 'ready', key, data: result.data },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, key]);

  // Lo que se pinta: la respuesta solo vale si es la de los parametros que se estan mirando.
  const shown: CandidatesState =
    candidates.status !== 'loading' && candidates.key === key ? candidates : { status: 'loading' };

  const columns = useMemo<readonly DataTableColumn<UserRow>[]>(
    () => [
      {
        id: 'displayName',
        label: PICKER_NAME_COLUMN_LABEL,
        align: 'start',
        cell: (candidate) => candidate.displayName,
      },
      {
        id: 'roleName',
        label: PICKER_ROLE_COLUMN_LABEL,
        align: 'start',
        cell: (candidate) => candidate.roleName,
      },
      {
        id: 'actions',
        label: PICKER_ACTIONS_COLUMN_LABEL,
        align: 'end',
        // Sin `sortable` (un boton no ordena nada); `pinnable: false` para que no tape las
        // columnas de datos, mismo patron que la columna de acciones de `work-group-columns.tsx`.
        pinnable: false,
        cell: (candidate) => {
          const added = selectedIds.includes(candidate.id);
          return (
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              disabled={busy || added}
              aria-label={`${added ? PICKER_ADDED_LABEL : PICKER_ADD_LABEL}: ${candidate.displayName}`}
              onClick={() => onAdd(candidate)}
            >
              {added ? PICKER_ADDED_LABEL : PICKER_ADD_LABEL}
            </Button>
          );
        },
      },
    ],
    [busy, selectedIds, onAdd],
  );

  return (
    <div className="flex flex-col gap-2">
      {shown.status === 'loading' ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={PICKER_LOADING_MESSAGE}
          data-testid={WORK_GROUP_CANDIDATES_LOADING_TESTID}
        >
          <Skeleton className="h-11 w-full" />
        </div>
      ) : shown.status === 'error' ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={WORK_GROUP_CANDIDATES_ERROR_TESTID}
          data-code={shown.error.code}
        >
          {shown.error.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={shown.error} />
          ) : (
            <p>{shown.error.message}</p>
          )}
        </div>
      ) : (
        <DataTable
          tableId={WORK_GROUP_MEMBER_PICKER_TABLE_ID}
          columns={columns}
          rows={shown.data.items}
          getRowId={(candidate) => candidate.id}
          params={params}
          totalPages={shown.data.totalPages}
          onParamsChange={setParams}
          status="idle"
          texts={WORK_GROUP_MEMBER_PICKER_TEXTS}
        />
      )}
    </div>
  );
}
