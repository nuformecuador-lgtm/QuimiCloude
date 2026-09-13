// lib/modules/asignaciones/domain/responsible-order.ts
/**
 * QC-102 T3 — El ORDEN de los responsables y la lectura del ORIGEN de una fila, extraidos de
 * `list-order-responsibles.ts` para que los DOS casos de uso de lectura —el de un pedido (QC-87) y
 * el de varios (QC-102)— usen exactamente la misma definicion.
 *
 * **No es una refactorizacion de gusto: es R6.** El lote tiene que devolver, dentro de cada pedido,
 * el mismo orden determinista y estable que la consulta de un solo pedido. Copiar el comparador
 * daria dos definiciones del mismo orden que pueden diverger —y divergirian en silencio, porque
 * cada una tiene su propio test verde—, asi que vive UNA VEZ y se importa dos.
 *
 * El comportamiento NO cambia respecto de QC-87: este archivo es el MISMO codigo movido, con sus
 * motivos, y los tests de `list-order-responsibles` pasan sin tocar su guion.
 *
 * Dominio PURO: sin `zod`, sin `next/*`, sin `@prisma/client`, sin `@/lib/shared/**` y sin ningun
 * otro modulo. Lo unico que importa son tipos del propio modulo.
 */
import type { OrderResponsible } from './assignment-view';
import type { AssignmentOrigin } from './order-assignment';
import type { AssignmentRow } from '../ports/order-assignment-repository';

/**
 * El orden de QC-87 R38 (y de QC-102 R6): por **nombre mostrable**, con desempate por
 * **identificador de la persona**.
 *
 * Es la unica excepcion del repo al reparto habitual «ordena la base», y tiene motivo: se ordena
 * por un nombre que vive en `users`, tabla que este modulo NO puede consultar. El adaptador
 * devuelve las filas ordenadas por `user_id` —barato, cubierto por la PK— para que la LECTURA ya
 * sea determinista antes de resolver nombres, y aqui se reordena con los nombres ya resueltos.
 *
 * **El desempate por `userId` no es cosmetico: es lo que hace el orden TOTAL.** Sin el, dos
 * homonimas quedarian en un orden que depende de como estuvieran colocadas antes del `sort`, y
 * «dos lecturas seguidas devuelven la misma secuencia» dejaria de estar garantizado.
 *
 * El nombre se compara con un `Intl.Collator` de locale FIJO: el orden no puede depender de la
 * configuracion regional de la maquina que ejecute el proceso. El desempate compara el
 * identificador por puntos de codigo —son uuid, sin acentos ni mayusculas que discutir—, para que
 * sea total aunque el colador considere iguales dos nombres.
 */
const NAME_COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: false });

export function compareResponsibles(one: OrderResponsible, other: OrderResponsible): number {
  const byName = NAME_COLLATOR.compare(one.displayName, other.displayName);
  if (byName !== 0) return byName;
  // El DESEMPATE, que es la mitad de R38 de QC-87 y de R6 de QC-102. Se compara por puntos de
  // codigo —no con el colador— para que el orden sea TOTAL: dos identificadores distintos nunca
  // empatan aqui, y por tanto dos lecturas seguidas del mismo pedido no pueden devolver
  // secuencias distintas.
  if (one.userId === other.userId) return 0;
  return one.userId < other.userId ? -1 : 1;
}

/**
 * El origen de LA FILA (QC-87 R35/R36, QC-102 R12). `workGroupId` y `workGroupName` van juntos o
 * ninguno —el CHECK `order_assignments_work_group_name_matches_group` de QC-86 R7 lo garantiza en
 * Postgres y la union discriminada lo garantiza en TypeScript—, asi que cualquier fila a medias que
 * llegara aqui se lee como lo unico que se puede afirmar de ella: un responsable suelto. No se
 * inventa un nombre de grupo ni se va a buscar el de hoy.
 */
export function toOrigin(row: AssignmentRow): AssignmentOrigin {
  if (row.workGroupId !== null && row.workGroupName !== null) {
    return { kind: 'workGroup', workGroupId: row.workGroupId, workGroupName: row.workGroupName };
  }
  return { kind: 'direct' };
}
