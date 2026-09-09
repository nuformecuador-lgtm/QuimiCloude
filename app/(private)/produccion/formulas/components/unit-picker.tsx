'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Selector de unidad de una línea de receta (T15, R30).
 *
 * **Recibe las unidades por props** (R49): no importa `@/lib/composition` ni Prisma, no llama a
 * `listUnitsAction` ni a ninguna otra operación por su cuenta -esa llamada la hace UNA vez la
 * página del formulario (`nueva/page.tsx`, `[id]/page.tsx`) y baja por `RecipeForm`-.
 *
 * **Muestra `symbol` cuando existe y `name` cuando no** (R30) y **envía el `id`**: nunca texto
 * libre. El esquema del contrato exige un UUID y el caso de uso comprueba la existencia contra el
 * catálogo -esta pantalla no repite esa validación.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';

export type UnitPickerProps = {
  readonly units: readonly UnitRef[];
  /** Id de la unidad elegida, o cadena vacía si ninguna. */
  readonly value: string;
  readonly onChange: (unitId: string) => void;
  readonly label: string;
  readonly error?: string;
  readonly testId: string;
  /** `true` cuando la linea todavia no tiene ingrediente: sin ingrediente no hay grupo de
   *  unidades que ofrecer, asi que el campo no se deja tocar (QC-26bis). */
  readonly disabled?: boolean;
};

/** `symbol` cuando existe; `name` en caso contrario (R30). */
function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

export function UnitPicker({
  units,
  value,
  onChange,
  label,
  error,
  testId,
  disabled = false,
}: UnitPickerProps) {
  const errorId = `${testId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value === '' ? null : value}
        onValueChange={(next) => onChange(next ?? '')}
        items={units.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={label}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={testId}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id} data-testid={`${testId}-option`}>
              {unitLabel(unit)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`${testId}-field-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
