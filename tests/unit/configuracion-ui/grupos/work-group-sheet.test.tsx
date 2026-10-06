// QC-85 T10 — El panel lateral de alta y edicion de un grupo: R20, R35 (y R25 en la parte de
// «bajo el nombre, los miembros»).
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `identity`, que esta ficha solo
// consume (R36). `listWorkGroupMembersAction` es ademas el punto de observacion de «el alta NO
// pide miembros» —no hay grupo al que pedirselos—.
//
// **Ningun assert sobre literales de copy** (R41): el panel se localiza por su `data-testid` y por
// el `data-slot` del primitivo, y el modo por su `data-mode`.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_FORM_CANCEL_TESTID,
  WORK_GROUP_FORM_SUBMIT_TESTID,
  WORK_GROUP_MEMBERS_TESTID,
  WORK_GROUP_NAME_FIELD_TESTID,
  WORK_GROUP_SHEET_TESTID,
  WorkGroupSheet,
} from '@/app/(private)/configuracion/usuarios/components';
import type { WorkGroupRow } from '@/lib/modules/identity';
import type {
  CreateWorkGroupFormState,
  WorkGroupCandidateListResult,
  WorkGroupMemberListResult,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { setupUser } from '../../../helpers/user-event';

const {
  routerMock,
  createWorkGroupActionMock,
  listWorkGroupMembersActionMock,
  listWorkGroupCandidatesActionMock,
} = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createWorkGroupActionMock:
    vi.fn<(prev: CreateWorkGroupFormState, data: FormData) => Promise<CreateWorkGroupFormState>>(),
  listWorkGroupMembersActionMock:
    vi.fn<(workGroupId: string, query: unknown) => Promise<WorkGroupMemberListResult>>(),
  listWorkGroupCandidatesActionMock:
    vi.fn<(query: unknown) => Promise<WorkGroupCandidateListResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el panel`);
  };
  return {
    createWorkGroupAction: createWorkGroupActionMock,
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: listWorkGroupMembersActionMock,
    // El ALTA monta el picker de miembros iniciales (`WorkGroupMemberPicker`), que SI consulta
    // esta action siempre (QC-85 ampliacion).
    listWorkGroupCandidatesAction: listWorkGroupCandidatesActionMock,
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al abrir el panel`);
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

const GRUPO: WorkGroupRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Laboratorio',
  members: [],
};

/** Los cuatro archivos de las escrituras: ninguno monta una segunda region de avisos (R35). */
const ARCHIVOS_DE_LAS_ESCRITURAS = [
  'work-group-form.tsx',
  'work-group-members.tsx',
  'work-group-sheet.tsx',
  'delete-work-group-dialog.tsx',
] as const;

/**
 * La fuente **sin comentarios**: las guardias miran codigo, no prosa. Sin esto, el JSDoc que
 * explica sobre que region se avisa —y que por tanto la nombra— pondria este caso rojo, y el
 * remedio seria dejar de documentar.
 */
function fuenteDe(archivo: string): string {
  return codigoDe(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'app',
      '(private)',
      'configuracion',
      'usuarios',
      'components',
      archivo,
    ),
  );
}

function codigoDe(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Si alguien pidio CERRAR: el primer argumento de alguna llamada fue `false`. */
function seCerro(onOpenChange: { mock: { calls: unknown[][] } }): boolean {
  return onOpenChange.mock.calls.some((argumentos) => argumentos[0] === false);
}

function montar(group: WorkGroupRow | null, onOpenChange = vi.fn<(open: boolean) => void>()) {
  render(<WorkGroupSheet group={group} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  toastExito = vi.spyOn(toast, 'success').mockImplementation(() => 'id');
  createWorkGroupActionMock.mockResolvedValue({ status: 'success', id: 'nuevo' });
  listWorkGroupMembersActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
  });
  listWorkGroupCandidatesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  toastExito.mockRestore();
});

describe('es un PANEL LATERAL, no una pagina ni un dialogo modal centrado (R20)', () => {
  it('lo que se monta es el primitivo del panel, anclado a un lado', async () => {
    montar(null);

    const panel = await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel).toHaveAttribute('data-side', 'right');
    // No es una confirmacion: el dialogo modal centrado es el del borrado.
    expect(panel).not.toHaveAttribute('role', 'alertdialog');
  });

  it('abrirlo NO navega a ninguna otra URL: la lista de detras conserva sus parametros', async () => {
    montar(GRUPO);

    await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrarlo por cancelacion tampoco navega: solo suelta el estado del panel', async () => {
    const user = setupUser();
    const onOpenChange = montar(null);

    await user.click(await screen.findByTestId(WORK_GROUP_FORM_CANCEL_TESTID));

    // El primitivo pasa mas argumentos que el `open`: se mira el PRIMERO, que es el unico que
    // este componente declara en su prop.
    await waitFor(() => expect(seCerro(onOpenChange)).toBe(true));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('un solo panel para los dos modos (`design.md > 5`)', () => {
  it('el alta pinta solo el nombre: sin miembros y sin pedirlos', async () => {
    montar(null);

    const panel = await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-mode', 'create');
    expect(panel).toHaveAttribute('data-work-group-id', '');
    expect(screen.getByTestId(WORK_GROUP_NAME_FIELD_TESTID)).toHaveValue('');
    expect(screen.queryByTestId(WORK_GROUP_MEMBERS_TESTID)).toBeNull();
    expect(listWorkGroupMembersActionMock).not.toHaveBeenCalled();
  });

  it('la edicion llega PRECARGADA con el nombre de la fila, sin segunda lectura de ficha', async () => {
    montar(GRUPO);

    const panel = await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-mode', 'edit');
    expect(panel).toHaveAttribute('data-work-group-id', GRUPO.id);
    expect(screen.getByTestId(WORK_GROUP_NAME_FIELD_TESTID)).toHaveValue(GRUPO.name);
  });

  it('y debajo del nombre, los miembros de ESE grupo (R25)', async () => {
    montar(GRUPO);

    expect(await screen.findByTestId(WORK_GROUP_MEMBERS_TESTID)).toBeInTheDocument();
    await waitFor(() => expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(1));
    expect(listWorkGroupMembersActionMock.mock.calls[0]![0]).toBe(GRUPO.id);
  });

  it('el panel no pide ninguna ficha de grupo: esa consulta no existe (R36)', async () => {
    montar(GRUPO);

    await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(fuenteDe('work-group-sheet.tsx')).not.toContain('getWorkGroup');
  });
});

describe('con exito cierra, avisa y refresca sin recargar (R35)', () => {
  it('el alta cierra el panel, avisa por toast y reejecuta la lista con la MISMA URL', async () => {
    const user = setupUser();
    const onOpenChange = montar(null);

    await user.type(await screen.findByTestId(WORK_GROUP_NAME_FIELD_TESTID), 'Turno Noche');
    fireEvent.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(seCerro(onOpenChange)).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    // `refresh` y no `push`: la pestana y los parametros de lista son los de antes de abrir.
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('ninguna pieza de las escrituras monta una segunda region de avisos', () => {
    for (const archivo of ARCHIVOS_DE_LAS_ESCRITURAS) {
      const fuente = fuenteDe(archivo);
      expect(fuente, `${archivo} no debe montar un Toaster`).not.toContain('Toaster');
      expect(fuente, `${archivo} debe emitir sobre el heredado`).not.toContain('sonner/dist');
    }
    // Y en el DOM del panel no hay ninguna region de avisos propia.
    montar(null);
    expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(0);
  });
});
