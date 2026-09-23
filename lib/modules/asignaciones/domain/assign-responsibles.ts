// lib/modules/asignaciones/domain/assign-responsibles.ts
/**
 * QC-87 T7 — Asignar responsables a un pedido: personas SUELTAS, GRUPOS de trabajo, o las dos
 * cosas en la MISMA operacion (`design.md > 5`, R1, R2, R5, R6, R8-R12, R14-R28).
 *
 * LOS SIETE PASOS, EN ESTE ORDEN, y el orden es el requisito:
 *
 *   1. `requirePermission(actor, 'asignaciones.modificar')` — **PRIMERA LINEA** (R1), antes de
 *      `zod` y antes de tocar NINGUN puerto. R2 pide que un actor ausente, sin permisos, con el
 *      conjunto vacio o sin el codigo se rechace «sin leer ni escribir nada»: si la validacion o
 *      una lectura fueran antes, el rechazo revelaria si el pedido, la persona o el grupo existen.
 *   2. `assignResponsiblesSchema.safeParse(input)` -> `ValidationError` (R42), tambien **sin tocar
 *      ningun puerto**.
 *   3. El pedido y su estado, sobre la LECTURA (R8, R10, R11, R12): `assertOrderAcceptsWrites`.
 *   4. Las personas sueltas: las que faltan son `user_not_found` (R17, R6), las que vuelven con
 *      `isActive: false` son `user_not_assignable` (R18). **Rechazo ENTERO**: ni una fila.
 *   5. Los grupos, uno a uno: `null` es `work_group_not_found` (R25, R6). De cada snapshot salen
 *      el `name` que se CONGELA (R19, R28) y los `activeMemberIds` (R20, R21).
 *   6. Composicion DETERMINISTA (R24): gana el PRIMER camino.
 *   7. `insertMissing` (R14, R15, R16, R22, R27).
 *
 * **Los pasos 4 y 5 se lanzan EN PARALELO** (`Promise.all`): son lecturas independientes y ninguna
 * decide si la otra corre. El ORDEN DE LOS RECHAZOS sigue siendo el de arriba —primero las
 * personas, despues los grupos— porque las dos promesas se resuelven antes de mirar ninguna: que
 * las lecturas sean concurrentes no hace que el error dependa de cual conteste antes.
 *
 * **PROHIBIDO «borrar y reinsertar»** (riesgo n.o 1 de `design.md > 10` y `> 11.1`): sacaria del
 * pedido a quien ya no esta en el grupo —lo que QC-86 R9 prohibe— y reescribiria el nombre
 * congelado de quien sobreviviera. Por eso aqui hay UNA sola llamada de escritura, y por eso el
 * puerto no tiene `update` ni `deleteByOrder`: lo que no se puede expresar no se hace por descuido.
 *
 * **Quien ya estaba NO se toca, y lo garantiza la BASE, no un `if`** (R15, R22): `insertMissing` es
 * `INSERT ... ON CONFLICT DO NOTHING` contra la PK `(order_id, user_id)`. Sin `SELECT` previo no
 * hay ventana de carrera, y el numero que devuelve es R16 **sin contar nada a mano**.
 *
 * **R27, la transaccion:** todas las filas del lote entran en **una sola sentencia**, que Postgres
 * ejecuta de forma atomica; no hay ninguna segunda escritura de la que pudiera desincronizarse. Un
 * fallo a mitad no puede dejar el pedido con parte de las personas asignadas porque no existe
 * ninguna «mitad». Si algun dia esta operacion ganara una segunda escritura, es el ADAPTADOR quien
 * abre la transaccion y el caso de uso quien le pasa el cliente transaccional —por eso el
 * repositorio es una fabrica que lo acepta—: el dominio no conoce Prisma.
 */
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';
import type { OrderCatalog } from '@/lib/modules/pedidos';

import { requirePermission, type Actor } from './actor';
import { assignResponsiblesSchema } from './assignment-input';
import {
  UserCannotBeResponsibleError,
  UserNotAssignableError,
  UserNotFoundError,
  ValidationError,
  WorkGroupNotFoundError,
} from './errors';
import { assertOrderAcceptsWrites } from './order-state';
import { canBeResponsible } from './responsible-eligibility';

import type { NewAssignment, OrderAssignmentRepository } from '../ports/order-assignment-repository';

/**
 * Los CUATRO puertos, todos por INTERFAZ: el propio del modulo y los tres contratos publicos que
 * `pedidos` e `identity` publicaron en T2 y T3 (R45). `asignaciones` no toca `prisma.order`,
 * `prisma.user` ni `prisma.workGroup`, y lo vigila `guard-arquitectura-modulos`.
 */
export type AssignResponsiblesDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly orders: OrderCatalog;
  readonly people: PeopleDirectory;
  readonly groups: WorkGroupDirectory;
};

/** R16: cuantas personas se ANADIERON, contando solo las filas creadas y no las que ya estaban. */
export type AssignOutcome = { readonly added: number };

export function createAssignResponsibles(
  deps: AssignResponsiblesDeps,
): (actor: Actor | null | undefined, input: unknown, now: Date) => Promise<AssignOutcome> {
  return async function assignResponsibles(
    actor: Actor | null | undefined,
    input: unknown,
    now: Date,
  ): Promise<AssignOutcome> {
    // 1. R1, R2. Primera linea de verdad: no hay nada por encima.
    requirePermission(actor, 'asignaciones.modificar');

    // 2. R42. El esquema exige `orderId` uuid y AL MENOS una persona o un grupo; `strictObject`
    //    hace que mandar `companyId` FALLE en vez de ignorarse en silencio (R5).
    const parsed = assignResponsiblesSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { orderId, userIds, workGroupIds } = parsed.data;
    // R5: LA EMPRESA SALE DEL ACTOR. No hay ninguna otra fuente, ni la puede haber: no existe
    // campo `companyId` en el esquema de entrada.
    const companyId = actor.companyId;

    // 3. R8, R10, R11, R12: sobre la LECTURA, nunca en el `WHERE` de la escritura.
    assertOrderAcceptsWrites(await deps.orders.findAliveById(orderId, companyId));

    // 4 y 5 EN PARALELO: dos lecturas independientes (`design.md > 5`).
    const [people, snapshots] = await Promise.all([
      deps.people.findAliveRefsInCompany(companyId, userIds, now),
      // Un grupo por llamada: el contrato de `identity` responde por UNO. El orden del array es el
      // de `workGroupIds`, y eso es lo que el paso 6 necesita para ser determinista.
      Promise.all(
        workGroupIds.map((workGroupId) =>
          deps.groups.findSnapshotAliveInCompany(companyId, workGroupId, now),
        ),
      ),
    ]);

    // 4. R17, R6: la que no existe, la dada de baja y la de otra empresa simplemente NO vuelven, y
    //    las tres dan el MISMO error —decir cual seria revelar la existencia de datos ajenos—.
    //    RECHAZO ENTERO: se lanza ANTES de escribir, asi que no queda creada ninguna fila.
    const byId = new Map(people.map((person) => [person.id, person]));
    for (const userId of userIds) {
      const person = byId.get(userId);
      if (person === undefined) throw new UserNotFoundError();
      // R18: existe y es de la empresa, pero su estado EFECTIVO en `now` no es `active`. Codigo
      // propio y distinto de `user_not_found`: lo que no admite es que se le asigne trabajo HOY.
      // Quien decide que es «activo» es `identity` (R21); aqui solo se lee el booleano.
      if (!person.isActive) throw new UserNotAssignableError();
      // Supervisa los pedidos de toda la empresa: no se le puede asignar la responsabilidad de
      // ejecutar uno. Rechazo ENTERO, igual que los dos anteriores.
      if (!canBeResponsible(person)) throw new UserCannotBeResponsibleError();
    }

    // 5. R25, R6: el grupo que no existe, el dado de baja y el de otra empresa, el mismo error.
    const resolved = snapshots.map((snapshot) => {
      if (snapshot === null) throw new WorkGroupNotFoundError();
      return snapshot;
    });

    // Quien supervisa los pedidos de toda la empresa se omite EN SILENCIO de los grupos,
    // igual que a un miembro inactivo, sin rechazar la operacion. Una sola llamada con la union de
    // todos los miembros activos, no una por grupo.
    const memberIds = new Set<string>();
    for (const snapshot of resolved) {
      for (const userId of snapshot.activeMemberIds) memberIds.add(userId);
    }
    const members =
      memberIds.size > 0 ? await deps.people.findAliveRefsInCompany(companyId, [...memberIds], now) : [];
    const eligibleMemberIds = new Set(
      members.filter((person) => canBeResponsible(person)).map((person) => person.id),
    );

    // 6. R24 — COMPOSICION DETERMINISTA. El orden esta DOCUMENTADO y es este:
    //      (a) las personas sueltas, EN EL ORDEN RECIBIDO;
    //      (b) despues cada grupo EN EL ORDEN RECIBIDO, y dentro de cada uno sus miembros en el
    //          orden en que los devuelve el snapshot.
    //    **Gana la PRIMERA aparicion** de cada `userId`; las siguientes se descartan. El `Map`
    //    conserva el orden de insercion, y `has` antes de `set` es lo que hace que gane el primero
    //    y no el ultimo —invertirlo persistiria el origen equivocado, y es justo lo que vigila el
    //    test de R24—. La deduplicacion vive AQUI y no en la base porque un lote con la misma
    //    persona por dos caminos es una entrada que el dominio normaliza, no una carrera.
    const rows = new Map<string, NewAssignment>();

    for (const userId of userIds) {
      if (rows.has(userId)) continue;
      // R14: origen SUELTO es `workGroupId` y `workGroupName` **los dos `null`** —juntos o
      // ninguno, el CHECK de QC-86 R7—.
      rows.set(userId, { orderId, userId, companyId, workGroupId: null, workGroupName: null });
    }

    for (const snapshot of resolved) {
      // R20, R26: `activeMemberIds` trae SOLO los activos. Un grupo vivo sin ningun miembro activo
      // aporta cero filas y **no** es un error: la operacion termina con exito.
      for (const userId of snapshot.activeMemberIds) {
        if (rows.has(userId)) continue;
        // Se omite en silencio, igual que a un inactivo; el resto del grupo se asigna.
        if (!eligibleMemberIds.has(userId)) continue;
        // R19, R28: la referencia al grupo y el NOMBRE QUE EL GRUPO TENIA EN ESE INSTANTE viajan
        // en la MISMA escritura que crea la fila. No se recalcula, no se refresca y no se relee:
        // renombrar el grupo despues no cambia ninguna fila ya creada (R36).
        rows.set(userId, {
          orderId,
          userId,
          companyId,
          workGroupId: snapshot.id,
          workGroupName: snapshot.name,
        });
      }
    }

    // 7. R14, R15, R16, R22, R27.
    const added = await deps.assignments.insertMissing([...rows.values()], now);
    return { added };
  };
}
