/** En tipos del dominio y no de Prisma: convertir es del adaptador driven. */
export type NewProductBatch = {
  /**
   * `null` solo cuando el tipo es MACHINE (2026-09-23): el producto nace sin unidad y el
   * lote sin presentacion. PRODUCT y PACKAGING la siguen exigiendo en el borde.
   */
  readonly presentationId: string | null;

  readonly stock: number;

  /** `null` solo para MACHINE sin costo en el borde; PRODUCT y PACKAGING la exigen. */
  readonly unitCost: string | null;

  /**
   * `null` significa «que lo genere el backend». El correlativo lo calcula el adaptador dentro de
   * la transaccion que escribe: pedir el numero y escribir en dos viajes dejaria abierta la carrera.
   */
  readonly lot: string | null;

  /**
   * Ya resuelta por el caso de uso con el mismo reloj que `created_at`. Viaja como texto y la
   * convierte el adaptador.
   */
  readonly purchaseDate: string;

  /** Viaja como texto para evitar el corrimiento de dia por zona horaria; la convierte el adaptador. */
  readonly expiryDate: string | null;

  readonly createdBy: string;
};
