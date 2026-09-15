import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

// Entre el 2026-09-09 y QC-90 este adaptador no importo NINGUN error de dominio: la autoria y la
// presentacion se habian ido de `products` a `product_batches` y aqui no quedaba ninguna clave
// foranea que traducir. QC-90 (R2, `design.md > 6`) trae de vuelta UNA -`presentation_id`, con su
// `RESTRICT`- porque el lote se escribe desde este archivo, asi que vuelve `ValidationError` y
// solo esa. Lo que QC-70 renombro aqui -el antiguo `NotFoundError` del autor inexistente a
// `ProductNotFoundError` (R17)- sigue desaparecido con la columna que lo disparaba: ese
// renombrado vive en `update-product.ts` y `delete-product.ts`, que son los sitios que de verdad
// lo lanzan.
//
// QC-81 (R13) trae UNO mas, `BatchDuplicateLotError`: el lote escrito a mano que choca contra el
// indice unico `(company_id, lot)` tambien se escribe desde este archivo.
import { BatchDuplicateLotError, ValidationError } from '../../../domain/errors';
import { normalizeProductName } from '../../../domain/product-name';

import { companyScopeColumns, productCompanyScope } from './company-scope';
import {
  dateRangeCondition,
  normalizedSearchCondition,
  numberRangeCondition,
  selectCondition,
  textCondition,
} from './list-query-sql';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { NewProductBatch } from '../../../domain/product-batch';
import type { NewProduct, ProductView } from '../../../domain/product-view';

/**
 * Implementa `ProductRepository` (`design.md > 7`) con Prisma. Es el UNICO archivo del
 * modulo `inventario` que importa `@prisma/client` y `@/lib/shared/db/prisma`, y el unico
 * que llama a `lib/shared/pagination` (R31, `design.md > 7`, `> 8`).
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura (`findAliveProductById`,
 * `listAliveProducts`) y de toda escritura que exija que la fila siga viva
 * (`updateAliveProduct`, `softDeleteAliveProduct`), nunca en un `if` posterior (R16).
 *
 * QC-49 (R13, R14, R15, R16, R17, R18): TODA consulta y TODA escritura de este archivo lleva el
 * AMBITO DE EMPRESA, y lo toma del UNICO punto que lo define -`./company-scope`-, nunca
 * escribiendo `companyId:` a mano. En las lecturas y en las escrituras sobre filas existentes va
 * EN EL `where`, compuesto con un `AND` de primer nivel y JAMAS fundido al mismo objeto que la
 * busqueda (un `OR` de busqueda junto al ambito dejaria que un termino ENSANCHE lo visible); en
 * las creaciones se escribe como columna. La empresa no llega nunca por `NewProduct` ni por
 * `NewProductBatch`: lo que no esta en el tipo no se puede elegir desde la entrada del llamante.
 *
 * «DE OTRA EMPRESA» SALE POR EL MISMO CAMINO QUE «NO EXISTE» -`null`, `false`-: ningun resultado
 * del puerto crece, porque distinguirlos seria un oraculo de existencia sobre filas ajenas (R15,
 * R16). Y `ProductView` NO gana `companyId` (R19): la empresa entra en la consulta y no sale.
 *
 * PROHIBIDO tocar `users`. Desde el 2026-09-09 la autoria (`createdBy`/`updatedBy`) se mudo
 * de `products` a `product_batches`, asi que este adaptador ya no escribe ni lee ninguna
 * columna de auditoria, ni consulta el modelo de usuarios de Prisma ni `$queryRaw` sobre esa
 * tabla.
 *
 * `nameNormalized` se calcula AQUI, en TODA escritura de producto (`createProduct` y
 * `updateAliveProduct`), con la UNICA definicion del modulo -`normalizeProductName`- y en la
 * misma llamada que escribe `name`: mismo patron que `recipe-prisma.ts` y
 * `supplier-catalog-line-prisma.ts` (QC-57, R19, R23). No hay ningun camino que escriba el
 * nombre sin escribir su forma normalizada, que es lo que permite que la busqueda del listado
 * y la comparacion de nombres no discrepen. `softDeleteAliveProduct` no toca el nombre, asi
 * que tampoco toca esta columna.
 */

/**
 * El LOTE MAS RECIENTE del producto, y de el SOLO la unidad de su presentacion (QC-80, R22).
 *
 * Se declara UNA vez y viaja dentro de `PRODUCT_SELECT`, asi que las TRES lecturas
 * -`findAliveProductById`, `listAliveProducts` y cualquiera que venga- derivan la unidad con
 * exactamente el mismo criterio. Dos copias parecidas de este `orderBy` serian dos definiciones
 * de «mas reciente».
 *
 * «MAS RECIENTE» ES `created_at DESC` DESEMPATADO POR `id DESC`, y el desempate no es adorno:
 * no hay fecha de compra todavia -es QC-81- y dos lotes creados en el mismo instante -el alta
 * con primer lote fija un unico `now`- dejarian el ganador sin definir, asi que la misma
 * consulta podria devolver una unidad distinta cada vez.
 *
 * LA TRAVESIA `ProductBatch -> Presentation` ES INTERNA A `inventario`: los dos modelos son de
 * este modulo. De `Presentation` se lee el ESCALAR `unitId` y nada mas: no se entra en `units`,
 * que es de `unidades` y se resuelve por su contrato publico, no con un `include`.
 *
 * SIN INDICE NUEVO, a proposito: `product_batches_product_id_idx` ya localiza los lotes de un
 * producto y el conjunto por producto es pequeño. Si algun dia deja de serlo, la respuesta es el
 * indice compuesto `(product_id, created_at DESC)` -una migracion de una linea-, no este
 * comentario.
 *
 * COSTE ACEPTADO Y CONSCIENTE: `listAliveProducts` emite una consulta correlacionada MAS POR
 * PAGINA (no por fila). Se acepta porque el contrato no se ensancha -el campo ya existia, cambia
 * su origen- y porque la alternativa era pedir la unidad por red en mitad de una interaccion.
 */
const LATEST_BATCH_UNIT = {
  select: { presentation: { select: { unitId: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 1,
  // `satisfies` y NO `as const`: el `orderBy` de Prisma exige un array MUTABLE, y un `as const`
  // lo congelaria en `readonly` -que es lo que el compilador rechaza-. `satisfies` da la misma
  // garantia que importa aqui (que la forma sea la que Prisma espera) sin mentir sobre el tipo.
} satisfies Prisma.Product$batchesArgs;

/** `select` unico para las tres lecturas. Sin `join` a `presentations` desde el producto (la
 * presentacion se mudo a `product_batches` el 2026-09-09) y, desde QC-80, sin `unit_id`: esa
 * columna ya no existe y la unidad se DERIVA por `LATEST_BATCH_UNIT`.
 *
 * SE EXPORTA solo para que su test pueda afirmar el `orderBy` y el `take` COMO DATO -no como
 * texto del archivo-: una asercion sobre el fuente pasaria igual con el criterio equivocado. */
export const PRODUCT_SELECT = {
  id: true,
  name: true,
  imagePath: true,
  stock: true,
  qtyAlert: true,
  createdAt: true,
  updatedAt: true,
  batches: LATEST_BATCH_UNIT,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * QC-52 (R1): `toDecimalInput`/`fromDecimalCost` se fueron con `cost`. Eran la unica
 * conversion `string <-> Prisma.Decimal` del modulo, y sin costo en el producto no queda
 * ningun importe que convertir aqui. La misma pareja de funciones vive, viva, en el
 * adaptador de la linea de catalogo de `proveedores`, que es donde el importe se quedo.
 */

/**
 * Fila de Prisma -> `ProductView` del puerto.
 *
 * `latestBatchUnitId` sale del UNICO lote que `LATEST_BATCH_UNIT` deja pasar (`take: 1`), asi
 * que aqui no se ordena ni se elige nada: ELEGIR ES TRABAJO DEL MOTOR, no de este mapeo, que es
 * lo mismo que ya vale para el orden y el filtro del listado. Sin ningun lote el array viene
 * vacio y la unidad derivada es `null` (R23): «todavia no se ha comprado», no «sin unidad».
 */
export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    stock: row.stock,
    qtyAlert: row.qtyAlert,
    latestBatchUnitId: row.batches[0]?.presentation.unitId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * `create` de `ProductRepository` (R5). Sin autor ni presentacion: se mudaron a
 * `product_batches` el 2026-09-09. `createdAt`/`updatedAt` usan el `now` inyectado por el
 * caso de uso, no `now()` de la base, para que el reloj sea el mismo que el service fijo.
 *
 * QC-49 (R17): la empresa se escribe desde `companyScopeColumns(scope)` -el unico punto que la
 * define- y NO desde `data`: `NewProduct` no la lleva, asi que no hay forma de que la entrada del
 * llamante la elija.
 */
export async function createProduct(
  data: NewProduct,
  now: Date,
  scope: InventoryScope,
): Promise<{ id: string }> {
  const created = await prisma.product.create({
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      ...companyScopeColumns(scope),
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * `findAliveById` de `ProductRepository` (R16). `deleted_at IS NULL` en el `where`, no
 * en un `if` posterior.
 *
 * QC-49 (R15): el AMBITO viaja en el mismo `where`, junto al `deleted_at IS NULL` y por la misma
 * razon. Un producto de otra empresa no devuelve fila, asi que sale por el camino de «no existe»
 * -`null`- y el caso de uso responde `product_not_found`, nunca un error de autorizacion.
 */
export async function findAliveProductById(
  id: string,
  scope: InventoryScope,
): Promise<ProductView | null> {
  const row = await prisma.product.findFirst({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    select: PRODUCT_SELECT,
  });
  return row === null ? null : toProductView(row);
}

/**
 * `updateAlive` de `ProductRepository` (R13, R14, R16). `updateMany` con
 * `deletedAt: null` en el `where` y no `update`: si el producto no existe o ya esta
 * borrado, `count` sale 0 y se devuelve `false` en vez de lanzar (R14). La existencia
 * -`stock`- se guarda tal cual, sin recalcularla, como el resto de campos de negocio.
 *
 * QC-49 (R16): el AMBITO va en el `where` del `updateMany`, NO en un `if` sobre la fila leida -no
 * hay fila leida-. Editar un producto de otra empresa deja `count` en 0, o sea `false`: la fila
 * ajena NO se modifica y quien pide no distingue «de otra empresa» de «no existe».
 */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  now: Date,
  scope: InventoryScope,
): Promise<boolean> {
  const { count } = await prisma.product.updateMany({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      updatedAt: now,
    },
  });
  return count === 1;
}

/**
 * `softDeleteAlive` de `ProductRepository` (R14, R15, R16). Borrado LOGICO: solo
 * marca `deleted_at` (y `updated_at`), NUNCA `prisma.product.delete`. La fila se conserva
 * entera. Mismo `updateMany` con `deletedAt: null` en el `where` que `updateAliveProduct`,
 * por la misma razon (R14): apuntar a un producto inexistente o ya borrado devuelve `false`,
 * no lanza.
 */
export async function softDeleteAliveProduct(
  id: string,
  now: Date,
  scope: InventoryScope,
): Promise<boolean> {
  // QC-49 (R16): mismo AMBITO en el `where` que `updateAliveProduct`. Borrar un producto de otra
  // empresa devuelve `false` y NO le marca `deleted_at` a nadie.
  const { count } = await prisma.product.updateMany({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    data: {
      deletedAt: now,
      updatedAt: now,
    },
  });
  return count === 1;
}

/**
 * Desempate ESTABLE por identificador (R10). No es adorno y por eso es una constante con
 * nombre: el nombre de un producto NO es unico (D14 de QC-20), asi que sin este segundo criterio
 * dos homonimos pueden intercambiarse -o perderse- entre paginas, porque el orden de las filas
 * empatadas no esta definido y Postgres puede devolverlas distinto en cada consulta.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.ProductOrderByWithRelationInput;

/** Orden POR DEFECTO: exactamente el de hoy (R11). Sin `sort`, la lista no se mueve. */
/** Se construye en CADA llamada, no como constante compartida: Prisma exige un array
 *  mutable en `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la
 *  mutara para todos. */
function defaultOrderBy(): Prisma.ProductOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * DOS COSAS QUE NO SON OBVIAS:
 *
 *   1. **`stock` y `qtyAlert` son ANULABLES y sus nulos van SIEMPRE AL FINAL**, en `asc` Y en
 *      `desc`, **declarado explicito** (`nulls: 'last'`) y NO heredado del defecto de Postgres
 *      -que los pone al final en `ASC` pero al PRINCIPIO en `DESC`-. Es la decision cerrada del
 *      2026-09-04, que manda sobre `design.md > 3.3`: quien ordena por existencia quiere ver los
 *      extremos reales, y de mayor a menor arrancaria si no con todos los productos sin
 *      existencia registrada.
 *   2. **El `default` no puede darse por inalcanzable**: `sanitizeListQuery` ya poda lo que no
 *      esta en `PRODUCT_QUERYABLE`, pero el adaptador no puede depender de que su llamante lo
 *      haya hecho -es defensa en profundidad, y ademas mantiene R5 cierto aqui tambien: un campo
 *      desconocido cae al orden por defecto, no revienta la consulta-.
 */
export function productOrderBy(
  sort: ListSort | null,
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'stock':
      return [{ stock: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'qtyAlert':
      return [{ qtyAlert: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'updatedAt':
      return [{ updatedAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. Devuelve `null` -y el
 * filtro no aparece en el `where`- cuando el campo no es filtrable aqui o cuando el valor no
 * acota nada (rango con los dos extremos nulos, `select` con lista VACIA: «no he elegido nada»
 * NO es «ningun resultado», `design.md > 3.3`).
 *
 * Las CUATRO formas del contrato estan contempladas (R12). La de `text` sobre `name` no llega
 * hoy -`PRODUCT_QUERYABLE` no declara `name` filtrable: el nombre se BUSCA con `search`, no se
 * filtra-, y `sanitizeListQuery` la podaria antes; se escribe igual porque traducir es trabajo
 * del adaptador y declarar manana un campo de texto no puede depender de que alguien recuerde
 * que aqui faltaba una rama.
 */
function productFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.ProductWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      // QC-80 (R21): AQUI estaba `unitId`, el unico `select` que tenia este listado. La columna
      // `products.unit_id` ya no existe, asi que no hay ninguna a la que traducirlo -y la unidad
      // DERIVADA no es una columna: filtrarla seria un `where` anidado sobre el lote mas
      // reciente, otra consulta y otra ficha-. La rama se conserva vacia por el mismo motivo que
      // la de `text`: traducir es trabajo del adaptador, y declarar manana un campo de eleccion
      // no puede depender de que alguien recuerde que aqui faltaba una rama.
      return null;
    }
    case 'numberRange': {
      const condition = numberRangeCondition(value.min, value.max);
      if (condition === null) return null;
      if (field === 'stock') return { stock: condition };
      if (field === 'qtyAlert') return { qtyAlert: condition };
      return null;
    }
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      if (field === 'createdAt') return { createdAt: condition };
      if (field === 'updatedAt') return { updatedAt: condition };
      return null;
    }
    case 'text': {
      const condition = textCondition(value.value);
      if (condition === null) return null;
      if (field === 'name') return { name: condition };
      return null;
    }
  }
}

/**
 * `where` UNICO del listado de productos: el mismo objeto para el `findMany` y para el `count`
 * (R14). Tres capas, y ninguna sobra:
 *
 *   1. **`deletedAt: null` SIEMPRE** (R7, R16 de QC-20). No es un filtro que el llamante pueda
 *      quitar: `deletedAt` no es consultable en ninguna lista blanca y `sanitizeListQuery` lo
 *      poda ademas por su cuenta.
 *   2. **La busqueda contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 *      `normalizeProductName` -la MISMA funcion que escribio la columna-. Es lo que hace que
 *      «solucion» encuentre «Solución Buffer pH 7». Sin `mode: 'insensitive'`: la columna ya
 *      viene sin acentos ni mayusculas, y pedirlo ademas dejaria fuera el indice de trigramas.
 *   3. **Los filtros, TODOS a la vez** (R15): un `AND` explicito, de modo que una fila sale solo
 *      si los cumple todos.
 *   4. **El AMBITO DE EMPRESA** (QC-49 R13, R14), tomado del unico punto que lo define.
 *
 * EL AMBITO VA EN UN `AND` DE PRIMER NIVEL Y NUNCA DENTRO DEL OBJETO DE LA BUSQUEDA. No es
 * estilo: `companyId` fundido al mismo nivel que un `OR` de busqueda dejaria que un termino de
 * busqueda AMPLIE lo visible -la fila entraria por cumplir la busqueda, aunque fuera de otra
 * empresa-. Con esta forma, la empresa es una conjuncion que ninguna otra condicion puede
 * relajar: es la capa de fuera, y todo lo demas acota DENTRO de ella.
 */
export function buildProductWhere(
  query: ListQuery,
  scope: InventoryScope,
): Prisma.ProductWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeProductName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => productFilterWhere(field, value))
    .filter((condition): condition is Prisma.ProductWhereInput => condition !== null);

  return {
    AND: [
      productCompanyScope(scope),
      {
        deletedAt: null,
        ...(search === null ? {} : { nameNormalized: search }),
        ...(filters.length === 0 ? {} : { AND: filters }),
      },
    ],
  };
}

/**
 * `listAlive` de `ProductRepository` con el CONTRATO GENERICO de consulta (QC-57 R10, R11,
 * R13, R14, R15, R16, R18, R29). El `limit` que llega a Prisma -y el `pageSize` que sale en el
 * `Page`- es el ACOTADO que devuelve `toOffsetLimit`, nunca el `pageSize` que pidio el llamante
 * (`design.md > 8`): pasarle el pedido a `buildPage` dejaria un `Page` con un `pageSize` y un
 * `totalPages` mentirosos aunque el `LIMIT` de SQL fuera correcto. Pedir 100 se ACOTA a 25, no
 * se rechaza (R29).
 *
 * ORDEN, FILTRO Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13): filtrar lo ya
 * descargado es justo lo que QC-22 y QC-26 rechazaron por enganoso, y ademas dejaria un `total`
 * mentiroso.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (R14) -literalmente la misma
 * constante, no dos copias parecidas-, de modo que el `total` y el `totalPages` describan el
 * conjunto YA FILTRADO y no el catalogo entero.
 */
export async function listAliveProducts(
  query: ListQuery,
  scope: InventoryScope,
): Promise<Page<ProductView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  // QC-49 (R14): el ambito entra en ESTE `where`, que es el mismo objeto que reciben el
  // `findMany` y el `count`. Por eso el `total` tambien queda acotado a la empresa: un recuento
  // con otro `where` contaria filas ajenas y delataria cuantas hay.
  const where = buildProductWhere(query, scope);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PRODUCT_SELECT,
      orderBy: productOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return buildPage(rows.map(toProductView), total, query.page, limit);
}

// ---------------------------------------------------------------------------------------
// QC-90 — el alta escribe TAMBIEN el primer lote (`design.md > 6`). Bloque nuevo y separado
// a proposito: no reordena ni reformatea nada de arriba.
//
// Las conversiones del importe y de la fecha viven SOLO aqui, que es lo que permite que el
// puerto y el dominio hablen en cadena decimal y en fecha civil (R4, R13).
// ---------------------------------------------------------------------------------------

/**
 * `findAliveIdByName` de `ProductRepository` (R15, R19, R20).
 *
 * Normaliza con `normalizeProductName` -la MISMA funcion que escribio `name_normalized` en
 * `createProduct` y en `updateAliveProduct`-, de modo que «mismo nombre» tenga UNA sola
 * definicion en el modulo (QC-57 R19). Comparar contra `name` crudo dejaria que «Acido
 * Citrico» y «acido citrico  » fueran dos productos distintos para el alta y el mismo para
 * la busqueda del listado.
 *
 * `deleted_at IS NULL` va en el `where`, como en toda lectura de este archivo (R16 de QC-20):
 * por eso un nombre que solo coincide con productos BORRADOS devuelve `null` y el alta acaba
 * creando uno nuevo, que es exactamente R19. No revive nada.
 *
 * El `orderBy` es el desempate ESTABLE de R20: mas antiguo primero y, con `created_at`
 * empatado -dos altas del mismo milisegundo, o dos filas sembradas con el mismo `now`-, el
 * `id` ascendente. Sin el segundo criterio el ganador no estaria definido y dos altas
 * seguidas del mismo nombre podrian colgarle el lote a productos distintos.
 *
 * El indice de `name_normalized` ya existe desde QC-57: esta consulta no pide ninguna
 * migracion (R29).
 *
 * QC-49 (R18): el AMBITO acota la resolucion por nombre. Si el unico homonimo vivo es de otra
 * empresa, esta consulta devuelve `null` y el alta crea un producto NUEVO en la empresa de quien
 * pide, en vez de colgarle el lote al producto ajeno. Sin el ambito aqui, el aislamiento se
 * perderia por la puerta de atras: el lote se escribiria en el producto de la otra empresa.
 */
export async function findAliveIdByName(
  name: string,
  scope: InventoryScope,
): Promise<string | null> {
  const row = await prisma.product.findFirst({
    where: {
      AND: [
        productCompanyScope(scope),
        { nameNormalized: normalizeProductName(name), deletedAt: null },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return row === null ? null : row.id;
}

/**
 * Costo unitario del lote: CADENA decimal -> `Prisma.Decimal` (R4).
 *
 * `Prisma.Decimal` parsea el texto en decimal exacto, sin pasar por la coma flotante binaria
 * del lenguaje. Convertir aqui con la conversion numerica del lenguaje meteria el error de
 * representacion justo antes de la columna `DECIMAL(14,4)`, que es lo que R4 prohibe en TODO
 * el camino; por eso el importe viaja como texto desde el formulario hasta esta linea.
 */
function toBatchUnitCost(unitCost: string): Prisma.Decimal {
  return new Prisma.Decimal(unitCost);
}

/**
 * Expiracion del lote: fecha CIVIL `YYYY-MM-DD` -> el `Date` que espera una `@db.Date` (R13).
 *
 * El `T00:00:00Z` NO es adorno: una cadena de fecha y hora SIN zona la interpreta el
 * lenguaje en la zona LOCAL, y Prisma serializa la `@db.Date` en UTC. En una maquina con zona
 * negativa esa medianoche local cae en el dia ANTERIOR una vez pasada a UTC, y la columna
 * guardaria el 7 cuando se escribio el 8. Fijar la zona en la propia cadena es lo que hace
 * que la fecha escrita y la guardada sean la misma sea cual sea el reloj del servidor.
 *
 * `null` cuando no vino ninguna (R12): la columna es anulable y ausente significa ausente, no
 * «hoy».
 */
function toBatchExpiryDate(expiryDate: string | null): Date | null {
  return expiryDate === null ? null : new Date(`${expiryDate}T00:00:00Z`);
}

/**
 * Fecha de compra del lote: fecha CIVIL `YYYY-MM-DD` -> el `Date` que espera una `@db.Date`
 * (QC-81 R1, R3).
 *
 * Copia literal de `toBatchExpiryDate` (`design.md > 4.4`), y el `T00:00:00Z` esta por lo mismo:
 * sin la zona escrita en la cadena, el lenguaje la leeria en la zona LOCAL, Prisma la serializaria
 * en UTC y en una maquina con zona negativa la columna guardaria el dia anterior al escrito. Es
 * tambien la convencion con la que la migracion rellena las filas viejas (`created_at AT TIME ZONE
 * 'UTC'`), asi que el relleno y el alta hablan del mismo dia.
 *
 * SIN la rama del nulo: la fecha de compra es OBLIGATORIA y llega ya resuelta por el caso de uso
 * -«hoy» si no vino, rechazo si era futura-, asi que aqui no hay ausencia que representar.
 */
function toBatchPurchaseDate(purchaseDate: string): Date {
  return new Date(`${purchaseDate}T00:00:00Z`);
}

/**
 * Primer entero del lock de aviso del correlativo de lote (`design.md > 3.2`, `<ns>`). La forma
 * de DOS enteros es a proposito: vive en un espacio distinto del `pg_advisory_lock(bigint)` que
 * `tests/helpers/test-database.ts` usa para la plantilla, asi que no pueden colisionar. El valor
 * solo tiene que ser estable y no compartirlo nadie mas: hoy este es el unico lock de aviso de
 * dos enteros del repositorio.
 */
const BATCH_LOT_LOCK_NAMESPACE = 81;

/** Prefijo de la clave del lock: `hashtext('product_batches_lot:' || company_id)`. La empresa va
 *  en la clave, asi que dos empresas NUNCA se hacen cola entre si. */
const BATCH_LOT_LOCK_KEY_PREFIX = 'product_batches_lot:';

/** Fila del maximo de la serie. Llega como TEXTO (`::text` en la consulta) y no como numero: la
 *  serie no tiene techo -el maximo se lee con `numeric`- y un lote de mas de 15 digitos ya no cabe
 *  en un `number` sin perder precision. El texto de un `numeric` de escala 0 es un entero sin parte
 *  decimal, que es lo que `BigInt` necesita para parsearlo. */
type BatchLotTopRow = { readonly top: string | null };

/**
 * El lote que se escribe en la fila (QC-81 R8, R9, R10, R16, R27): el escrito a mano TAL CUAL, o
 * el siguiente de la serie numerica de la empresa del AMBITO.
 *
 * **Lote escrito a mano (`batch.lot !== null`)**: se devuelve sin tocarlo -ya llega recortado por el
 * esquema- y NO se pide lock ni se calcula maximo (R10, `design.md > 3.2`): no hay serie que
 * consultar, y serializar altas que no compiten por ningun numero seria cola gratis.
 *
 * **Lote generado (`batch.lot === null`)**, tres pasos DENTRO de la transaccion que escribe:
 *
 *   1. `pg_advisory_xact_lock(<ns>, hashtext('product_batches_lot:' || company_id))`,
 *   2. `SELECT max(lot::numeric)` sobre los lotes PURAMENTE numericos de la empresa,
 *   3. el `INSERT` con la API tipada, que hace quien llama con el valor devuelto.
 *
 * **POR QUE EL LOCK ES UNA SENTENCIA APARTE Y VA ANTES DEL `SELECT`, y no dentro de la sentencia que
 * calcula el maximo ni dentro del `INSERT`.** Prisma trabaja en `READ COMMITTED`, y en ese nivel
 * CADA SENTENCIA TOMA SU PROPIA INSTANTANEA AL EMPEZAR. Si la sesion B pidiera el lock dentro de la
 * misma sentencia que lee el maximo, su instantanea ya estaria tomada ANTES de que A comiteara: B
 * esperaria el lock, lo obtendria, y aun asi leeria el maximo VIEJO -sin la fila de A- y propondria
 * el mismo numero. El lock no habria servido de nada. Pedido en una sentencia ANTERIOR, B espera
 * ahi; cuando A comitea y B continua, la sentencia del paso 2 arranca DESPUES y su instantanea SI ve
 * la fila de A. Eso es lo que cumple R14 sin depender de ningun reintento. Quien «simplifique» esto
 * juntando las dos sentencias reabre la carrera, y solo se vera con dos altas simultaneas.
 *
 * El lock es `xact`: se suelta solo al comitear o al abortar, no hay camino que lo deje tomado, y
 * como se pide UNO solo no hay orden de adquisicion ni interbloqueo posible.
 *
 * Va con `$executeRaw` y no con `$queryRaw` porque `pg_advisory_xact_lock` devuelve `void`, y el
 * cliente no sabe deserializar una columna de ese tipo; `$executeRaw` no lee filas.
 *
 * **El maximo** se lee sobre `'^[0-9]+$'` y con `::numeric`: lo no numerico (`'ACME-2026-07'`) no
 * esta en la serie y no la mueve (R9), y un `'007'` cuenta como 7. SIN COTA DE DIGITOS Y SIN
 * `bigint`, a proposito (hallazgo m4 de la revision, decision del humano del 2026-09-15): con la
 * antigua cota `{1,18}` -que solo existia para que el `::bigint` no reventara- un lote tecleado
 * `'999999999999999999'` generaba `'1000000000000000000'`, que ya no entraba en la expresion; la
 * siguiente alta volvia a leer los dieciocho nueves, proponia OTRA VEZ el mismo valor, chocaba tres
 * veces y la generacion de esa empresa quedaba bloqueada para siempre (R16 roto). `numeric` no tiene
 * techo practico; el largo lo acota el CHECK `product_batches_lot_length` (60 caracteres). Es el
 * MISMO criterio que el relleno de la migracion, para que la migracion y el alta no discrepen sobre
 * cual es «el mas alto». Sin ningun lote numerico el maximo es `NULL` y el primero es `'1'`.
 *
 * **La suma va en `BigInt`**, de precision arbitraria, sobre el TEXTO del maximo: nunca por `number`,
 * que redondearia a partir de 2^53. El `::text` de un `numeric` de escala 0 -todo lote que casa con
 * `'^[0-9]+$'` lo es- sale sin parte decimal y sin ceros a la izquierda, asi que el siguiente se
 * escribe sin ceros (D5).
 *
 * **LIMITE CONOCIDO, no resuelto aqui:** si el maximo de la empresa tiene 60 digitos y son todos
 * nueves, el siguiente tendria 61 caracteres y el `INSERT` lo rechaza el CHECK
 * `product_batches_lot_length` en cada alta con lote generado de esa empresa (sale `unexpected`:
 * el `23514` de largo no se traduce, `design.md > 6 F`). Desde QC-81 R34 (D13) la entrada ya no
 * deja teclear un lote de solo digitos de 60 caracteres -`lotSchema` en
 * `domain/product-batch-input.ts`-, asi que este limite SOLO lo alcanzan datos ya escritos antes de
 * la regla o escritos por otra via que no pase por el esquema. La pregunta P1 se cerro el
 * 2026-09-15 con la opcion D: no hay datos previos, se acepta como limite y la migracion no lleva
 * guardia (`requirements.md > P1`, `design.md > 9.6`).
 *
 * **La empresa sale del AMBITO** (R27) y del unico punto que la define (`companyScopeColumns`),
 * nunca de `NewProductBatch` -que no la lleva-: el correlativo se calcula contra la misma empresa
 * que se escribe en la fila, asi que ningun lote puede numerarse en la serie de una empresa y
 * guardarse en otra. Los parametros llevan cast explicito porque en una consulta cruda no hay mapeo
 * de Prisma que infiera el tipo.
 *
 * El lock es solo la manera de NO chocar casi nunca; la GARANTIA de que no haya dos lotes iguales
 * en una empresa es el indice unico `product_batches_company_lot_unique` de la base (R11).
 */
async function resolveLot(
  tx: Prisma.TransactionClient,
  batch: NewProductBatch,
  scope: InventoryScope,
): Promise<string> {
  if (batch.lot !== null) return batch.lot;

  const { companyId } = companyScopeColumns(scope);

  // Paso 1, SENTENCIA PROPIA (ver el docblock: READ COMMITTED).
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_LOT_LOCK_NAMESPACE}::int, hashtext(${BATCH_LOT_LOCK_KEY_PREFIX + companyId}::text))`,
  );

  // Paso 2, con una instantanea tomada DESPUES de obtener el lock.
  const rows = await tx.$queryRaw<ReadonlyArray<BatchLotTopRow>>(Prisma.sql`
    SELECT max(("lot")::numeric)::text AS "top"
      FROM "product_batches"
     WHERE "company_id" = ${companyId}::uuid
       AND "lot" ~ '^[0-9]+$'
  `);

  const top = rows[0]?.top ?? null;
  return (BigInt(top ?? '0') + BigInt(1)).toString();
}

/**
 * `NewProductBatch` del puerto -> la fila de `product_batches`.
 *
 * `createdBy` y `updatedBy` se escriben como ESCALARES (R22): sin `include`, sin `connect` y
 * sin tocar el modelo de usuarios. Las dos FK a `users` estan escritas a mano en
 * `20260909120000_product_batches/migration.sql` y NO en `db/schema.prisma`, precisamente
 * para que la base garantice la integridad sin que el cliente Prisma pueda atravesar de
 * `inventario` a `identity`. La prohibicion del docblock de arriba sigue en pie.
 *
 * Al crear, el autor de la creacion y el de la ultima modificacion son la misma persona, asi
 * que las dos columnas llevan el mismo `createdBy` (mismo criterio que `createOrder` de
 * `pedidos`).
 *
 * `createdAt`/`updatedAt` usan el `now` inyectado por el caso de uso, no el `DEFAULT` de la
 * base, para que el lote y el producto que se escriben juntos compartan reloj.
 *
 * QC-81: recibe el `lot` YA RESUELTO por `resolveLot` -el escrito a mano o el correlativo- como
 * parametro aparte, y no lo lee de `batch`. Asi el tipo impide escribir la fila con el `null` de
 * «que lo genere el backend»: esa columna es NOT NULL desde QC-81 y ninguna fila puede llegar a ella
 * sin haber pasado por el generador. Y escribe `purchaseDate`, obligatoria, en todo camino (R1).
 */
function toBatchCreateData(
  productId: string,
  batch: NewProductBatch,
  lot: string,
  now: Date,
  scope: InventoryScope,
): Prisma.ProductBatchUncheckedCreateInput {
  return {
    productId,
    presentationId: batch.presentationId,
    // R3: `0` es un valor valido; el `CHECK` de la columna es `>= 0`.
    stock: batch.stock,
    unitCost: toBatchUnitCost(batch.unitCost),
    // QC-81 (R7, R8, R10): SIEMPRE escrito. Hasta QC-81 el ausente se guardaba como `NULL` (QC-90
    // R12, derogado en su mitad del lote por D7); ahora llega aqui ya resuelto por `resolveLot`.
    lot,
    // QC-81 (R1, R3): fecha civil ya resuelta por el caso de uso, convertida en un unico sitio.
    purchaseDate: toBatchPurchaseDate(batch.purchaseDate),
    expiryDate: toBatchExpiryDate(batch.expiryDate),
    // QC-49 (R2, R17): el lote lleva SU PROPIA columna de empresa y se escribe desde el unico
    // punto que define el ambito. NO se hereda por `join` con el producto: la unicidad
    // `(empresa, lote)` que necesita QC-81 no puede indexar la columna de otra tabla. La
    // coherencia entre las tres -lote, producto y presentacion- la garantiza el disparador
    // `product_batches_check_company`, no este `spread`.
    ...companyScopeColumns(scope),
    createdBy: batch.createdBy,
    updatedBy: batch.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * `presentation_id` apunta a una presentacion que no existe (R2).
 *
 * Se decide por el CODIGO del error -`P2003`, el equivalente estable del SQLSTATE `23503`
 * para quien usa el cliente tipado-, NUNCA por el texto del mensaje: en esta maquina Postgres
 * responde en espanol y un adaptador que dependa del idioma del servidor esta roto de
 * nacimiento. Mismo criterio que `isPresentationForeignKeyViolation` en
 * `presentation-prisma.ts`.
 *
 * POR QUE BASTA CON EL CODIGO, sin mirar QUE columna fallo. `product_batches` tiene cuatro FK
 * y el conector no dice cual se violo -hallazgo empirico documentado en
 * `supplier-catalog-line-prisma.ts`: `meta.constraint` llega `null`-. Aqui no hace falta
 * distinguir porque las otras tres no pueden fallar por esta via: `product_id` se escribe con
 * el id de un producto que o se acaba de crear en la MISMA transaccion o se acaba de leer
 * vivo, y `created_by`/`updated_by` salen del actor de una sesion real, no de la entrada. La
 * unica de las cuatro alimentada por un campo del formulario es `presentation_id`, que el
 * borde valido como uuid pero cuya existencia solo la base puede garantizar. Es entrada
 * invalida, luego `invalid_input`, sin codigo de error nuevo.
 */
function isBatchForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * SQLSTATE de un error de Postgres, leido del campo ESTRUCTURADO del conector y jamas del texto
 * humano del mensaje: en esta maquina Postgres responde en espanol. Misma tecnica -y mismo
 * criterio- que `sqlStateOf` de `recipe-prisma.ts` y `order-prisma.ts`.
 *
 * Hace falta aqui porque un `RAISE EXCEPTION` de plpgsql NO tiene codigo `P####` propio: llega
 * como `P2010` con el SQLSTATE en `meta.code`, o como `PrismaClientUnknownRequestError` con el
 * codigo incrustado y estructurado en el mensaje del conector.
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

/**
 * Los dos casos del disparador `product_batches_check_company` (QC-49 R22,
 * `20260911130000_inventory_company_scope/migration.sql > 5.a`). Son IDENTIFICADORES que escribe
 * el propio `RAISE EXCEPTION` en ingles, no texto que Postgres traduzca: buscarlos es lo mismo
 * que hace `isDuplicateOrderNumber` con el nombre de su indice, y NO es decidir por el mensaje
 * humano.
 */
const BATCH_COMPANY_SCOPE_VIOLATIONS = [
  'product_batches_company_differs_from_product',
  'product_batches_company_differs_from_presentation',
] as const;

/**
 * ¿Es este error el `23514` del disparador de coherencia de empresa del lote (R22)?
 *
 * DOS condiciones, y hacen falta las dos: el SQLSTATE tiene que ser `23514` **y** el error tiene
 * que nombrar uno de los dos casos del disparador. El segundo requisito no es adorno: en
 * `product_batches` hay otros `23514` -los `CHECK` de `stock >= 0` y `unit_cost > 0`- que este
 * archivo relanza CRUDOS a proposito desde QC-90, y traducirlos todos por el codigo los
 * disfrazaria de entrada invalida. Si el `23514` no se puede identificar, se relanza: mejor un
 * error crudo en el log que una traduccion equivocada (mismo criterio conservador que
 * `recipe-prisma.ts`).
 */
function isBatchCompanyScopeViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  const carga = `${detalle}\n${bruto}`;
  return BATCH_COMPANY_SCOPE_VIOLATIONS.some((nombre) => carga.includes(nombre));
}

/** Traduce el fallo de FK del lote y el `23514` del disparador de empresa, CADA UNO POR SU
 *  CAMINO -no con un `catch` comun, mismo criterio que los dos `P2003` de
 *  `presentation-prisma.ts`-, y relanza cualquier otro error TAL CUAL: un `CHECK` violado
 *  (`unit_cost > 0`, `stock >= 0`) o una caida de conexion no son entrada invalida y
 *  disfrazarlos de `invalid_input` mentiria a quien lee el log. Nada de `catch` vacios.
 *
 *  Los dos acaban en `ValidationError` -> `invalid_input` (QC-49 `design.md > 6.3`): un lote cuya
 *  empresa no cuadra con la de su producto o su presentacion es ENTRADA que no encaja, igual que
 *  una FK rota, y NO se le anade ningun codigo nuevo al catalogo cerrado de QC-70. Son dos
 *  funciones distintas aunque hoy lleven al mismo error: lo que cambia no es el destino, es lo
 *  que significa cada caso, y separarlas es lo que impide que un `catch` comun los confunda el
 *  dia que uno de los dos tenga que decir otra cosa. */
function translateBatchWriteError(error: unknown): never {
  if (isBatchForeignKeyViolation(error)) throw new ValidationError();
  if (isBatchCompanyScopeViolation(error)) throw new ValidationError();
  throw error;
}

/**
 * Columnas que protege el indice unico `product_batches_company_lot_unique` (QC-81 R11,
 * `db/migrations/20260913120000_product_batch_lot_and_purchase_date`).
 *
 * CORRECCION sobre lo que describen `design.md > 3.3`, `> 4.4` y `tasks.md > T6`: alli
 * `isDuplicateBatchLot` reconocia el `P2002` comparando `error.meta.target` contra el NOMBRE del
 * indice (`'product_batches_company_lot_unique'`). Con `@prisma/client@6.19.3` contra Postgres eso
 * no casa nunca: por la API tipada `meta.target` trae las COLUMNAS afectadas (p. ej.
 * `["company_id","lot"]`), jamas el nombre del indice. Esta verificado empiricamente y escrito en
 * `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts` (QC-76), donde la
 * comparacion por nombre fue un defecto real: el `P2002` se relanzaba sin traducir. Implementado
 * literal, aqui un lote escrito a mano repetido saldria como error crudo en vez de
 * `batch_duplicate_lot` (R13 roto) y un choque con lote generado no se reintentaria (R15 roto).
 *
 * El precedente que cita el design, `isDuplicateOrderNumber` de `order-prisma.ts`, SI usa el
 * nombre, pero solo porque `pedidos` inserta con SQL crudo y busca el nombre en el texto de su
 * mensaje; el `INSERT` del lote va por la API tipada (`design.md > 3.2`, paso 3), que es otro
 * camino. Se discrimina por COLUMNAS, como `unit-write-prisma.ts`, `recipe-prisma.ts`
 * (`isUniqueNameViolation`) y `supplier-prisma.ts`. La intencion de `design.md > 4.4` se conserva
 * entera -dos condiciones, y relanzar lo que no se sabe identificar-; cambia el mecanismo, para
 * que sea el que el motor realmente expone.
 */
const BATCH_LOT_UNIQUE_COLUMNS: ReadonlySet<string> = new Set(['company_id', 'lot']);

/** `error.meta.target` puede llegar como cadena o como array de cadenas segun la version del
 *  motor: se normaliza a un array antes de mirarlo, con el mismo criterio que `targetsOf` de
 *  `unit-write-prisma.ts`. Si `target` no es inspeccionable -ausente, u otro tipo- se devuelve
 *  vacio: no se asume nada. */
function uniqueTargetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * ¿Es este error el choque contra el indice unico `(company_id, lot)` de `product_batches`?
 * (QC-81 R13, R15).
 *
 * DOS condiciones, y hacen falta las dos: un `PrismaClientKnownRequestError` con `code === 'P2002'`
 * **y** un `meta.target` cuyo CONJUNTO de columnas es exactamente `{company_id, lot}` -en cualquier
 * orden-. El conjunto exacto y no «contiene» es el criterio conservador de este archivo: un indice
 * unico nuevo que nadie mapeo todavia no se anuncia como «ya existe ese lote». Cualquier otro
 * `P2002` NO es este y quien llama lo relanza.
 *
 * Si `target` llegara como una cadena suelta, cuenta como UNA columna, igual que en
 * `unit-write-prisma.ts`: nunca forma la pareja, asi que no se reconoce y se relanza. Mejor un
 * error crudo en el log que una traduccion equivocada.
 *
 * SE EXPORTA solo para que su unitario pueda probar las dos condiciones sin base.
 */
export function isDuplicateBatchLot(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const targets = new Set(uniqueTargetsOf(error));
  if (targets.size !== BATCH_LOT_UNIQUE_COLUMNS.size) return false;
  return [...BATCH_LOT_UNIQUE_COLUMNS].every((column) => targets.has(column));
}

/** Intentos EN TOTAL -el primero y dos reintentos- de una escritura con lote generado que choca
 *  contra el indice unico (QC-81 R15, `design.md > 3.3`). Acotado: el lock ya evita el choque en
 *  la practica, y un choque que se repite tres veces no es mala suerte, es un estado de la base que
 *  el generador no entiende. */
const BATCH_LOT_MAX_ATTEMPTS = 3;

/** Lo que se sabe del ultimo intento, para el contexto del error si se agotan. Es un objeto y no un
 *  `let` suelto porque se escribe desde dentro del callback de la transaccion. */
type BatchLotAttemptLog = { lastLot: string | null };

/**
 * Ejecuta una escritura de lote -`write`- en su propia `prisma.$transaction` y aplica la politica de
 * choque de lote de QC-81 (R13, R15, R25). Es el UNICO sitio de esa politica: `createWithFirstBatch`
 * y `addBatchToAlive` le pasan solo lo que escriben, asi que el reintento no se duplica.
 *
 * `write` recibe el cliente de la transaccion y `resolveBatchLot`, que es `resolveLot` atado a ESTA
 * transaccion y a este ambito: el lote se resuelve dentro de la misma transaccion que lo escribe
 * (`design.md > 3.1`).
 *
 * **EL REINTENTO VA FUERA DE `prisma.$transaction`**, y cada vuelta del bucle abre una transaccion
 * NUEVA: una transaccion abortada no admite mas sentencias, y la nueva toma instantanea nueva, pide el
 * lock otra vez y lee un maximo nuevo. Reintentar es seguro porque la transaccion abortada no dejo ni
 * producto ni lote (R25).
 *
 * Que se hace con cada error, en este orden:
 *   1. **No es el choque de lote** -FK, disparador de empresa, un `CHECK`, un `P2002` ajeno, una caida
 *      de conexion- ⇒ `translateBatchWriteError`, que traduce lo que sabe y RELANZA lo demas. Nunca se
 *      reintenta.
 *   2. **Choque con lote ESCRITO A MANO** ⇒ `BatchDuplicateLotError` y NUNCA se reintenta (R13):
 *      reintentar daria el mismo choque para siempre, y sustituirlo por un correlativo escribiria un
 *      lote que nadie pidio.
 *   3. **Choque con lote GENERADO** ⇒ se reintenta la operacion entera (R15).
 *   4. **Agotados los intentos** ⇒ `Error` con contexto -empresa, ultimo lote intentado, intentos- y
 *      el choque original como `cause`. NO se disfraza de `invalid_input`: no es entrada invalida.
 *
 * Ningun `catch` vacio (`docs/conventions.md`).
 */
async function writeBatchWithLotRetry<T>(
  batch: NewProductBatch,
  scope: InventoryScope,
  write: (tx: Prisma.TransactionClient, resolveBatchLot: () => Promise<string>) => Promise<T>,
): Promise<T> {
  const { companyId } = companyScopeColumns(scope);
  const attemptLog: BatchLotAttemptLog = { lastLot: null };
  let lastCollision: unknown = null;

  for (let attempt = 1; attempt <= BATCH_LOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction((tx) =>
        write(tx, async () => {
          const lot = await resolveLot(tx, batch, scope);
          attemptLog.lastLot = lot;
          return lot;
        }),
      );
    } catch (error) {
      if (!isDuplicateBatchLot(error)) translateBatchWriteError(error);
      if (batch.lot !== null) {
        // El valor va al `diagnostic`, que acaba en el LOG del servidor y nunca en el navegador.
        throw new BatchDuplicateLotError(`empresa ${companyId}, lote escrito a mano '${batch.lot}'`);
      }
      lastCollision = error;
    }
  }

  throw new Error(
    `no se pudo escribir un lote generado sin chocar con el indice unico (company_id, lot): empresa ${companyId}, ultimo lote intentado '${attemptLog.lastLot ?? '(sin resolver)'}', ${BATCH_LOT_MAX_ATTEMPTS} intentos`,
    { cause: lastCollision },
  );
}

/**
 * `createWithFirstBatch` de `ProductRepository` (R16, R21).
 *
 * LAS DOS ESCRITURAS VAN EN UNA SOLA `prisma.$transaction` y ese es el punto entero de la
 * funcion: si el `INSERT` del lote revienta -una presentacion inexistente, un `CHECK`-, el
 * producto tampoco queda. Es lo que hace IMPOSIBLE el producto sin lote que R1 prohibe, y por
 * eso el puerto ofrece UNA operacion y no dos: el dominio no puede dejar la mitad escrita ni
 * queriendo.
 *
 * El `catch` esta FUERA de la transaccion, no dentro: capturarlo dentro del callback lo
 * consumiria y la transaccion se comitearia con el producto ya escrito. Aqui el error sale
 * del callback, Postgres deshace, y solo despues se traduce. Desde QC-81 ese `catch` -y el
 * reintento del lote generado (R15)- vive en `writeBatchWithLotRetry`, compartido con
 * `addBatchToAlive`: la transaccion la abre el, una por intento.
 *
 * El producto se escribe con `nameNormalized` en la misma llamada que `name`, igual que
 * `createProduct`, y con la MISMA existencia que el lote: es la decision cerrada del
 * 2026-09-10, transitoria hasta QC-91 (`design.md > 2`). Duplicar la existencia hoy es
 * deliberado, no un descuido.
 */
export async function createWithFirstBatch(
  product: NewProduct,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ id: string; batchId: string }> {
  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    const created = await tx.product.create({
      data: {
        name: product.name,
        nameNormalized: normalizeProductName(product.name),
        stock: product.stock ?? null,
        qtyAlert: product.qtyAlert ?? null,
        // QC-49 (R17): LAS DOS FILAS -el producto y su lote- llevan la MISMA empresa, la del
        // ambito, y las dos la toman del mismo sitio. Que coincidan no se confia a este
        // archivo: el disparador `product_batches_check_company` lo verifica en la base.
        ...companyScopeColumns(scope),
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    // QC-81 (R8, R9, R10, R25, R27): el lote se resuelve DENTRO de esta misma transaccion, justo
    // antes de escribirlo. Si el lote o su fila fallan, el producto de arriba tampoco queda.
    const lot = await resolveBatchLot();

    const createdBatch = await tx.productBatch.create({
      data: toBatchCreateData(created.id, batch, lot, now, scope),
      select: { id: true },
    });

    return { id: created.id, batchId: createdBatch.id };
  });
}

/**
 * `addBatchToAlive` de `ProductRepository` (R17, R18).
 *
 * ESCRIBE UNICAMENTE LA FILA DEL LOTE. No toca `name`, `stock` ni `qty_alert` del
 * producto, y TAMPOCO su `updated_at` (`design.md > 2`): agregar un lote no es editar el
 * producto, y con QC-91 esa escritura desapareceria igual. Por eso la fila del lote se crea
 * con `productId` ESCALAR y no con un `update` anidado colgando de `product`, que arrastraria
 * el `@updatedAt` del modelo y escribiria en `products` sin que nadie lo hubiera pedido.
 *
 * CONSECUENCIA DE QC-80 QUE HAY QUE CONOCER: aunque esta funcion no escriba en `products`, el
 * lote nuevo SI cambia lo que el producto devuelve en `latestBatchUnitId` -pasa a ser el mas
 * reciente-. Es exactamente lo que R22 pide: la unidad se DERIVA en cada lectura, no se copia a
 * ninguna columna que pudiera quedarse vieja.
 *
 * «SIGUE VIVO» ES UN `where`, NO UN `if` SOBRE LA FILA. `deleted_at IS NULL` viaja al SQL de
 * la consulta -la regla de este archivo desde QC-20 R16-; lo que se mira despues es si la
 * consulta DEVOLVIO fila, exactamente como `findAliveProductById` mira `row === null` y
 * `updateAliveProduct` mira `count === 1`. Lo prohibido -y lo que aqui no se hace- es traer
 * la fila entera y decidir en el lenguaje leyendo su `deletedAt`.
 *
 * Las dos sentencias van en una transaccion para que nadie pueda borrar el producto entre la
 * comprobacion y el `INSERT`. Devolver `null` -y no lanzar- es lo que exige el puerto: el
 * dominio no ve errores de Prisma, y quien decide que hacer con el producto que se borro
 * mientras tanto es el caso de uso.
 */
export async function addBatchToAlive(
  productId: string,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ batchId: string } | null> {
  // QC-81 (R13, R15): la transaccion -una por intento- y la politica de choque de lote las pone
  // `writeBatchWithLotRetry`, la misma que usa `createWithFirstBatch`.
  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    // QC-49 (R16): «de MI empresa» es un `where`, exactamente como «sigue vivo». Un producto de
    // otra empresa no devuelve fila y esta funcion sale por `null` -el mismo camino que «no
    // existe»-, sin escribir ningun lote. Decidirlo con un `if` sobre la fila leida ya seria
    // haber leido lo ajeno.
    const alive = await tx.product.findFirst({
      where: { AND: [productCompanyScope(scope), { id: productId, deletedAt: null }] },
      select: { id: true },
    });
    if (alive === null) return null;

    // QC-81 (R8, R9, R10, R27): DESPUES de confirmar que el producto sigue vivo y es de la
    // empresa: un alta que no va a escribir nada no pide lock ni consulta la serie.
    const lot = await resolveBatchLot();

    const createdBatch = await tx.productBatch.create({
      data: toBatchCreateData(alive.id, batch, lot, now, scope),
      select: { id: true },
    });

    return { batchId: createdBatch.id };
  });
}
