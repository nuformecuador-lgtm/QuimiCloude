// Contrato de la piel del login.
//
// Nivel 1: `app/globals.css` leido como TEXTO. Es lo unico que se puede afirmar en Vitest sobre
// la cascada: jsdom no compila la hoja de Tailwind ni resuelve `@layer`, `@supports` ni las media
// queries, asi que un `toHaveStyle('44px')` aqui seria teatro. Lo computado se mide en navegador,
// en `e2e/login-skin.spec.ts` (nivel 3).
//
// Nivel 2: el marcado renderizado en jsdom, mas la no-regresion de `components/ui/`.
//
// Los casos marcados «ENMIENDA QC-226» sustituyen a los de las burbujas, el vidrio de dos modos y
// los delimitadores antiguos; cada uno conserva la pregunta del caso al que sustituye.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';

import LoginPage from '@/app/(public)/login/page';
import type { LoginFormState } from '@/lib/modules/identity/adapters/driving/login-form-state';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

// `__dirname` y no `import.meta.url`: en el proyecto `ui` (jsdom) la URL del modulo no es de
// esquema `file` y `fileURLToPath` lanza. Mismo patron que `tests/unit/theme/sidebar-panel.test.tsx`.
const RAIZ = join(__dirname, '..', '..');

function leerTexto(...ruta: string[]): string {
  return readFileSync(join(RAIZ, ...ruta), 'utf8');
}

function leerGlobalsCss(): string {
  return leerTexto('app', 'globals.css');
}

const INICIO_LOGIN = '/* ══ Pantalla de login — INICIO ══ */';
const FIN_LOGIN = '/* ══ Pantalla de login — FIN ══ */';

/** Valores del lienzo `Login.dc.html > C`, copiados tal cual. */
const FONDO_LOGIN =
  'radial-gradient(90% 60% at 20% 0%, rgba(72,204,191,.22), rgba(72,204,191,0) 60%), linear-gradient(166deg, #004141 0%, #002828 55%, #031515 100%)';
const VIDRIO_LOGIN = 'rgba(18,26,28,.72)';
const SOMBRA_LOGIN =
  '0 0 0 1px rgba(72,204,191,.16), inset 0 1px 0 rgba(230,241,241,.10), 0 34px 70px -24px rgba(0,0,0,.8)';

/**
 * Devuelve el indice del caracter siguiente al `}` que cierra el bloque que empieza en la
 * primera `{` a partir de `desde`. Balanceo simple de llaves, igual que en
 * `tests/unit/theme/sidebar-panel.test.tsx`: basta porque este archivo no usa llaves dentro de
 * cadenas ni anida `@layer`.
 */
function finDelBloque(css: string, desde: number): number {
  const inicioCuerpo = css.indexOf('{', desde) + 1;
  let profundidad = 1;
  let cursor = inicioCuerpo;
  while (profundidad > 0 && cursor < css.length) {
    const caracter = css[cursor];
    if (caracter === '{') profundidad += 1;
    if (caracter === '}') profundidad -= 1;
    cursor += 1;
  }
  return cursor;
}

type Declaracion = { selector: string; texto: string };

/**
 * Recorre un fragmento de CSS y devuelve cada declaracion junto al selector (o prelude) del
 * bloque MAS INTERNO que la contiene. Asi «este valor solo aparece bajo `[data-login='screen']`»
 * se puede afirmar sobre la regla real y no sobre una busqueda de texto plano, que no distingue
 * un `44px` dentro del ambito de uno suelto tres reglas mas abajo.
 */
function declaracionesDe(css: string): Declaracion[] {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const declaraciones: Declaracion[] = [];
  const pila: string[] = [];
  let buffer = '';

  const registrar = () => {
    const texto = buffer.trim();
    if (texto.length > 0 && pila.length > 0) {
      declaraciones.push({ selector: pila[pila.length - 1], texto });
    }
  };

  for (const caracter of sinComentarios) {
    if (caracter === '{') {
      pila.push(buffer.trim());
      buffer = '';
    } else if (caracter === '}') {
      registrar();
      pila.pop();
      buffer = '';
    } else if (caracter === ';') {
      registrar();
      buffer = '';
    } else {
      buffer += caracter;
    }
  }

  return declaraciones;
}

/** Textos de las declaraciones cuyo selector incluye `selector`, con los espacios normalizados. */
function textosDe(fragmento: string, selector: string): string[] {
  return declaracionesDe(fragmento)
    .filter((declaracion) => declaracion.selector.includes(selector))
    .map((declaracion) => declaracion.texto.replace(/\s+/g, ' '));
}

/** El cuerpo de la primera regla `@media`/`@supports`/`@keyframes` cuyo prelude empieza por `prelude`. */
function cuerpoDe(bloque: string, prelude: string): string {
  const inicio = bloque.indexOf(prelude);
  expect(inicio, `no esta ${prelude}`).toBeGreaterThan(-1);
  return bloque.slice(inicio, finDelBloque(bloque, inicio));
}

describe('nivel 1 · contrato de texto del CSS de la pantalla de login', () => {
  it('R32 (ENMIENDA QC-226): encierra todo lo del login entre sus dos delimitadores de bloque', () => {
    // Si algo del login se escapa fuera de los delimitadores, se mezcla con el resto del archivo.
    const css = leerGlobalsCss();

    const inicio = css.indexOf(INICIO_LOGIN);
    const fin = css.indexOf(FIN_LOGIN);

    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);

    const fuera = css.slice(0, inicio) + css.slice(fin + FIN_LOGIN.length);
    expect(fuera).not.toContain('data-login');
    expect(fuera).not.toContain('--login-');
    expect(fuera).not.toContain('login-molecule-float');
    expect(fuera).not.toContain('login-card-enter');
    expect(fuera).not.toContain('login-card-fade');
  });

  it('R18 (ENMIENDA QC-226): no deja marcado ni CSS de las burbujas ni variables --qc30-', () => {
    const css = leerGlobalsCss();

    expect(css).not.toContain('--qc30-');
    expect(css).not.toContain('qc30-login-bubble-rise');
    expect(css).not.toContain("[data-login='bubble");
    expect(css).not.toContain('QC-30 · pantalla de login');

    const fuente = leerTexto('app', '(public)', 'login', 'components', 'login-background.tsx');
    expect(fuente).not.toContain('bubble');
  });

  it('R23 (ENMIENDA QC-226): declara el bloque del login fuera de toda capa de cascada', () => {
    // Evita el falso verde: dentro de `@layer base`, el `min-height: 44px` perderia contra el
    // `h-8` que traen `components/ui/input.tsx` y `button.tsx`.
    const css = leerGlobalsCss();

    const indices = [
      css.indexOf(INICIO_LOGIN),
      css.indexOf(FIN_LOGIN),
      css.indexOf("[data-login='screen']"),
    ];
    for (const indice of indices) {
      expect(indice).toBeGreaterThan(-1);
    }

    const layerRuleRegex = /@layer\s+[\w,\s-]+\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = layerRuleRegex.exec(css)) !== null) {
      const inicioDelLayer = match.index;
      const finDelLayer = finDelBloque(css, match.index);
      for (const indice of indices) {
        expect(indice > inicioDelLayer && indice < finDelLayer).toBe(false);
      }
    }
  });

  it('deja intactas y sin reindentar las reglas del panel flotante de la barra lateral', () => {
    // R24 — se afirma que las reglas de QC-29 SIGUEN PRESENTES, nunca que sean las unicas ni que
    // el bloque tenga un tamano concreto: `feature/fix-ajuste-sidebar` esta anadiendo ahi una
    // regla para el elemento activo y este test no debe romperse por ello.
    const css = leerGlobalsCss();

    expect(
      css.match(
        /\[data-slot='sidebar-inner'\],\s*\n\[data-slot='sidebar'\]\[data-mobile='true'\]\s*\{\s*\n\s*border-radius:\s*22px;\s*\n\s*background-image:\s*var\(--sidebar-panel-gradient\);/,
      ),
    ).not.toBeNull();

    expect(css.match(/\[data-slot='sidebar-menu-button'\]\s*\{\s*\n\s*min-height:\s*44px;/)).not.toBeNull();
  });

  it('R20 (ENMIENDA QC-226): declara blur(14px) con y sin prefijo, tambien en la condicion de soporte', () => {
    // Sin el prefijo, WebKit entra por la rama del vidrio y no desenfoca.
    const bloque = bloqueLogin();

    expect(bloque).toContain('-webkit-backdrop-filter: blur(14px);');
    expect(bloque).toMatch(/[^-]backdrop-filter: blur\(14px\);/);
    expect(bloque).not.toContain('blur(22px)');
    expect(bloque).not.toContain('saturate(');

    const condicion = bloque.match(/@supports([^{]*)\{/);
    expect(condicion).not.toBeNull();
    expect(condicion?.[1]).toContain('(backdrop-filter: blur(14px))');
    expect(condicion?.[1]).toContain('-webkit-backdrop-filter: blur(14px)');
  });

  it('R20 (ENMIENDA QC-226): pinta la tarjeta opaca como base y el vidrio solo dentro de @supports', () => {
    const bloque = bloqueLogin();

    const inicioSupports = bloque.indexOf('@supports');
    expect(inicioSupports).toBeGreaterThan(-1);
    const antesDelSupports = bloque.slice(0, inicioSupports);
    const dentroDelSupports = bloque.slice(inicioSupports, finDelBloque(bloque, inicioSupports));

    expect(textosDe(antesDelSupports, "[data-slot='card']")).toContain(
      'background-color: var(--card)',
    );
    expect(textosDe(dentroDelSupports, "[data-slot='card']")).toContain(
      'background-color: var(--login-card-glass)',
    );

    const transparencia = cuerpoDe(bloque, '@media (prefers-reduced-transparency: reduce)');
    const enTransparencia = textosDe(transparencia, "[data-slot='card']");
    expect(enTransparencia).toContain('background-color: var(--card)');
    expect(enTransparencia).toContain('backdrop-filter: none');
    expect(enTransparencia).toContain('-webkit-backdrop-filter: none');
  });

  it('R20 (ENMIENDA QC-226): la transparencia reducida va despues del @supports, para ganarle', () => {
    const bloque = bloqueLogin().replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(bloque.indexOf('@media (prefers-reduced-transparency: reduce)')).toBeGreaterThan(
      bloque.indexOf('@supports'),
    );
  });

  it('R18 (ENMIENDA QC-226): define exactamente tres moleculas, ni una mas', () => {
    // Se cuentan indices DISTINTOS, no ocurrencias del selector.
    const bloque = bloqueLogin();

    const indices = new Set(
      [...bloque.matchAll(/data-login-index='(\d+)'/g)].map((match) => match[1]),
    );

    expect([...indices].sort()).toEqual(['1', '2', '3']);
  });

  it('R22 (ENMIENDA QC-226): con movimiento reducido deja las moleculas quietas y visibles y la tarjeta con un fundido', () => {
    const bloque = bloqueLogin();
    const reducido = cuerpoDe(bloque, '@media (prefers-reduced-motion: reduce)');

    const moleculas = textosDe(reducido, "[data-login='molecule']");
    expect(moleculas).toEqual(['animation: none']);

    // Quietas, no ocultas: nada dentro de la regla esconde la capa ni las moleculas.
    for (const texto of textosDe(reducido, '')) {
      expect(texto).not.toMatch(/^(display|visibility|opacity)\s*:/);
    }

    expect(textosDe(reducido, "[data-slot='card']")).toEqual([
      'animation: login-card-fade 150ms linear both',
    ]);
  });

  it('R22 (ENMIENDA QC-226): el fundido de movimiento reducido solo anima la opacidad', () => {
    const fundido = cuerpoDe(bloqueLogin(), '@keyframes login-card-fade');
    const propiedades = declaracionesDe(fundido).map((declaracion) =>
      declaracion.texto.split(':')[0].trim(),
    );

    expect(propiedades.length).toBeGreaterThan(0);
    expect(new Set(propiedades)).toEqual(new Set(['opacity']));
  });

  it('R22 (ENMIENDA QC-226): la regla de movimiento reducido esta acotada a la pantalla de login', () => {
    const reducido = cuerpoDe(bloqueLogin(), '@media (prefers-reduced-motion: reduce)');
    const selectores = new Set(declaracionesDe(reducido).map((declaracion) => declaracion.selector));

    expect(selectores.size).toBeGreaterThan(0);
    for (const selector of selectores) {
      expect(selector.startsWith("[data-login='screen'] ")).toBe(true);
    }
  });

  it('mantiene las medidas de 44px, 400px, 18px y 28px dentro del ambito del login', () => {
    // R16, R17 — cada declaracion que use una de esas medidas tiene que colgar de
    // `[data-login='screen']`; si una se escribe suelta, se filtra a toda la aplicacion.
    const medidas = ['44px', '400px', '18px', '28px'] as const;
    const declaraciones = declaracionesDe(bloqueLogin());

    for (const medida of medidas) {
      const conLaMedida = declaraciones.filter((declaracion) => declaracion.texto.includes(medida));
      expect(conLaMedida.length).toBeGreaterThan(0);
      for (const declaracion of conLaMedida) {
        expect(declaracion.selector).toContain("[data-login='screen']");
      }
    }
  });

  it('no deja ninguna de esas medidas fuera del bloque de QC-30', () => {
    // R17 — el resto de la aplicacion conserva sus 32 px de alto y las medidas de tarjeta de hoy.
    const css = leerGlobalsCss();
    const inicio = css.indexOf(INICIO_LOGIN);
    const fin = css.indexOf(FIN_LOGIN);
    const declaracionesFuera = declaracionesDe(
      css.slice(0, inicio) + css.slice(fin + FIN_LOGIN.length),
    );

    for (const medida of ['400px', '18px', '28px'] as const) {
      expect(declaracionesFuera.filter((declaracion) => declaracion.texto.includes(medida))).toEqual(
        [],
      );
    }

    // Excepcion unica y preexistente: el `min-height: 44px` del item de menu de la barra lateral
    // (QC-29, T15, R20). No es de esta feature. Se afirma por SELECTOR y no por numero de
    // ocurrencias, para que la regla que `feature/fix-ajuste-sidebar` esta anadiendo al elemento
    // activo del mismo panel no ponga esto en rojo sin motivo.
    const con44Fuera = declaracionesFuera.filter((declaracion) => declaracion.texto.includes('44px'));
    expect(con44Fuera.length).toBeGreaterThan(0);
    for (const declaracion of con44Fuera) {
      expect(declaracion.selector).toContain("[data-slot='sidebar-menu-button']");
    }
  });

  it('R19 (ENMIENDA QC-226): anima cada molecula con ciclos de 22, 30 y 26 s, su direccion y la curva estandar', () => {
    const bloque = bloqueLogin();

    const esperado = [
      { indice: '1', animacion: 'animation: login-molecule-float 22s cubic-bezier(0.2, 0, 0, 1) infinite alternate' },
      { indice: '2', animacion: 'animation: login-molecule-float 30s cubic-bezier(0.2, 0, 0, 1) infinite alternate-reverse' },
      { indice: '3', animacion: 'animation: login-molecule-float 26s cubic-bezier(0.2, 0, 0, 1) infinite alternate' },
    ] as const;
    for (const molecula of esperado) {
      expect(textosDe(bloque, `[data-login-index='${molecula.indice}']`)).toContain(
        molecula.animacion,
      );
    }

    const ciclos = [...bloque.matchAll(/login-molecule-float (\d+(?:\.\d+)?)s/g)].map((match) =>
      Number(match[1]),
    );
    expect(ciclos).toHaveLength(3);
    for (const ciclo of ciclos) {
      expect(ciclo).toBeGreaterThanOrEqual(20);
    }
  });

  it('no redeclara el radio de campo y boton, ni el anillo de foco, ni la tipografia', () => {
    // R20 — la cara complementaria de «no altera las primitivas de components/ui»: alli se
    // afirma que `rounded-lg` y `focus-visible:ring-3` SIGUEN en el primitivo; aqui, que el
    // bloque de QC-30 no los pisa desde la hoja. Se recorren declaraciones y no texto plano:
    // el bloque SI declara `border-radius` sobre la tarjeta (18 px, R16) y sobre su cabecera y
    // su pie, y una busqueda de cadena no sabria distinguir esos de un radio de campo.
    const declaraciones = declaracionesDe(bloqueLogin());

    const propiedadDe = (texto: string) => texto.split(':')[0].trim();
    const enCampoOBoton = (selector: string) =>
      selector.includes("[data-slot='input']") || selector.includes("[data-slot='button']");

    expect(
      declaraciones.filter(
        (declaracion) =>
          enCampoOBoton(declaracion.selector) && propiedadDe(declaracion.texto) === 'border-radius',
      ),
    ).toEqual([]);

    const propiedadesDeAnillo = ['outline', 'outline-width', 'outline-color', '--ring', 'ring-width'];
    expect(
      declaraciones.filter((declaracion) =>
        propiedadesDeAnillo.includes(propiedadDe(declaracion.texto)),
      ),
    ).toEqual([]);

    expect(
      declaraciones.filter((declaracion) => propiedadDe(declaracion.texto) === 'font-family'),
    ).toEqual([]);
  });

  it('R17 (ENMIENDA QC-226): solo declara variables propias con prefijo --login-, salvo el espaciado de la tarjeta', () => {
    // Los tokens de color llegan por el ambito `.dark` del `main`; el bloque no redefine ninguno.
    const EXCEPCION = '--card-spacing';

    const personalizadas = declaracionesDe(bloqueLogin())
      .map((declaracion) => ({
        selector: declaracion.selector,
        propiedad: declaracion.texto.split(':')[0].trim(),
      }))
      .filter((declaracion) => declaracion.propiedad.startsWith('--'));

    expect(personalizadas.length).toBeGreaterThan(0);

    for (const declaracion of personalizadas) {
      expect(declaracion.selector).toContain("[data-login='screen']");
      if (declaracion.propiedad === EXCEPCION) continue;
      expect(declaracion.propiedad.startsWith('--login-')).toBe(true);
    }
  });

  it('R18 (ENMIENDA QC-226): transcribe tamano, posicion y opacidad de cada molecula del lienzo', () => {
    const bloque = bloqueLogin();

    const esperado = [
      { indice: '1', textos: ['width: 150px', 'height: 150px', 'left: -30px', 'top: 40px', 'opacity: 0.22'] },
      { indice: '2', textos: ['width: 110px', 'height: 110px', 'right: 10px', 'top: 120px', 'opacity: 0.18'] },
      { indice: '3', textos: ['width: 190px', 'height: 190px', 'right: -50px', 'bottom: 30px', 'opacity: 0.14'] },
    ] as const;
    for (const molecula of esperado) {
      const textos = textosDe(bloque, `[data-login-index='${molecula.indice}']`);
      for (const texto of molecula.textos) {
        expect(textos).toContain(texto);
      }
    }
  });

  it('R17, R20 (ENMIENDA QC-226): declara el fondo petroleo, el vidrio y la sombra del lienzo en un solo juego', () => {
    // Digitos tal cual, solo se normalizan los espacios: el riesgo es una cifra mal copiada.
    const variables = new Map<string, string>();
    for (const declaracion of declaracionesDe(bloqueLogin())) {
      if (declaracion.selector.trim() !== "[data-login='screen']") continue;
      const separador = declaracion.texto.indexOf(':');
      const propiedad = declaracion.texto.slice(0, separador).trim();
      if (!propiedad.startsWith('--login-')) continue;
      variables.set(propiedad, declaracion.texto.slice(separador + 1).trim().replace(/\s+/g, ' '));
    }

    expect(variables.get('--login-screen-background')).toBe(FONDO_LOGIN);
    expect(variables.get('--login-card-glass')).toBe(VIDRIO_LOGIN);
    expect(variables.get('--login-card-shadow')).toBe(SOMBRA_LOGIN);

    // El pie no lo dibuja el lienzo: decision propia, solo se exige que exista.
    expect(variables.has('--login-footer-background')).toBe(true);
    expect(variables.has('--login-footer-border')).toBe(true);

    expect(textosDe(bloqueLogin(), "[data-login='screen']")).toContain(
      'background: var(--login-screen-background)',
    );
  });

  it('R17 (ENMIENDA QC-226): el ambito del login declara color-scheme oscuro', () => {
    const declaraciones = declaracionesDe(bloqueLogin()).filter(
      (declaracion) => declaracion.selector.trim() === "[data-login='screen']",
    );

    expect(declaraciones.map((declaracion) => declaracion.texto.replace(/\s+/g, ' '))).toContain(
      'color-scheme: dark',
    );
  });

  it('R20 (ENMIENDA QC-226): conserva la sombra de la tarjeta tambien con transparencia reducida', () => {
    const bloque = bloqueLogin().replace(/\/\*[\s\S]*?\*\//g, ' ');

    const inicioTransparencia = bloque.indexOf('@media (prefers-reduced-transparency: reduce)');
    expect(inicioTransparencia).toBeGreaterThan(-1);
    const finTransparencia = finDelBloque(bloque, inicioTransparencia);

    const dentroDeTransparencia = bloque.slice(inicioTransparencia, finTransparencia);
    const fueraDeTransparencia =
      bloque.slice(0, inicioTransparencia) + bloque.slice(finTransparencia);

    for (const fragmento of [fueraDeTransparencia, dentroDeTransparencia]) {
      const sombras = textosDe(fragmento, "[data-slot='card']").filter((texto) =>
        texto.startsWith('box-shadow'),
      );
      expect(sombras).toEqual(['box-shadow: var(--login-card-shadow)']);
    }
  });

  it('R19 (ENMIENDA QC-226): las moleculas flotan 36 px y giran 24 grados, solo con transform', () => {
    const flota = cuerpoDe(bloqueLogin(), '@keyframes login-molecule-float');
    const textos = declaracionesDe(flota).map((declaracion) =>
      declaracion.texto.replace(/\s+/g, ' '),
    );

    expect(textos).toEqual([
      'transform: translateY(0) rotate(0deg)',
      'transform: translateY(-36px) rotate(24deg)',
    ]);
  });

  it('R21 (ENMIENDA QC-226): la tarjeta entra una vez, de opacity 0 y translateY(12px), en --dur-slow con --ease-enter', () => {
    const bloque = bloqueLogin();
    const sinReducido =
      bloque.slice(0, bloque.indexOf('@media (prefers-reduced-motion: reduce)'));

    expect(textosDe(sinReducido, "[data-slot='card']")).toContain(
      'animation: login-card-enter var(--dur-slow) var(--ease-enter) both',
    );

    const entrada = declaracionesDe(cuerpoDe(bloque, '@keyframes login-card-enter')).map(
      (declaracion) => `${declaracion.selector.trim()} ${declaracion.texto.replace(/\s+/g, ' ')}`,
    );
    expect(entrada).toEqual([
      'from opacity: 0',
      'from transform: translateY(12px)',
      'to opacity: 1',
      'to transform: none',
    ]);

    // Una sola vez: ni `infinite` ni un numero de iteraciones en la animacion de la tarjeta.
    for (const texto of textosDe(bloque, "[data-slot='card']")) {
      if (!texto.startsWith('animation')) continue;
      expect(texto).not.toContain('infinite');
    }
  });

  it('R18 (ENMIENDA QC-226): deja la capa de moleculas sin capturar el puntero y por debajo de la tarjeta', () => {
    const bloque = bloqueLogin();

    const capa = textosDe(bloque, "[data-login='molecules']");
    expect(capa).toContain('pointer-events: none');
    expect(capa).toContain('z-index: 1');

    expect(textosDe(bloque, "[data-slot='card']")).toContain('z-index: 2');
  });

  it('fija 44px de alto en campo y boton, y 400px, 18px y 28px en la tarjeta del login', () => {
    // R16 — la cara POSITIVA que faltaba. El test de medidas de mas arriba afirma lo contrario
    // («toda declaracion que use 44px cuelga del ambito») y hacen falta las dos: bajar el
    // `min-height` del campo a 32px cumplia esa y dejaba el gate en verde. El numero se mide de
    // verdad en `e2e/login-skin.spec.ts`, pero el gate no ejecuta E2E, asi que una regresion de
    // altura llegaria al merge sin ponerse roja.
    const declaraciones = declaracionesDe(bloqueLogin());

    const declara = (selector: string, texto: string) =>
      declaraciones.some(
        (declaracion) =>
          declaracion.selector.includes("[data-login='screen']") &&
          declaracion.selector.includes(selector) &&
          declaracion.texto.replace(/\s+/g, ' ') === texto,
      );

    expect(declara("[data-slot='input']", 'min-height: 44px')).toBe(true);
    expect(declara("[data-slot='button']", 'min-height: 44px')).toBe(true);

    for (const texto of ['max-width: 400px', 'border-radius: 18px', '--card-spacing: 28px']) {
      expect(declara("[data-slot='card']", texto)).toBe(true);
    }
  });

  it('tampoco pisa el anillo de foco de campo y boton por la via del box-shadow', () => {
    // R20 — completa la lista de propiedades del test de mas arriba (`outline`, `--ring`...):
    // una sombra sobre el campo o el boton tapa igual de bien el anillo de 3 px del primitivo.
    // La prohibicion va ACOTADA a esos dos selectores a proposito: la tarjeta declara
    // `box-shadow` de forma legitima —es el filo, el brillo y la sombra del vidrio, R9— y una
    // prohibicion global saldria roja contra el codigo bueno.
    const declaraciones = declaracionesDe(bloqueLogin());

    const enCampoOBoton = (selector: string) =>
      selector.includes("[data-slot='input']") || selector.includes("[data-slot='button']");

    expect(
      declaraciones.filter(
        (declaracion) =>
          enCampoOBoton(declaracion.selector) &&
          declaracion.texto.split(':')[0].trim() === 'box-shadow',
      ),
    ).toEqual([]);
  });
});

/** El fragmento de `app/globals.css` que va entre los dos delimitadores del login, ambos incluidos. */
function bloqueLogin(): string {
  const css = leerGlobalsCss();
  const inicio = css.indexOf(INICIO_LOGIN);
  const fin = css.indexOf(FIN_LOGIN);
  if (inicio === -1 || fin <= inicio) {
    throw new Error('el bloque delimitado del login no esta en app/globals.css');
  }
  return css.slice(inicio, fin + FIN_LOGIN.length);
}

// Se mockea la action por el mismo motivo que en `tests/unit/login-form.test.tsx`: la pagina monta
// el formulario real y no se quiere pegar contra la Server Action.
const { loginActionMock } = vi.hoisted(() => ({
  loginActionMock:
    vi.fn<(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>>(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/login-action', () => ({
  loginAction: loginActionMock,
}));

describe('nivel 2 · contrato del marcado de la pantalla de login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('expone un unico landmark main, que es el ambito del login', () => {
    // R15 — la capa decorativa es un `div`, no un elemento seccionador: no anade un segundo main.
    render(<LoginPage />);

    const landmarks = screen.getAllByRole('main');
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0]).toHaveAttribute('data-login', 'screen');
  });

  it('R16: la cabecera de la tarjeta es un unico h1 con el logo vertical oscuro y sin texto visible', () => {
    render(<LoginPage />);

    const titulos = screen.getAllByRole('heading', { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: BRAND_LABEL })).toBe(titulos[0]);

    const titulo = titulos[0];
    const logo = titulo.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toContain('/brand/logo-vertical-dark.svg');
    expect(logo).toHaveAttribute('alt', BRAND_LABEL);

    // Sin titulo de texto: el h1 solo contiene el logo, y el nombre sale de su `alt`.
    expect(titulo.textContent?.trim()).toBe('');
    expect(titulo.children).toHaveLength(1);
    expect(document.querySelector('[data-slot="card-title"]')).toBeNull();
  });

  it('R17 (ENMIENDA QC-226): el main lleva el ambito oscuro y el Toaster queda fuera', () => {
    render(<LoginPage />);

    const main = screen.getByRole('main');
    expect(main).toHaveClass('dark');
    // El `Toaster` lo monta el layout publico, fuera de la pagina: no puede quedar dentro del main.
    expect(main.querySelector('[data-sonner-toaster]')).toBeNull();
  });

  it('R18 (ENMIENDA QC-226): monta las tres moleculas como capa decorativa e inalcanzable por teclado', () => {
    render(<LoginPage />);

    const capa = document.querySelector<HTMLElement>('[data-login="molecules"]');
    if (!capa) {
      throw new Error('la pagina de login no monto la capa de moleculas');
    }

    expect(capa).toHaveAttribute('aria-hidden', 'true');
    const moleculas = capa.querySelectorAll('svg[data-login="molecule"]');
    expect(moleculas).toHaveLength(3);
    expect([...moleculas].map((molecula) => molecula.getAttribute('data-login-index'))).toEqual([
      '1',
      '2',
      '3',
    ]);

    for (const molecula of moleculas) {
      expect(molecula.hasAttribute('tabindex')).toBe(false);
      expect(molecula.getAttribute('viewBox')).toBe('0 0 48 48');
    }

    expect(
      capa.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  it('R18 (ENMIENDA QC-226): las moleculas no llevan style en linea ni tamano en el marcado', () => {
    render(<LoginPage />);

    const capa = document.querySelector<HTMLElement>('[data-login="molecules"]');
    if (!capa) {
      throw new Error('la pagina de login no monto la capa de moleculas');
    }

    expect(capa.hasAttribute('style')).toBe(false);
    for (const nodo of capa.querySelectorAll('*')) {
      expect(nodo.hasAttribute('style')).toBe(false);
    }
    for (const molecula of capa.querySelectorAll('svg')) {
      expect(molecula.hasAttribute('width')).toBe(false);
      expect(molecula.hasAttribute('height')).toBe(false);
    }
  });

  it('R18 (ENMIENDA QC-226): pinta los poligonos y trazos del lienzo con sus colores', () => {
    render(<LoginPage />);

    const molecula = (indice: string) => {
      const svg = document.querySelector(`svg[data-login-index="${indice}"]`);
      if (!svg) throw new Error(`falta la molecula ${indice}`);
      return svg;
    };
    const hexagono = '21,10.5 32.69,17.25 32.69,30.75 21,37.5 9.31,30.75 9.31,17.25';

    for (const [indice, trazo, grosor] of [
      ['1', '#48CCBF', '2.4'],
      ['2', '#9FE3DA', '2.4'],
      ['3', '#48CCBF', '2'],
    ] as const) {
      const poligono = molecula(indice).querySelector('polygon');
      expect(poligono).toHaveAttribute('points', hexagono);
      expect(poligono).toHaveAttribute('fill', 'none');
      expect(poligono).toHaveAttribute('stroke', trazo);
      expect(poligono).toHaveAttribute('stroke-width', grosor);
      expect(poligono).toHaveAttribute('stroke-linejoin', 'round');
    }

    expect(molecula('1').querySelector('path')).toHaveAttribute('d', 'M32.69 30.75L40.92 35.5');
    expect(molecula('1').querySelector('circle')).toHaveAttribute('fill', '#80C5FF');
    expect(molecula('1').querySelector('circle')).toHaveAttribute('r', '3');

    expect(molecula('2').querySelector('path')).toHaveAttribute('d', 'M9.31 17.25L3.25 13.75');
    expect(molecula('2').querySelector('circle')).toHaveAttribute('fill', '#9FE3DA');
    expect(molecula('2').querySelector('circle')).toHaveAttribute('r', '2.4');

    const enlaces = molecula('3').querySelector('path');
    expect(enlaces).toHaveAttribute(
      'd',
      'M21.91 17.03L26.58 19.73M26.58 28.27L21.91 30.97M14.51 26.7L14.51 21.3',
    );
    expect(enlaces).toHaveAttribute('stroke-width', '1.6');
    expect(molecula('3').querySelector('circle')).toBeNull();
  });

  it('R18 (ENMIENDA QC-226): coloca la capa de moleculas como hermana de la tarjeta y antes que ella', () => {
    // El orden del DOM es lo que la deja por debajo (la tarjeta lleva `z-index: 2`).
    render(<LoginPage />);

    const main = screen.getByRole('main');
    const capa = document.querySelector<HTMLElement>('[data-login="molecules"]');
    const tarjeta = document.querySelector<HTMLElement>('[data-slot="card"]');
    if (!capa || !tarjeta) {
      throw new Error('faltan la capa de moleculas o la tarjeta en la pantalla de login');
    }

    const hijos = [...main.children];
    expect(hijos).toContain(capa);
    expect(hijos).toContain(tarjeta);
    expect(hijos.indexOf(capa)).toBeLessThan(hijos.indexOf(tarjeta));
  });

  it('deja el enlace de recuperacion en el pie de la tarjeta y fuera del formulario', () => {
    // R1 — el rediseno es piel: la anatomia de la pantalla no se mueve.
    render(<LoginPage />);

    const enlace = screen.getByTestId('login-forgot-password');
    const formulario = screen.getByTestId('login-form');

    expect(formulario.contains(enlace)).toBe(false);
  });

  it('no altera las primitivas de components/ui', () => {
    // R19 — misma tecnica que uso QC-29 y por el mismo motivo: el gate corre sin red y no puede
    // diffear contra `origin/dev`, asi que se afirma que las clases que la piel del login podria
    // haber tentado a cambiar SIGUEN estando en el primitivo.
    expect(leerTexto('components', 'ui', 'input.tsx')).toContain('h-8');
    expect(leerTexto('components', 'ui', 'button.tsx')).toContain('h-8');
    expect(leerTexto('components', 'ui', 'card.tsx')).toContain('rounded-xl');
    expect(leerTexto('components', 'ui', 'card.tsx')).toContain('[--card-spacing:--spacing(4)]');
  });

  it('conserva el radio y el anillo de foco de campo y boton en las primitivas', () => {
    // R20 — el radio de 10 px (`rounded-lg`) y el anillo de foco de 3 px
    // (`focus-visible:ring-3`) son de las medidas que «coinciden y no se tocan»: la piel del
    // login pudo tentar a moverlos en el primitivo. Misma tecnica de lectura de texto que el
    // test de arriba, y por el mismo motivo: el gate corre sin red y no puede diffear.
    const input = leerTexto('components', 'ui', 'input.tsx');
    const button = leerTexto('components', 'ui', 'button.tsx');

    // ENMIENDA QC-227: el foco translucido de 3 px pasa a anillo opaco de 1 px en el campo y a contorno de 2 px en el boton, para que el foco sea opaco.
    expect(input).toContain('rounded-lg');
    expect(input).toContain('focus-visible:ring-1');
    expect(button).toContain('rounded-lg');
    expect(button).toContain('focus-visible:outline-2');
  });

  it('mide el alto de la pantalla con la unidad de viewport dinamica', () => {
    // R23 — `min-h-svh` y no `min-h-screen`: `100vh` miente en movil, donde la barra del
    // navegador se retrae y expande (`docs/architecture.md > Componentes`), y con `100vh` la
    // tarjeta queda descentrada o empuja una barra de scroll que no deberia existir.
    render(<LoginPage />);

    const main = screen.getByRole('main');

    expect(main).toHaveClass('min-h-svh');
    expect(main.className).not.toContain('min-h-screen');
  });
});
