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
};

/**
 * Lo que el dominio necesita del mundo para resolver quien es el usuario de la sesion
 * (`design.md > 2`). Consulta por `id` **en cada peticion**: el rol y el estado activo son
 * siempre los actuales, nunca los de cuando se emitio la cookie (R10, R12).
 */
export interface SessionUserReader {
  findActiveById(id: string): Promise<SessionUserRecord | null>;
}
