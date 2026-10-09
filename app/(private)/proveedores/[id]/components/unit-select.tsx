'use client';

import { useId } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/** Campo del formulario de la linea que alimenta este selector, via el `input` oculto del primitivo. */
export const UNIT_FIELD = 'unitId';

/**
 * Valor de la opcion «sin unidad»: **cadena vacia** (R40). El adaptador driving de la linea ya
 * trata un campo opcional vacio como ausencia (`readOptionalFormString`), asi que no hace falta
 * ningun centinela propio ni omitir el campo del envio.
 */
export const NO_UNIT_VALUE = '';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md`, y R48 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/** Etiqueta de la opcion «sin unidad». Constante para que ningun test dependa del copy. */
export const NO_UNIT_LABEL = 'Sin unidad';

type UnitSelectProps = {
  /** Unidades existentes. Llegan por props (R46); este componente no consulta nada. */
  readonly units: readonly UnitRef[];
  /** Unidad ya asignada a la linea que se edita (R31). Ausente en el alta. */
  readonly defaultValue?: string | null;
  /** Mensaje de error del campo, si el formulario lo tiene (R32). */
  readonly error?: string;
};

/** `symbol` cuando existe; `name` en caso contrario (`design.md > 8.2`, mismo criterio que QC-26). */
function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

/**
 * Selector de unidad de una linea de catalogo (R40, R46, `design.md > 8.2`).
 *
 * **No controlado**, a diferencia del `UnitPicker` de QC-26: el panel lateral de la linea usa
 * `<form action>`, asi que el valor tiene que viajar en el `FormData` con el nombre `unitId` -por
 * el `input` oculto que monta el primitivo- y no en estado de React. Promover el de QC-26
 * obligaria a cambiarle la API (`value`/`onChange`) y con ella el formulario de recetas, feature
 * ajena ya cerrada, que es justo lo que R49 prohibe (`design.md > 13.C`).
 *
 * **Las unidades llegan por props** (R46): las pide **una vez** el Server Component de la pagina
 * de detalle con `listUnitsAction()` y bajan por el panel lateral. Este componente no importa
 * `lib/composition`, ni el cliente de base de datos, ni llama a ninguna operacion por su cuenta.
 *
 * **No ofrece crear ninguna unidad** (R40) y **no acepta texto libre**: solo elige entre las
 * existentes o deja la linea **sin unidad**, que es un caso valido -la unidad es opcional desde
 * QC-32-. El alta de unidades es el alcance de QC-38 y su pantalla QC-39; por eso este archivo no
 * importa ninguna operacion de escritura de unidades, y una guardia de fuente lo comprueba.
 */
export function UnitSelect({ units, defaultValue, error }: UnitSelectProps) {
  const labelId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        Unidad
      </span>
      <Select
        name={UNIT_FIELD}
        defaultValue={defaultValue ?? NO_UNIT_VALUE}
        items={[
          { label: NO_UNIT_LABEL, value: NO_UNIT_VALUE },
          ...units.map((unit) => ({ label: unitLabel(unit), value: unit.id })),
        ]}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${touchTarget} ${FIELD_TEXT}`}
          data-testid="unit-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* La opcion «sin unidad» es EXPLICITA (R40): dejar la linea sin unidad es una eleccion
              del usuario, no el hueco que queda cuando no elige nada. */}
          <SelectItem value={NO_UNIT_VALUE} data-testid="unit-option-none">
            {NO_UNIT_LABEL}
          </SelectItem>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id} data-testid="unit-option">
              {unitLabel(unit)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid="unit-select-error">
          {error}
        </p>
      )}
    </div>
  );
}
