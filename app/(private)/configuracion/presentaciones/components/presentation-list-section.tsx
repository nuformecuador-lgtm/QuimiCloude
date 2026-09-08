import type { DataTableParams } from '@/components/shared/data-table';
import { listPresentationsAction } from '@/lib/modules/inventario/adapters/driving/presentation-actions';

import { PresentationListEmpty } from './presentation-list-empty';
import { PresentationListError } from './presentation-list-error';
import { FIRST_PAGE, presentationListHref } from './presentation-list-params';
import { PresentationSheet } from './presentation-sheet';
import { PresentationTable } from './presentation-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R7, R15, R16, R17,
 * `design.md > 5.3`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R16 aparece solo mientras esta consulta esta en vuelo —sin un estado de carga escrito a mano y
 * sin carreras entre peticiones—.
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
 * **Una lista vacia NO se pinta como tabla sin filas** (R15, R17): son tres situaciones distintas
 * —fallo, catalogo realmente vacio y pagina que se quedo atras tras una baja— y cada una dice lo
 * suyo. El destino de «volver a la primera» se deriva de `PRESENTATIONS_ROUTE` a traves de
 * `presentationListHref`, nunca de un literal (R2).
 */

export const PRESENTATION_LIST_TESTID = 'presentation-list';

export type PresentationListSectionProps = {
  /** Los parametros ya acotados por `parsePresentationListParams` (R14). */
  readonly params: DataTableParams;
};

export async function PresentationListSection({ params }: PresentationListSectionProps) {
  const result = await listPresentationsAction(params);

  if (result.status === 'error') {
    return <PresentationListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    // El slot de «crear la primera» (R15) lo llena `<PresentationSheet />` como `children`: es la
    // unica accion util cuando no hay ni una presentacion, y bajando el disparador desde aqui el
    // estado vacio no tiene que conocer el panel lateral ni convertirse en modulo de cliente.
    return (
      <PresentationListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? presentationListHref({ ...params, page: FIRST_PAGE })
            : undefined
        }
      >
        <PresentationSheet />
      </PresentationListEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={PRESENTATION_LIST_TESTID}>
      {/* El disparador del alta (R21). Vive junto a la lista, no en la pagina. */}
      <div className="flex justify-end">
        <PresentationSheet />
      </div>
      {/*
        `presentation-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda
        que devuelve elementos (`design.md > 6`)—, asi que desde aqui solo bajan datos
        serializables: las filas, los parametros vigentes y el total de paginas. La tabla recibe
        `status: 'idle'` siempre: los tres estados se pintan FUERA de `<DataTable>`.
      */}
      <PresentationTable presentations={items} params={params} totalPages={totalPages} />
    </div>
  );
}
