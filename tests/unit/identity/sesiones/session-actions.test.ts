// QC-101 T2 — La Server Action del cierre de sesiones
// (`lib/modules/identity/adapters/driving/session-actions.ts`, `design.md > 1`).
//
// Cubre R1, R2, R5 y R6 de `specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/`. Cada caso
// lleva su `R<n>` en el nombre para que el mapa de trazabilidad apunte a una linea concreta.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/identity/usuarios/user-actions.test.ts`: la action se prueba contra dobles, nunca
// contra la sesion real. En los casos donde importa que el RECHAZO ocurra en el service y no aqui
// (R1, R2), el doble de `identity.endAllSessions` delega en el caso de uso REAL
// (`createEndAllSessions`) sobre un puerto que REVIENTA si alguien lo llama.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import { UnauthorizedError, UserNotFoundError } from '@/lib/modules/identity';
import { endAllSessionsAction } from '@/lib/modules/identity/adapters/driving/session-actions';
import { createEndAllSessions } from '@/lib/modules/identity/domain/end-all-sessions';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { SessionRevocationRepository } from '@/lib/modules/identity/ports/session-revocation-repository';

const { getSessionUserMock, getSessionContextMock, endAllSessionsMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  endAllSessionsMock: vi.fn(),
}));

// QC-71: el traductor unico recibe el lector de la cabecera del identificador de peticion. Sin el
// en el doble, el modulo ni siquiera carga; con el, el `unexpected` vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '3f2b8c1e-5d4a-4e6b-9c7d-0a1b2c3d4e5f';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    endAllSessions: endAllSessionsMock,
  },
}));

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
/** La persona objetivo NUNCA es el actor en este archivo: el caso de uno mismo es QC-53. */
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

const SESSION_USER = {
  id: ADMIN_ID,
  username: 'ana.rodriguez',
  displayName: 'Ana Rodriguez',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const SESSION_CONTEXT = {
  userId: ADMIN_ID,
  companyId: COMPANY_ID,
  roleName: 'Administrador',
};

/** Igualdad ESTRICTA contra esto: un `roleName` o una empresa de otro origen lo pone en rojo. */
const ACTOR_ESPERADO: Actor = {
  id: ADMIN_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Puerto de revocacion que REVIENTA si se invoca: «no se toca» pasa a ser una afirmacion. */
function puertoQueNoDebeLlamarse() {
  const stampAll = vi.fn(async (): Promise<'ok' | 'not_found'> => {
    throw new Error('stampAll no debia invocarse');
  });
  const revokeSession = vi.fn(async (): Promise<void> => {
    throw new Error('revokeSession no debia invocarse');
  });
  const revocations: SessionRevocationRepository = { stampAll, revokeSession };
  return { revocations, stampAll, revokeSession };
}

/** Enchufa el caso de uso REAL a la fachada doblada. */
function cablearCasoDeUsoReal(revocations: SessionRevocationRepository): void {
  const real = createEndAllSessions({ revocations });
  endAllSessionsMock.mockImplementation((actor: Actor | null, id: string) => real(actor, id));
}

beforeEach(() => {
  vi.clearAllMocks();
  endAllSessionsMock.mockReset();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R5 — el exito no lleva ningun dato
// ---------------------------------------------------------------------------------------------

describe('QC-101 R5 — exito sin datos', () => {
  it('R5: con exito devuelve EXACTAMENTE { status: success } y ninguna clave mas', async () => {
    endAllSessionsMock.mockResolvedValue(undefined);

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(resultado).toEqual({ status: 'success' });
    // Claves EXACTAS: un `count`, un `sessions` o un `devices` que alguien anadiera lo pone rojo.
    expect(Object.keys(resultado)).toEqual(['status']);
  });

  it('R5: aunque el caso de uso devolviera algo, la action no lo propaga al estado', async () => {
    // El caso de uso devuelve `void` hoy; si manana alguien le hiciera devolver un numero, el
    // estado serializado seguiria sin llevarlo. Se simula ese valor y se busca en el JSON entero.
    endAllSessionsMock.mockResolvedValue({ closed: 5, sessionIds: ['sid-1'], devices: ['x'] });

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(resultado).toEqual({ status: 'success' });
    expect(JSON.stringify(resultado)).not.toMatch(/closed|sid-|devices|\d/);
  });
});

// ---------------------------------------------------------------------------------------------
// R1 — la action delega en `identity.endAllSessions` y no repite ninguna regla
// ---------------------------------------------------------------------------------------------

describe('QC-101 R1 — la action delega y no decide nada', () => {
  it('R1: llama a identity.endAllSessions una vez, con el actor y el id del campo oculto TAL CUAL', async () => {
    endAllSessionsMock.mockResolvedValue(undefined);

    await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(endAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(endAllSessionsMock).toHaveBeenCalledWith(ACTOR_ESPERADO, TARGET_ID);
  });

  it('R1: un id con espacios llega sin recortar, y un id ausente llega como cadena vacia', async () => {
    endAllSessionsMock.mockResolvedValue(undefined);

    await endAllSessionsAction({ status: 'idle' }, formData({ id: `  ${TARGET_ID} ` }));
    await endAllSessionsAction({ status: 'idle' }, formData({}));

    expect(endAllSessionsMock.mock.calls[0]?.[1]).toBe(`  ${TARGET_ID} `);
    expect(endAllSessionsMock.mock.calls[1]?.[1]).toBe('');
  });

  it('R1: con un actor SIN ningun permiso la action igual invoca el caso de uso (no filtra en el borde)', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });
    endAllSessionsMock.mockResolvedValue(undefined);

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    // Si la action repitiera `requirePermission`, el doble no registraria ninguna llamada y el
    // estado seria un error escrito en el borde. Quien decide es el service.
    expect(endAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(endAllSessionsMock).toHaveBeenCalledWith(
      { id: ADMIN_ID, companyId: COMPANY_ID, permissions: [] },
      TARGET_ID,
    );
    expect(resultado).toEqual({ status: 'success' });
  });

  it('R1: sin permiso sobre otra persona el rechazo sale del caso de uso REAL y el puerto no se toca', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: ['usuarios.consultar'] });
    const puerto = puertoQueNoDebeLlamarse();
    cablearCasoDeUsoReal(puerto.revocations);

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    expect(puerto.stampAll).not.toHaveBeenCalled();
    expect(puerto.revokeSession).not.toHaveBeenCalled();
  });

  it('R1: el estado previo no influye en el resultado', async () => {
    endAllSessionsMock.mockResolvedValue(undefined);

    const desdeIdle = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));
    const desdeError = await endAllSessionsAction(
      { status: 'error', code: 'unauthorized', message: 'lo que sea' },
      formData({ id: TARGET_ID }),
    );

    expect(desdeIdle).toEqual(desdeError);
  });
});

// ---------------------------------------------------------------------------------------------
// R2 — el actor sale de las DOS caras de la sesion, y es `null` si falta cualquiera
// ---------------------------------------------------------------------------------------------

describe('QC-101 R2 — el actor de las dos caras de la sesion', () => {
  it('R2: con sesion completa el actor es id y permisos de getSessionUser + empresa de getSessionContext', async () => {
    endAllSessionsMock.mockResolvedValue(undefined);

    await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(endAllSessionsMock.mock.calls[0]?.[0]).toStrictEqual(ACTOR_ESPERADO);
    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });

  const INCOMPLETAS: ReadonlyArray<readonly [string, () => void]> = [
    ['falta getSessionUser', () => getSessionUserMock.mockResolvedValue(null)],
    ['falta getSessionContext', () => getSessionContextMock.mockResolvedValue(null)],
    [
      'faltan las dos',
      () => {
        getSessionUserMock.mockResolvedValue(null);
        getSessionContextMock.mockResolvedValue(null);
      },
    ],
  ];

  for (const [caso, preparar] of INCOMPLETAS) {
    it(`R2: si ${caso}, el actor es null, la accion sigue y el caso de uso REAL rechaza sin tocar el puerto`, async () => {
      preparar();
      const puerto = puertoQueNoDebeLlamarse();
      cablearCasoDeUsoReal(puerto.revocations);

      const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

      // La accion SIGUE ADELANTE: invoca el caso de uso con `null`, sin error propio en el borde.
      expect(endAllSessionsMock).toHaveBeenCalledTimes(1);
      expect(endAllSessionsMock.mock.calls[0]?.[0]).toBeNull();
      expect(resultado).toEqual({
        status: 'error',
        code: 'unauthorized',
        message: errorMessage('unauthorized'),
      });
      expect(puerto.stampAll).not.toHaveBeenCalled();
      expect(puerto.revokeSession).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------------------------
// R6 — traduccion por `code`, nunca por mensaje; lo ajeno al dominio es `unexpected`
// ---------------------------------------------------------------------------------------------

describe('QC-101 R6 — traduccion de errores por su code estable', () => {
  it('R6: UnauthorizedError se traduce a code unauthorized con el mensaje del catalogo', async () => {
    endAllSessionsMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('R6: UserNotFoundError se traduce a code user_not_found con el mensaje del catalogo', async () => {
    endAllSessionsMock.mockRejectedValue(new UserNotFoundError());

    const resultado = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    expect(resultado).toEqual({
      status: 'error',
      code: 'user_not_found',
      message: errorMessage('user_not_found'),
    });
  });

  it('R6: la traduccion va por code y NUNCA por mensaje (un mensaje enganoso no cambia el code)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // El mismo `UserNotFoundError`, con un diagnostico que dice «unauthorized»: si la traduccion
    // leyera el texto, el code saldria cambiado. Y un error AJENO que se llama como un code del
    // catalogo tampoco se convierte en ese code.
    endAllSessionsMock.mockRejectedValueOnce(new UserNotFoundError('unauthorized'));
    const porCode = await endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    endAllSessionsMock.mockRejectedValueOnce(new Error('user_not_found'));
    const ajenoConNombreDeCode = await endAllSessionsAction(
      { status: 'idle' },
      formData({ id: TARGET_ID }),
    );

    expect(porCode).toMatchObject({ status: 'error', code: 'user_not_found' });
    expect(JSON.stringify(porCode)).not.toContain('unauthorized');
    expect(ajenoConNombreDeCode).toMatchObject({ status: 'error', code: 'unexpected' });
    log.mockRestore();
  });

  it('R6: un error que NO es de dominio devuelve unexpected con reference, no se relanza y no filtra su texto', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('conexion rechazada a revoked_sessions');
    endAllSessionsMock.mockRejectedValue(ajeno);

    const promesa = endAllSessionsAction({ status: 'idle' }, formData({ id: TARGET_ID }));

    await expect(promesa).resolves.toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    });
    const resultado = await promesa;
    expect(JSON.stringify(resultado)).not.toContain('conexion rechazada');
    // No se descarta: el detalle llega entero al registro del servidor, y solo ahi.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(ajeno.message));
    log.mockRestore();
  });
});
