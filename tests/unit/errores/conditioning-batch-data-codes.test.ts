// QC-219 T5 — los tres codigos nuevos del catalogo y las cinco clases de `asignaciones` que los
// datos de lote lanzan, con el `batchId` de la linea culpable (design § 3.5).
import { describe, expect, it } from 'vitest'

import {
  BatchExpiryNotFutureError,
  BatchProductionDateFutureError,
  ConditioningBatchDataMissingError,
  ConditioningBatchDuplicateLotError,
  ConditioningBatchNotFoundError,
} from '@/lib/modules/asignaciones/domain/errors'
import { ERROR_CODES, ERROR_MESSAGE_KEY, errorMessage } from '@/lib/modules/errores'

const BATCH_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'

describe('QC-219 — codigos nuevos de los datos de lote', () => {
  it('R8: batch_expiry_not_future esta en el catalogo con su clave y su texto exactos', () => {
    const codigos: readonly string[] = ERROR_CODES
    expect(codigos).toContain('batch_expiry_not_future')
    expect(ERROR_MESSAGE_KEY.batch_expiry_not_future).toBe('errors.batch_expiry_not_future')
    expect(errorMessage('batch_expiry_not_future')).toBe('La fecha de vencimiento debe ser posterior a hoy.')
  })

  it('R9: batch_production_date_future esta en el catalogo con su clave y su texto exactos', () => {
    const codigos: readonly string[] = ERROR_CODES
    expect(codigos).toContain('batch_production_date_future')
    expect(ERROR_MESSAGE_KEY.batch_production_date_future).toBe('errors.batch_production_date_future')
    expect(errorMessage('batch_production_date_future')).toBe('El dia de produccion no puede ser posterior a hoy.')
  })

  it('R15: conditioning_batch_data_missing esta en el catalogo con su clave y su texto exactos', () => {
    const codigos: readonly string[] = ERROR_CODES
    expect(codigos).toContain('conditioning_batch_data_missing')
    expect(ERROR_MESSAGE_KEY.conditioning_batch_data_missing).toBe('errors.conditioning_batch_data_missing')
    expect(errorMessage('conditioning_batch_data_missing')).toBe('Faltan datos de lote en alguna linea del pedido.')
  })

  it('R15: el texto de datos que faltan no es el de pedido no acondicionable', () => {
    expect(errorMessage('conditioning_batch_data_missing')).not.toBe(errorMessage('order_not_conditionable'))
  })
})

describe('QC-219 — las cinco clases llevan su codigo y el batchId de la linea culpable', () => {
  const casos = [
    [BatchExpiryNotFutureError, 'batch_expiry_not_future'],
    [BatchProductionDateFutureError, 'batch_production_date_future'],
    [ConditioningBatchDataMissingError, 'conditioning_batch_data_missing'],
    [ConditioningBatchDuplicateLotError, 'batch_duplicate_lot'],
    [ConditioningBatchNotFoundError, 'batch_not_found'],
  ] as const

  for (const [Clase, code] of casos) {
    it(`R5: ${Clase.name} da ${code}, su mensaje del catalogo y el batchId como dato y diagnostico`, () => {
      const error = new Clase(BATCH_ID)
      expect(error.code).toBe(code)
      expect(error.message).toBe(errorMessage(code))
      expect(error.batchId).toBe(BATCH_ID)
      expect(error.diagnostic).toBe(BATCH_ID)
      expect(error.name).toBe(Clase.name)
      expect(error).toBeInstanceOf(Clase)
    })

    it(`R5: ${Clase.name} sin batchId no lo inventa`, () => {
      const error = new Clase()
      expect(error.batchId).toBeUndefined()
      expect(error.diagnostic).toBeUndefined()
    })
  }
})
