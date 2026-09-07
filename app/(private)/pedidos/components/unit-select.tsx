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

/**
 * Selector de unidad del pedido (R32, R43, `design.md > 9.2`).
 *
 * **No controlado**: el panel lateral usa `<form action>`, asi que el valor viaja en el
 * `FormData` con el nombre `unitId` -por el `input` oculto que monta el primitivo- y no en estado
 * de React.
 *
 * **Por que se escribe uno propio y no se reutiliza ninguno** (`design.md > 9.2`): el
 * `UnitPicker` de QC-26 es CONTROLADO (`value`/`onChange`), y el `UnitSelect` de QC-44 vive en la
 * ruta de proveedores y admite «sin unidad», que aqui **no** es valido -`createOrderSchema` exige
 * un uuid-. Promover cualquiera de los dos obligaria a cambiarle la API y con ella una feature
 * ajena ya cerrada.
 *
 * **Sin opcion vacia y sin alta de unidad** (R32): solo se elige entre las existentes. El alta de
 * unidades es QC-38 y su pantalla QC-39, y por eso este archivo no importa ninguna operacion de
 * escritura de unidades. Si el usuario no elige nada, el campo viaja vacio y lo rechaza
 * `createOrderSchema` -la misma regla que valida el servidor-, que es lo correcto: convertir el
 * blanco en un valor por defecto seria inventar la unidad del pedido.
 *
 * **Las unidades llegan por PROPS** (R43): las pide **una vez** el Server Component de la seccion
 * con `listUnitsAction()` y bajan por el panel. Este componente no importa `lib/composition`, ni
 * el cliente de base de datos, ni llama a ninguna operacion por su cuenta.
 */

/** Nombre del campo del `FormData` que lee el adaptador driving de `pedidos`. */
export const UNIT_FIELD = 'unitId';

/** `data-testid` del control y de sus opciones (R44). */
export const UNIT_SELECT_TESTID = 'order-unit-select';
export const UNIT_OPTION_TESTID = 'order-unit-option';

/** Objetivo tactil minimo (44x44 px) de R45. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R45 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

const UNIT_LABEL = 'Unidad';

/** Valor del campo cuando no se ha elegido nada. NO es una opcion del desplegable. */
const NO_SELECTION = '';

export type UnitSelectProps = {
  /** Unidades existentes. Llegan por props (R43); este componente no consulta nada. */
  readonly units: readonly UnitRef[];
  /** Unidad ya asignada al pedido que se edita (R28). Ausente en el alta. */
  readonly defaultValue?: string;
  /** Error del campo (R34). */
  readonly error?: string;
};

/** `symbol` cuando existe; `name` en caso contrario (`design.md > 9.2`, criterio de QC-26). */
function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

export function UnitSelect({ units, defaultValue, error }: UnitSelectProps) {
  const labelId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {UNIT_LABEL}
      </span>
      <Select
        name={UNIT_FIELD}
        defaultValue={defaultValue ?? NO_SELECTION}
        items={units.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={UNIT_SELECT_TESTID}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id} data-testid={UNIT_OPTION_TESTID}>
              {unitLabel(unit)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p
          id={errorId}
          className="text-sm text-destructive"
          data-testid={`${UNIT_SELECT_TESTID}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
