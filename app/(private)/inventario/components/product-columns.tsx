'use client';

import type { ReactNode } from 'react';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import { compareQuantities, productDisplayName, type ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

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

/**
 * Campos de `ProductView` que quedan FUERA de la tabla como columna propia: el identificador
 * tecnico, la ruta de la imagen y el id de la unidad -un UUID que esta pantalla no resuelve a
 * nombre por si solo-. La unidad no desaparece: se pinta junto al nombre (`nameCell`) y junto a
 * la existencia (`existenceLabel`), resuelta contra el catalogo que recibe la columna.
 *
 * `imagePath` esta fuera por el mismo criterio: la RUTA no se pinta como texto. La imagen se ve
 * -es la primera columna-, pero su columna se llama `image` y pinta una miniatura, no la cadena.
 */
type HiddenProductField =
  | 'id'
  | 'unitId'
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
 * Etiqueta de una unidad a partir de su id: simbolo, nombre, o el marcador si el catalogo no la
 * trae. Sin catalogo (`units` indefinido), devuelve `null` y quien llama pinta la cantidad sola.
 */
export function unitLabel(unitId: UnitRef['id'], units: readonly UnitRef[] | undefined): string | null {
  if (units === undefined) return null;
  const unit = units.find((candidate) => candidate.id === unitId);
  return unit?.symbol ?? unit?.name ?? EMPTY_MARK;
}

/**
 * La existencia esta en alarma cuando la alerta de cantidad SUPERA la existencia guardada del
 * producto. Sin lotes, esa existencia es 0 y la alarma sigue funcionando igual.
 *
 * El nombre no es casual: `inventario-schema.test.ts` prohibe `isBelowAlert` y sus hermanos
 * COMO CAMPO DEL ESQUEMA -no puede existir una columna derivada de bajo de existencias-. Aqui es
 * una funcion de presentacion en un archivo de UI, que es justo lo que esa prohibicion deja vivo.
 */
export function isBelowAlert(product: ProductView): boolean {
  return typeof product.qtyAlert === 'string' && compareQuantities(product.qtyAlert, product.stock) > 0;
}

/**
 * Etiqueta de la unidad del producto, o `null` sin unidad o sin catalogo.
 *
 * Exportada para que otras pantallas de esta ruta -el panel de lotes, por ejemplo- compongan el
 * mismo «nombre · unidad» que esta columna, sin duplicar la regla.
 */
export function productUnitLabel(
  product: ProductView,
  units: readonly UnitRef[] | undefined,
): string | null {
  return product.unitId === null ? null : unitLabel(product.unitId, units);
}

/**
 * Una existencia junto a su unidad, tenida de rojo cuando esta en alarma.
 *
 * Se pinta a dos decimales: la celda no es donde se vuelve a guardar. El `aria-label` lleva la
 * cifra exacta. `data-alert` acompana a la clase para que la alarma sea afirmable sin depender
 * del nombre de una utilidad de Tailwind.
 */
export function stockAmountCell(stock: string, label: string | null, alerted: boolean): ReactNode {
  const amount = formatDecimalDisplay(stock);
  const exact = trimDecimal(stock);

  return (
    <span
      data-testid="product-stock"
      data-alert={alerted ? 'true' : undefined}
      className={alerted ? 'font-semibold text-destructive' : undefined}
      title={exactDecimalTitle(stock)}
      aria-label={label === null ? exact : `${exact} ${label}`}
    >
      {label === null ? amount : `${amount} ${label}`}
    </span>
  );
}

function stockCell(product: ProductView, units: readonly UnitRef[] | undefined): ReactNode {
  return stockAmountCell(product.stock, productUnitLabel(product, units), isBelowAlert(product));
}

/** Una cantidad en la unidad del producto; sin unidad conocida, la cifra sola. */
function productQuantityCell(
  value: string,
  testId: string,
  product: ProductView,
  units: readonly UnitRef[] | undefined,
): ReactNode {
  const label = productUnitLabel(product, units);
  const amount = formatDecimalDisplay(value);
  const exact = trimDecimal(value);

  return (
    <span
      data-testid={testId}
      title={exactDecimalTitle(value)}
      aria-label={label === null ? exact : `${exact} ${label}`}
    >
      {label === null ? amount : `${amount} ${label}`}
    </span>
  );
}

/** La alerta de cantidad, opcional: sin valor pinta el marcador de vacio, sin `title` ni `aria-label`. */
export function qtyAlertCell(product: ProductView, units: readonly UnitRef[] | undefined): ReactNode {
  if (product.qtyAlert === null) return EMPTY_MARK;
  return productQuantityCell(product.qtyAlert, 'product-qty-alert', product, units);
}

/**
 * Celda de una cantidad agregada (reservado, disponible), junto a la unidad del producto.
 *
 * `undefined` pinta el marcador de vacio sin `title` ni `aria-label`: es lo que devuelve toda
 * lectura que no sea el listado paginado, que es la unica que agrega estas dos columnas.
 */
function aggregateQuantityCell(
  value: string | undefined,
  testId: string,
  product: ProductView,
  units: readonly UnitRef[] | undefined,
): ReactNode {
  if (value === undefined) return EMPTY_MARK;
  return productQuantityCell(value, testId, product, units);
}

export type ProductColumnsDeps = {
  /**
   * Acciones de la fila (el menu de la fila). Es un **slot**: la declaracion de columnas no
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
      // Nace fijada: es la que identifica la fila de un vistazo y la que menos ancho ocupa.
      // Es un defecto, con preferencia guardada gana la del usuario.
      defaultPinned: 'left',
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
      width: 500,
      hideText: false,
      cell: (product) => productDisplayName(product.name, productUnitLabel(product, units)),
    },
    {
      id: 'stock',
      label: 'Existencia',
      tabular: true,
      align: 'center',
      sortable: true,
      filter: { kind: 'numberRange' },
      cell: (product) => stockCell(product, units),
    },
    {
      id: 'qtyAlert',
      label: 'Alerta de cantidad',
      tabular: true,
      align: 'center',
      sortable: true,
      filter: { kind: 'numberRange' },
      cell: (product) => qtyAlertCell(product, units),
    },
    {
      id: 'reserved',
      label: 'Reservado',
      tabular: true,
      align: 'center',
      // No ordena ni filtra: es un agregado de los lotes, no una columna de `products`.
      cell: (product) => aggregateQuantityCell(product.reserved, 'product-reserved', product, units),
    },
    {
      id: 'available',
      label: 'Disponible',
      tabular: true,
      align: 'center',
      cell: (product) => aggregateQuantityCell(product.available, 'product-available', product, units),
    },
    {
      ...actionsColumn<ProductView>({
        id: ACTIONS_COLUMN_ID,
        label: ACTIONS_COLUMN_LABEL,
        defaultPinned: 'right',
        cell: (product) => rowActions(product),
      }),
      id: ACTIONS_COLUMN_ID,
    },
  ];
}
