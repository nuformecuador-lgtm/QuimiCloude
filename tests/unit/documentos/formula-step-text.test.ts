import { describe, expect, it } from 'vitest';

import { stepTextToDocument } from '@/lib/modules/documentos/domain/formula-step-text';

describe('documentos — stepTextToDocument', () => {
  describe('R9 — un parrafo por linea no vacia, en orden', () => {
    it('una sola linea da un unico parrafo', () => {
      const documento = stepTextToDocument('Mezclar los ingredientes');
      expect(documento).toEqual({
        blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar los ingredientes' }] }],
      });
    });

    it('tres lineas con una vacia en medio da dos parrafos, en orden', () => {
      const documento = stepTextToDocument('Primero\n\nSegundo');
      expect(documento).toEqual({
        blocks: [
          { kind: 'paragraph', spans: [{ text: 'Primero' }] },
          { kind: 'paragraph', spans: [{ text: 'Segundo' }] },
        ],
      });
    });

    it('recorta cada linea antes de convertirla en parrafo', () => {
      const documento = stepTextToDocument('  Primero  \n  Segundo  ');
      expect(documento?.blocks[0]).toEqual({ kind: 'paragraph', spans: [{ text: 'Primero' }] });
      expect(documento?.blocks[1]).toEqual({ kind: 'paragraph', spans: [{ text: 'Segundo' }] });
    });

    it('respeta saltos de linea con retorno de carro (\\r\\n)', () => {
      const documento = stepTextToDocument('Primero\r\nSegundo');
      expect(documento?.blocks).toHaveLength(2);
    });
  });

  describe('un paso sin ningun caracter visible se descarta', () => {
    it('texto vacio -> null', () => {
      expect(stepTextToDocument('')).toBeNull();
    });

    it('solo espacios y saltos de linea -> null', () => {
      expect(stepTextToDocument('   \n   \n\t')).toBeNull();
    });
  });
});
