// lib/modules/unidades/domain/unit-catalog.ts
/** Identificador de una unidad visto DESDE FUERA de `unidades`. Es lo unico que otro modulo
 *  guarda de una unidad (p. ej. `products.unit_id`, `recipe_lines.unit_id`). */
export type UnitId = string;

/** Lo que otro modulo puede saber de una unidad sin tocar su tabla. `symbol` es `null` cuando la
 *  unidad no lo declara (R3): quien la pinte muestra el nombre. */
export type UnitRef = {
  readonly id: UnitId;
  readonly name: string;
  readonly symbol: string | null;
};

/** Servicio que `unidades` ofrece a los demas modulos (`docs/architecture.md > Dominio` n.o 2:
 *  «se comparten servicios via interfaz, nunca repositorios ni tablas»). Lo implementa un
 *  adaptador driven DE UNIDADES —el unico que puede tocar `prisma.unit`— y lo cablea
 *  `lib/composition`. Esta ficha NO lo implementa: lo consume `recetas` (`create-recipe.ts`,
 *  `update-recipe.ts`, via `deps.units.findRefs`, QC-25/R50). */
export interface UnitCatalog {
  /** Referencias de las unidades existentes entre los ids pedidos. Los ids que no existan
   *  simplemente no vienen en la respuesta. */
  findRefs(ids: readonly UnitId[]): Promise<readonly UnitRef[]>;
}
