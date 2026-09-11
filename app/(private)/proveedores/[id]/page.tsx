import type { Metadata } from 'next';
import { Suspense } from 'react';

import type { ErrorCode } from '@/lib/modules/errores';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { getSupplierAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, SUPPLIERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  CatalogListError,
  CatalogListSection,
  CatalogTableSkeleton,
  SupplierDetailHeader,
  SupplierNotFound,
  parseCatalogListParams,
  type CatalogListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `Detalle de proveedor · ${SUPPLIERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * El unico codigo que esta pagina distingue del resto (R20). `satisfies` y no una anotacion:
 * conserva el tipo literal para la comparacion y a la vez obliga a que el codigo siga estando
 * en el catalogo cerrado de `lib/modules/errores`, asi que escribirlo mal no compila (R2).
 */
const SUPPLIER_NOT_FOUND_CODE = 'supplier_not_found' satisfies ErrorCode;

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
 * 1. `supplier_not_found` -> estado «proveedor inexistente» con vuelta a la lista y **sin
 *    catalogo** (R20): un proveedor que no existe no tiene lineas, asi que
 *    `listCatalogLinesAction` ni se llama. QC-70 (R20) abrio el antiguo `not_found` generico por
 *    caso concreto: aqui el unico que puede llegar es el del PROVEEDOR.
 * 2. cualquier otro error, incluido `unauthorized` -> estado de error **sin ningun dato** (R7).
 *    Ese `unauthorized` lo sigue aportando el caso de uso de `proveedores` sobre los DATOS.
 * 3. exito -> datos de contacto y, debajo, el catalogo paginado (R19).
 *
 * **El `<Suspense>` YA NO lleva `key`** (2026-09-07): remontarlo en cada cambio de consulta
 * borraba la barra de filtros y el foco del campo en el que se estaba escribiendo. La senal de
 * R24 la da ahora `CatalogTable` mientras la navegacion esta en vuelo, sin desmontar la barra.
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea exige
 * `proveedores.consultar` con `requirePagePermission`, **antes** de resolver `params` y de pedir
 * ninguna de las dos lecturas; redirige al login sin sesion y responde 404 sin nombrar el modulo
 * ni mencionar permisos. El middleware ya NO corta por rol (QC-75 R16): en el borde solo quedan
 * firma, caducidad y empresa. La ruta decide si se ensena la pantalla; los casos de uso deciden
 * que datos se pueden leer.
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
  await requirePagePermission('proveedores.consultar');

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  // `params` es el nombre que Next da al parametro de RUTA (`[id]`), asi que los de lista se
  // llaman `listParams`: dos cosas distintas no pueden compartir nombre en el mismo alcance.
  const listParams = parseCatalogListParams(resolvedSearchParams);

  const [supplierResult, unitsResult] = await Promise.all([getSupplierAction(id), listUnitsAction()]);

  if (supplierResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {supplierResult.code === SUPPLIER_NOT_FOUND_CODE ? (
          <SupplierNotFound />
        ) : (
          <CatalogListError error={supplierResult} />
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
        <CatalogListError error={unitsResult} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <SupplierDetailHeader supplier={supplierResult.data} />
      {/*
        SIN `key`: este limite no se remonta en cada cambio de consulta -eso destruia la barra de
        filtros y con ella el foco-. La senal de R24 llega desde dentro de `CatalogTable` mientras
        la navegacion esta en vuelo; el `fallback` cubre la primera carga.
      */}
      <Suspense fallback={<CatalogTableSkeleton rows={listParams.pageSize} />}>
        <CatalogListSection
          supplierId={supplierResult.data.id}
          params={listParams}
          units={unitsResult.data}
        />
      </Suspense>
    </div>
  );
}
