'use server';

// Fuera del barrel del módulo: un 'use server' en su cierre lo volvería inimportable desde un
// componente de cliente.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { identity, inventario, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import {
  InventarioError,
  type Actor,
  type InventoryImportConfirmOutcome,
  type InventoryImportPreviewOutcome,
} from '@/lib/modules/inventario';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';
import { runInRequestScope } from '@/lib/shared/request-scope';

export type PreviewInventoryImportResult =
  | { status: 'success'; data: InventoryImportPreviewOutcome }
  | ErrorState;

export type ConfirmInventoryImportResult =
  | { status: 'success'; data: InventoryImportConfirmOutcome }
  | ErrorState;

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const INVALID_INPUT_MESSAGE = errorMessage(INVALID_INPUT_CODE);

const previewInputSchema = z.object({ file: z.file() });
const confirmInputSchema = z.object({ file: z.file(), importKey: z.string().uuid() });

const toErrorState = createErrorStateTranslator(InventarioError, observabilidad.readRequestIdHeader);

function invalidInput(): ErrorState {
  return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
}

/** La empresa sale de la sesión, nunca del `FormData`. Sin usuario o sin contexto, el actor es `null`. */
async function currentActor(): Promise<Actor | null> {
  // Un solo ámbito para las dos caras: comparten una única lectura de la sesión por invocación.
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

async function readFile(file: File): Promise<{ fileName: string; bytes: Uint8Array }> {
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function previewInventoryImportAction(formData: FormData): Promise<PreviewInventoryImportResult> {
  const parsed = previewInputSchema.safeParse({ file: formData.get('file') });
  if (!parsed.success) return invalidInput();

  const actor = await currentActor();

  try {
    const data = await inventario.previewInventoryImport(await readFile(parsed.data.file), actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function confirmInventoryImportAction(formData: FormData): Promise<ConfirmInventoryImportResult> {
  const parsed = confirmInputSchema.safeParse({
    file: formData.get('file'),
    importKey: formData.get('importKey'),
  });
  if (!parsed.success) return invalidInput();

  const actor = await currentActor();

  try {
    const file = await readFile(parsed.data.file);
    const data = await inventario.confirmInventoryImport({ ...file, importKey: parsed.data.importKey }, actor);
    if (data.kind === 'imported') revalidatePath(INVENTORY_ROUTE);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
