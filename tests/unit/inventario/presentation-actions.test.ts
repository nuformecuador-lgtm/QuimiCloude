// T12 — Server Actions de presentacion (`design.md > 5`, `> 6.4`). Mockea `@/lib/composition`
// igual que `product-actions.test.ts`, pero afirma lo que es PROPIO de presentacion, no un
// calco: presentacion no convierte numeros (solo tiene `name`, T18/AVISO PRINCIPAL de la
// tanda), y en cambio tiene dos errores de dominio que producto no tiene:
// `DuplicateNameError` (R18) y `PresentationInUseError` (R21) al borrar con productos
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
import {
  DuplicateNameError,
  NotFoundError,
  PresentationInUseError,
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

const CREATE_INITIAL: CreatePresentationFormState = { status: 'idle' };
const MUTATION_INITIAL: PresentationMutationFormState = { status: 'idle' };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
});

describe('createPresentationAction', () => {
  it('toma el actor de identity.getSessionUser() y se lo pasa al caso de uso (R1)', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-1' });

    await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' }));

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    const [, actor] = createPresentationMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toEqual(ADMIN_ACTOR);
  });

  it('devuelve exito con el id creado cuando el caso de uso resuelve', async () => {
    createPresentationMock.mockResolvedValue({ id: 'presentation-42' });

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' }));

    expect(result).toEqual({ status: 'success', id: 'presentation-42' });
  });

  it('traduce DuplicateNameError a su code estable (R18): a diferencia de producto, el nombre de presentacion es unico', async () => {
    createPresentationMock.mockRejectedValue(new DuplicateNameError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' }));

    expect(result).toEqual({
      status: 'error',
      code: 'duplicate_name',
      message: expect.any(String),
    });
  });

  it('traduce ValidationError con invalid_input, no con duplicate_name, cuando el nombre normaliza a vacio (R37, D22)', async () => {
    // "---" no tiene ningun caracter valido tras normalizar: el dominio lo rechaza como
    // ValidationError, NUNCA como DuplicateNameError, aunque exista otra presentacion con
    // el mismo nombre normalizado vacio. Es la distincion de R37/D22 que solo aplica aqui.
    createPresentationMock.mockRejectedValue(new ValidationError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: '---' }));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
    expect(result.status === 'error' && result.code).not.toBe('duplicate_name');
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

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: '' }));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });

  it('relanza un error que no es de dominio, sin traducirlo (docs/conventions.md)', async () => {
    createPresentationMock.mockRejectedValue(new Error('fallo de infraestructura'));

    await expect(
      createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' })),
    ).rejects.toThrow('fallo de infraestructura');
  });

  it('traduce unauthorized cuando no hay sesion (falla cerrado, R3)', async () => {
    getSessionUserMock.mockResolvedValue(null);
    createPresentationMock.mockRejectedValue(new UnauthorizedError());

    const result = await createPresentationAction(CREATE_INITIAL, formDataOf({ name: 'Bidon' }));

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
      formDataOf({ name: 'Bidon 20 L' }),
    );

    expect(updatePresentationMock).toHaveBeenCalledWith(
      'presentation-1',
      { name: 'Bidon 20 L' },
      ADMIN_ACTOR,
    );
  });

  it('traduce DuplicateNameError al renombrar con un nombre normalizado ya usado por otra fila (R18)', async () => {
    updatePresentationMock.mockRejectedValue(new DuplicateNameError());

    const result = await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L' }),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'duplicate_name',
      message: expect.any(String),
    });
  });

  it('traduce not_found a su code estable (R14)', async () => {
    updatePresentationMock.mockRejectedValue(new NotFoundError());

    const result = await updatePresentationAction(
      'no-existe',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon' }),
    );

    expect(result).toEqual({ status: 'error', code: 'not_found', message: expect.any(String) });
  });

  it('devuelve exito cuando el caso de uso resuelve', async () => {
    updatePresentationMock.mockResolvedValue(undefined);

    const result = await updatePresentationAction(
      'presentation-1',
      MUTATION_INITIAL,
      formDataOf({ name: 'Bidon 20 L' }),
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
    deletePresentationMock.mockRejectedValue(new NotFoundError());

    const result = await deletePresentationAction(
      MUTATION_INITIAL,
      formDataOf({ id: 'no-existe' }),
    );

    expect(result).toEqual({ status: 'error', code: 'not_found', message: expect.any(String) });
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
