// lib/modules/identity/domain/work-group-view.ts
/**
 * QC-84 T3 — Tipos de SALIDA de las dos consultas de grupos de trabajo (`design.md > 4.3`).
 *
 * Viven en `domain/` —no en `ports/`— porque describen el QUE se dice, no el COMO se habla con el
 * mundo, y es lo unico que el contrato publico (`index.ts`) puede reexportar. Mismo criterio que
 * `user-view.ts` y `proveedores/domain/supplier-view.ts`.
 *
 * **LO QUE NO SALE POR NINGUNA DE LAS DOS ES EL REQUISITO**, no un olvido:
 *
 *   - `nameNormalized` — **R26**: es la forma canonica con la que la base compara, no un dato que
 *     nadie muestre. Sacarla invitaria a comparar nombres en la pantalla, que es justo lo que R13
 *     pone en una sola funcion.
 *   - `companyId` — **R26**: toda consulta esta ya acotada a la empresa del actor por el puerto,
 *     asi que seria siempre la misma y solo invitaria a filtrar en memoria lo que ya filtro la
 *     consulta.
 *   - `deletedAt` — **R9**, **R26**, **R40**: las dos consultas excluyen los dados de baja, asi que
 *     seria siempre `null`; no hay listado de bajas ni restauracion.
 *   - `createdAt` / `updatedAt` — **R26**: el listado no las muestra. Que `createdAt` SI sea
 *     ordenable (`work-group-queryable.ts`) no obliga a devolverla: ordenar es de la consulta,
 *     mostrar es de la fila.
 *   - Del miembro, **cualquier dato de credencial** —`passwordHash`, los contadores de QC-19— y su
 *     correo o su documento: **R19**. El adaptador **enumera** las columnas en el `select` de
 *     Prisma: nunca un `findMany` sin `select`, que es exactamente como un hash acaba en un payload
 *     del navegador.
 *   - Del miembro, **su estado de cuenta**, y es deliberado (`design.md > 4.3`): R19 ya garantiza
 *     que todas las personas que salen estan efectivamente `active`, asi que un campo de estado
 *     seria una columna constante que invita a que alguien la pinte y a que alguien la vuelva a
 *     filtrar —una segunda copia de la regla que QC-78 R7 puso en una sola funcion—.
 *
 * Dominio puro: este archivo no importa framework, Prisma, `lib/shared/**`, `lib/composition` ni
 * las tripas de otro modulo.
 */

/**
 * Una FILA del listado de grupos (R26): identificador, nombre y sus MIEMBROS —`WorkGroupMemberRow`
 * reutilizado tal cual, sin una tercera forma de nombrar a una persona—. **Estas tres claves y
 * ninguna mas** —un test afirma las claves EXACTAS, no solo que falten algunas—.
 *
 * `members` existe para pintar los nombres en la columna del listado; no trae ningun conteo
 * aparte porque `members.length` ya lo es. No esta paginado ni filtrado por estado efectivo de
 * cuenta: es la misma pertenencia cruda que ve `listMembersAliveInCompany`, solo que aqui entra
 * SIN pasar por el caso de uso de miembros —es detalle del adaptador, no un segundo camino de
 * autorizacion—.
 */
export type WorkGroupRow = {
  readonly id: string;
  readonly name: string;
  readonly members: readonly WorkGroupMemberRow[];
};

/**
 * Una FILA de la lista de miembros de un grupo (R19): identificador de la persona y su nombre
 * mostrable. **Dos claves, estas y ninguna mas.**
 *
 * `displayName` lo compone **`buildDisplayName`** (`domain/display-name.ts`, que ya existe y ya
 * tiene tests): no se concatena a mano en el adaptador ni en el caso de uso.
 */
export type WorkGroupMemberRow = {
  readonly id: string;
  readonly displayName: string;
};
