'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { UnitView } from '@/lib/modules/unidades';

import { createUnitColumns, type UnitBaseIndex } from './unit-columns';
import { unitListHref } from './unit-list-params';

/**
 * La tabla de la lista de unidades (R15, R18, R19, R20, R21, R22, R27; `design.md > 5.3` y `> 9`).
 *
 * **Usa la tabla de datos compartida de QC-55**, importada por su barrel publico (alternativa A de
 * QC-45, descartada): no se declara una tabla propia, ni una barra de paginacion propia, ni se
 * copia el esqueleto de ninguna otra pantalla, y **no se abre un solo archivo** de
 * `components/shared/data-table/` (R31).
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica. El Server
 * Component de la seccion vuelve a pedir la lista **sobre el conjunto entero** (R18). Esta
 * pantalla **no ordena, no filtra y no recorta nada en el cliente** (R18, R19): la tabla pinta las
 * filas tal cual llegan.
 *
 * **El destino sale de `unitListHref`** (R8): ningun archivo de la ruta escribe la URL como
 * literal.
 *
 * **`searchable` AUSENTE (= `true`)**, porque `UNIT_QUERYABLE.searchable` es `true`; y el texto de
 * la caja de busqueda dice **por nombre**, porque el adaptador compara contra `nameNormalized` y
 * nada mas (R18): una caja que insinuara «nombre o simbolo» mentiria.
 *
 * **`status` es SIEMPRE `'idle'`**: los tres estados de R24/R25/R26 se pintan fuera de
 * `<DataTable>`, con copy y acciones propias, y el «cargando» lo aporta el `<Suspense>` del
 * servidor. Aqui solo llegan filas ya resueltas.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R27): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que con cuatro columnas —y la de
 * equivalencia, que es la que mas ancho pide— el documento no se desplaza y las acciones de fila
 * siguen alcanzables con el scroll de la propia tabla.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const UNIT_TABLE_ID = 'unidades';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R49): los
 * controles se localizan por rol o por `data-testid`.
 */
export const UNIT_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay unidades que mostrar.',
  loading: 'Cargando unidades…',
  error: 'No se pudo cargar la lista de unidades.',
  // R18: se busca SOLO por nombre, que es contra lo unico que compara el adaptador.
  search: 'Buscar unidades por nombre',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Unidades por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

export type UnitTableProps = {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R18, R19). */
  readonly units: readonly UnitView[];
  /**
   * Indice `id -> unidad` con el que la columna de equivalencia resuelve la unidad de la que
   * deriva cada fila (R17). Vacio si la segunda lectura fallo: entonces cada equivalencia derivada
   * cae al marcador neutro y la lista se pinta igual (`design.md > 5.3`).
   */
  readonly baseIndex: UnitBaseIndex;
  /** Unidades BASE del ambito, para el selector de «deriva de» del panel de edicion (R36). */
  readonly baseUnits: readonly UnitView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
};

export function UnitTable({ units, baseIndex, baseUnits, params, totalPages }: UnitTableProps) {
  const router = useRouter();
  // Las columnas se rearman solo cuando cambian los datos que resuelven sus celdas.
  const columns = useMemo(() => createUnitColumns(baseIndex, baseUnits), [baseIndex, baseUnits]);

  return (
    <DataTable
      tableId={UNIT_TABLE_ID}
      columns={columns}
      rows={units}
      getRowId={(unit) => unit.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(unitListHref(next))}
      status="idle"
      texts={UNIT_TABLE_TEXTS}
    />
  );
}
