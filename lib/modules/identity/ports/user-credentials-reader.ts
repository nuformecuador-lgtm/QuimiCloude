import type { AccountLockState } from '../domain/account-lock';

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
 */
export type AuthenticatableUser = {
  readonly id: string;
  readonly passwordHash: string;
  readonly roleName: string;
  readonly companyId: string;
  /** `null` = la empresa sigue viva (QC-47 R6: `companies.deleted_at IS NULL`). */
  readonly companyDeletedAt: Date | null;
} & AccountLockState;

export interface UserCredentialsReader {
  /** Solo devuelve usuarios NO borrados (`deleted_at IS NULL`): el filtro es del puerto, no del dominio (R1, R5). */
  findActiveByUsername(username: string): Promise<AuthenticatableUser | null>;
}
