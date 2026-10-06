'use client';

import { FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
import { useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  INVENTORY_IMPORT_ACCEPT,
  INVENTORY_IMPORT_MAX_FILE_BYTES,
  INVENTORY_IMPORT_MAX_ROWS,
} from '@/lib/modules/inventario';

import {
  UPLOAD_CHANGE_LABEL,
  UPLOAD_FIELD_TESTID,
  UPLOAD_FILE_NAME_TESTID,
  UPLOAD_INPUT_LABEL,
  UPLOAD_INPUT_TESTID,
  UPLOAD_NO_FILE,
  UPLOAD_TOO_LARGE_TESTID,
  UPLOAD_TRIGGER_LABEL,
  UPLOAD_TRIGGER_TESTID,
  formatBytes,
  tooLargeWarning,
  uploadHint,
} from './import-texts';

export function exceedsImportMaxBytes(file: File): boolean {
  return file.size > INVENTORY_IMPORT_MAX_FILE_BYTES;
}

export type ImportUploadFieldProps = {
  readonly file: File | null;
  readonly onSelect: (file: File) => void;
  readonly disabled?: boolean;
};

export function ImportUploadField({ file, onSelect, disabled = false }: ImportUploadFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const warningId = `${inputId}-warning`;
  const inputRef = useRef<HTMLInputElement>(null);
  const tooLarge = file !== null && exceedsImportMaxBytes(file);

  return (
    <div className="flex flex-col gap-2" data-testid={UPLOAD_FIELD_TESTID}>
      {/*
        El input sigue siendo el control real y el que abre el selector de Archivos en iOS y
        Android; el botón solo lo dispara para tener un objetivo táctil visible.
      */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={INVENTORY_IMPORT_ACCEPT}
        aria-label={UPLOAD_INPUT_LABEL}
        aria-describedby={tooLarge ? `${hintId} ${warningId}` : hintId}
        aria-invalid={tooLarge ? true : undefined}
        className="sr-only text-base"
        tabIndex={-1}
        disabled={disabled}
        data-testid={UPLOAD_INPUT_TESTID}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          // Sin esto, volver a elegir el mismo archivo no dispara `change`.
          event.target.value = '';
          if (picked !== undefined) onSelect(picked);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={file === null ? 'default' : 'outline'}
          className="min-h-11 min-w-11"
          disabled={disabled}
          data-testid={UPLOAD_TRIGGER_TESTID}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon aria-hidden />
          {file === null ? UPLOAD_TRIGGER_LABEL : UPLOAD_CHANGE_LABEL}
        </Button>
        <p className="flex min-w-0 items-center gap-1.5 text-sm" data-testid={UPLOAD_FILE_NAME_TESTID}>
          {file === null ? (
            <span className="text-muted-foreground">{UPLOAD_NO_FILE}</span>
          ) : (
            <>
              <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">({formatBytes(file.size)})</span>
            </>
          )}
        </p>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {uploadHint(INVENTORY_IMPORT_MAX_FILE_BYTES, INVENTORY_IMPORT_MAX_ROWS)}
      </p>
      {tooLarge ? (
        <p
          id={warningId}
          role="alert"
          className="text-sm text-destructive"
          data-testid={UPLOAD_TOO_LARGE_TESTID}
        >
          {tooLargeWarning(file.size, INVENTORY_IMPORT_MAX_FILE_BYTES)}
        </p>
      ) : null}
    </div>
  );
}
