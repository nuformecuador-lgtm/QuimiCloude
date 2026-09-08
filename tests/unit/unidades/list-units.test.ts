// T7 — Caso de uso `createListUnits` (`design.md > 9`; `tasks.md > T7`).
//
// Cubre R40 (el listado devuelve el catalogo ordenado y pide siempre un limite
// declarado) y R41 (sin actor o sin el permiso exigido se rechaza SIN leer del repositorio).
//
// QC-74 (R12, R14, R15, R16, R17, R18): el rechazo ya NO es por nombre de rol —el `Actor` de
// `unidades` ni siquiera tiene ese campo—, sino por PERTENENCIA EXACTA de `'unidades.consultar'`
// al conjunto de permisos. Los cuatro casos de rol de QC-32 se conservan CONVERTIDOS, uno a uno:
// rol `''` -> conjunto vacio; rol `null` -> actor `undefined` (sin conjunto de permisos); rol
// `'Operador'` -> conjunto con otro codigo (`inventario.consultar`); rol
// `'Administradores externos'` -> conjunto con un codigo PARECIDO (`'unidades.'`), que es el
// mismo espiritu: no hay coincidencia parcial (R13).

import { describe, expect, it, vi } from 'vitest';

import { createListUnits, MAX_UNITS } from '@/lib/modules/unidades/domain/list-units';
import { UnauthorizedError, UnidadesError } from '@/lib/modules/unidades/domain/errors';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';
import type { Actor } from '@/lib/modules/unidades/domain/actor';
import type { ListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRef } from '@/lib/modules/unidades/domain/unit-catalog';

/** La empresa de quien pregunta (QC-76 R17). Solo se ANADE al actor: no autoriza nada por si
 *  sola —el permiso se sigue exigiendo aparte y primero— y ningun aserto de este archivo cambia
 *  de exigencia por ella. */
const EMPRESA = 'company-1';

/** Actor con EXACTAMENTE el permiso que exige `listUnits` (R16, R17). Su rol es irrelevante:
 *  el tipo `Actor` ya no lo tiene (R18). Desde QC-76 lleva ademas la empresa (R17). */
const ACTOR_CON_PERMISO: Actor = {
  id: 'user-admin-1',
  companyId: EMPRESA,
  permissions: ['unidades.consultar'],
};

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

    const resultado = await listUnits(undefined, ACTOR_CON_PERMISO);

    expect(resultado).toEqual(CATALOG);
    expect(listAll).toHaveBeenCalledTimes(1);
    // La cota sigue siendo lo primero que recibe el puerto (R40); detras va la consulta ya
    // saneada, vacia porque no se pidio ninguna.
    expect(listAll).toHaveBeenCalledWith(
      MAX_UNITS,
      {
        page: 1,
        sort: null,
        filters: {},
        search: '',
      },
      // QC-76 (R17, R18): el tercer argumento es el AMBITO, y sale de la empresa DEL ACTOR.
      // El caso de uso solo hace de correa: no construye SQL ni conoce el `OR`.
      { companyId: EMPRESA },
    );
  });

  it('el orden que devuelve es el que da el repositorio, estable por nombre', async () => {
    const reordenado: readonly UnitRef[] = [...CATALOG].reverse();
    const { units } = repositoryReturning(reordenado);
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    const resultado = await listUnits(undefined, ACTOR_CON_PERMISO);

    expect(resultado).toEqual(reordenado);
    expect(resultado[0]?.name).toBe('Litro');
    expect(resultado[1]?.name).toBe('Gramo');
  });
});

describe('createListUnits — R41 (QC-74: R12, R14, R15, R16, R17)', () => {
  it('con el permiso unidades.consultar se concede y se lee del repositorio', async () => {
    const { units, listAll } = repositoryReturning(CATALOG);
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    const resultado = await listUnits(undefined, {
      id: 'user-1',
      companyId: EMPRESA,
      permissions: ['unidades.consultar'],
    });

    expect(resultado).toEqual(CATALOG);
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  /**
   * Los cinco rechazos. Los cuatro ultimos son la CONVERSION de los cuatro casos de rol de
   * QC-32 (`''`, `null`, `'Operador'`, `'Administradores externos'`): misma cobertura, ahora
   * expresada sobre el conjunto de permisos (R14).
   */
  const SIN_PERMISO: ReadonlyArray<{ readonly nombre: string; readonly actor: Actor | null | undefined }> = [
    { nombre: 'sin actor', actor: null },
    {
      nombre: 'con conjunto de permisos vacio',
      actor: { id: 'user-1', companyId: EMPRESA, permissions: [] },
    },
    { nombre: 'con actor indefinido, o sea sin conjunto de permisos', actor: undefined },
    {
      nombre: 'con un permiso de otro modulo',
      actor: { id: 'user-1', companyId: EMPRESA, permissions: ['inventario.consultar'] },
    },
    {
      nombre: 'con un codigo parecido que no concede: no hay coincidencia parcial',
      actor: { id: 'user-1', companyId: EMPRESA, permissions: ['unidades.'] },
    },
  ];

  for (const caso of SIN_PERMISO) {
    it(`${caso.nombre} se rechaza sin leer del repositorio`, async () => {
      const units = repositoryThatMustNotBeCalled();
      const listUnits = createListUnits({ units, log: LOG_MUDO });

      // El `as` es solo para el caso `undefined`: la firma declara `Actor | null`, y aqui se
      // ejercita a proposito la defensa en ejecucion de un actor ausente (R14).
      await expect(listUnits(undefined, caso.actor as Actor | null)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(units.listAll).not.toHaveBeenCalled();
      expect(units.listPage).not.toHaveBeenCalled();
    });
  }

  it('un actor CON empresa pero SIN el permiso se rechaza igual: la empresa no autoriza (QC-76 R20)', async () => {
    // QC-76 (R20, decisiones cerradas 24 y 32): que el actor traiga `companyId` —la empresa de
    // su sesion— no le concede nada. El corte sigue siendo la pertenencia exacta de
    // `'unidades.consultar'` al conjunto de permisos, y sigue ocurriendo ANTES del repositorio.
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    await expect(
      listUnits(undefined, { id: 'user-1', companyId: EMPRESA, permissions: [] }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(units.listAll).not.toHaveBeenCalled();
    expect(units.listPage).not.toHaveBeenCalled();
  });

  it('el rechazo lanza el UnauthorizedError del modulo, que es un UnidadesError (R15)', async () => {
    const units = repositoryThatMustNotBeCalled();
    const listUnits = createListUnits({ units, log: LOG_MUDO });

    // `instanceof UnidadesError` es lo que el adaptador driving usa para serializar: si el error
    // saliera de `identity` en vez del modulo, esta linea se pondria roja.
    await expect(
      listUnits(undefined, { id: 'user-1', companyId: EMPRESA, permissions: [] }),
    ).rejects.toBeInstanceOf(UnidadesError);
    const error = await listUnits(undefined, {
      id: 'user-1',
      companyId: EMPRESA,
      permissions: [],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).code).toBe('unauthorized');
  });
});
