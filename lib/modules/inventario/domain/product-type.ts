/**
 * Catalogo cerrado de tipos de producto. **Fuente unica**: el valor de cada tipo
 * se declara una sola vez aqui y el resto del codigo -zod, dominio, actions,
 * UI, tests- lo referencia como `PRODUCT_TYPES.<TIPO>`, nunca como literal suelto.
 *
 * Espejo del enum Postgres `ProductType` (`db/schema.prisma`, migracion
 * `20260922150000_product_type_enum`). Si anade un valor alla, hay que anadirlo
 * aqui (y revisar las uniones discriminadas de `product-input.ts`).
 *
 * `Object.freeze` + `as const`: inmutable en tiempo de ejecucion y en tipos.
 */
export const PRODUCT_TYPES = Object.freeze({
  PRODUCT: 'PRODUCT',
  MACHINE: 'MACHINE',
  PACKAGING: 'PACKAGING',
  FINISHED_PRODUCT: 'FINISHED_PRODUCT',
} as const);

/** Union tipada derivada del catalogo: anadir un valor aqui obliga a revisar usos. */
export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

/**
 * Valores en orden de presentacion (select de tipo, pestanas del listado).
 * Derivado del catalogo para que no pueda divergir de `PRODUCT_TYPES`.
 */
export const PRODUCT_TYPE_VALUES = [
  PRODUCT_TYPES.PRODUCT,
  PRODUCT_TYPES.MACHINE,
  PRODUCT_TYPES.PACKAGING,
  PRODUCT_TYPES.FINISHED_PRODUCT,
] as const satisfies readonly ProductType[];

/**
 * Los tipos que se pueden elegir en el alta y la edicion manuales: sin `FINISHED_PRODUCT`, que
 * solo nace al finalizar un pedido.
 */
export const MANUAL_PRODUCT_TYPE_VALUES = [
  PRODUCT_TYPES.PRODUCT,
  PRODUCT_TYPES.MACHINE,
  PRODUCT_TYPES.PACKAGING,
] as const satisfies readonly ProductType[];
