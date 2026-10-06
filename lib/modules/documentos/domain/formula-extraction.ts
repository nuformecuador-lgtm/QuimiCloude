/**
 * Interpreta el texto que la IA dejo guardado para un archivo de formula, sin decidir si sus
 * valores son validos: eso lo hace la revision, porque solo asi se puede MOSTRAR el valor leido
 * y decir que fila esta mal en vez de descartarla.
 *
 * Cada campo de cada ingrediente se interpreta por separado (`catch(null)`): un tipo que no
 * encaja deja ESE campo en `null` y el ingrediente sobrevive. Solo dos motivos rechazan el
 * documento entero: que el texto no contenga ningun objeto JSON interpretable, o que
 * `ingredients`/`steps`/`packingSteps` no sean ni lista ni `null`. Un elemento de `ingredients` que no es un
 * objeto se descarta en silencio, igual que uno sin ningun campo con contenido.
 *
 * El porcentaje nunca se redondea: si el valor leido no cabe exacto en el patron aceptado, la
 * propuesta queda vacia y se conserva el valor leido tal cual para mostrarlo al lado.
 *
 * Dominio puro: `zod`, `extractJsonObject` y `stepTextToDocument`.
 */

import { z } from 'zod';

import type { RecipeStepDocument } from '@/lib/modules/recetas';
import { PERCENTAGE_PATTERN, percentageToHundredths } from '@/lib/modules/recetas';

import { extractJsonObject } from './json-in-text';
import { stepTextToDocument } from './formula-step-text';
import { ValidationError } from './errors';

const nullableString = z.string().nullable().catch(null);

/** `percentage` y `quantity` pueden llegar como cadena o como numero JSON; cualquier otro tipo
 *  se trata como ausente. */
const rawScalarSchema = z.union([z.string(), z.number()]).nullable().catch(null);

const ingredientSchema = z.object({
  name: nullableString,
  percentage: rawScalarSchema,
  quantity: rawScalarSchema,
  unit: nullableString,
});

export type ExtractedIngredient = {
  readonly name: string | null;
  /** Porcentaje propuesto: solo si lo leido casa con el patron aceptado. */
  readonly percentage: string | null;
  /** Lo que trajo la IA, sin tocar, para mostrarlo aunque la propuesta quede vacia. */
  readonly percentageRead: string | null;
  readonly quantity: string | null;
  readonly unit: string | null;
};

export type FormulaExtraction = {
  readonly name: string | null;
  readonly description: string | null;
  readonly ingredients: readonly ExtractedIngredient[];
  readonly steps: readonly RecipeStepDocument[];
  /** Separados de `steps`; ausente o `null` en el texto = `[]`. */
  readonly packingSteps: readonly RecipeStepDocument[];
};

function trimOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El motivo dice QUE fallo, sin volcar el texto entero de la IA. */
function diagnostico(reason: string): string {
  return `formula-extraction: no se pudo interpretar el texto de la formula (${reason})`;
}

function isValidPercentage(value: string): boolean {
  if (!PERCENTAGE_PATTERN.test(value)) return false;
  const hundredths = percentageToHundredths(value);
  return hundredths !== null && hundredths > BigInt(0) && hundredths <= BigInt(10000);
}

/**
 * Lee un porcentaje sin redondear: `value` es la propuesta (solo si es valida), `read` es
 * siempre el dato tal como llego, para que la fila lo muestre aunque la propuesta quede vacia.
 * Una cadena se recorta, se le quita un `%` final y, si trae una unica coma y ningun punto, la
 * coma pasa a punto antes de comprobar el patron; un numero JSON se acepta solo si su forma
 * decimal (`String(n)`) casa igual, sin exponente.
 */
export function readPercentage(raw: unknown): { value: string | null; read: string | null } {
  if (typeof raw === 'string') {
    const read = raw;
    let candidate = raw.trim();
    if (candidate.endsWith('%')) candidate = candidate.slice(0, -1).trim();
    const commas = candidate.split(',').length - 1;
    if (commas === 1 && !candidate.includes('.')) {
      candidate = candidate.replace(',', '.');
    }
    return { value: isValidPercentage(candidate) ? candidate : null, read };
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, read: null };
    const read = String(raw);
    return { value: isValidPercentage(read) ? read : null, read };
  }
  return { value: null, read: null };
}

/** `quantity` viaja solo como referencia: cadena recortada, o `String(n)` para un numero JSON. */
function readReference(raw: string | number | null): string | null {
  if (raw === null) return null;
  return trimOrNull(typeof raw === 'number' ? String(raw) : raw);
}

function extractIngredient(rawIngredient: Record<string, unknown>): ExtractedIngredient | null {
  const parsed = ingredientSchema.parse(rawIngredient);
  const name = trimOrNull(parsed.name);
  const { value: percentage, read: percentageRead } = readPercentage(parsed.percentage);
  const quantity = readReference(parsed.quantity);
  const unit = trimOrNull(parsed.unit);

  const isEmpty = name === null && percentage === null && percentageRead === null && quantity === null && unit === null;
  if (isEmpty) return null;

  return { name, percentage, percentageRead, quantity, unit };
}

function extractSteps(rawSteps: unknown[]): RecipeStepDocument[] {
  const steps: RecipeStepDocument[] = [];
  for (const rawStep of rawSteps) {
    if (typeof rawStep !== 'string') continue;
    const step = stepTextToDocument(rawStep);
    if (step !== null) steps.push(step);
  }
  return steps;
}

/** Interpreta el texto de la IA. Lanza `ValidationError` si no hay JSON interpretable. */
export function extractFormulaFromText(text: string): FormulaExtraction {
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

  const rawIngredients = parsed.ingredients;
  if (rawIngredients !== null && rawIngredients !== undefined && !Array.isArray(rawIngredients)) {
    throw new ValidationError(diagnostico("'ingredients' no es ni lista ni null"));
  }

  const rawSteps = parsed.steps;
  if (rawSteps !== null && rawSteps !== undefined && !Array.isArray(rawSteps)) {
    throw new ValidationError(diagnostico("'steps' no es ni lista ni null"));
  }

  const rawPackingSteps = parsed.packingSteps;
  if (rawPackingSteps !== null && rawPackingSteps !== undefined && !Array.isArray(rawPackingSteps)) {
    throw new ValidationError(diagnostico("'packingSteps' no es ni lista ni null"));
  }

  const name = trimOrNull(nullableString.parse(parsed.name ?? null));
  const description = trimOrNull(nullableString.parse(parsed.description ?? null));

  const ingredients = (rawIngredients ?? [])
    .filter(isPlainObject)
    .map(extractIngredient)
    .filter((ingredient): ingredient is ExtractedIngredient => ingredient !== null);

  const steps = extractSteps(rawSteps ?? []);
  const packingSteps = extractSteps(rawPackingSteps ?? []);

  return { name, description, ingredients, steps, packingSteps };
}
