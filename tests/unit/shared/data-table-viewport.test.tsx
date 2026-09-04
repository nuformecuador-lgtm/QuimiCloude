import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataTable } from '@/components/shared/data-table/data-table'
import { createDefaultParams } from '@/components/shared/data-table/data-table-params'
import { computeDateShortcutRange, formatDateLocalISO } from '@/components/shared/data-table/data-table-filter-date'
import type {
  DataTableColumn,
  DataTableParams,
  DataTableProps,
  DataTableTexts,
} from '@/components/shared/data-table/data-table-types'
import { NARROW_VIEWPORT, WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport'

/**
 * `data-table-viewport.test.tsx` (T12, `tasks.md`): los casos sensibles de la tabla compuesta,
 * repetidos en angosto y ancho. R27 (objetivos tactiles y descubribilidad sin `:hover`), R28
 * (el scroll horizontal vive en la tabla, nunca en el documento; nada de `100vh`) y R29 (se
 * verifica en los dos anchos, sin excepcion de escritorio).
 *
 * Asserts sobre roles ARIA, `data-testid` y constantes -nunca sobre el copy de relleno de
 * `texts`- (decision 20, R36).
 */

const TOUCH_TARGET_CLASSES = ['min-h-11', 'min-w-11'] as const

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

type Producto = { readonly id: string; readonly nombre: string; readonly stock: number; readonly creado: string }

const PRODUCTOS: readonly Producto[] = [
  { id: 'p1', nombre: 'Primero', stock: 1, creado: '2026-01-01' },
  { id: 'p2', nombre: 'Segundo', stock: 2, creado: '2026-02-01' },
  { id: 'p3', nombre: 'Tercero', stock: 3, creado: '2026-03-01' },
]

function columnas(): readonly DataTableColumn<Producto>[] {
  return [
    { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre, sortable: true, filter: { kind: 'text' } },
    { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
    { id: 'creado', label: 'Creado', align: 'start', cell: (row) => row.creado, filter: { kind: 'dateRange' } },
  ]
}

function renderTabla(overrides: Partial<DataTableProps<Producto>> = {}) {
  const onParamsChange = overrides.onParamsChange ?? vi.fn<(next: DataTableParams) => void>()
  const props: DataTableProps<Producto> = {
    tableId: overrides.tableId ?? 'productos-viewport-test',
    columns: overrides.columns ?? columnas(),
    rows: overrides.rows ?? PRODUCTOS,
    getRowId: overrides.getRowId ?? ((row) => row.id),
    params: overrides.params ?? createDefaultParams(),
    totalPages: overrides.totalPages ?? 3,
    onParamsChange,
    status: overrides.status ?? 'idle',
    errorMessage: overrides.errorMessage,
    texts,
    emptyAction: overrides.emptyAction,
    toolbarActions: overrides.toolbarActions,
  }

  const utils = render(<DataTable {...props} />)
  return { onParamsChange: onParamsChange as ReturnType<typeof vi.fn>, props, ...utils }
}

function expectTouchTarget(element: HTMLElement): void {
  for (const clase of TOUCH_TARGET_CLASSES) {
    expect(element.className).toMatch(new RegExp(clase))
  }
}

afterEach(() => {
  resetViewport()
  // El pineo de columnas persiste en localStorage por `tableId` (R25): sin limpiarlo, el
  // pineo hecho en un ancho contamina el siguiente `it` que reutiliza el mismo `tableId`.
  window.localStorage.clear()
})

describe.each([
  ['angosto', NARROW_VIEWPORT],
  ['ancho', WIDE_VIEWPORT],
])('DataTable en viewport %s (%ipx) (R27, R28, R29)', (_etiqueta, viewport) => {
  beforeEach(() => {
    setViewportWidth(viewport)
  })

  it('el menu de cabecera se abre y ofrece sus acciones', async () => {
    renderTabla()

    const disparador = screen.getByTestId('data-table-header-menu-nombre')
    expectTouchTarget(disparador)

    fireEvent.click(disparador)

    expect(await screen.findByTestId('data-table-sort-asc-nombre')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-sort-desc-nombre')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-pin-nombre')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-filter-open-nombre')).toBeInTheDocument()
  })

  it('la barra de filtros aparece y emite un cambio de filtro', () => {
    const { onParamsChange } = renderTabla()

    expect(screen.getByTestId('data-table-filters')).toBeInTheDocument()

    const campoNombre = screen.getByTestId('data-table-filter-nombre')
    fireEvent.change(campoNombre, { target: { value: 'ac' } })

    expect(onParamsChange).toHaveBeenCalled()
    const emitido = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
    expect(emitido.filters.nombre).toEqual({ kind: 'text', value: 'ac' })
  })

  it('la paginacion avanza, retrocede y respeta los extremos', () => {
    const primeraPagina = renderTabla({ params: { ...createDefaultParams(), page: 1 }, totalPages: 3 })

    expect(primeraPagina.onParamsChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('data-table-previous')).toBeDisabled()
    expect(screen.getByTestId('data-table-next')).toBeEnabled()
    expectTouchTarget(screen.getByTestId('data-table-previous'))
    expectTouchTarget(screen.getByTestId('data-table-next'))
    expectTouchTarget(screen.getByTestId('data-table-page-size'))

    fireEvent.click(screen.getByTestId('data-table-next'))
    expect(primeraPagina.onParamsChange).toHaveBeenCalledWith({ ...primeraPagina.props.params, page: 2 })
    primeraPagina.unmount()

    const ultimaPagina = renderTabla({ params: { ...createDefaultParams(), page: 3 }, totalPages: 3 })

    expect(screen.getByTestId('data-table-next')).toBeDisabled()
    expect(screen.getByTestId('data-table-previous')).toBeEnabled()

    fireEvent.click(screen.getByTestId('data-table-previous'))
    expect(ultimaPagina.onParamsChange).toHaveBeenCalledWith({ ...ultimaPagina.props.params, page: 2 })
  })

  describe('el calendario del filtro de fechas', () => {
    const SYSTEM_DATE = new Date(2026, 5, 15) // 2026-06-15

    beforeEach(() => {
      // Solo se falsea `Date`: falsear tambien `setTimeout`/`requestAnimationFrame` cuelga la
      // apertura async del popover de Base UI (trampa conocida en este repo).
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(SYSTEM_DATE)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('se abre y un atajo emite su rango', async () => {
      const usuario = userEvent.setup()
      const { onParamsChange } = renderTabla()

      const disparadorFecha = screen.getByTestId('data-table-filter-date-creado')
      expectTouchTarget(disparadorFecha)

      await usuario.click(disparadorFecha)
      await usuario.click(await screen.findByTestId('data-table-date-last-week'))

      const esperado = computeDateShortcutRange('lastWeek', SYSTEM_DATE)
      const emitido = onParamsChange.mock.calls.at(-1)?.[0] as DataTableParams
      expect(emitido.filters.creado).toEqual({
        kind: 'dateRange',
        from: formatDateLocalISO(esperado.from),
        to: formatDateLocalISO(esperado.to),
      })
    })
  })

  it('una columna fijada conserva su position sticky y su desplazamiento', async () => {
    renderTabla()

    fireEvent.click(screen.getByTestId('data-table-header-menu-stock'))
    fireEvent.click(await screen.findByTestId('data-table-pin-stock'))

    const cabeceraFijada = await screen.findByTestId('data-table-head-stock')
    expect(cabeceraFijada).toHaveAttribute('data-pinned', 'left')
    expect(cabeceraFijada.style.position).toBe('sticky')
    expect(cabeceraFijada.style.left).toBe('0px')

    const [celdaFijada] = screen.getAllByTestId('data-table-cell-stock')
    expect(celdaFijada).toHaveAttribute('data-pinned', 'left')
    expect(celdaFijada.style.position).toBe('sticky')
    expect(celdaFijada.style.left).toBe(cabeceraFijada.style.left)
  })
})

describe('DataTable: el desbordamiento vive en la tabla, no en el documento (R28)', () => {
  afterEach(() => {
    resetViewport()
  })

  it.each([
    ['angosto', NARROW_VIEWPORT],
    ['ancho', WIDE_VIEWPORT],
  ])('en viewport %s, overflow-x-auto esta en div[data-slot=table-container] y ningun ancestro declara scroll propio', (_etiqueta, viewport) => {
    setViewportWidth(viewport)
    renderTabla()

    const raiz = screen.getByTestId('data-table')
    const tabla = screen.getByRole('table')
    const contenedor = document.querySelector('[data-slot="table-container"]')

    expect(contenedor).not.toBeNull()
    expect(contenedor).toHaveClass('overflow-x-auto')
    expect(contenedor?.contains(tabla)).toBe(true)

    // Ningun ancestro entre el contenedor con scroll y la raiz `data-table` (sin incluir el
    // propio contenedor) declara su propia clase de scroll horizontal.
    let ancestro: HTMLElement | null = (contenedor as HTMLElement).parentElement
    while (ancestro !== null && ancestro !== raiz) {
      expect(ancestro.className).not.toMatch(/overflow-x-(auto|scroll)/)
      ancestro = ancestro.parentElement
    }
    expect(raiz.className).not.toMatch(/overflow-x-(auto|scroll)/)
  })
})

describe('DataTable: ningun archivo de la feature usa 100vh (R28)', () => {
  it('ningun archivo de components/shared/data-table contiene la cadena 100vh', () => {
    const directorio = path.join(process.cwd(), 'components', 'shared', 'data-table')
    const archivos = readdirSync(directorio).filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
    expect(archivos.length).toBeGreaterThan(0)

    for (const archivo of archivos) {
      const contenido = readFileSync(path.join(directorio, archivo), 'utf-8')
      expect(contenido, `${archivo} no debe contener 100vh`).not.toMatch(/100vh/)
    }
  })
})

describe('DataTable: verificado en los dos anchos, sin excepcion de escritorio (R29)', () => {
  it('ningun archivo de la feature declara hidden md:block / md:hidden que oculte un control por completo', () => {
    const directorio = path.join(process.cwd(), 'components', 'shared', 'data-table')
    const archivos = readdirSync(directorio).filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
    const patronesDeOcultacion = [/\bhidden\s+(sm|md|lg|xl):/, /\b(sm|md|lg|xl):hidden\b/]

    for (const archivo of archivos) {
      const contenido = readFileSync(path.join(directorio, archivo), 'utf-8')
      for (const patron of patronesDeOcultacion) {
        expect(contenido, `${archivo} no debe ocultar un control por completo con ${patron}`).not.toMatch(patron)
      }
    }
  })

  it('el calendario del filtro de fechas ADAPTA el numero de meses por ancho, no lo hace desaparecer', () => {
    // Angosto: 1 mes visible, pero el calendario y sus atajos siguen presentes y operables.
    setViewportWidth(NARROW_VIEWPORT)
    const angosto = renderTabla()
    fireEvent.click(screen.getByTestId('data-table-filter-date-creado'))
    expect(screen.getByTestId('data-table-date-last-week')).toBeInTheDocument()
    const gridsAngosto = screen.getAllByRole('grid')
    expect(gridsAngosto).toHaveLength(1)
    angosto.unmount()
    resetViewport()

    // Ancho: el mismo control sigue presente, ahora con dos meses -nunca oculto.
    setViewportWidth(WIDE_VIEWPORT)
    const ancho = renderTabla()
    fireEvent.click(screen.getByTestId('data-table-filter-date-creado'))
    expect(screen.getByTestId('data-table-date-last-week')).toBeInTheDocument()
    const gridsAncho = screen.getAllByRole('grid')
    expect(gridsAncho).toHaveLength(2)
    ancho.unmount()
    resetViewport()
  })
})
