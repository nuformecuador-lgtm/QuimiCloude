import type { SupplierView } from '@/lib/modules/proveedores';

/**
 * Declaracion de las columnas de la tabla de proveedores (R12, R14, `design.md > 5.3`).
 *
 * Las columnas son DATOS, no JSX: la tabla las recorre y el test en negativo de R12 itera esta
 * misma declaracion en vez de listar los literales uno a uno. Anadir una columna es anadir una
 * fila aqui, y eso es justo lo que ese test vigila.
 *
 * Archivo sin `'use client'` a proposito: solo declara datos y funciones puras de presentacion,
 * asi que lo pueden importar tanto el Server Component de la lista como los componentes de
 * cliente sin arrastrar frontera alguna.
 */

/**
 * Campos de `SupplierView` que la decision del humano del 2026-09-04 deja FUERA de la tabla: el
 * identificador tecnico, la forma normalizada del nombre —dato de deduplicacion, no de
 * lectura— y los dos ids de autoria (R12).
 *
 * Los dos ultimos **cierran el reenvio** que QC-43 dejo escrito en `supplier-view.ts`:
 * `createdBy`/`updatedBy` son IDENTIFICADORES, no nombres, y resolverlos exigiria consumir el
 * contrato publico de `identity`, trabajo que la ficha del board no pide. Pintar el uuid seria
 * peor que no mostrar nada; mismo criterio que QC-20/QC-22.
 */
type HiddenSupplierField = 'id' | 'nameNormalized' | 'createdBy' | 'updatedBy';

/**
 * Clave valida de columna. **Es la primera defensa de R12, y es de tipos**: escribir
 * `key: 'createdBy'` en la declaracion de abajo no compila. El test en negativo sigue haciendo
 * falta —el tipo no impide anadir una columna con un `key` valido que pinte el autor—, pero el
 * error mas probable se detiene antes de llegar al test.
 */
export type SupplierColumnKey = Exclude<keyof SupplierView, HiddenSupplierField>;

export type SupplierColumn = {
  readonly key: SupplierColumnKey;
  readonly label: string;
  readonly testId: string;
  /** Alineacion del contenido: los numeros a la derecha, el texto a la izquierda. */
  readonly align: 'start' | 'end';
  /** Texto de la celda. Devuelve SIEMPRE cadena: la tabla no formatea nada por su cuenta. */
  readonly value: (supplier: SupplierView) => string;
};

/** Marca de "sin dato" para las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla. Determinista aqui,
 * legible en cualquier maquina. Mismo criterio que `recipe-columns.ts` (QC-26).
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Las cinco columnas de negocio que pide R14: nombre, telefono, correo electronico, fecha de
 * creacion y fecha de actualizacion. El orden es el de lectura: quien es el proveedor y como se
 * le contacta, y despues su rastro temporal.
 *
 * `phone` y `email` son opcionales en el contrato (`string | null`, QC-43 R13), asi que su
 * ausencia se pinta con `EMPTY_CELL` en vez de con una celda vacia que parezca un fallo.
 */
export const SUPPLIER_COLUMNS: readonly SupplierColumn[] = [
  {
    key: 'name',
    label: 'Nombre',
    testId: 'supplier-column-name',
    align: 'start',
    value: (supplier) => supplier.name,
  },
  {
    key: 'phone',
    label: 'Teléfono',
    testId: 'supplier-column-phone',
    align: 'start',
    value: (supplier) => supplier.phone ?? EMPTY_CELL,
  },
  {
    key: 'email',
    label: 'Correo electrónico',
    testId: 'supplier-column-email',
    align: 'start',
    value: (supplier) => supplier.email ?? EMPTY_CELL,
  },
  {
    key: 'createdAt',
    label: 'Creado',
    testId: 'supplier-column-createdAt',
    align: 'start',
    value: (supplier) => formatDate(supplier.createdAt),
  },
  {
    key: 'updatedAt',
    label: 'Actualizado',
    testId: 'supplier-column-updatedAt',
    align: 'start',
    value: (supplier) => formatDate(supplier.updatedAt),
  },
];
