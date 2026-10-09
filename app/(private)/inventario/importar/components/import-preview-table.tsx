'use client';

import {
  CircleAlertIcon,
  CirclePlusIcon,
  CopyIcon,
  LayersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import {
  DataTable,
  createDefaultParams,
  withPage,
  type DataTableColumn,
  type DataTableParams,
} from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import {
  IMPORT_TYPE_LABELS,
  type ImportCells,
  type ImportPreviewRow,
  type ImportPreviewStatus,
  type ImportRowIssue,
  type ImportRowType,
} from '@/lib/modules/inventario';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';
import { cn } from '@/lib/utils';

import {
  PREVIEW_DETAIL_ADD_EXISTING,
  PREVIEW_DETAIL_CREATE,
  PREVIEW_STATUS_LABELS,
  PREVIEW_TABLE_TESTID,
  ROWS_COLUMN_LABELS,
  ROWS_TABLE_TEXTS,
  ROW_DETAIL_TESTID,
  ROW_ISSUE_TESTID,
  ROW_STATUS_TESTID,
  STATUS_FILTER_ALL_LABEL,
  STATUS_FILTER_GROUP_LABEL,
  STATUS_FILTER_TESTID,
  duplicateLotDetail,
  formatCount,
  previewDetailAddFileRow,
  statusFilterTestId,
} from './import-texts';

const ALL_STATUSES = 'all';

type ImportTableRow = {
  readonly rowNumber: number;
  readonly status: string;
  readonly type: ImportRowType | null;
  readonly productName: string | null;
  readonly cells: ImportCells;
};

export type ImportStatusPresentation = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly className: string;
};

export type ImportStatusOption<TStatus extends string> = {
  readonly value: TStatus;
  readonly count: number;
};

export function ImportStatusLabel({
  status,
  presentation,
}: {
  readonly status: string;
  readonly presentation: ImportStatusPresentation;
}) {
  const Icon = presentation.icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', presentation.className)}
      data-testid={ROW_STATUS_TESTID}
      data-status={status}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {presentation.label}
    </span>
  );
}

export function ImportIssueList({ issues }: { readonly issues: readonly ImportRowIssue[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue, index) => (
        <li
          key={`${index}-${issue.code}`}
          className="text-destructive"
          data-testid={ROW_ISSUE_TESTID}
          data-code={issue.code}
          data-column={issue.column ?? undefined}
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function productCell(row: ImportTableRow): ReactNode {
  const name = row.productName ?? (row.cells.name.trim() === '' ? EMPTY_MARK : row.cells.name);
  const type = row.type === null ? row.cells.type : IMPORT_TYPE_LABELS[row.type];
  return (
    <span className="flex min-w-32 flex-col">
      <span className="font-medium break-words whitespace-normal">{name}</span>
      {type.trim() === '' ? null : <span className="text-xs text-muted-foreground">{type}</span>}
    </span>
  );
}

export type ImportRowsTableProps<TRow extends ImportTableRow> = {
  readonly tableId: string;
  readonly testId: string;
  readonly rows: readonly TRow[];
  readonly statuses: readonly ImportStatusOption<TRow['status']>[];
  readonly statusLabels: Readonly<Record<TRow['status'], string>>;
  readonly renderStatus: (row: TRow) => ReactNode;
  readonly renderDetail: (row: TRow) => ReactNode;
};

export function ImportRowsTable<TRow extends ImportTableRow>({
  tableId,
  testId,
  rows,
  statuses,
  statusLabels,
  renderStatus,
  renderDetail,
}: ImportRowsTableProps<TRow>) {
  const [filter, setFilter] = useState<TRow['status'] | typeof ALL_STATUSES>(ALL_STATUSES);
  const [params, setParams] = useState<DataTableParams>(createDefaultParams);

  const filtered = useMemo(
    () => (filter === ALL_STATUSES ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / params.pageSize));
  const page = Math.min(params.page, totalPages);
  const pageRows = filtered.slice((page - 1) * params.pageSize, page * params.pageSize);

  const columns = useMemo<readonly DataTableColumn<TRow>[]>(
    () => [
      { id: 'row', label: ROWS_COLUMN_LABELS.row, align: 'end', cell: (row) => row.rowNumber },
      { id: 'status', label: ROWS_COLUMN_LABELS.status, align: 'start', cell: renderStatus },
      { id: 'product', label: ROWS_COLUMN_LABELS.product, align: 'start', cell: productCell },
      {
        id: 'detail',
        label: ROWS_COLUMN_LABELS.detail,
        align: 'start',
        cell: (row) => (
          <div className="min-w-48 whitespace-normal" data-testid={ROW_DETAIL_TESTID}>
            {renderDetail(row)}
          </div>
        ),
      },
    ],
    [renderStatus, renderDetail],
  );

  function chooseFilter(next: TRow['status'] | typeof ALL_STATUSES) {
    setFilter(next);
    setParams((current) => withPage(current, 1));
  }

  const options: readonly { value: TRow['status'] | typeof ALL_STATUSES; label: string; count: number }[] = [
    { value: ALL_STATUSES, label: STATUS_FILTER_ALL_LABEL, count: rows.length },
    ...statuses.map((option) => ({
      value: option.value,
      label: statusLabels[option.value as TRow['status']],
      count: option.count,
    })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <div
        role="group"
        aria-label={STATUS_FILTER_GROUP_LABEL}
        className="flex flex-wrap gap-2"
        data-testid={STATUS_FILTER_TESTID}
      >
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={filter === option.value ? 'default' : 'outline'}
            touch
            aria-pressed={filter === option.value}
            data-testid={statusFilterTestId(option.value)}
            onClick={() => chooseFilter(option.value)}
          >
            {option.label} ({formatCount(option.count)})
          </Button>
        ))}
      </div>
      <DataTable
        tableId={tableId}
        columns={columns}
        rows={pageRows}
        getRowId={(row) => String(row.rowNumber)}
        params={{ ...params, page }}
        totalPages={totalPages}
        onParamsChange={setParams}
        status="idle"
        texts={ROWS_TABLE_TEXTS}
        searchable={false}
      />
    </div>
  );
}

const PREVIEW_STATUS_PRESENTATION: Readonly<Record<ImportPreviewStatus, ImportStatusPresentation>> = {
  create: { label: PREVIEW_STATUS_LABELS.create, icon: CirclePlusIcon, className: 'text-foreground' },
  add_batch: { label: PREVIEW_STATUS_LABELS.add_batch, icon: LayersIcon, className: 'text-foreground' },
  duplicate: { label: PREVIEW_STATUS_LABELS.duplicate, icon: CopyIcon, className: 'text-muted-foreground' },
  error: { label: PREVIEW_STATUS_LABELS.error, icon: CircleAlertIcon, className: 'text-destructive' },
};

const PREVIEW_STATUS_ORDER: readonly ImportPreviewStatus[] = ['create', 'add_batch', 'duplicate', 'error'];

function previewStatus(row: ImportPreviewRow): ReactNode {
  return <ImportStatusLabel status={row.status} presentation={PREVIEW_STATUS_PRESENTATION[row.status]} />;
}

function previewDetail(row: ImportPreviewRow): ReactNode {
  switch (row.status) {
    case 'create':
      return PREVIEW_DETAIL_CREATE;
    case 'add_batch':
      return row.target.kind === 'existing'
        ? PREVIEW_DETAIL_ADD_EXISTING
        : previewDetailAddFileRow(row.target.rowNumber);
    case 'duplicate':
      return duplicateLotDetail(row.lot);
    case 'error':
      return <ImportIssueList issues={row.issues} />;
  }
}

export const PREVIEW_TABLE_ID = 'inventario-importar-vista-previa';

export function ImportPreviewTable({ rows }: { readonly rows: readonly ImportPreviewRow[] }) {
  const statuses = PREVIEW_STATUS_ORDER.map((value) => ({
    value,
    count: rows.reduce((total, row) => (row.status === value ? total + 1 : total), 0),
  }));

  return (
    <ImportRowsTable
      tableId={PREVIEW_TABLE_ID}
      testId={PREVIEW_TABLE_TESTID}
      rows={rows}
      statuses={statuses}
      statusLabels={PREVIEW_STATUS_LABELS}
      renderStatus={previewStatus}
      renderDetail={previewDetail}
    />
  );
}
