import { describe, expect, it } from 'vitest';

import { detectImportFileFormat } from '@/lib/modules/inventario/domain/import-file-format';
import { INVENTORY_IMPORT_MAX_FILE_BYTES } from '@/lib/modules/inventario';

const encoder = new TextEncoder();
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0xff, 0xfe]);
const CSV = encoder.encode('Tipo;Nombre;Existencia\r\nInsumo;Ácido;25\r\n');

describe('detectImportFileFormat', () => {
  it('R4 acepta un .xlsx que empieza por la firma ZIP', () => {
    expect(detectImportFileFormat('inventario.xlsx', ZIP)).toBe('xlsx');
  });

  it('R4 acepta un .csv en UTF-8, con o sin BOM', () => {
    expect(detectImportFileFormat('inventario.csv', CSV)).toBe('csv');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...CSV]);
    expect(detectImportFileFormat('inventario.csv', withBom)).toBe('csv');
  });

  it('R4 la extension se mira sin mayusculas', () => {
    expect(detectImportFileFormat('INVENTARIO.XLSX', ZIP)).toBe('xlsx');
    expect(detectImportFileFormat('Inventario.Csv', CSV)).toBe('csv');
  });

  it.each(['inventario.xls', 'inventario.ods', 'inventario.txt', 'inventario', 'inventario.csv.pdf'])(
    'R4 rechaza la extension de %j con unsupported_format',
    (fileName) => {
      expect(detectImportFileFormat(fileName, CSV)).toEqual({ code: 'unsupported_format' });
    },
  );

  it('R4 un .xlsx renombrado a .csv es unsupported_format', () => {
    expect(detectImportFileFormat('inventario.csv', ZIP)).toEqual({ code: 'unsupported_format' });
  });

  it('R4 un .csv renombrado a .xlsx es unsupported_format', () => {
    expect(detectImportFileFormat('inventario.xlsx', CSV)).toEqual({ code: 'unsupported_format' });
  });

  it('R4 un .csv que no es UTF-8 valido es unsupported_format', () => {
    const latin1 = new Uint8Array([0x54, 0x69, 0x70, 0x6f, 0x3b, 0xc1, 0x63, 0x69, 0x64, 0x6f]);
    expect(detectImportFileFormat('inventario.csv', latin1)).toEqual({ code: 'unsupported_format' });
  });

  it('R4 un .csv con bytes nulos (binario) es unsupported_format', () => {
    expect(detectImportFileFormat('inventario.csv', new Uint8Array([0x41, 0x00, 0x42]))).toEqual({
      code: 'unsupported_format',
    });
  });

  it('R6 un archivo vacio de extension valida es empty', () => {
    expect(detectImportFileFormat('inventario.csv', new Uint8Array())).toEqual({ code: 'empty' });
    expect(detectImportFileFormat('inventario.xlsx', new Uint8Array())).toEqual({ code: 'empty' });
  });

  it('R6 un archivo por encima del tope de bytes es file_too_large con su peso', () => {
    const big = new Uint8Array(INVENTORY_IMPORT_MAX_FILE_BYTES + 1);
    expect(detectImportFileFormat('inventario.csv', big)).toEqual({
      code: 'file_too_large',
      bytes: INVENTORY_IMPORT_MAX_FILE_BYTES + 1,
      maxBytes: INVENTORY_IMPORT_MAX_FILE_BYTES,
    });
  });

  it('R6 un archivo justo en el tope no se rechaza por peso', () => {
    const atLimit = new Uint8Array(INVENTORY_IMPORT_MAX_FILE_BYTES).fill(0x41);
    expect(detectImportFileFormat('inventario.csv', atLimit)).toBe('csv');
  });
});
