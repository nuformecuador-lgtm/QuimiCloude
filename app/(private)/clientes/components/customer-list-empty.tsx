import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CUSTOMER_LIST_EMPTY_TESTID = 'customer-list-empty';
export const CUSTOMER_LIST_EMPTY_MESSAGE_TESTID = 'customer-list-empty-message';
export const CUSTOMER_LIST_FIRST_PAGE_TESTID = 'customer-list-first-page';

export type CustomerListEmptyProps = {
  /**
   * MIENTRAS la sesion no incluya `clientes.modificar`, el disparador de alta no se monta (R5,
   * R19): ni siquiera deshabilitado. Este componente es quien decide, para que la regla no
   * dependa de que quien lo use se acuerde de aplicarla.
   */
  readonly canModify: boolean;
  /**
   * Destino a la primera pagina, presente SOLO cuando la pagina pedida se quedo sin elementos por
   * ser mayor que el total (R20). Ausente cuando no hay ni un cliente (R19): en ese caso, y solo
   * en ese, se monta el disparador de alta.
   */
  readonly firstPageHref?: string;
  /** El disparador de alta (R19), enchufado por quien monta la seccion. */
  readonly children?: ReactNode;
};

/**
 * Estado vacio de la lista de clientes (R19, R20, `design.md > 5.1`).
 *
 * Se pinta FUERA de `<DataTable>`, no con su prop `status`: el vacio de esta pantalla lleva
 * accion propia y copy propio, igual que `order-list-empty.tsx`.
 *
 * El caso «sin coincidencias» (busqueda o filtro activos sin resultado) NO vive aqui: lo pinta la
 * propia tabla, con la caja de busqueda montada (`design.md > 5.1`).
 */
export function CustomerListEmpty({ canModify, firstPageHref, children }: CustomerListEmptyProps) {
  return (
    <div
      data-testid={CUSTOMER_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid={CUSTOMER_LIST_EMPTY_MESSAGE_TESTID}>
        {firstPageHref === undefined
          ? 'Todavía no hay clientes registrados.'
          : 'Esta página ya no tiene clientes.'}
      </p>

      {firstPageHref === undefined ? (
        canModify ? (
          children
        ) : null
      ) : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid={CUSTOMER_LIST_FIRST_PAGE_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
    </div>
  );
}
