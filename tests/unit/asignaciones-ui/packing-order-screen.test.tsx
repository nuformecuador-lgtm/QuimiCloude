import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PACKING_ORDER_FINISH_BUTTON_TESTID,
  PACKING_ORDER_FINISH_CONFIRM_TESTID,
  PACKING_ORDER_FINISH_CONFIRM_TEXTS,
  PACKING_ORDER_FINISH_DIALOG_TESTID,
  PACKING_ORDER_ID_FIELD,
  PACKING_ORDER_MISSING_DISTRIBUTION_TESTID,
  PACKING_ORDER_PRESENTATION_LINE_TESTID,
  PACKING_ORDER_PRESENTATION_TESTID,
  PACKING_ORDER_QUANTITY_TESTID,
  PACKING_ORDER_SCREEN_TESTID,
  PACKING_ORDER_START_BUTTON_TESTID,
  PACKING_ORDER_START_CONFIRM_TESTID,
  PACKING_ORDER_START_CONFIRM_TEXTS,
  PACKING_ORDER_START_DIALOG_TESTID,
  PackingOrderScreen,
} from '@/app/(private)/asignacion/empaque/[id]/components';
import type { PackingOrderRow } from '@/lib/modules/asignaciones';

const { startPackingActionMock, finishPackingActionMock } = vi.hoisted(() => ({
  startPackingActionMock: vi.fn(),
  finishPackingActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-packing-actions', () => ({
  startPackingAction: startPackingActionMock,
  finishPackingAction: finishPackingActionMock,
}));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_DISTRIBUTION_TEXT = 'Falta el reparto: lo define quien edita pedidos';

function fila(overrides: Partial<PackingOrderRow> = {}): PackingOrderRow {
  return {
    id: 'order-1',
    numberText: '2026-0000030',
    recipeName: 'Jarabe simple',
    quantity: '12.5',
    presentationLines: [
      { presentationId: 'p-1', presentationName: 'Botella 200 ml', packagingName: null, packages: 5 },
      { presentationId: 'p-2', presentationName: 'Garrafa 5 l', packagingName: null, packages: 2 },
      { presentationId: 'p-3', presentationName: null, packagingName: null, packages: 1 },
    ],
    unitId: 'unit-1',
    unitLabel: 'kg',
    packages: '8',
    status: 'POR_EMPACAR',
    packedByName: null,
    packedById: null,
    ...overrides,
  };
}

function pintar(order: PackingOrderRow) {
  render(<PackingOrderScreen order={order} actorId={ACTOR_ID} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('pantalla del Empacador — el reparto completo en solo lectura', () => {
  it('R47/R26: pinta TODAS las lineas del reparto, en orden de alta, con envases y nombre', () => {
    pintar(fila());

    const lineas = screen.getAllByTestId(PACKING_ORDER_PRESENTATION_LINE_TESTID);
    expect(lineas.map((linea) => linea.textContent)).toEqual([
      '5 × Botella 200 ml',
      '2 × Garrafa 5 l',
      '1 × —',
    ]);
  });

  it('R26: la cantidad del pedido va con su unidad', () => {
    pintar(fila({ quantity: '12.5', unitLabel: 'kg' }));

    expect(screen.getByTestId(PACKING_ORDER_QUANTITY_TESTID)).toHaveTextContent('Cantidad: 12.5 kg');
  });

  it('R26: sin unidad, la cantidad va sola', () => {
    pintar(fila({ quantity: '12.5', unitId: null, unitLabel: null }));

    const cantidad = screen.getByTestId(PACKING_ORDER_QUANTITY_TESTID);
    expect(cantidad.textContent?.trim()).toBe('Cantidad: 12.5');
  });

  it('R47: no hay selector de presentacion ni de unidad, ni botones de añadir/quitar, ni campo de envases', () => {
    for (const status of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      pintar(fila({ status, packedById: ACTOR_ID, packedByName: 'Empacador de Prueba' }));
      const pantalla = screen.getByTestId(PACKING_ORDER_SCREEN_TESTID);

      expect(within(pantalla).queryAllByRole('combobox')).toHaveLength(0);
      expect(within(pantalla).queryAllByRole('listbox')).toHaveLength(0);
      expect(pantalla.querySelectorAll('select')).toHaveLength(0);
      expect(within(pantalla).queryAllByRole('spinbutton')).toHaveLength(0);
      expect(within(pantalla).queryAllByRole('textbox')).toHaveLength(0);
      expect(pantalla.querySelectorAll('input:not([type="hidden"]), textarea')).toHaveLength(0);
      expect(within(pantalla).queryByRole('button', { name: /añadir|agregar|quitar|eliminar/i })).toBeNull();
      expect(within(screen.getByTestId(PACKING_ORDER_PRESENTATION_TESTID)).queryAllByRole('button')).toHaveLength(0);

      cleanup();
    }
  });
});

describe('pantalla del Empacador — aviso de reparto pendiente', () => {
  it('R47: `POR_EMPACAR` sin lineas muestra «Falta el reparto: lo define quien edita pedidos»', () => {
    pintar(fila({ status: 'POR_EMPACAR', presentationLines: [] }));

    expect(screen.getByTestId(PACKING_ORDER_MISSING_DISTRIBUTION_TESTID)).toHaveTextContent(
      MISSING_DISTRIBUTION_TEXT,
    );
    expect(screen.queryAllByTestId(PACKING_ORDER_PRESENTATION_LINE_TESTID)).toHaveLength(0);
  });

  it('R47: `POR_EMPACAR` con lineas no muestra el aviso', () => {
    pintar(fila({ status: 'POR_EMPACAR' }));

    expect(screen.queryByTestId(PACKING_ORDER_MISSING_DISTRIBUTION_TESTID)).toBeNull();
    expect(screen.queryByText(MISSING_DISTRIBUTION_TEXT)).toBeNull();
  });

  it('R47: `EN_EMPAQUE` sin lineas no muestra el aviso', () => {
    pintar(
      fila({
        status: 'EN_EMPAQUE',
        presentationLines: [],
        packedById: ACTOR_ID,
        packedByName: 'Empacador de Prueba',
      }),
    );

    expect(screen.queryByTestId(PACKING_ORDER_MISSING_DISTRIBUTION_TESTID)).toBeNull();
    expect(screen.queryByText(MISSING_DISTRIBUTION_TEXT)).toBeNull();
  });
});

describe('pantalla del Empacador — ni disponible ni aviso de exceso', () => {
  it('R47: no pinta disponible ni aviso de que el reparto se pasa del total', () => {
    pintar(fila());

    expect(screen.queryByText(/disponible/i)).toBeNull();
    expect(screen.queryByText(/excede|se pasa|supera/i)).toBeNull();
  });
});

describe('pantalla del Empacador — el nombre del envase de cada linea', () => {
  it('R44: una linea con envase pinta el nombre del envase, no el de la presentacion', () => {
    pintar(
      fila({
        presentationLines: [
          { presentationId: 'p-1', presentationName: 'Botella 200 ml', packagingName: 'Botella PET ámbar 200 ml', packages: 5 },
        ],
      }),
    );

    const lineas = screen.getAllByTestId(PACKING_ORDER_PRESENTATION_LINE_TESTID);
    expect(lineas.map((linea) => linea.textContent)).toEqual(['5 × Botella PET ámbar 200 ml']);
  });

  it('R44: una linea antigua (`packagingName` null) pinta el nombre de su presentacion', () => {
    pintar(
      fila({
        presentationLines: [
          { presentationId: 'p-1', presentationName: 'Botella PET', packagingName: 'Botella PET ámbar 200 ml', packages: 5 },
          { presentationId: 'p-2', presentationName: 'Garrafa 5 l', packagingName: null, packages: 2 },
        ],
      }),
    );

    const lineas = screen.getAllByTestId(PACKING_ORDER_PRESENTATION_LINE_TESTID);
    expect(lineas.map((linea) => linea.textContent)).toEqual([
      '5 × Botella PET ámbar 200 ml',
      '2 × Garrafa 5 l',
    ]);
  });
});

describe('pantalla del Empacador — Comenzar y Terminar piden confirmacion', () => {
  const CASOS = [
    {
      nombre: 'Comenzar',
      order: () => fila(),
      button: PACKING_ORDER_START_BUTTON_TESTID,
      dialog: PACKING_ORDER_START_DIALOG_TESTID,
      confirm: PACKING_ORDER_START_CONFIRM_TESTID,
      texts: PACKING_ORDER_START_CONFIRM_TEXTS,
      action: startPackingActionMock,
      other: finishPackingActionMock,
    },
    {
      nombre: 'Terminar',
      order: () => fila({ status: 'EN_EMPAQUE', packedById: ACTOR_ID, packedByName: 'Yo' }),
      button: PACKING_ORDER_FINISH_BUTTON_TESTID,
      dialog: PACKING_ORDER_FINISH_DIALOG_TESTID,
      confirm: PACKING_ORDER_FINISH_CONFIRM_TESTID,
      texts: PACKING_ORDER_FINISH_CONFIRM_TEXTS,
      action: finishPackingActionMock,
      other: startPackingActionMock,
    },
  ] as const;

  for (const caso of CASOS) {
    it(`${caso.nombre}: el boton no envia el formulario, abre la confirmacion`, () => {
      pintar(caso.order());

      const boton = screen.getByTestId(caso.button);
      expect(boton).toHaveAttribute('type', 'button');
      expect(screen.queryByTestId(caso.dialog)).toBeNull();

      fireEvent.click(boton);

      const dialog = screen.getByTestId(caso.dialog);
      expect(dialog).toHaveTextContent(caso.texts.title);
      expect(dialog).toHaveTextContent(caso.texts.description);
      expect(screen.getByTestId(caso.confirm)).toHaveTextContent(caso.texts.confirm);
      expect(caso.action).not.toHaveBeenCalled();
    });

    it(`${caso.nombre}: cancelar no invoca la accion`, async () => {
      pintar(caso.order());

      fireEvent.click(screen.getByTestId(caso.button));
      fireEvent.click(screen.getByRole('button', { name: caso.texts.cancel }));
      await act(async () => {});

      expect(caso.action).not.toHaveBeenCalled();
    });

    it(`${caso.nombre}: confirmar envia el formulario con el id del pedido`, async () => {
      caso.action.mockResolvedValue({ status: 'success' });
      pintar(caso.order());

      fireEvent.click(screen.getByTestId(caso.button));
      await act(async () => {
        fireEvent.click(screen.getByTestId(caso.confirm));
      });

      expect(caso.action).toHaveBeenCalledTimes(1);
      expect(caso.other).not.toHaveBeenCalled();
      const [, formData] = caso.action.mock.calls[0] as [unknown, FormData];
      expect(formData.get(PACKING_ORDER_ID_FIELD)).toBe('order-1');
    });
  }
});
