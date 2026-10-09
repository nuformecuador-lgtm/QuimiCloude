'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import type { FocusEvent } from 'react';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  confirmFormulaImportAction,
  previewFormulaImportAction,
} from '@/lib/modules/documentos/adapters/driving/formula-import-actions';
import {
  reviewFormulaImport,
  type ConfirmFormulaImportInput,
  type DraftLine,
  type FormulaImportPreview,
  type FormulaImportPreviewIngredient,
  type FormulaImportSummary as FormulaImportSummaryData,
  type FormulaReviewIssues,
  type RowProblem,
} from '@/lib/modules/documentos';
import type { ErrorState } from '@/lib/modules/errores';
import { createRecipeSchema, formatPercentage } from '@/lib/modules/recetas';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import {
  createLocalKey,
  RecipeStepsField,
  type ProductPickerOption,
  type RecipeStepFormValue,
} from '../../../components';

import { FormulaImportSummary } from './formula-import-summary';
import { FormulaIngredientRow } from './formula-ingredient-row';
import { FormulaNameClash } from './formula-name-clash';

const FIELD_TEXT = 'text-base';

const PACKING_STEPS_TITLE = 'Pasos de envasado';
const PACKING_STEPS_ADD_LABEL = 'Añadir paso de envasado';
const PACKING_STEPS_TESTID_PREFIX = 'recipe-packing-step';

/** Modo de asignacion de producto de una fila, distinto del `kind` de `DraftLine`: una fila
 *  `preselected` sigue siendo `existing` para el borrador, pero se pinta sin selector. */
export type IngredientRowMode = 'preselected' | 'choose' | 'create';

/** El estado de UNA fila de la revision, en forma de FORMULARIO: separa lo leido (informativo,
 *  nunca editado) de lo que el revisor elige o corrige. */
export type IngredientRowState = {
  readonly key: string;
  readonly readName: string | null;
  /** Porcentaje editable, con COMA (la misma convencion que `RecipeLinesField`); vacio = sin
   *  proponer. Se convierte a punto solo al construir el borrador o la confirmacion. */
  readonly percentage: string;
  readonly percentageRead: string | null;
  readonly quantityRead: string | null;
  readonly unitRead: string | null;
  readonly mode: IngredientRowMode;
  /** Producto elegido (preseleccionado o por el selector). Cadena vacia = ninguno. */
  readonly productId: string;
  readonly productLabel: string;
  /** Nombre editable de la materia prima a crear, precargado con el leido. */
  readonly newProductName: string;
  /** Cuantos productos vivos coinciden con el nombre leido cuando `match.kind === 'several'`. */
  readonly severalCount: number | null;
};

function percentageToDraft(percentage: string): string | null {
  const trimmed = percentage.trim();
  return trimmed === '' ? null : trimmed.replace(',', '.');
}

/** La fila inicial de un ingrediente leido, con el modo que le corresponde segun `match`. */
function toIngredientRowState(ingredient: FormulaImportPreviewIngredient, index: number): IngredientRowState {
  const base = {
    key: `formula-ingredient-${index}`,
    readName: ingredient.readName,
    percentage: ingredient.percentage === null ? '' : ingredient.percentage.replace('.', ','),
    percentageRead: ingredient.percentageRead,
    quantityRead: ingredient.quantityRead,
    unitRead: ingredient.unitRead,
    newProductName: ingredient.readName ?? '',
  };

  if (ingredient.match.kind === 'one') {
    return {
      ...base,
      mode: 'preselected',
      productId: ingredient.match.productId,
      productLabel: ingredient.match.productName,
      severalCount: null,
    };
  }

  if (ingredient.match.kind === 'several') {
    return { ...base, mode: 'choose', productId: '', productLabel: '', severalCount: ingredient.match.count };
  }

  // Sin ninguna coincidencia: se OFRECE crear la materia prima con el nombre leido, sin
  // forzar la eleccion -el revisor puede cambiar a "elegir producto" en su lugar.
  return { ...base, mode: 'create', productId: '', productLabel: '', severalCount: null };
}

/** Una fila anadida a mano: sin nombre leido, arranca pidiendo elegir un producto. */
function blankIngredientRow(): IngredientRowState {
  return {
    key: createLocalKey('formula-ingredient'),
    readName: null,
    percentage: '',
    percentageRead: null,
    quantityRead: null,
    unitRead: null,
    mode: 'choose',
    productId: '',
    productLabel: '',
    newProductName: '',
    severalCount: null,
  };
}

function toDraftLine(row: IngredientRowState): DraftLine {
  const percentage = percentageToDraft(row.percentage);
  if (row.mode === 'create') return { kind: 'new', newProductName: row.newProductName, percentage };
  if (row.productId !== '') return { kind: 'existing', productId: row.productId, percentage };
  return { kind: 'unassigned', percentage };
}

function toConfirmLine(row: IngredientRowState): ConfirmFormulaImportInput['lines'][number] {
  const percentage = percentageToDraft(row.percentage) ?? '';
  if (row.mode === 'create') return { kind: 'new', newProductName: row.newProductName, percentage };
  return { kind: 'existing', productId: row.productId, percentage };
}

const ROW_PROBLEM_LABELS: Record<RowProblem, string> = {
  unassigned: 'sin producto asignado',
  percentage_missing: 'porcentaje vacío',
  percentage_invalid: 'porcentaje inválido (mayor que 0, hasta 2 decimales)',
  new_name_invalid: 'nombre de materia prima inválido',
  repeated: 'ingrediente repetido',
};

/** Los motivos que impiden confirmar, nombrando las filas afectadas. */
function buildConfirmReasons(
  issues: FormulaReviewIssues,
  nameClash: FormulaImportPreview['nameClash'],
  replaceChoice: 'replace' | null,
  isCheckingName: boolean,
): readonly string[] {
  const reasons: string[] = [];

  if (issues.noLines) reasons.push('Añade al menos un ingrediente.');

  for (const row of issues.rows) {
    reasons.push(`Fila ${row.index + 1}: ${row.problems.map((problem) => ROW_PROBLEM_LABELS[problem]).join(', ')}.`);
  }

  if (!issues.noLines && !issues.isComplete) {
    reasons.push(`La suma de porcentajes es ${formatPercentage(issues.total)} %, debe ser exactamente 100,00 %.`);
  }

  if (issues.name === 'empty') reasons.push('El nombre es obligatorio.');
  else if (issues.name === 'too_long') reasons.push('El nombre supera 120 caracteres.');
  else if (issues.name === 'normalizes_empty') reasons.push('El nombre no puede quedar vacío.');

  if (issues.description === 'too_long') reasons.push('La descripción supera 500 caracteres.');

  if (issues.steps === 'too_many') reasons.push('Hay más de 50 pasos.');
  else if (issues.steps === 'invalid') reasons.push('Revisa los pasos: alguno no es válido.');

  if (issues.packingSteps === 'too_many') reasons.push('Hay más de 50 pasos de envasado.');
  else if (issues.packingSteps === 'invalid') reasons.push('Revisa los pasos de envasado: alguno no es válido.');

  if (nameClash !== null && replaceChoice === null) {
    reasons.push(`Elige reemplazar o cambiar el nombre de «${nameClash.recipeName}».`);
  }

  if (isCheckingName) reasons.push('Comprobando el nombre…');

  return reasons;
}

type FormulaImportReviewProps = {
  readonly documentFileId: string;
  readonly units: readonly UnitRef[];
  readonly initialProductPage: { readonly items: readonly ProductPickerOption[]; readonly totalPages: number };
  readonly preview: FormulaImportPreview;
};

/**
 * La revision de una importacion de formula: nombre y descripcion, una tarjeta por ingrediente,
 * los pasos con `RecipeStepsField` tal cual, y el aviso de choque de nombre.
 *
 * `reviewFormulaImport` -la misma funcion PURA que usa el servidor- se llama en cada cambio para
 * habilitar «Confirmar» sin ir y volver; el choque de nombre lo anade este componente
 * porque solo el servidor puede comprobarlo contra la base.
 */
export function FormulaImportReview({ documentFileId, units, initialProductPage, preview }: FormulaImportReviewProps) {
  const [name, setName] = useState(preview.name ?? '');
  const [description, setDescription] = useState(preview.description ?? '');
  const [rows, setRows] = useState<readonly IngredientRowState[]>(() => preview.ingredients.map(toIngredientRowState));
  const [steps, setSteps] = useState<readonly RecipeStepFormValue[]>(() =>
    preview.steps.map((document) => ({ key: createLocalKey('formula-step'), document })),
  );
  const [packingSteps, setPackingSteps] = useState<readonly RecipeStepFormValue[]>(() =>
    preview.packingSteps.map((document) => ({ key: createLocalKey('formula-packing-step'), document })),
  );
  const [nameClash, setNameClash] = useState(preview.nameClash);
  const [replaceChoice, setReplaceChoice] = useState<'replace' | null>(null);
  const [isCheckingName, startCheckingName] = useTransition();
  // Cuenta la comprobacion de choque mas reciente: si dos se disparan seguidas, la respuesta de
  // la primera puede llegar despues y no debe pisar lo que ya trajo la segunda.
  const clashCheckSeqRef = useRef(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<FormulaImportSummaryData | null>(null);
  const [confirmError, setConfirmError] = useState<ErrorState | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const issues = useMemo(
    () =>
      reviewFormulaImport({
        name,
        description: description.trim() === '' ? null : description,
        lines: rows.map(toDraftLine),
        steps: steps.map((step) => step.document),
        packingSteps: packingSteps.map((step) => step.document),
      }),
    [name, description, rows, steps, packingSteps],
  );

  const reasons = useMemo(
    () => buildConfirmReasons(issues, nameClash, replaceChoice, isCheckingName),
    [issues, nameClash, replaceChoice, isCheckingName],
  );

  const canConfirm = issues.canConfirm && reasons.length === 0;

  function updateRow(index: number, patch: Partial<IngredientRowState>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((current) => [...current, blankIngredientRow()]);
  }

  function handleNameChange(value: string) {
    setName(value);
    // El choque quedo atado a un nombre concreto: si el revisor sigue escribiendo, la eleccion
    // anterior ya no aplica hasta que se vuelva a comprobar.
    setReplaceChoice(null);
  }

  function handleNameBlur(event: FocusEvent<HTMLInputElement>) {
    // El DOM manda: si el revisor escribio antes de que React hidratara, `onChange` nunca vio
    // esas pulsaciones y el estado se quedo atras del valor que se ve en pantalla.
    const domValue = event.currentTarget.value;
    if (domValue !== name) {
      setName(domValue);
      setReplaceChoice(null);
    }

    // Un nombre ya invalido para reviewFormulaImport no puede chocar con nada: no vale la pena
    // recomprobarlo, y evita disparar la accion con un valor que el servidor igual rechazaria.
    if (createRecipeSchema.shape.name.safeParse(domValue).success !== true) return;

    const requestId = ++clashCheckSeqRef.current;
    startCheckingName(async () => {
      let result: Awaited<ReturnType<typeof previewFormulaImportAction>>;
      try {
        result = await previewFormulaImportAction({ documentFileId, name: domValue });
      } catch {
        return;
      }
      if (requestId !== clashCheckSeqRef.current) return;
      if (result.status === 'success') setNameClash(result.data.nameClash);
    });
  }

  function handleReplace() {
    setReplaceChoice('replace');
  }

  function handleRename() {
    setReplaceChoice(null);
    nameInputRef.current?.focus();
  }

  async function handleConfirm() {
    if (!canConfirm || isConfirming) return;

    setConfirmError(null);
    setIsConfirming(true);

    const result = await confirmFormulaImportAction({
      documentFileId,
      name,
      description: description.trim() === '' ? null : description,
      lines: rows.map(toConfirmLine),
      steps: steps.map((step) => step.document),
      packingSteps: packingSteps.map((step) => step.document),
      replaceRecipeId: nameClash !== null && replaceChoice === 'replace' ? nameClash.recipeId : null,
    });

    setIsConfirming(false);

    if (result.status === 'success') {
      setSummary(result.data);
      return;
    }

    setConfirmError(result);
  }

  if (summary !== null) {
    return <FormulaImportSummary summary={summary} />;
  }

  const usedProductIds = rows.flatMap((row) => (row.productId === '' ? [] : [row.productId]));

  return (
    <div className="flex flex-col gap-6" data-testid="formula-import-review">
      <div className="flex flex-col gap-4 sm:max-w-xl">
        <div className="flex flex-col gap-1">
          <Label htmlFor="formula-import-name-input">Nombre</Label>
          <Input
            id="formula-import-name-input"
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            onBlur={handleNameBlur}
            className={`${touchTarget} ${FIELD_TEXT}`}
            aria-invalid={issues.name === 'ok' ? undefined : true}
            data-testid="formula-import-name"
          />
          {issues.name === 'ok' ? null : (
            <p className="text-sm text-destructive" data-testid="formula-import-name-error">
              {issues.name === 'empty'
                ? 'El nombre es obligatorio.'
                : issues.name === 'too_long'
                  ? 'El nombre supera 120 caracteres.'
                  : 'El nombre no puede quedar vacío.'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="formula-import-description-input">Descripción</Label>
          <Textarea
            id="formula-import-description-input"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${touchTarget} ${FIELD_TEXT}`}
            aria-invalid={issues.description === 'ok' ? undefined : true}
            data-testid="formula-import-description"
          />
          {issues.description === 'ok' ? null : (
            <p className="text-sm text-destructive" data-testid="formula-import-description-error">
              La descripción supera 500 caracteres.
            </p>
          )}
        </div>
      </div>

      {nameClash === null ? null : (
        <FormulaNameClash recipeName={nameClash.recipeName} onReplace={handleReplace} onRename={handleRename} />
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <FormulaIngredientRow
            key={row.key}
            index={index}
            row={row}
            problems={issues.rows.find((item) => item.index === index)?.problems ?? []}
            units={units}
            initialProductPage={initialProductPage}
            excludedIds={usedProductIds.filter((id) => id !== row.productId)}
            onChange={(patch) => updateRow(index, patch)}
            onRemove={() => removeRow(index)}
          />
        ))}
      </div>

      <div>
        <Button type="button" touch onClick={addRow} data-testid="formula-import-add-ingredient">
          Añadir ingrediente
        </Button>
      </div>

      <p className="text-sm font-medium" data-testid="formula-import-sum">
        Suma: {formatPercentage(issues.total)} %
      </p>

      {/* `RecipeStepsField` se importa TAL CUAL del barrel de formulas: no se toca. */}
      <RecipeStepsField steps={steps} onChange={setSteps} />

      <RecipeStepsField
        steps={packingSteps}
        onChange={setPackingSteps}
        title={PACKING_STEPS_TITLE}
        addLabel={PACKING_STEPS_ADD_LABEL}
        testIdPrefix={PACKING_STEPS_TESTID_PREFIX}
      />

      {confirmError === null ? null : (
        <ErrorAlert
          error={confirmError}
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          testId="formula-import-confirm-error"
          renderCatalogued={(catalogued) => (
            <>
              <p data-testid="formula-import-confirm-error-message">{catalogued.message}</p>
              <p className="text-xs" data-testid="formula-import-confirm-error-code">
                {catalogued.code}
              </p>
            </>
          )}
        />
      )}

      {reasons.length === 0 ? null : (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive" data-testid="formula-import-reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          touch
          disabled={!canConfirm || isConfirming}
          aria-busy={isConfirming}
          onClick={handleConfirm}
          data-testid="formula-import-confirm"
        >
          {isConfirming ? 'Confirmando…' : 'Confirmar'}
        </Button>
      </div>
    </div>
  );
}
