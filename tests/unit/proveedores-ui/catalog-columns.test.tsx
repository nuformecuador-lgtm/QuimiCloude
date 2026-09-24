// Celdas de material y medidas del catalogo del proveedor (R28).
//
// `supplier-detail-page.test.tsx` ya cubre el resto de columnas; este archivo se queda solo con
// las dos que R28 anadio, montando la tabla compartida directamente con `buildCatalogColumns`
// -el mismo patron que ese archivo usa para inspeccionar columnas- sin pasar por toda la pagina.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CATALOG_TABLE_TEXTS,
  EMPTY_CATALOG_DIRECTORIES,
  EMPTY_CELL,
  buildCatalogColumns,
} from '@/app/(private)/proveedores/[id]/components';
import { DataTable, type DataTableParams } from '@/components/shared/data-table';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

function parametros(): DataTableParams {
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '' };
}

function linea(overrides: Partial<CatalogLineView> = {}): CatalogLineView {
  return {
    id: 'linea-1',
    supplierId: 'proveedor-1',
    name: 'Envase de prueba',
    presentationId: 'PRESENTACION-ID',
    unitId: null,
    imagePath: null,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    material: null,
    measurements: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function montar(lineas: readonly CatalogLineView[]) {
  const columnas = buildCatalogColumns({
    directories: EMPTY_CATALOG_DIRECTORIES,
    rowActions: () => null,
  });

  render(
    <DataTable
      tableId="catalog-columns-test"
      columns={columnas}
      rows={lineas}
      getRowId={(fila) => fila.id}
      params={parametros()}
      totalPages={1}
      onParamsChange={() => {}}
      status="idle"
      texts={CATALOG_TABLE_TEXTS}
    />,
  );
}

describe('catalogo del proveedor — celdas de material y medidas (R28)', () => {
  it('pinta el material y las tres medidas con el formato compacto de diseno', async () => {
    montar([
      linea({
        material: 'polietileno',
        measurements: {
          diameter: { value: '7.5', unit: 'cm' },
          height: { value: '12', unit: 'cm' },
          mouth: '28/410',
        },
      }),
    ]);

    expect(await screen.findByTestId('data-table-cell-material')).toHaveTextContent('polietileno');
    expect(screen.getByTestId('data-table-cell-measurements')).toHaveTextContent(
      'Ø 7.5 cm · alto 12 cm · boca 28/410',
    );
  });

  it('quita los ceros de relleno del diametro y el alto sin redondear (R28)', async () => {
    montar([
      linea({
        measurements: {
          diameter: { value: '7.5000', unit: 'cm' },
          height: { value: '12.0000', unit: 'cm' },
          mouth: '28/410',
        },
      }),
    ]);

    expect(screen.getByTestId('data-table-cell-measurements')).toHaveTextContent(
      'Ø 7.5 cm · alto 12 cm · boca 28/410',
    );
  });

  it('no redondea el diametro al quitar los ceros de relleno (R28)', async () => {
    montar([
      linea({
        measurements: {
          diameter: { value: '7.5550', unit: 'cm' },
          height: null,
          mouth: null,
        },
      }),
    ]);

    expect(screen.getByTestId('data-table-cell-measurements')).toHaveTextContent('Ø 7.555 cm');
  });

  it('con solo el diametro, la celda pinta unicamente esa medida', async () => {
    montar([
      linea({
        measurements: { diameter: { value: '10', unit: 'mm' }, height: null, mouth: null },
      }),
    ]);

    expect(await screen.findByTestId('data-table-cell-measurements')).toHaveTextContent('Ø 10 mm');
  });

  it('con solo el alto, la celda pinta unicamente esa medida', async () => {
    montar([
      linea({
        measurements: { diameter: null, height: { value: '20', unit: 'cm' }, mouth: null },
      }),
    ]);

    expect(await screen.findByTestId('data-table-cell-measurements')).toHaveTextContent(
      'alto 20 cm',
    );
  });

  it('con solo la boca, la celda pinta unicamente ese texto', async () => {
    montar([linea({ measurements: { diameter: null, height: null, mouth: '28/410' } })]);

    expect(await screen.findByTestId('data-table-cell-measurements')).toHaveTextContent(
      'boca 28/410',
    );
  });

  it('sin material ni medidas, las dos celdas pintan la marca de «sin dato»', async () => {
    montar([linea({ material: null, measurements: null })]);

    expect(await screen.findByTestId('data-table-cell-material')).toHaveTextContent(EMPTY_CELL);
    expect(screen.getByTestId('data-table-cell-measurements')).toHaveTextContent(EMPTY_CELL);
  });
});
