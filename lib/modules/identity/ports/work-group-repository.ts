// lib/modules/identity/ports/work-group-repository.ts
/**
 * QC-84 T5 — Puerto UNICO de lectura y escritura de grupos de trabajo y de pertenencias
 * (`design.md > 5`, R44).
 *
 * Cuatro propiedades de este puerto son el requisito, no un estilo:
 *
 *   1. **`…AliveInCompany` en el nombre NO es adorno.** Los filtros `deleted_at IS NULL` (R9) y
 *      `company_id = ?` (R8) son responsabilidad de ESTE puerto y de su adaptador, **no del
 *      dominio**, asi que ningun caso de uso —ni uno escrito manana— puede olvidarlos. `companyId`
 *      es el **PRIMER parametro obligatorio de los siete metodos**: una llamada que lo olvide **no
 *      compila**, en vez de leer o escribir sobre la empresa equivocada.
 *   2. **NO hay ningun metodo de busqueda por nombre, y es deliberado** (R12): la unicidad la
 *      garantiza SOLO el indice `work_groups_name_unique` —funcional, compuesto con `company_id` y
 *      **parcial** (`WHERE deleted_at IS NULL`)— que QC-83 ya creo. Un `SELECT` previo al `INSERT`
 *      es una carrera y no aporta ningun mensaje que el resultado `'duplicate_name'` no de ya; **sin
 *      metodo de busqueda, esa comprobacion previa ni siquiera es expresable**.
 *   3. **Resultados discriminados, nunca excepciones de Prisma.** El adaptador traduce el `P2002`
 *      (`SQLSTATE 23505`) contra `work_groups_name_unique` a `'duplicate_name'` y el que choca
 *      contra `work_group_members_pkey` a `{ kind: 'already_member' }`. El dominio no ve jamas un
 *      codigo de Postgres ni una transaccion.
 *   4. **Sacar es un `DELETE` fisico (R34); dar de baja es un `UPDATE` de `deleted_at` (R37).** Los
 *      dos metodos se llaman distinto A PROPOSITO: es exactamente la confusion que QC-83 dejo
 *      avisada por escrito en su decision 5.
 *
 * Puerto puro: solo importa **tipos** del propio `domain/` por ruta RELATIVA —nunca el barrel
 * `@/lib/modules/identity`, que crearia un ciclo del modulo consigo mismo—, nunca `@prisma/client`,
 * nunca `next/*`, nunca `lib/shared/**`.
 */

import type { UserAccountStatus } from '../domain/account-status';
import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { WorkGroupRow } from '../domain/work-group-view';

/**
 * Por que una persona que YA pertenece al grupo **no se ve** en la lista de miembros de R19. Son
 * los tres —y solo los tres— resultados de `effectiveAccountStatus` distintos de `'active'`.
 *
 * **Este valor lo produce el DOMINIO, no el adaptador** (`design.md > 5.1`): el puerto devuelve el
 * estado CRUDO y el plazo, y quien traduce es `effectiveAccountStatus(view, now)`, la misma funcion
 * que decide quien sale en la lista. Asi el «por que no se ve» y el «quien se ve» **no pueden
 * divergir**. El tipo vive aqui porque es parte de la forma que este puerto publica.
 */
export type MemberBlockReason = 'pending' | 'inactive' | 'blocked';

/**
 * Un miembro vivo del grupo **antes** de que el dominio decida si se ve (R19, `design.md > 5.2`).
 *
 * Trae el estado **CRUDO** y el **plazo de bloqueo** —nunca un booleano ya cocinado del otro lado
 * del puerto—: «esta activa de verdad» es una regla de dominio que depende del RELOJ (QC-78 R10,
 * R11), y resolverla en el adaptador la sacaria del unico sitio donde se prueba con objetos planos.
 *
 * Los tres campos de nombre son los que `buildDisplayName` necesita (R19) y **nada mas**: ni correo,
 * ni documento, ni `passwordHash`, ni ningun contador de QC-19. Lo que no esta en este tipo no puede
 * escaparse por un `select` descuidado.
 */
export type MemberCandidate = {
  readonly id: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly username: string;
  readonly accountStatus: UserAccountStatus;
  readonly lockedUntil: Date | null;
};

/**
 * El resultado de meter a una persona en un grupo (R28–R32), discriminado por `kind`.
 *
 * `already_member` trae el estado con el que el adaptador vio la fila de `users` dentro de la misma
 * transaccion; el caso de uso decide con el si el motivo es el de R30 —la persona se ve— o uno de
 * los tres de R31. **La garantia de no duplicar es la clave primaria `(work_group_id, user_id)`**
 * (R32): esa lectura sirve SOLO para elegir el mensaje.
 */
export type AddMemberOutcome =
  | { readonly kind: 'created' }
  /** El grupo no existe, esta dado de baja o es de otra empresa (R8, R9). */
  | { readonly kind: 'group_not_found' }
  /** La persona no existe, esta dada de baja o es de otra empresa (R29): los tres, el mismo caso. */
  | { readonly kind: 'user_not_found' }
  /** La persona existe y no pertenece, pero `admits` la rechazo: no se escribio ninguna fila. */
  | { readonly kind: 'not_admitted' }
  | {
      readonly kind: 'already_member';
      /**
       * El estado CRUDO y el plazo de la persona que ya pertenece, tal y como estan en su fila. Se
       * entrega crudo —y no cocinado en un `MemberBlockReason`— porque cocinarlo en el adaptador
       * seria la segunda copia de la regla que QC-78 R7 puso en una sola funcion.
       */
      readonly account: MemberCandidate;
    };

export interface WorkGroupRepository {
  /**
   * Alta (R10, R11, R12). La **EMPRESA** es argumento propio y obligatorio, y sale del actor: crear
   * un grupo en otra empresa no es expresable. El `nameNormalized` lo calcula el caso de uso con
   * `normalizeWorkGroupName` (R13) y viaja aparte para que el adaptador no tenga que conocer —ni
   * copiar— la regla de «mismo nombre».
   *
   * `'duplicate_name'` nace del `P2002` del indice unico parcial, nunca de una consulta previa
   * (R12): dos altas simultaneas del mismo nombre acaban con **una sola** fila.
   */
  createInCompany(
    companyId: string,
    name: string,
    nameNormalized: string,
  ): Promise<{ id: string } | 'duplicate_name'>;

  /**
   * Renombrar (R16, R17). Reemplaza el nombre **y** su forma normalizada en la misma escritura —dos
   * escrituras dejarian una ventana con la fila incoherente— y no toca la empresa, la marca de baja,
   * el identificador ni ninguna fila de pertenencia.
   *
   * `'not_found'` = no existe, esta dado de baja o es de otra empresa: para el dominio son el MISMO
   * caso (R8, R9), porque distinguirlos convertiria la operacion en un oraculo de existencia sobre
   * datos ajenos.
   */
  renameAliveInCompany(
    companyId: string,
    id: string,
    name: string,
    nameNormalized: string,
  ): Promise<'ok' | 'not_found' | 'duplicate_name'>;

  /**
   * Baja LOGICA (R37, R38): un `UPDATE` de `deleted_at`, **jamas** un `DELETE`. Conserva la fila
   * entera y **todas** sus pertenencias intactas, y no toca ninguna asignacion de pedido (R39) —no
   * puede: este puerto no sabe que existen—.
   *
   * Dar de baja un grupo ya dado de baja es `'not_found'` (R9). **No existe ningun metodo de
   * restaurar ni ningun listado de bajas** (R40): lo que no se puede expresar no se puede hacer por
   * descuido.
   */
  softDeleteAliveInCompany(companyId: string, id: string, now: Date): Promise<'ok' | 'not_found'>;

  /**
   * Listado paginado de los grupos VIVOS de la empresa con el contrato generico de consulta de
   * QC-57 (R24–R27). Recibe la consulta **YA SANEADA** por el caso de uso —lo que no esta declarado
   * en `WORK_GROUP_QUERYABLE` no llega aqui— y devuelve una `Page` ya armada: `toOffsetLimit` y
   * `buildPage` viven en `lib/shared/pagination`, que `domain/` no puede importar, asi que **quien
   * pagina este listado es el adaptador driven**.
   *
   * El defecto de 10 y el tope de 25 (R24), el orden `name ASC, id ASC` con desempate estable (R25)
   * y la columna que toca la busqueda —el nombre— son del adaptador, el unico que conoce la base.
   *
   * El tipo del parametro es `ListQuery` —la consulta viva— y no `SanitizedListQuery`, que en
   * `domain/list-query.ts` es el par `{ query, ignored }` que DEVUELVE `sanitizeListQuery`. Lo que
   * `design.md > 5` llama «la consulta ya saneada» es su `.query`; mismo reparto que
   * `UserAdminRepository.listAliveInCompany`.
   */
  listAliveInCompany(companyId: string, query: ListQuery): Promise<Page<WorkGroupRow>>;

  /**
   * Devuelve **TODOS** los miembros vivos del grupo con su estado **CRUDO** y su plazo de bloqueo,
   * **YA ORDENADOS** por apellidos, nombres e identificador (R22): quien decide quien esta «active
   * de verdad» es el DOMINIO con `effectiveAccountStatus`, y quien PAGINA es el caso de uso,
   * **despues** de filtrar (`design.md > 5.3`).
   *
   * **NO recibe pagina ni tamano de pagina a proposito**: cortar antes de filtrar daria paginas de
   * tamano irregular y un total mentiroso (R51, R52). Que el parametro no exista es lo que impide
   * que alguien «optimice» metiendo aqui un `LIMIT`.
   *
   * El orden lo pone el SQL y no el corte: filtrar conserva el orden, asi que el desempate por
   * identificador que impide que dos homonimas se intercambien entre paginas (R53) viene ya dado.
   *
   * `'not_found'` = el grupo no existe, esta dado de baja o es de otra empresa (R8, R9). Un grupo
   * vivo **sin** miembros devuelve un array vacio, que es un caso distinto.
   */
  listMembersAliveInCompany(companyId: string, id: string): Promise<MemberCandidate[] | 'not_found'>;

  /**
   * Meter a **una** persona, en UNA transaccion: grupo vivo de la empresa, persona viva
   * de la empresa, `admits` sobre su estado crudo y, solo si la admite, `INSERT` de la pertenencia.
   *
   * `admits` es la regla del dominio y el adaptador solo la invoca: asi decide antes de escribir sin
   * tener una segunda copia de «cuenta activa». Si la rechaza y la persona ya pertenecia, el
   * resultado sigue siendo `already_member`, para explicar por que no se ve; si no pertenecia, `not_admitted`.
   *
   * `now` entra por parametro —el dominio no tiene reloj propio— y lo usa el adaptador para la marca
   * de la fila nueva.
   */
  addMemberAliveInCompany(
    companyId: string,
    id: string,
    userId: string,
    now: Date,
    admits: (account: MemberCandidate) => boolean,
  ): Promise<AddMemberOutcome>;

  /**
   * Sacar a **una** persona (R34, R35, R36): `DELETE` **fisico** de la fila de pertenencia. No toca
   * a la persona, no toca sus pertenencias a OTROS grupos y no da de baja el grupo aunque fuera su
   * ultimo miembro.
   *
   * Los dos «no encontrado» se distinguen porque son dos mensajes distintos: `'group_not_found'` es
   * R8/R9 y `'member_not_found'` es R36 —la persona puede existir perfectamente; lo que falta es la
   * fila de PERTENENCIA—.
   */
  removeMemberAliveInCompany(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<'ok' | 'group_not_found' | 'member_not_found'>;
}
