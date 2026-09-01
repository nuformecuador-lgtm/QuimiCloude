import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import type { SessionUser } from '@/lib/modules/identity';
import { getInitials } from '@/lib/shared/ui/initials';
import { SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../helpers/viewport';

/**
 * Armazon del layout privado: R1, R5, R16, R35 y R36 (`design.md > 5.2`).
 *
 * Aqui conviven dos clases de test y es deliberado: los de render (que el armazon coloca las
 * piezas donde toca) y los de **guardia de codigo** (que el layout no hace lo que tiene
 * prohibido hacer). Los segundos existen porque «no hacer algo» no se puede observar
 * renderizando: si el layout empezase a consultar base de datos, ningun assert de DOM se
 * pondria rojo.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

/** `SessionUser` del test: nunca el valor de relleno del stub real. */
const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Analista de calidad',
};

const { usePathnameMock, logoutActionMock, cookiesMock, getSessionUserMock, nombresConsultados } =
  vi.hoisted(() => ({
    usePathnameMock: vi.fn<() => string>(),
    logoutActionMock: vi.fn<() => Promise<void>>(),
    cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
    getSessionUserMock: vi.fn(),
    nombresConsultados: [] as string[],
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

vi.mock('@/lib/actions/logout', () => ({
  logoutAction: logoutActionMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

// R16: el proveedor de sesion se sustituye por completo para poder afirmar que el layout
// pinta **lo que el proveedor devuelve**, y no un valor cualquiera.
vi.mock('@/lib/modules/identity/adapters/driven/session/session-stub', () => ({
  getSessionUser: getSessionUserMock,
  endSession: vi.fn<() => Promise<void>>(),
}));

const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';

const CHILD_TEST_ID = 'pantalla-de-prueba';

const testId = {
  sidebar: 'private-sidebar',
  content: 'private-content',
  userName: 'private-user-name',
  userRole: 'private-user-role',
  userInitials: 'private-user-initials',
} as const;

const RAIZ = join(__dirname, '..', '..');

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

async function renderLayout() {
  return render(await PrivateLayout({ children: <div data-testid={CHILD_TEST_ID} /> }));
}

beforeEach(() => {
  vi.clearAllMocks();
  nombresConsultados.length = 0;
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({
    get: (name: string) => {
      nombresConsultados.push(name);
      return undefined;
    },
  });
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('layout privado', () => {
  it('renderiza el contenido de la pantalla dentro del armazon privado', async () => {
    // R1
    await renderLayout();

    const contenido = screen.getByTestId(CHILD_TEST_ID);
    expect(contenido).toBeInTheDocument();

    // Y el armazon esta ahi mismo: la barra lateral vive en el mismo arbol.
    expect(screen.getByTestId(testId.sidebar)).toBeInTheDocument();
    expect(screen.getByTestId(testId.content)).toContainElement(contenido);
  });

  it('el contenido de la pantalla se renderiza dentro de un unico main', async () => {
    // R5
    await renderLayout();

    const landmarks = screen.getAllByRole('main');

    expect(landmarks).toHaveLength(1);
    const principal = landmarks[0] as HTMLElement;
    expect(within(principal).getByTestId(CHILD_TEST_ID)).toBeInTheDocument();
  });

  it('el layout obtiene el usuario del proveedor de sesion y lo pasa por props', async () => {
    // R16
    await renderLayout();

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);

    // Lo que pinta el pie es lo que devolvio el proveedor mockeado, no otra cosa.
    expect(screen.getByTestId(testId.userName)).toHaveTextContent(USUARIO_DEL_TEST.displayName);
    expect(screen.getByTestId(testId.userRole)).toHaveTextContent(
      USUARIO_DEL_TEST.roleName as string,
    );
    expect(screen.getByTestId(testId.userInitials)).toHaveTextContent(
      getInitials(USUARIO_DEL_TEST.displayName),
    );
  });

  it('el sidebar no importa el proveedor de sesion', async () => {
    // R16 — guardia de codigo: los datos entran solo por props. Ningun componente de
    // `components/private/` obtiene nada por su cuenta.
    const fuentes = [
      'components/private/app-sidebar.tsx',
      'components/private/nav-user.tsx',
      'components/private/logout-menu-item.tsx',
    ];
    const prohibidos = ['session-stub', 'next/headers', 'cookies(', 'fetch(', 'prisma', 'supabase'];

    for (const ruta of fuentes) {
      const codigo = fuenteSinComentarios(ruta).toLowerCase();
      for (const prohibido of prohibidos) {
        expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
      }
    }
  });

  it('el layout no valida sesion, no accede a base de datos y no emite cookie de sesion', async () => {
    // R35 — guardia de codigo + assert de runtime.
    const codigo = fuenteSinComentarios('app/(private)/layout.tsx');

    // La unica cookie admitida es la de preferencia de UI de R28, y se nombra por constante.
    expect(codigo).toContain('SIDEBAR_STATE_COOKIE');

    // Toda operacion sobre el almacen de cookies pasa por esa constante...
    const operaciones = Array.from(codigo.matchAll(/cookieStore\.(\w+)\(([^)]*)\)/g));
    expect(operaciones.length).toBeGreaterThan(0);
    for (const [, metodo, argumentos] of operaciones) {
      expect(metodo).toBe('get');
      expect(argumentos).toContain('SIDEBAR_STATE_COOKIE');
    }

    // ...y no hay ninguna otra via de lectura o escritura de cookies.
    expect(codigo).not.toContain('document.cookie');
    expect(codigo).not.toContain('Set-Cookie');
    expect(codigo.toLowerCase()).not.toContain('cookiestore.set');
    expect(codigo.toLowerCase()).not.toContain('cookiestore.delete');

    // Ni proteccion de ruta, ni base de datos, ni red.
    for (const prohibido of ['redirect', 'prisma', 'PrismaClient', 'supabase', 'fetch(']) {
      expect(codigo, `layout.tsx no debe contener «${prohibido}»`).not.toContain(prohibido);
    }

    // Runtime: al renderizar, la unica cookie consultada es la de preferencia de UI.
    await renderLayout();

    expect(nombresConsultados.length).toBeGreaterThan(0);
    for (const nombre of nombresConsultados) {
      expect(nombre).toBe(SIDEBAR_STATE_COOKIE);
    }
  });

  it('el layout privado no monta ninguna region de notificaciones', async () => {
    // R36 — test **en negativo por decision humana (D9)**, no por olvido: la zona privada
    // se queda sin toasts hasta que una feature lo pida, y `sonner` ni siquiera es
    // dependencia de esta feature. Sin este test, montar un `<Toaster />` «ya que estamos»
    // no pondria nada en rojo.
    await renderLayout();

    expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.queryAllByRole('log')).toHaveLength(0);

    // Guardia de codigo: el layout no importa ni renderiza la region de notificaciones.
    const codigo = fuenteSinComentarios('app/(private)/layout.tsx');
    expect(codigo).not.toContain('sonner');
    expect(codigo).not.toContain('@/components/ui/sonner');
    expect(codigo).not.toContain('<Toaster');
  });
});
