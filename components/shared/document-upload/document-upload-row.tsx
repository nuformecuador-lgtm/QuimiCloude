'use client';

import type { DocumentFileStatusEntry } from '@/lib/modules/documentos';

import { BROWSER_PHASE_LABELS, FILE_STATUS_LABELS, fileErrorMessage, type BrowserPhase } from './labels';

export const rowTestId = (index: number): string => `document-upload-row-${index}`;
export const rowNameTestId = (index: number): string => `document-upload-row-name-${index}`;
export const rowPhaseTestId = (index: number): string => `document-upload-row-phase-${index}`;
export const rowStatusTestId = (index: number): string => `document-upload-row-status-${index}`;
export const rowErrorTestId = (index: number): string => `document-upload-row-error-${index}`;
export const rowReasonTestId = (index: number): string => `document-upload-row-reason-${index}`;

export type DocumentUploadRowProps = {
  readonly index: number;
  readonly fileName: string;
  readonly phase: BrowserPhase;
  /** Nulo mientras la tanda no existe: hasta entonces la fila solo puede pintar su fase. */
  readonly entry: DocumentFileStatusEntry | null;
};

export function DocumentUploadRow({
  index,
  fileName,
  phase,
  entry,
}: DocumentUploadRowProps) {
  return (
    <li
      data-testid={rowTestId(index)}
      className="flex flex-wrap items-center gap-2 border-b py-2 text-base last:border-b-0"
    >
      <span data-testid={rowNameTestId(index)} className="grow break-all">
        {fileName}
      </span>

      {entry === null ? (
        <span data-testid={rowPhaseTestId(index)} data-phase={phase}>
          {BROWSER_PHASE_LABELS[phase]}
        </span>
      ) : (
        <span data-testid={rowStatusTestId(index)} data-status={entry.status}>
          {FILE_STATUS_LABELS[entry.status]}
        </span>
      )}

      {entry !== null && entry.status === 'error' ? (
        <p data-testid={rowErrorTestId(index)} className="basis-full text-sm text-destructive">
          {fileErrorMessage(entry.errorCode)}
        </p>
      ) : null}

      {entry !== null && entry.status === 'error' && entry.errorReason !== null ? (
        <p data-testid={rowReasonTestId(index)} className="basis-full text-sm text-muted-foreground">
          {entry.errorReason}
        </p>
      ) : null}
    </li>
  );
}
