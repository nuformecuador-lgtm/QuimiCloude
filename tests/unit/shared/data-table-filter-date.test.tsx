import { useState } from 'react'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DataTableFilterDate,
  computeDateShortcutRange,
  formatDateLocalISO,
  type DateShortcutKind,
} from '@/components/shared/data-table/data-table-filter-date'
import type { DataTableFilterValue, DataTableTexts } from '@/components/shared/data-table/data-table-types'
import { NARROW_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport'

/**
 * `data-table-filter-date.tsx`: R18 (`design.md > 6.1`, T9).
 *
 * **Ningun test depende del idioma del calendario.** Comprobado en el propio DOM: el boton de
 * cada dia expone su `aria-label` con la fecha COMPLETA formateada por locale (p. ej. "Tuesday,
 * September 8th, 2026"), asi que ni el `name` de `getByRole('button', ...)` ni el texto visible
 * son estables entre entornos. Lo unico estable es el `data-day="YYYY-MM-DD"` que pone el propio
 * `<td role="gridcell">` de `react-day-picker` (no el `data-day` del boton, que tambien es
 * locale-dependiente vía `toLocaleDateString`): se localiza la celda por ese atributo ISO y se
 * clica el boton que contiene.
 */

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

/** Fecha del sistema fijada para que los tres atajos den un resultado determinista. */
const SYSTEM_DATE = new Date(2026, 5, 15) // 2026-06-15 (mes 0-index: junio)

async function openPopover(user: ReturnType<typeof userEvent.setup>, columnId = 'creado') {
  await user.click(screen.getByTestId(`data-table-filter-date-${columnId}`))
}

/**
 * Localiza el boton de un dia por el `data-day` ISO del `<td>` que lo contiene (estable,
 * ajeno al locale). El popover se pinta en un portal fuera del arbol de `render()`, asi que se
 * busca en `document` entero.
 */
function getDayButton(isoDate: string): HTMLElement {
  const cell = document.querySelector(`td[data-day="${isoDate}"]`)
  if (cell === null) {
    throw new Error(`No se encontro la celda del dia ${isoDate}`)
  }
  const button = cell.querySelector('button')
  if (button === null) {
    throw new Error(`El dia ${isoDate} no tiene boton interactivo`)
  }
  return button
}

// jsdom no implementa `window.matchMedia`: el componente lo usa para elegir 1/2 meses
// (`design.md > 6.1`). `tests/helpers/viewport.ts` (heredado) lo stubea; sin esto todo test que
// monte el componente revienta con `TypeError: window.matchMedia is not a function`.
beforeEach(() => {
  setViewportWidth(NARROW_VIEWPORT)
})

afterEach(() => {
  resetViewport()
})

describe('DataTableFilterDate: calculo puro de los atajos (sin montar nada)', () => {
  const casos: { readonly kind: DateShortcutKind; readonly restar: (d: Date) => void }[] = [
    { kind: 'lastWeek', restar: (d) => d.setDate(d.getDate() - 7) },
    { kind: 'lastMonth', restar: (d) => d.setMonth(d.getMonth() - 1) },
    { kind: 'lastYear', restar: (d) => d.setFullYear(d.getFullYear() - 1) },
  ]

  it.each(casos)('el atajo "$kind" va desde hoy menos el periodo hasta hoy, ambos inclusive', ({ kind, restar }) => {
    const to = new Date(SYSTEM_DATE.getFullYear(), SYSTEM_DATE.getMonth(), SYSTEM_DATE.getDate())
    const from = new Date(to)
    restar(from)

    const rango = computeDateShortcutRange(kind, SYSTEM_DATE)

    expect(formatDateLocalISO(rango.from)).toBe(formatDateLocalISO(from))
    expect(formatDateLocalISO(rango.to)).toBe(formatDateLocalISO(to))
  })
})

describe('DataTableFilterDate: atajos emitidos desde el control montado', () => {
  beforeEach(() => {
    // Solo se falsea `Date`: falsear tambien `setTimeout`/`requestAnimationFrame` cuelga la
    // apertura async del popover de Base UI, que los usa internamente.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(SYSTEM_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['lastWeek', 'data-table-date-last-week'],
    ['lastMonth', 'data-table-date-last-month'],
    ['lastYear', 'data-table-date-last-year'],
  ] as const)('activar el atajo "%s" emite el rango con from/to en YYYY-MM-DD', async (kind, testId) => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DataTableFilterDate columnId="creado" label="Creado" value={undefined} texts={texts} onChange={onChange} />,
    )

    await openPopover(user)
    await user.click(screen.getByTestId(testId))

    const esperado = computeDateShortcutRange(kind)
    const esperadoValue: DataTableFilterValue = {
      kind: 'dateRange',
      from: formatDateLocalISO(esperado.from),
      to: formatDateLocalISO(esperado.to),
    }

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(esperadoValue)
  })

  it('el rango del atajo activado queda seleccionado y visible en el calendario (R18)', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [value, setValue] = useState<Extract<DataTableFilterValue, { kind: 'dateRange' }> | undefined>(
        undefined,
      )
      return (
        <DataTableFilterDate
          columnId="creado"
          label="Creado"
          value={value}
          texts={texts}
          onChange={(next) => setValue(next === null ? undefined : (next as typeof value))}
        />
      )
    }

    render(<Harness />)

    await openPopover(user)
    await user.click(screen.getByTestId('data-table-date-last-week'))

    const esperado = computeDateShortcutRange('lastWeek')
    const botonInicio = getDayButton(formatDateLocalISO(esperado.from))
    const botonFin = getDayButton(formatDateLocalISO(esperado.to))

    expect(botonInicio).toHaveAttribute('data-range-start', 'true')
    expect(botonFin).toHaveAttribute('data-range-end', 'true')
  })
})

describe('DataTableFilterDate: seleccion manual del rango en el calendario', () => {
  beforeEach(() => {
    // Solo se falsea `Date`: falsear tambien `setTimeout`/`requestAnimationFrame` cuelga la
    // apertura async del popover de Base UI, que los usa internamente.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(SYSTEM_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('elegir dos dias en el calendario (controlado) emite el rango completo', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn<(next: DataTableFilterValue | null) => void>()

    function Harness() {
      const [value, setValue] = useState<Extract<DataTableFilterValue, { kind: 'dateRange' }> | undefined>(
        undefined,
      )
      return (
        <DataTableFilterDate
          columnId="creado"
          label="Creado"
          value={value}
          texts={texts}
          onChange={(next) => {
            onChangeSpy(next)
            setValue(next === null ? undefined : (next as typeof value))
          }}
        />
      )
    }

    render(<Harness />)
    await openPopover(user)

    // Localizados por el `data-day` ISO de su celda (estable, ajeno al locale del calendario),
    // ambos dentro del mes en curso (2026-06, con el sistema fijado en el 15). Se buscan de
    // nuevo tras el primer clic: al ser `value` controlado, el cambio de rango re-renderiza el
    // grid del calendario y una referencia capturada antes del primer clic puede quedar
    // desmontada.
    await user.click(getDayButton('2026-06-10'))
    await user.click(getDayButton('2026-06-20'))

    const ultimaLlamada = onChangeSpy.mock.calls.at(-1)?.[0]
    expect(ultimaLlamada).toEqual({
      kind: 'dateRange',
      from: '2026-06-10',
      to: '2026-06-20',
    })
  })
})

describe('DataTableFilterDate: el disparador cumple el objetivo tactil minimo (R27)', () => {
  it('el disparador del popover lleva min-h-11 min-w-11', () => {
    render(
      <DataTableFilterDate columnId="creado" label="Creado" value={undefined} texts={texts} onChange={vi.fn()} />,
    )

    const disparador = screen.getByTestId('data-table-filter-date-creado')
    expect(disparador.className).toMatch(/min-h-11/)
    expect(disparador.className).toMatch(/min-w-11/)
  })
})
