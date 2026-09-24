/**
 * Contrato de salida de presentacion (`design.md > 6.2`, `> 3`). Vive en `domain/` -no en
 * `ports/`- por la misma razon que `product-view.ts`: es el QUE se dice, no el COMO se
 * habla con el mundo, y es lo que el contrato publico (`index.ts`) puede reexportar.
 */

/**
 * Salida de una consulta de presentacion (`design.md > 6.2`). `nameNormalized` viaja
 * junto al `name` porque las dos se mantienen sincronizadas en toda escritura (R17).
 */
export type PresentationView = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  /** QC-80 (R15): la unidad de la presentacion, `NOT NULL` en base y por tanto nunca
   *  nula aqui. Es el identificador de una fila de `units`; el contrato NO resuelve su
   *  nombre ni su simbolo -eso es del catalogo de `unidades`, otro modulo-. La edicion
   *  precarga la unidad elegida a partir de este campo. */
  readonly unitId: string;
  /** R6, R8: lo que cabe en un envase, en la unidad de arriba. `null` = sin declarar.
   *  Cadena decimal con los 4 decimales de `DECIMAL(14,4)`, nunca `number` (R8, `design.md > 4.2`). */
  readonly content: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
