// Las pantallas de asignacion siguen pintando las lineas antiguas del reparto por su presentacion.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PACKING_ORDER_PRESENTATION_LINE_TESTID,
  PackingOrderScreen,
} from '@/app/(private)/asignacion/empaque/[id]/components';
import type { PackingOrderRow } from '@/lib/modules/asignaciones';

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-packing-actions', () => ({
  startPackingAction: vi.fn(),
  finishPackingAction: vi.fn(),
}));

function fila(overrides: Partial<PackingOrderRow> = {}): PackingOrderRow {
  return {
    id: 'order-1',
    numberText: '2026-0000030',
    recipeName: 'Jarabe simple',
    quantity: '12.5',
    presentationLines: [{ presentationId: 'p-1', presentationName: 'Botella 200 ml', packagingName: null, packages: 5 }],
    unitId: 'unit-1',
    unitLabel: 'l',
    packages: '5',
    status: 'POR_EMPACAR',
    packedByName: null,
    packedById: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('pantalla de empaque con lineas antiguas', () => {
  it('R33: la linea antigua se pinta con sus envases y el nombre de su presentacion', () => {
    render(<PackingOrderScreen order={fila()} actorId="11111111-1111-4111-8111-111111111111" />);

    expect(screen.getByTestId(PACKING_ORDER_PRESENTATION_LINE_TESTID)).toHaveTextContent(
      '5 × Botella 200 ml',
    );
  });
});
