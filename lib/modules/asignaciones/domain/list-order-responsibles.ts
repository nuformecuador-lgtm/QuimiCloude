// lib/modules/asignaciones/domain/list-order-responsibles.ts
/**
 * QC-87 T9 — Caso de uso «los responsables de un pedido» (`design.md > 5`; R3, R7, R8, R13,
 * R35-R40).
 *
 * Es el UNICO de los cuatro casos de uso de este modulo que NO escribe nada y el unico que NO
 * exige `asignaciones.modificar`.
 *
 * TRES propiedades de este archivo son el requisito, no estilo, y las tres tienen su motivo escrito
 * en el design para que nadie las «arregle»:
 *
 *   1. **Exige `pedidos.consultar`, y NO `asignaciones.consultar`** (R3, `design.md > 0` hallazgo 3
 *      y `> 10` riesgo 3). Ver quien prepara un pedido es informacion DEL PEDIDO. Exigir
 *      `asignaciones.consultar` aqui dejaria sin responsables a quien puede ver el pedido y
 *      estrenaria un permiso cuyo significado es otro -«ver los pedidos que TENGO asignados»- y que
 *      abre un listado que todavia no existe (es de QC-88). Es deliberado.
 *   2. **NO comprueba el estado del pedido** (R13, `design.md > 4`): los CUATRO estados
 *      -`PENDIENTE`, `EN_CURSO`, `ENTREGADO`, `CANCELADO`- devuelven exactamente lo mismo. Un
 *      pedido entregado conserva sus responsables y hay que poder verlos; lo que se congela son las
 *      ESCRITURAS. Por eso aqui no aparecen ni `OrderDeliveredFrozenError` ni
 *      `OrderCancelledNotAssignableError`. Lo unico que se sigue rechazando es el pedido que no
 *      existe o esta dado de baja (R8), y por el mismo motivo que en las escrituras: se decide
 *      sobre la LECTURA (R12).
 *   3. **El origen y el nombre del grupo salen de LA FILA**, congelados al asignar (R35, R36). Ni
 *      se deriva la lista de la pertenencia VIGENTE al grupo, ni se sustituye el nombre congelado
 *      por el de hoy. El puerto no devuelve el nombre actual, asi que no hay forma de equivocarse
 *      sin ir a buscarlo a proposito -y `work_groups` es tabla de OTRO modulo (`design.md > 11.3`)-.
 *
 * **Una persona que no vuelve del directorio SIGUE SALIENDO**, con su identificador como nombre
 * mostrable (`design.md > 5`). Esta escrito para que nadie lo silencie con un `filter`, que
 * convertiria un dato raro -alguien borrado fisicamente por consola, casi imposible con las FK
 * `RESTRICT` de QC-86- en un responsable INVISIBLE. Es la misma linea que QC-34 R44 tomo con la
 * receta borrada: la fila sale, el nombre puede faltar.
 */
import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError } from './errors';

import type { OrderResponsible } from './assignment-view';
import type { AssignmentOrigin } from './order-assignment';
import type { AssignmentRow, OrderAssignmentRepository } from '../ports/order-assignment-repository';

// De otro modulo se consume SOLO su contrato publico, nunca una ruta profunda
// (`docs/architecture.md > La regla de dependencias`). Son interfaces puras: no arrastran servidor.
import type { PeopleDirectory } from '@/lib/modules/identity';
import type { OrderCatalog } from '@/lib/modules/pedidos';

export type ListOrderResponsiblesDeps = {
  /** `pedidos` (T2): para saber si el pedido esta VIVO. Su ESTADO no se mira aqui (R13). */
  readonly orders: OrderCatalog;
  /** El puerto propio (T4): las filas del pedido, acotadas a la empresa del actor (R7). */
  readonly assignments: OrderAssignmentRepository;
  /** `identity` (T3): los nombres mostrables, INCLUIDAS las personas de baja (R37). */
  readonly people: PeopleDirectory;
  /**
   * El instante, como dependencia INYECTABLE con `() => new Date()` por defecto, igual que en los
   * casos de uso de `identity`: en el dominio no se lee el reloj sin salida.
   *
   * Solo viaja hasta `findRefsIncludingDeletedInCompany`, que lo usa para calcular el estado
   * EFECTIVO de la cuenta (QC-78 R7). **Esta consulta DESCARTA ese estado** -R39 prohibe
   * devolverlo- y no filtra por el -R37 exige que las personas de baja, inactivas y bloqueadas
   * sigan saliendo-, asi que el reloj no cambia NI una fila NI el orden de esta salida. Se inyecta
   * igualmente para que el puerto reciba un `now` explicito y no uno escondido.
   */
  readonly now?: () => Date;
};

/**
 * El orden de R38: por **nombre mostrable**, con desempate por **identificador de la persona**.
 *
 * Es la unica excepcion del repo al reparto habitual «ordena la base» (`design.md > 3`), y tiene
 * motivo: se ordena por un nombre que vive en `users`, tabla que este modulo NO puede consultar
 * (`design.md > 11.3`). El adaptador devuelve las filas ordenadas por `user_id` -barato, cubierto
 * por la PK- para que la LECTURA ya sea determinista antes de resolver nombres, y aqui se reordena
 * con los nombres ya resueltos.
 *
 * **El desempate por `userId` no es cosmetico: es lo que hace el orden TOTAL** (R38). Sin el, dos
 * homonimas -y dos personas pueden llamarse igual, a diferencia de los roles de QC-94- quedarian
 * en un orden que depende de como estuvieran colocadas antes del `sort`, y «dos lecturas seguidas
 * devuelven la misma secuencia» dejaria de estar garantizado.
 *
 * El nombre se compara con un `Intl.Collator` de locale FIJO: el orden no puede depender de la
 * configuracion regional de la maquina que ejecute el proceso. El desempate compara el
 * identificador por puntos de codigo -son uuid, sin acentos ni mayusculas que discutir-, para que
 * sea total aunque el colador considere iguales dos nombres.
 */
const NAME_COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: false });

function compareResponsibles(one: OrderResponsible, other: OrderResponsible): number {
  const byName = NAME_COLLATOR.compare(one.displayName, other.displayName);
  if (byName !== 0) return byName;
  // El DESEMPATE, que es la mitad de R38. Se compara por puntos de codigo -no con el colador- para
  // que el orden sea TOTAL: dos identificadores distintos nunca empatan aqui, y por tanto dos
  // lecturas seguidas del mismo pedido no pueden devolver secuencias distintas.
  if (one.userId === other.userId) return 0;
  return one.userId < other.userId ? -1 : 1;
}

/**
 * El origen de LA FILA (R35, R36). `workGroupId` y `workGroupName` van juntos o ninguno -el CHECK
 * `order_assignments_work_group_name_matches_group` de QC-86 R7 lo garantiza en Postgres y la union
 * discriminada lo garantiza en TypeScript-, asi que cualquier fila a medias que llegara aqui se lee
 * como lo unico que se puede afirmar de ella: un responsable suelto. No se inventa un nombre de
 * grupo ni se va a buscar el de hoy.
 */
function toOrigin(row: AssignmentRow): AssignmentOrigin {
  if (row.workGroupId !== null && row.workGroupName !== null) {
    return { kind: 'workGroup', workGroupId: row.workGroupId, workGroupName: row.workGroupName };
  }
  return { kind: 'direct' };
}

export function createListOrderResponsibles(
  deps: ListOrderResponsiblesDeps,
): (actor: Actor | null | undefined, orderId: string) => Promise<readonly OrderResponsible[]> {
  return async function listOrderResponsibles(
    actor: Actor | null | undefined,
    orderId: string,
  ): Promise<readonly OrderResponsible[]> {
    // PRIMERA LINEA, antes de tocar ningun puerto (R3). `pedidos.consultar` y NADA MAS: ver el
    // comentario 1 de la cabecera antes de cambiar este codigo por `asignaciones.consultar`.
    requirePermission(actor, 'pedidos.consultar');

    // El pedido tiene que existir y estar vivo (R8). Su `status` NO se mira: R13.
    const order = await deps.orders.findAliveById(orderId);
    if (order === null) throw new OrderNotFoundError(orderId);

    // La empresa sale del ACTOR (R5) y acota la lectura (R7): una asignacion de otra empresa no
    // vuelve por aqui, ni se revela su existencia.
    const rows = await deps.assignments.listByOrderInCompany(actor.companyId, orderId);
    // R40: sin asignaciones, lista VACIA y ningun error. Se sale antes de preguntar por nombres
    // porque no hay ningun identificador que resolver, no porque sea un caso especial.
    if (rows.length === 0) return [];

    const now = deps.now?.() ?? new Date();
    // R37: el metodo que INCLUYE a las personas dadas de baja, inactivas y bloqueadas. Un
    // responsable que desaparece de la pantalla el dia que su cuenta se desactiva es un dato
    // perdido, no una pantalla mas limpia.
    const refs = await deps.people.findRefsIncludingDeletedInCompany(
      actor.companyId,
      rows.map((row) => row.userId),
      now,
    );
    // Solo el nombre. `isActive` se queda fuera del mapa a proposito: R39.
    const displayNames = new Map(refs.map((ref) => [ref.id, ref.displayName] as const));

    const responsibles: readonly OrderResponsible[] = rows.map((row) => ({
      userId: row.userId,
      // La persona que no vuelve del directorio SIGUE SALIENDO, con su identificador como nombre
      // mostrable. Ver la cabecera: aqui no hay ningun `filter`.
      displayName: displayNames.get(row.userId) ?? row.userId,
      origin: toOrigin(row),
    }));

    return [...responsibles].sort(compareResponsibles);
  };
}
