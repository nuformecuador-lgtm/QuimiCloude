import type { DocumentTypeCode } from '../domain/document-type';

/**
 * Puerto de lectura/escritura del seed (`design.md > 5.1`). Deliberadamente NO expone
 * ningun metodo de actualizacion ni de `upsert`: el algoritmo del dominio solo lee para
 * decidir que falta y crea exactamente eso (`design.md > 5.2`). Ningun metodo nombra
 * `document_types`: el seed no siembra tipos de documento, la migracion de QC-4 ya lo
 * hizo (R17).
 *
 * QC-47 T13: el puerto gana la empresa. `users.role_id` ya no existe — el rol de una
 * persona vive en `memberships` (`QC-47 design.md > 5.3`), asi que el seed necesita
 * resolver la empresa inicial antes de poder dar de alta al administrador. Sigue sin
 * haber ni un `update` ni un `upsert`.
 */
export interface InitialAccessRepository {
  /** Busca roles existentes por nombre exacto. Devuelve solo los que encontro. */
  findRoleIdsByName(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * Cuenta usuarios VIVOS (`deleted_at IS NULL`) que tengan el rol dado EN ALGUNA
   * empresa (R4, R12; QC-47 R19). La fuente ya no es `users.role_id` sino la
   * pertenencia, y la semantica tiene que quedar identica: es la lectura que decide
   * `needsAdmin`, y traducirla mal crea un segundo administrador en cada despliegue
   * (`QC-47 design.md > 9`, riesgo 1).
   */
  countLiveUsersWithRole(roleName: string): Promise<number>;
  createRole(role: { name: string; description: string }): Promise<string>;
  /**
   * Busca la empresa VIVA cuyo nombre normalizado coincide (QC-47 R19). Devuelve `null`
   * si no hay ninguna. La normalizacion la calcula el dominio con `normalizeCompanyName`
   * (R3): este puerto recibe la clave ya normalizada y no vuelve a normalizarla.
   */
  findCompanyIdByNormalizedName(normalized: string): Promise<string | null>;
  /** Crea la empresa y devuelve su id (QC-47 R18). Sin `upsert`: nunca pisa una existente. */
  createCompany(input: { name: string; nameNormalized: string }): Promise<string>;
  /**
   * Crea el usuario inicial Y su pertenencia a la empresa inicial, en la MISMA llamada
   * (QC-47 R18, `QC-47 design.md > 5.3`: es la forma que fija `tasks.md > T13`). Que las
   * dos filas se escriban juntas es lo que hace atomica la pareja dentro de la
   * transaccion que ya existe: un usuario sin pertenencia no podria entrar (R17).
   *
   * La firma se AMPLIA respecto al `design.md > 5.1` original para incluir explicitamente
   * los marcadores personales fijos (R7): el dominio es quien los decide, no el
   * adaptador, asi que tienen que llegar como parametros y no quedar hardcodeados en la
   * implementacion Prisma.
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
