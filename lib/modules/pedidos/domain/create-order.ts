import { requirePermission, type Actor } from './actor';
import {
  DuplicateOrderNumberError,
  RecipeNotFoundError,
  UnitNotFoundError,
  ValidationError,
} from './errors';
import { DEFAULT_ORDER_STATUS } from './order-classification';
import { createOrderSchema, type EditableOrderStatus } from './order-input';
import { formatOrderNumber, type OrderNumber } from './order-number';

import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderRepository } from '../ports/order-repository';

/**
 * El estado con el que nace un pedido (R9). `DEFAULT_ORDER_STATUS` esta tipado como
 * `OrderStatus` -los CUATRO valores- y `NewOrder.status` es `EditableOrderStatus` -los tres
 * que una escritura normal puede poner-, asi que hace falta estrechar. Se estrecha UNA vez,
 * aqui, y con una comprobacion REAL en vez de un `as`: el dia que alguien cambiara el defecto
 * del esquema a `CANCELADO`, esto reventaria al cargar el modulo en lugar de abrir un segundo
 * camino hacia una cancelacion sin motivo (`design.md > 8`).
 */
const STATUS_DE_ALTA: EditableOrderStatus = ((status = DEFAULT_ORDER_STATUS) => {
  if (status === 'CANCELADO') {
    throw new Error('DEFAULT_ORDER_STATUS no puede ser CANCELADO: cancelar es `cancelOrder`.');
  }
  return status;
})();

export type CreateOrderDeps = {
  readonly orders: OrderRepository;
  /** Contrato PUBLICO de `recetas` (R15, R43): `pedidos` no consulta `prisma.recipe`. */
  readonly recipes: RecipeCatalog;
  /** Contrato PUBLICO de `unidades` (R16, R43). */
  readonly units: UnitCatalog;
  /**
   * El reloj entra INYECTADO -mismo patron que `recetas` y `proveedores`- para que el test
   * lo pueda fijar sin tocar el reloj global. Aqui NO se lee `next/headers` ni ninguna
   * sesion: eso violaria R1.
   */
  readonly now?: () => Date;
};

/** Lo que devuelve el alta (R8): el identificador y el correlativo, ya compuesto con la
 *  UNICA definicion del formato (R14). El texto no se persiste. */
export type CreatedOrder = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly numberText: string;
};

/**
 * Alta de pedido (R8, R9, R10, R15, R16).
 *
 * `requirePermission(actor, 'pedidos.modificar')` es la PRIMERA linea, antes de `zod` y antes
 * de tocar ningun puerto (QC-74 R12): un actor sin ese permiso no dispara ni la validacion ni
 * una sola lectura, y el test de autorizacion lo demuestra con dobles que fallan si los llaman.
 *
 * R6: los DOS autores salen del actor de la sesion, jamas de la entrada -el esquema ni
 * siquiera declara esos campos-. El puerto recibe un solo `actorId` y el adaptador lo
 * escribe en las dos columnas.
 *
 * R10: el ano del correlativo y `created_at` salen del MISMO instante. Por eso se toma
 * `now()` UNA vez y se pasan los dos derivados del mismo `Date`: si el ano se calculara de
 * otro reloj, un alta a las 23:59:59.999 UTC del 31 de diciembre chocaria contra el `CHECK`
 * `orders_order_year_matches_created_at` de QC-33 R41.
 */
export function createCreateOrder(
  deps: CreateOrderDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<CreatedOrder> {
  const now = deps.now ?? (() => new Date());

  return async function createOrder(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<CreatedOrder> {
    requirePermission(actor, 'pedidos.modificar');

    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // R15: la receta tiene que existir y estar VIVA, y se comprueba ANTES de llegar al
    // repositorio, asi que un alta rechazada no crea ni modifica ninguna fila. Un id que no
    // existe simplemente no vuelve del catalogo; uno dado de baja vuelve con
    // `isDeleted: true`, y las dos cosas se rechazan igual en el alta (en la EDICION no: ver
    // R25 en `update-order.ts`).
    const [recipe] = await deps.recipes.findRefsIncludingDeleted([data.recipeId]);
    if (recipe === undefined || recipe.isDeleted) throw new RecipeNotFoundError();

    // R16: `units` no tiene borrado logico (QC-32 decision 11), asi que «existe» y «esta
    // vigente» son lo mismo y basta con que el id vuelva.
    const [unit] = await deps.units.findRefs([data.unitId]);
    if (unit === undefined) throw new UnitNotFoundError();

    const instant = now();

    // R9: el estado de alta es siempre `PENDIENTE` y lo pone este caso de uso, no la
    // entrada. La prioridad por defecto (`BAJA`) ya la aplico el esquema.
    const created = await deps.orders.create(
      { ...data, status: STATUS_DE_ALTA },
      instant.getUTCFullYear(),
      actor.id,
      instant,
    );

    // El `23505` del indice unico del correlativo llega como resultado DISCRIMINADO -lo
    // tradujo el adaptador-, nunca como excepcion de Prisma (`design.md > 4.2`).
    if (created === 'duplicate_number') throw new DuplicateOrderNumberError();

    return { id: created.id, number: created.number, numberText: formatOrderNumber(created.number) };
  };
}
