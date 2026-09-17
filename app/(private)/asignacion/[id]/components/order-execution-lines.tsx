'use client';

import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExecutionLineView } from '@/lib/modules/asignaciones';
import { convertQuantity, type UnitRef } from '@/lib/modules/unidades';

/**
 * Las lineas de la receta, en modo lectura, con selector de unidad de visualizacion.
 * La conversion la hace `convertQuantity` del contrato publico de `unidades`; este
 * archivo no repite esa aritmetica, y no captura `IncompatibleUnitsError`: si algun dia una
 * unidad ofrecida no compartiera base efectiva, el fallo tiene que verse, no un guion.
 *
 * El cambio de unidad es estado en memoria de cada fila: no viaja a ningun sitio y remontar la
 * lista lo devuelve a la unidad original.
 */

export const ORDER_EXECUTION_LINES_TESTID = 'order-execution-lines';
export const ORDER_EXECUTION_LINE_TESTID = 'order-execution-line';
export const ORDER_EXECUTION_LINE_QUANTITY_TESTID = 'order-execution-line-quantity';
export const ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID = 'order-execution-line-unit-select';
export const ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID = 'order-execution-line-unit-option';
export const PRODUCT_NAME_FALLBACK = 'Producto no disponible';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';

function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

type OrderExecutionLineRowProps = {
  readonly line: ExecutionLineView;
  readonly index: number;
};

function OrderExecutionLineRow({ line, index }: OrderExecutionLineRowProps) {
  const [selectedUnitId, setSelectedUnitId] = useState(line.unit.id);

  const availableUnits = [line.unit, ...line.alternativeUnits];
  const selectedUnit = availableUnits.find((unit) => unit.id === selectedUnitId) ?? line.unit;
  const displayedQuantity =
    selectedUnit.id === line.unit.id
      ? line.quantity
      : convertQuantity(line.quantity, line.unit, selectedUnit);

  const rowTestId = `${ORDER_EXECUTION_LINE_TESTID}-${index}`;
  const productLabel = line.productName ?? PRODUCT_NAME_FALLBACK;

  return (
    <li data-testid={rowTestId} className="flex flex-wrap items-center gap-3 py-2">
      <span className="min-w-0 flex-1 text-base">{productLabel}</span>
      <span
        data-testid={`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-${index}`}
        className="text-base font-medium"
      >
        {displayedQuantity}
      </span>
      {line.alternativeUnits.length > 0 ? (
        <Select
          value={selectedUnitId}
          onValueChange={(next) => {
            if (next !== null) setSelectedUnitId(next);
          }}
          items={availableUnits.map((unit) => ({ label: unitLabel(unit), value: unit.id }))}
        >
          <SelectTrigger
            aria-label={`Unidad de ${productLabel}`}
            className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
            data-testid={`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableUnits.map((unit) => (
              <SelectItem
                key={unit.id}
                value={unit.id}
                data-testid={ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID}
              >
                {unitLabel(unit)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-base text-muted-foreground">{unitLabel(line.unit)}</span>
      )}
    </li>
  );
}

export type OrderExecutionLinesProps = {
  readonly lines: readonly ExecutionLineView[];
};

export function OrderExecutionLines({ lines }: OrderExecutionLinesProps) {
  return (
    <ul data-testid={ORDER_EXECUTION_LINES_TESTID} className="flex flex-col divide-y">
      {lines.map((line, index) => (
        <OrderExecutionLineRow key={`${line.unit.id}-${index}`} line={line} index={index} />
      ))}
    </ul>
  );
}
