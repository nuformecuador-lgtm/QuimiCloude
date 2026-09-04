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
 * QC-47 (R15, R16, R17) — el rol ya NO sale de `users.role_id`, que dejo de existir, sino de la
 * PERTENENCIA. Por eso el fixture crea ademas una empresa y una fila de `memberships`, y hay dos
 * casos nuevos: uno que mueve el rol EN LA PERTENENCIA y comprueba que el login resuelve el
 * nuevo (R15, R16), y otro con un usuario vivo SIN ninguna pertenencia, que tiene que tratarse
 * como no encontrado (R17). El `$queryRaw` con el doble `JOIN` solo se puede probar de verdad
 * contra Postgres: no esta tipado contra el cliente, asi que el compilador no lo vigila.
 *
 * SIN SEED (R21) — el rol y el usuario los crea este archivo con un `username` aleatorio
 * (`qc7_login_<uuid>`); el correo y el documento tambien llevan el uuid para no chocar con los
 * indices unicos parciales. La unica fila ajena de la que depende es el tipo de documento
 * `CC`, que inserta la propia migracion de QC-4. QC-6 (seed) no interviene: si algun dia
 * cambia sus datos, este test no se entera.
 *
 * ORDEN — cada `it` arranca con el estado de bloqueo a cero (`beforeEach`), asi que el orden
 * de los tests no importa y el archivo pasa igual corrido dos veces seguidas.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createVerifyCredentials,
  DOCUMENT_TYPE_CC,
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

let usuarioId = '';
let rolId = '';
/** Segundo rol, para mover el rol DE LA PERTENENCIA y ver que el login resuelve el nuevo (R15). */
let rolAlternativoId = '';
let empresaId = '';
/** Usuario vivo y con la clave correcta, pero SIN ninguna pertenencia (R17). */
let usuarioSinPertenenciaId = '';
const sufijoSinPertenencia = randomUUID();
const nombreSinPertenencia = `qc47_sin_pertenencia_${sufijoSinPertenencia}`;

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
  });
  return { verificar, sesion };
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
    data: { name: `qc47-login-alt-${sufijo}`, description: 'Rol alternativo de prueba de QC-47' },
    select: { id: true },
  });
  rolAlternativoId = rolAlternativo.id;

  // La empresa de la pertenencia: nombre propio de esta ejecucion para no chocar con
  // `companies_name_unique` ni con la empresa inicial del seed.
  const empresa = await prisma.company.create({
    data: { name: `QC-47 Login ${sufijo}`, nameNormalized: `qc47login${sufijo}` },
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
    },
    select: { id: true },
  });
  usuarioId = usuario.id;

  // QC-47 — el rol de esta persona vive AQUI, no en `users`.
  await prisma.membership.create({
    data: { userId: usuarioId, companyId: empresaId, roleId: rolId },
    select: { id: true },
  });

  // Segundo usuario, identico salvo por lo unico que importa: no tiene pertenencia (R17).
  const usuarioSinPertenencia = await prisma.user.create({
    data: {
      firstNames: 'Juan Carlos',
      lastNames: 'Rojas Diaz',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `qc47.sin.${sufijoSinPertenencia}@example.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: sufijoSinPertenencia.replaceAll('-', '').slice(0, 20),
      username: nombreSinPertenencia,
      passwordHash: await createPasswordHash(CLAVE_CORRECTA),
    },
    select: { id: true },
  });
  usuarioSinPertenenciaId = usuarioSinPertenencia.id;
}, 30_000);

afterAll(async () => {
  // El orden es el de las FK `RESTRICT`: primero las pertenencias, luego usuarios, y empresa y
  // roles al final. Va en `finally` encadenado para que se limpie aunque un borrado falle:
  // dejar filas huerfanas convertiria el segundo pase del archivo en un falso rojo.
  try {
    await prisma.membership.deleteMany({ where: { userId: usuarioId } });
  } finally {
    try {
      await prisma.user.deleteMany({
        where: { id: { in: [usuarioId, usuarioSinPertenenciaId] } },
      });
    } finally {
      await prisma.company.deleteMany({ where: { id: empresaId } });
      await prisma.role.deleteMany({ where: { id: { in: [rolId, rolAlternativoId] } } });
      await prisma.$disconnect();
    }
  }
});

beforeEach(async () => {
  await prisma.user.update({
    where: { id: usuarioId },
    data: { failedLoginAttempts: 0, lockLevel: 0, lockedUntil: null },
  });
});

describe('login contra Postgres real', () => {
  // QC-9 R26 — el rol que acaba FIRMADO en la cookie es el que la base tiene en ese instante.
  //
  // Se comprueba de extremo a extremo y contra Postgres: el rol se lee de la fila con Prisma, el
  // login corre con el adaptador real (`findActiveByUsername`, `$queryRaw` con el doble `JOIN`
  // `users -> memberships -> roles`), y
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

  // --- QC-47: el rol sale de la PERTENENCIA ------------------------------------------------

  it('el rol resuelto es el de la pertenencia, y cambia con ella', TIEMPO_HOLGADO, async () => {
    // R15, R16 — `users.role_id` ya no existe: la unica fuente del rol es `memberships.role_id`.
    // Se mueve el rol EN LA PERTENENCIA (no en el usuario, que ya no tiene columna) y el
    // adaptador real tiene que devolver el nuevo en la misma consulta que autentica. Si alguien
    // quitara el `JOIN memberships` o volviera a leer el rol de otro sitio, esto se pone rojo.
    expect((await findActiveByUsername(nombreDeUsuario))?.roleName).toBe(`qc7-login-${sufijo}`);

    await prisma.membership.updateMany({
      where: { userId: usuarioId, companyId: empresaId },
      data: { roleId: rolAlternativoId },
    });

    try {
      expect((await findActiveByUsername(nombreDeUsuario))?.roleName).toBe(
        `qc47-login-alt-${sufijo}`,
      );

      // Y de extremo a extremo: el ticket que emite el login lleva ese mismo rol.
      const { verificar, sesion } = montarLogin();
      expect(await verificar({ username: nombreDeUsuario, password: CLAVE_CORRECTA })).toEqual({
        ok: true,
      });
      expect(sesion.tickets[0]?.roleName).toBe(`qc47-login-alt-${sufijo}`);
    } finally {
      await prisma.membership.updateMany({
        where: { userId: usuarioId, companyId: empresaId },
        data: { roleId: rolId },
      });
    }
  });

  it('un usuario vivo sin ninguna pertenencia no se encuentra ni entra', TIEMPO_HOLGADO, async () => {
    // R17 — el `INNER JOIN memberships` es lo que lo garantiza: sin pertenencia no hay fila que
    // devolver, asi que no se emite sesion con un rol inventado ni con un rol vacio. El usuario
    // esta vivo (`deleted_at IS NULL`) y la contrasena es la correcta: lo unico que le falta es
    // la pertenencia.
    expect(
      await prisma.user.count({ where: { id: usuarioSinPertenenciaId, deletedAt: null } }),
    ).toBe(1);
    expect(await prisma.membership.count({ where: { userId: usuarioSinPertenenciaId } })).toBe(0);

    expect(await findActiveByUsername(nombreSinPertenencia)).toBeNull();

    const { verificar, sesion } = montarLogin();
    const resultado = await verificar({
      username: nombreSinPertenencia,
      password: CLAVE_CORRECTA,
    });

    expect(resultado).toEqual({ ok: false });
    expect(sesion.tickets).toHaveLength(0);
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
});
