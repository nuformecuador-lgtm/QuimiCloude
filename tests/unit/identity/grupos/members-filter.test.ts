// QC-84 T13 — El filtro de miembros: quien sale, quien no, y los DOS PRECIOS que el humano
// escribio a proposito (R19, R20, R21, R22, R23).
//
// `QC-83 dec. 2` dejo explicitamente este filtro a esta ficha, y la decision 3 lo escribio con sus
// dos precios:
//
//   (a) una persona recien dada de alta nace **`pending`** (QC-66 dec. 7) y **NO aparecera en sus
//       grupos** hasta que entre y cambie la contrasena;
//   (b) una cuenta bloqueada por intentos fallidos **desaparece del grupo y VUELVE SOLA** al
//       desbloquearse.
//
// «Un precio que nadie testea es un precio que se reporta como fallo» (`requirements.md`, aviso a).
// Este archivo es ese test, y esta escrito para CAER si alguien sustituye el filtro por la
// comparacion obvia —`candidate.accountStatus === 'active'`—, que es la alternativa 9.1 que
// `design.md` descarta por escrito:
//
//   - toda lista esperada incluye a una cuenta con la columna en `blocked` y el plazo YA VENCIDO,
//     que **tiene que salir**: con la comparacion directa desapareceria;
//   - toda lista esperada excluye a una cuenta con la columna en `active` y el plazo VIGENTE, que
//     **no puede salir** (QC-78 R11): con la comparacion directa apareceria.
//
// Y el desbloqueo se logra **SOLO moviendo `now`**: el mismo doble, sin una sola escritura. Si
// hiciera falta un `UPDATE` para que la persona volviera, el requisito estaria mal implementado
// (`design.md > 10`, tercer aviso al implementer).

import { describe, expect, it, vi } from 'vitest';

import { createListWorkGroupMembers } from '@/lib/modules/identity/domain/list-work-group-members';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { WorkGroupMemberRow } from '@/lib/modules/identity/domain/work-group-view';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type {
  MemberCandidate,
  WorkGroupRepository,
} from '@/lib/modules/identity/ports/work-group-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const OTRO_GROUP_ID = '44444444-4444-4444-8444-444444444444';

const actor: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar'],
};

const NOW = new Date('2026-09-11T12:00:00.000Z');
/** El plazo de bloqueo: vigente en `NOW`, vencido en `TRAS_EL_PLAZO`. Nada mas cambia. */
const PLAZO = new Date('2026-09-11T12:15:00.000Z');
const TRAS_EL_PLAZO = new Date('2026-09-11T12:30:00.000Z');
const PLAZO_VENCIDO = new Date('2026-09-11T11:00:00.000Z');

/** Los CINCO metodos de escritura del puerto: R23 dice que ninguno puede sonar en una lectura. */
const ESCRITURAS = [
  'createInCompany',
  'renameAliveInCompany',
  'softDeleteAliveInCompany',
  'addMemberAliveInCompany',
  'removeMemberAliveInCompany',
] as const;

function persona(
  id: string,
  firstNames: string,
  lastNames: string,
  accountStatus: UserAccountStatus,
  lockedUntil: Date | null = null,
): MemberCandidate {
  return { id, firstNames, lastNames, username: `u-${id}`, accountStatus, lockedUntil };
}

/**
 * Los candidatos que el puerto devuelve **ya ordenados** por apellidos, nombres e identificador
 * (`design.md > 5`): el orden es del SQL, no del corte, y el caso de uso solo puede conservarlo.
 * `escrituras` explota: una lectura que escribiera caeria en el acto.
 */
function dobles(candidatos: readonly MemberCandidate[] | 'not_found') {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`la consulta de miembros no puede llamar a ${nombre}`);
    });

  const espias = {
    createInCompany: explota('createInCompany'),
    renameAliveInCompany: explota('renameAliveInCompany'),
    softDeleteAliveInCompany: explota('softDeleteAliveInCompany'),
    listAliveInCompany: explota('listAliveInCompany'),
    listMembersAliveInCompany: vi.fn(async () => candidatos),
    addMemberAliveInCompany: explota('addMemberAliveInCompany'),
    removeMemberAliveInCompany: explota('removeMemberAliveInCompany'),
  };

  return { workGroups: espias as unknown as WorkGroupRepository, espias };
}

const log: ListQueryLog = { ignoredFields: vi.fn() } as unknown as ListQueryLog;
const pagination = { toOffsetLimit, buildPage };

type Espias = ReturnType<typeof dobles>['espias'];

function ningunaEscritura(espias: Espias): void {
  for (const metodo of ESCRITURAS) {
    expect(espias[metodo], `${metodo} se llamo en una LECTURA`).not.toHaveBeenCalled();
  }
}

async function miembros(
  candidatos: readonly MemberCandidate[],
  now: Date,
  groupId: string = GROUP_ID,
): Promise<{ readonly filas: readonly WorkGroupMemberRow[]; readonly espias: Espias }> {
  const d = dobles(candidatos);

  const page = await createListWorkGroupMembers({
    workGroups: d.workGroups,
    pagination,
    log,
  })(actor, groupId, { page: 1 }, now);

  ningunaEscritura(d.espias);

  return { filas: page.items, espias: d.espias };
}

async function idsVisibles(
  candidatos: readonly MemberCandidate[],
  now: Date = NOW,
): Promise<readonly string[]> {
  return (await miembros(candidatos, now)).filas.map((fila) => fila.id);
}

// --- El reparto. Cada grupo de prueba mezcla a proposito los cuatro estados y las dos formas de
// --- bloqueo, para que ninguna lista esperada pueda pasar «por casualidad».

const ANA = persona('a0000000-0000-4000-8000-000000000001', 'Ana', 'Alvarez', 'active');
/** Columna `blocked` con el plazo YA VENCIDO: por QC-78 esta efectivamente activa y SALE. */
const BRUNO_QUE_VOLVIO = persona(
  'b0000000-0000-4000-8000-000000000002',
  'Bruno',
  'Benitez',
  'blocked',
  PLAZO_VENCIDO,
);
/** Columna `active` con el plazo VIGENTE: bloqueada por intentos fallidos (QC-78 R11). NO sale. */
const CARLA_BLOQUEADA = persona(
  'c0000000-0000-4000-8000-000000000003',
  'Carla',
  'Cedeno',
  'active',
  PLAZO,
);
const DIANA_PENDIENTE = persona(
  'd0000000-0000-4000-8000-000000000004',
  'Diana',
  'Duran',
  'pending',
);
const ELIAS_INACTIVO = persona(
  'e0000000-0000-4000-8000-000000000005',
  'Elias',
  'Erazo',
  'inactive',
);
/** Bloqueo administrativo: columna `blocked` sin plazo. Tampoco sale. */
const FABIO_BLOQUEADO = persona(
  'f0000000-0000-4000-8000-000000000006',
  'Fabio',
  'Freire',
  'blocked',
  null,
);

/** El grupo entero, en el orden del SQL (apellidos, nombres, id). */
const TODOS: readonly MemberCandidate[] = [
  ANA,
  BRUNO_QUE_VOLVIO,
  CARLA_BLOQUEADA,
  DIANA_PENDIENTE,
  ELIAS_INACTIVO,
  FABIO_BLOQUEADO,
];

/** Los unicos dos que estan efectivamente `active` en `NOW`. */
const VISIBLES_EN_NOW: readonly string[] = [ANA.id, BRUNO_QUE_VOLVIO.id];

describe('QC-84 T13 — el filtro de miembros (R19, R20, R21, R22, R23)', () => {
  it('R19, R20 — la cuenta `pending` NO sale, aunque su fila de pertenencia exista', async () => {
    const ids = await idsVisibles(TODOS);

    expect(ids, 'la cuenta pending aparecio en la lista').not.toContain(DIANA_PENDIENTE.id);
    // Y la lista EXACTA, que es lo que hace caer este caso si el filtro se sustituye por
    // `accountStatus === 'active'`: Bruno (columna `blocked`, plazo vencido) desapareceria y
    // Carla (columna `active`, plazo vigente) apareceria.
    expect(ids).toEqual(VISIBLES_EN_NOW);
  });

  it('R19 — la cuenta `inactive` NO sale', async () => {
    const ids = await idsVisibles(TODOS);

    expect(ids, 'la cuenta inactive aparecio en la lista').not.toContain(ELIAS_INACTIVO.id);
    expect(ids).toEqual(VISIBLES_EN_NOW);
  });

  it('R21 — la cuenta bloqueada con el plazo VIGENTE no sale, ni por intentos ni por decision administrativa', async () => {
    const ids = await idsVisibles(TODOS);

    // Carla tiene la COLUMNA en `active` y sigue sin salir: quien manda es el plazo (QC-78 R11).
    // Este es, uno a uno, el caso que la alternativa 9.1 de `design.md` mostraria por error.
    expect(ids, 'la bloqueada por intentos aparecio').not.toContain(CARLA_BLOQUEADA.id);
    expect(ids, 'la bloqueada administrativamente aparecio').not.toContain(FABIO_BLOQUEADO.id);
    expect(ids).toEqual(VISIBLES_EN_NOW);
  });

  it('R21, R23 — el MISMO doble, con el `now` pasado el plazo, DEVUELVE a la bloqueada, y sin UNA sola escritura', async () => {
    // Un solo conjunto de candidatos, definido arriba y no tocado aqui: lo unico que se mueve
    // entre las dos consultas es el reloj. La cuenta vuelve SOLA.
    const antes = await miembros(TODOS, NOW);
    expect(antes.filas.map((f) => f.id)).not.toContain(CARLA_BLOQUEADA.id);

    const despues = await miembros(TODOS, TRAS_EL_PLAZO);
    expect(despues.filas.map((f) => f.id)).toContain(CARLA_BLOQUEADA.id);
    expect(despues.filas.map((f) => f.id)).toEqual([ANA.id, BRUNO_QUE_VOLVIO.id, CARLA_BLOQUEADA.id]);

    // R23: la segunda consulta no creo, modifico ni elimino ninguna fila —ni de pertenencia, ni de
    // grupo, ni de persona—. El desbloqueo NO costo un `UPDATE`.
    ningunaEscritura(despues.espias);
    expect(despues.espias.listMembersAliveInCompany).toHaveBeenCalledTimes(1);
    expect(despues.espias.listMembersAliveInCompany).toHaveBeenCalledWith(COMPANY_ID, GROUP_ID);

    // Y los dados de baja de verdad siguen fuera: pasar el plazo no resucita a `pending` ni a
    // `inactive`.
    expect(despues.filas.map((f) => f.id)).not.toContain(DIANA_PENDIENTE.id);
    expect(despues.filas.map((f) => f.id)).not.toContain(ELIAS_INACTIVO.id);
  });

  it('R20 — la cuenta que pasa a `active` reaparece en TODOS sus grupos sin ninguna escritura sobre la pertenencia', async () => {
    // La misma persona pertenece a dos grupos. Lo unico que cambia entre las dos mitades es su
    // COLUMNA de estado —lo que hace `verify-credentials` al cambiar la contrasena, sobre la fila
    // de `users`—: ninguna fila de pertenencia se escribe, y reaparece en los DOS grupos.
    const comoPendiente = persona(DIANA_PENDIENTE.id, 'Diana', 'Duran', 'pending');
    const comoActiva = persona(DIANA_PENDIENTE.id, 'Diana', 'Duran', 'active');

    for (const grupo of [GROUP_ID, OTRO_GROUP_ID]) {
      const oculta = await miembros([ANA, comoPendiente], NOW, grupo);
      expect(oculta.filas.map((f) => f.id), `grupo ${grupo}`).toEqual([ANA.id]);
      ningunaEscritura(oculta.espias);

      const visible = await miembros([ANA, comoActiva], NOW, grupo);
      expect(visible.filas.map((f) => f.id), `grupo ${grupo}`).toEqual([ANA.id, comoActiva.id]);
      // Lo importante: para volver a verla no hizo falta meterla otra vez en el grupo.
      expect(visible.espias.addMemberAliveInCompany).not.toHaveBeenCalled();
      expect(visible.espias.removeMemberAliveInCompany).not.toHaveBeenCalled();
      ningunaEscritura(visible.espias);
    }
  });

  it('R22 — el orden es determinista y estable, y dos HOMONIMAS no se intercambian', async () => {
    // Dos personas con los MISMOS apellidos y los MISMOS nombres: sin el desempate por
    // identificador que el puerto ya aplica, su orden relativo seria el que quisiera la base.
    const primera = persona('10000000-0000-4000-8000-00000000000a', 'Maria Jose', 'Loor', 'active');
    const segunda = persona('20000000-0000-4000-8000-00000000000b', 'Maria Jose', 'Loor', 'active');

    // Con un oculto EN MEDIO: filtrar no puede alterar el orden de los que quedan.
    const candidatos = [ANA, primera, DIANA_PENDIENTE, segunda, FABIO_BLOQUEADO];

    const unaVez = await idsVisibles(candidatos);
    const otraVez = await idsVisibles(candidatos);

    expect(unaVez).toEqual([ANA.id, primera.id, segunda.id]);
    expect(otraVez, 'dos consultas sobre el mismo contenido dieron secuencias distintas').toEqual(
      unaVez,
    );

    // Y las dos homonimas comparten nombre mostrable: lo unico que las distingue es el
    // identificador, que es justo lo que el desempate usa.
    const { filas } = await miembros(candidatos, NOW);
    const nombres = filas.map((f) => f.displayName);
    expect(nombres[1]).toBe(nombres[2]);
    expect(filas[1]?.id).not.toBe(filas[2]?.id);
  });

  it('R19 — cada fila trae EXACTAMENTE el identificador y el nombre mostrable, y ningun dato de credencial', async () => {
    const { filas } = await miembros([ANA], NOW);

    // Claves EXACTAS, no «faltan algunas»: un `select` descuidado del adaptador o un `...spread`
    // de mas en el dominio caerian aqui.
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0] as object).sort()).toEqual(['displayName', 'id']);
    expect(filas[0]).toEqual({ id: ANA.id, displayName: 'Ana Alvarez' });

    // Y se dice por su nombre lo que NO puede viajar.
    const serializado = JSON.stringify(filas);
    for (const prohibido of [
      'passwordHash',
      'password',
      'accountStatus',
      'lockedUntil',
      'username',
      'companyId',
    ]) {
      expect(serializado, `la fila filtro ${prohibido}`).not.toContain(prohibido);
    }
  });

  it('R23 — un grupo vivo SIN nadie visible devuelve la lista vacia, no un error y no una escritura', async () => {
    // Todos ocultos: el caso limite donde alguien podria sentir la tentacion de «arreglar» los
    // datos. Un grupo vivo sin miembros visibles es una lista vacia y nada mas.
    const { filas, espias } = await miembros(
      [DIANA_PENDIENTE, ELIAS_INACTIVO, CARLA_BLOQUEADA, FABIO_BLOQUEADO],
      NOW,
    );

    expect(filas).toEqual([]);
    ningunaEscritura(espias);
  });
});
