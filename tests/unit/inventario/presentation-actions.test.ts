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
} = vi.hoisted(() => ({
  createPresentationMock: vi.fn(),
  updatePresentationMock: vi.fn(),
  deletePresentationMock: vi.fn(),
  listPresentationsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
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

/** El actor que la action debe construir a partir de esa sesion (QC-74, design.md > 4). */
const ADMIN_ACTOR = {
  id: 'user-admin-1',
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
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');
    for (const value of Object.values(result)) {
      expect(String(value)).not.toContain('fallo de infraestructura');
    }
    // R14: el detalle si llega al registro del servidor, que es el unico sitio donde aparece.
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ cause: ajeno }));

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
