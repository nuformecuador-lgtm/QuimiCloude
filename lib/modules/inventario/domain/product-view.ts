/**
 * Contratos de entrada y salida de producto (`design.md > 6.1`, `> 3`). Viven en
 * `domain/` -no en `ports/`- porque describen el QUE se dice, no el COMO se habla con el
 * mundo: eso es dominio, y es lo que el contrato publico (`index.ts`) puede reexportar
 * (solo reexporta de `./domain`).
 */

/**
 * Datos de negocio de un producto, ya validados por `product-input.ts` (`design.md >
 * 6.1`, `7`). `cost` sigue siendo cadena aqui: la conversion a `Prisma.Decimal` es del
 * adaptador driven (R31, el dominio no importa `@prisma/client`).
 */
export type NewProduct = {
  readonly name: string;
  readonly presentationId: string;
  readonly stock?: number | null;
  readonly cost?: string | null;
  readonly minPurchase: number;
  readonly deliveryTime?: number | null;
  readonly qtyAlert?: number | null;
  readonly unit?: string | null;
};

/**
 * Salida de una consulta de producto (`design.md > 6.1`). `createdBy`/`updatedBy` son
 * IDENTIFICADORES, no nombres (D20, R8): este modulo no consulta el modelo `User` ni
 * resuelve ningun nombre de autor.
 */
export type ProductView = {
  readonly id: string;
  readonly name: string;
  readonly presentationId: string;
  readonly presentationName: string;
  readonly stock: number | null;
  readonly cost: string | null;
  readonly minPurchase: number;
  readonly deliveryTime: number | null;
  readonly qtyAlert: number | null;
  readonly unit: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};
