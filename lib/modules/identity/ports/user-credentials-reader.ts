import type { AccountLockState } from '../domain/account-lock';
import type { UserAccountStatus } from '../domain/account-status';

/**
 * Lo minimo que el dominio necesita para decidir si unas credenciales entran: el id, el hash
 * guardado y el estado de bloqueo. Nada de correo, documento, nombre ni telefono: lo que no
 * sale de la base no se puede filtrar por error en un log (R15). El `SessionUser` completo lo
 * resuelve QC-8, que es quien lo necesita.
 *
 * QC-9 (R26): tambien el **nombre del rol**, porque desde `v2` viaja firmado dentro de la cookie
 * y el middleware decide con el sin consultar la base. Sale de la MISMA consulta que ya se hacia
 * para autenticar —cero consultas nuevas— y nunca de un dato recibido del cliente.
 *
 * QC-48 (R1, R2, R5): y la **empresa**, por lo mismo. Desde `v3` viaja firmada dentro de la
 * cookie, se resuelve leyendo la ficha de la propia persona (`users.company_id`) y no se pregunta
 * en el formulario de login ni se acepta desde la entrada de la peticion. Sale tambien de esa
 * unica consulta, y es solo el IDENTIFICADOR: de la empresa no sale de la base nada mas.
 *
 * QC-48 (R3) — y su marca de baja, `companyDeletedAt`, donde `null` significa «empresa viva»
 * (QC-47 R6). Se traen los DOS campos y no un booleano ya cocinado en el adaptador: «viva» es
 * una regla de dominio, y cocinarla al otro lado del puerto la mudaria fuera del unico sitio
 * donde se puede probar con objetos planos. La marca no es un dato de la empresa que se exponga
 * a nadie: no viaja firmada (R6) y no sale de aqui.
 *
 * QC-78 (R1) — y el **estado de cuenta**, el valor que persiste QC-65 en `users.account_status`.
 * Desde esta ficha el estado manda en el login: solo una cuenta cuyo estado EFECTIVO sea `active`
 * entra. Sale de la MISMA consulta que ya autentica —es una columna de `users`, la misma fila—,
 * asi que no cuesta ni una lectura mas (R21).
 *
 * Se trae el valor CRUDO y no un booleano ya cocinado del tipo `estaActiva`, por el mismo motivo
 * que ya esta escrito arriba para `companyDeletedAt`: «activa» no es lo que dice la columna, es
 * una regla de dominio que combina el estado almacenado con el plazo `lockedUntil`
 * (`effectiveAccountStatus`, R7). Cocinarla al otro lado del puerto la mudaria fuera del unico
 * sitio donde se prueba con objetos planos, y la dejaria escrita dos veces —una por cada
 * adaptador que lee una fila de usuario—, que es justo lo que R7 prohibe.
 */
export type AuthenticatableUser = {
  readonly id: string;
  readonly passwordHash: string;
  readonly roleName: string;
  readonly companyId: string;
  /** `null` = la empresa sigue viva (QC-47 R6: `companies.deleted_at IS NULL`). */
  readonly companyDeletedAt: Date | null;
  /**
   * QC-78 R1 — el estado ALMACENADO, tal cual esta en la columna. Lo que significa en el instante
   * del intento lo traduce `effectiveAccountStatus` junto con `lockedUntil` (que llega por
   * `AccountLockState`), y esa traduccion es del dominio, no del puerto.
   */
  readonly accountStatus: UserAccountStatus;
} & AccountLockState;

export interface UserCredentialsReader {
  /** Solo devuelve usuarios NO borrados (`deleted_at IS NULL`): el filtro es del puerto, no del dominio (R1, R5). */
  findActiveByUsername(username: string): Promise<AuthenticatableUser | null>;
}
