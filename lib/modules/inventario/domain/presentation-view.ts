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
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
