// T15 — Test de contrato del panel flotante de la barra lateral (R18-R21, `design.md > 6` y
// `> 9`). Dos frentes: el texto de `app/globals.css` (radio, degradado, cascada) y lo
// renderizado en jsdom (anchos por props publicas, `variant="floating"`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';

import PrivateLayout from '@/app/(private)/layout';
import type { SessionUser } from '@/lib/modules/identity';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../../helpers/viewport';

// `__dirname` y no `import.meta.url`: en el proyecto `ui` (jsdom) la URL del modulo no es de
// esquema `file`, y `fileURLToPath` lanza. Mismo patron que `tests/unit/private-layout.test.tsx`.
const RAIZ = join(__dirname, '..', '..', '..');

function readGlobalsCss(): string {
  return readFileSync(join(RAIZ, 'app', 'globals.css'), 'utf8');
}

/**
 * El test de anchos (R19) renderiza el `PrivateLayout` REAL de produccion, no un
 * `SidebarProvider` armado a mano: si solo se afirmara sobre un `style` escrito en el propio
 * test, quitar la prop de `app/(private)/layout.tsx` no haria fallar nada (el test seguiria
 * verde por razones equivocadas). Mismo cableado de mocks que `tests/unit/private-layout.test.tsx`.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Analista de calidad',
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

async function renderPanel() {
  return render(await PrivateLayout({ children: <div data-testid="contenido-de-prueba" /> }));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('panel flotante de la barra lateral', () => {
  it('pinta el panel flotante con radio 22px y el degradado de 166 grados de cada modo', () => {
    // R18
    const css = readGlobalsCss();

    const rootGradientMatch = css.match(
      /:root\s*\{\s*--sidebar-panel-gradient:\s*linear-gradient\(166deg,\s*#ffffff 0%,\s*#f6fcfb 34%,\s*#ecf7f5 68%,\s*#dfefed 100%\)\s*;\s*\}/,
    );
    expect(rootGradientMatch).not.toBeNull();

    const darkGradientMatch = css.match(
      /\.dark\s*\{\s*--sidebar-panel-gradient:\s*linear-gradient\(166deg,\s*#1b3b39 0%,\s*#133032 34%,\s*#0f2426 68%,\s*#091a1c 100%\)\s*;\s*\}/,
    );
    expect(darkGradientMatch).not.toBeNull();

    // Los dos renders del panel (escritorio y `Sheet` de viewport angosto) comparten regla.
    const panelRuleMatch = css.match(
      /\[data-slot='sidebar-inner'\],\s*\n\[data-slot='sidebar'\]\[data-mobile='true'\]\s*\{\s*\n\s*border-radius:\s*22px;\s*\n\s*background-image:\s*var\(--sidebar-panel-gradient\);/,
    );
    expect(panelRuleMatch).not.toBeNull();
  });

  it('usa 272px de ancho expandido y 78px en modo icono', async () => {
    // R19
    await renderPanel();

    const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
    if (!wrapper) {
      throw new Error('el primitivo no monto el wrapper de la barra lateral');
    }

    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('17rem');
    expect(wrapper.style.getPropertyValue('--sidebar-width-icon')).toBe('4.875rem');

    // 17rem = 272px y 4.875rem = 78px con la raiz por defecto de 16px.
    expect(parseFloat(wrapper.style.getPropertyValue('--sidebar-width')) * 16).toBe(272);
    expect(parseFloat(wrapper.style.getPropertyValue('--sidebar-width-icon')) * 16).toBe(78);

    const panel = document.querySelector<HTMLElement>('[data-slot="sidebar"]');
    expect(panel).toHaveAttribute('data-variant', 'floating');
  });

  it('da al menos 44px de alto a cada item de menu', () => {
    // R20
    const css = readGlobalsCss();

    const menuButtonRuleMatch = css.match(
      /\[data-slot='sidebar-menu-button'\]\s*\{\s*\n\s*min-height:\s*44px;/,
    );
    expect(menuButtonRuleMatch).not.toBeNull();
  });

  it('declara las reglas del panel fuera de toda capa de cascada', () => {
    // R18 — evita el falso verde: dentro de `@layer base` estas reglas perderian contra
    // `rounded-lg` y `h-8` y el panel saldria igual que antes de esta feature, con el test de
    // contrato en verde por las razones equivocadas (`design.md > 6`).
    const css = readGlobalsCss();

    const panelRuleIndex = css.indexOf("[data-slot='sidebar-inner']");
    const menuButtonRuleIndex = css.indexOf("[data-slot='sidebar-menu-button']");
    expect(panelRuleIndex).toBeGreaterThan(-1);
    expect(menuButtonRuleIndex).toBeGreaterThan(-1);

    // Cada `@layer` declarado en el archivo tiene su bloque `{ ... }` bien delimitado
    // (balanceo simple de llaves, suficiente porque este archivo no anida `@layer`).
    const layerRuleRegex = /@layer\s+[\w,\s-]+\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = layerRuleRegex.exec(css)) !== null) {
      const blockStart = match.index;
      const bodyStart = match.index + match[0].length;
      let depth = 1;
      let cursor = bodyStart;
      while (depth > 0 && cursor < css.length) {
        const char = css[cursor];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        cursor += 1;
      }
      const blockEnd = cursor;

      const dentroDelLayer = (index: number) => index > blockStart && index < blockEnd;
      expect(dentroDelLayer(panelRuleIndex)).toBe(false);
      expect(dentroDelLayer(menuButtonRuleIndex)).toBe(false);
    }
  });
});
