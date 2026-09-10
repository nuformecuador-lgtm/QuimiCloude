import type { DataTableParams } from '@/components/shared/data-table';
import type { UnitRef, UnitView } from '@/lib/modules/unidades';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import type { UnitBaseIndex } from './unit-columns';
import { UnitListEmpty } from './unit-list-empty';
import { UnitListError } from './unit-list-error';
import { FIRST_PAGE, unitListHref } from './unit-list-params';
import { UnitSheet } from './unit-sheet';
import { UnitTable } from './unit-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R14, R24, R25, R26;
 * `design.md > 5.3` y `> 5.4`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R25 aparece solo mientras estas consultas estan en vuelo.
 *
 * **DOS lecturas, y la segunda no es un lujo** (`design.md > 5.3`):
 *
 * 1. `listUnitsAction(params)` trae **la pagina que se pinta**, con los parametros enteros y sin
 *    traducir: `DataTableParams` es campo a campo la misma forma que `ListQuery`, y
 *    `createListQuerySchema()` es un `z.strictObject`, asi que traducir aqui solo podria introducir
 *    una clave de mas.
 * 2. `listUnitsAction()` trae el **catalogo acotado**, del que salen dos cosas: el indice
 *    `id -> unidad` con el que la columna de equivalencia resuelve la unidad de la que deriva cada
 *    fila —**que puede no estar en la pagina**— y la lista de unidades BASE del selector de «deriva
 *    de», que necesita **todas** las del ambito y no las diez visibles (R36).
 *
 * Las dos pasan por el mismo caso de uso, con el mismo permiso y el mismo ambito, asi que no abren
 * ningun camino de datos nuevo. Van en `Promise.all` porque son independientes.
 *
 * **SI la segunda falla, la pantalla NO cae al estado de error**: pinta la lista con el indice
 * vacio —cada equivalencia derivada muestra el marcador neutro (R17)— y el selector sin opciones.
 * La primera es la que decide el estado de la pantalla (R26): una lista visible vale mas que un
 * error total por no poder pintar una columna.
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
};

/** El indice `id -> { name, symbol }` con el que se arma la frase de equivalencia (R17). */
function buildBaseIndex(units: readonly UnitView[]): UnitBaseIndex {
  const index: Record<string, Pick<UnitRef, 'name' | 'symbol'>> = {};
  for (const unit of units) index[unit.id] = { name: unit.name, symbol: unit.symbol };
  return index;
}

export async function UnitListSection({ params }: UnitListSectionProps) {
  const [pageResult, catalogResult] = await Promise.all([
    listUnitsAction(params),
    listUnitsAction(),
  ]);

  if (pageResult.status === 'error') {
    return <UnitListError code={pageResult.code} message={pageResult.message} />;
  }

  // El degradado declarado: sin catalogo, indice vacio y selector sin opciones. La lista se pinta.
  const catalog = catalogResult.status === 'success' ? catalogResult.data : [];
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
      {/* El disparador del alta (R32). Vive junto a la lista, no en la pagina. */}
      <div className="flex justify-end">
        <UnitSheet baseUnits={baseUnits} />
      </div>
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
