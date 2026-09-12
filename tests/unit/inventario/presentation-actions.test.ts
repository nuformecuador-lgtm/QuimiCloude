// T12 — Server Actions de presentacion (`design.md > 5`, `> 6.4`). Mockea `@/lib/composition`
// igual que `product-actions.test.ts`, pero afirma lo que es PROPIO de presentacion, no un
// calco: presentacion no convierte numeros (solo tiene `name`, T18/AVISO PRINCIPAL de la
// tanda), y en cambio tiene dos errores de dominio que producto no tiene:
// `PresentationDuplicateNameError` (R18) y `PresentationInUseError` (R21) al borrar con productos
// asignados. Tambien afirma la distincion de R37/D22: un nombre que normaliza a vacio se
// rechaza como entrada invalida, no como duplicado.

import {
  createPresentationAction,
  deletePresentationAction,
  listPresentationsAction,
  updatePresentationAction,
  type CreatePresentationFormState,
  type PresentationMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { errorMessage } from '@/lib/modules/errores';
import {
  PresentationDuplicateNameError,
  PresentationInUseError,
  PresentationNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario';

const {
  createPresentationMock,
  updatePresentationMock,
  deletePresentationMock,
  listPresentationsMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  createPresentationMock: vi.fn(),
  updatePresentationMock: vi.fn(),
  deletePresentationMock: vi.fn(),
  listPresentationsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  // QC-49 (R12): la SEGUNDA cara de la sesion. La action pide las dos en paralelo y la
  // empresa sale de esta, nunca del `FormData`.
  getSessionContextMock: vi.fn(),
}));

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  inventario: {
    createPresentation: createPresentationMock,
    updatePresentation: updatePresentationMock,
    deletePresentation: deletePresentationMock,
    listPresentations: listPresentationsMock,
  },
}));

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  // `roleName` se queda porque `SessionUser` lo conserva para pintar (display), pero la
  // action YA NO lo lee: QC-74 (R18) construye el actor con `permissions` y nada mas.
  roleName: 'Administrador',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/**
 * QC-49 (R12, `design.md > 4.1`): el contexto de sesion del SERVIDOR, de donde -y solo de
 * donde- sale la empresa en cuyo nombre opera la action.
 */
const ADMIN_SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-a',
  roleName: 'Administrador',
};

/** El actor que la action debe construir a partir de esa sesion (QC-74, design.md > 4). */
const ADMIN_ACTOR = {
  id: 'user-admin-1',
  // QC-49 (R11): la empresa viaja DENTRO del actor, tomada del contexto de sesion.
  companyId: 'company-a',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

/** QC-80: el uuid de unidad que viaja en el `FormData` con el nombre `unitId`. */
const UNIDAD = '11111111-1111-4111-8111-111111111111';

const CREATE_INITIAL: CreatePresentationFormState = { status: 'idle' };
const MUTATION_INITIAL: PresentationMutationFormState = { status: 'idle' };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
});

describe('createPresentationAction', () => {
  it('toma el actor de identity.getSessionUser() y se lo pasa al caso de uso (R1)', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-1' });

    await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon', unitId: UNIDAD }));

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    const [, actor] = createPresentationMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toEqual(ADMIN_ACTOR);
  });

  it('devuelve exito con el id creado cuando el caso de uso resuelve', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-42' });

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon', unitId: UNIDAD }));

    expect(result).toEqual({ status: 'success', id: 'presentation-42' });
  });

  it('traduce PresentationDuplicateNameError a su code estable (R18): a diferencia de producto, el nombre de presentacion es unico', async () => {
    createPresentationMock.mockRejectedValue(new PresentationDuplicateNameError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon', unitId: UNIDAD }));

    expect(result).toEqual({
      status: 'error',
      code: 'presentation_duplicate_name',
      message: expect.any(String),
    });
  });

  it('traduce ValidationError con invalid_input, no con duplicate_name, cuando el nombre normaliza a vacio (R37, D22)', async () => {
    // "---" no tiene ningun caracter valido tras normalizar: el dominio lo rechaza como
    // ValidationError, NUNCA como PresentationDuplicateNameError, aunque exista otra presentacion con
    // el mismo nombre normalizado vacio. Es la distincion de R37/D22 que solo aplica aqui.
    createPresentationMock.mockRejectedValue(new ValidationError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: '---', unitId: UNIDAD }));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
    expect(result.status === 'error' && result.code).not.toBe('presentation_duplicate_name');
  });

  // La action no valida `name` por su cuenta: la validacion vive en
  // domain/presentation-input.ts, dentro del caso de uso. Por eso este test no puede
  // discriminar entre nombre vacio, de solo espacios o de mas de 60 caracteres -- el mock
  // rechaza incondicionalmente y el valor de `name` no influye en el resultado. Esa
  // discriminacion la cubre tests/unit/inventario/presentation-service.test.ts (y los
  // esquemas en tests/unit/inventario/product-input.test.ts), donde si se ejercita el
  // esquema zod de verdad.
  it('traduce ValidationError a invalid_input', async () => {
    createPresentationMock.mockRejectedValue(new ValidationError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: '', unitId: UNIDAD }));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });

  // QC-70 (R12, R13): antes este caso fijaba el RELANZADO (`rejects.toThrow`). La decision
  // cerrada del 2026-09-08 lo cambia: el error ajeno a la familia se traduce a `unexpected`
  // con el mensaje neutro del catalogo, y el detalle real va al log del servidor y solo ahi.
  // Por eso el caso no solo mira el codigo: comprueba que NINGUN campo del estado -ni el
  // serializado entero- contiene el texto del error original.
  it('devuelve el estado generico, sin filtrar el error que no es de dominio (R12, R13)', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    createPresentationMock.mockRejectedValue(ajeno);

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon', unitId: UNIDAD }));

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la
      // peticion —el mismo que se escribio en la linea del registro—, y su ausencia ya no
      // compila (R16). El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');
    for (const value of Object.values(result)) {
      expect(String(value)).not.toContain('fallo de infraestructura');
    }
    // R14: el detalle si llega al registro del servidor, que es el unico sitio donde aparece.
    // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
    // linea de texto con el identificador, el origen, el codigo y el detalle del error —nombre,
    // mensaje y traza, y nada mas—. Lo que este caso fijaba NO se relaja: el texto del error
    // original sigue llegando entero al registro, y solo ahi.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
    );

    logSpy.mockRestore();
  });

  it('pasa el unitId del FormData al caso de uso TAL CUAL, sin decidir nada (R10, R11)', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-1' });

    await createPresentationAction(
      CREATE_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: UNIDAD }),
    );

    expect(createPresentationMock).toHaveBeenCalledWith(
      { name: 'Bidon 20 L', unitId: UNIDAD },
      ADMIN_ACTOR,
    );
  });

  it('no inventa ninguna unidad cuando el FormData no la trae: baja la cadena vacia (R10)', async () => {
    // La action NO decide: no pone defecto, no omite el campo, no traduce. Quien rechaza la
    // cadena vacia es `createPresentationSchema` dentro del caso de uso, y el rechazo vuelve
    // como `{ code, message }`.
    createPresentationMock.mockRejectedValue(new ValidationError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' }));

    expect(createPresentationMock).toHaveBeenCalledWith(
      { name: 'Bidon', unitId: '' },
      ADMIN_ACTOR,
    );
    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });

  it('traduce unauthorized cuando no hay sesion (falla cerrado, R3)', async () => {
    getSessionUserMock.mockResolvedValue(null);
    createPresentationMock.mockRejectedValue(new UnauthorizedError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon', unitId: UNIDAD }));

    const [, actor] = createPresentationMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toBeNull();
    expect(result).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) });
  });
});

describe('updatePresentationAction', () => {
  it('llama al caso de uso con el id, el nombre y el actor de la sesion', async () => {
    updatePresentationMock.mockResolvedValue(undefined);

    await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: UNIDAD }),
    );

    expect(updatePresentationMock).toHaveBeenCalledWith(
      'presentation-1',
      { name: 'Bidon 20 L', unitId: UNIDAD },
      ADMIN_ACTOR,
    );
  });

  it('pasa el unitId del FormData a la edicion, que es reemplazo completo (R12)', async () => {
    updatePresentationMock.mockResolvedValue(undefined);
    const otra = '22222222-2222-4222-8222-222222222222';

    await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: otra }),
    );

    expect(updatePresentationMock).toHaveBeenCalledWith(
      'presentation-1',
      { name: 'Bidon 20 L', unitId: otra },
      ADMIN_ACTOR,
    );
  });

  it('devuelve el rechazo de la unidad como { code, message }, sin excepcion que se escape (R10, R12)', async () => {
    updatePresentationMock.mockRejectedValue(new ValidationError());

    const result = await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: 'no-es-un-uuid' }),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });

  it('traduce PresentationDuplicateNameError al renombrar con un nombre normalizado ya usado por otra fila (R18)', async () => {
    updatePresentationMock.mockRejectedValue(new PresentationDuplicateNameError());

    const result = await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: UNIDAD }),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'presentation_duplicate_name',
      message: expect.any(String),
    });
  });

  it('traduce not_found a su code estable (R14)', async () => {
    updatePresentationMock.mockRejectedValue(new PresentationNotFoundError());

    const result = await updatePresentationAction(
      'no-existe',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon', unitId: UNIDAD }),
    );

    expect(result).toEqual({ status: 'error', code: 'presentation_not_found', message: expect.any(String) });
  });

  it('devuelve exito cuando el caso de uso resuelve', async () => {
    updatePresentationMock.mockResolvedValue(undefined);

    const result = await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L', unitId: UNIDAD }),
    );

    expect(result).toEqual({ status: 'success' });
  });
});

describe('deletePresentationAction', () => {
  it('rechaza cuando falta el id, ANTES de llamar al caso de uso (R28)', async () => {
    const result = await deletePresentationAction(MUTATION_INITIAL, formDataOf({}));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
    expect(deletePresentationMock).not.toHaveBeenCalled();
  });

  it('llama al caso de uso con el id y el actor de la sesion, y traduce exito', async () => {
    deletePresentationMock.mockResolvedValue(undefined);

    const result = await deletePresentationAction(
      MUTATION_INITIAL,
      formDataOf({ id: 'presentation-1' }),
    );

    expect(deletePresentationMock).toHaveBeenCalledWith('presentation-1', ADMIN_ACTOR);
    expect(result).toEqual({ status: 'success' });
  });

  it('traduce PresentationInUseError a su code estable al borrar una presentacion con productos asignados (R21): producto no tiene este error', async () => {
    deletePresentationMock.mockRejectedValue(new PresentationInUseError());

    const result = await deletePresentationAction(
      MUTATION_INITIAL,
      formDataOf({ id: 'presentation-1' }),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'presentation_in_use',
      message: expect.any(String),
    });
  });

  it('traduce not_found a su code estable (R14)', async () => {
    deletePresentationMock.mockRejectedValue(new PresentationNotFoundError());

    const result = await deletePresentationAction(
      MUTATION_INITIAL,
      formDataOf({ id: 'no-existe' }),
    );

    expect(result).toEqual({ status: 'error', code: 'presentation_not_found', message: expect.any(String) });
  });
});

describe('listPresentationsAction', () => {
  it('toma el actor de la sesion y pasa la consulta tal cual al caso de uso, sin revalidar aqui', async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
    listPresentationsMock.mockResolvedValue(page);

    const result = await listPresentationsAction({ page: 1, pageSize: 10 });

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(listPresentationsMock).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      ADMIN_ACTOR,
    );
    expect(result).toEqual({ status: 'success', data: page });
  });

  it('traduce invalid_input cuando el caso de uso rechaza la consulta', async () => {
    listPresentationsMock.mockRejectedValue(new ValidationError());

    const result = await listPresentationsAction({ page: 0 });

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });
});

// AMPLIACION 2026-09-11 (QC-49, T14) — LA EMPRESA SALE DE LA SESION Y NO VUELVE AL NAVEGADOR.
//
// Mismo contrato que `product-actions.test.ts` -ahi esta el razonamiento largo-, sobre las
// CUATRO actions de presentacion. Cubre R12, R19 y R31.
describe('QC-49 R12 — la empresa sale de getSessionContext y nunca del FormData', () => {
  const INVOCACIONES: ReadonlyArray<{
    readonly nombre: string;
    readonly mock: ReturnType<typeof vi.fn>;
    readonly invocar: (formData: FormData) => Promise<unknown>;
  }> = [
    {
      nombre: 'createPresentationAction',
      mock: createPresentationMock,
      invocar: (formData) => createPresentationAction(CREATE_INITIAL, formData),
    },
    {
      nombre: 'updatePresentationAction',
      mock: updatePresentationMock,
      invocar: (formData) => updatePresentationAction('presentation-1', MUTATION_INITIAL, formData),
    },
    {
      nombre: 'deletePresentationAction',
      mock: deletePresentationMock,
      invocar: () => deletePresentationAction(MUTATION_INITIAL, formDataOf({ id: 'presentation-1' })),
    },
    {
      nombre: 'listPresentationsAction',
      mock: listPresentationsMock,
      invocar: () => listPresentationsAction({ page: 1, pageSize: 10 }),
    },
  ];

  const FORM_VALIDO = { name: 'Bidon 20 L', unitId: UNIDAD };

  function actorRecibido(mock: ReturnType<typeof vi.fn>): unknown {
    const llamada = mock.mock.calls.at(-1);
    if (llamada === undefined) throw new Error('el caso de uso no fue llamado');
    return llamada.at(-1);
  }

  it('las cuatro actions piden LAS DOS caras de la sesion y componen el actor con la empresa', async () => {
    for (const { nombre, mock, invocar } of INVOCACIONES) {
      vi.clearAllMocks();
      getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
      getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
      mock.mockResolvedValue({ id: 'x', items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });

      await invocar(formDataOf(FORM_VALIDO));

      expect(getSessionUserMock, nombre).toHaveBeenCalledTimes(1);
      expect(getSessionContextMock, nombre).toHaveBeenCalledTimes(1);
      expect(actorRecibido(mock), nombre).toEqual(ADMIN_ACTOR);
    }
  });

  it('sin contexto de sesion el actor es null ENTERO, no un actor a medias sin empresa', async () => {
    // Falla cerrado (R12): sin cualquiera de las dos caras no hay actor, y sin actor el caso de
    // uso rechaza en su primera linea, antes del repositorio. Lo que se impide aqui es el actor
    // a medias -con `companyId: undefined`-, que dejaria bajar un ambito de nadie.
    const AUSENCIAS = [
      { etiqueta: 'sin contexto de sesion', user: ADMIN_SESSION_USER, context: null },
      { etiqueta: 'sin usuario de sesion', user: null, context: ADMIN_SESSION_CONTEXT },
      { etiqueta: 'sin ninguna de las dos', user: null, context: null },
    ];

    for (const { etiqueta, user, context } of AUSENCIAS) {
      for (const { nombre, mock, invocar } of INVOCACIONES) {
        vi.clearAllMocks();
        getSessionUserMock.mockResolvedValue(user);
        getSessionContextMock.mockResolvedValue(context);
        mock.mockRejectedValue(new UnauthorizedError());

        const resultado = await invocar(formDataOf(FORM_VALIDO));

        expect(actorRecibido(mock), `${nombre} ${etiqueta}`).toBeNull();
        expect(resultado, `${nombre} ${etiqueta}`).toEqual({
          status: 'error',
          code: 'unauthorized',
          message: expect.any(String),
        });
      }
    }
  });

  it('una companyId en el FormData no cambia la empresa ni llega al caso de uso', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-1' });
    updatePresentationMock.mockResolvedValue(undefined);

    const conEmpresaColada = formDataOf({
      ...FORM_VALIDO,
      companyId: 'company-b',
      company_id: 'company-b',
    });

    await createPresentationAction(CREATE_INITIAL, conEmpresaColada);
    await updatePresentationAction('presentation-1', MUTATION_INITIAL, conEmpresaColada);

    for (const mock of [createPresentationMock, updatePresentationMock]) {
      const llamada = mock.mock.calls.at(-1);
      if (llamada === undefined) throw new Error('el caso de uso no fue llamado');

      expect(llamada.at(-1)).toEqual(ADMIN_ACTOR);
      const serializado = JSON.stringify(llamada.slice(0, -1));
      expect(serializado).not.toContain('companyId');
      expect(serializado).not.toContain('company_id');
      expect(serializado).not.toContain('company-b');
    }
  });
});

describe('QC-49 R19/R31 — ni la empresa sale al navegador ni cambian las firmas publicas', () => {
  it('ningun estado devuelto por las cuatro actions contiene la empresa (R19)', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-1' });
    updatePresentationMock.mockResolvedValue(undefined);
    deletePresentationMock.mockResolvedValue(undefined);
    listPresentationsMock.mockResolvedValue({
      items: [{ id: 'presentation-1', name: 'Bidon 20 L', unitId: UNIDAD }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const FORM_VALIDO = { name: 'Bidon 20 L', unitId: UNIDAD };
    const estados: readonly unknown[] = [
      await createPresentationAction(CREATE_INITIAL, formDataOf(FORM_VALIDO)),
      await updatePresentationAction('presentation-1', MUTATION_INITIAL, formDataOf(FORM_VALIDO)),
      await deletePresentationAction(MUTATION_INITIAL, formDataOf({ id: 'presentation-1' })),
      await listPresentationsAction({ page: 1, pageSize: 10 }),
    ];

    // Ancla: los cuatro son de EXITO. Si fueran de error, el barrido pasaria en verde sin haber
    // mirado una sola salida con datos dentro.
    for (const estado of estados) {
      expect(estado).toMatchObject({ status: 'success' });
      const serializado = JSON.stringify(estado);
      expect(serializado).not.toContain('companyId');
      expect(serializado).not.toContain(ADMIN_SESSION_CONTEXT.companyId);
    }
  });

  it('las cuatro Server Actions conservan su firma publica (R31)', () => {
    expect(createPresentationAction).toHaveLength(2);
    expect(updatePresentationAction).toHaveLength(3);
    expect(deletePresentationAction).toHaveLength(2);
    expect(listPresentationsAction).toHaveLength(1);
  });
});
