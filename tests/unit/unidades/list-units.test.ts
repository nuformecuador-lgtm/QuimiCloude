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
import type { ListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRef } from '@/lib/modules/unidades/domain/unit-catalog';

const ADMIN_ACTOR: Actor = { id: 'user-admin-1', roleName: 'Administrador' };

const CATALOG: readonly UnitRef[] = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g' },
  { id: 'unit-2', name: 'Litro', symbol: 'L' },
];

/**
 * QC-57: el caso de uso gana el puerto del log de campos omitidos (R6) y la consulta OPCIONAL
 * (R28). Este archivo comprueba lo de SIEMPRE -R40 y R41 de QC-32- y por eso llama sin consulta
 * (`undefined`), que es el modo catalogo: **ningun aserto de comportamiento cambia**, solo la
 * forma de la llamada y el doble mudo del log. Lo nuevo de QC-57 se prueba en
 * `list-units-query.test.ts`.
 */
const LOG_MUDO: ListQueryLog = { ignoredFields: vi.fn() };

/** Repositorio doble cuyo `listAll` FALLA si se le llama: asi R41 -«no lee del
 *  repositorio»- se prueba de verdad, no por ausencia de asercion. */
function repositoryThatMustNotBeCalled(): UnitRepository {
  return {
    listAll: vi.fn(async () => {
      throw new Error('listAll no debia invocarse: el actor no tenia permiso');
    }),
    listPage: vi.fn(async () => {
      throw new Error('listPage no debia invocarse: el actor no tenia permiso');
    }),
  };
}

/** Doble del puerto que devuelve el catalogo dado. `listPage` no se usa en este archivo: el
 *  modo catalogo -sin consulta- no lo toca nunca, y que falle lo deja demostrado. */
function repositoryReturning(catalog: readonly UnitRef[]): {
  units: UnitRepository;
  listAll: UnitRepository['listAll'];
} {
  const listAll = vi.fn(async () => catalog);
  return {
    units: {
      listAll,
      listPage: vi.fn(async () => {
        throw new Error('listPage no debia invocarse: la consulta no pedia pagina');
      }),
    },
    listAll,
  };
}

describe('createListUnits — R40', () => {
  it('el listado de unidades devuelve el catalogo ordenado y pide siempre un limite declarado', async () => {
    const { units, listAll } = repositoryReturning(CATALOG);
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    const resultado = await listUnits(undefined, ADMIN_ACTOR);

    expect(resultado).toEqual(CATALOG);
    expect(listAll).toHaveBeenCalledTimes(1);
    // La cota sigue siendo lo primero que recibe el puerto (R40); detras va la consulta ya
    // saneada, vacia porque no se pidio ninguna.
    expect(listAll).toHaveBeenCalledWith(MAX_UNITS, {
      page: 1,
      sort: null,
      filters: {},
      search: '',
    });
  });

  it('el orden que devuelve es el que da el repositorio, estable por nombre', async () => {
    const reordenado: readonly UnitRef[] = [...CATALOG].reverse();
    const { units } = repositoryReturning(reordenado);
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    const resultado = await listUnits(undefined, ADMIN_ACTOR);

    expect(resultado).toEqual(reordenado);
    expect(resultado[0]?.name).toBe('Litro');
    expect(resultado[1]?.name).toBe('Gramo');
  });
});

describe('createListUnits — R41', () => {
  it('sin actor se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(listUnits(undefined, null)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });

  it('con rol vacio se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(listUnits(undefined, { id: 'user-1', roleName: '' })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });

  it('con rol nulo se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(listUnits(undefined, { id: 'user-1', roleName: null })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });

  it('con rol desconocido se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(listUnits(undefined, { id: 'user-1', roleName: 'Operador' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });

  it('con rol distinto de Administrador se rechaza sin leer del repositorio', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(
      listUnits(undefined, { id: 'user-1', roleName: 'Administradores externos' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });
});
