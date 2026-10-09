import type { ReactNode } from 'react';

import { EmptyState } from '@/components/shared/empty-state';

type OrderListEmptyProps = {
  /**
   * Accion de crear el primer pedido. Llega como slot desde `OrderListSection` —un Server
   * Component— en vez de importarse aqui: asi el estado vacio no conoce el panel lateral y sigue
   * sin frontera de cliente.
   */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin elementos
   * por ser mayor que el total (caso «la pagina se quedo atras» tras una baja o un filtro).
   * Ausente cuando no hay ni un pedido.
   */
  readonly firstPageHref?: string;
};

export function OrderListEmpty({ children, firstPageHref }: OrderListEmptyProps) {
  return (
    <EmptyState
      testId="order-list-empty"
      messageTestId="order-list-empty-message"
      message={
        firstPageHref === undefined
          ? 'Todavía no hay pedidos registrados.'
          : 'Esta página ya no tiene pedidos.'
      }
      firstPage={
        firstPageHref === undefined
          ? undefined
          : {
              href: firstPageHref,
              label: 'Volver a la primera página',
              testId: 'order-list-first-page',
            }
      }
    >
      {children}
    </EmptyState>
  );
}
