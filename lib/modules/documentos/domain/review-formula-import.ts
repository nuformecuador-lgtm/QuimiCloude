/**
 * Reglas de la revision de una fórmula: puras, sin base de datos ni framework, para que las use
 * tanto el servidor (vista previa y confirmacion) como la pantalla, sin ir y volver, para
 * habilitar «Confirmar».
 *
 * Reutiliza, campo a campo, lo que ya valida el alta de receta (`createRecipeSchema`,
 * `recipeStepSchema`) y la aritmetica de porcentaje de `recetas`: ningun patron se reescribe
 * aqui. El nombre de una materia prima nueva usa el mismo tope que publica `inventario`.
 *
 * El choque de nombre con una receta existente NO se decide aqui: lo añade quien llama, porque
 * solo el servidor puede comprobarlo contra la base.
 */

import type { RecipeStepDocument } from '@/lib/modules/recetas';
import {
  createRecipeSchema,
  MAX_RECIPE_STEPS,
  PERCENTAGE_PATTERN,
  percentageToHundredths,
  recipeStepSchema,
  sumPercentages,
} from '@/lib/modules/recetas';
import { normalizeProductName, PRODUCT_NAME_MAX_LENGTH } from '@/lib/modules/inventario';

export type DraftLine =
  | { readonly kind: 'existing'; readonly productId: string; readonly percentage: string | null }
  | { readonly kind: 'new'; readonly newProductName: string; readonly percentage: string | null }
  | { readonly kind: 'unassigned'; readonly percentage: string | null };

export type FormulaDraft = {
  readonly name: string;
  readonly description: string | null;
  readonly lines: readonly DraftLine[];
  readonly steps: readonly RecipeStepDocument[];
};

export type RowProblem =
  | 'unassigned'
  | 'percentage_missing'
  | 'percentage_invalid'
  | 'new_name_invalid'
  | 'repeated';

export type FormulaReviewIssues = {
  readonly total: string;
  readonly isComplete: boolean;
  readonly noLines: boolean;
  readonly rows: readonly { readonly index: number; readonly problems: readonly RowProblem[] }[];
  readonly name: 'ok' | 'empty' | 'too_long' | 'normalizes_empty';
  readonly description: 'ok' | 'too_long';
  readonly steps: 'ok' | 'too_many' | 'invalid';
  readonly canConfirm: boolean;
};

function nameStatus(name: string): FormulaReviewIssues['name'] {
  const result = createRecipeSchema.shape.name.safeParse(name);
  if (result.success) return 'ok';
  const issue = result.error.issues[0];
  if (issue?.code === 'too_small') return 'empty';
  if (issue?.code === 'too_big') return 'too_long';
  return 'normalizes_empty';
}

function descriptionStatus(description: string | null): FormulaReviewIssues['description'] {
  const result = createRecipeSchema.shape.description.safeParse(description);
  return result.success ? 'ok' : 'too_long';
}

function stepsStatus(steps: readonly RecipeStepDocument[]): FormulaReviewIssues['steps'] {
  if (steps.length > MAX_RECIPE_STEPS) return 'too_many';
  const allValid = steps.every((step) => recipeStepSchema.safeParse(step).success);
  return allValid ? 'ok' : 'invalid';
}

function percentageProblem(percentage: string | null): RowProblem | null {
  if (percentage === null) return 'percentage_missing';
  if (!PERCENTAGE_PATTERN.test(percentage)) return 'percentage_invalid';
  const hundredths = percentageToHundredths(percentage);
  if (hundredths === null || hundredths <= BigInt(0) || hundredths > BigInt(10000)) {
    return 'percentage_invalid';
  }
  return null;
}

function isValidNewName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= PRODUCT_NAME_MAX_LENGTH;
}

/** Clave de identidad de una fila para detectar repetidas (R16): el mismo producto elegido, o
 *  el mismo nombre normalizado pedido como materia prima nueva. Una fila sin producto asignado
 *  no compite por ninguna clave. */
function lineKey(line: DraftLine): string | null {
  if (line.kind === 'existing') return `existing:${line.productId}`;
  if (line.kind === 'new') return `new:${normalizeProductName(line.newProductName)}`;
  return null;
}

function repeatedIndices(lines: readonly DraftLine[]): ReadonlySet<number> {
  const indicesByKey = new Map<string, number[]>();
  lines.forEach((line, index) => {
    const key = lineKey(line);
    if (key === null) return;
    const indices = indicesByKey.get(key) ?? [];
    indices.push(index);
    indicesByKey.set(key, indices);
  });

  const repeated = new Set<number>();
  for (const indices of indicesByKey.values()) {
    if (indices.length > 1) indices.forEach((index) => repeated.add(index));
  }
  return repeated;
}

function lineProblems(line: DraftLine, index: number, repeated: ReadonlySet<number>): RowProblem[] {
  const problems: RowProblem[] = [];
  if (line.kind === 'unassigned') problems.push('unassigned');

  const percentageIssue = percentageProblem(line.percentage);
  if (percentageIssue !== null) problems.push(percentageIssue);

  if (line.kind === 'new' && !isValidNewName(line.newProductName)) {
    problems.push('new_name_invalid');
  }

  if (repeated.has(index)) problems.push('repeated');

  return problems;
}

export function reviewFormulaImport(draft: FormulaDraft): FormulaReviewIssues {
  const total = sumPercentages(draft.lines.map((line) => line.percentage ?? ''));
  const noLines = draft.lines.length === 0;
  const repeated = repeatedIndices(draft.lines);

  const rows = draft.lines
    .map((line, index) => ({ index, problems: lineProblems(line, index, repeated) }))
    .filter((row) => row.problems.length > 0);

  const name = nameStatus(draft.name);
  const description = descriptionStatus(draft.description);
  const steps = stepsStatus(draft.steps);

  const canConfirm =
    !noLines && rows.length === 0 && total.isComplete && name === 'ok' && description === 'ok' && steps === 'ok';

  return { total: total.total, isComplete: total.isComplete, noLines, rows, name, description, steps, canConfirm };
}
