/**
 * Interpreta el texto que la IA dejo guardado para un archivo de catalogo, sin decidir si sus
 * valores son validos: eso lo hace quien clasifique, porque solo asi se puede MOSTRAR el valor
 * crudo y decir que campo esta mal en vez de descartar la fila entera.
 *
 * Cada campo de cada linea se interpreta por separado (`catch(null)`): un tipo que no encaja deja
 * ESE campo en `null` y la linea sobrevive. Solo dos motivos rechazan el documento entero: que
 * el texto no contenga ningun objeto JSON interpretable, o que su `lines` no sea ni lista ni
 * `null`. Un elemento de `lines` que no es un objeto se descarta en silencio.
 *
 * `cost`, `minPurchase` y el valor de cada medida viajan SOLO como cadena: tras `JSON.parse` un
 * numero ya paso por coma flotante y no hay forma de recuperar la cadena decimal original, asi que
 * se trata como vacio.
 *
 * Dominio puro: `zod` y `extractJsonObject`.
 */

import { z } from 'zod';

import { extractJsonObject } from './json-in-text';
import { ValidationError } from './errors';

const nullableString = z.string().nullable().catch(null);

/** `cost`, `minPurchase` y `measurements.*.value`: solo cadena, un numero JSON se trata como vacio. */
const decimalAsString = z.union([z.string(), z.null()]).catch(null);

const nullableInt = z.number().int().nullable().catch(null);

const measurementSchema = z
  .object({
    value: decimalAsString,
    unit: nullableString,
  })
  .nullable()
  .catch(null);

const measurementsSchema = z
  .object({
    diameter: measurementSchema,
    height: measurementSchema,
    mouth: nullableString,
  })
  .nullable()
  .catch(null);

const extractedLineSchema = z.object({
  name: nullableString,
  presentation: nullableString,
  unit: nullableString,
  cost: decimalAsString,
  minPurchase: decimalAsString,
  deliveryTime: nullableInt,
  material: nullableString,
  measurements: measurementsSchema,
  page: nullableInt,
});

export type ExtractedMeasurement = { value: string | null; unit: string | null } | null;

export type ExtractedMeasurements = {
  diameter: ExtractedMeasurement;
  height: ExtractedMeasurement;
  mouth: string | null;
} | null;

export type ExtractedLine = {
  name: string | null;
  presentation: string | null;
  unit: string | null;
  cost: string | null;
  minPurchase: string | null;
  deliveryTime: number | null;
  material: string | null;
  measurements: ExtractedMeasurements;
  page: number | null;
};

export type CatalogExtraction = { lines: ExtractedLine[] };

function trimOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trimMeasurement(measurement: ExtractedMeasurement): ExtractedMeasurement {
  if (measurement === null) return null;
  const value = trimOrNull(measurement.value);
  const unit = trimOrNull(measurement.unit);
  return { value, unit };
}

function trimLine(line: ExtractedLine): ExtractedLine {
  const measurements =
    line.measurements === null
      ? null
      : {
          diameter: trimMeasurement(line.measurements.diameter),
          height: trimMeasurement(line.measurements.height),
          mouth: trimOrNull(line.measurements.mouth),
        };
  return {
    ...line,
    name: trimOrNull(line.name),
    presentation: trimOrNull(line.presentation),
    unit: trimOrNull(line.unit),
    cost: trimOrNull(line.cost),
    minPurchase: trimOrNull(line.minPurchase),
    material: trimOrNull(line.material),
    measurements,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El motivo dice QUE fallo, sin volcar el texto entero de la IA. */
function diagnostico(reason: string): string {
  return `catalog-extraction: no se pudo interpretar el texto del catalogo (${reason})`;
}

/** Interpreta el texto de la IA. Lanza `ValidationError` si no hay JSON interpretable. */
export function extractCatalogFromText(text: string): CatalogExtraction {
  const candidate = extractJsonObject(text);
  if (candidate === null) {
    throw new ValidationError(diagnostico('no se encontro un objeto JSON en el texto'));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new ValidationError(diagnostico('el JSON extraido esta mal formado'));
  }

  if (!isPlainObject(parsed)) {
    throw new ValidationError(diagnostico('la raiz del JSON no es un objeto'));
  }

  const rawLines = parsed.lines;
  if (rawLines !== null && rawLines !== undefined && !Array.isArray(rawLines)) {
    throw new ValidationError(diagnostico("'lines' no es ni lista ni null"));
  }

  const lines = (rawLines ?? [])
    .filter(isPlainObject)
    .map((rawLine) => trimLine(extractedLineSchema.parse(rawLine)));

  return { lines };
}
