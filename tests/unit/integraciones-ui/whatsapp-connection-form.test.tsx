// El formulario de alta y edicion de la conexion de WhatsApp y las acciones que lo abren en modo
// edicion. Solo las Server Actions son el doble.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WHATSAPP_ACTION_DISABLE_TESTID,
  WHATSAPP_ACTION_EDIT_TESTID,
  WHATSAPP_ACTION_ENABLE_TESTID,
  WHATSAPP_ACTION_FEEDBACK_TESTID,
  WHATSAPP_ACTION_REGENERATE_TESTID,
  WHATSAPP_ACTION_TEST_TESTID,
  WHATSAPP_CONNECTION_FORM_CANCEL_TESTID,
  WHATSAPP_CONNECTION_FORM_ERROR_TESTID,
  WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID,
  WHATSAPP_CONNECTION_FORM_TESTID,
  WHATSAPP_DISABLE_CONFIRM_TESTID,
  WHATSAPP_FIELD_LABELS,
  WHATSAPP_FIELD_TESTIDS,
  WHATSAPP_PUBLIC_FIELDS,
  WHATSAPP_REGENERATE_CONFIRM_TESTID,
  WHATSAPP_SECRET_FIELDS,
  WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID,
  WHATSAPP_VERIFY_TOKEN_TESTID,
  WhatsappConnectionActions,
  WhatsappConnectionForm,
  WhatsappVerifyTokenProvider,
  WhatsappWebhookPanel,
} from '@/app/(private)/integraciones/whatsapp/components';
import { errorMessage } from '@/lib/modules/errores';
import type {
  CreateWhatsappConnectionFormState,
  RegenerateWhatsappVerifyTokenFormState,
  TestWhatsappConnectionFormState,
  UpdateWhatsappConnectionFormState,
  WhatsappConnectionToggleFormState,
} from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';
import type { WhatsappConnectionView } from '@/lib/modules/integraciones';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
} from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

const {
  createMock,
  updateMock,
  testMock,
  enableMock,
  disableMock,
  regenerateMock,
} = vi.hoisted(() => ({
  createMock: vi.fn<
    (prev: CreateWhatsappConnectionFormState, data: FormData) => Promise<CreateWhatsappConnectionFormState>
  >(),
  updateMock: vi.fn<
    (
      id: string,
      prev: UpdateWhatsappConnectionFormState,
      data: FormData,
    ) => Promise<UpdateWhatsappConnectionFormState>
  >(),
  testMock: vi.fn<
    (prev: TestWhatsappConnectionFormState, data: FormData) => Promise<TestWhatsappConnectionFormState>
  >(),
  enableMock: vi.fn<
    (
      prev: WhatsappConnectionToggleFormState,
      data: FormData,
    ) => Promise<WhatsappConnectionToggleFormState>
  >(),
  disableMock: vi.fn<
    (
      prev: WhatsappConnectionToggleFormState,
      data: FormData,
    ) => Promise<WhatsappConnectionToggleFormState>
  >(),
  regenerateMock: vi.fn<
    (
      prev: RegenerateWhatsappVerifyTokenFormState,
      data: FormData,
    ) => Promise<RegenerateWhatsappVerifyTokenFormState>
  >(),
}));

vi.mock('@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions', () => ({
  getWhatsappConnectionAction: vi.fn(() => {
    throw new Error('la consulta no se invoca desde el formulario');
  }),
  createWhatsappConnectionAction: createMock,
  updateWhatsappConnectionAction: updateMock,
  testWhatsappConnectionAction: testMock,
  enableWhatsappConnectionAction: enableMock,
  disableWhatsappConnectionAction: disableMock,
  regenerateWhatsappVerifyTokenAction: regenerateMock,
}));

const TOKEN = 'tok_f1e2d3c4b5a69788796a5b4c3d2e1f00112233445';
const ACCESS_TOKEN = 'EAAG-secreto-de-prueba';
const APP_SECRET = 'app-secret-de-prueba';
const MENSAJE_META = 'Invalid OAuth access token - Cannot parse access token';
const WEBHOOK = { url: 'https://app.ejemplo.com/api/integraciones/whatsapp/webhook/conn-1', complete: true };

const ESCRITO = {
  displayName: 'Ventas Bogotá',
  metaAppId: '1234567890',
  wabaId: 'waba-abc',
  phoneNumberId: '9988776655',
} as const;

function vista(overrides: Partial<WhatsappConnectionView> = {}): WhatsappConnectionView {
  return {
    id: 'conn-1',
    displayName: 'Ventas',
    metaAppId: '111',
    wabaId: '222',
    phoneNumberId: '333',
    displayPhoneNumber: '+57 300 0000000',
    verifiedName: 'Empresa de prueba',
    status: 'PENDING',
    lastError: null,
    lastCheckedAt: null,
    lastWebhookAt: null,
    ...overrides,
  };
}

function campo(field: keyof typeof WHATSAPP_FIELD_TESTIDS): HTMLInputElement {
  return screen.getByTestId(WHATSAPP_FIELD_TESTIDS[field]) as HTMLInputElement;
}

async function rellenarAlta(user: ReturnType<typeof setupUser>, accessToken = ACCESS_TOKEN) {
  for (const field of WHATSAPP_PUBLIC_FIELDS) await user.type(campo(field), ESCRITO[field]);
  await user.type(campo('accessToken'), accessToken);
  await user.type(campo('appSecret'), APP_SECRET);
}

function montarAlta() {
  return render(
    <WhatsappVerifyTokenProvider>
      <WhatsappConnectionForm mode="create" />
      <WhatsappWebhookPanel webhook={WEBHOOK} />
    </WhatsappVerifyTokenProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('WhatsappConnectionForm en alta', () => {
  it('R36: pinta los seis campos con sus etiquetas y los secretos como contraseña sin valor inicial', () => {
    montarAlta();

    for (const field of [...WHATSAPP_PUBLIC_FIELDS, ...WHATSAPP_SECRET_FIELDS]) {
      expect(screen.getByLabelText(WHATSAPP_FIELD_LABELS[field])).toBe(campo(field));
    }
    expect(Object.values(WHATSAPP_FIELD_LABELS)).toEqual([
      'Nombre visible',
      'App ID',
      'WABA ID',
      'Phone Number ID',
      'Access Token',
      'App Secret',
    ]);
    for (const field of WHATSAPP_SECRET_FIELDS) {
      expect(campo(field).type).toBe('password');
      expect(campo(field).value).toBe('');
      expect(campo(field).getAttribute('autocomplete')).toBe('off');
      expect(campo(field).required).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Guardar y probar' })).toBeTruthy();
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_FORM_CANCEL_TESTID)).toBeNull();
  });

  it('R36: envia los seis campos con los nombres que lee la accion', async () => {
    createMock.mockResolvedValue({ status: 'test_failed', message: MENSAJE_META });
    const user = setupUser();
    montarAlta();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const datos = createMock.mock.calls[0]?.[1];
    expect(Object.fromEntries(datos?.entries() ?? [])).toEqual({
      ...ESCRITO,
      accessToken: ACCESS_TOKEN,
      appSecret: APP_SECRET,
    });
  });

  it('R38: tras crear, el panel muestra el verify token y la URL con el aviso de una sola vez', async () => {
    createMock.mockResolvedValue({ status: 'created', verifyToken: TOKEN, webhook: WEBHOOK });
    const user = setupUser();
    montarAlta();

    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID)).toBeNull();
    await rellenarAlta(user);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    const aviso = await screen.findByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID);
    expect(aviso.textContent).toContain('Cópialo ahora: no se volverá a mostrar.');
    expect((screen.getByTestId(WHATSAPP_VERIFY_TOKEN_TESTID) as HTMLInputElement).value).toBe(TOKEN);
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_FORM_ERROR_TESTID)).toBeNull();
  });

  it('R39: con prueba fallida muestra «Meta rechazó la prueba: » y el mensaje, y conserva solo los campos no secretos', async () => {
    createMock.mockResolvedValue({ status: 'test_failed', message: MENSAJE_META });
    const user = setupUser();
    montarAlta();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    const error = await screen.findByTestId(WHATSAPP_CONNECTION_FORM_ERROR_TESTID);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe(`Meta rechazó la prueba: ${MENSAJE_META}`);
    for (const field of WHATSAPP_PUBLIC_FIELDS) expect(campo(field).value).toBe(ESCRITO[field]);
    for (const field of WHATSAPP_SECRET_FIELDS) expect(campo(field).value).toBe('');
    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID)).toBeNull();
  });

  it('R39: con un error del catalogo muestra su mensaje y conserva los campos no secretos', async () => {
    createMock.mockResolvedValue({
      status: 'error',
      code: 'whatsapp_phone_number_taken',
      message: errorMessage('whatsapp_phone_number_taken'),
    });
    const user = setupUser();
    montarAlta();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    const error = await screen.findByTestId(WHATSAPP_CONNECTION_FORM_ERROR_TESTID);
    expect(error.textContent).toContain('Ese número de WhatsApp ya está conectado en otra cuenta.');
    expect(error.getAttribute('data-code')).toBe('whatsapp_phone_number_taken');
    for (const field of WHATSAPP_PUBLIC_FIELDS) expect(campo(field).value).toBe(ESCRITO[field]);
    for (const field of WHATSAPP_SECRET_FIELDS) expect(campo(field).value).toBe('');
  });

  it('R39: con un error inesperado muestra el mensaje y la referencia para soporte', async () => {
    createMock.mockResolvedValue(errorInesperado());
    const user = setupUser();
    montarAlta();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    const error = await screen.findByTestId(WHATSAPP_CONNECTION_FORM_ERROR_TESTID);
    expect(error.textContent).toContain(REFERENCIA_DEL_CASO);
  });

  it('R40: los campos miden 16 px y 44 px de alto, y el boton tiene talla tactil', () => {
    montarAlta();

    for (const field of [...WHATSAPP_PUBLIC_FIELDS, ...WHATSAPP_SECRET_FIELDS]) {
      expect(campo(field).className).toMatch(/(^|\s)text-base(\s|$)/);
      expect(campo(field).className).toMatch(/(^|\s)md:text-base(\s|$)/);
      expect(campo(field).className).not.toMatch(/(^|\s)md:text-sm(\s|$)/);
      expect(campo(field).className).toMatch(/(^|\s)min-h-11(\s|$)/);
    }
    const boton = screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID);
    expect(boton.className).toMatch(/(^|\s)min-h-11(\s|$)/);
    expect(boton.className).toMatch(/(^|\s)min-w-11(\s|$)/);
  });
});

describe('WhatsappConnectionForm en edicion', () => {
  it('R36: precarga los campos no secretos, deja los secretos vacios y opcionales con su ayuda', () => {
    render(
      <WhatsappConnectionForm mode="edit" connection={vista()} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(campo('displayName').value).toBe('Ventas');
    expect(campo('metaAppId').value).toBe('111');
    expect(campo('wabaId').value).toBe('222');
    expect(campo('phoneNumberId').value).toBe('333');
    for (const field of WHATSAPP_SECRET_FIELDS) {
      expect(campo(field).type).toBe('password');
      expect(campo(field).value).toBe('');
      expect(campo(field).required).toBe(false);
      const ayuda = document.getElementById(campo(field).getAttribute('aria-describedby') ?? '');
      expect(ayuda?.textContent).toBe('Déjalo vacío para conservar el actual');
    }
  });

  it('R39: al guardar con prueba fallida muestra el mensaje de Meta y conserva lo escrito', async () => {
    updateMock.mockResolvedValue({ status: 'test_failed', message: MENSAJE_META });
    const onSaved = vi.fn();
    const user = setupUser();
    render(
      <WhatsappConnectionForm mode="edit" connection={vista()} onSaved={onSaved} onCancel={vi.fn()} />,
    );

    await user.clear(campo('displayName'));
    await user.type(campo('displayName'), 'Nuevo nombre');
    await user.type(campo('accessToken'), ACCESS_TOKEN);
    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    const error = await screen.findByTestId(WHATSAPP_CONNECTION_FORM_ERROR_TESTID);
    expect(error.textContent).toBe(`Meta rechazó la prueba: ${MENSAJE_META}`);
    expect(updateMock.mock.calls[0]?.[0]).toBe('conn-1');
    expect(campo('displayName').value).toBe('Nuevo nombre');
    expect(campo('accessToken').value).toBe('');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R36: al guardar bien llama a onSaved', async () => {
    updateMock.mockResolvedValue({ status: 'saved' });
    const onSaved = vi.fn();
    const user = setupUser();
    render(
      <WhatsappConnectionForm mode="edit" connection={vista()} onSaved={onSaved} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});

describe('WhatsappConnectionActions', () => {
  function montarAcciones(connection: WhatsappConnectionView) {
    return render(
      <WhatsappVerifyTokenProvider>
        <WhatsappWebhookPanel webhook={WEBHOOK} />
        <WhatsappConnectionActions connection={connection} />
      </WhatsappVerifyTokenProvider>,
    );
  }

  it('R37: sin DISABLED ofrece Editar, Probar conexion, Deshabilitar y Regenerar verify token', () => {
    montarAcciones(vista({ status: 'ACTIVE' }));

    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Probar conexión' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshabilitar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Regenerar verify token' })).toBeTruthy();
    expect(screen.queryByTestId(WHATSAPP_ACTION_ENABLE_TESTID)).toBeNull();
  });

  it('R37: con DISABLED ofrece Habilitar y no Probar conexion ni Deshabilitar', () => {
    montarAcciones(vista({ status: 'DISABLED' }));

    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeTruthy();
    expect(screen.queryByTestId(WHATSAPP_ACTION_TEST_TESTID)).toBeNull();
    expect(screen.queryByTestId(WHATSAPP_ACTION_DISABLE_TESTID)).toBeNull();
  });

  it('R37: Editar abre el formulario en modo edicion en el mismo panel y Cancelar lo cierra', async () => {
    const user = setupUser();
    montarAcciones(vista());

    await user.click(screen.getByTestId(WHATSAPP_ACTION_EDIT_TESTID));
    expect(screen.getByTestId(WHATSAPP_CONNECTION_FORM_TESTID).getAttribute('data-mode')).toBe('edit');

    await user.click(screen.getByTestId(WHATSAPP_CONNECTION_FORM_CANCEL_TESTID));
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_FORM_TESTID)).toBeNull();
  });

  it('R37: Deshabilitar pide confirmacion y solo entonces invoca la accion con el id', async () => {
    disableMock.mockResolvedValue({ status: 'saved' });
    const user = setupUser();
    montarAcciones(vista());

    await user.click(screen.getByTestId(WHATSAPP_ACTION_DISABLE_TESTID));
    expect(disableMock).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId(WHATSAPP_DISABLE_CONFIRM_TESTID));

    await waitFor(() => expect(disableMock).toHaveBeenCalledTimes(1));
    expect(disableMock.mock.calls[0]?.[1].get('id')).toBe('conn-1');
  });

  it('R38: Regenerar, tras confirmar, muestra el nuevo verify token en el panel', async () => {
    regenerateMock.mockResolvedValue({ status: 'regenerated', verifyToken: TOKEN, webhook: WEBHOOK });
    const user = setupUser();
    montarAcciones(vista());

    await user.click(screen.getByTestId(WHATSAPP_ACTION_REGENERATE_TESTID));
    expect(regenerateMock).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId(WHATSAPP_REGENERATE_CONFIRM_TESTID));

    const aviso = await screen.findByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID);
    expect(within(aviso).getByTestId(WHATSAPP_VERIFY_TOKEN_TESTID)).toHaveProperty('value', TOKEN);
    expect(regenerateMock.mock.calls[0]?.[1].get('id')).toBe('conn-1');
  });

  it('R39: Habilitar con prueba fallida muestra «Meta rechazó la prueba: » y el mensaje', async () => {
    enableMock.mockResolvedValue({ status: 'test_failed', message: MENSAJE_META });
    const user = setupUser();
    montarAcciones(vista({ status: 'DISABLED' }));

    await user.click(screen.getByTestId(WHATSAPP_ACTION_ENABLE_TESTID));

    const aviso = await screen.findByTestId(WHATSAPP_ACTION_FEEDBACK_TESTID);
    expect(aviso.textContent).toBe(`Meta rechazó la prueba: ${MENSAJE_META}`);
  });

  it('R39: Probar conexion con un error del catalogo muestra su mensaje', async () => {
    testMock.mockResolvedValue({
      status: 'error',
      code: 'whatsapp_connection_not_found',
      message: errorMessage('whatsapp_connection_not_found'),
    });
    const user = setupUser();
    montarAcciones(vista());

    await user.click(screen.getByTestId(WHATSAPP_ACTION_TEST_TESTID));

    const aviso = await screen.findByTestId(WHATSAPP_ACTION_FEEDBACK_TESTID);
    expect(aviso.textContent).toContain('No se encontró la conexión de WhatsApp.');
  });

  it('R40: cada accion tiene talla tactil', () => {
    montarAcciones(vista());

    for (const testId of [
      WHATSAPP_ACTION_EDIT_TESTID,
      WHATSAPP_ACTION_TEST_TESTID,
      WHATSAPP_ACTION_DISABLE_TESTID,
      WHATSAPP_ACTION_REGENERATE_TESTID,
    ]) {
      expect(screen.getByTestId(testId).className).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(screen.getByTestId(testId).className).toMatch(/(^|\s)min-w-11(\s|$)/);
    }
  });
});
