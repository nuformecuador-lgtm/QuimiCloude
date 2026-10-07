// QC-23 T20 — El caso de uso de CERRAR TODAS las sesiones de una persona
// (`domain/end-all-sessions.ts`, `design.md > 5.2`). Cubre R25, R26, R27, R28, R29, R48, R51.
//
// Lo que este archivo vigila mas de cerca es la AUTORIZACION, y por eso el doble del repositorio
// es un doble que AFIRMA CERO INVOCACIONES en todos los casos de denegacion: no basta con que la
// operacion lance, tiene que lanzar **sin haber tocado nada** (`tasks.md > T12`, `> T20`). Mismo
// criterio y mismo estilo que `tests/unit/identity/usuarios/authorization.test.ts`.

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createEndAllSessions } from '@/lib/modules/identity/domain/end-all-sessions';
import { IdentityError, UnauthorizedError, UserNotFoundError } from '@/lib/modules/identity/domain/errors';
import { floorToSecond } from '@/lib/modules/identity/domain/session-revocation';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { SessionRevocationRepository } from '@/lib/modules/identity/ports/session-revocation-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
/** El objetivo NUNCA es el actor salvo en el test que lo dice: R25 y R26 son requisitos distintos. */
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

const AHORA = new Date('2026-09-12T10:00:00.437Z');

/** El actor que SI puede cerrarle las sesiones a otra persona. */
const ADMIN: Actor = { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios.modificar'] };

/**
 * El doble del puerto. `stampAll` devuelve lo que se le diga; los dos metodos son espias para
 * poder afirmar CERO invocaciones en cada denegacion.
 */
function crearRepositorio(resultado: 'ok' | 'not_found' = 'ok') {
  const stampAll = vi.fn(async () => resultado);
  const revokeSession = vi.fn(async () => {});
  const revocations: SessionRevocationRepository = { stampAll, revokeSession };

  return { revocations, stampAll, revokeSession };
}

/** Afirma que NINGUN metodo del puerto se invoco: la denegacion ocurrio antes de tocar nada. */
function esperarPuertoIntacto(repo: ReturnType<typeof crearRepositorio>): void {
  expect(repo.stampAll).not.toHaveBeenCalled();
  expect(repo.revokeSession).not.toHaveBeenCalled();
}

describe('endAllSessions — autorizacion en la PRIMERA LINEA y fallo cerrado (R27, R29)', () => {
  // Los cuatro casos de R27, uno a uno, y los cuatro con el puerto intacto.
  const denegados: ReadonlyArray<readonly [string, Actor | null | undefined]> = [
    ['actor ausente (null)', null],
    ['actor ausente (undefined)', undefined],
    ['sin conjunto de permisos', { id: ACTOR_ID, companyId: COMPANY_ID } as unknown as Actor],
    ['con el conjunto vacio', { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] }],
    [
      'con un conjunto que NO es un array',
      { id: ACTOR_ID, companyId: COMPANY_ID, permissions: 'usuarios.modificar' } as unknown as Actor,
    ],
    [
      'sin el codigo EXACTO (consultar no concede modificar)',
      { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios.consultar'] },
    ],
  ];

  for (const [caso, actor] of denegados) {
    it(`rechaza ${caso} sin tocar el puerto`, async () => {
      const repo = crearRepositorio();
      const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

      await expect(endAllSessions(actor, TARGET_ID)).rejects.toBeInstanceOf(UnauthorizedError);
      esperarPuertoIntacto(repo);
    });
  }

  it('el error de denegacion es del catalogo cerrado de QC-70 y no trae texto propio (R48)', async () => {
    const repo = crearRepositorio();
    const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

    const error = await endAllSessions(null, TARGET_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityError);
    expect((error as UnauthorizedError).code).toBe('unauthorized');
  });

  // R29: el actor entra por PARAMETRO. El fuente no lee cookies ni cabeceras.
  it('el caso de uso no lee cookies ni cabeceras: el actor entra por parametro', () => {
    const fuente = readFileSync(
      resolvePath(process.cwd(), 'lib/modules/identity/domain/end-all-sessions.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');

    expect(fuente).not.toMatch(/\bcookies\b/);
    expect(fuente).not.toMatch(/\bheaders\b/);
    expect(fuente).not.toMatch(/next\//);
  });
});

describe('endAllSessions — cerrar las PROPIAS no exige ningun codigo (R25, R27)', () => {
  it('apuntarse a uno mismo con el conjunto VACIO si esta permitido: no es self_operation', async () => {
    const repo = crearRepositorio('ok');
    const sinPermisos: Actor = { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] };
    const endAllSessions = createEndAllSessions({
      revocations: repo.revocations,
      now: () => AHORA,
    });

    await expect(endAllSessions(sinPermisos, ACTOR_ID)).resolves.toBeUndefined();

    // R25 es el caso de uso, no la excepcion: el sello sube igual que para cualquier otro.
    expect(repo.stampAll).toHaveBeenCalledTimes(1);
  });

  it('sin actor tampoco hay sesion propia que cerrar, aunque el objetivo «coincida»', async () => {
    const repo = crearRepositorio();
    const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

    // `undefined?.id` es `undefined`, asi que ningun identificador puede «igualar» al actor
    // ausente: cae por el camino del permiso y se rechaza igual.
    await expect(endAllSessions(null, ACTOR_ID)).rejects.toBeInstanceOf(UnauthorizedError);
    esperarPuertoIntacto(repo);
  });
});

describe('endAllSessions — el cierre total y su ambito (R25, R26, R28)', () => {
  it('sube el sello de la persona objetivo, en la empresa del ACTOR y truncado al segundo', async () => {
    const repo = crearRepositorio('ok');
    const endAllSessions = createEndAllSessions({
      revocations: repo.revocations,
      now: () => AHORA,
    });

    await endAllSessions(ADMIN, TARGET_ID);

    expect(repo.stampAll).toHaveBeenCalledTimes(1);
    expect(repo.stampAll).toHaveBeenCalledWith({
      userId: TARGET_ID,
      companyId: COMPANY_ID,
      // El sello se escribe TRUNCADO AL SEGUNDO (`design.md > 2.3`). La desigualdad y el truncado
      // se importan del dominio: copiarlos aqui seria una segunda definicion.
      validFrom: floorToSecond(AHORA),
    });
    // R26: el cierre es SIEMPRE total. No hay ningun `sid` que elegir, ni aqui ni en la firma.
    expect(repo.revokeSession).not.toHaveBeenCalled();
  });

  it('un objetivo de otra empresa responde user_not_found, y NO unauthorized (R28)', async () => {
    // El puerto es quien filtra por empresa y por fila viva; los TRES casos —no existe, borrada,
    // otra empresa— llegan aqui como el mismo `'not_found'` y salen como el mismo error.
    const repo = crearRepositorio('not_found');
    const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

    const error = await endAllSessions(ADMIN, TARGET_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UserNotFoundError);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect((error as UserNotFoundError).code).toBe('user_not_found');
  });
});

describe('endAllSessions — alcance de la ficha (R51)', () => {
  it('el caso de uso no emite ninguna cookie ni crea ninguna Server Action', () => {
    const fuente = readFileSync(
      resolvePath(process.cwd(), 'lib/modules/identity/domain/end-all-sessions.ts'),
      'utf8',
    );

    // R51: la operacion queda implementada y probada en el dominio; el boton es de QC-101.
    expect(fuente).not.toMatch(/use server/);
    expect(fuente).not.toMatch(/startSession/);
    expect(fuente).not.toMatch(/SessionWriter/);
  });
});

// ---------------------------------------------------------------------------------------------
// QC-101 T3 — bloque NUEVO al final, aditivo: no reescribe ni reordena ningun caso de QC-23.
//
// `docs/checkpoints-proyecto.md > Permisos` pide que la autorizacion de ESTA ficha tenga test propio nombrado
// con su requisito, aunque QC-23 ya cubra la misma regla arriba. R3 y R4 son de
// `specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/requirements.md`.
// ---------------------------------------------------------------------------------------------

/**
 * Doble EN MEMORIA del puerto, con el mismo ambito que su implementacion real
 * (`WHERE id = ? AND company_id = ? AND deleted_at IS NULL`): asi los tres casos de no-encontrado
 * de R4 son tres situaciones DISTINTAS de verdad —no existe, borrada, de otra empresa— y no tres
 * veces el mismo `'not_found'` fijado a mano.
 */
function puertoEnMemoria(
  filas: ReadonlyArray<{ id: string; companyId: string; deletedAt: Date | null }>,
) {
  const stampAll = vi.fn(async (input: { userId: string; companyId: string; validFrom: Date }) =>
    filas.some(
      (fila) =>
        fila.id === input.userId && fila.companyId === input.companyId && fila.deletedAt === null,
    )
      ? ('ok' as const)
      : ('not_found' as const),
  );
  const revokeSession = vi.fn(async () => {});
  const revocations: SessionRevocationRepository = { stampAll, revokeSession };
  return { revocations, stampAll, revokeSession };
}

describe('QC-101 R3 — sobre OTRA persona sin usuarios.modificar se rechaza en el service', () => {
  const sinModificar: ReadonlyArray<readonly [string, Actor]> = [
    ['con el conjunto vacio', { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] }],
    [
      'con solo usuarios.consultar',
      { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['usuarios.consultar'] },
    ],
    [
      'con otros permisos de modificar que no son usuarios.modificar',
      {
        id: ACTOR_ID,
        companyId: COMPANY_ID,
        permissions: ['usuarios.consultar', 'roles.consultar', 'inventario.modificar'],
      },
    ],
  ];

  for (const [caso, actor] of sinModificar) {
    it(`QC-101 R3: ${caso}, rechaza con code unauthorized y stampAll registra CERO llamadas`, async () => {
      // El objetivo EXISTE, esta vivo y es de la empresa del actor: si el rechazo dependiera de
      // otra cosa que el permiso, aqui el puerto contestaria 'ok' y el caso se pondria rojo.
      const repo = puertoEnMemoria([{ id: TARGET_ID, companyId: COMPANY_ID, deletedAt: null }]);
      const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

      const error = await endAllSessions(actor, TARGET_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).code).toBe('unauthorized');
      expect(repo.stampAll).toHaveBeenCalledTimes(0);
      expect(repo.revokeSession).toHaveBeenCalledTimes(0);
    });
  }

  it('QC-101 R3: el mismo actor CON usuarios.modificar si llega al puerto (el rechazo es por el permiso)', async () => {
    const repo = puertoEnMemoria([{ id: TARGET_ID, companyId: COMPANY_ID, deletedAt: null }]);
    const endAllSessions = createEndAllSessions({ revocations: repo.revocations });

    await expect(endAllSessions(ADMIN, TARGET_ID)).resolves.toBeUndefined();
    expect(repo.stampAll).toHaveBeenCalledTimes(1);
  });
});

describe('QC-101 R4 — no existe, borrada u otra empresa: el MISMO user_not_found', () => {
  const OTRA_EMPRESA = '88888888-8888-4888-8888-888888888888';

  const casos: ReadonlyArray<
    readonly [string, ReadonlyArray<{ id: string; companyId: string; deletedAt: Date | null }>]
  > = [
    ['el objetivo no existe', []],
    [
      'el objetivo esta borrado logicamente',
      [{ id: TARGET_ID, companyId: COMPANY_ID, deletedAt: new Date('2026-09-01T00:00:00.000Z') }],
    ],
    [
      'el objetivo pertenece a otra empresa',
      [{ id: TARGET_ID, companyId: OTRA_EMPRESA, deletedAt: null }],
    ],
  ];

  async function errorDe(
    filas: ReadonlyArray<{ id: string; companyId: string; deletedAt: Date | null }>,
  ): Promise<unknown> {
    const repo = puertoEnMemoria(filas);
    const endAllSessions = createEndAllSessions({ revocations: repo.revocations });
    return endAllSessions(ADMIN, TARGET_ID).catch((e: unknown) => e);
  }

  for (const [caso, filas] of casos) {
    it(`QC-101 R4: si ${caso}, responde user_not_found y no unauthorized`, async () => {
      const error = await errorDe(filas);

      expect(error).toBeInstanceOf(UserNotFoundError);
      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect((error as UserNotFoundError).code).toBe('user_not_found');
    });
  }

  it('QC-101 R4: los tres casos son INDISTINGUIBLES (misma clase, mismo code, mismo mensaje)', async () => {
    const errores = await Promise.all(casos.map(([, filas]) => errorDe(filas)));

    const huellas = errores.map((error) => {
      const e = error as UserNotFoundError;
      return { clase: e.constructor.name, code: e.code, message: e.message };
    });

    expect(new Set(huellas.map((h) => JSON.stringify(h))).size).toBe(1);
  });
});
