'use server';

// Fuera del barrel del módulo: un 'use server' en su cierre lo volvería inimportable desde un
// componente de cliente. Hoy responde con datos fijos, sin sesión ni base.

import { z } from 'zod';

import { errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import type {
  InventoryImportConfirmOutcome,
  InventoryImportPreviewOutcome,
} from '@/lib/modules/inventario';

import {
  ALREADY_IMPORTED_FIXTURE,
  ALREADY_IMPORTED_KEY,
  REJECTED_FILE_NAME_PREFIX,
  REJECTED_FIXTURE,
  previewFixture,
  resultFixture,
} from './inventory-import-fixtures';

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

function invalidInput(): ErrorState {
  return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
}

export async function previewInventoryImportAction(formData: FormData): Promise<PreviewInventoryImportResult> {
  const parsed = previewInputSchema.safeParse({ file: formData.get('file') });
  if (!parsed.success) return invalidInput();

  const { name } = parsed.data.file;
  if (name.startsWith(REJECTED_FILE_NAME_PREFIX)) return { status: 'success', data: REJECTED_FIXTURE };
  return { status: 'success', data: previewFixture(name) };
}

export async function confirmInventoryImportAction(formData: FormData): Promise<ConfirmInventoryImportResult> {
  const parsed = confirmInputSchema.safeParse({
    file: formData.get('file'),
    importKey: formData.get('importKey'),
  });
  if (!parsed.success) return invalidInput();

  if (parsed.data.importKey === ALREADY_IMPORTED_KEY) {
    return { status: 'success', data: ALREADY_IMPORTED_FIXTURE };
  }
  return { status: 'success', data: resultFixture(parsed.data.file.name) };
}
