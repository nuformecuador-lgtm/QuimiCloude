// lib/modules/identity/domain/create-work-group.ts
import { requirePermission, type Actor } from './actor';
import { ValidationError, WorkGroupDuplicateNameError } from './errors';
import { createWorkGroupSchema } from './work-group-input';
import { normalizeWorkGroupName } from './work-group-name';

import type { WorkGroupRepository } from '../ports/work-group-repository';

export type CreateWorkGroupDeps = {
  readonly workGroups: WorkGroupRepository;
};

/**
 * QC-84 T6 — Alta de un grupo de trabajo (R10, R11, R12, R13, R14).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de `zod` y antes de
 * tocar ningun puerto (R1, R2): si validara primero, un actor sin permiso con una entrada rota
 * recibiria `ValidationError` y sabria algo del sistema sin tener derecho a preguntarlo. El test de
 * autorizacion lo demuestra con dobles que **fallan si los llaman**. Y `usuarios.consultar` no lo
 * concede (R3): la comprobacion es de pertenencia exacta.
 *
 * **La empresa sale del ACTOR y de ningun otro sitio** (R11): `createWorkGroupSchema` es un
 * `strictObject` que no admite `companyId` —mandarlo FALLA, no se ignora— y aqui se pasa
 * `actor.companyId` como argumento propio del puerto. No hay ninguna forma de crear un grupo en otra
 * empresa.
 *
 * **La forma canonica la calcula `normalizeWorkGroupName`** (R13), la unica definicion de «mismo
 * nombre de grupo» que publica el contrato (QC-83 R3). No se declara aqui ninguna segunda
 * normalizacion ni se comparan nombres por su forma original: en este archivo no hay ni un
 * `toLowerCase`.
 *
 * **El duplicado lo decide el INDICE, no una consulta previa** (R12): el puerto no expone ninguna
 * busqueda por nombre, asi que el `SELECT` previo —que es una carrera— ni siquiera es expresable.
 * Aqui solo se traduce el resultado discriminado a `WorkGroupDuplicateNameError`, que lleva su
 * `code` estable.
 *
 * Se valida el nombre **tal y como llega** y se persiste el que devuelve `zod` —ya recortado—, no el
 * original: el `trim()` del esquema va antes del `min(1)` justamente para que un nombre de solo
 * espacios se rechace en vez de guardarse vacio (R14).
 */
export function createCreateWorkGroup(
  deps: CreateWorkGroupDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<{ id: string }> {
  return async function createWorkGroup(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = createWorkGroupSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { name } = parsed.data;

    const result = await deps.workGroups.createInCompany(
      actor.companyId,
      name,
      normalizeWorkGroupName(name),
    );

    if (result === 'duplicate_name') throw new WorkGroupDuplicateNameError();

    return result;
  };
}
