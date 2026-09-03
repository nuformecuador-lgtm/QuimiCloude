import { UnauthorizedError } from './errors';

/**
 * Nombre del rol con permiso sobre las recetas (D1; `design.md > 4`): solo Administrador,
 * y para los cinco casos de uso -incluidos listar y ver el detalle (R2).
 *
 * Propia de `recetas`, NO importada de `identity`: los roles son dominio de `identity`,
 * pero su contrato publico (`@/lib/modules/identity`) todavia no exporta ninguna
 * constante de rol. Cuando la exponga, esta constante se borra y se importa del barrel
 * `@/lib/modules/identity` -nunca por ruta profunda-. Duplicar el literal hoy es deuda
 * consciente y de una linea, igual que `inventario` (QC-20 D23).
 */
export const ADMIN_ROLE_NAME = 'Administrador';

/** Actor de entrada de cada caso de uso (R1): id y rol, nada mas. */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea de los cinco casos de uso (R2, R3). Falla cerrado: actor ausente, rol
 * nulo, vacio o distinto de `ADMIN_ROLE_NAME` se rechazan igual, todos con el mismo
 * error de autorizacion, y ANTES de tocar cualquier puerto -repositorio, catalogo de
 * productos o almacenamiento de imagenes-.
 *
 * La comparacion es de igualdad exacta, sin `includes` ni normalizacion (R3): un rol
 * llamado "Administradores externos" no debe colarse.
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ADMIN_ROLE_NAME) {
    throw new UnauthorizedError();
  }
}
