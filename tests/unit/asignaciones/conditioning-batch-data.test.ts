// QC-219 T6 — `missingBatchDataLines`: cuantas lineas del reparto no tienen sus datos de lote.
import { describe, expect, it } from 'vitest';

import { missingBatchDataLines } from '@/lib/modules/asignaciones/domain/conditioning-batch-data';

import { loteDeLinea, uuid } from './conditioning-doubles';

const DATOS = { lot: 'CR-2610-A', expiryDate: '2027-04-30', productionDate: '2026-10-01' };

describe('QC-219 — missingBatchDataLines', () => {
  it('R4, R15: una linea con lote y sin datos cuenta como sin datos', () => {
    expect(missingBatchDataLines([{ presentationId: 'p1' }], [loteDeLinea('p1', uuid('7'))])).toBe(1);
  });

  it('R15: una linea con sus datos no cuenta', () => {
    expect(missingBatchDataLines([{ presentationId: 'p1' }], [loteDeLinea('p1', uuid('7'), DATOS)])).toBe(0);
  });

  it('R17: una linea sin lote de produccion cuenta como sin datos', () => {
    expect(missingBatchDataLines([{ presentationId: 'p1' }], [])).toBe(1);
  });

  it('R17: un pedido sin lineas no tiene ninguna sin datos', () => {
    expect(missingBatchDataLines([], [])).toBe(0);
    expect(missingBatchDataLines([], [loteDeLinea('p1', uuid('7'))])).toBe(0);
  });

  it('R4: cuenta por presentacion: sin lote, sin datos y con datos en el mismo pedido', () => {
    const lineas = [{ presentationId: 'p1' }, { presentationId: 'p2' }, { presentationId: 'p3' }];
    const lotes = [loteDeLinea('p2', uuid('8')), loteDeLinea('p3', uuid('9'), DATOS)];
    expect(missingBatchDataLines(lineas, lotes)).toBe(2);
  });

  it('R17: un lote de otra presentacion no cubre la linea', () => {
    expect(missingBatchDataLines([{ presentationId: 'p1' }], [loteDeLinea('p9', uuid('7'), DATOS)])).toBe(1);
  });
});
