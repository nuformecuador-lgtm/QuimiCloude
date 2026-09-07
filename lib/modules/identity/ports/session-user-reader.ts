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
};

/**
 * Lo que el dominio necesita del mundo para resolver quien es el usuario de la sesion
 * (`design.md > 2`). Consulta por `id` **en cada peticion**: el rol y el estado activo son
 * siempre los actuales, nunca los de cuando se emitio la cookie (R10, R12).
 */
export interface SessionUserReader {
  findActiveById(id: string): Promise<SessionUserRecord | null>;
}
