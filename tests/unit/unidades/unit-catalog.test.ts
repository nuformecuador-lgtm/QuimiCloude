// QC-25 (R50) — Adaptador driven de `UnitCatalog` en `unidades`. Primer consumidor del
// puerto: lo implementa esta feature para sus casos de uso de alta y edicion de receta.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-catalog.test.ts`. Solo prueba el mapeo PURO
// (`toUnitRef`) y que `findRefs([])` no dispara ninguna consulta. La garantia real de
// existencia contra Postgres es de los tests de integracion de `recetas` (T14).

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Doble del cliente Prisma para `findRefsSharingBaseInCompany`: aplica el `where` que le
 *  llega, como hace la base. */
const findMany = vi.fn();
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { unit: { findMany } } }));

const { findUnitRefs, toUnitRef } = await import(
  '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma'
);
const { findUnitRefsSharingBaseInCompany } = await import(
  '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
);

describe('toUnitRef', () => {
  it('mapea id, name y symbol tal cual', () => {
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null });
    expect(ref).toEqual({
      id: 'u-1',
      name: 'Litro',
      symbol: 'L',
      baseUnitId: null,
      factor: null,
    });
  });

  it('conserva symbol null cuando la unidad no lo declara (R3)', () => {
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: null, baseUnitId: null, factor: null });
    expect(ref.symbol).toBeNull();
  });

  it('la derivacion viaja entera y el factor sale como TEXTO, nunca como number (QC-26bis)', () => {
    // El `Decimal` de Prisma no puede cruzar el contrato publico de `unidades`, y un
    // `decimal(14,4)` no se degrada a coma flotante: `toUnitRef` lo pasa por `toString()`.
    const ref = toUnitRef({
      id: 'u-kg',
      name: 'Kilogramo',
      symbol: 'kg',
      baseUnitId: 'u-g',
      factor: { toString: () => '1000.0000' },
    });

    expect(ref.baseUnitId).toBe('u-g');
    expect(ref.factor).toBe('1000.0000');
    expect(typeof ref.factor).toBe('string');
  });
});

describe('findRefs', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findUnitRefs([]);
    expect(refs).toEqual([]);
  });
});

describe('findRefsSharingBaseInCompany', () => {
  const EMPRESA = 'c-1';

  const LITRO = { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, companyId: null };
  const MILILITRO = {
    id: 'u-ml',
    name: 'Mililitro',
    symbol: 'mL',
    baseUnitId: 'u-litro',
    factor: { toString: () => '0.0010' },
    companyId: null,
  };
  const GRAMO = { id: 'u-gramo', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null, companyId: null };
  const KILOGRAMO = {
    id: 'u-kg',
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: 'u-gramo',
    factor: { toString: () => '1000.0000' },
    companyId: null,
  };
  const LITRO_AJENA = {
    id: 'u-litro-ajena',
    name: 'Litro ajena',
    symbol: 'L',
    baseUnitId: 'u-litro',
    factor: { toString: () => '1.0000' },
    companyId: 'c-2',
  };

  const UNIDADES = [LITRO, MILILITRO, GRAMO, KILOGRAMO, LITRO_AJENA];

  /** Doble que se comporta como la base: aplica el `where` que le llega, tanto en la consulta
   *  que lee la base efectiva como en la que trae las hermanas. */
  function baseConCincoUnidades(): void {
    findMany.mockImplementation(async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
      if ('baseUnitId' in args.select && !('AND' in args.where)) {
        const ids = (args.where.id as { in: readonly string[] }).in;
        return UNIDADES.filter((unidad) => ids.includes(unidad.id)).map((unidad) => ({
          id: unidad.id,
          baseUnitId: unidad.baseUnitId,
        }));
      }

      const [ambito, coincideBase] = args.where.AND as [
        { OR: readonly { companyId: string | null }[] },
        { OR: readonly [{ id: { in: readonly string[] } }, { baseUnitId: { in: readonly string[] } }] },
      ];
      const basesPedidas = coincideBase.OR[0].id.in;

      return UNIDADES.filter((unidad) => {
        const visiblePorEmpresa = ambito.OR.some((cond) => cond.companyId === unidad.companyId);
        const mismaBase = basesPedidas.includes(unidad.id) || basesPedidas.includes(unidad.baseUnitId ?? '');
        return visiblePorEmpresa && mismaBase;
      });
    });
  }

  beforeEach(() => {
    findMany.mockReset();
  });

  it('T3(a) - pidiendo litro devuelve litro y mililitro', async () => {
    baseConCincoUnidades();

    const refs = await findUnitRefsSharingBaseInCompany(EMPRESA, ['u-litro']);

    expect(refs.map((ref) => ref.id).sort()).toEqual(['u-litro', 'u-ml']);
  });

  it('T3(b) - pidiendo litro NO devuelve un kilogramo', async () => {
    baseConCincoUnidades();

    const refs = await findUnitRefsSharingBaseInCompany(EMPRESA, ['u-litro']);

    expect(refs.map((ref) => ref.id)).not.toContain('u-kg');
  });

  it('T3(c) - NO devuelve una unidad de otra empresa, pero SI una de sistema', async () => {
    baseConCincoUnidades();

    const refs = await findUnitRefsSharingBaseInCompany(EMPRESA, ['u-litro']);

    expect(refs.map((ref) => ref.id)).not.toContain('u-litro-ajena');
    expect(refs.map((ref) => ref.id)).toContain('u-ml');
  });

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findUnitRefsSharingBaseInCompany(EMPRESA, []);

    expect(refs).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
