// Iconos, manifest y metadatos de la app: lee los archivos del kit del disco y llama a
// `manifest()` y al `metadata` del root layout. `next/font/google` y `next/headers` solo
// existen dentro de Next, asi que se doblan para poder importar el layout.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('next/font/google', () => ({
  IBM_Plex_Sans: () => ({ variable: '--font-plex-sans', className: 'plex-sans' }),
  IBM_Plex_Mono: () => ({ variable: '--font-plex-mono', className: 'plex-mono' }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function existe(ruta: string): boolean {
  return existsSync(join(RAIZ, ruta));
}

/** Ancho y alto del chunk IHDR, que el formato obliga a que sea el primero. */
function dimensionesPng(ruta: string): { firma: boolean; chunk: string; ancho: number; alto: number } {
  const png = readFileSync(join(RAIZ, ruta));
  return {
    firma: FIRMA_PNG.every((byte, i) => png[i] === byte),
    chunk: png.subarray(12, 16).toString('ascii'),
    ancho: png.readUInt32BE(16),
    alto: png.readUInt32BE(20),
  };
}

function tamanoDelViewBox(ruta: string): string {
  const svg = readFileSync(join(RAIZ, ruta), 'utf8');
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error(`${ruta} no declara viewBox`);
  const [, , ancho, alto] = viewBox.trim().split(/\s+/);
  return `${ancho}x${alto}`;
}

describe('metadatos raiz', () => {
  it('R24: el root layout declara el titulo y la descripcion de la app', async () => {
    const { metadata } = await import('@/app/layout');
    expect(metadata.title).toBe('QuimiCloude');
    expect(metadata.description).toBe('ERP para planta, almacén, ventas y administración');
  });

  it('R24: el root layout no fija metadataBase', async () => {
    const { metadata } = await import('@/app/layout');
    expect(metadata.metadataBase).toBeUndefined();
  });
});

describe('iconos por convencion de archivo de Next', () => {
  it.each(['app/favicon.ico', 'app/icon.svg', 'app/apple-icon.png', 'app/opengraph-image.png'])(
    'R25: existe %s',
    (ruta) => {
      expect(existe(ruta)).toBe(true);
    },
  );

  it('R25: el icon.svg cambia de color con prefers-color-scheme', () => {
    const svg = readFileSync(join(RAIZ, 'app/icon.svg'), 'utf8');
    expect(svg).toMatch(/prefers-color-scheme:\s*dark/);
  });

  it('R25: la imagen OG trae su texto alternativo', () => {
    expect(readFileSync(join(RAIZ, 'app/opengraph-image.alt.txt'), 'utf8').trim()).toBe('QuimiCloude');
  });
});

describe('manifest', () => {
  it('R26: declara los valores de nombre, inicio, pantalla y colores', async () => {
    const { default: manifest } = await import('@/app/manifest');
    expect(manifest()).toMatchObject({
      name: 'QuimiCloude',
      short_name: 'QuimiCloude',
      start_url: '/',
      display: 'standalone',
      theme_color: '#02605A',
      background_color: '#F7FBFC',
    });
  });

  it('R26: declara los iconos 192 y 512 con purpose any y el 512 maskable', async () => {
    const { default: manifest } = await import('@/app/manifest');
    expect(manifest().icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });

  it('R26, R27: cada icono del manifest existe en public/ con las dimensiones que declara', async () => {
    const { default: manifest } = await import('@/app/manifest');
    const iconos = manifest().icons ?? [];
    expect(iconos.length).toBe(3);
    for (const icono of iconos) {
      const ruta = join('public', icono.src);
      const [ancho, alto] = (icono.sizes ?? '').split('x').map(Number);
      expect({ ruta, ...dimensionesPng(ruta) }).toEqual({ ruta, firma: true, chunk: 'IHDR', ancho, alto });
    }
  });
});

describe('dimensiones de los PNG', () => {
  it.each([
    ['app/apple-icon.png', 180, 180],
    ['app/opengraph-image.png', 1200, 630],
    ['public/icons/icon-192.png', 192, 192],
    ['public/icons/icon-512.png', 512, 512],
    ['public/icons/icon-maskable-512.png', 512, 512],
  ])('R27: %s es un PNG de %ix%i', (ruta, ancho, alto) => {
    expect(dimensionesPng(ruta)).toEqual({ firma: true, chunk: 'IHDR', ancho, alto });
  });
});

describe('limpieza de public/', () => {
  it.each(['public/file.svg', 'public/globe.svg', 'public/window.svg'])('R29: no existe %s', (ruta) => {
    expect(existe(ruta)).toBe(false);
  });

  it.each(['public/next.svg', 'public/vercel.svg'])('R29: conserva %s, que usa app/page.tsx', (ruta) => {
    expect(existe(ruta)).toBe(true);
    expect(readFileSync(join(RAIZ, 'app/page.tsx'), 'utf8')).toContain(`"/${ruta.slice('public/'.length)}"`);
  });
});

describe('logos del kit', () => {
  it.each([
    ['public/brand/logo-horizontal-dark.svg', '227x48'],
    ['public/brand/logo-vertical-dark.svg', '127x76'],
    ['public/brand/isotipo.svg', '47x47'],
    ['public/brand/isotipo-dark.svg', '47x47'],
  ])('R30: %s es un SVG con viewBox de %s', (ruta, tamano) => {
    expect(tamanoDelViewBox(ruta)).toBe(tamano);
  });
});
