import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { ROLE_ADMINISTRADOR } from '../../../domain/roles';

import type { InitialAccessRepository } from '../../../ports/initial-access-repository';

/**
 * Adaptador Prisma del puerto `InitialAccessRepository` (`design.md > 5.3`, T11). Toca
 * `role`, `user` y `company` — los tres modelos de `identity` que le tocan al seed desde
 * QC-47 — y, desde QC-74, `permission` y `rolePermission`: nunca `documentType` (R17).
 *
 * Exporta una FABRICA y no un objeto ya construido a proposito: el test de integracion
 * necesita construirla sobre un `Prisma.TransactionClient` para poder correr el seed dos
 * veces dentro de una transaccion que termina en `ROLLBACK`, exactamente igual que
 * `tests/integration/identity/identity-constraints.int.test.ts`. Un objeto atado al
 * `PrismaClient` compartido no permitiria ese aislamiento.
 */
export function createInitialAccessRepository(
  db: PrismaClient | Prisma.TransactionClient,
): InitialAccessRepository {
  return {
    async findRoleIdsByName(names) {
      const roles = await db.role.findMany({
        where: { name: { in: [...names] } },
        select: { id: true, name: true },
      });
      return new Map(roles.map((role) => [role.name, role.id]));
    },

    async countLiveUsersWithRole(roleName) {
      return db.user.count({
        where: { deletedAt: null, role: { name: roleName } },
      });
    },

    async findCompanyIdByNormalizedName(normalized) {
      // Empresa VIVA: `companies_name_unique` es un unico PARCIAL sobre
      // `deleted_at IS NULL` (`QC-47 design.md > 2.1`), asi que este `where` es
      // exactamente el conjunto sobre el que la unicidad se garantiza.
      const company = await db.company.findFirst({
        where: { nameNormalized: normalized, deletedAt: null },
        select: { id: true },
      });
      return company?.id ?? null;
    },

    async createCompany(input) {
      try {
        const created = await db.company.create({
          data: { name: input.name, nameNormalized: input.nameNormalized },
        });
        return created.id;
      } catch (error) {
        // Misma carrera y MISMO criterio que `createRole`, aqui sobre
        // `companies_name_unique` (23505 -> P2002): se relee la empresa viva con ese
        // nombre normalizado y se devuelve su id, SIN sobrescribir su `name` (R15,
        // QC-47 R22). Nunca se crea una segunda empresa.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.company.findFirstOrThrow({
            where: { nameNormalized: input.nameNormalized, deletedAt: null },
          });
          return existing.id;
        }
        throw error;
      }
    },

    async createRole(role) {
      try {
        const created = await db.role.create({ data: { name: role.name, description: role.description } });
        return created.id;
      } catch (error) {
        // Carrera entre dos despliegues simultaneos: el nombre ya existe. Se relee y se
        // devuelve el id existente, SIN sobrescribir la descripcion (R15). Es el unico
        // `catch` del adaptador y no esta vacio.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.role.findUniqueOrThrow({ where: { name: role.name } });
          return existing.id;
        }
        throw error;
      }
    },

    async findExistingPermissionCodes(codes) {
      if (codes.length === 0) return new Set<string>();
      const found = await db.permission.findMany({
        where: { code: { in: [...codes] } },
        select: { code: true },
      });
      return new Set(found.map((permission) => permission.code));
    },

    async createPermissions(rows) {
      if (rows.length === 0) return;
      // `skipDuplicates` cubre la MISMA carrera que el `catch` de `createRole` —dos
      // despliegues simultaneos sembrando a la vez—: se salta la fila que ya esta y
      // nunca la reescribe. No es un `upsert`: ninguna columna de una fila existente se
      // toca (R5, R10).
      await db.permission.createMany({ data: [...rows], skipDuplicates: true });
    },

    async findRolePermissionCodes(roleIds) {
      if (roleIds.length === 0) return new Set<string>();
      const found = await db.rolePermission.findMany({
        where: { roleId: { in: [...roleIds] } },
        select: { roleId: true, permissionCode: true },
      });
      // Misma codificacion que declara el puerto: `${roleId}|${permissionCode}`.
      return new Set(found.map((row) => `${row.roleId}|${row.permissionCode}`));
    },

    async createRolePermissions(pairs) {
      if (pairs.length === 0) return;
      // Misma razon que en `createPermissions`. La PK compuesta
      // `(role_id, permission_code)` es la que hace inequivoco el duplicado.
      await db.rolePermission.createMany({ data: [...pairs], skipDuplicates: true });
    },

    async createInitialAdmin(input) {
      try {
        // QC-47 R20: `roleId` y `companyId` van como columnas del propio `user.create`,
        // en UNA sola sentencia dentro del mismo `tx`. No hay creacion anidada ni un
        // segundo `update` posterior: no existe ningun instante en el que la fila este
        // escrita sin su empresa o sin su rol.
        const created = await db.user.create({
          data: {
            roleId: input.roleId,
            companyId: input.companyId,
            username: input.username,
            email: input.email,
            passwordHash: input.passwordHash,
            firstNames: input.firstNames,
            lastNames: input.lastNames,
            birthDate: input.birthDate,
            phone: input.phone,
            documentTypeCode: input.documentTypeCode,
            documentNumber: input.documentNumber,
            // R9: el usuario inicial nace obligado a cambiar su contrasena.
            mustChangeCredential: true,
          },
        });
        return { id: created.id };
      } catch (error) {
        // Misma carrera que en `createRole`, sobre `users_username_unique` o
        // `users_email_unique`. Se relee el usuario vivo con rol Administrador y se
        // devuelve su id, sin sobrescribir nada (R15).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.user.findFirstOrThrow({
            where: { deletedAt: null, role: { name: ROLE_ADMINISTRADOR } },
          });
          return { id: existing.id };
        }
        throw error;
      }
    },
  };
}

/**
 * Corre `run` dentro de UNA transaccion, con un repositorio construido sobre el `tx`.
 * Es la garantia que `design.md > 5.2` declara innegociable: si el alta del usuario
 * falla, los roles creados en la misma corrida tampoco quedan (R13).
 *
 * Vive aqui y no en `lib/composition` porque el cliente Prisma compartido solo puede
 * importarse desde un adaptador driven (guard-arquitectura-modulos, bloque 11 / R17),
 * y no en `domain/` porque el dominio no conoce la persistencia: recibe un puerto ya
 * construido y no sabe si hay transaccion debajo.
 *
 * Timeouts explicitos: el paso 3 del algoritmo hashea con bcrypt (coste 10) dentro del
 * alcance de la llamada, y el default de 5 s de Prisma es innecesariamente justo para un
 * `build` de despliegue en una maquina cargada.
 */
export async function withInitialAccessTransaction<T>(
  run: (repository: InitialAccessRepository) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => run(createInitialAccessRepository(tx)),
    { maxWait: 10_000, timeout: 30_000 },
  );
}
