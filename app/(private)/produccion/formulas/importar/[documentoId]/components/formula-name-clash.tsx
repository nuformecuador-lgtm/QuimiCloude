'use client';

import { Button } from '@/components/ui/button';

const TOUCH_TARGET = 'min-h-11 min-w-11';

type FormulaNameClashProps = {
  readonly recipeName: string;
  readonly onReplace: () => void;
  readonly onRename: () => void;
};

/**
 * El aviso de choque de nombre (R17): una receta viva ya tiene ese nombre. El texto es EXACTO
 * -`design.md > 6.4`-, y las dos opciones son las unicas que R17 admite: reemplazarla o cambiar
 * el nombre. Ninguna de las dos decide aqui lo que pasa despues; eso lo hace quien llama.
 */
export function FormulaNameClash({ recipeName, onReplace, onRename }: FormulaNameClashProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4"
      data-testid="formula-import-clash"
    >
      <p className="text-sm" data-testid="formula-import-clash-message">
        {`Ya existe la fórmula «${recipeName}». Reemplazarla cambia sus ingredientes, pasos y descripción; los pedidos que la usan no cambian su coste guardado.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className={TOUCH_TARGET} onClick={onReplace} data-testid="formula-import-clash-replace">
          Reemplazar
        </Button>
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          onClick={onRename}
          data-testid="formula-import-clash-rename"
        >
          Cambiar el nombre
        </Button>
      </div>
    </div>
  );
}
