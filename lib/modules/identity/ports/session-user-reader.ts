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
   * La empresa de la ficha, tal y como esta hoy en la base. Es una columna de `users`, asi que
   * sale en la misma fila que ya se leia y no cuesta nada traerla. `null` solo para el Maestro.
   */
  readonly companyId: string | null;
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
  /**
   * QC-23 (T9, R7, R8, R14): el sello «sesiones validas desde» de esa persona, tal y como esta
   * HOY en `users.sessions_valid_from`. Es una columna de `users`, o sea la MISMA fila que ya se
   * leia: **coste cero**, ni un `JOIN` mas ni una consulta mas por peticion.
   *
   * Obligatorio y nunca nulo: toda fila de usuario tiene sello, incluidas las que ya existian
   * (R7). Viaja CRUDO —la marca de tiempo, no un «esta sesion vale»—: la comparacion `<=` contra
   * el `iat` es regla de dominio y vive en `domain/session-revocation.ts > isStampedOut`, que es
   * el UNICO cuerpo de esa desigualdad en el repositorio. Mismo argumento que ya esta escrito
   * arriba para `companyDeletedAt` y `lockedUntil`.
   */
  readonly sessionsValidFrom: Date;
  /**
   * QC-23 (T9, R11, R14): el `revoked_at` de la fila del registro de sesiones cerradas para EL
   * `sid` de la sesion en curso, o `null` si esa sesion no fue cerrada una a una.
   *
   * De ahi viene el segundo parametro de `findActiveById`: sin el `sid` no hay nada que buscar.
   * Sale del MISMO `findFirst`, por la relacion `User.revokedSessions`, o sea por
   * `revoked_sessions_session_id_key`: **ni una invocacion nueva del puerto por peticion** (R14),
   * que era la condicion. El coste declarado —una busqueda por indice unico mas, de 0 o 1 filas—
   * esta escrito en `design.md > 4` y es justo lo que QC-28 viene a quitar.
   *
   * Otra vez CRUDO, y con el instante y no con un `estaRevocada` ya cocinado, por el mismo
   * motivo de siempre: quien decide es el corte 8 de `resolve-session.ts`. Y porque el par
   * `(sessionsValidFrom, sessionRevokedAt)` es exactamente lo que QC-28 podra cachear detras de
   * este puerto sin tocar el dominio (`design.md > 4`).
   */
  readonly sessionRevokedAt: Date | null;
};

/**
 * Lo que el dominio necesita del mundo para resolver quien es el usuario de la sesion
 * (`design.md > 2`). Consulta por `id` **en cada peticion**: el rol y el estado activo son
 * siempre los actuales, nunca los de cuando se emitio la cookie (R10, R12).
 */
export interface SessionUserReader {
  /**
   * QC-23 (T9, R14): el `sessionId` entra como SEGUNDO parametro y es obligatorio. No es un dato
   * de busqueda de la persona —la fila se sigue buscando por su clave primaria— sino el `sid`
   * contra el que se resuelve `sessionRevokedAt` en la MISMA lectura. Las dos comprobaciones de
   * QC-23 —sello y registro— se resuelven asi con **una sola invocacion** de este puerto, que es
   * la que ya se hacia.
   */
  findActiveById(id: string, sessionId: string): Promise<SessionUserRecord | null>;
}
