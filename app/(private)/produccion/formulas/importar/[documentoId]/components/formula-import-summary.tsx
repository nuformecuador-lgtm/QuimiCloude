'use client';

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import type { FormulaImportSummary as FormulaImportSummaryData } from '@/lib/modules/documentos';
import { recipeEditRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const OUTCOME_LABELS: Record<FormulaImportSummaryData['outcome'], string> = {
  created: 'Se creó una fórmula nueva.',
  replaced: 'Se reemplazó la fórmula existente.',
};

type FormulaImportSummaryProps = {
  readonly summary: FormulaImportSummaryData;
};

/**
 * Resultado de una confirmacion que termino bien: si la receta se creo o se reemplazo,
 * cuantas materias primas se crearon y cuantas se reutilizaron, y la vuelta a la ficha de esa
 * receta -que sale de `recipeEditRoute`, nunca de un literal.
 */
export function FormulaImportSummary({ summary }: FormulaImportSummaryProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-4 rounded-lg border p-4"
      data-testid="formula-import-summary"
    >
      <p className="text-sm font-medium" data-testid="formula-import-summary-outcome">
        {OUTCOME_LABELS[summary.outcome]}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Materias primas creadas</dt>
          <dd data-testid="formula-import-summary-raw-materials-created">{summary.rawMaterialsCreated}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Materias primas reutilizadas</dt>
          <dd data-testid="formula-import-summary-raw-materials-reused">{summary.rawMaterialsReused}</dd>
        </div>
      </dl>

      <Link
        href={recipeEditRoute(summary.recipeId)}
        data-slot="button"
        className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        data-testid="formula-import-summary-link"
      >
        Ver la fórmula
      </Link>
    </div>
  );
}
