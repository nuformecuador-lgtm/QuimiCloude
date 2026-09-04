import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  createDefaultParams,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
} from '@/components/shared/data-table/data-table-params'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination'
import type { DataTableSort } from '@/components/shared/data-table/data-table-types'

/**
 * Transiciones puras de `data-table-params.ts`: R6, R7, R8, R11, R16 (`design.md > 2`, T4).
 *
 * **Sin DOM a proposito**: cada funcion es pura, igual que `product-list-params.ts`, asi que
 * estos asserts no montan nada.
 *
 * Los asserts sobre tamano de pagina van contra `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE`, NUNCA contra
 * `10`/`25` escritos a mano (R11): si el backend moviera cualquiera, este archivo se mueve con
 * el.
 */

const dirActual = dirname(fileURLToPath(import.meta.url))
const dirDataTable = join(dirActual, '..', '..', '..', 'components', 'shared', 'data-table')

describe('parametros de la tabla compartida: forma canonica', () => {
  it('la forma por defecto arranca en la primera pagina, con el tamano por defecto y sin nada mas', () => {
    // R6, R7.
    expect(createDefaultParams()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    })
  })

  it('las dos unicas opciones de tamano de pagina son el defecto y el tope compartidos', () => {
    // R11 — nunca 10/25 escritos a mano.
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE])
    expect(PAGE_SIZE_OPTIONS).toHaveLength(2)
  })

  it('expone el retardo del rebote de busqueda como constante controlable por el test', () => {
    // design.md > 6 — para que un test de UI la controle con temporizadores falsos.
    expect(typeof SEARCH_DEBOUNCE_MS).toBe('number')
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0)
  })
})

describe('parametros de la tabla compartida: transiciones', () => {
  it('cambiar de pagina solo toca la pagina', () => {
    // R6, R7 — pregunta abierta 3: salida conservadora, no toca nada mas.
    const base = { ...createDefaultParams(), pageSize: MAX_PAGE_SIZE, search: 'acido' }
    const siguiente = withPage(base, 7)

    expect(siguiente).toEqual({ ...base, page: 7 })
    expect(siguiente).not.toBe(base)
  })

  it('cambiar el tamano de pagina lleva la pagina de vuelta a la primera', () => {
    // R8 — un tamano nuevo puede dejar sin sentido la pagina vigente.
    const base = withPage(createDefaultParams(), 9)
    const siguiente = withPageSize(base, MAX_PAGE_SIZE)

    expect(siguiente.pageSize).toBe(MAX_PAGE_SIZE)
    expect(siguiente.page).toBe(1)
  })

  it('ordenar por una columna emite el par completo sin tocar la pagina', () => {
    // R6, R7 — pregunta abierta 5: una sola columna, DataTableSort | null.
    const base = withPage(createDefaultParams(), 4)
    const orden: DataTableSort = { columnId: 'nombre', direction: 'asc' }
    const siguiente = withSort(base, orden)

    expect(siguiente.sort).toEqual(orden)
    expect(siguiente.page).toBe(4)
  })

  it('limpiar el orden vuelve a dejarlo en null', () => {
    // R6, R7.
    const base = withSort(createDefaultParams(), { columnId: 'nombre', direction: 'desc' })
    const siguiente = withSort(base, null)

    expect(siguiente.sort).toBeNull()
  })

  it('aplicar un filtro lo agrega al objeto de filtros con la forma declarada', () => {
    // R16 — cada columna emite la forma que le corresponde.
    const base = createDefaultParams()
    const siguiente = withFilter(base, 'nombre', { kind: 'text', value: 'acido' })

    expect(siguiente.filters).toEqual({ nombre: { kind: 'text', value: 'acido' } })
    expect(siguiente.page).toBe(base.page)
  })

  it('limpiar un filtro con null lo SACA del objeto en vez de emitirlo vacio', () => {
    // R16 — punto exacto de la decision: la clave desaparece, no queda `?campo=`.
    const conFiltro = withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'acido' })
    const limpio = withFilter(conFiltro, 'nombre', null)

    expect(limpio.filters).toEqual({})
    expect(Object.prototype.hasOwnProperty.call(limpio.filters, 'nombre')).toBe(false)
  })

  it('limpiar un filtro con undefined tambien lo saca del objeto', () => {
    // R16 — undefined se trata igual que null.
    const conFiltro = withFilter(createDefaultParams(), 'lote', {
      kind: 'numberRange',
      min: 1,
      max: 10,
    })
    const limpio = withFilter(conFiltro, 'lote', undefined)

    expect(limpio.filters).toEqual({})
  })

  it('limpiar un filtro no toca los demas filtros activos', () => {
    // R16.
    const conDos = withFilter(
      withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'acido' }),
      'lote',
      { kind: 'select', values: ['A', 'B'] },
    )
    const soloUno = withFilter(conDos, 'nombre', null)

    expect(soloUno.filters).toEqual({ lote: { kind: 'select', values: ['A', 'B'] } })
  })

  it('cambiar la busqueda por texto emite el campo global sin tocar los filtros', () => {
    // R6, R7, R17 (el parametro se emite igual aunque hoy nadie lo honre).
    const conFiltro = withFilter(createDefaultParams(), 'nombre', { kind: 'text', value: 'x' })
    const siguiente = withSearch(conFiltro, 'acido citrico')

    expect(siguiente.search).toBe('acido citrico')
    expect(siguiente.filters).toEqual(conFiltro.filters)
  })

  it('cada transicion devuelve un objeto nuevo, nunca muta el que recibe', () => {
    // R6, R7 — «devuelve un DataTableParams NUEVO y completo».
    const base = createDefaultParams()
    withPage(base, 2)
    withPageSize(base, MAX_PAGE_SIZE)
    withSort(base, { columnId: 'x', direction: 'asc' })
    withFilter(base, 'x', { kind: 'text', value: 'y' })
    withSearch(base, 'y')

    expect(base).toEqual(createDefaultParams())
  })
})

describe('guardia: sin tamanos de pagina escritos a mano en el directorio de la tabla', () => {
  it('ningun archivo fuente de components/shared/data-table contiene 10 o 25 como literal de tamano de pagina', () => {
    // R11 — el patron busca los literales tal como se escribirian en una lista/comparacion de
    // tamano de pagina (`10`, `25`, `[10, 25]`); no marca cualquier aparicion de esos digitos
    // (por ejemplo dentro de otro numero como `100` o `2025`) para evitar falsos positivos.
    const archivos = readdirSync(dirDataTable).filter(
      (nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'),
    )
    const patronLiteral = /(?<![\w.])(10|25)(?![\w.])/

    const infractores: string[] = []
    for (const nombre of archivos) {
      // Este propio archivo de guardia vive fuera del directorio, asi que no hace falta excluirlo.
      const contenido = readFileSync(join(dirDataTable, nombre), 'utf8')
      // Se descartan comentarios de bloque y de linea: el texto en prosa (p. ej. «R10», «R25»,
      // o esta misma explicacion mencionando 10/25) no es un literal de tamano de pagina.
      const sinComentariosDeBloque = contenido.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const linea of sinComentariosDeBloque.split('\n')) {
        const sinComentario = linea.split('//')[0] ?? ''
        if (patronLiteral.test(sinComentario)) {
          infractores.push(`${nombre}: ${linea.trim()}`)
        }
      }
    }

    expect(
      infractores,
      `Literales de tamano de pagina encontrados: ${infractores.join(' | ')}. ` +
        'Usa DEFAULT_PAGE_SIZE / MAX_PAGE_SIZE de lib/shared/pagination (R11).',
    ).toEqual([])
  })
})
