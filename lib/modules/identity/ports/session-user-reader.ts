import type { UserAccountStatus } from '../domain/account-status';

/**
 * Datos minimos del usuario activo que hacen falta para resolver el `SessionUser`
 * (`design.md > 4.5`). Nada de credenciales ni de PII fuera de lo que la sesion muestra:
 * el `select` del adaptador Prisma es igual de estrecho que este tipo.
 */
export type SessionUserRecord = {
  readonly id: string;
  readonly username: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly roleName: string;
  /**
   * QC-48 (T6, R13): la empresa de la ficha, tal y como esta HOY en la base. Es una columna de
   * `users`, asi que sale en la misma fila que ya se leia y no cuesta nada traerla.
   */
  readonly companyId: string;
  /**
   * QC-48 (T6, R15): `null` = empresa viva (QC-47 R6). Se trae la marca cruda y no un
   * `companyIsAlive` ya cocinado: «viva» es una regla de dominio y cocinarla aqui la mudaria
   * fuera del sitio donde se puede testear con objetos planos (`design.md > 3.1`).
   */
  readonly companyDeletedAt: Date | null;
  /**
   * QC-74 (T8, R7, R11): los codigos de permiso del rol del usuario, tal y como estan HOY en
   * `role_permissions`. Salen del MISMO `findFirst` que ya se hacia, por la relacion
   * `Role.permissions`: ni una consulta adicional por peticion, que era la condicion de R11.
   *
   * `readonly string[]` y no `PermissionCode[]`: lo que hay en la base es texto y este puerto
   * describe la base. Estrechar aqui a la union de literales seria mentir sobre una fila que
   * pudo escribirse a mano. Quien compara —`assertPermission`— exige el codigo por pertenencia
   * exacta, asi que un codigo desconocido simplemente no concede nada (R13).
   *
   * El adaptador NO normaliza, NO ordena y NO deduplica: la clave primaria compuesta de
   * `role_permissions` ya garantiza que no hay repetidos, y reordenar aqui seria trabajo
   * invisible en la ruta mas caliente de la aplicacion.
   */
  readonly permissions: readonly string[];
  /**
   * QC-78 (T10, R20, R21): el estado ALMACENADO de la cuenta, tal y como esta HOY en
   * `users.account_status`. Es una columna de `users`, o sea la MISMA fila que ya se leia.
   */
  readonly accountStatus: UserAccountStatus;
  /**
   * QC-78 (T10, R7, R8, R11): el plazo de bloqueo crudo, tambien columna de `users`.
   *
   * Los dos campos viajan CRUDOS y no como un `estaActiva` ya cocinado, por el mismo argumento
   * que ya esta escrito arriba para `companyDeletedAt`: «activa» es una regla de dominio
   * —`effectiveAccountStatus`— y cocinarla al otro lado del puerto la mudaria fuera del unico
   * sitio donde se prueba con objetos planos. Sin `lockedUntil` no se podria aplicar esa regla
   * en la sesion y habria que duplicar aqui la traduccion del plazo, que es justo lo que R7
   * prohibe.
   *
   * COSTE DECLARADO (`design.md > 3`): el `select` de la sesion deja de ser tan estrecho como lo
   * dejo QC-8 R14 —salen de la base un enum mas y una marca de tiempo mas—. **Ninguno de los dos
   * es PII** y ninguno se registra en ningun log; mismo coste que QC-48 acepto por escrito para
   * `companyDeletedAt`. Y no cuesta ninguna consulta: los dos salen del mismo `findFirst`.
   */
  readonly lockedUntil: Date | null;
};

/**
 * Lo que el dominio necesita del mundo para resolver quien es el usuario de la sesion
 * (`design.md > 2`). Consulta por `id` **en cada peticion**: el rol y el estado activo son
 * siempre los actuales, nunca los de cuando se emitio la cookie (R10, R12).
 */
export interface SessionUserReader {
  findActiveById(id: string): Promise<SessionUserRecord | null>;
}
