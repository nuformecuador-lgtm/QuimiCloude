import type { ReactNode } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, type ErrorState as OperationError } from '@/lib/modules/errores';

type CataloguedError = Exclude<OperationError, { code: typeof UNEXPECTED_ERROR_CODE }>;

type ErrorAlertProps = {
  readonly error: OperationError;
  readonly testId?: string;
  readonly id?: string;
  readonly className?: string;
  /** `null` pinta el contenedor sin rol. */
  readonly role?: 'alert' | null;
  readonly withDataCode?: boolean;
  readonly renderCatalogued?: (error: CataloguedError) => ReactNode;
  readonly before?: ReactNode;
  readonly after?: ReactNode;
};

function renderMessage(error: CataloguedError): ReactNode {
  return <p>{error.message}</p>;
}

// El rol lo pone este contenedor y no `UnexpectedErrorNotice`: dos regiones vivas anidadas
// anuncian el mismo error dos veces.
export function ErrorAlert({
  error,
  testId,
  id,
  className,
  role = 'alert',
  withDataCode = false,
  renderCatalogued = renderMessage,
  before,
  after,
}: ErrorAlertProps) {
  return (
    <div
      role={role ?? undefined}
      id={id}
      className={className}
      data-testid={testId}
      data-code={withDataCode ? error.code : undefined}
    >
      {before}
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        renderCatalogued(error)
      )}
      {after}
    </div>
  );
}
