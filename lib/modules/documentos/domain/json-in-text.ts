/**
 * Saca la subcadena que parece un objeto JSON de un texto libre.
 *
 * Los modelos envuelven el JSON en prosa o en vallas de codigo, asi que la extraccion es
 * deliberadamente tonta: quitar vallas si las hay, y tomar la subcadena entre el primer `{` y el
 * ultimo `}`. No valida forma ni contenido: eso lo decide quien reciba el resultado.
 *
 * Compartida por `crop-coordinates.ts` y por la interpretacion del catalogo.
 *
 * Dominio puro: sin imports externos.
 */

const CODE_FENCE = /```[a-zA-Z]*\n?|```/g;

function stripCodeFences(text: string): string {
  return text.replace(CODE_FENCE, '');
}

/** La subcadena entre el primer `{` y el ultimo `}` de `text`, sin vallas de codigo, o `null` si no hay ninguno de los dos. */
export function extractJsonObject(text: string): string | null {
  const sinVallas = stripCodeFences(text);
  const start = sinVallas.indexOf('{');
  const end = sinVallas.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return sinVallas.slice(start, end + 1);
}
