import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { UNIT_QUERYABLE } from './unit-queryable';

import type { Page } from './page';
import type { UnitView } from './unit-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { UnitRepository } from '../ports/unit-repository';

/**
 * Cota que SIEMPRE se pasa al repositorio en el modo CATALOGO (R40 de QC-32): ninguna consulta
 * sin limite declarado. El catalogo es corto y cerrado (`design.md > 9` de QC-32); quien quiera
 * paginarlo de verdad manda `page`/`pageSize` y entra por el otro modo (R29).
 */
export const MAX_UNITS = 200;

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'units';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

export type ListUnitsDeps = {
  readonly units: UnitRepository;
  /** QC-57 (R6): el log de los campos omitidos. Puerto, no `console.warn`: el dominio no
   *  conoce el mundo exterior y R6 solo es testeable si el test puede espiar la llamada. */
  readonly log: ListQueryLog;
};

/**
 * Lo que devuelve el listado de unidades: **una union DISCRIMINADA POR LA FORMA DE LA ENTRADA**
 * (R27, R28, `design.md > 7`).
 *
 *   - sin `page` ni `pageSize` -> el CATALOGO ENTERO, `readonly UnitView[]`, como hoy;
 *   - con `page` o `pageSize` -> una `Page<UnitView>`.
 *
 * **No son dos metodos**, y eso es la decision: dos metodos obligarian a QC-39 a elegir cual
 * llamar segun lo que traiga la URL, que es justo la decision que este contrato quita de encima
 * de las pantallas. El discriminante en tiempo de ejecucion es `Array.isArray` -un array es el
 * catalogo; un objeto con `items` es la pagina-, y para eso esta `isUnitPage`.
 *
 * En tiempo de COMPILACION el discriminante son las dos firmas de `ListUnits`: quien llama sin
 * consulta -las tres pantallas que hoy hacen `listUnitsAction()`- recibe el array, no la union,
 * y no tiene que estrechar nada.
 */
export type UnitListResult = readonly UnitView[] | Page<UnitView>;

/** Estrecha la union de `UnitListResult` al caso paginado. Es el discriminante en ejecucion. */
export function isUnitPage(result: UnitListResult): result is Page<UnitView> {
  return !Array.isArray(result);
}

/**
 * Firma del caso de uso, con las DOS lecturas del contrato (`design.md > 7`). El orden de las
 * sobrecargas importa: la primera es la que atrapa `listUnits(undefined, actor)`, que es como lo
 * llama la Server Action de hoy, y le devuelve el catalogo SIN union que estrechar -por eso el
 * selector de unidad del formulario de recetas no se entera de esta ficha-.
 */
export type ListUnits = {
  (input: null | undefined, actor: Actor | null): Promise<readonly UnitView[]>;
  (input: unknown, actor: Actor | null): Promise<UnitListResult>;
};

/**
 * `true` si la entrada CRUDA pide paginacion, o sea si trae `page` o `pageSize` con un valor
 * (R28, R29). Se mira ANTES de `parse` a proposito: el esquema le pone `page: 1` por defecto a
 * toda consulta, asi que despues de validar ya no se puede distinguir «no pidio pagina» de
 * «pidio la primera». Quien decide la forma de la salida es lo que el llamante ESCRIBIO.
 */
function requestsPagination(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const raw: Record<string, unknown> = { ...input };
  return raw.page !== undefined || raw.pageSize !== undefined;
}

/**
 * Caso de uso de listado de unidades con el CONTRATO GENERICO de consulta y la **pagina
 * OPCIONAL** (QC-57 R27, R28, R29, R30, R33, R34; `design.md > 7`), acotado al AMBITO de la
 * empresa de quien pregunta (QC-76 R17, R18, R20).
 *
 * Los cinco pasos van en ESTE orden y el orden es el requisito (`design.md > 1`):
 *
 *   1. `requirePermission(actor, 'unidades.consultar')` PRIMERO, siempre (R33, R34 de QC-57;
 *      R12 de QC-74), antes de zod y antes de tocar el repositorio: si validara primero, un
 *      actor no autorizado con una consulta rota recibiria `ValidationError` y sabria algo del
 *      sistema sin tener permiso para preguntarlo. El permiso exigido es el de la tabla R16 de
 *      QC-74 y es el unico caso de uso del modulo.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede hacer
 *      fallar la consulta (R5).
 *   3. `sanitizeListQuery` contra `UNIT_QUERYABLE` (R4, R5, R7, R8).
 *   4. el log de lo podado (R6).
 *   5. el repositorio, con la consulta YA SANEADA (R13) y el AMBITO de la empresa del actor
 *      (QC-76 R17): las unidades de esa empresa MAS las de sistema, nunca las de otra.
 *
 * **Sin consulta se comporta EXACTAMENTE como hoy** (R28): `listAll(MAX_UNITS, ...)` y el
 * catalogo entero. El orden, el filtro y la busqueda SI se aplican si vienen, tambien en ese
 * modo: «sin paginar» no es «sin consultar».
 *
 * `units` **no tiene `deleted_at`** (no hay borrado logico de unidades): aqui no hay ninguna
 * condicion de vida que aplicar, y no se inventa una que la tabla no tiene.
 */
export function createListUnits(deps: ListUnitsDeps): ListUnits {
  function listUnits(input: null | undefined, actor: Actor | null): Promise<readonly UnitView[]>;
  function listUnits(input: unknown, actor: Actor | null): Promise<UnitListResult>;
  async function listUnits(input: unknown, actor: Actor | null): Promise<UnitListResult> {
    requirePermission(actor, 'unidades.consultar');

    const paginated = requestsPagination(input);

    const parsed = listQuerySchema.safeParse(input ?? {});
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, UNIT_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    // QC-76 (R17, R18): el caso de uso solo hace de CORREA. Traduce la empresa del actor a
    // ambito de lectura y se lo entrega al puerto; ni construye SQL ni conoce el `OR` de
    // «empresa o sistema», que vive una sola vez en el adaptador. Y el permiso YA se exigio en
    // la primera linea: la empresa filtra, no autoriza (R20).
    const scope = { companyId: actor.companyId };

    return paginated
      ? deps.units.listPage(query, scope)
      : deps.units.listAll(MAX_UNITS, query, scope);
  }

  return listUnits;
}
