import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';

import {
  ORDER_EXECUTION_LINE_PERCENTAGE_TESTID,
  ORDER_EXECUTION_LINE_QUANTITY_TESTID,
  ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID,
  ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID,
  ORDER_EXECUTION_LINE_UNIT_TESTID,
  ORDER_EXECUTION_LINES_TESTID,
  OrderExecutionLines,
  PRODUCT_NAME_FALLBACK,
} from '@/app/(private)/asignacion/[id]/components';
import type { ExecutionLineView } from '@/lib/modules/asignaciones';
import type { UnitRef } from '@/lib/modules/unidades';

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
/** Base efectiva distinta de `LITRO`: sirve para probar que la conversion incompatible no se
 *  disfraza, nunca para un caso real del backend. */
const KILOGRAMO: UnitRef = {
  id: 'unit-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
};

function linea(overrides: Partial<ExecutionLineView> = {}): ExecutionLineView {
  return {
    productName: 'Hipoclorito',
    percentage: '10.00',
    quantity: '20',
    unit: LITRO,
    alternativeUnits: [MILILITRO],
    ...overrides,
  };
}

describe('linea de ejecucion — insumo, porcentaje y cantidad (R18)', () => {
  it('muestra "Hipoclorito · 10,00 % · 20 L" para un pedido de 200 con la linea al 10 %', () => {
    render(<OrderExecutionLines lines={[linea({ alternativeUnits: [] })]} />);

    const fila = screen.getByTestId('order-execution-line-0');
    // El selector de unidad no aparece sin hermanas: la fila es solo texto, comparable tal cual.
    expect(fila.textContent?.replace(/\s+/g, ' ').trim()).toBe('Hipoclorito · 10,00 % · 20 L');
  });

  it('sin producto resuelto presenta el marcador, nunca un hueco', () => {
    render(<OrderExecutionLines lines={[linea({ productName: null })]} />);

    expect(screen.getByText(PRODUCT_NAME_FALLBACK)).toBeVisible();
  });

  it('presenta las lineas en modo lectura, sin ningun control de edicion', () => {
    render(<OrderExecutionLines lines={[linea()]} />);

    expect(screen.getByTestId(ORDER_EXECUTION_LINES_TESTID)).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('linea de ejecucion — el porcentaje es formato, no aritmetica (R19)', () => {
  it('el archivo no importa ningun factor de escala ni cantidad base de la receta', () => {
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

    expect(fuente).not.toMatch(/recipeBaseQuantity|scaleFactorText/);
  });
});

describe('linea de ejecucion — el selector de unidad convierte la cantidad, no el porcentaje (R20)', () => {
  it('sin unidades hermanas no ofrece ningun selector', () => {
    render(<OrderExecutionLines lines={[linea({ alternativeUnits: [] })]} />);

    expect(screen.queryByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`)).toBeNull();
    expect(screen.getByText('L')).toBeVisible();
  });

  it('el selector ofrece solo la unidad propia y sus hermanas de la misma base efectiva', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));

    const opciones = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.textContent)).toEqual(['L', 'ml']);
  });

  it('con unidades hermanas, el testid de unidad esta en el selector y sigue el valor elegido', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea()]} />);

    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_TESTID}-0`)).toHaveTextContent('L');

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));

    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_TESTID}-0`)).toHaveTextContent('ml');
  });

  it('elegir mL muestra 20000 y el "10,00 %" no cambia', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));

    // 20 L convertidos a mililitros con factor 0.001 -> 20000, exactamente lo que calcula el
    // contrato publico de `unidades`, sin ninguna aritmetica propia de este archivo.
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '20000',
    );
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_PERCENTAGE_TESTID}-0`)).toHaveTextContent(
      '10,00 %',
    );
  });

  it('remontar la lista devuelve la cantidad y la unidad original', async () => {
    const user = setupUser();
    const { unmount } = render(<OrderExecutionLines lines={[linea()]} />);

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '20000',
    );

    unmount();
    render(<OrderExecutionLines lines={[linea()]} />);

    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '20',
    );
  });

  it('elegir una unidad de otra base efectiva propaga `IncompatibleUnitsError` sin capturarla', async () => {
    const user = setupUser();
    render(<OrderExecutionLines lines={[linea({ alternativeUnits: [KILOGRAMO] })]} />);

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

describe('linea de ejecucion — el title expone el valor exacto (QC-132 R5, R6)', () => {
  it('QC-132 R5: title exacto cuando difiere del pintado, en su unidad propia', () => {
    render(<OrderExecutionLines lines={[linea({ quantity: '0.1255', alternativeUnits: [] })]} />);

    const cantidad = screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`);
    expect(cantidad).toHaveTextContent('0.13');
    expect(cantidad).toHaveAttribute('title', '0.1255');
  });

  it('QC-132 R5: title exacto tambien sin unidad resoluble', () => {
    render(
      <OrderExecutionLines
        lines={[linea({ quantity: '0.1255', unit: null, alternativeUnits: [] })]}
      />,
    );

    const cantidad = screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`);
    expect(cantidad).toHaveTextContent('0.13');
    expect(cantidad).toHaveAttribute('title', '0.1255');
  });

  it('QC-132 R6: sin title cuando el valor pintado coincide con el exacto', () => {
    render(<OrderExecutionLines lines={[linea({ quantity: '20', alternativeUnits: [] })]} />);

    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).not.toHaveAttribute(
      'title',
    );
  });
});

describe('linea de ejecucion — el title de la linea convertida (QC-132 R12)', () => {
  it('QC-132 R12: title con el valor convertido tal cual, sin acotar', async () => {
    const user = setupUser();
    render(
      <OrderExecutionLines
        lines={[linea({ quantity: '1', unit: MILILITRO, alternativeUnits: [LITRO] })]}
      />,
    );

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, litro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(litro));

    const cantidad = screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`);
    expect(cantidad).toHaveTextContent('0');
    expect(cantidad).toHaveAttribute('title', '0.001');
  });

  it('QC-132 R12: sin title cuando el valor convertido ya sale exacto', async () => {
    const user = setupUser();
    render(
      <OrderExecutionLines
        lines={[linea({ quantity: '0.1255', unit: LITRO, alternativeUnits: [MILILITRO] })]}
      />,
    );

    await user.click(screen.getByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`));
    const [, mililitro] = await screen.findAllByTestId(ORDER_EXECUTION_LINE_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(mililitro));

    const cantidad = screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`);
    expect(cantidad).toHaveTextContent('125.5');
    expect(cantidad).not.toHaveAttribute('title');
  });
});

describe('linea de ejecucion — unidad desconocida (R24)', () => {
  it('con unidad null no ofrece selector ni simbolo, y sigue mostrando porcentaje y cantidad', () => {
    render(
      <OrderExecutionLines lines={[linea({ unit: null, alternativeUnits: [] })]} />,
    );

    expect(screen.queryByTestId(`${ORDER_EXECUTION_LINE_UNIT_SELECT_TESTID}-0`)).toBeNull();
    expect(screen.queryByText('L')).toBeNull();
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_PERCENTAGE_TESTID}-0`)).toHaveTextContent(
      '10,00 %',
    );
    expect(screen.getByTestId(`${ORDER_EXECUTION_LINE_QUANTITY_TESTID}-0`)).toHaveTextContent(
      '20',
    );
  });
});
