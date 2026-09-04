import type { CatalogLineView } from '@/lib/modules/proveedores';

import { resolvePresentationName, resolveUnitLabel, type CatalogDirectories } from './catalog-directories';

/**
 * Declaracion de las columnas de la tabla del catalogo (R12, R21, R22, R30, R41,
 * `design.md > 6`).
 *
 * Las columnas son DATOS, no JSX: la tabla las recorre y los tests en negativo de R12 y R30
 * iteran esta misma declaracion en vez de listar los literales uno a uno.
 *
 * Archivo sin `'use client'` a proposito: solo declara datos y funciones puras de presentacion,
 * asi que lo pueden importar tanto el Server Component de la seccion como el esqueleto sin
 * arrastrar frontera alguna.
 */

/**
 * Campos de `CatalogLineView` que quedan FUERA de la tabla:
 * - `id` y `supplierId`: identificadores tecnicos; el proveedor ya esta en la URL.
 * - `imagePath`: la tabla **no muestra la imagen de la linea** (R30, decision humana del
 *   2026-09-04). La columna existe en la base desde QC-52 y nadie la llena todavia (`P1`).
 * - `createdBy` / `updatedBy`: la tabla **no muestra quien creo ni quien modifico** (R12). El
 *   backend guarda identificadores y resolverlos a nombres exigiria consumir el contrato publico
 *   de `identity`, trabajo que esta ficha no abre; esto **cierra el reenvio** que QC-43 dejo
 *   escrito en `supplier-view.ts`.
 *
 * Excluirlos del TIPO -y no solo omitir la fila- es la primera defensa, y es de tipos: escribir
 * `key: 'imagePath'` o `key: 'createdBy'` en la tabla de abajo **no compila**. Los tests en
 * negativo siguen haciendo falta, pero el error mas probable se detiene antes de llegar a ellos.
 */
type HiddenCatalogField = 'id' | 'supplierId' | 'imagePath' | 'createdBy' | 'updatedBy';

export type CatalogColumnKey = Exclude<keyof CatalogLineView, HiddenCatalogField>;

export type CatalogColumn = {
  readonly key: CatalogColumnKey;
  readonly label: string;
  readonly testId: string;
  /** Alineacion del contenido: los importes y los enteros a la derecha, el texto a la izquierda. */
  readonly align: 'start' | 'end';
  /**
   * Texto de la celda, o `null` cuando el nombre **no se puede resolver** (R22): con `null` la
   * tabla pinta el marcador de «no resuelto» y **nunca el identificador tecnico**. Devolver
   * siempre cadena obligaria a que esta declaracion decidiera el glifo del marcador, que es
   * decision de la tabla.
   */
  readonly value: (line: CatalogLineView, directories: CatalogDirectories) => string | null;
};

/** Marca de «sin dato» de las columnas opcionales. Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/**
 * Marca de «no resuelto» de presentacion y unidad (R22). Es **distinta** de `EMPTY_CELL` en
 * significado -«no se pudo resolver el nombre» no es lo mismo que «este dato no existe»- y la
 * tabla la pinta con su propio `data-testid`, de modo que el test la localiza sin depender del
 * glifo.
 */
export const UNRESOLVED_CELL = '—';

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Las OCHO columnas de negocio de la linea (R21): nombre, presentacion, unidad, costo, minimo de
 * compra, tiempo de entrega, creado y actualizado.
 *
 * **`cost` y `minPurchase` se pintan TAL CUAL la cadena que entrega la consulta** (R41,
 * `design.md > 9`): no hay `Intl.NumberFormat`, ni `toFixed`, ni conversion a coma flotante, ni
 * aritmetica de ningun tipo. El importe viaja como cadena decimal de punta a punta.
 *
 * **`presentationId` y `unitId` son la CLAVE de la columna, pero nunca su contenido** (R22): la
 * celda pinta el nombre resuelto por los diccionarios, y si no hay nombre, el marcador.
 */
export const CATALOG_COLUMNS: readonly CatalogColumn[] = [
  {
    key: 'name',
    label: 'Nombre',
    testId: 'catalog-column-name',
    align: 'start',
    value: (line) => line.name,
  },
  {
    key: 'presentationId',
    label: 'Presentación',
    testId: 'catalog-column-presentationId',
    align: 'start',
    value: (line, directories) => resolvePresentationName(directories, line.presentationId),
  },
  {
    key: 'unitId',
    label: 'Unidad',
    testId: 'catalog-column-unitId',
    align: 'start',
    value: (line, directories) => resolveUnitLabel(directories, line.unitId),
  },
  {
    key: 'cost',
    label: 'Costo',
    testId: 'catalog-column-cost',
    align: 'end',
    value: (line) => line.cost,
  },
  {
    key: 'minPurchase',
    label: 'Mínimo de compra',
    testId: 'catalog-column-minPurchase',
    align: 'end',
    value: (line) => line.minPurchase ?? EMPTY_CELL,
  },
  {
    key: 'deliveryTime',
    label: 'Tiempo de entrega',
    testId: 'catalog-column-deliveryTime',
    align: 'end',
    value: (line) => (line.deliveryTime === null ? EMPTY_CELL : String(line.deliveryTime)),
  },
  {
    key: 'createdAt',
    label: 'Creado',
    testId: 'catalog-column-createdAt',
    align: 'start',
    value: (line) => formatDate(line.createdAt),
  },
  {
    key: 'updatedAt',
    label: 'Actualizado',
    testId: 'catalog-column-updatedAt',
    align: 'start',
    value: (line) => formatDate(line.updatedAt),
  },
];
