// lib/modules/asignaciones/domain/list-responsibles-for-orders.ts
/**
 * QC-102 T4 - Caso de uso «los responsables de VARIOS pedidos a la vez» (`design.md > 2.3`;
 * R1-R12).
 *
 * Es la UNICA pieza de backend que QC-102 anade. Existe para que el listado de pedidos pinte los
 * responsables de una pagina entera con un numero de consultas CONSTANTE (R4): la pantalla pide la
 * pagina a `pedidos` y despues, de golpe, los responsables de esos identificadores -el mismo patron
 * con el que `list-orders.ts` compone el nombre de la receta-.
 *
 * CINCO propiedades son el requisito, no estilo:
 *
 *   1. **`pedidos.consultar` en la PRIMERA LINEA** (R2), antes de `zod` y antes de tocar ningun
 *      puerto, con el MISMO `requirePermission` del modulo. Ni `asignaciones.consultar` ni
 *      `asignaciones.modificar` sustituyen a ese codigo: ver quien prepara un pedido es informacion
 *      DEL PEDIDO, igual que en la consulta de uno solo (QC-87 R3).
 *   2. **DOS consultas y ni una mas, sea cual sea el tamano de la pagina** (R4): una al
 *      repositorio propio -`listByOrdersInCompany`, una sentencia (R5)- y otra al directorio de
 *      personas con los identificadores de TODA la pagina deduplicados, de modo que una persona
 *      responsable de cinco pedidos se pregunte UNA vez.
 *   3. **`OrderCatalog` NO es dependencia** (`design.md > 0` hallazgo H3). La consulta de un solo
 *      pedido lanza `OrderNotFoundError` cuando el pedido no esta vivo; replicarlo aqui costaria
 *      una consulta POR PEDIDO, justo lo que R4 prohibe. Se resuelve por R7: un identificador
 *      desconocido -inexistente, dado de baja o de otra empresa- devuelve su entrada VACIA, no
 *      rompe la pagina y los tres casos son indistinguibles en la salida. No hay fuga: la lectura
 *      ya esta acotada por la empresa del ACTOR (R3).
 *   4. **El orden dentro de cada pedido es el MISMO que el de la consulta singular** (R6), porque
 *      es literalmente el mismo comparador: `compareResponsibles` vive una vez en
 *      `./responsible-order` y lo importan los dos casos de uso.
 *   5. **Una entrada por cada identificador pedido**, tambien para los que no tienen ninguna fila
 *      (R1), en el orden en que se pidieron. Quien pinta la fila no tiene que distinguir «no hay
 *      responsables» de «no vino la entrada».
 *
 * Dominio PURO: `zod` y tipos del propio modulo o del contrato publico de otro. Sin `next/*`, sin
 * `@prisma/client`, sin adaptadores y sin `@/lib/shared/**`.
 */
import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { compareResponsibles, toOrigin } from './responsible-order';

import type { OrderResponsible } from './assignment-view';
import type { OrderAssignmentRepository } from '../ports/order-assignment-repository';

import type { PeopleDirectory } from '@/lib/modules/identity';

/**
 * Tope de identificadores por lote. Es el mismo numero que `MAX_PAGE_SIZE`
 * (`lib/shared/pagination.ts`), y esta DECLARADO AQUI porque el dominio de un modulo **no puede
 * importar `lib/shared`** (`docs/architecture.md > La regla de dependencias`).
 *
 * Esa duplicacion es inevitable y esta anotada como hallazgo H4 del diseno, con su mitigacion: un
 * test ata los dos numeros. Sin el, ampliar la pagina a 50 dejaria media pagina sin responsables y
 * **en silencio** -las entradas sobrantes ni siquiera llegarian a consultarse-.
 */
export const MAX_ORDERS_PER_BATCH = 25;

/**
 * El esquema del borde (R9): una lista de identificadores de pedido. `uuid` uno a uno y tope
 * declarado arriba. Los repetidos NO se rechazan -a diferencia de las listas de escritura de
 * QC-87, que si lo hacen- porque aqui repetir no falsea ningun conteo: se deduplican y se
 * consultan una sola vez.
 */
const orderIdsSchema = z.array(z.string().uuid()).max(MAX_ORDERS_PER_BATCH);

/** Una entrada de la salida: el pedido que se pidio y SUS responsables, que pueden ser ninguno. */
export type OrderResponsiblesEntry = {
  readonly orderId: string;
  readonly responsibles: readonly OrderResponsible[];
};

export type ListResponsiblesForOrdersDeps = {
  /** El puerto propio: las filas de ESOS pedidos en UNA sentencia, acotadas por empresa (R3, R5). */
  readonly assignments: OrderAssignmentRepository;
  /** `identity`: los nombres mostrables, INCLUIDAS las personas de baja o bloqueadas (R11). */
  readonly people: PeopleDirectory;
  /**
   * El instante, inyectable, con `() => new Date()` por defecto: en el dominio no se lee el reloj
   * sin salida. Solo viaja hasta `findRefsIncludingDeletedInCompany`, que lo usa para calcular el
   * estado EFECTIVO de la cuenta (QC-78 R7) -estado que esta consulta DESCARTA (R11) y por el que
   * no filtra-, asi que no cambia ni una fila ni el orden de la salida.
   */
  readonly now?: () => Date;
};

export function createListResponsiblesForOrders(
  deps: ListResponsiblesForOrdersDeps,
): (
  actor: Actor | null | undefined,
  orderIds: unknown,
) => Promise<readonly OrderResponsiblesEntry[]> {
  return async function listResponsiblesForOrders(
    actor: Actor | null | undefined,
    orderIds: unknown,
  ): Promise<readonly OrderResponsiblesEntry[]> {
    // 1. PRIMERA LINEA (R2): antes de `zod` y antes de tocar ningun puerto.
    requirePermission(actor, 'pedidos.consultar');

    // 2. El borde (R9). El rechazo ocurre SIN tocar ningun puerto.
    const parsed = orderIdsSchema.safeParse(orderIds);
    if (!parsed.success) throw new ValidationError();

    // Los repetidos se consultan UNA sola vez (R9), y el orden de la salida es el de la PRIMERA
    // aparicion de cada identificador: `Set` conserva el orden de insercion.
    const ids = [...new Set(parsed.data)];

    // 3. Lista vacia: resultado vacio SIN tocar ningun puerto y sin ningun error (R8).
    if (ids.length === 0) return [];

    // 4. UNA consulta para toda la pagina (R4, R5). La empresa sale del ACTOR (R3).
    const rows = await deps.assignments.listByOrdersInCompany(actor.companyId, ids);

    // 5. UNA consulta de nombres para toda la pagina, con los identificadores de personas
    //    DEDUPLICADOS (R4): quien es responsable de cinco pedidos se pregunta una vez. Si no hay
    //    ninguna fila no queda nada que resolver, y se devuelven las entradas vacias sin gastar la
    //    segunda consulta -es el mismo corte de la consulta singular, no un caso especial-.
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const refs =
      userIds.length === 0
        ? []
        : await deps.people.findRefsIncludingDeletedInCompany(
            actor.companyId,
            userIds,
            deps.now?.() ?? new Date(),
          );
    // Solo el nombre: `isActive` se queda fuera del mapa a proposito (R11).
    const displayNames = new Map(refs.map((ref) => [ref.id, ref.displayName] as const));

    // 6. Agrupado EN MEMORIA (R5) con los identificadores ya leidos.
    const porPedido = new Map<string, OrderResponsible[]>(ids.map((id) => [id, []]));
    for (const row of rows) {
      // Una fila de un pedido que no se pidio no puede existir -el `where` filtra por esos ids-,
      // pero si llegara no se inventaria una entrada: la salida la manda lo que se PIDIO (R1).
      const grupo = porPedido.get(row.orderId);
      if (grupo === undefined) continue;
      grupo.push({
        userId: row.userId,
        // La persona que no vuelve del directorio SIGUE SALIENDO, con su identificador como nombre
        // mostrable: misma linea que la consulta singular, aqui no hay ningun `filter`.
        displayName: displayNames.get(row.userId) ?? row.userId,
        // El origen y el nombre del grupo salen de LA FILA, congelados al asignar (R12): no se
        // consulta el nombre ACTUAL del grupo ni se deriva nada de la pertenencia vigente.
        origin: toOrigin(row),
      });
    }

    // Una entrada por cada identificador pedido, tambien para los que no tienen ninguna fila (R1,
    // R7), y el MISMO orden que la consulta de un solo pedido dentro de cada uno (R6).
    return ids.map((orderId) => ({
      orderId,
      responsibles: (porPedido.get(orderId) ?? []).sort(compareResponsibles),
    }));
  };
}
