/**
 * Saca el JSON de las coordenadas del texto que devolvio la IA y lo valida.
 *
 * La extraccion del objeto JSON es deliberadamente tonta (`extractJsonObject`, compartida con la
 * interpretacion del catalogo); lo propio de este archivo es parsearlo y validarlo contra el
 * esquema de la region. Cualquiera de los pasos puede fallar, y todos los fallos dan el MISMO
 * resultado: no hay forma de que el resto del sistema distinga «no vino JSON» de «vino JSON pero
 * no encaja», porque para el archivo el desenlace es identico.
 *
 * Dominio puro: `zod`, el propio esquema de la region y `json-in-text`.
 */

import { extractJsonObject } from './json-in-text';
import { cropCoordinatesSchema, type CropCoordinates } from './crop-region';
import { ValidationError } from './errors';

/** El motivo dice QUE fallo y SOBRE QUE ruta, sin volcar el texto entero de la IA. */
function diagnostico(reason: string, path: string): string {
  return `crop-coordinates: no se pudieron interpretar las coordenadas sobre '${path}' (${reason})`;
}

/** Extrae y valida las coordenadas del texto de la IA. Lanza `ValidationError` si algo no encaja. */
export function extractCropCoordinates(text: string, path: string): CropCoordinates {
  const candidate = extractJsonObject(text);
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
