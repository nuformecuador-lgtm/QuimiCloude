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
  /** Unidad de la que deriva, o `null` si esta ES una unidad base. Va SIEMPRE junto a `factor`:
   *  los dos o ninguno (R2 de `convert-quantity.ts`). Publicarlo es lo que permite a quien
   *  pinta saber que dos unidades pertenecen al mismo grupo -misma base efectiva
   *  (`baseUnitId ?? id`)- sin tocar la tabla ni repetir el criterio de convertibilidad. */
  readonly baseUnitId: UnitId | null;
  /** Cuantas unidades de la apuntada caben en una de esta, o `null` si es base -que equivale a
   *  `1`-. Viaja como TEXTO, nunca `number`: es un `decimal(14,4)` y no cabe en coma flotante
   *  sin riesgo de redondeo, el mismo criterio que `UnitConversion['factor']`. */
  readonly factor: string | null;
};

/** Servicio que `unidades` ofrece a los demas modulos (`docs/architecture.md > Dominio` n.o 2:
 *  «se comparten servicios via interfaz, nunca repositorios ni tablas»). Lo implementa un
 *  adaptador driven DE UNIDADES —el unico que puede tocar `prisma.unit`— y lo cablea
 *  `lib/composition`. Esta ficha NO lo implementa: lo consume `recetas` (`create-recipe.ts`,
 *  `update-recipe.ts`, via `deps.units.findRefs`, QC-25/R50). */
export interface UnitCatalog {
  /** Referencias de las unidades existentes entre los ids pedidos, de la empresa dada O DE
   *  SISTEMA -las de sistema valen para todas las empresas-. Los ids que no existan o sean
   *  de OTRA empresa simplemente no vienen en la respuesta.
   *
   *  Recibe `companyId` como cadena suelta y no como un tipo de ambito propio de
   *  `unidades`: ese tipo es interno del modulo, y publicarlo por el barrel para que el
   *  llamante lo construya acoplaria dos modulos por un dato que ya es una cadena en los
   *  dos lados. Que el ambito viva en la firma es lo que hace que una llamada que lo omita
   *  no compile. */
  findRefs(ids: readonly UnitId[], companyId: string): Promise<readonly UnitRef[]>;

  /**
   * Las unidades VISIBLES para esa empresa -propias o de sistema- cuya base efectiva
   * (`baseUnitId ?? id`) coincide con la de alguna de `unitIds`. Sirve para poblar un selector
   * de unidades hermanas: quien lo llama agrupa en memoria y descarta la propia unidad de cada
   * linea.
   */
  findRefsSharingBaseInCompany(
    companyId: string,
    unitIds: readonly UnitId[],
  ): Promise<readonly UnitRef[]>;
}
