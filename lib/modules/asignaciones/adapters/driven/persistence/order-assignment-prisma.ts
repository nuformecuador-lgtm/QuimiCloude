import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type {
  AssignmentRow,
  NewAssignment,
  OrderAssignmentRepository,
  OrderAssignmentRowWithOrder,
} from '../../../ports/order-assignment-repository';

/**
 * QC-87 T5 — Adaptador Prisma de `OrderAssignmentRepository` (`design.md > 3`).
 *
 * UNICO archivo del repo que consulta `prisma.orderAssignment` (QC-86 R30, vigilado por
 * `tests/guards/guard-arquitectura-modulos.test.ts` y por el bloque (d) de
 * `tests/unit/asignaciones/module-contract.test.ts`), y UNICO archivo del modulo que importa
 * `@prisma/client` y `@/lib/shared/db/prisma`.
 *
 * CUATRO DECISIONES QUE NO SON ESTILO:
 *
 *   1. **`insertMissing` es UN SOLO `createMany({ skipDuplicates: true })`**, que Prisma traduce
 *      a `INSERT ... ON CONFLICT DO NOTHING` contra `order_assignments_pkey`. Es la traduccion
 *      exacta de las decisiones 2 y 3 de QC-86: la persona que YA estaba no se toca -su origen y
 *      su nombre congelado siguen siendo los de entonces (R15, R22)- y la que falta entra. Como
 *      no hay `SELECT` previo, no hay ventana de carrera entre la comprobacion y la escritura, y
 *      el `count` que devuelve la sentencia es R16/R34 **sin contar nada a mano**.
 *   2. **JAMAS `deleteMany` por pedido seguido de `createMany`.** El «borrar y reinsertar» es el
 *      riesgo n.o 1 de `design.md > 10`: reescribiria `created_at`, el origen y el nombre
 *      congelado de filas que nadie pidio tocar, es decir, romperia justo lo que QC-86 protege.
 *      Por eso el puerto no tiene `deleteByOrder` y aqui no hay ninguna sentencia equivalente.
 *   3. **`createdAt` y `updatedAt` van EXPLICITOS con el `now` que recibe el caso de uso.**
 *      `order_assignments.updated_at` es `NOT NULL` **SIN default de base** (QC-86 §1.1): el
 *      unico que puede rellenarla es el CLIENTE, y dejarlo en manos del `@updatedAt` del
 *      esquema significa que la fila se sella con el reloj del proceso en vez de con el de la
 *      operacion. Con `now` explicito, todas las filas del lote llevan el MISMO instante, el
 *      mismo que el resto de la operacion. Es la trampa que QC-4, QC-47 y QC-83 ya dejaron
 *      anotada por escrito, y la comprueba el caso del reloj unico del test de integracion
 *      -que cae si alguien borra estas dos lineas-.
 *   4. **`deleteOne` y `deleteByWorkGroup` son borrados FISICOS** (QC-86 R15): la excepcion
 *      explicita al borrado logico de QC-4, con el mismo criterio que
 *      `removeMemberAliveInCompany` de QC-83 -una asignacion no es una transaccion, es una
 *      relacion viva-. Van con `deleteMany` y no con `delete` para que «no era responsable» sea
 *      un RESULTADO (`'not_found'`, R30) y no una excepcion `P2025`.
 *
 * FABRICA Y NO OBJETO YA CONSTRUIDO, por el mismo motivo que `createInitialAccessRepository`
 * (QC-47): el caso de uso hace su trabajo dentro de UNA transaccion (R27) y el adaptador tiene
 * que poder hablar por el cliente transaccional que le pasen; un objeto atado al `PrismaClient`
 * compartido correria en otra conexion del pool y quedaria fuera de esa transaccion. Sin
 * argumento usa el cliente global, que es lo que quiere `lib/composition`.
 *
 * Este adaptador NO valida nada de negocio: el estado del pedido, el permiso, la empresa del
 * actor y la deduplicacion del lote los decide el dominio antes de llegar aqui. Lo unico que
 * pone de su parte es el `company_id` en el `where` de las tres operaciones que lo llevan (R7),
 * porque un filtro que se puede olvidar en un `if` posterior tarde o temprano se olvida.
 */

/** Cliente global o el transaccional que abra el caso de uso: el adaptador no distingue. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** `select` unico de la lectura. NO devuelve `order_id` ni `company_id` -los puso quien
 *  pregunta (ver el puerto)- ni las dos marcas de tiempo, que nadie consume. */
const ASSIGNMENT_SELECT = {
  userId: true,
  workGroupId: true,
  workGroupName: true,
} satisfies Prisma.OrderAssignmentSelect;

export function createOrderAssignmentRepository(db: PrismaLike = prisma): OrderAssignmentRepository {
  return {
    async insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number> {
      // Un lote vacio no es un caso raro -el dominio puede haber deduplicado hasta dejarlo
      // seco- y no merece un viaje a la base. `createMany([])` devolveria 0 igualmente; esto
      // solo evita el ida y vuelta.
      if (rows.length === 0) return 0;

      const { count } = await db.orderAssignment.createMany({
        data: rows.map((row) => ({
          orderId: row.orderId,
          userId: row.userId,
          companyId: row.companyId,
          // `workGroupId` y `workGroupName` viajan JUNTOS O NINGUNO: es el CHECK
          // `order_assignments_work_group_name_matches_group` (QC-86 R7) quien lo garantiza,
          // y aqui se copian tal cual sin cocinar ninguno de los dos.
          workGroupId: row.workGroupId,
          workGroupName: row.workGroupName,
          createdAt: now,
          updatedAt: now,
        })),
        // `INSERT ... ON CONFLICT DO NOTHING`: R15 y R22 los cumple la BASE, no un `if`.
        skipDuplicates: true,
      });
      return count;
    },

    async listByOrderInCompany(
      companyId: string,
      orderId: string,
    ): Promise<readonly AssignmentRow[]> {
      // Orden por `user_id`: barato, cubierto por `order_assignments_pkey` y TOTAL -la clave
      // primaria es (order_id, user_id), asi que dentro de un pedido no hay empates-. El orden
      // FINAL de R38 es por nombre mostrable y lo pone el caso de uso, que es el unico que
      // puede: `users` no es de este modulo.
      return db.orderAssignment.findMany({
        where: { orderId, companyId },
        select: ASSIGNMENT_SELECT,
        orderBy: { userId: 'asc' },
      });
    },

    /**
     * QC-102 T2 — la consulta EN LOTE: UN SOLO `findMany` para TODOS los pedidos de la pagina
     * (R4), **sin `include` y sin join** (R5).
     *
     * `orderId` entra en el `select` —y solo aqui— porque es lo que AGRUPA: el caso de uso reparte
     * en memoria con el identificador ya leido, exactamente como `list-orders.ts` compone el nombre
     * de la receta. Entre `orders` y `order_assignments` no hay `@relation` que navegar (QC-33
     * dejo las FK como escalares a proposito) y esta ficha no la crea: lo vigila
     * `tests/guards/guard-lote-sin-join.test.ts`.
     *
     * El `orderBy` es barato y TOTAL: la PK de `order_assignments` es `(order_id, user_id)`
     * —QC-86—, asi que la lectura ya es determinista ANTES de resolver nombres; el orden final por
     * nombre mostrable lo pone el caso de uso, que es el unico que puede (`users` no es de este
     * modulo).
     *
     * `orderIds` vacio NO llega aqui: el caso de uso corta antes (R8).
     */
    async listByOrdersInCompany(
      companyId: string,
      orderIds: readonly string[],
    ): Promise<readonly OrderAssignmentRowWithOrder[]> {
      return db.orderAssignment.findMany({
        where: { companyId, orderId: { in: [...orderIds] } },
        select: { ...ASSIGNMENT_SELECT, orderId: true },
        orderBy: [{ orderId: 'asc' }, { userId: 'asc' }],
      });
    },

    async deleteOne(
      companyId: string,
      orderId: string,
      userId: string,
    ): Promise<'ok' | 'not_found'> {
      const { count } = await db.orderAssignment.deleteMany({
        where: { orderId, userId, companyId },
      });
      return count === 1 ? 'ok' : 'not_found';
    },

    async deleteByWorkGroup(
      companyId: string,
      orderId: string,
      workGroupId: string,
    ): Promise<number> {
      // Se borra por el `work_group_id` CONGELADO EN LA FILA, sin preguntarle a `identity` si
      // el grupo sigue vivo (R32): quitar de un pedido un grupo dado de baja ayer tiene que
      // funcionar. Las asignaciones SUELTAS de ese pedido no se tocan -su `work_group_id` es
      // `NULL` y no iguala a nada-.
      const { count } = await db.orderAssignment.deleteMany({
        where: { orderId, companyId, workGroupId },
      });
      return count;
    },

    /**
     * Sin `distinct`: la PK de `order_assignments` es `(order_id, user_id)`, asi que fijado el
     * `user_id` no puede repetirse un pedido y la clausula costaria sin quitar nada.
     *
     * El `orderBy` no es el orden de la lista —eso lo pone `pedidos`—, sino determinismo antes de
     * paginar; ordenar la pantalla por un uuid seria el error de confundirlos.
     */
    async listOrderIdsByUserInCompany(
      companyId: string,
      userId: string,
    ): Promise<readonly string[]> {
      const filas = await db.orderAssignment.findMany({
        where: { userId, companyId },
        select: { orderId: true },
        orderBy: { orderId: 'asc' },
      });
      return filas.map((fila) => fila.orderId);
    },
  };
}
