// T4 — Caso de uso completo, con puertos falsos escritos aqui mismo (nada de vi.mock de
// modulos reales): `resolveSessionUser` encadena cuatro cortes y ese encadenado es la
// politica (`design.md > 2.1`). R1, R10, R11, R12, R14, R23.

import { createResolveSessionUser } from '@/lib/modules/identity/domain/resolve-session-user';

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

const CLAIMS_VIGENTES: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  issuedAt: new Date('2026-09-01T08:00:00.000Z'),
  expiresAt: new Date('2026-09-01T16:00:00.000Z'),
};

const CLAIMS_CADUCADOS: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
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
};

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
    const resolveSessionUser = createResolveSessionUser({ session, users });

    await expect(resolveSessionUser(AHORA)).resolves.toBeNull();
  });

  // R23 — con claims === null, el lector de usuario NO se llama.
  it('con claims null no se consulta al lector de usuario', async () => {
    const session = fakeSessionReader(null);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    await resolveSessionUser(AHORA);

    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R23 — con sesion caducada tampoco se consulta al lector de usuario.
  it('con sesion caducada no se consulta al lector de usuario', async () => {
    const session = fakeSessionReader(CLAIMS_CADUCADOS);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R10 — con claims vigentes, se consulta la base por el sub de la cookie.
  it('con claims vigentes consulta al lector de usuario por el sub', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    await resolveSessionUser(AHORA);

    expect(users.findActiveById).toHaveBeenCalledWith(SUB);
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // R11 — usuario inexistente o dado de baja (record null) resuelve "sin sesion" aunque la
  // firma y la caducidad sean correctas.
  it('sin registro de usuario activo resuelve null aunque la sesion sea valida', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(null);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    await expect(resolveSessionUser(AHORA)).resolves.toBeNull();
  });

  // R12, R14 — el usuario resuelto trae el rol y el nombre actuales, y solo esos cuatro campos.
  it('con usuario activo compone el SessionUser con displayName y roleName actuales', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    const resultado = await resolveSessionUser(AHORA);

    expect(resultado).toEqual({
      id: SUB,
      username: 'ana.perez',
      displayName: 'Ana Perez',
      roleName: 'operador',
    });
    expect(Object.keys(resultado ?? {}).sort()).toEqual(
      ['displayName', 'id', 'roleName', 'username'].sort(),
    );
  });

  // R7 (via R23) — la sesion caducada EN el instante exacto de expiresAt tampoco consulta.
  it('con now igual a expiresAt no consulta al lector de usuario', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSessionUser = createResolveSessionUser({ session, users });

    const resultado = await resolveSessionUser(CLAIMS_VIGENTES.expiresAt);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });
});
