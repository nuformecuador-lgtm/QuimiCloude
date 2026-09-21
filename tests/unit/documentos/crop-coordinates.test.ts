// Sacar el JSON de coordenadas del texto de la IA. Todo el archivo es dominio puro: sin red y sin
// depender de que exista ningun proveedor configurado.

import { describe, expect, it } from 'vitest';

import { extractCropCoordinates } from '@/lib/modules/documentos/domain/crop-coordinates';
import { ValidationError } from '@/lib/modules/documentos/domain/errors';

const PATH = 'empresa-1/archivo-1.pdf';
const JSON_VALIDO = '{"images":[{"page":1,"x":0.1,"y":0.1,"width":0.2,"height":0.2}]}';

describe('documentos — extraccion de coordenadas del texto de la IA', () => {
  it('R4 — un JSON valido, sin nada alrededor, se extrae y valida', () => {
    const resultado = extractCropCoordinates(JSON_VALIDO, PATH);
    expect(resultado.images).toHaveLength(1);
    expect(resultado.images[0]?.page).toBe(1);
  });

  it('R4 — con PROSA alrededor del JSON, se extrae igual', () => {
    const texto = `Aqui estan las coordenadas que pediste:\n${JSON_VALIDO}\nEspero que sirva.`;
    const resultado = extractCropCoordinates(texto, PATH);
    expect(resultado.images).toHaveLength(1);
  });

  it('R4 — con VALLA de codigo ```json, se extrae igual', () => {
    const texto = '```json\n' + JSON_VALIDO + '\n```';
    const resultado = extractCropCoordinates(texto, PATH);
    expect(resultado.images).toHaveLength(1);
  });

  it('R4 — cero regiones (`{"images": []}`) tambien se extrae y valida', () => {
    const resultado = extractCropCoordinates('{"images": []}', PATH);
    expect(resultado.images).toEqual([]);
  });

  describe('los cuatro fallos dan el MISMO resultado, sin volcar el texto entero (R5)', () => {
    const casos: readonly (readonly [string, string])[] = [
      ['sin JSON', 'lo siento, no puedo procesar este documento en este momento'],
      ['JSON roto', '```json\n{"images": [{"page": 1, "x": 0.1,}]}\n```'],
      ['JSON que no encaja con el esquema', '{"images":[{"page":0,"x":2,"y":-1,"width":0,"height":"a"}]}'],
      ['JSON sin la clave `images`', '{"regions":[]}'],
    ];

    it.each(casos)('R5 — %s -> ValidationError con codigo invalid_input', (_nombre, texto) => {
      let capturado: unknown;
      try {
        extractCropCoordinates(texto, PATH);
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      expect((capturado as ValidationError).code).toBe('invalid_input');
    });

    it('R5 — el motivo dice que fallo y sobre que ruta, y NO contiene el texto entero de entrada', () => {
      const textoLargo = 'x'.repeat(500) + ' esto no es JSON de verdad ' + 'y'.repeat(500);
      let capturado: ValidationError | undefined;
      try {
        extractCropCoordinates(textoLargo, PATH);
      } catch (error) {
        capturado = error as ValidationError;
      }
      expect(capturado).toBeInstanceOf(ValidationError);
      const motivo = capturado?.diagnostic ?? '';
      expect(motivo).toContain(PATH);
      expect(motivo).not.toContain(textoLargo);
      expect(motivo.length).toBeLessThan(textoLargo.length);
    });
  });
});
