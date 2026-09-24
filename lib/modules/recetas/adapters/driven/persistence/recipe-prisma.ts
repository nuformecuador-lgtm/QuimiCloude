import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { recipeStepSchema } from '../../../domain/recipe-input';
import { normalizeRecipeName } from '../../../domain/recipe-name';
import { ValidationError } from '../../../domain/errors';
import type { RecipeScope } from '../../../domain/recipe-scope';
import type { RecipeStepView } from '../../../domain/recipe-view';

import { companyScopeColumns, recipeCompanyScope } from './company-scope';
import { dateRangeCondition, normalizedSearchCondition } from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';

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
 * `percentage` viaja como CADENA por el puerto (el dominio no puede importar
 * `@prisma/client`): `toDecimalInput`/`fromDecimalPercentage` son el UNICO
 * sitio del modulo que convierte en los dos sentidos.
 */

const RECIPE_INCLUDE = { lines: true } satisfies Prisma.RecipeInclude;

type RecipeWithLines = Prisma.RecipeGetPayload<{ include: typeof RECIPE_INCLUDE }>;

/** Cadena decimal(5,2) del puerto -> `Prisma.Decimal` para escribir; NULL pasa intacto. */
export function toDecimalInput(percentage: string | null): Prisma.Decimal | null {
  return percentage === null ? null : new Prisma.Decimal(percentage);
}

/** `Prisma.Decimal` de una lectura -> cadena con 2 decimales fijos (mismo criterio que `cost` en `inventario`); NULL pasa intacto. */
export function fromDecimalPercentage(percentage: Prisma.Decimal | null): string | null {
  return percentage === null ? null : percentage.toFixed(2);
}

/**
 * `Json` de la columna `steps` -> lista de pasos del puerto (R20, QC-62 R17).
 *
 * Cada elemento se valida con el esquema del DOMINIO y el que no pasa **se descarta**,
 * conservando los demas y su orden. Se descarta en vez de fallar la lectura porque una fila
 * escrita a mano en la consola no debe tumbar la pantalla de recetas de todo el mundo.
 *
 * La tolerancia anterior -paso guardado como cadena suelta, con relleno del tipo por
 * defecto- SE ELIMINO: la migracion `recipe_steps_reset` deja la columna en `[]` en todas
 * las recetas (QC-62 R14), asi que ya no queda nada de aquella forma que tolerar.
 */
export function toSteps(steps: Prisma.JsonValue): readonly RecipeStepView[] {
  if (!Array.isArray(steps)) return [];

  const parsed: RecipeStepView[] = [];
  for (const step of steps) {
    const result = recipeStepSchema.safeParse(step);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function toLineRow(line: RecipeWithLines['lines'][number]): RecipeLineRow {
  return {
    id: line.id,
    productId: line.productId,
    percentage: fromDecimalPercentage(line.percentage),
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

/** Columna que protege el indice unico parcial de `recipes` (`recipes_name_unique`,
 *  escrito a mano en `migration.sql`: Prisma no modela indices parciales, ver el
 *  comentario de `model Recipe` en `db/schema.prisma`). Verificado empiricamente contra
 *  Postgres real (T14): cuando el conector de Prisma traduce un `23505` a `P2002` para
 *  ESTE indice, `error.meta.target` incluye `name_normalized` -la(s) COLUMNA(S), nunca el
 *  nombre del indice-. Desde que el indice se volvio compuesto por empresa, `target` trae
 *  tambien `company_id`, pero eso no cambia nada aqui: se comprueba que la lista de
 *  columnas INCLUYE `name_normalized`, no que sea exactamente esa. Es la UNICA columna
 *  cuya violacion cuenta como "nombre duplicado"; el otro unico de esta feature
 *  -`(recipe_id, product_id)` de `recipe_lines`, verificado con el mismo metodo y cuyo
 *  `target` sale `['recipe_id', 'product_id']`- es un dato distinto y jamas debe
 *  traducirse a `RecipeDuplicateNameError`. */
const RECIPE_NAME_UNIQUE_COLUMN = 'name_normalized';

/**
 * `P2002` SOLO cuenta como "nombre duplicado" cuando la columna que dispara la violacion
 * es la de `recipes` (`design.md > 7.3`, R10). Antes de esta correccion (hallazgo menor-5
 * de review QC-25) CUALQUIER `P2002`/`23505` -incluido el de
 * `recipe_lines_recipe_id_product_id_key`- se traducia a `RecipeDuplicateNameError`; hoy ese
 * caso es inalcanzable en la practica porque zod rechaza antes las lineas repetidas
 * (R16), pero traducirlo mal seria incorrecto si algun dia dejara de serlo.
 *
 * Se inspecciona `error.meta.target` (columnas afectadas, ver la constante de arriba
 * para la forma real verificada empiricamente). La ruta `23505` sin `meta.target`
 * disponible -`PrismaClientUnknownRequestError`, escritura anidada, ver `sqlStateOf`- no
 * trae informacion inspeccionable sobre QUE columna violo: ahi no se puede distinguir con
 * seguridad entre el nombre y `(recipe_id, product_id)`, asi que se documenta la
 * limitacion y NO se asume "nombre duplicado" a ciegas -conservador: mejor relanzar el
 * error crudo que traducirlo mal. Solo se cierra con seguridad el caso
 * `PrismaClientKnownRequestError` con `meta.target`.
 */
function isUniqueNameViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;

  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return target.includes(RECIPE_NAME_UNIQUE_COLUMN);
  if (Array.isArray(target)) return target.includes(RECIPE_NAME_UNIQUE_COLUMN);
  // `meta.target` ausente en este conector: sin forma de distinguir la columna, no se
  // asume que es la del nombre.
  return false;
}

/** `23514`: el `CHECK` de rango de `percentage`. Nunca `'duplicate'`. */
function isPercentageCheckViolation(error: unknown): boolean {
  return sqlStateOf(error) === '23514';
}

/** Traduce el SQLSTATE al resultado discriminado del puerto, o relanza si no lo reconoce. */
function translateWriteError(error: unknown): never {
  if (isPercentageCheckViolation(error)) throw new ValidationError();
  throw error;
}

/** `create` de `RecipeRepository` (R5, R6, R8). Las lineas se crean anidadas: en el alta
 *  TODAS son nuevas, no hay ninguna conciliacion que hacer (eso es solo de `replaceAlive`). */
export async function createRecipe(
  data: NewRecipe,
  actorId: string,
  now: Date,
  scope: RecipeScope,
): Promise<{ id: string } | 'duplicate'> {
  try {
    const created = await prisma.recipe.create({
      data: {
        ...companyScopeColumns(scope),
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
            percentage: toDecimalInput(line.percentage),
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
export async function findAliveRecipeById(id: string, scope: RecipeScope): Promise<RecipeRow | null> {
  const row = await prisma.recipe.findFirst({
    where: { id, deletedAt: null, ...recipeCompanyScope(scope) },
    include: RECIPE_INCLUDE,
  });
  return row === null ? null : toRecipeRow(row);
}

/**
 * Desempate ESTABLE por identificador (QC-57 R10). No es adorno y por eso es una constante con
 * nombre: aunque el nombre de receta viva sea unico -por eso el orden de hoy no lo necesitaba
 * (D13, R32 de QC-26)-, el contrato deja ordenar por `createdAt`/`updatedAt`, donde el empate SI
 * es posible; sin un segundo criterio, dos recetas empatadas pueden intercambiarse -o perderse-
 * entre paginas, porque el orden de las filas empatadas no esta definido y Postgres puede
 * devolverlas distinto en cada consulta.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.RecipeOrderByWithRelationInput;

/**
 * Orden POR DEFECTO: exactamente el de hoy, `name ASC` (R11). Sin `sort`, la lista no se mueve;
 * el desempate por `id` que se le anade detras no la cambia -el nombre es unico entre vivas, asi
 * que no hay empates que romper- y la deja estable el dia que deje de serlo.
 *
 * Se construye en CADA llamada, no como constante compartida: Prisma exige un array mutable en
 * `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la mutara para todos.
 */
function defaultOrderBy(): Prisma.RecipeOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11). Los tres campos de
 * `RECIPE_QUERYABLE.sortable` -`name`, `createdAt`, `updatedAt`- son NO ANULABLES en
 * `schema.prisma`, asi que aqui no hay ningun `nulls: 'last'` que declarar: la decision cerrada
 * de los nulos no tiene materia en `recipes`.
 *
 * El `default` no puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta
 * declarado, pero el adaptador no puede depender de que su llamante lo haya hecho -es defensa en
 * profundidad, y mantiene R5 cierto tambien aqui: un campo desconocido cae al orden por defecto,
 * no revienta la consulta-.
 */
export function recipeOrderBy(sort: ListSort | null): Prisma.RecipeOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
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
 * acota nada (rango con los dos extremos nulos).
 *
 * `RECIPE_QUERYABLE` declara UN filtro, `createdAt` (`dateRange`). Las otras tres formas del
 * contrato (R12) no tienen ninguna columna declarada que traducir en `recipes` y devuelven
 * `null`: `sanitizeListQuery` ya las habria podado antes, y escribir una rama para una columna
 * que nadie declara seria codigo muerto. El dia que `recipes` declare un `select` o un
 * `numberRange`, la rama se anade aqui y su helper se replica desde `inventario`.
 */
function recipeFilterWhere(field: string, value: ListFilterValue): Prisma.RecipeWhereInput | null {
  switch (value.kind) {
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      if (field === 'createdAt') return { createdAt: condition };
      if (field === 'updatedAt') return { updatedAt: condition };
      return null;
    }
    case 'text':
    case 'numberRange':
    case 'select':
      return null;
  }
}

/**
 * `where` UNICO del listado de recetas: el mismo objeto para el `findMany` y para el `count`
 * (R14). Tres capas, y ninguna sobra:
 *
 *   1. **`deletedAt: null` y el ambito de empresa SIEMPRE**, al mismo nivel y NUNCA fundidos
 *      con la busqueda ni con los filtros (R7, R36 de QC-26): un termino de busqueda no puede
 *      ampliar lo visible mas alla de la propia empresa. `deletedAt` no es consultable en
 *      ninguna lista blanca y `sanitizeListQuery` lo poda ademas por su cuenta.
 *   2. **La busqueda contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 *      `normalizeRecipeName` -la MISMA funcion que escribio la columna y la MISMA con la que el
 *      modulo compara nombres para la unicidad: R19 prohibe una segunda definicion de "mismo
 *      nombre"-. Es lo que hace que buscar "solucion" encuentre "Solucion Buffer pH 7". Sin
 *      `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas, y pedirlo ademas
 *      dejaria fuera el indice de trigramas.
 *   3. **Los filtros, TODOS a la vez** (R15): un `AND` explicito, de modo que una fila sale solo
 *      si los cumple todos.
 */
export function buildRecipeWhere(query: ListQuery, scope: RecipeScope): Prisma.RecipeWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeRecipeName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => recipeFilterWhere(field, value))
    .filter((condition): condition is Prisma.RecipeWhereInput => condition !== null);

  return {
    deletedAt: null,
    ...recipeCompanyScope(scope),
    ...(search === null ? {} : { nameNormalized: search }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `listAlive` de `RecipeRepository` con el CONTRATO GENERICO de consulta (QC-57 R10, R11, R13,
 * R14, R15, R16, R18; R29-R32, R36 de QC-26). `offset`/`limit` siguen llegando YA calculados por
 * quien llama -el dominio de `recetas` recibe la aritmetica de `lib/shared/pagination`
 * INYECTADA, R31, R40-: este adaptador no hace ninguna aritmetica de paginacion, solo pasa
 * `skip`/`take` a Prisma. Lo que ahora recibe ademas es la consulta ya saneada, para traducirla.
 *
 * ORDEN, FILTRO Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13): filtrar lo ya
 * descargado es justo lo que QC-22 y QC-26 rechazaron por enganoso, y ademas dejaria un `total`
 * mentiroso.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (R14) -literalmente la misma
 * constante, no dos copias parecidas-, de modo que el `total` describa el conjunto YA FILTRADO.
 */
export async function listAliveRecipes(
  offset: number,
  limit: number,
  query: ListQuery,
  scope: RecipeScope,
): Promise<{ rows: readonly RecipeRow[]; total: number }> {
  const where = buildRecipeWhere(query, scope);

  const [rows, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      include: RECIPE_INCLUDE,
      orderBy: recipeOrderBy(query.sort),
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
  scope: RecipeScope,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.recipe.updateMany({
        where: { id, deletedAt: null, ...recipeCompanyScope(scope) },
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
            percentage: toDecimalInput(line.percentage),
          },
          update: {
            percentage: toDecimalInput(line.percentage),
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
  scope: RecipeScope,
): Promise<'ok' | 'not_found'> {
  const result = await prisma.recipe.updateMany({
    where: { id, deletedAt: null, ...recipeCompanyScope(scope) },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return result.count === 0 ? 'not_found' : 'ok';
}
