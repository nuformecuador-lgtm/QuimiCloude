// QC-79 T13 — ESTABLECER LA CONTRASENA CON EL ENLACE (`design.md > 9.1`).
//
// Cubre R18, R19, R21, R22 y R23.
//
// Tres cosas que este archivo afirma y que no son estilo:
//
//   1. **Los SEIS rechazos de R22 son indistinguibles**: mismo `code` Y mismo mensaje. Se compara
//      el conjunto de respuestas y se exige que tenga **un** solo elemento; con seis aserciones
//      sueltas, cambiar uno de los seis a otro codigo dejaria el archivo en verde.
//   2. **Tras un rechazo por politica el enlace SIGUE VIVO** (R23): no basta con mirar el error,
//      hay que afirmar que `applyCredentialAndActivate` **no se llamo**. Si se hubiera llamado, el
//      enlace estaria consumido y la persona se habria quedado fuera por escribir una contrasena
//      debil.
//   3. **No se lee ninguna sesion** (R18): los dobles de sesion de este archivo **lanzan si los
//      llaman**, y el caso de uso no los recibe siquiera. La unica forma de probar una NO llamada
//      es que la llamada reviente.
//
// Lo que aqui NO se prueba: el SQL de la transaccion de `design.md > 4.6` (es T10 y T20), y que
// dos usos simultaneos dejen ganar a uno solo (es T20, contra Postgres real): en este nivel el
// puerto es un doble y lo unico observable es que se le pide `'invalid'` o `'ok'`.

import { describe, expect, it, vi } from 'vitest';

import {
  CredentialConfirmationMismatchError,
  CredentialPolicyRejectedError,
} from '@/lib/modules/identity/domain/credential-rejected';
import { IdentityError } from '@/lib/modules/identity/domain/errors';
import { createSetCredentialWithLink } from '@/lib/modules/identity/domain/set-credential-with-link';

import type { CredentialPolicyResult } from '@/lib/modules/identity/domain/credential-policy';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';

const AHORA = new Date('2026-09-11T10:00:00.000Z');

const SECRETO = 'secreto-de-256-bits-en-base64url-marcado';
/** Huella OPACA a proposito: si contuviera el secreto, el caso que afirma que el secreto no cruza
 *  el puerto seria verde por casualidad -o rojo por el doble, no por el codigo-. */
const HUELLA = 'huella-sha256-hexadecimal-del-secreto';
const HASH = '$2b$12$marca-del-hasher-de-qc5';
const CREDENCIAL = 'Contrasena-Elegida-1!';

const ENTRADA = {
  secret: SECRETO,
  credential: CREDENCIAL,
  credentialConfirmation: CREDENCIAL,
};

type Guion = {
  /** Que responde la politica de QC-19 (R23). Por defecto, la acepta. */
  readonly politica?: CredentialPolicyResult;
  /** Como acaba la escritura atomica (R19, R22). Por defecto, `'ok'`. */
  readonly apply?: 'ok' | 'invalid';
};

function montar(guion: Guion = {}) {
  const orden: string[] = [];

  const checkCredentialPolicy = vi.fn(async (): Promise<CredentialPolicyResult> => {
    orden.push('checkCredentialPolicy');
    return guion.politica ?? { ok: true, unmet: [] };
  });

  const passwordHasher = {
    hash: vi.fn<PasswordHasher['hash']>(async () => {
      orden.push('passwordHasher.hash');
      return HASH;
    }),
    verify: vi.fn<PasswordHasher['verify']>(async () => false),
  } satisfies PasswordHasher;

  const secrets = {
    // En este camino NO se genera ningun secreto: el que hay llego por la URL. Si alguien llamara
    // a `create()` aqui, estaria emitiendo un enlace nuevo al establecer una contrasena.
    create: vi.fn<CredentialSetupSecretFactory['create']>(() => {
      throw new Error('establecer la contrasena no emite ningun enlace nuevo');
    }),
    digestOf: vi.fn<CredentialSetupSecretFactory['digestOf']>((secret) => {
      orden.push('secrets.digestOf');
      return secret === SECRETO ? HUELLA : `huella-de-otro-secreto-${secret.length}`;
    }),
  } satisfies CredentialSetupSecretFactory;

  const links = {
    issueForPendingUser: vi.fn<CredentialSetupLinkRepository['issueForPendingUser']>(async () => {
      throw new Error('establecer la contrasena no emite ningun enlace');
    }),
    applyCredentialAndActivate: vi.fn<
      CredentialSetupLinkRepository['applyCredentialAndActivate']
    >(async () => {
      orden.push('links.applyCredentialAndActivate');
      return guion.apply ?? 'ok';
    }),
  } satisfies CredentialSetupLinkRepository;

  return {
    checkCredentialPolicy,
    passwordHasher,
    secrets,
    links,
    orden,
    setCredential: createSetCredentialWithLink({
      checkCredentialPolicy,
      passwordHasher,
      secrets,
      links,
      now: () => AHORA,
    }),
  };
}

/** El error que lanzo la operacion, tal cual, para poder mirarle el `code` Y el mensaje. */
async function falloDe(operacion: Promise<unknown>): Promise<unknown> {
  const fallo = await operacion.then(
    () => null,
    (error: unknown) => error,
  );
  expect(fallo, 'la operacion no fallo').not.toBeNull();
  return fallo;
}

// =============================================================================================
// R19 — El camino feliz: politica, hash y UNA escritura atomica
// =============================================================================================

describe('R19 — establece la contrasena con un enlace valido', () => {
  it('hashea la candidata y pide la escritura atomica con la HUELLA, nunca con el secreto', async () => {
    const d = montar();

    await expect(d.setCredential(ENTRADA)).resolves.toBeUndefined();

    expect(d.passwordHasher.hash).toHaveBeenCalledWith(CREDENCIAL);
    expect(d.links.applyCredentialAndActivate).toHaveBeenCalledWith({
      digest: HUELLA,
      credentialHash: HASH,
      now: AHORA,
    });

    // R9, R13: el secreto no cruza el puerto de persistencia. Se afirma sobre el argumento real.
    const [argumento] = d.links.applyCredentialAndActivate.mock.calls[0] ?? [];
    expect(JSON.stringify(argumento)).not.toContain(SECRETO);
  });

  it('la politica va ANTES de escribir nada, y el hash antes de la escritura', async () => {
    const d = montar();

    await d.setCredential(ENTRADA);

    expect(d.orden).toEqual([
      'checkCredentialPolicy',
      'passwordHasher.hash',
      'secrets.digestOf',
      'links.applyCredentialAndActivate',
    ]);
  });

  it('no devuelve nada: sin campos no hay hueco donde colar el secreto ni la contrasena (R5)', async () => {
    const d = montar();

    const resultado = await d.setCredential(ENTRADA);

    expect(resultado).toBeUndefined();
  });
});

// =============================================================================================
// R21 / P3 — La marca de cambio de credencial NO se toca
// =============================================================================================

describe('R21 — la marca de cambio de credencial no se modifica', () => {
  it('no manda ninguna marca al puerto: solo huella, hash e instante', async () => {
    // Mientras P3 siga abierta manda R21 (`requirements.md > Preguntas abiertas`): la marca se
    // queda como nacio. Se afirma sobre las CLAVES del argumento, que es la unica forma de que
    // este caso se ponga rojo el dia que alguien anada `mustChangeCredential: false` sin cerrar P3.
    const d = montar();

    await d.setCredential(ENTRADA);

    const [argumento] = d.links.applyCredentialAndActivate.mock.calls[0] ?? [];
    expect(Object.keys(argumento ?? {}).sort()).toEqual(['credentialHash', 'digest', 'now']);
    expect(JSON.stringify(argumento)).not.toContain('ustChangeCredential');
  });
});

// =============================================================================================
// R18 — Sin permiso y sin sesion: el UNICO credencial es el secreto
// =============================================================================================

describe('R18 — no exige permiso y no lee ninguna sesion', () => {
  it('la firma no admite ningun actor: solo la entrada', () => {
    // Si alguien anadiera un parametro de actor, esta longitud cambiaria y el caso caeria.
    const d = montar();

    expect(d.setCredential.length).toBe(1);
  });

  it('funciona sin nada mas que el secreto, con dobles de sesion que fallan si los llaman', async () => {
    const sesion = {
      leerCookie: vi.fn(() => {
        throw new Error('la pagina publica no lee ninguna cookie (R18)');
      }),
      leerCabecera: vi.fn(() => {
        throw new Error('la pagina publica no lee ninguna cabecera (R18)');
      }),
      resolverActor: vi.fn(() => {
        throw new Error('la pagina publica no resuelve ningun actor (R18)');
      }),
    };
    const d = montar();

    await expect(d.setCredential(ENTRADA)).resolves.toBeUndefined();

    for (const doble of Object.values(sesion)) expect(doble).not.toHaveBeenCalled();
  });

  it('el esquema RECHAZA cualquier identificador de usuario o de empresa en la entrada', async () => {
    // `strictObject`: si el esquema admitiera un `userId`, cualquiera con un enlace podria
    // apuntarlo a otra persona.
    const d = montar();

    for (const extra of [{ userId: 'x' }, { companyId: 'x' }, { actorId: 'x' }]) {
      const fallo = await falloDe(d.setCredential({ ...ENTRADA, ...extra }));
      expect((fallo as IdentityError).code).toBe('invalid_input');
      expect(d.links.applyCredentialAndActivate).not.toHaveBeenCalled();
    }
  });
});

// =============================================================================================
// R22 — LOS SEIS RECHAZOS, INDISTINGUIBLES
// =============================================================================================

describe('R22 — los seis casos responden exactamente lo mismo', () => {
  /**
   * Los seis de R22. El puerto devuelve `'invalid'` para todos ellos -no tiene otra cosa que
   * devolver, y eso es deliberado-, asi que lo que este caso demuestra es que el DOMINIO no
   * inventa una distincion que el puerto no le da.
   */
  const LOS_SEIS = [
    'el secreto no corresponde a ningun enlace',
    'el enlace caduco',
    'el enlace ya fue consumido',
    'un reenvio sustituyo el enlace',
    'la cuenta esta borrada',
    'la cuenta ya no esta en pending',
  ] as const;

  it('mismo `code` y mismo mensaje en los seis: el conjunto de respuestas tiene UN elemento', async () => {
    const respuestas = new Set<string>();

    for (const caso of LOS_SEIS) {
      const d = montar({ apply: 'invalid' });
      const fallo = await falloDe(d.setCredential(ENTRADA));

      expect(fallo, caso).toBeInstanceOf(IdentityError);
      const error = fallo as IdentityError;
      respuestas.add(`${error.code}|${error.message}|${error.diagnostic ?? ''}`);
    }

    expect(respuestas.size, 'los seis rechazos deben ser indistinguibles').toBe(1);
    expect([...respuestas][0]?.startsWith('credential_link_invalid|')).toBe(true);
  });

  it('el rechazo no lleva el secreto ni su huella por ningun lado (R13)', async () => {
    const d = montar({ apply: 'invalid' });

    const fallo = (await falloDe(d.setCredential(ENTRADA))) as IdentityError;

    expect(fallo.message).not.toContain(SECRETO);
    expect(fallo.message).not.toContain(HUELLA);
    expect(fallo.diagnostic ?? '').not.toContain(SECRETO);
    expect(fallo.diagnostic ?? '').not.toContain(HUELLA);
    expect(JSON.stringify({ ...fallo, message: fallo.message })).not.toContain(SECRETO);
  });
});

// =============================================================================================
// R23 — La politica de QC-19, sin puerta lateral, y el enlace SIGUE VIVO tras rechazarla
// =============================================================================================

describe('R23 — la politica se aplica antes de escribir y el enlace sobrevive al rechazo', () => {
  const DEBIL: CredentialPolicyResult = { ok: false, unmet: ['min_length', 'no_digit'] };

  it('devuelve las reglas incumplidas y NO consume el enlace', async () => {
    const d = montar({ politica: DEBIL });

    const fallo = await falloDe(d.setCredential({ ...ENTRADA, credential: 'ab', credentialConfirmation: 'ab' }));

    expect(fallo).toBeInstanceOf(CredentialPolicyRejectedError);
    expect((fallo as CredentialPolicyRejectedError).unmet).toEqual(['min_length', 'no_digit']);
    // **El enlace sigue vivo**: si esto se hubiera llamado, la persona se habria quedado fuera por
    // escribir una contrasena debil.
    expect(d.links.applyCredentialAndActivate).not.toHaveBeenCalled();
    // Y tampoco se llego a hashear: la politica es ANTES.
    expect(d.passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('el rechazo por politica no es un error del catalogo de QC-70', async () => {
    // QC-70 R31 deja las comprobaciones de formulario fuera del catalogo, y por eso la clase no
    // deriva de `IdentityError`: las reglas incumplidas son datos que la persona necesita y no
    // caben en un `ErrorState` (`design.md > 11.3`).
    const d = montar({ politica: DEBIL });

    const fallo = await falloDe(d.setCredential(ENTRADA));

    expect(fallo).not.toBeInstanceOf(IdentityError);
  });

  it('la contrasena rechazada no aparece en el error (R5, QC-19 R24)', async () => {
    const d = montar({ politica: DEBIL });

    const fallo = (await falloDe(d.setCredential(ENTRADA))) as Error;

    expect(fallo.message).not.toContain(CREDENCIAL);
    expect(JSON.stringify((fallo as CredentialPolicyRejectedError).unmet)).not.toContain(
      CREDENCIAL,
    );
  });
});

// =============================================================================================
// La confirmacion: ni error del catalogo ni escritura (`design.md > 5.2`, `> 5.3`)
// =============================================================================================

describe('la confirmacion que no coincide', () => {
  it('se senala con su propia clase, no con un `code` del catalogo', async () => {
    const d = montar();

    const fallo = await falloDe(
      d.setCredential({ ...ENTRADA, credentialConfirmation: `${CREDENCIAL}x` }),
    );

    expect(fallo).toBeInstanceOf(CredentialConfirmationMismatchError);
    expect(fallo).not.toBeInstanceOf(IdentityError);
  });

  it('se comprueba ANTES de la politica y sin tocar ningun puerto', async () => {
    const d = montar();

    await falloDe(d.setCredential({ ...ENTRADA, credentialConfirmation: 'otra-cosa' }));

    expect(d.checkCredentialPolicy).not.toHaveBeenCalled();
    expect(d.passwordHasher.hash).not.toHaveBeenCalled();
    expect(d.links.applyCredentialAndActivate).not.toHaveBeenCalled();
  });

  it('no lleva ninguna de las dos contrasenas ni su largo', async () => {
    const d = montar();

    const fallo = (await falloDe(
      d.setCredential({ ...ENTRADA, credentialConfirmation: 'otra-cosa' }),
    )) as Error;

    expect(fallo.message).not.toContain(CREDENCIAL);
    expect(fallo.message).not.toContain('otra-cosa');
    expect(fallo.message).not.toContain(String(CREDENCIAL.length));
  });

  it('compara exactamente, sin recortar (QC-19 R10): un espacio al final NO coincide', async () => {
    const d = montar();

    const fallo = await falloDe(
      d.setCredential({ ...ENTRADA, credentialConfirmation: `${CREDENCIAL} ` }),
    );

    expect(fallo).toBeInstanceOf(CredentialConfirmationMismatchError);
  });
});
