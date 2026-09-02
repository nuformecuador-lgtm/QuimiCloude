import type { Metadata } from 'next';

import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import { DashboardContent } from './components';

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
 * **Esta pantalla no esta protegida, y eso es conocido y aceptado** (R8): no valida sesion ni
 * el acceso a la ruta, asi que hoy es alcanzable sin autenticacion. La guardia de sesion es el
 * alcance de QC-13. No es un hallazgo del reviewer ni un agujero introducido aqui.
 *
 * **Esta feature no toca el item «Dashboard» de la barra lateral** (decision humana del
 * 2026-09-02): lo reconecta QC-13. El item ya apunta a la misma constante que ubica esta
 * pantalla, asi que deja de dar 404 sin que aqui se edite nada de la navegacion (R11).
 *
 * Server Component sin datos (R6, R7): ni consultas, ni red, ni props de sesion. El contenedor
 * exterior es un `<div>` y **no** un `<main>` (R4): `SidebarInset` del layout privado ya es el
 * `<main>` y R5 de QC-11 exige que sea unico.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="dashboard-title" className="text-2xl font-semibold">
        Dashboard
      </h1>
      <DashboardContent />
    </div>
  );
}
