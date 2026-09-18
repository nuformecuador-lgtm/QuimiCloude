// La clasificacion reintentable vs definitivo, los cinco casos de la tabla del diseno (R15, R16).

import { describe, expect, it } from 'vitest';

import { STORAGE_FAILURE_KIND, failureKind } from '@/lib/modules/documentos/domain/failure-kind';

describe('documentos — failureKind (R15, R16)', () => {
  it('R15 — la descarga del bucket es reintentable', () => {
    expect(STORAGE_FAILURE_KIND).toBe('retryable');
  });

  it('R15 — `ai_unavailable` (el proveedor de IA no respondio) es reintentable', () => {
    expect(failureKind('ai_unavailable')).toBe('retryable');
  });

  it('R16 — `unexpected` (countPages/renderPages revientan) es definitivo', () => {
    expect(failureKind('unexpected')).toBe('definitive');
  });

  it('R16 — `invalid_input` por PDF por encima del tope de paginas es definitivo', () => {
    expect(failureKind('invalid_input')).toBe('definitive');
  });

  it('R16 — `invalid_input` por estrategia guardada invalida es definitivo (mismo codigo, mismo caso)', () => {
    expect(failureKind('invalid_input')).toBe('definitive');
  });

  it('un codigo ajeno a los tres conocidos se trata como definitivo', () => {
    expect(failureKind('product_not_found')).toBe('definitive');
  });
});
