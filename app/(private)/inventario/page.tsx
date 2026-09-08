import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
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
 * **El `<Suspense>` YA NO lleva `key`** (2026-09-07): remontar el limite en cada cambio de
 * consulta era lo que borraba el foco del campo de busqueda y de los filtros de texto. La senal
 * de «en vuelo» de R15 la da ahora `ProductTable` sin desmontar nada -rotulo y tabla atenuada
 * mientras la navegacion esta en curso-, y este `fallback` cubre la primera carga.
 *
 * **Aqui no se decide ningun permiso** (R5): el corte de ruta lo hace el middleware con la regla
 * ruta->rol, y la autorizacion sobre los datos la aportan los casos de uso de `inventario`.
 */
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<ProductListSearchParams>;
}) {
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
        SIN `key`: este limite NO se vuelve a montar en cada cambio de consulta. La llevaba (la
        cadena canonica) para que el esqueleto reapareciera en cada cambio, pero remontar el
        subarbol DESTRUYE la barra de filtros y con ella el foco: escribir en la busqueda perdia
        el cursor en cuanto salia la peticion. La senal de R15 sigue apareciendo en cada
        cambio, ahora desde dentro: `ProductTable` navega en una transicion y, mientras esta en
        vuelo, anuncia y atenua la tabla SIN desmontarla. El `fallback` de aqui sigue cubriendo la
        primera carga.
      */}
      <Suspense fallback={<ProductTableSkeleton rows={params.pageSize} />}>
        <ProductListSection params={params} />
      </Suspense>
    </div>
  );
}
