import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { startAssignedOrderAction } from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import { OrderExecutionError, OrderExecutionScreen } from './components';

export const metadata: Metadata = {
  title: `Ejecutar receta · ${BRAND_LABEL}`,
};

/**
 * Pantalla de ejecucion de la receta de un pedido asignado.
 *
 * El corte por permiso es la PRIMERA linea, antes de resolver `params`: sin `asignaciones.ejecutar`
 * responde 404, nunca 403. La direccion sale de `assignedOrderRoute` (`lib/shared/routes.ts`); esta
 * carpeta es solo la forma en que el App Router materializa esa constante.
 *
 * Abrir la pantalla ya deja el pedido `EN_CURSO` -la accion de apertura hace lectura y transicion
 * en una sola llamada- y baja el resultado entero por props: ningun componente de cliente de esta
 * ruta importa `lib/composition`.
 */
export default async function AssignedOrderExecutionPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePagePermission('asignaciones.ejecutar');

  const { id } = await params;
  const result = await startAssignedOrderAction(id);

  if (result.status === 'error') {
    return <OrderExecutionError error={result} />;
  }

  return <OrderExecutionScreen execution={result.data} />;
}
