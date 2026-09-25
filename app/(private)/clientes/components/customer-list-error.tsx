import Link from 'next/link';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { buttonVariants } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { cn } from '@/lib/utils';

export const CUSTOMER_LIST_ERROR_TESTID = 'customer-list-error';
export const CUSTOMER_LIST_ERROR_MESSAGE_TESTID = 'customer-list-error-message';
export const CUSTOMER_LIST_ERROR_CODE_TESTID = 'customer-list-error-code';
export const CUSTOMER_LIST_RETRY_TESTID = 'customer-list-retry';

export type CustomerListErrorProps = {
  /**
   * El error de la consulta, ENTERO: la pareja `message`/`code` suelta no puede llevar el
   * `reference` del error inesperado.
   */
  readonly error: ErrorState;
  /** Destino del reintento, derivado de `customerListHref(params)`. */
  readonly retryHref: string;
};

/**
 * Estado de error de la lista de clientes.
 *
 * No se pinta una tabla vacia cuando la consulta falla: confundir «fallo» con «no hay nada»
 * seria el error contrario. El reintento es un ENLACE a la propia URL de la lista y no
 * `router.refresh()`: este componente no necesita frontera de cliente para pedir de nuevo los
 * datos, porque volver a pedir esta pagina ya vuelve a ejecutar el Server Component.
 *
 * Tambien es donde aterriza un error de autorizacion de la operacion: la pantalla no decide
 * nada por su cuenta, presenta el error y no muestra ni un dato de clientes.
 */
export function CustomerListError({ error, retryHref }: CustomerListErrorProps) {
  return (
    <div
      role="alert"
      data-testid={CUSTOMER_LIST_ERROR_TESTID}
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de clientes.</p>
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid={CUSTOMER_LIST_ERROR_MESSAGE_TESTID}>
            {error.message}
          </p>
          <p className="text-xs text-muted-foreground" data-testid={CUSTOMER_LIST_ERROR_CODE_TESTID}>
            {error.code}
          </p>
        </>
      )}
      <Link
        href={retryHref}
        data-slot="button"
        data-testid={CUSTOMER_LIST_RETRY_TESTID}
        className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
      >
        Reintentar
      </Link>
    </div>
  );
}
