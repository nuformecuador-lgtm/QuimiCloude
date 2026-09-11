// lib/modules/inventario/domain/product-catalog.ts

/** Identificador de un producto visto DESDE FUERA de `inventario`. Es lo unico que otro
 *  modulo guarda de un producto (p. ej. `recipe_lines.product_id`). */
export type ProductId = string;

/** Lo que otro modulo puede saber de un producto sin tocar su tabla: identidad, nombre y
 *  existencia. Deliberadamente NO expone costo, compra minima ni presentacion: la
 *  presentacion se mudo al lote (`ProductBatch`) el 2026-09-09, y un contrato publico se
 *  amplia cuando alguien lo necesita, no antes.
 *
 *  QC-80 (R21): AQUI VIVIA `unitId`, y se retira SIN SUSTITUTO porque NADIE lo consumia.
 *  `recetas` -el unico llamante de `findRefs`- lo pide para saber si el producto sigue vivo y
 *  para su nombre y su existencia; la unidad de una linea de receta es `recipe_lines.unit_id`,
 *  que es SUYA y no se toca. No se publica en su lugar la unidad derivada del lote
 *  (`ProductView.latestBatchUnitId`): un contrato publico no gana un campo que nadie pide, y
 *  quien lista productos ya lo recibe por `ProductView`.
 *
 *  `stock` es `null` cuando el producto no declara existencia (columna anulable, QC-14).
 */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  /** Existencia del producto en unidades, `null` cuando no declara stock. */
  readonly stock: number | null;
};

/** Servicio que `inventario` ofrece a los demas modulos (`docs/architecture.md > Dominio`
 *  n.o 2: «se comparten servicios via interfaz, nunca repositorios ni tablas»).
 *  Lo implementa un adaptador driven DE INVENTARIO —el unico que puede tocar
 *  `prisma.product`— y lo cablea `lib/composition`. */
export interface ProductCatalog {
  /** Referencias de los productos vivos entre los ids pedidos. Los ids que no existan o
   *  esten borrados logicamente simplemente no vienen en la respuesta. */
  findRefs(ids: readonly ProductId[]): Promise<readonly ProductRef[]>;
}
