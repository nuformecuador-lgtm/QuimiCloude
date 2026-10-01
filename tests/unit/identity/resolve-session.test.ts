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
// QC-23 T19: la desigualdad del sello se importa, no se reescribe en el test. Su UNICO cuerpo
// vive en el dominio, y un test que la copiara pasaria a ser una segunda definicion.
import { isStampedOut } from '@/lib/modules/identity/domain/session-revocation';

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { ResolveSessionDeps } from '@/lib/modules/identity/domain/resolve-session';
import type { SessionReader } from '@/lib/modules/identity/ports/session-reader';
import type { SessionCheckLog } from '@/lib/modules/identity/ports/session-check-log';
import type {
  SessionUserReader,
  SessionUserRecord,
} from '@/lib/modules/identity/ports/session-user-reader';

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

// QC-23 R1: desde `v4` el contenido firmado lleva el identificador de ESTA sesion.
const SID_CLAIMS = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';
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
  // QC-23 R1: desde `v4` los claims llevan el identificador de ESTA sesion.
  sessionId: SID_CLAIMS,
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
  // QC-23 T9 (R7, R8, R11): el record trae ahora el sello del usuario y el instante en que ESTA
  // sesion fue cerrada una a una, los dos crudos. El caso corriente es un sello ANTERIOR a la
  // emision y ninguna fila en el registro; los cortes 7 y 8 tienen sus casos propios.
  sessionsValidFrom: new Date('2026-08-01T00:00:00.000Z'),
  sessionRevokedAt: null,
};

/** QC-78: un plazo de bloqueo todavia vigente respecto de `AHORA`. */
const PLAZO_FUTURO = new Date('2026-09-01T10:30:00.000Z');
/** QC-78: un plazo de bloqueo YA VENCIDO respecto de `AHORA`. Este es el caso interesante. */
const PLAZO_VENCIDO = new Date('2026-09-01T09:30:00.000Z');

// QC-23 T10 (R16, R17): la resolucion gana UNA dependencia mas —a donde va la causa cuando la
// comprobacion no se puede hacer—. Aqui se cablea muda: ninguna asercion de este archivo habla
// del registro del servidor, y las que si lo hacen viven en el bloque de QC-23 al final. **Ni una
// asercion de las que ya estaban cambia**: solo se completa la dependencia que el tipo exige.
const REGISTRO_QC23 = {
  log: { log: () => undefined },
} satisfies Pick<ResolveSessionDeps, 'log'>;

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R15 — la empresa de la ficha no esta viva: sin sesion. `deleted_at` con valor es el unico
  // criterio (QC-47 R6).
  it('con companyDeletedAt no nulo resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, companyDeletedAt: EMPRESA_DADA_DE_BAJA });
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R15 — el corte de la empresa muerta es INDEPENDIENTE del de R14: aqui la empresa firmada SI
  // casa con la de la ficha, y aun asi no hay sesion. Es lo que exige que sean dos `if`.
  it('con empresa muerta que si casa con la firmada resuelve null igual', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, companyDeletedAt: EMPRESA_DADA_DE_BAJA });
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // R17 — sin cookie no se toca la base: los cortes nuevos no adelantan ninguna consulta.
  it('sin claims resuelve null sin llamar a findActiveById', async () => {
    const session = fakeSessionReader(null);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R17 — una sesion caducada tampoco cuesta una consulta.
  it('con sesion caducada resuelve null sin llamar a findActiveById', async () => {
    const session = fakeSessionReader(CLAIMS_CADUCADOS);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });

  // R16 — usuario inexistente o dado de baja: mismo `null` de siempre, sin pantalla ni camino
  // nuevos. El corte 3 sigue por delante de los dos nuevos.
  it('sin registro de usuario activo resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(null);
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // R21 — una sola pasada, las dos proyecciones, y coherentes entre si.
  it('con sesion valida compone user y context coherentes', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSession(AHORA);

    expect(resultado?.context?.roleName).toBe(RECORD.roleName);
    expect(resultado?.context?.roleName).not.toBe(CLAIMS_VIGENTES.roleName);
    expect(resultado?.context?.companyId).toBe(RECORD.companyId);
  });

  // R22 — lo expuesto se limita a empresa, usuario y rol. Ni permisos, ni capacidades, ni
  // respuestas a "puedo o no puedo": que la empresa viaje en la sesion no autoriza nada.
  it('el contexto lleva userId, companyId y roleName y nada mas', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R20 — `inactive`: apagada a proposito por un administrador.
  it('una cuenta que pasa a inactive deja de tener sesion en la siguiente resolucion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'inactive' });
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    await expect(resolveSession(AHORA)).resolves.toBeNull();
  });

  // QC-78 R11 visto desde la sesion — la fila que la politica de intentos de QC-19 bloqueo antes
  // de que esta ficha unificara las dos cosas: dice `active` y tiene plazo futuro. Tampoco entra.
  it('una cuenta active con lockedUntil futuro deja de tener sesion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'active', lockedUntil: PLAZO_FUTURO });
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

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
      createResolveSession({ session, users: usersEmpresaViva, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
    expect(leerEstadoConEmpresaViva).toHaveBeenCalled();
  });

  // QC-78 R21 — cero consultas nuevas: el camino cortado por estado hace EXACTAMENTE la misma
  // unica lectura que el camino feliz. El estado y el plazo venian ya en esa fila.
  it('el camino cortado por estado consulta al lector exactamente una vez', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, accountStatus: 'inactive' });
    const resolveSession = createResolveSession({ session, users, ...REGISTRO_QC23 });

    const resultado = await resolveSession(AHORA);

    expect(resultado).toBeNull();
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  // QC-78 R21 — cero escrituras: las dependencias de la resolucion son DOS LECTORES y, desde
  // QC-23, el registro del servidor. Ninguna de las tres escribe en la base. El `Record` exhaustivo es la mitad que muerde en tiempo de
  // compilacion —una clave nueva en `ResolveSessionDeps` deja de tipar— y el `Object.keys` la que
  // muerde al ejecutar.
  //
  // ENMIENDA DE QC-23 (T10, R16, R17): la lista pasa de dos claves a tres. Lo que este test
  // afirma NO cambia —que aqui no hay ningun puerto de ESCRITURA—; lo que cambia es que la
  // comprobacion que falla tiene que poder dejar la causa en algun sitio, y ese sitio es un log,
  // no una tabla.
  it('sus dependencias son lectores y registro, y ningun puerto de escritura', () => {
    const clavesExhaustivas: Record<keyof ResolveSessionDeps, true> = {
      session: true,
      users: true,
      log: true,
    };

    expect(Object.keys(clavesExhaustivas).sort()).toEqual(['log', 'session', 'users'].sort());

    // Y el codigo que se ejecuta no nombra ninguna primitiva de escritura: ni registrar un
    // intento, ni guardar, ni actualizar. Una ficha con el plazo vencido se corrige en el camino
    // de ESCRITURA del login (R15, R16), no al leerla.
    expect(CODIGO_SIN_COMENTARIOS).not.toMatch(/Recorder|Writer|\.save|\.update|\.create|\.record/);
  });

  // QC-78 R22, ENMENDADO POR QC-23 (T10, R13, R40). El test original afirmaba que la resolucion
  // «no depende de ningun sello ni registro de invalidacion de sesiones», y era cierto **mientras
  // QC-23 no existiera**: lo decia con esas palabras y nombraba la ficha. QC-23 es hoy la
  // decision contraria y esta aprobada por escrito (R13: la comprobacion va DONDE YA SE RESUELVE
  // el usuario contra la base). Asi que el test no se borra: se da la vuelta y conserva la mitad
  // que sigue siendo verdad y que es la que de verdad protegia —R40: por aqui no se ESCRIBE—.
  it('mira el sello y el registro de cerradas, pero no escribe ni purga nada', () => {
    // Lo que si hace ahora (R8, R11).
    expect(CODIGO_SIN_COMENTARIOS).toMatch(/isStampedOut/);
    expect(CODIGO_SIN_COMENTARIOS).toMatch(/sessionRevokedAt/);

    // Lo que sigue sin hacer (R40): la purga perezosa de las filas caducadas vive SOLO en las dos
    // operaciones del puerto de revocacion. Ponerla aqui convertiria la ruta mas caliente del ERP
    // en una escritura por peticion —alternativa descartada 6 de `design.md > 9`—.
    // `deleteMany` y no `delete` a secas: `companyDeletedAt` es un CAMPO que se lee, no una
    // escritura, y es de QC-48.
    expect(CODIGO_SIN_COMENTARIOS).not.toMatch(/deleteMany|purg|revokeSession|stampAll/i);
  });
});

// ================================================================================================
// QC-23 T19 — los cortes SEPTIMO y OCTAVO: el sello por usuario y el registro de sesiones
// cerradas, mas el fallo cerrado de la comprobacion.
//
// Cubre R8, R11, R13, R14, R15, R16, R17, R18, R40. Los seis cortes de arriba conservan sus
// aserciones intactas: lo unico que cambio en ellos fue completar las dependencias que el tipo
// exige y los dos campos nuevos del record.
// ================================================================================================

/** El sello que NO mata a `CLAIMS_VIGENTES`: es anterior a su emision (08:00). */
const SELLO_ANTERIOR = new Date('2026-09-01T07:00:00.000Z');
/** El sello que SI la mata por ser posterior a la emision. */
const SELLO_POSTERIOR = new Date('2026-09-01T09:00:00.000Z');
/** El borde de `design.md > 2.3`: el sello cae en el MISMO segundo que el `iat`. */
const SELLO_MISMO_SEGUNDO = new Date('2026-09-01T08:00:00.000Z');
/** El instante en que ESTA sesion fue cerrada una a una. */
const CERRADA_EN = new Date('2026-09-01T08:30:00.000Z');

const RECORD_CON_SELLO_MUERTO: SessionUserRecord = {
  ...RECORD,
  sessionsValidFrom: SELLO_POSTERIOR,
};
const RECORD_CON_SESION_CERRADA: SessionUserRecord = {
  ...RECORD,
  sessionRevokedAt: CERRADA_EN,
};

describe('createResolveSession — corte por sello (QC-23 R8)', () => {
  // R8 — la sesion se emitio ANTES del sello: invalida, aunque la ficha sea impecable.
  it('con un iat anterior al sello del usuario resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD_CON_SELLO_MUERTO);

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  // R8, R9 y `design.md > 2.3` — ESTE es el caso que justifica que la comparacion sea `<=` y no
  // `<` estricto: una sesion emitida en el MISMO segundo del corte tambien muere. Con `<` habria
  // un agujero de hasta un segundo, y un agujero de un segundo en una revocacion sigue siendo un
  // agujero (decision cerrada 13).
  it('con un iat igual al sello —el mismo segundo— resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, sessionsValidFrom: SELLO_MISMO_SEGUNDO });

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  // R8 — el complemento: un sello anterior a la emision no corta nada y la sesion sigue en pie
  // con su proyeccion entera. Sin este caso, el test de arriba pasaria tambien con un `return
  // null` incondicional.
  it('con un sello anterior a la emision conserva la sesion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, sessionsValidFrom: SELLO_ANTERIOR });

    const resultado = await createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA);

    expect(resultado?.user.id).toBe(SUB);
    expect(resultado?.context?.companyId).toBe(COMPANY_ID);
  });
});

describe('createResolveSession — corte por registro de cerradas (QC-23 R11)', () => {
  // R11 — hay fila en el registro para el `sid` en curso: invalida, aunque el sello no la mate.
  it('con sessionRevokedAt no nulo resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD_CON_SESION_CERRADA);

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  // R14 — la pertenencia al registro se resuelve con el `sid` de ESTA sesion, y por eso el `sid`
  // viaja hasta el puerto: sin el, el lector no sabria que fila buscar.
  it('consulta al lector con el sub y el sid de la sesion en curso', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD);

    await createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA);

    expect(users.findActiveById).toHaveBeenCalledWith(SUB, SID_CLAIMS);
  });

  // R20 visto desde la resolucion — cerrar UNA sesion no toca las demas: el mismo usuario, con
  // otro `sid` que nadie cerro, sigue resolviendo. Es lo que hace que salir en el movil no eche
  // a nadie de la oficina.
  it('otra sesion de la misma persona, sin fila en el registro, sigue resolviendo', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({ ...RECORD, sessionRevokedAt: null });

    const resultado = await createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA);

    expect(resultado).not.toBeNull();
  });
});

describe('createResolveSession — convivencia de los dos cortes (QC-23 R18)', () => {
  // R18 — los dos mecanismos invalidan la MISMA sesion a la vez: el resultado es el mismo «sin
  // sesion» de siempre, sin excepcion ni camino nuevo.
  it('con el sello y el registro invalidando a la vez resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      sessionsValidFrom: SELLO_POSTERIOR,
      sessionRevokedAt: CERRADA_EN,
    });

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  // R18 — y cada uno POR SEPARADO tambien corta: sin estos dos casos, el de arriba se cumpliria
  // igual si uno de los dos `if` no existiera.
  it('cada uno de los dos por separado tambien corta', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);

    await expect(
      createResolveSession({
        session,
        users: fakeUserReader(RECORD_CON_SELLO_MUERTO),
        ...REGISTRO_QC23,
      })(AHORA),
    ).resolves.toBeNull();

    await expect(
      createResolveSession({
        session,
        users: fakeUserReader(RECORD_CON_SESION_CERRADA),
        ...REGISTRO_QC23,
      })(AHORA),
    ).resolves.toBeNull();
  });

  // R18 — el ORDEN de evaluacion no cambia el resultado, y se afirma sobre los DOS ordenes. Los
  // dos cortes son predicados puros sobre la MISMA fila ya leida, asi que componerlos al reves
  // es una operacion legitima y no una simulacion: es exactamente lo que dice `design.md > 4.1`
  // —«son conmutativos, el sello va primero por claridad, no porque el orden cambie nada»—.
  it('evaluar sello-antes-registro y registro-antes-sello da el mismo resultado', () => {
    const porSello = (r: SessionUserRecord): boolean =>
      isStampedOut(CLAIMS_VIGENTES, r.sessionsValidFrom);
    const porRegistro = (r: SessionUserRecord): boolean => r.sessionRevokedAt !== null;

    const casos: readonly SessionUserRecord[] = [
      RECORD,
      RECORD_CON_SELLO_MUERTO,
      RECORD_CON_SESION_CERRADA,
      { ...RECORD, sessionsValidFrom: SELLO_POSTERIOR, sessionRevokedAt: CERRADA_EN },
    ];

    for (const caso of casos) {
      const selloPrimero = porSello(caso) || porRegistro(caso);
      const registroPrimero = porRegistro(caso) || porSello(caso);
      expect(selloPrimero).toBe(registroPrimero);
    }

    // Y los tres casos que cortan cortan de verdad, para que la igualdad de arriba no sea la de
    // cuatro `false`.
    expect(casos.map((caso) => porSello(caso) || porRegistro(caso))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  // R14, R40 — los dos cortes nuevos NO cuestan ninguna invocacion mas del puerto: el sello y el
  // instante de cierre llegaron en la MISMA lectura que ya se hacia. Y el camino cortado hace
  // exactamente la misma unica lectura que el camino feliz.
  it('los dos cortes nuevos consultan al lector exactamente una vez', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader({
      ...RECORD,
      sessionsValidFrom: SELLO_POSTERIOR,
      sessionRevokedAt: CERRADA_EN,
    });

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
    expect(users.findActiveById).toHaveBeenCalledTimes(1);

    const usersFeliz = fakeUserReader(RECORD);
    await createResolveSession({ session, users: usersFeliz, ...REGISTRO_QC23 })(AHORA);
    expect(usersFeliz.findActiveById).toHaveBeenCalledTimes(1);
  });
});

describe('createResolveSession — fallar cerrado (QC-23 R16, R17)', () => {
  /** Lo que el puerto lanza cuando la base no responde. */
  const CAIDA = new Error('connect ECONNREFUSED 127.0.0.1:5432');

  function puertoQueFalla(): SessionUserReader {
    return { findActiveById: vi.fn().mockRejectedValue(CAIDA) };
  }

  /**
   * El registro del servidor, espiado. Aqui solo viaja la CAUSA: el identificador de peticion lo
   * pone el ADAPTADOR de este puerto —QC-71 R9 prohibe que entre en el dominio—, y que lo pone de
   * verdad lo afirma `tests/unit/identity/session-check-log.test.ts`.
   */
  function registroEspia(): { log: SessionCheckLog } {
    return { log: { log: vi.fn() } };
  }

  // R16 — si la comprobacion no se puede hacer, la sesion es INVALIDA y la persona acaba en el
  // login. No se propaga la excepcion y, sobre todo, no se da por buena la sesion: una
  // revocacion que se puede saltar provocando un fallo no es una revocacion.
  it('si el puerto lanza resuelve null y no propaga la excepcion', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = puertoQueFalla();

    await expect(
      createResolveSession({ session, users, ...registroEspia() })(AHORA),
    ).resolves.toBeNull();
  });

  // R17 — la causa queda en el registro del servidor. Es, junto al identificador de peticion que
  // pone el adaptador, la unica forma de distinguir un corte de base de un cierre de sesion al
  // mirar los logs.
  it('registra la causa una sola vez', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = puertoQueFalla();
    const registro = registroEspia();

    await createResolveSession({ session, users, ...registro })(AHORA);

    expect(registro.log.log).toHaveBeenCalledTimes(1);
    const [diagnostico] = vi.mocked(registro.log.log).mock.calls[0] ?? [];
    expect(diagnostico).toContain(CAIDA.message);
  });

  // `design.md > 7` — **el diagnostico NUNCA lleva el `sid`**, ni el `sub`, ni nada de los
  // claims: un identificador de sesion es material de autenticacion, con el y la firma correcta
  // se entra. Mismo criterio con el que QC-79 prohibio el secreto del enlace en el diagnostico.
  it('el diagnostico no lleva el sid ni el sub', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = puertoQueFalla();
    const registro = registroEspia();

    await createResolveSession({ session, users, ...registro })(AHORA);

    const [diagnostico] = vi.mocked(registro.log.log).mock.calls[0] ?? [];
    expect(diagnostico).not.toContain(SID_CLAIMS);
    expect(diagnostico).not.toContain(SUB);
  });

  // R16, R40 — el fallo no dispara ninguna escritura ni ningun reintento: se registra una vez, se
  // corta, y no se vuelve a llamar al puerto.
  it('no reintenta la lectura tras el fallo', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = puertoQueFalla();

    await createResolveSession({ session, users, ...registroEspia() })(AHORA);

    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });
});

// ================================================================================================
// QC-161 — la sesion de quien no tiene empresa (el Maestro).
// ================================================================================================

describe('createResolveSession — sesion sin empresa (QC-161)', () => {
  const CLAIMS_SIN_EMPRESA: SessionClaims = { ...CLAIMS_VIGENTES, companyId: null };
  const RECORD_SIN_EMPRESA: SessionUserRecord = {
    ...RECORD,
    roleName: 'Maestro',
    companyId: null,
    companyDeletedAt: null,
    permissions: ['empresas.consultar', 'empresas.modificar'],
  };

  it('QC-161 R31: ficha sin empresa y firma null exponen el usuario con sus permisos y ningun contexto de empresa', async () => {
    const session = fakeSessionReader(CLAIMS_SIN_EMPRESA);
    const users = fakeUserReader(RECORD_SIN_EMPRESA);

    const resultado = await createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA);

    expect(resultado).toEqual({
      user: {
        id: SUB,
        username: 'ana.perez',
        displayName: 'Ana Perez',
        roleName: 'Maestro',
        permissions: ['empresas.consultar', 'empresas.modificar'],
      },
      context: null,
    });
    expect(users.findActiveById).toHaveBeenCalledTimes(1);
  });

  it('QC-161 R32: firma sin empresa y ficha con empresa resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_SIN_EMPRESA);
    const users = fakeUserReader(RECORD);

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  it('QC-161 R32: firma con empresa y ficha sin empresa resuelve null', async () => {
    const session = fakeSessionReader(CLAIMS_VIGENTES);
    const users = fakeUserReader(RECORD_SIN_EMPRESA);

    await expect(
      createResolveSession({ session, users, ...REGISTRO_QC23 })(AHORA),
    ).resolves.toBeNull();
  });

  // Sin empresa no se salta ningun otro corte: la cuenta, el sello y el registro de cerradas
  // siguen mandando igual que para cualquiera.
  it('QC-161 R31: sin empresa, la cuenta no activa, el sello y la sesion cerrada siguen cortando', async () => {
    const session = fakeSessionReader(CLAIMS_SIN_EMPRESA);
    const casos: SessionUserRecord[] = [
      { ...RECORD_SIN_EMPRESA, accountStatus: 'inactive' },
      { ...RECORD_SIN_EMPRESA, sessionsValidFrom: CLAIMS_SIN_EMPRESA.issuedAt },
      { ...RECORD_SIN_EMPRESA, sessionRevokedAt: AHORA },
    ];

    for (const record of casos) {
      await expect(
        createResolveSession({ session, users: fakeUserReader(record), ...REGISTRO_QC23 })(AHORA),
      ).resolves.toBeNull();
    }
  });

  it('QC-161 R31: sin claims o caducada no consulta la base, igual con firma sin empresa', async () => {
    const users = fakeUserReader(RECORD_SIN_EMPRESA);
    const caducados: SessionClaims = { ...CLAIMS_CADUCADOS, companyId: null };

    await expect(
      createResolveSession({ session: fakeSessionReader(caducados), users, ...REGISTRO_QC23 })(
        AHORA,
      ),
    ).resolves.toBeNull();
    expect(users.findActiveById).not.toHaveBeenCalled();
  });
});
