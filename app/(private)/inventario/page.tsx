import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  buildProductListQuery,
  parseProductListParams,
  ProductListSection,
  ProductSheet,
  ProductTableSkeleton,
  type ProductListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `Inventario · ${BRAND_LABEL}`,
};

/**
 * Pantalla del catalogo de productos (R1, `design.md > 4.3`).
 *
 * **La ubicacion sale de `INVENTORY_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta es
 * solo la forma en que el App Router materializa esa constante, y el test de contrato deriva de
 * ella la ruta esperada en vez de incrustar el literal (R2). Por eso la marca del titulo tambien
 * llega importada (`BRAND_LABEL`), nunca escrita a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark `main`** (R1): `SidebarInset`
 * del layout privado ya lo es, y R5 de QC-11 exige que sea unico. (Escrito sin el signo de menor
 * que a proposito: una guardia de fuente que busque la etiqueta no debe encontrarla ni aqui.)
 *
 * **Los componentes se importan SOLO desde `./components`** (R27), nunca por ruta profunda. El
 * barrel no declara `'use client'`: la frontera la declara cada componente, asi que esta pagina
 * sigue siendo un Server Component aunque importe de el.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 4.2`): asi
 * recargar, compartir el enlace o volver con «atras» conserva la pagina, que es lo que R17 exige
 * al cerrar el panel lateral.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina o
 * de tamano, no solo en la primera carga (R15). Sin ella, Next reutiliza el limite y el usuario
 * se queda mirando la pagina anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea exige
 * `inventario.consultar` con `requirePagePermission` -antes de resolver `searchParams` y antes de
 * pintar nada-, que redirige al login sin sesion y responde 404 sin nombrar el modulo ni
 * mencionar permisos. El middleware ya NO corta por rol (QC-75 R16): en el borde solo quedan
 * firma, caducidad y empresa. La autorizacion sobre los DATOS la siguen aportando los casos de
 * uso de `inventario`: la ruta decide si se ensena la pantalla, el service si se puede hacer.
 */
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<ProductListSearchParams>;
}) {
  await requirePagePermission('inventario.consultar');

  const params = parseProductListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="inventario-title" className="text-2xl font-semibold">
          Inventario
        </h1>
        <ProductSheet />
      </div>
      {/*
        La `key` lleva la cadena de consulta CANONICA y no solo pagina y tamano: desde el
        2026-09-07 la lista tambien ordena, filtra y busca, y el esqueleto tiene que reaparecer en
        cualquiera de esos cambios (R15).
      */}
      <Suspense
        key={buildProductListQuery(params)}
        fallback={<ProductTableSkeleton rows={params.pageSize} />}
      >
        <ProductListSection params={params} />
      </Suspense>
    </div>
  );
}
