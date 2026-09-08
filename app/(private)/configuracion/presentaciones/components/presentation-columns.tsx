'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import type { PresentationView } from '@/lib/modules/inventario';

import { NAME_COLUMN_ID } from './presentation-list-params';
import { PresentationRowActions } from './presentation-row-actions';

/**
 * Las DOS columnas de la lista de presentaciones, declaradas **como datos** (R9, R11, R19, R20,
 * `design.md > 6`).
 *
 * **Modulo de CLIENTE, y no por gusto** (`design.md > 6`): la columna de acciones devuelve
 * elementos, y una configuracion con funciones de celda que devuelven elementos no cruza la
 * frontera servidor->cliente. Por eso `PresentationListSection` (servidor) baja solo datos
 * serializables y es `presentation-table.tsx` quien monta `<DataTable>`.
 *
 * **La columna de acciones es una columna NORMAL** (R20, alternativa B descartada):
 * `DataTableColumn.cell` ya devuelve `ReactNode` y `DataTable` lo pinta directamente. **No se
 * anade ninguna prop `renderRowActions`** —ni ningun otro mecanismo— al componente compartido, que
 * seria una segunda manera de hacer lo que `cell` ya hace, y obligaria ademas a abrir
 * `components/shared/data-table/`, que R20 prohibe. Es la respuesta que QC-35 dejo escrita en
 * `order-columns.tsx` y que esta ficha **hereda** en vez de volver a decidir.
 *
 * **Solo dos columnas, y ninguna mas** (R9): `Presentation` tiene un unico campo de negocio.
 * Aqui **no** se pinta el identificador tecnico, ni `nameNormalized` —lo deriva el dominio—, ni
 * `createdAt`/`updatedAt`, ni autoria (alternativa G, descartada). El test de R9 recorre esta
 * misma declaracion: anadir una columna prohibida obliga a tocarla, que es justo lo que vigila.
 *
 * **Solo `name` ordena** (R11), y ordena porque esta en `PRESENTATION_QUERYABLE.sortable`: la
 * cabecera no promete un orden que la lista blanca del contrato no acepte. La de acciones **ni
 * ordena ni filtra**: ordenar por unos botones no significa nada.
 *
 * El nombre se pinta **tal cual llega** de la consulta: sin recortes, sin mayusculas forzadas y
 * sin normalizar. Lo que el usuario ve es lo que el catalogo guarda.
 */

/** Id de la unica columna de datos. Se **importa** del parser: un solo sitio lo declara (R11). */
export { NAME_COLUMN_ID } from './presentation-list-params';

/** Id de la columna de acciones de fila (R19, R20). */
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Cuantas columnas hay. Existe para que el esqueleto de carga —que lo pinta un Server Component y
 * por tanto **no puede importar este modulo de cliente**— pinte tantas celdas como columnas, y
 * para que el test lo ate a `PRESENTATION_COLUMNS.length` en vez de dejarlo desincronizarse en
 * silencio.
 */
export const PRESENTATION_COLUMN_COUNT = 2;

export const PRESENTATION_COLUMNS: readonly DataTableColumn<PresentationView>[] = [
  {
    id: NAME_COLUMN_ID,
    label: 'Nombre',
    align: 'start',
    // Esta en `PRESENTATION_QUERYABLE.sortable`, asi que la cabecera no miente (R11).
    sortable: true,
    cell: (presentation) => presentation.name,
  },
  {
    id: ACTIONS_COLUMN_ID,
    label: 'Acciones',
    align: 'end',
    // Sin `sortable` (no ordena) y sin `filter` (no aparece en la barra de filtros) — R11.
    // `pinnable: false` para que el usuario no pueda fijarla y tapar la del nombre.
    pinnable: false,
    cell: (presentation) => <PresentationRowActions presentation={presentation} />,
  },
];
