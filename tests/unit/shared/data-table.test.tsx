import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DATA_TABLE_FEATURES,
  DATA_TABLE_OPTED_FEATURES,
  DataTable,
} from '@/components/shared/data-table/data-table'
import { createDefaultParams, withSort } from '@/components/shared/data-table/data-table-params'
// QC-35 T4: la clave de `localStorage` se construye con la funcion del propio hook, nunca a mano.
import { buildPinningStorageKey } from '@/components/shared/data-table/use-pinned-columns'
import type {
  DataTableColumn,
  DataTableParams,
  DataTableProps,
  DataTableTexts,
} from '@/components/shared/data-table/data-table-types'

/**
 * `data-table.tsx` (`design.md > 1, 4, 5`, T11): el componente compuesto.
 *
 * Asserts sobre roles ARIA, `data-testid` y constantes exportadas -nunca sobre el copy de
 * relleno de `texts`- (decision 20, R36). El mapa `R<n> -> test` completo de la feature lo
 * escribe T15 en `progress/impl_QC-55-*.md`; aqui cada `it` anota los requisitos que cubre.
 */

// Objeto de relleno: los tests NUNCA afirman sobre el valor de estos textos (R22, decision 20).
const texts: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'fallo',
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

type Producto = { readonly id: string; readonly nombre: string; readonly stock: number }
type Receta = { readonly codigo: string; readonly titulo: string }

const PRODUCTOS: readonly Producto[] = [
  { id: 'p3', nombre: 'Tercero', stock: 3 },
  { id: 'p1', nombre: 'Primero', stock: 1 },
  { id: 'p2', nombre: 'Segundo', stock: 2 },
]

function columnasProducto(overrides: Partial<DataTableColumn<Producto>> = {}): readonly DataTableColumn<Producto>[] {
  return [
    { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre, sortable: true, ...overrides },
    { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
  ]
}

function renderTabla(overrides: Partial<DataTableProps<Producto>> = {}) {
  const onParamsChange = overrides.onParamsChange ?? vi.fn<(next: DataTableParams) => void>()
  const props: DataTableProps<Producto> = {
    tableId: overrides.tableId ?? 'productos-test',
    columns: overrides.columns ?? columnasProducto(),
    rows: overrides.rows ?? PRODUCTOS,
    getRowId: overrides.getRowId ?? ((row) => row.id),
    params: overrides.params ?? createDefaultParams(),
    totalPages: overrides.totalPages ?? 1,
    onParamsChange,
    status: overrides.status ?? 'idle',
    errorMessage: overrides.errorMessage,
    texts,
    emptyAction: overrides.emptyAction,
    toolbarActions: overrides.toolbarActions,
  }

  render(<DataTable {...props} />)
  return { onParamsChange, props }
}

describe('DataTable: neutralidad frente a los parametros (R13)', () => {
  it('pinta las filas exactamente como llegan, en el mismo orden, aunque sort/filtros/pagina digan otra cosa', () => {
    const paramsEngañosos: DataTableParams = {
      page: 99,
      pageSize: 25,
      sort: { columnId: 'nombre', direction: 'desc' },
      filters: { nombre: { kind: 'text', value: 'algo-que-no-coincide' } },
      search: 'busqueda-sin-efecto',
    }

    renderTabla({ params: paramsEngañosos, totalPages: 200 })

    const filas = screen.getAllByRole('row').slice(1) // sin la fila de cabecera
    const idsEnOrden = filas.map((fila) => fila.getAttribute('data-testid'))

    expect(idsEnOrden).toEqual(['data-table-row-p3', 'data-table-row-p1', 'data-table-row-p2'])
    expect(within(filas[0]).getByTestId('data-table-cell-nombre')).toHaveTextContent('Tercero')
    expect(within(filas[1]).getByTestId('data-table-cell-nombre')).toHaveTextContent('Primero')
    expect(within(filas[2]).getByTestId('data-table-cell-nombre')).toHaveTextContent('Segundo')
  })
})

describe('DATA_TABLE_FEATURES / DATA_TABLE_OPTED_FEATURES (R32)', () => {
  it('la lista de capacidades optadas es exactamente columnPinningFeature + columnSizingFeature + rowSortingFeature y no mas', () => {
    expect(DATA_TABLE_OPTED_FEATURES).toEqual([
      'columnPinningFeature',
      'columnSizingFeature',
      'rowSortingFeature',
    ])
    expect(Object.keys(DATA_TABLE_FEATURES).sort()).toEqual([...DATA_TABLE_OPTED_FEATURES].sort())
    expect(Object.keys(DATA_TABLE_FEATURES)).toHaveLength(3)

    const noOptadas = [
      'columnResizingFeature',
      'columnVisibilityFeature',
      'columnOrderingFeature',
      'columnGroupingFeature',
      'columnFacetingFeature',
      'columnFilteringFeature',
      'globalFilteringFeature',
      'rowPaginationFeature',
      'rowSelectionFeature',
      'rowExpandingFeature',
      'rowPinningFeature',
      'rowAggregationFeature',
      'cellSelectionFeature',
      'cellSpanningFeature',
    ]
    for (const feature of noOptadas) {
      expect(DATA_TABLE_OPTED_FEATURES).not.toContain(feature)
      expect(Object.keys(DATA_TABLE_FEATURES)).not.toContain(feature)
    }
  })
})

describe('DataTable: columnas fijadas (R23, R24)', () => {
  /**
   * `DataTableColumn` (el contrato de esta ficha, que este test NO puede tocar) no expone un
   * `size` por columna, asi que el componente no lo reenvia y todas las columnas "display" caen
   * en el tamano por defecto de la libreria: `getDefaultColumnSizingColumnDef().size === 150`
   * (verificado en
   * `node_modules/@tanstack/table-core/dist/features/column-sizing/columnSizingFeature.utils.js`).
   * No es un numero que invente esta ficha: es el default publicado de `columnSizingFeature`, y es
   * justo lo que distingue este test de la implementacion incorrecta que reemplaza (el
   * `PINNED_COLUMN_OFFSET_PX = 160` que se ha borrado): si alguien reintroduce ese ancho fijo por
   * posicion, el desplazamiento observado (150) deja de coincidir con el asertado.
   */
  const TANSTACK_DEFAULT_COLUMN_SIZE_PX = 150

  it('fijar una columna le aplica position sticky y un desplazamiento calculado por getStart/getAfter, no un numero magico propio', async () => {
    const columnas = [
      { id: 'nombre', label: 'Nombre', align: 'start' as const, cell: (row: Producto) => row.nombre, sortable: true },
      { id: 'stock', label: 'Stock', align: 'end' as const, cell: (row: Producto) => String(row.stock) },
    ]
    renderTabla({ columns: columnas })

    // Fija la SEGUNDA columna (jsdom no calcula layout: `tests/helpers/viewport.ts` no ayuda
    // aqui porque el desplazamiento no depende del viewport, sino del orden entre columnas
    // fijadas; fijar la primera del lado daria offset 0 legitimamente).
    fireEvent.click(screen.getByTestId('data-table-header-menu-stock'))
    fireEvent.click(await screen.findByTestId('data-table-pin-stock'))

    const cabeceraFijada = await screen.findByTestId('data-table-head-stock')
    expect(cabeceraFijada).toHaveAttribute('data-pinned', 'left')
    expect(cabeceraFijada.style.position).toBe('sticky')
    expect(cabeceraFijada.style.left).toBe('0px')

    // Fija tambien la primera columna: ahora "stock" (fijada antes) sigue en offset 0 y
    // "nombre" (fijada despues) arranca exactamente donde termina "stock" -la suma de
    // `getSize()` de las columnas fijadas anteriores en esa region, que es lo que hace
    // `column.getStart('start')`-, no un multiplo de un ancho inventado por esta ficha.
    fireEvent.click(screen.getByTestId('data-table-header-menu-nombre'))
    fireEvent.click(await screen.findByTestId('data-table-pin-nombre'))

    const segundaCabeceraFijada = await screen.findByTestId('data-table-head-nombre')
    expect(segundaCabeceraFijada.style.left).toBe(`${TANSTACK_DEFAULT_COLUMN_SIZE_PX}px`)

    const [celda] = screen.getAllByTestId('data-table-cell-nombre')
    expect(celda).toHaveAttribute('data-pinned', 'left')
    expect(celda.style.position).toBe('sticky')
    expect(celda.style.left).toBe(segundaCabeceraFijada.style.left)
  })
})

describe('DataTable: cero imports prohibidos (R2, R30)', () => {
  it('ningun archivo del directorio importa lib/modules, lib/composition, lib/shared/db ni next/navigation', () => {
    const directorio = path.join(process.cwd(), 'components', 'shared', 'data-table')
    const prohibidos = [/['"]@\/lib\/modules/, /['"]@\/lib\/composition/, /['"].*lib\/shared\/db/, /['"]next\/navigation['"]/]

    const archivos = readdirSync(directorio).filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
    expect(archivos.length).toBeGreaterThan(0)

    for (const archivo of archivos) {
      const contenido = readFileSync(path.join(directorio, archivo), 'utf-8')
      for (const patron of prohibidos) {
        expect(contenido, `${archivo} no debe importar ${patron}`).not.toMatch(patron)
      }
    }
  })
})

describe('Barrel de components/shared/data-table (R1)', () => {
  it('exporta el componente y sus tipos, y nada interno mas', async () => {
    const barrel = await import('@/components/shared/data-table')
    const exportado = Object.keys(barrel).sort()

    expect(exportado).toEqual(
      [
        'DataTable',
        'DATA_TABLE_FEATURES',
        'DATA_TABLE_OPTED_FEATURES',
        'createDefaultParams',
        'PAGE_SIZE_OPTIONS',
        'SEARCH_DEBOUNCE_MS',
        'withFilter',
        'withPage',
        'withPageSize',
        'withSearch',
        'withSort',
      ].sort(),
    )

    // Nada de piezas internas coladas por el barrel.
    expect(exportado).not.toContain('DataTableHeaderMenu')
    expect(exportado).not.toContain('DataTableFilters')
    expect(exportado).not.toContain('DataTableFilterDate')
    expect(exportado).not.toContain('DataTablePagination')
    expect(exportado).not.toContain('usePinnedColumns')
    expect(exportado).not.toContain('resolveDataTableState')
  })
})

describe('DataTable: los cuatro desenlaces de status (R19, R20, R21)', () => {
  it('error: role alert, sin filas, sin barras', () => {
    renderTabla({ status: 'error', errorMessage: 'fallo de red', rows: [] })

    expect(screen.getByTestId('data-table-error')).toBeInTheDocument()
    expect(screen.queryByTestId('data-table-filters')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-pagination')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('loading: indicador de carga, con las barras visibles', () => {
    renderTabla({ status: 'loading' })

    expect(screen.getByTestId('data-table-loading')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filters')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('vacio: sin filas y sin carga ni error, estado vacio identificable', () => {
    renderTabla({ status: 'idle', rows: [] })

    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('filas: se pinta la tabla', () => {
    renderTabla({ status: 'idle' })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByTestId('data-table-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-error')).not.toBeInTheDocument()
  })
})

describe('DataTable: ordenar por la cabecera (R6, R7, R12)', () => {
  it('activar una cabecera ordenable invoca onParamsChange una sola vez con el conjunto completo', () => {
    const params = createDefaultParams()
    const { onParamsChange } = renderTabla({ params })

    fireEvent.click(screen.getByText('Nombre'))

    expect(onParamsChange).toHaveBeenCalledOnce()
    expect(onParamsChange).toHaveBeenCalledWith(
      withSort(params, { columnId: 'nombre', direction: 'asc' }),
    )
  })
})

describe('DataTable: misma API para dos tipos de fila distintos (R4)', () => {
  it('presenta filas de un segundo tipo de entidad sin cambiar la API del componente', () => {
    const recetas: readonly Receta[] = [
      { codigo: 'r1', titulo: 'Jarabe' },
      { codigo: 'r2', titulo: 'Ungüento' },
    ]
    const columnasReceta: readonly DataTableColumn<Receta>[] = [
      { id: 'titulo', label: 'Titulo', align: 'start', cell: (row) => row.titulo },
    ]

    render(
      <DataTable
        tableId="recetas-test"
        columns={columnasReceta}
        rows={recetas}
        getRowId={(row) => row.codigo}
        params={createDefaultParams()}
        totalPages={1}
        onParamsChange={vi.fn()}
        status="idle"
        texts={texts}
      />,
    )

    expect(screen.getByTestId('data-table-row-r1')).toHaveTextContent('Jarabe')
    expect(screen.getByTestId('data-table-row-r2')).toHaveTextContent('Ungüento')
  })
})

describe('DataTable: desbordamiento contenido en la tabla (R28)', () => {
  it('el scroll horizontal vive en div[data-slot=table-container], no en un ancestro del documento', () => {
    renderTabla()

    const contenedor = document.querySelector('[data-slot="table-container"]')
    expect(contenedor).not.toBeNull()
    expect(contenedor).toHaveClass('overflow-x-auto')
    expect(contenedor?.contains(screen.getByRole('table'))).toBe(true)
  })

  it('ningun archivo de la feature contiene 100vh', () => {
    const directorio = path.join(process.cwd(), 'components', 'shared', 'data-table')
    const archivos = readdirSync(directorio).filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))

    for (const archivo of archivos) {
      const contenido = readFileSync(path.join(directorio, archivo), 'utf-8')
      expect(contenido, `${archivo} no debe usar 100vh`).not.toMatch(/100vh/)
    }
  })
})

describe('DataTable: toolbarActions (R30)', () => {
  it('se pinta tal cual, decidido por la pantalla', () => {
    renderTabla({ toolbarActions: <button type="button">Nuevo producto</button> })

    const barraAcciones = screen.getByTestId('data-table-toolbar-actions')
    expect(within(barraAcciones).getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument()
  })
})

/**
 * QC-35 T4 (`design.md > 6.3`, R19): la prop `defaultPinnedColumns`. Casos NUEVOS; ningun test
 * previo de este archivo cambia, porque sin la prop el comportamiento es el de siempre.
 *
 * Se renderiza con props propias (no con `renderTabla`) para no tocar el helper existente, y
 * cada caso usa su propio `tableId` para no compartir estado de `localStorage`.
 */
describe('DataTable: columna fijada por defecto (QC-35 R19)', () => {
  const columnas: readonly DataTableColumn<Producto>[] = [
    { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
    { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
  ]

  function renderConDefecto(tableId: string, defaultPinnedColumns?: readonly string[]) {
    const props: DataTableProps<Producto> = {
      tableId,
      columns: columnas,
      rows: PRODUCTOS,
      getRowId: (row) => row.id,
      params: createDefaultParams(),
      totalPages: 1,
      onParamsChange: vi.fn<(next: DataTableParams) => void>(),
      status: 'idle',
      texts,
      defaultPinnedColumns,
    }
    render(<DataTable {...props} />)
  }

  afterEach(() => {
    window.localStorage.clear()
  })

  it('sin nada persistido, la columna declarada nace fijada al borde izquierdo', () => {
    renderConDefecto('qc35-defecto-limpio', ['nombre'])

    expect(screen.getByTestId('data-table-head-nombre')).toHaveAttribute('data-pinned', 'left')
    expect(screen.getAllByTestId('data-table-cell-nombre')[0]).toHaveAttribute('data-pinned', 'left')
    // Solo la declarada: el resto sigue sin fijar.
    expect(screen.getByTestId('data-table-head-stock')).not.toHaveAttribute('data-pinned')
  })

  it('con algo persistido para ese tableId gana lo persistido, no el defecto (R25, R26)', () => {
    window.localStorage.setItem(
      buildPinningStorageKey('qc35-defecto-con-persistido'),
      JSON.stringify({ left: ['stock'], right: [] }),
    )

    renderConDefecto('qc35-defecto-con-persistido', ['nombre'])

    expect(screen.getByTestId('data-table-head-stock')).toHaveAttribute('data-pinned', 'left')
    expect(screen.getByTestId('data-table-head-nombre')).not.toHaveAttribute('data-pinned')
  })

  it('si el usuario solto TODO, su decision se recuerda y el defecto no revive (R25, R26)', () => {
    window.localStorage.setItem(
      buildPinningStorageKey('qc35-defecto-soltado'),
      JSON.stringify({ left: [], right: [] }),
    )

    renderConDefecto('qc35-defecto-soltado', ['nombre'])

    expect(screen.getByTestId('data-table-head-nombre')).not.toHaveAttribute('data-pinned')
    expect(screen.getByTestId('data-table-head-stock')).not.toHaveAttribute('data-pinned')
  })

  it('sin la prop no hay nada fijado al montar (comportamiento de siempre)', () => {
    renderConDefecto('qc35-sin-defecto')

    expect(screen.getByTestId('data-table-head-nombre')).not.toHaveAttribute('data-pinned')
    expect(screen.getByTestId('data-table-head-stock')).not.toHaveAttribute('data-pinned')
  })

  it('la columna fijada por defecto se puede soltar desde el menu de su cabecera (R25)', async () => {
    renderConDefecto('qc35-defecto-soltable', ['nombre'])

    expect(screen.getByTestId('data-table-head-nombre')).toHaveAttribute('data-pinned', 'left')

    fireEvent.click(screen.getByTestId('data-table-header-menu-nombre'))
    fireEvent.click(await screen.findByTestId('data-table-unpin-nombre'))

    expect(screen.getByTestId('data-table-head-nombre')).not.toHaveAttribute('data-pinned')
    expect(
      JSON.parse(window.localStorage.getItem(buildPinningStorageKey('qc35-defecto-soltable')) as string),
    ).toEqual({ left: [], right: [] })
  })
})
