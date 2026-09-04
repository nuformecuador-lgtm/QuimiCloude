import type { UnitRef } from '../domain/unit-catalog';

/**
 * Puerto de lectura del catalogo completo de unidades (`design.md > 9`, R40). A
 * diferencia de `UnitCatalog['findRefs']` -que resuelve ids conocidos para otros
 * modulos-, este puerto LISTA el catalogo entero para el unico adaptador driving de
 * `unidades`. `listAll` recibe siempre un `limit`: ninguna consulta sin cota (R40).
 */
export interface UnitRepository {
  listAll(limit: number): Promise<readonly UnitRef[]>;
}
