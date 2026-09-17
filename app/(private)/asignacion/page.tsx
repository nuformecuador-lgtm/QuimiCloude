import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { ASSIGNED_ORDERS_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  parseAssignedOrdersListParams,
  type AssignedOrdersSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${ASSIGNED_ORDERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de trabajo del Operador (R4, R26-R32, `design.md > 8`).
 *
 * **La ubicacion sale de `ASSIGNED_ORDERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la
 * carpeta es solo la forma en que el App Router materializa esa constante, y el test de contrato
 * deriva de ella la ruta esperada en vez de incrustar el literal (R1, R33).
 *
 * **El corte por permiso vive AQUI, PRIMERA linea** (R4, R5): `asignaciones.consultar` con
 * `requirePagePermission`, antes de resolver `searchParams` y antes de pintar nada. Redirige al
 * login sin sesion y responde 404 sin nombrar el modulo ni mencionar permisos.
 *
 * **Los componentes se importan SOLO desde `./components`** (R33), nunca por ruta profunda. El
 * barrel no declara `'use client'`.
 *
 * **El estado de lista vive en la cadena de consulta** (R31): solo `page` y `pageSize`, sin orden,
 * sin filtro y sin busqueda (`design.md > 9.1`).
 *
 * **El `<Suspense>` NO lleva `key`** (mismo criterio que `pedidos/page.tsx`): remontar el limite
 * borraria el foco. La senal de «en vuelo» la da `AssignedOrdersTable` mientras la navegacion
 * esta en curso.
 */
export default async function AsignacionPage({
  searchParams,
}: {
  searchParams: Promise<AssignedOrdersSearchParams>;
}) {
  await requirePagePermission('asignaciones.consultar');

  const params = parseAssignedOrdersListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="asignacion-title" className="text-2xl font-semibold">
          {ASSIGNED_ORDERS_LABEL}
        </h1>
      </div>
      <Suspense fallback={<AssignedOrdersSkeleton rows={params.pageSize} />}>
        <AssignedOrdersListSection params={params} />
      </Suspense>
    </div>
  );
}
