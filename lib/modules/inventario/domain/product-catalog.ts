// lib/modules/inventario/domain/product-catalog.ts

import type { ProductStockByUnit } from './product-stock';
import type { CostingBatch } from './costing-batch';
import type { ProductType } from './product-type';

/** Identificador de un producto visto DESDE FUERA de `inventario`. Es lo unico que otro
 *  modulo guarda de un producto (p. ej. `recipe_lines.product_id`). */
export type ProductId = string;

/** Lo que otro modulo puede saber de un producto sin tocar su tabla: identidad, nombre,
 *  tipo, unidad y existencia. Deliberadamente NO expone costo, compra minima ni
 *  presentacion: la presentacion se mudo al lote (`ProductBatch`) el 2026-09-09, y un
 *  contrato publico se amplia cuando alguien lo necesita, no antes. `type` entro porque
 *  recetas valida el % por tipo (PRODUCT lo exige, MACHINE y PACKAGING admiten null).
 */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly type: ProductType;
  /** La unidad del producto; null mientras no tiene ningun lote. */
  readonly unitId: string | null;
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
