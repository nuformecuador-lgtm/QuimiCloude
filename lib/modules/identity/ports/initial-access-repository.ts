import type { DocumentTypeCode } from '../domain/document-type';

/**
 * Puerto de lectura/escritura del seed (`design.md > 5.1`). Deliberadamente NO expone
 * ningun metodo de actualizacion ni de `upsert`: el algoritmo del dominio solo lee para
 * decidir que falta y crea exactamente eso (`design.md > 5.2`). Ningun metodo nombra
 * `document_types`: el seed no siembra tipos de documento, la migracion de QC-4 ya lo
 * hizo (R17).
 */
export interface InitialAccessRepository {
  /** Busca roles existentes por nombre exacto. Devuelve solo los que encontro. */
  findRoleIdsByName(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Cuenta usuarios VIVOS (`deleted_at IS NULL`) con el rol dado (R4, R12). */
  countLiveUsersWithRole(roleName: string): Promise<number>;
  createRole(role: { name: string; description: string }): Promise<string>;
  /**
   * Crea el usuario inicial. La firma se AMPLIA respecto al `design.md > 5.1` original
   * para incluir explicitamente los marcadores personales fijos (R7): el dominio es
   * quien los decide, no el adaptador, asi que tienen que llegar como parametros y no
   * quedar hardcodeados en la implementacion Prisma.
   */
  createInitialAdmin(input: {
    roleId: string;
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
