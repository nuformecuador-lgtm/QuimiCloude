// QC-48 T8 — La FACHADA ya cableada, no el dominio: lo que se afirma aqui es que
// `identity.getSessionContext()` existe, que devuelve `null` cuando no hay sesion y que lo que
// devuelve se limita a `{ userId, companyId, roleName }`. Cubre R18, R19, R22.
//
// Se mockean solo los adaptadores DRIVEN de `identity` (la cookie y Prisma) y el cliente de base
// de datos: asi se ejercita el cableado REAL de `lib/composition/index.ts` —incluida la decision
// de que las dos salidas nacen de la MISMA instancia de `createResolveSession`— sin necesitar ni
// Postgres ni una peticion de Next.

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionUserRecord } from '@/lib/modules/identity/ports/session-user-reader';

const { readClaimsMock, findActiveByIdMock } = vi.hoisted(() => ({
  readClaimsMock: vi.fn<() => Promise<SessionClaims | null>>(),
  findActiveByIdMock: vi.fn<(id: string) => Promise<SessionUserRecord | null>>(),
}));

// `lib/composition` arrastra todos los adaptadores Prisma del repo. Instanciar `PrismaClient`
// aqui no aporta nada y exigiria `DATABASE_URL`, asi que se sustituye el modulo entero.
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

vi.mock('@/lib/modules/identity/adapters/driven/session/session-cookie', () => ({
  readSessionClaims: readClaimsMock,
  startSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driven/persistence/session-user-prisma', () => ({
  findActiveSessionUserById: findActiveByIdMock,
}));

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

const CLAIMS_VIGENTES: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  issuedAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 3_600_000),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('identity.getSessionContext (fachada cableada)', () => {
  it('la fachada expone getSessionContext junto a getSessionUser', async () => {
    // R18 — la forma de preguntar por la empresa sale por el contrato ya cableado del modulo.
    const { identity } = await import('@/lib/composition');

    expect(typeof identity.getSessionContext).toBe('function');
    expect(typeof identity.getSessionUser).toBe('function');
  });

  it('sin sesion devuelve null', async () => {
    // R19 — ausencia de empresa, exactamente cuando no hay sesion.
    readClaimsMock.mockResolvedValue(null);
    const { identity } = await import('@/lib/composition');

    expect(await identity.getSessionContext()).toBeNull();
    expect(findActiveByIdMock).not.toHaveBeenCalled();
  });

  it('con sesion devuelve userId, companyId y roleName', async () => {
    // R18, R20 — el `companyId` y el rol son los leidos de la ficha, no los firmados.
    readClaimsMock.mockResolvedValue(CLAIMS_VIGENTES);
    findActiveByIdMock.mockResolvedValue(RECORD);
    const { identity } = await import('@/lib/composition');

    expect(await identity.getSessionContext()).toEqual({
      userId: SUB,
      companyId: COMPANY_ID,
      roleName: 'operador',
    });
  });

  it('lo expuesto no trae permisos ni capacidades', async () => {
    // R22 — solo empresa, usuario y rol. Que la empresa viaje en la sesion no autoriza nada:
    // la frontera sigue siendo el service.
    readClaimsMock.mockResolvedValue(CLAIMS_VIGENTES);
    findActiveByIdMock.mockResolvedValue(RECORD);
    const { identity } = await import('@/lib/composition');

    const contexto = await identity.getSessionContext();

    expect(Object.keys(contexto ?? {}).sort()).toEqual(['companyId', 'roleName', 'userId'].sort());
  });

  it('la empresa muerta deja sin sesion tambien a getSessionUser: una sola cadena', async () => {
    // R19, R21 — las dos salidas nacen de la MISMA instancia de `createResolveSession`, asi que
    // devuelven ausencia en los mismos casos. Si alguien cableara dos, este test se pondria rojo
    // en cuanto una de las dos divergiera.
    readClaimsMock.mockResolvedValue(CLAIMS_VIGENTES);
    findActiveByIdMock.mockResolvedValue({ ...RECORD, companyDeletedAt: new Date() });
    const { identity } = await import('@/lib/composition');

    expect(await identity.getSessionContext()).toBeNull();
    expect(await identity.getSessionUser()).toBeNull();
  });
});
