import { DOCUMENT_TYPE_CC } from './document-type';
import { ROLE_ADMINISTRADOR, SEED_ROLES } from './roles';

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
}

export type SeedInitialAccessDeps = {
  readonly repository: InitialAccessRepository;
  readonly passwordHasher: PasswordHasher;
  readonly credentials: InitialAdminCredentialsProvider;
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
  const { repository, passwordHasher, credentials } = deps;

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

  // 5. Si faltaAdmin: crear el usuario con el roleId del rol Administrador (el existente
  // o el recien creado) y los marcadores fijos de esta ficha.
  let createdAdmin = false;
  if (needsAdmin && hashedAdmin !== null) {
    const administradorRoleId = roleIds.get(ROLE_ADMINISTRADOR);
    if (administradorRoleId === undefined) {
      throw new Error('no se pudo resolver el id del rol Administrador tras crearlo');
    }
    await repository.createInitialAdmin({
      roleId: administradorRoleId,
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

  // 6. Devolver el resultado.
  return { createdRoles, createdAdmin };
}
