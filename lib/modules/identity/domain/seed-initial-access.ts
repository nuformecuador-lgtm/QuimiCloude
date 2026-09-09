import { SEED_ADMIN_ACCOUNT_STATUS } from './account-status';
import { INITIAL_COMPANY_NAME } from './companies';
import { normalizeCompanyName } from './company-name';
import { DOCUMENT_TYPE_CC } from './document-type';
import { PERMISSIONS, SEED_ROLE_PERMISSIONS } from './permissions';
import { ROLE_ADMINISTRADOR, SEED_ROLES } from './roles';

import type { CredentialPolicyResult } from './credential-policy';

import type { InitialAdminCredentialsProvider } from '../ports/initial-access-credentials';
import type { InitialAccessRepository } from '../ports/initial-access-repository';
import type { PasswordHasher } from '../ports/password-hasher';

/**
 * Caso de uso del seed (`design.md > 5.2`). Nada de `upsert`, nada de reescritura: el
 * algoritmo LEE que falta y CREA exactamente eso. Este archivo no conoce Prisma,
 * `process.env` ni ningun framework: todo entra por puertos, lo que permite testearlo
 * con dobles y sin base (R12, R13, R14, R15 en unitario).
 */
export interface SeedOutcome {
  /** Nombres de los roles creados en ESTA corrida. Vacio si ya estaban todos. */
  readonly createdRoles: readonly string[];
  readonly createdAdmin: boolean;
  /**
   * QC-47 R20/R22: nombre de la empresa inicial creada en ESTA corrida, o `null` si ya
   * existia (o si no hizo falta ninguna porque el administrador ya estaba). Solo lo usa
   * `scripts/seed.ts` para su linea de resumen; no es una credencial.
   */
  readonly createdCompany: string | null;
  /**
   * QC-74 R10: codigos del catalogo creados en ESTA corrida, vacio si ya estaban todos.
   * Sale de restar lo que hay a `PERMISSIONS`, nunca de una lista escrita a mano.
   */
  readonly createdPermissions: readonly string[];
  /**
   * QC-74 R10: numero de asignaciones permiso-rol creadas en ESTA corrida. Es un numero y
   * no una lista porque lo unico que hace `scripts/seed.ts` con el es resumirlo.
   */
  readonly createdRolePermissions: number;
}

export type SeedInitialAccessDeps = {
  readonly repository: InitialAccessRepository;
  readonly passwordHasher: PasswordHasher;
  readonly credentials: InitialAdminCredentialsProvider;
  /**
   * QC-19 R18: la politica de credenciales, ya cableada con su lista de filtradas. Es
   * OBLIGATORIA a proposito — un seed que pudiera construirse sin ella volveria a ser un
   * punto que fija una contrasena sin evaluarla. El dominio recibe la funcion, no el
   * adaptador: quien la ata es `lib/composition` (`design.md > 7`).
   */
  readonly checkCredentialPolicy: (candidate: string) => Promise<CredentialPolicyResult>;
};

/**
 * Marcadores fijos del usuario inicial (R7). Ninguno pretende ser un dato real: quien
 * mire la fila tiene que ver que es de instalacion. El correo y el nombre de usuario NO
 * estan aqui: esos llegan por `credentials()` (R5).
 */
const INITIAL_ADMIN_FIRST_NAMES = 'Administrador';
const INITIAL_ADMIN_LAST_NAMES = 'Inicial';
const INITIAL_ADMIN_BIRTH_DATE = new Date('1900-01-01T00:00:00.000Z');
const INITIAL_ADMIN_PHONE = '+00 000 000 0000';
const INITIAL_ADMIN_DOCUMENT_NUMBER = '00000000';

export async function seedInitialAccess(deps: SeedInitialAccessDeps): Promise<SeedOutcome> {
  const { repository, passwordHasher, credentials, checkCredentialPolicy } = deps;

  // 1. Leer estado: roles existentes por nombre + numero de usuarios vivos con rol Administrador.
  const roleNames = SEED_ROLES.map((role) => role.name);
  const existingRoleIds = await repository.findRoleIdsByName(roleNames);
  const liveAdminCount = await repository.countLiveUsersWithRole(ROLE_ADMINISTRADOR);

  // 2. faltaAdmin = (numero == 0).
  const needsAdmin = liveAdminCount === 0;

  // 3. Si faltaAdmin: resolver credenciales y hashear ANTES de escribir nada (R13): si
  // cualquiera de los dos pasos falla, no queda nada creado a medias.
  let hashedAdmin: { username: string; email: string; passwordHash: string } | null = null;
  if (needsAdmin) {
    const initialAdminCredentials = credentials();
    // QC-19 R18: la politica se evalua ANTES de producir el hash. Si el resultado no es
    // aceptable no se hashea y no se escribe nada; el error nombra las REGLAS
    // incumplidas y nunca la credencial ni un fragmento suyo (R24).
    const policyResult = await checkCredentialPolicy(initialAdminCredentials.credential);
    if (!policyResult.ok) {
      throw new Error(
        `la credencial de instalacion no cumple la politica: ${policyResult.unmet.join(', ')}`,
      );
    }
    const passwordHash = await passwordHasher.hash(initialAdminCredentials.credential);
    hashedAdmin = {
      username: initialAdminCredentials.username,
      email: initialAdminCredentials.email,
      passwordHash,
    };
  }

  // 4. Crear solo los roles que falten.
  const createdRoles: string[] = [];
  const roleIds = new Map(existingRoleIds);
  for (const role of SEED_ROLES) {
    if (roleIds.has(role.name)) continue;
    const roleId = await repository.createRole({ name: role.name, description: role.description });
    roleIds.set(role.name, roleId);
    createdRoles.push(role.name);
  }

  // 5. Permisos (QC-74, `design.md > 3`). Va DESPUES de crear los roles —una asignacion
  // necesita el id del rol— y ANTES de crear el administrador, para que el primer usuario
  // nazca sobre un rol que ya tiene su conjunto de permisos completo. Dos veces el mismo
  // patron que el resto del seed: LEER que falta y CREAR exactamente eso. Sin `upsert` y
  // sin `delete`, asi que una asignacion anadida a mano en produccion sobrevive (R10).
  const missingPermissions = await resolveMissingPermissions(repository);
  if (missingPermissions.length > 0) {
    await repository.createPermissions(missingPermissions);
  }
  const createdPermissions = missingPermissions.map((permission) => permission.code);

  const missingRolePermissions = await resolveMissingRolePermissions(repository, roleIds);
  if (missingRolePermissions.length > 0) {
    await repository.createRolePermissions(missingRolePermissions);
  }
  const createdRolePermissions = missingRolePermissions.length;

  // 6. Si faltaAdmin: resolver la empresa inicial (reutilizandola si ya esta) y crear el
  // usuario con el roleId del rol Administrador (el existente o el recien creado) y los
  // marcadores fijos de esta ficha.
  let createdAdmin = false;
  let createdCompany: string | null = null;
  if (needsAdmin && hashedAdmin !== null) {
    const administradorRoleId = roleIds.get(ROLE_ADMINISTRADOR);
    if (administradorRoleId === undefined) {
      throw new Error('no se pudo resolver el id del rol Administrador tras crearlo');
    }

    // QC-47 R20/R22: la empresa inicial se resuelve por NOMBRE NORMALIZADO antes de
    // crearla. Si ya existe se reutiliza — nunca se pisa, nunca se crea una segunda—;
    // solo si no hay ninguna se crea. La resolucion vive dentro de este `if` a proposito:
    // sobre una instalacion que ya tiene administrador, el seed no toca `companies` ni
    // para leer de mas ni para crear una empresa sin nadie dentro.
    const initialCompanyNameNormalized = normalizeCompanyName(INITIAL_COMPANY_NAME);
    let companyId = await repository.findCompanyIdByNormalizedName(initialCompanyNameNormalized);
    if (companyId === null) {
      companyId = await repository.createCompany({
        name: INITIAL_COMPANY_NAME,
        nameNormalized: initialCompanyNameNormalized,
      });
      createdCompany = INITIAL_COMPANY_NAME;
    }

    // El usuario se crea en UNA sola llamada al puerto, con su rol y su empresa como
    // columnas propias de su fila (QC-47 R13, R20): no hay ningun punto intermedio en el
    // que exista una persona sin rol ni una persona sin empresa.
    await repository.createInitialAdmin({
      roleId: administradorRoleId,
      companyId,
      // QC-65 R7: el estado va EXPLICITO y sale de la unica constante del dominio que lo
      // nombra (`SEED_ADMIN_ACCOUNT_STATUS`), nunca de un literal repetido aqui ni del
      // `@default(pending)` de la columna. El administrador de instalacion tiene que poder
      // entrar (decision cerrada 4), y heredar el default lo dejaria `pending`.
      // `accountStatusChangedBy` no se pasa: lo puso el sistema, no una persona (R10).
      accountStatus: SEED_ADMIN_ACCOUNT_STATUS,
      username: hashedAdmin.username,
      email: hashedAdmin.email,
      passwordHash: hashedAdmin.passwordHash,
      firstNames: INITIAL_ADMIN_FIRST_NAMES,
      lastNames: INITIAL_ADMIN_LAST_NAMES,
      birthDate: INITIAL_ADMIN_BIRTH_DATE,
      phone: INITIAL_ADMIN_PHONE,
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: INITIAL_ADMIN_DOCUMENT_NUMBER,
    });
    createdAdmin = true;
  }

  // 7. Devolver el resultado.
  return { createdRoles, createdAdmin, createdCompany, createdPermissions, createdRolePermissions };
}

/** Una fila del catalogo tal y como la escribe el puerto. */
type PermissionRow = {
  readonly code: string;
  readonly module: string;
  readonly action: string;
  readonly description: string;
};

/**
 * Las filas del catalogo que todavia no estan en la base. Se derivan de `PERMISSIONS`, que
 * es el unico dueno del catalogo (R1, R2): este archivo no repite ni un codigo.
 */
async function resolveMissingPermissions(
  repository: InitialAccessRepository,
): Promise<readonly PermissionRow[]> {
  const catalogCodes = PERMISSIONS.map((permission) => permission.code);
  const existingCodes = await repository.findExistingPermissionCodes(catalogCodes);
  return PERMISSIONS.filter((permission) => !existingCodes.has(permission.code)).map(
    (permission) => ({
      code: permission.code,
      module: permission.module,
      action: permission.action,
      description: permission.description,
    }),
  );
}

/**
 * Las asignaciones de `SEED_ROLE_PERMISSIONS` que todavia no estan en la base, resueltas
 * contra los ids de los roles ya sembrados. La pertenencia se pregunta con la MISMA
 * codificacion que declara el puerto (`${roleId}|${permissionCode}`).
 *
 * Si un rol nombrado en `SEED_ROLE_PERMISSIONS` no esta entre los roles sembrados, se
 * lanza en vez de saltarselo: seria un rol al que nadie creo nunca y sus permisos se
 * perderian en silencio en cada despliegue.
 */
async function resolveMissingRolePermissions(
  repository: InitialAccessRepository,
  roleIds: ReadonlyMap<string, string>,
): Promise<readonly { readonly roleId: string; readonly permissionCode: string }[]> {
  const assignments = Object.entries(SEED_ROLE_PERMISSIONS).map(([roleName, codes]) => {
    const roleId = roleIds.get(roleName);
    if (roleId === undefined) {
      throw new Error(`no se pudo resolver el id del rol ${roleName} para asignarle sus permisos`);
    }
    return { roleId, codes };
  });

  const existingPairs = await repository.findRolePermissionCodes(
    assignments.map((assignment) => assignment.roleId),
  );

  return assignments.flatMap(({ roleId, codes }) =>
    codes
      .filter((permissionCode) => !existingPairs.has(`${roleId}|${permissionCode}`))
      .map((permissionCode) => ({ roleId, permissionCode })),
  );
}
