// QC-79 T14 — REENVIAR EL ENLACE (`design.md > 9.1`). Cubre R14, R15, R16 y R30.
//
// **Los dobles del caso de autorizacion FALLAN SI LOS LLAMAN.** No es estilo: R14 dice «NO DEBE
// leer ni escribir por ningun puerto, NO DEBE emitir ningun enlace y NO DEBE enviar ningun correo»,
// y un doble permisivo daria verde con un reenvio no autorizado que ya hubiera mandado el correo.
// La unica forma de demostrar una NO llamada es que la llamada reviente.
//
// Lo que aqui NO se prueba: el SQL de la transaccion de `design.md > 4.5` y que dos emisiones
// simultaneas dejen UN solo enlace vivo (es T10 y T20, contra Postgres real); y el contenido del
// correo (es T15).

import { describe, expect, it, vi } from 'vitest';

import { IdentityError } from '@/lib/modules/identity/domain/errors';
import { createIssueCredentialSetupLink } from '@/lib/modules/identity/domain/issue-credential-setup-link';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '@/lib/modules/identity/ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const OBJETIVO_ID = '44444444-4444-4444-8444-444444444444';
const AHORA = new Date('2026-09-11T10:00:00.000Z');
/** Siete dias exactos despues de `AHORA`, escritos a mano: si el TTL cambiara, este caso cae. */
const SIETE_DIAS_DESPUES = new Date('2026-09-18T10:00:00.000Z');

const SECRETO = 'secreto-de-256-bits-en-base64url-marcado';
const HUELLA = 'huella-sha256-hexadecimal-del-secreto';
const CORREO_DESTINO = 'ana.perez@empresa.test';

const ACTOR: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const ENTRADA = { userId: OBJETIVO_ID };

type Guion = {
  /** Como acaba la emision (R15, R16). Por defecto, emitido y con destinatario. */
  readonly issue?: Awaited<ReturnType<CredentialSetupLinkRepository['issueForPendingUser']>>;
  /** Si el proveedor acepto el mensaje (R30). Por defecto, `'sent'`. */
  readonly mail?: 'sent' | 'failed';
};

function montar(guion: Guion = {}) {
  const orden: string[] = [];

  const secrets = {
    create: vi.fn<CredentialSetupSecretFactory['create']>(() => {
      orden.push('secrets.create');
      return { secret: SECRETO, digest: HUELLA };
    }),
    digestOf: vi.fn<CredentialSetupSecretFactory['digestOf']>(() => {
      throw new Error('el reenvio no comprueba ninguna huella recibida');
    }),
  } satisfies CredentialSetupSecretFactory;

  const links = {
    issueForPendingUser: vi.fn<CredentialSetupLinkRepository['issueForPendingUser']>(async () => {
      orden.push('links.issueForPendingUser');
      return guion.issue ?? { email: CORREO_DESTINO };
    }),
    applyCredentialAndActivate: vi.fn<
      CredentialSetupLinkRepository['applyCredentialAndActivate']
    >(async () => {
      throw new Error('el reenvio no establece ninguna contrasena');
    }),
  } satisfies CredentialSetupLinkRepository;

  const mailer = {
    sendCredentialSetupLink: vi.fn<CredentialSetupMailer['sendCredentialSetupLink']>(async () => {
      orden.push('mailer.sendCredentialSetupLink');
      return guion.mail ?? 'sent';
    }),
  } satisfies CredentialSetupMailer;

  return {
    secrets,
    links,
    mailer,
    orden,
    reenviar: createIssueCredentialSetupLink({
      secrets,
      links,
      mailer,
      now: () => AHORA,
    }),
  };
}

/**
 * El montaje de R14: **cada metodo de cada puerto lanza**. Si el caso de uso comprobara el permiso
 * despues de tocar un puerto, el test caeria por la excepcion del doble.
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
    secrets: {
      create: explota('secrets.create'),
      digestOf: explota('secrets.digestOf'),
    } as unknown as CredentialSetupSecretFactory,
    links: {
      issueForPendingUser: explota('links.issueForPendingUser'),
      applyCredentialAndActivate: explota('links.applyCredentialAndActivate'),
    } as unknown as CredentialSetupLinkRepository,
    mailer: {
      sendCredentialSetupLink: explota('mailer.sendCredentialSetupLink'),
    } as unknown as CredentialSetupMailer,
  };

  return { espias, reenviar: createIssueCredentialSetupLink(deps) };
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
// R14 — El permiso es la PRIMERA linea: sin el no se toca NINGUN puerto
// =============================================================================================

describe('R14 — sin `usuarios.modificar` no suena ningun puerto ni se envia nada', () => {
  const SIN_PERMISO: readonly (Actor | null | undefined)[] = [
    null,
    undefined,
    { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] },
    { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios.consultar'] },
  ];

  it('rechaza con `unauthorized`, no emite enlace y no manda correo', async () => {
    for (const actor of SIN_PERMISO) {
      const d = explosivo();

      expect(await codeDeFallo(d.reenviar(actor, ENTRADA))).toBe('unauthorized');

      // La lista no esta vacia: sin esto, «ningun espia sono» seria verde por vacuidad.
      expect(d.espias.length).toBeGreaterThan(0);
      for (const espia of d.espias) expect(espia).not.toHaveBeenCalled();
    }
  });

  it('el permiso va ANTES de zod: una entrada rota tambien responde `unauthorized`', async () => {
    // Si validara primero, un actor sin permiso con una entrada rota recibiria `invalid_input` y
    // sabria algo del sistema sin tener derecho a preguntarlo.
    const d = explosivo();

    expect(await codeDeFallo(d.reenviar(null, { userId: 42 }))).toBe('unauthorized');
    for (const espia of d.espias) expect(espia).not.toHaveBeenCalled();
  });

  it('`usuarios.consultar` NO concede el reenvio: la pertenencia es exacta', async () => {
    const d = explosivo();

    expect(
      await codeDeFallo(
        d.reenviar({ id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios'] }, ENTRADA),
      ),
    ).toBe('unauthorized');
  });
});

// =============================================================================================
// Camino 1 — Emitido y enviado
// =============================================================================================

describe('R15, R16, R30 — emitido y enviado', () => {
  it('acota SIEMPRE por la empresa del ACTOR (a diferencia del alta, que pasa `null`)', async () => {
    const d = montar();

    await d.reenviar(ACTOR, ENTRADA);

    expect(d.links.issueForPendingUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OBJETIVO_ID, companyId: COMPANY_ID }),
    );
  });

  it('los 7 dias cuentan desde el instante del REENVIO, no desde la emision original (R16)', async () => {
    const d = montar();

    await d.reenviar(ACTOR, ENTRADA);

    expect(d.links.issueForPendingUser).toHaveBeenCalledWith(
      expect.objectContaining({ now: AHORA, expiresAt: SIETE_DIAS_DESPUES }),
    );
  });

  it('envia al correo que resolvio el REPOSITORIO, no a uno que venga del llamante', async () => {
    // Enviar a una direccion que viniera por parametro seria un vector para usar el ERP como
    // reenviador (`design.md > 6.2`).
    const d = montar();

    const resultado = await d.reenviar(ACTOR, ENTRADA);

    expect(d.mailer.sendCredentialSetupLink).toHaveBeenCalledWith({
      to: CORREO_DESTINO,
      secret: SECRETO,
    });
    expect(resultado).toEqual({ mail: 'sent' });
  });

  it('el resultado no lleva el secreto, ni la huella, ni el correo del destinatario (R13)', async () => {
    const d = montar();

    const resultado = await d.reenviar(ACTOR, ENTRADA);

    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(SECRETO);
    expect(serializado).not.toContain(HUELLA);
    expect(serializado).not.toContain(CORREO_DESTINO);
  });

  it('el orden es: secreto, emision, correo', async () => {
    const d = montar();

    await d.reenviar(ACTOR, ENTRADA);

    expect(d.orden).toEqual([
      'secrets.create',
      'links.issueForPendingUser',
      'mailer.sendCredentialSetupLink',
    ]);
  });
});

// =============================================================================================
// Camino 2 — Emitido y correo fallido (R30)
// =============================================================================================

describe('R30 — un fallo de correo no es un fallo de la operacion', () => {
  it('devuelve `mail: failed` y NO lanza: el enlace queda emitido y vivo', async () => {
    const d = montar({ mail: 'failed' });

    await expect(d.reenviar(ACTOR, ENTRADA)).resolves.toEqual({ mail: 'failed' });
    expect(d.links.issueForPendingUser).toHaveBeenCalledTimes(1);
  });

  it('no reintenta por su cuenta: el correo se intenta UNA vez (R31)', async () => {
    const d = montar({ mail: 'failed' });

    await d.reenviar(ACTOR, ENTRADA);

    expect(d.mailer.sendCredentialSetupLink).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================================
// Camino 3 — No encontrado (R15): no existe, borrado, u otra empresa
// =============================================================================================

describe('R15 — `not_found` no revela nada y no envia nada', () => {
  it('lanza `user_not_found` y no manda ningun correo', async () => {
    const d = montar({ issue: 'not_found' });

    expect(await codeDeFallo(d.reenviar(ACTOR, ENTRADA))).toBe('user_not_found');
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });

  it('el secreto generado muere aqui: no se envia y no aparece en el error', async () => {
    const d = montar({ issue: 'not_found' });

    const fallo = await d.reenviar(ACTOR, ENTRADA).then(
      () => null,
      (error: unknown) => error as IdentityError,
    );

    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
    expect(fallo?.message).not.toContain(SECRETO);
    expect(fallo?.diagnostic ?? '').not.toContain(SECRETO);
  });
});

// =============================================================================================
// Camino 4 — Ya no esta en `pending` (R15): error DISTINGUIBLE
// =============================================================================================

describe('R15 — `user_not_pending` se distingue, y a proposito', () => {
  it('lanza `user_not_pending`, distinto de `user_not_found`, y no envia nada', async () => {
    // Quien reenvia trae `usuarios.modificar` y ya ve el estado de cuenta en el listado de QC-66,
    // asi que el codigo no le revela nada nuevo (`design.md > 5.4`).
    const d = montar({ issue: 'user_not_pending' });

    const code = await codeDeFallo(d.reenviar(ACTOR, ENTRADA));

    expect(code).toBe('user_not_pending');
    expect(code).not.toBe('user_not_found');
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });
});

// =============================================================================================
// La carrera de `design.md > 4.5`
// =============================================================================================

describe('`superseded` — la carrera responde exito sin mandar un segundo correo', () => {
  it('devuelve `mail: sent` y NO llama al correo', async () => {
    // La ganadora acaba de emitir y enviar, asi que «hay un enlace vivo y se envio» es la verdad
    // observable. Para una carrera cuyo resultado es el correcto no se inventa un error nuevo.
    const d = montar({ issue: 'superseded' });

    await expect(d.reenviar(ACTOR, ENTRADA)).resolves.toEqual({ mail: 'sent' });
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });
});

// =============================================================================================
// La entrada (`design.md > 5.2`)
// =============================================================================================

describe('la entrada del reenvio', () => {
  it('rechaza `companyId`: el ambito sale del actor y de ningun otro sitio (R15)', async () => {
    const d = montar();

    expect(await codeDeFallo(d.reenviar(ACTOR, { ...ENTRADA, companyId: COMPANY_ID }))).toBe(
      'invalid_input',
    );
    expect(d.links.issueForPendingUser).not.toHaveBeenCalled();
  });

  it('rechaza un identificador que no es un uuid, sin tocar ningun puerto', async () => {
    const d = montar();

    expect(await codeDeFallo(d.reenviar(ACTOR, { userId: 'no-es-un-uuid' }))).toBe('invalid_input');
    expect(d.secrets.create).not.toHaveBeenCalled();
    expect(d.links.issueForPendingUser).not.toHaveBeenCalled();
    expect(d.mailer.sendCredentialSetupLink).not.toHaveBeenCalled();
  });
});
