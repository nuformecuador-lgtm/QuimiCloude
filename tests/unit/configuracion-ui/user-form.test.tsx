// QC-67 T9 — El formulario de alta y edicion de usuario: R23, R24, R25, R27, R35, R36.
//
// **Las Server Actions estan mockeadas.** No es un atajo: son el borde del modulo `identity`, que
// esta ficha solo consume (R37), y sustituirlas es lo unico que permite ejercitar el formulario sin
// base de datos. **Y ademas son el punto de observacion de R23 y R35**: el `FormData` que recibe el
// doble es EXACTAMENTE el que la pantalla envia, asi que afirmar sobre sus claves es afirmar que
// ninguna otra viaja.
//
// **Ningun assert sobre literales de copy** (R41): rol ARIA, `data-testid` exportado como
// constante, o constantes del propio contrato del modulo.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USER_BUSINESS_FIELDS,
  USER_DOCUMENT_TYPE_OPTION_TESTID,
  USER_ERROR_TESTIDS,
  USER_FIELD_TESTIDS,
  USER_FORM_ERROR_CODE_TESTID,
  USER_FORM_ERROR_TESTID,
  USER_FORM_SUBMIT_TESTID,
  USER_FORM_TESTID,
  USER_ROLE_FIELD,
  USER_ROLE_OPTION_TESTID,
  USER_ROLES_ERROR_TESTID,
  UserForm,
  type UserFieldName,
} from '@/app/(private)/configuracion/usuarios/components';
import { Sheet } from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import { DOCUMENT_TYPE_CODES, type RoleOption } from '@/lib/modules/identity';
import type {
  CreateUserFormState,
  UserMutationFormState,
} from '@/lib/modules/identity/adapters/driving/user-actions';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/** Los codigos que estos casos pintan son los CATALOGADOS: el generico exige `reference`. */
type CodigoCatalogado = Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>;

const { routerMock, createUserActionMock, updateUserActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createUserActionMock:
    vi.fn<(prev: CreateUserFormState, data: FormData) => Promise<CreateUserFormState>>(),
  updateUserActionMock:
    vi.fn<
      (id: string, prev: UserMutationFormState, data: FormData) => Promise<UserMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario`);
  };
  return {
    createUserAction: createUserActionMock,
    updateUserAction: updateUserActionMock,
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
  };
});

const ROLES: readonly RoleOption[] = [
  { id: 'r-admin', name: 'Administrador' },
  { id: 'r-operario', name: 'Operario' },
];

/** Lo que se teclea. Son DATOS del caso, no copy de la interfaz. */
const ESCRITO: Readonly<Record<Exclude<UserFieldName, 'documentTypeCode' | 'roleId'>, string>> = {
  firstNames: 'Ana Maria',
  lastNames: 'Lopez Perez',
  birthDate: '1990-04-17',
  email: 'ana.lopez@example.com',
  phone: '3001234567',
  documentNumber: '1020304050',
  username: 'ana.lopez',
};

/**
 * Claves que NO pueden viajar nunca (R23, R35). Se afirma en negativo sobre ellas ademas de
 * comparar el conjunto exacto: asi el caso dice QUE es lo que no debe aparecer.
 */
const CLAVES_PROHIBIDAS = [
  'companyId',
  'password',
  'passwordHash',
  'accountStatus',
  'mustChangeCredential',
  'failedLoginAttempts',
  'lockLevel',
  'lockedUntil',
  'id',
] as const;

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createUserActionMock.mockResolvedValue({ status: 'success', id: 'u-nuevo' });
  updateUserActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

const onSaved = vi.fn();

/** El formulario dentro de un panel abierto: es como vive de verdad. */
function montar({
  roles = ROLES,
  rolesError = null,
}: {
  readonly roles?: readonly RoleOption[];
  readonly rolesError?: ErrorState | null;
} = {}) {
  render(
    <Sheet open onOpenChange={() => {}}>
      <UserForm roles={roles} rolesError={rolesError} onSaved={onSaved} />
    </Sheet>,
  );
  return screen.getByTestId(USER_FORM_TESTID);
}

/** Elige el rol por su posicion en el catalogo, esperando a que el popup sea interactivo. */
async function elegirRol(user: ReturnType<typeof setupUser>, indice: number) {
  await user.click(screen.getByTestId(USER_FIELD_TESTIDS.roleId));
  const opciones = await screen.findAllByTestId(USER_ROLE_OPTION_TESTID);
  await user.click(await esperarInteractiva(opciones[indice]!));
}

/** Rellena los nueve y envia. El tipo de documento ya viene del conjunto cerrado por defecto. */
async function rellenarYEnviar(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), ESCRITO.firstNames);
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), ESCRITO.lastNames);
  // El campo de fecha no se teclea caracter a caracter: se le da su valor `YYYY-MM-DD`.
  fireEvent.change(screen.getByTestId(USER_FIELD_TESTIDS.birthDate), {
    target: { value: ESCRITO.birthDate },
  });
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.email), ESCRITO.email);
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.phone), ESCRITO.phone);
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.documentNumber), ESCRITO.documentNumber);
  await user.type(screen.getByTestId(USER_FIELD_TESTIDS.username), ESCRITO.username);
  await elegirRol(user, 0);
  await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));
}

/** El `FormData` que la pantalla envio al alta. Es el espia de R23 y R35. */
async function formDataDelAlta(): Promise<FormData> {
  await waitFor(() => expect(createUserActionMock).toHaveBeenCalledTimes(1));
  return createUserActionMock.mock.calls[0]![1];
}

describe('el formulario captura EXACTAMENTE los nueve campos (R23, R35)', () => {
  it('los controles con nombre son los nueve, ni uno mas', () => {
    const formulario = montar();

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect([...new Set(nombres)].sort()).toEqual([...USER_BUSINESS_FIELDS].sort());
    for (const prohibida of CLAVES_PROHIBIDAS) expect(nombres).not.toContain(prohibida);
  });

  it('el `FormData` que sale lleva los nueve nombres y ninguna clave de credencial', async () => {
    const user = setupUser();
    montar();

    await rellenarYEnviar(user);

    const enviado = await formDataDelAlta();
    expect([...enviado.keys()].sort()).toEqual([...USER_BUSINESS_FIELDS].sort());
    for (const prohibida of CLAVES_PROHIBIDAS) expect(enviado.has(prohibida)).toBe(false);
  });

  it('los valores viajan TAL CUAL, sin recortes ni minusculas forzadas en el cliente', async () => {
    const user = setupUser();
    montar();

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), ESCRITO.firstNames);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), ESCRITO.lastNames);
    fireEvent.change(screen.getByTestId(USER_FIELD_TESTIDS.birthDate), {
      target: { value: ESCRITO.birthDate },
    });
    // Con mayusculas a proposito: normalizar el correo es del esquema del modulo, no de aqui.
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.email), 'ANA.LOPEZ@EXAMPLE.COM');
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.phone), ESCRITO.phone);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.documentNumber), ESCRITO.documentNumber);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.username), ESCRITO.username);
    await elegirRol(user, 1);
    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect(enviado.get('email')).toBe('ANA.LOPEZ@EXAMPLE.COM');
    expect(enviado.get('firstNames')).toBe(ESCRITO.firstNames);
    expect(enviado.get(USER_ROLE_FIELD)).toBe(ROLES[1]!.id);
  });

  it('la fecha de nacimiento es un campo de fecha, que es lo que el esquema espera (R26)', () => {
    montar();

    expect(screen.getByTestId(USER_FIELD_TESTIDS.birthDate)).toHaveAttribute('type', 'date');
  });
});

describe('los selectores salen del contrato, nunca de literales (R24, R25)', () => {
  it('el tipo de documento ofrece exactamente los codigos del conjunto cerrado', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(USER_FIELD_TESTIDS.documentTypeCode));

    const opciones = await screen.findAllByTestId(USER_DOCUMENT_TYPE_OPTION_TESTID);
    expect(opciones).toHaveLength(DOCUMENT_TYPE_CODES.length);
    for (const codigo of DOCUMENT_TYPE_CODES) {
      expect(opciones.map((opcion) => opcion.textContent)).toContain(codigo);
    }
  });

  it('el rol ofrece exactamente los del catalogo recibido', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(USER_FIELD_TESTIDS.roleId));

    const opciones = await screen.findAllByTestId(USER_ROLE_OPTION_TESTID);
    expect(opciones).toHaveLength(ROLES.length);
    expect(opciones.map((opcion) => opcion.textContent)).toEqual(ROLES.map((rol) => rol.name));
  });

  it('sin catalogo lo dice de forma identificable y NO inventa ninguna opcion (R24)', async () => {
    const user = setupUser();
    const fallo: ErrorState = {
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar los roles.',
    };
    montar({ roles: [], rolesError: fallo });

    const aviso = screen.getByTestId(USER_ROLES_ERROR_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveAttribute('data-code', fallo.code);

    await user.click(screen.getByTestId(USER_FIELD_TESTIDS.roleId));
    expect(screen.queryAllByTestId(USER_ROLE_OPTION_TESTID)).toHaveLength(0);
  });
});

describe('cada codigo de error pinta donde le toca (R27)', () => {
  /** Un alta que se rechaza con el codigo dado, con los nueve campos ya escritos. */
  async function altaQueFalla(
    user: ReturnType<typeof setupUser>,
    code: CodigoCatalogado,
    message: string,
  ) {
    createUserActionMock.mockResolvedValue({ status: 'error', code, message });
    montar();

    await rellenarYEnviar(user);
    await waitFor(() => expect(createUserActionMock).toHaveBeenCalledTimes(1));
  }

  /** Los tres codigos que senalan un campo de texto, con el campo al que apuntan. */
  const EN_LINEA: readonly { readonly code: CodigoCatalogado; readonly field: UserFieldName }[] = [
    { code: 'duplicate_email', field: 'email' },
    { code: 'duplicate_username', field: 'username' },
    { code: 'duplicate_document', field: 'documentNumber' },
  ];

  for (const { code, field } of EN_LINEA) {
    it(`\`${code}\` se pinta junto a su campo y en ningun otro sitio`, async () => {
      const user = setupUser();
      await altaQueFalla(user, code, 'Ya existe.');

      const errorDelCampo = await screen.findByTestId(USER_ERROR_TESTIDS[field]);
      const campo = screen.getByTestId(USER_FIELD_TESTIDS[field]);
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(campo).toHaveAttribute('aria-describedby', errorDelCampo.id);
      expect(screen.queryByTestId(USER_FORM_ERROR_TESTID)).toBeNull();

      for (const otro of USER_BUSINESS_FIELDS) {
        if (otro === field) continue;
        expect(screen.queryByTestId(USER_ERROR_TESTIDS[otro])).toBeNull();
      }
    });
  }

  it('`role_not_found` se pinta junto al SELECTOR de rol', async () => {
    const user = setupUser();
    await altaQueFalla(user, 'role_not_found', 'El rol indicado no existe.');

    const errorDelCampo = await screen.findByTestId(USER_ERROR_TESTIDS.roleId);
    const disparador = screen.getByTestId(USER_FIELD_TESTIDS.roleId);
    expect(disparador).toHaveAttribute('aria-invalid', 'true');
    expect(disparador).toHaveAttribute('aria-describedby', errorDelCampo.id);
    expect(screen.queryByTestId(USER_FORM_ERROR_TESTID)).toBeNull();
  });

  for (const code of [
    'invalid_input',
    'self_operation',
    'last_administrator',
    'user_not_found',
    'unauthorized',
  ] as const satisfies readonly CodigoCatalogado[]) {
    it(`\`${code}\` va a la region de error del formulario, no junto a un campo`, async () => {
      const user = setupUser();
      await altaQueFalla(user, code, 'No se pudo guardar.');

      const region = await screen.findByTestId(USER_FORM_ERROR_TESTID);
      expect(region).toHaveAttribute('role', 'alert');
      expect(region).toHaveAttribute('data-code', code);
      expect(screen.getByTestId(USER_FORM_ERROR_CODE_TESTID)).toHaveTextContent(code);
      for (const field of USER_BUSINESS_FIELDS) {
        expect(screen.queryByTestId(USER_ERROR_TESTIDS[field])).toBeNull();
      }
    });
  }

  it('un rechazo NO cierra el panel, NO avisa de exito y NO pierde lo escrito', async () => {
    const user = setupUser();
    await altaQueFalla(user, 'duplicate_email', 'Ya existe un usuario con ese correo.');

    await screen.findByTestId(USER_ERROR_TESTIDS.email);
    expect(screen.getByTestId(USER_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(USER_FIELD_TESTIDS.firstNames)).toHaveValue(ESCRITO.firstNames);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.lastNames)).toHaveValue(ESCRITO.lastNames);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.email)).toHaveValue(ESCRITO.email);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(ESCRITO.username);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.documentNumber)).toHaveValue(
      ESCRITO.documentNumber,
    );
    expect(screen.getByTestId(USER_FIELD_TESTIDS.birthDate)).toHaveValue(ESCRITO.birthDate);
    // El rol elegido sigue elegido: viaja por el `input` oculto del primitivo.
    expect(document.querySelector<HTMLInputElement>(`input[name="${USER_ROLE_FIELD}"]`)?.value).toBe(
      ROLES[0]!.id,
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('el error inesperado ensena su identificador (QC-71 R17, R18)', () => {
  it('el inesperado trae la referencia; el catalogado no trae ninguna', async () => {
    const user = setupUser();
    createUserActionMock.mockResolvedValue(errorInesperado());
    montar();

    await rellenarYEnviar(user);

    const region = await screen.findByTestId(USER_FORM_ERROR_TESTID);
    const referencia = within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);

    cleanup();
    createUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La entrada recibida no es valida.',
    });
    const user2 = setupUser();
    montar();
    await rellenarYEnviar(user2);

    await screen.findByTestId(USER_FORM_ERROR_TESTID);
    esperarSinIdentificador();
  });
});
