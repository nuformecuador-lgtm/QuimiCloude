'use client';

import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const FIELD_TEXT = 'text-base md:text-base';

/** Una presentacion nueva que alguna fila incluida necesita, vista una sola vez. */
export type NewPresentationGroup = {
  /** Nombre normalizado de la presentacion: identifica el grupo y la seleccion de unidad. */
  readonly key: string;
  /** El nombre tal como lo trae la fila, para mostrarlo y para enviarlo al confirmar. */
  readonly presentation: string;
  /** La unidad leida por la IA la primera vez que aparecio esta presentacion, o `null`. */
  readonly readUnit: string | null;
  /** Filas (en base 1) que usan esta presentacion, para nombrarlas si falta la unidad. */
  readonly rowNumbers: readonly number[];
};

type NewPresentationUnitsProps = {
  readonly groups: readonly NewPresentationGroup[];
  /** Todas las unidades visibles para la empresa: ninguna se crea desde aqui. */
  readonly units: readonly UnitRef[];
  readonly selections: Readonly<Record<string, string>>;
  readonly onChange: (key: string, unitId: string) => void;
};

function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

/**
 * Una unidad por cada presentacion nueva que alguna fila incluida necesita: sin elegirla, la
 * confirmacion entera queda bloqueada.
 *
 * Ninguna unidad viene preseleccionada por defecto: `suggestUnitId` (llamado por quien monta este
 * componente) decide si hay una sola coincidencia, y si no la hay el revisor elige entre TODAS.
 */
export function NewPresentationUnits({ groups, units, selections, onChange }: NewPresentationUnitsProps) {
  const titleId = useId();

  if (groups.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4" data-testid="new-presentation-units">
      <h2 id={titleId} className="text-lg font-medium">
        Unidades de presentaciones nuevas
      </h2>
      {groups.map((group) => {
        const fieldId = `new-presentation-unit-${group.key}`;
        return (
          <div key={group.key} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>
              {group.presentation} (fila{group.rowNumbers.length > 1 ? 's' : ''}{' '}
              {group.rowNumbers.join(', ')})
            </Label>
            <Select
              value={selections[group.key] ?? ''}
              onValueChange={(unitId) => onChange(group.key, unitId as string)}
              items={units.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
            >
              <SelectTrigger
                id={fieldId}
                className={`w-full ${touchTarget} ${FIELD_TEXT}`}
                data-testid={`new-presentation-unit-select-${group.key}`}
              >
                <SelectValue placeholder="Elige una unidad" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem
                    key={unit.id}
                    value={unit.id}
                    data-testid={`new-presentation-unit-option-${group.key}-${unit.id}`}
                  >
                    {unitLabel(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </section>
  );
}
