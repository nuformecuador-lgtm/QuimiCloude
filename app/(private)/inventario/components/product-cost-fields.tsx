'use client';

import { useState, type ChangeEvent } from 'react';

import { divideCost, multiplyCost, sanitizeCostInput } from './product-cost-amount';
import { ProductField } from './product-field';

/** La cantidad sale de la existencia del lote, no de la alerta de cantidad. */
export const COST_QUANTITY_FIELD = 'stock';

type ProductCostFieldsProps = {
  /** Vienen del formulario para que el copy siga teniendo un solo sitio. */
  readonly unitCostLabel: string;
  readonly totalCostLabel: string;
  /**
   * Se lee solo al montar, y basta: el panel se crea de cero en cada apertura, y tras un rechazo
   * —que no lo desmonta— el estado de aqui ya guarda lo que se envio.
   */
  readonly initialUnitCost: string;
  readonly initialTotalCost: string;
  readonly unitCostError?: string;
  readonly totalCostError?: string;
};

/**
 * Del DOM y no de un estado, a proposito: la existencia sigue sin controlar, como los otros seis
 * campos del panel. Controlarla para que este par la viera de rebote arrastraria el patron del
 * formulario entero detras de una conveniencia de dos campos.
 */
function readQuantity(input: HTMLInputElement): number | null {
  const field = input.form?.elements.namedItem(COST_QUANTITY_FIELD);
  if (!(field instanceof HTMLInputElement)) return null;

  const raw = field.value.trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Los dos importes del primer lote, emparejados: escribir uno rellena el otro con la existencia.
 *
 * Cambiar la existencia no recalcula nada. Para hacerlo habria que decidir cual de los dos
 * importes manda, y esa pregunta esta abierta.
 *
 * Como el panel manda siempre el unitario relleno, y el esquema hace prevalecer el unitario sobre
 * el total, la derivacion a 4 decimales del servidor ya no se alcanza desde esta pantalla. Sigue
 * viva para el resto de llamantes del caso de uso.
 */
export function ProductCostFields({
  unitCostLabel,
  totalCostLabel,
  initialUnitCost,
  initialTotalCost,
  unitCostError,
  totalCostError,
}: ProductCostFieldsProps) {
  const [unitCost, setUnitCost] = useState(initialUnitCost);
  const [totalCost, setTotalCost] = useState(initialTotalCost);

  function handleUnitCostChange(event: ChangeEvent<HTMLInputElement>) {
    const typed = sanitizeCostInput(event.currentTarget.value);
    setUnitCost(typed);
    // Vaciar un importe no borra el otro: es el camino de «escribi el unitario» a «escribo solo el
    // total», y borrarlo ahi perderia lo ya escrito.
    if (typed === '') return;

    // Sin derivado que escribir el campo se vacia: un importe obsoleto engana mas que uno en blanco.
    const quantity = readQuantity(event.currentTarget);
    setTotalCost(quantity === null ? '' : (multiplyCost(typed, quantity) ?? ''));
  }

  function handleTotalCostChange(event: ChangeEvent<HTMLInputElement>) {
    const typed = sanitizeCostInput(event.currentTarget.value);
    setTotalCost(typed);
    if (typed === '') return;

    const quantity = readQuantity(event.currentTarget);
    setUnitCost(quantity === null ? '' : (divideCost(typed, quantity) ?? ''));
  }

  return (
    <>
      <ProductField
        name="unitCost"
        label={unitCostLabel}
        type="text"
        inputMode="decimal"
        helper="Lo que cuesta UNA unidad de este lote. Al escribirlo se rellena el costo total con la existencia; si prefieres, escribe el total y este se deduce solo."
        value={unitCost}
        onChange={handleUnitCostChange}
        error={unitCostError}
      />

      <ProductField
        name="totalCost"
        label={totalCostLabel}
        type="text"
        inputMode="decimal"
        helper="Lo que costó el lote COMPLETO. Al escribirlo se rellena el costo unitario dividiendo por la existencia; si prefieres, escribe el unitario y este se deduce solo."
        value={totalCost}
        onChange={handleTotalCostChange}
        error={totalCostError}
      />
    </>
  );
}
