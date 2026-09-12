// lib/modules/asignaciones/domain/order-assignment.ts
// Los tipos de la asignacion de un pedido (`design.md > 3`, R31). Dominio PURO: sin `zod`, sin
// `next/*`, sin `@prisma/client` y sin importar ningun otro modulo. Los identificadores viajan
// como `string` (uuid), igual que en todo el repo; el dia que este modulo necesite un tipo de
// `pedidos` o de `identity` lo pedira a su BARRIL, nunca a una ruta interna.

/** De donde vino un responsable: marcado suelto, o dentro de un grupo aplicado al pedido.
 *
 *  La union DISCRIMINADA hace imposible en TypeScript la fila a medias -un grupo sin su nombre
 *  congelado, o un nombre congelado sin grupo-, igual que el CHECK
 *  `order_assignments_work_group_name_matches_group` la hace imposible en Postgres (R7). Las dos
 *  garantias dicen lo mismo en los dos sitios donde se puede romper; ninguna sustituye a la otra.
 *
 *  NO hay una tercera variante ni una columna `source`: «vino de un grupo» es exactamente
 *  `work_group_id IS NOT NULL` (`design.md > 9.1`). */
export type AssignmentOrigin =
  | { readonly kind: 'direct' }
  | { readonly kind: 'workGroup'; readonly workGroupId: string; readonly workGroupName: string };

/** Un responsable de un pedido, tal como lo persiste la fila. `workGroupName` es el nombre
 *  CONGELADO: el que el grupo tenia al asignar, no el de hoy. Un `JOIN` a `work_groups`
 *  devolveria el de hoy y por eso NO puede sustituirlo (R6, R8, riesgo 3 del design).
 *
 *  `companyId` es la empresa de la propia fila: la misma de la persona y -si hay grupo- la del
 *  grupo, por construccion de las dos FK compuestas (R11). */
export type OrderAssignment = {
  readonly orderId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly origin: AssignmentOrigin;
};
