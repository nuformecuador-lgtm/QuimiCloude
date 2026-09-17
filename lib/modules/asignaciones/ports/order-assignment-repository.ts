// lib/modules/asignaciones/ports/order-assignment-repository.ts
/**
 * QC-87 T4 — Puerto UNICO de lectura y escritura de responsables de un pedido
 * (`design.md > 3`).
 *
 * Cuatro propiedades de este puerto son el requisito, no un estilo:
 *
 *   1. **`companyId` es el PRIMER parametro de los CUATRO metodos que lo llevan**, con el mismo
 *      criterio que `WorkGroupRepository`: una llamada que lo olvide **no compila**, en vez de
 *      leer o borrar sobre la empresa equivocada (R7). El caso negativo esta escrito y vigilado
 *      en `tests/unit/asignaciones/order-assignment-repository.test.ts`.
 *   2. **NINGUN metodo actualiza una fila.** No hay `update`: la asignacion se crea o se borra,
 *      nunca se edita (QC-86 R8, R9). Lo que no se puede expresar no se hace por descuido, y por
 *      eso el nombre congelado del grupo sobrevive a un renombrado posterior (R28).
 *   3. **NINGUN borrado masivo por pedido.** No hay `deleteByOrder` a proposito: habilitaria el
 *      anti-patron «borrar y reinsertar» que `design.md > 10` marca como riesgo n.o 1 y que
 *      romperia el congelado de QC-86. Solo se borra UNA fila (R29) o las de UN grupo (R32).
 *   4. **`insertMissing` no lleva `SELECT` previo.** Inserta lo que falta en UNA sentencia y deja
 *      intacto lo que ya estaba (R15, R22): sin comprobacion previa no hay carrera, y el numero
 *      que devuelve es R16 sin contar nada a mano.
 *
 * Puerto puro: sin `@prisma/client`, sin `next/*`, sin `zod` y sin ningun otro modulo. El
 * `Promise` que devuelven los metodos es la unica concesion: quien lo implementa habla con la base.
 */

/** Una fila a crear. `workGroupId` y `workGroupName` van JUNTOS O NINGUNO -el CHECK
 *  `order_assignments_work_group_name_matches_group` de QC-86 R7-: los dos `null` es un
 *  responsable marcado suelto, los dos con valor es uno que vino de un grupo con su nombre
 *  CONGELADO al momento de asignar. */
export type NewAssignment = {
  readonly orderId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

/** Una fila leida. No trae `orderId` ni `companyId` porque los dos los puso quien pregunta:
 *  devolverlos invitaria a confiar en ellos en vez de en el filtro. */
export type AssignmentRow = {
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

/**
 * QC-102 T1 — una fila leida por la consulta EN LOTE, que SI necesita saber de que pedido es:
 * `orderId` es lo que la agrupa, y sin el una sola sentencia para varios pedidos no podria
 * repartirse (R1). **EXTIENDE `AssignmentRow`, no lo redefine**: asi el dia que la fila leida gane
 * o pierda una clave, las dos lecturas cambian juntas y no pueden diverger.
 */
export type OrderAssignmentRowWithOrder = AssignmentRow & { readonly orderId: string };

export interface OrderAssignmentRepository {
  /** Inserta las filas que FALTAN y no toca las que ya estan (R15, R22). Devuelve cuantas creo
   *  (R16). Una sola sentencia, dentro de una transaccion con el resto de la operacion (R27). */
  insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number>;
  /** Las filas del pedido de ESA empresa, ordenadas por el adaptador (R7, R38). */
  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly AssignmentRow[]>;
  /**
   * QC-102 (R1, R4, R5) — las filas de ESOS pedidos en ESA empresa, en **UNA sola sentencia**.
   *
   * Es lo que permite resolver una pagina entera del listado con un numero de consultas CONSTANTE
   * (R4): ni una por fila ni una por responsable. La composicion se hace despues **en memoria**,
   * con los identificadores ya leidos, y NO navegando ninguna relacion entre `orders` y
   * `order_assignments` —que no existe, y R5 prohibe crear—.
   *
   * `companyId` primero, como en los otros metodos: una llamada que lo olvide **no compila** (R3).
   * La lista vacia NO llega aqui: el caso de uso corta antes, sin tocar ningun puerto (R8).
   */
  listByOrdersInCompany(
    companyId: string,
    orderIds: readonly string[],
  ): Promise<readonly OrderAssignmentRowWithOrder[]>;
  /** Borrado FISICO de UNA fila (R29). `'not_found'` = esa persona no es responsable (R30). */
  deleteOne(companyId: string, orderId: string, userId: string): Promise<'ok' | 'not_found'>;
  /** Borrado FISICO de las filas de ese pedido con ESE origen (R32). Devuelve cuantas (R34). */
  deleteByWorkGroup(companyId: string, orderId: string, workGroupId: string): Promise<number>;
  /**
   * Los pedidos que esa persona tiene asignados en esa empresa. Devuelve **solo identificadores**
   * a proposito: con la fila entera se acabaria componiendo los responsables «de paso», que es el
   * trabajo de `listByOrdersInCompany` y tiene su propio orden. Deduplicados y ordenados por el
   * adaptador, por determinismo antes de paginar; no es el orden que ve quien mira.
   */
  listOrderIdsByUserInCompany(companyId: string, userId: string): Promise<readonly string[]>;
}
