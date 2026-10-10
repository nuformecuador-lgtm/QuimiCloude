import Link from 'next/link';

import { ErrorState } from '@/components/shared/error-state';
import {
  ActiveOrderMark,
  DeletedOrderMark,
  EXECUTION_ACTION_LABELS,
  GO_BACK_MARK,
  TRACE_ORDER_STATUS_LABELS,
  formatElapsed,
  formatTraceDuration,
  formatTraceInstant,
} from '@/app/(private)/dashboard/components';
import type { ExecutionTraceDetail as ExecutionTraceDetailData, ExecutionTraceDetailStep } from '@/lib/modules/asignaciones';
import type { ErrorState as OperationError } from '@/lib/modules/errores';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';
import { touchTarget } from '@/lib/shared/ui/touch-target';

export const BACK_TO_LIST_TEXT = 'Volver a la lista';
export { EMPTY_MARK as MISSING_PERSON_MARK } from '@/lib/shared/ui/empty-mark';

const BACK_LINK_CLASS = `inline-flex ${touchTarget} items-center self-start rounded-md px-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring`;

function BackLink({ href }: { readonly href: string }) {
  return (
    <Link href={href} data-testid="execution-trace-back" className={BACK_LINK_CLASS}>
      {BACK_TO_LIST_TEXT}
    </Link>
  );
}

function TraceStepItem({ step }: { readonly step: ExecutionTraceDetailStep }) {
  return (
    <li
      data-testid="execution-trace-step"
      data-action={step.action}
      data-go-back={step.isGoBack ? 'true' : undefined}
      className={
        step.isGoBack
          ? 'flex flex-col gap-1 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/30'
          : 'flex flex-col gap-1 rounded-lg border p-3'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" data-testid="execution-trace-step-action">
          {EXECUTION_ACTION_LABELS[step.action]}
        </span>
        {step.isGoBack ? (
          <span
            data-testid="execution-trace-step-go-back"
            className="rounded-md border border-amber-500 px-1.5 py-0.5 text-xs font-medium"
          >
            {GO_BACK_MARK}
          </span>
        ) : null}
        {step.stepPosition === null ? null : (
          <span className="text-sm text-muted-foreground" data-testid="execution-trace-step-position">
            Paso {step.stepPosition}
          </span>
        )}
      </div>
      <p className="text-sm">
        <time dateTime={step.occurredAt.toISOString()} data-testid="execution-trace-step-instant">
          {formatTraceInstant(step.occurredAt)}
        </time>
        {' · '}
        {step.userDisplayName === null ? (
          <span aria-label="Sin dato" data-testid="execution-trace-step-person">
            {EMPTY_MARK}
          </span>
        ) : (
          <span data-testid="execution-trace-step-person">{step.userDisplayName}</span>
        )}
      </p>
      {step.action === 'cancel' && step.reason !== null ? (
        <p className="text-sm" data-testid="execution-trace-step-reason">
          Motivo: {step.reason}
        </p>
      ) : null}
      {step.gapToNextMs === null ? null : (
        <p className="text-sm text-muted-foreground" data-testid="execution-trace-step-gap">
          Hasta la siguiente: {formatElapsed(step.gapToNextMs)}
        </p>
      )}
    </li>
  );
}

export type ExecutionTraceDetailProps = {
  readonly trace: ExecutionTraceDetailData;
  readonly backHref: string;
};

export function ExecutionTraceDetail({ trace, backHref }: ExecutionTraceDetailProps) {
  return (
    <div data-testid="execution-trace-detail" className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <BackLink href={backHref} />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold" data-testid="execution-trace-title">
          Recorrido del pedido {trace.numberText}
        </h1>
        {trace.deleted ? <DeletedOrderMark /> : null}
        {trace.duration.kind === 'open' ? <ActiveOrderMark /> : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Estado</dt>
        <dd data-testid="execution-trace-status" data-status={trace.status}>
          {TRACE_ORDER_STATUS_LABELS[trace.status]}
        </dd>
        <dt className="text-muted-foreground">Duración</dt>
        <dd data-testid="execution-trace-duration" data-kind={trace.duration.kind}>
          {formatTraceDuration(trace.duration)}
        </dd>
        <dt className="text-muted-foreground">Vueltas atrás</dt>
        <dd data-testid="execution-trace-go-backs">{trace.goBackCount}</dd>
      </dl>
      <ol className="flex flex-col gap-2" aria-label="Anotaciones">
        {trace.steps.map((step) => (
          <TraceStepItem key={step.id} step={step} />
        ))}
      </ol>
    </div>
  );
}

export function ExecutionTraceDetailError({
  error,
  backHref,
}: {
  readonly error: OperationError;
  readonly backHref: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <BackLink href={backHref} />
      <h1 className="text-2xl font-semibold">Recorrido</h1>
      <ErrorState
        error={error}
        title="No se pudo cargar el recorrido."
        testId="execution-trace-detail-error"
        withCode={false}
        className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"
      />
    </div>
  );
}
