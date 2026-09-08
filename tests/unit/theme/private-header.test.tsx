// T11 — Test del encabezado privado con el control de tema (R13, R24, R27; `design.md > 4`).
//
// Mismo cableado de mocks que `tests/unit/private-layout.test.tsx`: `PrivateLayout` es un
// Server Component async, asi que se llama directamente y se renderiza el JSX resultante.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import { LOGOUT_LABEL } from '@/app/(private)/components/logout-button';
import { THEME_TOGGLE_LABEL } from '@/app/(private)/components/theme-toggle';
import { SIDEBAR_TOGGLE_LABEL } from '@/app/(private)/components/sidebar-toggle';
import type { SessionUser } from '@/lib/modules/identity';

import {
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
  WIDE_VIEWPORT,
} from '../../helpers/viewport';

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Analista de calidad',
  // QC-74 T8: `SessionUser` exige `permissions`. Vacio: este test no autoriza nada.
  permissions: [],
};

const { usePathnameMock, redirectMock, logoutActionMock, cookiesMock, getSessionUserMock } =
  vi.hoisted(() => ({
    usePathnameMock: vi.fn<() => string>(),
    redirectMock: vi.fn<(ruta: string) => never>(),
    logoutActionMock: vi.fn<() => Promise<void>>(),
    cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
    getSessionUserMock: vi.fn(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: {
    getSessionUser: getSessionUserMock,
    endSession: vi.fn<() => Promise<void>>(),
  },
}));

const RAIZ = join(__dirname, '..', '..', '..');

/** Fuente sin lineas de comentario: la guardia de R27 mira codigo, no prosa. */
function fuenteLayoutPrivado(): string {
  return readFileSync(join(RAIZ, 'app', '(private)', 'layout.tsx'), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

async function renderLayout() {
  return render(await PrivateLayout({ children: <div data-testid="pantalla-de-prueba" /> }));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
  redirectMock.mockImplementation((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  });
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('encabezado privado con el control de tema', () => {
  it('muestra el control de tema junto al de la barra lateral', async () => {
    // R13
    await renderLayout();

    const encabezado = screen.getByTestId('private-header');
    const sidebarToggle = screen.getByRole('button', { name: SIDEBAR_TOGGLE_LABEL });
    const themeToggle = screen.getByRole('button', { name: THEME_TOGGLE_LABEL });

    expect(encabezado).toContainElement(sidebarToggle);
    expect(encabezado).toContainElement(themeToggle);
  });

  it('el cierre de sesion es vecino del control de tema en el encabezado', async () => {
    // Enmienda del 2026-09-07 (decision humana): el control salio del menu del pie de la barra
    // lateral -donde costaba dos gestos- y paso a ser un boton del encabezado, junto al de tema.
    await renderLayout();

    const encabezado = screen.getByTestId('private-header');
    const themeToggle = screen.getByRole('button', { name: THEME_TOGGLE_LABEL });
    const logout = screen.getByRole('button', { name: LOGOUT_LABEL });

    expect(encabezado).toContainElement(logout);
    // Vecinos de verdad: mismo contenedor, no dos esquinas distintas del encabezado.
    expect(logout.closest('form')?.parentElement).toBe(themeToggle.parentElement);
  });

  it('conserva un unico landmark main y el nombre accesible del SidebarToggle', async () => {
    // R24
    await renderLayout();

    const landmarks = screen.getAllByRole('main');
    expect(landmarks).toHaveLength(1);

    expect(screen.getByRole('button', { name: SIDEBAR_TOGGLE_LABEL })).toBeInTheDocument();
  });

  it('no convierte el layout privado en Client Component', () => {
    // R27 — contrato de fuente: sin 'use client' y sigue llamando al proveedor de sesion.
    const fuente = fuenteLayoutPrivado();

    expect(fuente).not.toContain("'use client'");
    expect(fuente).not.toContain('"use client"');
    expect(fuente).toContain('identity.getSessionUser');
  });
});
