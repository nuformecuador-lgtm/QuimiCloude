/**
 * Puerto de ESCRITURA del modulo `unidades` (`design.md > 5`). No se amplia
 * `ports/unit-repository.ts` -ese es el puerto de LECTURA del listado, construido alrededor de
 * `UnitScope`, y mezclarle los cinco metodos de aqui obligaria a cada doble de test del listado
 * a implementar metodos que no usa (`design.md > 9`, alternativa A). Dos puertos separados, dos
 * invariantes separadas.
 */

/** Lo minimo que el service necesita saber de una fila para decidir (§6.2, §6.4). */
export type UnitOwnership = {
  readonly id: string
  /** `null` = de sistema. */
  readonly companyId: string | null
  /** `null` = unidad base -no deriva de ninguna otra-. */
  readonly baseUnitId: string | null
}

/**
 * La fila que el service entrega al puerto para crear o editar. `companyId` NO vive aqui a
 * proposito (R7, R19): sacarlo de este tipo es lo que hace que
 * - `create` necesite la empresa como argumento APARTE y una llamada que la olvide no compile
 *   (en vez de crear una unidad de sistema en silencio), y
 * - el `UPDATE` de `update` no pueda tocar la columna de empresa, porque el dato ni siquiera
 *   esta en la fila que se le pasa.
 *
 * `factor` es `string | null`: decimal como cadena (§3.1), nunca `number`.
 */
export type UnitWriteRow = {
  readonly name: string
  readonly nameNormalized: string
  readonly symbol: string | null
  readonly baseUnitId: string | null
  readonly factor: string | null
}

export type WriteOutcome = 'ok' | 'not_found' | 'duplicate_name' | 'duplicate_symbol'

/**
 * Resultados DISCRIMINADOS, nunca una excepcion de Prisma cruzando la frontera -mismo contrato
 * que `PresentationRepository` de `inventario`-. El adaptador driven (T8) traduce `P2002`
 * (segun el indice de `meta.target`) y `P2003` a estos literales; cualquier otro fallo se
 * relanza sin disfrazarse de uno de estos.
 */
export interface UnitWriteRepository {
  /**
   * Lo que el service necesita de una fila -de la unidad que se edita/borra, o de la unidad
   * base declarada- para decidir sin ambiguedad entre "no existe", "es de sistema" y "es de
   * otra empresa": la comparacion de ambito la hace el SERVICE, no este metodo (`design.md >
   * 7`: un `where` que fundiera los dos casos devolveria `null` para ambos y perderia R21).
   */
  findOwnership(id: string): Promise<UnitOwnership | null>
  /** ¿Alguna otra unidad declara a esta como su base? (R15: "ya soy base de alguien"). */
  hasDerivedUnits(id: string): Promise<boolean>
  /**
   * `companyId` es un argumento PROPIO y OBLIGATORIO, fuera de `UnitWriteRow` (R7): una
   * llamada que se olvide de la empresa no compila.
   */
  create(
    companyId: string,
    row: UnitWriteRow,
  ): Promise<{ id: string } | 'duplicate_name' | 'duplicate_symbol'>
  /** `UnitWriteRow` no lleva `companyId` (R19): el `UPDATE` no puede cambiar la empresa de la fila
   *  porque el tipo que recibe no la trae. */
  update(id: string, row: UnitWriteRow): Promise<WriteOutcome>
  /** Fisico, no logico (R23): `units` no tiene `deleted_at`. `'in_use'` es el `ON DELETE
   *  RESTRICT` de `products`, `recipe_lines` o de otra `units` que deriva de esta (R24). */
  deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>
}
