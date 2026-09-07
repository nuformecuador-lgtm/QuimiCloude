import type { Metadata } from 'next';
import { Suspense } from 'react';

import { getSupplierAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, SUPPLIERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  CatalogListError,
  CatalogListSection,
  CatalogTableSkeleton,
  SupplierDetailHeader,
  SupplierNotFound,
  buildCatalogListQuery,
  parseCatalogListParams,
  type CatalogListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `Detalle de proveedor · ${SUPPLIERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pagina de detalle de un proveedor (R1, R7, R19, R20, R24, `design.md > 6.1`).
 *
 * **La ubicacion sale de `supplierDetailRoute`** (`lib/shared/routes.ts`): el nombre de las
 * carpetas (`proveedores/[id]`) es solo la forma en que el App Router materializa esa constante, y
 * el test de contrato deriva de ella la ruta esperada en vez de incrustar el literal (R2, R3). Por
 * eso la marca y la etiqueta del titulo tambien llegan importadas, nunca escritas a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1): `SidebarInset`
 * del layout privado ya lo es y R5 de QC-11 exige que sea unico.
 *
 * **Server Component `async`** con `params` y `searchParams` como promesas, el patron ya mergeado
 * de la pagina de edicion de receta. Resuelve los dos, pide la ficha del proveedor y el catalogo
 * de unidades **en paralelo y una sola vez cada uno** -las unidades bajan por props hasta el panel
 * lateral de la linea (R46, `design.md > 8.2`), nunca las pide un componente de cliente- y
 * despacha:
 *
 * 1. `not_found` -> estado «proveedor inexistente» con vuelta a la lista y **sin catalogo** (R20):
 *    un proveedor que no existe no tiene lineas, asi que `listCatalogLinesAction` ni se llama.
 * 2. cualquier otro error, incluido `unauthorized` -> estado de error **sin ningun dato** (R7).
 *    Aqui no se decide ningun permiso: el corte de ruta lo hace el middleware con la regla
 *    ruta->rol y la autorizacion sobre los datos la aportan los casos de uso de `proveedores`.
 * 3. exito -> datos de contacto y, debajo, el catalogo paginado (R19).
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina o
 * de tamano, no solo en la primera carga (R24). Sin ella, Next reutiliza el limite y el usuario se
 * queda mirando la pagina anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **El estado del catalogo vive en la cadena de consulta**, con su parser propio de esta ruta
 * (`design.md > 6.1`): asi recargar, compartir el enlace o cerrar el panel lateral conserva la
 * pagina y el tamano (R26).
 */
export default async function ProveedorDetallePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<CatalogListSearchParams>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  // `params` es el nombre que Next da al parametro de RUTA (`[id]`), asi que los de lista se
  // llaman `listParams`: dos cosas distintas no pueden compartir nombre en el mismo alcance.
  const listParams = parseCatalogListParams(resolvedSearchParams);

  const [supplierResult, unitsResult] = await Promise.all([getSupplierAction(id), listUnitsAction()]);

  if (supplierResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {supplierResult.code === 'not_found' ? (
          <SupplierNotFound />
        ) : (
          <CatalogListError code={supplierResult.code} message={supplierResult.message} />
        )}
      </div>
    );
  }

  if (unitsResult.status === 'error') {
    // Sin el catalogo de unidades no se puede ofrecer el alta ni la edicion de una linea con
    // garantias, y si el error es `unauthorized` R7 exige no mostrar ningun dato. Mismo trato que
    // da la pagina de edicion de receta al mismo fallo.
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <CatalogListError code={unitsResult.code} message={unitsResult.message} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <SupplierDetailHeader supplier={supplierResult.data} />
      {/*
        La `key` lleva la cadena de consulta CANONICA y no solo pagina y tamano: desde el
        2026-09-07 la lista tambien ordena, filtra y busca, y el esqueleto tiene que reaparecer en
        cualquiera de esos cambios (R24).
      */}
      <Suspense
        key={buildCatalogListQuery(listParams)}
        fallback={<CatalogTableSkeleton rows={listParams.pageSize} />}
      >
        <CatalogListSection
          supplierId={supplierResult.data.id}
          params={listParams}
          units={unitsResult.data}
        />
      </Suspense>
    </div>
  );
}
