import type { RecipeStepDocument } from './recipe-input';

/**
 * Contratos de salida de receta (`design.md > 7.2`). Viven en `domain/` -no en `ports/`-
 * porque describen el QUE se dice, no el COMO se habla con el mundo: es lo que el
 * contrato publico (`index.ts`) puede reexportar (solo reexporta de `./domain`).
 */

/**
 * Elemento de la LISTA (D14, R33): SIN lineas. `imageUrl` ya viene compuesta -nunca la
 * ruta cruda- (R24), y `createdBy`/`updatedBy` son IDENTIFICADORES, nunca nombres (R34):
 * este modulo no resuelve autores.
 */
export type RecipeSummary = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly stepCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};

/**
 * Linea de producto tal como sale en el DETALLE (R33). `productName` sale de
 * `ProductCatalog.findRefs` (`design.md > 6`), y es `null` cuando el producto esta
 * borrado logicamente (R18): la linea se conserva igual. `quantity` sigue siendo cadena
 * -mismo criterio que en el borde (`design.md > 2`)-. `unitId` es la REFERENCIA al
 * catalogo de `unidades` (R50): este modulo no resuelve nombre ni simbolo, solo pasa el
 * identificador tal cual.
 */
export type RecipeLineView = {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: string;
  readonly unitId: string;
};

/** Detalle de una receta (D14, R33): el resumen mas los pasos y las lineas completas. */
/**
 * Un paso tal y como sale del detalle: EL MISMO DOCUMENTO que entra (QC-62 R10,
 * `design.md > 2`). Entrada y salida comparten forma porque el paso no tiene ningun campo que
 * nazca en el servidor -ni id, ni orden derivado (R16)-, y se declara como ALIAS, no como
 * copia: dos definiciones que hay que mantener sincronizadas a mano se desincronizan.
 *
 * No sale ningun dato DERIVADO del documento -en particular, ninguna marca de "este paso lleva
 * lista de verificacion"-: quien lo necesite lo deduce de los propios bloques (R10).
 */
export type RecipeStepView = RecipeStepDocument;

export type RecipeDetail = RecipeSummary & {
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly RecipeLineView[];
};
