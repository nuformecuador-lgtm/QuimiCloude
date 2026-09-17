'use client';

import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import type { ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Declaracion de las columnas de la tabla de productos (R6, R7, R8, `design.md > 7`).
 *
 * **MIGRADO A LA TABLA COMPARTIDA el 2026-09-07 (decision humana).** Antes esta lista describia
 * celdas de TEXTO (`value: (product) => string`) y la tabla propia de la ruta las recorria. Ahora
 * son `DataTableColumn<ProductView>` de `components/shared/data-table`, cuyas celdas devuelven
 * `ReactNode`: es lo que permite que la primera columna sea la miniatura y lo que quita de esta
 * ruta una tabla, una barra de paginacion y un esqueleto propios.
 *
 * **Lo que R7 protege no se ha aflojado, y sigue siendo de TIPOS**: `ProductColumnId` excluye el
 * identificador tecnico, el id de la presentacion, el de la unidad y los dos de autoria, asi que
 * escribir `id: 'createdBy'` **no compila**. Se anaden `image` y `actions`, que no son campos de
 * `ProductView` sino las dos columnas de MARCADO -miniatura y acciones-. El test en negativo
 * sigue haciendo falta y sigue ahi.
 *
 * **Es una FACTORIA y no un array del modulo** por lo mismo que en pedidos: la celda de acciones
 * monta el panel de edicion y el dialogo de baja, que son componentes de cliente. Mientras fue un
 * array de datos, esas acciones vivian incrustadas en la tabla.
 *
 * **Que columna ordena y que columna filtra sale de `PRODUCT_QUERYABLE`**, la lista blanca del
 * modulo, no de una decision de esta pantalla: declarar `sortable` en una cabecera que el backend
 * ignora seria pintar un control que miente. `imagePath` no esta en esa lista blanca y por eso la
 * columna de imagen no ordena ni filtra: no se ordena por una ruta de archivo.
 */

/** Marca de "sin dato" para las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Campos de `ProductView` que la decision del 2026-09-03 (y la del 2026-09-09) deja FUERA de
 * la tabla: el identificador tecnico y el id de la unidad -un UUID que nadie resuelve a nombre-.
 *
 * `latestBatchUnitId` esta aqui por una razon posterior, y bajo ese nombre desde QC-80: el merge
 * de QC-32 (`modelo-unidades`) convirtio la unidad en catalogo -asi que `ProductView` dejo de
 * traer el texto `unit` y paso a traer una clave foranea-, y QC-80 (R21, R22) le quito la columna
 * al producto y la dejo DERIVADA de la presentacion de su lote mas reciente. Cambio el nombre y
 * cambio el origen; lo que NO cambio es el motivo de ocultarla: sigue siendo un UUID que esta
 * pantalla no sabe resolver a nombre, y pintarlo seria peor que no mostrar nada.
 *
 * `imagePath` tambien esta fuera, y es el mismo criterio: la RUTA no se pinta como texto. La
 * imagen se ve -es la primera columna desde el 2026-09-07-, pero su columna se llama `image` y
 * pinta una miniatura, no la cadena.
 *
 * La presentacion y la autoria ya no estan en `ProductView` (se mudaron a `product_batches` el
 * 2026-09-09), asi que no hay que ocultarlas: no existen en el tipo.
 */
type HiddenProductField =
  | 'id'
  | 'latestBatchUnitId'
  | 'imagePath';

/** Id de la columna de la miniatura. No es un campo de `ProductView`: es marcado. */
export const IMAGE_COLUMN_ID = 'image';

/** Id de la columna de acciones. Tampoco es un campo: es marcado. */
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Id valido de columna. **Es la primera defensa de R7, y es de tipos**: escribir
 * `id: 'createdBy'` en la declaracion de abajo no compila. El test en negativo sigue haciendo
 * falta -el tipo no impide anadir una columna con un id valido que pinte el autor-, pero el
 * error mas probable se detiene antes de llegar al test.
 */
export type ProductColumnId =
  | Exclude<keyof ProductView, HiddenProductField>
  | typeof IMAGE_COLUMN_ID
  | typeof ACTIONS_COLUMN_ID;

/** Columna de esta tabla: la de la tabla compartida, con el id acotado por R7. */
export type ProductColumn = DataTableColumn<ProductView> & { readonly id: ProductColumnId };

/** Encabezado de la columna de imagen. Constante para que ningun test dependa del literal. */
export const IMAGE_COLUMN_LABEL = 'Imagen';

/** Encabezado de la columna de acciones. Constante para que ningun test dependa del literal. */
export const ACTIONS_COLUMN_LABEL = 'Acciones';

/**
 * Columnas que nacen fijadas al borde izquierdo. Es un **defecto**: en cuanto el usuario tenga
 * preferencia guardada para este `tableId` gana la suya, incluida la de no tener nada fijado.
 *
 * Se fija la miniatura y no el nombre porque es la que identifica la fila de un vistazo y la que
 * menos ancho ocupa.
 */
export const PRODUCT_DEFAULT_PINNED_COLUMNS: readonly string[] = [IMAGE_COLUMN_ID];

function formatOptionalInt(value: number | null): string {
  return value === null ? EMPTY_CELL : String(value);
}

/**
 * Etiqueta de una unidad a partir de su id: simbolo, nombre, o el marcador si el catalogo no la
 * trae. Sin catalogo (`units` indefinido), devuelve `null` y quien llama pinta la cantidad sola.
 */
function unitLabel(unitId: UnitRef['id'], units: readonly UnitRef[] | undefined): string | null {
  if (units === undefined) return null;
  const unit = units.find((candidate) => candidate.id === unitId);
  return unit?.symbol ?? unit?.name ?? EMPTY_CELL;
}

/**
 * La existencia esta en alarma cuando la alerta de cantidad SUPERA la del lote mas reciente del
 * producto; las existencias en otras unidades no cuentan. Sin lotes, esa existencia es 0.
 *
 * El nombre no es casual: `inventario-schema.test.ts` prohibe `isBelowAlert` y sus hermanos
 * COMO CAMPO DEL ESQUEMA -no puede existir una columna derivada de bajo de existencias-. Aqui es
 * una funcion de presentacion en un archivo de UI, que es justo lo que esa prohibicion deja vivo.
 */
function isBelowAlert(product: ProductView): boolean {
  if (typeof product.qtyAlert !== 'number') return false;
  const existence =
    product.stockByUnit.find((entry) => entry.unitId === product.latestBatchUnitId)?.quantity ?? 0;
  return product.qtyAlert > existence;
}

/** Cantidad por unidad, unida con « · », o `0` cuando el producto no tiene ningun lote. */
function existenceLabel(product: ProductView, units: readonly UnitRef[] | undefined): string {
  if (product.stockByUnit.length === 0) return '0';

  return product.stockByUnit
    .map((entry) => {
      const label = unitLabel(entry.unitId, units);
      return label === null ? String(entry.quantity) : `${entry.quantity} ${label}`;
    })
    .join(' · ');
}

/**
 * La existencia, tenida de rojo cuando esta en alarma.
 *
 * La alarma es de la CELDA, no de la fila: solo se tine el valor que la dispara. `data-alert`
 * acompana a la clase para que la condicion sea afirmable sin depender del nombre de una utilidad
 * de Tailwind.
 */
function stockCell(product: ProductView, units: readonly UnitRef[] | undefined): ReactNode {
  const alerted = isBelowAlert(product);

  return (
    <span
      data-testid="product-stock"
      data-alert={alerted ? 'true' : undefined}
      className={alerted ? 'font-semibold text-destructive' : undefined}
    >
      {existenceLabel(product, units)}
    </span>
  );
}

export type ProductColumnsDeps = {
  /**
   * Acciones de la fila (editar, dar de baja). Es un **slot**: la declaracion de columnas no
   * importa el panel lateral ni el dialogo, los enchufa quien monta la tabla.
   */
  readonly rowActions: (product: ProductView) => ReactNode;
  /**
   * Catalogo de unidades para resolver el simbolo de la existencia. Sin el (lectura fallida en la
   * pagina), la celda sigue pintando la cantidad, sin etiqueta.
   */
  readonly units?: readonly UnitRef[];
};

export function buildProductColumns({ rowActions, units }: ProductColumnsDeps): readonly ProductColumn[] {
  return [
    {
      id: IMAGE_COLUMN_ID,
      label: IMAGE_COLUMN_LABEL,
      align: 'start',
      // La miniatura sale de `products.image_path`. Hoy esa columna esta vacia en todas las
      // filas -nada la llena todavia-, asi que lo que se ve es el marcador; ese caso NO es un
      // hueco: es el estado normal por ahora.
      cell: (product) => (
        <EntityImage path={product.imagePath} name={product.name} testId="product-image" />
      ),
    },
    {
      id: 'name',
      label: 'Nombre',
      align: 'start',
      sortable: true,
      cell: (product) => product.name,
    },
    {
      id: 'stock',
      label: 'Existencia',
      align: 'end',
      sortable: true,
      filter: { kind: 'numberRange' },
      cell: (product) => stockCell(product, units),
    },
    {
      id: 'qtyAlert',
      label: 'Alerta de cantidad',
      align: 'end',
      sortable: true,
      filter: { kind: 'numberRange' },
      cell: (product) => formatOptionalInt(product.qtyAlert),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: ACTIONS_COLUMN_LABEL,
      align: 'end',
      // No ordena, no filtra y no se fija: no es un dato de la fila.
      pinnable: false,
      cell: (product) => <div className="flex justify-end gap-1">{rowActions(product)}</div>,
    },
  ];
}
