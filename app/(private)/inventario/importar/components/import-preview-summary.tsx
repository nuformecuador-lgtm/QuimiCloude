'use client';

import { DownloadIcon, InfoIcon, LoaderCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { InventoryImportPreview } from '@/lib/modules/inventario';

import {
  CONFIRMING_LABEL,
  CONFIRM_BUTTON_TESTID,
  ERROR_FILE_BUTTON_LABEL,
  ERROR_FILE_BUTTON_TESTID,
  EXAMPLE_ROW_IGNORED_NOTICE,
  EXAMPLE_ROW_NOTICE_TESTID,
  NO_VALID_ROWS_NOTICE,
  NO_VALID_ROWS_TESTID,
  PARTIAL_IMPORT_NOTICE,
  PREVIEW_SUMMARY_TESTID,
  PREVIEW_TOTAL_LABELS,
  confirmLabel,
  formatCount,
  totalTestId,
} from './import-texts';

export function ImportTotals<TKey extends string>({
  totals,
  labels,
}: {
  readonly totals: Readonly<Record<TKey, number>>;
  readonly labels: Readonly<Record<TKey, string>>;
}) {
  const keys = Object.keys(labels) as TKey[];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {keys.map((key) => (
        <div key={key} className="flex flex-col rounded-lg border p-3" data-testid={totalTestId(key)}>
          <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatCount(totals[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExampleRowIgnoredNotice() {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
      data-testid={EXAMPLE_ROW_NOTICE_TESTID}
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {EXAMPLE_ROW_IGNORED_NOTICE}
    </p>
  );
}

export function ErrorFileButton({ onDownload }: { readonly onDownload: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 min-w-11"
      data-testid={ERROR_FILE_BUTTON_TESTID}
      onClick={onDownload}
    >
      <DownloadIcon aria-hidden />
      {ERROR_FILE_BUTTON_LABEL}
    </Button>
  );
}

export type ImportPreviewSummaryProps = {
  readonly preview: InventoryImportPreview;
  readonly confirming: boolean;
  readonly onConfirm: () => void;
  readonly onDownloadErrors: () => void;
};

export function ImportPreviewSummary({
  preview,
  confirming,
  onConfirm,
  onDownloadErrors,
}: ImportPreviewSummaryProps) {
  const { totals } = preview;
  const validRows = totals.create + totals.addBatch;
  const hasSkippedRows =
    totals.error + totals.duplicate > 0 ||
    preview.missingUnits.length + preview.missingPresentations.length > 0;

  return (
    <section className="flex flex-col gap-3" data-testid={PREVIEW_SUMMARY_TESTID}>
      <ImportTotals totals={totals} labels={PREVIEW_TOTAL_LABELS} />
      {preview.exampleRowIgnored ? <ExampleRowIgnoredNotice /> : null}
      {validRows === 0 ? (
        <p role="status" className="text-sm text-muted-foreground" data-testid={NO_VALID_ROWS_TESTID}>
          {NO_VALID_ROWS_NOTICE}
        </p>
      ) : hasSkippedRows ? (
        <p className="text-sm text-muted-foreground">{PARTIAL_IMPORT_NOTICE}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11 min-w-11"
          disabled={validRows === 0 || confirming}
          aria-busy={confirming}
          data-testid={CONFIRM_BUTTON_TESTID}
          onClick={onConfirm}
        >
          {confirming ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : null}
          {confirming ? CONFIRMING_LABEL : confirmLabel(validRows)}
        </Button>
        {totals.error > 0 ? <ErrorFileButton onDownload={onDownloadErrors} /> : null}
      </div>
    </section>
  );
}
