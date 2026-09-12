// QC-79 T18 — Las DOS Server Actions del enlace de credencial
// (`lib/modules/identity/adapters/driving/credential-setup-actions.ts`, `design.md > 5.3`).
//
// Cubre:
//   - **R18**: la action PUBLICA no resuelve actor y **no lee ninguna sesion**. Se prueba con
//     dobles de `getSessionUser` y `getSessionContext` que **revientan si alguien los llama**: asi
//     «no lee la sesion» es una afirmacion y no una ausencia de asercion.
//   - **R33**: las dos reciben `FormData` de verdad, y los campos viajan TAL CUAL —sin `trim`, sin
//     conversion y sin valor por defecto, que es lo que QC-19 R10 prohibe expresamente—.
//   - **R34**: un error de dominio se traduce por su `code` ESTABLE con el traductor UNICO de
//     QC-70; el inesperado vuelve con su mensaje neutro y con su `reference` de QC-71, y el texto
//     original va al registro del servidor y solo ahi. Ningun `catch` descarta un error.
//   - **R5, R13**: el estado SERIALIZADO no contiene el secreto que el doble emitio. Se afirma
//     sobre el JSON completo —claves Y valores—, no sobre una clave que hubiera que acertar.
//   - **R14, R30**: el reenvio si resuelve el actor de las dos caras, falla cerrado, y distingue
//     `'sent'` de `'failed'`.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/identity/usuarios/user-actions.test.ts`: la action se testea contra dobles, nunca
// contra la sesion real. Que la autorizacion rechace de verdad y que los seis casos de R22 sean
// indistinguibles lo prueban los casos de uso contra el dominio real; aqui lo que se demuestra es
// que la action **NO DECIDE NADA** y traduce.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage, type ErrorCode } from '@/lib/modules/errores';
import {
  CredentialConfirmationMismatchError,
  CredentialLinkInvalidError,
  CredentialPolicyRejectedError,
  UnauthorizedError,
  UserNotFoundError,
  UserNotPendingError,
  ValidationError,
} from '@/lib/modules/identity';
import {
  resendCredentialSetupLinkAction,
  setCredentialWithLinkAction,
} from '@/lib/modules/identity/adapters/driving/credential-setup-actions';

/**
 * El secreto que «emitio» el doble. Es un valor reconocible a simple vista: si apareciera en
 * cualquier parte del estado serializado, el `not.toContain` de mas abajo lo caza.
 */
const SECRETO_DEL_ENLACE = 'secreto-del-enlace-que-no-debe-salir-jamas';

const {
  getSessionUserMock,
  getSessionContextMock,
  setCredentialWithLinkMock,
  issueCredentialSetupLinkMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  setCredentialWithLinkMock: vi.fn(),
  issueCredentialSetupLinkMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

// QC-71 (R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera del
// identificador y se la pasa al traductor unico. Sin ella en el doble el modulo ni carga; con
// ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '9b2c4d6e-1f30-4a58-8c77-5e1a2b3c4d5e';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    setCredentialWithLink: setCredentialWithLinkMock,
    issueCredentialSetupLink: issueCredentialSetupLinkMock,
  },
}));

const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-1',
  roleName: 'Administrador',
};

const ACTOR_ESPERADO = {
  id: 'user-admin-1',
  companyId: 'company-1',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** Los tres campos de la pagina publica: el secreto del campo OCULTO, la contrasena y su
 *  confirmacion (`design.md > 5.2`). */
const CAMPOS_PUBLICOS = {
  secret: SECRETO_DEL_ENLACE,
  credential: 'Una-Contrasena-Larga-9',
  credentialConfirmation: 'Una-Contrasena-Larga-9',
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Doble de sesion que REVIENTA si alguien lo llama. Es lo que convierte «la action publica no
 *  lee ninguna sesion» (R18) en una afirmacion. */
function laSesionNoDebeLeerse(): void {
  getSessionUserMock.mockImplementation(() => {
    throw new Error('getSessionUser no debia invocarse: la pagina de R17 es PUBLICA');
  });
  getSessionContextMock.mockImplementation(() => {
    throw new Error('getSessionContext no debia invocarse: la pagina de R17 es PUBLICA');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R18 — la action PUBLICA no lee ninguna sesion, ninguna cookie y ninguna cabecera de identidad.
// ---------------------------------------------------------------------------------------------

describe('R18 — setCredentialWithLinkAction no resuelve actor ni lee sesion', () => {
  it('con exito: ninguna de las dos caras de la sesion se consulta', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockResolvedValue(undefined);

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(getSessionUserMock).not.toHaveBeenCalled();
    expect(getSessionContextMock).not.toHaveBeenCalled();
  });

  it('el caso de uso recibe UN solo argumento: no hay actor por ningun lado', async () => {
    // La firma sin actor ES R18. Si alguien colara un actor como primer argumento «para reusar el
    // patron de las seis de QC-66», esta linea se pondria roja.
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockResolvedValue(undefined);

    await setCredentialWithLinkAction({ status: 'idle' }, formData(CAMPOS_PUBLICOS));

    expect(setCredentialWithLinkMock.mock.calls[0]).toHaveLength(1);
  });

  it('con una sesion ABIERTA de otra persona el resultado es exactamente el mismo', async () => {
    // R18, literal: «una sesion abierta de otra persona NO DEBE cambiar su resultado».
    setCredentialWithLinkMock.mockResolvedValue(undefined);
    getSessionUserMock.mockResolvedValue(SESSION_USER);
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(setCredentialWithLinkMock.mock.calls[0]).toHaveLength(1);
  });

  it('tambien cuando el enlace es invalido: el rechazo no depende de quien mire', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockRejectedValue(new CredentialLinkInvalidError());

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'credential_link_invalid' });
    expect(getSessionUserMock).not.toHaveBeenCalled();
    expect(getSessionContextMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// R33 — `FormData` de verdad, y los campos TAL CUAL.
// ---------------------------------------------------------------------------------------------

describe('R33 — las dos actions reciben FormData y no interpretan nada', () => {
  it('la publica lee el secreto del campo oculto y las dos contrasenas SIN normalizarlas', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockResolvedValue(undefined);

    // Un espacio al final es PARTE de la contrasena (QC-19 R10): si la action hiciera `trim`,
    // guardaria una contrasena distinta de la que la persona escribio y este caso lo caza.
    const conEspacio = {
      secret: `  ${SECRETO_DEL_ENLACE}  `,
      credential: 'Una-Contrasena-Larga-9 ',
      credentialConfirmation: 'Una-Contrasena-Larga-9 ',
    };
    await setCredentialWithLinkAction({ status: 'idle' }, formData(conEspacio));

    expect(setCredentialWithLinkMock).toHaveBeenCalledWith(conEspacio);
  });

  it('un campo AUSENTE llega como null y lo rechaza el dominio, no la action', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockRejectedValue(new ValidationError());

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData({ secret: SECRETO_DEL_ENLACE }),
    );

    expect(setCredentialWithLinkMock).toHaveBeenCalledWith({
      secret: SECRETO_DEL_ENLACE,
      credential: null,
      credentialConfirmation: null,
    });
    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
  });

  it('el reenvio lee el identificador del FormData y lo pasa sin juzgarlo', async () => {
    issueCredentialSetupLinkMock.mockResolvedValue({ mail: 'sent' });

    const resultado = await resendCredentialSetupLinkAction(
      { status: 'idle' },
      formData({ userId: USER_ID }),
    );

    expect(issueCredentialSetupLinkMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      userId: USER_ID,
    });
    expect(resultado).toEqual({ status: 'success', mail: 'sent' });
  });

  it('la action publica revalida SU PROPIA ruta y ninguna otra', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockResolvedValue(undefined);

    await setCredentialWithLinkAction({ status: 'idle' }, formData(CAMPOS_PUBLICOS));

    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/establecer-contrasena');
  });

  it('el reenvio no revalida ninguna ruta: la pantalla que lo ofrece es de QC-67', async () => {
    issueCredentialSetupLinkMock.mockResolvedValue({ mail: 'sent' });

    await resendCredentialSetupLinkAction({ status: 'idle' }, formData({ userId: USER_ID }));

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// R5, R13 — EL SECRETO NO SALE EN NINGUN ESTADO.
// ---------------------------------------------------------------------------------------------

describe('R5, R13 — el estado serializado no contiene el secreto que el doble emitio', () => {
  const ESTADOS: ReadonlyArray<{
    readonly nombre: string;
    readonly preparar: () => void;
  }> = [
    { nombre: 'exito', preparar: () => setCredentialWithLinkMock.mockResolvedValue(undefined) },
    {
      nombre: 'confirmacion que no coincide',
      preparar: () =>
        setCredentialWithLinkMock.mockRejectedValue(new CredentialConfirmationMismatchError()),
    },
    {
      nombre: 'politica rechazada',
      preparar: () =>
        setCredentialWithLinkMock.mockRejectedValue(
          new CredentialPolicyRejectedError(['min_length', 'no_digit']),
        ),
    },
    {
      nombre: 'enlace invalido',
      preparar: () => setCredentialWithLinkMock.mockRejectedValue(new CredentialLinkInvalidError()),
    },
    {
      nombre: 'error inesperado',
      preparar: () => setCredentialWithLinkMock.mockRejectedValue(new Error('fallo del proveedor')),
    },
  ];

  for (const caso of ESTADOS) {
    it(`con ${caso.nombre}, el JSON completo del estado no lleva el secreto ni la contrasena`, async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      laSesionNoDebeLeerse();
      caso.preparar();

      const resultado = await setCredentialWithLinkAction(
        { status: 'idle' },
        formData(CAMPOS_PUBLICOS),
      );

      // Se inspecciona el JSON entero —claves Y valores—, que es lo que de verdad cruza hacia el
      // cliente, y no una clave concreta que hubiera que acertar de antemano.
      const serializado = JSON.stringify(resultado);
      expect(serializado).not.toContain(SECRETO_DEL_ENLACE);
      expect(serializado).not.toContain(CAMPOS_PUBLICOS.credential);
      // `contrase` NO entra en este patron a proposito: el texto del catalogo de QC-70 para
      // `credential_link_invalid` es una frase en espanol que la nombra («...para establecer la
      // contrasena...»), y eso es la UI hablando, no una credencial filtrada. Lo que se prohibe
      // es el VALOR: el secreto, la candidata, una huella o un hash bcrypt.
      expect(serializado).not.toMatch(/password|secret|digest|hash|\$2[aby]\$/i);
      log.mockRestore();
    });
  }

  it('el estado del REENVIO tampoco lleva el secreto ni el correo del destinatario', async () => {
    // El caso de uso devuelve solo `{ mail }` (`design.md > 5.3`): no hay hueco donde colar el
    // secreto ni la direccion, que es PII y que quien reenvia ya ve en el listado.
    issueCredentialSetupLinkMock.mockResolvedValue({ mail: 'failed' });

    const resultado = await resendCredentialSetupLinkAction(
      { status: 'idle' },
      formData({ userId: USER_ID }),
    );

    expect(resultado).toEqual({ status: 'success', mail: 'failed' });
    expect(Object.keys(resultado).sort()).toEqual(['mail', 'status']);
    expect(JSON.stringify(resultado)).not.toMatch(/secret|@|digest|hash/i);
  });
});

// ---------------------------------------------------------------------------------------------
// R34 — la traduccion, con el traductor UNICO de QC-70 y por el `code` estable.
// ---------------------------------------------------------------------------------------------

describe('R34 — traduccion de errores de dominio por su code estable', () => {
  const LOS_CUATRO: ReadonlyArray<{ readonly error: Error; readonly code: ErrorCode }> = [
    { error: new CredentialLinkInvalidError(), code: 'credential_link_invalid' },
    { error: new UnauthorizedError(), code: 'unauthorized' },
    { error: new UserNotFoundError(), code: 'user_not_found' },
    { error: new UserNotPendingError(), code: 'user_not_pending' },
  ];

  for (const caso of LOS_CUATRO) {
    it(`resendCredentialSetupLinkAction traduce ${caso.error.constructor.name} a '${caso.code}'`, async () => {
      issueCredentialSetupLinkMock.mockRejectedValue(caso.error);

      const resultado = await resendCredentialSetupLinkAction(
        { status: 'idle' },
        formData({ userId: USER_ID }),
      );

      // Se afirma sobre `code`, NO sobre `message`: el texto puede cambiar de redaccion o de
      // idioma sin que la UI se entere, y un test que mirase el mensaje lo impediria.
      expect(resultado).toMatchObject({ status: 'error', code: caso.code });
    });
  }

  it('el mensaje sale del CATALOGO por el code, y el estado son exactamente tres campos', async () => {
    setCredentialWithLinkMock.mockRejectedValue(new CredentialLinkInvalidError());

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toEqual({
      status: 'error',
      code: 'credential_link_invalid',
      message: errorMessage('credential_link_invalid'),
    });
  });

  it('un error AJENO al dominio vuelve como `unexpected` con su reference de QC-71', async () => {
    // R34: el inesperado conserva su identificador de peticion y su mensaje neutro, y el texto
    // original va al registro del servidor —que es el unico sitio donde aparece—. Nada se descarta.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    setCredentialWithLinkMock.mockRejectedValue(ajeno);

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('fallo de infraestructura');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`,
      ),
    );
    log.mockRestore();
  });

  it('el reenvio inesperado tambien lleva su reference', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    issueCredentialSetupLinkMock.mockRejectedValue(new Error('el proveedor no responde'));

    const resultado = await resendCredentialSetupLinkAction(
      { status: 'idle' },
      formData({ userId: USER_ID }),
    );

    expect(resultado).toMatchObject({ code: 'unexpected', reference: REQUEST_ID_DE_PRUEBA });
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------
// Los dos rechazos de FORMULARIO: variantes propias, NO `ErrorState` (`design.md > 11.3`).
// ---------------------------------------------------------------------------------------------

describe('R23 — los rechazos de formulario no pasan por el catalogo de errores', () => {
  it('la confirmacion que no coincide devuelve `mismatch` y ningun dato mas', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockRejectedValue(new CredentialConfirmationMismatchError());

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    // Ni un largo, ni un fragmento: que no coincidieron es todo lo que hay que decir (R5).
    expect(resultado).toEqual({ status: 'mismatch' });
  });

  it('la politica rechazada devuelve las REGLAS INCUMPLIDAS, que son codigos estables', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockRejectedValue(
      new CredentialPolicyRejectedError(['min_length', 'no_uppercase']),
    );

    const resultado = await setCredentialWithLinkAction(
      { status: 'idle' },
      formData(CAMPOS_PUBLICOS),
    );

    expect(resultado).toEqual({
      status: 'invalid_credential',
      unmet: ['min_length', 'no_uppercase'],
    });
    // No es un `ErrorState`: no tiene `code` ni `message` (`design.md > 11.3`).
    expect(Object.keys(resultado).sort()).toEqual(['status', 'unmet']);
  });

  it('un rechazo de politica NO revalida nada: no se escribio ninguna fila', async () => {
    laSesionNoDebeLeerse();
    setCredentialWithLinkMock.mockRejectedValue(new CredentialPolicyRejectedError(['no_digit']));

    await setCredentialWithLinkAction({ status: 'idle' }, formData(CAMPOS_PUBLICOS));

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// R14 — el reenvio SI resuelve el actor, de las DOS caras, y falla cerrado.
// ---------------------------------------------------------------------------------------------

describe('R14 — el actor del reenvio sale de las dos caras de la sesion', () => {
  it('las dos caras se consultan una vez por invocacion', async () => {
    issueCredentialSetupLinkMock.mockResolvedValue({ mail: 'sent' });

    await resendCredentialSetupLinkAction({ status: 'idle' }, formData({ userId: USER_ID }));

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });

  it('sin la PRIMERA cara el actor es null y el caso de uso lo recibe asi', async () => {
    getSessionUserMock.mockResolvedValue(null);
    issueCredentialSetupLinkMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await resendCredentialSetupLinkAction(
      { status: 'idle' },
      formData({ userId: USER_ID }),
    );

    expect(issueCredentialSetupLinkMock.mock.calls[0]?.[0]).toBeNull();
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('sin la SEGUNDA cara tampoco se inventa la empresa', async () => {
    // La EMPRESA solo sale del contexto de sesion (R15): si alguien la «arreglase» rellenandola,
    // este caso se pondria rojo.
    getSessionContextMock.mockResolvedValue(null);
    issueCredentialSetupLinkMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await resendCredentialSetupLinkAction(
      { status: 'idle' },
      formData({ userId: USER_ID }),
    );

    expect(issueCredentialSetupLinkMock.mock.calls[0]?.[0]).toBeNull();
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });
});
