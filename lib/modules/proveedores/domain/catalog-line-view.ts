import type { ProductId } from '@/lib/modules/inventario';

/**
 * Contratos de entrada y salida de la linea de catalogo (`design.md > 6.2`, `> 7`).
 *
 * `ProductId` se toma del BARREL de `inventario` (`@/lib/modules/inventario`), nunca por
 * ruta profunda y nunca redeclarado aqui (R26, R44): el producto es un concepto de
 * `inventario` y lo unico que este modulo guarda de el es su identificador.
 */

/**
 * Condiciones comerciales de la linea: lo UNICO que la edicion reemplaza (R33). Que sea
 * un tipo propio y no `Partial<NewCatalogLine>` es deliberado: el puerto de edicion no
 * puede ni siquiera expresar un cambio de proveedor o de producto.
 *
 * `cost` y `minPurchase` son CADENA decimal, no `number` (`design.md > 6.2`): el dominio
 * no importa `@prisma/client` y el binario de coma flotante esta prohibido para importes.
 * La conversion a `Prisma.Decimal` es del adaptador driven.
 */
export type CatalogLineTerms = {
  readonly cost: string;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
};

/** Alta de una linea: sus condiciones comerciales mas la pareja que la identifica. */
export type NewCatalogLine = CatalogLineTerms & {
  readonly supplierId: string;
  readonly productId: ProductId;
};

/**
 * Salida de una consulta del catalogo (`design.md > 6.2`).
 *
 * `productName` es `string | null` a proposito (R37, `design.md > 5.3`): lo resuelve el
 * caso de uso con UNA sola llamada a `ProductCatalog.findRefs` para toda la pagina, y un
 * producto dado de baja simplemente no vuelve de ahi. La linea SIGUE apareciendo con el
 * nombre en `null`: darla por desaparecida seria perder el precio pactado de un producto
 * que solo esta descatalogado.
 */
export type CatalogLineView = {
  readonly id: string;
  readonly supplierId: string;
  readonly productId: ProductId;
  readonly productName: string | null;
  readonly cost: string;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};
