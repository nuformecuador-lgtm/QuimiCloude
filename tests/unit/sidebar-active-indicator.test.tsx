import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarActiveIndicator } from '@/components/private/sidebar-active-indicator';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';
import type { SessionUser } from '@/lib/modules/identity';

const { usePathnameMock, logoutActionMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

/*
 * jsdom no hace layout: todos los `offset*` valen 0 y `offsetParent` es `null`. Se simula una
 * geometria fija: cada `<li>` mide 44 px de alto y va debajo del anterior, el submenu se sangra
 * 14 px y cada boton mide 200 x 44. `offsetParent` es el padre directo, que basta para recorrer
 * la cadena hasta el contenedor.
 */
const ITEM_HEIGHT = 44;
const ITEM_WIDTH = 200;
const SUB_INDENT = 14;

const geometria: Record<string, (this: HTMLElement) => unknown> = {
  offsetParent() {
    return this.parentElement;
  },
  offsetTop() {
    if (this.tagName !== 'LI' || this.parentElement === null) return 0;
    return Array.from(this.parentElement.children).indexOf(this) * ITEM_HEIGHT;
  },
  offsetLeft() {
    return this.dataset.slot === 'sidebar-menu-sub' ? SUB_INDENT : 0;
  },
  offsetWidth() {
    return ITEM_WIDTH;
  },
  offsetHeight() {
    return ITEM_HEIGHT;
  },
};

const originales = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  setViewportWidth(WIDE_VIEWPORT);
  for (const [nombre, getter] of Object.entries(geometria)) {
    originales.set(nombre, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nombre));
    Object.defineProperty(HTMLElement.prototype, nombre, { configurable: true, get: getter });
  }
});

afterEach(() => {
  cleanup();
  resetViewport();
  vi.unstubAllGlobals();
  for (const [nombre, descriptor] of originales) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, nombre, descriptor);
  }
  originales.clear();
});

const PRIMERA = ['/a', '/b', '/c'] as const;
const SUBMENU = ['/s1', '/s2'] as const;

/** Dos listas: la de primer nivel y, dentro de su ultimo item, un submenu con su propio indicador. */
function Listas({ pathname }: { readonly pathname: string }) {
  return (
    <SidebarProvider>
      <SidebarActiveIndicator variant="menu">
        <SidebarMenu data-testid="lista-principal">
          {PRIMERA.map((href) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton render={<a href={href} />} isActive={pathname === href}>
                <span>{href}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton>Grupo</SidebarMenuButton>
            <SidebarActiveIndicator variant="sub">
              <SidebarMenuSub data-testid="lista-sub">
                {SUBMENU.map((href) => (
                  <SidebarMenuSubItem key={href}>
                    <SidebarMenuSubButton render={<a href={href} />} isActive={pathname === href}>
                      <span>{href}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarActiveIndicator>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarActiveIndicator>
    </SidebarProvider>
  );
}

function montar(pathname: string) {
  usePathnameMock.mockReturnValue(pathname);
  const vista = render(<Listas pathname={pathname} />);
  const navegar = (siguiente: string) => {
    usePathnameMock.mockReturnValue(siguiente);
    vista.rerender(<Listas pathname={siguiente} />);
  };
  return { ...vista, navegar };
}

function indicadorDe(testIdLista: string): HTMLElement {
  const contenedor = screen.getByTestId(testIdLista).parentElement as HTMLElement;
  return contenedor.querySelector(':scope > [data-slot="sidebar-active-indicator"]') as HTMLElement;
}

function listoDe(testIdLista: string): boolean {
  return (screen.getByTestId(testIdLista).parentElement as HTMLElement).hasAttribute(
    'data-indicator-ready',
  );
}

describe('SidebarActiveIndicator', () => {
  it('R13: dentro de la misma lista se desliza a la posicion del nuevo activo', () => {
    const { navegar } = montar('/a');
    const indicador = indicadorDe('lista-principal');

    expect(indicador.style.transform).toBe('translate(0px, 0px)');
    expect(indicador.style.opacity).toBe('1');

    navegar('/c');

    expect(indicador.dataset.motion).toBe('slide');
    expect(indicador.style.transform).toBe(`translate(0px, ${2 * ITEM_HEIGHT}px)`);
    expect(indicador.style.width).toBe(`${ITEM_WIDTH}px`);
    expect(indicador.style.height).toBe(`${ITEM_HEIGHT}px`);
    expect(indicador.style.opacity).toBe('1');
  });

  it('R13: el deslizamiento anima transform con --dur-base y --ease-standard', () => {
    montar('/a');
    const clases = indicadorDe('lista-principal').className.split(/\s+/);

    expect(clases).toContain('duration-(--dur-base)');
    expect(clases).toContain('ease-(--ease-standard)');
    expect(clases).toContain('data-[motion=slide]:transition-[transform,opacity]');
    expect(clases).toContain('data-[motion=fade]:transition-opacity');
    expect(clases).toContain('transition-none');
  });

  it('R14: la primera colocacion no se desliza ni se funde', () => {
    montar('/b');
    const indicador = indicadorDe('lista-principal');

    expect(indicador.dataset.motion).toBe('none');
    expect(indicador.style.transform).toBe(`translate(0px, ${ITEM_HEIGHT}px)`);
    expect(indicador.style.opacity).toBe('1');
    expect(listoDe('lista-principal')).toBe(true);
  });

  it('R14: si el activo llega de otra lista aparece con fundido y la lista que deja se apaga', () => {
    const { navegar } = montar('/b');

    navegar('/s2');

    const sub = indicadorDe('lista-sub');
    expect(sub.dataset.motion).toBe('fade');
    expect(sub.style.transform).toBe(`translate(${SUB_INDENT}px, ${ITEM_HEIGHT}px)`);
    expect(sub.style.opacity).toBe('1');
    expect(listoDe('lista-sub')).toBe(true);

    const principal = indicadorDe('lista-principal');
    expect(principal.style.opacity).toBe('0');
    expect(listoDe('lista-principal')).toBe(false);

    navegar('/a');

    expect(principal.dataset.motion).toBe('fade');
    expect(principal.style.transform).toBe('translate(0px, 0px)');
    expect(principal.style.opacity).toBe('1');
    expect(sub.style.opacity).toBe('0');
  });

  it('R14: el activo de un submenu no lo toma el indicador de la lista que lo contiene', () => {
    montar('/s1');

    expect(indicadorDe('lista-principal').style.opacity).toBe('0');
    expect(listoDe('lista-principal')).toBe(false);
    expect(indicadorDe('lista-sub').style.opacity).toBe('1');
  });

  it('R14: sin item activo el indicador queda a opacidad 0 y el boton no pierde su fondo', () => {
    const { navegar } = montar('/ninguna');
    const indicador = indicadorDe('lista-principal');

    expect(indicador.style.opacity).toBe('0');
    expect(listoDe('lista-principal')).toBe(false);

    navegar('/b');

    expect(indicador.dataset.motion).toBe('fade');
    expect(indicador.style.opacity).toBe('1');
    expect(listoDe('lista-principal')).toBe(true);
  });

  it('R15: al cambiar de tamano la lista se recoloca sin transicion', () => {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );

    const { navegar } = montar('/a');
    navegar('/b');
    const indicador = indicadorDe('lista-principal');
    expect(indicador.dataset.motion).toBe('slide');

    for (const callback of callbacks) callback();

    expect(indicador.dataset.motion).toBe('none');
    expect(indicador.style.transform).toBe(`translate(0px, ${ITEM_HEIGHT}px)`);
    expect(indicador.style.opacity).toBe('1');
  });

  it('R15: el indicador es decorativo y no anade items a la lista', () => {
    montar('/a');

    for (const span of document.querySelectorAll('[data-slot="sidebar-active-indicator"]')) {
      expect(span.tagName).toBe('SPAN');
      expect(span).toHaveAttribute('aria-hidden', 'true');
    }
    const principal = screen.getByTestId('lista-principal');
    expect(within(principal).getAllByRole('listitem', { hidden: true })).toHaveLength(6);
    for (const hijo of principal.children) expect(hijo.tagName).toBe('LI');
  });

  it('R15: sin JavaScript el indicador no se ve y el boton activo se pinta solo', () => {
    usePathnameMock.mockReturnValue('/b');
    const html = renderToString(<Listas pathname="/b" />);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('[data-indicator-ready]')).toBeNull();
    const indicadores = doc.querySelectorAll('[data-slot="sidebar-active-indicator"]');
    expect(indicadores).toHaveLength(2);
    // Sin estilo en linea manda la opacidad 0 de la regla base del indicador (caso de CSS abajo).
    for (const span of indicadores) expect(span.getAttribute('style')).toBeNull();
    expect(doc.querySelector('[data-slot="sidebar-menu-button"][data-active]')).not.toBeNull();
  });

  it('R15: la barra lateral real lleva un indicador por lista y lo coloca en el activo', () => {
    usePathnameMock.mockReturnValue(DASHBOARD_ROUTE);
    render(
      <SidebarProvider>
        <AppSidebar
          user={{ displayName: 'Cristian Ruiz', roleName: 'Administrador' } as SessionUser}
          navItems={PRIVATE_NAV_ITEMS}
        />
      </SidebarProvider>,
    );

    const nav = screen.getByTestId('private-nav');
    const activo = nav.querySelector('[data-slot="sidebar-menu-button"][data-active]');
    expect(activo).not.toBeNull();

    const contenedor = activo?.closest('[data-indicator-ready]') as HTMLElement | null;
    expect(contenedor).not.toBeNull();
    const indicador = contenedor?.querySelector(':scope > [data-slot="sidebar-active-indicator"]');
    expect(indicador).toHaveAttribute('aria-hidden', 'true');
    expect((indicador as HTMLElement).style.opacity).toBe('1');
  });
});

describe('SidebarActiveIndicator: CSS', () => {
  const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

  function cuerpo(selector: RegExp): string | undefined {
    return css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1];
  }

  function declaracion(bloque: string | undefined, propiedad: string): string | undefined {
    return bloque
      ?.match(new RegExp(`(?:^|;)\\s*${propiedad}:\\s*([^;]*);`))?.[1]
      ?.replace(/\s+/g, ' ')
      .trim();
  }

  const activoMenu = cuerpo(/\[data-slot='sidebar-menu-button'\]\[data-active\]/);
  const activoSub = cuerpo(/\[data-slot='sidebar-menu-sub-button'\]\[data-active\]/);
  const indicadorMenu = cuerpo(/\[data-slot='sidebar-active-indicator'\]/);
  const indicadorSub = cuerpo(
    /\[data-slot='sidebar-active-indicator'\]\[data-variant='sub'\]/,
  );

  it('R15: sin JavaScript el indicador arranca a opacidad 0 por CSS', () => {
    expect(declaracion(indicadorMenu, 'opacity')).toBe('0');
  });

  it('R15: el indicador de primer nivel pinta el mismo fondo y anillo que el boton activo', () => {
    expect(declaracion(indicadorMenu, 'background')).toBeDefined();
    expect(declaracion(indicadorMenu, 'background')).toBe(declaracion(activoMenu, 'background'));
    expect(declaracion(indicadorMenu, 'box-shadow')).toBe(declaracion(activoMenu, 'box-shadow'));
  });

  it('R15: el indicador del submenu lleva el anillo propio del submenu', () => {
    expect(declaracion(indicadorSub, 'box-shadow')).toBeDefined();
    expect(declaracion(indicadorSub, 'box-shadow')).toBe(declaracion(activoSub, 'box-shadow'));
    expect(declaracion(indicadorSub, 'background')).toBe('var(--sidebar-accent)');
  });

  it('R15: con el indicador listo el boton activo deja de pintar fondo y anillo, sin capa', () => {
    const regla = css.match(
      /\[data-indicator-ready\]\s*>\s*\[data-slot='sidebar-menu'\]\s*>\s*\[data-slot='sidebar-menu-item'\]\s*>\s*\[data-slot='sidebar-menu-button'\]\[data-active\],\s*\[data-indicator-ready\]\s*>\s*\[data-slot='sidebar-menu-sub'\]\s*>\s*\[data-slot='sidebar-menu-sub-item'\]\s*>\s*\[data-slot='sidebar-menu-sub-button'\]\[data-active\]\s*\{([^}]*)\}/,
    );

    expect(regla, 'no existe la regla del indicador listo').not.toBeNull();
    expect(declaracion(regla?.[1], 'background')).toBe('transparent');
    expect(declaracion(regla?.[1], 'box-shadow')).toBe('none');
    expect(regla?.[1]).not.toMatch(/color:|font-weight|content/);

    const inicioCapa = css.match(/^@layer\s+base\s*\{/m)?.index ?? -1;
    expect(inicioCapa).toBeGreaterThan(-1);
    expect(regla?.index).toBeLessThan(inicioCapa);
  });
});
