import { Suspense } from 'react';

import { ExecutionTraceListSection } from './execution-trace-list-section';
import type { ExecutionTraceListParams } from './execution-trace-list-params';

/**
 * Area de contenido del dashboard. No consulta datos por su cuenta: la lectura vive en la
 * seccion, y el `<Suspense>` deja que el titulo de la pantalla se pinte sin esperarla.
 *
 * Contenedor plano a proposito: **no** es `role="region"` ni ningun otro landmark, para no romper
 * el `main` unico del layout privado. El alto lo aporta `flex-1`, nunca un alto de viewport fijo.
 */
export function DashboardContent({ params }: { readonly params: ExecutionTraceListParams }) {
  return (
    <div data-testid="dashboard-content" className="flex flex-1 flex-col gap-4">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Cargando pedidos ejecutados…
          </p>
        }
      >
        <ExecutionTraceListSection params={params} />
      </Suspense>
    </div>
  );
}
