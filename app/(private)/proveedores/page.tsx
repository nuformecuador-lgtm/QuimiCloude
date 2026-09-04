import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND_LABEL, SUPPLIERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  parseSupplierListParams,
  SupplierListSection,
  SupplierTableSkeleton,
  type SupplierListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${SUPPLIERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de proveedores (R1, R14, `design.md > 5`).
 *
 * **La ubicacion sale de `SUPPLIERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta es
 * solo la forma en que el App Router materializa esa constante, y el test de contrato deriva de
 * ella la ruta esperada en vez de incrustar el literal (R2). Por eso la marca del titulo y la
 * etiqueta tambien llegan importadas (`BRAND_LABEL`, `SUPPLIERS_LABEL`), nunca escritas a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1): `SidebarInset`
 * del layout privado ya lo es, y QC-11 exige que sea unico. (Escrito sin el signo de menor que a
 * proposito: una guardia de fuente que busque la etiqueta no debe encontrarla ni aqui.)
 *
 * **Los componentes se importan SOLO desde `./components`** (R42), nunca por ruta profunda. El
 * barrel no declara `'use client'`: la frontera la declara cada componente, asi que esta pagina
 * sigue siendo un Server Component aunque importe de el.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5.1`): asi
 * recargar, compartir el enlace o volver con «atras» conserva la pagina, que es lo que R26 exige
 * al cerrar el panel lateral.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina o
 * de tamano, no solo en la primera carga (R17). Sin ella, Next reutiliza el limite y el usuario
 * se queda mirando la pagina anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **Aqui no se decide ningun permiso** (R7): el corte de ruta lo hace el middleware con la regla
 * ruta->rol, y la autorizacion sobre los datos la aportan los casos de uso de `proveedores`.
 *
 * **El disparador del alta (`<SupplierSheet />`) lo anade T8** junto al titulo: es la task que
 * construye el panel lateral, y adelantarlo aqui seria un boton sin nada detras.
 */
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<SupplierListSearchParams>;
}) {
  const { page, pageSize } = parseSupplierListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="proveedores-title" className="text-2xl font-semibold">
          {SUPPLIERS_LABEL}
        </h1>
      </div>
      <Suspense key={`${page}-${pageSize}`} fallback={<SupplierTableSkeleton rows={pageSize} />}>
        <SupplierListSection page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}
