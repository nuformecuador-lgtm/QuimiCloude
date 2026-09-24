// El esquema del borde de la lectura con IA: que rechaza y por que.

import { describe, expect, it } from 'vitest';

import { aiReadInputSchema } from '@/lib/modules/documentos/domain/ai-read-input';

const validBytes = new Uint8Array([1, 2, 3]);

function validInput() {
  return {
    prompt: 'Extrae el precio del catalogo',
    mode: 'pdf' as const,
    path: 'empresa-1/archivo.pdf',
    bytes: validBytes,
  };
}

describe('documentos — esquema de la lectura con IA', () => {
  it('una entrada valida en modo pdf se acepta', () => {
    expect(aiReadInputSchema.safeParse(validInput()).success).toBe(true);
  });

  it('una entrada valida en modo images se acepta', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), mode: 'images' }).success).toBe(true);
  });

  it('R2: un prompt vacio se rechaza', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), prompt: '' }).success).toBe(false);
  });

  it('R2: un prompt de puros espacios se rechaza', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), prompt: '   ' }).success).toBe(false);
  });

  it('R2: un prompt ausente se rechaza', () => {
    const sinPrompt: Record<string, unknown> = validInput();
    delete sinPrompt.prompt;
    expect(aiReadInputSchema.safeParse(sinPrompt).success).toBe(false);
  });

  it('R3: un modo que no es pdf ni images se rechaza', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), mode: 'texto' }).success).toBe(false);
  });

  it('R3: un modo ausente se rechaza', () => {
    const sinModo: Record<string, unknown> = validInput();
    delete sinModo.mode;
    expect(aiReadInputSchema.safeParse(sinModo).success).toBe(false);
  });

  it('R23: un campo desconocido rechaza la entrada entera', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), companyId: 'x' }).success).toBe(false);
  });

  it('R23: unos bytes vacios se rechazan', () => {
    expect(aiReadInputSchema.safeParse({ ...validInput(), bytes: new Uint8Array(0) }).success).toBe(false);
  });
});
