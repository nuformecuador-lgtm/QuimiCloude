// Logo de marca (QC-226 R15, R30, R34): `BrandLogo` en jsdom y los SVG de `public/brand/` leidos
// como texto para comparar la proporcion pintada con la de su `viewBox`.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { cleanup, render } from '@testing-library/react';

import { BrandLogo, type BrandLogoProps } from '@/components/shared/brand-logo';
import * as privateNav from '@/lib/shared/navigation/private-nav';

// `__dirname` y no `import.meta.url`: en el proyecto `ui` (jsdom) la URL del modulo no es `file:`.
const RAIZ = join(__dirname, '..', '..', '..');

function viewBoxDe(src: string): { readonly ancho: number; readonly alto: number } {
  const svg = readFileSync(join(RAIZ, 'public', src), 'utf8');
  const coincidencia = svg.match(/viewBox="([^"]+)"/);
  if (!coincidencia) throw new Error(`${src} no declara viewBox`);
  const [, , ancho, alto] = coincidencia[1].trim().split(/\s+/).map(Number);
  return { ancho, alto };
}

function imagenes(props: BrandLogoProps): HTMLImageElement[] {
  const { container } = render(<BrandLogo {...props} />);
  return Array.from(container.querySelectorAll('img'));
}

function unaImagen(props: BrandLogoProps): HTMLImageElement {
  const lista = imagenes(props);
  expect(lista).toHaveLength(1);
  return lista[0];
}

afterEach(() => {
  cleanup();
});

const CASOS_ON_DARK = [
  { variant: 'horizontal', height: 28, src: '/brand/logo-horizontal-dark.svg' },
  { variant: 'vertical', height: 79, src: '/brand/logo-vertical-dark.svg' },
  { variant: 'isotipo', height: 32, src: '/brand/isotipo-dark.svg' },
] as const;

describe('BrandLogo', () => {
  it.each(CASOS_ON_DARK)(
    'R15, R30: $variant sobre fondo oscuro pinta $src con la proporcion de su viewBox',
    ({ variant, height, src }) => {
      const img = unaImagen({ variant, tone: 'on-dark', height, alt: '' });

      expect(img.getAttribute('src')).toBe(src);
      expect(existsSync(join(RAIZ, 'public', src))).toBe(true);

      const alto = Number(img.getAttribute('height'));
      const ancho = Number(img.getAttribute('width'));
      const viewBox = viewBoxDe(src);

      expect(alto).toBe(height);
      // El ancho se redondea a px entero: como mucho medio pixel de desvio sobre el viewBox.
      expect(Math.abs(ancho - (height * viewBox.ancho) / viewBox.alto)).toBeLessThanOrEqual(0.5);
    },
  );

  it('R15: el logo horizontal a 28 px sale a 132 px de ancho y el vertical a 79 px tambien', () => {
    expect(unaImagen({ variant: 'horizontal', tone: 'on-dark', height: 28, alt: '' })).toHaveAttribute(
      'width',
      '132',
    );
    cleanup();
    expect(unaImagen({ variant: 'vertical', tone: 'on-dark', height: 79, alt: '' })).toHaveAttribute(
      'width',
      '132',
    );
  });

  it('R14, R15: el isotipo con tone="auto" pinta las dos versiones y el tema decide cual se ve', () => {
    const [clara, oscura] = imagenes({ variant: 'isotipo', tone: 'auto', height: 28, alt: 'QuimiCloude' });

    expect(clara.getAttribute('src')).toBe('/brand/isotipo.svg');
    expect(clara.className.split(/\s+/)).toContain('dark:hidden');
    expect(oscura.getAttribute('src')).toBe('/brand/isotipo-dark.svg');
    expect(oscura.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'dark:block']));

    for (const img of [clara, oscura]) {
      expect(img).toHaveAttribute('alt', 'QuimiCloude');
      expect(img).toHaveAttribute('width', '28');
      expect(img).toHaveAttribute('height', '28');
    }
  });

  it('R15: no anade fondo, sombra, brillo ni contorno a ninguna variante', () => {
    const todas = [
      ...CASOS_ON_DARK.map(({ variant, height }) => ({ variant, tone: 'on-dark', height, alt: '' }) as BrandLogoProps),
      { variant: 'isotipo', tone: 'auto', height: 28, alt: '' } as BrandLogoProps,
    ];

    for (const props of todas) {
      for (const img of imagenes(props)) {
        expect(img.className).not.toMatch(/\b(bg-|shadow|drop-shadow|border|ring|outline|rounded|blur|brightness)/);
        expect(img.style.background).toBe('');
        expect(img.style.backgroundColor).toBe('');
        expect(img.style.boxShadow).toBe('');
        expect(img.style.filter).toBe('');
        expect(img.style.border).toBe('');
      }
      cleanup();
    }
  });

  it('R12, R13: con alt vacio la imagen es decorativa y el nombre lo da el contenedor', () => {
    const img = unaImagen({ variant: 'horizontal', tone: 'on-dark', height: 28, alt: '' });

    expect(img).toHaveAttribute('alt', '');
  });

  it('R30: sirve el SVG tal cual, sin pasar por el optimizador de imagenes', () => {
    const img = unaImagen({ variant: 'isotipo', tone: 'on-dark', height: 32, alt: '' });

    expect(img.getAttribute('src')).not.toContain('/_next/image');
    expect(img.hasAttribute('srcset')).toBe(false);
  });
});

describe('constantes de marca', () => {
  it('R34: private-nav no exporta BRAND_TAGLINE ni BRAND_SHORT_LABEL y BRAND_LABEL es QuimiCloude', () => {
    expect(Object.keys(privateNav)).not.toContain('BRAND_TAGLINE');
    expect(Object.keys(privateNav)).not.toContain('BRAND_SHORT_LABEL');
    expect(privateNav.BRAND_LABEL).toBe('QuimiCloude');
  });

  it('R34: ningun archivo de app/, components/ ni lib/ nombra BRAND_TAGLINE ni BRAND_SHORT_LABEL', () => {
    const extensiones = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (extensiones.has(extname(entrada.name))) archivos.push(ruta);
      }
    };
    for (const dir of ['app', 'components', 'lib']) recorrer(dir);

    expect(archivos.length).toBeGreaterThan(0);
    const culpables = archivos.filter((ruta) =>
      /\bBRAND_(TAGLINE|SHORT_LABEL)\b/.test(readFileSync(join(RAIZ, ruta), 'utf8')),
    );
    expect(culpables).toEqual([]);
  });
});
