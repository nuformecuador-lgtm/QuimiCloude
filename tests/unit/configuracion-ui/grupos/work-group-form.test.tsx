// QC-85 T8 — El formulario del nombre del grupo: R21, R22, R23, R24.
//
// **Las Server Actions estan mockeadas**: son el borde del modulo `identity`, que esta ficha solo
// consume (R36). Son ademas el punto de observacion de R21 —«el envio NO ocurre»— y de R23 —«alta
// invoca crear, edicion invoca renombrar»—.
//
// **Ningun assert sobre literales de copy** (R41): el campo, el aviso y los dos botones se
// localizan por `data-testid` exportado; cuando hace falta comparar un texto, se compara contra
// `WORK_GROUP_NAME_ISSUE_MESSAGES` o contra el mensaje del catalogo de errores, nunca contra una
// frase escrita aqui.
//
// **El panel se monta de verdad**: `WorkGroupForm` pinta su PROPIO `SheetContent` (cabecera, cuerpo
// con scroll y pie fijo), asi que el unico envoltorio que este archivo necesita es el `<Sheet>` —el
// primitivo que declara el contexto del panel—, sin un segundo `SheetContent` alrededor. Lo que el
// panel decide ADEMAS —miembros de la edicion, cierre, aviso— se prueba en `work-group-sheet.test.tsx`.
//
// **Las filas del picker de candidatos se localizan por el `data-testid` REAL de la tabla
// compartida** (`data-table-row-<id>`, de `components/shared/data-table`), no por un `data-testid`
// propio de este dominio: desde que `WorkGroupMemberPicker` monta `<DataTable>`, esa es la unica
// forma estable de llegar a una fila concreta.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_FORM_ERROR_CODE_TESTID,
  WORK_GROUP_FORM_ERROR_TESTID,
  WORK_GROUP_FORM_ID_TESTID,
  WORK_GROUP_FORM_SUBMIT_TESTID,
  WORK_GROUP_FORM_TESTID,
  WORK_GROUP_ID_FIELD,
  WORK_GROUP_MEMBER_ID_FIELD,
  WORK_GROUP_NAME_ERROR_TESTID,
  WORK_GROUP_NAME_FIELD,
  WORK_GROUP_NAME_FIELD_TESTID,
  WORK_GROUP_NAME_ISSUE_MESSAGES,
  WORK_GROUP_PENDING_MEMBER_REMOVE_TESTID,
  WORK_GROUP_PENDING_MEMBER_TESTID,
  WorkGroupForm,
  workGroupNameIssue,
} from '@/app/(private)/configuracion/usuarios/components';
import { Sheet } from '@/components/ui/sheet';
import { errorMessage } from '@/lib/modules/errores';
import { WORK_GROUP_NAME_MAX_LENGTH, normalizeWorkGroupName } from '@/lib/modules/identity';
import type { WorkGroupCandidateRow } from '@/lib/modules/identity';
import type {
  CreateWorkGroupFormState,
  WorkGroupCandidateListResult,
  WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { setupUser } from '../../../helpers/user-event';

const {
  createWorkGroupActionMock,
  renameWorkGroupActionMock,
  addWorkGroupMemberActionMock,
  listWorkGroupCandidatesActionMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createWorkGroupActionMock:
    vi.fn<(prev: CreateWorkGroupFormState, data: FormData) => Promise<CreateWorkGroupFormState>>(),
  renameWorkGroupActionMock:
    vi.fn<
      (prev: WorkGroupMutationFormState, data: FormData) => Promise<WorkGroupMutationFormState>
    >(),
  addWorkGroupMemberActionMock:
    vi.fn<
      (prev: WorkGroupMutationFormState, data: FormData) => Promise<WorkGroupMutationFormState>
    >(),
  listWorkGroupCandidatesActionMock:
    vi.fn<(query: unknown) => Promise<WorkGroupCandidateListResult>>(),
  toastErrorMock: vi.fn<(message: string, options?: { description?: string }) => void>(),
}));

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { error: toastErrorMock },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  }),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario del nombre`);
  };
  return {
    createWorkGroupAction: createWorkGroupActionMock,
    renameWorkGroupAction: renameWorkGroupActionMock,
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: addWorkGroupMemberActionMock,
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
    listWorkGroupCandidatesAction: listWorkGroupCandidatesActionMock,
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario del nombre`);
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

/** Un grupo existente. El identificador es un UUID porque es lo que el esquema del borde espera. */
const GRUPO = { id: '11111111-1111-4111-8111-111111111111', name: 'Laboratorio' };

/** Un candidato del picker de miembros, que el alta monta siempre (R22, ampliacion de alta). */
const CANDIDATO: WorkGroupCandidateRow = {
  id: 'u9',
  displayName: 'Nieto Salas, Dario',
  roleName: 'Operario',
};

function montar(group: typeof GRUPO | null, onSaved = vi.fn<() => void>()) {
  render(
    <Sheet open onOpenChange={() => {}}>
      <WorkGroupForm group={group} onSaved={onSaved} />
    </Sheet>,
  );
  return onSaved;
}

function campo(): HTMLInputElement {
  return screen.getByTestId(WORK_GROUP_NAME_FIELD_TESTID) as HTMLInputElement;
}

/** Los nombres de `FormData` que el formulario emite, leidos del DOM. */
function nombresDeCampos(): string[] {
  const formulario = screen.getByTestId(WORK_GROUP_FORM_TESTID);
  return Array.from(formulario.querySelectorAll('input, select, textarea'))
    .map((control) => control.getAttribute('name'))
    .filter((nombre): nombre is string => nombre !== null);
}

/** Fuente del formulario sin comentarios: el JSDoc NOMBRA lo que el codigo no debe hacer. */
function fuenteDelFormulario(): string {
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
    'work-group-form.tsx',
  );
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Espera a que el picker de miembros, que el alta monta siempre, pinte su primera fila. La
 * localiza por el `data-testid` REAL de `<DataTable>` (`data-table-row-<id>`): `getRowId` del
 * picker es `candidate.id`, asi que es la MISMA fila para cualquier candidato de la pagina.
 */
async function esperarCandidato(): Promise<HTMLElement> {
  return screen.findByTestId(`data-table-row-${CANDIDATO.id}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  createWorkGroupActionMock.mockResolvedValue({ status: 'success', id: 'nuevo' });
  renameWorkGroupActionMock.mockResolvedValue({ status: 'success' });
  addWorkGroupMemberActionMock.mockResolvedValue({ status: 'success' });
  listWorkGroupCandidatesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [CANDIDATO], total: 1, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('la validacion es EN VIVO y se deriva del contrato (R21, R22)', () => {
  it('un nombre sin ninguna letra ni numero avisa MIENTRAS se escribe', async () => {
    const user = setupUser();
    montar(null);

    // Antes de escribir no se rine a nadie.
    expect(screen.queryByTestId(WORK_GROUP_NAME_ERROR_TESTID)).toBeNull();

    await user.type(campo(), '!!!');

    const aviso = screen.getByTestId(WORK_GROUP_NAME_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-issue', 'no-alphanumeric');
    expect(aviso).toHaveTextContent(WORK_GROUP_NAME_ISSUE_MESSAGES['no-alphanumeric']);
    expect(campo()).toHaveAttribute('aria-invalid', 'true');
    expect(campo().getAttribute('aria-describedby')).toBe(aviso.id);
    // Y el aviso llego ANTES de cualquier envio.
    expect(createWorkGroupActionMock).not.toHaveBeenCalled();
  });

  it('y con ese nombre el boton NO invoca ninguna operacion', async () => {
    const user = setupUser();
    montar(null);

    await user.type(campo(), '!!!');
    const enviar = screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID);
    expect(enviar).toBeDisabled();

    // `fireEvent` en vez de `user.click`: `user-event` se niega a pinchar un control
    // deshabilitado, y lo que este caso quiere demostrar es que ni aun forzando el envio se
    // invoca la operacion.
    (screen.getByTestId(WORK_GROUP_FORM_TESTID) as HTMLFormElement).requestSubmit();

    await waitFor(() => expect(campo()).toHaveValue('!!!'));
    expect(createWorkGroupActionMock).not.toHaveBeenCalled();
    expect(renameWorkGroupActionMock).not.toHaveBeenCalled();
  });

  it('los dos nombres que colisionarian en el indice unico se atajan igual', () => {
    for (const nombre of ['!!!', '¿¿¿', '   ', '-- --']) {
      expect(normalizeWorkGroupName(nombre)).toBe('');
      expect(workGroupNameIssue(nombre)).not.toBeNull();
    }
  });

  it('la FORMA la pone el esquema del modulo: vacio y tope de longitud (R22)', async () => {
    const user = setupUser();
    montar(null);

    await user.type(campo(), 'a');
    await user.clear(campo());
    expect(screen.getByTestId(WORK_GROUP_NAME_ERROR_TESTID)).toHaveAttribute('data-issue', 'shape');

    expect(workGroupNameIssue('x'.repeat(WORK_GROUP_NAME_MAX_LENGTH))).toBeNull();
    expect(workGroupNameIssue('x'.repeat(WORK_GROUP_NAME_MAX_LENGTH + 1))).toBe('shape');
    expect(workGroupNameIssue('   ')).not.toBeNull();
  });

  it('el archivo NO escribe ninguna expresion propia de «letra o numero» (R21)', () => {
    const fuente = fuenteDelFormulario();

    expect(fuente).toContain('normalizeWorkGroupName');
    expect(fuente).toContain('createWorkGroupSchema');
    expect(fuente).toContain('renameWorkGroupSchema');
    // Ni una expresion regular, ni construida ni literal: seria una segunda definicion de «mismo
    // nombre de grupo», libre de divergir de la del contrato.
    expect(fuente).not.toContain('RegExp');
    expect(fuente).not.toMatch(/\\p\{[LN]\}/);
    expect(fuente).not.toMatch(/\/\[[^\]]+\]/);
  });

  it('captura EXACTAMENTE un campo en el alta, y ninguna lista de miembros (R22)', () => {
    montar(null);

    expect(nombresDeCampos()).toEqual([WORK_GROUP_NAME_FIELD]);
    for (const prohibido of ['companyId', 'nameNormalized', 'deletedAt', 'members', 'userId']) {
      expect(nombresDeCampos()).not.toContain(prohibido);
    }
  });
});

describe('el envio va a la operacion que toca (R23)', () => {
  it('el alta invoca la creacion, con el nombre y nada mas', async () => {
    const user = setupUser();
    montar(null);

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createWorkGroupActionMock).toHaveBeenCalledTimes(1));
    expect(renameWorkGroupActionMock).not.toHaveBeenCalled();

    const datos = createWorkGroupActionMock.mock.calls[0]![1];
    expect([...datos.keys()]).toEqual([WORK_GROUP_NAME_FIELD]);
    expect(datos.get(WORK_GROUP_NAME_FIELD)).toBe('Turno Noche');
  });

  it('la edicion invoca el renombrado, con el identificador del grupo', async () => {
    const user = setupUser();
    montar(GRUPO);

    expect(campo()).toHaveValue(GRUPO.name);
    expect(screen.getByTestId(WORK_GROUP_FORM_ID_TESTID)).toHaveValue(GRUPO.id);

    await user.clear(campo());
    await user.type(campo(), 'Laboratorio central');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(renameWorkGroupActionMock).toHaveBeenCalledTimes(1));
    expect(createWorkGroupActionMock).not.toHaveBeenCalled();

    const datos = renameWorkGroupActionMock.mock.calls[0]![1];
    expect(datos.get(WORK_GROUP_ID_FIELD)).toBe(GRUPO.id);
    expect(datos.get(WORK_GROUP_NAME_FIELD)).toBe('Laboratorio central');
  });

  it('y el renombrado NO altera los miembros: no manda ninguno (R23)', async () => {
    const user = setupUser();
    montar(GRUPO);

    await user.type(campo(), ' central');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(renameWorkGroupActionMock).toHaveBeenCalledTimes(1));
    const datos = renameWorkGroupActionMock.mock.calls[0]![1];
    expect([...datos.keys()].sort()).toEqual([WORK_GROUP_NAME_FIELD, WORK_GROUP_ID_FIELD].sort());
  });

  it('con exito avisa al panel, que es quien cierra y refresca (R35)', async () => {
    const user = setupUser();
    const onSaved = montar(null);

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});

describe('un rechazo se pinta por su CODIGO y no pierde lo escrito (R24)', () => {
  it('el nombre duplicado se pinta EN LINEA, junto al campo', async () => {
    const user = setupUser();
    createWorkGroupActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_duplicate_name',
      message: errorMessage('work_group_duplicate_name'),
    });
    const onSaved = montar(null);

    await user.type(campo(), 'Laboratorio');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    const aviso = await screen.findByTestId(WORK_GROUP_NAME_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', 'work_group_duplicate_name');
    expect(aviso).toHaveTextContent(errorMessage('work_group_duplicate_name'));
    // Y NO va a la region del formulario.
    expect(screen.queryByTestId(WORK_GROUP_FORM_ERROR_TESTID)).toBeNull();
    // El panel sigue abierto y lo escrito sigue ahi.
    expect(screen.getByTestId(WORK_GROUP_FORM_TESTID)).toBeInTheDocument();
    expect(campo()).toHaveValue('Laboratorio');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('cualquier otro codigo va a la REGION de error del formulario', async () => {
    const user = setupUser();
    createWorkGroupActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: errorMessage('invalid_input'),
    });
    montar(null);

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(WORK_GROUP_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(region).toHaveAttribute('data-code', 'invalid_input');
    expect(screen.getByTestId(WORK_GROUP_FORM_ERROR_CODE_TESTID)).toHaveTextContent('invalid_input');
    expect(screen.queryByTestId(WORK_GROUP_NAME_ERROR_TESTID)).toBeNull();
    expect(campo()).toHaveValue('Turno Noche');
  });

  it('el rechazo del renombrado tampoco cierra el panel ni pierde lo escrito', async () => {
    const user = setupUser();
    renameWorkGroupActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_not_found',
      message: errorMessage('work_group_not_found'),
    });
    const onSaved = montar(GRUPO);

    await user.type(campo(), ' central');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(WORK_GROUP_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'work_group_not_found');
    expect(campo()).toHaveValue(`${GRUPO.name} central`);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('el alta puede elegir miembros iniciales, en estado local hasta crear el grupo', () => {
  it('elegir un candidato lo mete en «pendientes» SIN llamar a ninguna Server Action de miembro', async () => {
    montar(null);

    const fila = await esperarCandidato();
    fireEvent.click(within(fila).getByRole('button'));

    expect(await screen.findByTestId(WORK_GROUP_PENDING_MEMBER_TESTID)).toHaveTextContent(
      CANDIDATO.displayName,
    );
    expect(addWorkGroupMemberActionMock).not.toHaveBeenCalled();
    // Y el candidato ya elegido se ve como «Agregado» en la propia tabla del picker.
    expect(within(fila).getByRole('button')).toBeDisabled();
  });

  it('«Quitar» saca al candidato de pendientes', async () => {
    montar(null);

    const fila = await esperarCandidato();
    fireEvent.click(within(fila).getByRole('button'));
    await screen.findByTestId(WORK_GROUP_PENDING_MEMBER_TESTID);

    fireEvent.click(screen.getByTestId(WORK_GROUP_PENDING_MEMBER_REMOVE_TESTID));

    expect(screen.queryByTestId(WORK_GROUP_PENDING_MEMBER_TESTID)).toBeNull();
    // Y vuelve a poder elegirse: el boton vuelve a decir «Agregar».
    expect(within(fila).getByRole('button')).not.toBeDisabled();
  });

  it('al enviar con pendientes: primero se crea el grupo y LUEGO se anade a cada uno, de a una', async () => {
    const user = setupUser();
    montar(null);

    const fila = await esperarCandidato();
    fireEvent.click(within(fila).getByRole('button'));
    await screen.findByTestId(WORK_GROUP_PENDING_MEMBER_TESTID);

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createWorkGroupActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(addWorkGroupMemberActionMock).toHaveBeenCalledTimes(1));

    const datos = addWorkGroupMemberActionMock.mock.calls[0]![1];
    expect([...datos.keys()].sort()).toEqual([WORK_GROUP_MEMBER_ID_FIELD, WORK_GROUP_ID_FIELD].sort());
    expect(datos.get(WORK_GROUP_ID_FIELD)).toBe('nuevo');
    expect(datos.get(WORK_GROUP_MEMBER_ID_FIELD)).toBe(CANDIDATO.id);
  });

  it('sin pendientes, crear el grupo no llama a ninguna operacion de miembro (R23)', async () => {
    const user = setupUser();
    montar(null);
    await esperarCandidato();

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createWorkGroupActionMock).toHaveBeenCalledTimes(1));
    expect(addWorkGroupMemberActionMock).not.toHaveBeenCalled();
  });

  it('la edicion NO monta el picker de miembros iniciales: ese bloque es solo del alta', () => {
    montar(GRUPO);

    expect(screen.queryByTestId(WORK_GROUP_PENDING_MEMBER_TESTID)).toBeNull();
    // `data-table` es el envoltorio que pinta `<DataTable>`: ausente, el picker no se monto.
    expect(screen.queryByTestId('data-table')).toBeNull();
    // Y por tanto no consulto la lista de personas: ese bloque, en la edicion, no existe.
    expect(listWorkGroupCandidatesActionMock).not.toHaveBeenCalled();
  });
});

describe('el picker solo ofrece personas activas', () => {
  it('consulta la accion de candidatos de grupo, no el listado de usuarios, y pinta lo que devuelve', async () => {
    const otro: WorkGroupCandidateRow = {
      id: 'u10',
      displayName: 'Ortega Vidal, Lucia',
      roleName: 'Supervisora',
    };
    listWorkGroupCandidatesActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [CANDIDATO, otro], total: 2, page: 1, pageSize: 10, totalPages: 1 },
    });
    montar(null);

    const fila = await screen.findByTestId(`data-table-row-${otro.id}`);
    expect(fila).toHaveTextContent(otro.displayName);
    expect(fila).toHaveTextContent(otro.roleName);
    expect(screen.getByTestId(`data-table-row-${CANDIDATO.id}`)).toHaveTextContent(
      CANDIDATO.displayName,
    );

    expect(listWorkGroupCandidatesActionMock).toHaveBeenCalledTimes(1);
    expect(listWorkGroupCandidatesActionMock.mock.calls[0]![0]).toEqual({
      page: 1,
      pageSize: expect.any(Number),
      sort: null,
      filters: {},
      search: '',
    });
  });

  it('si al crear el grupo una pendiente ya no esta activa, el aviso trae el motivo del catalogo', async () => {
    const motivo = errorMessage('work_group_member_not_active');
    addWorkGroupMemberActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_member_not_active',
      message: motivo,
    });
    const user = setupUser();
    const onSaved = montar(null);

    const fila = await esperarCandidato();
    fireEvent.click(within(fila).getByRole('button'));
    await screen.findByTestId(WORK_GROUP_PENDING_MEMBER_TESTID);

    await user.type(campo(), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock.mock.calls[0]![1]).toEqual({ description: motivo });
    // El grupo ya existe: el alta sigue terminando con exito.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
