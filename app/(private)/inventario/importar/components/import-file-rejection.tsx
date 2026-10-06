import { FileXIcon } from 'lucide-react';

import type { ImportFileRejection as Rejection } from '@/lib/modules/inventario';

import {
  REJECTION_COLUMN_TESTID,
  REJECTION_MESSAGES,
  REJECTION_MESSAGE_TESTID,
  REJECTION_TESTID,
  REJECTION_TITLE,
  tooLargeWarning,
  tooManyRowsMessage,
} from './import-texts';

type RejectionDescription = { readonly message: string; readonly columns: readonly string[] };

export function describeRejection(rejection: Rejection): RejectionDescription {
  switch (rejection.code) {
    case 'unsupported_format':
    case 'unreadable':
    case 'empty':
      return { message: REJECTION_MESSAGES[rejection.code], columns: [] };
    case 'file_too_large':
      return { message: tooLargeWarning(rejection.bytes, rejection.maxBytes), columns: [] };
    case 'too_many_rows':
      return { message: tooManyRowsMessage(rejection.rows, rejection.maxRows), columns: [] };
    case 'missing_columns':
    case 'unknown_columns':
    case 'duplicate_columns':
      return { message: REJECTION_MESSAGES[rejection.code], columns: rejection.columns };
  }
}

export function ImportFileRejection({ rejection }: { readonly rejection: Rejection }) {
  const { message, columns } = describeRejection(rejection);

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4 text-sm"
      data-testid={REJECTION_TESTID}
      data-code={rejection.code}
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <FileXIcon className="size-4 shrink-0" aria-hidden />
        {REJECTION_TITLE}
      </p>
      <p data-testid={REJECTION_MESSAGE_TESTID}>{message}</p>
      {columns.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {columns.map((column, index) => (
            <li key={`${index}-${column}`} data-testid={REJECTION_COLUMN_TESTID}>
              {column}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
