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

const USUARIO: AuthenticatableUser = {
  id: 'usuario-1',
  passwordHash: hashDe(CONTRASENA_CORRECTA),
  roleName: ROL_EN_LA_BASE,
  ...SIN_BLOQUEO,
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
        ) => Promise<boolean>
      >(async () => true),
    set: vi.fn<(userId: string, estado: AccountLockState) => Promise<void>>(async () => {}),
  };
  const hasher = {
    hash: vi.fn(async (texto: string) => hashDe(texto)),
    // Verificacion de mentira, pero exacta: distingue mayusculas y no recorta espacios.
    verify: vi.fn(async (texto: string, guardado: string) => guardado === hashDe(texto)),
  };
  const session = {
    startSession: vi.fn<(ticket: SessionTicket) => Promise<void>>(async () => {}),
  };

  return {
    users,
    attempts,
    hasher,
    session,
    verifyCredentials: createVerifyCredentials({ users, attempts, hasher, session }),
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
    expect(attempts.set).toHaveBeenCalledWith(USUARIO.id, {
      failedAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
    });
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
    const { users, attempts, hasher, session } = montar();
    const deps = { users, attempts, hasher, session };

    // Se construye con EXACTAMENTE esos cuatro puertos: ni uno mas.
    const verifyCredentials = createVerifyCredentials(deps);
    expect(typeof verifyCredentials).toBe('function');
    expect(Object.keys(deps).sort()).toEqual(['attempts', 'hasher', 'session', 'users']);

    // Y el fuente lo confirma: el tipo de dependencias declara esas cuatro claves y el
    // archivo entero no menciona la politica por ningun nombre.
    expect(FUENTE_DE_VERIFY_CREDENTIALS.length).toBeGreaterThan(0);
    const bloqueDeDeps = /export type VerifyCredentialsDeps = \{([\s\S]*?)\};/.exec(
      FUENTE_DE_VERIFY_CREDENTIALS,
    );
    expect(bloqueDeDeps).not.toBeNull();
    const claves = [...(bloqueDeDeps?.[1] ?? '').matchAll(/readonly\s+([A-Za-z_$][\w$]*)\s*:/g)]
      .map((match) => match[1] as string)
      .sort();
    expect(claves).toEqual(['attempts', 'hasher', 'session', 'users']);

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
