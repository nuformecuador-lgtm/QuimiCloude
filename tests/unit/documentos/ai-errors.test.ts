import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import { AiUnavailableError, DocumentosError } from '@/lib/modules/documentos/domain/errors';

describe('AiUnavailableError (QC-108)', () => {
  it('R11 — el texto de ai_unavailable es distinto del de invalid_input y del de unexpected', () => {
    const texto = errorMessage('ai_unavailable');
    expect(texto).not.toBe(errorMessage('invalid_input'));
    expect(texto).not.toBe(errorMessage('unexpected'));
  });

  it('R10, R12 — un AiUnavailableError lleva el codigo del catalogo y el mensaje del catalogo, no propio', () => {
    const error = new AiUnavailableError('lectura de pdf, sobre pedidos/2026/09/archivo.pdf');

    expect(error).toBeInstanceOf(DocumentosError);
    expect(error.code).toBe('ai_unavailable');
    expect(error.message).toBe(errorMessage('ai_unavailable'));
  });

  it('R10 — el diagnostico es el dato de depuracion y no sustituye el mensaje del catalogo', () => {
    const sinDiagnostico = new AiUnavailableError();
    const conDiagnostico = new AiUnavailableError('detalle interno');

    expect(sinDiagnostico.message).toBe(conDiagnostico.message);
    expect(conDiagnostico.diagnostic).toBe('detalle interno');
  });
});
