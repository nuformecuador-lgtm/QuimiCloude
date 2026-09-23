import type { UnitId } from '@/lib/modules/unidades';

/**
 * Contratos de entrada y salida de producto (`design.md > 6.1`, `> 3`). Viven en
 * `domain/` -no en `ports/`- porque describen el QUE se dice, no el COMO se habla con el
 * mundo: eso es dominio, y es lo que el contrato publico (`index.ts`) puede reexportar
 * (solo reexporta de `./domain`).
 */

/** Tipo de producto: PRODUCT, MACHINE o PACKAGING. */
export type ProductType = 'PRODUCT' | 'MACHINE' | 'PACKAGING';

/**
 * Datos de negocio de un producto, ya validados por `product-input.ts` (`design.md >
 * 6.1`, `7`).
 *
 * QC-52 (R1, R2): sin `cost`, `minPurchase` ni `deliveryTime` -son del catalogo del
 * proveedor-. 2026-09-09: sin `presentationId` -la presentacion se mudo al lote
 * (`ProductBatch`)-. QC-80 (R21): sin `unitId` -la unidad la declara la PRESENTACION, y la
 * del producto se DERIVA del lote mas reciente; no hay nada que escribir aqui-. La existencia
 * se quito: se escribe unicamente en el lote que crea el alta. Lo que queda es lo que la
 * cosa ES (`name`) y su alerta (`qtyAlert`).
 */
export type NewProduct = {
  readonly name: string;
  readonly qtyAlert?: string | null;
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
  /** Existencia guardada en `products.stock`: la suma de los lotes en la unidad del producto,
   *  con sus cuatro decimales. */
  readonly stock: string;
  /** Unidad guardada en `products.unit_id`, o `null` si el producto todavia no tiene lotes. */
  readonly unitId: UnitId | null;
  readonly qtyAlert: string | null;
  /** Tipo del producto: PRODUCT, MACHINE o PACKAGING. */
  readonly type: ProductType;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Suma de lo apartado en los lotes vivos del producto. Opcional: solo lo rellena
   *  `listAliveProducts`, con una consulta agregada por pagina; las demas lecturas no la traen. */
  readonly reserved?: string;
  /** Suma de lo disponible en los lotes vivos del producto. Misma condicion que `reserved`. */
  readonly available?: string;
};
