// Las reglas del item inactivo y de su foco (`app/globals.css`) tienen que alcanzar tambien a los
// items con submenu. Esos items pasan por `CollapsibleTrigger` (barra expandida) o por
// `DropdownMenuTrigger` (modo icono), que pisan el `data-slot` del primitivo. Aqui se monta la barra
// real y se comprueba, con el selector LEIDO de `globals.css`, que cada disparador de grupo casa.
// El color calculado lo mide `e2e/marca-componentes.spec.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavGroup, type NavLink } from '@/lib/shared/navigation/private-nav';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../../helpers/viewport';

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn<() => string>() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

// El pie monta el `<form>` del logout: sin el mock intentaria la Server Action real.
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: vi.fn(),
}));

// En el entorno jsdom `import.meta.url` no es `file:`: la raiz es el directorio de trabajo.
const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

/** Selector de la regla sin capa cuyo cuerpo es exactamente `color: var(<token>);`. */
function selectorOf(token: string): string {
  const body = `{\n  color: var(${token});\n}`;
  const end = css.indexOf(body);
  if (end === -1) throw new Error(`no esta la regla con color: var(${token})`);
  const start = css.lastIndexOf('*/', end) + 2;
  return css.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** jsdom no resuelve `:hover` ni `:focus-visible`: se mira la parte estructural del selector. */
function structural(selector: string): string {
  return selector.replace(/:not\(:hover\)|:not\(:focus-visible\)|:focus-visible/g, '');
}

const INACTIVE = structural(selectorOf('--sidebar-muted-foreground'));
const FOCUS = structural(selectorOf('--sidebar-accent-foreground'));

const GROUPS = PRIVATE_NAV_ITEMS.filter((item): item is NavGroup => item.kind === 'group');
const LINKS = PRIVATE_NAV_ITEMS.filter((item): item is NavLink => item.kind === 'link');

function sessionUser(): SessionUser {
  return { id: 'u-1', username: 'ana', displayName: 'Ana', roleName: 'Jefa', permissions: [] };
}

function renderSidebar(open: boolean) {
  return render(
    <SidebarProvider defaultOpen={open}>
      <AppSidebar user={sessionUser()} navItems={PRIVATE_NAV_ITEMS} />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('reglas del item inactivo sobre los items con submenu', () => {
  it('hay grupos y enlaces de primer nivel que medir', () => {
    expect(GROUPS.length).toBeGreaterThan(0);
    expect(LINKS.length).toBeGreaterThan(0);
  });

  for (const [mode, open] of [
    ['expandida', true],
    ['en modo icono', false],
  ] as const) {
    it(`R15 R16 con la barra ${mode}, cada disparador de grupo casa con la regla del inactivo y con la del foco`, () => {
      renderSidebar(open);
      for (const group of GROUPS) {
        const trigger = screen.getByTestId(group.testId);
        // El disparador pisa el `data-slot` del primitivo: por eso la regla no puede mirar ahi.
        expect(trigger.getAttribute('data-slot'), group.testId).not.toBe('sidebar-menu-button');
        expect(trigger.getAttribute('data-sidebar'), group.testId).toBe('menu-button');
        expect(trigger.matches(INACTIVE), `${group.testId} y ${INACTIVE}`).toBe(true);
        expect(trigger.matches(FOCUS), `${group.testId} y ${FOCUS}`).toBe(true);
      }
    });

    it(`R15 R16 con la barra ${mode}, los enlaces de primer nivel siguen casando`, () => {
      renderSidebar(open);
      for (const link of LINKS) {
        const button = screen.getByTestId(link.testId);
        expect(button.matches(INACTIVE), link.testId).toBe(true);
        expect(button.matches(FOCUS), link.testId).toBe(true);
      }
    });

    it(`R17 con la barra ${mode}, la marca y el pie no casan con ninguna de las dos reglas`, () => {
      const { container } = renderSidebar(open);
      const outside = container.querySelectorAll(
        "[data-slot='sidebar-header'] [data-sidebar='menu-button'], [data-slot='sidebar-footer'] [data-sidebar='menu-button']",
      );
      expect(outside.length).toBeGreaterThan(0);
      for (const el of outside) {
        expect(el.matches(INACTIVE)).toBe(false);
        expect(el.matches(FOCUS)).toBe(false);
      }
    });
  }
});
