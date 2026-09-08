import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND_LABEL, ORDERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  OrderListSection,
  OrderListSkeleton,
  parseOrderListParams,
  type OrderListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${ORDERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de pedidos (R1, R21, `design.md > 5`).
 *
 * **La ubicacion sale de `ORDERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta es
 * solo la forma en que el App Router materializa esa constante, y el test de contrato deriva de
 * ella la ruta esperada en vez de incrustar el literal (R2). Por eso la marca del titulo y la
 * etiqueta tambien llegan importadas (`BRAND_LABEL`, `ORDERS_LABEL`), nunca escritas a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1, R47):
 * `SidebarInset` del layout privado ya lo es, y QC-11 exige que sea unico. (Escrito sin el signo
 * de menor que a proposito: una guardia de fuente que busque la etiqueta no debe encontrarla ni
 * aqui.)
 *
 * **Los componentes se importan SOLO desde `./components`** (R40), nunca por ruta profunda. El
 * barrel no declara `'use client'`: la frontera la declara cada componente, asi que esta pagina
 * sigue siendo un Server Component aunque importe de el.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5`; alternativa
 * H, descartada): asi recargar, compartir el enlace o volver con «atras» conserva pagina, orden y
 * filtros, que es lo que R25 exige al cerrar el panel lateral. `searchParams` es una `Promise`,
 * como pide el App Router.
 *
 * **El `<Suspense>` YA NO lleva `key`** (2026-09-07): la llevaba para que el esqueleto de R21
 * reapareciera en cada cambio de pagina, orden, filtro o tamano, pero remontar el limite borraba
 * la barra de filtros -y el foco del campo que se estaba escribiendo-. Esa senal la da ahora
 * `OrderTable` mientras la navegacion esta en vuelo, sin desmontar nada.
 *
 * **Aqui no se decide ningun permiso** (R6): el corte de ruta lo hace el middleware con la regla
 * ruta->rol, y la autorizacion sobre los datos la aportan los casos de uso de `pedidos`.
 *
 * El disparador del alta (`<OrderSheet />`) ira junto al titulo cuando T10 lo monte: es un
 * componente de cliente con su propio estado de apertura, asi que esta pagina seguira siendo un
 * Server Component.
 */
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<OrderListSearchParams>;
}) {
  const params = parseOrderListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="pedidos-title" className="text-2xl font-semibold">
          {ORDERS_LABEL}
        </h1>
      </div>
      {/*
        SIN `key`: remontar este limite en cada cambio de consulta destruia la barra de filtros y
        con ella el foco del campo en el que se estaba escribiendo. La senal de R21 la da ahora
        `OrderTable` mientras la navegacion esta en vuelo, sin desmontar la barra; el `fallback` de
        aqui cubre la primera carga.
      */}
      <Suspense fallback={<OrderListSkeleton rows={params.pageSize} />}>
        <OrderListSection params={params} />
      </Suspense>
    </div>
  );
}
