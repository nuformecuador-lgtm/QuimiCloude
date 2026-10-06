'use client';

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  InfoIcon,
  LayersIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type {
  ImportAlreadyDone,
  ImportNothingImported,
  ImportResultRow,
  ImportResultTotals,
  InventoryImportResult,
} from '@/lib/modules/inventario';

import { ErrorFileButton, ExampleRowIgnoredNotice, ImportTotals } from './import-preview-summary';
import {
  ImportIssueList,
  ImportRowsTable,
  ImportStatusLabel,
  type ImportStatusPresentation,
} from './import-preview-table';
import {
  ALREADY_IMPORTED_TESTID,
  NOTHING_IMPORTED_MESSAGE_TESTID,
  NOTHING_IMPORTED_TESTID,
  NOTHING_IMPORTED_TITLE,
  RESTART_LABEL,
  RESTART_TESTID,
  RESULT_STATUS_LABELS,
  RESULT_TABLE_TESTID,
  RESULT_TESTID,
  RESULT_TITLE,
  RESULT_TOTAL_LABELS,
  addedLotDetail,
  alreadyImportedMessage,
  createdLotDetail,
  duplicateLotDetail,
  nothingImportedMessage,
  resultDescription,
} from './import-texts';

type ResultStatus = ImportResultRow['status'];

const RESULT_STATUS_PRESENTATION: Readonly<Record<ResultStatus, ImportStatusPresentation>> = {
  created: { label: RESULT_STATUS_LABELS.created, icon: CircleCheckIcon, className: 'text-foreground' },
  batch_added: { label: RESULT_STATUS_LABELS.batch_added, icon: LayersIcon, className: 'text-foreground' },
  duplicate: { label: RESULT_STATUS_LABELS.duplicate, icon: CopyIcon, className: 'text-muted-foreground' },
  error: { label: RESULT_STATUS_LABELS.error, icon: CircleAlertIcon, className: 'text-destructive' },
};

const RESULT_STATUS_ORDER: readonly ResultStatus[] = ['created', 'batch_added', 'duplicate', 'error'];

export const RESULT_TABLE_ID = 'inventario-importar-resultado';

function resultStatus(row: ImportResultRow): ReactNode {
  return <ImportStatusLabel status={row.status} presentation={RESULT_STATUS_PRESENTATION[row.status]} />;
}

function resultDetail(row: ImportResultRow): ReactNode {
  switch (row.status) {
    case 'created':
      return createdLotDetail(row.lot);
    case 'batch_added':
      return addedLotDetail(row.lot);
    case 'duplicate':
      return duplicateLotDetail(row.lot);
    case 'error':
      return <ImportIssueList issues={row.issues} />;
  }
}

function RestartButton({ onRestart }: { readonly onRestart: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 min-w-11"
      data-testid={RESTART_TESTID}
      onClick={onRestart}
    >
      {RESTART_LABEL}
    </Button>
  );
}

function ResultRows({
  totals,
  rows,
  exampleRowIgnored,
  onDownloadErrors,
  onRestart,
}: {
  readonly totals: ImportResultTotals;
  readonly rows: readonly ImportResultRow[];
  readonly exampleRowIgnored: boolean;
  readonly onDownloadErrors: () => void;
  readonly onRestart: () => void;
}) {
  const statuses = RESULT_STATUS_ORDER.map((value) => ({
    value,
    count: rows.reduce((total, row) => (row.status === value ? total + 1 : total), 0),
  }));

  return (
    <>
      <ImportTotals totals={totals} labels={RESULT_TOTAL_LABELS} />
      {exampleRowIgnored ? <ExampleRowIgnoredNotice /> : null}
      <div className="flex flex-wrap gap-2">
        {totals.error > 0 ? <ErrorFileButton onDownload={onDownloadErrors} /> : null}
        <RestartButton onRestart={onRestart} />
      </div>
      <ImportRowsTable
        tableId={RESULT_TABLE_ID}
        testId={RESULT_TABLE_TESTID}
        rows={rows}
        statuses={statuses}
        statusLabels={RESULT_STATUS_LABELS}
        renderStatus={resultStatus}
        renderDetail={resultDetail}
      />
    </>
  );
}

export type ImportResultSummaryProps = {
  readonly result: InventoryImportResult;
  readonly onDownloadErrors: () => void;
  readonly onRestart: () => void;
};

export function ImportResultSummary({ result, onDownloadErrors, onRestart }: ImportResultSummaryProps) {
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid={RESULT_TESTID}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{RESULT_TITLE}</h2>
        <p className="text-sm text-muted-foreground">{resultDescription(result.fileName, result.importedAt)}</p>
      </div>
      <ResultRows
        totals={result.totals}
        rows={result.rows}
        exampleRowIgnored={result.exampleRowIgnored}
        onDownloadErrors={onDownloadErrors}
        onRestart={onRestart}
      />
    </section>
  );
}

export type ImportNothingImportedSummaryProps = {
  readonly nothing: ImportNothingImported;
  readonly onDownloadErrors: () => void;
  readonly onRestart: () => void;
};

export function ImportNothingImportedSummary({
  nothing,
  onDownloadErrors,
  onRestart,
}: ImportNothingImportedSummaryProps) {
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid={NOTHING_IMPORTED_TESTID}>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{NOTHING_IMPORTED_TITLE}</h2>
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm"
          data-testid={NOTHING_IMPORTED_MESSAGE_TESTID}
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {nothingImportedMessage(nothing.fileName)}
        </p>
      </div>
      <ResultRows
        totals={nothing.totals}
        rows={nothing.rows}
        exampleRowIgnored={nothing.exampleRowIgnored}
        onDownloadErrors={onDownloadErrors}
        onRestart={onRestart}
      />
    </section>
  );
}

export function ImportAlreadyDoneNotice({
  done,
  onRestart,
}: {
  readonly done: ImportAlreadyDone;
  readonly onRestart: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-3" data-testid={ALREADY_IMPORTED_TESTID}>
      <p role="status" className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {alreadyImportedMessage(done.importedAt)}
      </p>
      <RestartButton onRestart={onRestart} />
    </section>
  );
}
