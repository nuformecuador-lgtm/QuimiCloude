// QC-85 T2 — El conmutador de pestanas: R3 (y las partes de cliente de R1 y R40).
//
// **`useRouter` esta mockeada**: el conmutador no navega de verdad en jsdom, pero lo que importa es
// QUE destino emite, y eso se afirma sobre el `href` que recibe `router.push`, comparado siempre
// contra `usuariosTabHref` —nunca contra una URL escrita aqui (R3)—.
//
// **Ningun assert sobre copy** (R41): los disparadores se localizan por su rol ARIA (`tab`) y por
// las constantes `USUARIOS_TAB_TESTIDS`, y el texto que se compara sale de `USUARIOS_TAB_LABELS`,
// la constante que el propio componente usa.
//
// **El conmutador NO pinta contenido** (`design.md > 3`): quien monta una sola seccion es
// `page.tsx`, y este archivo lo ata comprobando que no hay ningun `tabpanel` en el arbol.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GROUPS_TAB,
  USERS_TAB,
  USUARIOS_TABS,
  USUARIOS_TABS_TESTID,
  USUARIOS_TAB_LABELS,
  USUARIOS_TAB_TESTIDS,
  UsuariosTabsSwitch,
  usuariosTabHref,
} from '@/app/(private)/configuracion/usuarios/components';
import { USERS_ROUTE } from '@/lib/shared/routes';
import { setupUser } from '../../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../../helpers/viewport';

const { routerMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

/** Objetivo tactil minimo de R40: 44x44 px = `min-h-11` / `min-w-11`. */
const OBJETIVO_TACTIL = ['min-h-11', 'min-w-11'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el conmutador presenta las dos pestanas y dice cual esta activa (R1, R3)', () => {
  it('es un `tablist` con exactamente dos `tab`, uno por constante', () => {
    render(<UsuariosTabsSwitch tab={USERS_TAB} />);

    const conmutador = screen.getByTestId(USUARIOS_TABS_TESTID);
    expect(conmutador).toHaveAttribute('role', 'tablist');
    expect(within(conmutador).getAllByRole('tab')).toHaveLength(USUARIOS_TABS.length);

    for (const tab of USUARIOS_TABS) {
      const disparador = screen.getByTestId(USUARIOS_TAB_TESTIDS[tab]);
      expect(disparador).toHaveAttribute('role', 'tab');
      expect(disparador).toHaveTextContent(USUARIOS_TAB_LABELS[tab]);
    }
  });

  it('la pestana vigente es la que llega por props, y solo ella esta seleccionada', () => {
    render(<UsuariosTabsSwitch tab={GROUPS_TAB} />);

    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB])).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[USERS_TAB])).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('NO renderiza el contenido de ninguna pestana: eso lo decide el servidor', () => {
    render(<UsuariosTabsSwitch tab={GROUPS_TAB} />);

    expect(screen.queryAllByRole('tabpanel')).toHaveLength(0);
  });

  it('cada disparador cumple el objetivo tactil y no depende de `:hover` (R40)', () => {
    render(<UsuariosTabsSwitch tab={USERS_TAB} />);

    for (const tab of USUARIOS_TABS) {
      const disparador = screen.getByTestId(USUARIOS_TAB_TESTIDS[tab]);
      for (const clase of OBJETIVO_TACTIL) {
        expect(disparador.className, `${tab} deberia medir 44x44 px`).toContain(clase);
      }
      // Visible siempre, en el arbol servido: nada se descubre al pasar el puntero.
      expect(disparador).toBeVisible();
    }
  });
});

describe('activar una pestana NAVEGA al destino derivado de la ruta (R3)', () => {
  it('con el raton: de personas a grupos empuja `usuariosTabHref(GROUPS_TAB)`', async () => {
    const user = setupUser();
    render(<UsuariosTabsSwitch tab={USERS_TAB} />);

    await user.click(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB]));

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith(usuariosTabHref(GROUPS_TAB));
    // Y el destino cuelga de la constante de ruta: ningun literal de URL en producto (R3).
    expect(routerMock.push.mock.calls[0][0].startsWith(USERS_ROUTE)).toBe(true);
  });

  it('y de grupos a personas, al destino canonico de la pestana por defecto', async () => {
    const user = setupUser();
    render(<UsuariosTabsSwitch tab={GROUPS_TAB} />);

    await user.click(screen.getByTestId(USUARIOS_TAB_TESTIDS[USERS_TAB]));

    expect(routerMock.push).toHaveBeenCalledWith(usuariosTabHref(USERS_TAB));
  });

  it('con el teclado navega igual: la flecha mueve el foco y activar empuja el destino', async () => {
    // Activacion MANUAL, la que trae la primitiva (`activateOnFocus` por defecto `false`): la
    // flecha mueve el foco y no navega, y navegar es una decision explicita. Con activacion al
    // foco, recorrer las pestanas con el teclado dispararia una navegacion por cada salto.
    const user = setupUser();
    render(<UsuariosTabsSwitch tab={USERS_TAB} />);

    screen.getByTestId(USUARIOS_TAB_TESTIDS[USERS_TAB]).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB])).toHaveFocus();
    expect(routerMock.push).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');

    expect(routerMock.push).toHaveBeenCalledWith(usuariosTabHref(GROUPS_TAB));
  });

  it('activar la pestana que YA esta vigente no navega: no se empuja una URL identica', async () => {
    const user = setupUser();
    render(<UsuariosTabsSwitch tab={GROUPS_TAB} />);

    await user.click(screen.getByTestId(USUARIOS_TAB_TESTIDS[GROUPS_TAB]));

    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('montarlo no navega por su cuenta: la seleccion inicial no mueve la direccion', () => {
    render(<UsuariosTabsSwitch tab={USERS_TAB} />);

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
