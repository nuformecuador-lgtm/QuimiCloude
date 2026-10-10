'use client';

import { CircleAlertIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/** Campo del formulario de la presentacion que alimenta este selector, via el `input` oculto. */
export const PRESENTATION_UNIT_FIELD = 'unitId';

export const PRESENTATION_UNIT_SELECT_TESTID = 'presentation-unit-select';
export const PRESENTATION_UNIT_OPTION_TESTID = 'presentation-unit-option';
export const PRESENTATION_UNIT_ERROR_TESTID = 'presentation-error-unit';
export const PRESENTATION_UNIT_HELPER_TESTID = 'presentation-unit-helper';
export const PRESENTATION_UNIT_HELPER_TEXT_TESTID = 'presentation-unit-helper-text';

const PRESENTATION_UNIT_HELPER_LABEL = 'Qué es';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R20 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

export const PRESENTATION_UNIT_LABEL = 'Unidad';

/**
 * Texto del disparador cuando todavia no hay nada elegido. Es un **marcador**, no una opcion: no
 * existe ninguna entrada de la lista que lo seleccione, porque «sin unidad» no es un estado
 * posible (R17).
 */
export const PRESENTATION_UNIT_PLACEHOLDER = 'Elige una unidad';

type PresentationUnitSelectProps = {
  /** Unidades del catalogo ENTERO, sin filtrar por empresa (R16, R27). Llegan por props. */
  readonly units: readonly UnitRef[];
  /** Unidad ya asignada a la presentacion que se edita (R15). Ausente en el alta. */
  readonly defaultValue?: string;
  /** Mensaje de error del campo, si el formulario lo tiene (R17). */
  readonly error?: string;
  /**
   * Nombre del campo con el que el valor viaja en el `FormData` del formulario anfitrion.
   * Por defecto `unitId`, que es lo que el panel de presentaciones necesita.
   *
   * **`null` = este selector NO aporta ningun campo al formulario que lo rodea**, y entonces
   * hace falta el modo controlado. Lo usa el alta rapida de `PresentationSelect`: vive DENTRO
   * del formulario de producto y del de linea de catalogo -y este ultimo ya tiene su propio
   * campo `unitId`, el de la linea-, asi que un segundo `input` con ese nombre ensuciaria el
   * envio del anfitrion con la unidad de OTRA entidad.
   */
  readonly name?: string | null;
  /**
   * Unidad elegida en modo CONTROLADO. Solo se mira si viene `onValueChange`; sin el, el
   * selector sigue siendo no controlado y arranca en `defaultValue`.
   */
  readonly value?: string | null;
  /**
   * Avisa del cambio de unidad y **activa el modo controlado**. Recibe cadena vacia cuando no
   * hay nada elegido, que es lo que el esquema rechaza (R17).
   */
  readonly onValueChange?: (unitId: string) => void;
  /** Ayuda opcional junto a la etiqueta; sin ella no se pinta nada. */
  readonly helper?: ReactNode;
};

/**
 * Lo que se le pasa al primitivo para gobernar el valor: controlado cuando el llamante entrega
 * `onValueChange` -no puede haber `value` y `defaultValue` a la vez- y no controlado si no.
 */
type UnitSelection =
  | { readonly value: string | null; readonly onValueChange: (next: string | null) => void }
  | { readonly defaultValue: string | null };

/** `symbol` cuando existe; `name` en caso contrario (`design.md > 5.1`, criterio de QC-26 y QC-44). */
function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

/**
 * Selector de unidad de una presentacion (R16, R17, R20, `design.md > 5.1`).
 *
 * **No controlado**: el panel entero es un `<form action>`, asi que el valor viaja en el
 * `FormData` con el nombre `unitId` -por el `input` oculto que monta el primitivo- y no en estado
 * de React.
 *
 * **Vive en `components/shared/` desde QC-80 (T10)**. Nacio local a la pantalla de presentaciones
 * (`design.md > 5.1`), y lo que lo promueve es que ahora hay un SEGUNDO consumidor obligatorio:
 * el alta rapida embebida de `components/shared/presentation-select.tsx`, que tambien tiene que
 * pedir la unidad (R11: no puede existir ningun camino que cree una presentacion sin ella). Ese
 * consumidor ya vive en `components/shared/`, asi que dejarlo donde estaba obligaria a que
 * `components/shared/` importara de `app/`: una inversion de capas. Son los dos consumidores con
 * la misma API que `docs/architecture.md > Componentes > Regla: sin sobre-ingenieria` pone como
 * condicion para promover.
 *
 * **Sigue sin ser el `UnitSelect` de proveedores** (`design.md > 11.C`): aquel tiene como API
 * central la opcion «sin unidad» (`NO_UNIT_VALUE`), que aqui es exactamente lo prohibido.
 * Unificarlos pediria una bandera `allowEmpty` y tocar una pantalla ajena y cerrada.
 *
 * **Sin opcion «sin unidad»** (R17): `presentations.unit_id` es `NOT NULL`, y ofrecerla seria
 * ofrecer un estado que la base rechaza. Sin nada elegido el disparador muestra el marcador y el
 * envio lo rechaza el mismo esquema que valida el servidor.
 *
 * **No ofrece crear ninguna unidad ni acepta texto libre** (R16): solo elige entre las
 * existentes; el alta de unidades es la pantalla de QC-39.
 */
export function PresentationUnitSelect({
  units,
  defaultValue,
  error,
  name = PRESENTATION_UNIT_FIELD,
  value,
  onValueChange,
  helper,
}: PresentationUnitSelectProps) {
  const labelId = useId();
  const errorId = useId();

  const seleccion: UnitSelection =
    onValueChange === undefined
      ? { defaultValue: defaultValue ?? null }
      : {
          value: value === undefined || value === '' ? null : value,
          onValueChange: (next) => onValueChange(next ?? ''),
        };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span id={labelId} className="text-sm font-medium">
          {PRESENTATION_UNIT_LABEL}
        </span>
        {helper === undefined ? null : (
          // `type="button"`: este selector vive dentro de formularios y un boton sin tipo los envia.
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${PRESENTATION_UNIT_HELPER_LABEL} ${PRESENTATION_UNIT_LABEL}`}
                  className={`flex ${touchTarget} shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring`}
                  data-testid={PRESENTATION_UNIT_HELPER_TESTID}
                />
              }
            >
              <CircleAlertIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent data-testid={PRESENTATION_UNIT_HELPER_TEXT_TESTID}>
              {helper}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {/*
        `null` cuando no hay unidad previa -venga por `defaultValue` o por `value`-: es lo que
        deja el disparador en estado de marcador. No es una opcion elegible: no hay ningun
        `SelectItem` con ese valor.
      */}
      <Select
        name={name ?? undefined}
        items={units.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
        {...seleccion}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${touchTarget} ${FIELD_TEXT}`}
          data-testid={PRESENTATION_UNIT_SELECT_TESTID}
        >
          <SelectValue placeholder={PRESENTATION_UNIT_PLACEHOLDER} />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem
              key={unit.id}
              value={unit.id}
              data-testid={PRESENTATION_UNIT_OPTION_TESTID}
              // El valor de cada opcion, visible desde el DOM: es lo que le permite a un test
              // afirmar EN NEGATIVO que ninguna opcion vale cadena vacia (R17).
              data-value={unit.id}
            >
              {unitLabel(unit)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-destructive"
          data-testid={PRESENTATION_UNIT_ERROR_TESTID}
        >
          {error}
        </p>
      )}
    </div>
  );
}
