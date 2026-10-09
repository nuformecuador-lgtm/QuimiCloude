import type { DataTableParams } from '@/components/shared/data-table';
import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { AsignacionesError, type Actor } from '@/lib/modules/asignaciones';
import { createErrorStateTranslator } from '@/lib/modules/errores';
import { runInRequestScope } from '@/lib/shared/request-scope';

import { AssignedOrdersError } from './assigned-orders-error';
import { FIRST_PAGE } from './assignment-view-params';
import { ConditionedOrdersTable } from './conditioned-orders-table';
import { ConditioningOrdersEmpty } from './conditioning-orders-empty';
import { conditionedOrdersHref } from './conditioning-orders-href';

export const CONDITIONED_ORDERS_SECTION_TESTID = 'conditioned-orders-list-section';

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

/**
 * El actor, de las dos caras de la sesion, calcado del de `packing-orders-list-section.tsx`: cada
 * adaptador driving arma el suyo, no hay una version compartida.
 */
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

type ConditionedOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
};

/** `/asignacion?vista=acondicionados`: los `TERMINADO` que acondicionó el propio actor. */
export async function ConditionedOrdersListSection({ params }: ConditionedOrdersListSectionProps) {
  const actor = await currentActor();

  let result;
  try {
    result = await asignaciones.listConditionedOrders(actor, {
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error) {
    return (
      <div data-testid={CONDITIONED_ORDERS_SECTION_TESTID}>
        <AssignedOrdersError error={await toErrorState(error)} />
      </div>
    );
  }

  const { items, page: currentPage, totalPages } = result;

  if (items.length === 0) {
    return (
      <div data-testid={CONDITIONED_ORDERS_SECTION_TESTID}>
        <ConditioningOrdersEmpty
          list="acondicionados"
          firstPageHref={
            currentPage > FIRST_PAGE
              ? conditionedOrdersHref({ ...params, page: FIRST_PAGE })
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div data-testid={CONDITIONED_ORDERS_SECTION_TESTID}>
      <ConditionedOrdersTable rows={items} params={params} totalPages={totalPages} />
    </div>
  );
}
