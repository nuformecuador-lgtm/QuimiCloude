import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import {
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  type OrderPriority,
  type OrderStatus,
} from '../../../domain/order-classification';

import { companyScopeColumns, orderCompanyScope } from './company-scope';
import { dateRangeCondition, numberRangeCondition, selectCondition } from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { OrderScope } from '../../../domain/order-scope';
import type { NewOrder, OrderRow } from '../../../domain/order-view';

/**
 * Implementa `OrderRepository` (`ports/order-repository.ts`, `design.md > 4.2`, `> 7.4`,
 * `> 10`) con Prisma. UNICO archivo del modulo `pedidos` que importa `@prisma/client`,
 * `@/lib/shared/db/prisma` y `@/lib/shared/pagination` (R52, R53).
 *
 * NO HAY NI UN `include` NI UN `select` hacia `recipes` ni `users` (R53, QC-33 R31/R32): el
 * nombre de la receta lo resuelve el caso de uso por el contrato publico de `recetas`, y los dos
 * autores viajan como IDENTIFICADORES en crudo (R46). Por eso QC-33 dejo las FK como escalares
 * sin `@relation`: aqui no hay relacion que navegar ni por descuido.
 *
 * QC-35bis (2026-09-07): `unit_id` y `unit_price` salieron de `orders`
 * (`db/migrations/20260907120000_orders_drop_unit_and_unit_price`), asi que este adaptador ya no
 * los selecciona, no los inserta, no los actualiza, no los ordena y no los filtra. La FK hacia
 * `units` cayo con la columna.
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura y de TODA escritura `…Alive`, nunca
 * en un `if` posterior (R40): el filtro es del puerto, y por eso ningun caso de uso puede
 * olvidarlo.
 *
 * La cantidad viaja como CADENA decimal por el puerto -el dominio no puede importar
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
 * SQLSTATE de un error de Postgres, leido del campo ESTRUCTURADO del conector y jamas del texto
 * del mensaje: en esta maquina Postgres responde en espanol y el detalle del choque ni siquiera
 * nombra la restriccion. Un `$queryRaw` que viola una restriccion llega como
 * `PrismaClientKnownRequestError` con `code: 'P2010'` y el SQLSTATE en `meta.code`.
 */
function sqlStateOf(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const meta: unknown = error.meta;
  if (typeof meta !== 'object' || meta === null || !('code' in meta)) return null;
  const code: unknown = (meta as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Duplicado del correlativo: SQLSTATE `23505`, sin leer texto. Es seguro solo porque se usa acotado
 *  al `INSERT` de `createOrder`, que no escribe `id` (lo genera `gen_random_uuid()`): de los unicos
 *  de `orders` solo puede chocar `orders_company_year_sequence_key`. */
export function isDuplicateOrderNumber(error: unknown): boolean {
  return sqlStateOf(error) === '23505';
}

/** Lo que devuelve el `RETURNING` del alta: el identificador y el correlativo que acaba de
 *  calcular el propio `INSERT`, `max(order_sequence) + 1` de esa empresa y ese ano bajo el lock
 *  de aviso. Nada mas viaja de vuelta, porque nada mas lo decide la base. */
type CreatedOrderRow = {
  readonly id: string;
  readonly order_year: number;
  readonly order_sequence: number;
};

/** Lock de DOS enteros: es otro espacio de claves que el `pg_advisory_lock(bigint)` de
 *  `tests/helpers/test-database.ts`, asi que no pueden colisionar. */
const ORDER_SEQUENCE_LOCK_NAMESPACE = 60;

/** La EMPRESA y el ANO van en la clave del lock: dos empresas —o dos anos— no se hacen cola entre
 *  si. */
const ORDER_SEQUENCE_LOCK_KEY_PREFIX = 'orders_sequence:';

/** Tres intentos y ni uno mas. El lock hace que el choque sea casi
 *  imposible; el indice unico es la garantia. Reintentar sin techo convertiria un duplicado real
 *  —por ejemplo el que insertara otra via— en un bucle infinito. */
const CREATE_ORDER_MAX_ATTEMPTS = 3;

/**
 * `create` de `OrderRepository`: SQL crudo en una transaccion, porque el maximo del correlativo
 * tiene que evaluarse DENTRO del `INSERT`, sin ventana entre leerlo y escribirlo. Es la UNICA
 * operacion del modulo que no usa la API tipada.
 *
 * El lock va en una sentencia APARTE y ANTERIOR: en `READ COMMITTED` cada sentencia toma su
 * instantanea al empezar, asi que dentro del `INSERT` la sesion que espera leeria el mismo maximo
 * que la que comitea. Es `xact` y se pide uno solo: se suelta al terminar y no puede interbloquear.
 *
 * El maximo no filtra `deleted_at` ni el estado: un pedido borrado o cancelado conserva su numero,
 * y los huecos existentes se conservan. La empresa del ambito va, parametrizada con `::uuid`, en la
 * columna que se escribe y en el subselect del maximo.
 *
 * UN SOLO RELOJ: `created_at`, `updated_at` y el ANO salen del mismo `now`; con otro reloj, un alta
 * en el cambio de ano violaria `orders_order_year_matches_created_at` con `23514`. `created_by` y
 * `updated_by` llevan el mismo `actorId`, y el `status` va parametrizado porque lo decide el caso
 * de uso.
 *
 * El reintento va FUERA de `prisma.$transaction`: una transaccion abortada por el `23505` no
 * admite ni una sentencia mas. Agotados los intentos, `'duplicate_number'`. Ninguna salida lleva
 * `companyId`.
 */
export async function createOrder(
  data: NewOrder,
  year: number,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<OrderRow | 'duplicate_number'> {
  const { companyId } = companyScopeColumns(scope);
  const lockKey = `${ORDER_SEQUENCE_LOCK_KEY_PREFIX}${companyId}:${String(year)}`;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const fila = await prisma.$transaction(async (tx) => {
        // `$executeRaw` y no `$queryRaw`: `pg_advisory_xact_lock` devuelve `void`, y el cliente no
        // sabe deserializar una columna de ese tipo.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${ORDER_SEQUENCE_LOCK_NAMESPACE}::int, hashtext(${lockKey}::text))`,
        );

        const filas = await tx.$queryRaw<readonly CreatedOrderRow[]>(Prisma.sql`
          INSERT INTO "orders" (
            "company_id", "order_year", "order_sequence", "recipe_id", "quantity",
            "priority", "status", "created_by", "updated_by", "created_at", "updated_at"
          ) VALUES (
            ${companyId}::uuid,
            ${year}::integer,
            (SELECT COALESCE(max("order_sequence"), 0) + 1
               FROM "orders"
              WHERE "company_id" = ${companyId}::uuid
                AND "order_year" = ${year}::integer),
            ${data.recipeId}::uuid,
            ${data.quantity}::numeric,
            ${data.priority}::"OrderPriority",
            ${data.status}::"OrderStatus",
            ${actorId}::uuid,
            ${actorId}::uuid,
            ${now}::timestamptz,
            ${now}::timestamptz
          )
          RETURNING "id", "order_year", "order_sequence"
        `);

        const row = filas[0];
        if (row === undefined) {
          // Un `INSERT ... RETURNING` que no devuelve fila no tiene lectura posible: no se
          // inventa un pedido con id vacio, se propaga con contexto (`docs/conventions.md`).
          throw new Error('El INSERT de pedido no devolvio ninguna fila.');
        }
        return row;
      });

      // El resto de la fila es exactamente lo que se acaba de escribir, asi que no hace falta
      // un segundo viaje para leerlo. Los importes se normalizan con la MISMA funcion que usa
      // la lectura, para que el alta y la consulta no devuelvan dos formatos del mismo numero.
      return {
        id: fila.id,
        number: { year: Number(fila.order_year), sequence: Number(fila.order_sequence) },
        recipeId: data.recipeId,
        quantity: fromDecimal(toDecimalInput(data.quantity)),
        priority: data.priority,
        status: data.status,
        // El motivo solo existe en un pedido cancelado, y cancelar es `cancelAlive`.
        cancellationReason: null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      };
    } catch (error) {
      // Lo que no se sabe traducir se RELANZA: el dominio recibe un resultado DISCRIMINADO, jamas
      // un SQLSTATE, y aqui no hay ni un `catch` vacio.
      if (!isDuplicateOrderNumber(error)) throw error;
      if (attempt >= CREATE_ORDER_MAX_ATTEMPTS) return 'duplicate_number';
    }
  }
}

/** `findAliveById`: `deleted_at IS NULL` Y EL AMBITO en el `where`, no en un `if` posterior. Un
 *  pedido de otra empresa vuelve como `null`, igual que uno que no existe. Un pedido CANCELADO si
 *  vuelve -tiene estado propio precisamente para no desaparecer-. */
export async function findAliveOrderById(
  id: string,
  scope: OrderScope,
): Promise<OrderRow | null> {
  const row = await prisma.order.findFirst({
    where: { AND: [orderCompanyScope(scope), { id, deletedAt: null }] },
    select: ORDER_SELECT,
  });
  return row === null ? null : toOrderRow(row);
}

/**
 * `listAlive` (R34-R41).
 *
 * PAGINACION: `toOffsetLimit`/`buildPage` de `lib/shared/pagination` se llaman AQUI (R37,
 * `design.md > 10`), porque `domain/` no puede importar `lib/shared/**
 * Desempate ESTABLE por identificador (R10). El orden de hoy ya era total gracias al
 * correlativo, pero un orden pedido por el contrato -por `status`, por `quantity`- empata sin
 * remedio: sin este ultimo criterio dos filas empatadas pueden intercambiarse -o perderse-
 * entre paginas, porque el orden de las empatadas no esta definido.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.OrderOrderByWithRelationInput;

/**
 * Orden POR DEFECTO: exactamente el de hoy (R11, R41), `priority DESC, created_at ASC,
 * order_year ASC, order_sequence ASC`. Sin `sort`, la lista no se mueve.
 *
 * `priority DESC` da `CRITICA -> ALTA -> MEDIA -> BAJA` porque Postgres ordena un enum por su
 * ORDEN DE DECLARACION, que QC-33 R16 fijo de menor a mayor -por eso reordenar esas cuatro
 * lineas del enum cambiaria el listado, y el test estatico de QC-33 lo vigila-. **No es orden
 * alfabetico**: alfabeticamente `ALTA` iria antes que `MEDIA`, y de mayor a menor la lista
 * empezaria por `MEDIA` en vez de por `CRITICA`.
 *
 * Se construye en CADA llamada, no como constante compartida: Prisma exige un array mutable en
 * `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la mutara para todos.
 */
function defaultOrderBy(): Prisma.OrderOrderByWithRelationInput[] {
  return [
    { priority: 'desc' },
    { createdAt: 'asc' },
    { orderYear: 'asc' },
    { orderSequence: 'asc' },
  ];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * DOS COSAS QUE NO SON OBVIAS:
 *
 *   1. **`orderNumber` es la UNICA traduccion uno-a-dos del contrato** (`design.md > 5`): el
 *      numero visible NO esta guardado -lo compone `formatOrderNumber`-, es el par
 *      `(order_year, order_sequence)`. Se presenta como UN campo ordenable y aqui se traduce a
 *      DOS criterios, el ano primero. Ordenar por el texto compuesto seria ordenar
 *      alfabeticamente, y `2026-0000010` iria antes que `2026-0000009`... solo mientras los
 *      correlativos tengan el mismo numero de digitos; el par de enteros no tiene ese problema.
 *   2. **`priority` y `status` ordenan por el ORDEN DE DECLARACION del enum**, no por el
 *      alfabetico, porque son enums de Postgres. En `priority` ese orden ES el de la prioridad
 *      (QC-33 R16) y por eso es el que se quiere; esta escrito en `db/schema.prisma` y no se
 *      toca.
 *
 * Ninguna columna ordenable de `ORDER_QUERYABLE` es anulable, asi que aqui no hace falta
 * `nulls: 'last'`.
 *
 * El `default` NO puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta
 * declarado, pero el adaptador no puede depender de que su llamante lo haya hecho. Es defensa
 * en profundidad, y mantiene R5 cierto tambien aqui.
 */
export function orderOrderBy(sort: ListSort | null): Prisma.OrderOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'orderNumber':
      return [{ orderYear: dir }, { orderSequence: dir }, TIE_BREAKER];
    case 'priority':
      return [{ priority: dir }, TIE_BREAKER];
    case 'status':
      return [{ status: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'quantity':
      return [{ quantity: dir }, TIE_BREAKER];
    // QC-35bis (2026-09-07): `unitPrice` ya no es ordenable -salio de `ORDER_QUERYABLE` y de la
    // tabla-, asi que cae por el `default` como cualquier columna desconocida.
    default:
      return defaultOrderBy();
  }
}

/**
 * `select` del contrato -> `in` del enum correspondiente.
 *
 * El caso de uso ya poda los valores que no estan en el conjunto cerrado (R5, R25), pero el
 * adaptador vuelve a filtrar y no por desconfianza: es lo que le da el TIPO. `selectCondition`
 * devuelve `string[]` y Prisma exige `OrderStatus[]`; sin este filtro habria que mentirle al
 * compilador con un `as`, y un valor que no existe en el enum haria que Postgres rechazara la
 * consulta entera -que es justo lo que R5 prohibe-.
 */
function enumIn<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
): { in: T[] } | null {
  const kept = values.filter((value): value is T => (allowed as readonly string[]).includes(value));
  return kept.length === 0 ? null : { in: kept };
}

/**
 * Rango numerico del contrato -> rango en `Prisma.Decimal` (`design.md > 5`).
 *
 * `quantity` y `unit_price` son `DECIMAL(14,4)` y el `numberRange` de QC-55 emite `number`. La
 * conversion vive AQUI, en el adaptador: `docs/architecture.md > Anti-patrones` prohibe
 * comparar importes en coma flotante binaria, y el dominio ademas no puede importar
 * `@prisma/client`.
 */
function toDecimalRange(
  condition: { gte?: number; lte?: number },
): { gte?: Prisma.Decimal; lte?: Prisma.Decimal } {
  return {
    ...(condition.gte === undefined ? {} : { gte: new Prisma.Decimal(condition.gte) }),
    ...(condition.lte === undefined ? {} : { lte: new Prisma.Decimal(condition.lte) }),
  };
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. Devuelve `null` -y
 * el filtro no aparece en el `where`- cuando el campo no es filtrable aqui o cuando el valor no
 * acota nada (rango con los dos extremos nulos, `select` con lista VACIA: no haber elegido nada
 * NO es «ningun resultado», `design.md > 3.3`).
 *
 * Las CUATRO formas del contrato estan contempladas (R12). La de `text` no llega hoy -`orders`
 * no declara ningun campo de texto filtrable y ni siquiera busca (R17)-; se escribe igual
 * porque traducir es trabajo del adaptador y declarar manana un campo de texto no puede
 * depender de que alguien recuerde que aqui faltaba una rama.
 */
function orderFilterWhere(field: string, value: ListFilterValue): Prisma.OrderWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      if (field === 'status') {
        const enumCondition = enumIn<OrderStatus>(condition.in, ORDER_STATUS_VALUES);
        return enumCondition === null ? null : { status: enumCondition };
      }
      if (field === 'priority') {
        const enumCondition = enumIn<OrderPriority>(condition.in, ORDER_PRIORITY_VALUES);
        return enumCondition === null ? null : { priority: enumCondition };
      }
      return null;
    }
    case 'numberRange': {
      const condition = numberRangeCondition(value.min, value.max);
      if (condition === null) return null;
      if (field === 'quantity') return { quantity: toDecimalRange(condition) };
      if (field === 'orderYear') return { orderYear: condition };
      return null;
    }
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      if (field === 'createdAt') return { createdAt: condition };
      if (field === 'updatedAt') return { updatedAt: condition };
      return null;
    }
    case 'text':
      return null;
  }
}

/**
 * `where` UNICO del listado de pedidos: el mismo objeto para el `findMany` y para el `count`.
 * Tres capas, y ninguna sobra:
 *
 *   1. **`deletedAt: null` SIEMPRE** (R7, R40). NO es un filtro opcional y por eso nunca estuvo
 *      en los parametros del listado: `deletedAt` no es consultable en ninguna lista blanca y
 *      `sanitizeListQuery` lo poda ademas por su cuenta. Los CANCELADOS si salen -tienen estado
 *      propio en vez de desaparecer (R25)-; los borrados no salen nunca.
 *   2. **`recipeIds`**, cuando la busqueda resolvio un termino: acota a los pedidos de esas
 *      recetas. `null` significa que no hay busqueda y no acota nada; `[]` significa que ninguna
 *      receta caso y el `IN` vacio deja la pagina sin filas.
 *   3. **Los filtros, TODOS a la vez**: un `AND` explicito, de modo que una fila sale solo
 *      si los cumple todos. Estado y prioridad son dos de ellos (R25), ya no dos parametros.
 */
export function buildOrderWhere(
  query: ListQuery,
  recipeIds: readonly string[] | null,
  scope: OrderScope,
): Prisma.OrderWhereInput {
  const filters = Object.entries(query.filters)
    .map(([field, value]) => orderFilterWhere(field, value))
    .filter((condition): condition is Prisma.OrderWhereInput => condition !== null);

  // El AMBITO va PRIMERO y en su propio termino del `AND`, al lado de `deletedAt: null` y ANTES de
  // los filtros. NUNCA fundido con ellos ni al mismo nivel que un `OR`: un `OR` y el `companyId` en
  // el mismo objeto dejarian que un filtro AMPLIE lo visible en vez de acotarlo. `recipeIds` va en
  // su PROPIO termino del `AND`, entre el borrado y los filtros, por el mismo motivo.
  return {
    AND: [
      orderCompanyScope(scope),
      { deletedAt: null },
      ...(recipeIds === null ? [] : [{ recipeId: { in: [...recipeIds] } }]),
      ...filters,
    ],
  };
}

/**
 * `listAlive` con el CONTRATO GENERICO de consulta (QC-57 R10, R11, R13, R14, R15, R17, R25,
 * R29; QC-34 R34, R38, R40, R41).
 *
 * PAGINACION: `toOffsetLimit`/`buildPage` de `lib/shared/pagination` se llaman AQUI (R37,
 * `design.md > 10`), porque `domain/` no puede importar `lib/shared/**`. El `limit` que llega
 * a Prisma -y el `pageSize` que sale en la `Page`- es el ACOTADO que devuelve `toOffsetLimit`
 * (defecto 10, tope 25, R35, R29), nunca el que pidio el llamante: pasarle el pedido a
 * `buildPage` dejaria un `totalPages` mentiroso aunque el `LIMIT` de SQL fuera correcto. Pedir
 * 100 se ACOTA a 25, no se rechaza.
 *
 * ORDEN Y FILTROS VAN AL MOTOR, nunca a la pagina ya traida (R13): filtrar lo ya descargado es
 * justo lo que QC-22 y QC-26 rechazaron por enganoso, y ademas dejaria un `total` mentiroso.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (R14) -literalmente la
 * misma constante, no dos copias parecidas-.
 *
 * `recipeIds` es obligatorio, sin valor por defecto: las llamadas que no hablan de busqueda
 * pasan `null` explicito, que significa «sin busqueda, no acotar nada».
 */
export async function listAliveOrders(
  query: ListQuery,
  recipeIds: readonly string[] | null,
  scope: OrderScope,
): Promise<Page<OrderRow>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildOrderWhere(query, recipeIds, scope);

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: orderOrderBy(query.sort),
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
 * El AMBITO viaja EN EL `where`, junto a `deletedAt: null`: un pedido de otra empresa no se
 * actualiza y sale como `'not_found'`.
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
  scope: OrderScope,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { AND: [orderCompanyScope(scope), { id, deletedAt: null }] },
    data: {
      recipeId: data.recipeId,
      quantity: toDecimalInput(data.quantity),
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
 *
 * El AMBITO viaja EN EL `where`, junto a `deletedAt: null`: un pedido de otra empresa no se
 * cancela y sale como `'not_found'`.
 */
export async function cancelAliveOrder(
  id: string,
  reason: string,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { AND: [orderCompanyScope(scope), { id, deletedAt: null }] },
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
 *
 * El AMBITO viaja EN EL `where`: un pedido de otra empresa no se borra y sale como `'not_found'`.
 */
export async function softDeleteAliveOrder(
  id: string,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.order.updateMany({
    where: { AND: [orderCompanyScope(scope), { id, deletedAt: null }] },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return count === 1 ? 'ok' : 'not_found';
}
