// Sacar la subcadena JSON de un texto libre. Dominio puro: sin red y sin proveedor configurado.

import { describe, expect, it } from 'vitest';

import { extractJsonObject } from '@/lib/modules/documentos/domain/json-in-text';

describe('documentos — extraccion de un objeto JSON de un texto libre', () => {
  it('con VALLA de codigo ```json, se extrae el objeto de dentro', () => {
    const texto = '```json\n{"a":1}\n```';
    expect(extractJsonObject(texto)).toBe('{"a":1}');
  });

  it('con PROSA antes y despues del objeto, se extrae solo el objeto', () => {
    const texto = 'Aqui tienes el resultado:\n{"a":1}\nEspero que sirva.';
    expect(extractJsonObject(texto)).toBe('{"a":1}');
  });

  it('sin ninguna llave, devuelve null', () => {
    expect(extractJsonObject('esto no es JSON de verdad')).toBeNull();
  });

  it('con las llaves invertidas (`}` antes que `{`), devuelve null', () => {
    expect(extractJsonObject('cierre } antes que apertura {')).toBeNull();
  });

  it('sin la llave de cierre, devuelve null', () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });

  it('sin la llave de apertura, devuelve null', () => {
    expect(extractJsonObject('"a":1}')).toBeNull();
  });

  it('toma del primer `{` al ultimo `}`, aunque haya varios objetos', () => {
    const texto = 'prefijo {"a":1} intermedio {"b":2} sufijo';
    expect(extractJsonObject(texto)).toBe('{"a":1} intermedio {"b":2}');
  });
});
