'use client';

import { LogOutIcon } from 'lucide-react';
import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
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
import {
  errorMessage,
  UNEXPECTED_ERROR_CODE,
  type ErrorCode,
  type ErrorState,
} from '@/lib/modules/errores';
import { DOCUMENT_TYPE_CODES, type RoleOption, type UserDetail } from '@/lib/modules/identity';
import {
  createUserAction,
  updateUserAction,
} from '@/lib/modules/identity/adapters/driving/user-actions';

import { endUserSessionsLabel, toDateInputValue } from './user-labels';

/**
 * El formulario del alta y de la edicion de usuario (R23, R24, R25, R26, R27, R35, R36;
 * `design.md > 8`).
 *
 * **Los NUEVE campos de negocio y ninguno mas** (R23). `USER_BUSINESS_FIELDS` es la lista, y es lo
 * que los tests afirman: ningun caso escribe los nombres a mano (R41). Ni empresa, ni contrasena,
 * ni estado de cuenta, ni marca de cambio de credencial, ni contadores de acceso (R35): el
 * esquema del modulo es `strictObject`, asi que una clave de mas no se ignoraria, fallaria con
 * `invalid_input`.
 *
 * **Los campos viajan TAL CUAL**, sin `trim` ni `toLowerCase` aqui: `createUserSchema` ya
 * normaliza, y repetirlo en el borde seria una segunda copia de una regla de negocio. Los nueve
 * son obligatorios, asi que —a diferencia de unidades— no existe el problema de «ausente vs
 * vacio» y el `FormData` del `<form>` se envia directo, sin reconstruirlo.
 *
 * **Las actions llegan por su RUTA EXACTA** (R36), jamas desde `@/lib/modules/identity`: un
 * `'use server'` en el cierre transitivo del contrato lo haria inimportable desde un componente de
 * cliente. Y el estado inicial `{ status: 'idle' }` **se construye aqui**, porque un archivo
 * `'use server'` no puede exportar constantes.
 *
 * **Donde se pinta un rechazo lo decide el `code`, nunca el texto** (R27): `CODE_TO_FIELD` esta
 * tipado con `ErrorCode`, asi que un codigo mal escrito o retirado del catalogo rompe el typecheck
 * en vez de caer callado a la region generica. Un rechazo **no cierra el panel y no pierde lo
 * escrito**.
 */

/** Los nueve nombres de `FormData` que lee `userCandidateFromFormData` (R23). */
export const USER_FIRST_NAMES_FIELD = 'firstNames';
export const USER_LAST_NAMES_FIELD = 'lastNames';
export const USER_BIRTH_DATE_FIELD = 'birthDate';
export const USER_EMAIL_FIELD = 'email';
export const USER_PHONE_FIELD = 'phone';
export const USER_DOCUMENT_TYPE_FIELD = 'documentTypeCode';
export const USER_DOCUMENT_NUMBER_FIELD = 'documentNumber';
export const USER_USERNAME_FIELD = 'username';
export const USER_ROLE_FIELD = 'roleId';

/**
 * La lista, en un solo sitio. Los tests afirman sobre ella —«el `FormData` lleva exactamente
 * estos nombres»— y no sobre literales repetidos (R41).
 */
export const USER_BUSINESS_FIELDS = [
  USER_FIRST_NAMES_FIELD,
  USER_LAST_NAMES_FIELD,
  USER_BIRTH_DATE_FIELD,
  USER_EMAIL_FIELD,
  USER_PHONE_FIELD,
  USER_DOCUMENT_TYPE_FIELD,
  USER_DOCUMENT_NUMBER_FIELD,
  USER_USERNAME_FIELD,
  USER_ROLE_FIELD,
] as const;

/** Nombre de campo del formulario. Derivado de la lista: no hay una segunda union escrita a mano. */
export type UserFieldName = (typeof USER_BUSINESS_FIELDS)[number];

/** `data-testid` del panel lateral. Lo declara este archivo, que es quien pinta el `SheetContent`. */
export const USER_SHEET_TESTID = 'user-sheet';

export const USER_FORM_TESTID = 'user-form';
export const USER_FORM_ERROR_TESTID = 'user-form-error';
export const USER_FORM_ERROR_CODE_TESTID = 'user-form-error-code';
export const USER_FORM_SUBMIT_TESTID = 'user-form-submit';
export const USER_FORM_CANCEL_TESTID = 'user-form-cancel';

/**
 * `data-testid` del disparador del cierre de todas las sesiones de la persona del panel (QC-101 R7).
 * Solo existe en el DOM cuando el panel entrega `endSessions` (R11, R12).
 */
export const USER_FORM_END_SESSIONS_TESTID = 'user-form-end-sessions';

/** Un `data-testid` por campo, para localizarlos sin depender de su etiqueta (R41). */
export const USER_FIELD_TESTIDS: Readonly<Record<UserFieldName, string>> = {
  firstNames: 'user-field-first-names',
  lastNames: 'user-field-last-names',
  birthDate: 'user-field-birth-date',
  email: 'user-field-email',
  phone: 'user-field-phone',
  documentTypeCode: 'user-field-document-type',
  documentNumber: 'user-field-document-number',
  username: 'user-field-username',
  roleId: 'user-field-role',
};

/** Y un `data-testid` por hueco de error EN LINEA, uno por cada campo que un `code` puede senalar. */
export const USER_ERROR_TESTIDS: Readonly<Record<UserFieldName, string>> = {
  firstNames: 'user-error-first-names',
  lastNames: 'user-error-last-names',
  birthDate: 'user-error-birth-date',
  email: 'user-error-email',
  phone: 'user-error-phone',
  documentTypeCode: 'user-error-document-type',
  documentNumber: 'user-error-document-number',
  username: 'user-error-username',
  roleId: 'user-error-role',
};

export const USER_DOCUMENT_TYPE_OPTION_TESTID = 'user-option-document-type';
export const USER_ROLE_OPTION_TESTID = 'user-option-role';
export const USER_ROLES_ERROR_TESTID = 'user-roles-error';

/**
 * Donde se pinta cada rechazo, **por su codigo estable** (R27). Tipado con `ErrorCode`: un codigo
 * mal escrito o retirado del catalogo rompe el typecheck.
 *
 * Los que NO estan aqui —`invalid_input`, `self_operation`, `last_administrator`,
 * `user_not_found`, `unauthorized`— no senalan un campo y van a la region `role="alert"` del
 * formulario; `unexpected` lo pinta `UnexpectedErrorNotice`, que anade el identificador de la
 * peticion (QC-71).
 */
const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, UserFieldName>>> = {
  duplicate_email: USER_EMAIL_FIELD,
  duplicate_username: USER_USERNAME_FIELD,
  duplicate_document: USER_DOCUMENT_NUMBER_FIELD,
  role_not_found: USER_ROLE_FIELD,
};

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** >= 16 px en TODOS los anchos: por debajo, iOS hace zoom al enfocar el campo (R40). */
const FIELD_TEXT = 'text-base md:text-base';

const FIELD_LABELS: Readonly<Record<UserFieldName, string>> = {
  firstNames: 'Nombres',
  lastNames: 'Apellidos',
  birthDate: 'Fecha de nacimiento',
  email: 'Correo',
  phone: 'Teléfono',
  documentTypeCode: 'Tipo de documento',
  documentNumber: 'Número de documento',
  username: 'Nombre de usuario',
  roleId: 'Rol',
};

const CREATE_TITLE = 'Nuevo usuario';
const EDIT_TITLE = 'Editar usuario';
const CREATE_DESCRIPTION = 'Describe los datos de la persona que va a usar el sistema.';
const EDIT_DESCRIPTION = 'Cambia los datos de la persona.';
const ROLES_UNAVAILABLE = 'No se pudo cargar el catálogo de roles.';

type FieldValues = Partial<Record<UserFieldName, string>>;
type FieldErrors = Partial<Record<UserFieldName, string>>;

/**
 * El estado del formulario. El error se guarda **entero** —no aplanado a `string`—: asi el render
 * estrecha por `code` y el inesperado conserva su identificador de peticion (QC-71 R17).
 */
type UserFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      serverError: ErrorState;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

/** R36: lo construye ESTA pantalla, porque un archivo `'use server'` no exporta constantes. */
const INITIAL_STATE: UserFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Lo escrito, para devolverlo al formulario cuando el guardado se rechaza (R27). */
function readValues(formData: FormData): FieldValues {
  const values: FieldValues = {};
  for (const field of USER_BUSINESS_FIELDS) values[field] = readString(formData, field);
  return values;
}

/**
 * Lo que esta pantalla pinta cuando la accion NO creo nada pero tampoco devolvio un `ErrorState`.
 *
 * QC-79 amplio `CreateUserFormState` de tres variantes a cinco: ahora el alta puede volver como
 * `invalid_credential` con las **reglas incumplidas** de la politica de credenciales (QC-79 R2, y
 * su gemela R23 en la pantalla publica del enlace). Esa variante **no es un `ErrorState`** y, sobre
 * todo, **no es un exito**: no se creo ninguna fila, no se emitio ningun enlace y no se envio
 * ningun correo. Presentarla como «usuario creado» seria un fallo silencioso disfrazado de exito.
 *
 * Hoy esta pantalla **no puede provocarla** —no tiene campo de contrasena, asi que su alta va
 * siempre por la rama del enlace—, pero el tipo ya la admite, y por eso se trata explicitamente.
 *
 * **Esta es la version minima honesta, no la buena.** La buena es pintar las reglas incumplidas
 * una a una junto al campo de contrasena, y eso es trabajo de QC-67 el dia que anada ese campo:
 * requiere el campo, el texto de cada `CredentialRule` y su hueco en el formulario. Mientras tanto
 * se degrada al error generico que la region `role="alert"` ya sabe pintar: un mensaje generico es
 * peor que el detallado, pero es infinitamente mejor que una mentira.
 */
const NOT_CREATED_CODE = 'invalid_input' satisfies ErrorCode;

function notCreatedAsFormError(): ErrorState {
  return { status: 'error', code: NOT_CREATED_CODE, message: errorMessage(NOT_CREATED_CODE) };
}

/**
 * Alta o edicion, segun haya ficha o no. La edicion ata el `id` por parametro —es la firma de
 * `updateUserAction`— y envia el **reemplazo completo** de los nueve (R26).
 *
 * **Discrimina de verdad: `'success'` se comprueba, no se asume.** El `? :` anterior —«si no es
 * `'error'`, es exito»— era cierto cuando el estado del alta tenia tres variantes y dejo de serlo
 * con las cinco de QC-79. Con la forma de abajo, cualquier variante que se anada manana cae en el
 * camino de «no se creo» en vez de colarse como exito, que es el unico fallo de los dos que la
 * persona no puede detectar.
 */
async function submit(
  userId: string | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | ErrorState> {
  if (userId === undefined) {
    const result = await createUserAction({ status: 'idle' }, formData);
    // El `id` creado se IGNORA a proposito (R28): no hay pagina de detalle a la que navegar.
    if (result.status === 'success') return { status: 'success' };
    if (result.status === 'error') return result;
    // `invalid_credential` (QC-79 R2) —y el imposible `idle`—: NO se creo nada, no es exito.
    return notCreatedAsFormError();
  }

  const update = updateUserAction.bind(null, userId);
  const result = await update({ status: 'idle' }, formData);
  if (result.status === 'success') return { status: 'success' };
  if (result.status === 'error') return result;
  // La edicion sigue teniendo tres variantes: aqui solo queda el `idle` que la action no devuelve.
  return notCreatedAsFormError();
}

/** Los nueve valores de partida: los de la ficha en la edicion, vacios en el alta. */
function initialValuesOf(user: UserDetail | undefined): Readonly<Record<UserFieldName, string>> {
  if (user === undefined) {
    return {
      firstNames: '',
      lastNames: '',
      birthDate: '',
      email: '',
      phone: '',
      // El unico valor por defecto, y sale del conjunto cerrado del contrato (R25).
      documentTypeCode: DOCUMENT_TYPE_CODES[0],
      documentNumber: '',
      username: '',
      roleId: '',
    };
  }

  return {
    firstNames: user.firstNames,
    lastNames: user.lastNames,
    // `UserDetail.birthDate` es un `Date`: pasarlo a `YYYY-MM-DD` en UTC es de la pantalla (R26).
    birthDate: toDateInputValue(user.birthDate),
    email: user.email,
    phone: user.phone,
    documentTypeCode: user.documentTypeCode,
    documentNumber: user.documentNumber,
    username: user.username,
    roleId: user.roleId,
  };
}

export type UserFormProps = {
  /** La ficha que se edita, o `undefined` en el alta. Trae los NUEVE valores actuales (R26). */
  readonly user?: UserDetail;
  /** El catalogo de roles (R24), tal cual lo trajo la consulta del modulo. */
  readonly roles: readonly RoleOption[];
  /** El error de esa consulta, o `null`. Con error NO se inventa ninguna opcion (R24). */
  readonly rolesError: ErrorState | null;
  /** Exito: cerrar, avisar y refrescar lo decide el panel (R28, R29). */
  readonly onSaved: () => void;
  /**
   * El disparador del cierre de todas las sesiones de la persona del panel (QC-101 R7, R11, R12).
   * **Sin esta prop no se emite NADA**, ni un contenedor vacio: la ausencia es la unica senal. Quien
   * decide si llega es el panel, con datos bajados por props (R16); este formulario no decide.
   */
  readonly endSessions?: UserFormEndSessions;
};

/**
 * Lo que el panel entrega para ofrecer el cierre de sesiones (QC-101 `design.md > 2`).
 *
 * Lleva el `displayName` ademas del callback porque la ficha (`UserDetail`) no lo trae y el nombre
 * accesible del disparador tiene que nombrar a la persona (R7). Componerlo aqui con nombres y
 * apellidos seria una segunda copia de `buildDisplayName`: el nombre llega hecho desde la fila.
 */
export type UserFormEndSessions = {
  readonly displayName: string;
  /** Abre la confirmacion. No escribe nada: la escritura es del dialogo (R9). */
  readonly onEndSessions: () => void;
};

export function UserForm({ user, roles, rolesError, onSaved, endSessions }: UserFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const isEdit = user !== undefined;

  async function save(_previous: UserFormState, formData: FormData): Promise<UserFormState> {
    const values = readValues(formData);
    // Los campos viajan TAL CUAL: el esquema del modulo es quien normaliza y quien rechaza.
    const result = await submit(user?.id, formData);

    if (result.status === 'error') {
      // R27: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
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
  const written = state.status === 'error' ? state.values : undefined;
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;

  const initial = initialValuesOf(user);
  const valueOf = (field: UserFieldName): string => written?.[field] ?? initial[field];

  return (
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid={USER_SHEET_TESTID}
      isForm
      formProps={{ action: formAction, 'data-testid': USER_FORM_TESTID }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? EDIT_TITLE : CREATE_TITLE}</SheetTitle>
        <SheetDescription>{isEdit ? EDIT_DESCRIPTION : CREATE_DESCRIPTION}</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {formError === undefined ? null : (
          // Region de error del formulario (R27): aqui van los rechazos que no senalan campo.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={USER_FORM_ERROR_TESTID}
            data-code={formError.code}
          >
            {formError.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={formError} />
            ) : (
              <>
                <p>{formError.message}</p>
                <p className="text-xs" data-testid={USER_FORM_ERROR_CODE_TESTID}>
                  {formError.code}
                </p>
              </>
            )}
          </div>
        )}

        <UserTextField
          id={`${fieldId}-${USER_FIRST_NAMES_FIELD}`}
          name={USER_FIRST_NAMES_FIELD}
          value={valueOf(USER_FIRST_NAMES_FIELD)}
          error={fieldErrors.firstNames}
        />
        <UserTextField
          id={`${fieldId}-${USER_LAST_NAMES_FIELD}`}
          name={USER_LAST_NAMES_FIELD}
          value={valueOf(USER_LAST_NAMES_FIELD)}
          error={fieldErrors.lastNames}
        />
        {/*
          `type="date"`: emite `YYYY-MM-DD`, que es exactamente lo que `z.iso.date()` espera (R26).
        */}
        <UserTextField
          id={`${fieldId}-${USER_BIRTH_DATE_FIELD}`}
          name={USER_BIRTH_DATE_FIELD}
          type="date"
          value={valueOf(USER_BIRTH_DATE_FIELD)}
          error={fieldErrors.birthDate}
        />
        <UserTextField
          id={`${fieldId}-${USER_EMAIL_FIELD}`}
          name={USER_EMAIL_FIELD}
          type="email"
          value={valueOf(USER_EMAIL_FIELD)}
          error={fieldErrors.email}
        />
        <UserTextField
          id={`${fieldId}-${USER_PHONE_FIELD}`}
          name={USER_PHONE_FIELD}
          type="tel"
          value={valueOf(USER_PHONE_FIELD)}
          error={fieldErrors.phone}
        />

        {/* R25: las opciones salen del conjunto cerrado del contrato, nunca de literales. */}
        <UserSelectField
          idPrefix={`${fieldId}-${USER_DOCUMENT_TYPE_FIELD}`}
          name={USER_DOCUMENT_TYPE_FIELD}
          value={valueOf(USER_DOCUMENT_TYPE_FIELD)}
          error={fieldErrors.documentTypeCode}
          optionTestId={USER_DOCUMENT_TYPE_OPTION_TESTID}
          options={DOCUMENT_TYPE_CODES.map((code) => ({ value: code, label: code }))}
        />

        <UserTextField
          id={`${fieldId}-${USER_DOCUMENT_NUMBER_FIELD}`}
          name={USER_DOCUMENT_NUMBER_FIELD}
          value={valueOf(USER_DOCUMENT_NUMBER_FIELD)}
          error={fieldErrors.documentNumber}
        />
        <UserTextField
          id={`${fieldId}-${USER_USERNAME_FIELD}`}
          name={USER_USERNAME_FIELD}
          value={valueOf(USER_USERNAME_FIELD)}
          error={fieldErrors.username}
        />

        {/*
          R24: las opciones vienen de la consulta de roles del modulo. SI esa consulta fallo, se
          dice de forma identificable y el selector queda SIN opciones: no se inventa ninguna y no
          se aparenta tenerlas.
        */}
        {rolesError === null ? null : (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={USER_ROLES_ERROR_TESTID}
            data-code={rolesError.code}
          >
            {rolesError.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={rolesError} />
            ) : (
              <p>{ROLES_UNAVAILABLE}</p>
            )}
          </div>
        )}
        <UserSelectField
          idPrefix={`${fieldId}-${USER_ROLE_FIELD}`}
          name={USER_ROLE_FIELD}
          value={valueOf(USER_ROLE_FIELD)}
          error={fieldErrors.roleId}
          optionTestId={USER_ROLE_OPTION_TESTID}
          options={roles.map((role) => ({ value: role.id, label: role.name }))}
        />

        {/*
          QC-101 R7, R11, R12, R15: el cierre de todas las sesiones de la persona del panel, al pie
          del cuerpo. SOLO si el panel lo entrega; sin `endSessions` no se emite ni un contenedor.
          `type="button"` es OBLIGATORIO: todo el panel es un `<form>` y un boton sin tipo enviaria
          la edicion. Pulsarlo solo abre la confirmacion; la escritura es del dialogo (R9, R10).
        */}
        {endSessions === undefined ? null : (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              className={`w-full ${TOUCH_TARGET}`}
              aria-label={endUserSessionsLabel(endSessions.displayName)}
              data-testid={USER_FORM_END_SESSIONS_TESTID}
              onClick={endSessions.onEndSessions}
            >
              <LogOutIcon aria-hidden="true" />
              {endUserSessionsLabel(endSessions.displayName)}
            </Button>
          </div>
        )}
      </div>
    </SheetContent>
  );
}

/** Un campo de texto con su etiqueta y su hueco de error en linea. */
function UserTextField({
  id,
  name,
  type = 'text',
  value,
  error,
}: {
  readonly id: string;
  readonly name: UserFieldName;
  readonly type?: 'text' | 'email' | 'tel' | 'date';
  readonly value: string;
  readonly error?: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{FIELD_LABELS[name]}</Label>
      {/*
        `key={value}`: Base UI avisa cuando el `defaultValue` de un campo no controlado cambia
        despues de montarse, y la clave fuerza el remontaje justo en ese salto —el de volver de un
        intento fallido con lo escrito—. El campo sigue sin estar controlado.
      */}
      <Input
        key={value}
        id={id}
        name={name}
        type={type}
        autoComplete="off"
        required
        defaultValue={value}
        className={`min-h-11 ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={USER_FIELD_TESTIDS[name]}
      />
      {error === undefined ? null : (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-destructive"
          data-testid={USER_ERROR_TESTIDS[name]}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Un selector con su etiqueta y su hueco de error. El primitivo monta un `input` oculto con este
 * `name`, asi que el valor viaja en el `FormData` como cualquier otro campo.
 *
 * **Sin opciones no se inventa ninguna** (R24): la lista que llega es la que se pinta, y si esta
 * vacia el desplegable no ofrece nada.
 */
function UserSelectField({
  idPrefix,
  name,
  value,
  error,
  options,
  optionTestId,
}: {
  readonly idPrefix: string;
  readonly name: UserFieldName;
  readonly value: string;
  readonly error?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly optionTestId: string;
}) {
  const labelId = `${idPrefix}-label`;
  const errorId = `${idPrefix}-error`;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {FIELD_LABELS[name]}
      </span>
      <Select
        key={value}
        name={name}
        defaultValue={value}
        items={options.map((option) => ({ label: option.label, value: option.value }))}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={USER_FIELD_TESTIDS[name]}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} data-testid={optionTestId}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error === undefined ? null : (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-destructive"
          data-testid={USER_ERROR_TESTIDS[name]}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FormActions() {
  return (
    <>
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            className={TOUCH_TARGET}
            data-testid={USER_FORM_CANCEL_TESTID}
          />
        }
      >
        Cancelar
      </SheetClose>
      <SaveButton />
    </>
  );
}

/** `useFormStatus()` ve el envio desde el pie porque el panel entero es un `<form>`. */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending}
      aria-busy={pending}
      data-testid={USER_FORM_SUBMIT_TESTID}
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
