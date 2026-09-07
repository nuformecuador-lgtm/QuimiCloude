// El nombre del rol sale del CONTRATO PUBLICO de `identity`, que es su dueno
// (`design.md > 2.1`): `lib/modules/identity/domain/roles.ts` es el UNICO sitio del repo
// que escribe a mano el literal, y `identity/domain/require-admin.ts` es la UNICA
// implementacion de la regla «el actor es Administrador» (QC-54). `pedidos` NO declara
// ninguna constante propia de rol y NO incrusta el literal en ningun archivo (R4): delega
// en `assertAdminRole`, igual que los demas modulos.
//
// Barrel, NUNCA ruta profunda (`docs/architecture.md > La regla de dependencias`).
import { assertAdminRole } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/** Actor de entrada de cada uno de los seis casos de uso (R1): id y rol, nada mas. El
 *  dominio NO lee la sesion, ni una cookie, ni una cabecera: quien la resuelve es el
 *  adaptador driving con `identity.getSessionUser()` (R5). */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea de los seis casos de uso (R2, R3): antes de `zod` y antes de tocar ningun
 * puerto —ni el repositorio de pedidos, ni el catalogo de recetas, ni el de unidades—.
 * Falla cerrado: actor ausente, rol nulo, vacio o desconocido se rechazan igual, todos con
 * el mismo error de autorizacion.
 *
 * La comparacion es de igualdad EXACTA, sin `includes` ni normalizacion (R3): un rol
 * llamado «Administradores externos» no debe colarse.
 *
 * Consultar tambien pasa por aqui (decision cerrada 1): `getOrder` y `listOrders` llaman a
 * `requireAdmin` igual que las mutaciones. El Operador ni siquiera lee.
 *
 * La RLS que QC-33 dejo activada y forzada en `orders` NO autoriza nada: Prisma se conecta
 * como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). Es
 * defensa en profundidad; la frontera real es esta funcion (R7).
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertAdminRole(actor, () => new UnauthorizedError());
}
