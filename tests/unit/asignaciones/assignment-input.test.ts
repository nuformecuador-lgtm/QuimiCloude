// QC-87 T6 — El BORDE de `asignaciones`: los tres esquemas de entrada (R31, R42, R44).
//
// Lo que se vigila aqui no es solo lo que los esquemas ACEPTAN, sino sobre todo lo que RECHAZAN:
// identificador que no es un uuid, listas ausentes, operacion sin ninguna persona ni ningun grupo
// (R42), y —la mas importante— que la entrada de desasignar NO PUEDA EXPRESAR un borrado de varias
// filas (R31). Por eso los tres son `strictObject`: con `object`, una clave desconocida se DESCARTA
// en silencio y el test quedaria verde mientras el llamante cree que mando una lista.
//
// El rechazo NO toca ningun puerto: aqui se demuestra en su forma fuerte —el esquema es una funcion
// pura, no tiene con que tocarlo—; la mitad que lo demuestra sobre el caso de uso con un doble que
// falla si lo llaman es de T7-T9.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo: quien reexporta
// desde `lib/modules/asignaciones/index.ts` es T10, y este test no debe adelantarlo.

import { describe, expect, it } from 'vitest';

import {
  assignResponsiblesSchema,
  removeWorkGroupFromOrderSchema,
  unassignResponsibleSchema,
} from '@/lib/modules/asignaciones/domain/assignment-input';

const PEDIDO = '44444444-4444-4444-8444-444444444444';
const PERSONA_A = '11111111-1111-4111-8111-111111111111';
const PERSONA_B = '22222222-2222-4222-8222-222222222222';
const GRUPO = '55555555-5555-4555-8555-555555555555';

/**
 * Los campos que NINGUN esquema del borde puede aceptar. `companyId` es R5 —la empresa sale del
 * actor—; `origin` y `workGroupName` son R28 —el origen y el nombre congelado los pone el caso de
 * uso en la misma escritura—; `now` es R21 —el instante entra por parametro—.
 */
const PROHIBIDOS: Readonly<Record<string, unknown>> = {
  companyId: '33333333-3333-4333-8333-333333333333',
  origin: 'direct',
  workGroupName: 'Turno de noche',
  now: '2026-09-13T00:00:00.000Z',
};

describe('QC-87 — esquemas del borde de `asignaciones`', () => {
  describe('asignar responsables', () => {
    it('acepta personas sueltas, grupos, o las dos cosas a la vez (R24)', () => {
      expect(
        assignResponsiblesSchema.parse({ orderId: PEDIDO, userIds: [PERSONA_A], workGroupIds: [] }).userIds,
      ).toEqual([PERSONA_A]);
      expect(
        assignResponsiblesSchema.parse({ orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO] }).workGroupIds,
      ).toEqual([GRUPO]);
      expect(
        assignResponsiblesSchema.safeParse({
          orderId: PEDIDO,
          userIds: [PERSONA_A, PERSONA_B],
          workGroupIds: [GRUPO],
        }).success,
      ).toBe(true);
    });

    it('rechaza un `orderId` que no es un uuid (R42)', () => {
      for (const orderId of ['', 'no-es-uuid', '44444444', 42, null, undefined]) {
        expect(assignResponsiblesSchema.safeParse({ orderId, userIds: [PERSONA_A], workGroupIds: [] }).success).toBe(
          false,
        );
      }
    });

    it('rechaza un identificador de la lista que no es un uuid (R42)', () => {
      expect(
        assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: ['no-es-uuid'], workGroupIds: [] }).success,
      ).toBe(false);
      expect(
        assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: [], workGroupIds: ['no-es-uuid'] }).success,
      ).toBe(false);
    });

    it('rechaza las listas AUSENTES, cada una por su cuenta (R42)', () => {
      expect(assignResponsiblesSchema.safeParse({ orderId: PEDIDO, workGroupIds: [GRUPO] }).success).toBe(false);
      expect(assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: [PERSONA_A] }).success).toBe(false);
      expect(assignResponsiblesSchema.safeParse({ orderId: PEDIDO }).success).toBe(false);
    });

    it('rechaza una lista que no es una lista (R42)', () => {
      expect(assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: PERSONA_A, workGroupIds: [] }).success).toBe(
        false,
      );
    });

    it('rechaza la operacion SIN ninguna persona y SIN ningun grupo (R42)', () => {
      expect(assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: [], workGroupIds: [] }).success).toBe(false);
    });

    it('rechaza identificadores REPETIDOS en cualquiera de las dos listas', () => {
      expect(
        assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: [PERSONA_A, PERSONA_A], workGroupIds: [] })
          .success,
      ).toBe(false);
      expect(
        assignResponsiblesSchema.safeParse({ orderId: PEDIDO, userIds: [], workGroupIds: [GRUPO, GRUPO] }).success,
      ).toBe(false);
    });

    it('rechaza cualquier campo que el llamante no puede decidir (R5, R21, R28)', () => {
      for (const [campo, valor] of Object.entries(PROHIBIDOS)) {
        expect(
          assignResponsiblesSchema.safeParse({
            orderId: PEDIDO,
            userIds: [PERSONA_A],
            workGroupIds: [],
            [campo]: valor,
          }).success,
        ).toBe(false);
      }
    });
  });

  describe('quitar un grupo del pedido', () => {
    it('acepta el pedido y UN grupo', () => {
      expect(removeWorkGroupFromOrderSchema.parse({ orderId: PEDIDO, workGroupId: GRUPO })).toEqual({
        orderId: PEDIDO,
        workGroupId: GRUPO,
      });
    });

    it('rechaza uuid mal formado, campo ausente y campo de mas (R42)', () => {
      expect(removeWorkGroupFromOrderSchema.safeParse({ orderId: 'x', workGroupId: GRUPO }).success).toBe(false);
      expect(removeWorkGroupFromOrderSchema.safeParse({ orderId: PEDIDO, workGroupId: 'x' }).success).toBe(false);
      expect(removeWorkGroupFromOrderSchema.safeParse({ orderId: PEDIDO }).success).toBe(false);
      expect(removeWorkGroupFromOrderSchema.safeParse({ workGroupId: GRUPO }).success).toBe(false);
      expect(
        removeWorkGroupFromOrderSchema.safeParse({ orderId: PEDIDO, workGroupId: GRUPO, companyId: GRUPO }).success,
      ).toBe(false);
    });

    it('no admite una LISTA de grupos', () => {
      expect(removeWorkGroupFromOrderSchema.safeParse({ orderId: PEDIDO, workGroupIds: [GRUPO] }).success).toBe(false);
    });
  });

  describe('desasignar a una persona', () => {
    it('acepta el pedido y UNA persona', () => {
      expect(unassignResponsibleSchema.parse({ orderId: PEDIDO, userId: PERSONA_A })).toEqual({
        orderId: PEDIDO,
        userId: PERSONA_A,
      });
    });

    it('la entrada NO PUEDE EXPRESAR un borrado de varias filas (R31)', () => {
      // Una lista en lugar del singular.
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO, userIds: [PERSONA_A, PERSONA_B] }).success).toBe(
        false,
      );
      // La lista ADEMAS del singular: con `object` se descartaria en silencio; aqui falla.
      expect(
        unassignResponsibleSchema.safeParse({ orderId: PEDIDO, userId: PERSONA_A, userIds: [PERSONA_B] }).success,
      ).toBe(false);
      // Un array donde va el identificador.
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO, userId: [PERSONA_A] }).success).toBe(false);
      // «Todas las de este pedido» tampoco es expresable.
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO }).success).toBe(false);
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO, all: true }).success).toBe(false);
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO, workGroupId: GRUPO }).success).toBe(false);
    });

    it('rechaza uuid mal formado (R42)', () => {
      expect(unassignResponsibleSchema.safeParse({ orderId: PEDIDO, userId: 'x' }).success).toBe(false);
      expect(unassignResponsibleSchema.safeParse({ orderId: 'x', userId: PERSONA_A }).success).toBe(false);
    });
  });

  describe('los nombres son en INGLES (R44)', () => {
    it('los campos de los tres esquemas son los que lee el `FormData`', () => {
      expect(
        Object.keys(assignResponsiblesSchema.parse({ orderId: PEDIDO, userIds: [PERSONA_A], workGroupIds: [GRUPO] })),
      ).toEqual(['orderId', 'userIds', 'workGroupIds']);
      expect(Object.keys(removeWorkGroupFromOrderSchema.parse({ orderId: PEDIDO, workGroupId: GRUPO }))).toEqual([
        'orderId',
        'workGroupId',
      ]);
      expect(Object.keys(unassignResponsibleSchema.parse({ orderId: PEDIDO, userId: PERSONA_A }))).toEqual([
        'orderId',
        'userId',
      ]);
    });
  });
});
