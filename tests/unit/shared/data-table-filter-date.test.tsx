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

/**
 * Casos del calculo puro de los atajos (R18).
 *
 * **Los valores esperados estan escritos a mano, uno por uno.** La version anterior de este
 * bloque reimplementaba la formula de la funcion bajo prueba (`setMonth`/`setFullYear`), asi que
 * confirmaba el bug en vez de encontrarlo: el 31 de cualquier mes, `setMonth` desborda -"31 de
 * febrero" se normaliza a marzo- y el rango dejaba de cubrir el mes anterior. Un test que repite
 * la implementacion no verifica nada; solo pregunta si la funcion se parece a si misma.
 *
 * Por eso se prueban varias fechas de sistema y no solo una comoda: un 31 en mes corto y en mes
 * largo, un 29 de febrero bisiesto, y cruces de año hacia atras.
 */
const CASOS_ATAJO: readonly {
  readonly nombre: string
  readonly hoy: Date
  readonly kind: DateShortcutKind
  readonly from: string
  readonly to: string
}[] = [
  // Mitad de mes, año no bisiesto: el caso comodo, el unico que cubria el test anterior.
  { nombre: 'semana desde mitad de mes', hoy: new Date(2026, 5, 15), kind: 'lastWeek', from: '2026-06-08', to: '2026-06-15' },
  { nombre: 'mes desde mitad de mes', hoy: new Date(2026, 5, 15), kind: 'lastMonth', from: '2026-05-15', to: '2026-06-15' },
  { nombre: 'año desde mitad de mes', hoy: new Date(2026, 5, 15), kind: 'lastYear', from: '2025-06-15', to: '2026-06-15' },

  // Un 31 cuyo mes anterior tiene 28 dias: el 2026-02-31 no existe, se acota al 28.
  { nombre: 'mes desde el 31 de marzo (febrero tiene 28)', hoy: new Date(2026, 2, 31), kind: 'lastMonth', from: '2026-02-28', to: '2026-03-31' },
  // Un 31 cuyo mes anterior tiene 30: antes daba 2026-05-01 y NO cubria abril en absoluto.
  { nombre: 'mes desde el 31 de mayo (abril tiene 30)', hoy: new Date(2026, 4, 31), kind: 'lastMonth', from: '2026-04-30', to: '2026-05-31' },
  // Un 31 en mes largo hacia otro mes largo: no se acota nada.
  { nombre: 'mes desde el 31 de enero (diciembre tiene 31)', hoy: new Date(2026, 0, 31), kind: 'lastMonth', from: '2025-12-31', to: '2026-01-31' },
  // 29 de febrero de un bisiesto: el año destino no lo es.
  { nombre: 'año desde el 29 de febrero de un bisiesto', hoy: new Date(2028, 1, 29), kind: 'lastYear', from: '2027-02-28', to: '2028-02-29' },
  { nombre: 'mes desde el 29 de febrero de un bisiesto', hoy: new Date(2028, 1, 29), kind: 'lastMonth', from: '2028-01-29', to: '2028-02-29' },

  // Cruces de año hacia atras: el indice de mes se vuelve negativo si se calcula a la ligera.
  { nombre: 'mes desde el 1 de enero', hoy: new Date(2026, 0, 1), kind: 'lastMonth', from: '2025-12-01', to: '2026-01-01' },
  { nombre: 'semana desde el 1 de enero', hoy: new Date(2026, 0, 1), kind: 'lastWeek', from: '2025-12-25', to: '2026-01-01' },
  { nombre: 'año desde el 1 de enero', hoy: new Date(2026, 0, 1), kind: 'lastYear', from: '2025-01-01', to: '2026-01-01' },
]

describe('DataTableFilterDate: calculo puro de los atajos (sin montar nada)', () => {
  it.each(CASOS_ATAJO)(
    'el atajo de $nombre va de $from a $to, ambos inclusive',
    ({ hoy, kind, from, to }) => {
      const rango = computeDateShortcutRange(kind, hoy)

      expect(formatDateLocalISO(rango.from)).toBe(from)
      expect(formatDateLocalISO(rango.to)).toBe(to)
    },
  )

  it('el fin del rango es siempre el dia de hoy, sin arrastrar la hora', () => {
    const conHora = new Date(2026, 4, 31, 23, 47, 12)

    const rango = computeDateShortcutRange('lastMonth', conHora)

    expect(formatDateLocalISO(rango.to)).toBe('2026-05-31')
    expect(rango.to.getHours()).toBe(0)
    expect(rango.to.getMinutes()).toBe(0)
  })

  it('el inicio del rango nunca cae DESPUES del fin, ni siquiera en los dias 29, 30 y 31', () => {
    // Barrido: para cada dia 28..31 de cada mes de dos años -uno bisiesto-, el rango tiene que
    // ser un intervalo valido y quedarse dentro del periodo pedido. Es la red que atrapa el
    // desborde de `setMonth` en cualquier combinacion, no solo en las escritas arriba.
    for (const year of [2027, 2028]) {
      for (let month = 0; month < 12; month += 1) {
        for (const day of [28, 29, 30, 31]) {
          const hoy = new Date(year, month, day)
          // `new Date` normaliza un dia inexistente (p. ej. 31 de abril): se descarta.
          if (hoy.getMonth() !== month) continue

          for (const kind of ['lastWeek', 'lastMonth', 'lastYear'] as const) {
            const { from, to } = computeDateShortcutRange(kind, hoy)

            expect(from.getTime()).toBeLessThan(to.getTime())

            if (kind === 'lastMonth') {
              // El inicio cae en el mes inmediatamente anterior, nunca en el mismo mes.
              const mesesAtras = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
              expect(mesesAtras).toBe(1)
            }

            if (kind === 'lastYear') {
              expect(to.getFullYear() - from.getFullYear()).toBe(1)
            }
          }
        }
      }
    }
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
