/**
 * Puerto de lectura/escritura del seed arrancador (`design.md > 6.2`). Deliberadamente NO
 * expone `update`, `updateMany` ni `upsert`: el algoritmo del dominio solo LEE que falta y
 * CREA exactamente eso. Un `upsert` pisaria el simbolo de una unidad que alguien haya
 * cambiado a mano, y R26 lo prohibe — asi que ni siquiera existe el metodo con el que
 * hacerlo.
 *
 * La lectura va por NOMBRE NORMALIZADO, no por nombre: si alguien renombro «litro» a
 * «Litro», el seed no crea un duplicado y no lo toca (R26).
 */
export interface UnitSeedRepository {
  /**
   * De los nombres normalizados pedidos, devuelve los que YA existen en el catalogo. Los
   * que no existan simplemente no vienen en la respuesta.
   */
  findExistingNormalizedNames(normalizedNames: readonly string[]): Promise<readonly string[]>;

  /**
   * Crea una unidad. `symbol` es `null` cuando la unidad no declara simbolo (R3): la
   * ausencia se guarda como ausencia, nunca como cadena vacia.
   *
   * Sin `catch` de la carrera a proposito (`design.md > 6.2`): si dos seeds simultaneos
   * intentan crear la misma unidad, el indice unico `units_name_normalized_key` hace fallar
   * a uno con `23505`, y ese es el comportamiento correcto para un comando de instalacion
   * que se corre a mano. No se anade logica de reintento.
   */
  createUnit(unit: {
    name: string;
    nameNormalized: string;
    symbol: string | null;
  }): Promise<void>;
}
