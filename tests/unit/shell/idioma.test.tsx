// Idioma del documento y de los textos del primitivo de la barra lateral.
//
// `RootLayout` se renderiza en servidor con el mismo arnés que
// `tests/unit/theme/theme-provider.test.tsx`: es una función async y lo que importa es el HTML.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

// `next/font/google` solo se resuelve con el compilador de Next.js; bajo Vitest basta su forma.
vi.mock('next/font/google', () => ({
  IBM_Plex_Sans: () => ({ variable: '--font-plex-sans' }),
  IBM_Plex_Mono: () => ({ variable: '--font-plex-mono' }),
}));

const TEXTO_DEL_CONTROL = 'Alternar barra lateral';

async function etiquetaHtmlDelLayoutRaiz(preferencia: string | undefined): Promise<string> {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (preferencia !== undefined ? { name, value: preferencia } : undefined),
  });
  const RootLayout = (await import('@/app/layout')).default;
  const jsx = await RootLayout({
    children: <div data-testid="contenido" />,
    params: Promise.resolve({}),
  });
  return renderToStaticMarkup(jsx).match(/<html[^>]*>/)?.[0] ?? '';
}

function renderBarra() {
  return render(
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <a href="/inventario">Inventario</a>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger data-testid="disparador" />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  clearSidebarStateCookie();
});

afterEach(() => {
  cleanup();
  resetViewport();
  clearSidebarStateCookie();
});

describe('idioma del documento', () => {
  it.each([
    ['sin preferencia de tema', undefined],
    ['con tema claro', 'light'],
    ['con tema oscuro', 'dark'],
  ])('R14: el html declara lang="es" %s', async (_caso, preferencia) => {
    const etiqueta = await etiquetaHtmlDelLayoutRaiz(preferencia);

    expect(etiqueta).toMatch(/\blang="es"/);
    expect(etiqueta).not.toMatch(/\blang="en"/);
  });
});

describe('textos del primitivo de la barra lateral', () => {
  it('R15: con el panel móvil abierto, su nombre es «Menú» y su descripción la de la navegación', async () => {
    setViewportWidth(NARROW_VIEWPORT);
    renderBarra();

    await act(async () => {
      fireEvent.click(screen.getByTestId('disparador'));
    });

    const panel = await screen.findByRole('dialog', { name: 'Menú' });
    expect(panel).toHaveAccessibleDescription('Navegación principal de QuimiCloude.');
    expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();
    expect(screen.queryByText('Displays the mobile sidebar.')).not.toBeInTheDocument();
  });

  it('R16: el disparador sin children dice «Alternar barra lateral» a los lectores de pantalla', () => {
    setViewportWidth(WIDE_VIEWPORT);
    renderBarra();

    const disparador = screen.getByTestId('disparador');
    expect(disparador).toHaveAccessibleName(TEXTO_DEL_CONTROL);
    expect(disparador).toHaveTextContent(TEXTO_DEL_CONTROL);
  });

  it('R16: el carril lleva aria-label y title en español', () => {
    setViewportWidth(WIDE_VIEWPORT);
    const { container } = renderBarra();

    const carril = container.querySelector('[data-slot="sidebar-rail"]');
    expect(carril).toHaveAttribute('aria-label', TEXTO_DEL_CONTROL);
    expect(carril).toHaveAttribute('title', TEXTO_DEL_CONTROL);
  });

  it('R16: ningún texto, aria-label ni title del primitivo dice «Toggle Sidebar»', () => {
    setViewportWidth(WIDE_VIEWPORT);
    const { container } = renderBarra();

    expect(container.textContent).not.toContain('Toggle Sidebar');
    expect(container.querySelector('[aria-label="Toggle Sidebar"]')).toBeNull();
    expect(container.querySelector('[title="Toggle Sidebar"]')).toBeNull();
  });
});
