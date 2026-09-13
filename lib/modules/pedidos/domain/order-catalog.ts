// lib/modules/pedidos/domain/order-catalog.ts
/**
 * QC-87 T2 (`design.md > 2.1`, R45). Servicio que `pedidos` ofrece a los demas modulos para
 * que puedan saber el ESTADO de un pedido sin tocar `prisma.order` ni importar nada de
 * `pedidos` por ruta profunda (`docs/architecture.md > Dominio` n.o 2: «se comparten
 * servicios via interfaz, nunca repositorios ni tablas»). Mismo patron que `RecipeCatalog`
 * de QC-33/QC-34, que es como `pedidos` aprendio a saber de una receta.
 *
 * NO se reutiliza `OrderRepository`: ese es el puerto INTERNO de `pedidos` -devuelve la fila
 * entera, sabe de paginacion y de altas- y sacarlo del modulo seria exactamente el
 * «repositorio compartido entre modulos» que la arquitectura prohibe.
 *
 * `pedidos` NO gana ningun caso de uso con esto: un tipo, una interfaz, un adaptador driven y
 * dos lineas de barril. Los seis casos de uso de QC-34 y `order-transitions.ts` quedan
 * intactos.
 */
import type { OrderStatus } from './order-classification';

/** Lo que otro modulo puede saber de un pedido: su identidad y su ESTADO, y nada mas. Ni el
 *  numero, ni la receta, ni las cantidades (mismo criterio que `MemberCandidate` de QC-84):
 *  lo que no esta en el tipo no se puede filtrar por descuido.
 *
 *  `status` es el `OrderStatus` de QC-34, IMPORTADO y no copiado: una segunda lista de
 *  estados se desincronizaria en silencio de la tabla de transiciones. */
export type OrderAssignmentTarget = {
  readonly id: string;
  readonly status: OrderStatus;
};

export interface OrderCatalog {
  /** `null` = no existe o esta dado de baja: para quien pregunta son el mismo caso (QC-34
   *  R33). Un pedido CANCELADO si vuelve -tiene estado propio precisamente para no
   *  desaparecer-, y quien lo consulta decide que hacer con el. */
  findAliveById(id: string): Promise<OrderAssignmentTarget | null>;
}
