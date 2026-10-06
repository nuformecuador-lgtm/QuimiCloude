// El disparador del alta de grupo, ahora que vive FUERA de la tabla (decision del 2026-09-17).
//
// **Lo que este archivo existe para impedir que vuelva a pasar, y aqui era total.** El boton lo
// montaba `work-group-table.tsx`, que la seccion solo renderiza cuando hay filas. Pero **los grupos
// no los siembra nadie**: toda instalacion arranca en cero, cae en el estado vacio y se quedaba sin
// boton, asi que el PRIMER grupo era imposible de crear desde la interfaz —y para siempre, porque
// la unica salida del cero estaba dentro de lo que el cero apagaba—. La cobertura de que el boton
// sobrevive a la lista vacia esta en `work-group-list-section.test.tsx`; aqui se prueba la pieza.
//
// **Ningun assert sobre copy** (R41): el disparador se localiza por su constante exportada.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_CREATE_OPEN_TESTID,
  WORK_GROUP_FORM_CANCEL_TESTID,
  WORK_GROUP_SHEET_TESTID,
  WorkGroupCreateAction,
} from '@/app/(private)/configuracion/usuarios/components';
import type { WorkGroupCandidateListResult } from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { setupUser } from '../../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../../helpers/viewport';

const { routerMock, listWorkGroupCandidatesActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listWorkGroupCandidatesActionMock: vi.fn<(query: unknown) => Promise<WorkGroupCandidateListResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

// Dobles que FALLAN si se les llama: el alta no lee nada y no escribe hasta que se envia el
// formulario, que este archivo no llega a enviar (R10, R36).
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el disparador del alta`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    // El alta NO tiene miembros que listar: un grupo que todavia no existe no tiene a nadie. Por
    // eso este doble tambien falla, a diferencia del de la tabla, donde la edicion si la pide.
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
    // El picker de miembros iniciales, que el panel de alta monta siempre, la consulta al montarse.
    listWorkGroupCandidatesAction: listWorkGroupCandidatesActionMock,
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el disparador del alta`);
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

beforeEach(() => {
  vi.clearAllMocks();
  setViewportWidth(WIDE_VIEWPORT);
  listWorkGroupCandidatesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el disparador del alta de grupo', () => {
  it('se emite con `usuarios.modificar` y arranca con el panel CERRADO', () => {
    render(<WorkGroupCreateAction canModify />);

    expect(screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID)).toBeEnabled();
    expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull();
  });

  it('sin `usuarios.modificar` no emite NADA: ni boton, ni panel (R9)', () => {
    render(<WorkGroupCreateAction canModify={false} />);

    expect(screen.queryByTestId(WORK_GROUP_CREATE_OPEN_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull();
  });

  it('abre el panel SIN sujeto y sin navegar a ninguna otra URL (R20)', async () => {
    const user = setupUser();
    render(<WorkGroupCreateAction canModify />);

    await user.click(screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID));

    const panel = await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-mode', 'create');
    expect(panel).toHaveAttribute('data-work-group-id', '');
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('cerrar desmonta el panel, de modo que la siguiente apertura arranca limpia', async () => {
    const user = setupUser();
    render(<WorkGroupCreateAction canModify />);

    await user.click(screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID));
    await user.click(await screen.findByTestId(WORK_GROUP_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull());

    await user.click(screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID));
    expect(await screen.findByTestId(WORK_GROUP_SHEET_TESTID)).toHaveAttribute(
      'data-mode',
      'create',
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el area tactil del disparador llega a 44x44 px (R40)', () => {
    render(<WorkGroupCreateAction canModify />);

    const boton = screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID);
    for (const token of ['min-h-11', 'min-w-11']) {
      expect(boton.className).toContain(token);
    }
  });
});
