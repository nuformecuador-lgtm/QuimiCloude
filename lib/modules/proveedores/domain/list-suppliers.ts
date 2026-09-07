import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { SUPPLIER_QUERYABLE } from './supplier-queryable';

import type { Page } from './page';
import type { SupplierView } from './supplier-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { SupplierRepository } from '../ports/supplier-repository';

export type ListSuppliersDeps = {
  readonly suppliers: SupplierRepository;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'suppliers';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Lista paginada de proveedores con el CONTRATO GENERICO de consulta (QC-57 T11, R30, R33).
 *
 * Los cinco pasos van en ESTE orden y el orden es el requisito (`design.md > 1`):
 *
 *   1. `requirePermission(actor, 'proveedores.consultar')` PRIMERO, siempre (R33, R34; QC-74
 *      R12). Antes de zod y antes de tocar el puerto: si
 *      validara primero, un actor no autorizado con una consulta rota recibiria
 *      `ValidationError` y sabria algo del sistema sin tener permiso para preguntarlo.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede
 *      hacer fallar la consulta (R5), asi que de eso no se ocupa el esquema.
 *   3. `sanitizeListQuery` contra `SUPPLIER_QUERYABLE` (R4, R5, R7, R8).
 *   4. el log de lo podado (R6).
 *   5. el puerto, con la consulta YA SANEADA (R13).
 *
 * El defecto de 10, el tope de 25 (R29), el orden por defecto `name ASC, id ASC` (R11) y el
 * filtro de los dados de baja (R7) siguen siendo del adaptador driven, que es el unico que
 * puede importar `lib/shared/pagination` y conocer la base.
 *
 * La BUSQUEDA compara contra la forma normalizada del nombre, la MISMA que decide si un nombre
 * ya existe (`normalizeSupplierName`, R19): buscar y comparar no discrepan. Quien la aplica es
 * el adaptador, que es quien conoce la columna.
 */
export function createListSuppliers(
  deps: ListSuppliersDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<SupplierView>> {
  return async function listSuppliers(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<SupplierView>> {
    requirePermission(actor, 'proveedores.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, SUPPLIER_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.suppliers.listAlive(query);
  };
}
