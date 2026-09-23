/** En tipos del dominio y no de Prisma: convertir es del adaptador driven. */
export type NewProductBatch = {
  readonly presentationId: string;

  readonly stock: string;

  readonly unitCost: string;

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
