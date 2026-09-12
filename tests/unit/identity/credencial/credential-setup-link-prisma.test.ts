// QC-79 T10 — El adaptador de persistencia del enlace, con DOBLE de Prisma.
// Cubre R11, R12, R15, R16, R19, R20, R22 (`design.md > 4.5`, `> 4.6`, `> 6.2`).
//
// Que se demuestra aqui, y por que cada cosa importa:
//
//   - Los CINCO resultados de `issueForPendingUser`: `'not_found'`, `'user_not_pending'`,
//     `'superseded'` y el `{ email }` del exito; mas el ambito por empresa de R15, que vive en el
//     `where` de este adaptador y no en el dominio.
//   - Los DOS de `applyCredentialAndActivate`, incluido que 0 filas en el SEGUNDO `UPDATE` hace
//     revertir la transaccion entera (R22) en vez de dejar el enlace quemado.
//   - Que el `23505` se reconoce por el CODIGO del error (`P2002`) y NUNCA por el texto del
//     mensaje: un error con otro codigo cuyo mensaje habla de «unique» y de «23505» se RELANZA.
//
// El doble no finge ser Postgres: finge el CONTRATO del cliente de Prisma. `$transaction` registra
// `begin`/`commit`/`rollback`, que es lo que permite afirmar el `ROLLBACK` de § 4.6 sin base. Lo
// que el doble NO puede demostrar —que dos transacciones concurrentes de verdad acaban con un solo
// enlace vivo— lo prueba la integracion de T20 contra Postgres real.

import { Prisma } from '@prisma/client';

/** Lo que las dos funciones del adaptador piden al cliente, y nada mas. */
const doble = vi.hoisted(() => ({
  bitacora: [] as string[],
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock('@/lib/shared/db/prisma', () => {
  const tx = {
    user: { findFirst: doble.findFirst },
    credentialSetupToken: { updateMany: doble.updateMany, create: doble.create },
    $queryRaw: doble.queryRaw,
    $executeRaw: doble.executeRaw,
  };

  return {
    prisma: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>): Promise<unknown> => {
        doble.bitacora.push('begin');
        try {
          const resultado = await run(tx);
          doble.bitacora.push('commit');
          return resultado;
        } catch (error) {
          doble.bitacora.push('rollback');
          throw error;
        }
      },
    },
  };
});

const { applyCredentialAndActivate, issueForPendingUser } = await import(
  '@/lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma'
);

const AHORA = new Date('2026-09-11T10:00:00.000Z');
const CADUCA = new Date('2026-09-18T10:00:00.000Z');
const USUARIO = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '22222222-2222-4222-8222-222222222222';
const HUELLA = 'a'.repeat(64);

const EMISION = {
  userId: USUARIO,
  companyId: null,
  digest: HUELLA,
  expiresAt: CADUCA,
  now: AHORA,
} as const;

/** Un `P2002` de verdad, construido como lo construye el motor. */
function choqueDeUnicidad(mensaje: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(mensaje, {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['user_id'] },
  });
}

/** El texto del SQL que se le paso a `$queryRaw` / `$executeRaw`, para poder leerlo. */
function sqlDe(mock: typeof doble.queryRaw, llamada = 0): string {
  return (mock.mock.calls[llamada]?.[0] as Prisma.Sql).text;
}

function valoresDe(mock: typeof doble.queryRaw, llamada = 0): readonly unknown[] {
  return (mock.mock.calls[llamada]?.[0] as Prisma.Sql).values;
}

beforeEach(() => {
  doble.bitacora.length = 0;
  vi.clearAllMocks();
  doble.updateMany.mockResolvedValue({ count: 1 });
  doble.create.mockResolvedValue({});
});

describe('issueForPendingUser — la transaccion de design.md > 4.5', () => {
  it('devuelve `not_found` y NO escribe nada cuando el usuario no existe, esta borrado o es de otra empresa', async () => {
    // El `where` ya lleva `deletedAt: null`, asi que los tres casos llegan aqui como el mismo
    // `null` y salen por la misma puerta: no revela que existe (R15, QC-66 R33/R34).
    doble.findFirst.mockResolvedValue(null);

    await expect(issueForPendingUser({ ...EMISION, companyId: EMPRESA })).resolves.toBe('not_found');

    expect(doble.updateMany).not.toHaveBeenCalled();
    expect(doble.create).not.toHaveBeenCalled();
  });

  it('acota por empresa cuando `companyId` llega, y no la menciona cuando es null (R15)', async () => {
    doble.findFirst.mockResolvedValue(null);

    await issueForPendingUser({ ...EMISION, companyId: EMPRESA });
    expect(doble.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: USUARIO, deletedAt: null, companyId: EMPRESA },
    });

    await issueForPendingUser({ ...EMISION, companyId: null });
    const sinEmpresa = doble.findFirst.mock.calls[1]?.[0] as { where: Record<string, unknown> };
    expect(sinEmpresa.where).toEqual({ id: USUARIO, deletedAt: null });
    expect(sinEmpresa.where).not.toHaveProperty('companyId');
  });

  it('devuelve `user_not_pending` —distinguible de `not_found`— y no escribe ninguna fila (R15)', async () => {
    for (const estado of ['active', 'inactive', 'blocked'] as const) {
      doble.findFirst.mockResolvedValue({ email: 'ana@empresa.test', accountStatus: estado });

      await expect(issueForPendingUser(EMISION)).resolves.toBe('user_not_pending');
    }

    expect(doble.updateMany).not.toHaveBeenCalled();
    expect(doble.create).not.toHaveBeenCalled();
  });

  it('mata el enlace vivo anterior y luego inserta el nuevo, y devuelve el correo del destinatario (R11, R16)', async () => {
    doble.findFirst.mockResolvedValue({ email: 'ana@empresa.test', accountStatus: 'pending' });

    await expect(issueForPendingUser(EMISION)).resolves.toEqual({ email: 'ana@empresa.test' });

    // La sustitucion: solo los VIVOS del mismo usuario, y con el instante de la emision.
    expect(doble.updateMany).toHaveBeenCalledWith({
      where: { userId: USUARIO, consumedAt: null, supersededAt: null },
      data: { supersededAt: AHORA },
    });
    // El alta del nuevo guarda la HUELLA, nunca el secreto (R9), y su caducidad llega ya calculada.
    expect(doble.create).toHaveBeenCalledWith({
      data: { userId: USUARIO, tokenDigest: HUELLA, expiresAt: CADUCA },
    });
    expect(doble.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      doble.create.mock.invocationCallOrder[0] as number,
    );
    expect(doble.bitacora).toEqual(['begin', 'commit']);
  });

  it('el correo sale de la BASE y no de quien llama: no hay forma de pasarle una direccion', async () => {
    doble.findFirst.mockResolvedValue({ email: 'de-la-base@empresa.test', accountStatus: 'pending' });

    const resultado = await issueForPendingUser(EMISION);

    expect(resultado).toEqual({ email: 'de-la-base@empresa.test' });
    expect(doble.findFirst.mock.calls[0]?.[0]).toMatchObject({
      select: { email: true, accountStatus: true },
    });
  });

  it('traduce el choque del indice parcial a `superseded` y NO lanza (R11, design.md > 4.5)', async () => {
    doble.findFirst.mockResolvedValue({ email: 'ana@empresa.test', accountStatus: 'pending' });
    doble.create.mockRejectedValue(
      // Mensaje deliberadamente MUDO: no dice «unique», no dice «23505» y no esta en ingles.
      choqueDeUnicidad('violacion de restriccion'),
    );

    await expect(issueForPendingUser(EMISION)).resolves.toBe('superseded');
  });

  it('reconoce el `23505` por el CODIGO y no por el texto: otro codigo con ese texto se RELANZA', async () => {
    doble.findFirst.mockResolvedValue({ email: 'ana@empresa.test', accountStatus: 'pending' });
    const impostor = new Prisma.PrismaClientKnownRequestError(
      'duplicate key value violates unique constraint (SQLSTATE 23505)',
      { code: 'P2010', clientVersion: '6.19.3' },
    );
    doble.create.mockRejectedValue(impostor);

    await expect(issueForPendingUser(EMISION)).rejects.toBe(impostor);
    expect(doble.bitacora).toEqual(['begin', 'rollback']);
  });

  it('relanza cualquier otro fallo de escritura en vez de tragarselo', async () => {
    doble.findFirst.mockResolvedValue({ email: 'ana@empresa.test', accountStatus: 'pending' });
    const caida = new Error('conexion perdida');
    doble.create.mockRejectedValue(caida);

    await expect(issueForPendingUser(EMISION)).rejects.toBe(caida);
  });
});

describe('applyCredentialAndActivate — la transaccion de design.md > 4.6', () => {
  const USO = { digest: HUELLA, credentialHash: '$2b$12$hash', now: AHORA } as const;

  it('consume el enlace y activa la cuenta en la misma transaccion (R12, R19)', async () => {
    doble.queryRaw.mockResolvedValue([{ user_id: USUARIO }]);
    doble.executeRaw.mockResolvedValue(1);

    await expect(applyCredentialAndActivate(USO)).resolves.toBe('ok');
    expect(doble.bitacora).toEqual(['begin', 'commit']);
  });

  it('el paso 1 es un `UPDATE ... RETURNING` condicional, nunca un `SELECT` previo (R20)', async () => {
    doble.queryRaw.mockResolvedValue([{ user_id: USUARIO }]);
    doble.executeRaw.mockResolvedValue(1);

    await applyCredentialAndActivate(USO);

    const sql = sqlDe(doble.queryRaw);
    expect(sql).toContain('UPDATE "credential_setup_tokens"');
    expect(sql).toContain('RETURNING "user_id"');
    expect(sql).toContain('"consumed_at" IS NULL');
    expect(sql).toContain('"superseded_at" IS NULL');
    expect(sql).toContain('"expires_at" >');
    expect(sql).not.toContain('SELECT');
    // La huella viaja como PARAMETRO, no interpolada en el texto.
    expect(valoresDe(doble.queryRaw)).toContain(HUELLA);
    expect(sql).not.toContain(HUELLA);
  });

  it('el paso 2 exige vivo y `pending`, deja el autor en NULL y NO toca la marca de credencial (R19, R21)', async () => {
    doble.queryRaw.mockResolvedValue([{ user_id: USUARIO }]);
    doble.executeRaw.mockResolvedValue(1);

    await applyCredentialAndActivate(USO);

    const sql = sqlDe(doble.executeRaw);
    expect(sql).toContain('UPDATE "users"');
    expect(sql).toContain('"deleted_at" IS NULL');
    expect(sql).toContain('"account_status_changed_by" = NULL');
    // R21: la marca con la que la cuenta nacio no se modifica mientras P3 siga abierta.
    expect(sql).not.toContain('must_change_credential');
    expect(valoresDe(doble.executeRaw)).toEqual(
      expect.arrayContaining(['$2b$12$hash', 'active', AHORA, USUARIO, 'pending']),
    );
  });

  it('devuelve `invalid` sin tocar `users` cuando el enlace no encaja —inexistente, caducado, consumido o sustituido— (R22)', async () => {
    doble.queryRaw.mockResolvedValue([]);

    await expect(applyCredentialAndActivate(USO)).resolves.toBe('invalid');

    expect(doble.executeRaw).not.toHaveBeenCalled();
    // Nada que revertir: el `UPDATE` condicional no toco ninguna fila.
    expect(doble.bitacora).toEqual(['begin', 'commit']);
  });

  it('REVIERTE la transaccion entera cuando el segundo UPDATE da 0 filas: el enlace no queda quemado (R22)', async () => {
    // El administrador borro, bloqueo o activo la cuenta entre el correo y el clic.
    doble.queryRaw.mockResolvedValue([{ user_id: USUARIO }]);
    doble.executeRaw.mockResolvedValue(0);

    await expect(applyCredentialAndActivate(USO)).resolves.toBe('invalid');

    // La prueba del rollback: la transaccion NO se confirma, asi que el `consumed_at` del paso 1
    // se deshace. Si aqui pusiera `commit`, un enlace vivo se habria perdido en silencio.
    expect(doble.bitacora).toEqual(['begin', 'rollback']);
  });

  it('la respuesta de los dos rechazos es la MISMA, indistinguible entre ellos (R22)', async () => {
    doble.queryRaw.mockResolvedValue([]);
    const sinEnlace = await applyCredentialAndActivate(USO);

    doble.queryRaw.mockResolvedValue([{ user_id: USUARIO }]);
    doble.executeRaw.mockResolvedValue(0);
    const cuentaCambiada = await applyCredentialAndActivate(USO);

    expect(sinEnlace).toBe(cuentaCambiada);
  });

  it('relanza un fallo real de la base en vez de disfrazarlo de `invalid`', async () => {
    const caida = new Error('conexion perdida');
    doble.queryRaw.mockRejectedValue(caida);

    await expect(applyCredentialAndActivate(USO)).rejects.toBe(caida);
  });
});
