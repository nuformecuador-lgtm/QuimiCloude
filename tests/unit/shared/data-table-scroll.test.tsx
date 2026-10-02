import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DataTable } from '@/components/shared/data-table/data-table'
import { createDefaultParams } from '@/components/shared/data-table/data-table-params'
import {
  SCROLL_LEFT_FALLBACK,
  SCROLL_RIGHT_FALLBACK,
} from '@/components/shared/data-table/data-table-scroll-nav'
import type {
  DataTableColumn,
  DataTableParams,
  DataTableProps,
  DataTableTexts,
} from '@/components/shared/data-table/data-table-types'

/**
 * `data-table-scroll.test.tsx`: flechas de scroll horizontal interno, `width` y
 * `hideText` por columna de la tabla compartida.
 *
 * Asserts sobre `data-testid`, atributos y clases -nunca sobre el copy de relleno de
 * `texts`- (decision 20, R36). El desbordamiento se simula definiendo `scrollWidth`,
 * `clientWidth` y `scrollLeft` sobre el `div[data-slot="table-container"]` de
 * `components/ui/table.tsx`, que es donde vive el `overflow-x-auto` (R28): jsdom los deja
 * en 0 por defecto.
 */

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
  scrollLeft: 'ir-a-la-izquierda',
  scrollRight: 'ir-a-la-derecha',
}

type Producto = { readonly id: string; readonly nombre: string; readonly stock: number }

const PRODUCTOS: readonly Producto[] = [
  { id: 'p1', nombre: 'Primero con un nombre muy largo que desborda', stock: 1 },
  { id: 'p2', nombre: 'Segundo', stock: 2 },
]

function renderTabla(overrides: Partial<DataTableProps<Producto>> = {}) {
  const onParamsChange = overrides.onParamsChange ?? vi.fn<(next: DataTableParams) => void>()
  const props: DataTableProps<Producto> = {
    tableId: overrides.tableId ?? 'productos-scroll-test',
    columns: overrides.columns ?? [
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
      { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
    ],
    rows: overrides.rows ?? PRODUCTOS,
    getRowId: overrides.getRowId ?? ((row) => row.id),
    params: overrides.params ?? createDefaultParams(),
    totalPages: overrides.totalPages ?? 1,
    onParamsChange,
    status: overrides.status ?? 'idle',
    errorMessage: overrides.errorMessage,
    texts: overrides.texts ?? texts,
    emptyAction: overrides.emptyAction,
    toolbarActions: overrides.toolbarActions,
  }

  const utils = render(<DataTable {...props} />)
  return { onParamsChange: onParamsChange as ReturnType<typeof vi.fn>, props, ...utils }
}

function scrollContainer(): HTMLElement {
  const element = document.querySelector('[data-slot="table-container"]')
  if (!(element instanceof HTMLElement)) throw new Error('falta div[data-slot="table-container"]')
  return element
}

/**
 * Simula una tabla mas ancha que su contenedor. Devuelve el control de `scrollLeft` y el
 * doble de `scrollBy` para afirmar el desplazamiento que pide cada flecha.
 */
function simularDesbordamiento(anchoContenido = 800, anchoVisible = 400) {
  const elemento = scrollContainer()
  let scrollLeft = 0
  Object.defineProperty(elemento, 'scrollWidth', { configurable: true, get: () => anchoContenido })
  Object.defineProperty(elemento, 'clientWidth', { configurable: true, get: () => anchoVisible })
  Object.defineProperty(elemento, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (valor: number) => {
      scrollLeft = valor
    },
  })
  const scrollBy = vi.fn()
  elemento.scrollBy = scrollBy as unknown as typeof elemento.scrollBy
  return {
    setScrollLeft: (valor: number) => {
      scrollLeft = valor
      fireEvent.scroll(elemento)
    },
    notificar: () => fireEvent.scroll(elemento),
    scrollBy,
  }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('DataTable: flechas de scroll horizontal interno', () => {
  it('sin desbordamiento no se pinta ninguna flecha', () => {
    renderTabla({ tableId: 'scroll-sin-desborde' })

    expect(screen.queryByTestId('data-table-scroll-left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-scroll-right')).not.toBeInTheDocument()
  })

  it('con desbordamiento aparecen las dos flechas con el aria-label de texts', () => {
    renderTabla({ tableId: 'scroll-con-desborde' })
    simularDesbordamiento().notificar()

    const izquierda = screen.getByTestId('data-table-scroll-left')
    const derecha = screen.getByTestId('data-table-scroll-right')

    expect(izquierda).toHaveAttribute('aria-label', 'ir-a-la-izquierda')
    expect(derecha).toHaveAttribute('aria-label', 'ir-a-la-derecha')
    for (const flecha of [izquierda, derecha]) {
      expect(flecha.className).toMatch(/min-h-11/)
      expect(flecha.className).toMatch(/min-w-11/)
    }
  })

  it('sin scrollLeft/scrollRight en texts se usan las etiquetas internas', () => {
    const textosSinFlechas: DataTableTexts = { ...texts, scrollLeft: undefined, scrollRight: undefined }
    renderTabla({ tableId: 'scroll-fallback', texts: textosSinFlechas })
    simularDesbordamiento().notificar()

    expect(screen.getByTestId('data-table-scroll-left')).toHaveAttribute(
      'aria-label',
      SCROLL_LEFT_FALLBACK,
    )
    expect(screen.getByTestId('data-table-scroll-right')).toHaveAttribute(
      'aria-label',
      SCROLL_RIGHT_FALLBACK,
    )
  })
  it('al inicio la izquierda esta deshabilitada y la derecha habilitada; cada flecha pide su desplazamiento', () => {
    renderTabla({ tableId: 'scroll-direcciones' })
    const { notificar, setScrollLeft, scrollBy } = simularDesbordamiento()
    notificar()

    const izquierda = screen.getByTestId('data-table-scroll-left')
    const derecha = screen.getByTestId('data-table-scroll-right')

    expect(izquierda).toBeDisabled()
    expect(derecha).toBeEnabled()

    // Deshabilitada = no pide desplazamiento.
    fireEvent.click(izquierda)
    expect(scrollBy).not.toHaveBeenCalled()

    fireEvent.click(derecha)
    expect(scrollBy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })

    // Con recorrido a la izquierda, la flecha pide retroceder.
    setScrollLeft(400)
    fireEvent.click(screen.getByTestId('data-table-scroll-left'))
    expect(scrollBy).toHaveBeenCalledWith({ left: -300, behavior: 'smooth' })
  })

  it('al llegar al borde derecho se invierten los deshabilitados', () => {
    renderTabla({ tableId: 'scroll-borde-derecho' })
    const { setScrollLeft } = simularDesbordamiento(800, 400)
    setScrollLeft(0)

    expect(screen.getByTestId('data-table-scroll-left')).toBeDisabled()
    expect(screen.getByTestId('data-table-scroll-right')).toBeEnabled()

    setScrollLeft(400)

    expect(screen.getByTestId('data-table-scroll-left')).toBeEnabled()
    expect(screen.getByTestId('data-table-scroll-right')).toBeDisabled()
  })

  it('en loading no hay flechas porque no hay tabla con scroll', () => {
    renderTabla({ tableId: 'scroll-loading', status: 'loading' })

    expect(screen.queryByTestId('data-table-scroll-left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('data-table-scroll-right')).not.toBeInTheDocument()
  })

  it('las flechas van en un overlay pegado al contenedor y siguen a la pantalla sin salirse', () => {
    renderTabla({ tableId: 'scroll-overlay' })
    simularDesbordamiento().notificar()

    // El overlay es la caja exacta del envoltorio (`absolute inset-0`): las flechas no
    // pueden salir del contenedor de la tabla. No intercepta nada salvo los botones.
    const nav = screen.getByTestId('data-table-scroll-nav')
    expect(nav.className).toMatch(/absolute/)
    expect(nav.className).toMatch(/inset-0/)
    expect(nav.className).toMatch(/pointer-events-none/)
    expect(nav.className).toMatch(/justify-between/)

    // Cada flecha es `sticky` a mitad de la pantalla: sigue a la vista mientras la tabla
    // esta en pantalla, retenida por la caja del overlay en los bordes.
    for (const testid of ['data-table-scroll-left', 'data-table-scroll-right']) {
      const flecha = screen.getByTestId(testid)
      expect(flecha.className).toMatch(/sticky/)
      expect(flecha.className).toMatch(/top-\[50vh]/)
      expect(flecha.className).not.toMatch(/(^|\s)absolute(\s|$)/)
      // Sin rebote al presionar: el base trae `active:not-aria-[haspopup]:translate-y-px`
      // (variante APILADA) y un `active:` simple no lo expulsa de `twMerge`. Se afirma por
      // substring para que ningun stack lo esconda: ningun `translate-y-px` en la clase
      // final, y el override con el mismo stack del base presente.
      expect(flecha.className).not.toMatch(/translate-y-px/)
      expect(flecha.className).toMatch(/active:not-aria-\[haspopup\]:-translate-y-1\/2/)
      // Sin `transition-all`: aunque algo cambiara al presionar, no podria animarse.
      expect(flecha.className).toMatch(/transition-colors/)
      expect(flecha.className).not.toMatch(/transition-all/)
    }
  })

  it('el clic sobre el relleno del boton desplaza igual que sobre el icono', () => {
    // La flecha ya no se mueve al presionarla, asi que el cursor sigue sobre el boton al
    // soltar tanto si se presiona el relleno como el icono.
    renderTabla({ tableId: 'scroll-boton' })
    const { notificar, scrollBy } = simularDesbordamiento()
    notificar()

    fireEvent.click(screen.getByTestId('data-table-scroll-right'))
    expect(scrollBy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })

  it('el clic sobre el icono desplaza igual que sobre el contenedor del boton', () => {
    renderTabla({ tableId: 'scroll-icono' })
    const { notificar, scrollBy } = simularDesbordamiento()
    notificar()

    const boton = screen.getByTestId('data-table-scroll-right')
    const icono = boton.querySelector('svg')
    expect(icono).not.toBeNull()
    expect(icono?.className.baseVal ?? icono?.getAttribute('class') ?? '').toMatch(
      /pointer-events-none/,
    )

    fireEvent.click(icono as unknown as Element)
    expect(scrollBy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })
})

describe('DataTable: width fijo por columna', () => {
  function columnasConAncho(): readonly DataTableColumn<Producto>[] {
    return [
      { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre, width: 160 },
      { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock), width: '12rem' },
    ]
  }

  it('numero = px y cadena = valor CSS tal cual, en th y en td, sin encogerse', () => {
    renderTabla({ tableId: 'width-tipos', columns: columnasConAncho() })

    const cabeceraNombre = screen.getByTestId('data-table-head-nombre')
    const cabeceraStock = screen.getByTestId('data-table-head-stock')
    expect(cabeceraNombre.style.width).toBe('160px')
    expect(cabeceraNombre.style.minWidth).toBe('160px')
    expect(cabeceraStock.style.width).toBe('12rem')
    expect(cabeceraStock.style.minWidth).toBe('12rem')

    const celdasNombre = screen.getAllByTestId('data-table-cell-nombre')
    const celdasStock = screen.getAllByTestId('data-table-cell-stock')
    expect(celdasNombre.length).toBeGreaterThan(0)
    for (const celda of celdasNombre) {
      expect(celda.style.width).toBe('160px')
      expect(celda.style.minWidth).toBe('160px')
    }
    for (const celda of celdasStock) {
      expect(celda.style.width).toBe('12rem')
      expect(celda.style.minWidth).toBe('12rem')
    }
  })

  it('sin width no hay ancho en linea', () => {
    renderTabla({ tableId: 'width-ausente' })

    for (const celda of [
      screen.getByTestId('data-table-head-nombre'),
      ...screen.getAllByTestId('data-table-cell-nombre'),
    ]) {
      expect(celda.style.width).toBe('')
      expect(celda.style.minWidth).toBe('')
      expect(celda.style.maxWidth).toBe('')
    }
  })
})

describe('DataTable: hideText por columna', () => {
  it('ausente o true = truncado con ellipsis', () => {
    renderTabla({
      tableId: 'hidetext-truncado',
      columns: [
        { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
        { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock), hideText: true },
      ],
    })

    for (const celda of [
      screen.getByTestId('data-table-head-nombre'),
      screen.getByTestId('data-table-head-stock'),
      ...screen.getAllByTestId('data-table-cell-nombre'),
      ...screen.getAllByTestId('data-table-cell-stock'),
    ]) {
      expect(celda.className).toMatch(/overflow-hidden/)
      expect(celda.className).toMatch(/text-ellipsis/)
      expect(celda.className).not.toMatch(/whitespace-normal/)
    }
  })

  it('false = el texto salta de linea dentro del ancho permitido', () => {
    renderTabla({
      tableId: 'hidetext-salto',
      columns: [
        {
          id: 'nombre',
          label: 'Nombre',
          align: 'start',
          cell: (row) => row.nombre,
          width: 160,
          hideText: false,
        },
        { id: 'stock', label: 'Stock', align: 'end', cell: (row) => String(row.stock) },
      ],
    })

    const cabecera = screen.getByTestId('data-table-head-nombre')
    expect(cabecera.className).toMatch(/whitespace-normal/)
    expect(cabecera.className).toMatch(/break-words/)
    expect(cabecera.className).not.toMatch(/overflow-hidden/)
    expect(cabecera.style.width).toBe('160px')
    expect(cabecera.style.minWidth).toBe('160px')

    for (const celda of screen.getAllByTestId('data-table-cell-nombre')) {
      expect(celda.className).toMatch(/whitespace-normal/)
      expect(celda.className).toMatch(/break-words/)
    }
  })
})
