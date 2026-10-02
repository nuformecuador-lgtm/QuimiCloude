/**
 * Credenciales para crear el usuario inicial (R5). Se agrupan en un tipo de datos
 * separado del proveedor porque quien las produce (el adaptador de entorno) y quien
 * decide CUANDO pedirlas (el dominio) son responsabilidades distintas: ver
 * `InitialAdminCredentialsProvider` mas abajo.
 */
export interface InitialAdminCredentials {
  readonly username: string;
  /**
   * Contrasena en claro, EN TRANSITO desde el entorno hacia el hasher. Nunca se
   * persiste: el dominio la pasa a `passwordHasher.hash` y descarta el valor (R8). El
   * nombre evita el segmento `password` a proposito
   * (`tests/guards/guard-password-never-plaintext.test.ts`, `design.md > 2`).
   */
  readonly credential: string;
  readonly email: string;
}

/**
 * Resuelve las credenciales del usuario inicial. Es una FUNCION y no un objeto de datos
 * ya resuelto a proposito: eso permite que el dominio la invoque solo cuando de verdad
 * hace falta crear el usuario, y no la invoque en absoluto si el admin ya existe (R12).
 * Un objeto de datos obligaria a leer el entorno siempre, incluso cuando sobra.
 *
 * Lanza si falta o esta vacia alguna variable de origen; el dominio no debe llamarla
 * antes de haber decidido que hay que crear el usuario inicial (R13).
 */
export type InitialAdminCredentialsProvider = () => InitialAdminCredentials;

/**
 * Mismo contrato para el primer Maestro, con sus propias variables de origen. El dominio
 * solo lo invoca si no hay ningun Maestro vivo.
 */
export type InitialMaestroCredentialsProvider = () => InitialAdminCredentials;
