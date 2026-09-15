// QC-85 T5 — El estado «cargando» de la lista de grupos: R19, R41.
//
// **Dos niveles, y los dos importan.** El esqueleto SOLO —cuantas filas, cuantas celdas, que se
// anuncia— y el esqueleto EN LA PANTALLA: el arbol de `page.tsx` sin resolver los Server
// Components `async`, que es exactamente lo que `<Suspense>` pinta mientras la consulta esta en
// vuelo. Sin el segundo, nadie probaria que el `fallback` de la pestana de grupos es este y no el
// de personas.
//
// **Ningun assert sobre copy** (R41): el indicador se localiza por `data-testid` y por su rol ARIA.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GROUPS_TAB,
  PAGE_SIZE_PARAM,
  TAB_PARAM,
  WORK_GROUP_LIST_SKELETON_TESTID,
  WORK_GROUP_ROW_SKELETON_TESTID,
  WORK_GROUP_SECTION_TESTID,
  WORK_GROUP_SKELETON_COLUMN_COUNT,
  WORK_GROUP_TABLE_TESTID,
  WorkGroupListSkeleton,
  buildWorkGroupListQuery,
  parseWorkGroupListParams,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { PAGE_SIZE_OPTIONS } from '@/components/shared/data-table';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import type { ReactElement } from 'react';

const { getSessionUserMock, listWorkGroupsActionMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  listWorkGroupsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
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

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// QC-101 T7 — La Server Action del CIERRE DE SESIONES, doble que FALLA si se la llama.
//
// Mismo motivo que el bloque de grupos: el panel de detalle de personas monta ahora el dialogo del
// cierre de sesiones, y `session-actions.ts` lee `observabilidad` de `@/lib/composition` al
// cargarse —y el doble de composicion de este archivo declara solo `identity`—. Ninguna pestana
// cierra la sesion de nadie al pintarse: si alguien la llamara, el caso se pondria rojo.
vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: vi.fn(() => {
    throw new Error('endAllSessionsAction no debe invocarse al pintar la pantalla');
  }),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse mientras se carga`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: listWorkGroupsActionMock,
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

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(sesionCon(['usuarios.consultar', 'usuarios.modificar']));
  // Una consulta que NUNCA resuelve: asi el `<Suspense>` se queda en su `fallback`.
  listWorkGroupsActionMock.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
});

describe('el esqueleto se anuncia y dice la verdad sobre lo que se esta pidiendo (R19)', () => {
  it('tiene rol de estado, `aria-busy` y tantas filas como el tamano pedido', () => {
    render(<WorkGroupListSkeleton rows={PAGE_SIZE_OPTIONS[1]!} />);

    const esqueleto = screen.getByTestId(WORK_GROUP_LIST_SKELETON_TESTID);
    expect(esqueleto).toHaveAttribute('role', 'status');
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByTestId(WORK_GROUP_ROW_SKELETON_TESTID)).toHaveLength(
      PAGE_SIZE_OPTIONS[1]!,
    );
  });

  it('cada fila pinta tantas celdas como columnas declara la lista', () => {
    render(<WorkGroupListSkeleton rows={1} />);

    const fila = screen.getByTestId(WORK_GROUP_ROW_SKELETON_TESTID);
    expect(fila.querySelectorAll('td')).toHaveLength(WORK_GROUP_SKELETON_COLUMN_COUNT);
  });
});

describe('mientras la lista esta en vuelo, la pantalla pinta el esqueleto y NO la tabla (R19)', () => {
  it('con `tab=grupos`, el `fallback` del <Suspense> es el esqueleto de GRUPOS', async () => {
    render(
      await UsuariosPage({
        searchParams: Promise.resolve({ [TAB_PARAM]: GROUPS_TAB, [PAGE_SIZE_PARAM]: '25' }),
      }),
    );

    const esqueleto = screen.getByTestId(WORK_GROUP_LIST_SKELETON_TESTID);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    // Tantas filas como el tamano de pagina PEDIDO: el esqueleto dice la verdad sobre la consulta.
    expect(screen.getAllByTestId(WORK_GROUP_ROW_SKELETON_TESTID)).toHaveLength(25);

    // Y esta DENTRO de la seccion de grupos, sin tabla ninguna todavia.
    expect(screen.getByTestId(WORK_GROUP_SECTION_TESTID)).toContainElement(esqueleto);
    // El esqueleto pinta su propia tabla de huecos, asi que lo que se afirma no es «no hay
    // `<table>`», sino que **la tabla de datos no esta**: ni su envoltorio ni la compartida.
    expect(screen.queryByTestId(WORK_GROUP_TABLE_TESTID)).toBeNull();
    expect(screen.queryByTestId('data-table')).toBeNull();
  });

  it('la `key` del <Suspense> son los parametros de GRUPOS: reaparece en CADA cambio', async () => {
    const consulta = { [TAB_PARAM]: GROUPS_TAB, page: '3', [PAGE_SIZE_PARAM]: '25', q: 'lab' };
    const arbol = (await UsuariosPage({ searchParams: Promise.resolve(consulta) })) as ReactElement<{
      children: readonly ReactElement<{ children: ReactElement }>[];
    }>;

    const seccion = arbol.props.children.at(-1)!;
    expect(seccion.props.children.key).toBe(
      buildWorkGroupListQuery(parseWorkGroupListParams(consulta)),
    );
  });

  it('sin tamano en la URL el esqueleto pinta el tamano por defecto (10)', async () => {
    render(await UsuariosPage({ searchParams: Promise.resolve({ [TAB_PARAM]: GROUPS_TAB }) }));

    expect(screen.getAllByTestId(WORK_GROUP_ROW_SKELETON_TESTID)).toHaveLength(DEFAULT_PAGE_SIZE);
  });
});
