// lib/modules/identity/domain/delete-work-group.ts
import { requirePermission, type Actor } from './actor';
import { ValidationError, WorkGroupNotFoundError } from './errors';
import { deleteWorkGroupSchema } from './work-group-input';

import type { WorkGroupRepository } from '../ports/work-group-repository';

export type DeleteWorkGroupDeps = {
  readonly workGroups: WorkGroupRepository;
  /**
   * Ver el comentario identico de `create-user.ts` sobre el origen de este reloj: el `now` de la
   * marca de baja **no** es una entrada del actor —`deleteWorkGroupSchema` no tiene ningun campo de
   * fecha— y se resuelve como dependencia INYECTABLE, con `() => new Date()` por defecto, para que
   * el test pueda fijarlo sin tocar el reloj global.
   */
  readonly now?: () => Date;
};

/**
 * QC-84 T6 — Dar de baja un grupo de trabajo (R37, R38, R39, R40).
 *
 * `requirePermission(actor, 'usuarios.modificar')` PRIMERO, antes de `zod` y antes del puerto (R1,
 * R2, R3).
 *
 * **La baja es LOGICA** (R37): el puerto marca `deleted_at` y conserva la fila entera, jamas un
 * `DELETE`. Y **conserva intactas todas sus pertenencias** (R38, decision 8): no se pierde quien
 * estaba dentro y la baja sigue siendo del GRUPO, no de las personas. Este caso de uso no tiene
 * ninguna via para tocarlas.
 *
 * **R39 se cumple por AUSENCIA**: no se modifica ni se elimina ninguna asignacion de pedido —ni las
 * personas congeladas, ni la referencia al grupo, ni el nombre congelado de QC-86—, porque este
 * archivo no importa `@/lib/modules/asignaciones` y el puerto de grupos no conoce esa tabla. Ningun
 * pedido queda sin responsables.
 *
 * **No existe ninguna operacion de restaurar ni ningun listado de bajas** (R40): no esta aqui, no
 * esta en el puerto y no esta en el contrato del modulo. Lo que no se puede expresar no se puede
 * hacer por descuido. Ademas el nombre queda LIBRE dentro de la empresa (R41) porque el indice unico
 * de QC-83 es **parcial** —solo mira filas vivas—, no porque nadie lo borre.
 *
 * Dar de baja un grupo ya dado de baja responde `WorkGroupNotFoundError` sin modificar ninguna fila
 * (R9), igual que el grupo inexistente y el de otra empresa: para el dominio son el MISMO caso.
 */
export function createDeleteWorkGroup(
  deps: DeleteWorkGroupDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<void> {
  const now = deps.now ?? ((): Date => new Date());

  return async function deleteWorkGroup(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = deleteWorkGroupSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const outcome = await deps.workGroups.softDeleteAliveInCompany(
      actor.companyId,
      parsed.data.workGroupId,
      now(),
    );

    if (outcome === 'not_found') throw new WorkGroupNotFoundError();
  };
}
