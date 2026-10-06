/**
 * La formula de un producto terminado se resuelve en `recetas`, que ya importa el contrato de
 * `inventario`: el dominio de `inventario` no puede importar el de `recetas` sin cerrar un ciclo.
 * `inventario` declara el hueco y `lib/composition` lo ata.
 */
export interface ImportFormulaLookup {
  /** Formula ORIGINAL VIVA de la empresa con ese nombre normalizado, o `null`. */
  findAliveOriginalByName(name: string, companyId: string): Promise<{ id: string; name: string } | null>;
}
