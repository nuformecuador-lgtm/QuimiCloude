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
  ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID,
  ORDER_DISTRIBUTION_LINE_LEGACY_TESTID,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_LINE_PRESENTATION_TESTID,
  ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID,
  ORDER_DISTRIBUTION_LINE_REMOVE_TESTID,
  ORDER_DISTRIBUTION_LINE_TESTID,
  ORDER_DISTRIBUTION_TESTID,
  ORDER_DISTRIBUTION_WARNING_TESTID,
  ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID,
  OrderDistributionField,
  PACKAGING_OPTION_TESTID,
  PACKAGING_SELECT_FORBIDDEN_TESTID,
  PACKAGING_SELECT_TESTID,
  availabilityBlocksSave,
  toPresentationLinesInput,
  useOrderDistributionAvailability,
  type OrderDistributionLine,
} from '@/app/(private)/pedidos/components';
import { PRODUCT_PRESENTATION_UNIT_FILTER, PRODUCT_TYPES } from '@/lib/modules/inventario';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { quoteAvailabilityMock, listPresentationsActionMock, listProductsActionMock } = vi.hoisted(
  () => ({
    quoteAvailabilityMock: vi.fn<(input: unknown) => Promise<unknown>>(),
    listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  }),
);

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  quoteOrderPresentationAvailabilityAction: quoteAvailabilityMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde el reparto');
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

const LITRO_ID = crypto.randomUUID();
const MILILITRO_ID = crypto.randomUUID();
const UNIDADES = [
  { id: LITRO_ID, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null },
  { id: MILILITRO_ID, name: 'Mililitro', symbol: 'ml', baseUnitId: LITRO_ID, factor: '0.001' },
];
const COMPATIBLES = [LITRO_ID, MILILITRO_ID];

function envase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Bidón PET 20 L',
    imagePath: null,
    stock: '10.0000',
    unitId: crypto.randomUUID(),
    qtyAlert: null,
    type: PRODUCT_TYPES.PACKAGING,
    createdAt: new Date(),
    updatedAt: new Date(),
    reserved: '0.0000',
    available: '10.0000',
    presentationId: crypto.randomUUID(),
    presentationName: '20 L',
    presentationContent: '20.0000',
    presentationUnitId: LITRO_ID,
    ...overrides,
  };
}

const BIDON = envase();
const BOTELLA = envase({
  name: 'Botella PET 500 ml',
  presentationName: '500 ml',
  presentationContent: '500.0000',
  presentationUnitId: MILILITRO_ID,
  available: '0.0000',
});
/** Otro envase con la misma presentacion que el bidon. */
const BIDON_GEMELO = envase({ name: 'Bidón HDPE 20 L', presentationId: BIDON.presentationId });

/** Presentacion de una linea antigua, resuelta por `listPresentationsAction`. */
const PRESENTACION_ANTIGUA = {
  id: crypto.randomUUID(),
  name: 'Bidón 20L',
  unitId: LITRO_ID,
  content: '20.0000',
};

const SAVE_TESTID = 'host-save';

function Anfitrion({
  unitId = LITRO_ID,
  compatibleUnitIds = COMPATIBLES,
  quantity = '100',
  initialLines = [],
}: {
  readonly unitId?: string;
  readonly compatibleUnitIds?: readonly string[];
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
        compatibleUnitIds={compatibleUnitIds}
        unitLabel="L"
        quantity={quantity}
        units={UNIDADES}
        availability={availability}
      />
      <button type="button" disabled={availabilityBlocksSave(availability)} data-testid={SAVE_TESTID}>
        Guardar
      </button>
    </>
  );
}

/** Linea con envase ya en el reparto, como queda tras elegirlo. */
const LINEA: OrderDistributionLine = {
  presentationId: BIDON.presentationId,
  presentationName: BIDON.presentationName,
  packages: '2',
  content: BIDON.presentationContent,
  unitId: LITRO_ID,
  packagingProductId: BIDON.id,
  packagingName: BIDON.name,
  available: null,
};

/** Linea guardada antes de repartir en envases: nombra solo su presentacion. */
const LINEA_ANTIGUA: OrderDistributionLine = {
  presentationId: PRESENTACION_ANTIGUA.id,
  presentationName: PRESENTACION_ANTIGUA.name,
  packages: '2',
  content: null,
  unitId: null,
  packagingProductId: null,
  packagingName: null,
  available: null,
};

function pagina(items: readonly unknown[]) {
  return {
    status: 'success',
    data: { items, page: 1, pageSize: 25, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue(pagina([BIDON, BOTELLA, BIDON_GEMELO]));
  listPresentationsActionMock.mockResolvedValue(pagina([PRESENTACION_ANTIGUA]));
  quoteAvailabilityMock.mockResolvedValue({
    status: 'success',
    data: { kind: 'ok', available: '60' },
  });
});

afterEach(() => {
  cleanup();
});

async function abrirSelector(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
  await screen.findAllByTestId(PACKAGING_OPTION_TESTID);
}

function opcion(id: string): HTMLElement {
  const encontrada = screen
    .getAllByTestId(PACKAGING_OPTION_TESTID)
    .find((el) => el.getAttribute('data-product-id') === id);
  if (encontrada === undefined) throw new Error(`no hay opcion para ${id}`);
  return encontrada;
}

async function anadir(user: ReturnType<typeof setupUser>, id: string, envases: string) {
  await abrirSelector(user);
  await user.click(await esperarInteractiva(opcion(id)));
  const campo = screen.getByTestId(ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID);
  await user.clear(campo);
  await user.type(campo, envases);
  await user.click(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID));
}

describe('control de reparto del pedido en envases', () => {
  it('R36: el titulo dice que el reparto es en envases', () => {
    render(<Anfitrion />);

    expect(within(screen.getByTestId(ORDER_DISTRIBUTION_TESTID)).getByText('Reparto en envases'))
      .toBeInTheDocument();
  });

  it('R36: el envase elegido se anade como linea con su nombre, su presentacion y sus envases', async () => {
    const user = setupUser();
    render(<Anfitrion />);

    await anadir(user, BIDON.id, '3');

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    expect(linea).toHaveAttribute('data-packaging-product-id', BIDON.id);
    expect(linea).toHaveAttribute('data-presentation-id', BIDON.presentationId);
    expect(linea).toHaveTextContent('Bidón PET 20 L');
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PRESENTATION_TESTID)).toHaveTextContent(
      '20 L · Disponible: 10 envases',
    );
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID)).toHaveValue(3);
    expect(within(linea).queryByTestId(ORDER_DISTRIBUTION_LINE_LEGACY_TESTID)).toBeNull();
  });

  it('R36: la linea muestra lo que cubre en la unidad del pedido, convirtiendo ml a L', async () => {
    const user = setupUser();
    render(<Anfitrion quantity="20" />);

    await anadir(user, BOTELLA.id, '10');

    expect(
      within(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).getByTestId(
        ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID,
      ),
    ).toHaveTextContent('5 L · 25%');
  });

  it('R10: un envase con disponible cero tambien se puede anadir al reparto', async () => {
    const user = setupUser();
    render(<Anfitrion />);

    await anadir(user, BOTELLA.id, '1');

    expect(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toHaveAttribute(
      'data-packaging-product-id',
      BOTELLA.id,
    );
  });

  it('R12: el mismo envase dos veces no se puede anadir', async () => {
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA]} />);

    await abrirSelector(user);
    await user.click(await esperarInteractiva(opcion(BIDON.id)));

    expect(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeDisabled();
    expect(screen.getByText(/ya está en el reparto/)).toBeInTheDocument();
  });

  it('R12: otro envase con la misma presentacion que una linea no se puede anadir', async () => {
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA]} />);

    await abrirSelector(user);
    await user.click(await esperarInteractiva(opcion(BIDON_GEMELO.id)));

    expect(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeDisabled();
    expect(screen.getAllByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toHaveLength(1);
  });

  it('R8: el selector solo pide envases con presentacion en unidades compatibles con la del pedido', async () => {
    const user = setupUser();
    const derivada = crypto.randomUUID();
    render(<Anfitrion compatibleUnitIds={[LITRO_ID, derivada]} />);

    await abrirSelector(user);

    expect(listProductsActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: {
          type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
          [PRODUCT_PRESENTATION_UNIT_FILTER]: { kind: 'select', values: [LITRO_ID, derivada] },
        },
      }),
    );
  });

  it('R6: el disponible se pide con las lineas de envase tras cada cambio', async () => {
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA]} />);

    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: LITRO_ID,
        presentationLines: [{ packagingProductId: BIDON.id, packages: 2 }],
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
        unitId: LITRO_ID,
        presentationLines: [{ packagingProductId: BIDON.id, packages: 3 }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveTextContent('40 L'),
    );

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_LINE_REMOVE_TESTID));
    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: LITRO_ID,
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
      data: { kind: 'incompatible_units', presentationId: BIDON.presentationId },
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

  it('R11: el envase que ya no vuelve del catalogo marca su linea y avisa', async () => {
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'packaging_not_found', packagingProductId: BIDON.id },
    });
    render(<Anfitrion initialLines={[LINEA]} />);

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    await waitFor(() => expect(linea).toHaveAttribute('data-problem', 'true'));
    expect(screen.getByTestId(ORDER_DISTRIBUTION_WARNING_TESTID)).toHaveAttribute(
      'data-kind',
      'packaging_not_found',
    );
  });

  it('R42: sin unidad del pedido dice que falta, no ofrece anadir y no pide el disponible', async () => {
    render(<Anfitrion unitId="" />);

    expect(screen.getByTestId(ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(PACKAGING_SELECT_TESTID)).toBeNull();
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(quoteAvailabilityMock).not.toHaveBeenCalled();
  });

  it('cambiar la unidad del pedido descarta el envase elegido sin anadir', async () => {
    const user = setupUser();
    const { rerender } = render(<Anfitrion />);

    await abrirSelector(user);
    await user.click(await esperarInteractiva(opcion(BIDON.id)));
    expect(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeEnabled();

    rerender(<Anfitrion unitId={crypto.randomUUID()} />);

    expect(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeDisabled();
    expect(screen.getByTestId(PACKAGING_SELECT_TESTID)).toHaveValue('');
  });

  it('R38: sin permiso de consultar inventario avisa, no lista envases y conserva las lineas', async () => {
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA]} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));

    expect(await screen.findByTestId(PACKAGING_SELECT_FORBIDDEN_TESTID)).toBeInTheDocument();
    expect(screen.queryAllByTestId(PACKAGING_OPTION_TESTID)).toHaveLength(0);
    expect(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toHaveAttribute(
      'data-packaging-product-id',
      BIDON.id,
    );
  });

  it('R46: las lineas salen con la forma que pide la edicion acotada', () => {
    expect(toPresentationLinesInput([LINEA, LINEA_ANTIGUA])).toEqual([
      { packagingProductId: BIDON.id, packages: '2' },
      { presentationId: PRESENTACION_ANTIGUA.id, packages: '2' },
    ]);
  });
});

describe('lineas antiguas del reparto', () => {
  it('R35: la linea antigua se pinta con su presentacion, marcada como anterior a los envases', () => {
    render(<Anfitrion initialLines={[LINEA_ANTIGUA]} />);

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    expect(linea).toHaveAttribute('data-legacy', 'true');
    expect(linea).not.toHaveAttribute('data-packaging-product-id');
    expect(linea).toHaveTextContent('Bidón 20L');
    expect(within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_LEGACY_TESTID)).toBeInTheDocument();
  });

  it('R35: sus envases no se pueden cambiar, solo quitar la linea', async () => {
    const user = setupUser();
    render(<Anfitrion initialLines={[LINEA_ANTIGUA]} />);

    const envases = screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    expect(envases).toHaveAttribute('readonly');
    expect(envases).toHaveAccessibleDescription(/quítala y añade un envase/);
    await user.type(envases, '9');
    expect(envases).toHaveValue(2);

    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_LINE_REMOVE_TESTID));
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toBeNull();
  });

  it('R35: el disponible se pide con la linea antigua por su presentacion', async () => {
    render(<Anfitrion initialLines={[LINEA_ANTIGUA, LINEA]} />);

    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenLastCalledWith({
        quantity: '100',
        unitId: LITRO_ID,
        presentationLines: [
          { presentationId: PRESENTACION_ANTIGUA.id, packages: 2 },
          { packagingProductId: BIDON.id, packages: 2 },
        ],
      }),
    );
  });

  it('R33: la linea antigua resuelve su contenido en el catalogo y luego muestra lo que cubre', async () => {
    render(<Anfitrion quantity="100" initialLines={[LINEA_ANTIGUA]} />);

    const cobertura = () =>
      within(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).queryByTestId(
        ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID,
      );
    expect(cobertura()).toBeNull();
    await waitFor(() => expect(cobertura()).toHaveTextContent('40 L · 40%'));
    expect(listPresentationsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: PRESENTACION_ANTIGUA.name }),
    );
  });
});

describe('lo que cubre cada linea del reparto', () => {
  function cobertura(): HTMLElement | null {
    return within(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).queryByTestId(
      ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID,
    );
  }

  it('misma unidad: 2 × 5 L en un pedido de 20 L cubre 10 L, el 50%', () => {
    render(<Anfitrion quantity="20" initialLines={[{ ...LINEA, content: '5.0000' }]} />);

    expect(cobertura()).toHaveTextContent('10 L · 50%');
  });

  it('otra unidad: 4 × 500 ml en un pedido de 4 L cubre 2 L, el 50%', () => {
    render(
      <Anfitrion
        quantity="4"
        initialLines={[{ ...LINEA, packages: '4', content: '500', unitId: MILILITRO_ID }]}
      />,
    );

    expect(cobertura()).toHaveTextContent('2 L · 50%');
  });

  it('se recalcula al cambiar los envases y no muestra nada con envases no validos', async () => {
    const user = setupUser();
    render(<Anfitrion quantity="20" initialLines={[{ ...LINEA, content: '5.0000' }]} />);

    const envases = screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    await user.clear(envases);
    expect(cobertura()).toBeNull();

    await user.type(envases, '3');
    expect(cobertura()).toHaveTextContent('15 L · 75%');
  });

  it('sin cantidad del pedido muestra lo que cubre sin porcentaje', () => {
    render(<Anfitrion quantity="" initialLines={[{ ...LINEA, content: '5.0000' }]} />);

    expect(cobertura()).toHaveTextContent('10 L');
    expect(cobertura()?.textContent).not.toContain('%');
  });

  it('sin contenido conocido no muestra nada', () => {
    render(<Anfitrion initialLines={[{ ...LINEA, content: null }]} />);

    expect(cobertura()).toBeNull();
  });
});
