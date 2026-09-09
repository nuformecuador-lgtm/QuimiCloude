import type { UserAccountStatus } from '../domain/account-status';
import type { DocumentTypeCode } from '../domain/document-type';

/**
 * Puerto de lectura/escritura del seed (`design.md > 5.1`). Deliberadamente NO expone
 * ningun metodo de actualizacion ni de `upsert`: el algoritmo del dominio solo lee para
 * decidir que falta y crea exactamente eso (`design.md > 5.2`). Ningun metodo nombra
 * `document_types`: el seed no siembra tipos de documento, la migracion de QC-4 ya lo
 * hizo (R17).
 *
 * QC-74: el puerto gana el catalogo de permisos y las asignaciones permiso-rol. Cuatro
 * metodos, dos de lectura y dos de creacion, y NINGUNO de `upsert`, `update` ni `delete`:
 * el catalogo y las asignaciones solo se crean desde el seed y solo se retiran por
 * migracion (R5, R10). Que el puerto no los ofrezca es la forma de que nadie pueda
 * escribirlos por descuido.
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
   * Devuelve, de los codigos pedidos, los que YA existen en `permissions` (R10). El
   * dominio resta este conjunto del catalogo para saber que crear: nunca lee la tabla
   * entera ni asume nada de lo que no pregunto.
   */
  findExistingPermissionCodes(codes: readonly string[]): Promise<ReadonlySet<string>>;
  /**
   * Crea las filas del catalogo que faltan, en una sola sentencia. Sin `upsert`: quien
   * llama ya decidio que ninguna de estas existe, y una fila preexistente jamas se pisa
   * (R5, R10).
   */
  createPermissions(
    rows: readonly { code: string; module: string; action: string; description: string }[],
  ): Promise<void>;
  /**
   * Devuelve las asignaciones que YA existen para los roles pedidos, codificadas como
   * `` `${roleId}|${permissionCode}` `` — un `Set` plano de pares, no un mapa por rol:
   * la unica pregunta que hace el dominio es «¿esta esta pareja?», y esa forma la
   * responde en O(1) sin un segundo nivel de estructura. El separador es `|` porque no
   * aparece ni en un uuid ni en un codigo de permiso, asi que la clave es inequivoca.
   */
  findRolePermissionCodes(roleIds: readonly string[]): Promise<ReadonlySet<string>>;
  /**
   * Crea las asignaciones permiso-rol que faltan, en una sola sentencia. Sin `upsert` y
   * sin `delete`: una asignacion anadida a mano en produccion no se toca, y retirar una
   * es una migracion explicita (R10, `design.md > 3`).
   */
  createRolePermissions(
    pairs: readonly { roleId: string; permissionCode: string }[],
  ): Promise<void>;
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
   *
   * QC-65 R7: `accountStatus` es OBLIGATORIO, no opcional. El administrador inicial no
   * puede heredar el `@default(pending)` de la columna —quedaria fuera del sistema en
   * cuanto QC-78 corte el login por estado, y hoy no se notaria—, y un puerto que
   * permitiera omitirlo devolveria ese agujero por la puerta de atras
   * (`design.md > 4`). Quien decide el valor es el dominio, no el adaptador.
   *
   * `accountStatusChangedBy` NO esta en la firma a proposito: el administrador inicial lo
   * crea el SISTEMA, no una persona, y eso se escribe dejando la columna NULL (R10).
   */
  createInitialAdmin(input: {
    roleId: string;
    companyId: string;
    accountStatus: UserAccountStatus;
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
