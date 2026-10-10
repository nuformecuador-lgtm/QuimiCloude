// Clases del carril colapsado y del icono de los controles de colapso. Las cajas calculadas las
// mide `e2e/marca-componentes.spec.ts`: jsdom no resuelve la cascada, y la cascada es lo que
// fallaba. Aqui se fijan las clases para que un cambio en el primitivo de rojo sin navegador.
// Proyecto `node`: se renderiza con `react-dom/server`, sin JSX.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SidebarToggle } from '@/app/(private)/components/sidebar-toggle';
import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarMenuButton, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn<() => string>() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(RAIZ, ...parts), 'utf8');

const ICON_PREFIX = 'group-data-[collapsible=icon]:';

/** Clases del boton de menu sin el prefijo del modo icono, copiadas del `dev` de partida. */
const EXPANDED_CLASSES_FROZEN = [
  'peer/menu-button',
  'group/menu-button',
  'flex',
  'w-full',
  'items-center',
  'gap-2',
  'overflow-hidden',
  'rounded-md',
  'p-2',
  'text-left',
  'ring-sidebar-ring',
  'outline-hidden',
  'transition-[width,height,padding]',
  'group-has-data-[sidebar=menu-action]/menu-item:pr-8',
  'focus-visible:ring-2',
  'active:bg-sidebar-accent',
  'active:text-sidebar-accent-foreground',
  'disabled:pointer-events-none',
  'disabled:opacity-50',
  'aria-disabled:pointer-events-none',
  'aria-disabled:opacity-50',
  'data-open:hover:bg-sidebar-accent',
  'data-open:hover:text-sidebar-accent-foreground',
  'data-active:bg-sidebar-accent',
  'data-active:font-medium',
  'data-active:text-sidebar-accent-foreground',
  '[&_svg]:size-4',
  '[&_svg]:shrink-0',
  '[&>span:last-child]:truncate',
  'hover:bg-sidebar-accent',
  'hover:text-sidebar-accent-foreground',
  'h-8',
  'text-sm',
];

const USER: SessionUser = {
  id: 'u-carril',
  username: 'carril.prueba',
  displayName: 'Carril Prueba',
  roleName: null,
  permissions: [],
};

const OPEN_ICON = 'lucide-panel-left-open';
const CLOSE_ICON = 'lucide-panel-left-close';
const DEFAULT_TRIGGER_ICON = 'lucide-panel-left ';

function decode(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"');
}

function render(defaultOpen: boolean, child: ReactElement): string {
  return renderToStaticMarkup(createElement(SidebarProvider, { defaultOpen }, child));
}

/** Atributo `class` de la etiqueta que lleva `marker`. Se busca sobre el HTML sin decodificar: una clase
 * como `[&>span]` traeria un `>` dentro del atributo. */
function classOf(html: string, marker: string): string[] {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*${marker}[^>]*>`))?.[0];
  if (!tag) throw new Error(`no esta ${marker}`);
  return decode(tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
}

/** Clase del primer `svg` dentro del boton con ese `data-testid`. */
function iconClassIn(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start === -1) throw new Error(`no esta ${testId}`);
  const svg = html.slice(start).match(/<svg[^>]*class="([^"]*)"/);
  return decode(svg?.[1] ?? '');
}

function menuButtonClasses(): string[] {
  return classOf(render(true, createElement(SidebarMenuButton, null, 'x')), 'data-slot="sidebar-menu-button"');
}

beforeEach(() => {
  usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
});

describe('carril colapsado', () => {
  it('R31 el boton de menu en modo icono mide 44 px con 14 px de relleno, y ya no 32 px', () => {
    const classes = menuButtonClasses();
    expect(classes).toContain(`${ICON_PREFIX}size-11!`);
    expect(classes).toContain(`${ICON_PREFIX}p-3.5!`);
    expect(classes).not.toContain(`${ICON_PREFIX}size-8!`);
    expect(classes).not.toContain(`${ICON_PREFIX}p-2!`);
  });

  it('R31 R35 el enlace de marca lleva 6 px de relleno en modo icono, que deja 32 px al isotipo', () => {
    const classes = classOf(
      render(false, createElement(AppSidebar, { user: USER, navItems: PRIVATE_NAV_ITEMS })),
      'data-testid="private-brand-link"',
    );
    expect(classes).toContain(`${ICON_PREFIX}p-1.5!`);
    expect(classes).not.toContain(`${ICON_PREFIX}p-3.5!`);
  });

  it('R36 las clases del boton de menu sin prefijo de modo icono son las de partida', () => {
    const expanded = menuButtonClasses().filter((c) => !c.startsWith(ICON_PREFIX));
    expect([...expanded].sort()).toEqual([...EXPANDED_CLASSES_FROZEN].sort());
  });

  it('R37 el ancho del carril, el expandido y el margen exterior de 18 px no cambian', () => {
    const layout = read('app', '(private)', 'layout.tsx');
    expect(layout).toContain("'--sidebar-width': '17rem'");
    expect(layout).toContain("'--sidebar-width-icon': '4.875rem'");
    expect(read('components', 'private', 'app-sidebar.tsx')).toContain('className="p-[18px]"');
  });
});

describe('control de colapso', () => {
  it('R39 la pastilla del borde pinta cerrar con el panel expandido y abrir con el colapsado', () => {
    const sidebar = createElement(AppSidebar, { user: USER, navItems: PRIVATE_NAV_ITEMS });
    const expanded = iconClassIn(render(true, sidebar), 'private-sidebar-edge-toggle');
    const collapsed = iconClassIn(render(false, sidebar), 'private-sidebar-edge-toggle');
    expect(expanded).toContain(CLOSE_ICON);
    expect(collapsed).toContain(OPEN_ICON);
  });

  it('R39 el control del encabezado pinta cerrar con el panel expandido y abrir con el colapsado', () => {
    const expanded = iconClassIn(render(true, createElement(SidebarToggle)), 'private-sidebar-toggle');
    const collapsed = iconClassIn(render(false, createElement(SidebarToggle)), 'private-sidebar-toggle');
    expect(expanded).toContain(CLOSE_ICON);
    expect(collapsed).toContain(OPEN_ICON);
  });

  it('R39 SidebarTrigger sin children sigue pintando PanelLeftIcon', () => {
    const html = render(true, createElement(SidebarTrigger, { 'data-testid': 'disparador' } as object));
    expect(`${iconClassIn(html, 'disparador')} `).toContain(DEFAULT_TRIGGER_ICON);
  });

  it('R38 la pastilla fija los colores del panel en reposo, con hover y con aria-expanded', () => {
    const classes = classOf(
      render(true, createElement(AppSidebar, { user: USER, navItems: PRIVATE_NAV_ITEMS })),
      'data-testid="private-sidebar-edge-toggle"',
    );
    for (const expected of [
      'bg-sidebar!',
      'text-sidebar-foreground!',
      'hover:bg-sidebar-accent!',
      'hover:text-sidebar-accent-foreground!',
      'hover:border-sidebar-ring!',
      'aria-expanded:bg-sidebar!',
      'aria-expanded:text-sidebar-foreground!',
    ]) {
      expect(classes).toContain(expected);
    }
  });
});
