'use client';

import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RowProblem } from '@/lib/modules/documentos';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { ProductPicker, sanitizePercentageInput, type ProductPickerOption } from '../../../components';

import type { IngredientRowState } from './formula-import-review';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';

const ROW_PROBLEM_LABELS: Record<RowProblem, string> = {
  unassigned: 'sin producto asignado',
  percentage_missing: 'porcentaje vacío',
  percentage_invalid: 'porcentaje inválido',
  new_name_invalid: 'nombre de materia prima inválido',
  repeated: 'ingrediente repetido',
};

/** «20 kg», «20» o «kg», segun lo que trajo el PDF; `null` si no hay nada que mostrar (R8). */
function referenceText(quantityRead: string | null, unitRead: string | null): string | null {
  const parts = [quantityRead, unitRead].filter((part): part is string => part !== null && part !== '');
  return parts.length === 0 ? null : parts.join(' ');
}

type FormulaIngredientRowProps = {
  readonly index: number;
  readonly row: IngredientRowState;
  readonly problems: readonly RowProblem[];
  readonly units: readonly UnitRef[];
  readonly initialProductPage: { readonly items: readonly ProductPickerOption[]; readonly totalPages: number };
  /** Productos ya elegidos en OTRAS filas: se apartan del selector (mismo criterio que las
   *  lineas de receta, aunque aqui NO es un requisito -R16 ya marca la fila repetida-, es solo
   *  para no invitar a repetir por accidente). */
  readonly excludedIds: readonly string[];
  readonly onChange: (patch: Partial<IngredientRowState>) => void;
  readonly onRemove: () => void;
};

/**
 * Una tarjeta por ingrediente leido (R10): nombre leido, porcentaje editable con su «leido: …»
 * y su referencia de cantidad/unidad (R7, R8), y el producto asignado en uno de TRES modos
 * (R11, R12): preseleccionado, elegir un producto existente o crear una materia prima con el
 * nombre editable. `Quitar` retira la fila entera.
 */
export function FormulaIngredientRow({
  index,
  row,
  problems,
  units,
  initialProductPage,
  excludedIds,
  onChange,
  onRemove,
}: FormulaIngredientRowProps) {
  const fieldId = useId();
  const reference = referenceText(row.quantityRead, row.unitRead);

  function handlePercentageChange(raw: string) {
    onChange({ percentage: sanitizePercentageInput(raw) });
  }

  function switchToChoose() {
    onChange({ mode: 'choose' });
  }

  function switchToCreate() {
    onChange({ mode: 'create', newProductName: row.newProductName === '' ? row.readName ?? '' : row.newProductName });
  }

  return (
    <Card data-testid={`formula-import-row-${index}`}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Fila {index + 1}</CardTitle>
          <span className="text-sm text-muted-foreground" data-testid={`formula-import-row-name-${index}`}>
            {row.readName ?? 'Sin nombre leído'}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          className={TOUCH_TARGET}
          onClick={onRemove}
          data-testid={`formula-import-row-remove-${index}`}
        >
          Quitar
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {problems.length === 0 ? null : (
          <p role="alert" className="text-sm text-destructive" data-testid={`formula-import-row-problems-${index}`}>
            {problems.map((problem) => ROW_PROBLEM_LABELS[problem]).join(', ')}.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-percentage`}>Porcentaje</Label>
            <Input
              id={`${fieldId}-percentage`}
              value={row.percentage}
              onChange={(event) => handlePercentageChange(event.target.value)}
              inputMode="decimal"
              className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
              data-testid={`formula-import-row-percentage-${index}`}
            />
            {row.percentageRead === null ? null : (
              <p
                className="text-sm text-muted-foreground"
                data-testid={`formula-import-row-percentage-read-${index}`}
              >
                Leído: {row.percentageRead}
              </p>
            )}
          </div>

          {reference === null ? null : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Referencia del PDF</span>
              <p
                className={`${TOUCH_TARGET} ${FIELD_TEXT} flex items-center`}
                data-testid={`formula-import-row-reference-${index}`}
              >
                {reference}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3" data-testid={`formula-import-row-mode-${index}`} data-mode={row.mode}>
          {row.mode === 'preselected' ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Producto</span>
              <p
                className={`${TOUCH_TARGET} ${FIELD_TEXT} flex items-center`}
                data-testid={`formula-import-row-preselected-product-${index}`}
              >
                {row.productLabel}
              </p>
            </div>
          ) : null}

          {row.mode === 'choose' ? (
            <div className="flex flex-col gap-2">
              {row.severalCount === null ? null : (
                <p className="text-sm text-muted-foreground">
                  {row.severalCount} productos coinciden con el nombre leído: elige uno.
                </p>
              )}
              <ProductPicker
                value={row.productId}
                label={row.productLabel === '' ? 'Elegir producto' : row.productLabel}
                ariaLabel={`Producto de la fila ${index + 1}`}
                onSelect={(option: ProductPickerOption) =>
                  onChange({ productId: option.id, productLabel: option.name })
                }
                testId={`formula-import-row-product-picker-${index}`}
                initialPage={initialProductPage}
                excludedIds={excludedIds}
                units={units}
                productType={PRODUCT_TYPES.PRODUCT}
              />
            </div>
          ) : null}

          {row.mode === 'create' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-new-name`}>Nombre de la materia prima</Label>
              <Input
                id={`${fieldId}-new-name`}
                value={row.newProductName}
                onChange={(event) => onChange({ newProductName: event.target.value })}
                className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
                data-testid={`formula-import-row-new-name-${index}`}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {row.mode !== 'choose' ? (
              <Button
                type="button"
                variant="outline"
                className={TOUCH_TARGET}
                onClick={switchToChoose}
                data-testid={`formula-import-row-choose-button-${index}`}
              >
                Elegir producto existente
              </Button>
            ) : null}
            {row.mode !== 'create' ? (
              <Button
                type="button"
                variant="outline"
                className={TOUCH_TARGET}
                onClick={switchToCreate}
                data-testid={`formula-import-row-create-button-${index}`}
              >
                Crear materia prima
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
