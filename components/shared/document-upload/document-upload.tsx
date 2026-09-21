'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MAX_FILES_PER_BATCH, type PdfStrategy } from '@/lib/modules/documentos';
import { enqueueBatchAction } from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import { issueUploadLinksAction } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';
import type { ErrorState } from '@/lib/modules/errores';

import { DocumentUploadRow } from './document-upload-row';
import {
  CLEAR_LABEL,
  RESUME_LABEL,
  SELECTION_TRIGGER_LABEL,
  SUBMIT_LABEL,
  UNKNOWN_BATCH_LABEL,
  tooManyFilesMessage,
  type BrowserPhase,
} from './labels';
import { PDF_CONTENT_TYPE, uploadFile } from './upload-file';
import { useBatchStatus } from './use-batch-status';

export const DOCUMENT_UPLOAD_TESTID = 'document-upload';
export const DOCUMENT_UPLOAD_INPUT_TESTID = 'document-upload-input';
export const DOCUMENT_UPLOAD_TRIGGER_TESTID = 'document-upload-trigger';
export const DOCUMENT_UPLOAD_SUBMIT_TESTID = 'document-upload-submit';
export const DOCUMENT_UPLOAD_CLEAR_TESTID = 'document-upload-clear';
export const DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID = 'document-upload-selection-error';
export const DOCUMENT_UPLOAD_ERROR_TESTID = 'document-upload-error';
export const DOCUMENT_UPLOAD_RESUME_TESTID = 'document-upload-resume';
export const DOCUMENT_UPLOAD_MISSING_TESTID = 'document-upload-missing';
export const DOCUMENT_UPLOAD_LIST_TESTID = 'document-upload-list';

/** Objetivo tactil minimo, en las clases con las que este repo lo escribe. */
const TOUCH_TARGET = 'min-h-11 min-w-11 text-base';

export type DocumentUploadProps = {
  /** La estrategia de TODA la tanda. */
  readonly strategy: PdfStrategy;
};

type SelectedFile = {
  readonly file: File;
  readonly phase: BrowserPhase;
  readonly path: string | null;
};

export function DocumentUpload({ strategy }: DocumentUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<readonly SelectedFile[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  const { status, error: queryError, missing, resume } = useBatchStatus(batchId);

  const entryOf = (path: string | null) => {
    if (path === null || status === null) return null;
    return status.files.find((file) => file.path === path) ?? null;
  };

  function onSelect(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = Array.from(event.target.files ?? []);
    setActionError(null);

    if (chosen.length > MAX_FILES_PER_BATCH) {
      setSelectionError(tooManyFilesMessage(MAX_FILES_PER_BATCH));
      setFiles([]);
      event.target.value = '';
      return;
    }

    setSelectionError(null);
    setFiles(chosen.map((file) => ({ file, phase: 'pending', path: null })));
  }

  function clearSelection(): void {
    setFiles([]);
    setSelectionError(null);
    setActionError(null);
    setBatchId(null);
    if (inputRef.current !== null) inputRef.current.value = '';
  }

  async function submit(): Promise<void> {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setActionError(null);

    const issued = await issueUploadLinksAction({
      files: files.map(({ file }) => ({ fileName: file.name, contentType: PDF_CONTENT_TYPE })),
    });

    if (issued.status === 'error') {
      setActionError(issued);
      setBusy(false);
      return;
    }

    const uploads = issued.data.uploads;
    setFiles((current) =>
      current.map((entry, index) => ({
        ...entry,
        phase: 'uploading',
        path: uploads[index]?.path ?? null,
      })),
    );

    const results = await Promise.all(
      files.map(async (entry, index) => {
        const upload = uploads[index];
        if (upload === undefined) return false;
        return uploadFile(upload.uploadUrl, entry.file);
      }),
    );

    setFiles((current) =>
      current.map((entry, index) => ({
        ...entry,
        phase: results[index] === true ? 'uploaded' : 'failed',
      })),
    );

    const paths = uploads
      .map((upload, index) => (results[index] === true ? upload.path : null))
      .filter((path): path is string => path !== null);

    if (paths.length === 0) {
      setBusy(false);
      return;
    }

    const enqueued = await enqueueBatchAction({ strategy, paths });
    if (enqueued.status === 'error') {
      setActionError(enqueued);
      setBusy(false);
      return;
    }

    setBatchId(enqueued.data.batchId);
    setBusy(false);
  }

  const shownError = actionError ?? queryError;

  return (
    <section data-testid={DOCUMENT_UPLOAD_TESTID} className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={inputId}
        data-testid={DOCUMENT_UPLOAD_INPUT_TESTID}
        type="file"
        multiple
        accept={PDF_CONTENT_TYPE}
        onChange={onSelect}
        className="sr-only text-base"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          data-testid={DOCUMENT_UPLOAD_TRIGGER_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET, 'cursor-pointer')}
        >
          {SELECTION_TRIGGER_LABEL}
        </label>

        <Button
          type="button"
          data-testid={DOCUMENT_UPLOAD_SUBMIT_TESTID}
          className={TOUCH_TARGET}
          disabled={files.length === 0 || busy}
          onClick={() => {
            void submit();
          }}
        >
          {SUBMIT_LABEL}
        </Button>

        {files.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            data-testid={DOCUMENT_UPLOAD_CLEAR_TESTID}
            className={TOUCH_TARGET}
            onClick={clearSelection}
          >
            {CLEAR_LABEL}
          </Button>
        ) : null}
      </div>

      {selectionError !== null ? (
        <p data-testid={DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID} role="alert" className="text-base">
          {selectionError}
        </p>
      ) : null}

      {shownError !== null ? (
        <p
          data-testid={DOCUMENT_UPLOAD_ERROR_TESTID}
          data-code={shownError.code}
          role="alert"
          className="text-base"
        >
          {shownError.message}
        </p>
      ) : null}

      {queryError !== null ? (
        <Button
          type="button"
          variant="outline"
          data-testid={DOCUMENT_UPLOAD_RESUME_TESTID}
          className={TOUCH_TARGET}
          onClick={resume}
        >
          {RESUME_LABEL}
        </Button>
      ) : null}

      {missing ? (
        <p data-testid={DOCUMENT_UPLOAD_MISSING_TESTID} role="status" className="text-base">
          {UNKNOWN_BATCH_LABEL}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul data-testid={DOCUMENT_UPLOAD_LIST_TESTID} className="flex flex-col">
          {files.map((entry, index) => (
            <DocumentUploadRow
              key={`${entry.file.name}-${index}`}
              index={index}
              fileName={entry.file.name}
              phase={entry.phase}
              entry={entryOf(entry.path)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
