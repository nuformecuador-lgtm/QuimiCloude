// QC-79 T11 — EL ALTA CON LA CONTRASENA OPCIONAL, sus dos ramas (`design.md > 9.1`).
//
// Cubre R1, R2, R3, R4, R6, R7 y R30.
//
// **Todos los dobles de este archivo FALLAN SI LOS LLAMAN cuando no deben llamarse.** No es estilo:
// R2 y R6 dicen «NO DEBE crear ninguna fila, NO DEBE emitir ningun enlace y NO DEBE enviar ningun
// correo», y un doble permisivo daria verde con un alta rechazada que ya hubiera mandado el correo.
// La unica forma de demostrar una NO llamada es que la llamada reviente.
//
// Lo que aqui NO se prueba: la traduccion del duplicado (es `user-service.test.ts`), el SQL de las
// dos transacciones (es T10 y T20), y que el centinela de R4 no verifique contra ninguna contrasena
// (es T20, contra Postgres real: este nivel solo puede ver que llega `{ kind: 'none' }`).

import { describe, expect, it, vi } from 'vitest';

import { CredentialPolicyRejectedError } from '@/lib/modules/identity/domain/credential-rejected';
import { CREDENTIAL_SETUP_LINK_TTL_MS } from '@/lib/modules/identity/domain/credential-setup-link';
import { createCreateUser } from '@/lib/modules/identity/domain/create-user';
import { IdentityError } from '@/lib/modules/identity/domain/errors';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { CredentialPolicyResult } from '@/lib/modules/identity/domain/credential-policy';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '@/lib/modules/identity/ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const NEW_ID = '44444444-4444-4444-8444-444444444444';
const AHORA = new Date('2026-09-11T10:00:00.000Z');

const SECRETO = 'secreto-de-256-bits-en-base64url-marcado';
const HUELLA = 'huella-sha256-hexadecimal-del-secreto';
const CORREO_DESTINO = 'ana.perez@empresa.test';
const HASH = '$2b$12$marca-del-hasher-de-qc5';
const CREDENCIAL = 'Contrasena-Escrita-1!';

const ACTOR: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** Los nueve campos del alta, SIN contrasena: la rama del enlace es la de por defecto. */
const ENTRADA = {
  firstNames: 'Ana Maria',
  lastNames: 'Perez Loor',
  birthDate: '1990-05-04',
  email: CORREO_DESTINO,
  phone: '+593 99 000 0000',
  documentTypeCode: 'CC',
  documentNumber: '1712345678',
  username: 'aperez',
  roleId: ROLE_ID,
};

type Guion = {
  /** Que responde la politica de QC-19 (R2). Por defecto, la acepta. */
  readonly politica?: CredentialPolicyResult;
  /** Como acaba la emision del enlace (R7). Por defecto, emitido y con destinatario. */
  readonly issue?: Awaited<ReturnType<CredentialSetupLinkRepository['issueForPendingUser']>>;
  /** Si el proveedor acepto el mensaje (R30). Por defecto, `'sent'`. */
  readonly mail?: 'sent' | 'failed';
};

/**
 * Dobles que REGISTRAN lo que se les pide. Para las NO llamadas no basta con esto: los casos que
 * exigen que algo no suene lo afirman ademas con `not.toHaveBeenCalled()`, y el caso de
 * autorizacion usa el montaje `explosivo()` de abajo, donde cada metodo lanza.
 */
function montar(guion: Guion = {}) {
  const orden: string[] = [];

  const users = {
    create: vi.fn<UserAdminRepository['create']>(async () => {
      orden.push('users.create');
      return { id: NEW_ID };
    }),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(async () => null),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(async () => {
      throw new Error('listAliveInCompany no pinta nada en el alta');
    }),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(async () => 'ok'),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(async () => 'ok'),
  } satisfies UserAdminRepository;

  const passwordHasher = {
    hash: vi.fn<PasswordHasher['hash']>(async () => {
      orden.push('passwordHasher.hash');
      return HASH;
    }),
    verify: vi.fn<PasswordHasher['verify']>(async () => false),
  } satisfies PasswordHasher;

  const checkCredentialPolicy = vi.fn(async (): Promise<CredentialPolicyResult> => {
    orden.push('checkCredentialPolicy');
    return guion.politica ?? { ok: true, unmet: [] };
  });

  const secrets = {
    create: vi.fn<CredentialSetupSecretFactory['create']>(() => {
      orden.push('secrets.create');
      return { secret: SECRETO, digest: HUELLA };
    }),
  } satisfies CredentialSetupSecretFactory;

  const links = {
    issueForPendingUser: vi.fn<CredentialSetupLinkRepository['issueForPendingUser']>(async () => {
      orden.push('links.issueForPendingUser');
      return guion.issue ?? { email: CORREO_DESTINO };
    }),
    applyCredentialAndActivate: vi.fn<
      CredentialSetupLinkRepository['applyCredentialAndActivate']
    >(async () => 'ok'),
  } satisfies CredentialSetupLinkRepository;

  const mailer = {
    sendCredentialSetupLink: vi.fn<CredentialSetupMailer['sendCredentialSetupLink']>(async () => {
      orden.push('mailer.sendCredentialSetupLink');
      return guion.mail ?? 'sent';
    }),
  } satisfies CredentialSetupMailer;

  return {
    users,
    passwordHasher,
    checkCredentialPolicy,
    secrets,
    links,
    mailer,
    orden,
    createUser: createCreateUser({
      users,
      passwordHasher,
      checkCredentialPolicy,
      secrets,
      links,
      mailer,
      now: () => AHORA,
    }),
  };
}

/**
 * El montaje de R6: **cada metodo de cada puerto lanza**. Si el caso de uso comprobara el permiso
 * despues de tocar un puerto, el test caeria por la excepcion del doble aunque el
 * `toBeInstanceOf(UnauthorizedError)` pudiera enganarse.
 */
function explosivo() {
  const espias: ReturnType<typeof vi.fn>[] = [];
  const explota = (nombre: string) => {
    const espia = vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`);
    });
    espias.push(espia);
    return espia;
  };

  const deps = {
    users: {
      create: explota('users.create'),
      findAliveInCompany: explota('users.findAliveInCompany'),
      listAliveInCompany: explota('users.listAliveInCompany'),
      updateAliveInCompany: explota('users.updateAliveInCompany'),
      applyGuardedChange: explota('users.applyGuardedChange'),
    } as unknown as UserAdminRepository,
    passwordHasher: {
      hash: explota('passwordHasher.hash'),
      verify: explota('passwordHasher.verify'),
    } as unknown as PasswordHasher,
    checkCredentialPolicy: explota('checkCredentialPolicy') as unknown as (
      candidate: string,
    ) => Promise<CredentialPolicyResult>,
    secrets: { create: explota('secrets.create') } as unknown as CredentialSetupSecretFactory,
    links: {
      issueForPendingUser: explota('links.issueForPendingUser'),
      applyCredentialAndActivate: explota('links.applyCredentialAndActivate'),
    } as unknown as CredentialSetupLinkRepository,
    mailer: {
      sendCredentialSetupLink: explota('mailer.sendCredentialSetupLink'),
    } as unknown as CredentialSetupMailer,
  };

  return { deps, espias, createUser: createCreateUser(deps) };
}

/** El `code` del error que lanzo la operacion: nunca el texto del mensaje. */
async function codeDeFallo(operacion: Promise<unknown>): Promise<string> {
  const fallo = await operacion.then(
    () => null,
    (error: unknown) => error,
  );
  expect(fallo, 'la operacion no fallo').toBeInstanceOf(IdentityError);
  return (fallo as IdentityError).code;
}

// =============================================================================================
// R6 — El permiso es la PRIMERA linea: sin el no se toca NINGUN puerto
// =============================================================================================

describe('R6 — sin `usuarios.modificar` no suena ningun puerto', () => {
  const SIN_PERMISO: readonly (Actor | null | undefined)[] = [
    null,
    undefined,
    { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] },
    { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios.consultar'] },
  ];

  it('rechaza con `unauthorized` y no crea usuario, no emite enlace y no manda correo', async () => {
    for (const actor of SIN_PERMISO) {
      const d = explosivo();

      expect(await codeDeFallo(d.createUser(actor, ENTRADA))).toBe('unauthorized');

      // La lista no esta vacia: sin esto, «ningun espia sono» seria verde por vacuidad.
      expect(d.espias.length).toBeGreaterThan(0);
      for (const espia of d.espias) expect(espia).not.toHaveBeenCalled();
    }
  });

  it('el permiso va ANTES de zod: una entrada rota tambien responde `unauthorized`', async () => {
    // Si validara primero, un actor sin permiso con una entrada rota recibiria `invalid_input` y
    // sabria algo del sistema sin tener derecho a preguntarlo.
    const d = explosivo();

    expect(await codeDeFallo(d.createUser(null, { firstNames: 42 }))).toBe('unauthorized');
    for (const espia of d.espias) expect(espia).not.toHaveBeenCalled();
  });

  it('tampoco suena nada cuando la entrada trae contrasena: ni la politica ni el hasher', async () => {
    // La rama CON credencial tiene dos dependencias mas que la de QC-66, y las dos son caras: un
    // bcrypt por una peticion no autorizada es, ademas, un canal de medida de tiempo.
    const d = explosivo();

    expect(await codeDeFallo(d.createUser(null, { ...ENTRADA, credential: CREDENCIAL }))).toBe(
      'unauthorized',
    );
    for (const espia of d.espias) expect(espia).not.toHaveBeenCalled();
  });
});

// =============================================================================================
// R2, R3 — CON contrasena: politica antes de escribir, hash, y NI enlace NI correo
// =============================================================================================

describe('R2, R3 — el alta CON contrasena', () => {
  it('evalua la politica de QC-19 ANTES de escribir nada, y despues hashea y crea', async () => {
    const d = montar();

    await d.createUser(ACTOR, { ...ENTRADA, credential: CREDENCIAL });

    expect(d.checkCredentialPolicy).toHaveBeenCalledTimes(1);
    expect(d.checkCredentialPolicy).toHaveBeenCalledWith(CREDENCIAL);
    // El ORDEN es el requisito: la politica primero, el hash despues, la escritura al final.
    expect(d.orden).toEqual(['checkCredentialPolicy', 'passwordHasher.hash', 'users.create']);
  });

  it('persiste SOLO el hash de QC-5, y la contrasena no cruza el puerto', async () => {
    const d = montar();

    await d.createUser(ACTOR, { ...ENTRADA, credential: CREDENCIAL });

    expect(d.users.create.mock.calls[0][2]).toEqual({ kind: 'hash', value: HASH });
    expect(JSON.stringify(d.users.create.mock.calls[0])).not.toContain(CREDENCIAL);
  });

  it('R3 — NO emite ningun enlace, NO manda ningun correo, y `mail` es `not_needed`', async () => {
    const d = montar();

    const resultado = await d.createUser(ACTOR, { ...ENTRADA, credential: CREDENCIAL });

    expect(resultado).toEqual({ id: NEW_ID, mail: 'not_needed' });
    expect(d.secrets.create).not.toHaveBeenCalled();
    expect(d.links.issueForPendingUser).not.toHaveBeenCalled();
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });

  it('R3 — la cuenta nace igualmente en `pending`: escribir la contrasena NO la activa', async () => {
    const d = montar();

    await d.createUser(ACTOR, { ...ENTRADA, credential: CREDENCIAL });

    expect(d.users.create.mock.calls[0][3]).toBe('pending');
    expect(d.users.create.mock.calls[0][4]).toEqual(AHORA);
  });
});

// =============================================================================================
// R2 — La contrasena debil: ni fila, ni enlace, ni correo, y las reglas incumplidas
// =============================================================================================

describe('R2 — la contrasena que la politica rechaza', () => {
  const DEBIL = { ok: false, unmet: ['min_length', 'no_digit', 'breached'] } as const;

  it('no crea ninguna fila, no emite ningun enlace y no manda ningun correo', async () => {
    const d = montar({ politica: DEBIL });

    await expect(
      d.createUser(ACTOR, { ...ENTRADA, credential: 'corta' }),
    ).rejects.toBeInstanceOf(CredentialPolicyRejectedError);

    expect(d.users.create).not.toHaveBeenCalled();
    expect(d.passwordHasher.hash).not.toHaveBeenCalled();
    expect(d.secrets.create).not.toHaveBeenCalled();
    expect(d.links.issueForPendingUser).not.toHaveBeenCalled();
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
    // La politica sono, y sono ANTES que cualquier otra cosa: nada mas llego a pasar.
    expect(d.orden).toEqual(['checkCredentialPolicy']);
  });

  it('devuelve las REGLAS INCUMPLIDAS, y ningun fragmento de la candidata', async () => {
    // R2 exige «indicando las reglas incumplidas»: sin ellas el formulario es inservible. Y QC-19
    // R24 mas QC-79 R5 exigen que la candidata no viaje en ningun mensaje de error.
    const d = montar({ politica: DEBIL });

    const fallo = await d
      .createUser(ACTOR, { ...ENTRADA, credential: 'corta' })
      .then(() => null, (error: unknown) => error);

    expect(fallo).toBeInstanceOf(CredentialPolicyRejectedError);
    expect((fallo as CredentialPolicyRejectedError).unmet).toEqual([
      'min_length',
      'no_digit',
      'breached',
    ]);
    expect((fallo as Error).message).not.toContain('corta');
  });
});

// =============================================================================================
// R1, R4, R7, R30 — SIN contrasena: ni una al azar, enlace emitido y correo enviado
// =============================================================================================

describe('R4, R7 — el alta SIN contrasena', () => {
  it('R4 — NO se genera ninguna contrasena al azar: al puerto llega `{ kind: \'none\' }`', async () => {
    // **Esto ENMIENDA QC-66 R15 con sus palabras**: ya no es cierto que el alta le fije a la cuenta
    // una contrasena generada al azar por el propio sistema. La fila nace sin ninguna credencial con
    // la que se pueda entrar, y el acceso lo da el enlace.
    const d = montar();

    await d.createUser(ACTOR, ENTRADA);

    expect(d.users.create.mock.calls[0][2]).toEqual({ kind: 'none' });
    // Ni se hashea nada, ni se consulta la politica: no hay ninguna candidata que evaluar.
    expect(d.passwordHasher.hash).not.toHaveBeenCalled();
    expect(d.checkCredentialPolicy).not.toHaveBeenCalled();
  });

  it('R7 — emite UN enlace del usuario recien creado, con su caducidad de 7 dias, y lo manda', async () => {
    const d = montar();

    const resultado = await d.createUser(ACTOR, ENTRADA);

    expect(d.secrets.create).toHaveBeenCalledTimes(1);
    expect(d.links.issueForPendingUser).toHaveBeenCalledTimes(1);
    expect(d.links.issueForPendingUser.mock.calls[0][0]).toEqual({
      userId: NEW_ID,
      // `null`: se acaba de crear la fila con la empresa del actor y no hay nada que reacotar. Quien
      // pasa empresa SIEMPRE es el reenvio de R14/R15.
      companyId: null,
      // Lo que llega a la base es la HUELLA, nunca el secreto (R9).
      digest: HUELLA,
      expiresAt: new Date(AHORA.getTime() + CREDENTIAL_SETUP_LINK_TTL_MS),
      now: AHORA,
    });

    expect(d.mailer.sendCredentialSetupLink).toHaveBeenCalledTimes(1);
    expect(d.mailer.sendCredentialSetupLink).toHaveBeenCalledWith({
      // El destinatario lo resuelve el REPOSITORIO al emitir, no el llamante: enviar a una direccion
      // que viniera por parametro seria un vector para usar el ERP como reenviador.
      to: CORREO_DESTINO,
      secret: SECRETO,
    });

    expect(resultado).toEqual({ id: NEW_ID, mail: 'sent' });
  });

  it('R7 — el enlace se emite DESPUES de que la fila exista, no antes', async () => {
    // El orden es el requisito: emitir antes de crear dejaria un enlace apuntando a un usuario que
    // pudo no llegar a existir (un correo duplicado, un rol inexistente).
    const d = montar();

    await d.createUser(ACTOR, ENTRADA);

    expect(d.orden).toEqual([
      'users.create',
      'secrets.create',
      'links.issueForPendingUser',
      'mailer.sendCredentialSetupLink',
    ]);
  });

  it('R13 — el secreto NO sale del caso de uso: ni en el resultado, ni por ninguna otra via', async () => {
    // `design.md > 4.7`: el secreto va de la fabrica al puerto de correo y a nada mas. El tipo del
    // resultado no tiene ningun campo de texto libre donde colarlo, y esto lo comprueba ademas
    // sobre el valor serializado.
    const d = montar();

    const resultado = await d.createUser(ACTOR, ENTRADA);

    expect(JSON.stringify(resultado)).not.toContain(SECRETO);
    expect(JSON.stringify(resultado)).not.toContain(HUELLA);
    expect(Object.keys(resultado).sort()).toEqual(['id', 'mail']);
  });
});

// =============================================================================================
// R1 — La cadena vacia y la ausencia son LO MISMO
// =============================================================================================

describe('R1 — la cadena vacia se trata IGUAL que la ausencia', () => {
  it('con `credential: \'\'` se recorre la rama del enlace, no se falla la validacion', async () => {
    // Un `<input>` vacio llega por `FormData` como `''`, no como ausente. Si eso cayera como
    // `invalid_input`, el administrador no podria dar de alta a nadie sin escribir una contrasena,
    // que es justo lo contrario de lo que esta ficha hace.
    const d = montar();

    const resultado = await d.createUser(ACTOR, { ...ENTRADA, credential: '' });

    expect(resultado).toEqual({ id: NEW_ID, mail: 'sent' });
    expect(d.users.create.mock.calls[0][2]).toEqual({ kind: 'none' });
    expect(d.checkCredentialPolicy).not.toHaveBeenCalled();
    expect(d.links.issueForPendingUser).toHaveBeenCalledTimes(1);
  });

  it('la cadena vacia y la ausencia producen EXACTAMENTE las mismas llamadas', async () => {
    // No basta con que las dos «funcionen»: R1 dice que se traten IGUAL, asi que se comparan las
    // dos trazas enteras. Si alguien normalizara en dos sitios con criterios distintos, esto cae.
    const ausente = montar();
    const vacia = montar();

    const r1 = await ausente.createUser(ACTOR, ENTRADA);
    const r2 = await vacia.createUser(ACTOR, { ...ENTRADA, credential: '' });

    expect(r2).toEqual(r1);
    expect(vacia.orden).toEqual(ausente.orden);
    expect(vacia.users.create.mock.calls[0]).toEqual(ausente.users.create.mock.calls[0]);
  });

  it('una contrasena de SOLO espacios NO es la cadena vacia: es una candidata y va a la politica', async () => {
    // QC-19 R10 prohibe recortar la candidata, asi que `'   '` no se normaliza a ausencia: se
    // evalua, y la politica la rechaza por composicion. La equivalencia de R1 es solo con `''`.
    const d = montar({ politica: { ok: false, unmet: ['min_length', 'no_uppercase'] } });

    await expect(d.createUser(ACTOR, { ...ENTRADA, credential: '   ' })).rejects.toBeInstanceOf(
      CredentialPolicyRejectedError,
    );
    expect(d.checkCredentialPolicy).toHaveBeenCalledWith('   ');
    expect(d.links.issueForPendingUser).not.toHaveBeenCalled();
  });
});

// =============================================================================================
// R30 — El correo que falla no deshace nada
// =============================================================================================

describe('R30 — el fallo del correo', () => {
  it('el usuario QUEDA CREADO, en `pending`, y el alta devuelve `mail: \'failed\'`', async () => {
    const d = montar({ mail: 'failed' });

    const resultado = await d.createUser(ACTOR, ENTRADA);

    // No se deshace la creacion y no se devuelve un fallo del alta: la operacion no lanza.
    expect(resultado).toEqual({ id: NEW_ID, mail: 'failed' });
    expect(d.users.create).toHaveBeenCalledTimes(1);
    expect(d.users.create.mock.calls[0][3]).toBe('pending');
    // Y el enlace quedo emitido: por eso QC-67 puede ofrecer el reenvio de R14.
    expect(d.links.issueForPendingUser).toHaveBeenCalledTimes(1);
  });

  it('no se reintenta el envio por cuenta propia (R31): una sola llamada al correo', async () => {
    const d = montar({ mail: 'failed' });

    await d.createUser(ACTOR, ENTRADA);

    expect(d.mailer.sendCredentialSetupLink).toHaveBeenCalledTimes(1);
  });

  it('la carrera `superseded` responde exito y NO manda un segundo correo', async () => {
    // `design.md > 4.5`: la perdedora tira su secreto -que no llego a persistirse- y responde «hay
    // un enlace vivo y se envio», que es VERDAD, porque la ganadora acaba de emitirlo y enviarlo.
    const d = montar({ issue: 'superseded' });

    const resultado = await d.createUser(ACTOR, ENTRADA);

    expect(resultado).toEqual({ id: NEW_ID, mail: 'sent' });
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });

  it('una emision que no devuelve destinatario no tumba el alta: `mail: \'failed\'`', async () => {
    // `'not_found'` y `'user_not_pending'` no deberian ocurrir justo despues de crear la fila en
    // `pending`. Si ocurren manda R30: el usuario queda creado y el alta NO falla.
    for (const issue of ['not_found', 'user_not_pending', 'issued'] as const) {
      const d = montar({ issue });

      const resultado = await d.createUser(ACTOR, ENTRADA);

      expect(resultado, issue).toEqual({ id: NEW_ID, mail: 'failed' });
      expect(d.mailer.sendCredentialSetupLink, issue).not.toHaveBeenCalled();
    }
  });
});

// =============================================================================================
// R5, R13 — Ninguna escritura a la consola en el archivo del caso de uso
// =============================================================================================

describe('R5, R13 — el archivo del alta no escribe en ninguna traza', () => {
  it('`create-user.ts` no contiene ningun `console.*`', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const fuente = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
        'lib',
        'modules',
        'identity',
        'domain',
        'create-user.ts',
      ),
      'utf8',
    );

    expect(fuente).not.toMatch(/console\s*\./);
  });
});
