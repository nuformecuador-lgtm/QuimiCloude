import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { identity } from '@/lib/composition';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { canAdjustBatchStock, type ProductFormUnits } from '@/lib/modules/inventario';
import { listProductFormUnitsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import { INVENTORY_IMPORT_ROUTE } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

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
 * **Los componentes se importan SOLO desde `./components`**, nunca por ruta profunda. El barrel
 * no lleva la directiva de cliente: la frontera la declara cada componente, asi que esta pagina
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

  /*
    El catalogo de unidades se pide AQUI y UNA SOLA VEZ (QC-44 R46, QC-80 R11), no dentro de cada
    panel: lo necesita el alta rapida de presentacion que `PresentationSelect` lleva dentro, y hay
    dos paneles de alta en esta pantalla -el de la cabecera y el del estado vacio-. Pedirlo en
    cada uno serian dos consultas para el mismo dato.

    Si la lectura falla, `units` queda sin definir y el alta RAPIDA de presentacion no se ofrece
    -mismo criterio que R19-, pero la pantalla sigue en pie: el producto se puede dar de alta
    eligiendo una presentacion ya existente. Por eso este fallo no pinta un estado de error de
    pagina, a diferencia de la de presentaciones, donde la unidad es el objeto mismo del panel.
  */
  // El alta pide sus unidades con el permiso de inventario: quien da de alta no tiene por que
  // poder consultar el catalogo de unidades. Si falla, el selector sale vacio y el envio lo
  // rechaza el esquema.
  const [params, unitsResult, formUnitsResult, sessionUser] = await Promise.all([
    searchParams.then(parseProductListParams),
    listUnitsAction(),
    listProductFormUnitsAction(),
    identity.getSessionUser(),
  ]);
  const canImport = canAdjustBatchStock(sessionUser);
  const units = unitsResult.status === 'success' ? unitsResult.data : undefined;
  const formUnits: ProductFormUnits =
    formUnitsResult.status === 'success' ? formUnitsResult.data : [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="inventario-title" className="text-2xl font-semibold">
          Inventario
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {canImport ? (
            <Link
              href={INVENTORY_IMPORT_ROUTE}
              data-slot="button"
              data-testid="inventory-import-link"
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
            >
              Importar
            </Link>
          ) : null}
          <ProductSheet units={units} formUnits={formUnits} />
        </div>
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
        <ProductListSection params={params} units={units} formUnits={formUnits} />
      </Suspense>
    </div>
  );
}
