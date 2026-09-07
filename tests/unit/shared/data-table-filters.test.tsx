import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataTableFilters } from '@/components/shared/data-table/data-table-filters'
import { SEARCH_DEBOUNCE_MS, createDefaultParams, withFilter } from '@/components/shared/data-table/data-table-params'
import type { DataTableColumn, DataTableParams, DataTableTexts } from '@/components/shared/data-table/data-table-types'
import { NARROW_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport'

/**
 * `data-table-filters.tsx`: R15, R16, R17, R27 (`design.md`, T8).
 *
 * **Solo se afirma sobre lo emitido** (`DataTableFilterValue`, `data-testid`, roles ARIA), nunca
 * sobre el copy (R21/decision 20 aplicada por analogia: el copy llega por `texts`, aqui de
 * relleno).
 */

type Row = { readonly id: string }

// Objeto de relleno: los tests NUNCA afirman sobre el valor de estos textos (R22, decision 20).
const texts: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'error',
  search: 'buscar',
  filters: 'filtros',
  columnMenu: 'menu-columna',
  previousPage: 'anterior',
  nextPage: 'siguiente',
  pageIndicator: (page, totalPages) => `${page}/${totalPages}`,
  pageSize: 'tamano',
  sortAscending: 'asc',
  sortDescending: 'desc',
  pinColumn: 'fijar',
  unpinColumn: 'soltar',
  filterColumn: 'filtrar',
  clearFilter: 'limpiar',
  lastWeek: 'ultima semana',
  lastMonth: 'ultimo mes',
  lastYear: 'ultimo año',
}

const columns: readonly DataTableColumn<Row>[] = [
  { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.id, filter: { kind: 'text' } },
  { id: 'cantidad', label: 'Cantidad', align: 'end', cell: (row) => row.id, filter: { kind: 'numberRange' } },
  {
    id: 'estado',
    label: 'Estado',
    align: 'start',
    cell: (row) => row.id,
    filter: {
      kind: 'select',
      options: [
        { value: 'activo', label: 'Activo' },
        { value: 'inactivo', label: 'Inactivo' },
      ],
    },
  },
  { id: 'creado', label: 'Creado', align: 'start', cell: (row) => row.id, filter: { kind: 'dateRange' } },
  // Sin `filter`: NO debe aparecer en la barra (R15, negativo).
  { id: 'notas', label: 'Notas', align: 'start', cell: (row) => row.id },
]

function renderFilters(overrides: Partial<{ params: DataTableParams; onParamsChange: (next: DataTableParams) => void }> = {}) {
  const onParamsChange = overrides.onParamsChange ?? vi.fn()
  const params = overrides.params ?? createDefaultParams()

  render(<DataTableFilters columns={columns} params={params} texts={texts} onParamsChange={onParamsChange} />)

  return { onParamsChange: onParamsChange as ReturnType<typeof vi.fn>, params }
}

// jsdom no implementa `window.matchMedia`: el filtro de fecha anidado lo usa para elegir 1/2
// meses de calendario. `tests/helpers/viewport.ts` (heredado) lo stubea.
beforeEach(() => {
  setViewportWidth(NARROW_VIEWPORT)
})

afterEach(() => {
  resetViewport()
})

describe('DataTableFilters: solo aparecen las columnas que declaran filter (R15)', () => {
  it('la columna sin filter NO aparece en la barra (negativo)', () => {
    renderFilters()

    expect(screen.queryByTestId('data-table-filter-notas')).not.toBeInTheDocument()
    expect(screen.getByTestId('data-table-filters')).toBeInTheDocument()
  })

  it('las columnas con filter si aparecen, una por forma', () => {
    renderFilters()

    expect(screen.getByTestId('data-table-filter-nombre')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-min-cantidad')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-max-cantidad')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-estado')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-date-creado')).toBeInTheDocument()
  })
})

describe('DataTableFilters: un test por forma, afirmando el DataTableFilterValue emitido (R16)', () => {
  it('forma "text": escribir en el campo emite { kind: "text", value }', async () => {
    const user = userEvent.setup()
    const { onParamsChange, params } = renderFilters()

    // Sin rebote (a diferencia de la busqueda global, R17): cada pulsacion emite de inmediato.
    // Como el campo es controlado por `params` y este test no lo re-alimenta entre pulsaciones,
    // se afirma sobre UNA sola tecla en vez de una palabra completa.
    await user.type(screen.getByTestId('data-table-filter-nombre'), 'a')

    const emitido = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
    expect(emitido.filters.nombre).toEqual({ kind: 'text', value: 'a' })
    expect(emitido).toEqual(withFilter(params, 'nombre', { kind: 'text', value: 'a' }))
  })

  it('forma "numberRange": min y max emiten { kind: "numberRange", min, max }', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderFilters()

    await user.type(screen.getByTestId('data-table-filter-min-cantidad'), '5')

    const trasMin = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
    expect(trasMin.filters.cantidad).toEqual({ kind: 'numberRange', min: 5, max: null })
  })

  it('forma "select": marcar una opcion emite { kind: "select", values }', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderFilters()

    // `fireEvent.click` (no `userEvent.click`): el menu de Base UI, en jsdom, no abre con la
    // primera secuencia realista de puntero cuando ya hay otros popups (Popover del filtro de
    // fecha) montados en el arbol -es un artefacto del entorno de pruebas, no del navegador
    // real-; un `click` sintetico simple si lo abre de forma fiable.
    fireEvent.click(screen.getByTestId('data-table-filter-estado'))
    await user.click(screen.getByTestId('data-table-filter-option-estado-activo'))

    const ultima = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
    expect(ultima.filters.estado).toEqual({ kind: 'select', values: ['activo'] })
  })

  it('forma "dateRange": un atajo del filtro de fecha emite { kind: "dateRange", from, to }', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderFilters()

    await user.click(screen.getByTestId('data-table-filter-date-creado'))
    await user.click(screen.getByTestId('data-table-date-last-week'))

    const ultima = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
    expect(ultima.filters.creado?.kind).toBe('dateRange')
    if (ultima.filters.creado?.kind === 'dateRange') {
      expect(ultima.filters.creado.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(ultima.filters.creado.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('DataTableFilters: limpiar SACA la clave del objeto en vez de emitirla vacia (R16)', () => {
  it('el boton de limpiar de un filtro activo saca su clave de `filters`', async () => {
    const user = userEvent.setup()
    const conFiltro = withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'acido' })
    const { onParamsChange } = renderFilters({ params: conFiltro })

    await user.click(screen.getByTestId('data-table-filter-clear-nombre'))

    expect(onParamsChange).toHaveBeenCalledTimes(1)
    const emitido = onParamsChange.mock.calls[0]?.[0] as DataTableParams
    expect(Object.prototype.hasOwnProperty.call(emitido.filters, 'nombre')).toBe(false)
    expect(emitido.filters).toEqual({})
  })

  it('limpiar un filtro no toca los demas filtros activos', async () => {
    const user = userEvent.setup()
    const conDos = withFilter(
      withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'acido' }),
      'cantidad',
      { kind: 'numberRange', min: 1, max: 10 },
    )
    const { onParamsChange } = renderFilters({ params: conDos })

    await user.click(screen.getByTestId('data-table-filter-clear-nombre'))

    const emitido = onParamsChange.mock.calls[0]?.[0] as DataTableParams
    expect(emitido.filters).toEqual({ cantidad: { kind: 'numberRange', min: 1, max: 10 } })
  })
})

describe('DataTableFilters: la busqueda global se emite en su propio campo, con rebote (R17)', () => {
  it('escribir en la busqueda emite `search` (no `filters`) tras el rebote', async () => {
    vi.useFakeTimers()
    const onParamsChange = vi.fn()
    const params = withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'x' })

    render(<DataTableFilters columns={columns} params={params} texts={texts} onParamsChange={onParamsChange} />)

    const campoBusqueda = screen.getByTestId('data-table-search')
    expect(campoBusqueda).toHaveAttribute('type', 'search')

    // `fireEvent.change` en vez de `userEvent.type`: con temporizadores falseados,
    // `userEvent`+Vitest 4 en este repo no resuelve su espera interna (cuelga el test) incluso
    // sobre un `<input>` nativo aislado, sin relacion con este componente. `fireEvent.change`
    // dispara el mismo evento `onChange` sin esa espera.
    fireEvent.change(campoBusqueda, { target: { value: 'acido' } })

    // Antes del rebote, no se emitio nada todavia.
    expect(onParamsChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)

    expect(onParamsChange).toHaveBeenCalledTimes(1)
    const emitido = onParamsChange.mock.calls[0]?.[0] as DataTableParams
    expect(emitido.search).toBe('acido')
    expect(emitido.filters).toEqual(params.filters)

    vi.useRealTimers()
  })
})

describe('DataTableFilters: acciones de la barra (R30)', () => {
  it('renderiza `toolbarActions` bajo su propio data-testid cuando se recibe', () => {
    render(
      <DataTableFilters
        columns={columns}
        params={createDefaultParams()}
        texts={texts}
        onParamsChange={vi.fn()}
        toolbarActions={<button type="button">Nuevo</button>}
      />,
    )

    expect(screen.getByTestId('data-table-toolbar-actions')).toBeInTheDocument()
  })
})

describe('DataTableFilters: objetivos tactiles minimos (R27)', () => {
  it('el campo de busqueda cumple min-h-11 min-w-11 y text-base', () => {
    renderFilters()

    const campo = screen.getByTestId('data-table-search')
    expect(campo.className).toMatch(/min-h-11/)
    expect(campo.className).toMatch(/min-w-11/)
    expect(campo.className).toMatch(/text-base/)
  })
})

/**
 * QC-35 T4 (`design.md > 6.2`, R20): la prop `searchable`. Casos NUEVOS; ningun test previo de
 * este archivo cambia, porque el defecto de la prop es el comportamiento de siempre.
 */
describe('DataTableFilters: campo de busqueda opcional (QC-35 R20)', () => {
  it('con `searchable={false}` el campo de busqueda NO existe en el DOM', () => {
    render(
      <DataTableFilters
        columns={columns}
        params={createDefaultParams()}
        texts={texts}
        onParamsChange={vi.fn()}
        searchable={false}
      />,
    )

    expect(screen.queryByTestId('data-table-search')).toBeNull()
  })

  it('con `searchable={false}` los filtros por columna se siguen montando', () => {
    render(
      <DataTableFilters
        columns={columns}
        params={createDefaultParams()}
        texts={texts}
        onParamsChange={vi.fn()}
        searchable={false}
      />,
    )

    expect(screen.getByTestId('data-table-filter-nombre')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-estado')).toBeInTheDocument()
  })

  it('sin la prop, el campo de busqueda SI existe (ausente = true, comportamiento de siempre)', () => {
    renderFilters()

    expect(screen.getByTestId('data-table-search')).toBeInTheDocument()
  })

  it('con `searchable={true}` explicito el campo de busqueda existe igual', () => {
    render(
      <DataTableFilters
        columns={columns}
        params={createDefaultParams()}
        texts={texts}
        onParamsChange={vi.fn()}
        searchable
      />,
    )

    expect(screen.getByTestId('data-table-search')).toBeInTheDocument()
  })
})
