// lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts
/**
 * El Route Handler del proceso diario. Sin usuario delante: el unico control de entrada es el
 * secreto del cron, comparado en tiempo constante. El orden es el contrato: verificar el
 * secreto ANTES de leer o escribir ningun pedido.
 *
 * La configuracion de segmento -`runtime` y `maxDuration`- NO vive aqui sino en `route.ts`: Next
 * la extrae del archivo de ruta analizandolo estaticamente y NO admite que se reexporte.
 */
import { pedidos } from '@/lib/composition';

const AUTHORIZATION_HEADER = 'authorization';

function noBody(status: number): Response {
  return new Response(null, { status });
}

export async function GET(request: Request): Promise<Response> {
  const verification = pedidos.verifyCronSecret(request.headers.get(AUTHORIZATION_HEADER));

  if (verification === 'misconfigured') {
    console.error('order_expiry_misconfigured');
    return noBody(500);
  }
  if (verification === 'unauthorized') {
    return noBody(401);
  }

  const result = await pedidos.expireStaleOrders();

  if (result.failed.length > 0) {
    console.error('order_expiry_failed', {
      failedCount: result.failed.length,
      failed: result.failed,
    });
    return Response.json({ expired: result.expired }, { status: 500 });
  }

  return Response.json({ expired: result.expired });
}
