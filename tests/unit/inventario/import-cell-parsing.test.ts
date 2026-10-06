import { describe, expect, it } from 'vitest';

import {
  normalizeHeader,
  parseImportDate,
  parseImportDecimal,
  parseImportPurchaseDate,
  parseImportType,
} from '@/lib/modules/inventario/domain/import-cell-parsing';

describe('parseImportDecimal', () => {
  it.each([
    ['1234,5', '1234.5'],
    ['1234.5', '1234.5'],
    ['25', '25'],
    ['  3,50 ', '3.50'],
    ['0,0001', '0.0001'],
  ])('R12 lee %j con coma o punto decimal como %j', (text, value) => {
    expect(parseImportDecimal(text)).toEqual({ kind: 'value', value });
  });

  it.each(['1.234,5', '1,234.5', '1.234.567', '1,2,3', '1 234', '1 234,5', "1'234"])(
    'R12 %j con separador de miles o mas de un separador decimal es number_format_invalid',
    (text) => {
      expect(parseImportDecimal(text)).toEqual({ kind: 'number_format_invalid' });
    },
  );

  it('R12 un solo separador se lee siempre como decimal, nunca como miles', () => {
    expect(parseImportDecimal('1.234')).toEqual({ kind: 'value', value: '1.234' });
    expect(parseImportDecimal('1,234')).toEqual({ kind: 'value', value: '1.234' });
  });

  it('R12 vacia o con solo espacios es vacia', () => {
    expect(parseImportDecimal('')).toEqual({ kind: 'empty' });
    expect(parseImportDecimal('   ')).toEqual({ kind: 'empty' });
  });

  it('R12 lo que no es un numero se devuelve tal cual para que lo rechace el esquema de su columna', () => {
    expect(parseImportDecimal('abc')).toEqual({ kind: 'value', value: 'abc' });
  });

  it('R12 un numero nativo de la hoja con mas de 4 decimales es number_format_invalid', () => {
    expect(parseImportDecimal('1.23456', 'number')).toEqual({ kind: 'number_format_invalid' });
    expect(parseImportDecimal('1.2345', 'number')).toEqual({ kind: 'value', value: '1.2345' });
  });

  it('R12 un texto con mas de 4 decimales no es error de formato: lo rechaza el esquema de la columna', () => {
    expect(parseImportDecimal('1,23456')).toEqual({ kind: 'value', value: '1.23456' });
  });
});

describe('parseImportDate', () => {
  it.each([
    ['2026-01-15', '2026-01-15'],
    ['31/12/2026', '2026-12-31'],
    ['15/01/2026', '2026-01-15'],
    ['5/1/2026', '2026-01-05'],
    [' 2026-02-28 ', '2026-02-28'],
    ['29/02/2028', '2028-02-29'],
  ])('R13 lee %j como %j', (text, value) => {
    expect(parseImportDate(text)).toEqual({ kind: 'value', value });
  });

  it.each(['2026-02-30', '30/02/2026', '31/04/2026', '29/02/2027', '2026-13-01', '0050-01-01'])(
    'R13 %j no existe en el calendario',
    (text) => {
      expect(parseImportDate(text)).toEqual({ kind: 'invalid' });
    },
  );

  it.each(['12/31/2026', '2026/01/15', '15-01-2026', '15.01.2026', 'mañana', '20260115'])(
    'R13 %j no tiene una de las formas aceptadas (el mes nunca va primero)',
    (text) => {
      expect(parseImportDate(text)).toEqual({ kind: 'invalid' });
    },
  );

  it('R13 vacia es vacia', () => {
    expect(parseImportDate('  ')).toEqual({ kind: 'empty' });
  });
});

describe('parseImportPurchaseDate', () => {
  const today = '2026-10-06';

  it('R13 la fecha de compra vacia toma la de hoy', () => {
    expect(parseImportPurchaseDate('', today)).toEqual({ kind: 'value', value: today });
  });

  it('R13 la fecha de compra futura se rechaza', () => {
    expect(parseImportPurchaseDate('07/10/2026', today)).toEqual({ kind: 'future' });
    expect(parseImportPurchaseDate('2027-01-01', today)).toEqual({ kind: 'future' });
  });

  it('R13 hoy y el pasado valen', () => {
    expect(parseImportPurchaseDate('06/10/2026', today)).toEqual({ kind: 'value', value: today });
    expect(parseImportPurchaseDate('2026-01-15', today)).toEqual({ kind: 'value', value: '2026-01-15' });
  });

  it('R13 una fecha de compra que no existe es invalida, no futura', () => {
    expect(parseImportPurchaseDate('2026-02-30', today)).toEqual({ kind: 'invalid' });
  });
});

describe('parseImportType', () => {
  it.each([
    ['Insumo', 'PRODUCT'],
    ['  INSUMO ', 'PRODUCT'],
    ['envase', 'PACKAGING'],
    ['Instrumento', 'MACHINE'],
    ['Producto terminado', 'FINISHED_PRODUCT'],
    ['producto   TERMINADO', 'FINISHED_PRODUCT'],
  ])('lee la etiqueta %j sin mayusculas ni espacios de sobra como %s', (text, type) => {
    expect(parseImportType(text)).toBe(type);
  });

  it('ignora las tildes de la etiqueta', () => {
    expect(parseImportType('Ínsumó')).toBe('PRODUCT');
  });

  it.each(['', 'Producto', 'PRODUCT', 'Maquina'])('%j no es un tipo', (text) => {
    expect(parseImportType(text)).toBeNull();
  });
});

describe('normalizeHeader', () => {
  it('R5 ignora mayusculas, tildes y espacios de los extremos', () => {
    expect(normalizeHeader('  PRESENTACIÓN ')).toBe('presentacion');
    expect(normalizeHeader('Fecha  de   compra')).toBe('fecha de compra');
    expect(normalizeHeader('Fórmula')).toBe(normalizeHeader('formula'));
  });
});
