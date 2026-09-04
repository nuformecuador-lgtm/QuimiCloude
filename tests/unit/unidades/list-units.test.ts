// T7 — Caso de uso `createListUnits` (`design.md > 9`; `tasks.md > T7`).
//
// Cubre R40 (el listado devuelve el catalogo ordenado y pide siempre un limite
// declarado) y R41 (sin actor, con rol desconocido o con rol distinto de Administrador
// se rechaza SIN leer del repositorio).

import { describe, expect, it, vi } from 'vitest';

import { createListUnits, MAX_UNITS } from '@/lib/modules/unidades/domain/list-units';
import { UnauthorizedError } from '@/lib/modules/unidades/domain/errors';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';
import type { Actor } from '@/lib/modules/unidades/domain/actor';
import type { UnitRef } from '@/lib/modules/unidades/domain/unit-catalog';

const ADMIN_ACTOR: Actor = { id: 'user-admin-1', roleName: 'Administrador' };

const CATALOG: readonly UnitRef[] = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g' },
  { id: 'unit-2', name: 'Litro', symbol: 'L' },
];

/** Repositorio doble cuyo `listAll` FALLA si se le llama: asi R41 -«no lee del
 *  repositorio»- se prueba de verdad, no por ausencia de asercion. */
function repositoryThatMustNotBeCalled(): UnitRepository {
  return {
    listAll: vi.fn(async () => {
      throw new Error('listAll no debia invocarse: el actor no tenia permiso');
    }),
  };
}

describe('createListUnits — R40', () => {
  it('el listado de unidades devuelve el catalogo ordenado y pide siempre un limite declarado', async () => {
    const listAll = vi.fn(async () => CATALOG);
    const listUnits = createListUnits({ units: { listAll } });

    const resultado = await listUnits(ADMIN_ACTOR);

    expect(resultado).toEqual(CATALOG);
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(listAll).toHaveBeenCalledWith(MAX_UNITS);
  });

  it('el orden que devuelve es el que da el repositorio, estable por nombre', async () => {
    const reordenado: readonly UnitRef[] = [...CATALOG].reverse();
    const listAll = vi.fn(async () => reordenado);
    const listUnits = createListUnits({ units: { listAll } });

    const resultado = await listUnits(ADMIN_ACTOR);

    expect(resultado).toEqual(reordenado);
    expect(resultado[0]?.name).toBe('Litro');
    expect(resultado[1]?.name).toBe('Gramo');
  });
});

describe('createListUnits — R41', () => {
  it('sin actor se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units });

    await expect(listUnits(null)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
  });

  it('con rol vacio se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units });

    await expect(listUnits({ id: 'user-1', roleName: '' })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
  });

  it('con rol nulo se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units });

    await expect(listUnits({ id: 'user-1', roleName: null })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(units.listAll).not.toHaveBeenCalled();
  });

  it('con rol desconocido se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units });

    await expect(listUnits({ id: 'user-1', roleName: 'Operador' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(units.listAll).not.toHaveBeenCalled();
  });

  it('con rol distinto de Administrador se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units });

    await expect(
      listUnits({ id: 'user-1', roleName: 'Administradores externos' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
  });
});
