// `createListSummariesByIdsIncludingDeleted`: la factoria compone las dos lecturas de
// `OrderSummaryReader` y decide en el dominio que numeros casan con el filtro. Puertos simulados:
// lo que se prueba es a quien llama, con que ids, y que devuelve la pagina del adaptador tal cual.

import { describe, expect, it, vi } from 'vitest'

import {
  createListSummariesByIdsIncludingDeleted,
  type ListHistorySummariesDeps,
  type OrderHistorySummary,
  type OrderNumber,
} from '@/lib/modules/pedidos'

type OrderSummaryReader = ListHistorySummariesDeps['summaries']
type HistoryPage = Awaited<ReturnType<OrderSummaryReader['listHistoryByIdsIncludingDeleted']>>

const EMPRESA = 'empresa-a'
const ESTADOS = ['EN_CURSO', 'CANCELADO'] as const

const n = (year: number, sequence: number): OrderNumber => ({ year, sequence })

const NUMEROS: readonly { readonly id: string; readonly number: OrderNumber }[] = [
  { id: 'p-42', number: n(2026, 42) },
  { id: 'p-142', number: n(2026, 142) },
  { id: 'p-43', number: n(2026, 43) },
  { id: 'p-2025-42', number: n(2025, 42) },
]

function paginaDe(items: readonly OrderHistorySummary[]): HistoryPage {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1 }
}

function montar() {
  const pagina = paginaDe([{ id: 'p-42', number: n(2026, 42), status: 'EN_CURSO', deleted: true }])
  const listNumbersByIdsIncludingDeleted = vi.fn(async () => NUMEROS)
  const listHistoryByIdsIncludingDeleted = vi.fn(async () => pagina)
  const summaries = {
    listAliveByIds: vi.fn(async () => {
      throw new Error('el historial no lee los vivos')
    }),
    listAliveInCompany: vi.fn(async () => {
      throw new Error('el historial no lee los vivos')
    }),
    listNumbersByIdsIncludingDeleted,
    listHistoryByIdsIncludingDeleted,
  } satisfies OrderSummaryReader
  const listar = createListSummariesByIdsIncludingDeleted({ summaries })
  return { listar, pagina, listNumbersByIdsIncludingDeleted, listHistoryByIdsIncludingDeleted, summaries }
}

const IDS = NUMEROS.map((row) => row.id)

describe('createListSummariesByIdsIncludingDeleted', () => {
  it('R1, R4: sin filtro no consulta los numeros y pide la pagina con los ids tal cual, devolviendola sin tocar', async () => {
    const { listar, pagina, listNumbersByIdsIncludingDeleted, listHistoryByIdsIncludingDeleted } = montar()

    const resultado = await listar(EMPRESA, IDS, ESTADOS, 2, 25)

    expect(listNumbersByIdsIncludingDeleted).not.toHaveBeenCalled()
    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledTimes(1)
    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledWith(EMPRESA, IDS, ESTADOS, 2, 25)
    expect(resultado).toBe(pagina)
  })

  it('R1: un filtro presente pero sin `numberContains` se trata como ausente', async () => {
    const { listar, listNumbersByIdsIncludingDeleted, listHistoryByIdsIncludingDeleted } = montar()

    await listar(EMPRESA, IDS, ESTADOS, 1, undefined, {})

    expect(listNumbersByIdsIncludingDeleted).not.toHaveBeenCalled()
    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledWith(EMPRESA, IDS, ESTADOS, 1, undefined)
  })

  it('R6, R10: con `numberContains` filtra con `orderNumberContains` y pasa solo los ids que casan, con los mismos estados', async () => {
    const { listar, pagina, listNumbersByIdsIncludingDeleted, listHistoryByIdsIncludingDeleted } = montar()

    const resultado = await listar(EMPRESA, IDS, ESTADOS, 1, 10, { numberContains: '42' })

    expect(listNumbersByIdsIncludingDeleted).toHaveBeenCalledWith(EMPRESA, IDS, ESTADOS)
    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledWith(
      EMPRESA,
      ['p-42', 'p-142', 'p-2025-42'],
      ESTADOS,
      1,
      10,
    )
    expect(resultado).toBe(pagina)
  })

  it('R6: `0000042` deja fuera `2026-0000142` porque se compara contra el numero visible', async () => {
    const { listar, listHistoryByIdsIncludingDeleted } = montar()

    await listar(EMPRESA, IDS, ESTADOS, 1, 10, { numberContains: ' 0000042 ' })

    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledWith(EMPRESA, ['p-42', 'p-2025-42'], ESTADOS, 1, 10)
  })

  it('R6: si no casa ninguno, pasa la lista vacia al adaptador y devuelve su pagina, sin armarla en el dominio', async () => {
    const { listar, pagina, listHistoryByIdsIncludingDeleted } = montar()

    for (const texto of ['abc', '-', '9999']) {
      listHistoryByIdsIncludingDeleted.mockClear()
      const resultado = await listar(EMPRESA, IDS, ESTADOS, 1, 10, { numberContains: texto })
      expect(listHistoryByIdsIncludingDeleted, texto).toHaveBeenCalledWith(EMPRESA, [], ESTADOS, 1, 10)
      expect(resultado).toBe(pagina)
    }
  })

  it('R23, R24: la empresa llega a las dos lecturas como primer argumento y nunca se lee la lista de vivos', async () => {
    const { listar, listNumbersByIdsIncludingDeleted, listHistoryByIdsIncludingDeleted, summaries } = montar()

    await listar('empresa-b', IDS, ESTADOS, 1, 10, { numberContains: '42' })

    expect(listNumbersByIdsIncludingDeleted).toHaveBeenCalledWith('empresa-b', IDS, ESTADOS)
    expect(listHistoryByIdsIncludingDeleted).toHaveBeenCalledWith('empresa-b', ['p-42', 'p-142', 'p-2025-42'], ESTADOS, 1, 10)
    expect(summaries.listAliveByIds).not.toHaveBeenCalled()
    expect(summaries.listAliveInCompany).not.toHaveBeenCalled()
  })
})
