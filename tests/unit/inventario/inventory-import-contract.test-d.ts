// R32: forma del contrato de la importacion de inventario.
//
// Vitest no ejecuta este archivo (`vitest.config.mts` solo incluye `*.test.ts` y `*.test.tsx`):
// lo compila `pnpm run typecheck`, porque `tsconfig.json` incluye `**/*.ts`. Una afirmacion que
// deje de cumplirse pone el typecheck en rojo. Las construcciones ilegales llevan
// `@ts-expect-error`: si el tipo se abre, la directiva queda sin usar y `tsc` tambien falla.

import { expectTypeOf } from 'vitest'

import type { ErrorState } from '@/lib/modules/errores'
import type {
  Actor,
  ConfirmInventoryImport,
  ImportAlreadyDone,
  ImportCells,
  ImportColumnKey,
  ImportFileRejected,
  ImportPreviewRow,
  ImportPreviewStatus,
  ImportResultRow,
  ImportRowIssue,
  ImportRowType,
  InventoryImportConfirmOutcome,
  InventoryImportPreview,
  InventoryImportPreviewOutcome,
  InventoryImportResult,
  PreviewInventoryImport,
  ProductType,
} from '@/lib/modules/inventario'
import {
  IMPORT_TYPE_LABELS,
  INVENTORY_IMPORT_COLUMNS,
  createConfirmInventoryImport,
  createPreviewInventoryImport,
} from '@/lib/modules/inventario'
import type {
  ConfirmInventoryImportResult,
  PreviewInventoryImportResult,
  confirmInventoryImportAction,
  previewInventoryImportAction,
} from '@/lib/modules/inventario/adapters/driving/inventory-import-actions'
import type {
  CreatePresentationFormState,
  createPresentationAction,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions'
import type {
  CreateUnitFormState,
  UnitListResult,
  createUnitAction,
  listUnitsAction,
} from '@/lib/modules/unidades/adapters/driving/unit-actions'

// --- Uniones discriminadas por `kind` -------------------------------------------------------
expectTypeOf<InventoryImportPreviewOutcome['kind']>().toEqualTypeOf<'preview' | 'file_rejected'>()
expectTypeOf<InventoryImportConfirmOutcome['kind']>().toEqualTypeOf<
  'imported' | 'already_imported' | 'file_rejected'
>()
expectTypeOf<Extract<InventoryImportPreviewOutcome, { kind: 'preview' }>>().toEqualTypeOf<InventoryImportPreview>()
expectTypeOf<Extract<InventoryImportPreviewOutcome, { kind: 'file_rejected' }>>().toEqualTypeOf<ImportFileRejected>()
expectTypeOf<Extract<InventoryImportConfirmOutcome, { kind: 'imported' }>>().toEqualTypeOf<InventoryImportResult>()
expectTypeOf<Extract<InventoryImportConfirmOutcome, { kind: 'already_imported' }>>().toEqualTypeOf<ImportAlreadyDone>()

// --- Uniones discriminadas por `status` -----------------------------------------------------
expectTypeOf<ImportPreviewStatus>().toEqualTypeOf<'create' | 'add_batch' | 'duplicate' | 'error'>()
expectTypeOf<ImportResultRow['status']>().toEqualTypeOf<'created' | 'batch_added' | 'duplicate' | 'error'>()
expectTypeOf<Extract<ImportPreviewRow, { status: 'create' }>>().not.toHaveProperty('target')
expectTypeOf<Extract<ImportPreviewRow, { status: 'add_batch' }>>().toHaveProperty('target')
expectTypeOf<Extract<ImportPreviewRow, { status: 'duplicate' }>['lot']>().toEqualTypeOf<string>()
expectTypeOf<Extract<ImportResultRow, { status: 'created' }>['productId']>().toEqualTypeOf<string>()
expectTypeOf<Extract<ImportResultRow, { status: 'batch_added' }>['productId']>().toEqualTypeOf<string>()
expectTypeOf<Extract<ImportResultRow, { status: 'duplicate' }>>().not.toHaveProperty('productId')

// --- `issues` no vacio ----------------------------------------------------------------------
type PreviewIssues = Extract<ImportPreviewRow, { status: 'error' }>['issues']
type ResultIssues = Extract<ImportResultRow, { status: 'error' }>['issues']
expectTypeOf<PreviewIssues>().toEqualTypeOf<readonly [ImportRowIssue, ...ImportRowIssue[]]>()
expectTypeOf<ResultIssues>().toEqualTypeOf<readonly [ImportRowIssue, ...ImportRowIssue[]]>()
// @ts-expect-error una fila en error sin ningun motivo no compila
export const issuesVacios: PreviewIssues = []

// --- Celdas = columnas de la plantilla ------------------------------------------------------
expectTypeOf<keyof ImportCells>().toEqualTypeOf<(typeof INVENTORY_IMPORT_COLUMNS)[number]['key']>()
expectTypeOf<keyof ImportCells>().toEqualTypeOf<ImportColumnKey>()
expectTypeOf<ImportCells[ImportColumnKey]>().toEqualTypeOf<string>()

// --- Etiquetas de tipo ----------------------------------------------------------------------
expectTypeOf<ImportRowType>().toEqualTypeOf<ProductType>()
expectTypeOf<keyof typeof IMPORT_TYPE_LABELS>().toEqualTypeOf<ImportRowType>()
expectTypeOf<keyof (typeof INVENTORY_IMPORT_COLUMNS)[number]['rules']>().toEqualTypeOf<ImportRowType>()

// --- Casos de uso ---------------------------------------------------------------------------
expectTypeOf(createPreviewInventoryImport).returns.toEqualTypeOf<PreviewInventoryImport>()
expectTypeOf(createConfirmInventoryImport).returns.toEqualTypeOf<ConfirmInventoryImport>()
expectTypeOf<PreviewInventoryImport>().parameters.toEqualTypeOf<
  [{ readonly fileName: string; readonly bytes: Uint8Array }, Actor | null | undefined]
>()
expectTypeOf<Parameters<ConfirmInventoryImport>[0]['importKey']>().toEqualTypeOf<string>()

// --- Acciones nuevas ------------------------------------------------------------------------
expectTypeOf<typeof previewInventoryImportAction>().toEqualTypeOf<
  (formData: FormData) => Promise<PreviewInventoryImportResult>
>()
expectTypeOf<typeof confirmInventoryImportAction>().toEqualTypeOf<
  (formData: FormData) => Promise<ConfirmInventoryImportResult>
>()
expectTypeOf<PreviewInventoryImportResult>().toEqualTypeOf<
  { status: 'success'; data: InventoryImportPreviewOutcome } | ErrorState
>()
expectTypeOf<ConfirmInventoryImportResult>().toEqualTypeOf<
  { status: 'success'; data: InventoryImportConfirmOutcome } | ErrorState
>()

// --- Acciones reutilizadas por la pantalla --------------------------------------------------
expectTypeOf<typeof createUnitAction>().toEqualTypeOf<
  (prev: CreateUnitFormState, formData: FormData) => Promise<CreateUnitFormState>
>()
expectTypeOf<CreateUnitFormState>().toEqualTypeOf<
  { status: 'idle' } | { status: 'success'; id: string } | ErrorState
>()
expectTypeOf<typeof createPresentationAction>().toEqualTypeOf<
  (prev: CreatePresentationFormState, formData: FormData) => Promise<CreatePresentationFormState>
>()
expectTypeOf<CreatePresentationFormState>().toEqualTypeOf<
  { status: 'idle' } | { status: 'success'; id: string } | ErrorState
>()
expectTypeOf<typeof listUnitsAction>().toExtend<() => Promise<UnitListResult>>()
