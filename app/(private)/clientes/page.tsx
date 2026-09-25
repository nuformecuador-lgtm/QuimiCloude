import type { Metadata } from 'next';
import { Suspense } from 'react';

import { identity } from '@/lib/composition';
import { assertPermission } from '@/lib/modules/identity';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, CUSTOMERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  CUSTOMERS_TITLE_TESTID,
  CustomerListSection,
  CustomerListSkeleton,
  parseCustomerListParams,
  type CustomerListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${CUSTOMERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Marca del `onDenied` de `assertPermission` cuando lo que se quiere es una RESPUESTA, no un
 * corte. Copia de `configuracion/usuarios/page.tsx`.
 */
const PERMISO_DENEGADO = new Error('permiso denegado');

/**
 * `true` si la sesion trae `clientes.modificar`.
 *
 * **No es autorizacion, es PRESENTACION**: decide que se emite en el HTML, no que se puede
 * hacer. Quien autoriza de verdad son los casos de uso de `clientes`. La pertenencia la
 * resuelve `assertPermission`, y nada mas: un `permissions.includes(...)` aqui seria una
 * segunda definicion de pertenencia, libre de divergir.
 */
async function canModifyCustomers(): Promise<boolean> {
  const user = await identity.getSessionUser();

  try {
    assertPermission(user, 'clientes.modificar', () => PERMISO_DENEGADO);
    return true;
  } catch (error) {
    if (error !== PERMISO_DENEGADO) throw error;
    return false;
  }
}

/**
 * Pantalla de la lista de clientes.
 *
 * **La ubicacion sale de `CUSTOMERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta
 * es solo la forma en que el App Router materializa esa constante. La marca y la etiqueta llegan
 * importadas (`BRAND_LABEL`, `CUSTOMERS_LABEL`), nunca escritas a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal**: `SidebarInset` del
 * layout privado ya lo es.
 *
 * **El corte por permiso vive AQUI y es UNO SOLO**: `clientes.consultar`, en la primera linea del
 * cuerpo, antes de resolver `searchParams` y antes de leer o pintar nada. Sin sesion,
 * `requirePagePermission` redirige al login; con sesion pero sin el permiso responde 404. Es uno
 * y no dos, porque `modificar` no implica `consultar`.
 *
 * **`clientes.modificar` no corta: oculta**. Baja a los componentes de cliente como un
 * `boolean` por props; ellos no leen la sesion, no importan el punto de composicion y no piden
 * nada por su cuenta.
 *
 * **El estado de lista vive en la cadena de consulta, no en React**: asi recargar, compartir el
 * enlace, abrir y cerrar el panel lateral o volver con «Atras» conserva pagina, tamano, orden,
 * filtros y busqueda. `searchParams` es una `Promise`, y se resuelve DESPUES del corte.
 *
 * **El `<Suspense>` NO lleva `key`**: remontar el limite en cada cambio de consulta borraria la
 * caja de busqueda y con ella el foco del campo que se esta escribiendo. La senal de «en vuelo»
 * la da `CustomerTable` mientras la navegacion esta en curso, sin desmontar nada; el `fallback`
 * de aqui cubre solo la primera carga.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<CustomerListSearchParams>;
}) {
  await requirePagePermission('clientes.consultar');

  const resolved = await searchParams;
  const canModify = await canModifyCustomers();
  const params = parseCustomerListParams(resolved);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid={CUSTOMERS_TITLE_TESTID} className="text-2xl font-semibold">
          {CUSTOMERS_LABEL}
        </h1>
      </div>
      <Suspense fallback={<CustomerListSkeleton rows={params.pageSize} />}>
        <CustomerListSection params={params} canModify={canModify} />
      </Suspense>
    </div>
  );
}
