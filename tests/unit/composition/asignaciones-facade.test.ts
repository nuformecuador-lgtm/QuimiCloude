// QC-102 T5 — La FACHADA ya cableada del modulo `asignaciones` (`design.md > 2.5`).
//
// Lo que se afirma aqui es el CABLEADO, no el dominio: que `lib/composition` publica las CINCO
// operaciones del modulo —las cuatro de QC-87 mas la consulta EN LOTE de QC-102— y que la nueva se
// cablea con el MISMO repositorio y el MISMO directorio de personas, sin ningun adaptador nuevo y
// **sin `OrderCatalog`** (hallazgo H3: comprobar cada pedido costaria una consulta por pedido, que
// es justo lo que R4 prohibe).
//
// Como `tests/unit/composition/identity-facade.test.ts`: se sustituye el cliente Prisma entero
// —`lib/composition` arrastra todos los adaptadores del repo y no hace falta ni Postgres ni
// `DATABASE_URL`— y se ejercita el cableado REAL.
//
// RETENSADO QC-88 (T8, R13). La fachada pasa de CINCO a SEIS operaciones: `listAssignedOrders`,
// la lista de trabajo del Operador, cableada con las CUATRO dependencias de `design.md > 6`
// (`orderAssignmentRepository`, `orderCatalog` YA con `listAliveSummariesByIds`, `recipeCatalog`
// y `peopleDirectory`) y NINGUN adaptador nuevo.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

import { asignaciones } from '@/lib/composition';

describe('QC-88 T8 — la fachada de `asignaciones` lista sus SEIS operaciones', () => {
  it('expone las cinco anteriores mas `listAssignedOrders`, y ninguna mas', () => {
    expect(Object.keys(asignaciones).sort()).toEqual([
      'assignResponsibles',
      'listAssignedOrders',
      'listOrderResponsibles',
      'listResponsiblesForOrders',
      'removeWorkGroupFromOrder',
      'unassignResponsible',
    ]);
  });

  it('`listResponsiblesForOrders` es una funcion de DOS argumentos: el actor y los identificadores', () => {
    // El actor entra por PARAMETRO, igual que en las otras cuatro: la composicion no lo resuelve
    // (quien lo construye con las dos caras de la sesion es el adaptador driving).
    expect(typeof asignaciones.listResponsiblesForOrders).toBe('function');
    expect(asignaciones.listResponsiblesForOrders).toHaveLength(2);
  });

  it('rechaza sin permiso sin llegar a la base: la frontera esta en el caso de uso, no aqui', async () => {
    // El cliente Prisma doblado es `{}`: si la operacion tocara el repositorio, reventaria con un
    // `TypeError` en vez de con `unauthorized`. Que salga `unauthorized` demuestra las dos cosas a
    // la vez —el cableado existe y el permiso corta ANTES de ningun puerto (R2)—.
    const error = await asignaciones
      .listResponsiblesForOrders({ id: 'u', companyId: 'c', permissions: [] }, [])
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });

  it('`listAssignedOrders` es una funcion de DOS argumentos: el actor y la entrada', () => {
    expect(typeof asignaciones.listAssignedOrders).toBe('function');
    expect(asignaciones.listAssignedOrders).toHaveLength(2);
  });

  it('`listAssignedOrders` rechaza sin `asignaciones.consultar` sin llegar a la base (R5, R13)', async () => {
    // Mismo criterio que arriba: el cliente Prisma doblado es `{}`, asi que un `unauthorized`
    // demuestra a la vez que el cableado existe y que el permiso corta ANTES de ningun puerto.
    const error = await asignaciones
      .listAssignedOrders({ id: 'u', companyId: 'c', permissions: [] }, { page: 1 })
      .catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('unauthorized');
  });
});
