import Link from 'next/link';
import type { Metadata } from 'next';

import { previewFormulaImportAction } from '@/lib/modules/documentos/adapters/driving/formula-import-actions';
import type { ErrorState } from '@/lib/modules/errores';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

import { ErrorAlert } from '@/components/shared/error-alert';
import { buttonVariants } from '@/components/ui/button';

import { FormulaImportReview } from './components';

export const metadata: Metadata = {
  title: `Revisar fórmula · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const FIRST_PAGE = 1;

/**
 * Estado de error de esta pantalla: un rechazo de las unidades, de los productos o de la vista
 * previa, siempre SIN ningun dato del documento. El mensaje es SIEMPRE el mismo, cualquiera de
 * los motivos que agrupa `invalid_input`: no se distingue archivo inexistente, de otra empresa,
 * fuera de estado o de otra tanda.
 */
function ImportErrorNotice({ error }: { readonly error: ErrorState }) {
  return (
    <ErrorAlert
      error={error}
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
      testId="formula-import-error"
      renderCatalogued={(catalogued) => (
        <>
          <p className="text-sm text-muted-foreground" data-testid="formula-import-error-message">
            No se pudo abrir esta revisión.
          </p>
          <p className="text-xs text-muted-foreground" data-testid="formula-import-error-code">
            {catalogued.code}
          </p>
        </>
      )}
      after={
        <Link
          href={FORMULAS_ROUTE}
          data-slot="button"
          className={cn(buttonVariants({ variant: 'outline', touch: true }))}
          data-testid="formula-import-error-back-link"
        >
          Volver al listado
        </Link>
      }
    />
  );
}

/**
 * Pantalla de revision de una importacion de formula desde un PDF, para un archivo concreto.
 *
 * **El corte por permiso vive AQUI, y son DOS**: `recetas.consultar` y `recetas.modificar`,
 * mismo patron que `/configuracion/unidades` y la revision de catalogo. Se aparta a
 * proposito del criterio de `formulas/nueva` -que solo pide `consultar`-: esta pantalla no tiene
 * uso de solo lectura, muestra el contenido de un documento y su unica accion es escribir.
 *
 * **Las tres lecturas van en paralelo y una sola vez cada una**: el catalogo de unidades, la
 * primera pagina de productos de tipo `PRODUCT` -para `ProductPicker`, igual que pide
 * `formulas/nueva/page.tsx`- y la vista previa de la importacion. Un rechazo de cualquiera deja
 * la pantalla sin ninguna fila.
 */
export default async function FormulaImportPage({
  params,
}: {
  readonly params: Promise<{ documentoId: string }>;
}) {
  await requirePagePermission('recetas.consultar');
  await requirePagePermission('recetas.modificar');

  const { documentoId } = await params;

  const [unitsResult, productsResult, previewResult] = await Promise.all([
    listUnitsAction(),
    listProductsAction({
      page: FIRST_PAGE,
      pageSize: MAX_PAGE_SIZE,
      filters: { type: { kind: 'select', values: [PRODUCT_TYPES.PRODUCT] } },
    }),
    previewFormulaImportAction({ documentFileId: documentoId }),
  ]);

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ImportErrorNotice error={unitsResult} />
      </div>
    );
  }

  if (productsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ImportErrorNotice error={productsResult} />
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
      <h1 className="text-2xl font-semibold" data-testid="formula-import-title">
        Revisar fórmula
      </h1>
      <FormulaImportReview
        documentFileId={documentoId}
        units={unitsResult.data}
        initialProductPage={{
          items: productsResult.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unitId: item.unitId,
          })),
          totalPages: productsResult.data.totalPages,
        }}
        preview={previewResult.data}
      />
    </div>
  );
}
