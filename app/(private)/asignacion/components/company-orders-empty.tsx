import { AssignmentListEmpty } from './assignment-list-parts';

export type CompanyOrdersEmptyProps = {
  /** Presente solo si la pagina pedida se paso del total; ausente si no hay ningun pedido. */
  readonly firstPageHref?: string;
};

export function CompanyOrdersEmpty({ firstPageHref }: CompanyOrdersEmptyProps) {
  return (
    <AssignmentListEmpty
      testIdPrefix="company-orders"
      message="No hay pedidos que mostrar con este filtro."
      firstPageHref={firstPageHref}
    />
  );
}
