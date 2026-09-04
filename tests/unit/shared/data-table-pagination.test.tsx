import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTablePagination } from '@/components/shared/data-table/data-table-pagination';
import { PAGE_SIZE_OPTIONS, createDefaultParams } from '@/components/shared/data-table/data-table-params';
import type { DataTableTexts } from '@/components/shared/data-table/data-table-types';

/**
 * Tests de T6 (`tasks.md`): los dos extremos deshabilitados, que cambiar el tamano emite
 * `page: 1`, y que el resto de parametros no se toca. Cero asserts sobre copy (R36): `texts` es
 * un relleno cuyo VALOR nunca se afirma.
 */

const texts: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'error',
  search: 'buscar',
  filters: 'filtros',
  columnMenu: 'menu-columna',
  previousPage: 'pagina anterior',
  nextPage: 'pagina siguiente',
  pageIndicator: (page, totalPages) => `pagina ${page} de ${totalPages}`,
  pageSize: 'tamano de pagina',
  sortAscending: 'ascendente',
  sortDescending: 'descendente',
  pinColumn: 'fijar',
  unpinColumn: 'soltar',
  filterColumn: 'filtrar',
  clearFilter: 'limpiar',
  lastWeek: 'ultima semana',
  lastMonth: 'ultimo mes',
  lastYear: 'ultimo año',
};

describe('DataTablePagination', () => {
  it('deshabilita retroceder en la primera pagina', () => {
    render(
      <DataTablePagination
        params={createDefaultParams()}
        totalPages={5}
        texts={texts}
        onParamsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('data-table-previous')).toBeDisabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();
  });

  it('deshabilita avanzar en la ultima pagina', () => {
    const params = { ...createDefaultParams(), page: 5 };

    render(
      <DataTablePagination
        params={params}
        totalPages={5}
        texts={texts}
        onParamsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('data-table-next')).toBeDisabled();
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
  });

  it('avanzar emite page + 1 sin tocar el resto de parametros', async () => {
    const user = userEvent.setup();
    const params = { ...createDefaultParams(), page: 2, search: 'sosa' };
    const onParamsChange = vi.fn();

    render(
      <DataTablePagination
        params={params}
        totalPages={5}
        texts={texts}
        onParamsChange={onParamsChange}
      />,
    );

    await user.click(screen.getByTestId('data-table-next'));

    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenCalledWith({ ...params, page: 3 });
  });

  it('retroceder emite page - 1 sin tocar el resto de parametros', async () => {
    const user = userEvent.setup();
    const params = { ...createDefaultParams(), page: 2, search: 'sosa' };
    const onParamsChange = vi.fn();

    render(
      <DataTablePagination
        params={params}
        totalPages={5}
        texts={texts}
        onParamsChange={onParamsChange}
      />,
    );

    await user.click(screen.getByTestId('data-table-previous'));

    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenCalledWith({ ...params, page: 1 });
  });

  it('el indicador de pagina usa role status', () => {
    render(
      <DataTablePagination
        params={{ ...createDefaultParams(), page: 2 }}
        totalPages={4}
        texts={texts}
        onParamsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-testid', 'data-table-page-indicator');
  });

  it('el selector de tamano ofrece exactamente las opciones de PAGE_SIZE_OPTIONS', async () => {
    const user = userEvent.setup();

    render(
      <DataTablePagination
        params={createDefaultParams()}
        totalPages={5}
        texts={texts}
        onParamsChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('data-table-page-size'));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }
  });

  it('cambiar el tamano de pagina emite page: 1 con el nuevo tamano', async () => {
    const user = userEvent.setup();
    const params = { ...createDefaultParams(), page: 3 };
    const onParamsChange = vi.fn();
    const otherOption = PAGE_SIZE_OPTIONS.find((option) => option !== params.pageSize)!;

    render(
      <DataTablePagination
        params={params}
        totalPages={5}
        texts={texts}
        onParamsChange={onParamsChange}
      />,
    );

    await user.click(screen.getByTestId('data-table-page-size'));
    await user.click(screen.getByTestId(`data-table-page-size-${otherOption}`));

    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenCalledWith({ ...params, page: 1, pageSize: otherOption });
  });

  it('los disparadores de la barra cumplen el tamano tactil minimo', () => {
    render(
      <DataTablePagination
        params={createDefaultParams()}
        totalPages={5}
        texts={texts}
        onParamsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('data-table-previous')).toHaveClass('min-h-11');
    expect(screen.getByTestId('data-table-next')).toHaveClass('min-h-11');
    expect(screen.getByTestId('data-table-page-size')).toHaveClass('min-h-11');
  });
});
