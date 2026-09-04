import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { NotFoundError, ValidationError } from '../../../domain/errors';

import type { PageQuery, Page } from '../../../domain/page';
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
 * PROHIBIDO tocar `users`: `createdBy`/`updatedBy` viajan como identificadores en crudo
 * (D20, R8). Este archivo no consulta el modelo de usuarios de Prisma, ni `include`/
 * `select` hacia `users`, ni `$queryRaw` sobre esa tabla. Quien necesite el nombre del
 * autor pide el contrato publico de `identity` (alcance de QC-22, no de esta ficha).
 */

/** `select` unico para las tres lecturas, con el `join` a `presentation` DENTRO del modulo (legitimo, `design.md > 6.1`). */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  presentationId: true,
  presentation: { select: { name: true } },
  stock: true,
  qtyAlert: true,
  unitId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * QC-52 (R1): `toDecimalInput`/`fromDecimalCost` se fueron con `cost`. Eran la unica
 * conversion `string <-> Prisma.Decimal` del modulo, y sin costo en el producto no queda
 * ningun importe que convertir aqui. La misma pareja de funciones vive, viva, en el
 * adaptador de la linea de catalogo de `proveedores`, que es donde el importe se quedo.
 */

/** Fila de Prisma (con el `join` de presentacion) -> `ProductView` del puerto. */
export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    presentationId: row.presentationId,
    presentationName: row.presentation.name,
    stock: row.stock,
    qtyAlert: row.qtyAlert,
    unitId: row.unitId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Clasifica, de forma PURA, el nombre de la restriccion (`meta.field_name` de un
 * `PrismaClientKnownRequestError` `P2003`) segun la columna que la disparo
 * (`design.md > 7`: "23503 al crear/editar un producto (autor o presentacion
 * inexistente) se traduce a NotFoundError/ValidationError segun la columna"). Se afirma
 * sobre el contenido de `meta`, nunca sobre el texto del mensaje (en espanol en esta
 * maquina, `design.md > 12`).
 *
 * `presentation_id` es un campo de ENTRADA que el borde ya valido como UUID pero cuya
 * existencia solo la base puede garantizar: se trata como entrada invalida
 * (`ValidationError`). `created_by`/`updated_by` no son entrada del formulario -son el
 * actor de sesion-, y su ausencia como usuario real es "el autor no existe"
 * (`NotFoundError`), que es la lectura literal de R7.
 */
export function classifyForeignKeyViolation(fieldName: string): 'presentation' | 'actor' | 'unknown' {
  if (fieldName.includes('presentation_id')) return 'presentation';
  if (fieldName.includes('created_by') || fieldName.includes('updated_by')) return 'actor';
  return 'unknown';
}

function fieldNameOf(error: Prisma.PrismaClientKnownRequestError): string {
  const meta: unknown = error.meta;
  if (typeof meta === 'object' && meta !== null && 'field_name' in meta) {
    const fieldName: unknown = (meta as { field_name: unknown }).field_name;
    if (typeof fieldName === 'string') return fieldName;
  }
  return '';
}

/**
 * Traduce un `P2003` (violacion de FK) al error de dominio que le corresponde y lo lanza.
 * Si la restriccion no es ninguna de las dos que este adaptador escribe a mano
 * (`products_presentation_id_fkey`, `products_created_by_fkey`,
 * `products_updated_by_fkey`), relanza el error original: el dominio nunca ve un
 * SQLSTATE, pero tampoco se traga un fallo que no sabe interpretar.
 */
function translateForeignKeyViolation(error: Prisma.PrismaClientKnownRequestError): never {
  switch (classifyForeignKeyViolation(fieldNameOf(error))) {
    case 'presentation':
      throw new ValidationError();
    case 'actor':
      throw new NotFoundError();
    default:
      throw error;
  }
}

function isForeignKeyViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * `create` de `ProductRepository` (R5, R6, R7). Escribe `created_by` Y `updated_by` con
 * el mismo `actorId`: al nacer, el autor de creacion y el de la ultima modificacion son
 * la misma persona (R6). `createdAt`/`updatedAt` usan el `now` inyectado por el caso de
 * uso, no `now()` de la base, para que el reloj sea el mismo que el service fijo.
 */
export async function createProduct(
  data: NewProduct,
  actorId: string,
  now: Date,
): Promise<{ id: string }> {
  try {
    const created = await prisma.product.create({
      data: {
        name: data.name,
        presentationId: data.presentationId,
        stock: data.stock ?? null,
        qtyAlert: data.qtyAlert ?? null,
        unitId: data.unitId ?? null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
}

/**
 * `findAliveById` de `ProductRepository` (R16). `deleted_at IS NULL` en el `where`, no
 * en un `if` posterior.
 */
export async function findAliveProductById(id: string): Promise<ProductView | null> {
  const row = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: PRODUCT_SELECT,
  });
  return row === null ? null : toProductView(row);
}

/**
 * `updateAlive` de `ProductRepository` (R6, R13, R14, R16). `updateMany` con
 * `deletedAt: null` en el `where` y no `update`: si el producto no existe o ya esta
 * borrado, `count` sale 0 y se devuelve `false` en vez de lanzar (R14). `data` NUNCA
 * incluye `createdBy`: conservar el autor de creacion es la mitad de R6 que solo se
 * demuestra aqui, porque ningun test unitario con doble del puerto puede verlo (R13: la
 * existencia -`stock`- se guarda tal cual, sin recalcularla, como el resto de campos de
 * negocio).
 */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  actorId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { count } = await prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: data.name,
        presentationId: data.presentationId,
        stock: data.stock ?? null,
        qtyAlert: data.qtyAlert ?? null,
        unitId: data.unitId ?? null,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1;
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
}

/**
 * `softDeleteAlive` de `ProductRepository` (R6, R14, R15, R16). Borrado LOGICO: solo
 * marca `deleted_at` (y `updated_by`/`updated_at`), NUNCA `prisma.product.delete`. La
 * fila se conserva entera. Mismo `updateMany` con `deletedAt: null` en el `where` que
 * `updateAliveProduct`, por la misma razon (R14): apuntar a un producto inexistente o ya
 * borrado devuelve `false`, no lanza.
 *
 * `updated_by` sigue siendo una FK a `users`: se traduce el mismo `P2003` que en
 * `createProduct`/`updateAliveProduct` por consistencia, aunque R7 solo lo exige para
 * alta y edicion (`design.md > 7`) -es la misma columna con la misma restriccion, y
 * dejarla sin traducir aqui filtraria un `PrismaClientKnownRequestError` crudo al
 * dominio en un camino que de otro modo se comporta igual-.
 */
export async function softDeleteAliveProduct(
  id: string,
  actorId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { count } = await prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1;
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
}

/**
 * `listAlive` de `ProductRepository` (R16, R23, R24, R26, R27, R35, R36). El `limit` que
 * llega a Prisma -y el `pageSize` que sale en el `Page`- es el ACOTADO que devuelve
 * `toOffsetLimit`, nunca el `pageSize` que pidio el llamante (`design.md > 8`): pasarle
 * el pedido a `buildPage` dejaria un `Page` con un `pageSize` y un `totalPages` mentirosos
 * aunque el `LIMIT` de SQL fuera correcto.
 *
 * Orden `name ASC, id ASC` (D19, R26, R35): el desempate por `id` no es adorno, es lo que
 * evita que dos productos homonimos -el nombre no es unico, D14, R12- se intercambien
 * entre paginas.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (mismo filtro
 * `deleted_at IS NULL`).
 */
export async function listAliveProducts(query: PageQuery): Promise<Page<ProductView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where: Prisma.ProductWhereInput = { deletedAt: null };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PRODUCT_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return buildPage(rows.map(toProductView), total, query.page, limit);
}
