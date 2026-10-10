import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { asignaciones, identity, observabilidad } from '@/lib/composition';
import {
  AsignacionesError,
  OrderNotFoundError,
  ValidationError,
  type Actor,
  type ConditioningTeamCandidates,
} from '@/lib/modules/asignaciones';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import { runInRequestScope } from '@/lib/shared/request-scope';

import { ConditioningOrderScreen } from './components';

const toErrorState = createErrorStateTranslator(
  AsignacionesError,
  observabilidad.readRequestIdHeader,
);

export const metadata: Metadata = {
  title: `Acondicionamiento · ${BRAND_LABEL}`,
};

/**
 * El actor, de las dos caras de la sesion, calcado del de `empaque/[id]/page.tsx`: cada adaptador
 * driving arma el suyo, no hay una version compartida.
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

/**
 * El detalle de un pedido para quien acondiciona. Sin el permiso responde 404, nunca 403, antes de
 * leer ningun pedido. Un id que no es uuid o un pedido que el caso de uso no deja ver dan el mismo
 * 404, sin revelar cual de los dos fue.
 */
export default async function ConditioningOrderPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePagePermission('acondicionamiento.modificar');

  const { id } = await params;
  const actor = await currentActor();
  if (actor === null) notFound();

  let order;
  try {
    order = await asignaciones.getConditioningOrder(actor, { orderId: id });
  } catch (error) {
    if (error instanceof OrderNotFoundError || error instanceof ValidationError) notFound();
    throw error;
  }

  const canStart = order.status === 'POR_ACONDICIONAR';
  const canFinish = order.status === 'EN_ACONDICIONAMIENTO' && order.conditionedById === actor.id;
  const finishBlocked = order.batchData !== null && order.batchData.missingCount > 0;

  let candidates: ConditioningTeamCandidates | null = null;
  let candidatesError: ErrorState | null = null;
  if (canStart) {
    try {
      candidates = await asignaciones.listConditioningTeamCandidates(actor, {});
    } catch (error) {
      if (!(error instanceof AsignacionesError)) throw error;
      candidatesError = await toErrorState(error);
    }
  }

  return (
    <ConditioningOrderScreen
      order={order}
      canStart={canStart}
      canFinish={canFinish}
      finishBlocked={finishBlocked}
      candidates={candidates}
      candidatesError={candidatesError}
    />
  );
}
