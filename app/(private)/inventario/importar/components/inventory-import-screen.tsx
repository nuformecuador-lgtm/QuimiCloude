'use client';

import { LoaderCircleIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import {
  buildInventoryImportErrorFile,
  type ImportAlreadyDone,
  type ImportFileRejection as Rejection,
  type ImportNothingImported,
  type InventoryImportConfirmOutcome,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '@/lib/modules/inventario';
import {
  confirmInventoryImportAction,
  previewInventoryImportAction,
} from '@/lib/modules/inventario/adapters/driving/inventory-import-actions';
import type { UnitView } from '@/lib/modules/unidades';

import { downloadFile } from './download-file';
import { ImportFileRejection } from './import-file-rejection';
import { ImportMissingCatalog } from './import-missing-catalog';
import { ImportPreviewSummary } from './import-preview-summary';
import { ImportPreviewTable } from './import-preview-table';
import {
  ImportAlreadyDoneNotice,
  ImportNothingImportedSummary,
  ImportResultSummary,
} from './import-result-summary';
import { ImportTemplateButton } from './import-template-button';
import {
  IMPORT_SCREEN_TESTID,
  PREVIEW_DESCRIPTION,
  PREVIEW_TITLE,
  REVIEWING_NOTICE,
  REVIEWING_TESTID,
  REVIEW_BUTTON_LABEL,
  REVIEW_BUTTON_TESTID,
  SCREEN_ERROR_TESTID,
} from './import-texts';
import { ImportUploadField, exceedsImportMaxBytes } from './import-upload-field';

type Outcome =
  | { readonly kind: 'rejected'; readonly rejection: Rejection }
  | { readonly kind: 'preview'; readonly preview: InventoryImportPreview; readonly importKey: string }
  | { readonly kind: 'imported'; readonly result: InventoryImportResult }
  | { readonly kind: 'nothing_imported'; readonly nothing: ImportNothingImported }
  | { readonly kind: 'already_imported'; readonly done: ImportAlreadyDone };

function confirmOutcome(data: InventoryImportConfirmOutcome): Outcome {
  switch (data.kind) {
    case 'imported':
      return { kind: 'imported', result: data };
    case 'nothing_imported':
      return { kind: 'nothing_imported', nothing: data };
    case 'already_imported':
      return { kind: 'already_imported', done: data };
    case 'file_rejected':
      return { kind: 'rejected', rejection: data.rejection };
  }
}

function isFinished(outcome: Outcome | null): boolean {
  if (outcome === null) return false;
  switch (outcome.kind) {
    case 'imported':
    case 'nothing_imported':
    case 'already_imported':
      return true;
    case 'rejected':
    case 'preview':
      return false;
  }
}

type Busy = 'preview' | 'confirm' | null;

function ScreenError({ error }: { readonly error: ErrorState }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      data-testid={SCREEN_ERROR_TESTID}
      data-code={error.code}
    >
      {error.code === UNEXPECTED_ERROR_CODE ? <UnexpectedErrorNotice state={error} /> : <p>{error.message}</p>}
    </div>
  );
}

export type InventoryImportScreenProps = {
  readonly units: readonly UnitView[];
};

export function InventoryImportScreen({ units }: InventoryImportScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  // Los diálogos de alta avisan después de un `await`: el archivo se lee de aquí para no depender
  // del render en el que se abrieron.
  const fileRef = useRef<File | null>(null);

  function selectFile(next: File) {
    fileRef.current = next;
    setFile(next);
    setOutcome(null);
    setError(null);
  }

  function restart() {
    fileRef.current = null;
    setFile(null);
    setOutcome(null);
    setError(null);
  }

  async function requestPreview() {
    const current = fileRef.current;
    if (current === null || exceedsImportMaxBytes(current)) return;
    setBusy('preview');
    setError(null);
    const formData = new FormData();
    formData.set('file', current);
    try {
      const response = await previewInventoryImportAction(formData);
      if (response.status === 'error') {
        setError(response);
        return;
      }
      const data = response.data;
      setOutcome(
        data.kind === 'file_rejected'
          ? { kind: 'rejected', rejection: data.rejection }
          : { kind: 'preview', preview: data, importKey: crypto.randomUUID() },
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirm(importKey: string) {
    const current = fileRef.current;
    if (current === null) return;
    setBusy('confirm');
    setError(null);
    const formData = new FormData();
    formData.set('file', current);
    formData.set('importKey', importKey);
    try {
      const response = await confirmInventoryImportAction(formData);
      if (response.status === 'error') {
        // La vista previa y su clave se conservan: reintentar no puede importar dos veces.
        setError(response);
        return;
      }
      setOutcome(confirmOutcome(response.data));
    } finally {
      setBusy(null);
    }
  }

  const finished = isFinished(outcome);
  const canReview =
    file !== null && !exceedsImportMaxBytes(file) && busy === null && outcome?.kind !== 'preview';

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-busy={busy !== null}
      data-testid={IMPORT_SCREEN_TESTID}
    >
      {finished ? null : (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <ImportUploadField file={file} onSelect={selectFile} disabled={busy !== null} />
          <div className="flex flex-wrap gap-2">
            {outcome?.kind === 'preview' ? null : (
              <Button
                type="button"
                className="min-h-11 min-w-11"
                disabled={!canReview}
                aria-busy={busy === 'preview'}
                data-testid={REVIEW_BUTTON_TESTID}
                onClick={() => void requestPreview()}
              >
                {REVIEW_BUTTON_LABEL}
              </Button>
            )}
            <ImportTemplateButton />
          </div>
        </div>
      )}

      {busy === 'preview' ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={REVIEWING_TESTID}>
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          {REVIEWING_NOTICE}
        </p>
      ) : null}

      {error === null ? null : <ScreenError error={error} />}

      {outcome?.kind === 'rejected' ? <ImportFileRejection rejection={outcome.rejection} /> : null}

      {outcome?.kind === 'preview' ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{PREVIEW_TITLE}</h2>
            <p className="text-sm text-muted-foreground">{PREVIEW_DESCRIPTION}</p>
          </div>
          <ImportPreviewSummary
            preview={outcome.preview}
            confirming={busy === 'confirm'}
            onConfirm={() => void confirm(outcome.importKey)}
            onDownloadErrors={() =>
              downloadFile(buildInventoryImportErrorFile(outcome.preview.rows, outcome.preview.fileName))
            }
          />
          <ImportMissingCatalog
            missingUnits={outcome.preview.missingUnits}
            missingPresentations={outcome.preview.missingPresentations}
            canCreateUnits={outcome.preview.canCreateUnits}
            canCreatePresentations={outcome.preview.canCreatePresentations}
            units={units}
            disabled={busy !== null}
            onCreated={() => void requestPreview()}
          />
          <ImportPreviewTable rows={outcome.preview.rows} />
        </div>
      ) : null}

      {outcome?.kind === 'imported' ? (
        <ImportResultSummary
          result={outcome.result}
          onDownloadErrors={() =>
            downloadFile(buildInventoryImportErrorFile(outcome.result.rows, outcome.result.fileName))
          }
          onRestart={restart}
        />
      ) : null}

      {outcome?.kind === 'nothing_imported' ? (
        <ImportNothingImportedSummary
          nothing={outcome.nothing}
          onDownloadErrors={() =>
            downloadFile(buildInventoryImportErrorFile(outcome.nothing.rows, outcome.nothing.fileName))
          }
          onRestart={restart}
        />
      ) : null}

      {outcome?.kind === 'already_imported' ? (
        <ImportAlreadyDoneNotice done={outcome.done} onRestart={restart} />
      ) : null}
    </section>
  );
}
