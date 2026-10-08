import { cleanup, render, screen, within } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import DashboardPage, { metadata } from '@/app/(private)/dashboard/page';
import {
  EXECUTION_TRACE_SECTION_TESTID,
  EXECUTION_TRACE_SECTION_TITLE,
  parseExecutionTraceListParams,
  type ExecutionTraceListParams,
} from '@/app/(private)/dashboard/components';
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
 *
 * Nota del 2026-10-08 (QC-167 T12, R25): el area deja de estar vacia; contiene la seccion del
 * recorrido de ejecucion y nada mas. La seccion se SIMULA: la real llama a una Server Action que
 * lee de la composicion y es un componente `async`, y lo que este archivo mide es la costura del
 * area, no la lista (esa vive en `tests/ui/dashboard/`). R2 y R4 no cambian: la lista no anade
 * `h1` ni landmarks.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const {
  usePathnameMock,
  logoutActionMock,
  cookiesMock,
  getSessionUserMock,
  listExecutionTracesActionMock,
  seccionSimuladaMock,
} = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
  getSessionUserMock: vi.fn(),
  listExecutionTracesActionMock: vi.fn(),
  seccionSimuladaMock: vi.fn<(props: { params: unknown }) => void>(),
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

// 2026-10-08: la accion real importa `observabilidad` y `asignaciones` de la composicion, que este
// mock no trae; se sustituye para que el modulo de la seccion cargue sin ella.
vi.mock('@/lib/modules/asignaciones/adapters/driving/execution-trace-actions', () => ({
  listExecutionTracesAction: listExecutionTracesActionMock,
  getExecutionTraceAction: vi.fn(),
}));

// 2026-10-08: la seccion se simula con un componente sincrono que conserva su `data-testid` y su
// titulo reales y anota con que parametros la monto el area.
vi.mock(
  '@/app/(private)/dashboard/components/execution-trace-list-section',
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import('@/app/(private)/dashboard/components/execution-trace-list-section')
      >();
    return {
      ...real,
      ExecutionTraceListSection: (props: { params: ExecutionTraceListParams }) => {
        seccionSimuladaMock(props);
        return (
          <div data-testid={real.EXECUTION_TRACE_SECTION_TESTID}>
            <h2>{real.EXECUTION_TRACE_SECTION_TITLE}</h2>
          </div>
        );
      },
    };
  },
);

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
  traceSection: EXECUTION_TRACE_SECTION_TESTID,
} as const;

/** Consulta de la URL del test: un filtro de persona para comprobar que llega a la seccion. */
const SEARCH_PARAMS_DEL_TEST = { persona: 'u-test-7' } as const;

/** Marcador del hijo neutro con el que se mide el armazon «solo» (linea base de R4). */
const CHILD_TEST_ID = 'pantalla-de-prueba';

/** Roles que delatarian contenido del area fuera de la seccion del recorrido (R25). */
const ROLES_DE_CONTENIDO = ['table', 'list', 'img', 'article', 'button', 'link'] as const;

/** Landmarks que la pantalla no puede introducir por encima de los del layout (R4). */
const LANDMARKS_VIGILADOS = ['region', 'banner', 'contentinfo'] as const;

/** Monta el layout privado envolviendo la pantalla real, como hace el App Router. */
async function renderDashboardEnLayout() {
  // `DashboardPage` es `async` desde QC-75 (exige `dashboard.consultar` antes de pintar), asi
  // que se INVOCA y se pasa su arbol ya resuelto: React no renderiza un componente `async` en el
  // cliente, que es donde jsdom monta el arbol.
  // 2026-10-08: la pagina recibe `searchParams` como promesa, igual que en el App Router.
  return render(
    await PrivateLayout({
      children: await DashboardPage({ searchParams: Promise.resolve(SEARCH_PARAMS_DEL_TEST) }),
    }),
  );
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

  it('R25: el area de contenido contiene la lista del recorrido y nada mas', async () => {
    // Enmendado el 2026-10-08 (QC-167 T12, R25). Hasta entonces era R3 de QC-12, «el area se
    // renderiza vacia»: la costura se rellena con la seccion del recorrido. Sigue siendo un test
    // en negativo: cualquier cosa que entre en el area FUERA de esa seccion lo pone rojo.
    await renderDashboardEnLayout();

    const area = screen.getByTestId(testId.dashboardContent);
    const seccion = within(area).getByTestId(testId.traceSection);

    expect(area.children).toHaveLength(1);
    expect(area.firstElementChild).toBe(seccion);
    expect(area.textContent).toBe(seccion.textContent);
    expect(within(seccion).getByRole('heading', { level: 2 })).toHaveTextContent(
      EXECUTION_TRACE_SECTION_TITLE,
    );

    for (const rol of ROLES_DE_CONTENIDO) {
      for (const elemento of within(area).queryAllByRole(rol)) {
        expect(seccion, `rol «${rol}» fuera de la seccion del recorrido`).toContainElement(elemento);
      }
    }

    // El area le pasa a la seccion la consulta de la URL ya acotada, no la cruda.
    expect(seccionSimuladaMock).toHaveBeenCalledWith({
      params: parseExecutionTraceListParams(SEARCH_PARAMS_DEL_TEST),
    });
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

  it('R12: renderiza titulo y un hijo en el area, en viewport angosto y en ancho', async () => {
    // R12 — el layout privado cambia de mecanismo en 768px; la pantalla debe presentarse igual
    // a los dos lados del breakpoint. Enmendado el 2026-10-08 (QC-167 T12, R25): el area ya no
    // tiene cero hijos sino uno, la seccion del recorrido, a los dos anchos.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderDashboardEnLayout();

      const titulo = screen.getByTestId(testId.title);
      const area = screen.getByTestId(testId.dashboardContent);

      expect(titulo, `titulo visible a ${ancho}px`).toBeVisible();
      expect(area, `area de contenido presente a ${ancho}px`).toBeInTheDocument();
      expect(area.children, `un solo hijo en el area a ${ancho}px`).toHaveLength(1);
      expect(area.firstElementChild, `la seccion del recorrido a ${ancho}px`).toBe(
        screen.getByTestId(testId.traceSection),
      );
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

      cleanup();
    }
  });
});
