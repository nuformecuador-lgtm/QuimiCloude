import type { ProductView } from '@/lib/modules/inventario';

/**
 * Declaracion de las columnas de la tabla de productos (R6, R7, R8, `design.md > 7`).
 *
 * Las columnas son DATOS, no JSX: la tabla las recorre y el test de R6/R7 itera esta misma
 * declaracion en vez de listar diez literales. Anadir una columna es anadir una fila aqui, y eso
 * es justo lo que el test en negativo de R7 vigila.
 *
 * Archivo sin `'use client'` a proposito: solo declara datos y funciones puras de presentacion,
 * asi que lo pueden importar tanto el Server Component de la lista como los componentes de
 * cliente sin arrastrar frontera alguna.
 */

/**
 * Campos de `ProductView` que la decision del 2026-09-03 deja FUERA de la tabla (R7):
 * el identificador tecnico, el id de la presentacion -se muestra su nombre- y los dos ids de
 * autoria, que el backend guarda como identificadores y nadie resuelve a nombres (QC-20, D20).
 */
type HiddenProductField = 'id' | 'presentationId' | 'createdBy' | 'updatedBy';

/**
 * Clave valida de columna. **Es la primera defensa de R7, y es de tipos**: escribir
 * `key: 'createdBy'` en la tabla de abajo no compila. El test en negativo sigue haciendo falta
 * -el tipo no impide anadir una columna con un `key` valido que pinte el autor-, pero el error
 * mas probable se detiene antes de llegar al test.
 */
export type ProductColumnKey = Exclude<keyof ProductView, HiddenProductField>;

export type ProductColumn = {
  readonly key: ProductColumnKey;
  readonly label: string;
  readonly testId: string;
  /** Alineacion del contenido: los numeros a la derecha, el texto a la izquierda. */
  readonly align: 'start' | 'end';
  /** Texto de la celda. Devuelve SIEMPRE cadena: la tabla no formatea nada por su cuenta. */
  readonly value: (product: ProductView) => string;
};

/** Marca de "sin dato" para las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla. Determinista aqui,
 * legible en cualquier maquina.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatOptionalInt(value: number | null): string {
  return value === null ? EMPTY_CELL : String(value);
}

/**
 * Las diez columnas de negocio (R6). El orden es el de lectura: primero identifica el producto,
 * despues sus cantidades y su costo, y al final las marcas de tiempo.
 *
 * **`cost` se pinta TAL CUAL** (R8): es una cadena decimal que el backend produce a proposito
 * para no pasar un importe por el binario de coma flotante. Aqui no hay `Number(...)`, no hay
 * `parseFloat(...)` y no hay ninguna operacion aritmetica sobre el.
 */
export const PRODUCT_COLUMNS: readonly ProductColumn[] = [
  {
    key: 'name',
    label: 'Nombre',
    testId: 'product-column-name',
    align: 'start',
    value: (product) => product.name,
  },
  {
    key: 'presentationName',
    label: 'Presentación',
    testId: 'product-column-presentationName',
    align: 'start',
    value: (product) => product.presentationName,
  },
  {
    key: 'stock',
    label: 'Existencia',
    testId: 'product-column-stock',
    align: 'end',
    value: (product) => formatOptionalInt(product.stock),
  },
  {
    key: 'unit',
    label: 'Unidad',
    testId: 'product-column-unit',
    align: 'start',
    value: (product) => product.unit ?? EMPTY_CELL,
  },
  {
    key: 'cost',
    label: 'Costo',
    testId: 'product-column-cost',
    align: 'end',
    value: (product) => product.cost ?? EMPTY_CELL,
  },
  {
    key: 'minPurchase',
    label: 'Compra mínima',
    testId: 'product-column-minPurchase',
    align: 'end',
    value: (product) => String(product.minPurchase),
  },
  {
    key: 'deliveryTime',
    label: 'Tiempo de entrega',
    testId: 'product-column-deliveryTime',
    align: 'end',
    value: (product) => formatOptionalInt(product.deliveryTime),
  },
  {
    key: 'qtyAlert',
    label: 'Alerta de cantidad',
    testId: 'product-column-qtyAlert',
    align: 'end',
    value: (product) => formatOptionalInt(product.qtyAlert),
  },
  {
    key: 'createdAt',
    label: 'Creado',
    testId: 'product-column-createdAt',
    align: 'start',
    value: (product) => formatDate(product.createdAt),
  },
  {
    key: 'updatedAt',
    label: 'Actualizado',
    testId: 'product-column-updatedAt',
    align: 'start',
    value: (product) => formatDate(product.updatedAt),
  },
];
