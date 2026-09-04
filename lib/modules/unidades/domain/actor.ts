import { UnauthorizedError } from './errors';

/**
 * Nombre del rol con permiso sobre la lectura del catalogo de unidades (`design.md > 9`,
 * pregunta 4 cerrada el 2026-09-03): solo Administrador.
 *
 * Propia de `unidades`, NO importada del barrel de `inventario`: ese import seria un
 * VALOR en ejecucion, y el centinela de `tests/unit/inventario/schema/inventario-schema.test.ts`
 * exige `import type` para todo uso del barrel de `inventario` fuera de
 * `lib/composition/`. `recetas` ya resolvio esto igual (`lib/modules/recetas/domain/actor.ts`):
 * es un cuarto literal del mismo rol, deuda consciente y de una linea, no abierta por esta
 * ficha.
 */
export const ADMIN_ROLE_NAME = 'Administrador';

/** Actor de entrada del caso de uso (R41): id y rol, nada mas. */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea del caso de uso de listado (R41). Falla cerrado: actor ausente, rol nulo,
 * vacio o distinto de `ADMIN_ROLE_NAME` se rechazan igual, todos con el mismo error de
 * autorizacion, y ANTES de tocar el repositorio.
 *
 * La comparacion es de igualdad exacta, sin `includes` ni normalizacion: un rol llamado
 * "Administradores externos" no debe colarse.
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ADMIN_ROLE_NAME) {
    throw new UnauthorizedError();
  }
}
