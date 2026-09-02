// T9 — Adaptador driven de producto.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba las funciones PURAS de `product-prisma.ts` -conversion `cost`
// `string <-> Prisma.Decimal`, el mapeo de fila a `ProductView` y la clasificacion del
// nombre de restriccion de una FK-, que es lo unico de ese archivo que se puede probar
// sin base. La garantia real de que `deleted_at IS NULL`, el orden `name ASC, id ASC`,
// la escritura de `created_by`/`updated_by` y la traduccion de `P2003` funcionan contra
// Postgres es de los tests de INTEGRACION (T14,
// `tests/integration/inventario/product-crud.int.test.ts`), no de este archivo.

import { Prisma } from '@prisma/client';

import {
  classifyForeignKeyViolation,
  fromDecimalCost,
  toDecimalInput,
  toProductView,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

describe('toDecimalInput', () => {
  it('convierte una cadena decimal a Prisma.Decimal', () => {
    const resultado = toDecimalInput('12.3400');
    expect(resultado).not.toBeNull();
    expect(resultado?.toFixed(4)).toBe('12.3400');
  });

  it('conserva null cuando el costo es null', () => {
    expect(toDecimalInput(null)).toBeNull();
  });

  it('conserva undefined cuando el costo esta omitido', () => {
    expect(toDecimalInput(undefined)).toBeUndefined();
  });

  // Mutacion: si el codigo devolviera '' en vez de null/undefined, esta asercion caeria.
  it('no confunde null con undefined', () => {
    expect(toDecimalInput(null)).not.toBeUndefined();
    expect(toDecimalInput(undefined)).not.toBeNull();
  });
});

describe('fromDecimalCost', () => {
  it('convierte Prisma.Decimal a cadena con 4 decimales fijos', () => {
    expect(fromDecimalCost(new Prisma.Decimal('7'))).toBe('7.0000');
  });

  it('devuelve null cuando el costo es null', () => {
    expect(fromDecimalCost(null)).toBeNull();
  });

  // Mutacion: si el codigo redondeara a 2 decimales en vez de 4, esta asercion caeria.
  it('no trunca los cuatro decimales', () => {
    expect(fromDecimalCost(new Prisma.Decimal('1.2345'))).toBe('1.2345');
  });
});

describe('toProductView', () => {
  const filaBase = {
    id: 'p-1',
    name: 'Cloro',
    presentationId: 'pr-1',
    presentation: { name: 'Bidon 20 L' },
    stock: 10,
    cost: new Prisma.Decimal('99.9900'),
    minPurchase: 1,
    deliveryTime: 3,
    qtyAlert: 5,
    unit: 'L',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    createdBy: 'user-1',
    updatedBy: 'user-2',
  };

  it('mapea el nombre de la presentacion desde el join, no como identificador', () => {
    const vista = toProductView(filaBase);
    expect(vista.presentationName).toBe('Bidon 20 L');
  });

  it('mapea el costo como cadena, nunca como number', () => {
    const vista = toProductView(filaBase);
    expect(vista.cost).toBe('99.9900');
    expect(typeof vista.cost).toBe('string');
  });

  it('mapea createdBy/updatedBy como identificadores, sin resolver ningun nombre (D20, R8)', () => {
    const vista = toProductView(filaBase);
    expect(vista.createdBy).toBe('user-1');
    expect(vista.updatedBy).toBe('user-2');
  });

  // Mutacion: si el mapeo devolviera null en vez de la cadena de costo, esta asercion caeria.
  it('no pierde el costo cuando la fila lo trae', () => {
    expect(toProductView(filaBase).cost).not.toBeNull();
  });

  it('mapea un costo null como null', () => {
    const vista = toProductView({ ...filaBase, cost: null });
    expect(vista.cost).toBeNull();
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
