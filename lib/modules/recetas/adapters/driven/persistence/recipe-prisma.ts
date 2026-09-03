import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { normalizeRecipeName } from '../../../domain/recipe-name';
import { ValidationError } from '../../../domain/errors';

import type { NewRecipe, RecipeLineData, RecipeLineRow, RecipeRow } from '../../../ports/recipe-repository';

/**
 * Implementa `RecipeRepository` (`design.md > 7.3`, `> 8`) con Prisma. UNICO archivo del
 * modulo `recetas` que importa `@prisma/client`.
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura y de TODA escritura que exija que
 * la receta siga viva (`findAliveById`, `listAlive`, `replaceAlive`, `softDeleteAlive`),
 * NUNCA en un `if` posterior (R36). `nameNormalized` se calcula AQUI, con la UNICA
 * definicion de `normalizeRecipeName` que publica el contrato del modulo (R8), y se
 * escribe siempre junto al nombre, en la misma escritura.
 *
 * `quantity` viaja como CADENA por el puerto (el dominio no puede importar
 * `@prisma/client`, `design.md > 2`): `toDecimalInput`/`fromDecimalQuantity` son el UNICO
 * sitio del modulo que convierte en los dos sentidos.
 */

const RECIPE_INCLUDE = { lines: true } satisfies Prisma.RecipeInclude;

type RecipeWithLines = Prisma.RecipeGetPayload<{ include: typeof RECIPE_INCLUDE }>;

/** Cadena decimal(14,4) del puerto -> `Prisma.Decimal` para escribir. */
export function toDecimalInput(quantity: string): Prisma.Decimal {
  return new Prisma.Decimal(quantity);
}

/** `Prisma.Decimal` de una lectura -> cadena con 4 decimales fijos (mismo criterio que `cost` en `inventario`). */
export function fromDecimalQuantity(quantity: Prisma.Decimal): string {
  return quantity.toFixed(4);
}

/** `Json` de la columna `steps` -> lista de textos del puerto. La columna solo guarda eso (R20). */
function toSteps(steps: Prisma.JsonValue): readonly string[] {
  return Array.isArray(steps) ? (steps as string[]) : [];
}

function toLineRow(line: RecipeWithLines['lines'][number]): RecipeLineRow {
  return {
    id: line.id,
    productId: line.productId,
    quantity: fromDecimalQuantity(line.quantity),
    unitId: line.unitId,
  };
}

/** Fila de Prisma (con sus lineas) -> `RecipeRow` del puerto. */
export function toRecipeRow(row: RecipeWithLines): RecipeRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: toSteps(row.steps),
    imagePath: row.imagePath,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map(toLineRow),
  };
}

/**
 * SQLSTATE de un error de Postgres, leido de `meta.code` cuando esta disponible y, si
 * no, del propio codigo de Prisma (`error.code`, p. ej. `P2002`). Mismo criterio que
 * `sqlStateOf` de `tests/integration/recetas/recetas-constraints.int.test.ts`: se afirma
 * sobre el codigo, nunca sobre el texto del mensaje (en esta maquina Postgres responde en
 * espanol).
 *
 * Un `CHECK` violado dentro de una escritura ANIDADA (p. ej. `recipe.create({ data: {
 * lines: { create: [...] } } })`) llega como `PrismaClientUnknownRequestError`, no como
 * `PrismaClientKnownRequestError`: el conector no le asigna un `user_facing_error`, pero
 * SI incrusta el SQLSTATE, estructurado, en `error.message` (`code: "23514"`, nunca
 * traducido: es el campo interno del conector, no el mensaje humano de Postgres). Se lee
 * de ahi con una expresion regular sobre ESE campo -sigue sin leerse el texto del
 * mensaje-, verificado empiricamente contra Postgres real en esta maquina (T14).
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

/** `23505`/`P2002`: el indice unico parcial de `recipes` (`design.md > 7.3`, R10). */
function isUniqueNameViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
    sqlStateOf(error) === '23505'
  );
}

/** `23514`: el `CHECK` de `quantity > 0` (`design.md > 7.3`, R14). Nunca `'duplicate'`. */
function isQuantityCheckViolation(error: unknown): boolean {
  return sqlStateOf(error) === '23514';
}

/** Traduce el SQLSTATE al resultado discriminado del puerto, o relanza si no lo reconoce. */
function translateWriteError(error: unknown): never {
  if (isQuantityCheckViolation(error)) throw new ValidationError();
  throw error;
}

/** `create` de `RecipeRepository` (R5, R6, R8). Las lineas se crean anidadas: en el alta
 *  TODAS son nuevas, no hay ninguna conciliacion que hacer (eso es solo de `replaceAlive`). */
export async function createRecipe(
  data: NewRecipe,
  actorId: string,
  now: Date,
): Promise<{ id: string } | 'duplicate'> {
  try {
    const created = await prisma.recipe.create({
      data: {
        name: data.name,
        nameNormalized: normalizeRecipeName(data.name),
        description: data.description,
        steps: data.steps as unknown as Prisma.InputJsonValue,
        imagePath: data.imagePath,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
        lines: {
          create: data.lines.map((line) => ({
            productId: line.productId,
            quantity: toDecimalInput(line.quantity),
            unitId: line.unitId,
          })),
        },
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    translateWriteError(error);
  }
}

/** `findAliveById` de `RecipeRepository` (R18, R33, R36). */
export async function findAliveRecipeById(id: string): Promise<RecipeRow | null> {
  const row = await prisma.recipe.findFirst({
    where: { id, deletedAt: null },
    include: RECIPE_INCLUDE,
  });
  return row === null ? null : toRecipeRow(row);
}

/**
 * `listAlive` de `RecipeRepository` (R29-R32, R36). `offset`/`limit` llegan YA
 * calculados por quien llama -el dominio de `recetas` los recibe como dependencia
 * inyectada de `lib/shared/pagination`, R31, R40-: este adaptador no hace ninguna
 * aritmetica de paginacion, solo pasa `skip`/`take` a Prisma. Orden `name ASC` SIN
 * desempate (D13, R32): el nombre de receta es unico entre vivas.
 */
export async function listAliveRecipes(
  offset: number,
  limit: number,
): Promise<{ rows: readonly RecipeRow[]; total: number }> {
  const where: Prisma.RecipeWhereInput = { deletedAt: null };

  const [rows, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: RECIPE_INCLUDE,
      orderBy: { name: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.recipe.count({ where }),
  ]);

  return { rows: rows.map(toRecipeRow), total };
}

/** Ids de linea final, para el paso 2 (`DELETE ... NOT IN`) de la conciliacion. */
function productIdsOf(lines: readonly RecipeLineData[]): readonly string[] {
  return lines.map((line) => line.productId);
}

/**
 * `replaceAlive` de `RecipeRepository` (R11, R12, R13; `design.md > 8`). Los TRES pasos
 * corren dentro de UNA sola `prisma.$transaction`, exactamente en este orden:
 *
 * 1. `UPDATE recipes ... WHERE id = $1 AND deleted_at IS NULL` -> 0 filas => `'not_found'`.
 * 2. `DELETE FROM recipe_lines WHERE recipe_id = $1 AND product_id NOT IN (<finales>)` ->
 *    borrado FISICO real (R12), nunca `deletedAt`: `RecipeLine` no lo tiene.
 * 3. `upsert` de cada linea final sobre la clave natural `(recipe_id, product_id)`:
 *    inserta la nueva, actualiza cantidad/unidad de la que ya estaba. Conserva `id` y
 *    `created_at` de la linea preexistente (`design.md > 8`, alternativa 12.5 descartada).
 *
 * Si cualquier paso falla, la transaccion entera revierte (R13): ninguna receta queda
 * parcialmente conciliada.
 */
export async function replaceAliveRecipe(
  id: string,
  data: NewRecipe,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.recipe.updateMany({
        where: { id, deletedAt: null },
        data: {
          name: data.name,
          nameNormalized: normalizeRecipeName(data.name),
          description: data.description,
          steps: data.steps as unknown as Prisma.InputJsonValue,
          imagePath: data.imagePath,
          updatedAt: now,
          updatedBy: actorId,
        },
      });
      if (updated.count === 0) return 'not_found';

      const finalProductIds = productIdsOf(data.lines);
      await tx.recipeLine.deleteMany({
        where: {
          recipeId: id,
          ...(finalProductIds.length > 0 ? { productId: { notIn: [...finalProductIds] } } : {}),
        },
      });

      for (const line of data.lines) {
        await tx.recipeLine.upsert({
          where: { recipeId_productId: { recipeId: id, productId: line.productId } },
          create: {
            recipeId: id,
            productId: line.productId,
            quantity: toDecimalInput(line.quantity),
            unitId: line.unitId,
          },
          update: {
            quantity: toDecimalInput(line.quantity),
            unitId: line.unitId,
          },
        });
      }

      return 'ok';
    });
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    translateWriteError(error);
  }
}

/** `softDeleteAlive` de `RecipeRepository` (R6, R27, R35). Borrado LOGICO: solo marca
 *  `deleted_at`, nunca `prisma.recipe.delete`. `updateMany` para distinguir "no existe o ya
 *  borrada" (`count === 0`) de una excepcion, sin depender de `P2025`. */
export async function softDeleteAliveRecipe(
  id: string,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const result = await prisma.recipe.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return result.count === 0 ? 'not_found' : 'ok';
}
