// T10 — Adaptador driven de presentacion.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba las dos funciones PURAS de traduccion de error de
// `presentation-prisma.ts` -lo unico de ese archivo que se puede probar sin base-,
// construyendo a mano instancias de `Prisma.PrismaClientKnownRequestError` con el
// `code` que Prisma le pondria. La garantia real de que el indice unico y el
// `ON DELETE RESTRICT` disparan esos codigos es de los tests de INTEGRACION (T14,
// `tests/integration/inventario/presentation-uniqueness.int.test.ts`), no de este
// archivo.

import { Prisma } from '@prisma/client';

import {
  isPresentationForeignKeyViolation,
  isUniqueNameViolation,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';

function crearErrorPrisma(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mensaje de Postgres en espanol', {
    code,
    clientVersion: 'test',
  });
}

describe('isUniqueNameViolation', () => {
  it('reconoce P2002 (indice unico presentations_name_normalized_key) como violacion de unicidad', () => {
    expect(isUniqueNameViolation(crearErrorPrisma('P2002'))).toBe(true);
  });

  it('no confunde P2003 (FK) con una violacion de unicidad', () => {
    expect(isUniqueNameViolation(crearErrorPrisma('P2003'))).toBe(false);
  });

  it('no confunde un error que no es de Prisma con una violacion de unicidad', () => {
    expect(isUniqueNameViolation(new Error('P2002'))).toBe(false);
  });

  it('no confunde un valor no-error con una violacion de unicidad', () => {
    expect(isUniqueNameViolation(undefined)).toBe(false);
  });
});

describe('isPresentationForeignKeyViolation', () => {
  it('reconoce P2003 (products_presentation_id_fkey) como violacion de FK', () => {
    expect(isPresentationForeignKeyViolation(crearErrorPrisma('P2003'))).toBe(true);
  });

  it('no confunde P2002 (unicidad) con una violacion de FK', () => {
    expect(isPresentationForeignKeyViolation(crearErrorPrisma('P2002'))).toBe(false);
  });

  it('no confunde un error que no es de Prisma con una violacion de FK', () => {
    expect(isPresentationForeignKeyViolation(new Error('P2003'))).toBe(false);
  });

  it('no confunde un valor no-error con una violacion de FK', () => {
    expect(isPresentationForeignKeyViolation(null)).toBe(false);
  });
});
