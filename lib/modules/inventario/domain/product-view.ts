import type { UnitId } from '@/lib/modules/unidades';

/**
 * Contratos de entrada y salida de producto (`design.md > 6.1`, `> 3`). Viven en
 * `domain/` -no en `ports/`- porque describen el QUE se dice, no el COMO se habla con el
 * mundo: eso es dominio, y es lo que el contrato publico (`index.ts`) puede reexportar
 * (solo reexporta de `./domain`).
 */

/**
 * Datos de negocio de un producto, ya validados por `product-input.ts` (`design.md >
 * 6.1`, `7`).
 *
 * QC-52 (R1, R2): sin `cost`, `minPurchase` ni `deliveryTime` -son del catalogo del
 * proveedor-. 2026-09-09: sin `presentationId` -la presentacion se mudo al lote
 * (`ProductBatch`)-. Lo que queda es lo que la cosa ES (`name`, `unitId`) y lo que HAY de
 * ella (`stock`, `qtyAlert`), con la misma forma y la misma opcionalidad de antes.
 */
export type NewProduct = {
  readonly name: string;
  readonly stock?: number | null;
  readonly qtyAlert?: number | null;
  readonly unitId?: UnitId | null;
};

/**
 * Salida de una consulta de producto (`design.md > 6.1`). Sin `createdBy`/`updatedBy` ni
 * `presentationId`/`presentationName` desde el 2026-09-09: la autoria y la presentacion se
 * mudaron a `ProductBatch` (el lote), asi que el producto -catalogo- ya no expone quien lo
 * creo/edito ni en que presentacion viene.
 */
export type ProductView = {
  readonly id: string;
  readonly name: string;
  /**
   * Ruta de la imagen del producto, o `null` si no tiene (2026-09-07).
   *
   * Es la RUTA guardada en `products.image_path`, tal cual: este modulo no compone URL publica
   * -no tiene puerto de almacenamiento, a diferencia de `recetas`- y no inventa ninguna. Quien
   * pinta decide que hacer con ella; hoy la pantalla cae al marcador cuando es `null` y cuando
   * la ruta no resuelve.
   *
   * Sigue SIN ordenarse ni filtrarse (`PRODUCT_QUERYABLE`): no se ordena por una ruta de archivo.
   */
  readonly imagePath: string | null;
  readonly stock: number | null;
  readonly qtyAlert: number | null;
  readonly unitId: UnitId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
