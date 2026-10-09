// Contrato de movimiento de `app/globals.css` (QC-228 R3, R10, R21, R22). Lee el CSS como texto,
// igual que `color-tokens.test.ts`. Que las utilidades de Tailwind y de tw-animate-css lean estas
// variables se comprobo compilando la hoja; aqui se fija lo que declara el archivo.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (relativa: string) =>
  readFileSync(fileURLToPath(new URL(relativa, import.meta.url)), 'utf8');

const css = leer('../../../app/globals.css');
const sonnerCss = leer('../../../node_modules/sonner/dist/styles.css');

/** Sin comentarios y con los espacios colapsados. */
function normalizar(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
}

interface Regla {
  selector: string;
  declaraciones: Map<string, string>;
}

/** Reglas de último nivel (sin anidar); el selector de una regla dentro de `@media` sale sin el prelude. */
function reglas(texto: string): Regla[] {
  const resultado: Regla[] = [];
  for (const m of normalizar(texto).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declaraciones = new Map<string, string>();
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i === -1) continue;
      declaraciones.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    resultado.push({ selector: m[1].trim(), declaraciones });
  }
  return resultado;
}

function regla(texto: string, selector: string): Regla {
  const encontrada = reglas(texto).find((r) => r.selector === selector);
  expect(encontrada, `no esta la regla ${selector}`).toBeDefined();
  return encontrada!;
}

function cuerpoDelBloque(texto: string, prelude: string): string {
  const inicio = texto.indexOf(prelude);
  expect(inicio, `no esta ${prelude}`).toBeGreaterThan(-1);
  let profundidad = 0;
  for (let i = texto.indexOf('{', inicio); i < texto.length; i++) {
    if (texto[i] === '{') profundidad++;
    if (texto[i] === '}' && --profundidad === 0) return texto.slice(inicio, i + 1);
  }
  throw new Error(`${prelude} sin cerrar`);
}

/** El CSS sin el bloque del login, que tiene su propio movimiento (QC-226). */
function fueraDelLogin(texto: string): string {
  const inicio = texto.search(/\/\*\s*══[^*]*pantalla de login — INICIO/i);
  const fin = /\/\*\s*══[^*]*pantalla de login — FIN[^*]*\*\//i.exec(texto);
  if (inicio === -1 || !fin) throw new Error('No estan los delimitadores del bloque del login');
  return texto.slice(0, inicio) + texto.slice(fin.index + fin[0].length);
}

function token(nombre: string): string {
  const m = css.match(new RegExp(`--${nombre}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${nombre} no declarado`);
  return m[1].trim();
}

/** Milisegundos de una lista de duraciones (`300ms`, `.2s`, `var(--dur-*)`). */
function milisegundos(lista: string): number[] {
  return lista.split(',').map((valor) => {
    const v = valor.trim();
    const variable = v.match(/^var\(--([a-z-]+)\)$/);
    const literal = variable ? token(variable[1]) : v;
    const m = literal.match(/^(\d*\.?\d+)(ms|s)$/);
    if (!m) throw new Error(`Duracion no reconocida: ${v}`);
    return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
  });
}

/** Selectores de atributo; `:not()` no suma por si mismo, solo su argumento. Basta: estos selectores no llevan clases ni ids. */
function especificidad(selector: string): number {
  return (selector.match(/\[[^\]]+\]/g) ?? []).length;
}

describe('motion-tokens', () => {
  it('R3: las transiciones sin duracion ni curva propias usan --dur-instant y --ease-standard', () => {
    const inicio = css.indexOf('@theme inline {');
    const tema = css.slice(inicio, css.indexOf('}', inicio));

    expect(tema).toMatch(/--default-transition-duration:\s*var\(--dur-instant\);/);
    expect(tema).toMatch(/--default-transition-timing-function:\s*var\(--ease-standard\);/);
    expect(token('dur-instant')).toBe('100ms');
    expect(token('ease-standard')).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('R21: con movimiento reducido toda animacion y transicion de la app dura 0.01 ms, una vez, y el scroll es instantaneo', () => {
    const reducido = cuerpoDelBloque(normalizar(fueraDelLogin(css)), '@media (prefers-reduced-motion: reduce)');
    const global = regla(reducido.slice(reducido.indexOf('{') + 1), '*, *::before, *::after');

    expect(Object.fromEntries(global.declaraciones)).toEqual({
      'animation-duration': '0.01ms !important',
      'animation-iteration-count': '1 !important',
      'transition-duration': '0.01ms !important',
      'scroll-behavior': 'auto !important',
    });
  });

  it('R21: los indicadores de carga en bucle se detienen, porque la regla global fuerza una sola iteracion', () => {
    // `animate-spin` y `animate-pulse` declaran `infinite` en el shorthand; la longhand con
    // `!important` lo pisa sin quitar el nombre de la animacion.
    const reducido = cuerpoDelBloque(normalizar(fueraDelLogin(css)), '@media (prefers-reduced-motion: reduce)');
    expect(reducido).toContain('animation-iteration-count: 1 !important');
    expect(reducido).not.toMatch(/animation-play-state|animation:\s*none/);
  });

  it('R22: la regla global no cambia el nombre de ninguna animacion, asi que el login conserva su conducta de movimiento reducido', () => {
    const fuera = normalizar(fueraDelLogin(css));
    const reducido = cuerpoDelBloque(fuera, '@media (prefers-reduced-motion: reduce)');

    expect(reducido).not.toMatch(/animation\s*:|animation-name\s*:/);
    expect(fuera.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);

    const inicio = css.search(/\/\*\s*══[^*]*pantalla de login — INICIO/i);
    const fin = css.search(/\/\*\s*══[^*]*pantalla de login — FIN/i);
    const login = normalizar(css.slice(inicio, fin));
    expect(login).toContain("[data-login='screen'] [data-login='molecule'] { animation: none; }");
    expect(login).toContain("[data-login='screen'] [data-slot='card'] { animation: login-card-fade 150ms linear both; }");
  });

  describe('R10: toasts', () => {
    const entrada = "[data-sonner-toaster] [data-sonner-toast]:not([data-swiping='true'])";
    const salida = "[data-sonner-toaster] [data-sonner-toast][data-removed='true']:not([data-swiping='true'])";

    /** La regla de Sonner del toast de atras que se retira (la unica con una transicion de 500 ms). */
    const reglaDeAtras = reglas(sonnerCss).find((r) => /500ms/.test(r.declaraciones.get('transition') ?? ''));

    it('R10: Sonner trae la regla del toast de atras con 500 ms, que hay que superar', () => {
      expect(reglaDeAtras?.selector).toBeDefined();
      expect(regla(sonnerCss, '[data-sonner-toast]').declaraciones.get('transition')).toBe(
        'transform 400ms, opacity 400ms, height 400ms, box-shadow 200ms',
      );
    });

    it('R10: el toast entra en --dur-slow con --ease-enter y la sombra en --dur-base', () => {
      const r = regla(css, entrada);
      expect(r.declaraciones.get('transition-property')).toBe('transform, opacity, height, box-shadow');
      expect(r.declaraciones.get('transition-duration')).toBe(
        'var(--dur-slow), var(--dur-slow), var(--dur-slow), var(--dur-base)',
      );
      expect(r.declaraciones.get('transition-timing-function')).toBe('var(--ease-enter)');
    });

    it('R10: el toast que se descarta o vence sale en --dur-fast con --ease-exit, tambien el de atras', () => {
      const deAtras = `[data-sonner-toaster] ${reglaDeAtras!.selector}`;
      const r = regla(css, `${salida}, ${deAtras}`);
      expect(r.declaraciones.get('transition-property')).toBe('transform, opacity, height, box-shadow');
      expect(r.declaraciones.get('transition-duration')).toBe('var(--dur-fast)');
      expect(r.declaraciones.get('transition-timing-function')).toBe('var(--ease-exit)');
    });

    it('R10: cada regla gana por especificidad a la de Sonner que sustituye, sin !important', () => {
      const deAtras = reglaDeAtras!.selector;
      expect(especificidad(entrada)).toBeGreaterThan(especificidad('[data-sonner-toast]'));
      expect(especificidad(salida)).toBeGreaterThan(especificidad('[data-sonner-toast]'));
      expect(especificidad(`[data-sonner-toaster] ${deAtras}`)).toBeGreaterThan(especificidad(deAtras));

      for (const r of reglas(css).filter((x) => x.selector.includes('[data-sonner-toast]'))) {
        expect(r.selector.split(',').every((parte) => parte.trim().startsWith('[data-sonner-toaster] '))).toBe(true);
        for (const valor of r.declaraciones.values()) expect(valor).not.toContain('!important');
      }
    });

    it('R10: mientras se arrastra no se pisa el `transition: none` de Sonner', () => {
      expect(regla(sonnerCss, "[data-sonner-toast][data-swiping='true']").declaraciones.get('transition')).toBe('none');
      expect(entrada).toContain(":not([data-swiping='true'])");
      expect(salida).toContain(":not([data-swiping='true'])");
    });

    it('R10: ninguna duracion de toast declarada en globals.css supera 400 ms', () => {
      for (const r of reglas(css).filter((x) => x.selector.includes('[data-sonner-toast]'))) {
        for (const ms of milisegundos(r.declaraciones.get('transition-duration') ?? '0ms')) {
          expect(ms).toBeLessThanOrEqual(400);
        }
      }
    });
  });

  describe('R16, R17, R18: botones primario y secundario', () => {
    /** Divide por comas de primer nivel, sin cortar dentro de paréntesis. */
    function partes(lista: string): string[] {
      const resultado: string[] = [];
      let profundidad = 0;
      let actual = '';
      for (const c of lista) {
        if (c === '(') profundidad++;
        if (c === ')') profundidad--;
        if (c === ',' && profundidad === 0) {
          resultado.push(actual.trim());
          actual = '';
        } else actual += c;
      }
      resultado.push(actual.trim());
      return resultado;
    }

    /** Declaración de una variable en el primer bloque `selector` que la declara. */
    function variableDe(selector: ':root' | '.dark', nombre: string): string {
      const r = reglas(css).find((x) => x.selector === selector && x.declaraciones.has(`--${nombre}`));
      expect(r, `${selector} no declara --${nombre}`).toBeDefined();
      return r!.declaraciones.get(`--${nombre}`)!;
    }

    function utilidad(nombre: string): string {
      return cuerpoDelBloque(normalizar(css), `@utility ${nombre} {`);
    }

    /** Declaraciones de primer nivel de la utilidad (sin las de sus bloques anidados). */
    function propias(cuerpo: string): Map<string, string> {
      let profundidad = 0;
      let plano = '';
      for (const c of cuerpo.slice(cuerpo.indexOf('{') + 1, -1)) {
        if (c === '{') profundidad++;
        if (profundidad === 0) plano += c;
        if (c === '}') {
          profundidad--;
          plano += ';';
        }
      }
      return new Map(
        plano
          .split(';')
          .map((d) => d.trim())
          .filter((d) => /^[a-z-]+\s*:/.test(d))
          .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as const),
      );
    }

    function bloque(cuerpo: string, prelude: string): Map<string, string> {
      const b = cuerpoDelBloque(cuerpo, prelude);
      return new Map(
        b
          .slice(b.indexOf('{') + 1, b.lastIndexOf('}'))
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as const),
      );
    }

    /** Duración en ms de cada propiedad de la transición de la utilidad. */
    function duraciones(cuerpo: string): Map<string, number> {
      const t = bloque(cuerpo, '&:not(:disabled) {');
      const propiedades = partes(t.get('transition-property')!);
      const ms = milisegundos(t.get('transition-duration')!);
      expect(ms).toHaveLength(propiedades.length);
      expect(t.get('transition-timing-function')).toBe('var(--ease-standard)');
      return new Map(propiedades.map((p, i) => [p, ms[i]]));
    }

    it('R16: el degradado del primario se desplaza al 100 % en --dur-base con --ease-standard, solo con puntero', () => {
      const cuerpo = utilidad('btn-shine');
      expect(Object.fromEntries(propias(cuerpo))).toEqual({
        'background-image': 'var(--button-primary-gradient)',
        'background-size': '200% 100%',
        'background-position': '0% 0',
        'background-repeat': 'no-repeat',
      });
      const hover = cuerpoDelBloque(cuerpo, '@media (hover: hover)');
      expect(Object.fromEntries(bloque(hover, '&:hover:not(:disabled) {'))).toEqual({
        'background-position': '100% 0',
      });
      expect(duraciones(cuerpo).get('background-position')).toBe(200);
    });

    it('R16: en claro el degradado es el de la marca; en oscuro se deriva de --primary', () => {
      expect(variableDe(':root', 'button-primary-gradient')).toBe(
        'linear-gradient(135deg, #0A4A47 0%, #02605A 45%, #0B7A72 100%)',
      );
      const oscuro = partes(variableDe('.dark', 'button-primary-gradient').replace(/^linear-gradient\((.*)\)$/, '$1'));
      expect(oscuro).toEqual([
        '135deg',
        'color-mix(in oklch, var(--primary) 85%, black) 0%',
        'var(--primary) 45%',
        'color-mix(in oklch, var(--primary) 85%, white) 100%',
      ]);
    });

    it('R16: el texto del primario cumple 4.5:1 sobre las tres paradas del degradado, en claro y en oscuro', () => {
      type Rgb = readonly [number, number, number];
      const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const deHex = (hex: string): Rgb => {
        const n = hex.replace('#', '');
        return [0, 2, 4].map((i) => lineal(parseInt(n.slice(i, i + 2), 16) / 255)) as unknown as Rgb;
      };
      const deOklch = (l: number, c: number, h: number): Rgb => {
        const a = c * Math.cos((h * Math.PI) / 180);
        const b = c * Math.sin((h * Math.PI) / 180);
        const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const rgb = [
          4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
          -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
          -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
        ];
        return rgb.map((v) => Math.min(1, Math.max(0, v))) as unknown as Rgb;
      };
      const oklch = (valor: string): [number, number, number] => {
        const m = valor.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
        if (!m) throw new Error(`oklch no reconocido: ${valor}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      };
      /** Una parada: hex, `var(--primary)` o su mezcla en oklch con negro o blanco (sin tono, toma el de --primary). */
      const parada = (texto: string, primario: string): Rgb => {
        const color = texto.replace(/\s+\d+%$/, '');
        if (color.startsWith('#')) return deHex(color);
        const [l, c, h] = oklch(primario);
        if (color === 'var(--primary)') return deOklch(l, c, h);
        const m = color.match(/^color-mix\(in oklch, var\(--primary\) (\d+)%, (black|white)\)$/);
        if (!m) throw new Error(`parada no reconocida: ${texto}`);
        const p = Number(m[1]) / 100;
        return deOklch(p * l + (1 - p) * (m[2] === 'white' ? 1 : 0), p * c, h);
      };
      const luminancia = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const contraste = (x: Rgb, y: Rgb) => {
        const [a, b] = [luminancia(x), luminancia(y)].sort((p, q) => q - p);
        return (a + 0.05) / (b + 0.05);
      };

      for (const tema of [':root', '.dark'] as const) {
        const primario = variableDe(tema, 'primary');
        const [lt, ct, ht] = oklch(variableDe(tema, 'primary-foreground'));
        const texto = deOklch(lt, ct, ht);
        const paradas = partes(variableDe(tema, 'button-primary-gradient').replace(/^linear-gradient\((.*)\)$/, '$1')).slice(1);
        expect(paradas).toHaveLength(3);
        for (const p of paradas) {
          expect(contraste(texto, parada(p, primario)), `${tema} ${p}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('R17: el velo petróleo entra desde la derecha en --dur-base y el borde y el texto pasan a --primary en --dur-instant', () => {
      const cuerpo = utilidad('btn-veil');
      expect(Object.fromEntries(propias(cuerpo))).toEqual({
        'background-image': 'linear-gradient(var(--button-veil-color), var(--button-veil-color))',
        'background-size': '0% 100%',
        'background-position': '100% 0',
        'background-repeat': 'no-repeat',
      });
      const hover = cuerpoDelBloque(cuerpo, '@media (hover: hover)');
      expect(Object.fromEntries(bloque(hover, '&:hover:not(:disabled) {'))).toEqual({
        'background-size': '100% 100%',
        'border-color': 'var(--primary)',
        color: 'var(--primary)',
      });
      const d = duraciones(cuerpo);
      expect(d.get('background-size')).toBe(200);
      expect(d.get('border-color')).toBe(100);
      expect(d.get('color')).toBe(100);
    });

    it('R17: el velo es petróleo al 10 % en claro y --primary al 10 % en oscuro', () => {
      expect(variableDe(':root', 'button-veil-color')).toBe('rgb(2 96 90 / 0.1)');
      expect(variableDe('.dark', 'button-veil-color')).toBe('color-mix(in oklch, var(--primary) 10%, transparent)');
    });

    it('R18: la escala al pulsar se transiciona en --dur-instant en los dos botones', () => {
      for (const nombre of ['btn-shine', 'btn-veil']) {
        const d = duraciones(utilidad(nombre));
        expect(d.get('scale'), nombre).toBe(100);
        expect(d.get('translate'), nombre).toBe(100);
      }
    });
  });
});
