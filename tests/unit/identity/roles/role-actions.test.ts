// QC-94 T11 — La Server Action del catalogo de roles
// (`lib/modules/identity/adapters/driving/role-actions.ts`, `design.md > 6`, `> 9.1`).
//
// Cubre:
//   - **R13**: la FORMA DE ENTRADA. `listRolesAction` no recibe `FormData` y, de hecho, no recibe
//     NADA: su aridad declarada es 0 y se invoca sin argumentos. Lo que viaja al caso de uso es el
//     actor y SOLO el actor —un unico argumento—, que es la forma mas pequena de cumplir R12.
//   - **R6**: el actor sale de las DOS CARAS de la sesion via `@/lib/composition`
//     —`getSessionUser()` el id y el conjunto de permisos, `getSessionContext()` la EMPRESA— y si
//     falta CUALQUIERA de las dos el actor es `null`. Los dos casos se prueban POR SEPARADO y
//     contra el caso de uso REAL, con un puerto que revienta si alguien lo llama: asi «no llega al
//     puerto» es una afirmacion y no una ausencia de asercion.
//   - **R14**: `UnauthorizedError` se traduce a `{ status: 'error', code: 'unauthorized' }` POR EL
//     CODIGO —se demuestra mutando el texto del mensaje y viendo que el resultado no cambia—, y un
//     error ajeno al dominio sale como `unexpected` sin filtrar su texto.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/identity/usuarios/user-actions.test.ts`: la action se prueba contra dobles, nunca
// contra la sesion real. Que la autorizacion rechace de verdad lo prueba
// `list-roles-authorization.test.ts` contra el dominio real; aqui lo que se demuestra es que la
// action NO DECIDE NADA, resuelve el actor y traduce.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import { UnauthorizedError } from '@/lib/modules/identity';
import { listRolesAction } from '@/lib/modules/identity/adapters/driving/role-actions';
import { createListRoles } from '@/lib/modules/identity/domain/list-roles';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { RoleOption } from '@/lib/modules/identity/domain/role-view';
import type { RoleCatalogRepository } from '@/lib/modules/identity/ports/role-catalog-repository';

const { getSessionUserMock, getSessionContextMock, listRolesMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  listRolesMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    listRoles: listRolesMock,
  },
}));

/** La sesion conserva `roleName` porque es DISPLAY (lo pinta `nav-user`), pero la action no lo
 *  mira: lo que viaja al caso de uso es el CONJUNTO DE PERMISOS (R4). */
const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar'],
};

/** La OTRA cara de la sesion: de aqui sale la EMPRESA. */
const SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-1',
  roleName: 'Administrador',
};

/** Igualdad ESTRICTA contra esto es lo que pone en rojo un `roleName` o un `companyId` que
 *  llegaran de otro sitio. */
const ACTOR_ESPERADO: Actor = {
  id: 'user-admin-1',
  companyId: 'company-1',
  permissions: ['usuarios.consultar'],
};

const CATALOGO: readonly RoleOption[] = [
  { id: 'r1', name: 'Administrador' },
  { id: 'r2', name: 'Operador' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R13 — LA FORMA DE ENTRADA: ningun `FormData`, ningun argumento.
// ---------------------------------------------------------------------------------------------

describe('R13 — listRolesAction no recibe FormData: no recibe NADA', () => {
  it('su aridad declarada es 0', () => {
    // Si alguien le anadiera un parametro —una consulta, un `FormData`, un `prevState`— esto cae.
    // La aridad es la forma de entrada escrita en el tipo, no la promesa de un comentario.
    expect(listRolesAction).toHaveLength(0);
  });

  it('se invoca SIN argumentos y devuelve el catalogo tal cual lo da el caso de uso', async () => {
    listRolesMock.mockResolvedValue(CATALOGO);

    const resultado = await listRolesAction();

    expect(resultado).toEqual({ status: 'success', data: CATALOGO });
  });

  it('al caso de uso le llega el actor y SOLO el actor: un unico argumento', async () => {
    listRolesMock.mockResolvedValue(CATALOGO);

    await listRolesAction();

    expect(listRolesMock).toHaveBeenCalledTimes(1);
    expect(listRolesMock).toHaveBeenCalledWith(ACTOR_ESPERADO);
    expect(listRolesMock.mock.calls[0]).toHaveLength(1);
  });

  it('las dos caras de la sesion se consultan una vez por invocacion', async () => {
    listRolesMock.mockResolvedValue(CATALOGO);

    await listRolesAction();

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// R6 — LAS DOS CARAS DE LA SESION, cada una por separado. Sin una de ellas el actor es `null`, el
// caso de uso REAL rechaza con `unauthorized` y el PUERTO no se toca.
// ---------------------------------------------------------------------------------------------

/** Puerto doble que REVIENTA si alguien lo llama: es lo que convierte «no llega al puerto» en una
 *  afirmacion y no en una ausencia de asercion. */
function puertoQueNoDebeLlamarse(): {
  readonly roles: RoleCatalogRepository;
  readonly listAll: ReturnType<typeof vi.fn>;
} {
  const listAll = vi.fn(async (): Promise<never> => {
    throw new Error('listAll no debia invocarse: la sesion estaba incompleta');
  });
  return { roles: { listAll } as unknown as RoleCatalogRepository, listAll };
}

/** Cablea el caso de uso REAL sobre el puerto que revienta y lo enchufa a la fachada doblada,
 *  para que la action invoque dominio de verdad en vez de otro doble. */
function cablearCasoDeUsoReal(): ReturnType<typeof puertoQueNoDebeLlamarse> {
  const puerto = puertoQueNoDebeLlamarse();
  const listRolesReal = createListRoles({ roles: puerto.roles });
  listRolesMock.mockImplementation((actor: Actor | null) => listRolesReal(actor));
  return puerto;
}

describe('R6 — falta la PRIMERA cara: no hay getSessionUser', () => {
  it('responde unauthorized con actor null y sin tocar el puerto', async () => {
    const puerto = cablearCasoDeUsoReal();
    getSessionUserMock.mockResolvedValue(null);
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

    const resultado = await listRolesAction();

    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    // La action no adivina la empresa ni rellena el conjunto de permisos cuando falta una cara.
    expect(listRolesMock.mock.calls[0]?.[0]).toBeNull();
    expect(puerto.listAll).not.toHaveBeenCalled();
  });
});

describe('R6 — falta la SEGUNDA cara: no hay getSessionContext (la EMPRESA)', () => {
  it('responde unauthorized con actor null y sin tocar el puerto, aunque la consulta no use la empresa', async () => {
    // R11 dice que el catalogo es GLOBAL y que la consulta no se acota por empresa; R6 dice que el
    // actor se construye con LAS DOS caras. No se contradicen: «no hay sesion completa» no puede
    // ser mas permisivo aqui que en el resto del modulo (`design.md > 6`).
    const puerto = cablearCasoDeUsoReal();
    getSessionUserMock.mockResolvedValue(SESSION_USER);
    getSessionContextMock.mockResolvedValue(null);

    const resultado = await listRolesAction();

    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    expect(listRolesMock.mock.calls[0]?.[0]).toBeNull();
    expect(puerto.listAll).not.toHaveBeenCalled();
  });
});

describe('R6 — con las DOS caras el actor lleva id, empresa y permisos, y nada mas', () => {
  it('ni el `username` ni el `roleName` de la sesion viajan al caso de uso', async () => {
    // Igualdad ESTRICTA: si la action colara `roleName`, R4 se estaria rompiendo por el borde.
    listRolesMock.mockResolvedValue(CATALOGO);

    await listRolesAction();

    expect(listRolesMock.mock.calls[0]?.[0]).toStrictEqual(ACTOR_ESPERADO);
  });
});

// ---------------------------------------------------------------------------------------------
// R14 — LA TRADUCCION, POR EL `code` ESTABLE Y NUNCA POR EL TEXTO DEL MENSAJE.
// ---------------------------------------------------------------------------------------------

describe('R14 — los errores se traducen por su `code`', () => {
  it('UnauthorizedError sale como { status: error, code: unauthorized }', async () => {
    listRolesMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await listRolesAction();

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('y sale igual con el TEXTO del mensaje cambiado: decide el codigo, no la frase', async () => {
    // Esta es la afirmacion que distingue «traduce por `code`» de «traduce por el mensaje». El
    // mensaje puede cambiar de redaccion o de idioma sin romper a QC-67, y aqui se demuestra.
    const error = new UnauthorizedError();
    Object.defineProperty(error, 'message', { value: 'una frase completamente distinta' });

    listRolesMock.mockRejectedValue(error);

    const resultado = await listRolesAction();

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    expect(JSON.stringify(resultado)).not.toContain('una frase completamente distinta');
  });

  it('un error que NO es de dominio sale como `unexpected` y no filtra su texto', async () => {
    // Nada de `catch` que descarte un error: el detalle real —traza, SQL, nombres de tabla— va al
    // registro del servidor y solo ahi (`docs/conventions.md > Manejo de errores`).
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('la base de datos no responde');
    listRolesMock.mockRejectedValue(ajeno);

    const resultado = await listRolesAction();

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
    });
    expect(JSON.stringify(resultado)).not.toContain('la base de datos no responde');
    expect(log).toHaveBeenCalledWith({ code: 'unexpected', cause: ajeno });
    log.mockRestore();
  });
});
