// T9 — Adaptador driven de producto.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba las funciones PURAS de `product-prisma.ts` -el mapeo de fila a
// `ProductView` y la clasificacion del nombre de restriccion de una FK-, que es lo unico de ese archivo que se puede probar
// sin base. La garantia real de que `deleted_at IS NULL`, el orden `name ASC, id ASC`,
// la escritura de `created_by`/`updated_by` y la traduccion de `P2003` funcionan contra
// Postgres es de los tests de INTEGRACION (T14,
// `tests/integration/inventario/product-crud.int.test.ts`), no de este archivo.

import {
  classifyForeignKeyViolation,
  toProductView,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

// QC-52 (R1): los describes de `toDecimalInput` y `fromDecimalCost` se fueron con el
// costo del producto. No se «arreglaron» ni se relajaron: las funciones que probaban ya
// no existen en este adaptador, porque el producto ya no lleva ningun importe. La
// conversion `string <-> Prisma.Decimal` sigue probada donde el importe se quedo, en el
// adaptador de la linea de catalogo de `proveedores`.

describe('toProductView', () => {
  const filaBase = {
    id: 'p-1',
    name: 'Cloro',
    presentationId: 'pr-1',
    presentation: { name: 'Bidon 20 L' },
    stock: 10,
    qtyAlert: 5,
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La fila que devuelve
    // Prisma ya no trae `unit: 'L'` (texto) sino `unit_id`, la referencia a `units`. Cambia
    // la FORMA del dato, no lo que este describe hace: comprobar que `toProductView` no
    // pierde ni reinterpreta ningun campo de la fila.
    unitId: 'u-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    createdBy: 'user-1',
    updatedBy: 'user-2',
  };

  it('mapea el nombre de la presentacion desde el join, no como identificador', () => {
    const vista = toProductView(filaBase);
    expect(vista.presentationName).toBe('Bidon 20 L');
  });

  // QC-52 (R1, R2): lo que antes se afirmaba sobre el costo se afirma ahora sobre lo que
  // el producto CONSERVA. `stock` y `qtyAlert` siguen siendo numeros anulables, con la
  // misma forma y la misma opcionalidad de antes.
  it('mapea la existencia y la alerta de cantidad sin reinterpretarlas', () => {
    const vista = toProductView(filaBase);
    expect(vista.stock).toBe(10);
    expect(vista.qtyAlert).toBe(5);
    expect(toProductView({ ...filaBase, stock: null, qtyAlert: null }).stock).toBeNull();
    expect(toProductView({ ...filaBase, stock: null, qtyAlert: null }).qtyAlert).toBeNull();
  });

  // QC-52 (R1): la vista NO puede llevar costo, compra minima ni tiempo de entrega. Se
  // comprueba sobre el objeto devuelto, no solo con el compilador: un `as any` en el
  // adaptador dejaria pasar el campo sin que el typecheck dijera nada.
  it('no devuelve costo, compra minima ni tiempo de entrega', () => {
    const vista = toProductView(filaBase);
    expect(Object.keys(vista)).not.toContain('cost');
    expect(Object.keys(vista)).not.toContain('minPurchase');
    expect(Object.keys(vista)).not.toContain('deliveryTime');
  });

  it('mapea createdBy/updatedBy como identificadores, sin resolver ningun nombre (D20, R8)', () => {
    const vista = toProductView(filaBase);
    expect(vista.createdBy).toBe('user-1');
    expect(vista.updatedBy).toBe('user-2');
  });

  it('mapea la unidad como referencia al catalogo, sin resolver nombre ni simbolo', () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Mismo criterio que
    // `createdBy`/`updatedBy` (D20): la vista lleva el IDENTIFICADOR, no el nombre resuelto
    // -resolverlo obligaria a `inventario` a leer la tabla de `unidades`, que es justo lo
    // que la frontera de modulo prohibe (QC-32 R16, `design.md > 5.3`)-. La unidad sigue
    // siendo ANOTATIVA (QC-32 R14): el mapeo no la convierte ni la compara con nada.
    const vista = toProductView(filaBase);
    expect(vista.unitId).toBe('u-1');
  });

  it('mapea una unidad ausente como null, no como cadena vacia', () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva lo que
    // QC-14 R5 vigila -la unidad del producto es OPCIONAL y la ausencia se devuelve como
    // ausencia (QC-32 R10)-, ahora sobre `unitId`.
    const vista = toProductView({ ...filaBase, unitId: null });
    expect(vista.unitId).toBeNull();
  });

  // Mutacion: si el mapeo devolviera la presentacion como identificador en vez del nombre
  // del `join`, esta asercion caeria.
  it('no confunde el nombre de la presentacion con su identificador', () => {
    const vista = toProductView(filaBase);
    expect(vista.presentationName).not.toBe(vista.presentationId);
  });
});

describe('classifyForeignKeyViolation', () => {
  it('clasifica products_presentation_id_fkey como violacion de presentacion', () => {
    expect(classifyForeignKeyViolation('products_presentation_id_fkey (index)')).toBe('presentation');
  });

  it('clasifica products_created_by_fkey como violacion de actor', () => {
    expect(classifyForeignKeyViolation('products_created_by_fkey (index)')).toBe('actor');
  });

  it('clasifica products_updated_by_fkey como violacion de actor', () => {
    expect(classifyForeignKeyViolation('products_updated_by_fkey (index)')).toBe('actor');
  });

  it('clasifica una restriccion desconocida como unknown', () => {
    expect(classifyForeignKeyViolation('otra_restriccion_cualquiera')).toBe('unknown');
  });

  // Mutacion: si el codigo usara igualdad exacta en vez de `includes`, este caso -con
  // sufijo "(index)" que Prisma agrega al `field_name`- caeria.
  it('no exige coincidencia exacta del nombre de la restriccion', () => {
    expect(classifyForeignKeyViolation('products_created_by_fkey (index)')).not.toBe('unknown');
  });
});
