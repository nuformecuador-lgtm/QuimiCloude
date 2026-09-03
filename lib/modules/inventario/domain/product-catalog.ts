// lib/modules/inventario/domain/product-catalog.ts
import type { UnitId } from '@/lib/modules/unidades';

/** Identificador de un producto visto DESDE FUERA de `inventario`. Es lo unico que otro
 *  modulo guarda de un producto (p. ej. `recipe_lines.product_id`). */
export type ProductId = string;

/** Lo que otro modulo puede saber de un producto sin tocar su tabla: identidad, nombre y
 *  la REFERENCIA a su unidad anotativa (QC-32, R19). Deliberadamente NO expone costo,
 *  existencia ni compra minima: un contrato publico se amplia cuando alguien lo necesita,
 *  no antes.
 *
 *  Lleva `unitId`, no una `UnitRef` embebida, y es deliberado (`QC-32 design.md > 5.3`):
 *  quien necesite el nombre o el simbolo de la unidad para pintarla los pide a
 *  `UnitCatalog.findRefs` de `@/lib/modules/unidades`. Embeberla obligaria a `inventario`
 *  a resolver el catalogo en cada lectura de producto. */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly unitId: UnitId | null;
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
