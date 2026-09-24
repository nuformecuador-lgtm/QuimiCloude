/**
 * Saca el JSON de las coordenadas del texto que devolvio la IA y lo valida.
 *
 * Los modelos envuelven el JSON en prosa o en vallas de codigo, asi que la extraccion es
 * deliberadamente tonta: quitar vallas si las hay, tomar la subcadena entre el primer `{` y el
 * ultimo `}`, y parsear. Cualquiera de los cuatro pasos puede fallar, y los cuatro fallos dan el
 * MISMO resultado: no hay forma de que el resto del sistema distinga «no vino JSON» de «vino JSON
 * pero no encaja», porque para el archivo el desenlace es identico.
 *
 * Dominio puro: `zod` y el propio esquema de la region.
 */

import { cropCoordinatesSchema, type CropCoordinates } from './crop-region';
import { ValidationError } from './errors';

const CODE_FENCE = /```[a-zA-Z]*\n?|```/g;

function stripCodeFences(text: string): string {
  return text.replace(CODE_FENCE, '');
}

/** La subcadena entre el primer `{` y el ultimo `}`, o `null` si no hay ninguno de los dos. */
function sliceJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/** El motivo dice QUE fallo y SOBRE QUE ruta, sin volcar el texto entero de la IA. */
function diagnostico(reason: string, path: string): string {
  return `crop-coordinates: no se pudieron interpretar las coordenadas sobre '${path}' (${reason})`;
}

/** Extrae y valida las coordenadas del texto de la IA. Lanza `ValidationError` si algo no encaja. */
export function extractCropCoordinates(text: string, path: string): CropCoordinates {
  const candidate = sliceJsonObject(stripCodeFences(text));
  if (candidate === null) {
    throw new ValidationError(diagnostico('no se encontro un objeto JSON en el texto', path));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new ValidationError(diagnostico('el JSON extraido esta mal formado', path));
  }

  const result = cropCoordinatesSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(diagnostico('el JSON no encaja con el esquema de regiones', path));
  }

  return result.data;
}
