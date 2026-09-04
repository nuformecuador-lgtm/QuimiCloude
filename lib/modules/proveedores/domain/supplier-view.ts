/**
 * Contratos de entrada y salida del proveedor (`design.md > 6.1`, `> 7`). Viven en
 * `domain/` -no en `ports/`- porque describen el QUE se dice, no el COMO se habla con el
 * mundo, y es lo unico que el contrato publico (`index.ts`) puede reexportar.
 */

/**
 * Datos de negocio de un proveedor, ya validados por `supplier-input.ts` y listos para el
 * puerto. `nameNormalized` viaja AQUI, calculado por el caso de uso con
 * `normalizeSupplierName`, y no lo recalcula el adaptador: R16 exige que las dos formas se
 * escriban juntas en toda escritura, y ponerlo en el puerto es lo que permite demostrarlo
 * con un doble, sin base de datos.
 *
 * `phone` y `email` son `string | null` -nunca `undefined` ni cadena vacia-: el borde ya
 * convirtio el blanco en ausencia (R13, `blankToNull`).
 */
export type NewSupplier = {
  readonly name: string;
  readonly nameNormalized: string;
  readonly phone: string | null;
  readonly email: string | null;
};

/**
 * Salida de una consulta de proveedor (`design.md > 6.1`). `createdBy`/`updatedBy` son
 * IDENTIFICADORES, no nombres (mismo criterio que QC-20 D20): este modulo no consulta el
 * modelo `User`. Quien necesite el nombre del autor lo pide al contrato de `identity`, y
 * eso es QC-44.
 *
 * `deletedAt` NO sale: toda consulta excluye los dados de baja (R22), asi que seria
 * siempre `null` y solo invitaria a filtrar en memoria lo que ya filtro el puerto.
 */
export type SupplierView = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};
