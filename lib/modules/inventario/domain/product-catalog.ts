// lib/modules/inventario/domain/product-catalog.ts

import type { ProductStockByUnit } from './product-stock';
import type { CostingBatch } from './costing-batch';

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
 *  que es SUYA y no se toca. No se publica en su lugar la unidad del producto
 *  (`ProductView.unitId`): un contrato publico no gana un campo que nadie pide, y
 *  quien lista productos ya lo recibe por `ProductView`.
 */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  /** Suma de lotes por unidad; array vacio cuando el producto no tiene ninguno. */
  readonly stockByUnit: readonly ProductStockByUnit[];
};

/** Servicio que `inventario` ofrece a los demas modulos (`docs/architecture.md > Dominio`
 *  n.o 2: «se comparten servicios via interfaz, nunca repositorios ni tablas»).
 *  Lo implementa un adaptador driven DE INVENTARIO —el unico que puede tocar
 *  `prisma.product`— y lo cablea `lib/composition`. */
export interface ProductCatalog {
  /** Referencias de los productos vivos entre los ids pedidos, ACOTADAS a una empresa. Los
   *  ids que no existan, esten borrados logicamente o sean de OTRA empresa simplemente no
   *  vienen en la respuesta: para quien llama son el mismo caso.
   *
   *  Recibe `companyId` como cadena suelta y no como un tipo de ambito propio de
   *  `inventario`: ese tipo es interno del modulo, y publicarlo por el barrel para que el
   *  llamante lo construya acoplaria dos modulos por un dato que ya es una cadena en los
   *  dos lados. Que el ambito viva en la firma es lo que hace que una llamada que lo omita
   *  no compile. */
  findRefs(ids: readonly ProductId[], companyId: string): Promise<readonly ProductRef[]>;

  /** Lotes CON EXISTENCIA (`stock > 0`) de los productos pedidos, de productos vivos y de esa
   *  empresa. Un producto sin lotes con existencia simplemente no aparece. NO ordena: el
   *  orden del calculo es criterio de negocio de quien costea. */
  findCostingBatches(
    ids: readonly ProductId[],
    companyId: string,
  ): Promise<readonly CostingBatch[]>;
}
