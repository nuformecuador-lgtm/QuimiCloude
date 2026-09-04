import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Page, PageQuery } from '../../../domain/page';
import type { NewOrder, OrderFilters, OrderRow } from '../../../domain/order-view';

/**
 * Implementa `OrderRepository` (`ports/order-repository.ts`, `design.md > 4.2`, `> 7.4`,
 * `> 10`) con Prisma. UNICO archivo del modulo `pedidos` que importa `@prisma/client`,
 * `@/lib/shared/db/prisma` y `@/lib/shared/pagination` (R52, R53).
 *
 * NO HAY NI UN `include` NI UN `select` hacia `recipes`, `units` ni `users` (R53, QC-33
 * R31/R32): el nombre de la receta y el de la unidad los resuelve el caso de uso por los
 * contratos publicos de `recetas` y `unidades`, y los dos autores viajan como
 * IDENTIFICADORES en crudo (R46). Por eso QC-33 dejo las cuatro FK como escalares sin
 * `@relation`: aqui no hay relacion que navegar ni por descuido.
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura y de TODA escritura `…Alive`, nunca
 * en un `if` posterior (R40): el filtro es del puerto, y por eso ningun caso de uso puede
 * olvidarlo.
 *
 * Los importes viajan como CADENA decimal por el puerto -el dominio no puede importar
 * `Prisma.Decimal` (`docs/architecture.md > Anti-patrones`)-: `toDecimalInput` y
 * `fromDecimal` son el UNICO sitio del modulo que convierte en los dos sentidos, y a la
 * salida siempre con `.toFixed(4)`, que es la escala de la columna `Decimal(14, 4)`.
 *
 * Los SQLSTATE NO cruzan hacia el dominio (R56, `design.md > 7.4`): se traducen a resultados
 * DISCRIMINADOS. Lo que no se sabe traducir se RELANZA: aqui no hay ni un `catch` vacio.
 */

/** `select` unico de las dos lecturas. `deleted_at` NO sale: ninguna consulta devuelve
 *  borrados (R40), asi que seria siempre `null` e invitaria a filtrar en memoria lo que ya
 *  filtro el `where`. */
const ORDER_SELECT = {
  id: true,
  orderYear: true,
  orderSequence: true,
  recipeId: true,
  quantity: true,
  unitId: true,
  unitPrice: true,
  priority: true,
  status: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.OrderSelect;

type OrderPrismaRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

/** Cadena decimal(14,4) del puerto -> `Prisma.Decimal` para escribir. */
export function toDecimalInput(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** `Prisma.Decimal` de una lectura -> cadena con la escala EXACTA de la columna. */
export function fromDecimal(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

/** Fila de Prisma -> `OrderRow` del puerto. Sin ninguna traduccion de negocio: el
 *  correlativo se agrupa en `number` porque el ano y la posicion son UN solo dato
 *  (`domain/order-number.ts`), y el texto visible lo compone el dominio (R14). */
export function toOrderRow(row: OrderPrismaRow): OrderRow {
  return {
    id: row.id,
    number: { year: row.orderYear, sequence: row.orderSequence },
    recipeId: row.recipeId,
    quantity: fromDecimal(row.quantity),
    unitId: row.unitId,
    unitPrice: fromDecimal(row.unitPrice),
    priority: row.priority,
    status: row.status,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * SQLSTATE de un error de Postgres, leido del campo ESTRUCTURADO del conector y jamas del
 * texto humano del mensaje: en esta maquina Postgres responde en espanol (`design.md > 12`,
 * primer aviso al implementer). Mismo criterio -y misma tecnica- que `sqlStateOf` de
 * `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`.
 *
 * Un `$queryRaw` que viola una restriccion llega como `PrismaClientKnownRequestError` con
 * `code: 'P2010'` y el SQLSTATE en `meta.code`; algunas rutas del conector lo entregan como
 * `PrismaClientUnknownRequestError`, y entonces el codigo sigue estando incrustado y
 * estructurado en el mensaje del conector (`code: "23505"`), que no es texto traducible.
 */
function sqlStateOf(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const match = /\bcode:\s*"(\d{5})"/.exec(error.message);
    if (match !== null) return match[1] as string;
  }
  return null;
}

/** El indice unico del correlativo (QC-33 R21), declarado en `db/schema.prisma` con ese
 *  `map`. Es el UNICO `23505` que esta feature sabe traducir. */
const ORDER_NUMBER_UNIQUE_INDEX = 'orders_order_year_order_sequence_key';

/**
 * ¿Es este error el `23505` del indice unico del correlativo (`design.md > 4.2`)?
 *
 * Dos condiciones, y hacen falta las dos: el SQLSTATE -campo estructurado- tiene que ser
 * `23505`, y el NOMBRE DEL INDICE tiene que aparecer en la carga del error. Buscar el nombre
 * NO es decidir por el texto del mensaje: un nombre de restriccion es un identificador de la
 * base, Postgres nunca lo traduce, y es lo unico que distingue este unico de cualquier otro
 * que `orders` llegue a tener. Si el SQLSTATE es `23505` pero no se puede identificar el
 * indice, NO se asume: se relanza crudo, que es mejor que traducirlo mal (mismo criterio
 * conservador que `recipe-prisma.ts` y `supplier-prisma.ts`).
 */
export function isDuplicateOrderNumber(error: unknown): boolean {
  if (sqlStateOf(error) !== '23505') return false;
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  return `${detalle}\n${bruto}`.includes(ORDER_NUMBER_UNIQUE_INDEX);
}

/** Lo que devuelve el `RETURNING` del alta: el identificador y el correlativo que acaba de
 *  entregar la secuencia. Nada mas viaja de vuelta, porque nada mas lo decide la base. */
type CreatedOrderRow = {
  readonly id: string;
  readonly order_year: number;
  readonly order_sequence: number;
};

/**
 * `create` de `OrderRepository` (R6, R8, R10, R11, R13).
 *
 * UNA SOLA SENTENCIA, y va con `$queryRaw` -no con la API tipada- por un motivo concreto
 * (`design.md > 4.2`): `next_order_sequence($year)` tiene que evaluarse DENTRO del `INSERT`.
 * Leerla antes, en otro viaje, seria el mismo numero con dos idas y venidas y sin ganar nada.
 * Es la UNICA operacion del modulo que no usa la API tipada.
 *
 * UN SOLO RELOJ (R10): `created_at`, `updated_at` y el ANO del correlativo salen del MISMO
 * `now` que fijo el caso de uso. Si el ano se calculara de otro reloj -o se dejara el
 * `DEFAULT CURRENT_TIMESTAMP` de la columna-, un alta a las 23:59:59.999 UTC del 31 de
 * diciembre podria escribir un ano y una fecha de anos distintos y el `CHECK`
 * `orders_order_year_matches_created_at` (QC-33 R41) la rechazaria con `23514`. Es la trampa
 * que QC-33 dejo avisada por escrito.
 *
 * `created_by` Y `updated_by` se escriben con el MISMO `actorId` (R6): al nacer, el autor de
 * la creacion y el de la ultima modificacion son la misma persona. Ninguno de los dos sale de
 * la entrada.
 *
 * El `status` va PARAMETRIZADO con `data.status` y no como literal: quien decide el estado de
 * alta es el caso de uso (R9, `create-order.ts`), y `NewOrder.status` es
 * `EditableOrderStatus`, que no puede EXPRESAR la cancelacion (`design.md > 8`, capa 1). Un
 * literal aqui haria que este adaptador ignorara en silencio lo que el puerto recibe.
 *
 * Los parametros llevan CAST EXPLICITO porque en un `$queryRaw` no hay mapeo de Prisma que
 * los tipe: `::uuid`, `::numeric`, `::timestamptz` y los dos enums. Interpolacion de cadenas,
 * JAMAS: el template tag parametriza.
 */
export async function createOrder(
  data: NewOrder,
  year: number,
  actorId: string,
  now: Date,
): Promise<OrderRow | 'duplicate_number'> {
  try {
    const filas = await prisma.$queryRaw<readonly CreatedOrderRow[]>`
      INSERT INTO "orders" (
        "order_year", "order_sequence", "recipe_id", "quantity", "unit_id", "unit_price",
        "priority", "status", "created_by", "updated_by", "created_at", "updated_at"
      ) VALUES (
        ${year}::integer,
        next_order_sequence(${year}::integer),
        ${data.recipeId}::uuid,
        ${data.quantity}::numeric,
        ${data.unitId}::uuid,
        ${data.unitPrice}::numeric,
        ${data.priority}::"OrderPriority",
        ${data.status}::"OrderStatus",
        ${actorId}::uuid,
        ${actorId}::uuid,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      RETURNING "id", "order_year", "order_sequence"
    `;

    const fila = filas[0];
    if (fila === undefined) {
      // Un `INSERT ... RETURNING` que no devuelve fila no tiene lectura posible: no se
      // inventa un pedido con id vacio, se propaga con contexto (`docs/conventions.md`).
      throw new Error('El INSERT de pedido no devolvio ninguna fila.');
    }

    // El resto de la fila es exactamente lo que se acaba de escribir, asi que no hace falta
    // un segundo viaje para leerlo. Los importes se normalizan con la MISMA funcion que usa
    // la lectura, para que el alta y la consulta no devuelvan dos formatos del mismo numero.
    return {
      id: fila.id,
      number: { year: Number(fila.order_year), sequence: Number(fila.order_sequence) },
      recipeId: data.recipeId,
      quantity: fromDecimal(toDecimalInput(data.quantity)),
      unitId: data.unitId,
      unitPrice: fromDecimal(toDecimalInput(data.unitPrice)),
      priority: data.priority,
      status: data.status,
      // El motivo solo existe en un pedido cancelado, y cancelar es `cancelAlive` (R26, R30).
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    };
  } catch (error) {
    // R13, `design.md > 4.2`: en operacion normal la secuencia impide la colision; el indice
    // es lo que impide el duplicado si alguien inserta por otra via. El dominio recibe un
    // resultado DISCRIMINADO, jamas un SQLSTATE.
    if (isDuplicateOrderNumber(error)) return 'duplicate_number';
    throw error;
  }
}

/** `findAliveById` (R33, R40): `deleted_at IS NULL` en el `where`, no en un `if` posterior.
 *  Un pedido CANCELADO si vuelve -tiene estado propio precisamente para no desaparecer-. */
export async function findAliveOrderById(id: string): Promise<OrderRow | null> {
  const row = await prisma.order.findFirst({
    where: { id, deletedAt: null },
    select: ORDER_SELECT,
  });
  return row === null ? null : toOrderRow(row);
}

/**
 * `listAlive` (R34-R41).
 *
 * PAGINACION: `toOffsetLimit`/`buildPage` de `lib/shared/pagination` se llaman AQUI (R37,
 * `design.md > 10`), porque `domain/` no puede importar `lib/shared/**`. El `limit` que llega
 * a Prisma -y el `pageSize` que sale en la `Page`- es el ACOTADO que devuelve `toOffsetLimit`
 * (defecto 10, tope 25, R35), nunca el que pidio el llamante: pasarle el pedido a `buildPage`
 * dejaria un `totalPages` mentiroso aunque el `LIMIT` de SQL fuera correcto.
 *
 * ORDEN (R41): `priority DESC, created_at ASC, order_year ASC, order_sequence ASC`.
 * `priority DESC` da `CRITICA -> ALTA -> MEDIA -> BAJA` porque Postgres ordena un enum por su
 * ORDEN DE DECLARACION, que QC-33 R16 fijo de menor a mayor -por eso reordenar esas cuatro
 * lineas del enum cambiaria el listado, y el test estatico de QC-33 lo vigila-. El desempate
 * por el correlativo hace el orden TOTAL, y eso es lo que hace la paginacion estable: sin el,
 * dos pedidos creados en el mismo milisegundo podrian salir en dos paginas o en ninguna.
 *
 * FILTROS (R38): estado y prioridad, opcionales y combinables. `deleted_at IS NULL` NO es un
 * filtro opcional: va siempre (R40), y por eso no esta en `OrderFilters`.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany`.
 */
export async function listAliveOrders(
  filters: OrderFilters,
  query: PageQuery,
): Promise<Page<OrderRow>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);

  const where: Prisma.OrderWhereInput = { deletedAt: null };
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.priority !== undefined) where.priority = filters.priority;

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
        { orderYear: 'asc' },
        { orderSequence: 'asc' },
      ],
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPage(rows.map(toOrderRow), total, query.page, limit);
}

/**
 * `updateAlive` (R6, R20, R33, R40).
 *
 * `updateMany` con `deletedAt: null` en el `where` y no `update`: si el pedido no existe o ya
 * esta borrado, `count` sale 0 y se devuelve `'not_found'` en vez de lanzar.
 *
 * `data` NUNCA incluye `createdBy` ni `createdAt` (R6): conservar el autor y el instante de
 * la creacion es la mitad de R6 que solo se puede demostrar aqui. Tampoco incluye
 * `cancellationReason` ni puede escribir la cancelacion: `NewOrder.status` es
 * `EditableOrderStatus` y el `typecheck` es la primera de las cuatro capas de `design.md > 8`.
 *
 * `updatedAt` se escribe con el `now` INYECTADO y no con el `@updatedAt` de Prisma, para que
 * el reloj sea el mismo que fijo el caso de uso.
 */
export async function updateAliveOrder(
  id: string,
  data: NewOrder,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { id, deletedAt: null },
    data: {
      recipeId: data.recipeId,
      quantity: toDecimalInput(data.quantity),
      unitId: data.unitId,
      unitPrice: toDecimalInput(data.unitPrice),
      priority: data.priority,
      status: data.status,
      updatedAt: now,
      updatedBy: actorId,
    },
  });
  return count === 1 ? 'ok' : 'not_found';
}

/**
 * `cancelAlive` (R26, R28, R29, R30, R40). UNICO metodo capaz de escribir el estado cancelado
 * y el motivo, y los escribe JUNTOS, en la MISMA sentencia: el `CHECK`
 * `orders_cancellation_reason_matches_status` exige que el motivo exista si y solo si el
 * estado es el cancelado, asi que separarlos en dos escrituras seria imposible por
 * construccion.
 *
 * El motivo llega YA recortado y con el tope de 500 aplicado por `cancelOrderSchema` (R27):
 * aqui no se recorta, no se trunca y no se vuelve a validar nada.
 */
export async function cancelAliveOrder(
  id: string,
  reason: string,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { id, deletedAt: null },
    data: {
      status: 'CANCELADO',
      cancellationReason: reason,
      updatedAt: now,
      updatedBy: actorId,
    },
  });
  return count === 1 ? 'ok' : 'not_found';
}

/**
 * `softDeleteAlive` (R6, R31, R40). Borrado LOGICO: marca `deleted_at` -y sella
 * `updated_at`/`updated_by`-, JAMAS `prisma.order.delete`. La fila se conserva entera y su
 * correlativo no se libera ni se reutiliza (R13).
 *
 * Que un pedido entregado o cancelado no se borre lo comprueba el caso de uso (R32) y ademas
 * lo impide el `CHECK orders_delivered_not_deleted` en la base. Ese `23514` NO se traduce a
 * un resultado discriminado a proposito: significa que la comprobacion de aplicacion se
 * salto, y un error sin traducir es exactamente lo que hay que ver en ese caso.
 */
export async function softDeleteAliveOrder(
  id: string,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return count === 1 ? 'ok' : 'not_found';
}
