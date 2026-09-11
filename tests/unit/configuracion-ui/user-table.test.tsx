// QC-67 T8 — La tabla de la lista de usuarios: R9, R12, R13, R14, R16, R21.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es que
// emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`, comparado
// siempre contra `userListHref` —nunca contra una URL escrita aqui (R1)—.
//
// **Ningun assert sobre copy** (R41): filas, celdas y controles se localizan por los `data-testid`
// del componente compartido (`data-table-*`) y por constantes exportadas. Que esos `data-testid`
// sean los del componente compartido es, ademas, la prueba de R9: si la pantalla hubiera escrito
// su propia tabla o su propia barra de paginacion, no existirian.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_STATUS_COLUMN_ID,
  DISPLAY_NAME_COLUMN_ID,
  EMAIL_COLUMN_ID,
  ROLE_NAME_COLUMN_ID,
  USERNAME_COLUMN_ID,
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_EDIT_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_ROW_ACTIONS_TESTID,
  USER_TABLE_TESTID,
  UserTable,
  buildUserListQuery,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  type DataTableParams,
} from '@/components/shared/data-table';
import { USER_ACCOUNT_STATUSES, USER_QUERYABLE, type UserRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

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

// Dobles que FALLAN si se les llama: la tabla no lee ni escribe nada (R36).
vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
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
    throw new Error('listRolesAction no debe invocarse desde la tabla');
  }),
}));

function usuario(overrides: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow {
  return {
    displayName: 'Lopez Perez, Ana',
    username: 'ana.lopez',
    email: 'ana.lopez@example.com',
    roleName: 'Operador',
    accountStatus: 'active',
    ...overrides,
  };
}

/** Llegan a proposito DESORDENADAS: R12 y R14 se comprueban con ellas. */
const USUARIOS: readonly UserRow[] = [
  usuario({ id: 'u3', displayName: 'Zapata, Tito', username: 'tito.zapata' }),
  usuario({ id: 'u1', displayName: 'Lopez, Ana', accountStatus: 'blocked' }),
  usuario({ id: 'u2', displayName: 'Perez, Beto', username: 'beto.perez' }),
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
    <UserTable
      users={USUARIOS}
      params={params}
      totalPages={totalPages}
      canModify={canModify}
      roles={[{ id: 'r1', name: 'Operador' }]}
      rolesError={null}
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

function clases(elemento: Element): readonly string[] {
  return Array.from(elemento.classList);
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

describe('la lista usa la tabla COMPARTIDA y no declara una propia (R9)', () => {
  it('monta `DataTable` con una fila por usuario', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    for (const item of USUARIOS) {
      expect(screen.getByTestId(`data-table-row-${item.id}`)).toBeInTheDocument();
    }
  });

  it('el indicador de pagina y el selector de tamano son los del componente compartido (R16)', () => {
    montar({ page: 2 }, 3);

    // Si la pantalla hubiera escrito su propia barra de paginacion, estos no existirian.
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-page-indicator')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();
    expect(screen.getByTestId('data-table-page-size')).toBeInTheDocument();
  });

  it('las filas se pintan en el orden en que llegan: aqui no se ordena ni se recorta (R12, R14)', () => {
    montar({
      page: 99,
      sort: { columnId: USERNAME_COLUMN_ID, direction: 'asc' },
      search: 'no-casa-con-ninguno',
    });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-u3',
      'data-table-row-u1',
      'data-table-row-u2',
    ]);
    expect(filas).toHaveLength(USUARIOS.length);
  });
});

describe('cambiar pagina navega con la consulta esperada (R16)', () => {
  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const user = setupUser();
    const params = montar({ page: 1 }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(`${USERS_ROUTE}?${buildUserListQuery({ ...params, page: 2 })}`);
  });

  it('retroceder de pagina pide la lista de nuevo con la pagina anterior', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);

    await user.click(screen.getByTestId('data-table-previous'));

    expect(ultimoDestino()).toBe(`${USERS_ROUTE}?${buildUserListQuery({ ...params, page: 2 })}`);
  });

  it('el destino sale SIEMPRE de la constante de ruta (R1)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${USERS_ROUTE}?`)).toBe(true);
  });
});

describe('el tamano de pagina ofrece 10 y 25 y recarga la lista (R16)', () => {
  it('las opciones son exactamente las del componente compartido', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-page-size'));

    expect(await screen.findAllByRole('option')).toHaveLength(PAGE_SIZE_OPTIONS.length);
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

    expect(ultimoDestino()).toBe(
      `${USERS_ROUTE}?${buildUserListQuery({ ...params, page: 1, pageSize: otro })}`,
    );
  });

  it('sin tamano en la URL la tabla parte del tamano por defecto (10)', () => {
    const params = montar();

    expect(params.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe('ordenar navega, no reordena en cliente (R14)', () => {
  for (const columna of [USERNAME_COLUMN_ID, EMAIL_COLUMN_ID, ACCOUNT_STATUS_COLUMN_ID]) {
    it(`la cabecera de ${columna} pide la lista de nuevo con ese orden`, () => {
      const params = montar();

      expect(USER_QUERYABLE.sortable).toContain(columna);
      const cabecera = screen.getByTestId(`data-table-head-${columna}`);
      fireEvent.click(within(cabecera).getAllByRole('button')[0]!);

      expect(ultimoDestino()).toBe(
        `${USERS_ROUTE}?${buildUserListQuery({
          ...params,
          sort: { columnId: columna, direction: 'asc' },
        })}`,
      );
    });
  }

  for (const columna of [DISPLAY_NAME_COLUMN_ID, ROLE_NAME_COLUMN_ID]) {
    it(`ordenar por ${columna} NO SE OFRECE: no esta en la lista blanca (R14, R15)`, async () => {
      const user = setupUser();
      montar();

      expect(USER_QUERYABLE.sortable).not.toContain(columna);
      // Sin `sortable` no hay `aria-sort` y la etiqueta no es un boton.
      expect(screen.getByTestId(`data-table-head-${columna}`)).not.toHaveAttribute('aria-sort');

      // Y en su menu de columna tampoco aparece ninguna entrada de orden.
      await user.click(screen.getByTestId(`data-table-header-menu-${columna}`));
      await screen.findByTestId(`data-table-header-menu-content-${columna}`);
      expect(screen.queryByTestId(`data-table-sort-asc-${columna}`)).toBeNull();
      expect(screen.queryByTestId(`data-table-sort-desc-${columna}`)).toBeNull();
      expect(routerMock.push).not.toHaveBeenCalled();
    });
  }
});

describe('el UNICO filtro es el de estado, es multivalor y navega (R13)', () => {
  it('marcar un valor del filtro de estado pide la lista de nuevo con ese filtro', async () => {
    const user = setupUser();
    const params = montar();
    const estado = USER_ACCOUNT_STATUSES[0]!;

    // `fireEvent.click` para abrir el menu de Base UI en jsdom, como ya hace la suite de QC-55.
    fireEvent.click(screen.getByTestId(`data-table-filter-${ACCOUNT_STATUS_COLUMN_ID}`));
    await user.click(
      await esperarInteractiva(
        screen.getByTestId(`data-table-filter-option-${ACCOUNT_STATUS_COLUMN_ID}-${estado}`),
      ),
    );

    expect(ultimoDestino()).toBe(
      `${USERS_ROUTE}?${buildUserListQuery({
        ...params,
        filters: { [ACCOUNT_STATUS_COLUMN_ID]: { kind: 'select', values: [estado] } },
      })}`,
    );
  });

  it('el filtro ofrece los CUATRO estados del contrato y ningun otro', () => {
    montar();

    fireEvent.click(screen.getByTestId(`data-table-filter-${ACCOUNT_STATUS_COLUMN_ID}`));

    for (const estado of USER_ACCOUNT_STATUSES) {
      expect(
        screen.getByTestId(`data-table-filter-option-${ACCOUNT_STATUS_COLUMN_ID}-${estado}`),
      ).toBeInTheDocument();
    }
    expect(
      document.querySelectorAll(
        `[data-testid^="data-table-filter-option-${ACCOUNT_STATUS_COLUMN_ID}-"]`,
      ),
    ).toHaveLength(USER_ACCOUNT_STATUSES.length);
  });

  it('y no hay ningun otro control de filtro: en particular, ninguno por rol', () => {
    montar();

    // El disparador de filtro de una columna es `data-table-filter-<columna>`; lo demas
    // (`-clear-`, `-option-`) cuelga de ese mismo filtro y no es un filtro nuevo.
    const disparadores = Array.from(document.querySelectorAll('[data-testid]'))
      .map((elemento) => elemento.getAttribute('data-testid')!)
      .filter((testid) => /^data-table-filter-[A-Za-z]+$/.test(testid));

    expect(disparadores).toEqual([`data-table-filter-${ACCOUNT_STATUS_COLUMN_ID}`]);
    expect(
      screen.queryByTestId(`data-table-filter-${ROLE_NAME_COLUMN_ID}`),
      'la lista blanca del modulo no declara el rol filtrable (R15)',
    ).toBeNull();
  });
});

describe('la busqueda existe y viaja al servidor sobre el conjunto entero (R12)', () => {
  it('la caja de busqueda SI se monta: el contrato declara `searchable: true`', () => {
    montar();

    expect(USER_QUERYABLE.searchable).toBe(true);
    expect(screen.getByTestId('data-table-search')).toHaveAttribute('type', 'search');
  });

  it('escribir un termino navega con ese termino en la URL, sobre el conjunto entero', async () => {
    vi.useFakeTimers();
    const params = montar();

    // `fireEvent.change` en vez de teclear: con temporizadores falseados, `user-event` no resuelve
    // su espera interna en este repo (ver `tests/unit/shared/data-table-filters.test.tsx`).
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'lopez' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(ultimoDestino()).toBe(
      `${USERS_ROUTE}?${buildUserListQuery({ ...params, search: 'lopez' })}`,
    );
    vi.useRealTimers();
  });

  it('el termino NO filtra en cliente: las tres filas siguen pintadas', async () => {
    vi.useFakeTimers();
    montar();

    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'lopez' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(USUARIOS.length);
    vi.useRealTimers();
  });
});

describe('el desbordamiento se resuelve DENTRO de la tabla (R21)', () => {
  it('el unico desplazador horizontal es el contenedor del primitivo, y ningun ancestro desplaza', () => {
    montar();

    const tabla = screen.getByRole('table');
    const contenedor = tabla.parentElement!;
    expect(contenedor.getAttribute('data-slot')).toBe('table-container');
    expect(clases(contenedor)).toContain('overflow-x-auto');

    const desplazadores = Array.from(
      document.body.querySelectorAll('.overflow-x-auto, .overflow-x-scroll'),
    );
    expect(desplazadores).toEqual([contenedor]);

    for (
      let ancestro = contenedor.parentElement;
      ancestro !== null;
      ancestro = ancestro.parentElement
    ) {
      for (const clase of clases(ancestro)) {
        expect(clase.startsWith('overflow-x-'), `${ancestro.tagName} declara ${clase}`).toBe(false);
      }
      expect((ancestro as HTMLElement).style.overflowX).toBe('');
    }

    // Nadie fuerza el ancho del documento: sin `w-screen` y sin `overflow` en linea.
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      expect(clases(elemento)).not.toContain('w-screen');
    }
    expect(document.documentElement.style.overflowX).toBe('');
  });
});

describe('la tabla es la duena del estado de las escrituras (R6, `design.md > 8` y `> 9`)', () => {
  it('monta UNA instancia del estado para toda la pagina, no una por fila', () => {
    montar();

    // Un solo contenedor de la tabla, con el estado cerrado de partida.
    expect(screen.getAllByTestId(USER_TABLE_TESTID)).toHaveLength(1);
    expect(screen.getByTestId(USER_TABLE_TESTID)).toHaveAttribute('data-user-panel', 'none');
    // Y tres disparadores por fila, uno por accion (R6, mitad cliente).
    expect(screen.getAllByTestId(USER_ROW_ACTIONS_TESTID)).toHaveLength(USUARIOS.length);
  });

  for (const [testid, modo] of [
    [USER_ACTION_EDIT_TESTID, 'edit'],
    [USER_ACTION_DELETE_TESTID, 'delete'],
    [USER_ACTION_STATUS_TESTID, 'status'],
  ] as const) {
    it(`la accion ${modo} de una fila abre ese modo SOBRE ESE usuario`, async () => {
      const user = setupUser();
      montar();
      const objetivo = USUARIOS[1]!;

      const fila = screen.getByTestId(`data-table-row-${objetivo.id}`);
      await user.click(within(fila).getByTestId(testid));

      const tabla = screen.getByTestId(USER_TABLE_TESTID);
      expect(tabla).toHaveAttribute('data-user-panel', modo);
      expect(tabla).toHaveAttribute('data-user-panel-target', objetivo.id);
    });
  }

  it('sin `usuarios.modificar` no se emite ninguna accion de fila (R6)', () => {
    montar({}, 3, false);

    expect(screen.queryByTestId(USER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryByTestId(USER_ACTION_EDIT_TESTID)).toBeNull();
    expect(screen.getByTestId(USER_TABLE_TESTID)).toHaveAttribute('data-user-panel', 'none');
  });
});
