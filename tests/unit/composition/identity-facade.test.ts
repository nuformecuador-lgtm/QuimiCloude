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
  // QC-78 T10: el record trae ahora el estado de cuenta y el plazo crudos. `active` y sin plazo:
  // la fachada de esta prueba mira el cableado, no el corte por estado.
  accountStatus: 'active',
  lockedUntil: null,
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

// QC-66 T15 (R42) — bloque NUEVO al final, aditivo: no reescribe, no reordena y no reformatea
// ninguna de las fixtures ni de los casos de arriba (el archivo lo comparte con QC-78).
//
// Lo que se afirma es el CABLEADO, no el dominio: que la fachada ya construida expone las seis
// claves de la administracion de usuarios y que son invocables. Si alguien se dejara una factory
// sin cablear, o se la llevara a otro sitio que no sea `lib/composition`, esto se pone rojo.
describe('identity — los seis casos de uso de usuarios (fachada cableada)', () => {
  const CLAVES_DE_USUARIOS = [
    'createUser',
    'getUser',
    'listUsers',
    'updateUser',
    'deleteUser',
    'setUserAccountStatus',
  ] as const;

  it('expone las seis claves y todas son funciones', async () => {
    const { identity } = await import('@/lib/composition');

    for (const clave of CLAVES_DE_USUARIOS) {
      expect(typeof identity[clave]).toBe('function');
    }
  });

  it('sin romper las claves que ya tenia la fachada', async () => {
    // El bloque nuevo se SUMA: `verifyCredentials`, la politica, el hasher, el seed y las dos
    // caras de la sesion siguen ahi. Anadir un modulo al punto de composicion no reemplaza nada.
    const { identity } = await import('@/lib/composition');

    expect(typeof identity.verifyCredentials).toBe('function');
    expect(typeof identity.checkCredentialPolicy).toBe('function');
    expect(typeof identity.seedInitialAccess).toBe('function');
    expect(typeof identity.getSessionUser).toBe('function');
    expect(typeof identity.getSessionContext).toBe('function');
  });
});

// QC-79 T17 (R26, R32) — bloque NUEVO al final, aditivo: no reescribe, no reordena y no
// reformatea ninguna fixture ni ningun caso de arriba (el archivo lo comparten QC-48, QC-78 y
// QC-66).
//
// Lo que se afirma es el CABLEADO, no el dominio: que la fachada ya construida expone las DOS
// claves nuevas del enlace de credencial y que son invocables. Si alguien dejara una factory sin
// cablear —o se llevara el cableado fuera de `lib/composition`— esto se pone rojo.
describe('identity — el enlace para establecer la contrasena (fachada cableada)', () => {
  const CLAVES_DEL_ENLACE = ['setCredentialWithLink', 'issueCredentialSetupLink'] as const;

  it('expone las dos claves nuevas y las dos son funciones', async () => {
    const { identity } = await import('@/lib/composition');

    for (const clave of CLAVES_DEL_ENLACE) {
      expect(typeof identity[clave]).toBe('function');
    }
  });

  it('sin romper las claves que ya tenia la fachada', async () => {
    // El bloque nuevo se SUMA: las seis de usuarios, la politica, el hasher, el seed y las dos
    // caras de la sesion siguen ahi. Anadir dos casos de uso no reemplaza nada.
    const { identity } = await import('@/lib/composition');

    for (const clave of [
      'createUser',
      'getUser',
      'listUsers',
      'updateUser',
      'deleteUser',
      'setUserAccountStatus',
      'checkCredentialPolicy',
      'seedInitialAccess',
      'getSessionUser',
      'getSessionContext',
    ] as const) {
      expect(typeof identity[clave]).toBe('function');
    }
  });

  it('el caso de uso PUBLICO se cablea SIN actor: su firma recibe solo la entrada (R18)', async () => {
    // R18 escrito en el cableado: `setCredentialWithLink` es el unico caso de uso del modulo con
    // un solo parametro. Si alguien le anadiera un actor —o una lectura de sesion— para «reusar»
    // el patron de las seis de QC-66, esta linea se pondria roja.
    const { identity } = await import('@/lib/composition');

    expect(identity.setCredentialWithLink.length).toBe(1);
    // El reenvio SI lleva actor por parametro, y es la otra mitad del contraste (R14).
    expect(identity.issueCredentialSetupLink.length).toBe(2);
  });

  // NO hay aqui ningun caso que reimporte `lib/composition` con `MAIL_TRANSPORT` roto para
  // demostrar que el transporte se elige EN LA INVOCACION (R28, `design.md > 9.2`). Se escribio,
  // se midio y se quito: un `vi.resetModules()` seguido de un segundo `import('@/lib/composition')`
  // vuelve a transformar el grafo entero del repo (~7 s en este arbol) y dejaba este archivo al
  // borde del tiempo limite cuando la suite corre entera, que es como se fabrica un flake.
  //
  // Lo que ese caso queria afirmar ya esta cubierto sin pagar ese precio, y en dos sitios: este
  // archivo IMPORTA la fachada sin ninguna variable de correo definida -si la eleccion se hiciera
  // al importar, los once casos de aqui estarian rojos-, y `mail-config.test.ts` prueba
  // `readMailTransportFromEnv()` por su cuenta, incluido el valor por defecto y el invalido.
});

// QC-94 T8 (R16) — bloque NUEVO al final, aditivo: no reescribe, no reordena y no reformatea
// ninguna de las fixtures ni de los casos de arriba.
//
// Lo que se afirma es el CABLEADO, no el dominio: que la fachada ya construida expone la consulta
// del catalogo de roles y que las claves de arriba siguen ahi. Si alguien dejara `createListRoles`
// sin cablear, o se lo llevara a otro sitio que no sea `lib/composition`, esto se pone rojo.
describe('identity — la consulta del catalogo de roles (fachada cableada)', () => {
  it('expone listRoles y es una funcion', async () => {
    const { identity } = await import('@/lib/composition');

    expect(typeof identity.listRoles).toBe('function');
  });

  it('sin romper las claves que ya tenia la fachada', async () => {
    // La clave nueva se SUMA al final del objeto: cablear un caso de uso mas no reemplaza nada.
    const { identity } = await import('@/lib/composition');

    expect(typeof identity.getSessionUser).toBe('function');
    expect(typeof identity.getSessionContext).toBe('function');
    expect(typeof identity.listUsers).toBe('function');
    expect(typeof identity.createUser).toBe('function');
  });
});

// QC-84 T10 (R44) — bloque NUEVO al final, aditivo: no reescribe, no reordena y no reformatea
// ninguna de las fixtures ni de los casos de arriba.
//
// Lo que se afirma es el CABLEADO, no el dominio: que la fachada ya construida expone las SIETE
// claves de los grupos de trabajo, que el listado de miembros recibe su aritmetica de paginacion
// —el defecto de 10 y el tope de 25 de `lib/shared/pagination`— y que las claves de arriba siguen
// ahi. Si alguien dejara una factory sin cablear, o se la llevara a otro sitio que no sea
// `lib/composition`, esto se pone rojo.
describe('identity — los siete casos de uso de grupos de trabajo (fachada cableada)', () => {
  const CLAVES_DE_GRUPOS = [
    'createWorkGroup',
    'renameWorkGroup',
    'deleteWorkGroup',
    'addWorkGroupMember',
    'removeWorkGroupMember',
    'listWorkGroups',
    'listWorkGroupMembers',
  ] as const;

  it('expone las siete claves y todas son funciones', async () => {
    const { identity } = await import('@/lib/composition');

    for (const clave of CLAVES_DE_GRUPOS) {
      expect(typeof identity[clave]).toBe('function');
    }
  });

  it('sin romper las claves que ya tenia la fachada', async () => {
    // Las claves nuevas se SUMAN al final del objeto: cablear un modulo mas no reemplaza nada.
    const { identity } = await import('@/lib/composition');

    expect(typeof identity.getSessionUser).toBe('function');
    expect(typeof identity.getSessionContext).toBe('function');
    expect(typeof identity.listUsers).toBe('function');
    expect(typeof identity.createUser).toBe('function');
    expect(typeof identity.listRoles).toBe('function');
  });

  it('listWorkGroupMembers recibe la paginacion REAL: defecto 10 y tope 25', async () => {
    // R51 — la aritmetica NO se reimplementa en el dominio: se inyecta aqui la misma de
    // `lib/shared/pagination`. Se comprueba de punta a punta contra un grupo de 30 miembros
    // visibles: sin `pageSize` salen 10, y pidiendo 100 salen 25 —acotado, no rechazado—.
    //
    // El repositorio se dobla a nivel del CLIENTE PRISMA, no del caso de uso: asi lo que se
    // ejercita es el cableado real de `lib/composition` (repositorio + paginacion), que es lo que
    // este archivo prueba.
    const { prisma } = await import('@/lib/shared/db/prisma');
    const miembros = Array.from({ length: 30 }, (_, indice) => ({
      id: `user-${String(indice).padStart(2, '0')}`,
      firstNames: 'Ana',
      lastNames: `Apellido ${String(indice).padStart(2, '0')}`,
      username: `ana.${indice}`,
      accountStatus: 'active' as const,
      lockedUntil: null,
    }));

    Object.assign(prisma, {
      workGroup: { findFirst: vi.fn(async () => ({ id: 'wg-1' })) },
      workGroupMember: {
        findMany: vi.fn(async () => miembros.map((miembro) => ({ userId: miembro.id }))),
      },
      user: { findMany: vi.fn(async () => miembros) },
    });

    const { identity } = await import('@/lib/composition');
    const actor = { id: 'u1', companyId: 'c1', permissions: ['usuarios.consultar'] };
    const consulta = { page: 1, sort: null, filters: {}, search: '' };

    const porDefecto = await identity.listWorkGroupMembers(actor, 'wg-1', consulta, new Date());
    expect(porDefecto.items).toHaveLength(10);
    expect(porDefecto.pageSize).toBe(10);
    expect(porDefecto.total).toBe(30);

    const acotada = await identity.listWorkGroupMembers(
      actor,
      'wg-1',
      { ...consulta, pageSize: 100 },
      new Date(),
    );
    expect(acotada.items).toHaveLength(25);
    expect(acotada.pageSize).toBe(25);
  });
});
