import type { Page } from './page';

/** Lo que otro modulo puede saber de un cliente. Sin ciudad, telefono, correo ni direccion: un
 *  pedido no los necesita y no deben salir de `clientes`. */
export type CustomerRef = {
  readonly id: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly isDeleted: boolean;
};

export type CustomerRefSearch = {
  /** `''` = sin busqueda. */
  readonly search: string;
  /** Si entran los dados de baja: solo quien filtra un listado los necesita. */
  readonly includeDeleted: boolean;
  /** Desde 1. */
  readonly page: number;
  /** Defecto 10 y tope 25, que aplica el adaptador. */
  readonly pageSize?: number;
};

/**
 * Servicio de solo lectura que `clientes` ofrece a los demas modulos. No comprueba permisos:
 * autoriza el caso de uso que lo llama.
 *
 * Recibe `companyId` como cadena y no `CustomerScope`: ese tipo es interno del modulo, y
 * publicarlo para que otro modulo lo construya acoplaria a los dos por un dato que ya es una
 * cadena en ambos lados.
 */
export interface CustomerCatalog {
  /** Incluidos los dados de baja (`isDeleted: true`). Un id de otra empresa o inexistente no vuelve. */
  findRefsIncludingDeleted(ids: readonly string[], companyId: string): Promise<readonly CustomerRef[]>;
  /** `null` = no existe, esta dado de baja o es de otra empresa. */
  findAliveRefById(id: string, companyId: string): Promise<CustomerRef | null>;
  /** Orden apellidos, nombres, id. Busca por palabra normalizada en nombres, apellidos y ciudad. */
  searchRefs(query: CustomerRefSearch, companyId: string): Promise<Page<CustomerRef>>;
}
