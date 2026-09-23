// Adaptador driven de producto.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba la funcion PURA de `product-prisma.ts` -el mapeo de fila a `ProductView`-,
// que es lo unico de ese archivo que se puede probar sin base. La garantia real de que
// `deleted_at IS NULL`, el orden `name ASC, id ASC` y la escritura de `name_normalized`
// funcionan contra Postgres es de los tests de INTEGRACION.
//
// La presentacion y la autoria se mudaron a `product_batches` el 2026-09-09, asi que este
// archivo ya no prueba ni el `join` a `presentations` ni la clasificacion de la FK de
// autoria: ninguna de las dos vive ya en `products`.
//
// La unidad tambien es columna propia del producto (`products.unit_id`): el mapeo la lee
// tal cual, sin recorrer ningun lote.

import { Prisma } from '@prisma/client';

import {
  PRODUCT_SELECT,
  toProductView,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

describe('toProductView', () => {
  const filaBase = {
    id: 'p-1',
    name: 'Cloro',
    // `null` en el fixture base porque hoy nadie llena esa columna; el caso de abajo comprueba
    // que la ruta se copia tal cual.
    imagePath: null,
    stock: new Prisma.Decimal(15),
    unitId: 'u-9',
    qtyAlert: new Prisma.Decimal(5),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('copia la ruta de imagen tal cual, sin componer ninguna URL', () => {
    // 2026-09-07: `inventario` no tiene puerto de almacenamiento -a diferencia de `recetas`-,
    // asi que aqui no se compone URL publica ninguna: lo que hay en la columna es lo que sale.
    expect(toProductView(filaBase).imagePath).toBeNull();
    expect(toProductView({ ...filaBase, imagePath: 'productos/cloro.png' }).imagePath).toBe(
      'productos/cloro.png',
    );
  });

  it('mapea la alerta de cantidad sin reinterpretarla', () => {
    const vista = toProductView(filaBase);
    expect(vista.qtyAlert).toBe('5.0000');
    expect(toProductView({ ...filaBase, qtyAlert: null }).qtyAlert).toBeNull();
  });

  it('no devuelve costo, compra minima ni tiempo de entrega', () => {
    // QC-52 (R1): la vista NO puede llevar costo, compra minima ni tiempo de entrega. Se
    // comprueba sobre el objeto devuelto, no solo con el compilador: un `as any` en el
    // adaptador dejaria pasar el campo sin que el typecheck dijera nada.
    const vista = toProductView(filaBase);
    expect(Object.keys(vista)).not.toContain('cost');
    expect(Object.keys(vista)).not.toContain('minPurchase');
    expect(Object.keys(vista)).not.toContain('deliveryTime');
    expect(Object.keys(vista)).not.toContain('presentationId');
    expect(Object.keys(vista)).not.toContain('presentationName');
    expect(Object.keys(vista)).not.toContain('createdBy');
    expect(Object.keys(vista)).not.toContain('updatedBy');
  });

  it('mapea `stock` y `unitId` tal cual, directamente desde la columna de la fila', () => {
    const vista = toProductView(filaBase);
    expect(vista.stock).toBe('15.0000');
    expect(vista.unitId).toBe('u-9');
    expect(Object.keys(PRODUCT_SELECT)).toContain('stock');
    expect(Object.keys(PRODUCT_SELECT)).toContain('unitId');
  });

  it('`unitId` es null cuando la columna no tiene unidad guardada', () => {
    const vista = toProductView({ ...filaBase, unitId: null });
    expect(vista.unitId).toBeNull();
  });

  it('no expone `stockByUnit` ni `latestBatchUnitId`: no hay lotes en el mapeo', () => {
    const vista = toProductView(filaBase);
    expect(Object.keys(vista)).not.toContain('stockByUnit');
    expect(Object.keys(vista)).not.toContain('latestBatchUnitId');
  });
});

describe('PRODUCT_SELECT: columnas propias del producto, sin catalogo de lotes', () => {
  it('trae `stock` y `unitId`, y no un `batches` con lotes de la relacion', () => {
    expect(Object.keys(PRODUCT_SELECT)).toContain('stock');
    expect(Object.keys(PRODUCT_SELECT)).toContain('unitId');
    expect(Object.keys(PRODUCT_SELECT)).not.toContain('batches');
  });
});
