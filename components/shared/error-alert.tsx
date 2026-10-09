import type { ReactNode } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, type ErrorState as OperationError } from '@/lib/modules/errores';

type CataloguedError = Exclude<OperationError, { code: typeof UNEXPECTED_ERROR_CODE }>;

type ContainerTag = 'div' | 'p';

type ErrorAlertProps = {
  readonly error: OperationError;
  readonly as?: ContainerTag;
  /** Etiqueta del contenedor en la rama de catalogo. Por defecto, la de `as`. */
  readonly cataloguedAs?: ContainerTag;
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

function renderMessageBlock(error: CataloguedError): ReactNode {
  return <p>{error.message}</p>;
}

function renderBareMessage(error: CataloguedError): ReactNode {
  return error.message;
}

// El rol lo pone este contenedor y no `UnexpectedErrorNotice`: dos regiones vivas anidadas
// anuncian el mismo error dos veces.
export function ErrorAlert({
  error,
  as = 'div',
  cataloguedAs = as,
  testId,
  id,
  className,
  role = 'alert',
  withDataCode = false,
  renderCatalogued,
  before,
  after,
}: ErrorAlertProps) {
  const isUnexpected = error.code === UNEXPECTED_ERROR_CODE;
  const Container = isUnexpected ? as : cataloguedAs;
  // Un `<p>` no puede contener otro `<p>`: si la rama de catalogo usa `p`, el mensaje va pelado.
  const renderCataloguedError =
    renderCatalogued ?? (cataloguedAs === 'p' ? renderBareMessage : renderMessageBlock);

  return (
    <Container
      role={role ?? undefined}
      id={id}
      className={className}
      data-testid={testId}
      data-code={withDataCode ? error.code : undefined}
    >
      {before}
      {isUnexpected ? <UnexpectedErrorNotice state={error} /> : renderCataloguedError(error)}
      {after}
    </Container>
  );
}
