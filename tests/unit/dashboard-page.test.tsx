import { cleanup, render, screen, within } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import DashboardPage, { metadata } from '@/app/(private)/dashboard/page';
import { PERMISSIONS } from '@/lib/modules/identity';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../helpers/viewport';

/**
 * Pantalla de dashboard, render dentro del armazon privado: R1–R5 y R12
 * (`specs/QC-12-dashboard-en-blanco/tasks.md > T3`).
 *
 * La pantalla se monta **dentro del layout privado** —igual que en produccion— porque lo que
 * hay que demostrar no es que un `<div>` renderiza, sino que el titulo y el area de contenido
 * quedan dentro del armazon heredado de QC-11 **sin anadirle landmarks**. Por eso se reutiliza
 * el patron de mocks de `tests/unit/private-layout.test.tsx` (`next/headers`,
 * `next/navigation`, `@/lib/composition`) y el helper `tests/helpers/viewport.ts`: jsdom no
 * implementa `matchMedia` y el layout lo usa.
 *
 * **R3 y R4 son tests en negativo a proposito**: «estar vacio» y «no anadir landmarks» es
 * justo lo que una feature posterior puede romper sin que nada se ponga rojo.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const { usePathnameMock, logoutActionMock, cookiesMock, getSessionUserMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
  getSessionUserMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
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

/** Ruta que no coincide con ningun destino de la navegacion: nada arranca activo. */
const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';

/** Usuario del test: nunca el valor de relleno del stub real. */
const USUARIO_DEL_TEST = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Analista de calidad',
  // QC-75 (T6): las pantallas privadas exigen `<modulo>.consultar` con `requirePagePermission`
  // antes de pintar nada, asi que un usuario sin permisos aqui daria 404 en vez de la pantalla
  // que este archivo mide. Se le da el CATALOGO ENTERO, derivado de `PERMISSIONS` y nunca escrito
  // a mano: este archivo no prueba autorizacion -eso es
  // `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`-, prueba lo que se ve cuando SI se
  // puede ver, y con el catalogo entero el menu filtrado tampoco pierde ningun item.
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const testId = {
  content: 'private-content',
  title: 'dashboard-title',
  dashboardContent: 'dashboard-content',
} as const;

/** Marcador del hijo neutro con el que se mide el armazon «solo» (linea base de R4). */
const CHILD_TEST_ID = 'pantalla-de-prueba';

/** Roles que delatarian contenido dentro del area que debe estar vacia (R3). */
const ROLES_DE_CONTENIDO = ['table', 'list', 'img', 'article', 'button', 'link'] as const;

/** Landmarks que la pantalla no puede introducir por encima de los del layout (R4). */
const LANDMARKS_VIGILADOS = ['region', 'banner', 'contentinfo'] as const;

/** Monta el layout privado envolviendo la pantalla real, como hace el App Router. */
async function renderDashboardEnLayout() {
  // `DashboardPage` es `async` desde QC-75 (exige `dashboard.consultar` antes de pintar), asi
  // que se INVOCA y se pasa su arbol ya resuelto: React no renderiza un componente `async` en el
  // cliente, que es donde jsdom monta el arbol.
  return render(await PrivateLayout({ children: await DashboardPage() }));
}

/** Monta el layout privado con un hijo neutro: la linea base contra la que compara R4. */
async function renderLayoutSolo() {
  return render(await PrivateLayout({ children: <div data-testid={CHILD_TEST_ID} /> }));
}

/** Cuenta los landmarks vigilados que hay ahora mismo en el documento. */
function contarLandmarks(): Record<string, number> {
  return Object.fromEntries(
    LANDMARKS_VIGILADOS.map((rol) => [rol, screen.queryAllByRole(rol).length]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
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

describe('pantalla de dashboard', () => {
  it('la pantalla del dashboard se renderiza dentro del armazon privado', async () => {
    // R1
    await renderDashboardEnLayout();

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toContainElement(screen.getByTestId(testId.title));
    expect(armazon).toContainElement(screen.getByTestId(testId.dashboardContent));
  });

  it('presenta exactamente un encabezado de primer nivel', async () => {
    // R2
    await renderDashboardEnLayout();

    const encabezados = screen.getAllByRole('heading', { level: 1 });

    expect(encabezados).toHaveLength(1);
    // El unico `h1` de la pagina es el titulo de la pantalla, no otro cualquiera.
    expect(encabezados[0]).toBe(screen.getByTestId(testId.title));
  });

  it('el area de contenido se renderiza vacia: sin tarjetas, tablas, listas ni texto', async () => {
    // R3 — test **en negativo**: la costura esta vacia a proposito y rellenarla debe romper algo.
    await renderDashboardEnLayout();

    const area = screen.getByTestId(testId.dashboardContent);

    expect(area.children).toHaveLength(0);
    expect(area.textContent).toBe('');

    for (const rol of ROLES_DE_CONTENIDO) {
      expect(within(area).queryAllByRole(rol), `el area no debe contener rol «${rol}»`).toHaveLength(
        0,
      );
    }
  });

  it('no anade landmarks: el main sigue siendo unico y no aparece ninguna region nueva', async () => {
    // R4 — test **en negativo**, medido contra el armazon solo: lo que se prohibe no es tener
    // landmarks, es **anadir** los que el layout de QC-11 no tenia.
    await renderLayoutSolo();
    const lineaBase = contarLandmarks();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    cleanup();

    await renderDashboardEnLayout();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);
    // Y la pantalla vive dentro de ese unico `main`: no lo declara ella.
    expect(within(principales[0] as HTMLElement).getByTestId(testId.title)).toBeInTheDocument();

    expect(contarLandmarks()).toEqual(lineaBase);
  });

  it('declara un titulo de documento propio que incluye la marca', async () => {
    // R5 — el assert va sobre la constante `BRAND_LABEL`, nunca sobre el literal de copy.
    const titulo = metadata.title;

    expect(typeof titulo).toBe('string');
    expect(titulo as string).not.toHaveLength(0);
    expect(titulo as string).toContain(BRAND_LABEL);
  });

  it('renderiza titulo y area de contenido en viewport angosto y en ancho', async () => {
    // R12 — el layout privado cambia de mecanismo en 768px; la pantalla debe presentarse igual
    // a los dos lados del breakpoint.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderDashboardEnLayout();

      const titulo = screen.getByTestId(testId.title);
      const area = screen.getByTestId(testId.dashboardContent);

      expect(titulo, `titulo visible a ${ancho}px`).toBeVisible();
      expect(area, `area de contenido presente a ${ancho}px`).toBeInTheDocument();
      expect(area.children, `area de contenido vacia a ${ancho}px`).toHaveLength(0);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

      cleanup();
    }
  });
});
