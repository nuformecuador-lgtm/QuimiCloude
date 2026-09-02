// T7 — El destino de vuelta: ¿esta ruta es interna? (`design.md > 4.2`, R7, R9).
//
// Dominio puro: sin `next/*`, sin cookies, sin base de datos. Se ejercita con cadenas.
//
// Por que existe: sin `isInternalPath`, un enlace fabricado `/login?next=https://evil.example`
// sacaria al usuario del ERP **justo despues de autenticarse**, con la sesion recien creada. Es
// el agujero clasico de este patron (redirector abierto) y la decision cerrada D6 lo cierra.
// Todo lo que no sea claramente una ruta de este sitio se descarta EN SILENCIO y se cae al
// `fallback`: un destino de vuelta invalido no es un error que reportar al atacante, es un
// destino que no se usa.

/** Nombre del parametro de consulta que transporta el destino de vuelta (`design.md > 4.2`). */
export const RETURN_PARAM = 'next';

/** Caracteres de control (C0 y DEL): nunca aparecen en una ruta legitima. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/**
 * Forma sintactica de una ruta interna, aplicada sobre UN texto concreto. Acepta solo lo que:
 * empieza por una unica `/` (ni `//host`, que es una URL protocolo-relativa, ni `/\host`, que
 * varios navegadores normalizan a `//host`); no contiene `\` en ninguna posicion; no trae
 * esquema (`:` antes de la primera `/`, que cubre `javascript:`, `data:`, `http:`); y no lleva
 * caracteres de control.
 */
function hasInternalShape(value: string): boolean {
  if (value.length === 0) return false;
  if (CONTROL_CHARACTERS.test(value)) return false;
  if (value.includes('\\')) return false;

  const firstColon = value.indexOf(':');
  const firstSlash = value.indexOf('/');
  if (firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash)) return false;

  if (!value.startsWith('/')) return false;
  return !value.startsWith('//');
}

/**
 * `true` solo si el candidato es una ruta de este sitio (R9). Se comprueba dos veces: sobre el
 * texto recibido y sobre su `decodeURIComponent`, porque `%2F%2Fevil.example` tiene forma de
 * ruta interna hasta que alguien lo decodifica. Si el texto no decodifica —`%zz`—, tampoco es
 * una ruta y se rechaza; `decodeURIComponent` es la unica linea dentro del `try`.
 */
export function isInternalPath(candidate: string): boolean {
  if (!hasInternalShape(candidate)) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return false;
  }

  return hasInternalShape(decoded);
}

/**
 * Devuelve el candidato si es una ruta interna y el `fallback` en cualquier otro caso: ausente,
 * vacio, externo o indecodificable (R9). No lanza y no avisa: descartar en silencio es la
 * politica.
 */
export function resolveReturnPath(candidate: string | null | undefined, fallback: string): string {
  if (typeof candidate !== 'string') return fallback;
  return isInternalPath(candidate) ? candidate : fallback;
}

/**
 * URL de redireccion al login llevando la ruta pedida —camino y cadena de consulta— como
 * destino de vuelta (R7). La ruta se codifica entera con `encodeURIComponent`, para que su
 * propia query no se mezcle con la del login: `?desde=ayer` viajaria como un segundo parametro
 * del login si se concatenara en crudo.
 */
export function buildLoginRedirect(loginRoute: string, pathname: string, search: string): string {
  const destino = encodeURIComponent(`${pathname}${search}`);
  return `${loginRoute}?${RETURN_PARAM}=${destino}`;
}
