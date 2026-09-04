import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  DataTableEmpty,
  DataTableError,
  DataTableLoading,
  resolveDataTableState,
} from '@/components/shared/data-table/data-table-states'
import type { DataTableTexts } from '@/components/shared/data-table/data-table-types'

/**
 * Los tres estados de la tabla compartida: R19, R20, R21, R22 (T5).
 *
 * Los asserts van sobre `data-testid`/rol y sobre que el nodo cambia con `texts`, nunca sobre
 * literales de copy (decision 20, R36): los objetos `texts` de aqui son de relleno.
 */

const textos1: Pick<DataTableTexts, 'empty' | 'loading' | 'error'> = {
  empty: 'texto-vacio-uno',
  loading: 'texto-carga-uno',
  error: 'texto-error-uno',
}

const textos2: Pick<DataTableTexts, 'empty' | 'loading' | 'error'> = {
  empty: 'texto-vacio-dos',
  loading: 'texto-carga-dos',
  error: 'texto-error-dos',
}

describe('estado de error de la tabla compartida', () => {
  it('se identifica por role="alert" y su data-testid propio', () => {
    // R21.
    render(<DataTableError texts={textos1} errorMessage="fallo de red" />)

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveAttribute('data-testid', 'data-table-error')
  })

  it('cambia de contenido cuando cambian los textos recibidos por props, sin afirmar el literal', () => {
    // R22.
    const { rerender } = render(<DataTableError texts={textos1} />)
    const contenidoUno = screen.getByTestId('data-table-error').textContent

    rerender(<DataTableError texts={textos2} />)
    const contenidoDos = screen.getByTestId('data-table-error').textContent

    expect(contenidoDos).not.toBe(contenidoUno)
  })
})

describe('indicador de carga de la tabla compartida', () => {
  it('se identifica por su data-testid propio y pinta filas de esqueleto', () => {
    // R20.
    render(<DataTableLoading texts={textos1} columnCount={3} rowCount={2} />)

    const contenedor = screen.getByTestId('data-table-loading')
    expect(contenedor).toBeInTheDocument()
    expect(screen.getByTestId('data-table-loading-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('data-table-loading-row-1')).toBeInTheDocument()
  })
})

describe('estado vacio de la tabla compartida', () => {
  it('se identifica por su data-testid propio', () => {
    // R19.
    render(<DataTableEmpty texts={textos1} />)

    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument()
  })

  it('cambia de contenido cuando cambian los textos recibidos por props, sin afirmar el literal', () => {
    // R22.
    const { rerender } = render(<DataTableEmpty texts={textos1} />)
    const contenidoUno = screen.getByTestId('data-table-empty').textContent

    rerender(<DataTableEmpty texts={textos2} />)
    const contenidoDos = screen.getByTestId('data-table-empty').textContent

    expect(contenidoDos).not.toBe(contenidoUno)
  })

  it('pinta el emptyAction opcional cuando la pantalla lo entrega', () => {
    // R19, pregunta abierta 4.
    render(<DataTableEmpty texts={textos1} emptyAction={<button type="button">crear</button>} />)

    expect(screen.getByRole('button', { name: 'crear' })).toBeInTheDocument()
  })
})

describe('exclusion mutua de los tres estados', () => {
  it('con status "error" NO se renderiza el estado vacio', () => {
    // R21 — negativo: error nunca se confunde con vacio, aunque no haya filas.
    render(<DataTableError texts={textos1} errorMessage="fallo" />)

    expect(screen.queryByTestId('data-table-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('data-table-error')).toBeInTheDocument()
  })
})

describe('resolveDataTableState: precedencia error > loading > empty > rows', () => {
  it('devuelve "error" cuando status es error, sin importar el numero de filas', () => {
    expect(resolveDataTableState('error', 0)).toBe('error')
    expect(resolveDataTableState('error', 3)).toBe('error')
  })

  it('devuelve "loading" cuando status es loading, sin importar el numero de filas', () => {
    expect(resolveDataTableState('loading', 0)).toBe('loading')
    expect(resolveDataTableState('loading', 3)).toBe('loading')
  })

  it('devuelve "empty" cuando status es idle y no hay filas', () => {
    expect(resolveDataTableState('idle', 0)).toBe('empty')
  })

  it('devuelve "rows" cuando status es idle y hay al menos una fila', () => {
    expect(resolveDataTableState('idle', 1)).toBe('rows')
  })
})
