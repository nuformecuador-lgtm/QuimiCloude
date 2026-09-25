// El formulario de alta y edicion de cliente.
//
// Se monta a traves de `CustomerSheet`, porque `SheetContent` exige un `Sheet` como ancestro. La
// validacion previa corre con el esquema real del contrato publico (`createCustomerSchema`), sin
// mockear: solo las Server Actions son el doble.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  CUSTOMER_BUSINESS_FIELDS,
  CUSTOMER_CREATE_OPEN_TESTID,
  CUSTOMER_ERROR_TESTIDS,
  CUSTOMER_FIELD_TESTIDS,
  CUSTOMER_FORM_ERROR_CODE_TESTID,
  CUSTOMER_FORM_ERROR_TESTID,
  CUSTOMER_FORM_SUBMIT_TESTID,
  CUSTOMER_FORM_TESTID,
  CUSTOMER_REQUIRED_FIELDS,
  CustomerSheet,
} from '@/app/(private)/clientes/components';
import {
  CUSTOMER_ADDRESS_MAX_LENGTH,
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_FIRST_NAMES_MAX_LENGTH,
  CUSTOMER_LAST_NAMES_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  CustomerNotFoundError,
  UnauthorizedError,
  ValidationError,
  type CustomerView,
} from '@/lib/modules/clientes';
import type {
  CreateCustomerFormState,
  CustomerMutationFormState,
} from '@/lib/modules/clientes/adapters/driving/customer-actions';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

const { routerMock, createCustomerActionMock, updateCustomerActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createCustomerActionMock:
    vi.fn<
      (prev: CreateCustomerFormState, data: FormData) => Promise<CreateCustomerFormState>
    >(),
  updateCustomerActionMock:
    vi.fn<
      (
        id: string,
        prev: CustomerMutationFormState,
        data: FormData,
      ) => Promise<CustomerMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => ({
  createCustomerAction: createCustomerActionMock,
  updateCustomerAction: updateCustomerActionMock,
  deleteCustomerAction: vi.fn(() => {
    throw new Error('deleteCustomerAction no debe invocarse desde el formulario');
  }),
  getCustomerAction: vi.fn(() => {
    throw new Error('getCustomerAction no debe invocarse desde el formulario');
  }),
  listCustomersAction: vi.fn(() => {
    throw new Error('listCustomersAction no debe invocarse desde el formulario');
  }),
}));

/** Codigos ESTABLES, leidos de las clases del dominio y nunca escritos a mano. */
const UNAUTHORIZED_CODE = new UnauthorizedError().code;
const CUSTOMER_NOT_FOUND_CODE = new CustomerNotFoundError().code;
const SERVER_INVALID_INPUT_CODE = new ValidationError().code;

const CLIENTE: CustomerView = {
  id: crypto.randomUUID(),
  firstNames: 'Ana María',
  lastNames: 'Pérez Gómez',
  city: 'Bogotá',
  phone: '3001234567',
  email: 'ana@example.com',
  address: 'Calle 1 # 2-3',
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  createCustomerActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateCustomerActionMock.mockResolvedValue({ status: 'success' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function abrirAlta(user: ReturnType<typeof setupUser>) {
  render(<CustomerSheet />);
  await user.click(screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID));
  return screen.findByTestId(CUSTOMER_FORM_TESTID);
}

async function rellenarObligatorios(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames), 'Luis');
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames), 'Rodríguez');
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');
}

describe('los seis campos, y ninguno mas (R25)', () => {
  it('el formulario captura EXACTAMENTE los seis campos de negocio declarados', async () => {
    const user = setupUser();
    const formulario = await abrirAlta(user);

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect([...nombres].sort()).toEqual([...CUSTOMER_BUSINESS_FIELDS].sort());
  });

  it('nombres, apellidos y ciudad son obligatorios; telefono, correo y direccion no lo son', async () => {
    const user = setupUser();
    await abrirAlta(user);

    for (const field of CUSTOMER_BUSINESS_FIELDS) {
      const control = screen.getByTestId(CUSTOMER_FIELD_TESTIDS[field]);
      const esObligatorio = (CUSTOMER_REQUIRED_FIELDS as readonly string[]).includes(field);
      expect(control).toHaveAttribute('aria-required', String(esObligatorio));
      if (esObligatorio) expect(control).toBeRequired();
      else expect(control).not.toBeRequired();
    }
  });
});

describe('validacion previa con el esquema del contrato (R26)', () => {
  it('el largo maximo EXACTO de cada campo se acepta y viaja a la operacion', async () => {
    const user = setupUser();
    await abrirAlta(user);

    const nombreMaximo = 'a'.repeat(CUSTOMER_FIRST_NAMES_MAX_LENGTH);
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames), nombreMaximo);
    await user.type(
      screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames),
      'a'.repeat(CUSTOMER_LAST_NAMES_MAX_LENGTH),
    );
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(1));
    expect(createCustomerActionMock.mock.calls[0]![1].get('firstNames')).toBe(nombreMaximo);
  });

  it('un caracter MAS que el maximo NO llama a la operacion y se marca en el campo', async () => {
    const user = setupUser();
    await abrirAlta(user);

    // `maxLength` del control ya lo recorta el navegador; `fireEvent`/`user-event` respeta el
    // atributo, asi que el exceso se fuerza pegando el valor directo al campo.
    const campo = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames) as HTMLInputElement;
    campo.removeAttribute('maxlength');
    await user.type(campo, 'a'.repeat(CUSTOMER_FIRST_NAMES_MAX_LENGTH + 1));
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames), 'Rodríguez');
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await screen.findByTestId(CUSTOMER_ERROR_TESTIDS.firstNames);
    expect(createCustomerActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(CUSTOMER_FORM_TESTID)).toBeInTheDocument();
  });

  it('un obligatorio vacio no llama a la operacion: el navegador bloquea el envio antes', async () => {
    // El campo lleva `required`, asi que la validacion nativa del navegador impide el submit
    // antes de que exista ocasion de invocar la accion. Aqui se comprueba justo eso, en negativo.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames), 'Rodríguez');
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    const campo = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames) as HTMLInputElement;
    expect(campo.checkValidity()).toBe(false);
    expect(createCustomerActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(CUSTOMER_FORM_TESTID)).toBeInTheDocument();
  });

  it('un obligatorio con solo espacios pasa la validacion nativa pero no llama a la operacion', async () => {
    // La validacion nativa del navegador acepta espacios como contenido, asi que el submit llega
    // hasta la validacion previa del esquema, que si los rechaza.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames), '   ');
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames), 'Rodríguez');
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');

    const campo = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames) as HTMLInputElement;
    expect(campo.checkValidity()).toBe(true);

    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await screen.findByTestId(CUSTOMER_ERROR_TESTIDS.firstNames);
    expect(createCustomerActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(CUSTOMER_FORM_TESTID)).toBeInTheDocument();
  });

  it('el maximo de los tres opcionales tambien se acota con la constante del contrato', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await rellenarObligatorios(user);
    const telefono = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.phone) as HTMLInputElement;
    telefono.removeAttribute('maxlength');
    await user.type(telefono, '1'.repeat(CUSTOMER_PHONE_MAX_LENGTH + 1));
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await screen.findByTestId(CUSTOMER_ERROR_TESTIDS.phone);
    expect(createCustomerActionMock).not.toHaveBeenCalled();
  });

  it('el correo y el telefono son `type="text"` sin `pattern`, y con el `inputMode` correcto', async () => {
    const user = setupUser();
    await abrirAlta(user);

    const correo = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.email);
    const telefono = screen.getByTestId(CUSTOMER_FIELD_TESTIDS.phone);

    expect(correo).toHaveAttribute('type', 'text');
    expect(correo).not.toHaveAttribute('pattern');
    expect(correo).toHaveAttribute('inputmode', 'email');

    expect(telefono).toHaveAttribute('type', 'text');
    expect(telefono).not.toHaveAttribute('pattern');
    expect(telefono).toHaveAttribute('inputmode', 'tel');
  });

  it('el correo y el telefono aceptan texto sin formato, sin bloquear el envio', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await rellenarObligatorios(user);
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.email), 'no-es-un-correo');
    await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.phone), 'no-es-un-telefono');
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(1));
    expect(createCustomerActionMock.mock.calls[0]![1].get('email')).toBe('no-es-un-correo');
    expect(createCustomerActionMock.mock.calls[0]![1].get('phone')).toBe('no-es-un-telefono');
  });

  it('los limites usados son los que exporta el contrato publico, no numeros sueltos', () => {
    expect(CUSTOMER_FIRST_NAMES_MAX_LENGTH).toBe(80);
    expect(CUSTOMER_LAST_NAMES_MAX_LENGTH).toBe(80);
    expect(CUSTOMER_PHONE_MAX_LENGTH).toBe(40);
    expect(CUSTOMER_EMAIL_MAX_LENGTH).toBe(160);
    expect(CUSTOMER_ADDRESS_MAX_LENGTH).toBe(200);
  });
});

describe('precarga y reemplazo completo en la edicion (R27)', () => {
  it('la edicion precarga los seis valores actuales del cliente', async () => {
    render(<CustomerSheet customer={CLIENTE} open onOpenChange={() => {}} />);
    await screen.findByTestId(CUSTOMER_FORM_TESTID);

    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames)).toHaveValue(CLIENTE.firstNames);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames)).toHaveValue(CLIENTE.lastNames);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city)).toHaveValue(CLIENTE.city);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.phone)).toHaveValue(CLIENTE.phone);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.email)).toHaveValue(CLIENTE.email);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.address)).toHaveValue(CLIENTE.address);
  });

  it('editar y guardar sin tocar nada envia el REEMPLAZO COMPLETO ligado al id', async () => {
    const user = setupUser();
    render(<CustomerSheet customer={CLIENTE} open onOpenChange={() => {}} />);
    await screen.findByTestId(CUSTOMER_FORM_TESTID);

    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateCustomerActionMock).toHaveBeenCalledTimes(1));
    const [idRecibido, , datos] = updateCustomerActionMock.mock.calls[0]!;
    expect(idRecibido).toBe(CLIENTE.id);
    expect(datos.get('firstNames')).toBe(CLIENTE.firstNames);
    expect(datos.get('phone')).toBe(CLIENTE.phone);
    expect(createCustomerActionMock).not.toHaveBeenCalled();
  });

  it('vaciar un opcional en la edicion lo envia VACIO, para que quede sin valor', async () => {
    const user = setupUser();
    render(<CustomerSheet customer={CLIENTE} open onOpenChange={() => {}} />);
    await screen.findByTestId(CUSTOMER_FORM_TESTID);

    await user.clear(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.phone));
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateCustomerActionMock).toHaveBeenCalledTimes(1));
    expect(updateCustomerActionMock.mock.calls[0]![2].get('phone')).toBe('');
  });
});

describe('los rechazos se distinguen por su codigo, nunca por el texto (R28)', () => {
  /** Un alta que la operacion rechaza con el estado dado. */
  async function altaQueFalla(user: ReturnType<typeof setupUser>, estado: CustomerMutationFormState) {
    createCustomerActionMock.mockResolvedValue(estado as CreateCustomerFormState);
    await abrirAlta(user);
    await rellenarObligatorios(user);
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));
    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(1));
  }

  it('`customer_not_found` se pinta en la region del formulario, que sigue abierto', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: CUSTOMER_NOT_FOUND_CODE,
      message: 'El cliente solicitado no existe.',
    });

    const region = await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(CUSTOMER_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      CUSTOMER_NOT_FOUND_CODE,
    );
    expect(screen.getByTestId(CUSTOMER_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames)).toHaveValue('Luis');
  });

  it('`unauthorized` se pinta con el mismo trato, distinguido por su codigo', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: UNAUTHORIZED_CODE,
      message: 'No tienes permiso para esta operacion.',
    });

    const region = await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    expect(screen.getByTestId(CUSTOMER_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      UNAUTHORIZED_CODE,
    );
    expect(region).toBeInTheDocument();
  });

  it('un `invalid_input` DEL SERVIDOR (que el esquema del cliente no detecto) va a la region general', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: SERVER_INVALID_INPUT_CODE,
      message: 'La entrada recibida no es valida.',
    });

    const region = await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    expect(screen.getByTestId(CUSTOMER_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      SERVER_INVALID_INPUT_CODE,
    );
    expect(region).toBeInTheDocument();
  });

  it('un rechazo no cierra el panel y no pierde lo escrito', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: UNAUTHORIZED_CODE,
      message: 'No tienes permiso para esta operacion.',
    });

    await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    expect(screen.getByTestId(CUSTOMER_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames)).toHaveValue('Rodríguez');
  });

  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    await altaQueFalla(user, errorInesperado());

    const region = await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    const referencia = within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: UNAUTHORIZED_CODE,
      message: 'No tienes permiso para esta operacion.',
    });

    await screen.findByTestId(CUSTOMER_FORM_ERROR_TESTID);
    esperarSinIdentificador();
  });
});

describe('no hay advertencia de duplicado (R29)', () => {
  it('dos altas con los mismos seis datos se envian las dos, sin dialogo ni bloqueo', async () => {
    const user = setupUser();
    await abrirAlta(user);
    await rellenarObligatorios(user);
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    cleanup();
    const otroUser = setupUser();
    await abrirAlta(otroUser);
    await rellenarObligatorios(otroUser);
    await otroUser.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
