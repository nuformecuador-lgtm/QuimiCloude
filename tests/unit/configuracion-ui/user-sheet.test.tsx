// QC-67 T9 y T12 — El panel lateral de alta y edicion de usuario: R22, R26, R28, R29.
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `identity`, que esta ficha solo
// consume (R37). `getUserAction` ademas es el punto de observacion de R26 —se comprueba que el
// panel la pide al abrirse, con el identificador de la fila— y de los tres estados del panel.
//
// **Ningun assert sobre literales de copy** (R41): rol ARIA, `data-slot` del primitivo,
// `data-testid` exportado como constante y datos del propio caso.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  END_USER_SESSIONS_CONFIRM_TESTID,
  END_USER_SESSIONS_DIALOG_TESTID,
  END_USER_SESSIONS_DISMISS_TESTID,
  END_USER_SESSIONS_ID_FIELD,
  END_USER_SESSIONS_MESSAGE_TESTID,
  USER_ERROR_TESTIDS,
  USER_FIELD_TESTIDS,
  USER_FORM_CANCEL_TESTID,
  USER_FORM_END_SESSIONS_TESTID,
  USER_FORM_SUBMIT_TESTID,
  USER_FORM_TESTID,
  USER_ROLE_FIELD,
  USER_ROLE_OPTION_TESTID,
  USER_SHEET_ERROR_CODE_TESTID,
  USER_SHEET_ERROR_TESTID,
  USER_SHEET_LOADING_TESTID,
  USER_SHEET_TESTID,
  UserSheet,
  endUserSessionsLabel,
  toDateInputValue,
} from '@/app/(private)/configuracion/usuarios/components';
import type { ErrorState } from '@/lib/modules/errores';
import {
  USER_ACCOUNT_STATUSES,
  type RoleOption,
  type UserDetail,
  type UserRow,
} from '@/lib/modules/identity';
import type { EndSessionsFormState } from '@/lib/modules/identity/adapters/driving/session-actions';
import type {
  CreateUserFormState,
  UserDetailResult,
  UserMutationFormState,
} from '@/lib/modules/identity/adapters/driving/user-actions';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const {
  routerMock,
  createUserActionMock,
  updateUserActionMock,
  getUserActionMock,
  endAllSessionsActionMock,
} = vi.hoisted(
  () => ({
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
    getUserActionMock: vi.fn<(id: string) => Promise<UserDetailResult>>(),
    endAllSessionsActionMock:
      vi.fn<(prev: EndSessionsFormState, data: FormData) => Promise<EndSessionsFormState>>(),
  }),
);

// QC-101: el cierre de sesiones, por su RUTA EXACTA. Es el punto de observacion de R9 y R10 desde
// el panel: abrir la confirmacion no la invoca, y confirmar la invoca UNA vez.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: endAllSessionsActionMock,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el panel lateral`);
  };
  return {
    createUserAction: createUserActionMock,
    updateUserAction: updateUserActionMock,
    getUserAction: getUserActionMock,
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
  };
});

const ROLES: readonly RoleOption[] = [
  { id: 'r-admin', name: 'Administrador' },
  { id: 'r-operario', name: 'Operario' },
];

const FILA: UserRow = {
  id: 'u-ana',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operario',
  accountStatus: 'active',
};

/**
 * La ficha, con la fecha de nacimiento a MEDIANOCHE UTC, que es como llega de una columna `@db.Date`.
 * Es el caso que delata un formateo en huso local: en America restaria un dia entero.
 */
const FICHA: UserDetail = {
  id: FILA.id,
  firstNames: 'Ana Maria',
  lastNames: 'Lopez Perez',
  birthDate: new Date('1990-04-17T00:00:00.000Z'),
  email: FILA.email,
  phone: '3001234567',
  documentTypeCode: 'CC',
  documentNumber: '1020304050',
  username: FILA.username,
  roleId: ROLES[1]!.id,
  roleName: ROLES[1]!.name,
  accountStatus: 'active',
  accountStatusChangedAt: new Date('2026-09-01T10:00:00.000Z'),
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
};

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  // QC-79 R30: el alta devuelve ademas COMO acabo el correo. Esta pantalla no tiene campo de
  // contrasena, asi que su alta va siempre por la rama del enlace: el caso feliz es 'sent'.
  createUserActionMock.mockResolvedValue({ status: 'success', id: 'u-nuevo', mail: 'sent' });
  updateUserActionMock.mockResolvedValue({ status: 'success' });
  getUserActionMock.mockResolvedValue({ status: 'success', data: FICHA });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Monta el panel con estado propio, que es como lo monta la tabla: una instancia controlada. */
function PanelDePrueba({
  user = null,
  currentUserId = null,
  roles = ROLES,
  rolesError = null,
}: {
  readonly user?: UserRow | null;
  readonly currentUserId?: string | null;
  readonly roles?: readonly RoleOption[];
  readonly rolesError?: ErrorState | null;
}) {
  const [open, setOpen] = useState(true);
  return open ? (
    <UserSheet
      user={user}
      currentUserId={currentUserId}
      roles={roles}
      rolesError={rolesError}
      open
      onOpenChange={setOpen}
    />
  ) : null;
}

describe('el alta y la edicion ocurren en un PANEL LATERAL (R22)', () => {
  it('el alta abre un panel lateral, sin navegar y sin dialogo modal centrado', async () => {
    render(<PanelDePrueba />);

    const panel = await screen.findByTestId(USER_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    // El alta no lee ninguna ficha: no hay nada que precargar.
    expect(getUserActionMock).not.toHaveBeenCalled();
  });

  it('la edicion abre el MISMO panel lateral, tambien sin navegar', async () => {
    render(<PanelDePrueba user={FILA} />);

    const panel = await screen.findByTestId(USER_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrar el panel no navega: los parametros de lista de la URL siguen intactos', async () => {
    const user = setupUser();
    render(<PanelDePrueba />);
    await screen.findByTestId(USER_FORM_TESTID);

    await user.click(screen.getByTestId(USER_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(USER_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(createUserActionMock).not.toHaveBeenCalled();
  });
});

describe('la edicion precarga los NUEVE valores con la ficha individual (R26)', () => {
  it('pide la ficha al abrirse, con el identificador de la fila', async () => {
    render(<PanelDePrueba user={FILA} />);

    await waitFor(() => expect(getUserActionMock).toHaveBeenCalledTimes(1));
    expect(getUserActionMock).toHaveBeenCalledWith(FILA.id);
  });

  it('MIENTRAS la ficha se obtiene, el panel presenta un indicador de carga y ningun formulario', async () => {
    let resolver: (result: UserDetailResult) => void = () => {};
    getUserActionMock.mockReturnValue(
      new Promise<UserDetailResult>((resolve) => {
        resolver = resolve;
      }),
    );
    render(<PanelDePrueba user={FILA} />);

    const cargando = await screen.findByTestId(USER_SHEET_LOADING_TESTID);
    expect(cargando).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId(USER_FORM_TESTID)).toBeNull();

    resolver({ status: 'success', data: FICHA });
    await screen.findByTestId(USER_FORM_TESTID);
    expect(screen.queryByTestId(USER_SHEET_LOADING_TESTID)).toBeNull();
  });

  it('SI la ficha responde con error, lo presenta y NO pinta un formulario en blanco', async () => {
    const fallo: ErrorState = {
      status: 'error',
      code: 'user_not_found',
      message: 'El usuario no existe.',
    };
    getUserActionMock.mockResolvedValue(fallo);
    render(<PanelDePrueba user={FILA} />);

    const aviso = await screen.findByTestId(USER_SHEET_ERROR_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveAttribute('data-code', fallo.code);
    expect(screen.getByTestId(USER_SHEET_ERROR_CODE_TESTID)).toHaveTextContent(fallo.code);

    expect(screen.queryByTestId(USER_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_FIELD_TESTIDS.firstNames)).toBeNull();
  });

  it('con la ficha resuelta precarga los nueve, y la fecha en el formato del campo', async () => {
    render(<PanelDePrueba user={FILA} />);
    await screen.findByTestId(USER_FORM_TESTID);

    expect(screen.getByTestId(USER_FIELD_TESTIDS.firstNames)).toHaveValue(FICHA.firstNames);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.lastNames)).toHaveValue(FICHA.lastNames);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.birthDate)).toHaveValue(
      toDateInputValue(FICHA.birthDate),
    );
    expect(screen.getByTestId(USER_FIELD_TESTIDS.email)).toHaveValue(FICHA.email);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.phone)).toHaveValue(FICHA.phone);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.documentNumber)).toHaveValue(FICHA.documentNumber);
    expect(screen.getByTestId(USER_FIELD_TESTIDS.username)).toHaveValue(FICHA.username);
    // Los dos selectores viajan por el `input` oculto del primitivo.
    expect(
      document.querySelector<HTMLInputElement>('input[name="documentTypeCode"]')?.value,
    ).toBe(FICHA.documentTypeCode);
    expect(document.querySelector<HTMLInputElement>(`input[name="${USER_ROLE_FIELD}"]`)?.value).toBe(
      FICHA.roleId,
    );
  });

  it('envia el REEMPLAZO COMPLETO de los nueve, con el id atado a la operacion', async () => {
    const user = setupUser();
    render(<PanelDePrueba user={FILA} />);
    await screen.findByTestId(USER_FORM_TESTID);

    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateUserActionMock).toHaveBeenCalledTimes(1));
    const [idRecibido, , datos] = updateUserActionMock.mock.calls[0]!;
    expect(idRecibido).toBe(FILA.id);
    expect(datos.get('firstNames')).toBe(FICHA.firstNames);
    expect(datos.get('lastNames')).toBe(FICHA.lastNames);
    expect(datos.get('birthDate')).toBe(toDateInputValue(FICHA.birthDate));
    expect(datos.get('email')).toBe(FICHA.email);
    expect(datos.get('phone')).toBe(FICHA.phone);
    expect(datos.get('documentTypeCode')).toBe(FICHA.documentTypeCode);
    expect(datos.get('documentNumber')).toBe(FICHA.documentNumber);
    expect(datos.get('username')).toBe(FICHA.username);
    expect(datos.get(USER_ROLE_FIELD)).toBe(FICHA.roleId);
    expect(createUserActionMock).not.toHaveBeenCalled();
  });

  it('un rechazo de la EDICION tampoco cierra el panel', async () => {
    const user = setupUser();
    updateUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_email',
      message: 'Ya existe un usuario con ese correo.',
    });
    render(<PanelDePrueba user={FILA} />);
    await screen.findByTestId(USER_FORM_TESTID);

    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    await screen.findByTestId(USER_ERROR_TESTIDS.email);
    expect(screen.getByTestId(USER_FORM_TESTID)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('con exito se cierra, avisa y refresca la MISMA URL (R28, R29)', () => {
  /** Rellena los nueve del alta y envia. */
  async function altaCompleta(user: ReturnType<typeof setupUser>) {
    render(<PanelDePrueba />);
    await screen.findByTestId(USER_FORM_TESTID);

    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.firstNames), FICHA.firstNames);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.lastNames), FICHA.lastNames);
    // El campo de fecha no se teclea caracter a caracter: se le da su valor `YYYY-MM-DD`.
    fireEvent.change(screen.getByTestId(USER_FIELD_TESTIDS.birthDate), {
      target: { value: toDateInputValue(FICHA.birthDate) },
    });
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.email), FICHA.email);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.phone), FICHA.phone);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.documentNumber), FICHA.documentNumber);
    await user.type(screen.getByTestId(USER_FIELD_TESTIDS.username), FICHA.username);
    await user.click(screen.getByTestId(USER_FIELD_TESTIDS.roleId));
    const opciones = await screen.findAllByTestId(USER_ROLE_OPTION_TESTID);
    await user.click(await esperarInteractiva(opciones[0]!));
    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));
  }

  it('el alta cierra el panel, avisa una vez y refresca sin tocar la URL', async () => {
    const user = setupUser();
    await altaCompleta(user);

    await waitFor(() => expect(createUserActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(USER_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('el aviso del alta es NEUTRO: ni credencial, ni enlace, ni via de acceso (R28)', async () => {
    const user = setupUser();
    await altaCompleta(user);

    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    const aviso = String(toastExito.mock.calls[0]![0]);
    // Se afirma en NEGATIVO sobre lo que R28 prohibe decir, no sobre el copy elegido (R41).
    expect(aviso).not.toMatch(/contrase|password|credencial|enlace|link|acceso|entrar|token/i);
    // Y el identificador que devuelve el alta no se usa para navegar a ninguna parte.
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('la edicion cierra el panel, avisa una vez y refresca', async () => {
    const user = setupUser();
    render(<PanelDePrueba user={FILA} />);
    await screen.findByTestId(USER_FORM_TESTID);

    await user.click(screen.getByTestId(USER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateUserActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(USER_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el panel no monta ninguna region de avisos propia (R29)', async () => {
    render(<PanelDePrueba />);
    await screen.findByTestId(USER_FORM_TESTID);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});

describe('en la zona privada hay EXACTAMENTE UNA region de avisos (R29)', () => {
  /** Todos los `.tsx` de `app/(private)/`, leidos del disco. */
  function archivosPrivados(dir: string, acumulado: { rel: string; source: string }[] = []) {
    for (const nombre of readdirSync(dir)) {
      const abs = join(dir, nombre);
      if (statSync(abs).isDirectory()) archivosPrivados(abs, acumulado);
      else if (nombre.endsWith('.tsx')) {
        acumulado.push({ rel: abs, source: readFileSync(abs, 'utf8') });
      }
    }
    return acumulado;
  }

  it('solo el layout privado monta un `<Toaster />`, y una sola vez', () => {
    const raiz = join(process.cwd(), 'app', '(private)');
    const archivos = archivosPrivados(raiz);

    // Si el barrido quedara vacio, el conteo de abajo seria un falso verde.
    expect(archivos.length).toBeGreaterThan(10);

    // Los comentarios se descartan: media docena de archivos EXPLICAN que el `<Toaster />` lo
    // monta el layout privado, y contar esas menciones convertiria la comprobacion en ruido.
    const sinComentarios = (codigo: string) =>
      codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const montajes = archivos.flatMap(({ rel, source }) =>
      [...sinComentarios(source).matchAll(/<\s*Toaster\b/g)].map(() => rel),
    );
    expect(montajes).toHaveLength(1);
    expect(montajes[0]).toBe(join(raiz, 'layout.tsx'));
  });
});

// QC-101 T9 — El cierre de TODAS las sesiones de otra persona, desde el panel de detalle:
// R7, R9, R10, R11, R12, R13, R14 y R16.
//
// Aqui vive la DECISION de si el control se emite —cuenta activa y no es uno mismo—, que la toma el
// panel con datos bajados por props. El dialogo aislado se prueba en
// `end-user-sessions-dialog.test.tsx`; el contrato del disparador, en `user-form.test.tsx`.
describe('el panel ofrece el cierre de sesiones solo sobre OTRA persona ACTIVA (QC-101)', () => {
  /** El actor de la sesion. Distinto de la fila salvo en el caso de R12. */
  const ACTOR_ID = 'u-actor';

  beforeEach(() => {
    endAllSessionsActionMock.mockResolvedValue({ status: 'success' });
  });

  /** Monta la edicion y espera a que el formulario este pintado. */
  async function abrirEdicion(user: UserRow, currentUserId: string | null = ACTOR_ID) {
    const montado = render(<PanelDePrueba user={user} currentUserId={currentUserId} />);
    await screen.findByTestId(USER_FORM_TESTID);
    return montado;
  }

  it('R7 — sobre otra persona activa se ofrece dentro del panel, con su nombre en el nombre accesible', async () => {
    await abrirEdicion(FILA);

    const disparador = screen.getByRole('button', { name: endUserSessionsLabel(FILA.displayName) });
    expect(disparador).toBe(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    expect(screen.getByTestId(USER_SHEET_TESTID).contains(disparador)).toBe(true);
  });

  const NO_ACTIVOS = USER_ACCOUNT_STATUSES.filter((estado) => estado !== 'active');

  it('R11 — ancla: hay estados no activos que comprobar', () => {
    // Sin esto, el bucle de abajo podria no generar ningun caso y pasar en verde sin mirar nada.
    expect(NO_ACTIVOS.length).toBeGreaterThan(0);
    expect(USER_ACCOUNT_STATUSES).toContain('active');
  });

  for (const estado of NO_ACTIVOS) {
    it(`R11 — con la cuenta \`${estado}\` el control NO existe en el DOM`, async () => {
      await abrirEdicion({ ...FILA, accountStatus: estado });

      expect(screen.queryAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(0);
      expect(
        screen.queryByRole('button', { name: endUserSessionsLabel(FILA.displayName) }),
      ).toBeNull();
    });
  }

  it('R11 — en el alta, que no tiene sujeto, el control tampoco existe', async () => {
    render(<PanelDePrueba currentUserId={ACTOR_ID} />);
    await screen.findByTestId(USER_FORM_TESTID);

    expect(screen.queryAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(0);
  });

  it('R12 — si la persona del panel es el propio actor, el control NO existe en el DOM', async () => {
    await abrirEdicion(FILA, FILA.id);

    expect(screen.queryAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: endUserSessionsLabel(FILA.displayName) }),
    ).toBeNull();
  });

  it('R9 — pulsar el disparador abre la confirmacion con el nombre y NO invoca la action', async () => {
    const user = setupUser();
    await abrirEdicion(FILA);

    await user.click(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));

    const dialogo = await screen.findByTestId(END_USER_SESSIONS_DIALOG_TESTID);
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByTestId(END_USER_SESSIONS_MESSAGE_TESTID)).toHaveTextContent(
      FILA.displayName,
    );
    expect(endAllSessionsActionMock).not.toHaveBeenCalled();
    // Y el dialogo NO vive dentro del `<form>` de edicion.
    expect(screen.getByTestId(USER_FORM_TESTID).contains(dialogo)).toBe(false);
  });

  it('R9 — volver cierra la confirmacion sin invocar nada y el panel sigue abierto', async () => {
    const user = setupUser();
    await abrirEdicion(FILA);

    await user.click(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    await user.click(await screen.findByTestId(END_USER_SESSIONS_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(END_USER_SESSIONS_DIALOG_TESTID)).toBeNull());
    expect(endAllSessionsActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(USER_FORM_TESTID)).toBeInTheDocument();
  });

  it('R10 — confirmar invoca la action EXACTAMENTE una vez con el id, y NINGUNA escritura de edicion', async () => {
    const user = setupUser();
    await abrirEdicion(FILA);

    await user.click(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    // El disparador por si solo no envio el formulario de edicion.
    expect(updateUserActionMock).not.toHaveBeenCalled();

    await user.click(await screen.findByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    await waitFor(() => expect(endAllSessionsActionMock).toHaveBeenCalledTimes(1));
    const enviado = endAllSessionsActionMock.mock.calls[0]![1];
    expect(enviado.get(END_USER_SESSIONS_ID_FIELD)).toBe(FILA.id);
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(endAllSessionsActionMock).toHaveBeenCalledTimes(1);
    expect(updateUserActionMock).not.toHaveBeenCalled();
    expect(createUserActionMock).not.toHaveBeenCalled();
  });

  it('R13 — con exito se cierra la confirmacion, se avisa una vez y se refresca sin navegar', async () => {
    const user = setupUser();
    await abrirEdicion(FILA);

    await user.click(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    await user.click(await screen.findByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    await waitFor(() => expect(screen.queryByTestId(END_USER_SESSIONS_DIALOG_TESTID)).toBeNull());
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('R14 — un rechazo se pinta dentro de la confirmacion, que sigue abierta, sin aviso de exito', async () => {
    const user = setupUser();
    endAllSessionsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    await abrirEdicion(FILA);

    await user.click(screen.getByTestId(USER_FORM_END_SESSIONS_TESTID));
    await user.click(await screen.findByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    const dialogo = await screen.findByTestId(END_USER_SESSIONS_DIALOG_TESTID);
    await waitFor(() =>
      expect(dialogo.querySelector('[data-code="unauthorized"]')).not.toBeNull(),
    );
    expect(screen.getByTestId(USER_FORM_TESTID)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('R16 — el control lo gobiernan SOLO las props: cambiar `currentUserId` lo quita y lo devuelve', async () => {
    const { rerender } = await abrirEdicion(FILA, ACTOR_ID);
    expect(screen.getAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(1);

    rerender(<PanelDePrueba user={FILA} currentUserId={FILA.id} />);
    await waitFor(() =>
      expect(screen.queryAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(0),
    );

    rerender(<PanelDePrueba user={FILA} currentUserId={ACTOR_ID} />);
    expect(await screen.findAllByTestId(USER_FORM_END_SESSIONS_TESTID)).toHaveLength(1);
  });

  it('R16 — ni el panel, ni el formulario, ni el dialogo leen la sesion o la composicion', () => {
    const carpeta = join(process.cwd(), 'app', '(private)', 'configuracion', 'usuarios', 'components');
    const sinComentarios = (codigo: string) =>
      codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const archivo of ['user-sheet.tsx', 'user-form.tsx', 'end-user-sessions-dialog.tsx']) {
      const codigo = sinComentarios(readFileSync(join(carpeta, archivo), 'utf8'));
      // Anti-vacuidad: el archivo existe, es de cliente y tiene codigo.
      expect(codigo, archivo).toMatch(/^\s*['"]use client['"]/);
      for (const prohibido of [
        '@/lib/composition',
        'getSessionUser',
        'getSessionContext',
        'next/headers',
        'cookies(',
        '@/lib/shared/db',
        '@prisma/client',
      ]) {
        expect(codigo, `${archivo} no debe usar ${prohibido}`).not.toContain(prohibido);
      }
    }
  });
});
