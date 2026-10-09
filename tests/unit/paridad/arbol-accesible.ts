/**
 * Serializa el arbol accesible del DOM renderizado para congelar el «antes» de una pantalla y
 * comprobar despues que la refactorizacion no lo cambia.
 *
 * Por elemento guarda la etiqueta, el rol (explicito o implicito), el nombre accesible, los
 * `aria-*`, el `data-testid`, los atributos que deciden comportamiento (`href`, `type`,
 * `disabled`, `data-code`, `data-missing`) y el conjunto ORDENADO de clases: dos listas con las mismas clases en
 * otro orden pintan lo mismo. Tambien guarda los textos, que son lo que lee un lector de pantalla.
 *
 * Los ids que genera `useId` (React y Base UI) cambian con el numero de componentes montados
 * antes, asi que se sustituyen por `<id>`: un componente nuevo por delante no es un cambio de DOM.
 * Del interior de un `svg` solo cuenta el propio `svg`: sus trazos no son parte del arbol
 * accesible y la clase del icono ya dice cual es.
 *
 * De las imagenes se guardan ademas `src`, `alt`, tamano, `style` y carga: un cambio ahi se ve,
 * aunque no cambie el nombre accesible.
 */

import { getRoles, queryAllByRole } from '@testing-library/dom';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

const ID_GENERADO = /«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/gi;

const ATRIBUTOS_DE_COMPORTAMIENTO = [
  'data-testid',
  'data-code',
  'data-missing',
  'href',
  'type',
  'disabled',
  'src',
  'alt',
  'width',
  'height',
  'style',
  'loading',
  'decoding',
];

const IGNORADOS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);

function normalizar(valor: string): string {
  return valor.replace(ID_GENERADO, '<id>').replace(/\s+/g, ' ').trim();
}

type Accesibilidad = {
  readonly roles: Map<Element, string[]>;
  readonly nombres: Map<Element, string>;
};

function calcularAccesibilidad(raiz: HTMLElement): Accesibilidad {
  // `getRoles` declara un solo argumento en sus tipos, pero acepta `{ hidden }`: con `hidden` se
  // incluyen los nodos ocultos y se evita pedir el estilo computado de cada uno.
  const porRol = (getRoles as (c: HTMLElement, o: { hidden: boolean }) => Record<string, HTMLElement[]>)(
    raiz,
    { hidden: true },
  );
  const roles = new Map<Element, string[]>();
  const nombres = new Map<Element, string>();

  for (const [rol, elementos] of Object.entries(porRol)) {
    for (const elemento of elementos) {
      roles.set(elemento, [...(roles.get(elemento) ?? []), rol].sort());
    }
    queryAllByRole(raiz, rol, {
      hidden: true,
      name: (nombre, elemento) => {
        if (nombre !== '') nombres.set(elemento, nombre);
        return true;
      },
    });
  }

  return { roles, nombres };
}

function describirElemento(elemento: Element, accesibilidad: Accesibilidad): string {
  const partes = [elemento.tagName.toLowerCase()];

  const roles = accesibilidad.roles.get(elemento);
  if (roles !== undefined) partes.push(`role=${roles.join('|')}`);

  const nombre = accesibilidad.nombres.get(elemento);
  if (nombre !== undefined) partes.push(`name=${JSON.stringify(normalizar(nombre))}`);

  const atributos = Array.from(elemento.attributes)
    .filter(
      (atributo) =>
        atributo.name.startsWith('aria-') || ATRIBUTOS_DE_COMPORTAMIENTO.includes(atributo.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const atributo of atributos) {
    partes.push(`${atributo.name}=${JSON.stringify(normalizar(atributo.value))}`);
  }

  const clases = Array.from(new Set(Array.from(elemento.classList))).sort();
  if (clases.length > 0) partes.push(`class=${JSON.stringify(clases.join(' '))}`);

  return partes.join(' ');
}

function serializar(nodo: Node, nivel: number, accesibilidad: Accesibilidad, lineas: string[]) {
  const sangria = '  '.repeat(nivel);

  if (nodo.nodeType === Node.TEXT_NODE) {
    const texto = normalizar(nodo.textContent ?? '');
    if (texto !== '') lineas.push(`${sangria}${JSON.stringify(texto)}`);
    return;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE) return;

  const elemento = nodo as Element;
  if (IGNORADOS.has(elemento.tagName)) return;

  lineas.push(`${sangria}${describirElemento(elemento, accesibilidad)}`);
  if (elemento.tagName.toLowerCase() === 'svg') return;

  for (const hijo of Array.from(elemento.childNodes)) {
    serializar(hijo, nivel + 1, accesibilidad, lineas);
  }
}

/**
 * El arbol accesible de `raiz` como texto, una linea por nodo. Por defecto, todo `document.body`:
 * asi entran tambien los portales (paneles, menus, avisos).
 */
export function arbolAccesible(raiz: HTMLElement = document.body): string {
  const accesibilidad = calcularAccesibilidad(raiz);
  const lineas: string[] = [];
  for (const hijo of Array.from(raiz.childNodes)) {
    serializar(hijo, 0, accesibilidad, lineas);
  }
  return `\n${lineas.join('\n')}\n`;
}

/**
 * El arbol accesible de `elemento` incluido el propio elemento. Los roles y nombres se calculan
 * desde su padre, porque las consultas por rol no miran el contenedor en el que buscan.
 */
export function arbolAccesibleDe(elemento: HTMLElement): string {
  const accesibilidad = calcularAccesibilidad(elemento.parentElement ?? elemento);
  const lineas: string[] = [];
  serializar(elemento, 0, accesibilidad, lineas);
  return `\n${lineas.join('\n')}\n`;
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente:
 * `react-dom` en jsdom no ejecuta un componente `async`. Se conserva el arbol real de la pagina,
 * con sus `<Suspense>` y sus `fallback`. Es el mismo utillaje que usan los tests de pagina.
 */
export async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  // Los hijos van sueltos: un array como tercer argumento es «una lista» para React y pediria
  // `key` a hijos que en el JSX original eran estaticos.
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

/** Una promesa que no se resuelve nunca: deja la seccion en vuelo y el `<Suspense>` en su `fallback`. */
export function nuncaResuelve<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}
