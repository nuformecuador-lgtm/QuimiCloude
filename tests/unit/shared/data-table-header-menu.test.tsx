import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { esperarInteractiva, setupUser } from '../../helpers/user-event'

import {
  DataTableHeaderCell,
  DataTableHeaderMenu,
} from '@/components/shared/data-table/data-table-header-menu'
import type { DataTableColumn, DataTableSort, DataTableTexts } from '@/components/shared/data-table/data-table-types'

/**
 * `data-table-header-menu.tsx` (`design.md > 2, 5, 8`, T7): menu por columna y celda de cabecera.
 *
 * Asserts sobre roles ARIA, `data-testid` y constantes -nunca sobre el copy de relleno de
 * `texts`- (decision 20, R36).
 */

type FilaDePrueba = { readonly id: string }

const TEXTOS_DE_RELLENO: DataTableTexts = {
  empty: 'empty',
  loading: 'loading',
  error: 'error',
  search: 'search',
  filters: 'filters',
  columnMenu: 'menu-columna',
  previousPage: 'previousPage',
  nextPage: 'nextPage',
  pageIndicator: (page, totalPages) => `${page}/${totalPages}`,
  pageSize: 'pageSize',
  sortAscending: 'sortAscending',
  sortDescending: 'sortDescending',
  pinColumn: 'pinColumn',
  unpinColumn: 'unpinColumn',
  filterColumn: 'filterColumn',
  clearFilter: 'clearFilter',
  lastWeek: 'lastWeek',
  lastMonth: 'lastMonth',
  lastYear: 'lastYear',
}

function columnaOrdenableConFiltro(): DataTableColumn<FilaDePrueba> {
  return {
    id: 'nombre',
    label: 'Nombre',
    align: 'start',
    cell: (row) => row.id,
    sortable: true,
    filter: { kind: 'text' },
  }
}

function renderCelda(props: {
  readonly column: DataTableColumn<FilaDePrueba>
  readonly sort: DataTableSort | null
  readonly onSortChange: (sort: DataTableSort | null) => void
}) {
  return render(
    <table>
      <thead>
        <tr>
          <DataTableHeaderCell column={props.column} sort={props.sort} onSortChange={props.onSortChange} />
        </tr>
      </thead>
    </table>,
  )
}

describe('DataTableHeaderCell: orden por teclado y aria-sort', () => {
  it('activar la cabecera con teclado emite el orden ascendente cuando no habia orden previo', async () => {
    // R12, R14.
    const usuario = setupUser()
    const onSortChange = vi.fn()
    renderCelda({ column: columnaOrdenableConFiltro(), sort: null, onSortChange })

    await usuario.tab()
    await usuario.keyboard('{Enter}')

    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({ columnId: 'nombre', direction: 'asc' })
  })

  it('una columna sin sortable no ofrece boton de orden y no emite nada al interactuar', async () => {
    // R14.
    const usuario = setupUser()
    const onSortChange = vi.fn()
    const columnaNoOrdenable: DataTableColumn<FilaDePrueba> = {
      id: 'descripcion',
      label: 'Descripcion',
      align: 'start',
      cell: (row) => row.id,
    }
    renderCelda({ column: columnaNoOrdenable, sort: null, onSortChange })

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('data-table-head-descripcion')).not.toHaveAttribute('aria-sort')

    await usuario.tab()
    await usuario.keyboard('{Enter}')

    expect(onSortChange).not.toHaveBeenCalled()
  })

  it('refleja los tres valores de aria-sort segun el orden vigente', () => {
    // R12.
    const columna = columnaOrdenableConFiltro()

    const { unmount: cerrarSinOrden } = renderCelda({ column: columna, sort: null, onSortChange: vi.fn() })
    expect(screen.getByTestId('data-table-head-nombre')).toHaveAttribute('aria-sort', 'none')
    cerrarSinOrden()

    const { unmount: cerrarAsc } = renderCelda({
      column: columna,
      sort: { columnId: 'nombre', direction: 'asc' },
      onSortChange: vi.fn(),
    })
    expect(screen.getByTestId('data-table-head-nombre')).toHaveAttribute('aria-sort', 'ascending')
    cerrarAsc()

    renderCelda({
      column: columna,
      sort: { columnId: 'nombre', direction: 'desc' },
      onSortChange: vi.fn(),
    })
    expect(screen.getByTestId('data-table-head-nombre')).toHaveAttribute('aria-sort', 'descending')
  })

  it('alterna descendente -> ascendente al reactivar una cabecera ya en orden descendente', async () => {
    // R12: la alternancia no vuelve a "sin orden".
    const usuario = setupUser()
    const onSortChange = vi.fn()
    renderCelda({
      column: columnaOrdenableConFiltro(),
      sort: { columnId: 'nombre', direction: 'desc' },
      onSortChange,
    })

    await usuario.tab()
    await usuario.keyboard('{Enter}')

    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({ columnId: 'nombre', direction: 'asc' })
  })
})

describe('DataTableHeaderMenu: disparador, acciones y tamano tactil', () => {
  it('el disparador cumple el objetivo tactil minimo y se abre por teclado', async () => {
    // R27.
    const usuario = setupUser()
    render(
      <DataTableHeaderMenu
        column={columnaOrdenableConFiltro()}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    const disparador = screen.getByTestId('data-table-header-menu-nombre')
    expect(disparador).toHaveClass('min-h-11')
    expect(disparador).toHaveClass('min-w-11')
    expect(screen.queryByTestId('data-table-sort-asc-nombre')).not.toBeInTheDocument()

    await usuario.tab()
    await usuario.keyboard('{Enter}')

    expect(await screen.findByTestId('data-table-sort-asc-nombre')).toBeInTheDocument()
  })

  it('ordenar ascendente y descendente emiten el orden esperado y solo aparecen si la columna es sortable', async () => {
    // R12, R14.
    const usuario = setupUser()
    const onSortChange = vi.fn()
    render(
      <DataTableHeaderMenu
        column={columnaOrdenableConFiltro()}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={onSortChange}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-nombre'))
    await usuario.click(await esperarInteractiva(await screen.findByTestId('data-table-sort-desc-nombre')))

    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({ columnId: 'nombre', direction: 'desc' })
  })

  it('una columna sin sortable no ofrece las acciones de orden en el menu', async () => {
    // R14.
    const usuario = setupUser()
    const columnaNoOrdenable: DataTableColumn<FilaDePrueba> = {
      id: 'descripcion',
      label: 'Descripcion',
      align: 'start',
      cell: (row) => row.id,
      filter: { kind: 'text' },
    }
    render(
      <DataTableHeaderMenu
        column={columnaNoOrdenable}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-descripcion'))

    expect(screen.queryByTestId('data-table-sort-asc-descripcion')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-sort-desc-descripcion')).not.toBeInTheDocument()
  })

  it('fijar emite onTogglePin y una columna pinnable:false no ofrece la accion de fijar', async () => {
    // R23.
    const usuario = setupUser()
    const onTogglePin = vi.fn()
    render(
      <DataTableHeaderMenu
        column={columnaOrdenableConFiltro()}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={onTogglePin}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-nombre'))
    await usuario.click(await esperarInteractiva(await screen.findByTestId('data-table-pin-nombre')))

    expect(onTogglePin).toHaveBeenCalledOnce()

    const columnaNoFijable: DataTableColumn<FilaDePrueba> = {
      ...columnaOrdenableConFiltro(),
      id: 'no-fijable',
      pinnable: false,
    }
    render(
      <DataTableHeaderMenu
        column={columnaNoFijable}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-no-fijable'))

    expect(screen.queryByTestId('data-table-pin-no-fijable')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-unpin-no-fijable')).not.toBeInTheDocument()
  })

  it('una columna fijada ofrece "soltar" en vez de "fijar"', async () => {
    // R23.
    const usuario = setupUser()
    render(
      <DataTableHeaderMenu
        column={columnaOrdenableConFiltro()}
        sort={null}
        isPinned
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-nombre'))

    expect(await screen.findByTestId('data-table-unpin-nombre')).toBeInTheDocument()
    expect(screen.queryByTestId('data-table-pin-nombre')).not.toBeInTheDocument()
  })

  it('abrir el filtro emite onOpenFilter y una columna sin filter no ofrece la accion', async () => {
    // R15.
    const usuario = setupUser()
    const onOpenFilter = vi.fn()
    render(
      <DataTableHeaderMenu
        column={columnaOrdenableConFiltro()}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={onOpenFilter}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-nombre'))
    await usuario.click(await esperarInteractiva(await screen.findByTestId('data-table-filter-open-nombre')))

    expect(onOpenFilter).toHaveBeenCalledOnce()

    const columnaSinFiltro: DataTableColumn<FilaDePrueba> = {
      id: 'sin-filtro',
      label: 'Sin filtro',
      align: 'start',
      cell: (row) => row.id,
      sortable: true,
    }
    render(
      <DataTableHeaderMenu
        column={columnaSinFiltro}
        sort={null}
        isPinned={false}
        texts={TEXTOS_DE_RELLENO}
        onSortChange={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenFilter={vi.fn()}
      />,
    )

    await usuario.click(screen.getByTestId('data-table-header-menu-sin-filtro'))

    expect(screen.queryByTestId('data-table-filter-open-sin-filtro')).not.toBeInTheDocument()
  })
})
