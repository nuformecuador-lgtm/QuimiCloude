// QC-85 T7 — Multiplataforma y desbordamiento de la pestana de grupos: R40 (y R41 en la forma de
// afirmarlo).
//
// **La pantalla REAL, en los DOS viewports.** Se monta `page.tsx` entera con `tab=grupos` —su
// `<Suspense>`, su seccion de servidor, la tabla compartida y las acciones de fila— porque lo que
// R40 pregunta —quien se desplaza, que es alcanzable, cuanto mide cada control— solo tiene respuesta
// con el arbol completo: el contenedor de scroll lo aporta el primitivo `Table` y los dos destinos
// de la fila los monta la columna de acciones.
//
// **Cada caso corre a 375 px y a 1280 px, sin excepcion de escritorio** (R40). No es un `for` dentro
// de un caso: es `describe.each`, para que el informe diga en cual de los dos anchos fallo.
//
// **Lo que jsdom NO puede decir, y como se sustituye.** jsdom no hace layout: `offsetWidth` es 0 y
// `getComputedStyle` no resuelve clases de Tailwind, que ademas no estan compiladas aqui. Asi que
// «44x44 px» y «16 px» se afirman sobre los tokens de clase (`min-h-11`/`min-w-11` = 2.75rem = 44
// px; `text-base` = 1rem = 16 px), que es el criterio heredado de QC-11, QC-45, QC-39 y QC-67 y el
// unico honesto en este entorno.
//
// **El layout privado NO se monta aqui, y es deliberado**: lo que R40 acota es el desbordamiento de
// la pestana. El armazon heredado ya tiene su cobertura en `tests/unit/private-layout.test.tsx`.

import { cleanup, render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GROUPS_TAB,
  TAB_PARAM,
  USUARIOS_TABS_TESTID,
  USUARIOS_TAB_TESTIDS,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ACTION_EDIT_TESTID,
  WORK_GROUP_CREATE_OPEN_TESTID,
  WORK_GROUP_SECTION_TESTID,
  WORK_GROUP_SHEET_TESTID,
  WORK_GROUP_TABLE_TESTID,
} from '@/app/(private)/configuracion/usuarios/components';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import type { WorkGroupRow } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { setupUser } from '../../../helpers/user-event';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../../helpers/viewport';

/** Area tactil minima de R40: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de R40 para un campo: `text-base` = 1rem = 16 px. */
const FUENTE_DE_CAMPO = 'text-base';

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
    throw new Error(`${nombre} no debe invocarse desde el test de viewport`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: listWorkGroupsActionMock,
    // El panel de edicion SI la pide al abrirse (R25): responde una pagina vacia. Lo que la lista
    // de miembros hace se prueba en `work-group-members.test.tsx`.
    listWorkGroupMembersAction: vi.fn(async () => ({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    })),
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

/** Un nombre LARGO de verdad: es lo que mas facilmente puede desbordar la columna de datos. */
const GRUPOS: readonly WorkGroupRow[] = [
  {
    id: 'g1',
    name: 'Laboratorio de control de calidad de materias primas y producto terminado',
    members: [],
  },
  { id: 'g2', name: 'Produccion', members: [] },
];

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

/** Resuelve los Server Components `async` del arbol antes de entregarselo al renderer. */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

async function renderPestanaDeGrupos() {
  return render(
    await resolverServerComponents(
      await UsuariosPage({ searchParams: Promise.resolve({ [TAB_PARAM]: GROUPS_TAB }) }),
    ),
  );
}

function clases(elemento: Element): readonly string[] {
  return Array.from(elemento.classList);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getSessionUserMock.mockResolvedValue(sesionCon(['usuarios.consultar', 'usuarios.modificar']));
  listWorkGroupsActionMock.mockResolvedValue({
    status: 'success',
    data: {
      items: GRUPOS,
      total: GRUPOS.length,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 2,
    },
  });
});

afterEach(() => {
  cleanup();
  resetViewport();
  // El primitivo del panel BLOQUEA el scroll del documento mientras esta abierto, y ese estilo en
  // linea sobrevive al desmontaje de jsdom. Se suelta entre casos para que lo que el caso
  // siguiente mida sea SUYO: sin esto, el caso del desbordamiento leeria el `overflow` que dejo
  // el caso que abrio el panel. No se relaja nada —la comprobacion sigue siendo igualdad exacta
  // contra cadena vacia—: se limpia el residuo de un caso anterior.
  for (const elemento of [document.body, document.documentElement]) {
    elemento.style.removeProperty('overflow');
    elemento.style.removeProperty('overflow-x');
    elemento.style.removeProperty('overflow-y');
  }
});

describe.each([
  ['angosto', NARROW_VIEWPORT],
  ['ancho', WIDE_VIEWPORT],
])('la pestana de grupos es utilizable en viewport %s (R40)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  it('la lista se pinta entera: ninguna excepcion de escritorio', async () => {
    await renderPestanaDeGrupos();

    expect(screen.getByTestId(WORK_GROUP_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(WORK_GROUP_TABLE_TESTID)).toBeInTheDocument();
    for (const grupo of GRUPOS) {
      expect(screen.getByTestId(`data-table-row-${grupo.id}`)).toBeInTheDocument();
    }
  });

  it('el desbordamiento lo resuelve la TABLA, sin scroll horizontal del documento', async () => {
    await renderPestanaDeGrupos();

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

    // Nadie fuerza el ancho del documento.
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      expect(clases(elemento)).not.toContain('w-screen');
    }
    expect(document.documentElement.style.overflowX).toBe('');
  });

  it('NINGUN elemento usa `100vh` como alto de pantalla', async () => {
    const { container } = await renderPestanaDeGrupos();

    for (const elemento of Array.from(container.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(clase, `${elemento.tagName} declara ${clase}`).not.toMatch(/(^|:)(min-|max-)?h-screen$/);
        expect(clase).not.toMatch(/\[100vh\]/);
      }
      expect((elemento as HTMLElement).style.height).not.toContain('100vh');
      expect((elemento as HTMLElement).style.minHeight).not.toContain('100vh');
    }
  });

  it('los controles tactiles miden al menos 44x44 px', async () => {
    await renderPestanaDeGrupos();

    const objetivos = [
      screen.getByTestId(WORK_GROUP_CREATE_OPEN_TESTID),
      screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB]),
      ...screen.getAllByTestId(WORK_GROUP_ACTION_EDIT_TESTID),
      ...screen.getAllByTestId(WORK_GROUP_ACTION_DELETE_TESTID),
    ];

    for (const objetivo of objetivos) {
      for (const token of AREA_TACTIL) {
        expect(objetivo.className, `${objetivo.getAttribute('data-testid')} sin ${token}`).toContain(
          token,
        );
      }
    }
  });

  it('el campo de busqueda tiene fuente de al menos 16 px', async () => {
    await renderPestanaDeGrupos();

    expect(screen.getByTestId('data-table-search').className).toContain(FUENTE_DE_CAMPO);
  });

  it('las acciones de fila estan SIEMPRE en el DOM: nada depende de `:hover`', async () => {
    await renderPestanaDeGrupos();

    for (const grupo of GRUPOS) {
      const fila = screen.getByTestId(`data-table-row-${grupo.id}`);
      const editar = within(fila).getByTestId(WORK_GROUP_ACTION_EDIT_TESTID);
      const borrar = within(fila).getByTestId(WORK_GROUP_ACTION_DELETE_TESTID);

      for (const control of [editar, borrar]) {
        expect(control).toBeVisible();
        // Ni `opacity-0`, ni `invisible`, ni `hidden` que solo se levanten al pasar el raton.
        for (const clase of clases(control)) {
          expect(clase).not.toBe('opacity-0');
          expect(clase).not.toBe('invisible');
          expect(clase).not.toBe('hidden');
        }
      }
    }
  });

  it('y son alcanzables con el dedo: pulsarlas abre la escritura sin pasar por `:hover`', async () => {
    const user = setupUser();
    await renderPestanaDeGrupos();

    const fila = screen.getByTestId(`data-table-row-${GRUPOS[0]!.id}`);
    await user.click(within(fila).getByTestId(WORK_GROUP_ACTION_EDIT_TESTID));

    expect(await screen.findByTestId(WORK_GROUP_SHEET_TESTID)).toBeInTheDocument();
  });

  it('el conmutador de pestanas sigue alcanzable con la lista montada', async () => {
    await renderPestanaDeGrupos();

    const conmutador = screen.getByTestId(USUARIOS_TABS_TESTID);
    expect(conmutador).toBeVisible();
    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB])).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
