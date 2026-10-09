/**
 * E2E de los iconos, el manifest y la imagen OG servidos por Next.
 *
 * Lo que los unitarios no pueden afirmar: que el servidor de verdad emite los `<link>` y el
 * `og:image` en el `<head>`, y que un navegador sin sesion recibe cada recurso sin que el
 * middleware lo mande al login. El `matcher` del middleware deja fuera estos recursos hoy; un
 * cambio futuro en el lo romperia sin que ningun unitario se enterase.
 *
 * Sin datos ni autenticacion: solo `GET` y `/login`, que es publica.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const LOGIN_PATH = '/login';

const RECURSOS = [
  { ruta: '/manifest.webmanifest', tipo: /application\/manifest\+json/ },
  { ruta: '/icon.svg', tipo: /image\/svg\+xml/ },
  { ruta: '/apple-icon.png', tipo: /image\/png/ },
  { ruta: '/icons/icon-192.png', tipo: /image\/png/ },
] as const;

async function pedirSinRedirigir(request: APIRequestContext, url: string) {
  return request.get(url, { maxRedirects: 0 });
}

test.describe('recursos de marca sin sesion', () => {
  for (const { ruta, tipo } of RECURSOS) {
    test(`R28: GET ${ruta} responde 2xx sin redirigir al login`, async ({ request }) => {
      const respuesta = await pedirSinRedirigir(request, ruta);
      expect(respuesta.status(), ruta).toBeGreaterThanOrEqual(200);
      expect(respuesta.status(), ruta).toBeLessThan(300);
      expect(respuesta.headers()['location'], ruta).toBeUndefined();
      expect(respuesta.headers()['content-type'], ruta).toMatch(tipo);
    });
  }

  test('R26: el manifest servido trae los valores y los tres iconos', async ({ request }) => {
    const respuesta = await pedirSinRedirigir(request, '/manifest.webmanifest');
    expect(respuesta.ok()).toBe(true);
    const manifest = await respuesta.json();
    expect(manifest).toMatchObject({
      name: 'QuimiCloude',
      short_name: 'QuimiCloude',
      start_url: '/',
      display: 'standalone',
      theme_color: '#02605A',
      background_color: '#F7FBFC',
    });
    expect(manifest.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});

test.describe('<head> de /login', () => {
  test('R25, R26: enlaza icon, apple-touch-icon y manifest', async ({ page }) => {
    await page.goto(LOGIN_PATH);
    const head = page.locator('head');

    await expect(head.locator('link[rel="icon"][href^="/favicon.ico"]')).toHaveCount(1);
    await expect(head.locator('link[rel="icon"][href^="/icon.svg"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(head.locator('link[rel="apple-touch-icon"][href^="/apple-icon.png"]')).toHaveCount(1);
    await expect(head.locator('link[rel="manifest"][href^="/manifest.webmanifest"]')).toHaveCount(1);
  });

  test('R25, R28: declara og:image y su URL responde 2xx sin redirigir al login', async ({ page, request }) => {
    await page.goto(LOGIN_PATH);
    const ogImage = page.locator('head meta[property="og:image"]');
    await expect(ogImage).toHaveCount(1);

    const url = await ogImage.getAttribute('content');
    expect(url).toMatch(/\/opengraph-image\.png(\?|$)/);
    await expect(page.locator('head meta[property="og:image:alt"]')).toHaveAttribute('content', 'QuimiCloude');

    const respuesta = await pedirSinRedirigir(request, url ?? '');
    expect(respuesta.status()).toBeGreaterThanOrEqual(200);
    expect(respuesta.status()).toBeLessThan(300);
    expect(respuesta.headers()['content-type']).toMatch(/image\/png/);
  });
});
