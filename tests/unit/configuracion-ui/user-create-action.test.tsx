// El disparador del alta de usuario, ahora que vive FUERA de la tabla (decision del 2026-09-17).
//
// **Lo que este archivo existe para impedir que vuelva a pasar.** El boton lo montaba
// `user-table.tsx`, y la seccion solo renderiza esa tabla cuando la consulta devuelve filas. Como
// el listado excluye al actor (QC-66 R35), una instalacion recien sembrada —un unico usuario, que
// es quien mira la pantalla— caia en el estado vacio y se quedaba **sin ningun camino al alta**.
// La cobertura de que el boton sobrevive a la lista vacia esta en `user-list-section.test.tsx`;
// aqui se prueba la pieza en si.
//
// **Ningun assert sobre copy** (R41): el disparador se localiza por su constante exportada.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USER_CREATE_OPEN_TESTID,
  USER_FORM_CANCEL_TESTID,
  USER_FORM_TESTID,
  USER_SHEET_TESTID,
  UserCreateAction,
} from '@/app/(private)/configuracion/usuarios/components';
import type { RoleOption } from '@/lib/modules/identity';
import { setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock, getUserActionMock } = vi.hoisted(() => ({
  getUserActionMock: vi.fn(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

// Dobles que FALLAN si se les llama: el alta no lee la lista y no escribe hasta que se envia el
// formulario, que este archivo no llega a enviar (R36).
vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el disparador del alta`);
  };
  return {
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
    getUserAction: getUserActionMock,
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: vi.fn(() => {
    throw new Error('listRolesAction no debe invocarse desde el disparador del alta');
  }),
}));

const ROLES: readonly RoleOption[] = [{ id: 'r1', name: 'Operador' }];

function montar(canModify = true) {
  return render(
    <UserCreateAction
      canModify={canModify}
      currentUserId={null}
      roles={ROLES}
      rolesError={null}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserActionMock.mockRejectedValue(
    new Error('getUserAction no debe invocarse: el alta no tiene sujeto'),
  );
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el disparador del alta de usuario', () => {
  it('se emite con `usuarios.modificar` y arranca con el panel CERRADO', () => {
    montar();

    expect(screen.getByTestId(USER_CREATE_OPEN_TESTID)).toBeEnabled();
    expect(screen.queryByTestId(USER_SHEET_TESTID)).toBeNull();
  });

  it('sin `usuarios.modificar` no emite NADA: ni boton, ni panel (R6)', () => {
    montar(false);

    expect(screen.queryByTestId(USER_CREATE_OPEN_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_SHEET_TESTID)).toBeNull();
  });

  it('abre el panel SIN sujeto: no precarga ninguna ficha ni navega (R22)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(USER_CREATE_OPEN_TESTID));

    expect(await screen.findByTestId(USER_FORM_TESTID)).toBeInTheDocument();
    // El alta no tiene a quien consultar, asi que la segunda lectura de R26 no debe sonar.
    expect(getUserActionMock).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('cerrar desmonta el panel, de modo que la siguiente apertura arranca limpia', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(USER_CREATE_OPEN_TESTID));
    await user.click(await screen.findByTestId(USER_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(USER_SHEET_TESTID)).toBeNull());

    // Y vuelve a abrirse: cerrar suelta el estado, no lo deja inservible.
    await user.click(screen.getByTestId(USER_CREATE_OPEN_TESTID));
    expect(await screen.findByTestId(USER_FORM_TESTID)).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el area tactil del disparador llega a 44x44 px (R40)', () => {
    montar();

    const boton = screen.getByTestId(USER_CREATE_OPEN_TESTID);
    for (const token of ['min-h-11', 'min-w-11']) {
      expect(boton.className).toContain(token);
    }
  });
});
