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
  ImportResultRow,
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

export type ImportResultSummaryProps = {
  readonly result: InventoryImportResult;
  readonly onDownloadErrors: () => void;
  readonly onRestart: () => void;
};

export function ImportResultSummary({ result, onDownloadErrors, onRestart }: ImportResultSummaryProps) {
  const statuses = RESULT_STATUS_ORDER.map((value) => ({
    value,
    count: result.rows.filter((row) => row.status === value).length,
  }));

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid={RESULT_TESTID}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{RESULT_TITLE}</h2>
        <p className="text-sm text-muted-foreground">{resultDescription(result.fileName, result.importedAt)}</p>
      </div>
      <ImportTotals totals={result.totals} labels={RESULT_TOTAL_LABELS} />
      {result.exampleRowIgnored ? <ExampleRowIgnoredNotice /> : null}
      <div className="flex flex-wrap gap-2">
        {result.totals.error > 0 ? <ErrorFileButton onDownload={onDownloadErrors} /> : null}
        <RestartButton onRestart={onRestart} />
      </div>
      <ImportRowsTable
        tableId={RESULT_TABLE_ID}
        testId={RESULT_TABLE_TESTID}
        rows={result.rows}
        statuses={statuses}
        statusLabels={RESULT_STATUS_LABELS}
        renderStatus={resultStatus}
        renderDetail={resultDetail}
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
