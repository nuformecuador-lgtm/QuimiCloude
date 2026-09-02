import { UnauthorizedError } from './errors';

/**
 * Nombre del rol con permiso sobre el catalogo (D2, D23; `design.md > 4`).
 *
 * Propia de `inventario`, NO importada de `identity`: los roles son dominio de
 * `identity`, pero su contrato publico (`@/lib/modules/identity`) todavia no exporta
 * ninguna constante de rol (QC-6 sigue `spec_ready`). Cuando la exponga, esta constante
 * se borra y se importa del barrel `@/lib/modules/identity` -nunca por ruta profunda-.
 * Duplicar el literal hoy es deuda consciente y de una linea (D23).
 */
export const ADMIN_ROLE_NAME = 'Administrador';

/** Actor de entrada de cada caso de uso (R1): id y rol, nada mas. */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea de los nueve casos de uso (R2, R3). Falla cerrado: actor ausente, rol
 * nulo, vacio o distinto de `ADMIN_ROLE_NAME` se rechazan igual, todos con el mismo
 * error de autorizacion, y ANTES de tocar cualquier puerto.
 *
 * La comparacion es de igualdad exacta, sin `includes` ni normalizacion (R3): un rol
 * llamado "Administradores externos" no debe colarse.
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ADMIN_ROLE_NAME) {
    throw new UnauthorizedError();
  }
}
