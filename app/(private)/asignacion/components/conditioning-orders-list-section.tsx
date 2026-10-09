import type { DataTableParams } from '@/components/shared/data-table';
import { asignaciones, identity, observabilidad } from '@/lib/composition';
import { AsignacionesError, type Actor } from '@/lib/modules/asignaciones';
import { createErrorStateTranslator } from '@/lib/modules/errores';
import { runInRequestScope } from '@/lib/shared/request-scope';

import { AssignedOrdersError } from './assigned-orders-error';
import { FIRST_PAGE } from './assignment-view-params';
import { ConditioningOrdersEmpty } from './conditioning-orders-empty';
import { conditioningOrdersHref } from './conditioning-orders-href';
import { ConditioningOrdersTable } from './conditioning-orders-table';

export const CONDITIONING_ORDERS_SECTION_TESTID = 'conditioning-orders-list-section';

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

type ConditioningOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
};

/**
 * `/asignacion?vista=por_acondicionar`: los `POR_ACONDICIONAR` y `EN_ACONDICIONAMIENTO` de toda la
 * empresa. Llama a la fachada desde el servidor, como «Por empacar», para no abrir una Server
 * Action más que arme el actor.
 */
export async function ConditioningOrdersListSection({ params }: ConditioningOrdersListSectionProps) {
  const actor = await currentActor();

  let result;
  try {
    result = await asignaciones.listConditioningOrders(actor, {
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error) {
    return (
      <div data-testid={CONDITIONING_ORDERS_SECTION_TESTID}>
        <AssignedOrdersError error={await toErrorState(error)} />
      </div>
    );
  }

  const { items, page: currentPage, totalPages } = result;

  if (items.length === 0) {
    return (
      <div data-testid={CONDITIONING_ORDERS_SECTION_TESTID}>
        <ConditioningOrdersEmpty
          list="por_acondicionar"
          firstPageHref={
            currentPage > FIRST_PAGE
              ? conditioningOrdersHref({ ...params, page: FIRST_PAGE })
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div data-testid={CONDITIONING_ORDERS_SECTION_TESTID}>
      <ConditioningOrdersTable rows={items} params={params} totalPages={totalPages} />
    </div>
  );
}
