// lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts
import { prisma } from '@/lib/shared/db/prisma';

import { ROLE_ADMINISTRADOR, ROLE_MAESTRO } from '../../../domain/roles';
import type { RoleOption } from '../../../domain/role-view';

/**
 * Implementa `RoleCatalogRepository` con Prisma. Se exporta una funcion suelta: quien ata el puerto
 * a esta implementacion es solo `lib/composition/index.ts`.
 *
 * - `select` enumerado: una columna nueva de `roles` no debe acabar en un payload del cliente.
 * - El orden lo hace la base (`ORDER BY name ASC`) y en ningun otro sitio, para que acentos y
 *   mayusculas no dependan de dos collations distintas. `roles.name` es unico, asi que el orden ya
 *   es total y no necesita desempate.
 * - Solo lectura, y sin filtro de empresa: el catalogo es global.
 *
 * El catalogo es el de los roles **asignables** desde la gestion de usuarios: el Administrador y el
 * Maestro quedan fuera. El alta y la edicion los rechazan igualmente al escribir, por si un llamante
 * se salta este listado.
 */
export async function listAllRoles(): Promise<readonly RoleOption[]> {
  return prisma.role.findMany({
    select: { id: true, name: true },
    where: { name: { notIn: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } },
    orderBy: { name: 'asc' },
  });
}
