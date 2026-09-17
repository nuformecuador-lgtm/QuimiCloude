// QC-25 (R50) — Adaptador driven de `UnitCatalog` en `unidades`. Primer consumidor del
// puerto: lo implementa esta feature para sus casos de uso de alta y edicion de receta.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-catalog.test.ts`. Prueba el mapeo PURO (`toUnitRef`), que
// `findRefs([])` no dispara ninguna consulta y -QC-50, R24- que la consulta reutiliza
// `companyScopeWhere` -la UNICA definicion de «de la empresa o de sistema» que exporta
// `unit-prisma.ts`- en vez de escribir un segundo `OR`. La garantia real de existencia y de
// aislamiento contra Postgres es de los tests de integracion de `recetas` (T14).

import {
  findUnitRefs,
  toUnitRef,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { companyScopeWhere } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';

/**
 * Doble del cliente Prisma, SOLO para el bloque QC-50 R24 de mas abajo: cuenta invocaciones y
 * deja inspeccionar el `where` que de verdad viaja a `findMany` -misma tecnica que
 * `tests/unit/inventario/product-catalog.test.ts` y `tests/unit/recetas/recipe-catalog.test.ts`-.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { unit: { findMany } } }));

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
  beforeEach(() => {
    findMany.mockReset();
  });

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findUnitRefs([], 'empresa-1');
    expect(refs).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('QC-50 R24 — findRefs reutiliza companyScopeWhere, el punto unico del modulo', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('la consulta compone el ambito con companyScopeWhere y no escribe un segundo OR', async () => {
    findMany.mockResolvedValue([]);

    await findUnitRefs(['u-1', 'u-2'], 'empresa-1');

    const args = findMany.mock.calls[0]?.[0];
    // Igualdad ESTRUCTURAL con lo que devuelve la misma funcion que usa el resto de
    // `unidades`: si `findUnitRefs` escribiera su propio `OR` de sistema/empresa, esta
    // igualdad podria coincidir hoy por casualidad y divergir manana.
    expect(args.where).toEqual({
      AND: [companyScopeWhere({ companyId: 'empresa-1' }), { id: { in: ['u-1', 'u-2'] } }],
    });
    // Y en el texto de la consulta compuesta solo aparece UN `OR`: el de `companyScopeWhere`.
    expect(JSON.stringify(args.where).match(/"OR"/g)).toHaveLength(1);
  });

  it('una unidad DE SISTEMA (companyId nulo) se resuelve para cualquier empresa', async () => {
    // Con mocks no se prueba que Postgres aplique el OR de verdad -eso es de
    // `tests/integration/**`-, pero SI que el adaptador no filtra de nuevo por su cuenta:
    // devuelve tal cual lo que el `where` (ya acotado por `companyScopeWhere`) dejo pasar.
    findMany.mockResolvedValue([{ id: 'u-sistema', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]);

    const refs = await findUnitRefs(['u-sistema'], 'cualquier-empresa');

    expect(refs.map((ref) => ref.id)).toEqual(['u-sistema']);
  });

  it('una unidad PROPIA de la empresa se resuelve', async () => {
    findMany.mockResolvedValue([{ id: 'u-propia', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null }]);

    const refs = await findUnitRefs(['u-propia'], 'empresa-1');

    expect(refs.map((ref) => ref.id)).toEqual(['u-propia']);
  });

  it('una unidad de OTRA empresa no vuelve: mismo camino que una que no existe', async () => {
    // El mock simula lo que el `where` acotado dejaria pasar: la unidad ajena simplemente no
    // esta en la fila que devuelve `findMany`.
    findMany.mockResolvedValue([]);

    const refs = await findUnitRefs(['u-de-otra-empresa'], 'empresa-1');

    expect(refs).toEqual([]);
  });
});
