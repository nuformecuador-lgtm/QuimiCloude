// lib/modules/inventario/domain/product-catalog.ts
/** Identificador de un producto visto DESDE FUERA de `inventario`. Es lo unico que otro
 *  modulo guarda de un producto (p. ej. `recipe_lines.product_id`). */
export type ProductId = string;

/** Lo que otro modulo puede saber de un producto sin tocar su tabla: identidad, nombre y
 *  unidad anotativa. Deliberadamente NO expone costo, existencia ni compra minima: un
 *  contrato publico se amplia cuando alguien lo necesita, no antes. */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly unit: string | null;
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
