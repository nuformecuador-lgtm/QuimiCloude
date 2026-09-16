// El permiso sale del CONTRATO PUBLICO de `identity`, que es su dueno (`design.md > 2`):
// `lib/modules/identity/domain/permissions.ts` es el UNICO sitio del repo que escribe el
// catalogo de codigos, y `identity/domain/require-permission.ts` es la UNICA implementacion
// de la regla «el actor tiene este permiso» (QC-74). `pedidos` NO declara ninguna constante
// propia de permiso ni de rol, y desde QC-74 NO conoce siquiera el nombre del rol (R18).
//
// Barrel, NUNCA ruta profunda (`docs/architecture.md > La regla de dependencias`).
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/** Actor de entrada de cada uno de los seis casos de uso: id, EMPRESA y CONJUNTO DE PERMISOS,
 *  nada mas. Sin nombre de rol: en este modulo no se autoriza por rol. El dominio NO lee la
 *  sesion, ni una cookie, ni una cabecera: quien la resuelve es el adaptador driving con
 *  `identity.getSessionUser()` y `identity.getSessionContext()`.
 *
 *  `companyId` va dentro del actor, y no como parametro suelto de cada caso de uso, para que
 *  viaje siempre junto a los permisos y ningun llamante pueda olvidarla ni elegirla. Filtra y no
 *  autoriza por si sola: el permiso se exige aparte y primero con `requirePermission`. */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los seis casos de uso (QC-74 R12): antes de `zod` y antes de tocar ningun
 * puerto —ni el repositorio de pedidos, ni el catalogo de recetas, ni el de unidades—.
 * Falla cerrado (R14): actor ausente, sin conjunto de permisos o con el conjunto vacio se
 * rechazan igual, todos con el mismo error de autorizacion y sin revelar nada del recurso.
 *
 * La pertenencia es EXACTA, sin normalizacion ni implicacion entre permisos (R13):
 * `pedidos.modificar` NO concede `pedidos.consultar`, ni al reves.
 *
 * Consultar tambien pasa por aqui: `getOrder` y `listOrders` exigen `pedidos.consultar` igual
 * que las mutaciones exigen `pedidos.modificar`.
 *
 * El error es el `UnauthorizedError` de ESTE modulo, subclase de `PedidosError` (R15): por eso
 * el adaptador driving sigue serializandolo con `error instanceof PedidosError` y el mismo
 * `code` estable, sin cambiar una linea.
 *
 * La RLS que QC-33 dejo activada y forzada en `orders` NO autoriza nada: Prisma se conecta
 * como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). Es
 * defensa en profundidad; la frontera real es esta funcion.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
