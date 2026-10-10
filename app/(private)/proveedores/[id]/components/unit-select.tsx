'use client';

import { SelectField } from '@/components/shared/select-field';
import type { UnitRef } from '@/lib/modules/unidades';

/** Campo del formulario de la linea que alimenta este selector, via el `input` oculto del primitivo. */
export const UNIT_FIELD = 'unitId';

/**
 * Valor de la opcion «sin unidad»: **cadena vacia**. El adaptador driving de la linea ya trata un
 * campo opcional vacio como ausencia, asi que no hace falta ningun centinela propio.
 */
export const NO_UNIT_VALUE = '';

/** Etiqueta de la opcion «sin unidad». Constante para que ningun test dependa del copy. */
export const NO_UNIT_LABEL = 'Sin unidad';

type UnitSelectProps = {
  /** Unidades existentes. Llegan por props; este componente no consulta nada. */
  readonly units: readonly UnitRef[];
  /** Unidad ya asignada a la linea que se edita. Ausente en el alta. */
  readonly defaultValue?: string | null;
  readonly error?: string;
};

function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

/**
 * Selector de unidad de una linea de catalogo. **No controlado**: el panel usa `<form action>`, asi
 * que el valor viaja en el `FormData` como `unitId`. No ofrece crear unidades ni acepta texto
 * libre: elige entre las existentes o deja la linea **sin unidad**, que es una eleccion explicita
 * y no el hueco de no elegir nada.
 */
export function UnitSelect({ units, defaultValue, error }: UnitSelectProps) {
  return (
    <SelectField
      name={UNIT_FIELD}
      label="Unidad"
      defaultValue={defaultValue ?? NO_UNIT_VALUE}
      noneOption={{ label: NO_UNIT_LABEL, value: NO_UNIT_VALUE, testId: 'unit-option-none' }}
      options={units.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
      triggerTestId="unit-select"
      optionTestId="unit-option"
      error={error}
      errorTestId="unit-select-error"
      errorAlert={false}
    />
  );
}
