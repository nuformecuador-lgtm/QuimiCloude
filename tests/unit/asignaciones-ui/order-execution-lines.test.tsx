import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';

import {
  ORDER_EXECUTION_LINE_QUANTITY_TESTID,
  ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID,
  ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID,
  ORDER_EXECUTION_LINES_TESTID,
  OrderExecutionLines,
  PRODUCT_NAME_FALLBACK,
} from '@/app/(private)/asignacion/[id]/components';
import type { ExecutionLineView } from '@/lib/modules/asignaciones';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Las lineas de la receta y su selector de unidad de visualizacion (R20, R22, R23, R24, R25).
 */

afterEach(() => {
  cleanup();
});

const LITRO: UnitRef = { id: 'unit-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
const MILILITRO: UnitRef = {
  id: 'unit-ml',
  name: 'Mililitro',
  symbol: 'ml',
  baseUnitId: 'unit-l',
  factor: '0.001',
};
/** Base efectiva distinta de `LITRO`: sirve para probar R23, nunca para un caso real del backend. */
const KILOGRAMO: UnitRef = {
  id: 'unit-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
};

function linea(overrides: Partial<ExecutionLineView> = {}): ExecutionLineView {
  return {
    productName: 'Sosa cáustica',
    quantity: '2',
    unit: LITRO,
    alternativeUnits: [MILILITRO],
    ...overrides,
  };
}

describe('lineas de ejecucion — lectura y unidad (R20, R22)', () => {
  it('presenta el producto y la cantidad tal cual, sin ningun control de edicion', () => {
    render(<OrderExecutionLines lines={[linea()]} />);

    expect(screen.getByTestId(ORDER_EXECUTION_LINES_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent('2');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('sin producto resuelto presenta el marcador, nunca un hueco', () => {
    render(<OrderExecutionLines lines={[linea({ productName: null })]} />);

    expect(screen.getByText(PRODUCT_NAME_FALLBACK)).toBeVisible();
  });

  it('sin unidades hermanas no ofrece ningun selector', () => {
    render(<OrderExecutionLines lines={[linea({ alternativeUnits: [] })]} />);

    expect(screen.queryByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`)).toBeNull();
    expect(screen.getByText('L')).toBeVisible();
  });

  it('el selector ofrece SOLO la unidad propia y sus hermanas de la misma base efectiva (R22)', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));

    const opciones = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.textContent)).toEqual(['L', 'ml']);
  });

  it('al elegir una unidad hermana muestra la cantidad CONVERTIDA con `convertQuantity` (R22)', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));

    // 2 L convertidos a mililitros con factor 0.001 -> 2000, exactamente lo que calcula el
    // contrato publico de `unidades`, sin ninguna aritmetica propia de este archivo.
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '2000',
    );
  });
});

describe('el cambio de unidad es solo visual y no sobrevive al remontaje (R24)', () => {
  it('remontar la lista devuelve la cantidad y la unidad original', async () => {
    const user = setupUser();
    const { unmount } = render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '2000',
    );

    unmount();
    render(<OrderExecutionLines lines={[linea()]} />);

    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent('2');
  });
});

describe('la conversion incompatible es un error, y no se sustituye por un guion (R23)', () => {
  it('elegir una unidad de otra base efectiva propaga `IncompatibleUnitsError` sin capturarla', async () => {
    const user = setupUser();
    render(
      <OrderExecutionLines lines={[linea({ alternativeUnits: [KILOGRAMO] })]} />,
    );

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, kilogramo] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);

    // Se silencia el `console.error` que React emite para el error no capturado: lo que importa
    // aqui es que la excepcion SALGA, no el ruido del log de la libreria.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(user.click(await esperarInteractiva(kilogramo))).rejects.toThrow(
        /no comparten unidad base/i,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('sin aritmetica de conversion propia (R25)', () => {
  it('el archivo de las lineas no calcula la conversion a mano: solo llama a `convertQuantity`', () => {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const ARCHIVO = join(
      HERE,
      '..',
      '..',
      '..',
      'app',
      '(private)',
      'asignacion',
      '[id]',
      'components',
      'order-execution-lines.tsx',
    );
    const fuente = readFileSync(ARCHIVO, 'utf8');

    expect(fuente).toMatch(/convertQuantity\(/);
    expect(fuente).not.toMatch(/Number\(/);
    expect(fuente).not.toMatch(/parseFloat|parseInt/);
    expect(fuente).not.toMatch(/catch/);
  });
});
