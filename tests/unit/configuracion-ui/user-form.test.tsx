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
  USER_FORM_END_SESSIONS_TESTID,
  USER_FORM_ERROR_CODE_TESTID,
  USER_FORM_ERROR_TESTID,
  USER_FORM_SUBMIT_TESTID,
  USER_FORM_TESTID,
  USER_ROLE_FIELD,
  USER_ROLE_OPTION_TESTID,
  USER_ROLES_ERROR_TESTID,
  USER_USERNAME_SUGGESTION_APPLY_TESTID,
  USER_USERNAME_SUGGESTION_TESTID,
  UserForm,
  nextUsernameCandidate,
  usernameFromNames,
  endUserSessionsLabel,
  type UserFieldName,
  type UserFormEndSessions,
} from '@/app/(private)/configuracion/usuarios/components';
import { Sheet } from '@/components/ui/sheet';
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import {
  DOCUMENT_TYPE_CODES,
  USER_USERNAME_MAX_LENGTH,
  type RoleOption,
  type UserDetail,
} from '@/lib/modules/identity';
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

const FICHA: UserDetail = {
  id: 'u-ana',
  firstNames: ESCRITO.firstNames,
  lastNames: ESCRITO.lastNames,
  birthDate: new Date('1990-04-17T00:00:00.000Z'),
  email: ESCRITO.email,
  phone: ESCRITO.phone,
  documentTypeCode: 'CC',
  documentNumber: ESCRITO.documentNumber,
  username: ESCRITO.username,
  roleId: ROLES[1]!.id,
  roleName: ROLES[1]!.name,
  accountStatus: 'active',
  accountStatusChangedAt: new Date('2026-09-01T10:00:00.000Z'),
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
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
  // QC-79 R30: el alta devuelve ademas COMO acabo el correo. Esta pantalla no tiene campo de
  // contrasena, asi que su alta va siempre por la rama del enlace: el caso feliz es 'sent'.
  createUserActionMock.mockResolvedValue({ status: 'success', id: 'u-nuevo', mail: 'sent' });
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
  // El alta ya lo rellena a partir de nombres y apellidos: se sustituye, no se anade detras.
  await user.clear(screen.getByTestId(USER_FIELD_TESTIDS.username));
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
    await user.clear(screen.getByTestId(USER_FIELD_TESTIDS.username));
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

// QC-101 T6 — El disparador del cierre de sesiones dentro del panel: R7, R10, R11, R15 y R16.
//
// Aqui se prueba el CONTRATO del formulario con su panel: pinta el disparador SOLO si recibe
// `endSessions`, y pulsarlo no envia la edicion. Quien decide si llega —cuenta activa y no es uno
// mismo— es `user-sheet.tsx`, y eso se prueba en `user-sheet.test.tsx`.
describe('el disparador del cierre de sesiones solo existe si el panel lo entrega (QC-101)', () => {
  const NOMBRE = 'Lopez Perez, Ana';

  function montarConCierre(endSessions: UserFormEndSessions | undefined) {
    render(
      <Sheet open onOpenChange={() => {}}>
        <UserForm
          roles={ROLES}
          rolesError={null}
          onSaved={onSaved}
          endSessions={endSessions}
        />
      </Sheet>,
    );
    return screen.getByTestId(USER_FORM_TESTID);
  }

  it('R11 R12 — sin `endSessions` no se emite NADA: ni el disparador ni un contenedor vacio', () => {
    const formulario = montarConCierre(undefined);

    expect(screen.queryAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: endUserSessionsLabel(NOMBRE) })).toBeNull();
    // El cuerpo acaba en el selector de rol: no queda ningun hueco reservado para el disparador.
    const cuerpo = screen.getByTestId(USER_FIELD_TESTIDS.roleId).closest('.overflow-y-auto');
    expect(cuerpo).not.toBeNull();
    expect(cuerpo!.lastElementChild!.contains(screen.getByTestId(USER_FIELD_TESTIDS.roleId))).toBe(
      true,
    );
    expect(formulario.querySelectorAll('.border-t.pt-4')).toHaveLength(0);
  });

  it('R7 — con `endSessions` se ofrece dentro del panel, con un nombre accesible que incluye el nombre', () => {
    const formulario = montarConCierre({ displayName: NOMBRE, onEndSessions: vi.fn() });

    const disparador = screen.getByRole('button', { name: endUserSessionsLabel(NOMBRE) });
    expect(disparador).toBe(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    expect(disparador.getAttribute('aria-label')).toContain(NOMBRE);
    expect(formulario.contains(disparador)).toBe(true);
  });

  it('R10 — pulsarlo avisa al panel UNA vez y NO envia el formulario de edicion', async () => {
    const user = setupUser();
    const onEndSessions = vi.fn();
    montarConCierre({ displayName: NOMBRE, onEndSessions });

    const disparador = screen.getByTestId(USER_FORM_END_SESSIONS_TESTID);
    // Todo el panel es un `<form>`: sin `type="button"`, pulsarlo enviaria la edicion.
    expect(disparador).toHaveAttribute('type', 'button');

    await user.click(disparador);

    expect(onEndSessions).toHaveBeenCalledTimes(1);
    expect(createUserActionMock).not.toHaveBeenCalled();
    expect(updateUserActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R10 — el disparador no anade ningun campo al `FormData`: siguen siendo los nueve', () => {
    const formulario = montarConCierre({ displayName: NOMBRE, onEndSessions: vi.fn() });

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea, button')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect([...new Set(nombres)].sort()).toEqual([...USER_BUSINESS_FIELDS].sort());
  });

  it('R15 — mide al menos 44x44 px y esta en el DOM sin depender de `:hover`', () => {
    montarConCierre({ displayName: NOMBRE, onEndSessions: vi.fn() });

    const disparador = screen.getByTestId(USER_FORM_END_SESSIONS_TESTID);
    for (const clase of ['min-h-11', 'min-w-11']) {
      expect(disparador.className).toContain(clase);
    }
    expect(disparador.className).not.toMatch(/group-hover|hover:(opacity|visible|block|flex|inline)/);
    const clases = disparador.className.split(/\s+/);
    expect(clases).not.toContain('invisible');
    expect(clases).not.toContain('hidden');
  });
});

describe('el alta propone el nombre de usuario a partir de nombres y apellidos', () => {
  it('lo autocompleta con varios nombres y varios apellidos mientras se escribe', async () => {
    const user = setupUser();
    montar();
    const usuario = screen.getByTestId(USER_FIELD_TESTIDS.username);

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), 'José Carlos');
    expect(usuario).toHaveValue('josec');

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), 'Pérez Núñez');
    expect(usuario).toHaveValue('josecpn');
  });

  it('deja de autocompletar para siempre en cuanto se edita a mano, aunque se vacie', async () => {
    const user = setupUser();
    montar();
    const usuario = screen.getByTestId(USER_FIELD_TESTIDS.username);

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), 'Ana');
    await user.type(usuario, 'x');
    expect(usuario).toHaveValue('anax');

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), 'Lopez');
    expect(usuario).toHaveValue('anax');

    await user.clear(usuario);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), ' Maria');
    expect(usuario).toHaveValue('');
  });

  it('la edicion NO autocompleta: el nombre de usuario de la ficha se queda', async () => {
    const user = setupUser();
    render(
      <Sheet open onOpenChange={() => {}}>
        <UserForm user={FICHA} roles={ROLES} rolesError={null} onSaved={onSaved} />
      </Sheet>,
    );

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), ' Jose');
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), ' Nunez');

    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(FICHA.username);
  });
});

describe('`usernameFromNames`: primer nombre entero mas iniciales', () => {
  it.each([
    ['José Carlos', 'Pérez Núñez', 'josecpn'],
    ['Ana', 'López', 'anal'],
    ['  María   Fernanda  ', 'Restrepo de la Hoz', 'mariafrdlh'],
    ['Peña', '', 'pena'],
    ["O'Neil 2", 'Ñandú', 'oneil2n'],
    ['', 'Pérez', ''],
    ['   ', 'Pérez', ''],
  ])('(%j, %j) -> %j', (nombres, apellidos, esperado) => {
    expect(usernameFromNames(nombres, apellidos)).toBe(esperado);
  });

  it('recorta al maximo del contrato', () => {
    const largo = 'a'.repeat(USER_USERNAME_MAX_LENGTH + 10);
    expect(usernameFromNames(largo, 'Perez')).toHaveLength(USER_USERNAME_MAX_LENGTH);
  });
});

describe('`nextUsernameCandidate`: el sufijo numerico final, mas uno', () => {
  it.each([
    ['josecpn', 'josecpn1'],
    ['josecpn1', 'josecpn2'],
    ['josecpn9', 'josecpn10'],
    ['josecpn99', 'josecpn100'],
    ['ana2lopez', 'ana2lopez1'],
    ['', '1'],
  ])('%j -> %j', (enviado, esperado) => {
    expect(nextUsernameCandidate(enviado)).toBe(esperado);
  });

  it('recorta la base para no pasar del maximo del contrato', () => {
    const lleno = 'a'.repeat(USER_USERNAME_MAX_LENGTH);
    expect(nextUsernameCandidate(lleno)).toBe(`${'a'.repeat(USER_USERNAME_MAX_LENGTH - 1)}1`);

    const conNueve = `${'a'.repeat(USER_USERNAME_MAX_LENGTH - 1)}9`;
    expect(nextUsernameCandidate(conNueve)).toBe(`${'a'.repeat(USER_USERNAME_MAX_LENGTH - 2)}10`);
  });
});

describe('`duplicate_username` en el alta recomienda el siguiente numero', () => {
  function rechazarUsuario() {
    createUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_username',
      message: 'Ya existe.',
    });
  }

  it('la muestra junto al error y el boton la aplica como edicion manual', async () => {
    const user = setupUser();
    rechazarUsuario();
    montar();
    await rellenarYEnviar(user);

    await screen.findByTestId(USER_ERROR_TESTIDS.username);
    const sugerido = nextUsernameCandidate(ESCRITO.username);
    const sugerencia = screen.getByTestId(USER_USERNAME_SUGGESTION_TESTID);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(ESCRITO.username);

    const aplicar = within(sugerencia).getByTestId(USER_USERNAME_SUGGESTION_APPLY_TESTID);
    expect(aplicar).toHaveAttribute('type', 'button');
    expect(aplicar).toHaveAccessibleName(new RegExp(sugerido));
    expect(aplicar.className).toContain('min-h-11');

    await user.click(aplicar);

    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(sugerido);
    expect(createUserActionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(USER_USERNAME_SUGGESTION_TESTID)).toBeNull();

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), ' Jose');
    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(sugerido);
  });

  it('si vuelve a estar repetido, al guardar propone el numero siguiente', async () => {
    const user = setupUser();
    rechazarUsuario();
    montar();
    await rellenarYEnviar(user);
    await screen.findByTestId(USER_USERNAME_SUGGESTION_TESTID);

    await user.click(screen.getByTestId(USER_USERNAME_SUGGESTION_APPLY_TESTID));
    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createUserActionMock).toHaveBeenCalledTimes(2));
    expect(createUserActionMock.mock.calls[1]![1].get('username')).toBe(`${ESCRITO.username}1`);
    await waitFor(() =>
      expect(screen.getByTestId(USER_USERNAME_SUGGESTION_APPLY_TESTID)).toHaveAccessibleName(
        new RegExp(`${ESCRITO.username}2`),
      ),
    );
  });

  it('otro codigo no muestra recomendacion', async () => {
    const user = setupUser();
    createUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_email',
      message: 'Ya existe.',
    });
    montar();
    await rellenarYEnviar(user);

    await screen.findByTestId(USER_ERROR_TESTIDS.email);
    expect(screen.queryByTestId(USER_USERNAME_SUGGESTION_TESTID)).toBeNull();
  });

  it('la edicion no muestra recomendacion', async () => {
    const user = setupUser();
    updateUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_username',
      message: 'Ya existe.',
    });
    render(
      <Sheet open onOpenChange={() => {}}>
        <UserForm user={FICHA} roles={ROLES} rolesError={null} onSaved={onSaved} />
      </Sheet>,
    );
    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    await screen.findByTestId(USER_ERROR_TESTIDS.username);
    expect(screen.queryByTestId(USER_USERNAME_SUGGESTION_TESTID)).toBeNull();
  });
});
