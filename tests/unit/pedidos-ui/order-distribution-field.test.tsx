// El control de reparto del pedido, montado en un anfitrion minimo que hace lo mismo que el
// formulario de pedido y la edicion acotada: guarda las lineas en estado, pide el disponible con
// el hook y deshabilita Guardar cuando el disponible lo bloquea.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_ADD_TESTID,
  ORDER_DISTRIBUTION_AVAILABLE_TESTID,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID,
  ORDER_DISTRIBUTION_LINE_REMOVE_TESTID,
  ORDER_DISTRIBUTION_LINE_TESTID,
  ORDER_DISTRIBUTION_WARNING_TESTID,
  ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID,
  OrderDistributionField,
  availabilityBlocksSave,
  toPresentationLinesInput,
  useOrderDistributionAvailability,
  type OrderDistributionLine,
} from '@/app/(private)/pedidos/components';
import { PRESENTATION_OPTION_WITHOUT_CONTENT_TESTID } from '@/components/shared/presentation-select';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { quoteAvailabilityMock, listPresentationsActionMock } = vi.hoisted(() => ({
  quoteAvailabilityMock: vi.fn<(input: unknown) => Promise<unknown>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  quoteOrderPresentationAvailabilityAction: quoteAvailabilityMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde el reparto');
  }),
}));

const UNIDAD_ID = crypto.randomUUID();
const CON_CONTENIDO = {
  id: crypto.randomUUID(),
  name: 'Bidón 20L',
  unitId: UNIDAD_ID,
  content: '20.0000',
};
const SIN_CONTENIDO = {
  id: crypto.randomUUID(),
  name: 'Saco',
  unitId: UNIDAD_ID,
  content: null,
};

const SAVE_TESTID = 'host-save';

function Anfitrion({
  unitId = UNIDAD_ID,
  quantity = '100',
  initialLines = [],
}: {
  readonly unitId?: string;
  readonly quantity?: string;
  readonly initialLines?: readonly OrderDistributionLine[];
}) {
  const [lines, setLines] = useState<readonly OrderDistributionLine[]>(initialLines);
  const availability = useOrderDistributionAvailability({ quantity, unitId, lines });
  return (
    <>
      <OrderDistributionField
        lines={lines}
        onLinesChange={setLines}
        unitId={unitId}
        unitLabel="L"
        availability={availability}
      />
      <button type="button" disabled={availabilityBlocksSave(availability)} data-testid={SAVE_TESTID}>
        Guardar
      </button>
    </>
  );
}

const LINEA: OrderDistributionLine = {
  presentationId: CON_CONTENIDO.id,
  presentationName: CON_CONTENIDO.name,
  packages: '2',
};

beforeEach(() => {
  vi.clearAllMocks();
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: {
      items: [CON_CONTENIDO, SIN_CONTENIDO],
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    },
  });
  quoteAvailabilityMock.mockResolvedValue({
    status: 'success',
    data: { kind: 'ok', available: '60' },
  });
});

afterEach(() => {
  cleanup();
});

async function abrirSelector(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-select'));
  await screen.findAllByTestId('presentation-option');
}

function opcion(id: string): HTMLElement {
  const encontrada = screen
    .getAllByTestId('presentation-option')
    .find((el) => el.getAttribute('data-presentation-id') === id);
  if (encontrada === undefined) throw new Error(`no hay opcion para ${id}`);
  return encontrada;
}

describe('control de reparto del pedido', () => {
  it('R34: la presentacion sin contenido sale marcada con aviso y no se puede anadir', async () => {
    const user = setupUser();
    render(<Anfitrion />);

    await abrirSelector(user);

    const sinContenido = opcion(SIN_CONTENIDO.id);
    expect(sinContenido).toHaveAttribute('data-without-content', 'true');
    expect(
      within(sinContenido).getByTestId(PRESENTATION_OPTION_WITHOUT_CONTENT_TESTID),
    ).toBeInTheDocument();
    expect(
      within(opcion(CON_CONTENIDO.id)).queryByTestId(PRESENTATION_OPTION_WITHOUT_CONTENT_TESTID),
    ).toBeNull();

    await user.click(sinContenido);

    expect(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeDisabled();
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toBeNull();
  });

  it('R34: la presentacion con contenido se anade como linea con sus envases', async () => {
    const user = setupUser();
    render(<Anfitrion />);

    await abrirSelector(user);
    await user.click(await esperarInteractiva(opcion(CON_CONTENIDO.id)));
    const envases = screen.getByTestId(ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID);
    await user.clear(envases);
    await user.type(envases, '3');
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID));

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    expect(linea).toHaveAttribute('data-presentation-id', CON_CONTENIDO.id);
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveValue(3);
  });

  it('R6: el disponible se pide tras cada cambio y se pinta en la unidad del pedido', async () => {
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA]} />);

    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: UNIDAD_ID,
        presentationLines: [{ presentationId: CON_CONTENIDO.id, packages: 2 }],
      }),
    );
    expect(await screen.findByText('60 L')).toHaveAttribute(
      'data-testid',
      ORDER_DISTRIBUTION_AVAILABLE_TESTID,
    );

    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'ok', available: '40' },
    });
    const envases = screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    await user.clear(envases);
    await user.type(envases, '3');

    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: UNIDAD_ID,
        presentationLines: [{ presentationId: CON_CONTENIDO.id, packages: 3 }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveTextContent('40 L'),
    );

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_LINE_REMOVE_TESTID));
    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: UNIDAD_ID,
        presentationLines: [],
      }),
    );
  });

  it('R39: si el reparto pasa del total, cifra en negativo, aviso visible y Guardar deshabilitado', async () => {
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'exceeds_quantity', available: '-20' },
    });
    render(<Anfitrion initialLines={[{ ...LINEA, packages: '6' }]} />);

    const disponible = screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID);
    await waitFor(() => expect(disponible).toHaveTextContent('-20 L'));
    expect(disponible).toHaveAttribute('data-negative', 'true');
    expect(disponible).toHaveClass('text-destructive');
    const aviso = screen.getByTestId(ORDER_DISTRIBUTION_WARNING_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveAttribute('data-kind', 'exceeds_quantity');
    expect(screen.getByTestId(SAVE_TESTID)).toBeDisabled();
  });

  it('R39: un negativo que el redondeo dejaria en cero sigue mostrando el signo', async () => {
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'exceeds_quantity', available: '-0.00001' },
    });
    render(<Anfitrion initialLines={[LINEA]} />);

    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID).textContent).toMatch(/^-/),
    );
  });

  it('R7: la linea con unidades incompatibles queda marcada y Guardar deshabilitado', async () => {
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'incompatible_units', presentationId: CON_CONTENIDO.id },
    });
    render(<Anfitrion initialLines={[LINEA]} />);

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    await waitFor(() => expect(linea).toHaveAttribute('data-problem', 'true'));
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID)).toBeInTheDocument();
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByTestId(ORDER_DISTRIBUTION_WARNING_TESTID)).toHaveAttribute(
      'data-kind',
      'incompatible_units',
    );
    expect(screen.getByTestId(SAVE_TESTID)).toBeDisabled();
  });

  it('R42: sin unidad del pedido dice que falta, no ofrece anadir y no pide el disponible', async () => {
    render(<Anfitrion unitId="" />);

    expect(screen.getByTestId(ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(quoteAvailabilityMock).not.toHaveBeenCalled();
  });

  it('R46: las lineas salen con la forma que pide la edicion acotada', () => {
    expect(toPresentationLinesInput([LINEA])).toEqual([
      { presentationId: CON_CONTENIDO.id, packages: '2' },
    ]);
  });
});
