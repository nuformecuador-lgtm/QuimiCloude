// lib/modules/identity/domain/list-roles.ts
import { requireAnyPermission, type Actor } from './actor';

import type { RoleOption } from './role-view';

import type { RoleCatalogRepository } from '../ports/role-catalog-repository';

export type ListRolesDeps = { readonly roles: RoleCatalogRepository };

/**
 * QC-94 T4 — La consulta del catalogo de roles (`design.md > 3.2`). Es la pieza que le falta a
 * QC-67 para pintar el selector de rol.
 *
 * Dos lineas, y las dos en ESTE orden, que es el requisito:
 *
 *   1. `requireAnyPermission(actor, ['usuarios.consultar', 'usuarios.modificar'])` PRIMERO, antes
 *      de tocar el puerto (R1). Basta CUALQUIERA de los dos —quien entra a la pantalla de QC-67
 *      tiene `consultar`, quien abre el formulario de alta tiene `modificar`— y no se exigen los
 *      dos ni se deriva uno del otro (R3). Falla cerrado (R2).
 *   2. el puerto, SIN ningun argumento.
 *
 * Lo que NO hace, y tambien es el requisito:
 *
 *   - **No recibe ningun argumento ademas del actor** (R12): ni pagina, ni tamano, ni busqueda, ni
 *     orden. El catalogo es cerrado y corto y se devuelve entero.
 *   - **No usa `actor.companyId`** (R11). El `Actor` la trae porque es el mismo tipo que los seis
 *     casos de uso de QC-66, pero el catalogo es GLOBAL y la empresa no entra en ningun `where`:
 *     dos actores de empresas distintas reciben lo mismo.
 *   - **No reordena ni recorta** lo que devuelve el puerto (R8, R10): ordena la base, en un solo
 *     sitio (`design.md > 8.2`).
 *   - **No mira el ROL de quien pide** (R4): `Actor` no tiene campo de rol desde QC-66.
 *   - **No lee sesion, cookie ni cabecera** (R5): el actor entra por parametro y lo construye el
 *     adaptador driving.
 */
export function createListRoles(
  deps: ListRolesDeps,
): (actor: Actor | null | undefined) => Promise<readonly RoleOption[]> {
  return async function listRoles(actor: Actor | null | undefined): Promise<readonly RoleOption[]> {
    requireAnyPermission(actor, ['usuarios.consultar', 'usuarios.modificar']);

    return deps.roles.listAll();
  };
}
