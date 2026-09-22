// lib/modules/identity/ports/role-catalog-repository.ts
/**
 * QC-94 T3 — Puerto de SOLO LECTURA del catalogo de roles (`design.md > 4.2`).
 *
 * Dos propiedades de este puerto son el requisito, no un estilo:
 *
 *   1. **`listAll()` no recibe NADA, y en particular no recibe empresa.** El catalogo es GLOBAL
 *      —`Role` no tiene columna de empresa (decision cerrada 1)—, asi que filtrar por ella no es
 *      expresable a traves de este puerto ni por accidente (R11). Tampoco recibe pagina, tamano,
 *      texto de busqueda ni orden: el catalogo es cerrado y corto y se devuelve entero (R12), sin
 *      pasar por el contrato de listado de QC-57.
 *   2. **Ningun metodo de escritura** (R17): crear, editar o borrar roles no se puede expresar
 *      aqui. El catalogo solo cambia por migracion y seed, como QC-4 lo dejo.
* 3. **El rol administrador NO se devuelve** (fix directo, 2026-09-22): el catalogo que sale de
 *    aqui es el que puede ofrecer el select de usuarios, y el rol administrador no se concede
 *    por esa via. La exclusion es de la implementacion (`listAllRoles`, que la hace por nombre
 *    y de forma invisible para este puerto); este contrato declara la intencion.
 *
 * El orden lo pone la IMPLEMENTACION, con el `ORDER BY` de la base (R10, `design.md > 4.3`): tiene
 * que haber UN solo sitio que ordene, y el dominio no reordena lo que recibe.
 *
 * Puerto puro (R16): solo importa tipos del propio `domain/` por ruta RELATIVA —nunca el barrel
 * `@/lib/modules/identity`, que crearia un ciclo del modulo consigo mismo—.
 */

import type { RoleOption } from '../domain/role-view';

export interface RoleCatalogRepository {
  /** Los roles seleccionables del catalogo, ordenados por nombre ascendente; SIN el administrador
   * (R8, R10; fix directo 2026-09-22). */
  listAll(): Promise<readonly RoleOption[]>;
}
