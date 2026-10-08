import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  DashboardContent,
  parseExecutionTraceListParams,
  type ExecutionTraceListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `Dashboard · ${BRAND_LABEL}`,
};

/**
 * Pantalla de dashboard: primera URL de la zona privada (R1, `design.md > 4`).
 *
 * **La ubicacion sale de la constante `DASHBOARD_ROUTE`** (`lib/shared/routes.ts`): el nombre
 * de la carpeta de esta ruta es solo la forma en que el App Router materializa esa constante,
 * y el test de contrato deriva de ella la ruta esperada en vez de incrustar literales (R10).
 * Por eso la marca del titulo tambien llega importada (`BRAND_LABEL`), nunca escrita a mano
 * (R5).
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea del componente exige
 * `dashboard.consultar` con `requirePagePermission`, que redirige al login si no hay sesion y
 * responde 404 -sin nombrar el modulo ni mencionar permisos- si la sesion no lleva ese codigo.
 * Va antes de renderizar nada, no despues. Lo que decia esta nota hasta QC-75 -«esta pantalla no
 * esta protegida»- dejo de ser cierto: la sesion la exige el middleware desde QC-13 y el permiso
 * lo exige esta llamada. El middleware ya NO corta por rol (QC-75 R16): en el borde solo quedan
 * firma, caducidad y empresa.
 *
 * **Esta feature no toca el item «Dashboard» de la barra lateral** (decision humana del
 * 2026-09-02): lo reconecta QC-13. El item ya apunta a la misma constante que ubica esta
 * pantalla, asi que deja de dar 404 sin que aqui se edite nada de la navegacion (R11).
 *
 * Server Component sin consultas propias ni props de sesion: solo acota la consulta de la URL y se
 * la pasa al area de contenido, que es quien lee. El contenedor exterior es un `<div>` y **no** un
 * `<main>`: `SidebarInset` del layout privado ya es el `<main>` y tiene que ser unico.
 *
 * Es `async` desde QC-75 porque `requirePagePermission` lo es. Sigue siendo un Server Component
 * sin datos propios.
 */
export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<ExecutionTraceListSearchParams>;
}) {
  await requirePagePermission('dashboard.consultar');

  const params = parseExecutionTraceListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="dashboard-title" className="text-2xl font-semibold">
        Dashboard
      </h1>
      <DashboardContent params={params} />
    </div>
  );
}
