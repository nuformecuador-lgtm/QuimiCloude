// QC-48 T7 — La cadena completa de `resolve-session.ts`, con puertos falsos escritos aqui mismo
// (nada de `vi.mock` de modulos reales), igual que el archivo hermano de QC-8. Lo que se ejercita
// aqui y no alli: los DOS cortes nuevos —empresa que no casa y empresa muerta—, su ORDEN respecto
// a los que ya existian, y que la empresa expuesta sale de la base.
// Cubre R14, R15, R16, R17, R19, R20, R21, R22.

import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionReader } from '@/lib/modules/identity/ports/session-reader';
import type {
  SessionUserReader,
  SessionUserRecord,
} from '@/lib/modules/identity/ports/session-user-reader';

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
/** Otra empresa cualquiera: la que hace que el corte 4 salte. */
const OTRA_COMPANY_ID = 'b2a6d4f0-1c3e-4a58-8d92-6e0f7b415c2a';
const AHORA = new Date('2026-09-01T10:00:00.000Z');
const EMPRESA_DADA_DE_BAJA = new Date('2026-08-30T00:00:00.000Z');

const CLAIMS_VIGENTES: SessionClaims = {
  sub: SUB,
  // Igual que en QC-8: el rol FIRMADO es uno que no existe en la base, a proposito. Lo expuesto
  // tiene que seguir siendo el de la ficha.
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  issuedAt: new Date('2026-09-01T08:00:00.000Z'),
  expiresAt: new Date('2026-09-01T16:00:00.000Z'),
};

const CLAIMS_CADUCADOS: SessionClaims = {
  ...CLAIMS_VIGENTES,
  issuedAt: new Date('2026-09-01T00:00:00.000Z'),
  expiresAt: new Date('2026-09-01T08:00:00.000Z'),
};

const RECORD: SessionUserRecord = {
  id: SUB,
  username: 'ana.perez',
  firstNames: 'Ana Maria',
  lastNames: 'Perez Gomez',
  roleName: 'operador',
  companyId: COMPANY_ID,
  companyDeletedAt: null,
  // QC-74 T8 (R7, R11): el record trae ya los permisos del rol. Los cortes de esta cadena no
  // los miran —quien los mira es `assertPermission` en cada caso de uso—, asi que aqui basta
  // con una lista no vacia que se pueda seguir hasta la proyeccion.
  permissions: ['inventario.consultar'],
};

function fakeSessionReader(claims: SessionClaims | null): SessionReader {
  return { readClaims: vi.fn().mockResolvedValue(claims) };
}

function fakeUserReader(record: SessionUserRecord | null): SessionUserReader {
  return { findActiveById: vi.fn().mockResolvedValue(record) };
}

describe('createResolveSession', () => {
  // R14 — la empresa firmada no es la de la ficha: sin sesion, aunque todo lo demas sea correcto.
  it('con companyId firmado distinto al de la ficha resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, companyId: OTRA_COMPANY_ID });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R15 — la empresa de la ficha no esta viva: sin sesion. `deleted_at` con valor es el unico
  // criterio (QC-47 R6).
  it('con companyDeletedAt no nulo resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, companyDeletedAt: EMPRESA_DADA_DE_BAJA });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R15 — el corte de la empresa muerta es INDEPENDIENTE del de R14: aqui la empresa firmada SI
  // casa con la de la ficha, y aun asi no hay sesion. Es lo que exige que sean dos `if`.
  it('con empresa muerta que si casa con la firmada resuelve null igual', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, companyDeletedAt: EMPRESA_DADA_DE_BAJA });
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // R17 — sin cookie no se toca la base: los cortes nuevos no adelantan ninguna consulta.
  it('sin claims resuelve null sin llamar a findActiveById', async () => {
    const session = fakeSessionReader(null);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R17 — una sesion caducada tampoco cuesta una consulta.
  it('con sesion caducada resuelve null sin llamar a findActiveById', async () => {
    const session = fakeSessionReader(CLAIMS_CADUCADOS);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R16 — usuario inexistente o dado de baja: mismo `null` de siempre, sin pantalla ni camino
  // nuevos. El corte 3 sigue por delante de los dos nuevos.
  it('sin registro de usuario activo resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(null);
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R21 — una sola pasada, las dos proyecciones, y coherentes entre si.
  it('con sesion valida compone user y context coherentes', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toEqual({
      user: {
        id: SUB,
        username: 'ana.perez',
        displayName: 'Ana Perez',
        roleName: 'operador',
        // QC-74 T8 (R7): la proyeccion de usuario lleva los permisos del record, tal cual.
        permissions: ['inventario.consultar'],
      },
      context: {
        userId: SUB,
        companyId: COMPANY_ID,
        roleName: 'operador',
      },
    });
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // R20 — lo expuesto sale de la BASE, no del contenido firmado. Tras el corte 4 el `companyId`
  // firmado y el de la ficha son iguales por construccion —una ficha con otra empresa ni llega
  // hasta aqui, y eso lo afirma el primer test—, asi que el ORIGEN se demuestra por el otro
  // campo que viaja por el mismo camino: el rol. El firmado dice una cosa, la ficha dice otra, y
  // lo expuesto es el de la ficha; `companyId` se compone en la misma linea, desde `record`.
  it('expone el companyId y el rol leidos de la base, no los firmados', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado?.context.roleName).toBe(RECORD.roleName);
    expect(resultado?.context.roleName).not.toBe(CLAIMS_VIGENTES.roleName);
    expect(resultado?.context.companyId).toBe(RECORD.companyId);
  });

  // R22 — lo expuesto se limita a empresa, usuario y rol. Ni permisos, ni capacidades, ni
  // respuestas a "puedo o no puedo": que la empresa viaje en la sesion no autoriza nada.
  it('el contexto lleva userId, companyId y roleName y nada mas', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(Object.keys(resultado?.context ?? {}).sort()).toEqual(
      ['companyId', 'roleName', 'userId'].sort(),
    );
  });
});
