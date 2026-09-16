// lib/modules/identity/ports/user-admin-repository.ts
/**
 * QC-66 T9 — Puerto de acceso a datos de la administracion de usuarios (`design.md > 7`).
 *
 * Tres propiedades de este puerto son el requisito, no un estilo:
 *
 *   1. **`…AliveInCompany` en el nombre NO es adorno.** Los filtros `deleted_at IS NULL` (R34) y
 *      `company_id = ?` (R33) son responsabilidad de ESTE puerto y de su adaptador, **no del
 *      dominio**, asi que ningun caso de uso -ni uno escrito manana- puede olvidarlos. Por el mismo
 *      motivo `excludeUserId` es OBLIGATORIO y no opcional (R35): como parametro opcional, un
 *      llamante nuevo se olvidaria y el actor reapareceria en su propio listado.
 *   2. **NO hay ninguna busqueda por correo, por nombre de usuario ni por documento, y es
 *      deliberado** (R17, `design.md > 7`): la unicidad la garantizan SOLO los tres indices unicos
 *      por empresa que ya existen (QC-47), que es lo que hace que dos altas simultaneas acaben con
 *      una sola fila. Un `SELECT` previo al `INSERT` es una carrera y no aporta ningun mensaje que
 *      el resultado `'email' | 'username' | 'document'` no de ya; **sin metodo de busqueda, esa
 *      comprobacion previa ni siquiera es expresable.**
 *   3. **Resultados discriminados, nunca excepciones de Prisma.** El adaptador traduce el `P2002`
 *      (23505) a la clave duplicada -**por COLUMNA**, `error.meta.target`, nunca por el nombre del
 *      indice: fue el defecto real que QC-38 solo vio con integracion- y el `P2003` (23503) a
 *      `'role_not_found'`. El dominio no ve jamas un SQLSTATE ni una transaccion.
 *
 * **El borrado es LOGICO** (R37): un `UPDATE` de `deleted_at`, jamas un `DELETE`. No existe ninguna
 * operacion de recuperacion ni ningun listado de borrados (R39, decision cerrada 3): lo que no se
 * puede expresar no se puede hacer por descuido. Ademas el borrado fisico de `users` esta prohibido
 * por el `RESTRICT` de `users_account_status_changed_by_fkey` (QC-65 R12).
 *
 * Puerto puro (R42): solo importa tipos del propio `domain/` por ruta RELATIVA -nunca el barrel
 * `@/lib/modules/identity`, que crearia un ciclo del modulo consigo mismo-.
 */

import type { AccountLockState } from '../domain/account-lock';
import type { UserAccountStatus } from '../domain/account-status';
import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { UserDetail, UserRow } from '../domain/user-view';

/**
 * `design.md > 7` los nombra `UserAdminRow` y `UserAdminDetail` y los describe como
 * «estructural»: son EXACTAMENTE los tipos de salida de `domain/user-view.ts`, asi que se
 * **reutilizan** en vez de escribir una segunda copia que pudiera divergir del contrato publico.
 * Los alias existen para que el nombre del diseno siga siendo buscable en el codigo.
 */
export type UserAdminRow = UserRow;
export type UserAdminDetail = UserDetail;

/**
 * Los NUEVE campos de negocio que se escriben al crear y al editar (R13, R19). `birthDate` es un
 * `Date` porque la columna es `@db.Date`; el esquema del borde valida `YYYY-MM-DD` y la conversion
 * la hace el caso de uso (ver `create-user.ts`).
 *
 * **Lo que NO esta aqui es el requisito**: ni `companyId` (R14: viaja como argumento propio de
 * `create`, tomado del actor), ni el hash de la credencial (R15: argumento propio y obligatorio),
 * ni `accountStatus` / `accountStatusChangedAt` / `accountStatusChangedBy` (R20: la edicion no los
 * toca; moverlos es otra operacion), ni `mustChangeCredential`, ni los tres contadores de QC-19.
 * La EDICION no los lleva: limpiarlos al salir de `blocked` lo hace `applyGuardedChange`
 * (variante `account_status`) — QC-95, que enmienda R45 de QC-66.
 */
export type NewUser = {
  readonly firstNames: string;
  readonly lastNames: string;
  readonly birthDate: Date;
  readonly email: string;
  readonly phone: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  readonly username: string;
  readonly roleId: string;
};

/** Cual de los tres indices unicos de QC-47 rechazo la escritura (R17). */
export type DuplicateKey = 'email' | 'username' | 'document';

/**
 * QC-79 (`design.md > 6.1`) — Con que credencial nace la fila.
 *
 * **Una union discriminada y no `string | null`**, porque `null` es lo que alguien olvida y un tipo
 * con nombre no: la ausencia de credencial es una DECISION EXPLICITA del llamante -el administrador
 * no escribio ninguna (R1, R4)-, no un descuido.
 *
 * `'none'` NO significa «pon una cualquiera»: significa que la fila queda **sin ninguna credencial
 * con la que se pueda entrar** (R4). Como escribirlo sin tocar `users` -que R37 prohibe- es del
 * adaptador: el centinela `NO_CREDENTIAL_SENTINEL` de `domain/credential-setup-link.ts`.
 */
export type NewUserCredential =
  | { readonly kind: 'hash'; readonly value: string }
  | { readonly kind: 'none' };

/** Lo que toda operacion guardada necesita para localizar su objetivo y aplicar la invariante. */
type GuardedTarget = {
  /** Ambito: la empresa del actor (R33). Un objetivo de otra empresa es `'not_found'`. */
  readonly companyId: string;
  /** El usuario objetivo. Borrado logicamente tambien es `'not_found'` (R34). */
  readonly id: string;
  /**
   * Nombre del rol administrador, que el caso de uso toma de `ROLE_ADMINISTRADOR` (R24) y pasa como
   * ARGUMENTO: asi el puerto no necesita conocerlo y no nace ninguna constante nueva ni ningun
   * literal mas.
   */
  readonly adminRoleName: string;
  readonly now: Date;
};

/**
 * El cambio que se pide, con la invariante del «ultimo administrador en `active`» aplicada en la
 * MISMA transaccion (R22, R23, `design.md > 9`).
 *
 * **Dos variantes y no tres**, y esto hay que leerlo entero: `design.md > 9.1` nombra TRES
 * operaciones guardadas -mover el estado, **cambiar el rol** y borrar-. La tercera, el cambio de
 * rol, **no se puede separar** de los otros ocho campos editables: R19 es REEMPLAZO COMPLETO, asi
 * que pedirla aparte serian dos escrituras y dos transacciones sobre la misma fila. Por eso el
 * cambio de rol viaja dentro de `updateAliveInCompany`, cuyo adaptador (T13) **tiene que reutilizar
 * la MISMA transaccion con bloqueo** -el bloqueo sigue escrito en UN solo sitio del adaptador, que
 * es lo que `design.md > 9.3` protege al pedir «un metodo y no tres»- y por eso su resultado incluye
 * `'last_administrator'`.
 */
export type GuardedChange =
  | (GuardedTarget & {
      readonly kind: 'account_status';
      /**
       * Cualquiera de los CUATRO valores de QC-65, `blocked` incluido: no hay transiciones
       * prohibidas en esta feature (R26).
       */
      readonly accountStatus: UserAccountStatus;
      /**
       * El actor, como autor del cambio (R25). Aqui NUNCA es nulo: el cambio siempre lo hace una
       * persona. El `NULL` -«lo cambio el sistema», QC-65 R10- es solo el del nacimiento de la
       * cuenta (R49), y por eso `create` no tiene este campo.
       */
      readonly changedBy: string;
      /**
       * QC-95 R1, R3 (enmienda R45 de QC-66): los tres contadores de bloqueo de QC-19, ya limpios,
       * que se escriben AQUI, en la MISMA escritura que mueve el estado. `null` = el destino
       * es `blocked` y no se toca ningun contador (R2). `clearedLockState()` es la
       * UNICA fuente de «cero, cero, null» y la decide el caso de uso por el destino (R4, R6).
       */
      readonly lockState: AccountLockState | null;
    })
  | (GuardedTarget & { readonly kind: 'delete' });

/**
 * `'last_administrator'` significa «no se escribio nada»: el adaptador aborta DENTRO de la
 * transaccion, antes del `UPDATE` (`design.md > 9.2`).
 */
export type GuardedOutcome = 'ok' | 'not_found' | 'last_administrator';

export interface UserAdminRepository {
  /**
   * Alta (R13, R14, R15, R17). La **EMPRESA** y la **CREDENCIAL** son argumentos PROPIOS y
   * OBLIGATORIOS: una llamada que los olvide **no compila**, en vez de crear un usuario sin empresa
   * o con una credencial elegida por descuido. `accountStatus` esta tipado como el literal
   * `'pending'` y no como la union: crear una cuenta que ya pueda entrar no es expresable (R13).
   *
   * **QC-79 parte QC-66 R15 en dos, y hay que leerlo con esas palabras:**
   *
   *   - **La mitad que SOBREVIVE**: la credencial, cuando la hay, se persiste **solo** como HASH de
   *     QC-5, y **no sale por ninguna via** -ni en el resultado, ni en un mensaje de error, ni en
   *     ninguna traza- (QC-66 R16, extendido por QC-79 R5). Por eso el argumento es la union de
   *     abajo y nunca la contrasena en claro.
   *   - **La mitad que R4 de QC-79 ENMIENDA**: cuando el administrador **no escribe** contrasena,
   *     el sistema **NO genera ninguna al azar**. Ya no es cierto que «crear un usuario le fija una
   *     contrasena generada por el propio sistema»: llega `{ kind: 'none' }`, la fila nace sin
   *     ninguna credencial utilizable, y el acceso lo da el enlace de R7.
   *
   * **Este metodo NO lleva parametro de autor del cambio de estado, y es DELIBERADO (R49, decision
   * cerrada 18).** La fila nace con `account_status` en `pending`, `account_status_changed_at` en
   * `now` y `account_status_changed_by` **sin escribir** -el `NULL` de QC-65 R10, «lo cambio el
   * sistema, no una persona»-, igual que el administrador del seed. Que el parametro **no exista**
   * es justamente lo que impide que alguien lo rellene con el actor por reflejo; el unico sitio que
   * escribe autor es el cambio de estado de `applyGuardedChange` (R25).
   *
   * Tambien escribe `must_change_credential` en VERDADERO (R13): es invariante del alta, no una
   * eleccion del llamante, asi que tampoco es un parametro.
   */
  create(
    companyId: string,
    data: NewUser,
    credential: NewUserCredential,
    accountStatus: 'pending',
    now: Date,
  ): Promise<{ id: string } | DuplicateKey | 'role_not_found'>;

  /**
   * Ficha por identificador (R32, R33, R34). `null` = no existe, esta borrado logicamente o es de
   * otra empresa: para el dominio son el MISMO caso y los tres responden `not_found`, porque
   * distinguirlos convertiria la ficha en un **oraculo de existencia** sobre datos ajenos.
   *
   * La exclusion del PROPIO ACTOR (R35) **no** esta aqui: es del caso de uso, que es quien conoce al
   * actor, y se comprueba ANTES de llamar a este metodo.
   */
  findAliveInCompany(companyId: string, id: string): Promise<UserAdminDetail | null>;

  /**
   * Listado paginado de los usuarios VIVOS de la empresa con el CONTRATO GENERICO de consulta
   * (QC-57 R13, `design.md > 8`). Recibe la consulta **YA SANEADA** por el caso de uso -lo que no
   * esta en `USER_QUERYABLE` no llega aqui- y devuelve una `Page` ya armada: `toOffsetLimit` y
   * `buildPage` viven en `lib/shared/pagination`, que `domain/` NO puede importar, asi que quien
   * pagina es el adaptador driven.
   *
   * `excludeUserId` es el actor y es OBLIGATORIO (R35). El defecto de 10 y el tope de 25 (R27), el
   * orden `last_names, first_names, id` con desempate estable (R30) y las columnas que toca la
   * busqueda -nombres, apellidos, correo y nombre de usuario (R28)- son del adaptador, el unico que
   * conoce la base. El orden, el filtro y la busqueda se aplican sobre el conjunto completo y ANTES
   * de paginar; el `total` describe el conjunto ya filtrado.
   */
  listAliveInCompany(
    companyId: string,
    excludeUserId: string,
    query: ListQuery,
  ): Promise<Page<UserAdminRow>>;

  /**
   * Edicion: REEMPLAZO COMPLETO de los nueve campos (R19), nunca un PATCH campo a campo. No toca la
   * empresa, el estado de cuenta, el hash, la marca de cambio de credencial ni ningun contador
   * (R20): `NewUser` no los lleva.
   *
   * `'not_found'` = no existe, esta borrado o es de otra empresa (R33, R34).
   * `'last_administrator'` = el `roleId` pedido dejaria a la empresa sin ningun administrador vivo
   * en `active` (R22), comprobado con el mismo bloqueo de `applyGuardedChange` y dentro de la misma
   * transaccion que la escritura (ver la nota de `GuardedChange`): cuando llega, **no se escribio
   * nada**.
   *
   * **Por que aqui el nombre del rol administrador NO es un parametro, a diferencia de
   * `applyGuardedChange`:** la firma de este metodo esta fijada en `design.md > 7` con cuatro
   * argumentos y no se le anade un quinto por gusto. Su adaptador toma el nombre de
   * `ROLE_ADMINISTRADOR` importado del propio dominio -un driven puede importar `../../domain`,
   * `docs/architecture.md > La regla de dependencias`-, asi que R24 se sigue cumpliendo: ninguna
   * constante nueva y ningun literal escrito a mano.
   */
  updateAliveInCompany(
    companyId: string,
    id: string,
    data: NewUser,
    now: Date,
  ): Promise<'ok' | 'not_found' | DuplicateKey | 'role_not_found' | 'last_administrator'>;

  /**
   * Las operaciones guardadas -mover el estado y borrar- detras de UN metodo unico y transaccional
   * (`design.md > 9.3`): comparten la invariante, y dos copias del bloqueo serian dos sitios donde
   * olvidarlo. **El dominio nunca ve una transaccion**: pide el cambio y traduce el resultado.
   */
  applyGuardedChange(input: GuardedChange): Promise<GuardedOutcome>;
}
