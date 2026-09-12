// QC-85 T9 — Los miembros del grupo abierto: R25, R26, R27, R28, R29, R30, R31, R32 (y R35 en la
// parte del aviso).
//
// **Las tres Server Actions implicadas estan mockeadas** —la consulta de miembros, la consulta de
// personas y las dos mutaciones—: son el borde del modulo `identity`, que esta ficha solo consume
// (R36), y son ademas el punto de observacion de casi todo lo de aqui —«se vuelve a consultar»,
// «se manda de a una», «no se filtra en el cliente»—.
//
// **Ningun assert sobre literales de copy** (R41): filas, controles y regiones de error se
// localizan por `data-testid` exportado, la posicion dentro del total se lee de los `data-*` del
// indicador, y los textos de error se comparan contra `errorMessage(code)` —el catalogo—, nunca
// contra una frase escrita aqui.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_ADD_ERROR_TESTID,
  WORK_GROUP_CANDIDATE_TESTID,
  WORK_GROUP_ID_FIELD,
  WORK_GROUP_MEMBERS_ERROR_TESTID,
  WORK_GROUP_MEMBERS_LOADING_TESTID,
  WORK_GROUP_MEMBERS_NEXT_TESTID,
  WORK_GROUP_MEMBERS_POSITION_TESTID,
  WORK_GROUP_MEMBERS_PREVIOUS_TESTID,
  WORK_GROUP_MEMBER_ID_FIELD,
  WORK_GROUP_MEMBER_NAME_TESTID,
  WORK_GROUP_MEMBER_REMOVE_TESTID,
  WORK_GROUP_MEMBER_ROW_TESTID,
  WORK_GROUP_MEMBER_SEARCH_TESTID,
  WORK_GROUP_REMOVE_ERROR_TESTID,
  WorkGroupMembers,
} from '@/app/(private)/configuracion/usuarios/components';
import { SEARCH_DEBOUNCE_MS } from '@/components/shared/data-table';
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';
import type { Page, UserRow, WorkGroupMemberRow } from '@/lib/modules/identity';
import type { UserListResult } from '@/lib/modules/identity/adapters/driving/user-actions';
import type {
  WorkGroupMemberListResult,
  WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { setupUser } from '../../../helpers/user-event';

const {
  listWorkGroupMembersActionMock,
  addWorkGroupMemberActionMock,
  removeWorkGroupMemberActionMock,
  listUsersActionMock,
} = vi.hoisted(() => ({
  listWorkGroupMembersActionMock:
    vi.fn<(workGroupId: string, query: unknown) => Promise<WorkGroupMemberListResult>>(),
  addWorkGroupMemberActionMock:
    vi.fn<
      (prev: WorkGroupMutationFormState, data: FormData) => Promise<WorkGroupMutationFormState>
    >(),
  removeWorkGroupMemberActionMock:
    vi.fn<
      (prev: WorkGroupMutationFormState, data: FormData) => Promise<WorkGroupMutationFormState>
    >(),
  listUsersActionMock: vi.fn<(query: unknown) => Promise<UserListResult>>(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la lista de miembros`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: addWorkGroupMemberActionMock,
    removeWorkGroupMemberAction: removeWorkGroupMemberActionMock,
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: listWorkGroupMembersActionMock,
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la lista de miembros`);
  };
  return {
    listUsersAction: listUsersActionMock,
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

const GRUPO_ID = '11111111-1111-4111-8111-111111111111';
const OTRO_GRUPO_ID = '22222222-2222-4222-8222-222222222222';

/** Llegan a proposito DESORDENADOS por nombre: R25 se comprueba con ellos. */
const MIEMBROS: readonly WorkGroupMemberRow[] = [
  { id: 'u3', displayName: 'Zapata Ruiz, Carla' },
  { id: 'u1', displayName: 'Lopez Perez, Ana' },
  { id: 'u2', displayName: 'Mora Diaz, Beto' },
];

/**
 * Un candidato con TODO lo que `UserRow` trae. Existe asi a proposito: sirve para demostrar que de
 * la persona solo se pinta el nombre mostrable y que su correo, su documento y su estado de cuenta
 * no llegan al DOM (R31, pregunta abierta 2).
 */
const CANDIDATO: UserRow = {
  id: 'u9',
  displayName: 'Nieto Salas, Dario',
  username: 'dario.nieto',
  email: 'dario.nieto@example.com',
  roleName: 'Operario',
  accountStatus: 'pending',
};

function paginaDeMiembros(
  items: readonly WorkGroupMemberRow[],
  overrides: Partial<Page<WorkGroupMemberRow>> = {},
): Page<WorkGroupMemberRow> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

function montar(workGroupId = GRUPO_ID) {
  return render(<WorkGroupMembers workGroupId={workGroupId} />);
}

/** Espera a que la lista este pintada: el panel arranca SIEMPRE en «cargando» (R27). */
async function esperarLista() {
  await waitFor(() =>
    expect(screen.queryByTestId(WORK_GROUP_MEMBERS_LOADING_TESTID)).toBeNull(),
  );
}

function filas(): HTMLElement[] {
  return screen.queryAllByTestId(WORK_GROUP_MEMBER_ROW_TESTID);
}

function nombresPintados(): string[] {
  return screen
    .queryAllByTestId(WORK_GROUP_MEMBER_NAME_TESTID)
    .map((elemento) => elemento.textContent ?? '');
}

/**
 * Escribe en el buscador y espera al candidato. **Con temporizadores reales**: el rebote es de
 * `SEARCH_DEBOUNCE_MS` y `findBy*` espera hasta un segundo, asi que la espera es la de verdad. Los
 * casos que solo miran la LLAMADA —y no el DOM— si falsean el reloj, para demostrar que antes del
 * rebote no se consulta.
 */
async function buscarCandidato(): Promise<HTMLElement> {
  fireEvent.change(screen.getByTestId(WORK_GROUP_MEMBER_SEARCH_TESTID), {
    target: { value: 'nieto' },
  });
  return screen.findByTestId(WORK_GROUP_CANDIDATE_TESTID);
}

/** Fuente de la lista de miembros sin comentarios. */
function fuenteDeLosMiembros(): string {
  const ruta = join(
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
    'work-group-members.tsx',
  );
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  toastExito = vi.spyOn(toast, 'success').mockImplementation(() => 'id');
  listWorkGroupMembersActionMock.mockResolvedValue({
    status: 'success',
    data: paginaDeMiembros(MIEMBROS),
  });
  addWorkGroupMemberActionMock.mockResolvedValue({ status: 'success' });
  removeWorkGroupMemberActionMock.mockResolvedValue({ status: 'success' });
  listUsersActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [CANDIDATO], total: 1, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  toastExito.mockRestore();
  vi.useRealTimers();
});

describe('se pinta lo que la operacion devuelve, y nada mas (R25, R31)', () => {
  it('pide la lista del grupo abierto con solo pagina y tamano', async () => {
    montar();
    await esperarLista();

    expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(1);
    const [grupo, consulta] = listWorkGroupMembersActionMock.mock.calls[0]!;
    expect(grupo).toBe(GRUPO_ID);
    // Las tres listas blancas de la consulta de miembros estan vacias: no hay orden, ni filtro,
    // ni busqueda que pedir.
    expect(Object.keys(consulta as object).sort()).toEqual(['page', 'pageSize']);
  });

  it('las filas se pintan en el ORDEN en que llegan: aqui no se ordena ni se filtra', async () => {
    montar();
    await esperarLista();

    expect(nombresPintados()).toEqual(MIEMBROS.map((miembro) => miembro.displayName));
    expect(filas()).toHaveLength(MIEMBROS.length);
  });

  it('de cada persona se pinta SOLO su nombre mostrable (R31)', async () => {
    montar();
    await esperarLista();

    for (const [indice, fila] of filas().entries()) {
      const miembro = MIEMBROS[indice]!;
      expect(within(fila).getByTestId(WORK_GROUP_MEMBER_NAME_TESTID)).toHaveTextContent(
        miembro.displayName,
      );
      expect(fila).toHaveAttribute('data-user-id', miembro.id);
      // Ni correo, ni documento, ni nombre de usuario, ni estado de cuenta.
      for (const prohibido of ['@', 'pending', 'active', 'inactive', 'blocked']) {
        expect(fila.textContent ?? '').not.toContain(prohibido);
      }
    }
  });

  it('y su fuente no nombra ningun dato de credencial ni de estado de cuenta (R31)', () => {
    const fuente = fuenteDeLosMiembros();

    for (const prohibido of [
      'accountStatus',
      'email',
      'documentNumber',
      'documentTypeCode',
      'passwordHash',
      'username',
    ]) {
      expect(fuente, `la lista de miembros no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });

  it('una respuesta tardia de OTRO grupo no pinta sus miembros', async () => {
    const otros: readonly WorkGroupMemberRow[] = [{ id: 'x1', displayName: 'De Otro Grupo, Eva' }];
    listWorkGroupMembersActionMock.mockImplementation(async (workGroupId) =>
      workGroupId === GRUPO_ID
        ? { status: 'success', data: paginaDeMiembros(MIEMBROS) }
        : { status: 'success', data: paginaDeMiembros(otros) },
    );

    const { rerender } = montar(OTRO_GRUPO_ID);
    rerender(<WorkGroupMembers workGroupId={GRUPO_ID} />);
    await esperarLista();

    expect(nombresPintados()).toEqual(MIEMBROS.map((miembro) => miembro.displayName));
  });
});

describe('la lista esta paginada, con la posicion dentro del total (R26)', () => {
  it('indica pagina, total de paginas y total de personas', async () => {
    listWorkGroupMembersActionMock.mockResolvedValue({
      status: 'success',
      data: paginaDeMiembros(MIEMBROS, { page: 2, total: 23, totalPages: 3 }),
    });
    montar();
    await esperarLista();

    const indicador = screen.getByTestId(WORK_GROUP_MEMBERS_POSITION_TESTID);
    expect(indicador).toHaveAttribute('role', 'status');
    expect(indicador).toHaveAttribute('data-page', '2');
    expect(indicador).toHaveAttribute('data-total-pages', '3');
    expect(indicador).toHaveAttribute('data-total', '23');
  });

  it('avanzar y retroceder vuelven a pedir la lista con esa pagina', async () => {
    const user = setupUser();
    // El doble responde SEGUN la pagina pedida: es lo que hace que los dos controles se habiliten
    // y se deshabiliten como lo harian con el servidor de verdad.
    listWorkGroupMembersActionMock.mockImplementation(async (_grupo, consulta) => ({
      status: 'success',
      data: paginaDeMiembros(MIEMBROS, {
        page: (consulta as { page: number }).page,
        total: 23,
        totalPages: 3,
      }),
    }));
    montar();
    await esperarLista();

    await user.click(screen.getByTestId(WORK_GROUP_MEMBERS_NEXT_TESTID));
    await waitFor(() => expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(2));
    expect(listWorkGroupMembersActionMock.mock.calls[1]![1]).toMatchObject({ page: 2 });

    await esperarLista();
    await user.click(screen.getByTestId(WORK_GROUP_MEMBERS_PREVIOUS_TESTID));
    await waitFor(() => expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(3));
    expect(listWorkGroupMembersActionMock.mock.calls[2]![1]).toMatchObject({ page: 1 });
  });

  it('en la primera pagina no se puede retroceder, y en la ultima no se puede avanzar', async () => {
    listWorkGroupMembersActionMock.mockResolvedValue({
      status: 'success',
      data: paginaDeMiembros(MIEMBROS, { page: 1, total: 3, totalPages: 1 }),
    });
    montar();
    await esperarLista();

    expect(screen.getByTestId(WORK_GROUP_MEMBERS_PREVIOUS_TESTID)).toBeDisabled();
    expect(screen.getByTestId(WORK_GROUP_MEMBERS_NEXT_TESTID)).toBeDisabled();
  });
});

describe('cargando y error viven DENTRO del panel (R27)', () => {
  it('mientras la lista se obtiene se dice, y no se pinta ninguna fila', async () => {
    listWorkGroupMembersActionMock.mockReturnValue(new Promise(() => {}));
    montar();

    const cargando = await screen.findByTestId(WORK_GROUP_MEMBERS_LOADING_TESTID);
    expect(cargando).toHaveAttribute('aria-busy', 'true');
    expect(filas()).toHaveLength(0);
  });

  it('con error se dice por su codigo, y NO se pinta una lista vacia', async () => {
    listWorkGroupMembersActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_not_found',
      message: errorMessage('work_group_not_found'),
    });
    montar();

    const error = await screen.findByTestId(WORK_GROUP_MEMBERS_ERROR_TESTID);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveAttribute('data-code', 'work_group_not_found');
    expect(error).toHaveTextContent(errorMessage('work_group_not_found'));
    expect(filas()).toHaveLength(0);
  });
});

describe('el buscador saca sus candidatos de la consulta de personas (R28)', () => {
  it('busca en el servidor sobre el conjunto entero, con rebote', async () => {
    vi.useFakeTimers();
    montar();
    await vi.advanceTimersByTimeAsync(0);

    fireEvent.change(screen.getByTestId(WORK_GROUP_MEMBER_SEARCH_TESTID), {
      target: { value: 'nieto' },
    });
    expect(listUsersActionMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(listUsersActionMock).toHaveBeenCalledTimes(1);
    expect(listUsersActionMock.mock.calls[0]![0]).toEqual({
      page: 1,
      pageSize: 10,
      sort: null,
      filters: {},
      search: 'nieto',
    });
  });

  it('elegir a una persona la mete DE A UNA, con los dos campos y ninguno mas', async () => {
    montar();
    await esperarLista();

    const candidato = await buscarCandidato();
    // Del candidato tampoco se pinta el estado de cuenta (pregunta abierta 2).
    expect(candidato).toHaveTextContent(CANDIDATO.displayName);
    expect(candidato.textContent ?? '').not.toContain(CANDIDATO.email);
    expect(candidato.textContent ?? '').not.toContain(CANDIDATO.accountStatus);

    fireEvent.click(candidato);

    await waitFor(() => expect(addWorkGroupMemberActionMock).toHaveBeenCalledTimes(1));
    const datos = addWorkGroupMemberActionMock.mock.calls[0]![1];
    expect([...datos.keys()].sort()).toEqual([WORK_GROUP_MEMBER_ID_FIELD, WORK_GROUP_ID_FIELD].sort());
    expect(datos.get(WORK_GROUP_ID_FIELD)).toBe(GRUPO_ID);
    expect(datos.get(WORK_GROUP_MEMBER_ID_FIELD)).toBe(CANDIDATO.id);
  });
});

describe('los cuatro «ya pertenece» son CUATRO casos, por su codigo (R29)', () => {
  // `as const`: son cuatro codigos CATALOGADOS, ninguno es el inesperado —que llevaria ademas su
  // identificador de peticion— y el tipo lo demuestra.
  const CODIGOS = [
    'work_group_member_exists',
    'work_group_member_exists_pending',
    'work_group_member_exists_inactive',
    'work_group_member_exists_blocked',
  ] as const satisfies readonly ErrorCode[];

  it('cada codigo produce una presentacion propia, y las cuatro son distintas', async () => {
    const presentaciones: string[] = [];

    for (const code of CODIGOS) {
      addWorkGroupMemberActionMock.mockResolvedValue({
        status: 'error',
        code,
        message: errorMessage(code),
      });

      montar();
      await esperarLista();
      fireEvent.click(await buscarCandidato());

      const region = await screen.findByTestId(WORK_GROUP_ADD_ERROR_TESTID);
      expect(region).toHaveAttribute('data-code', code);
      presentaciones.push(region.textContent ?? '');

      cleanup();
    }

    expect(new Set(presentaciones).size).toBe(CODIGOS.length);
  });

  it('el rechazo se queda DENTRO del panel y la lista no se toca', async () => {
    addWorkGroupMemberActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_member_exists_pending',
      message: errorMessage('work_group_member_exists_pending'),
    });
    montar();
    await esperarLista();
    fireEvent.click(await buscarCandidato());

    expect(await screen.findByTestId(WORK_GROUP_ADD_ERROR_TESTID)).toBeInTheDocument();
    // Ni se volvio a consultar, ni se inserto ninguna fila.
    expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(1);
    expect(nombresPintados()).toEqual(MIEMBROS.map((miembro) => miembro.displayName));
  });
});

describe('tras un exito se vuelve a consultar, y nada es optimista (R30)', () => {
  it('meter a alguien vuelve a pedir la lista y pinta lo que devuelva', async () => {
    // La segunda respuesta NO trae al recien anadido: es el caso de la persona `pending`, que si
    // entra en el grupo pero no se ve (`design.md > 10.2`). R30 prohibe compensarlo.
    montar();
    await esperarLista();
    fireEvent.click(await buscarCandidato());

    await waitFor(() => expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(2));
    await esperarLista();
    expect(nombresPintados()).toEqual(MIEMBROS.map((miembro) => miembro.displayName));
    expect(nombresPintados()).not.toContain(CANDIDATO.displayName);
    // Y se avisa sobre el `<Toaster />` heredado (R35).
    expect(toastExito).toHaveBeenCalledTimes(1);
  });

  it('sacar a alguien tambien vuelve a pedir la lista', async () => {
    const user = setupUser();
    montar();
    await esperarLista();

    listWorkGroupMembersActionMock.mockResolvedValue({
      status: 'success',
      data: paginaDeMiembros(MIEMBROS.slice(1)),
    });
    await user.click(screen.getAllByTestId(WORK_GROUP_MEMBER_REMOVE_TESTID)[0]!);

    await waitFor(() => expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(filas()).toHaveLength(MIEMBROS.length - 1));
    expect(toastExito).toHaveBeenCalledTimes(1);
  });
});

describe('sacar a alguien se pide por su identificador, y un rechazo no lo retira (R32)', () => {
  it('cada miembro tiene su accion de sacar, con los dos campos y ninguno mas', async () => {
    const user = setupUser();
    montar();
    await esperarLista();

    const objetivo = MIEMBROS[1]!;
    const fila = filas()[1]!;
    await user.click(within(fila).getByTestId(WORK_GROUP_MEMBER_REMOVE_TESTID));

    await waitFor(() => expect(removeWorkGroupMemberActionMock).toHaveBeenCalledTimes(1));
    const datos = removeWorkGroupMemberActionMock.mock.calls[0]![1];
    expect([...datos.keys()].sort()).toEqual([WORK_GROUP_MEMBER_ID_FIELD, WORK_GROUP_ID_FIELD].sort());
    expect(datos.get(WORK_GROUP_MEMBER_ID_FIELD)).toBe(objetivo.id);
  });

  it('`work_group_member_not_found` se pinta por su codigo y NO retira la fila', async () => {
    const user = setupUser();
    removeWorkGroupMemberActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_member_not_found',
      message: errorMessage('work_group_member_not_found'),
    });
    montar();
    await esperarLista();

    const objetivo = MIEMBROS[0]!;
    await user.click(screen.getAllByTestId(WORK_GROUP_MEMBER_REMOVE_TESTID)[0]!);

    const region = await screen.findByTestId(WORK_GROUP_REMOVE_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'work_group_member_not_found');
    expect(region).toHaveTextContent(errorMessage('work_group_member_not_found'));
    // La persona sigue en la lista y no se volvio a consultar.
    expect(nombresPintados()).toContain(objetivo.displayName);
    expect(filas()).toHaveLength(MIEMBROS.length);
    expect(listWorkGroupMembersActionMock).toHaveBeenCalledTimes(1);
    expect(toastExito).not.toHaveBeenCalled();
  });
});
