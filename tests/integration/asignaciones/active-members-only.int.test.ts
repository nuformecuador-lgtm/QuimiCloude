// tests/integration/asignaciones/active-members-only.int.test.ts
/**
 * QC-87 (T14) — Al aplicar un grupo SOLO entran las cuentas `active`, contra Postgres real:
 * R19, R20, R21, R25 y R26 (decision cerrada 3).
 *
 * LA REGLA NO ES «`account_status = 'active'`», y ese es justamente el riesgo n.o 2 de
 * `design.md > 10`. El estado que cuenta es el EFECTIVO en un instante: una cuenta bloqueada con
 * el plazo VENCIDO vuelve sola a `active` sin que nadie escriba nada (QC-78 R8), y una cuenta cuya
 * columna dice `active` puede estar bloqueada por plazo (QC-78 R11). Por eso R21 exige que quien
 * decida sea la MISMA definicion que alimenta la pantalla de miembros del grupo
 * (`listMembersAliveInCompany` + `effectiveAccountStatus`, en `identity`) y que el instante entre
 * POR PARAMETRO.
 *
 * POR QUE AQUI Y NO EN UNIDAD. En unidad, `activeMemberIds` es lo que el doble diga. Lo que aqui
 * se demuestra es que, con filas de verdad en `users` y en `work_group_members`, el adaptador de
 * T3 aplica esa definicion: el caso del reloj mueve SOLO el `now` —ni un `UPDATE`— y cambia a
 * quien se asigna.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: cambiar el filtro de `findSnapshotAliveInCompany` por un
 * `where: { accountStatus: 'active' }` a secas pone rojos los dos primeros casos —la bloqueada por
 * plazo entraria y la de plazo vencido no—; quitar el filtro entero pone rojo el primero y el de
 * R26; hacer que un grupo sin miembros `active` lance en vez de devolver cero pone rojo el de R26;
 * y quitar `deletedAt: null` del grupo pone rojo el de R25.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import {
  NOW,
  actorOf,
  addMember,
  codeOf,
  createOrder,
  createPerson,
  createWorkGroup,
  inRolledBackTransaction,
  readRows,
} from './use-case-fixture';

/** El plazo de bloqueo: vence ENTRE `NOW` y `DESPUES_DEL_PLAZO`. */
const PLAZO = new Date('2026-03-01T12:00:00.000Z');
const DESPUES_DEL_PLAZO = new Date('2026-03-01T12:00:01.000Z');

describe('asignaciones · solo las cuentas active (integracion)', () => {
  it('R19, R20: entra el `active` y NO entran el pending, el inactive ni el bloqueado; la operacion no falla por ellos', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno mixto ${Date.now()}`);

      const activo = await createPerson(fixture, fixture.companyA);
      // El `pending` es el precio ESCRITO de la decision 3: dar de alta a alguien y meterlo en el
      // turno no le asigna nada hasta que entre por primera vez y cambie su contrasena.
      const pendiente = await createPerson(fixture, fixture.companyA, { accountStatus: 'pending' });
      const inactivo = await createPerson(fixture, fixture.companyA, { accountStatus: 'inactive' });
      const bloqueadoSinPlazo = await createPerson(fixture, fixture.companyA, { accountStatus: 'blocked' });
      // La columna dice `active` y aun asi NO entra: el plazo de bloqueo no ha vencido (QC-78 R11).
      const bloqueadoPorPlazo = await createPerson(fixture, fixture.companyA, { lockedUntil: PLAZO });
      // Dada de baja: `listMembersAliveInCompany` ya no la considera miembro viva (QC-84 R19).
      const deBaja = await createPerson(fixture, fixture.companyA, { deletedAt: new Date('2026-01-01T00:00:00.000Z') });

      for (const persona of [activo, pendiente, inactivo, bloqueadoSinPlazo, bloqueadoPorPlazo, deBaja]) {
        await addMember(fixture.tx, fixture.companyA, grupo.id, persona);
      }

      // R20: la operacion termina CON EXITO; los cinco que no estan `active` no la hacen fallar.
      const { added } = await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);
      expect(added).toBe(1);

      const filas = await readRows(fixture.tx, orderId);
      expect(filas.map((fila) => fila.userId)).toEqual([activo]);
      // R19: la fila lleva la referencia al grupo y el nombre que tenia EN ESE INSTANTE.
      expect(filas[0]?.workGroupId).toBe(grupo.id);
      expect(filas[0]?.workGroupName).toBe(grupo.name);
    });
  });

  it('R21: la bloqueada por PLAZO entra al reaplicar cuando el plazo vence, y no se escribio NADA en su cuenta', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      const bloqueadoPorPlazo = await createPerson(fixture, fixture.companyA, { lockedUntil: PLAZO });
      await addMember(fixture.tx, fixture.companyA, grupo.id, bloqueadoPorPlazo);

      const cuentaAntes = await fixture.tx.user.findUniqueOrThrow({
        where: { id: bloqueadoPorPlazo },
        select: { accountStatus: true, lockedUntil: true, updatedAt: true },
      });

      // Con el reloj ANTES del vencimiento no entra nadie, y eso NO es un error (R26).
      expect(
        (await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW)).added,
      ).toBe(0);
      expect(await readRows(fixture.tx, orderId)).toEqual([]);

      // Lo UNICO que cambia es el instante que se pasa por parametro. Ni un `UPDATE` de por medio.
      const { added } = await fixture.useCases.assign(
        actor,
        { orderId, userIds: [], workGroupIds: [grupo.id] },
        DESPUES_DEL_PLAZO,
      );
      expect(added).toBe(1);
      expect((await readRows(fixture.tx, orderId)).map((fila) => fila.userId)).toEqual([bloqueadoPorPlazo]);

      // Y se comprueba que de verdad no se escribio nada: la cuenta sigue igual, plazo incluido.
      const cuentaDespues = await fixture.tx.user.findUniqueOrThrow({
        where: { id: bloqueadoPorPlazo },
        select: { accountStatus: true, lockedUntil: true, updatedAt: true },
      });
      expect(cuentaDespues).toEqual(cuentaAntes);
    });
  });

  it('R26: un grupo vivo SIN ningun miembro active termina con exito y cero anadidas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);

      const sinMiembros = await createWorkGroup(fixture.tx, fixture.companyA, `Turno vacio ${Date.now()}`);
      const soloPendientes = await createWorkGroup(fixture.tx, fixture.companyA, `Turno pendiente ${Date.now()}`);
      await addMember(
        fixture.tx,
        fixture.companyA,
        soloPendientes.id,
        await createPerson(fixture, fixture.companyA, { accountStatus: 'pending' }),
      );

      // Los dos son grupos VIVOS de la empresa: no son `work_group_not_found`, son «cero».
      for (const grupo of [sinMiembros, soloPendientes]) {
        const { added } = await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);
        expect(added).toBe(0);
      }
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R25: un grupo dado de baja es `work_group_not_found` aunque tenga miembros active', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, await createPerson(fixture, fixture.companyA));
      await fixture.tx.workGroup.update({
        where: { id: grupo.id },
        data: { deletedAt: new Date('2026-02-01T00:00:00.000Z') },
      });

      const error = await fixture.useCases
        .assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW)
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('work_group_not_found');
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });
});
