// T4 — Caso de uso completo, con puertos falsos escritos aqui mismo (nada de vi.mock de
// modulos reales): `resolveSessionUser` encadena cuatro cortes y ese encadenado es la
// politica (`design.md > 2.1`). R1, R10, R11, R12, R14, R23.
//
// QC-74 (T8): se anaden los casos de los permisos —viajan tal cual del record al `SessionUser`,
// y un rol sin asignaciones da `[]`— sobre los MISMOS puertos falsos. QC-74 R7, R11, R14.

import { createResolveSessionUser } from '@/lib/modules/identity/domain/resolve-session-user';

import type { ResolveSessionDeps } from '@/lib/modules/identity/domain/resolve-session';
import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionReader } from '@/lib/modules/identity/ports/session-reader';
import type { SessionUserReader, SessionUserRecord } from '@/lib/modules/identity/ports/session-user-reader';

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const AHORA = new Date('2026-09-01T10:00:00.000Z');

// QC-9: `roleName` es el rol FIRMADO en la cookie. Se pone uno que no existe en la base a
// proposito: `resolveSessionUser` debe seguir devolviendo el rol de la BASE (QC-8 R12 intacto).
// QC-48 R6: desde `v3` el contenido firmado lleva tambien la empresa. Aqui entra solo para que
// los fixtures sigan siendo `SessionClaims` validos; los cortes que la usan llegan con T7.
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

// QC-23 R1: desde `v4` el contenido firmado lleva el identificador de ESTA sesion.
const SID_CLAIMS = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';

const CLAIMS_VIGENTES: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  // QC-23 R1: desde `v4` los claims llevan el identificador de ESTA sesion.
  sessionId: SID_CLAIMS,
  issuedAt: new Date('2026-09-01T08:00:00.000Z'),
  expiresAt: new Date('2026-09-01T16:00:00.000Z'),
};

const CLAIMS_CADUCADOS: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  // QC-23 R1: desde `v4` los claims llevan el identificador de ESTA sesion.
  sessionId: SID_CLAIMS,
  issuedAt: new Date('2026-09-01T00:00:00.000Z'),
  expiresAt: new Date('2026-09-01T08:00:00.000Z'),
};

// QC-48 T7: la ficha gana `companyId` y `companyDeletedAt` porque el tipo los exige. Son la
// misma empresa que la firmada y una empresa viva, o sea el caso que ya se probaba aqui: los
// cortes nuevos tienen sus propios tests en `resolve-session.test.ts`. Ni una asercion de este
// archivo cambia.
const RECORD: SessionUserRecord = {
  id: SUB,
  username: 'ana.perez',
  firstNames: 'Ana Maria',
  lastNames: 'Perez Gomez',
  roleName: 'operador',
  companyId: COMPANY_ID,
  companyDeletedAt: null,
  // QC-74 T8 (R7, R11): el record trae los permisos del rol, leidos en la MISMA consulta. Van a
  // proposito en un orden que no es el alfabetico y con dos modulos distintos: asi un `sort()`
  // o una deduplicacion metida de contrabando en el camino se ve en el `toEqual`.
  permissions: ['recetas.modificar', 'inventario.consultar'],
  // QC-78 T10: el record trae ahora el estado de cuenta y el plazo de bloqueo crudos. Aqui una
  // cuenta corriente: `active` y sin plazo, o sea la que si tiene sesion.
  accountStatus: 'active',
  lockedUntil: null,
  // QC-23 T9 (R7, R8, R11): el record trae ahora el sello del usuario y el instante en que ESTA
  // sesion fue cerrada una a una, los dos crudos. El caso corriente es un sello ANTERIOR a la
  // emision y ninguna fila en el registro; los cortes 7 y 8 tienen sus casos propios en
  // `resolve-session.test.ts`. Ni una asercion de este archivo cambia.
  sessionsValidFrom: new Date('2026-08-01T00:00:00.000Z'),
  sessionRevokedAt: null,
};

/** QC-74 T8 (R14): un rol al que nadie asigno nada. «Sin permisos» es `[]`, no un hueco. */
const RECORD_SIN_PERMISOS: SessionUserRecord = { ...RECORD, permissions: [] };

// QC-23 T10 (R16, R17): la resolucion gana UNA dependencia mas —a donde va la causa cuando la
// comprobacion no se puede hacer—. Aqui se cablea muda: este archivo prueba la PROYECCION, no el
// registro del servidor. Ni una asercion cambia; solo se completa la dependencia que el tipo
// exige.
const REGISTRO_QC23 = {
  log: { log: () => undefined },
} satisfies Pick<ResolveSessionDeps, 'log'>;

/** Puerto falso de sesion: siempre devuelve el mismo `claims`, contando llamadas si hace falta. */
function fakeSessionReader(claims: SessionClaims | null): SessionReader {
  return {
    readClaims: vi.fn().mockResolvedValue(claims),
  };
}

/** Puerto falso de usuarios: devuelve `record` para cualquier id, contando llamadas. */
function fakeUserReader(record: SessionUserRecord | null): SessionUserReader {
  return {
    findActiveById: vi.fn().mockResolvedValue(record),
  };
}

describe('createResolveSessionUser', () => {
  // R1 — sin sesion se resuelve con el valor devuelto (null), sin lanzar.
  it('sin claims resuelve null sin lanzar', async () => {
    const session = fakeSessionReader(null);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSessionUser(AHORA)).resolves.toBeNull();
  });

  // R23 — con claims === null, el lector de usuario NO se llama.
  it('con claims null no se consulta al lector de usuario', async () => {
    const session = fakeSessionReader(null);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    await resolveSessionUser(AHORA);

    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R23 — con sesion caducada tampoco se consulta al lector de usuario.
  it('con sesion caducada no se consulta al lector de usuario', async () => {
    const session = fakeSessionReader(CLAIMS_CADUCADOS);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R10 — con claims vigentes, se consulta la base por el sub de la cookie.
  it('con claims vigentes consulta al lector de usuario por el sub', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    await resolveSessionUser(AHORA);

    // QC-23 T9 (R14): la consulta sigue siendo POR EL `sub` —la fila se busca por su clave
    // primaria— y gana el `sid` como segundo argumento, que es contra lo que se resuelve la
    // pertenencia al registro de sesiones cerradas en esa MISMA lectura.
    expect(users.findActiveById).toHaveBeenCalledWith(SUB, SID_CLAIMS);
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // R11 — usuario inexistente o dado de baja (record null) resuelve "sin sesion" aunque la
  // firma y la caducidad sean correctas.
  it('sin registro de usuario activo resuelve null aunque la sesion sea valida', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(null);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSessionUser(AHORA)).resolves.toBeNull();
  });

  // R12, R14 — el usuario resuelto trae el rol y el nombre actuales, y solo esos cuatro campos.
  it('con usuario activo compone el SessionUser con displayName y roleName actuales', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado).toEqual({
      id: SUB,
      username: 'ana.perez',
      displayName: 'Ana Perez',
      roleName: 'operador',
      // QC-74 T8: `permissions` es campo del `SessionUser` desde esta ficha.
      permissions: ['recetas.modificar', 'inventario.consultar'],
    });
    expect(Object.keys(resultado ?? {}).sort()).toEqual(
      ['displayName', 'id', 'permissions', 'roleName', 'username'].sort(),
    );
  });

  // QC-74 R7, R11 — los permisos viajan del record al `SessionUser` TAL CUAL: mismos codigos,
  // mismo orden, misma cantidad. `toEqual` sobre un array compara posicion a posicion, asi que
  // esta asercion cae si alguien mete un `sort()`, un `toLowerCase()` o un `Set` por el camino.
  it('los permisos del record viajan al SessionUser sin normalizar ni reordenar', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado?.permissions).toEqual(['recetas.modificar', 'inventario.consultar']);
  });

  // QC-74 R14 — un rol sin ninguna asignacion no es un hueco ni un `null`: es la lista vacia,
  // que es lo que hace que quien compara no tenga que distinguir dos formas de «nada».
  it('un rol sin asignaciones resuelve permissions vacio y no null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD_SIN_PERMISOS);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado?.permissions).toEqual([]);
    expect(resultado?.roleName).toBe('operador');
  });

  // R7 (via R23) — la sesion caducada EN el instante exacto de expiresAt tampoco consulta.
  it('con now igual a expiresAt no consulta al lector de usuario', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSessionUser(CLAIMS_VIGENTES.expiresAt);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });
});
