// El nombre del rol sale del CONTRATO PUBLICO de `identity`, que es su dueno
// (`design.md > 3`, P1): `lib/modules/identity/domain/roles.ts` dice ser «el UNICO sitio
// del repo que escribe a mano los literales» y su barrel ya lo exporta. `proveedores` NO
// declara ninguna constante propia de rol (R4) y NO lo toma de `inventario`: un rol es un
// concepto de `identity`, no de un modulo de negocio.
//
// Barrel, NUNCA ruta profunda (`docs/architecture.md > La regla de dependencias`).
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/** Actor de entrada de cada uno de los nueve casos de uso (R1): id y rol, nada mas. */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea de los nueve casos de uso (R2, R3): antes de `zod` y antes de tocar
 * ningun puerto. Falla cerrado: actor ausente, rol nulo, vacio o desconocido se rechazan
 * igual, todos con el mismo error de autorizacion.
 *
 * La comparacion es de igualdad EXACTA, sin `includes` ni normalizacion (R3): un rol
 * llamado «Administradores externos» no debe colarse.
 *
 * Consultar tambien pasa por aqui (decision cerrada 1): la lista, la ficha y el listado
 * del catalogo llaman a `requireAdmin` igual que las mutaciones.
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ROLE_ADMINISTRADOR) {
    throw new UnauthorizedError();
  }
}
