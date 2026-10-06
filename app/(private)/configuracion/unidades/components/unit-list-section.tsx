import type { DataTableParams } from '@/components/shared/data-table';
import type { UnitRef, UnitView } from '@/lib/modules/unidades';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import type { UnitBaseIndex } from './unit-columns';
import { UnitListEmpty } from './unit-list-empty';
import { UnitListError } from './unit-list-error';
import { FIRST_PAGE, unitListHref } from './unit-list-params';
import { UnitTable } from './unit-table';

/**
 * Seccion de lista: pide la pagina y despacha a uno de los tres estados (R14, R24, R25, R26;
 * `design.md > 5.3` y `> 5.4`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R25 aparece solo mientras esta consulta esta en vuelo.
 *
 * **UNA sola lectura propia, `listUnitsAction(params)`** (`design.md > 5.3`): trae **la pagina que
 * se pinta**, con los parametros enteros y sin traducir -`DataTableParams` es campo a campo la
 * misma forma que `ListQuery`, y `createListQuerySchema()` es un `z.strictObject`, asi que
 * traducir aqui solo podria introducir una clave de mas-.
 *
 * **El catalogo ENTERO ya NO lo pide esta seccion** (decision humana del 2026-10-02): lo pide
 * `page.tsx`, una sola vez por pantalla, porque el disparador del alta vive ahora en su cabecera
 * -alineado con el titulo, igual que `inventario/page.tsx`- y necesita el mismo catalogo. Llega
 * aqui por props (`catalog`), y de el se derivan el indice `id -> unidad` con el que la columna de
 * equivalencia resuelve la unidad de la que deriva cada fila —**que puede no estar en la
 * pagina**— y la lista de unidades BASE del selector de «deriva de», que necesita **todas** las
 * del ambito y no las diez visibles (R36).
 *
 * **SI el catalogo llego vacio —porque la segunda lectura de `page.tsx` fallo—, la pantalla NO cae
 * al estado de error**: pinta la lista con el indice vacio —cada equivalencia derivada muestra el
 * marcador neutro (R17)— y el selector sin opciones. Solo la PRIMERA lectura, la de esta seccion,
 * decide el estado de la pantalla (R26): una lista visible vale mas que un error total por no
 * poder pintar una columna.
 *
 * **R14**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite ninguna
 * comprobacion y no se ocultan columnas por rol: la autorizacion la aportan los casos de uso de
 * `unidades`, y si la operacion responde `unauthorized` se pinta el estado de error **sin un solo
 * dato**. Toda lectura pasa por la Server Action del modulo, importada por su ruta exacta; ningun
 * `fetch` a rutas propias (R44).
 */

export const UNIT_LIST_TESTID = 'unit-list';

export type UnitListSectionProps = {
  /** Los parametros ya acotados por `parseUnitListParams` (R23). */
  readonly params: DataTableParams;
  /** Catalogo entero de unidades, pedido UNA sola vez por `page.tsx` (R36, R46). */
  readonly catalog: readonly UnitView[];
};

/** El indice `id -> { name, symbol }` con el que se arma la frase de equivalencia (R17). */
function buildBaseIndex(units: readonly UnitView[]): UnitBaseIndex {
  const index: Record<string, Pick<UnitRef, 'name' | 'symbol'>> = {};
  for (const unit of units) index[unit.id] = { name: unit.name, symbol: unit.symbol };
  return index;
}

export async function UnitListSection({ params, catalog }: UnitListSectionProps) {
  const pageResult = await listUnitsAction(params);

  if (pageResult.status === 'error') {
    return <UnitListError error={pageResult} />;
  }

  const baseIndex = buildBaseIndex(catalog);
  const baseUnits = catalog.filter((unit) => unit.baseUnitId === null);

  const { items, page: currentPage, totalPages } = pageResult.data;

  if (items.length === 0) {
    // R24: el vacio es el de «la busqueda no encontro nada» y **no** ofrece «crear la primera».
    return (
      <UnitListEmpty
        clearSearchHref={
          params.search.trim() === ''
            ? undefined
            : unitListHref({ ...params, search: '', page: FIRST_PAGE })
        }
        firstPageHref={
          currentPage > FIRST_PAGE ? unitListHref({ ...params, page: FIRST_PAGE }) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={UNIT_LIST_TESTID}>
      {/*
        `unit-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda que
        devuelve elementos—, asi que desde aqui solo bajan datos serializables: las filas, el
        indice, las unidades base, los parametros vigentes y el total de paginas. La tabla recibe
        `status: 'idle'` siempre: los tres estados se pintan FUERA de `<DataTable>`.
      */}
      <UnitTable
        units={items}
        baseIndex={baseIndex}
        baseUnits={baseUnits}
        params={params}
        totalPages={totalPages}
      />
    </div>
  );
}
