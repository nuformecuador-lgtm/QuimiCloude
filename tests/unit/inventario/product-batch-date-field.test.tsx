import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductBatchDateField } from '@/app/(private)/inventario/components';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/**
 * `product-batch-date-field.tsx`: R2, R5 (`design.md > 2`, T5).
 *
 * Se monta el componente SOLO -sin `ProductForm` ni sus mocks de Server Actions-, igual que
 * `product-field.test.tsx` prueba `ProductField` fuera de la pantalla entera: lo que se afirma
 * aqui es una propiedad del componente, no del panel.
 *
 * La fecha de sistema se fija (`vi.setSystemTime`) para que "hoy" sea deterministico y el test no
 * dependa de en que dia corre. Solo se falsea `Date` -no `setTimeout`/`requestAnimationFrame`-,
 * que el popover de Base UI usa internamente para abrirse.
 */

const SYSTEM_DATE = new Date(2026, 5, 15); // 2026-06-15

/** Localiza el boton de un dia por el `data-day` ISO de su celda (estable, ajeno al locale). */
function getDayButton(isoDate: string): HTMLElement {
  const cell = document.querySelector(`td[data-day="${isoDate}"]`);
  if (cell === null) {
    throw new Error(`No se encontro la celda del dia ${isoDate}`);
  }
  const button = cell.querySelector('button');
  if (button === null) {
    throw new Error(`El dia ${isoDate} no tiene boton interactivo`);
  }
  return button;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SYSTEM_DATE);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('ProductBatchDateField', () => {
  it('el campo de fecha de compra abre con la fecha de hoy seleccionada (R2)', async () => {
    const user = setupUser();
    render(<ProductBatchDateField />);

    // El valor que viaja en el FormData ya es el de hoy, sin abrir el calendario.
    expect(screen.getByTestId('product-batch-date-value')).toHaveValue('2026-06-15');

    await user.click(screen.getByTestId('product-field-purchaseDate'));

    const botonDeHoy = getDayButton('2026-06-15');
    expect(botonDeHoy).toHaveAttribute('data-selected-single', 'true');
  });

  it('el campo de fecha de compra no permite elegir un día futuro (R5)', async () => {
    const user = setupUser();
    render(<ProductBatchDateField />);

    await user.click(screen.getByTestId('product-field-purchaseDate'));

    const manana = await esperarInteractiva(getDayButton('2026-06-16'));
    expect(manana).toBeDisabled();

    await user.click(manana);

    // El intento de elegir un dia futuro no cambia lo que viaja en el FormData.
    expect(screen.getByTestId('product-batch-date-value')).toHaveValue('2026-06-15');
  });
});
