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
});
