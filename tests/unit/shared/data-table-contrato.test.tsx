// Cobertura de contrato de QC-55: R9, R5, R3, R30.
//
// Archivo CON DOM (`.test.tsx`, proyecto `ui` de Vitest, jsdom). Complementa
// `data-table.test.tsx` (de otro agente, no se toca) con las partes de estos requisitos que
// aun no tenian test: consumo desde un envoltorio de cliente sin serializar nada (R9), que el
// componente no guarda el estado de lista salvo el pineo (R5), que las columnas son datos (R3) y
// que el componente no decide permisos (R30).

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Import EXCLUSIVAMENTE por el barrel (R1, R9): nada de rutas profundas.
import {
  createDefaultParams,
  DataTable,
  type DataTableColumn,
  type DataTableParams,
  type DataTableProps,
  type DataTableTexts,
} from '@/components/shared/data-table'

const DATA_TABLE_DIR = path.join(process.cwd(), 'components', 'shared', 'data-table')

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
  pageIndicator: (page, totalPages) => `pagina-${page}-de-${totalPages}`,
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

const PRODUCTOS: readonly Producto[] = [
  { id: 'p1', nombre: 'Primero', stock: 1 },
  { id: 'p2', nombre: 'Segundo', stock: 2 },
]

function baseProps(overrides: Partial<DataTableProps<Producto>> = {}): DataTableProps<Producto> {
  return {
    tableId: overrides.tableId ?? 'contrato-test',
    columns:
      overrides.columns ??
      [
        { id: 'nombre', label: 'Nombre', align: 'start', cell: (row: Producto) => row.nombre, sortable: true },
        { id: 'stock', label: 'Stock', align: 'end', cell: (row: Producto) => String(row.stock) },
      ],
    rows: overrides.rows ?? PRODUCTOS,
    getRowId: overrides.getRowId ?? ((row: Producto) => row.id),
    params: overrides.params ?? createDefaultParams(),
    totalPages: overrides.totalPages ?? 3,
    onParamsChange: overrides.onParamsChange ?? vi.fn(),
    status: overrides.status ?? 'idle',
    errorMessage: overrides.errorMessage,
    texts,
    emptyAction: overrides.emptyAction,
    toolbarActions: overrides.toolbarActions,
  }
}

describe('DataTable: consumible desde un envoltorio de cliente sin serializar nada (R9)', () => {
  /**
   * Envoltorio propio del test que declara columnas con `cell` (funciones) y un manejador,
   * importando SOLO del barrel: es justo lo que R9 exige que un componente de cliente pueda
   * hacer sin que nada tenga que cruzar la frontera servidor->cliente serializado.
   */
  function ProductTableClientWrapper() {
    const columns: readonly DataTableColumn<Producto>[] = [
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => <span data-testid={`celda-${row.id}`}>{row.nombre}</span> },
    ]
    const handleParamsChange = (_next: DataTableParams) => {
      // Manejador de cliente de verdad, no una prop serializada.
    }

    return (
      <DataTable
        tableId="wrapper-test"
        columns={columns}
        rows={PRODUCTOS}
        getRowId={(row) => row.id}
        params={createDefaultParams()}
        totalPages={1}
        onParamsChange={handleParamsChange}
        status="idle"
        texts={texts}
      />
    )
  }

  it('renderiza con columnas declaradas como funciones y un manejador de cliente', () => {
    render(<ProductTableClientWrapper />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByTestId('celda-p1')).toHaveTextContent('Primero')
    expect(screen.getByTestId('celda-p2')).toHaveTextContent('Segundo')
  })

  it('data-table.tsx declara \'use client\' en su primera linea con codigo', () => {
    const source = readFileSync(path.join(DATA_TABLE_DIR, 'data-table.tsx'), 'utf-8')
    const primeraLineaConCodigo = source.split('\n').find((linea) => linea.trim().length > 0) ?? ''
    expect(primeraLineaConCodigo.trim()).toMatch(/^['"]use client['"];?$/)
  })
})

describe('DataTable: no guarda el estado de lista, salvo el pineo (R5)', () => {
  it('el indicador de pagina sigue mostrando lo que dicen las props hasta que se re-renderiza con params nuevos', () => {
    const onParamsChange = vi.fn()
    const params = createDefaultParams()
    const { rerender } = render(<DataTable {...baseProps({ params, onParamsChange })} />)

    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent('pagina-1-de-3')

    // El usuario pide avanzar de pagina: el componente EMITE, no cambia lo pintado por su cuenta.
    fireEvent.click(screen.getByTestId('data-table-next'))
    expect(onParamsChange).toHaveBeenCalledOnce()
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent('pagina-1-de-3')

    // Solo cuando el consumidor re-renderiza con los params nuevos cambia lo pintado.
    const paramsNuevos = onParamsChange.mock.calls[0]![0] as DataTableParams
    rerender(<DataTable {...baseProps({ params: paramsNuevos, onParamsChange })} />)
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent('pagina-2-de-3')
  })

  it('fijar una columna SI cambia lo pintado sin que cambien los params, y NO emite onParamsChange', async () => {
    const onParamsChange = vi.fn()
    const params = createDefaultParams()
    render(<DataTable {...baseProps({ tableId: 'contrato-r5-pin', params, onParamsChange })} />)

    fireEvent.click(screen.getByTestId('data-table-header-menu-stock'))
    fireEvent.click(await screen.findByTestId('data-table-pin-stock'))

    const cabecera = await screen.findByTestId('data-table-head-stock')
    expect(cabecera).toHaveAttribute('data-pinned', 'left')
    expect(onParamsChange).not.toHaveBeenCalled()
  })
})

describe('DataTable: las columnas son datos, no marcado incrustado (R3)', () => {
  // `tableId` propio y distinto del resto del archivo: el pineo se recuerda en `localStorage`
  // por `tableId` (R25, R26) y `tests/setup.ts` no lo limpia entre tests; reutilizar el
  // `tableId` por defecto arrastraria el pineo que deja el test de R5 sobre la columna `stock`.
  it('la misma tabla pinta columnas distintas segun la configuracion recibida, sin conocer ninguna columna concreta', () => {
    const columnasA: readonly DataTableColumn<Producto>[] = [
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
    ]
    const columnasB: readonly DataTableColumn<Producto>[] = [
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
      { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
    ]

    const { rerender } = render(<DataTable {...baseProps({ tableId: 'contrato-r3-a', columns: columnasA })} />)
    expect(screen.queryByTestId('data-table-head-stock')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(1)

    rerender(<DataTable {...baseProps({ tableId: 'contrato-r3-a', columns: columnasB })} />)
    expect(screen.getByTestId('data-table-head-stock')).toBeInTheDocument()
    const cabeceras = screen.getAllByRole('columnheader')
    expect(cabeceras).toHaveLength(2)
    // El orden de las cabeceras sigue el orden del array de columnas, no uno propio. `data-testid`
    // vive en la propia celda `<th>`, no en un descendiente: se afirma sobre el atributo del
    // elemento devuelto por `getAllByRole`, no con `within(...).getByTestId(...)`.
    expect(cabeceras[0]).toHaveAttribute('data-testid', 'data-table-head-nombre')
    expect(cabeceras[1]).toHaveAttribute('data-testid', 'data-table-head-stock')
  })

  it('invertir el orden del array de columnas invierte el orden de las cabeceras pintadas', () => {
    const columnas: readonly DataTableColumn<Producto>[] = [
      { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
    ]

    render(<DataTable {...baseProps({ tableId: 'contrato-r3-b', columns: columnas })} />)

    const cabeceras = screen.getAllByRole('columnheader')
    expect(cabeceras[0]).toHaveAttribute('data-testid', 'data-table-head-stock')
    expect(cabeceras[1]).toHaveAttribute('data-testid', 'data-table-head-nombre')
  })
})

describe('DataTable: no decide permisos, no lee la sesion (R30)', () => {
  it('toolbarActions llega por props y se pinta tal cual', () => {
    render(<DataTable {...baseProps({ toolbarActions: <button type="button">Accion privada</button> })} />)

    const barra = screen.getByTestId('data-table-toolbar-actions')
    expect(within(barra).getByRole('button', { name: 'Accion privada' })).toBeInTheDocument()
  })

  it('ningun archivo del directorio de la feature contiene getSession, auth(, cookies( ni headers(', () => {
    const archivos = readdirSync(DATA_TABLE_DIR).filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
    const prohibidos = [/getSession/, /\bauth\(/, /\bcookies\(/, /\bheaders\(/]

    expect(archivos.length).toBeGreaterThan(0)

    for (const archivo of archivos) {
      const contenido = readFileSync(path.join(DATA_TABLE_DIR, archivo), 'utf-8')
      for (const patron of prohibidos) {
        expect(contenido, `${archivo} no debe contener ${patron} (R30)`).not.toMatch(patron)
      }
    }
  })
})
