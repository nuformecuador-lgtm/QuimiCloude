import type { ProductView } from '@/lib/modules/inventario';

/**
 * Declaracion de las columnas de la tabla de productos (R6, R7, R8, `design.md > 7`).
 *
 * Las columnas son DATOS, no JSX: la tabla las recorre y el test de R6/R7 itera esta misma
 * declaracion en vez de listar los literales uno a uno. Anadir una columna es anadir una fila
 * aqui, y eso es justo lo que el test en negativo de R7 vigila.
 *
 * Archivo sin `'use client'` a proposito: solo declara datos y funciones puras de presentacion,
 * asi que lo pueden importar tanto el Server Component de la lista como los componentes de
 * cliente sin arrastrar frontera alguna.
 */

/**
 * Campos de `ProductView` que la decision del 2026-09-03 deja FUERA de la tabla (R7):
 * el identificador tecnico, el id de la presentacion -se muestra su nombre- y los dos ids de
 * autoria, que el backend guarda como identificadores y nadie resuelve a nombres (QC-20, D20).
 *
 * `unitId` esta aqui por una razon distinta y posterior: el merge de QC-32 (`modelo-unidades`)
 * convirtio la unidad en catalogo, asi que `ProductView` ya no trae el texto `unit` sino la clave
 * foranea `unitId`. Pintar ese UUID seria peor que no mostrar nada, y **hoy no hay forma de
 * resolverlo a un nombre**: el contrato publico de `lib/modules/unidades` solo publica
 * `normalizeUnitName` y los tipos, sin operacion de listado. La columna la traera QC-38
 * (`crud-de-unidades`) cuando exponga como listar el catalogo. Excluirlo del TIPO -y no solo
 * omitir la fila- impide que alguien resuelva el hueco escribiendo `key: 'unitId'`.
 */
type HiddenProductField = 'id' | 'presentationId' | 'unitId' | 'createdBy' | 'updatedBy';

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
  /**
   * Si devuelve `true`, la tabla pinta ESA celda en rojo. Opcional: una columna que no lo
   * declara nunca se resalta.
   *
   * Es presentacion y solo presentacion: no hay ninguna columna derivada en la base ni ningun
   * campo calculado en `ProductView` (R11 y la decision cerrada 10 de QC-14 lo prohiben). La
   * comparacion se hace aqui, al pintar, sobre dos valores que ya venian en la fila.
   */
  readonly alert?: (product: ProductView) => boolean;
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
 * La existencia esta en alarma cuando la alerta de cantidad la SUPERA: queda menos de lo que el
 * producto declara como minimo aceptable.
 *
 * **Solo cuando los dos son numeros.** Un producto anterior a la decision del 2026-09-03 puede
 * tener cualquiera de los dos a NULL en la base, y `null` no se compara: sin los dos valores no
 * se sabe si hay alarma, y pintar de rojo una incognita seria inventarse el dato.
 *
 * El nombre no es casual: `inventario-schema.test.ts` prohibe `isBelowAlert` y sus hermanos
 * COMO CAMPO DEL ESQUEMA -no puede existir una columna derivada de bajo de existencias-. Aqui es
 * una funcion de presentacion en un archivo de UI, que es justo lo que esa prohibicion deja vivo.
 */
function isBelowAlert(product: ProductView): boolean {
  if (typeof product.stock !== 'number') return false;
  if (typeof product.qtyAlert !== 'number') return false;
  return product.qtyAlert > product.stock;
}

/**
 * Las cuatro columnas que quedan (decision del humano, 2026-09-03).
 *
 * ACOTA A R6, que enumeraba nueve. Salen costo, compra minima, tiempo de entrega, creado y
 * actualizado: cinco columnas que ensanchaban la tabla sin que nadie las leyera de un vistazo.
 * NO desaparece ningun dato del sistema -siguen en `ProductView`, en la base y en el envio de la
 * edicion-; lo que desaparece es su columna. El orden sigue siendo el de lectura: que producto
 * es, en que presentacion, cuanto hay y a partir de cuanto avisar.
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
    alert: isBelowAlert,
  },
  {
    key: 'qtyAlert',
    label: 'Alerta de cantidad',
    testId: 'product-column-qtyAlert',
    align: 'end',
    value: (product) => formatOptionalInt(product.qtyAlert),
  },
];
