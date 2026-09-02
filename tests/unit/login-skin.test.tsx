// T7 y T8 — Contrato de la piel del login (QC-30, `design.md > 8`, niveles 1 y 2).
//
// Nivel 1: `app/globals.css` leido como TEXTO. Es lo unico que se puede afirmar en Vitest sobre
// la cascada: jsdom no compila la hoja de Tailwind ni resuelve `@layer`, `@supports` ni las media
// queries, asi que un `toHaveStyle('44px')` aqui seria teatro. Lo computado se mide en navegador,
// en `e2e/login-skin.spec.ts` (nivel 3).
//
// Nivel 2: el marcado renderizado en jsdom, mas la no-regresion de `components/ui/`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';

import LoginPage from '@/app/(public)/login/page';
import type { LoginFormState } from '@/lib/modules/identity/adapters/driving/login-form-state';

// `__dirname` y no `import.meta.url`: en el proyecto `ui` (jsdom) la URL del modulo no es de
// esquema `file` y `fileURLToPath` lanza. Mismo patron que `tests/unit/theme/sidebar-panel.test.tsx`.
const RAIZ = join(__dirname, '..', '..');

function leerTexto(...ruta: string[]): string {
  return readFileSync(join(RAIZ, ...ruta), 'utf8');
}

function leerGlobalsCss(): string {
  return leerTexto('app', 'globals.css');
}

const INICIO_QC30 = '/* ══ QC-30 · pantalla de login — INICIO';
const FIN_QC30 = '/* ══ QC-30 · pantalla de login — FIN ══ */';

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

describe('nivel 1 · contrato de texto del CSS de la pantalla de login', () => {
  it('encierra todo lo de QC-30 entre sus dos delimitadores de bloque', () => {
    // R24 — el acuerdo con `feature/fix-ajuste-sidebar` es «bloques separados»: si algo de
    // QC-30 se escapa fuera de los delimitadores, el proximo merge lo mezcla con el suyo.
    const css = leerGlobalsCss();

    const inicio = css.indexOf(INICIO_QC30);
    const fin = css.indexOf(FIN_QC30);

    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);

    const fuera = css.slice(0, inicio) + css.slice(fin + FIN_QC30.length);
    expect(fuera).not.toContain('data-login');
    expect(fuera).not.toContain('--qc30-');
    expect(fuera).not.toContain('qc30-login-bubble-rise');
  });

  it('declara el bloque de QC-30 fuera de toda capa de cascada', () => {
    // R18 — evita el falso verde: dentro de `@layer base`, el `min-height: 44px` perderia contra
    // el `h-8` que traen `components/ui/input.tsx` y `button.tsx`, la pantalla saldria igual que
    // hoy y este archivo seguiria verde por las razones equivocadas (`design.md > 6`).
    const css = leerGlobalsCss();

    const indices = [
      css.indexOf(INICIO_QC30),
      css.indexOf(FIN_QC30),
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

  it('declara el desenfoque de fondo con y sin prefijo, tambien en la condicion de soporte', () => {
    // R10 — sin el prefijo, WebKit (el motor de iOS) entra por la rama del vidrio y NO desenfoca:
    // translucido-sin-desenfocar, que es justo lo que la base opaca existe para evitar.
    const bloque = bloqueQc30();

    expect(bloque).toContain('backdrop-filter: blur(22px) saturate(150%)');
    expect(bloque).toContain('-webkit-backdrop-filter: blur(22px) saturate(150%)');

    const condicion = bloque.match(/@supports([^{]*)\{/);
    expect(condicion).not.toBeNull();
    expect(condicion?.[1]).toContain('backdrop-filter: blur(22px)');
    expect(condicion?.[1]).toContain('-webkit-backdrop-filter: blur(22px)');
  });

  it('pinta la tarjeta opaca como base y el vidrio solo como mejora dentro de @supports', () => {
    // R11 — la base es `var(--card)`, el color que la tarjeta ya usa hoy; el degradado
    // translucido vive dentro del `@supports`, y la transparencia reducida devuelve a la base.
    const bloque = bloqueQc30();

    const inicioSupports = bloque.indexOf('@supports');
    expect(inicioSupports).toBeGreaterThan(-1);
    const antesDelSupports = bloque.slice(0, inicioSupports);
    const dentroDelSupports = bloque.slice(inicioSupports, finDelBloque(bloque, inicioSupports));

    const baseOpaca = declaracionesDe(antesDelSupports).filter(
      (declaracion) =>
        declaracion.selector.includes("[data-slot='card']") &&
        declaracion.texto.replace(/\s+/g, ' ') === 'background-color: var(--card)',
    );
    expect(baseOpaca.length).toBeGreaterThan(0);

    expect(dentroDelSupports).toContain('var(--qc30-login-card-gradient)');
    expect(dentroDelSupports).toContain('backdrop-filter: blur(22px)');

    const inicioTransparencia = bloque.indexOf('@media (prefers-reduced-transparency: reduce)');
    expect(inicioTransparencia).toBeGreaterThan(-1);
    const bloqueTransparencia = bloque.slice(
      inicioTransparencia,
      finDelBloque(bloque, inicioTransparencia),
    );
    expect(bloqueTransparencia).toContain('background-color: var(--card)');
    expect(bloqueTransparencia).toContain('backdrop-filter: none');
  });

  it('define exactamente tres burbujas, ni una mas', () => {
    // R12 — se cuentan indices DISTINTOS, no ocurrencias del selector: cada indice aparece dos
    // veces a proposito (base movil y override en `@media (min-width: 640px)`). Un
    // `data-login-index='4'` pondria esto en rojo.
    const bloque = bloqueQc30();

    const indices = new Set(
      [...bloque.matchAll(/data-login-index='(\d+)'/g)].map((match) => match[1]),
    );

    expect([...indices].sort()).toEqual(['1', '2', '3']);
  });

  it('hace desaparecer la capa de burbujas con movimiento reducido', () => {
    // R14 — `display: none` explicito, y no una opacidad baja: `design-input-login.md > 4`
    // proponia dejarlas quietas al 22%, pero la tabla de decisiones cerradas de
    // `requirements.md` (posterior, y del humano) dice que DESAPARECEN. Ese insumo esta
    // superado: si alguien «arregla» esto hacia la opacidad, esta invirtiendo la decision.
    const bloque = bloqueQc30();

    const inicio = bloque.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(inicio).toBeGreaterThan(-1);

    const declaraciones = declaracionesDe(bloque.slice(inicio, finDelBloque(bloque, inicio)));
    const ocultaLaCapa = declaraciones.some(
      (declaracion) =>
        declaracion.selector.includes("[data-login='bubbles']") &&
        declaracion.texto.replace(/\s+/g, ' ') === 'display: none',
    );

    expect(ocultaLaCapa).toBe(true);
  });

  it('mantiene las medidas de 44px, 400px, 18px y 28px dentro del ambito del login', () => {
    // R16, R17 — cada declaracion que use una de esas medidas tiene que colgar de
    // `[data-login='screen']`; si una se escribe suelta, se filtra a toda la aplicacion.
    const medidas = ['44px', '400px', '18px', '28px'] as const;
    const declaraciones = declaracionesDe(bloqueQc30());

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
    const inicio = css.indexOf(INICIO_QC30);
    const fin = css.indexOf(FIN_QC30);
    const declaracionesFuera = declaracionesDe(
      css.slice(0, inicio) + css.slice(fin + FIN_QC30.length),
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

  it('reparte las burbujas con retardos negativos y ciclos de 17, 18 y 19 segundos', () => {
    // R12 — retardos negativos: al abrir la pantalla el movimiento ya esta repartido en altura.
    const bloque = bloqueQc30();

    for (const retardo of ['animation-delay: 0s', 'animation-delay: -7s', 'animation-delay: -13s']) {
      expect(bloque).toContain(retardo);
    }
    for (const duracion of [
      'animation-duration: 17s',
      'animation-duration: 18s',
      'animation-duration: 19s',
    ]) {
      expect(bloque).toContain(duracion);
    }
  });

  it('no redeclara el radio de campo y boton, ni el anillo de foco, ni la tipografia', () => {
    // R20 — la cara complementaria de «no altera las primitivas de components/ui»: alli se
    // afirma que `rounded-lg` y `focus-visible:ring-3` SIGUEN en el primitivo; aqui, que el
    // bloque de QC-30 no los pisa desde la hoja. Se recorren declaraciones y no texto plano:
    // el bloque SI declara `border-radius` sobre la tarjeta (18 px, R16) y sobre su cabecera y
    // su pie, y una busqueda de cadena no sabria distinguir esos de un radio de campo.
    const declaraciones = declaracionesDe(bloqueQc30());

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

  it('solo declara variables propias con prefijo --qc30-, salvo el espaciado de la tarjeta', () => {
    // R21 — la pantalla se pinta con los tokens de QC-29; el bloque no puede redefinir ninguno
    // (`--card`, `--background`, `--primary`, `--sidebar-*`, `--ring`, `--border`...) ni abrir
    // paleta nueva. Unica excepcion, explicita y acotada: `--card-spacing`, que se redefine a
    // proposito dentro del ambito `[data-login='screen']` para que los 28 px lleguen a
    // cabecera, contenido y pie sin editar `components/ui/card.tsx` (R19).
    const EXCEPCION = '--card-spacing';

    const personalizadas = declaracionesDe(bloqueQc30())
      .map((declaracion) => ({
        selector: declaracion.selector,
        propiedad: declaracion.texto.split(':')[0].trim(),
      }))
      .filter((declaracion) => declaracion.propiedad.startsWith('--'));

    expect(personalizadas.length).toBeGreaterThan(0);

    for (const declaracion of personalizadas) {
      if (declaracion.propiedad === EXCEPCION) {
        expect(declaracion.selector).toContain("[data-login='screen']");
        continue;
      }
      expect(declaracion.propiedad.startsWith('--qc30-')).toBe(true);
    }
  });

  it('deja los valores moviles de las burbujas en la base y los de escritorio en la media query', () => {
    // R22 — mobile-first de verdad: si los valores de escritorio fueran la base, la media query
    // de 640 px no tendria nada que sobrescribir hacia abajo y el telefono heredaria burbujas de
    // escritorio. Se afirma dentro y fuera del `@media` por separado; de paso, que los valores
    // esten en la hoja y no en un `style` en linea, que ganaria a cualquier media query.
    // Sin comentarios antes de buscar la media query: el bloque la MENCIONA en un comentario
    // varias reglas antes de declararla, y un `indexOf` sobre el texto crudo caeria ahi.
    const bloque = bloqueQc30().replace(/\/\*[\s\S]*?\*\//g, ' ');

    const inicioMedia = bloque.indexOf('@media (min-width: 640px)');
    expect(inicioMedia).toBeGreaterThan(-1);
    const finMedia = finDelBloque(bloque, inicioMedia);

    const dentroDelMedia = bloque.slice(inicioMedia, finMedia);
    const fueraDelMedia = bloque.slice(0, inicioMedia) + bloque.slice(finMedia);

    const textosDe = (fragmento: string, indice: string) =>
      declaracionesDe(fragmento)
        .filter((declaracion) => declaracion.selector.includes(`[data-login-index='${indice}']`))
        .map((declaracion) => declaracion.texto.replace(/\s+/g, ' '));

    const escritorio = [
      { indice: '1', posicion: 'left: 14%', tamano: '--qc30-bubble-size: 54px' },
      { indice: '2', posicion: 'left: 52%', tamano: '--qc30-bubble-size: 44px' },
      { indice: '3', posicion: 'left: 83%', tamano: '--qc30-bubble-size: 60px' },
    ] as const;
    for (const burbuja of escritorio) {
      const textos = textosDe(dentroDelMedia, burbuja.indice);
      expect(textos).toContain(burbuja.posicion);
      expect(textos).toContain(burbuja.tamano);
    }

    const movil = [
      { indice: '1', posicion: 'left: 10%', tamano: '--qc30-bubble-size: 46px' },
      { indice: '2', posicion: 'left: 48%', tamano: '--qc30-bubble-size: 38px' },
      { indice: '3', posicion: 'left: 78%', tamano: '--qc30-bubble-size: 52px' },
    ] as const;
    for (const burbuja of movil) {
      const textos = textosDe(fueraDelMedia, burbuja.indice);
      expect(textos).toContain(burbuja.posicion);
      expect(textos).toContain(burbuja.tamano);
    }
  });
});

/** El fragmento de `app/globals.css` que va entre los dos delimitadores de QC-30, ambos incluidos. */
function bloqueQc30(): string {
  const css = leerGlobalsCss();
  const inicio = css.indexOf(INICIO_QC30);
  const fin = css.indexOf(FIN_QC30);
  if (inicio === -1 || fin <= inicio) {
    throw new Error('el bloque delimitado de QC-30 no esta en app/globals.css');
  }
  return css.slice(inicio, fin + FIN_QC30.length);
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

  it('monta las tres burbujas como capa decorativa e inalcanzable por teclado', () => {
    // R13 — decorativa de verdad: fuera del arbol de accesibilidad y sin un solo nodo enfocable.
    render(<LoginPage />);

    const capa = document.querySelector<HTMLElement>('[data-login="bubbles"]');
    if (!capa) {
      throw new Error('la pagina de login no monto la capa de burbujas');
    }

    expect(capa).toHaveAttribute('aria-hidden', 'true');
    expect(capa.querySelectorAll('[data-login="bubble"]')).toHaveLength(3);

    for (const burbuja of capa.querySelectorAll('[data-login="bubble"]')) {
      expect(burbuja.hasAttribute('tabindex')).toBe(false);
    }

    expect(
      capa.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  it('coloca la capa de burbujas como hermana de la tarjeta y antes que ella', () => {
    // R13, R15 — el orden del DOM es lo que la deja por debajo (la tarjeta lleva `z-index: 2`).
    render(<LoginPage />);

    const main = screen.getByRole('main');
    const capa = document.querySelector<HTMLElement>('[data-login="bubbles"]');
    const tarjeta = document.querySelector<HTMLElement>('[data-slot="card"]');
    if (!capa || !tarjeta) {
      throw new Error('faltan la capa de burbujas o la tarjeta en la pantalla de login');
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

    expect(input).toContain('rounded-lg');
    expect(input).toContain('focus-visible:ring-3');
    expect(button).toContain('rounded-lg');
    expect(button).toContain('focus-visible:ring-3');
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
