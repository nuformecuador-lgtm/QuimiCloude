'use client';

import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import type { CatalogLineMeasurements, CatalogLineView } from '@/lib/modules/proveedores';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';

import {
  resolvePresentationName,
  resolveUnitLabel,
  type CatalogDirectories,
} from './catalog-directories';

/**
 * Declaracion de las columnas de la tabla del catalogo de un proveedor (R21, R22, R41,
 * `design.md > 6`).
 *
 * **MIGRADO A LA TABLA COMPARTIDA el 2026-09-07 (decision humana).** Antes esta lista describia
 * celdas de TEXTO (`value: (line, directories) => string | null`) y la tabla propia de la ruta las
 * recorria. Ahora son `DataTableColumn<CatalogLineView>` de `components/shared/data-table`, cuyas
 * celdas devuelven `ReactNode`: es lo que permite que la primera columna sea la miniatura -y lo
 * que quita de esta ruta una tabla, una barra de paginacion y un esqueleto propios-.
 *
 * **Lo que R22 exige NO se ha aflojado, solo ha cambiado de sitio**: el marcador de «no resuelto»
 * se pintaba en la tabla, mirando si `value` devolvia `null`; ahora lo pinta la propia celda, con
 * el mismo `data-testid` y el mismo `aria-label`. Sigue siendo distinto del marcador de «sin
 * dato», y sigue siendo imposible que la celda pinte el identificador tecnico.
 *
 * **Lo que R30 prohibia -mostrar la imagen- se ENMENDO el 2026-09-07**: la miniatura es la primera
 * columna. La otra mitad de R30 sigue viva: el formulario no pide imagen ni ofrece subirla.
 *
 * **Es una FACTORIA y no un array del modulo**: necesita los diccionarios de nombres y el slot de
 * acciones, que antes le llegaban a la tabla por props.
 *
 * **Que columna ordena y que columna filtra sale de `SUPPLIER_CATALOG_LINE_QUERYABLE`**, la lista
 * blanca del modulo, no de una decision de esta pantalla: declarar `sortable` en una cabecera que
 * el backend ignora seria pintar un control que miente.
 *
 * **El costo y el minimo de compra se PINTAN con dos decimales** (enmienda del 2026-09-17 a R41,
 * decision humana). Llegan con la escala de la columna -«12.5000»- y cuatro decimales de relleno
 * no informan de nada: compiten por la atencion con los que si. Las dos celdas los pasan por
 * `formatDecimalDisplay`, y llevan el valor exacto en su `title` cuando el redondeo cambia lo que
 * se ve, asi que la cifra completa no desaparece.
 *
 * Lo que R41 protege de fondo sigue vigilado y sin excepcion: NI `Intl.NumberFormat`, NI
 * `toFixed`, NI `parseFloat`, NI coma flotante, NI aritmetica de `number`. `formatDecimalDisplay`
 * redondea con enteros `BigInt` sobre el texto, que es exacto. Y es PRESENTACION: estas celdas no
 * alimentan ningun envio, la linea guardada conserva sus cuatro decimales y el formulario la
 * precarga con `trimDecimal`, que no redondea. Mismo criterio que la tabla de pedidos.
 */

/** Marca de «sin dato» de las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Marca de «no resuelto» de presentacion y unidad (R22). Es **distinta** de `EMPTY_CELL` en
 * significado -«no se pudo resolver el nombre» no es lo mismo que «este dato no existe»- y por eso
 * es tambien un glifo distinto: con la misma raya para los dos casos, una linea sin unidad -que
 * R40 permite expresamente- y un nombre que el diccionario no pudo resolver se leian igual en
 * pantalla.
 */
export const UNRESOLVED_CELL = '(?)';

/**
 * Campos de `CatalogLineView` que quedan FUERA de la tabla (R21, R30).
 *
 * `imagePath` sigue aqui despues de la enmienda del 2026-09-07, y es el mismo criterio que en
 * inventario: la imagen se VE, pero su columna se llama `image` y pinta una miniatura; la RUTA no
 * se pinta como texto en ninguna celda.
 */
type HiddenCatalogField = 'id' | 'supplierId' | 'imagePath' | 'createdBy' | 'updatedBy';

/** Id de la columna de la miniatura. No es un campo de la vista: es marcado. */
export const IMAGE_COLUMN_ID = 'image';

/** Id de la columna de acciones. Tampoco es un campo: es marcado. */
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Id valido de columna. **Es la primera defensa de R21/R30, y es de tipos**: escribir
 * `id: 'imagePath'` o `id: 'createdBy'` en la declaracion de abajo no compila.
 */
export type CatalogColumnId =
  | Exclude<keyof CatalogLineView, HiddenCatalogField>
  | typeof IMAGE_COLUMN_ID
  | typeof ACTIONS_COLUMN_ID;

/** Columna de esta tabla: la de la tabla compartida, con el id acotado. */
export type CatalogColumn = DataTableColumn<CatalogLineView> & { readonly id: CatalogColumnId };

/** Encabezado de la columna de imagen. Constante para que ningun test dependa del literal. */
export const CATALOG_IMAGE_COLUMN_LABEL = 'Imagen';

/** Encabezado de la columna de acciones. Constante para que ningun test dependa del literal. */
export const CATALOG_ACTIONS_COLUMN_LABEL = 'Acciones';

/**
 * Columnas que nacen fijadas al borde izquierdo. Es un **defecto**: en cuanto el usuario tenga
 * preferencia guardada para este `tableId` gana la suya.
 */
export const CATALOG_DEFAULT_PINNED_COLUMNS: readonly string[] = [IMAGE_COLUMN_ID];

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Texto compacto de las medidas de una linea, p. ej. «Ø 7.5 cm · alto 12 cm · boca 28/410».
 * `null` cuando no hay ninguna medida: la celda pinta la marca de «sin dato» en ese caso.
 */
function formatMeasurements(measurements: CatalogLineMeasurements | null): string | null {
  if (measurements === null) return null;

  const parts: string[] = [];
  if (measurements.diameter !== null) {
    parts.push(`Ø ${trimDecimal(measurements.diameter.value)} ${measurements.diameter.unit}`);
  }
  if (measurements.height !== null) {
    parts.push(`alto ${trimDecimal(measurements.height.value)} ${measurements.height.unit}`);
  }
  if (measurements.mouth !== null) {
    parts.push(`boca ${measurements.mouth}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * El marcador de «no resuelto» (R22), con su `data-testid` y su nombre accesible. Lo pinta la
 * celda porque desde el 2026-09-07 la celda devuelve marcado; antes lo decidia la tabla.
 */
function unresolved(columnId: CatalogColumnId): ReactNode {
  return (
    <span
      data-testid={`catalog-unresolved-${columnId}`}
      className="text-muted-foreground"
      aria-label="Sin nombre disponible"
    >
      {UNRESOLVED_CELL}
    </span>
  );
}

/** Nombre resuelto, o el marcador de «no resuelto» cuando el diccionario no lo tiene (R22). */
function resolvedOrMarker(columnId: CatalogColumnId, name: string | null): ReactNode {
  return name === null ? unresolved(columnId) : name;
}

export type CatalogColumnsDeps = {
  /** Diccionarios id -> nombre, construidos UNA vez por render de la seccion (R22, R46). */
  readonly directories: CatalogDirectories;
  /**
   * Acciones de la fila (editar, dar de baja). Es un **slot**: la declaracion de columnas no
   * importa el panel lateral ni el dialogo, los enchufa quien monta la tabla.
   */
  readonly rowActions: (line: CatalogLineView) => ReactNode;
};

export function buildCatalogColumns({
  directories,
  rowActions,
}: CatalogColumnsDeps): readonly CatalogColumn[] {
  return [
    {
      id: IMAGE_COLUMN_ID,
      label: CATALOG_IMAGE_COLUMN_LABEL,
      align: 'start',
      // Enmienda a R30 (2026-09-07). Hoy `supplier_catalog_lines.image_path` esta vacia en todas
      // las filas -el formulario sigue sin ofrecer subirla-, asi que lo que se ve es el marcador.
      cell: (line) => (
        <EntityImage path={line.imagePath} name={line.name} testId="catalog-image" />
      ),
    },
    {
      id: 'name',
      label: 'Nombre',
      align: 'start',
      sortable: true,
      cell: (line) => line.name,
    },
    {
      id: 'presentationId',
      label: 'Presentación',
      align: 'start',
      // La CLAVE es el id, pero el contenido NUNCA lo es (R22): se pinta el nombre resuelto.
      cell: (line) =>
        resolvedOrMarker('presentationId', resolvePresentationName(directories, line.presentationId)),
    },
    {
      id: 'unitId',
      label: 'Unidad',
      align: 'start',
      /*
        Dos ausencias que NO significan lo mismo (R22, R40): una linea **sin unidad** es un caso
        valido del contrato y pinta la marca de «sin dato»; un `unitId` que el diccionario no
        resuelve pinta el marcador de «no resuelto». Confundirlas hacia pasar por dato perdido lo
        que era una eleccion del usuario.
      */
      cell: (line) =>
        line.unitId === null
          ? EMPTY_CELL
          : resolvedOrMarker('unitId', resolveUnitLabel(directories, line.unitId)),
    },
    {
      id: 'cost',
      label: 'Costo',
      align: 'end',
      sortable: true,
      filter: { kind: 'numberRange' },
      // Dos decimales para leer, exacto por dentro: ver el bloque de R41 de arriba.
      cell: (line) => (
        <span title={exactDecimalTitle(line.cost)}>{formatDecimalDisplay(line.cost)}</span>
      ),
    },
    {
      id: 'minPurchase',
      label: 'Mínimo de compra',
      align: 'end',
      sortable: true,
      cell: (line) =>
        line.minPurchase === null ? (
          EMPTY_CELL
        ) : (
          <span title={exactDecimalTitle(line.minPurchase)}>
            {formatDecimalDisplay(line.minPurchase)}
          </span>
        ),
    },
    {
      id: 'deliveryTime',
      label: 'Tiempo de entrega',
      align: 'end',
      sortable: true,
      filter: { kind: 'numberRange' },
      cell: (line) => (line.deliveryTime === null ? EMPTY_CELL : String(line.deliveryTime)),
    },
    {
      id: 'material',
      label: 'Material',
      align: 'start',
      // Sin `sortable` ni `filter`: no entra en la lista blanca del backend.
      cell: (line) => line.material ?? EMPTY_CELL,
    },
    {
      id: 'measurements',
      label: 'Medidas',
      align: 'start',
      // Sin `sortable` ni `filter`: no entra en la lista blanca del backend.
      cell: (line) => formatMeasurements(line.measurements) ?? EMPTY_CELL,
    },
    {
      id: 'createdAt',
      label: 'Creado',
      align: 'start',
      sortable: true,
      cell: (line) => formatDate(line.createdAt),
    },
    {
      id: 'updatedAt',
      label: 'Actualizado',
      align: 'start',
      // `updatedAt` NO esta en `SUPPLIER_CATALOG_LINE_QUERYABLE.sortable`: se muestra, no se
      // ordena. Declararlo ordenable seria pintar un control que el backend ignora.
      cell: (line) => formatDate(line.updatedAt),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: CATALOG_ACTIONS_COLUMN_LABEL,
      align: 'end',
      pinnable: false,
      cell: (line) => <div className="flex justify-end gap-1">{rowActions(line)}</div>,
    },
  ];
}
