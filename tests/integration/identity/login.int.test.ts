/**
 * T8 — Integracion del login contra una base Postgres REAL (`design.md > 7`, nivel 3).
 *
 * QUE SE EJERCITA AQUI Y NO EN LOS UNITARIOS: el adaptador Prisma de verdad
 * (`findActiveByUsername` con su `$queryRaw` y el indice funcional parcial
 * `users_username_unique`, y las dos escrituras: el `updateMany` condicional de
 * `compareAndSetLoginAttempt` y el `update` de `setLoginAttempt`), el hasher bcrypt de verdad
 * y las tres columnas de bloqueo tal como quedan escritas en la fila. El caso de uso se
 * construye con esos adaptadores reales; el unico doble es el `SessionWriter`, porque
 * `session-cookie.ts` escribe con `cookies()` de `next/headers` y eso solo funciona dentro de
 * una Server Action o un route handler. Aqui se afirma QUE se emitio la sesion y para quien;
 * COMO se transporta ya lo cubre `tests/unit/identity/session-cookie.test.ts`.
 *
 * AISLAMIENTO — a proposito NO se usa el patron de transaccion con rollback de
 * `identity-constraints.int.test.ts`. Aquel escribe y lee con el MISMO `tx`, y aqui lo que se
 * ejercita es el adaptador real, que usa el cliente `prisma` compartido: no veria ninguna fila
 * de una transaccion sin confirmar. Por eso los datos se comitean en `beforeAll` y se limpian
 * en `afterAll`, borrando por id solo las filas propias. Es un fixture de test, no una
 * operacion de negocio: el veto al borrado fisico de `docs/architecture.md > Anti-patrones`
 * aplica al codigo de produccion, y los tests estan exentos en la tabla de dependencias.
 *
 * SIN SEED (R21) — el rol y el usuario los crea este archivo con un `username` aleatorio
 * (`qc7_login_<uuid>`); el correo y el documento tambien llevan el uuid para no chocar con los
 * indices unicos parciales. La unica fila ajena de la que depende es el tipo de documento
 * `CC`, que inserta la propia migracion de QC-4. QC-6 (seed) no interviene: si algun dia
 * cambia sus datos, este test no se entera.
 *
 * QC-47 (T17, T19) — `users.company_id` es obligatoria, asi que este fixture crea tambien su
 * PROPIA empresa efimera (`qc7-login-<uuid>`) en el `beforeAll` y mete al usuario dentro.
 * Nunca la empresa de instalacion: `companies_name_unique` es global y el alta chocaria con la
 * que siembra QC-6. El `afterAll` barre en orden `users -> companies`, que es el unico que
 * respeta el `ON DELETE RESTRICT` de `users_company_id_fkey`.
 *
 * EL ROL SIGUE SALIENDO DE `users.role_id` (R13, R14) — la empresa no lo toca: el adaptador
 * resuelve el nombre del rol con el mismo `JOIN roles r ON r.id = u.role_id` de siempre, en la
 * MISMA consulta, y el caso «el rol firmado cambia al cambiar `users.role_id`» lo demuestra
 * contra la base.
 *
 * ORDEN — cada `it` arranca con el estado de bloqueo a cero (`beforeEach`), asi que el orden
 * de los tests no importa y el archivo pasa igual corrido dos veces seguidas.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createVerifyCredentials,
  DOCUMENT_TYPE_CC,
  normalizeCompanyName,
  type SessionTicket,
} from '@/lib/modules/identity';
import {
  compareAndSetLoginAttempt,
  findActiveByUsername,
  setLoginAttempt,
} from '@/lib/modules/identity/adapters/driven/persistence/user-credentials-prisma';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
// QC-23 T5 — el adaptador REAL de `SessionIdFactory`: el login emite un `sid` de verdad.
import { sessionIdCrypto } from '@/lib/modules/identity/adapters/driven/session/session-id-crypto';
import {
  buildSessionValue,
  verifySessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import { prisma } from '@/lib/shared/db/prisma';

/**
 * QC-9 R26 — secreto propio del test para firmar el ticket que emitio el login y comprobar que el
 * rol viaja dentro. No se lee `SESSION_SECRET` del entorno: este archivo no depende de como este
 * configurada la maquina, y el codec recibe el secreto por parametro justamente para esto.
 */
const SECRETO_DE_PRUEBAS = 'secreto-de-integracion-de-64-caracteres-para-firmar-la-sesion-qc9';

/** Cinco verificaciones bcrypt reales de coste 10 rondan el medio segundo; se da margen. */
const TIEMPO_HOLGADO = { timeout: 30_000 };

/** Credencial del usuario de prueba. Solo existe en esta ejecucion y en esta fila. */
const CLAVE_CORRECTA = 'clave-de-prueba-QC7-#2026';
const CLAVE_INCORRECTA = 'clave-de-prueba-QC7-#2027';

const sufijo = randomUUID();
const nombreDeUsuario = `qc7_login_${sufijo}`;
/** QC-47: nombre irrepetible de la empresa efimera de este fixture. */
const nombreDeEmpresa = `qc7-login-${sufijo}`;

/**
 * QC-48 (T4) — segunda empresa, DADA DE BAJA, con su propio usuario dentro. `companies_name_unique`
 * es un indice parcial (`WHERE deleted_at IS NULL`), asi que una empresa con `deleted_at` puesto no
 * compite por el nombre; aun asi lleva su propio sufijo.
 */
const nombreDeUsuarioDeEmpresaMuerta = `qc48_login_${sufijo}`;
const nombreDeEmpresaMuerta = `qc48-login-baja-${sufijo}`;

let usuarioId = '';
let rolId = '';
/** QC-47 R14: segundo rol, para demostrar que el rol firmado sale de `users.role_id`. */
let rolAlternativoId = '';
let empresaId = '';
/** QC-48: la empresa con `deleted_at` puesto y la persona que pertenece a ella. */
let empresaMuertaId = '';
let usuarioDeEmpresaMuertaId = '';

type EspiaDeSesion = {
  readonly tickets: SessionTicket[];
  startSession(ticket: SessionTicket): Promise<void>;
};

/**
 * Doble del `SessionWriter`: guarda el ticket recibido y nada mas. Es lo que permite afirmar
 * "se emitio sesion, y para este usuario" sin montar el runtime de Next.
 */
function crearEspiaDeSesion(): EspiaDeSesion {
  const tickets: SessionTicket[] = [];
  return {
    tickets,
    startSession(ticket: SessionTicket): Promise<void> {
      tickets.push(ticket);
      return Promise.resolve();
    },
  };
}

/** Cablea el caso de uso con los adaptadores REALES de base y de hashing (`design.md > 4.3`). */
function montarLogin(): {
  verificar: ReturnType<typeof createVerifyCredentials>;
  sesion: EspiaDeSesion;
} {
  const sesion = crearEspiaDeSesion();
  const verificar = createVerifyCredentials({
    users: { findActiveByUsername },
    attempts: { compareAndSet: compareAndSetLoginAttempt, set: setLoginAttempt },
    hasher: { hash: createPasswordHash, verify: verifyPasswordHash },
    session: sesion,
    // QC-23 R2: el adaptador REAL de la fabrica del `sid`, como el de hashing y el de base.
    ids: sessionIdCrypto,
  });
  return { verificar, sesion };
}

/**
 * QC-78 (R13) — el estado de cuenta y su rastro, tal como quedan en la fila. Se lee aparte de
 * `leerBloqueo()` para no tocar las igualdades exactas que ya afirman los casos de QC-19.
 */
function leerEstado(): Promise<{
  accountStatus: string;
  accountStatusChangedAt: Date;
  accountStatusChangedBy: string | null;
}> {
  return prisma.user.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { accountStatus: true, accountStatusChangedAt: true, accountStatusChangedBy: true },
  });
}

/** Las tres columnas de bloqueo tal como estan en la fila ahora mismo (R30). */
function leerBloqueo(): Promise<{
  failedLoginAttempts: number;
  lockLevel: number;
  lockedUntil: Date | null;
}> {
  return prisma.user.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { failedLoginAttempts: true, lockLevel: true, lockedUntil: true },
  });
}

beforeAll(async () => {
  const rol = await prisma.role.create({
    data: { name: `qc7-login-${sufijo}`, description: 'Rol de prueba de QC-7' },
    select: { id: true },
  });
  rolId = rol.id;

  const rolAlternativo = await prisma.role.create({
    data: { name: `qc7-login-alt-${sufijo}`, description: 'Rol alternativo de prueba de QC-7' },
    select: { id: true },
  });
  rolAlternativoId = rolAlternativo.id;

  // QC-47: empresa PROPIA del fixture, nunca la de instalacion.
  const empresa = await prisma.company.create({
    data: { name: nombreDeEmpresa, nameNormalized: normalizeCompanyName(nombreDeEmpresa) },
    select: { id: true },
  });
  empresaId = empresa.id;

  const usuario = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `qc7.${sufijo}@example.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: sufijo.replaceAll('-', '').slice(0, 20),
      username: nombreDeUsuario,
      // Hash producido con el adaptador real: si cambiara el coste o el algoritmo, este test
      // se enteraria, en vez de comparar contra una cadena copiada a mano.
      passwordHash: await createPasswordHash(CLAVE_CORRECTA),
      roleId: rolId,
      companyId: empresaId,
      // QC-78 R1 — EXPLICITO y no por defecto: la columna nace `pending` (QC-65) y desde esta
      // ficha `pending` NO entra al login. Quien tiene que poder entrar se crea `active`; los
      // casos que prueban lo contrario cambian el estado ellos mismos.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  usuarioId = usuario.id;

  // QC-48: empresa dada de baja + una persona dentro. Se necesita contra Postgres porque lo que
  // se demuestra es el `JOIN companies` del adaptador, no una decision del dominio.
  const empresaMuerta = await prisma.company.create({
    data: {
      name: nombreDeEmpresaMuerta,
      nameNormalized: normalizeCompanyName(nombreDeEmpresaMuerta),
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    select: { id: true },
  });
  empresaMuertaId = empresaMuerta.id;

  const usuarioDeEmpresaMuerta = await prisma.user.create({
    data: {
      firstNames: 'Beatriz',
      lastNames: 'Ruiz Salas',
      birthDate: new Date('1991-07-03T00:00:00.000Z'),
      email: `qc48.${sufijo}@example.test`,
      phone: '+57 300 444 5566',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: `48${sufijo.replaceAll('-', '').slice(0, 18)}`,
      username: nombreDeUsuarioDeEmpresaMuerta,
      passwordHash: await createPasswordHash(CLAVE_CORRECTA),
      roleId: rolId,
      companyId: empresaMuertaId,
      // QC-78 R1 — igual que el anterior: lo que este usuario demuestra es el corte por EMPRESA
      // (QC-48), y ese corte va despues del hash y despues del `!correcta`. Si naciera `pending`,
      // cortaria antes el estado y el caso dejaria de medir lo que dice medir.
      accountStatus: 'active',
    },
    select: { id: true },
  });
  usuarioDeEmpresaMuertaId = usuarioDeEmpresaMuerta.id;
}, 30_000);

afterAll(async () => {
  // El rol se borra en el `finally` para que se limpie aunque el borrado del usuario falle:
  // dejar filas huerfanas convertiria el segundo pase del archivo en un falso rojo.
  //
  // QC-47: el orden es `users -> companies`. `users_company_id_fkey` es `ON DELETE RESTRICT`,
  // asi que la empresa no se puede borrar mientras le quede su usuario dentro.
  try {
    await prisma.user.deleteMany({
      where: { id: { in: [usuarioId, usuarioDeEmpresaMuertaId] } },
    });
  } finally {
    await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [empresaId, empresaMuertaId] } } });
    await prisma.$disconnect();
  }
});

beforeEach(async () => {
  await prisma.user.update({
    where: { id: usuarioId },
    data: {
      failedLoginAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
      // QC-78 R13 — el estado tambien se restaura: los casos que bloquean la cuenta ahora dejan
      // `account_status = blocked` escrito, y sin esto el siguiente `it` arrancaria con una fila
      // bloqueada Y sin plazo, que es justo la combinacion que R9 lee como bloqueo administrativo
      // eterno. El orden de los tests tiene que seguir sin importar.
      accountStatus: 'active',
      accountStatusChangedBy: null,
    },
  });
});

describe('login contra Postgres real', () => {
  // QC-9 R26 — el rol que acaba FIRMADO en la cookie es el que la base tiene en ese instante.
  //
  // Se comprueba de extremo a extremo y contra Postgres: el rol se lee de la fila con Prisma, el
  // login corre con el adaptador real (`findActiveByUsername`, `$queryRaw` con el `JOIN roles`), y
  // el ticket que emitio se firma con el codec de verdad y se vuelve a verificar. Si alguien
  // quitara el `JOIN`, fijara un rol por defecto o firmara otra cosa, esto se pone rojo.
  it('el rol firmado en la cookie es el que la base tiene en ese instante', TIEMPO_HOLGADO, async () => {
    const { name: rolEnLaBase } = await prisma.role.findUniqueOrThrow({
      where: { id: rolId },
      select: { name: true },
    });
    const { verificar, sesion } = montarLogin();

    expect(await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA })).toEqual({
      ok: true,
    });

    const ticket = sesion.tickets[0];
    expect(ticket?.roleName).toBe(rolEnLaBase);

    // Y lo que viaja firmado, no solo lo que lleva el ticket: se emite el valor de la cookie con
    // el codec real y se verifica con el mismo, que es lo que leera el middleware.
    const valor = await buildSessionValue(ticket as SessionTicket, SECRETO_DE_PRUEBAS);
    const claims = await verifySessionValue(valor, SECRETO_DE_PRUEBAS);

    expect(claims?.sub).toBe(usuarioId);
    expect(claims?.roleName).toBe(rolEnLaBase);
  });

  // QC-47 R14 — el rol resuelto por el login sale de `users.role_id` y CAMBIA CON EL. Es un
  // requisito de no-regresion: la primera vuelta de QC-47 movio el rol a una tabla aparte,
  // y este caso es el que se pondria rojo si alguien lo volviera a mover o lo
  // congelara en otra fuente. Se cambia la columna de la fila —nada mas— y se vuelve a entrar.
  //
  // Ademas, UNA sola llamada al adaptador trae ya el nombre del rol (`JOIN roles` en la misma
  // consulta): el login no necesita ninguna lectura adicional para saber el rol de quien entra.
  it('el rol del login sale de users.role_id y cambia con el, sin una segunda lectura', TIEMPO_HOLGADO, async () => {
    const { name: rolOriginal } = await prisma.role.findUniqueOrThrow({
      where: { id: rolId },
      select: { name: true },
    });
    const { name: rolNuevo } = await prisma.role.findUniqueOrThrow({
      where: { id: rolAlternativoId },
      select: { name: true },
    });

    // Antes de tocar nada: una unica llamada al adaptador ya devuelve el nombre del rol.
    const antes = await findActiveByUsername(nombreDeUsuario);
    expect(antes?.roleName).toBe(rolOriginal);

    await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolAlternativoId } });

    try {
      const despues = await findActiveByUsername(nombreDeUsuario);
      expect(despues?.roleName).toBe(rolNuevo);

      const { verificar, sesion } = montarLogin();
      expect(await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA })).toEqual({
        ok: true,
      });
      expect(sesion.tickets[0]?.roleName).toBe(rolNuevo);
    } finally {
      // Se restaura pase lo que pase: los demas `it` esperan el rol original.
      await prisma.user.update({ where: { id: usuarioId }, data: { roleId: rolId } });
    }
  });

  // QC-48 R2 — la empresa de quien entra sale de la MISMA consulta que ya autentica: una sola
  // llamada al adaptador devuelve ya `companyId` y la marca de baja de esa empresa. Es el
  // `JOIN companies c ON c.id = u.company_id` del `$queryRaw`, y solo un test contra Postgres lo
  // demuestra: si alguien lo quitara, o lo convirtiera en una segunda lectura, esto se pone rojo.
  it('una sola lectura trae la empresa del usuario y su estado de baja', TIEMPO_HOLGADO, async () => {
    const encontrado = await findActiveByUsername(nombreDeUsuario);

    expect(encontrado?.id).toBe(usuarioId);
    expect(encontrado?.companyId).toBe(empresaId);
    // `null` es «la empresa sigue viva» (QC-47 R6). No se cocina un booleano: la regla es del
    // dominio y aqui solo viaja el dato.
    expect(encontrado?.companyDeletedAt).toBeNull();
  });

  // QC-48 R2, R3 — la fila SI se devuelve cuando la empresa esta dada de baja. El adaptador no
  // lleva `AND c.deleted_at IS NULL`: el corte es del dominio (`verify-credentials.ts`), porque
  // ese camino tiene que gastar igualmente su verificacion de hash (R4). Si alguien moviera la
  // regla al `WHERE`, este caso devolveria `null` y se pondria rojo.
  it('un usuario de una empresa dada de baja se devuelve, con su deleted_at no nulo', TIEMPO_HOLGADO, async () => {
    const encontrado = await findActiveByUsername(nombreDeUsuarioDeEmpresaMuerta);

    expect(encontrado).not.toBeNull();
    expect(encontrado?.id).toBe(usuarioDeEmpresaMuertaId);
    expect(encontrado?.companyId).toBe(empresaMuertaId);
    expect(encontrado?.companyDeletedAt).toBeInstanceOf(Date);
    expect(encontrado?.companyDeletedAt).not.toBeNull();
  });

  it('autentica contra una fila real', TIEMPO_HOLGADO, async () => {
    // R1 — usuario no borrado + contrasena que corresponde al hash guardado.
    const { verificar, sesion } = montarLogin();

    const resultado = await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA });

    expect(resultado).toEqual({ ok: true });
    expect(sesion.tickets).toHaveLength(1);
    expect(sesion.tickets[0]?.userId).toBe(usuarioId);
  });

  it('una contrasena incorrecta no autentica ni emite sesion', TIEMPO_HOLGADO, async () => {
    // R1 (el "solo si"), R14 — la fila existe y esta activa; lo que no corresponde es la clave.
    const { verificar, sesion } = montarLogin();

    const resultado = await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA });

    expect(resultado).toEqual({ ok: false });
    expect(sesion.tickets).toHaveLength(0);
  });

  it('con deleted_at no autentica', TIEMPO_HOLGADO, async () => {
    // R5 — el filtro `deleted_at IS NULL` vive en el SQL del adaptador, no en el dominio, asi
    // que solo un test contra la base real lo demuestra.
    await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: new Date() } });

    try {
      expect(await findActiveByUsername(nombreDeUsuario)).toBeNull();

      const { verificar, sesion } = montarLogin();
      const resultado = await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA });

      expect(resultado).toEqual({ ok: false });
      expect(sesion.tickets).toHaveLength(0);
    } finally {
      // Se restaura pase lo que pase: si la fila quedara borrada, los demas `it` fallarian
      // segun el orden de ejecucion.
      await prisma.user.update({ where: { id: usuarioId }, data: { deletedAt: null } });
    }
  });

  it('encuentra al usuario escrito en otra caja', TIEMPO_HOLGADO, async () => {
    // R4 — mayusculas y espacios alrededor dan igual en el nombre de usuario. Contra la base
    // real se comprueba ademas que el `lower(username)` del adaptador es el mismo que el del
    // indice funcional parcial `users_username_unique`.
    const escritoDeOtraForma = `  ${nombreDeUsuario.toUpperCase()}  `;

    expect(await findActiveByUsername(escritoDeOtraForma.trim().toLowerCase())).not.toBeNull();

    const { verificar, sesion } = montarLogin();
    const resultado = await verificar({ username: escritoDeOtraForma, password: CLAVE_CORRECTA });

    expect(resultado).toEqual({ ok: true });
    expect(sesion.tickets[0]?.userId).toBe(usuarioId);
  });

  it('cinco fallos dejan la cuenta bloqueada en la base', TIEMPO_HOLGADO, async () => {
    // R22, R30 — la escalada la decide el dominio, pero lo que se demuestra aqui es que el
    // estado llega a las tres columnas: contador reiniciado, nivel 1 y fin de bloqueo futuro.
    const { verificar, sesion } = montarLogin();
    const antes = Date.now();

    for (let intento = 0; intento < 5; intento += 1) {
      expect(await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA })).toEqual({
        ok: false,
      });
    }

    const bloqueo = await leerBloqueo();

    expect(bloqueo.failedLoginAttempts).toBe(0);
    expect(bloqueo.lockLevel).toBe(1);
    expect(bloqueo.lockedUntil).not.toBeNull();
    expect(bloqueo.lockedUntil?.getTime()).toBeGreaterThan(antes);
    expect(sesion.tickets).toHaveLength(0);
  });

  it('un login correcto reinicia contador, nivel y bloqueo en la base', TIEMPO_HOLGADO, async () => {
    // R27 — un par de fallos dejan rastro en la fila y el exito posterior lo borra entero.
    const { verificar, sesion } = montarLogin();

    await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA });
    await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA });

    expect((await leerBloqueo()).failedLoginAttempts).toBe(2);

    expect(await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA })).toEqual({
      ok: true,
    });

    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
    });
    expect(sesion.tickets).toHaveLength(1);
  });

  it('una cuenta bloqueada no entra ni con la contrasena correcta', TIEMPO_HOLGADO, async () => {
    // R24 — el caso que se olvida. Y R25 de paso: el intento durante el bloqueo no mueve
    // ninguna de las tres columnas, para que martillear la cuenta no alargue el bloqueo.
    const finDelBloqueo = new Date(Date.now() + 60_000);
    await prisma.user.update({
      where: { id: usuarioId },
      data: { failedLoginAttempts: 0, lockLevel: 1, lockedUntil: finDelBloqueo },
    });

    const { verificar, sesion } = montarLogin();

    const resultado = await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA });

    expect(resultado).toEqual({ ok: false });
    expect(sesion.tickets).toHaveLength(0);
    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 0,
      lockLevel: 1,
      lockedUntil: finDelBloqueo,
    });
  });

  // --- Intentos CONCURRENTES ---------------------------------------------------------------
  // Lanzar los intentos en paralelo es literalmente lo que hace un ataque de fuerza bruta:
  // nadie espera 110 ms de bcrypt entre intento e intento. Con la escritura absoluta anterior
  // los N intentos leian el mismo contador y lo dejaban todos en 1, asi que la cuenta no
  // llegaba nunca a 5 y el bloqueo de R22 no se disparaba jamas. Estos tres casos son los que
  // distinguen el registro condicional del que no lo es.

  it('intentos fallidos en paralelo se cuentan todos', TIEMPO_HOLGADO, async () => {
    // R22 — tres intentos simultaneos tienen que dejar el contador en 3, no en 1.
    const { verificar, sesion } = montarLogin();

    const resultados = await Promise.all([
      verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA }),
      verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA }),
      verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA }),
    ]);

    expect(resultados).toEqual([{ ok: false }, { ok: false }, { ok: false }]);
    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 3,
      lockLevel: 0,
      lockedUntil: null,
    });
    expect(sesion.tickets).toHaveLength(0);
  });

  it('cinco intentos fallidos en paralelo bloquean la cuenta', TIEMPO_HOLGADO, async () => {
    // R22, R23 — el quinto fallo consuma el bloqueo aunque los cinco salgan a la vez.
    const { verificar } = montarLogin();
    const antes = Date.now();

    await Promise.all(
      Array.from({ length: 5 }, () =>
        verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA }),
      ),
    );

    const bloqueo = await leerBloqueo();

    expect(bloqueo.failedLoginAttempts).toBe(0);
    expect(bloqueo.lockLevel).toBe(1);
    expect(bloqueo.lockedUntil).not.toBeNull();
    expect(bloqueo.lockedUntil?.getTime()).toBeGreaterThan(antes);
  });

  // --- El CAS no puede pisar un bloqueo VIVO (ABA) ------------------------------------------
  // El par `(failedAttempts, lockLevel)` NO identifica el estado de la fila: `(0, 1)` es tanto
  // un bloqueo recien consumado como ese mismo bloqueo ya caducado, y se vuelve a `(0, 1)` tras
  // un login correcto mas otros cinco fallos. Un intento que leyo la version caducada y llega
  // tarde casaria el predicado contra el bloqueo nuevo y lo borraria. Estos dos casos son los
  // que exigen que el `where` mire ademas `locked_until`, y por RANGO: `timestamptz(6)` guarda
  // microsegundos y un `Date` de JS solo milisegundos, asi que una igualdad seria fragil.

  it('un intento con estado obsoleto no puede borrar un bloqueo vigente', TIEMPO_HOLGADO, async () => {
    // R25, R30 — se llama al ADAPTADOR real, no al caso de uso: es el unico modo de fabricar la
    // carrera exacta (un intento que quedo con una copia vieja del estado durante su bcrypt).
    const finDelBloqueo = new Date(Date.now() + 60_000);
    await prisma.user.update({
      where: { id: usuarioId },
      data: { failedLoginAttempts: 0, lockLevel: 1, lockedUntil: finDelBloqueo },
    });

    // Lo que ese intento habria leido cuando el bloqueo ANTERIOR ya estaba caducado: mismos dos
    // enteros que la fila tiene ahora, distinto `locked_until`.
    const estadoObsoleto = {
      failedAttempts: 0,
      lockLevel: 1,
      lockedUntil: new Date(Date.now() - 60_000),
    };

    const aplico = await compareAndSetLoginAttempt(
      usuarioId,
      estadoObsoleto,
      // Un fallo calculado sobre esa copia vieja: anularia el bloqueo que hay ahora en la fila.
      { failedAttempts: 1, lockLevel: 1, lockedUntil: null },
      new Date(),
      // QC-78 R18: el estado de cuenta leido (la fila sigue `active`) y el que se escribiria.
      'active',
      null,
    );

    expect(aplico).toBe(false);
    // Las tres columnas intactas: el bloqueo sigue exactamente donde lo dejo la politica.
    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 0,
      lockLevel: 1,
      lockedUntil: finDelBloqueo,
    });
  });

  it('un fallo tras un bloqueo caducado si se registra', TIEMPO_HOLGADO, async () => {
    // R22, R26 — la otra cara del test anterior: exigir que no haya bloqueo VIGENTE no puede
    // cerrar el camino legitimo. La fila queda en `(0, 1, T_pasado)` —bloqueo cumplido— y el
    // siguiente fallo tiene que contar, empezando una cadena nueva sin perder el nivel.
    const bloqueoCumplido = new Date(Date.now() - 60_000);
    await prisma.user.update({
      where: { id: usuarioId },
      data: { failedLoginAttempts: 0, lockLevel: 1, lockedUntil: bloqueoCumplido },
    });

    const { verificar, sesion } = montarLogin();

    expect(await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA })).toEqual({
      ok: false,
    });

    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 1,
      lockLevel: 1,
      lockedUntil: null,
    });
    expect(sesion.tickets).toHaveLength(0);
  });

  it('fallos en paralelo sobre una cuenta bloqueada no la desbloquean', TIEMPO_HOLGADO, async () => {
    // R24, R25 — el mismo ABA pero de extremo a extremo, por el caso de uso y con cinco
    // intentos a la vez: el bloqueo tiene que sobrevivir y seguir siendo EL MISMO instante.
    const finDelBloqueo = new Date(Date.now() + 60_000);
    await prisma.user.update({
      where: { id: usuarioId },
      data: { failedLoginAttempts: 0, lockLevel: 1, lockedUntil: finDelBloqueo },
    });

    const { verificar, sesion } = montarLogin();

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA }),
      ),
    );

    expect(resultados.every((resultado) => resultado.ok === false)).toBe(true);
    expect(sesion.tickets).toHaveLength(0);

    const bloqueo = await leerBloqueo();
    expect(bloqueo.lockedUntil).toEqual(finDelBloqueo);
    expect(bloqueo.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(bloqueo.lockLevel).toBe(1);
    expect(bloqueo.failedLoginAttempts).toBe(0);
  });

  it('intentos en paralelo durante el bloqueo no lo alargan', TIEMPO_HOLGADO, async () => {
    // R25 — martillear una cuenta ya bloqueada, en paralelo, no mueve ninguna de las tres
    // columnas: ni contador, ni nivel, ni fin del bloqueo.
    const finDelBloqueo = new Date(Date.now() + 60_000);
    await prisma.user.update({
      where: { id: usuarioId },
      data: { failedLoginAttempts: 0, lockLevel: 1, lockedUntil: finDelBloqueo },
    });

    const { verificar, sesion } = montarLogin();

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA }),
      ),
    );

    expect(resultados.every((resultado) => resultado.ok === false)).toBe(true);
    expect(sesion.tickets).toHaveLength(0);
    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 0,
      lockLevel: 1,
      lockedUntil: finDelBloqueo,
    });
  });

  // --- QC-78: el estado de cuenta, contra la base ------------------------------------------

  // R18 — el CAS incluye el estado de cuenta LEIDO en su predicado. Se fabrica la carrera exacta
  // llamando al ADAPTADOR: se lee la fila, alguien la cambia por fuera -un administrador la
  // desactiva mientras corria bcrypt- y la escritura que llega tarde ya no puede aplicar. Solo
  // se puede demostrar contra Postgres: lo que se mide es el `where` del `updateMany`.
  it('el CAS no aplica si el estado de cuenta cambio entre la lectura y la escritura', TIEMPO_HOLGADO, async () => {
    // Lo que el intento leyo: la fila entera, con su estado.
    const leido = await findActiveByUsername(nombreDeUsuario);
    expect(leido?.accountStatus).toBe('active');

    // Y lo que pasa mientras corre bcrypt: otro camino cambia el estado.
    await prisma.user.update({ where: { id: usuarioId }, data: { accountStatus: 'inactive' } });

    const aplico = await compareAndSetLoginAttempt(
      usuarioId,
      { failedAttempts: 0, lockLevel: 0, lockedUntil: null },
      { failedAttempts: 1, lockLevel: 0, lockedUntil: null },
      new Date(),
      // El estado ESPERADO es el que se leyo, que ya no es el que hay.
      leido?.accountStatus ?? 'active',
      null,
    );

    expect(aplico).toBe(false);
    // La fila no se movio: ni el contador del intento, ni el estado que puso el otro camino.
    expect(await leerBloqueo()).toEqual({
      failedLoginAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
    });
    expect((await leerEstado()).accountStatus).toBe('inactive');
  });

  // R13 — el bloqueo por intentos se escribe COMO ESTADO, en la misma operacion, con el instante
  // del intento y SIN autor. Que la columna de autor quede vacia («lo hizo el sistema») solo se
  // puede afirmar mirando la fila.
  it('el quinto fallo deja la fila en blocked, con plazo y sin autor', TIEMPO_HOLGADO, async () => {
    const { verificar, sesion } = montarLogin();
    const antes = Date.now();

    for (let intento = 0; intento < 5; intento += 1) {
      expect(await verificar({ username: nombreDeUsuario, password: CLAVE_INCORRECTA })).toEqual({
        ok: false,
      });
    }

    const bloqueo = await leerBloqueo();
    const estado = await leerEstado();

    // El plazo sigue estando: `blocked` CON plazo es el bloqueo automatico, que caduca solo. La
    // combinacion `blocked` sin plazo significa otra cosa (R9) y aqui no puede aparecer (R15).
    expect(bloqueo.lockedUntil).not.toBeNull();
    expect(bloqueo.lockedUntil?.getTime()).toBeGreaterThan(antes);
    expect(estado.accountStatus).toBe('blocked');
    // El rastro: el instante del intento...
    expect(estado.accountStatusChangedAt.getTime()).toBeGreaterThanOrEqual(antes);
    // ...y vacio en el autor, que es como QC-65 dice «lo hizo el sistema».
    expect(estado.accountStatusChangedBy).toBeNull();
    expect(sesion.tickets).toHaveLength(0);
  });

  // R1 — y la consecuencia: esa cuenta ya no entra ni con la contrasena correcta, sin que nadie
  // mire `locked_until` desde el dominio. Se prueba con el estado puesto a mano, que es lo que
  // hara QC-66 cuando un administrador desactive a alguien.
  it('una cuenta pending o inactive no entra contra la base ni con la contrasena correcta', TIEMPO_HOLGADO, async () => {
    for (const estado of ['pending', 'inactive'] as const) {
      await prisma.user.update({ where: { id: usuarioId }, data: { accountStatus: estado } });

      const { verificar, sesion } = montarLogin();

      expect(await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA })).toEqual({
        ok: false,
      });
      expect(sesion.tickets).toHaveLength(0);
      // R6: y no se movio ni una columna de la fila.
      expect(await leerBloqueo()).toEqual({
        failedLoginAttempts: 0,
        lockLevel: 0,
        lockedUntil: null,
      });
    }
  });
});
