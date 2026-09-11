// QC-48 T7 — La cadena completa de `resolve-session.ts`, con puertos falsos escritos aqui mismo
// (nada de `vi.mock` de modulos reales), igual que el archivo hermano de QC-8. Lo que se ejercita
// aqui y no alli: los DOS cortes nuevos —empresa que no casa y empresa muerta—, su ORDEN respecto
// a los que ya existian, y que la empresa expuesta sale de la base.
// Cubre R14, R15, R16, R17, R19, R20, R21, R22.
//
// QC-78 T12 — se anade el SEXTO corte, el del estado de cuenta, con sus propios casos: la cuenta
// que deja de estar `active` pierde la sesion en la siguiente resolucion (R20), el bloqueo YA
// VENCIDO la conserva (R7, R8 vistos desde la sesion), el corte no cuesta ninguna consulta ni
// escribe nada (R21) y no depende de ningun sello de invalidacion de sesiones (R22). Los
// requisitos citados en los comentarios que ya estaban son los de QC-48; los nuevos van siempre
// con el prefijo `QC-78`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createResolveSession } from '@/lib/modules/identity/domain/resolve-session';

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { ResolveSessionDeps } from '@/lib/modules/identity/domain/resolve-session';
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
  // QC-78 T10 (R20): el record trae ahora el estado de cuenta y el plazo de bloqueo, crudos. La
  // cuenta corriente es `active` sin plazo; los casos que no lo son se derivan con `...RECORD`.
  accountStatus: 'active',
  lockedUntil: null,
};

/** QC-78: un plazo de bloqueo todavia vigente respecto de `AHORA`. */
const PLAZO_FUTURO = new Date('2026-09-01T10:30:00.000Z');
/** QC-78: un plazo de bloqueo YA VENCIDO respecto de `AHORA`. Este es el caso interesante. */
const PLAZO_VENCIDO = new Date('2026-09-01T09:30:00.000Z');

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

// ================================================================================================
// QC-78 T12 — el SEXTO corte: el estado de cuenta.
// ================================================================================================

/**
 * El fuente del caso de uso, leido tal cual. Hay requisitos —R21 «cero escrituras» y R22 «ningun
 * sello de invalidacion»— que hablan de lo que el archivo NO hace; eso no se puede afirmar
 * ejercitando el resultado, porque una ausencia no produce salida. Se afirma sobre el texto, con
 * los comentarios quitados para no confundir lo que el archivo EXPLICA con lo que EJECUTA.
 */
const FUENTE_RESOLVE_SESSION = readFileSync(
  resolve(process.cwd(), 'lib/modules/identity/domain/resolve-session.ts'),
  'utf8',
);

const CODIGO_SIN_COMENTARIOS = FUENTE_RESOLVE_SESSION.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /\/\/.*$/gm,
  '',
);

describe('createResolveSession — corte por estado de cuenta (QC-78)', () => {
  // QC-78 R20 — `pending`: la cuenta creada y aun no habilitada no sostiene una sesion abierta.
  it('una cuenta que pasa a pending deja de tener sesion en la siguiente resolucion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'pending' });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R20 — `inactive`: apagada a proposito por un administrador.
  it('una cuenta que pasa a inactive deja de tener sesion en la siguiente resolucion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'inactive' });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R20, R10 — `blocked` con el plazo todavia vigente.
  it('una cuenta blocked con el plazo todavia futuro deja de tener sesion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      accountStatus: 'blocked',
      lockedUntil: PLAZO_FUTURO,
    });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R11 visto desde la sesion — la fila que la politica de intentos de QC-19 bloqueo antes
  // de que esta ficha unificara las dos cosas: dice `active` y tiene plazo futuro. Tampoco entra.
  it('una cuenta active con lockedUntil futuro deja de tener sesion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'active', lockedUntil: PLAZO_FUTURO });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R7, R8 vistos desde la sesion — ESTE es el caso que demuestra por que el corte no puede
  // comparar `record.accountStatus !== 'active'` a pelo: la columna dice `blocked`, pero el plazo
  // ya vencio, asi que el estado EFECTIVO es `active` y la sesion sigue en pie, con su proyeccion
  // entera. Comparar la columna dejaria a esta persona fuera hasta que volviera a hacer login.
  it('una cuenta blocked con el plazo ya vencido conserva la sesion y la proyeccion completa', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      accountStatus: 'blocked',
      lockedUntil: PLAZO_VENCIDO,
    });
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toEqual({
      user: {
        id: SUB,
        username: 'ana.perez',
        displayName: 'Ana Perez',
        roleName: 'operador',
        permissions: ['inventario.consultar'],
      },
      context: {
        userId: SUB,
        companyId: COMPANY_ID,
        roleName: 'operador',
      },
    });
  });

  // QC-78 R20 — el corte nuevo convive con los que ya estaban: una ficha que a la vez tiene la
  // empresa muerta y el estado `inactive` sigue resolviendo `null`, sin excepcion ni camino nuevo.
  it('con la empresa muerta y ademas el estado inactive sigue resolviendo null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      companyDeletedAt: EMPRESA_DADA_DE_BAJA,
      accountStatus: 'inactive',
    });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 — el ORDEN, de forma OBSERVABLE y sin tocar el codigo de produccion: el estado viaja en
  // un `get` que cuenta sus lecturas. Con la empresa muerta, el corte 5 sale antes y el estado NO
  // llega a leerse; con la empresa viva, si. Los dos casos van juntos a proposito: sin el segundo,
  // el `not.toHaveBeenCalled()` del primero se cumpliria tambien si el getter no funcionara.
  it('con la empresa muerta el estado de cuenta ni se lee: el corte 6 va detras del 5', async () => {
    const leerEstadoConEmpresaMuerta = vi.fn(() => 'inactive' as const);
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      companyDeletedAt: EMPRESA_DADA_DE_BAJA,
      get accountStatus() {
        return leerEstadoConEmpresaMuerta();
      },
    });
    const resolveSession = createResolveSession({ session, users });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
    expect(leerEstadoConEmpresaMuerta).not.toHaveBeenCalled();

    const leerEstadoConEmpresaViva = vi.fn(() => 'inactive' as const);
    const usersEmpresaViva = fakeUserReader({
      ...RECORD,
      get accountStatus() {
        return leerEstadoConEmpresaViva();
      },
    });

    await expect(
      createResolveSession({ session, users: usersEmpresaViva })(AHORA),
    ).resolves.toBeNull();
    expect(leerEstadoConEmpresaViva).toHaveBeenCalled();
  });

  // QC-78 R21 — cero consultas nuevas: el camino cortado por estado hace EXACTAMENTE la misma
  // unica lectura que el camino feliz. El estado y el plazo venian ya en esa fila.
  it('el camino cortado por estado consulta al lector exactamente una vez', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'inactive' });
    const resolveSession = createResolveSession({ session, users });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // QC-78 R21 — cero escrituras: las dependencias de la resolucion son DOS lectores y nada mas.
  // El `Record` exhaustivo es la mitad que muerde en tiempo de compilacion —una clave nueva en
  // `ResolveSessionDeps` deja de tipar— y el `Object.keys` la que muerde al ejecutar.
  it('sus dependencias son dos lectores y ningun puerto de escritura', () => {
    const clavesExhaustivas: Record<keyof ResolveSessionDeps, true> = { session: true, users: true };

    expect(Object.keys(clavesExhaustivas).sort()).toEqual(['session', 'users']);

    // Y el codigo que se ejecuta no nombra ninguna primitiva de escritura: ni registrar un
    // intento, ni guardar, ni actualizar. Una ficha con el plazo vencido se corrige en el camino
    // de ESCRITURA del login (R15, R16), no al leerla.
    expect(CODIGO_SIN_COMENTARIOS).not.toMatch(/Recorder|Writer|\.save|\.update|\.create|\.record/);
  });

  // QC-78 R22 — el corte se decide SOLO con la ficha que la resolucion ya relee. Ni sello por
  // usuario, ni registro de invalidacion de sesiones, ni nada de QC-23: sigue sin ser dependencia.
  it('no depende de ningun sello ni registro de invalidacion de sesiones', () => {
    expect(CODIGO_SIN_COMENTARIOS).not.toMatch(/invalidat|sello|stamp|validFrom|revok|QC-23/i);
  });
});
