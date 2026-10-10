'use client';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import type { UnitRef, UnitView } from '@/lib/modules/unidades';

import { NO_EQUIVALENCE_LABEL, formatUnitEquivalence } from './unit-equivalence';
import { UnitRowActions } from './unit-row-actions';

/**
 * Las CUATRO columnas de la lista de unidades, declaradas **como datos** (R16, R19, R31;
 * `design.md > 9`).
 *
 * **Modulo de CLIENTE, y no por gusto**: la columna de acciones devuelve elementos, y una
 * configuracion con funciones de celda que devuelven elementos no cruza la frontera
 * servidor->cliente. Por eso `UnitListSection` (servidor) baja solo datos serializables y es
 * `unit-table.tsx` quien monta `<DataTable>`.
 *
 * **La columna de acciones es una columna NORMAL** (R31): `DataTableColumn.cell` ya devuelve
 * `ReactNode` y `DataTable` lo pinta tal cual. **No se anade ninguna prop nueva** a la tabla
 * compartida ni se abre un solo archivo de `components/shared/data-table/`. Es la respuesta que
 * QC-35 dejo escrita, que QC-45 heredo y que esta ficha **hereda sin volver a decidirla**.
 *
 * **Cuatro columnas y ninguna mas** (R16): nombre, simbolo, equivalencia y acciones. Aqui **no**
 * se pinta el identificador tecnico, ni `companyId`, ni ninguna columna de ambito —que una unidad
 * sea de sistema es manejo interno (decision cerrada, alternativa E descartada)—, ni `baseUnitId`
 * o `factor` sueltos, ni `nameNormalized`, ni marcas de tiempo, ni autoria. El test de R16
 * recorre esta misma declaracion: anadir una columna prohibida obliga a tocarla.
 *
 * **Solo `name` y `symbol` ordenan** (R19), y ordenan porque estan en `UNIT_QUERYABLE.sortable`:
 * la cabecera no promete un orden que la lista blanca del contrato no acepte. La equivalencia
 * **no ordena** —no es una columna real, sino una frase compuesta por dos campos y un nombre
 * resuelto en la pantalla (alternativa F, descartada)— y la de acciones tampoco: ordenar por unos
 * botones no significa nada. **Ninguna declara `filter`** (R20).
 *
 * **Por que una FABRICA y no una constante suelta.** La celda de equivalencia necesita resolver el
 * nombre de la unidad de la que deriva la fila, y ese dato **no viene en la fila**: el modelo
 * `Unit` no declara relacion Prisma para `baseUnitId`, asi que la proyeccion no puede traerlo
 * (`design.md > 2.3`). El indice `id -> unidad` lo arma la seccion con la segunda lectura y entra
 * por aqui; `DataTableColumn.cell` recibe **solo la fila**, asi que el cierre de la fabrica es lo
 * que le da acceso sin tocar el contrato compartido.
 */

/** Ids de las cuatro columnas. Constantes porque los comparten la tabla y los tests (R49). */
export const NAME_COLUMN_ID = 'name';
export const SYMBOL_COLUMN_ID = 'symbol';
export const EQUIVALENCE_COLUMN_ID = 'equivalence';
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Cuantas columnas hay. Existe para que el esqueleto de carga —que lo pinta un Server Component y
 * por tanto **no puede importar este modulo de cliente**— pinte tantas celdas como columnas, y
 * para que el test lo ate a la longitud real en vez de dejarlo desincronizarse en silencio.
 */
export const UNIT_COLUMN_COUNT = 4;

/**
 * Indice `id -> unidad` con el que se resuelve el nombre de la unidad de la que deriva una fila.
 * Lo arma la seccion a partir del catalogo acotado; una clave ausente es el caso degradado de R17
 * —marcador neutro— y **no** un fallo.
 */
export type UnitBaseIndex = Readonly<Record<string, Pick<UnitRef, 'name' | 'symbol'>>>;

export function createUnitColumns(
  baseIndex: UnitBaseIndex,
  baseUnits: readonly UnitView[],
): readonly DataTableColumn<UnitView>[] {
  return [
    {
      id: NAME_COLUMN_ID,
      label: 'Nombre',
      align: 'start',
      // Esta en `UNIT_QUERYABLE.sortable`, asi que la cabecera no miente (R19).
      sortable: true,
      // El nombre se pinta TAL CUAL llega: sin recortes, sin mayusculas forzadas y sin normalizar.
      cell: (unit) => unit.name,
    },
    {
      id: SYMBOL_COLUMN_ID,
      label: 'Símbolo',
      align: 'start',
      sortable: true,
      // El simbolo es opcional (`UnitRef.symbol` es `string | null`): sin el, el mismo marcador
      // neutro que la equivalencia, para que la fila no quede con un hueco sin explicar.
      cell: (unit) =>
        unit.symbol === null || unit.symbol.trim() === '' ? NO_EQUIVALENCE_LABEL : unit.symbol,
    },
    {
      id: EQUIVALENCE_COLUMN_ID,
      label: 'Equivalencia',
      align: 'start',
      // Sin `sortable` y sin `filter`: no esta en la lista blanca del contrato (R19, R20).
      cell: (unit) =>
        formatUnitEquivalence(
          unit,
          unit.baseUnitId === null ? undefined : baseIndex[unit.baseUnitId],
        ),
    },
    // Sin `sortable` (no ordena), sin `filter` (no aparece en la barra de filtros) y sin anclar.
    actionsColumn<UnitView>({
      id: ACTIONS_COLUMN_ID,
      label: 'Acciones',
      cell: (unit) => <UnitRowActions unit={unit} baseUnits={baseUnits} />,
    }),
  ];
}

/**
 * Las columnas **sin ningun dato resuelto**: mismo numero, mismos ids y mismas capacidades de
 * orden y filtro que las de la fabrica, con el indice vacio y sin unidades base. Existe para que
 * el test de R16 pueda recorrer la DECLARACION sin inventarse un indice, y para que ese recorrido
 * sea el mismo objeto que la pantalla monta.
 */
export const UNIT_COLUMNS: readonly DataTableColumn<UnitView>[] = createUnitColumns({}, []);
