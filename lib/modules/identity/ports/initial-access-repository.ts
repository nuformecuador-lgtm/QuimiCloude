import type { DocumentTypeCode } from '../domain/document-type';

/**
 * Puerto de lectura/escritura del seed (`design.md > 5.1`). Deliberadamente NO expone
 * ningun metodo de actualizacion ni de `upsert`: el algoritmo del dominio solo lee para
 * decidir que falta y crea exactamente eso (`design.md > 5.2`). Ningun metodo nombra
 * `document_types`: el seed no siembra tipos de documento, la migracion de QC-4 ya lo
 * hizo (R17).
 *
 * QC-47: el puerto gana la empresa. El rol NO se mueve — sigue viviendo en
 * `users.role_id` (QC-47 R13, R14) —; lo unico que se anade es resolver la empresa
 * inicial para poder meter dentro al administrador. Sigue sin haber ni un `update` ni un
 * `upsert`.
 */
export interface InitialAccessRepository {
  /** Busca roles existentes por nombre exacto. Devuelve solo los que encontro. */
  findRoleIdsByName(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * Cuenta usuarios VIVOS (`deleted_at IS NULL`) con el rol dado (R4, R12), leido de
   * `users.role_id` (QC-47 R14). Es la lectura que decide `needsAdmin`: cambiarle la
   * fuente o la semantica crea un segundo administrador en cada despliegue.
   */
  countLiveUsersWithRole(roleName: string): Promise<number>;
  createRole(role: { name: string; description: string }): Promise<string>;
  /**
   * Busca la empresa VIVA cuyo nombre normalizado coincide (QC-47 R22). Devuelve `null`
   * si no hay ninguna. La normalizacion la calcula el dominio con `normalizeCompanyName`
   * (QC-47 R3): este puerto recibe la clave ya normalizada y no vuelve a normalizarla.
   */
  findCompanyIdByNormalizedName(normalized: string): Promise<string | null>;
  /** Crea la empresa y devuelve su id (QC-47 R20). Sin `upsert`: nunca pisa una existente. */
  createCompany(input: { name: string; nameNormalized: string }): Promise<string>;
  /**
   * Crea el usuario inicial. La firma se AMPLIA respecto al `design.md > 5.1` original
   * para incluir explicitamente los marcadores personales fijos (R7): el dominio es
   * quien los decide, no el adaptador, asi que tienen que llegar como parametros y no
   * quedar hardcodeados en la implementacion Prisma.
   *
   * QC-47 R20: `roleId` y `companyId` son las DOS columnas propias de la fila del
   * usuario, y llegan juntas a esta unica llamada. La implementacion tiene que
   * escribirlas en una sola sentencia: no puede existir ningun instante en el que quede
   * una persona sin empresa o sin rol.
   */
  createInitialAdmin(input: {
    roleId: string;
    companyId: string;
    username: string;
    email: string;
    passwordHash: string;
    firstNames: string;
    lastNames: string;
    birthDate: Date;
    phone: string;
    documentTypeCode: DocumentTypeCode;
    documentNumber: string;
  }): Promise<{ id: string }>;
}
