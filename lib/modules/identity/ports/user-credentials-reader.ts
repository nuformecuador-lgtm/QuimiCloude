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
 */
export type AuthenticatableUser = {
  readonly id: string;
  readonly passwordHash: string;
  readonly roleName: string;
} & AccountLockState;

export interface UserCredentialsReader {
  /** Solo devuelve usuarios NO borrados (`deleted_at IS NULL`): el filtro es del puerto, no del dominio (R1, R5). */
  findActiveByUsername(username: string): Promise<AuthenticatableUser | null>;
}
