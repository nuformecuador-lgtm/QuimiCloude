import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { setupUser } from '../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

import { AppSidebar, SIDEBAR_EDGE_TOGGLE_LABEL, SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import {
  BRAND_TAGLINE,
  PRIVATE_NAV_ITEMS,
  groupNavItemsBySection,
  type NavItem,
} from '@/lib/shared/navigation/private-nav';
import type { SessionUser } from '@/lib/modules/identity';

/**
 * Ajuste de la barra lateral al diseno aprobado (2026-09-02, sin ficha: arreglo directo).
 *
 * Cubre lo que QC-29 dejo fuera al limitarse a re-colorear: iconos, secciones, contador,
 * simbolo de marca, pastilla de colapso y el acento naranja del elemento activo.
 */

const { logoutActionMock } = vi.hoisted(() => ({
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

// Solo se sustituye `usePathname`; el resto del modulo se conserva porque `next/link`
// depende de el y reemplazarlo entero rompe el arbol entero al renderizar.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/dashboard',
}));

// El pie de usuario se monta dentro de la barra: sin este mock, el `<form>` del logout
// intentaria ejecutar la Server Action real.
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

function sessionUser(): SessionUser {
  return { displayName: 'Cristian Ruiz', roleName: 'Administrador' } as SessionUser;
}

function renderSidebar(navItems: readonly NavItem[] = PRIVATE_NAV_ITEMS) {
  return render(
    <SidebarProvider>
      <AppSidebar user={sessionUser()} navItems={navItems} />
    </SidebarProvider>,
  );
}

// jsdom no implementa `matchMedia` y `use-mobile.ts` lo usa: sin este stub revienta todo lo
// que renderice la barra. Viewport ancho, que es donde vive la pastilla del borde.
beforeEach(() => {
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

/**
 * Navegacion minima para los casos que no necesitan el menu entero.
 *
 * Cada montaje de la barra completa arrastra el pie de usuario con sus menus y los dos
 * submenus, y este archivo la monta siete veces. Medido en esta maquina: con la suite
 * completa y la concurrencia por defecto, ese peso extra bastaba para que los tests mas
 * lentos del login se pasaran de los 5 s y salieran rojos **sin tener nada roto** — con
 * `--maxWorkers=2` pasaban los 637. Solo los dos tests que afirman sobre TODO el menu montan
 * `PRIVATE_NAV_ITEMS`; el resto usa esto.
 */
const NAV_MINIMA: readonly NavItem[] = [
  {
    kind: 'link',
    href: '/uno',
    label: 'Uno',
    testId: 'nav-uno',
    // QC-75 T1: `permission` es obligatorio en `NavLink`. En una fixture de vista da igual
    // cual sea: este archivo no filtra nada, solo dibuja lo que le pasan.
    permission: 'inventario.consultar',
    icon: 'layout-dashboard',
    section: 'Seccion',
    badge: 7,
  },
  {
    kind: 'link',
    href: '/dos',
    label: 'Dos',
    testId: 'nav-dos',
    permission: 'pedidos.consultar',
    icon: 'layout-dashboard',
    section: 'Seccion',
  },
];

describe('barra lateral: ajuste al diseno', () => {
  it('cada item de nivel superior dibuja el icono que trae el array, y ninguno se queda sin el', () => {
    renderSidebar();

    for (const item of PRIVATE_NAV_ITEMS) {
      // Se EXIGE el icono, no se salta si falta. Medido: con un `continue` cuando
      // `item.icon === undefined`, quitar un icono del array dejaba el test en verde — el
      // test se adaptaba al dato en vez de comprobarlo.
      expect(
        item.icon,
        `el item ${item.testId} es de nivel superior y no declara icono en el array`,
      ).toBeDefined();

      const entrada = screen.getByTestId(item.testId);
      expect(
        entrada.querySelector('svg'),
        `el item ${item.testId} declara icono en el array pero no lo pinta`,
      ).not.toBeNull();
    }
  });

  it('pinta un titulo por seccion, con el texto y el orden del array', () => {
    renderSidebar();

    const esperadas = groupNavItemsBySection(PRIVATE_NAV_ITEMS)
      .map((seccion) => seccion.label)
      .filter((label): label is string => label !== null);

    // El array tiene que traer al menos dos secciones, o este test no probaria nada.
    expect(esperadas.length).toBeGreaterThan(1);

    const enDom = screen
      .getAllByTestId('private-nav-section')
      .map((nodo) => nodo.textContent?.trim());

    expect(enDom).toEqual(esperadas);
  });

  it('el contador sale del array, no de un literal del componente', () => {
    // Antes esto tambien se afirmaba sobre `PRIVATE_NAV_ITEMS`: el unico item que declaraba
    // `badge` era "Notificaciones", un placeholder de QC-11 que QC-13 retira. Ponerle un
    // `badge` a Dashboard o Inventario solo para que este test siguiera mirando el array real
    // seria inventar dominio no especificado — el propio comentario de `private-nav.ts` lo
    // prohibe. La capacidad de pintar el contador desde el array sigue cubierta con la
    // fixture `NAV_MINIMA`; cuando llegue la ficha de notificaciones reales, con su propio
    // contador y su propio origen, ahi se podra volver a afirmar sobre el array real si aplica.
    renderSidebar(NAV_MINIMA);

    expect(screen.getByTestId('nav-uno-badge')).toHaveTextContent('7');
  });

  it('un item sin contador no dibuja ninguna etiqueta', () => {
    renderSidebar(NAV_MINIMA);

    expect(screen.queryByTestId('nav-dos-badge')).toBeNull();
  });

  it('la marca lleva simbolo y bajada ademas del nombre', () => {
    renderSidebar(NAV_MINIMA);

    expect(screen.getByTestId('private-brand-mark').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('private-brand-tagline')).toHaveTextContent(BRAND_TAGLINE);
  });

  it('la pastilla del borde apunta al panel y alterna su estado', async () => {
    const user = setupUser();
    renderSidebar(NAV_MINIMA);

    const pastilla = screen.getByTestId('private-sidebar-edge-toggle');

    expect(pastilla).toHaveAccessibleName(SIDEBAR_EDGE_TOGGLE_LABEL);
    expect(pastilla).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    expect(pastilla).toHaveAttribute('aria-expanded', 'true');

    await user.click(pastilla);

    expect(pastilla).toHaveAttribute('aria-expanded', 'false');
  });

  it('la pastilla NO sustituye al control del encabezado: su nombre accesible es distinto', async () => {
    const { SIDEBAR_TOGGLE_LABEL } = await import('@/app/(private)/components/sidebar-toggle');

    expect(SIDEBAR_EDGE_TOGGLE_LABEL).not.toBe(SIDEBAR_TOGGLE_LABEL);
  });

  it('en modo icono la marca es el simbolo con las iniciales dentro, no dos elementos', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar user={sessionUser()} navItems={NAV_MINIMA} />
      </SidebarProvider>,
    );

    const simbolo = screen.getByTestId('private-brand-mark');
    const iniciales = screen.getByTestId('private-brand-short');

    // Las iniciales van DENTRO del simbolo (R24 sigue cumpliendose), y el matraz no se
    // dibuja: el cuadro y el texto uno al lado del otro no caben en los 44px del rail y el
    // contenido acababa aplastado contra el padding.
    expect(simbolo).toContainElement(iniciales);
    expect(simbolo.querySelector('svg')).toBeNull();
  });

  it('un item sin seccion se dibuja igual, sin titulo, y no desaparece', () => {
    const sinSeccion: readonly NavItem[] = [
      {
        kind: 'link',
        href: '/suelto',
        label: 'Suelto',
        testId: 'nav-suelto',
        permission: 'inventario.consultar',
      },
    ];

    renderSidebar(sinSeccion);

    expect(screen.getByTestId('nav-suelto')).toBeInTheDocument();
    expect(screen.queryByTestId('private-nav-section')).toBeNull();
  });
});

describe('acento del elemento activo', () => {
  /**
   * El color del elemento activo se aplica por CSS y jsdom no resuelve hojas externas, asi
   * que se verifica el contrato del archivo: que la regla existe, que usa el token del acento
   * y —lo que de verdad importa— que **no esta dentro de `@layer`**. Dentro de una capa
   * perderia contra las utilidades del primitivo y el elemento activo seguiria saliendo agua,
   * con este test en verde por la razon equivocada. Mismo criterio que uso QC-29 para las
   * medidas del panel (`specs/QC-29-tema-claro-oscuro/design.md > 6`).
   */
  const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

  it('la regla del elemento activo usa el token del acento', () => {
    const regla = css.match(/\[data-slot='sidebar-menu-button'\]\[data-active\]\s*\{[^}]*\}/);

    expect(regla, 'no existe la regla del elemento activo').not.toBeNull();
    expect(regla?.[0]).toContain('--sidebar-primary');
  });

  it('la barra de acento del borde izquierdo existe', () => {
    expect(css).toMatch(
      /\[data-slot='sidebar-menu-button'\]\[data-active\]::before\s*\{[^}]*--sidebar-primary/,
    );
  });

  it('en modo icono el boton se fuerza a 44px con !important', () => {
    // El primitivo aplica `size-8!` y `p-2!` cuando el panel esta colapsado, contando con su
    // rail de 3rem. Aqui el rail mide 4.875rem, asi que hay que ganarle — y a un `!important`
    // solo se le gana con otro: estar fuera de `@layer` NO basta. Si alguien quita el
    // `!important` de estas reglas, el boton vuelve a 32px y el icono sale aplastado.
    const regla = css.match(
      /\[data-collapsible='icon'\] \[data-slot='sidebar-menu-button'\]\s*\{[^}]*\}/,
    );

    expect(regla, 'no existe la regla del boton en modo icono').not.toBeNull();

    // Propiedad por propiedad, no por substring: `toContain('44px !important')` pasaba aunque
    // se le quitara el `!important` al `width`, porque el `height` seguia teniendo ese mismo
    // texto. Medido con la mordida.
    expect(regla?.[0], 'el width perdio el !important').toMatch(/width:\s*44px\s*!important/);
    expect(regla?.[0], 'el height perdio el !important').toMatch(/height:\s*44px\s*!important/);
    expect(regla?.[0], 'el padding perdio el !important').toMatch(
      /padding:\s*10px\s*!important/,
    );
  });

  it('esas reglas quedan FUERA de `@layer`', () => {
    // La declaracion real, no la mencion en un comentario: `indexOf('@layer base')` casa con
    // el comentario que explica esta misma trampa unas lineas antes, y el test daria rojo con
    // el CSS correcto. Se ancla a principio de linea.
    const declaracionCapa = css.match(/^@layer\s+base\s*\{/m);
    const inicioCapa = declaracionCapa?.index ?? -1;

    // TODAS las apariciones, no la primera: son tres reglas —el fondo, el `::before` y el
    // color del icono— y con `indexOf` bastaba con que una siguiera fuera para pasar. Medido:
    // moviendo el bloque del fondo dentro de `@layer base`, la version anterior de este test
    // seguia en verde porque el `::before` empieza por el mismo selector.
    const posiciones = [
      ...css.matchAll(/\[data-slot='sidebar-menu-button'\]\[data-active\]/g),
    ].map((coincidencia) => coincidencia.index);

    expect(posiciones.length).toBeGreaterThanOrEqual(3);
    expect(inicioCapa).toBeGreaterThan(-1);

    for (const posicion of posiciones) {
      expect(
        posicion,
        'una regla del acento cayo dentro de `@layer base` y perdera contra las utilidades',
      ).toBeLessThan(inicioCapa);
    }
  });
});
