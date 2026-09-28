import { requirePermission, type Actor } from './actor';
import { RecipeNotFoundError, ValidationError } from './errors';
import { DEFAULT_ORDER_STATUS } from './order-classification';
import { createOrderSchema, type EditableOrderStatus } from './order-input';
import { formatOrderNumber, type OrderNumber } from './order-number';
import { buildRequirement } from './order-requirement';
import { resolveDistribution } from './resolve-distribution';
import { resolveIngredientsCost } from './resolve-ingredients-cost';
import type { OrderScope } from './order-scope';

import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

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
  /** Contrato PUBLICO de `recetas` (R15, R43): `pedidos` no consulta `prisma.recipe`.
   *
   *  QC-35bis (2026-09-07): era el primero de DOS catalogos. El de `unidades` se fue con la
   *  unidad del pedido, y con el la comprobacion de R16. */
  readonly recipes: RecipeCatalog;
  /** Contrato PUBLICO de `inventario`: los lotes con existencia con los que se costea. */
  readonly products: ProductCatalog;
  /** Contrato PUBLICO de `unidades`: la unidad del pedido (R41) y las de cada presentacion del
   *  reparto, para convertir y para el coste. */
  readonly units: UnitCatalog;
  /** Contrato PUBLICO de `inventario`: las presentaciones del reparto, para comprobar que
   *  existen en la empresa de quien escribe y copiar su contenido (R3). No se le pasan al
   *  coste: el reparto no cambia nada de lo que ese calculo hace. */
  readonly presentations: PresentationCatalog;
  /** La transaccion compartida con `inventario`: crea el pedido, aparta su material y fija
   *  `reserved_at`, las tres o ninguna. */
  readonly unitOfWork: OrderUnitOfWork;
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
 * Alta de pedido.
 *
 * `requirePermission(actor, 'pedidos.modificar')` es la PRIMERA linea, antes de `zod` y antes
 * de tocar ningun puerto: un actor sin ese permiso no dispara ni la validacion ni una sola
 * lectura, ni siquiera abre la transaccion, y el test de autorizacion lo demuestra con
 * dobles que fallan si los llaman.
 *
 * R6: los DOS autores salen del actor de la sesion, jamas de la entrada -el esquema ni
 * siquiera declara esos campos-. El puerto recibe un solo `actorId` y el adaptador lo
 * escribe en las dos columnas.
 *
 * R10: el ano del correlativo y `created_at` salen del MISMO instante. Por eso se toma
 * `now()` UNA vez y se pasan los dos derivados del mismo `Date`: si el ano se calculara de
 * otro reloj, un alta a las 23:59:59.999 UTC del 31 de diciembre chocaria contra el `CHECK`
 * `orders_order_year_matches_created_at` de QC-33 R41.
 *
 * El choque del correlativo (`orders_company_year_sequence_key`) ya no se traduce aqui: lo
 * reintenta `OrderUnitOfWork` con una transaccion nueva, y si los tres intentos chocan la
 * excepcion sube sin traducir.
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

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // R15: la receta tiene que existir y estar VIVA, y se comprueba ANTES de llegar al
    // repositorio, asi que un alta rechazada no crea ni modifica ninguna fila. Un id que no
    // existe simplemente no vuelve del catalogo; uno dado de baja vuelve con
    // `isDeleted: true`, y las dos cosas se rechazan igual en el alta (en la EDICION no: ver
    // R25 en `update-order.ts`).
    const [recipe] = await deps.recipes.findRefsIncludingDeleted([data.recipeId], actor.companyId);
    if (recipe === undefined || recipe.isDeleted) throw new RecipeNotFoundError();

    const ingredientsCost = await resolveIngredientsCost(
      deps.recipes,
      deps.products,
      deps.units,
      data.recipeId,
      data.quantity,
      actor.companyId,
    );

    // R41, R6-R8, R35, R36, R42: la unidad y el reparto se resuelven y se validan contra el
    // total ANTES de escribir nada. Un reparto vacio (`[]`) es valido (R9).
    const presentationLines = await resolveDistribution(
      deps.presentations,
      deps.units,
      actor.companyId,
      data.quantity,
      data.unitId,
      data.presentationLines,
    );

    const instant = now();

    // R9: el estado de alta es siempre `PENDIENTE` y lo pone este caso de uso, no la
    // entrada. La prioridad por defecto (`BAJA`) ya la aplico el esquema.
    const created = await deps.unitOfWork.run(async (transaction) => {
      const order = await transaction.orders.create(
        { ...data, status: STATUS_DE_ALTA, presentationLines },
        instant.getUTCFullYear(),
        actor.id,
        instant,
        ingredientsCost,
        scope,
      );

      // Una receta sin lineas da una necesidad vacia, y `syncForOrder` la sincroniza sin
      // apartar nada ni fallar. Se lee con `scope.recipes`, sobre el cliente de ESTA
      // transaccion: pedir una segunda conexion mientras esta retiene la suya desperdiciaria
      // una conexion del pool.
      const content = await transaction.recipes.findExecutionContentById(data.recipeId, actor.companyId);
      const requirement = buildRequirement(content?.lines ?? [], data.quantity);

      const outcome = await transaction.reservations.syncForOrder({
        orderId: order.id,
        companyId: actor.companyId,
        requirement,
        actorId: actor.id,
        now: instant,
      });

      await transaction.orders.setReservedAt(
        order.id,
        outcome.kind === 'reserved' ? instant : null,
        scope,
      );

      return order;
    });

    return { id: created.id, number: created.number, numberText: formatOrderNumber(created.number) };
  };
}
