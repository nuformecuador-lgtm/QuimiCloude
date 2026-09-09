// T9 — Adaptador driven de producto.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba la funcion PURA de `product-prisma.ts` -el mapeo de fila a `ProductView`-,
// que es lo unico de ese archivo que se puede probar sin base. La garantia real de que
// `deleted_at IS NULL`, el orden `name ASC, id ASC` y la escritura de `name_normalized`
// funcionan contra Postgres es de los tests de INTEGRACION (T14).
//
// La presentacion y la autoria se mudaron a `product_batches` el 2026-09-09, asi que este
// archivo ya no prueba ni el `join` a `presentations` ni la clasificacion de la FK de
// autoria: ninguna de las dos vive ya en `products`.

import { toProductView } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

describe('toProductView', () => {
  const filaBase = {
    id: 'p-1',
    name: 'Cloro',
    // 2026-09-07: el producto expone su ruta de imagen. `null` en el fixture base porque hoy
    // nadie llena esa columna; el caso de abajo comprueba que la ruta se copia tal cual.
    imagePath: null,
    stock: 10,
    qtyAlert: 5,
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La fila que devuelve
    // Prisma ya no trae `unit: 'L'` (texto) sino `unit_id`, la referencia a `units`.
    unitId: 'u-1',
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

  it('mapea la existencia y la alerta de cantidad sin reinterpretarlas', () => {
    const vista = toProductView(filaBase);
    expect(vista.stock).toBe(10);
    expect(vista.qtyAlert).toBe(5);
    expect(toProductView({ ...filaBase, stock: null, qtyAlert: null }).stock).toBeNull();
    expect(toProductView({ ...filaBase, stock: null, qtyAlert: null }).qtyAlert).toBeNull();
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

  it('mapea la unidad como referencia al catalogo, sin resolver nombre ni simbolo', () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La vista lleva el
    // IDENTIFICADOR, no el nombre resuelto -resolverlo obligaria a `inventario` a leer la
    // tabla de `unidades`, que es justo lo que la frontera de modulo prohibe-.
    const vista = toProductView(filaBase);
    expect(vista.unitId).toBe('u-1');
  });

  it('mapea una unidad ausente como null, no como cadena vacia', () => {
    const vista = toProductView({ ...filaBase, unitId: null });
    expect(vista.unitId).toBeNull();
  });
});
