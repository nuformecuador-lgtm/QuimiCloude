import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  PresentationListSection,
  PresentationListSkeleton,
  buildPresentationListQuery,
  parsePresentationListParams,
  type PresentationListSearchParams,
} from './components';

/**
 * Nombre de la pantalla, en un solo sitio. **No sale todavia de `private-nav.ts`** porque la
 * seccion Configuracion y su `PRESENTATIONS_LABEL` son la **T2**, que esta feature no ejecuta
 * (decision humana del 2026-09-08: QC-75 esta reescribiendo la navegacion privada en paralelo).
 * Cuando esa etiqueta exista, esta constante se sustituye por su importe.
 */
const PAGE_TITLE = 'Presentaciones';

export const metadata: Metadata = {
  title: `${PAGE_TITLE} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de presentaciones (R1, R15, R16, R17, `design.md > 5.3`).
 *
 * **La ubicacion sale de `PRESENTATIONS_ROUTE`** (`lib/shared/routes.ts`): el nombre de las
 * carpetas es solo la forma en que el App Router materializa esa constante, y el test deriva de
 * ella la ruta esperada (`app/(private)${PRESENTATIONS_ROUTE}/page.tsx`) en vez de incrustar el
 * literal (R2).
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1): `SidebarInset`
 * del layout privado ya lo es, y QC-11 exige que sea unico. Tampoco se declara aqui barra lateral,
 * cabecera ni region de avisos: **las tres las monta el layout privado** y montarlas otra vez seria
 * duplicar lo heredado (R26, R33). (Escrito sin el signo de menor que a proposito: una guardia de
 * fuente que busque la etiqueta no debe encontrarla ni aqui.)
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5.2`;
 * alternativa I, descartada): asi recargar, compartir el enlace o volver con «atras» conserva
 * pagina, tamano, orden y busqueda, que es lo que R21 exige al cerrar el panel lateral.
 * `searchParams` es una `Promise`, como pide el App Router.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina,
 * tamano, orden o busqueda (R16). Sin ella, Next reutiliza el limite y el usuario se queda mirando
 * el resultado anterior sin ninguna senal de que algo esta en vuelo. La `key` es la propia cadena
 * de consulta canonica: dos consultas distintas no pueden compartirla y la misma consulta no la
 * cambia.
 *
 * **Aqui no se decide ningun permiso** (R7): el corte de ruta lo hace el middleware con la regla
 * ruta->rol, y la autorizacion sobre los datos la aportan los casos de uso de `inventario`.
 */
export default async function PresentacionesPage({
  searchParams,
}: {
  searchParams: Promise<PresentationListSearchParams>;
}) {
  const params = parsePresentationListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="presentaciones-title" className="text-2xl font-semibold">
          {PAGE_TITLE}
        </h1>
      </div>
      <Suspense
        key={buildPresentationListQuery(params)}
        fallback={<PresentationListSkeleton rows={params.pageSize} />}
      >
        <PresentationListSection params={params} />
      </Suspense>
    </div>
  );
}
