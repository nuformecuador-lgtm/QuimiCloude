/**
 * El lote que el alta escribe en `product_batches` (`design.md > 6`).
 *
 * Es el tipo con el que el caso de uso le habla al puerto, asi que esta escrito en el
 * lenguaje del DOMINIO y no en el de Prisma: aqui no hay `Prisma.Decimal` ni `Date`.
 * Convertir es del adaptador driven, que es el unico del modulo que importa `@prisma/client`
 * (`docs/architecture.md > La regla de dependencias`).
 */
export type NewProductBatch = {
  /** Presentacion del lote (R2). Obligatoria: la columna es NOT NULL con FK `RESTRICT`. */
  readonly presentationId: string;

  /** Existencia del lote. `0` es valido y no rechaza el alta (R3): el `CHECK` es `>= 0`. */
  readonly stock: number;

  /**
   * Costo unitario como CADENA decimal, nunca como numero de coma flotante (R4, R6, R7). Si
   * el alta solo trajo el total, aqui llega ya el derivado por `deriveUnitCost`.
   */
  readonly unitCost: string;

  /**
   * Lote, ya recortado (R14). `null` significa «no vino: que lo genere el backend» (QC-81 R8),
   * NO «este lote se queda sin valor»: desde QC-81 la columna es NOT NULL, con un `CHECK` contra
   * el blanco y unica por empresa. El correlativo lo calcula el ADAPTADOR, dentro de la misma
   * transaccion que escribe (`design.md > 3.1`): el dominio no consulta la base y un «pide el
   * numero y luego escribe» partido en dos viajes dejaria abierta la carrera. Un string es el lote
   * escrito a mano y se guarda tal cual (QC-81 R10).
   */
  readonly lot: string | null;

  /**
   * Fecha de compra como fecha CIVIL `YYYY-MM-DD` (QC-81 R1, R3). OBLIGATORIA y YA RESUELTA: si el
   * alta no la trajo, el caso de uso pone aqui «hoy» a partir del mismo instante que usa para
   * `created_at` (R2), y si era futura ya la rechazo (R4). Por eso no admite `null`: el puerto no
   * tiene que decidir nada sobre ella. Viaja como texto por la misma razon que `expiryDate`: la
   * conversion a la `@db.Date` es del adaptador.
   */
  readonly purchaseDate: string;

  /**
   * Fecha de expiracion como fecha CIVIL `YYYY-MM-DD`, no como instante (R13). Viajar como
   * texto es lo que impide el corrimiento de dia por zona horaria: quien la convierte a la
   * `@db.Date` es el adaptador. `null` cuando no se escribio (R12).
   */
  readonly expiryDate: string | null;

  /** Actor de la sesion (R22). Se escribe tambien en `updated_by` al crear. */
  readonly createdBy: string;
};
