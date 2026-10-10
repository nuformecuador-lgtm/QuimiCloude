// Multiplataforma de la pantalla de clientes.
//
// La pantalla REAL, con `ClientesPage` directamente (no hace falta el layout privado completo:
// aqui no se mide el desbordamiento de la barra lateral, que ya cubren las guardias heredadas
// de `docs/architecture.md`, sino altura, `:hover`, area tactil y tamano de fuente DENTRO de la
// pantalla de clientes). El arnes de mocks es el mismo que `clientes-page.test.tsx`: doble
// del proveedor de sesion en `@/lib/composition` y de las cinco Server Actions de
// `customer-actions.ts` por su ruta exacta.
//
// Cada caso corre a 375 px y a 1280 px, sin excepcion de escritorio, con `describe.each` para
// que el informe diga en cual de los dos anchos fallo.
//
// jsdom no hace layout: `offsetWidth` es 0 y las clases de Tailwind no estan compiladas aqui.
// «44x44 px» y «16 px» se afirman sobre los TOKENS de clase (`min-h-11`/`min-w-11` = 2.75rem =
// 44px; `text-base` = 1rem = 16px, con `md:text-base` para que no baje en el breakpoint), mismo
// criterio que las guardias multiplataforma de otras pantallas.
//
// Ningun assert sobre copy: todo se localiza por `data-testid` o por rol accesible.

import { cleanup, render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_ACTION_DELETE_TESTID,
  CUSTOMER_ACTION_EDIT_TESTID,
  CUSTOMER_CREATE_OPEN_TESTID,
  CUSTOMER_FIELD_TESTIDS,
  CUSTOMER_FORM_CANCEL_TESTID,
  CUSTOMER_FORM_SUBMIT_TESTID,
  CUSTOMER_FORM_TESTID,
  CUSTOMER_ROW_ACTIONS_TESTID,
  CUSTOMER_SHEET_TESTID,
} from '@/app/(private)/clientes/components';
import ClientesPage from '@/app/(private)/clientes/page';
import type { CustomerView } from '@/lib/modules/clientes';
import { PERMISSIONS } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { openRowActionsMenu } from '../../helpers/row-actions-menu';
import { setupUser } from '../../helpers/user-event';
import { NARROW_VIEWPORT, WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

/** Area tactil minima: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de un campo: `text-base` = 1rem = 16 px, y que no baje en el breakpoint. */
const FUENTE_DE_CAMPO = ['text-base', 'md:text-base'] as const;

const { getSessionUserMock, listCustomersActionMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  listCustomersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
}));

// Las cinco actions de clientes. Las de escritura FALLAN si se les llama: este archivo mide la
// pantalla servida, no ejercita ninguna mutacion contra un backend.
vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde este archivo`);
  };
  return {
    listCustomersAction: listCustomersActionMock,
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    deleteCustomerAction: vi.fn(noDebeInvocarse('deleteCustomerAction')),
  };
});

const PERMISOS_DE_CLIENTES = PERMISSIONS.filter((entrada) => entrada.module === 'clientes').map(
  (entrada) => entrada.code,
);

const USUARIO_DEL_TEST = {
  id: '99999999-9999-4999-8999-999999999999',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  permissions: PERMISOS_DE_CLIENTES,
};

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';

const CLIENTE: CustomerView = {
  id: CLIENTE_ID,
  firstNames: 'Ana',
  lastNames: 'Lopez',
  city: 'Bogota',
  phone: '3001234567',
  email: 'ana@example.test',
  address: 'Calle 1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function paginaCon(items: readonly CustomerView[]) {
  return {
    status: 'success',
    data: { items, total: items.length, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

/**
 * Resuelve los Server Components `async` del arbol: jsdom no sabe ejecutar un componente async,
 * asi que sin esto la pantalla se queda en el `fallback` del `<Suspense>` (el esqueleto), que no
 * es lo que este archivo mide. Copiado de `clientes-page.test.tsx`.
 */
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

/** Monta la pantalla real, ya con la lista resuelta (Server Component `async`). */
async function renderPantalla() {
  const arbol = await ClientesPage({ searchParams: Promise.resolve({}) });
  return render(await resolverServerComponents(arbol));
}

/** Todas las clases de un elemento, ya troceadas: `className` de un SVG no es una cadena. */
function clases(elemento: Element): string[] {
  return Array.from(elemento.classList);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  listCustomersActionMock.mockResolvedValue(paginaCon([CLIENTE]));
});

afterEach(() => {
  cleanup();
  resetViewport();
});

const VIEWPORTS = [
  ['angosto', NARROW_VIEWPORT],
  ['ancho', WIDE_VIEWPORT],
] as const;

describe.each(VIEWPORTS)('pantalla de clientes en viewport %s (%i px)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  it('la pantalla no usa `100vh` como alto (R39)', async () => {
    await renderPantalla();

    const prohibidas = new Set(['h-screen', 'min-h-screen', 'max-h-screen']);

    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(prohibidas.has(clase), `${elemento.tagName} usa ${clase} a ${ancho}px`).toBe(false);
        expect(clase, `${elemento.tagName} usa 100vh a ${ancho}px`).not.toContain('100vh');
      }
      const estilo = elemento.getAttribute('style') ?? '';
      expect(estilo, `${elemento.tagName} usa 100vh en linea a ${ancho}px`).not.toContain('100vh');
    }
  });

  it('ningun control se descubre ni se activa solo con `:hover` (R39)', async () => {
    await renderPantalla();

    // En el DOM: las dos acciones de fila y el disparador del alta ya estan visibles, sin pasar
    // el puntero por encima. En tactil no hay puntero que pasar.
    const fila = await openRowActionsMenu(setupUser(), screen.getByTestId(CUSTOMER_ROW_ACTIONS_TESTID));
    for (const accion of [CUSTOMER_ACTION_EDIT_TESTID, CUSTOMER_ACTION_DELETE_TESTID]) {
      expect(within(fila).queryByTestId(accion)).not.toBeNull();
      expect(screen.getByTestId(accion)).toBeVisible();
    }
    expect(screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID)).toBeVisible();

    // En las clases: ningun elemento REVELA nada con el puntero. Un `hover:bg-muted` es
    // decoracion; lo que se prohibe es que la existencia o la visibilidad dependan del puntero.
    const revelaConElPuntero = /^(group-)?hover:(flex|block|inline|inline-flex|visible|opacity-100)$/;
    const ocultoDeSalida = new Set(['invisible', 'opacity-0']);

    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(clase, `${elemento.tagName} revela con el puntero a ${ancho}px`).not.toMatch(revelaConElPuntero);
        expect(
          ocultoDeSalida.has(clase),
          `${elemento.tagName} arranca oculto y solo el puntero lo trae a ${ancho}px`,
        ).toBe(false);
      }
    }
  });

  it('las acciones de fila y el disparador de alta miden al menos 44x44 px (R39)', async () => {
    await renderPantalla();

    // Disparador del menu de fila y alta: 44x44 (min-h-11 + min-w-11). Los items del menu
    // compartido son anchos (el menu mide >= 200 px), asi que solo llevan min-h-11 (design.md > 11).
    const disparador = screen.getByTestId(CUSTOMER_ROW_ACTIONS_TESTID);
    for (const control of [disparador, screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID)]) {
      for (const token of AREA_TACTIL) {
        expect(control.className, `${control.getAttribute('data-testid')} a ${ancho}px`).toContain(token);
      }
    }

    const fila = await openRowActionsMenu(setupUser(), disparador);
    for (const accion of [CUSTOMER_ACTION_EDIT_TESTID, CUSTOMER_ACTION_DELETE_TESTID]) {
      const item = within(fila).queryByTestId(accion);
      expect(item, `${accion} deberia existir en el DOM`).not.toBeNull();
      expect(item?.className, `${accion} a ${ancho}px`).toContain('min-h-11');
    }
  });

  it('los campos y las acciones del formulario cumplen 44x44 px y 16 px de fuente (R39)', async () => {
    // 16 px es el umbral por debajo del cual Safari en iOS hace zoom al enfocar el campo. Se
    // comprueba en los DOS anchos: `md:text-base` esta para que el campo no vuelva a 14 px en
    // el breakpoint de escritorio.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID));
    await screen.findByTestId(CUSTOMER_FORM_TESTID);

    const campos = Object.values(CUSTOMER_FIELD_TESTIDS).map((testid) => screen.getByTestId(testid));

    for (const campo of campos) {
      const nombre = campo.getAttribute('data-testid');
      for (const token of FUENTE_DE_CAMPO) {
        expect(campo.className, `${nombre} a ${ancho}px`).toContain(token);
      }
      expect(campo.className, `${nombre} a ${ancho}px`).toContain('min-h-11');
    }

    for (const accion of [CUSTOMER_FORM_SUBMIT_TESTID, CUSTOMER_FORM_CANCEL_TESTID]) {
      const control = screen.getByTestId(accion);
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    // El panel no se pega al borde inferior del movil: respeta el area segura.
    expect(screen.getByTestId(CUSTOMER_SHEET_TESTID).className).toContain('env(safe-area-inset-bottom)');
  });
});
