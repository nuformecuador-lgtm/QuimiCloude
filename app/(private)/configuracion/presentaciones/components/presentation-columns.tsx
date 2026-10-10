'use client';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import type { PresentationView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { trimDecimal } from '@/lib/shared/ui/decimal-display';

import { NAME_COLUMN_ID } from './presentation-list-params';
import { PresentationRowActions } from './presentation-row-actions';

/**
 * Las columnas de la lista de presentaciones, declaradas **como datos**.
 *
 * **Modulo de CLIENTE, y no por gusto** (`design.md > 6`): la columna de acciones devuelve
 * elementos, y una configuracion con funciones de celda que devuelven elementos no cruza la
 * frontera servidor->cliente. Por eso `PresentationListSection` (servidor) baja solo datos
 * serializables y es `presentation-table.tsx` quien monta `<DataTable>`.
 *
 * **La columna de acciones se declara con `actionsColumn()`**, la de todas las tablas: su celda
 * devuelve el menu de la fila como `ReactNode` y `DataTable` lo pinta directamente.
 *
 * Aqui **no** se pinta el identificador tecnico, ni `nameNormalized` —lo deriva el dominio—, ni
 * `createdAt`/`updatedAt`, ni autoria.
 *
 * **Solo `name` ordena**, y ordena porque esta en `PRESENTATION_QUERYABLE.sortable`: la cabecera
 * no promete un orden que la lista blanca del contrato no acepte. Ni la de contenido ni la de
 * acciones ordenan ni filtran.
 *
 * El nombre se pinta **tal cual llega** de la consulta: sin recortes, sin mayusculas forzadas y
 * sin normalizar. Lo que el usuario ve es lo que el catalogo guarda.
 *
 * **La unidad NO gana columna propia**: pintarla abre una pregunta que nadie hizo -¿el nombre?,
 * ¿el simbolo?, ¿resuelto contra que catalogo?-. Coste aceptado: para verla hay que abrir el
 * panel. Va, en cambio, junto al contenido -«1 L»-, que si necesita decir en que unidad esta. Las
 * `units` que esta declaracion recibe sirven para las dos cosas: la celda de contenido y el panel
 * de edicion que monta la celda de acciones.
 *
 * **Por eso las columnas pasan a construirse con una funcion** en vez de ser una constante: la
 * celda de acciones necesita el catalogo, y el catalogo lo trae la seccion en tiempo de ejecucion.
 * Mismo mecanismo que `buildOrderColumns` de QC-35, memoizado por la tabla.
 */

/** Id de la unica columna de datos. Se **importa** del parser: un solo sitio lo declara (R11). */
export { NAME_COLUMN_ID } from './presentation-list-params';

/** Id de la columna de acciones de fila. */
export const ACTIONS_COLUMN_ID = 'actions';

/** Id de la columna de contenido. */
export const CONTENT_COLUMN_ID = 'content';

/** Texto de la celda de contenido cuando la presentacion no lo tiene declarado. */
export const NO_CONTENT_LABEL = 'Sin contenido';

/**
 * Cuantas columnas hay. Existe para que el esqueleto de carga —que lo pinta un Server Component y
 * por tanto **no puede importar este modulo de cliente**— pinte tantas celdas como columnas, y
 * para que el test lo ate a `buildPresentationColumns(...).length` en vez de dejarlo desincronizarse en
 * silencio.
 */
export const PRESENTATION_COLUMN_COUNT = 3;

/** `symbol` cuando existe; `name` en caso contrario. */
function unitLabel(unit: UnitRef): string {
  return unit.symbol ?? unit.name;
}

/** «1 L» junto a la unidad, o el aviso de que no tiene, sin ceros de relleno del contenido guardado. */
function contentCell(presentation: PresentationView, units: readonly UnitRef[]): string {
  if (presentation.content === null) return NO_CONTENT_LABEL;

  const unit = units.find((candidate) => candidate.id === presentation.unitId);
  const amount = trimDecimal(presentation.content);
  return unit === undefined ? amount : `${amount} ${unitLabel(unit)}`;
}

export function buildPresentationColumns(
  units: readonly UnitRef[],
): readonly DataTableColumn<PresentationView>[] {
  return [
    {
      id: NAME_COLUMN_ID,
      label: 'Nombre',
      align: 'start',
      // Esta en `PRESENTATION_QUERYABLE.sortable`, asi que la cabecera no miente.
      sortable: true,
      cell: (presentation) => presentation.name,
    },
    {
      id: CONTENT_COLUMN_ID,
      label: 'Contenido',
      align: 'end',
      // No ordena ni filtra: no esta en la lista blanca del catalogo para ninguna de las dos cosas.
      pinnable: false,
      cell: (presentation) => contentCell(presentation, units),
    },
    // No ordena, no filtra y no se puede fijar: asi no tapa la columna del nombre.
    actionsColumn({
      id: ACTIONS_COLUMN_ID,
      label: 'Acciones',
      cell: (presentation) => <PresentationRowActions presentation={presentation} units={units} />,
    }),
  ];
}
