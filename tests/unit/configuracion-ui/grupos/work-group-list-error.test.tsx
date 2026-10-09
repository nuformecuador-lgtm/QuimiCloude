// QC-85 T5 — El estado de error de la lista de grupos: R11, R19, R40, R41.
//
// **El mensaje que se afirma es el que el doble DEVOLVIO**, nunca copy escrito aqui: quien sabe
// que paso es el modulo, y la pantalla decide donde pintarlo, no que dice (R41).
//
// **El `code` es el dato estable** y por eso es el que distingue los casos: un rechazo se reconoce
// por su codigo y jamas por su texto (R11, `design.md > 7`).
//
// La tabla se monta SOLA —sin la seccion— y en estado de error, porque lo que aqui se mide es su
// forma: que dice que fallo, que ofrece reintentar de verdad y que no pinta ninguna tabla. El
// despacho a este estado lo cubre `work-group-list-section.test.tsx`.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_LIST_ERROR_CODE_TESTID,
  WORK_GROUP_LIST_ERROR_MESSAGE_TESTID,
  WORK_GROUP_LIST_ERROR_TESTID,
  WORK_GROUP_LIST_RETRY_TESTID,
  WorkGroupTable,
} from '@/app/(private)/configuracion/usuarios/components';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import type { ErrorState } from '@/lib/modules/errores';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { setupUser } from '../../../helpers/user-event';
import { REFERENCIA_DEL_CASO, errorInesperado } from '../../../helpers/identificador-de-request';

const { routerMock } = vi.hoisted(() => ({
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

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar el error`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la pestana de grupos`);
  };
  return {
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: vi.fn(() => {
    throw new Error('listRolesAction no debe invocarse desde la pestana de grupos');
  }),
}));

/** Los codigos con los que las siete operaciones pueden rechazar una LECTURA de la lista. */
const CODIGOS: readonly ErrorState[] = [
  { status: 'error', code: 'unauthorized', message: 'No tienes permiso.' },
  { status: 'error', code: 'invalid_input', message: 'La consulta no es válida.' },
];

function renderError(error: ErrorState) {
  return render(
    <WorkGroupTable
      status="error"
      error={error}
      groups={[]}
      params={{ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '' }}
      totalPages={0}
      canModify
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('el error es identificable y dice QUE paso, con su codigo estable (R19, R41)', () => {
  for (const error of CODIGOS) {
    it(`el codigo ${error.code} se pinta aparte del mensaje devuelto`, () => {
      renderError(error);

      expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(
        error.message,
      );
      expect(screen.getByTestId(WORK_GROUP_LIST_ERROR_CODE_TESTID)).toHaveTextContent(error.code);
    });
  }

  it('NO pinta ninguna tabla: «fallo» no es «no hay grupos» (R19)', () => {
    renderError(CODIGOS[0]!);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });
});

describe('el reintento reintenta de verdad, y es alcanzable con el dedo (R19, R40)', () => {
  it('pulsarlo vuelve a pedir los datos con `router.refresh`, no navega a la misma URL', async () => {
    const user = setupUser();
    renderError(CODIGOS[0]!);

    await user.click(screen.getByTestId(WORK_GROUP_LIST_RETRY_TESTID));

    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el control mide al menos 44x44 px y no depende de `:hover` para aparecer', () => {
    renderError(CODIGOS[0]!);

    const boton = screen.getByTestId(WORK_GROUP_LIST_RETRY_TESTID);
    expect(boton.className).toContain('min-h-11');
    expect(boton.className).toContain('min-w-11');
    expect(boton.className).not.toContain('hover:block');
    expect(boton).toBeVisible();
  });
});

describe('el error INESPERADO conserva el identificador de la peticion (QC-71)', () => {
  it('lo pinta el componente compartido, no una segunda region propia', () => {
    renderError(errorInesperado());

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA_DEL_CASO,
    );
    // El catalogado y el inesperado son dos presentaciones distintas, no la misma con un extra.
    expect(screen.queryByTestId(WORK_GROUP_LIST_ERROR_CODE_TESTID)).toBeNull();
    expect(screen.getByTestId(WORK_GROUP_LIST_RETRY_TESTID)).toBeEnabled();
  });
});
