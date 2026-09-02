import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { ROLE_ADMINISTRADOR } from '../../../domain/roles';

import type { InitialAccessRepository } from '../../../ports/initial-access-repository';

/**
 * Adaptador Prisma del puerto `InitialAccessRepository` (`design.md > 5.3`, T11). Solo
 * toca `role` y `user`, los dos modelos de `identity` que le tocan al seed: nunca
 * `documentType` (R17).
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

    async createInitialAdmin(input) {
      try {
        const created = await db.user.create({
          data: {
            roleId: input.roleId,
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
 * Instancia ya cableada con el `prisma` compartido (`lib/shared/db/prisma.ts`, la unica
 * instancia). Es lo que consume `lib/composition/index.ts`: la composicion NO puede
 * importar el cliente Prisma compartido directamente (solo un adaptador driven puede,
 * `tests/guards/guard-arquitectura-modulos.test.ts > R17`), asi que el cableado con la
 * instancia real vive aqui, dentro del propio adaptador driven.
 */
export const initialAccessRepository: InitialAccessRepository = createInitialAccessRepository(prisma);
