// lib/modules/identity/domain/work-group-directory.ts
/**
 * QC-87 T3 — El contrato por el que OTRO modulo pregunta por un grupo de trabajo de `identity`
 * (`design.md > 2.2`, R19, R20, R21, R25).
 *
 * Igual que `PeopleDirectory`, existe para que `asignaciones` no lea `work_groups` ni
 * `work_group_members`, que son tablas de `identity` (R16, `design.md > 11.4`).
 *
 * Dominio puro: ni Prisma, ni `next/*`, ni `lib/shared/**`.
 */

/**
 * La foto de un grupo **en el instante `now`**: lo que hace falta para aplicarlo a un pedido y
 * nada mas.
 *
 * `name` es el nombre de AHORA porque es el que se **congela** en cada fila de asignacion (R19,
 * R28): la fila guarda el nombre que el grupo tenia cuando se aplico, y renombrar el grupo
 * despues no reescribe ninguna fila (R36).
 *
 * `activeMemberIds` trae **solo** los miembros cuyo estado EFECTIVO es `active` (R19, R20, R21).
 * No es «los miembros» ni «los miembros no borrados»: es exactamente la misma lista que la
 * pantalla de miembros del grupo muestra, y lo es **por construccion** —las dos pasan por
 * `effectiveAccountStatus`—, no por dos filtros parecidos que un dia divergen.
 *
 * Un grupo vivo **sin ningun miembro activo** devuelve la lista VACIA, que es un caso distinto de
 * `null` y termina la operacion con exito y cero personas anadidas (R26).
 */
export type WorkGroupSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly activeMemberIds: readonly string[];
};

export interface WorkGroupDirectory {
  /**
   * La foto del grupo, o `null`.
   *
   * `null` = el grupo **no existe**, esta **dado de baja** o es de **otra empresa** (R25): los
   * tres, el mismo caso, por el mismo motivo que en `PeopleDirectory` —distinguirlos revelaria
   * la existencia de datos ajenos—.
   *
   * `now` entra **por parametro** (R21). Es lo que hace comprobable que una cuenta bloqueada
   * vuelve a contar como miembro activo **solo moviendo el reloj y sin escribir nada**.
   */
  findSnapshotAliveInCompany(
    companyId: string,
    workGroupId: string,
    now: Date,
  ): Promise<WorkGroupSnapshot | null>;
}
