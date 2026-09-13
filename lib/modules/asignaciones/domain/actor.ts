// QC-87 T6 — `actor.ts` de `asignaciones` (`design.md > 1`), copiado del de `pedidos` con UNA
// adaptacion: el `Actor` lleva ademas `companyId` (R4, R5).
//
// El permiso sale del CONTRATO PUBLICO de `identity`, que es su dueno:
// `lib/modules/identity/domain/permissions.ts` es el UNICO sitio del repo que escribe el catalogo
// de codigos, y `identity/domain/require-permission.ts` la UNICA implementacion de la regla «el
// actor tiene este permiso» (QC-74). `asignaciones` NO declara ninguna constante propia de permiso
// ni de rol, y no conoce siquiera el nombre de ningun rol.
//
// Se importa por el BARREL, NUNCA por ruta profunda (`docs/architecture.md > La regla de
// dependencias`): de otro modulo solo se consume su contrato.
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de los CUATRO casos de uso (R4): id, EMPRESA y CONJUNTO DE PERMISOS. Sin nombre
 * de rol: en este modulo no se autoriza por rol, y lo vigila
 * `tests/guards/guard-autorizacion-por-permiso.test.ts`.
 *
 * `companyId` esta aqui —y no como parametro suelto de cada caso de uso— porque viaja SIEMPRE
 * junta con los permisos, igual que en `identity` (QC-66 dec. 14): como argumento separado, cada
 * llamante nuevo podria olvidarse de pasarla o, peor, ELEGIRLA. R5 exige que la empresa de cada
 * fila que se escribe salga del actor y no de la entrada de la operacion, y esta forma lo hace
 * inexpresable de otro modo.
 *
 * **La empresa SIRVE PARA FILTRAR y NO AUTORIZA POR SI SOLA** (`docs/architecture.md`): el permiso
 * se comprueba APARTE y PRIMERO; solo despues la empresa entra como ambito.
 *
 * El dominio NO lee la sesion, ni una cookie, ni una cabecera (R4): quien resuelve el actor es el
 * adaptador driving con las dos caras de la sesion de `identity`.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los cuatro casos de uso (R1, R3): ANTES de `zod` y ANTES de tocar ningun puerto
 * —ni el repositorio de asignaciones, ni el catalogo de pedidos, ni los directorios de `identity`—.
 *
 * Falla cerrado (R2): actor ausente (`null`/`undefined`), sin conjunto de permisos, con el conjunto
 * vacio o sin el codigo exigido se rechazan TODOS igual, con el mismo error de autorizacion y sin
 * revelar si el pedido, la persona o el grupo existen.
 *
 * La pertenencia es EXACTA, sin normalizacion ni implicacion entre permisos (R3):
 * `asignaciones.modificar` NO concede `pedidos.consultar`, ni al reves, ni `asignaciones.consultar`
 * sustituye a ninguno de los dos.
 *
 * El error es el `UnauthorizedError` de ESTE modulo, subclase de `AsignacionesError` (R43): asi el
 * adaptador driving lo reconoce con un solo `instanceof` y el mismo `code` estable.
 *
 * La RLS que QC-86 dejo activada y forzada en `order_assignments` NO autoriza nada: Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). Es
 * defensa en profundidad; la frontera real es esta funcion.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
