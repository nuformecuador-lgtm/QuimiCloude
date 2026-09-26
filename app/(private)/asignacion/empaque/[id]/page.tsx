import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { asignaciones, identity } from '@/lib/composition';
import { OrderNotFoundError, type Actor } from '@/lib/modules/asignaciones';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import { runInRequestScope } from '@/lib/shared/request-scope';

import { PackingOrderScreen } from './components';

export const metadata: Metadata = {
  title: `Empaque · ${BRAND_LABEL}`,
};

/**
 * El actor, de las dos caras de la sesion, calcado del que arman las demas piezas de esta pantalla
 * (`packing-orders-list-section.tsx`, `order-packing-actions.ts`): cada adaptador driving arma el
 * suyo, no hay una version compartida.
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
 * Pantalla de un pedido de empaque.
 *
 * **El corte por permiso es la PRIMERA linea**: sin `empaque.modificar` responde 404, nunca
 * 403, para no revelar que el pedido existe a quien no puede verlo. La direccion sale de
 * `packingOrderRoute` (`lib/shared/routes.ts`); esta carpeta es solo la forma en que el App
 * Router materializa esa constante.
 *
 * `getPackingOrder` es la MISMA fila que compone «Por empacar» para un unico pedido: si no existe,
 * esta dada de baja, es de otra empresa o su estado no es `POR_EMPACAR`/`EN_EMPAQUE`, lanza
 * `OrderNotFoundError` y esta pagina responde 404, sin revelar cual de esos casos fue.
 *
 * El resultado baja entero por props a `PackingOrderScreen`, junto con el id del actor: la
 * comparacion «quien empaca es el propio actor» se hace por `packedById`, nunca por nombre.
 */
export default async function PackingOrderPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePagePermission('empaque.modificar');

  const { id } = await params;
  const actor = await currentActor();
  if (actor === null) notFound();

  let order;
  try {
    order = await asignaciones.getPackingOrder(actor, { orderId: id });
  } catch (error) {
    if (error instanceof OrderNotFoundError) notFound();
    throw error;
  }

  return <PackingOrderScreen order={order} actorId={actor.id} />;
}
