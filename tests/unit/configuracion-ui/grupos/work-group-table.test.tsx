// QC-85 T7 — La tabla de la lista de grupos: R9, R10, R12, R13, R14, R15.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es que
// emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`, comparado
// siempre contra `workGroupListHref` —nunca contra una URL escrita aqui (R3)—.
//
// **Ningun assert sobre copy** (R41): filas, celdas y controles se localizan por los `data-testid`
// del componente compartido (`data-table-*`) y por constantes exportadas. Que esos `data-testid`
// sean los del componente compartido es, ademas, la prueba de R12: si la pantalla hubiera escrito
// su propia tabla o su propia barra de paginacion, no existirian.
//
// **Las siete Server Actions de grupos son dobles que FALLAN si se les llama** (R10, R36): la tabla
// recibe las filas por props y no pide nada por su cuenta.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_ACTIONS_COLUMN_ID,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ACTION_EDIT_TESTID,
  WORK_GROUP_CREATE_OPEN_TESTID,
  DELETE_WORK_GROUP_DIALOG_TESTID,
  DELETE_WORK_GROUP_DISMISS_TESTID,
  DELETE_WORK_GROUP_ID_TESTID,
  WORK_GROUP_FORM_CANCEL_TESTID,
  WORK_GROUP_MEMBERS_COLUMN_ID,
  WORK_GROUP_NAME_COLUMN_ID,
  WORK_GROUP_ROW_ACTIONS_TESTID,
  WORK_GROUP_SHEET_TESTID,
  WORK_GROUP_TABLE_TESTID,
  WorkGroupTable,
  buildWorkGroupListQuery,
  workGroupListHref,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  type DataTableParams,
} from '@/components/shared/data-table';
import { WORK_GROUP_QUERYABLE, type WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { clickRowAction } from '../../../helpers/row-actions-menu';
import { esperarInteractiva, setupUser } from '../../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../../helpers/viewport';

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
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    // La UNICA que el panel de edicion SI pide al abrirse (R25): responde una pagina vacia para
    // que abrir el panel no sea un fallo. Lo que esta lista hace se prueba en
    // `work-group-members.test.tsx`; aqui solo interesa QUE panel se abre y sobre quien.
    listWorkGroupMembersAction: vi.fn(async () => ({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
    })),
    // El picker de miembros que el panel de edicion monta SI la pide, siempre, al abrirse (R28):
    // responde una pagina vacia para que abrir el panel no sea un fallo. Lo que ese picker pinta
    // se prueba en `work-group-form.test.tsx` y en `work-group-members.test.tsx`; aqui solo
    // interesa QUE panel se abre y sobre quien.
    listWorkGroupCandidatesAction: vi.fn(async () => ({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    })),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla de grupos`);
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
    throw new Error('listRolesAction no debe invocarse desde la tabla de grupos');
  }),
}));

/** Llegan a proposito DESORDENADOS: R14 y R15 se comprueban con ellos. */
const GRUPOS: readonly WorkGroupRow[] = [
  { id: 'g3', name: 'Zona de empaque', members: [] },
  { id: 'g1', name: 'Laboratorio', members: [] },
  { id: 'g2', name: 'Produccion', members: [] },
];

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3, canModify = true) {
  const params = parametros(overrides);
  render(
    <WorkGroupTable
      groups={GRUPOS}
      params={params}
      totalPages={totalPages}
      canModify={canModify}
    />,
  );
  return params;
}

/** El ultimo destino al que la tabla pidio navegar. */
function ultimoDestino(): string {
  const ultima = routerMock.push.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('La tabla no navego');
  return ultima[0];
}

/** Fuente de la tabla sin comentarios: el JSDoc NOMBRA lo que el codigo no debe hacer. */
function fuenteDeLaTabla(): string {
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
    'work-group-table.tsx',
  );
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia`. Helper HEREDADO (`tests/helpers/viewport.ts`) (R39).
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la lista usa la tabla COMPARTIDA y no declara una propia (R12)', () => {
  it('monta `DataTable` con una fila por grupo', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    for (const grupo of GRUPOS) {
      expect(screen.getByTestId(`data-table-row-${grupo.id}`)).toBeInTheDocument();
    }
  });

  it('el indicador de pagina y el selector de tamano son los del componente compartido (R13)', () => {
    montar({ page: 2 }, 3);

    // Si la pantalla hubiera escrito su propia barra de paginacion, estos no existirian.
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-page-indicator')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();
    expect(screen.getByTestId('data-table-page-size')).toBeInTheDocument();
  });

  it('hay DOS columnas de datos y ninguna celda pinta un numero de miembros (R12)', () => {
    montar();

    expect(screen.getByTestId(`data-table-head-${WORK_GROUP_NAME_COLUMN_ID}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`data-table-head-${WORK_GROUP_MEMBERS_COLUMN_ID}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`data-table-head-${WORK_GROUP_ACTIONS_COLUMN_ID}`),
    ).toBeInTheDocument();

    // Cabecera + tres filas, con tres celdas por fila y ninguna mas.
    for (const grupo of GRUPOS) {
      const fila = screen.getByTestId(`data-table-row-${grupo.id}`);
      expect(fila.querySelectorAll('td')).toHaveLength(3);
      // El nombre, tal cual, y ni un digito al lado: el conteo de miembros sigue siendo QC-100.
      expect(fila.textContent ?? '').toContain(grupo.name);
      expect(fila.textContent ?? '').not.toMatch(/\d/);
    }
  });

  it('las filas se pintan en el orden en que llegan: aqui no se ordena ni se recorta (R14, R15)', () => {
    montar({
      page: 99,
      sort: { columnId: WORK_GROUP_NAME_COLUMN_ID, direction: 'asc' },
      search: 'no-casa-con-ninguno',
    });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-g3',
      'data-table-row-g1',
      'data-table-row-g2',
    ]);
    expect(filas).toHaveLength(GRUPOS.length);
  });
});

describe('cambiar pagina navega con la consulta esperada, y conserva la pestana (R3, R13)', () => {
  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const user = setupUser();
    const params = montar({ page: 1 }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(
      `${USERS_ROUTE}?${buildWorkGroupListQuery({ ...params, page: 2 })}`,
    );
  });

  it('retroceder de pagina pide la lista de nuevo con la pagina anterior', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);

    await user.click(screen.getByTestId('data-table-previous'));

    expect(ultimoDestino()).toBe(workGroupListHref({ ...params, page: 2 }));
  });

  it('el destino sale SIEMPRE de la constante de ruta y lleva `tab=grupos` (R3, R7)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${USERS_ROUTE}?`)).toBe(true);
    expect(ultimoDestino()).toContain('tab=grupos');
  });
});

describe('el tamano de pagina ofrece 10 y 25, con defecto 10 (R13)', () => {
  it('las opciones son exactamente dos, las del componente compartido', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-page-size'));

    expect(await screen.findAllByRole('option')).toHaveLength(PAGE_SIZE_OPTIONS.length);
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 25]);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }
  });

  it('elegir otro tamano navega con ese tamano y vuelve a la primera pagina', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);
    const otro = PAGE_SIZE_OPTIONS.find((option) => option !== params.pageSize)!;

    await user.click(screen.getByTestId('data-table-page-size'));
    // Popup de Base UI recien abierto: se espera a que suelte `pointer-events: none` (QC-58).
    await user.click(await esperarInteractiva(screen.getByTestId(`data-table-page-size-${otro}`)));

    expect(ultimoDestino()).toBe(workGroupListHref({ ...params, page: 1, pageSize: otro }));
  });

  it('sin tamano en la URL la tabla parte del tamano por defecto (10)', () => {
    const params = montar();

    expect(params.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe('ordenar navega, no reordena en cliente, y solo por lo que el contrato admite (R15)', () => {
  it('la cabecera del nombre pide la lista de nuevo con ese orden', () => {
    const params = montar();

    expect(WORK_GROUP_QUERYABLE.sortable).toContain(WORK_GROUP_NAME_COLUMN_ID);
    const cabecera = screen.getByTestId(`data-table-head-${WORK_GROUP_NAME_COLUMN_ID}`);
    fireEvent.click(within(cabecera).getAllByRole('button')[0]!);

    expect(ultimoDestino()).toBe(
      workGroupListHref({
        ...params,
        sort: { columnId: WORK_GROUP_NAME_COLUMN_ID, direction: 'asc' },
      }),
    );
  });

  it('ordenar por la columna de acciones NO SE OFRECE', () => {
    montar();

    expect(WORK_GROUP_QUERYABLE.sortable).not.toContain(WORK_GROUP_ACTIONS_COLUMN_ID);
    // Sin `sortable` no hay `aria-sort`; sin nada que ofrecer, la columna no tiene ni menu.
    expect(
      screen.getByTestId(`data-table-head-${WORK_GROUP_ACTIONS_COLUMN_ID}`),
    ).not.toHaveAttribute('aria-sort');
    expect(
      screen.queryByTestId(`data-table-header-menu-${WORK_GROUP_ACTIONS_COLUMN_ID}`),
    ).toBeNull();
    expect(screen.queryByTestId(`data-table-sort-asc-${WORK_GROUP_ACTIONS_COLUMN_ID}`)).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('`createdAt` no tiene cabecera: es ordenable en el contrato pero no es columna (R12)', () => {
    montar();

    expect(WORK_GROUP_QUERYABLE.sortable).toContain('createdAt');
    expect(screen.queryByTestId('data-table-head-createdAt')).toBeNull();
  });
});

describe('la busqueda existe, viaja al servidor y NO filtra en cliente (R14)', () => {
  it('la caja de busqueda SI se monta: el contrato declara `searchable: true`', () => {
    montar();

    expect(WORK_GROUP_QUERYABLE.searchable).toBe(true);
    expect(screen.getByTestId('data-table-search')).toHaveAttribute('type', 'search');
  });

  it('escribir un termino navega con ese termino en la URL, sobre el conjunto entero', async () => {
    vi.useFakeTimers();
    const params = montar();

    // `fireEvent.change` en vez de teclear: con temporizadores falseados, `user-event` no resuelve
    // su espera interna en este repo.
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'labor' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(ultimoDestino()).toBe(workGroupListHref({ ...params, search: 'labor' }));
    vi.useRealTimers();
  });

  it('el termino NO filtra en cliente: las tres filas siguen pintadas', async () => {
    vi.useFakeTimers();
    montar();

    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'labor' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(GRUPOS.length);
    vi.useRealTimers();
  });

  it('y no hay NINGUN control de filtro: la lista blanca no declara filtrables (R16)', () => {
    montar();

    const disparadores = Array.from(document.querySelectorAll('[data-testid]'))
      .map((elemento) => elemento.getAttribute('data-testid')!)
      .filter((testid) => /^data-table-filter-[A-Za-z]+$/.test(testid));

    expect(disparadores).toEqual([]);
  });
});

describe('la tabla es la duena del estado de las escrituras (R9, `design.md > 5` y `> 6`)', () => {
  it('monta UNA instancia del estado para toda la pagina, no una por fila', () => {
    montar();

    expect(screen.getAllByTestId(WORK_GROUP_TABLE_TESTID)).toHaveLength(1);
    expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeNull();
    // Y dos disparadores por fila, uno por accion.
    expect(screen.getAllByTestId(WORK_GROUP_ROW_ACTIONS_TESTID)).toHaveLength(GRUPOS.length);
  });

  it('NO monta el alta: ese disparador ya no es suyo (2026-09-17)', () => {
    montar();

    // Vive en `work-group-create-action.tsx`, fuera de la tabla. Los grupos nacen en cero, asi que
    // tenerlo aqui dentro hacia el primer grupo imposible de crear. Si alguien lo devolviera, esta
    // afirmacion se pone roja.
    expect(screen.queryByTestId(WORK_GROUP_CREATE_OPEN_TESTID)).toBeNull();
  });

  it('la accion de abrir de una fila abre el panel SOBRE ESE grupo', async () => {
    const user = setupUser();
    montar();
    const objetivo = GRUPOS[1]!;

    const fila = screen.getByTestId(`data-table-row-${objetivo.id}`);
    await clickRowAction(
      user,
      within(fila).getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID),
      WORK_GROUP_ACTION_EDIT_TESTID,
    );

    const panel = await screen.findByTestId(WORK_GROUP_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-mode', 'edit');
    expect(panel).toHaveAttribute('data-work-group-id', objetivo.id);
    // Una sola escritura abierta por vez.
    expect(screen.queryByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeNull();
    expect(screen.getAllByTestId(WORK_GROUP_SHEET_TESTID)).toHaveLength(1);
  });

  it('la accion de borrar de una fila abre el dialogo SOBRE ESE grupo (R33)', async () => {
    const user = setupUser();
    montar();
    const objetivo = GRUPOS[2]!;

    const fila = screen.getByTestId(`data-table-row-${objetivo.id}`);
    await clickRowAction(
      user,
      within(fila).getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID),
      WORK_GROUP_ACTION_DELETE_TESTID,
    );

    expect(await screen.findByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeInTheDocument();
    // Sobre ESE grupo: el identificador que el dialogo enviaria es el de la fila que lo abrio.
    expect(screen.getByTestId(DELETE_WORK_GROUP_ID_TESTID)).toHaveValue(objetivo.id);
    expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull();
  });

  it('cerrar suelta el estado, y la lista de detras conserva sus parametros (R20)', async () => {
    const user = setupUser();
    montar({ page: 2, search: 'lab' }, 3);

    // Se ejercita con la EDICION, que es la escritura que esta tabla sigue siendo duena de abrir:
    // el alta se mudo a `work-group-create-action.tsx` y cierra en su propio archivo.
    const fila = screen.getByTestId(`data-table-row-${GRUPOS[0]!.id}`);
    await clickRowAction(
      user,
      within(fila).getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID),
      WORK_GROUP_ACTION_EDIT_TESTID,
    );
    await user.click(await screen.findByTestId(WORK_GROUP_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull());
    // Cerrar no navega: la lista de detras sigue con la misma pagina, el mismo termino y la misma
    // pestana, porque nadie los ha tocado.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(GRUPOS.length);
  });

  it('y cerrar el dialogo de borrado tampoco retira ninguna fila (R34)', async () => {
    const user = setupUser();
    montar();
    const objetivo = GRUPOS[0]!;

    const fila = screen.getByTestId(`data-table-row-${objetivo.id}`);
    await clickRowAction(
      user,
      within(fila).getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID),
      WORK_GROUP_ACTION_DELETE_TESTID,
    );
    await user.click(await screen.findByTestId(DELETE_WORK_GROUP_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeNull());
    expect(screen.getByTestId(`data-table-row-${objetivo.id}`)).toBeInTheDocument();
  });

  it('sin `usuarios.modificar` no se emite NINGUNA escritura en el arbol servido (R9)', () => {
    montar({}, 3, false);

    expect(screen.queryByTestId(WORK_GROUP_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_ACTION_EDIT_TESTID)).toBeNull();
    expect(screen.queryByTestId(WORK_GROUP_ACTION_DELETE_TESTID)).toBeNull();
    // Ni el panel, ni el dialogo. El alta se prueba en su propio archivo.
    expect(screen.queryByTestId(WORK_GROUP_SHEET_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeNull();
    // Y la lista SI se ve: quien solo consulta ve los grupos sin acciones de escritura.
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(GRUPOS.length);
  });

  it('sin permiso tampoco hay ningun formulario ni ningun boton de escritura suelto', () => {
    montar({}, 3, false);

    expect(document.querySelectorAll('form')).toHaveLength(0);
    // Los unicos controles que quedan son los de la propia tabla compartida: paginacion, tamano,
    // busqueda y menus de columna. Ninguno de ellos escribe.
    for (const boton of screen.getAllByRole('button')) {
      expect(boton.getAttribute('data-testid') ?? '').toMatch(/^data-table-|^$/);
    }
  });
});

describe('los datos llegan por props: la tabla no se los busca (R10)', () => {
  it('su fuente no importa la composicion, ni Prisma, ni lee la sesion', () => {
    const fuente = fuenteDeLaTabla();

    for (const prohibido of [
      '@/lib/composition',
      '@/lib/shared/db',
      '@prisma/client',
      'next/headers',
      'getSessionUser',
    ]) {
      expect(fuente, `la tabla no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });

  it('y no invoca ninguna Server Action: no importa ni una', () => {
    const fuente = fuenteDeLaTabla();

    expect(fuente).not.toContain('adapters/driving');
    expect(fuente).not.toMatch(/fetch\(\s*['"`]\//);
  });

  it('no abre ni un archivo de la tabla compartida: la consume por su barrel (R12)', () => {
    const fuente = fuenteDeLaTabla();

    expect(fuente).toContain("from '@/components/shared/data-table'");
    expect(fuente).not.toMatch(/from\s+['"]@\/components\/shared\/data-table\/[^'"]+['"]/);
  });
});
