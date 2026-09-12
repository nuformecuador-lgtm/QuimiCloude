// QC-84 T12 — Los CUATRO caminos del duplicado de pertenencia, con sus CUATRO `code` distintos
// (R30, R31).
//
// La decision 5 del humano: «se rechaza con un error que dice que ya pertenece **Y por que no se
// ve**». Sin eso, el operador lee «ya existe» sobre una lista donde esa persona no aparece y no
// tiene forma de entenderlo. Por eso son cuatro codigos y no uno:
//
//   | lo que ve el operador en la lista de R19 | `code` |
//   | --- | --- |
//   | la persona SI aparece                    | `work_group_member_exists`          (R30) |
//   | no aparece porque su cuenta esta pendiente | `work_group_member_exists_pending`  (R31) |
//   | no aparece porque su cuenta esta inactiva  | `work_group_member_exists_inactive` (R31) |
//   | no aparece porque su cuenta esta bloqueada | `work_group_member_exists_blocked`  (R31) |
//
// Lo que este archivo vigila de verdad, y es la razon de que exista aparte:
//
//   1. **Ninguno de los tres ocultos puede devolver el `code` del visible.** Se afirma uno por uno
//      y ademas se afirma que los cuatro codigos son CUATRO valores distintos. Mutacion que lo
//      pone rojo: unificar dos de ellos en `HIDDEN_MEMBER_ERROR` o hacer que `blockReasonOf`
//      devuelva `null` para alguno.
//   2. **El motivo sale de `effectiveAccountStatus`, la MISMA funcion que decide quien se ve**
//      (`design.md > 5.1`). Se demuestra con el mismo doble y dos `now` distintos: antes del plazo
//      el error es «bloqueada»; despues, «ya pertenece» a secas. Si el motivo se calculara con la
//      columna a secas, ese par de casos no podria existir.
//   3. **Ningun camino escribe nada**: el puerto se llama UNA vez y ningun otro metodo suena.

import { describe, expect, it, vi } from 'vitest';

import { createAddWorkGroupMember } from '@/lib/modules/identity/domain/add-work-group-member';
import { IdentityError } from '@/lib/modules/identity/domain/errors';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type {
  MemberCandidate,
  WorkGroupRepository,
} from '@/lib/modules/identity/ports/work-group-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const NOW = new Date('2026-09-11T12:00:00.000Z');
/** Un plazo de bloqueo todavia VIGENTE en `NOW`, y vencido media hora despues. */
const PLAZO = new Date('2026-09-11T12:15:00.000Z');
const DESPUES_DEL_PLAZO = new Date('2026-09-11T12:30:00.000Z');

const actor: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.modificar'],
};

const ENTRADA = { workGroupId: GROUP_ID, userId: USER_ID };

function cuenta(accountStatus: UserAccountStatus, lockedUntil: Date | null): MemberCandidate {
  return {
    id: USER_ID,
    firstNames: 'Ana Maria',
    lastNames: 'Perez Loor',
    username: 'aperez',
    accountStatus,
    lockedUntil,
  };
}

/** El puerto responde SIEMPRE `already_member`; lo que cambia es la cuenta que trae. */
function dobles(account: MemberCandidate) {
  const espias = {
    createInCompany: vi.fn(),
    renameAliveInCompany: vi.fn(),
    softDeleteAliveInCompany: vi.fn(),
    listAliveInCompany: vi.fn(),
    listMembersAliveInCompany: vi.fn(),
    addMemberAliveInCompany: vi.fn(async () => ({ kind: 'already_member', account })),
    removeMemberAliveInCompany: vi.fn(),
  };

  return { workGroups: espias as unknown as WorkGroupRepository, espias };
}

/** Mete a la persona y devuelve el error; exige que el puerto se toque UNA sola vez y nada mas. */
async function codigoAlMeter(account: MemberCandidate, now: Date = NOW): Promise<string> {
  const d = dobles(account);

  const fallo = await createAddWorkGroupMember({ workGroups: d.workGroups, now: () => now })(
    actor,
    ENTRADA,
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(fallo, 'meter a quien ya pertenece tiene que fallar').toBeInstanceOf(IdentityError);

  // R30 y R31: «NO DEBE crear ni modificar ninguna fila». Una sola llamada, y ninguna de las otras.
  expect(d.espias.addMemberAliveInCompany).toHaveBeenCalledTimes(1);
  for (const [nombre, espia] of Object.entries(d.espias)) {
    if (nombre !== 'addMemberAliveInCompany') {
      expect(espia, `${nombre} no debia llamarse`).not.toHaveBeenCalled();
    }
  }

  return (fallo as IdentityError).code;
}

const VISIBLE = 'work_group_member_exists';

describe('QC-84 T12 — los cuatro caminos del duplicado de pertenencia (R30, R31)', () => {
  it('R30 — la persona que SI se ve en la lista da `work_group_member_exists`', async () => {
    expect(await codigoAlMeter(cuenta('active', null))).toBe(VISIBLE);

    // Y el caso que parece bloqueado y no lo esta: columna `blocked` con el plazo YA VENCIDO. Por
    // QC-78 esa cuenta esta efectivamente `active`, aparece en la lista de R19 y por tanto el
    // error tiene que ser el del duplicado VISIBLE. Con una comparacion directa contra la columna
    // este caso devolveria «bloqueada» y mentiria sobre una lista donde la persona SI aparece.
    expect(await codigoAlMeter(cuenta('blocked', new Date(NOW.getTime() - 60_000)))).toBe(VISIBLE);
  });

  it('R31 — `pending` da su PROPIO codigo, y no el del visible', async () => {
    // El estado con el que NACE toda cuenta creada por QC-66 (decision 7): es el caso mas comun de
    // los tres y el que mas confunde al operador, porque la persona acaba de ser dada de alta.
    const code = await codigoAlMeter(cuenta('pending', null));
    expect(code).toBe('work_group_member_exists_pending');
    expect(code).not.toBe(VISIBLE);
  });

  it('R31 — `inactive` da su PROPIO codigo, y no el del visible', async () => {
    const code = await codigoAlMeter(cuenta('inactive', null));
    expect(code).toBe('work_group_member_exists_inactive');
    expect(code).not.toBe(VISIBLE);
  });

  it('R31 — la cuenta bloqueada da su PROPIO codigo, y no el del visible, por las TRES formas de estarlo', async () => {
    // (a) bloqueo administrativo: la columna lo dice y no hay plazo.
    // (b) bloqueo administrativo con plazo vigente.
    // (c) bloqueo por intentos fallidos: la columna puede seguir diciendo `active` y lo que manda
    //     es el PLAZO (QC-78 R11). Este es el que una comparacion con la columna se traga entero.
    const formas: readonly MemberCandidate[] = [
      cuenta('blocked', null),
      cuenta('blocked', PLAZO),
      cuenta('active', PLAZO),
    ];

    for (const forma of formas) {
      const code = await codigoAlMeter(forma);
      expect(code, `${forma.accountStatus}/${String(forma.lockedUntil)}`).toBe(
        'work_group_member_exists_blocked',
      );
      expect(code).not.toBe(VISIBLE);
    }
  });

  it('R30, R31 — los CUATRO codigos son cuatro valores DISTINTOS', async () => {
    const codigos = [
      await codigoAlMeter(cuenta('active', null)),
      await codigoAlMeter(cuenta('pending', null)),
      await codigoAlMeter(cuenta('inactive', null)),
      await codigoAlMeter(cuenta('active', PLAZO)),
    ];

    // Mutacion que pone este test rojo: unificar dos cualesquiera de los cuatro.
    expect(new Set(codigos).size, `se repitio algun codigo: ${codigos.join(', ')}`).toBe(4);
    expect(codigos).toEqual([
      'work_group_member_exists',
      'work_group_member_exists_pending',
      'work_group_member_exists_inactive',
      'work_group_member_exists_blocked',
    ]);

    // Y los tres ocultos comparten prefijo con el visible pero NINGUNO es el visible: la pantalla
    // de QC-85 puede agruparlos y aun asi distinguirlos.
    for (const code of codigos.slice(1)) {
      expect(code.startsWith(`${VISIBLE}_`)).toBe(true);
      expect(code).not.toBe(VISIBLE);
    }
  });

  it('R31, R21 — el motivo sale de la MISMA funcion que la lista: el mismo doble cambia de codigo con el reloj', async () => {
    // La cuenta es UNA y no se toca; lo unico que se mueve es el `now` que entra al caso de uso.
    // Antes del plazo, «ya pertenece y esta bloqueada»; despues, «ya pertenece» a secas, porque a
    // esa hora la persona YA aparece en la lista de R19. Ninguna escritura desbloquea nada.
    const bloqueada = cuenta('active', PLAZO);

    expect(await codigoAlMeter(bloqueada, NOW)).toBe('work_group_member_exists_blocked');
    expect(await codigoAlMeter(bloqueada, DESPUES_DEL_PLAZO)).toBe(VISIBLE);
  });
});
