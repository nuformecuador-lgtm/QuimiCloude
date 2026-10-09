// Tipografia de la app (QC-226 R7, R8): lee `app/layout.tsx`, `app/globals.css` y los SVG de
// marca como texto. `next/font/google` solo se resuelve dentro de `next build`/`next dev`, asi
// que aqui se mira el cableado, no la descarga de la fuente.

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

function archivosBajo(dir: string, extensiones: readonly string[]): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosBajo(ruta, extensiones));
    else if (extensiones.includes(extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

function themeInline(css: string): string {
  const start = css.indexOf('@theme inline {');
  if (start === -1) throw new Error('No se encontro @theme inline en globals.css');
  return css.slice(start, css.indexOf('}', start));
}

describe('fuentes de la app', () => {
  const layout = leer('app/layout.tsx');
  const css = leer('app/globals.css');

  it('R7: carga IBM Plex Sans (400, 500, 600) e IBM Plex Mono (400, 500) con next/font/google', () => {
    expect(layout).toMatch(
      /import\s*\{\s*(IBM_Plex_Mono\s*,\s*IBM_Plex_Sans|IBM_Plex_Sans\s*,\s*IBM_Plex_Mono)\s*\}\s*from\s*["']next\/font\/google["']/,
    );
    expect(layout).toMatch(
      /IBM_Plex_Sans\(\{[^}]*variable:\s*["']--font-plex-sans["'][^}]*weight:\s*\[\s*["']400["']\s*,\s*["']500["']\s*,\s*["']600["']\s*\]/,
    );
    expect(layout).toMatch(
      /IBM_Plex_Mono\(\{[^}]*variable:\s*["']--font-plex-mono["'][^}]*weight:\s*\[\s*["']400["']\s*,\s*["']500["']\s*\]/,
    );
  });

  it('R7: aplica las variables de las dos fuentes en <html>', () => {
    expect(layout).toMatch(/className=\{`\$\{plexSans\.variable\} \$\{plexMono\.variable\}/);
  });

  it('R7: resuelve --font-sans y --font-heading a Plex Sans y --font-mono a Plex Mono', () => {
    const theme = themeInline(css);
    expect(theme).toMatch(/--font-sans:\s*var\(--font-plex-sans\);/);
    expect(theme).toMatch(/--font-heading:\s*var\(--font-plex-sans\);/);
    expect(theme).toMatch(/--font-mono:\s*var\(--font-plex-mono\);/);
  });

  it('R7: no queda ninguna referencia a Geist en app/layout.tsx ni en app/globals.css', () => {
    expect(layout).not.toMatch(/geist/i);
    expect(css).not.toMatch(/geist/i);
  });

  it('R8: no carga Sora ni la declara en ninguna font-family de la app', () => {
    const fuentes = archivosBajo('app', ['.ts', '.tsx', '.css']).concat(
      archivosBajo('components', ['.ts', '.tsx', '.css']),
    );
    expect(fuentes.length).toBeGreaterThan(0);
    for (const ruta of fuentes) {
      expect({ ruta, nombraSora: /\bsora\b/i.test(leer(ruta)) }).toEqual({ ruta, nombraSora: false });
    }
  });

  it('R8: los SVG de marca traen el wordmark en trazos, sin texto ni font-family', () => {
    const svgs = archivosBajo('public/brand', ['.svg']);
    expect(svgs.length).toBeGreaterThan(0);
    for (const ruta of svgs) {
      const svg = leer(ruta);
      expect({ ruta, texto: /<text\b|font-family/i.test(svg) }).toEqual({ ruta, texto: false });
    }
  });
});
