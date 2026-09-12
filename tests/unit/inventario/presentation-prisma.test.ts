// T10 — Adaptador driven de presentacion.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba las funciones PURAS de `presentation-prisma.ts` -la traduccion de error y el
// mapeo de fila a `PresentationView`-, que es lo unico de ese archivo que se puede probar
// sin base, construyendo a mano instancias de `Prisma.PrismaClientKnownRequestError` con el
// `code` que Prisma le pondria. La garantia real de que el indice unico, el
// `ON DELETE RESTRICT` y la FK `presentations_unit_id_fkey` disparan esos codigos es de los
// tests de INTEGRACION (T13), no de este archivo.

import { Prisma } from '@prisma/client';

import {
  isPresentationInUseViolation,
  isUnitForeignKeyViolation,
  isUniqueNameViolation,
  presentationSelect,
  toPresentationView,
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

// QC-80 (R13): `P2003` llega desde DOS sitios y significa cosas distintas segun la operacion.
// Por eso son dos funciones y no una, y por eso cada una vive en el `catch` de SU operacion:
// al borrar, la FK que se viola es la que apunta HACIA `presentations`
// (`product_batches_presentation_id_fkey`, «esta presentacion esta en uso»); al crear o al
// reemplazar, la que sale DE `presentations` (`presentations_unit_id_fkey`, «esa unidad no
// existe»). Un `catch` comun tendria que adivinar cual, y el usuario leeria el mensaje
// equivocado.
describe('isPresentationInUseViolation — el P2003 del BORRADO (R13)', () => {
  it('reconoce P2003 (product_batches_presentation_id_fkey) como presentacion en uso', () => {
    expect(isPresentationInUseViolation(crearErrorPrisma('P2003'))).toBe(true);
  });

  it('no confunde P2002 (unicidad) con una presentacion en uso', () => {
    expect(isPresentationInUseViolation(crearErrorPrisma('P2002'))).toBe(false);
  });

  it('no confunde un error que no es de Prisma con una presentacion en uso', () => {
    expect(isPresentationInUseViolation(new Error('P2003'))).toBe(false);
  });

  it('no confunde un valor no-error con una presentacion en uso', () => {
    expect(isPresentationInUseViolation(null)).toBe(false);
  });
});

describe('isUnitForeignKeyViolation — el P2003 del ALTA y de la EDICION (R13)', () => {
  it('reconoce P2003 (presentations_unit_id_fkey) como unidad inexistente', () => {
    expect(isUnitForeignKeyViolation(crearErrorPrisma('P2003'))).toBe(true);
  });

  it('no confunde P2002 (nombre duplicado) con una unidad inexistente', () => {
    // Es la distincion que R13 exige conservar hasta el usuario: «ya existe esa presentacion»
    // no es «esa unidad no existe».
    expect(isUnitForeignKeyViolation(crearErrorPrisma('P2002'))).toBe(false);
  });

  it('no confunde un error que no es de Prisma con una unidad inexistente', () => {
    expect(isUnitForeignKeyViolation(new Error('P2003'))).toBe(false);
  });

  it('no confunde un valor no-error con una unidad inexistente', () => {
    expect(isUnitForeignKeyViolation(undefined)).toBe(false);
  });
});

describe('toPresentationView — mapeo de fila a contrato (R15)', () => {
  const fila = {
    id: 'presentacion-1',
    name: 'Bidon 20 L',
    nameNormalized: 'bidon20l',
    unitId: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('copia el unitId de la columna tal cual, sin resolver el nombre ni el simbolo de la unidad', () => {
    // `units` es de otro modulo: aqui sale el identificador y nada mas (`design.md > 3`).
    expect(toPresentationView(fila).unitId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('mapea el resto del contrato sin reinterpretarlo', () => {
    expect(toPresentationView(fila)).toEqual({
      id: 'presentacion-1',
      name: 'Bidon 20 L',
      nameNormalized: 'bidon20l',
      unitId: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  });

  it('el select pide la columna unit_id, que es de donde sale ese campo (R15)', () => {
    // Se afirma como DATO, no como texto del archivo: si alguien quita la columna del select,
    // `toPresentationView` recibiria una fila sin `unitId` y el contrato mentiria.
    expect(presentationSelect.unitId).toBe(true);
  });
});
