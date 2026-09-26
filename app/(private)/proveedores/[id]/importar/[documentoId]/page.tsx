import type { Metadata } from 'next';

import { previewCatalogImportAction } from '@/lib/modules/documentos/adapters/driving/catalog-import-actions';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { getSupplierAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, SUPPLIERS_LABEL } from '@/lib/shared/navigation/private-nav';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';

import { CatalogImportReview } from './components';

export const metadata: Metadata = {
  title: `Importar catálogo · ${SUPPLIERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Estado de error de esta pantalla: un rechazo del proveedor, de las unidades o de la vista
 * previa, siempre SIN ninguna fila ni dato del documento.
 *
 * No se importa el estado de error de la OTRA ruta (`proveedores/[id]/components`): esta pantalla
 * tiene su propio archivo de ruta y su propio contrato, y traer un componente interno de otra
 * ruta las ataria por las tripas.
 */
function ImportErrorNotice({ error }: { readonly error: ErrorState }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"
      data-testid="catalog-import-error"
    >
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="catalog-import-error-message">
            {error.message}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="catalog-import-error-code">
            {error.code}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Pantalla de revision de una importacion de catalogo desde un PDF, para un archivo y un
 * proveedor concretos.
 *
 * **El corte por permiso vive AQUI, y son DOS** (precedente de `/configuracion/unidades`):
 * `proveedores.consultar` y `proveedores.modificar`, en las primeras lineas y antes de resolver
 * `params` o de pedir ningun dato. Sin sesion redirige al login; con sesion pero sin cualquiera de
 * los dos responde 404.
 *
 * **Las tres lecturas se piden en paralelo y una sola vez cada una**: la ficha del proveedor, el
 * catalogo de unidades (para preseleccionar la unidad de una presentacion nueva) y la vista previa
 * de la importacion. Un rechazo de cualquiera de las tres deja la pantalla sin ninguna fila: leer
 * el documento no puede filtrar si el archivo, el proveedor o el permiso son el problema.
 */
export default async function CatalogImportPage({
  params,
}: {
  readonly params: Promise<{ id: string; documentoId: string }>;
}) {
  await requirePagePermission('proveedores.consultar');
  await requirePagePermission('proveedores.modificar');

  const { id, documentoId } = await params;

  const [supplierResult, unitsResult, previewResult] = await Promise.all([
    getSupplierAction(id),
    listUnitsAction(),
    previewCatalogImportAction({ supplierId: id, documentFileId: documentoId }),
  ]);

  if (supplierResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ImportErrorNotice error={supplierResult} />
      </div>
    );
  }

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ImportErrorNotice error={unitsResult} />
      </div>
    );
  }

  if (previewResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ImportErrorNotice error={previewResult} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold" data-testid="catalog-import-title">
        Revisar importación de catálogo
      </h1>
      <CatalogImportReview
        supplierId={id}
        documentFileId={documentoId}
        units={unitsResult.data}
        preview={previewResult.data}
      />
    </div>
  );
}
