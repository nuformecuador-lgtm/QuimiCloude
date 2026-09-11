// lib/modules/identity/domain/role-view.ts
/**
 * QC-94 T3 — Tipo de SALIDA de la consulta del catalogo de roles (`design.md > 4.1`). Vive en
 * `domain/` —no en `ports/`— porque describe el QUE se dice, no el COMO se habla con el mundo, y es
 * lo unico que el contrato publico (`index.ts`) puede reexportar; mismo criterio que
 * `domain/user-view.ts`.
 *
 * **DOS datos y ningun otro (R9).** Lo que NO sale, y es el requisito, no un olvido:
 *
 *   - `description` — existe en la tabla y hoy no la pinta nadie (decision cerrada 4). Devolver un
 *     campo que nadie usa invita a que aparezca en una pantalla sin que nadie lo decida.
 *   - los permisos del rol — los declara QC-74 y no se exponen aqui.
 *   - `createdAt` / `updatedAt` — un selector no las muestra.
 *
 * El nombre es `RoleOption` y no `RoleRow` ni `RoleListItem`, a proposito: dice para que existe
 * —una opcion de un selector— y no sugiere que sea la fila de un listado con paginacion (R12).
 *
 * Dominio puro (R16): este archivo no importa framework, Prisma, `lib/shared/**`, `lib/composition`
 * ni las tripas de otro modulo.
 */
export type RoleOption = { readonly id: string; readonly name: string };
