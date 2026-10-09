'use server';

/**
 * Server Actions de la conexion de WhatsApp. No deciden nada: resuelven el actor, extraen el
 * `FormData` y traducen el resultado o el error. Ningun estado lleva un secreto, su valor cifrado
 * ni el resumen del verify token; el verify token en claro solo viaja en `created` y `regenerated`.
 *
 * Se importa por su ruta exacta: un `'use server'` reexportado desde el barrel lo volveria
 * inimportable desde un componente de cliente.
 */

import { revalidatePath } from 'next/cache';

import { identity, integraciones, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  IntegracionesError,
  type Actor,
  type WhatsappConnectionView,
} from '@/lib/modules/integraciones';
import { runInRequestScope } from '@/lib/shared/request-scope';
import { WHATSAPP_INTEGRATION_ROUTE } from '@/lib/shared/routes';

export type WhatsappWebhookUrl = { url: string; complete: boolean };

export type WhatsappConnectionQueryResult =
  | { status: 'success'; data: WhatsappConnectionView | null; webhook: WhatsappWebhookUrl | null }
  | ErrorState;

export type CreateWhatsappConnectionFormState =
  | { status: 'idle' }
  | { status: 'created'; verifyToken: string; webhook: WhatsappWebhookUrl }
  | { status: 'test_failed'; message: string }
  | ErrorState;

export type UpdateWhatsappConnectionFormState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'test_failed'; message: string }
  | ErrorState;

export type TestWhatsappConnectionFormState =
  | { status: 'idle' }
  | { status: 'tested'; ok: true }
  | { status: 'tested'; ok: false; message: string }
  | ErrorState;

/** `test_failed` solo sale al habilitar: deshabilitar no prueba contra Meta. */
export type WhatsappConnectionToggleFormState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'test_failed'; message: string }
  | ErrorState;

export type RegenerateWhatsappVerifyTokenFormState =
  | { status: 'idle' }
  | { status: 'regenerated'; verifyToken: string; webhook: WhatsappWebhookUrl }
  | ErrorState;

const toErrorState = createErrorStateTranslator(IntegracionesError, observabilidad.readRequestIdHeader);

async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Ausente no es lo mismo que vacio para el esquema: los dos significan conservar el secreto. */
function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function buildCreateCandidate(formData: FormData): unknown {
  return {
    displayName: readFormString(formData, 'displayName'),
    metaAppId: readFormString(formData, 'metaAppId'),
    wabaId: readFormString(formData, 'wabaId'),
    phoneNumberId: readFormString(formData, 'phoneNumberId'),
    accessToken: readFormString(formData, 'accessToken'),
    appSecret: readFormString(formData, 'appSecret'),
  };
}

function buildUpdateCandidate(formData: FormData): unknown {
  return {
    displayName: readFormString(formData, 'displayName'),
    metaAppId: readFormString(formData, 'metaAppId'),
    wabaId: readFormString(formData, 'wabaId'),
    phoneNumberId: readFormString(formData, 'phoneNumberId'),
    accessToken: readOptionalFormString(formData, 'accessToken'),
    appSecret: readOptionalFormString(formData, 'appSecret'),
  };
}

function refreshScreen(): void {
  revalidatePath(WHATSAPP_INTEGRATION_ROUTE);
}

/** Conexion viva de la empresa y la URL de su webhook. Consulta: sin argumentos. */
export async function getWhatsappConnectionAction(): Promise<WhatsappConnectionQueryResult> {
  const actor = await currentActor();

  try {
    const data = await integraciones.getWhatsappConnection(actor);
    return {
      status: 'success',
      data,
      webhook: data === null ? null : integraciones.whatsappWebhookUrl(data.id),
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function createWhatsappConnectionAction(
  prevState: CreateWhatsappConnectionFormState,
  formData: FormData,
): Promise<CreateWhatsappConnectionFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const result = await integraciones.createWhatsappConnection(buildCreateCandidate(formData), actor);
    if (result.status === 'test_failed') {
      return { status: 'test_failed', message: result.message };
    }
    refreshScreen();
    return {
      status: 'created',
      verifyToken: result.verifyToken,
      webhook: integraciones.whatsappWebhookUrl(result.connection.id),
    };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Un secreto vacio conserva el guardado. */
export async function updateWhatsappConnectionAction(
  id: string,
  prevState: UpdateWhatsappConnectionFormState,
  formData: FormData,
): Promise<UpdateWhatsappConnectionFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const result = await integraciones.updateWhatsappConnection(id, buildUpdateCandidate(formData), actor);
    if (result.status === 'test_failed') {
      return { status: 'test_failed', message: result.message };
    }
    refreshScreen();
    return { status: 'saved' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Una prueba fallida tambien escribe el estado y el ultimo error: se revalida igual. */
export async function testWhatsappConnectionAction(
  prevState: TestWhatsappConnectionFormState,
  formData: FormData,
): Promise<TestWhatsappConnectionFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const result = await integraciones.testWhatsappConnection(readFormString(formData, 'id'), actor);
    refreshScreen();
    return result.ok
      ? { status: 'tested', ok: true }
      : { status: 'tested', ok: false, message: result.message };
  } catch (error) {
    return toErrorState(error);
  }
}

async function setEnabled(
  formData: FormData,
  enabled: boolean,
): Promise<WhatsappConnectionToggleFormState> {
  const actor = await currentActor();

  try {
    const result = await integraciones.setWhatsappConnectionEnabled(
      readFormString(formData, 'id'),
      enabled,
      actor,
    );
    if (result.status === 'test_failed') {
      return { status: 'test_failed', message: result.message };
    }
    refreshScreen();
    return { status: 'saved' };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function disableWhatsappConnectionAction(
  prevState: WhatsappConnectionToggleFormState,
  formData: FormData,
): Promise<WhatsappConnectionToggleFormState> {
  void prevState;
  return setEnabled(formData, false);
}

export async function enableWhatsappConnectionAction(
  prevState: WhatsappConnectionToggleFormState,
  formData: FormData,
): Promise<WhatsappConnectionToggleFormState> {
  void prevState;
  return setEnabled(formData, true);
}

export async function regenerateWhatsappVerifyTokenAction(
  prevState: RegenerateWhatsappVerifyTokenFormState,
  formData: FormData,
): Promise<RegenerateWhatsappVerifyTokenFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const result = await integraciones.regenerateWhatsappVerifyToken(readFormString(formData, 'id'), actor);
    refreshScreen();
    return {
      status: 'regenerated',
      verifyToken: result.verifyToken,
      webhook: integraciones.whatsappWebhookUrl(result.connection.id),
    };
  } catch (error) {
    return toErrorState(error);
  }
}
