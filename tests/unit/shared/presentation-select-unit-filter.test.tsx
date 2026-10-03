import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { PresentationSelect } from '@/components/shared/presentation-select';

import { setupUser } from '../../helpers/user-event';

/** Filtro por unidad de `PresentationSelect`: la consulta lo lleva solo si se pasa `unitIds`. */

const { listPresentationsActionMock } = vi.hoisted(() => ({
  listPresentationsActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

const KG = crypto.randomUUID();
const G = crypto.randomUUID();

beforeEach(() => {
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PresentationSelect · filtro por unidad', () => {
  it('con `unitIds` pide solo las presentaciones de esas unidades', async () => {
    const user = setupUser();
    render(<PresentationSelect name={null} unitIds={[KG, G]} />);

    await user.click(screen.getByTestId('presentation-select'));

    await waitFor(() => expect(listPresentationsActionMock).toHaveBeenCalled());
    expect(listPresentationsActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        filters: { unitId: { kind: 'select', values: [KG, G] } },
      }),
    );
  });

  it('sin `unitIds` la consulta no lleva filtros', async () => {
    const user = setupUser();
    render(<PresentationSelect name={null} />);

    await user.click(screen.getByTestId('presentation-select'));

    await waitFor(() => expect(listPresentationsActionMock).toHaveBeenCalled());
    expect(listPresentationsActionMock.mock.lastCall?.[0]).not.toHaveProperty('filters');
  });
});
