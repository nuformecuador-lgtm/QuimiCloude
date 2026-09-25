/**
 * La confirmacion de una importacion de formula: vuelve a leer el archivo y a validar EN EL
 * SERVIDOR todo lo que el navegador ya comprobo -no se fia de el-, y rechaza la
 * confirmacion entera si algo no cuadra, para no dejar una escritura parcial.
 *
 * El permiso de inventario solo se exige si de verdad hace falta crear alguna materia prima
 * nueva, y siempre ANTES de crearla: las materias primas creadas en una confirmacion cuya
 * receta falla despues pueden quedar creadas, y la siguiente confirmacion las reutiliza en
 * vez de duplicarlas.
 */
import { assertPermission } from '@/lib/modules/identity';
import {
  normalizeProductName,
  PRODUCT_TYPES,
  type ProductNameMatch,
} from '@/lib/modules/inventario';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  recipeStepSchema,
  type RecipeStepDocument,
} from '@/lib/modules/recetas';

import { requirePermission, FORMULA_IMPORT_PERMISSION, type Actor } from './actor';
import { confirmFormulaImportInputSchema, type ConfirmFormulaImportInput } from './formula-import-input';
import { UnauthorizedError, ValidationError } from './errors';
import { reviewFormulaImport, type DraftLine, type FormulaReviewIssues } from './review-formula-import';

import type { FormulaImportDeps } from './preview-formula-import';

export type FormulaImportSummary = {
  readonly recipeId: string;
  readonly outcome: 'created' | 'replaced';
  readonly rawMaterialsCreated: number;
  readonly rawMaterialsReused: number;
};

type ConfirmLineInput = ConfirmFormulaImportInput['lines'][number];

function toDraftLine(line: ConfirmLineInput): DraftLine {
  return line.kind === 'existing'
    ? { kind: 'existing', productId: line.productId, percentage: line.percentage }
    : { kind: 'new', newProductName: line.newProductName, percentage: line.percentage };
}

/** El motivo por fila, para el diagnostico del `ValidationError` -nunca para el navegador
 *  (`DocumentosError.diagnostic` no cruza a la respuesta), mismo patron que el catalogo. */
function diagnosticoDeRevision(issues: FormulaReviewIssues): string {
  const motivos: string[] = [];
  if (issues.noLines) motivos.push('sin lineas');
  if (!issues.isComplete) motivos.push(`suma ${issues.total} %`);
  if (issues.name !== 'ok') motivos.push(`nombre: ${issues.name}`);
  if (issues.description !== 'ok') motivos.push(`descripcion: ${issues.description}`);
  if (issues.steps !== 'ok') motivos.push(`pasos: ${issues.steps}`);
  for (const row of issues.rows) motivos.push(`fila ${row.index + 1}: ${row.problems.join(', ')}`);
  return `formula-import: revision invalida (${motivos.join('; ')})`;
}

/** Una materia prima nueva pedida por una fila, con su nombre normalizado para dedupe y para
 *  buscarla entre las vivas. */
type NewMaterialNeed = { readonly rowIndex: number; readonly rawName: string; readonly normalizedName: string };

function collectNewMaterialNeeds(lines: readonly ConfirmLineInput[]): readonly NewMaterialNeed[] {
  const needs: NewMaterialNeed[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== 'new') return;
    needs.push({ rowIndex: index, rawName: line.newProductName, normalizedName: normalizeProductName(line.newProductName) });
  });
  return needs;
}

export function createConfirmFormulaImport(
  deps: FormulaImportDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FormulaImportSummary> {
  return async function confirmFormulaImport(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FormulaImportSummary> {
    requirePermission(actor, FORMULA_IMPORT_PERMISSION);

    const parsed = confirmFormulaImportInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { documentFileId, name, description, lines, steps: rawSteps, replaceRecipeId } = parsed.data;

    const file = await deps.repository.readFileForReview(documentFileId, actor.companyId);
    if (file === null || file.status !== 'done' || file.strategy !== 'formula') {
      throw new ValidationError();
    }

    const issues = reviewFormulaImport({
      name,
      description,
      lines: lines.map(toDraftLine),
      steps: rawSteps as readonly RecipeStepDocument[],
    });
    if (!issues.canConfirm) throw new ValidationError(diagnosticoDeRevision(issues));

    // Los productos EXISTENTES elegidos, releidos del catalogo -nunca de lo que mando
    // el navegador-.
    const existingProductIds = lines
      .filter((line): line is Extract<ConfirmLineInput, { kind: 'existing' }> => line.kind === 'existing')
      .map((line) => line.productId);
    const resolvedProductIdByRow = new Map<number, string>();
    lines.forEach((line, index) => {
      if (line.kind === 'existing') resolvedProductIdByRow.set(index, line.productId);
    });

    if (existingProductIds.length > 0) {
      const refs = await deps.products.findRefs(existingProductIds, actor.companyId);
      const foundIds = new Set(refs.map((ref) => ref.id));
      const missing = existingProductIds.some((id) => !foundIds.has(id));
      if (missing) throw new ValidationError('formula-import: producto inexistente, de baja o de otra empresa');
      const finished = refs.some((ref) => ref.type === PRODUCT_TYPES.FINISHED_PRODUCT);
      if (finished) throw new ActionNotAllowedError();
    }

    // Las materias primas NUEVAS, resueltas por nombre normalizado -0 crea, 1 reutiliza, mas de
    // 1 rechaza-; la reutilizada tampoco puede coincidir con el producto que otra fila ya eligio.
    const existingProductIdSet = new Set(existingProductIds);
    const newMaterialNeeds = collectNewMaterialNeeds(lines);
    const distinctNormalizedNames = [...new Set(newMaterialNeeds.map((need) => need.normalizedName))];
    const foundByName =
      distinctNormalizedNames.length === 0
        ? []
        : await deps.productNames.findAliveByNormalizedNames(distinctNormalizedNames, actor.companyId);
    const matchesByNormalizedName = new Map<string, ProductNameMatch[]>();
    for (const match of foundByName) {
      const list = matchesByNormalizedName.get(match.nameNormalized) ?? [];
      list.push(match);
      matchesByNormalizedName.set(match.nameNormalized, list);
    }

    const toCreate: NewMaterialNeed[] = [];
    let rawMaterialsReused = 0;
    for (const need of newMaterialNeeds) {
      const candidates = matchesByNormalizedName.get(need.normalizedName) ?? [];
      const eligible = candidates.filter((candidate) => candidate.type !== PRODUCT_TYPES.FINISHED_PRODUCT);
      if (eligible.length > 1) {
        throw new ValidationError('formula-import: mas de un producto vivo con el nombre de una materia prima nueva');
      }
      if (eligible.length === 1) {
        const reused = eligible[0] as ProductNameMatch;
        if (existingProductIdSet.has(reused.id)) {
          throw new ValidationError('formula-import: la materia prima reutilizada coincide con otra fila');
        }
        resolvedProductIdByRow.set(need.rowIndex, reused.id);
        rawMaterialsReused += 1;
      } else {
        toCreate.push(need);
      }
    }

    // El choque contra el nombre CONFIRMADO, no el leido.
    const clash = await deps.recipes.findAliveByNormalizedName(name, actor.companyId);
    if (clash !== null) {
      if (replaceRecipeId === null || replaceRecipeId !== clash.id) throw new RecipeDuplicateNameError();
    } else if (replaceRecipeId !== null) {
      const refs = await deps.recipes.findRefsIncludingDeleted([replaceRecipeId], actor.companyId);
      const ref = refs[0];
      if (ref !== undefined && !ref.isDeleted) throw new ValidationError('formula-import: la receta a reemplazar ya no tiene ese nombre');
      throw new RecipeNotFoundError();
    }

    // El permiso de inventario, SOLO si de verdad hace falta crear, y ANTES de crear.
    if (toCreate.length > 0) {
      assertPermission(actor, 'inventario.modificar', () => new UnauthorizedError());
    }

    let rawMaterialsCreated = 0;
    for (const need of toCreate) {
      const created = await deps.createRawMaterial({ name: need.rawName }, actor);
      resolvedProductIdByRow.set(need.rowIndex, created.id);
      rawMaterialsCreated += 1;
    }

    const finalLines = lines.map((line, index) => ({
      productId: resolvedProductIdByRow.get(index) as string,
      percentage: line.percentage,
    }));
    const finalSteps = rawSteps.map((step) => recipeStepSchema.parse(step));

    // SIN `image`: el import de formula no toca la imagen de la receta.
    if (clash !== null) {
      const result = await deps.updateRecipe(
        clash.id,
        { name: clash.name, description, steps: finalSteps, lines: finalLines },
        actor,
      );
      return { recipeId: result.id, outcome: 'replaced', rawMaterialsCreated, rawMaterialsReused };
    }

    const result = await deps.createRecipe({ name, description, steps: finalSteps, lines: finalLines }, actor);
    return { recipeId: result.id, outcome: 'created', rawMaterialsCreated, rawMaterialsReused };
  };
}
