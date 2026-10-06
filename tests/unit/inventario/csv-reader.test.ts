import { describe, expect, it } from 'vitest';

import { detectCsvDelimiter, readCsv } from '@/lib/modules/inventario/adapters/driven/spreadsheet/csv-reader';

const encoder = new TextEncoder();

function texts(csv: string | Uint8Array): string[][] {
  const result = readCsv(typeof csv === 'string' ? encoder.encode(csv) : csv);
  if (result.kind !== 'ok') throw new Error(`esperaba ok y llego ${result.kind}`);
  return result.rows.map((row) => row.map((cell) => cell.text));
}

describe('readCsv', () => {
  it('R4 lee cabecera y filas con separador ; y todas las celdas con origen texto', () => {
    const result = readCsv(encoder.encode('Tipo;Nombre\nInsumo;Ácido'));
    expect(result).toEqual({
      kind: 'ok',
      rows: [
        [
          { text: 'Tipo', origin: 'text' },
          { text: 'Nombre', origin: 'text' },
        ],
        [
          { text: 'Insumo', origin: 'text' },
          { text: 'Ácido', origin: 'text' },
        ],
      ],
    });
  });

  it('R4 respeta comillas, separador dentro de comillas y comillas escapadas', () => {
    expect(texts('Nombre;Lote\n"Sal; fina";"L-""A"""\n')).toEqual([
      ['Nombre', 'Lote'],
      ['Sal; fina', 'L-"A"'],
      [''],
    ]);
  });

  it('R4 respeta un salto de linea dentro de comillas', () => {
    expect(texts('Nombre;Lote\r\n"linea 1\r\nlinea 2";L1')).toEqual([
      ['Nombre', 'Lote'],
      ['linea 1\r\nlinea 2', 'L1'],
    ]);
  });

  it('R4 lee CRLF igual que LF', () => {
    expect(texts('A;B\r\n1;2\r\n3;4')).toEqual(texts('A;B\n1;2\n3;4'));
  });

  it('R4 quita el BOM del principio y la primera cabecera queda limpia', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode('Tipo;Nombre\nInsumo;Sal')]);
    expect(texts(withBom)[0]).toEqual(['Tipo', 'Nombre']);
  });

  it('R4 conserva las filas en blanco para que el numero de fila sea el de la hoja', () => {
    expect(texts('A;B\n\n1;2\n;\n3;4')).toEqual([['A', 'B'], [''], ['1', '2'], ['', ''], ['3', '4']]);
  });

  it('R12 con separador , el decimal con coma va entre comillas y llega entero', () => {
    expect(texts('Nombre,Existencia\nSal,"1234,5"')).toEqual([
      ['Nombre', 'Existencia'],
      ['Sal', '1234,5'],
    ]);
  });

  it('R4 una comilla sin cerrar hace el archivo ilegible', () => {
    expect(readCsv(encoder.encode('A;B\n"sin cerrar;2\n3;4'))).toEqual({ kind: 'unreadable' });
  });

  it('R4 bytes que no son UTF-8 hacen el archivo ilegible', () => {
    expect(readCsv(new Uint8Array([0x41, 0x3b, 0xc1, 0x42]))).toEqual({ kind: 'unreadable' });
  });
});

describe('detectCsvDelimiter', () => {
  it('R4 elige ; cuando la cabecera lo trae', () => {
    expect(detectCsvDelimiter('Tipo;Nombre\n1,5;2,5')).toBe(';');
  });

  it('R4 elige , cuando la cabecera solo trae comas, aunque los datos traigan ;', () => {
    expect(detectCsvDelimiter('Tipo,Nombre\nInsumo,"a;b"')).toBe(',');
  });

  it('R4 con los dos en la cabecera elige ;', () => {
    expect(detectCsvDelimiter('Tipo,x;Nombre')).toBe(';');
  });

  it('R4 ignora los separadores entre comillas de la cabecera', () => {
    expect(detectCsvDelimiter('"Tipo;raro",Nombre')).toBe(',');
  });

  it('R4 solo mira la primera linea', () => {
    expect(detectCsvDelimiter('Tipo,Nombre\r\nInsumo;Sal')).toBe(',');
  });

  it('R4 una cabecera de una sola columna usa ;', () => {
    expect(detectCsvDelimiter('Tipo\nInsumo')).toBe(';');
  });
});
