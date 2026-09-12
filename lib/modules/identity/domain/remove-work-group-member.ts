// lib/modules/identity/domain/remove-work-group-member.ts
import { requirePermission, type Actor } from './actor';
import {
  ValidationError,
  WorkGroupMemberNotFoundError,
  WorkGroupNotFoundError,
} from './errors';
import { workGroupMemberSchema } from './work-group-input';

import type { WorkGroupRepository } from '../ports/work-group-repository';

export type RemoveWorkGroupMemberDeps = {
  readonly workGroups: WorkGroupRepository;
};

/**
 * QC-84 T6 — Sacar a **una** persona de un grupo de trabajo (R33, R34, R35, R36).
 *
 * `requirePermission(actor, 'usuarios.modificar')` PRIMERO, antes de `zod` y antes del puerto (R1,
 * R2, R3).
 *
 * **Sacar es un `DELETE` FISICO de la fila de pertenencia** (R34), y es lo contrario de dar de baja
 * el grupo, que es un `UPDATE` de `deleted_at` (R37). Los dos casos de uso —y los dos metodos del
 * puerto— se llaman distinto A PROPOSITO: es la confusion que QC-83 dejo avisada por escrito en su
 * decision 5. Aqui no se marca, no se desactiva y no se conserva la fila de ninguna otra forma.
 *
 * **Lo que NO hace** (R35): no borra, desactiva ni modifica a esa persona, no elimina sus
 * pertenencias a OTROS grupos y no da de baja ni modifica el grupo, aunque fuera su ultimo miembro.
 * No tiene ninguna via para hacerlo: el metodo del puerto solo sabe borrar UNA fila de pertenencia.
 *
 * **La entrada es la misma que la de meter, pero los casos de uso son DOS** (R33): son operaciones
 * distintas, con errores distintos, y una sola con una bandera invitaria a construir desde la
 * pantalla el «pon exactamente esta lista» que la decision 6 descarto.
 *
 * **Dos «no encontrado» y no uno**, porque son dos mensajes distintos: el grupo inexistente, dado de
 * baja o de otra empresa (R8, R9) y la persona que **no pertenece** al grupo (R36) —que puede
 * existir perfectamente; lo que falta es la fila de PERTENENCIA—. En los dos casos no se modifica
 * ninguna fila.
 */
export function createRemoveWorkGroupMember(
  deps: RemoveWorkGroupMemberDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  return async function removeWorkGroupMember(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = workGroupMemberSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { workGroupId, userId } = parsed.data;

    const outcome = await deps.workGroups.removeMemberAliveInCompany(
      actor.companyId,
      workGroupId,
      userId,
    );

    if (outcome === 'ok') return;
    if (outcome === 'group_not_found') throw new WorkGroupNotFoundError();
    throw new WorkGroupMemberNotFoundError();
  };
}
