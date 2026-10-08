'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Button, buttonVariants } from '@/components/ui/button';
import type { ErrorState as OperationError } from '@/lib/modules/errores';

export type ErrorStateRetry =
  | { readonly kind: 'refresh' }
  | { readonly kind: 'href'; readonly href: string };

type ErrorStateRetryProps =
  | { readonly retry: ErrorStateRetry; readonly retryTestId: string; readonly retryLabel?: string }
  | { readonly retry?: undefined; readonly retryTestId?: undefined; readonly retryLabel?: undefined };

export type ErrorStateProps = {
  readonly error: OperationError;
  readonly title: string;
  readonly testId: string;
  readonly messageTestId?: string;
  readonly codeTestId?: string;
  /** Pinta el código bajo el mensaje del error de catálogo. */
  readonly withCode?: boolean;
  readonly className?: string;
} & ErrorStateRetryProps;

const DEFAULT_CLASS_NAME =
  'flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4';

type RetryActionProps = {
  readonly retry: ErrorStateRetry;
  readonly testId: string;
  readonly label: string;
};

function RetryAction({ retry, testId, label }: RetryActionProps) {
  if (retry.kind === 'href') {
    return (
      <Link
        href={retry.href}
        data-slot="button"
        data-testid={testId}
        className={buttonVariants({ variant: 'outline', touch: true })}
      >
        {label}
      </Link>
    );
  }

  return <RefreshRetry testId={testId} label={label} />;
}

// Separado para que el reintento por enlace no exija el router de la app montado.
function RefreshRetry({ testId, label }: Omit<RetryActionProps, 'retry'>) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      touch
      data-testid={testId}
      onClick={() => router.refresh()}
    >
      {label}
    </Button>
  );
}

export function ErrorState({
  error,
  title,
  testId,
  messageTestId,
  codeTestId,
  withCode = true,
  className = DEFAULT_CLASS_NAME,
  retry,
  retryTestId,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <ErrorAlert
      error={error}
      testId={testId}
      className={className}
      before={<p className="text-sm font-medium">{title}</p>}
      renderCatalogued={(catalogued) => (
        <>
          <p className="text-sm text-muted-foreground" data-testid={messageTestId}>
            {catalogued.message}
          </p>
          {withCode ? (
            <p className="text-xs text-muted-foreground" data-testid={codeTestId}>
              {catalogued.code}
            </p>
          ) : null}
        </>
      )}
      after={
        retry === undefined ? null : (
          <RetryAction retry={retry} testId={retryTestId} label={retryLabel} />
        )
      }
    />
  );
}
