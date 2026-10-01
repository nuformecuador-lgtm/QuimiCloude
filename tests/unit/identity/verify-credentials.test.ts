// T4 — El caso de uso de autenticacion, entero y con puertos falsos (`design.md > 2` y `> 7`).
// Sin base de datos, sin bcrypt real y sin Next: lo que se prueba aqui es la DECISION, y la
// decision vive en el dominio. Los adaptadores reales tienen su propia tanda (T5, T8).

import { readFileSync } from 'node:fs';

import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  LOCK_DURATIONS_MS,
  nextLockState,
  type AccountLockState,
} from '@/lib/modules/identity/domain/account-lock';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import { clearedLockState } from '@/lib/modules/identity/domain/effective-account-status';
import type { SessionTicket } from '@/lib/modules/identity/domain/session';
import { evaluateCredentialRules } from '@/lib/modules/identity/domain/credential-policy';
import {
  DECOY_SECRET,
  createVerifyCredentials,
} from '@/lib/modules/identity/domain/verify-credentials';
import type { AuthenticatableUser } from '@/lib/modules/identity/ports/user-credentials-reader';

const CONTRASENA_CORRECTA = 'secreto';

/**
 * QC-19 T8 — marcador evidentemente ficticio de una credencial GUARDADA que no cumple la
 * politica de QC-19 (sin mayuscula, sin digito, sin simbolo). No es la credencial de
 * nadie: existe para demostrar R17, que quien ya la tiene sigue entrando.
 */
const CREDENCIAL_GUARDADA_QUE_NO_CUMPLE = 'clavevieja';

/** Fuente de `verify-credentials.ts` como TEXTO: R17 tambien es una propiedad del fuente. */
const FUENTE_DE_VERIFY_CREDENTIALS = readFileSync(
  new URL('../../../lib/modules/identity/domain/verify-credentials.ts', import.meta.url),
  'utf8',
);

/** Hash de mentira, deterministico y legible: basta para distinguir un hash de otro. */
function hashDe(texto: string): string {
  return `hash:${texto}`;
}

const SIN_BLOQUEO: AccountLockState = { failedAttempts: 0, lockLevel: 0, lockedUntil: null };

/** QC-9 R26: el rol lo trae el PUERTO desde la base, y termina firmado dentro de la cookie. */
const ROL_EN_LA_BASE = 'Administrador';

/** QC-48 R1, R2: la empresa la trae el mismo PUERTO desde la ficha de la persona. */
const EMPRESA_EN_LA_BASE = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';

const USUARIO: AuthenticatableUser = {
  id: 'usuario-1',
  passwordHash: hashDe(CONTRASENA_CORRECTA),
  roleName: ROL_EN_LA_BASE,
  companyId: EMPRESA_EN_LA_BASE,
  // QC-48 R3: `null` es «la empresa sigue viva» (QC-47 R6). El caso normal.
  companyDeletedAt: null,
  // QC-78 R1: el estado ALMACENADO. `active` es el unico que entra, y es el caso normal de
  // todos los fixtures de este archivo que esperan un login que funciona.
  accountStatus: 'active',
  ...SIN_BLOQUEO,
};

/** QC-78 R1 — la misma persona con el estado que sea, para los cortes de esta ficha. */
function conEstado(accountStatus: UserAccountStatus): AuthenticatableUser {
  return { ...USUARIO, accountStatus };
}

/** QC-48 R3: la misma persona, pero su empresa esta dada de baja. */
const USUARIO_DE_EMPRESA_MUERTA: AuthenticatableUser = {
  ...USUARIO,
  companyDeletedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** Un instante futuro: la cuenta esta bloqueada mientras el reloj no lo alcance. */
function bloqueadaHasta(): Date {
  return new Date(Date.now() + 60_000);
}

/**
 * Puertos falsos escritos aqui mismo: el caso de uso no sabe si al otro lado hay Postgres o
 * un `Map`, que es justo lo que se quiere demostrar (R17).
 */
function montar(usuarios: readonly AuthenticatableUser[] = [USUARIO], nombre = 'admin') {
  const encontrables = new Map(usuarios.map((usuario) => [nombre, usuario]));

  const users = {
    findActiveByUsername: vi.fn(async (username: string) => encontrables.get(username) ?? null),
  };
  // Los dobles se tipan con la firma del puerto: sin eso, las aserciones sobre los
  // argumentos recibidos no las vigilaria el compilador.
  const attempts = {
    // Por defecto el CAS gana la carrera: el caso normal es que nadie compita.
    compareAndSet:
      vi.fn<
        (
          userId: string,
          esperado: AccountLockState,
          siguiente: AccountLockState,
          now: Date,
          // QC-78 R18: el estado de cuenta LEIDO, que entra en el predicado de la escritura.
          estadoCuentaEsperado: UserAccountStatus,
          // QC-78 R13, R17: el que corresponde escribir; `null` = no tocar la columna.
          estadoCuenta: UserAccountStatus | null,
        ) => Promise<boolean>
      >(async () => true),
    set: vi.fn<
      (
        userId: string,
        estado: AccountLockState,
        estadoCuenta: UserAccountStatus | null,
      ) => Promise<void>
    >(async () => {}),
  };
  const hasher = {
    hash: vi.fn(async (texto: string) => hashDe(texto)),
    // Verificacion de mentira, pero exacta: distingue mayusculas y no recorta espacios.
    verify: vi.fn(async (texto: string, guardado: string) => guardado === hashDe(texto)),
  };
  const session = {
    startSession: vi.fn<(ticket: SessionTicket) => Promise<void>>(async () => {}),
  };
  // QC-23 R2: la fabrica del `sid`. Doble contador, no aleatorio: dos emisiones seguidas tienen
  // que producir identificadores distintos, y con un contador eso se puede AFIRMAR.
  let emitidos = 0;
  const ids = {
    newSessionId: vi.fn<() => string>(() => {
      emitidos += 1;
      return `00000000-0000-4000-8000-${String(emitidos).padStart(12, '0')}`;
    }),
  };

  return {
    users,
    attempts,
    hasher,
    session,
    ids,
    verifyCredentials: createVerifyCredentials({ users, attempts, hasher, session, ids }),
  };
}

describe('verificacion de credenciales', () => {
  // R1
  it('acepta usuario activo con contrasena correcta', async () => {
    const { verifyCredentials, session } = montar();

    const resultado = await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(resultado).toEqual({ ok: true });
    expect(session.startSession).toHaveBeenCalledTimes(1);
    expect(session.startSession.mock.calls[0]?.[0]).toMatchObject({ userId: USUARIO.id });
  });

  // QC-9 R26 — el rol del ticket sale de la BASE (lo que devolvio el puerto), nunca de la
  // entrada. `LoginInput` solo tiene `username` y `password`, asi que se ataca por el unico
  // sitio por donde un cliente podria intentar colarlo: campos de mas en el `FormData` que
  // llegan hasta aqui. El ticket tiene que seguir llevando el rol de la fila.
  it('el ticket emitido lleva el rol leido de la base, no uno recibido del cliente', async () => {
    const { verifyCredentials, session } = montar();

    const resultado = await verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
      // Un cliente malicioso intentando ascenderse: el caso de uso ni lo mira.
      role: 'Superadministrador',
      roleName: 'Superadministrador',
    } as never);

    expect(resultado).toEqual({ ok: true });
    expect(session.startSession.mock.calls[0]?.[0]).toMatchObject({
      userId: USUARIO.id,
      roleName: ROL_EN_LA_BASE,
    });
  });

  // QC-9 R26 — y si la fila dice otra cosa, el ticket dice otra cosa: el rol no esta fijado
  // en el codigo, viene de donde tiene que venir.
  it('si la base devuelve otro rol, el ticket lleva ese otro rol', async () => {
    const operador: AuthenticatableUser = { ...USUARIO, roleName: 'Operador' };
    const { verifyCredentials, session } = montar([operador]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(session.startSession.mock.calls[0]?.[0]).toMatchObject({ roleName: 'Operador' });
  });

  // QC-48 R1, R2 — la empresa del ticket sale de la FICHA que devolvio el puerto, nunca de la
  // entrada. Mismo ataque que el del rol: campos de mas colados en el `FormData` que llegan
  // hasta aqui. El caso de uso ni los mira, porque `LoginInput` no los tiene.
  it('el ticket emitido lleva la empresa leida de la base, no una recibida del cliente', async () => {
    const { verifyCredentials, session } = montar();

    const resultado = await verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
      // Un cliente intentando mudarse de empresa: no existe tal entrada.
      cid: '00000000-0000-4000-8000-000000000000',
      companyId: '00000000-0000-4000-8000-000000000000',
    } as never);

    expect(resultado).toEqual({ ok: true });
    expect(session.startSession.mock.calls[0]?.[0]).toMatchObject({
      userId: USUARIO.id,
      companyId: EMPRESA_EN_LA_BASE,
    });
  });

  // QC-48 R1, R5 — y si la fila dice otra empresa, el ticket dice esa otra: no hay empresa
  // fijada en el codigo ni empresa por defecto, que seria una empresa inventada.
  it('si la base devuelve otra empresa, el ticket lleva esa otra', async () => {
    const otraEmpresa = 'b9d4e1a7-3c25-4f80-9a6b-2e7d1c058f34';
    const { verifyCredentials, session } = montar([{ ...USUARIO, companyId: otraEmpresa }]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(session.startSession.mock.calls[0]?.[0]).toMatchObject({ companyId: otraEmpresa });
  });

  // QC-48 R3 — credenciales CORRECTAS y empresa dada de baja: no entra, y el resultado es
  // exactamente el mismo objeto que devuelve una contrasena incorrecta. No `toEqual`: `toBe`,
  // porque el rechazo compartido y congelado es justamente lo que impide que este camino se
  // distinga de los demas por un campo de mas.
  it('una empresa dada de baja devuelve el mismo objeto de rechazo que una contrasena incorrecta', async () => {
    const empresaMuerta = montar([USUARIO_DE_EMPRESA_MUERTA]);
    const normal = montar();

    const porEmpresa = await empresaMuerta.verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
    });
    const porContrasena = await normal.verifyCredentials({
      username: 'admin',
      password: 'incorrecta',
    });

    expect(porEmpresa).toEqual({ ok: false });
    expect(porEmpresa).toBe(porContrasena);
    expect(empresaMuerta.session.startSession).not.toHaveBeenCalled();
  });

  // QC-48 R3 — y ese camino NO ESCRIBE NADA: ni registra el fallo (la credencial era buena, y
  // bloquear a alguien por una decision administrativa seria un castigo) ni reinicia los
  // contadores (no hubo login).
  it('una empresa dada de baja no escribe nada ni emite sesion', async () => {
    const { verifyCredentials, attempts, session } = montar([USUARIO_DE_EMPRESA_MUERTA]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(attempts.set).not.toHaveBeenCalled();
    expect(attempts.compareAndSet).not.toHaveBeenCalled();
    expect(session.startSession).not.toHaveBeenCalled();
  });

  // QC-48 R4 — exactamente una verificacion de hash tambien aqui. Si el corte fuera antes del
  // hash, este caso respondaria en microsegundos y el tiempo delataria que la cuenta existe y
  // que su empresa esta dada de baja.
  it('el camino de la empresa dada de baja verifica el hash una vez, igual que los otros', async () => {
    const { verifyCredentials, hasher } = montar([USUARIO_DE_EMPRESA_MUERTA]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(hasher.verify.mock.calls[0]?.[1]).toBe(USUARIO.passwordHash);
  });

  // QC-48 R3 — la otra cara: el corte va DESPUES del `!correcta`, asi que una contrasena mala
  // sobre una empresa dada de baja SI cuenta para el bloqueo. Si el corte fuera antes, dar de
  // baja una empresa seria un modo de desactivar el contador de intentos de sus usuarios.
  it('una contrasena incorrecta sobre una empresa dada de baja si registra el fallo', async () => {
    const { verifyCredentials, attempts } = montar([USUARIO_DE_EMPRESA_MUERTA]);

    const resultado = await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    expect(resultado).toEqual({ ok: false });
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    expect(attempts.compareAndSet.mock.calls[0]?.[0]).toBe(USUARIO.id);
  });

  // R2
  it('usuario inexistente devuelve el resultado generico', async () => {
    const { verifyCredentials } = montar();

    await expect(
      verifyCredentials({ username: 'no.existe', password: CONTRASENA_CORRECTA }),
    ).resolves.toEqual({ ok: false });
  });

  // R3
  it('contrasena incorrecta devuelve un resultado indistinguible del de usuario inexistente', async () => {
    const { verifyCredentials } = montar();

    const inexistente = await verifyCredentials({ username: 'no.existe', password: 'lo-que-sea' });
    const contrasenaMala = await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    expect(contrasenaMala).toEqual(inexistente);
  });

  // R4
  it('el usuario no distingue mayusculas ni espacios, la contrasena si', async () => {
    const { verifyCredentials, users } = montar();

    const conRuido = await verifyCredentials({
      username: '  ADMIN ',
      password: CONTRASENA_CORRECTA,
    });

    expect(conRuido).toEqual({ ok: true });
    expect(users.findActiveByUsername).toHaveBeenCalledWith('admin');

    // La contrasena si es exacta: 'Secreto' no vale por 'secreto'.
    await expect(verifyCredentials({ username: 'admin', password: 'Secreto' })).resolves.toEqual({
      ok: false,
    });
  });

  // R5
  it('un usuario borrado no autentica', async () => {
    // El puerto solo devuelve usuarios no borrados: para el dominio, un borrado es un `null`.
    const { verifyCredentials, session } = montar([]);

    await expect(
      verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }),
    ).resolves.toEqual({ ok: false });
    expect(session.startSession).not.toHaveBeenCalled();
  });

  // R6
  it('verifica un hash señuelo cuando el usuario no existe', async () => {
    const conUsuario = montar();
    await conUsuario.verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });
    expect(conUsuario.hasher.verify).toHaveBeenCalledTimes(1);

    const sinUsuario = montar([]);
    await sinUsuario.verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(sinUsuario.hasher.verify).toHaveBeenCalledTimes(1);
    expect(sinUsuario.hasher.verify.mock.calls[0]?.[1]).toBe(hashDe(DECOY_SECRET));
    expect(sinUsuario.hasher.verify.mock.calls[0]?.[1]).not.toBe(USUARIO.passwordHash);
  });

  // R7
  it('el señuelo se produce con el hasher del sistema y se calcula una sola vez', async () => {
    const { verifyCredentials, hasher } = montar([]);

    await verifyCredentials({ username: 'no.existe', password: 'a' });
    await verifyCredentials({ username: 'tampoco', password: 'b' });
    await verifyCredentials({ username: 'ni.este', password: 'c' });

    // Producido con el hasher del sistema (hereda su coste), no con un literal a mano...
    expect(hasher.hash).toHaveBeenCalledWith(DECOY_SECRET);
    // ...y cacheado en el closure: tres intentos, un solo calculo.
    expect(hasher.hash).toHaveBeenCalledTimes(1);
  });

  // R8
  it('entrada invalida no toca ningun puerto', async () => {
    const { verifyCredentials, users, hasher, session } = montar();
    // El unico `hash` que ya ocurrio es el calentamiento del senuelo, que pasa al CONSTRUIR el
    // caso de uso y no en esta invocacion. Se descuenta para que la asercion siga siendo
    // "esta entrada no llamo a ningun puerto", que es lo que dice R8.
    hasher.hash.mockClear();

    const vacia = await verifyCredentials({ username: '', password: '' });
    const demasiadoLarga = await verifyCredentials({
      username: 'admin',
      password: 'x'.repeat(65),
    });

    expect(vacia).toEqual({ ok: false });
    expect(demasiadoLarga).toEqual({ ok: false });
    expect(users.findActiveByUsername).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(hasher.verify).not.toHaveBeenCalled();
    expect(session.startSession).not.toHaveBeenCalled();
  });

  // R14
  it('ningun fallo emite sesion', async () => {
    const { verifyCredentials, session } = montar();
    const bloqueado = montar([{ ...USUARIO, lockLevel: 1, lockedUntil: bloqueadaHasta() }]);

    await verifyCredentials({ username: 'no.existe', password: CONTRASENA_CORRECTA });
    await verifyCredentials({ username: 'admin', password: 'incorrecta' });
    await verifyCredentials({ username: '', password: '' });
    await bloqueado.verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(session.startSession).not.toHaveBeenCalled();
    expect(bloqueado.session.startSession).not.toHaveBeenCalled();
  });

  // R17
  it('el caso de uso se construye con puertos', async () => {
    const { verifyCredentials, users, attempts, hasher, session } = montar();

    // Detras no hay nada real, solo dobles. Si el dominio eligiera su implementacion
    // concreta, este test no podria existir sin base de datos ni bcrypt.
    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(users.findActiveByUsername).toHaveBeenCalledTimes(1);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(attempts.set).toHaveBeenCalledTimes(1);
    expect(session.startSession).toHaveBeenCalledTimes(1);
  });

  // R24 — el caso que se olvida: bloqueada CON la contrasena correcta.
  it('una cuenta bloqueada no entra ni con la contrasena correcta', async () => {
    const bloqueado: AuthenticatableUser = {
      ...USUARIO,
      failedAttempts: 0,
      lockLevel: 1,
      lockedUntil: bloqueadaHasta(),
    };
    const { verifyCredentials, session } = montar([bloqueado]);

    await expect(
      verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }),
    ).resolves.toEqual({ ok: false });
    expect(session.startSession).not.toHaveBeenCalled();
  });

  // R25
  it('un intento durante el bloqueo no escribe nada', async () => {
    const bloqueado: AuthenticatableUser = {
      ...USUARIO,
      failedAttempts: 3,
      lockLevel: 2,
      lockedUntil: bloqueadaHasta(),
    };
    const { verifyCredentials, attempts } = montar([bloqueado]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });
    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Ni contador, ni nivel, ni fin de bloqueo: martillear una cuenta no la deja fuera mas
    // tiempo del que ya decidio la politica.
    expect(attempts.compareAndSet).not.toHaveBeenCalled();
    expect(attempts.set).not.toHaveBeenCalled();
  });

  // R28
  it('bloqueada, contrasena mala y usuario inexistente devuelven el mismo objeto', async () => {
    const bloqueado = montar([{ ...USUARIO, lockLevel: 1, lockedUntil: bloqueadaHasta() }]);
    const normal = montar();

    const porBloqueo = await bloqueado.verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
    });
    const porContrasena = await normal.verifyCredentials({
      username: 'admin',
      password: 'incorrecta',
    });
    const porInexistente = await normal.verifyCredentials({
      username: 'no.existe',
      password: CONTRASENA_CORRECTA,
    });

    expect(porBloqueo).toEqual(porContrasena);
    expect(porContrasena).toEqual(porInexistente);
  });

  // R29
  it('el camino bloqueado verifica el hash una vez, igual que los otros', async () => {
    const bloqueado = montar([{ ...USUARIO, lockLevel: 1, lockedUntil: bloqueadaHasta() }]);

    await bloqueado.verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    // Si el bloqueo cortara antes de verificar, ese camino responderia en microsegundos y el
    // tiempo de respuesta delataria que la cuenta existe y esta bloqueada.
    expect(bloqueado.hasher.verify).toHaveBeenCalledTimes(1);
    expect(bloqueado.hasher.verify.mock.calls[0]?.[1]).toBe(USUARIO.passwordHash);
  });

  // R27
  it('el exito reinicia contador, nivel y bloqueo', async () => {
    const conHistorial: AuthenticatableUser = {
      ...USUARIO,
      failedAttempts: 3,
      lockLevel: 2,
      // Bloqueo ya caducado: entra, y al entrar se limpia todo.
      lockedUntil: new Date(Date.now() - 60_000),
    };
    const { verifyCredentials, attempts, session } = montar([conHistorial]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    // El exito escribe INCONDICIONALMENTE: su estado es todo ceros y no depende del previo.
    expect(attempts.set).toHaveBeenCalledWith(
      USUARIO.id,
      { failedAttempts: 0, lockLevel: 0, lockedUntil: null },
      // QC-78 R17: la fila ya estaba `active`, asi que el estado no cambia y no se escribe.
      null,
    );
    expect(attempts.compareAndSet).not.toHaveBeenCalled();

    // El orden importa: primero se deja la cuenta limpia y solo despues se emite la sesion.
    const ordenRegistro = attempts.set.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const ordenSesion = session.startSession.mock.invocationCallOrder[0] ?? 0;
    expect(ordenRegistro).toBeLessThan(ordenSesion);
  });

  // R22 (integrado; la escalada en si vive en account-lock.test.ts)
  it('un fallo con usuario existente registra lo que calcula nextLockState', async () => {
    const conHistorial: AuthenticatableUser = {
      ...USUARIO,
      failedAttempts: 2,
      lockLevel: 1,
      lockedUntil: null,
    };
    const { verifyCredentials, attempts } = montar([conHistorial]);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Este fallo aun no consuma bloqueo, asi que el estado esperado no depende del instante
    // y se puede comparar contra la politica pura sin inyectar reloj.
    const esperado = nextLockState(conHistorial, 'failure', new Date());
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    // La escritura del fallo es condicional al estado leido: `esperado` es el estado visto y
    // `siguiente` el que calcula la politica.
    expect(attempts.compareAndSet).toHaveBeenCalledWith(
      USUARIO.id,
      expect.objectContaining({ failedAttempts: 2, lockLevel: 1, lockedUntil: null }),
      esperado,
      // El cuarto argumento es el instante del intento: sin el, la base no podria rechazar la
      // escritura cuando la fila esta bloqueada (ver el test del reloj, mas abajo).
      expect.any(Date),
      // QC-78 R18: el estado de cuenta leido va en el predicado. QC-78 R17: este fallo no
      // consuma bloqueo, asi que el estado no cambia y no se escribe.
      'active',
      null,
    );
  });

  // R22, R25 - el `now` que viaja al puerto es el MISMO reloj con el que el dominio decide.
  it('el reloj que recibe compareAndSet es el que uso la politica en esa invocacion', async () => {
    // El quinto fallo consuma el bloqueo, y `nextLockState` calcula su fin como `now + 1 min`.
    // Eso ata el cuarto argumento al reloj del dominio de forma comprobable: si el adaptador
    // recibiera un instante distinto (otro `new Date()`, o el del reintento), esta igualdad
    // exacta no se cumpliria y el `where` podria evaluar el bloqueo con un reloj que no es el
    // que decidio la escritura.
    const casiBloqueado: AuthenticatableUser = { ...USUARIO, failedAttempts: 4 };
    const { verifyCredentials, attempts } = montar([casiBloqueado]);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    const [, , siguiente, now] = attempts.compareAndSet.mock.calls[0] ?? [];
    const unMinuto = LOCK_DURATIONS_MS[0] ?? 0;
    expect(now).toBeInstanceOf(Date);
    expect(siguiente?.lockLevel).toBe(1);
    expect(siguiente?.lockedUntil?.getTime()).toBe((now?.getTime() ?? 0) + unMinuto);
  });

  // R31
  it('un usuario inexistente no provoca ninguna escritura', async () => {
    const { verifyCredentials, attempts } = montar([]);

    await verifyCredentials({ username: 'no.existe', password: CONTRASENA_CORRECTA });
    await verifyCredentials({ username: 'tampoco', password: 'otra' });

    // Una escritura por un usuario que no existe seria un oraculo de existencia por efecto
    // lateral: bastaria mirar la base para saber que nombres son reales.
    expect(attempts.compareAndSet).not.toHaveBeenCalled();
    expect(attempts.set).not.toHaveBeenCalled();
  });

  // R22 - el registro de un fallo es una lectura-modificacion-escritura con ~110 ms de bcrypt
  // en medio. Si la escritura fuera absoluta, N intentos en paralelo dejarian el contador en 1
  // y la cuenta no se bloquearia nunca. Estos tres casos cubren la carrera perdida.
  it('un registro que pierde la carrera se reintenta sobre el estado fresco', async () => {
    const visto: AuthenticatableUser = { ...USUARIO, failedAttempts: 0 };
    const fresco: AuthenticatableUser = { ...USUARIO, failedAttempts: 3 };
    const { verifyCredentials, users, attempts, hasher } = montar([visto]);

    attempts.compareAndSet.mockResolvedValueOnce(false);
    users.findActiveByUsername.mockResolvedValueOnce(visto).mockResolvedValueOnce(fresco);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Se releyo la cuenta antes de reintentar...
    expect(users.findActiveByUsername).toHaveBeenCalledTimes(2);
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(2);

    // ...y el reintento condiciona sobre el estado FRESCO, no sobre el que quedo obsoleto.
    const [, esperado, siguiente] = attempts.compareAndSet.mock.calls[1] ?? [];
    expect(esperado).toMatchObject({ failedAttempts: 3, lockLevel: 0 });

    // El reloj es UNO por invocacion: los dos intentos de escritura reciben exactamente el
    // mismo `Date`, no dos lecturas distintas del reloj separadas por el reintento.
    const relojPrimero = attempts.compareAndSet.mock.calls[0]?.[3];
    const relojSegundo = attempts.compareAndSet.mock.calls[1]?.[3];
    expect(relojPrimero).toBeInstanceOf(Date);
    expect(relojSegundo).toBe(relojPrimero);
    // Y la politica se recalcula sobre ese estado fresco: 3 -> 4, no 0 -> 1.
    expect(siguiente).toEqual({ failedAttempts: 4, lockLevel: 0, lockedUntil: null });

    // El reintento no vuelve a pagar el hasher: sigue habiendo una verificacion por intento (R29).
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });

  // R25
  it('si la cuenta se bloquea mientras tanto, el reintento no escribe', async () => {
    const visto: AuthenticatableUser = { ...USUARIO, failedAttempts: 4 };
    const bloqueado: AuthenticatableUser = {
      ...USUARIO,
      failedAttempts: 0,
      lockLevel: 1,
      lockedUntil: bloqueadaHasta(),
    };
    const { verifyCredentials, attempts, users } = montar([visto]);

    attempts.compareAndSet.mockResolvedValueOnce(false);
    users.findActiveByUsername.mockResolvedValueOnce(visto).mockResolvedValueOnce(bloqueado);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Otro intento consumo el bloqueo mientras tanto: martillear una cuenta ya bloqueada no la
    // alarga ni sube su nivel, asi que el reintento sale sin escribir.
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    expect(attempts.set).not.toHaveBeenCalled();
  });

  // R31
  it('un usuario que desaparece entre el intento y el reintento no provoca escritura', async () => {
    const { verifyCredentials, attempts, users } = montar();

    attempts.compareAndSet.mockResolvedValueOnce(false);
    users.findActiveByUsername.mockResolvedValueOnce(USUARIO).mockResolvedValueOnce(null);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Borrado (o renombrado) entre medias: escribir de todos modos dejaria rastro de una
    // cuenta que para el login ya no existe.
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    expect(attempts.set).not.toHaveBeenCalled();
  });

  // R15 - ni la contrasena recibida ni el hash almacenado aparecen en ningun registro de
  // salida. Se ejercita con el hasher REAL y en los TRES caminos: el test equivalente del
  // adaptador de cookie solo pasa por el valor de la cookie, por la que ni contrasena ni hash
  // circulan nunca.
  it('no se registra la contrasena ni el hash en ninguno de los caminos', async () => {
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation(() => {}),
    );

    try {
      const CLAVE = 'clave-que-no-debe-aparecer-QC7';
      const hashReal = await createPasswordHash(CLAVE);
      const usuario: AuthenticatableUser = { ...USUARIO, passwordHash: hashReal };
      const verifyCredentials = createVerifyCredentials({
        users: {
          findActiveByUsername: (nombre) =>
            Promise.resolve(nombre === 'admin' ? usuario : null),
        },
        attempts: {
          compareAndSet: () => Promise.resolve(true),
          set: () => Promise.resolve(),
        },
        hasher: { hash: createPasswordHash, verify: verifyPasswordHash },
        session: { startSession: () => Promise.resolve() },
        ids: { newSessionId: () => '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44' },
      });

      await verifyCredentials({ username: 'admin', password: CLAVE });
      await verifyCredentials({ username: 'admin', password: 'otra-cosa' });
      await verifyCredentials({ username: 'no.existe', password: CLAVE });

      const escrito = espias.flatMap((espia) => espia.mock.calls.flat()).join(' ');

      expect(escrito).not.toContain(CLAVE);
      expect(escrito).not.toContain(hashReal);
      // Ni un trozo: el prefijo con la sal ya identifica la fila por si solo.
      expect(escrito).not.toContain(hashReal.slice(0, 29));
    } finally {
      for (const espia of espias) espia.mockRestore();
    }
  }, 30_000);
  // QC-19 R17 — la regresion que se olvida: la politica NO se aplica al entrar. El impulso
  // natural al anadir una politica es aplicarla en todas partes, y eso dejaria fuera a
  // quien ya tiene guardada una contrasena que no cumple (`QC-19 design.md > 10`).
  it('una contrasena guardada que no cumple la politica sigue autenticando', async () => {
    // Primero: que la credencial guardada NO cumple de verdad. Sin esto el test podria
    // pasar en verde con una credencial que si cumple, y no demostraria nada.
    const veredicto = evaluateCredentialRules(CREDENCIAL_GUARDADA_QUE_NO_CUMPLE);
    expect(veredicto.ok).toBe(false);
    expect(veredicto.unmet.length).toBeGreaterThan(0);

    const usuario: AuthenticatableUser = {
      ...USUARIO,
      passwordHash: hashDe(CREDENCIAL_GUARDADA_QUE_NO_CUMPLE),
    };
    const { verifyCredentials, session } = montar([usuario]);

    const resultado = await verifyCredentials({
      username: 'admin',
      password: CREDENCIAL_GUARDADA_QUE_NO_CUMPLE,
    });

    // Luego: entra con normalidad, exactamente igual que cualquier otro usuario.
    expect(resultado).toEqual({ ok: true });
    expect(session.startSession).toHaveBeenCalledTimes(1);
  });

  // QC-19 R17 — y no es que "de la casualidad" de que pase: el caso de uso ni siquiera
  // conoce la politica. Se afirma sobre las dependencias y sobre el fuente.
  it('verifyCredentials no recibe ni llama a la politica', () => {
    const { users, attempts, hasher, session, ids } = montar();
    const deps = { users, attempts, hasher, session, ids };

    // Se construye con EXACTAMENTE esos cinco puertos: ni uno mas. El quinto es `ids`, la
    // fabrica del identificador de sesion de QC-23 (R2); la politica sigue sin estar.
    const verifyCredentials = createVerifyCredentials(deps);
    expect(typeof verifyCredentials).toBe('function');
    expect(Object.keys(deps).sort()).toEqual(['attempts', 'hasher', 'ids', 'session', 'users']);

    // Y el fuente lo confirma: el tipo de dependencias declara esas cinco claves y el
    // archivo entero no menciona la politica por ningun nombre.
    expect(FUENTE_DE_VERIFY_CREDENTIALS.length).toBeGreaterThan(0);
    const bloqueDeDeps = /export type VerifyCredentialsDeps = \{([\s\S]*?)\};/.exec(
      FUENTE_DE_VERIFY_CREDENTIALS,
    );
    expect(bloqueDeDeps).not.toBeNull();
    const claves = [...(bloqueDeDeps?.[1] ?? '').matchAll(/readonly\s+([A-Za-z_$][\w$]*)\s*:/g)]
      .map((match) => match[1] as string)
      .sort();
    expect(claves).toEqual(['attempts', 'hasher', 'ids', 'session', 'users']);

    for (const rastro of [
      'checkCredentialPolicy',
      'evaluateCredentialRules',
      'createCredentialPolicy',
      'credential-policy',
      'CREDENTIAL_RULES',
    ]) {
      expect(FUENTE_DE_VERIFY_CREDENTIALS, rastro).not.toContain(rastro);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// QC-78 — EL ESTADO DE CUENTA MANDA EN EL LOGIN.
//
// Todo lo de aqui abajo se prueba con puertos falsos y objetos planos, que es donde vive la
// decision: el corte lo hace el dominio, no un `WHERE`. Los dobles registran QUE se invoco y con
// que argumentos, porque media ficha es «este camino NO escribe nada».
// ---------------------------------------------------------------------------------------------
describe('QC-78 — el estado de cuenta manda en el login', () => {
  /** Los tres estados que NO entran, cada uno por su motivo (R1). */
  const bloqueadaConPlazoVigente: AuthenticatableUser = {
    ...USUARIO,
    accountStatus: 'blocked',
    lockLevel: 1,
    lockedUntil: bloqueadaHasta(),
  };

  // R1, R4
  it.each([
    ['pending', conEstado('pending')],
    ['inactive', conEstado('inactive')],
    ['blocked con plazo vigente', bloqueadaConPlazoVigente],
  ] as const)(
    'una cuenta %s no entra ni con la contrasena correcta, y no se emite sesion',
    async (_nombre, usuario) => {
      const { verifyCredentials, session } = montar([usuario]);

      const resultado = await verifyCredentials({
        username: 'admin',
        password: CONTRASENA_CORRECTA,
      });

      expect(resultado).toEqual({ ok: false });
      // R4: ni con la credencial buena se emite sesion ni se escribe cookie.
      expect(session.startSession).not.toHaveBeenCalled();
    },
  );

  // R3 — la identidad REFERENCIAL, no la igualdad estructural: `toBe`, no `toEqual`.
  it('el rechazo por estado es la MISMA INSTANCIA que el de contrasena mala y el de usuario inexistente', async () => {
    const noActiva = montar([conEstado('inactive')]);
    const normal = montar();

    const porEstado = await noActiva.verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
    });
    const porContrasena = await normal.verifyCredentials({
      username: 'admin',
      password: 'incorrecta',
    });
    const porInexistente = await normal.verifyCredentials({
      username: 'no.existe',
      password: CONTRASENA_CORRECTA,
    });

    expect(porEstado).toBe(porContrasena);
    expect(porContrasena).toBe(porInexistente);
    // Y no lleva NI UN CAMPO de mas por el que distinguir los tres estados entre si ni del resto:
    // un `reason`, un codigo o un mensaje convertirian el login en un oraculo de existencia.
    expect(Object.keys(porEstado)).toEqual(['ok']);
  });

  // R3 — los TRES estados no-`active` devuelven tambien la misma instancia entre ellos.
  it('los tres estados no activos devuelven exactamente el mismo objeto', async () => {
    const resultados = await Promise.all(
      [conEstado('pending'), conEstado('inactive'), bloqueadaConPlazoVigente].map((usuario) =>
        montar([usuario]).verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }),
      ),
    );

    expect(resultados[0]).toBe(resultados[1]);
    expect(resultados[1]).toBe(resultados[2]);
  });

  // R2 — el conteo. Si el corte por estado se adelantara al hash, este numero seria 0.
  it.each([
    ['pending', conEstado('pending')],
    ['inactive', conEstado('inactive')],
    ['blocked con plazo vigente', bloqueadaConPlazoVigente],
    ['active', USUARIO],
  ] as const)('el camino %s verifica el hash exactamente una vez', async (_nombre, usuario) => {
    const { verifyCredentials, hasher } = montar([usuario]);

    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(hasher.verify.mock.calls[0]?.[1]).toBe(USUARIO.passwordHash);
  });

  // R2 — y el ORDEN, que es lo que el conteo por si solo no demuestra. Se congela la
  // verificacion de hash y se comprueba que el caso de uso NO ha respondido todavia: si el corte
  // por estado fuera antes, respondería en microsegundos sin esperar a bcrypt, y el tiempo de
  // respuesta delataria que esa cuenta existe y no esta activa.
  it('el corte por estado ocurre DESPUES de la verificacion de hash, no antes', async () => {
    let liberar: (correcta: boolean) => void = () => {};
    const hashEnCurso = new Promise<boolean>((resolve) => {
      liberar = resolve;
    });
    const { verifyCredentials, hasher } = montar([conEstado('inactive')]);
    hasher.verify.mockImplementationOnce(() => hashEnCurso);

    let respondio = false;
    const intento = verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }).then(
      (resultado) => {
        respondio = true;
        return resultado;
      },
    );

    // Se dejan correr las microtareas: lo unico que puede quedar pendiente es el hash.
    for (let vuelta = 0; vuelta < 20; vuelta += 1) await Promise.resolve();

    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(respondio).toBe(false);

    liberar(true);
    await expect(intento).resolves.toEqual({ ok: false });
    // Y sigue siendo UNA sola verificacion: el corte no la repite.
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });

  // R5, R6 — el camino que NO escribe nada. Es la diferencia deliberada con el corte de empresa
  // de QC-48, que va despues del `!correcta` y por tanto SI deja que el fallo cuente.
  it.each(['pending', 'inactive'] as const)(
    'una cuenta %s no escribe ninguna columna, ni con contrasena correcta ni con incorrecta',
    async (estado) => {
      const { verifyCredentials, attempts } = montar([conEstado(estado)]);

      await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });
      await verifyCredentials({ username: 'admin', password: 'incorrecta' });

      // Ni contador, ni nivel, ni plazo, ni estado, ni rastro: castigar a alguien por una
      // decision administrativa que no puede arreglar seria injusto, y la cuenta no entra igual.
      expect(attempts.compareAndSet).toHaveBeenCalledTimes(0);
      expect(attempts.set).toHaveBeenCalledTimes(0);
    },
  );

  // R13 — el quinto fallo consuma el bloqueo y ESCRIBE el estado, en la misma operacion.
  it('el quinto fallo escribe blocked junto con el plazo, y sin autor', async () => {
    const casiBloqueado: AuthenticatableUser = { ...USUARIO, failedAttempts: 4 };
    const { verifyCredentials, attempts } = montar([casiBloqueado]);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    const llamada = attempts.compareAndSet.mock.calls[0];
    // El TERCER argumento es el estado de bloqueo que calculo la politica: hay plazo.
    expect(llamada?.[2]?.lockLevel).toBe(1);
    expect(llamada?.[2]?.lockedUntil).toBeInstanceOf(Date);
    // Y el ULTIMO es el estado de cuenta que corresponde escribir: `blocked`, en la MISMA
    // operacion (R13), no en una segunda escritura.
    expect(llamada?.[5]).toBe('blocked');
    // SIN AUTOR: el puerto no recibe ninguno porque no lo hay -esto lo hace el sistema, no una
    // persona- y el adaptador deja `account_status_changed_by` vacio. Que la columna quede a
    // null se demuestra contra Postgres en `tests/integration/identity/login.int.test.ts`.
    expect(llamada).toHaveLength(6);
  });

  // R14 — la politica de escalada de QC-19 no cambia: los plazos siguen saliendo de
  // `LOCK_DURATIONS_MS` y de ella se DERIVA el estado, sin duplicar la politica.
  it.each([0, 1, 2, 3])(
    'el bloqueo desde el nivel %i conserva el plazo que declara LOCK_DURATIONS_MS',
    async (nivelPrevio) => {
      const casiBloqueado: AuthenticatableUser = {
        ...USUARIO,
        failedAttempts: 4,
        lockLevel: nivelPrevio,
      };
      const { verifyCredentials, attempts } = montar([casiBloqueado]);

      await verifyCredentials({ username: 'admin', password: 'incorrecta' });

      const [, , siguiente, now, , estadoCuenta] = attempts.compareAndSet.mock.calls[0] ?? [];
      expect(siguiente?.lockLevel).toBe(nivelPrevio + 1);
      expect(siguiente?.lockedUntil?.getTime()).toBe(
        (now?.getTime() ?? 0) + (LOCK_DURATIONS_MS[nivelPrevio] ?? -1),
      );
      expect(estadoCuenta).toBe('blocked');
    },
  );

  // R15 — la barrera contra la combinacion imposible. `blocked` + plazo vacio significa
  // «bloqueada por una persona» (R9) y no caduca jamas: ninguna escritura automatica puede
  // crearla por accidente.
  it('un fallo suelto sobre una fila blocked con el plazo ya vencido la devuelve a active', async () => {
    const bloqueoCumplido: AuthenticatableUser = {
      ...USUARIO,
      accountStatus: 'blocked',
      failedAttempts: 0,
      lockLevel: 1,
      lockedUntil: new Date(Date.now() - 60_000),
    };
    const { verifyCredentials, attempts } = montar([bloqueoCumplido]);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    const [, , siguiente, , estadoCuentaEsperado, estadoCuenta] =
      attempts.compareAndSet.mock.calls[0] ?? [];
    // El fallo no consuma bloqueo nuevo: el plazo queda vacio...
    expect(siguiente?.lockedUntil).toBeNull();
    // ...y por eso el estado tiene que volver a `active`, no quedarse en `blocked`.
    expect(estadoCuentaEsperado).toBe('blocked');
    expect(estadoCuenta).toBe('active');
    // La combinacion prohibida, dicha por su nombre: nunca `blocked` con el plazo vacio.
    expect(estadoCuenta === 'blocked' && siguiente?.lockedUntil === null).toBe(false);
  });

  // R16 — el ingreso correcto sobre un bloqueo ya cumplido.
  it('un login correcto sobre una cuenta blocked vencida reinicia contador y nivel y la deja active', async () => {
    const bloqueoCumplido: AuthenticatableUser = {
      ...USUARIO,
      accountStatus: 'blocked',
      failedAttempts: 3,
      lockLevel: 2,
      lockedUntil: new Date(Date.now() - 60_000),
    };
    const { verifyCredentials, attempts, session } = montar([bloqueoCumplido]);

    const resultado = await verifyCredentials({
      username: 'admin',
      password: CONTRASENA_CORRECTA,
    });

    expect(resultado).toEqual({ ok: true });
    expect(session.startSession).toHaveBeenCalledTimes(1);
    expect(attempts.set).toHaveBeenCalledWith(
      USUARIO.id,
      { failedAttempts: 0, lockLevel: 0, lockedUntil: null },
      'active',
    );
  });

  // R17 — la marca de ultimo cambio tiene que seguir significando «cambio real». Si cada intento
  // reescribiera la columna con el mismo valor, pasaria a significar «ultimo intento de login».
  it('no se escribe el estado cuando no cambia: ni en el exito ni en un fallo suelto', async () => {
    const { verifyCredentials, attempts } = montar();

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });
    await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(attempts.compareAndSet.mock.calls[0]?.[5]).toBeNull();
    expect(attempts.set.mock.calls[0]?.[2]).toBeNull();
  });

  // R18 — el estado leido entra en el predicado, y el reintento condiciona sobre el FRESCO.
  it('el CAS que pierde la carrera se recalcula sobre el estado de cuenta fresco', async () => {
    const visto: AuthenticatableUser = { ...USUARIO, failedAttempts: 0 };
    // Mientras corria bcrypt, la fila cambio de estado: la bloqueo la politica y el plazo ya
    // vencio. Sigue siendo efectivamente `active` (R8), asi que el registro continua.
    const fresco: AuthenticatableUser = {
      ...USUARIO,
      accountStatus: 'blocked',
      failedAttempts: 3,
      lockLevel: 1,
      lockedUntil: new Date(Date.now() - 60_000),
    };
    const { verifyCredentials, users, attempts } = montar([visto]);

    attempts.compareAndSet.mockResolvedValueOnce(false);
    users.findActiveByUsername.mockResolvedValueOnce(visto).mockResolvedValueOnce(fresco);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    expect(attempts.compareAndSet).toHaveBeenCalledTimes(2);
    // La primera vuelta condiciona sobre lo que leyo entonces...
    expect(attempts.compareAndSet.mock.calls[0]?.[4]).toBe('active');
    // ...y la segunda sobre lo que leyo AL RELEER, no sobre la copia que quedo obsoleta.
    expect(attempts.compareAndSet.mock.calls[1]?.[4]).toBe('blocked');
    // Y lo que se escribe se recalcula sobre ese estado fresco (R15).
    expect(attempts.compareAndSet.mock.calls[1]?.[5]).toBe('active');
    expect(attempts.compareAndSet.mock.calls[1]?.[1]).toMatchObject({
      failedAttempts: 3,
      lockLevel: 1,
    });
  });

  // R19 — y si al releer ya no esta efectivamente `active`, se abandona sin escribir mas.
  it.each([
    ['inactive', { ...USUARIO, accountStatus: 'inactive' } as AuthenticatableUser],
    [
      'blocked con plazo futuro',
      {
        ...USUARIO,
        accountStatus: 'blocked',
        lockLevel: 1,
        lockedUntil: bloqueadaHasta(),
      } as AuthenticatableUser,
    ],
  ])('si al releer la fila fresca esta %s, se abandona sin escribir', async (_nombre, fresco) => {
    const { verifyCredentials, users, attempts } = montar();

    attempts.compareAndSet.mockResolvedValueOnce(false);
    users.findActiveByUsername.mockResolvedValueOnce(USUARIO).mockResolvedValueOnce(fresco);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    // Se releyo, se vio que la cuenta ya no esta activa y no hubo segunda escritura: registrar
    // el intento pisaria una decision tomada por otro camino.
    expect(users.findActiveByUsername).toHaveBeenCalledTimes(2);
    expect(attempts.compareAndSet).toHaveBeenCalledTimes(1);
    expect(attempts.set).not.toHaveBeenCalled();
  });

  // R25 — el mecanismo del desbloqueo administrativo, visto desde el login: tras aplicarlo, el
  // siguiente fallo cuenta como el PRIMERO de una serie nueva. Sin limpiar contador y nivel, la
  // cuenta se volveria a bloquear al primer intento y con la duracion escalada del nivel viejo.
  it('tras clearedLockState el siguiente fallo cuenta como el primero y no rebloquea', async () => {
    const desbloqueada: AuthenticatableUser = {
      ...USUARIO,
      accountStatus: 'active',
      ...clearedLockState(),
    };
    const { verifyCredentials, attempts } = montar([desbloqueada]);

    await verifyCredentials({ username: 'admin', password: 'incorrecta' });

    const [, , siguiente, , , estadoCuenta] = attempts.compareAndSet.mock.calls[0] ?? [];
    expect(siguiente).toEqual({ failedAttempts: 1, lockLevel: 0, lockedUntil: null });
    // No vuelve a bloquear: ni plazo, ni estado que escribir.
    expect(estadoCuenta).toBeNull();
  });

  // -------------------------------------------------------------------------------------------
  // R5 — EL ORDEN, y por que este caso mira el FUENTE en vez del comportamiento.
  //
  // El review de F2.2 aplico la mutacion que R5 prohibe por su nombre —mover el corte por estado
  // DEBAJO del bloque que llama a `registrarFallo`, o sea «uniformizarlo» con el corte de empresa
  // de QC-48— y los 56 casos de este archivo siguieron VERDES. No fue un descuido de los tests:
  // es que esa mutacion **no tiene efecto observable**. `registrarFallo` lleva su propio corte por
  // estado efectivo al principio del bucle, calculado sobre los MISMOS valores (`visto` es
  // `usuario`), asi que con el orden invertido se entra en la funcion y se sale sin escribir. R6
  // —«no se escribe nada»— se conserva, y R6 es lo unico que los dobles pueden ver.
  //
  // O sea: R5 no es una propiedad del COMPORTAMIENTO, es una propiedad del ORDEN DEL CODIGO. Y una
  // propiedad del fuente se afirma sobre el fuente, que es lo que ya hace en este mismo archivo el
  // caso «verifyCredentials no recibe ni llama a la politica» (QC-19 R17). Escribir aqui un test
  // de comportamiento que no cae con la mutacion seria peor que no tener ninguno: daria por atado
  // lo que no lo esta.
  //
  // Lo que se fija es la SECUENCIA COMPLETA de los tres cortes, porque los tres son decisiones con
  // requisito y los tres son «faciles de arreglar» por accidente en una refactorizacion:
  //   hash (R2)  <  corte por estado (R5)  <  !correcta  <  corte de empresa (QC-48)
  // -------------------------------------------------------------------------------------------
  it('el corte por estado va DESPUES del hash y ANTES de registrar el fallo, y el de empresa despues', () => {
    // Cada ancla es una linea real del archivo. Si alguna deja de existir tal cual, el test cae
    // por el `toBeGreaterThan(-1)` en vez de pasar en vacio comparando dos `-1`.
    const anclas = {
      hash: 'const correcta = await deps.hasher.verify(',
      corteDeEstado: 'if (effectiveAccountStatus(usuario, now) !== ACTIVO) return REJECTED;',
      contrasenaMala: 'if (!correcta) {',
      registroDelFallo: 'await registrarFallo(usuario, usuarioNormalizado, now);',
      corteDeEmpresa: 'if (usuario.companyDeletedAt !== null) return REJECTED;',
    } as const;

    const posicion: Record<keyof typeof anclas, number> = {
      hash: -1,
      corteDeEstado: -1,
      contrasenaMala: -1,
      registroDelFallo: -1,
      corteDeEmpresa: -1,
    };

    for (const [nombre, ancla] of Object.entries(anclas) as [keyof typeof anclas, string][]) {
      const indice = FUENTE_DE_VERIFY_CREDENTIALS.indexOf(ancla);
      expect(indice, `el ancla \`${ancla}\` ya no existe en el fuente: actualiza este test`).toBeGreaterThan(-1);
      // Y aparece UNA sola vez: con dos copias, comparar posiciones no significaria nada.
      expect(
        FUENTE_DE_VERIFY_CREDENTIALS.indexOf(ancla, indice + 1),
        `el ancla \`${ancla}\` aparece mas de una vez`,
      ).toBe(-1);
      posicion[nombre] = indice;
    }

    // R2 — el hash se gasta ANTES de mirar el estado. Al reves, el rechazo por estado responderia
    // en microsegundos y el tiempo de respuesta delataria que esa cuenta existe (QC-7 R29).
    expect(
      posicion.hash,
      'el corte por estado NO puede ir antes de la verificacion de hash (R2)',
    ).toBeLessThan(posicion.corteDeEstado);

    // R5 — ESTA es la linea que la mutacion del review rompia. El corte por estado va antes del
    // `if (!correcta)`, o sea antes de que el camino de fallo pueda llegar a escribir: por eso
    // `pending` e `inactive` no suman intentos (R6).
    expect(
      posicion.corteDeEstado,
      'el corte por estado tiene que ir ANTES del `if (!correcta)` (R5): si se mueve debajo, ' +
        '`pending` e `inactive` entran en el camino de registro del intento fallido',
    ).toBeLessThan(posicion.contrasenaMala);
    expect(posicion.corteDeEstado).toBeLessThan(posicion.registroDelFallo);

    // La ASIMETRIA con QC-48, deliberada y anotada en el propio archivo: el corte de empresa va
    // DESPUES del `!correcta` para que una contrasena mala sobre una empresa muerta SI cuente.
    // Sin esta linea, «uniformizar» los dos cortes en la direccion contraria —subir el de
    // empresa— tampoco lo cazaria nadie.
    expect(
      posicion.contrasenaMala,
      'el corte de empresa tiene que seguir DESPUES del `if (!correcta)` (QC-48)',
    ).toBeLessThan(posicion.corteDeEmpresa);
  });
});

// ================================================================================================
// QC-161 — el login de quien no tiene empresa (el Maestro).
// ================================================================================================

describe('verificacion de credenciales — sin empresa (QC-161)', () => {
  const MAESTRO: AuthenticatableUser = {
    ...USUARIO,
    id: 'maestro-1',
    roleName: 'Maestro',
    companyId: null,
    companyDeletedAt: null,
  };

  it('QC-161 R30: sin empresa y con credenciales correctas emite un ticket con companyId null', async () => {
    const { verifyCredentials, session, hasher } = montar([MAESTRO]);

    const resultado = await verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA });

    expect(resultado).toEqual({ ok: true });
    expect(session.startSession).toHaveBeenCalledTimes(1);
    const ticket = session.startSession.mock.calls[0]?.[0];
    expect(ticket).toMatchObject({ userId: MAESTRO.id, roleName: 'Maestro' });
    // `null` explicito, no ausente ni una empresa inventada.
    expect(ticket).toHaveProperty('companyId', null);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });

  it('QC-161 R30: sin empresa, una contrasena incorrecta se rechaza con el mismo objeto y cuenta el fallo', async () => {
    const maestro = montar([MAESTRO]);
    const normal = montar();

    const r1 = await maestro.verifyCredentials({ username: 'admin', password: 'incorrecta' });
    const r2 = await normal.verifyCredentials({ username: 'admin', password: 'incorrecta' });

    expect(r1).toBe(r2);
    expect(maestro.session.startSession).not.toHaveBeenCalled();
    expect(maestro.attempts.compareAndSet).toHaveBeenCalledTimes(1);
    expect(maestro.attempts.compareAndSet.mock.calls[0]?.[0]).toBe(MAESTRO.id);
  });

  it('QC-161 R30: sin empresa, una cuenta bloqueada no entra ni con la contrasena correcta y no escribe', async () => {
    const bloqueado: AuthenticatableUser = {
      ...MAESTRO,
      failedAttempts: 3,
      lockLevel: 1,
      lockedUntil: bloqueadaHasta(),
    };
    const { verifyCredentials, session, attempts } = montar([bloqueado]);

    await expect(
      verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }),
    ).resolves.toEqual({ ok: false });
    expect(session.startSession).not.toHaveBeenCalled();
    expect(attempts.compareAndSet).not.toHaveBeenCalled();
    expect(attempts.set).not.toHaveBeenCalled();
  });

  it('QC-161 R30: sin empresa, una cuenta que no esta activa no entra ni con la contrasena correcta', async () => {
    for (const estado of ['pending', 'inactive'] as const) {
      const { verifyCredentials, session } = montar([{ ...MAESTRO, accountStatus: estado }]);

      await expect(
        verifyCredentials({ username: 'admin', password: CONTRASENA_CORRECTA }),
      ).resolves.toEqual({ ok: false });
      expect(session.startSession).not.toHaveBeenCalled();
    }
  });
});
