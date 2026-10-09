import type { DataTableParams } from '@/components/shared/data-table';
import { listPresentationsAction } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { FIRST_PAGE, presentationListHref } from './presentation-list-params';
import { PresentationTable } from './presentation-table';

/**
 * Seccion de lista: pide la pagina y despacha a uno de los tres estados (R7, R15, R16, R17,
 * `design.md > 5.3`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R16 aparece solo mientras esta consulta esta en vuelo —sin un estado de carga escrito a mano y
 * sin carreras entre peticiones—.
 *
 * **UNA sola lectura propia, `listPresentationsAction(params)`** (QC-80 R16, `design.md > 5`): el
 * catalogo ENTERO de unidades ya NO lo pide esta seccion —lo pide `page.tsx`, una sola vez por
 * pantalla— y llega aqui por props, listo para bajar al formulario sin que este consulte nada.
 *
 * **Si el catalogo de unidades falla, `page.tsx` no monta esta seccion**: decide eso antes, con
 * el error de la lista y sin pintar ni `<h1>` ni el disparador de la cabecera.
 *
 * **Una sola llamada a `listPresentationsAction`**, con los parametros **enteros y sin traducir**:
 * `DataTableParams` es campo a campo la misma forma que `ListQuery` (`design.md > 5.2`), y
 * `createListQuerySchema()` es un `z.strictObject`, asi que traducir aqui solo podria introducir
 * una clave de mas. Toda lectura pasa por la Server Action del modulo, importada **por su ruta
 * exacta**; ningun `fetch` a rutas propias (R30).
 *
 * **R7**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite ninguna
 * comprobacion y no se ocultan columnas por rol: la autorizacion la aportan los casos de uso de
 * `inventario`, y si la operacion responde `unauthorized` se pinta el estado de error **sin un
 * solo dato**.
 *
 * Error y vacio los pinta la tabla en lugar de si misma; el envoltorio de la lista solo existe
 * con filas. Con busqueda y sin filas tambien se pinta el vacio, no el «sin resultados» de la
 * tabla.
 */

export const PRESENTATION_LIST_TESTID = 'presentation-list';

export type PresentationListSectionProps = {
  /** Los parametros ya acotados por `parsePresentationListParams` (R14). */
  readonly params: DataTableParams;
  /** Catalogo entero de unidades, pedido UNA sola vez por `page.tsx` (QC-80 R16, R19). */
  readonly units: readonly UnitRef[];
};

export async function PresentationListSection({ params, units }: PresentationListSectionProps) {
  const result = await listPresentationsAction(params);

  if (result.status === 'error') {
    return (
      <PresentationTable
        status="error"
        error={result}
        presentations={[]}
        params={params}
        totalPages={0}
        units={units}
      />
    );
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <PresentationTable
        presentations={items}
        params={params}
        totalPages={totalPages}
        units={units}
        empty={{
          firstPageHref:
            currentPage > FIRST_PAGE
              ? presentationListHref({ ...params, page: FIRST_PAGE })
              : undefined,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={PRESENTATION_LIST_TESTID}>
      <PresentationTable
        presentations={items}
        params={params}
        totalPages={totalPages}
        units={units}
      />
    </div>
  );
}
