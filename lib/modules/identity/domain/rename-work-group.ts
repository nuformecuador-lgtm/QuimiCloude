// lib/modules/identity/domain/rename-work-group.ts
import { requirePermission, type Actor } from './actor';
import {
  ValidationError,
  WorkGroupDuplicateNameError,
  WorkGroupNotFoundError,
} from './errors';
import { renameWorkGroupSchema } from './work-group-input';
import { normalizeWorkGroupName } from './work-group-name';

import type { WorkGroupRepository } from '../ports/work-group-repository';

export type RenameWorkGroupDeps = {
  readonly workGroups: WorkGroupRepository;
};

/**
 * QC-84 T6 — Renombrar un grupo de trabajo (R16, R17, R18).
 *
 * `requirePermission(actor, 'usuarios.modificar')` PRIMERO, antes de `zod` y antes del puerto (R1,
 * R2, R3), por el mismo motivo que en `create-work-group.ts`.
 *
 * **Reemplaza el nombre Y su forma normalizada** (R16), la segunda con `normalizeWorkGroupName`
 * (R13), y no toca la empresa, la marca de baja, el identificador ni ninguna fila de pertenencia:
 * este caso de uso no tiene ninguna via para hacerlo —el puerto no se la da—.
 *
 * **R18 se cumple por AUSENCIA, y conviene decirlo:** renombrar no modifica ninguna asignacion de
 * pedido ya persistida —ni su referencia al grupo ni el nombre CONGELADO que QC-86 guardo— porque
 * este archivo no importa `@/lib/modules/asignaciones`, no nombra `order_assignments` y el puerto de
 * grupos no sabe que esa tabla existe. Un pedido asignado antes del cambio sigue diciendo como se
 * llamaba el grupo el dia que se asigno.
 *
 * **Los tres «no encontrado» son el MISMO caso** (R8, R9): el grupo no existe, esta dado de baja o
 * es de otra empresa. Responde `WorkGroupNotFoundError` y **no** `unauthorized`, por el criterio de
 * oraculo de existencia de QC-38, QC-43 y QC-66: decir «no tienes permiso» sobre un identificador
 * ajeno confirmaria que existe.
 *
 * El duplicado es el **mismo** error que el del alta (R17) y nace del **mismo** indice unico parcial
 * de QC-83: no hay una segunda regla de «mismo nombre» ni un segundo `code`.
 */
export function createRenameWorkGroup(
  deps: RenameWorkGroupDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function renameWorkGroup(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = renameWorkGroupSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { workGroupId, name } = parsed.data;

    const outcome = await deps.workGroups.renameAliveInCompany(
      actor.companyId,
      workGroupId,
      name,
      normalizeWorkGroupName(name),
    );

    if (outcome === 'ok') return;
    if (outcome === 'not_found') throw new WorkGroupNotFoundError();
    throw new WorkGroupDuplicateNameError();
  };
}
