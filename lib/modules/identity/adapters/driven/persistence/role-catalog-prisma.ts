// lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts
import { prisma } from '@/lib/shared/db/prisma';

import { ROLE_ADMINISTRADOR } from '../../../domain/roles';
import type { RoleOption } from '../../../domain/role-view';

/**
 * QC-94 T6 — Implementa `RoleCatalogRepository` (`ports/role-catalog-repository.ts`,
 * `design.md > 4.3`) con Prisma. Se exporta una funcion SUELTA, no un objeto ya construido: quien
 * ata el puerto a esta implementacion es SOLO `lib/composition/index.ts` (R16), igual que hace
 * `user-admin-prisma.ts` con `UserAdminRepository`.
 *
 * Es el unico archivo de esta feature que toca la base. `prisma.role` es un modelo
 * `/// @module identity`: no cruza ninguna frontera de modulo.
 *
 * Tres propiedades son el requisito, no estilo:
 *
 *   1. **`select` ENUMERADO, nunca un `findMany` sin el** (R9): asi es como una columna que nadie
 *      decidio exponer —hoy `description`, manana la que se anada— acaba en un payload del cliente.
 *   2. **El orden lo hace la BASE** (`ORDER BY name ASC`, R10), no JavaScript. Tiene que haber UN
 *      solo sitio que ordene: si el adaptador ordenara y el dominio reordenara con `localeCompare`,
 *      los dos podrian discrepar en acentos y mayusculas segun la collation, y el desacuerdo solo
 *      apareceria con datos reales (`design.md > 8.2`).
 *   3. **No hace falta desempate**: `roles.name` es `@unique` en TODA la tabla, asi que el orden por
 *      nombre ya es total y determinista (R10). Distinto de QC-66, donde dos personas si pueden
 *      llamarse igual.
 *
 * **SOLO LECTURA (R17):** en este archivo no hay —ni puede haber— ningun `create`, `update`,
 * `upsert` ni `delete` sobre `roles` ni sobre `role_permissions`. Y **sin empresa** (R11): el
 * catalogo es global y el `where` no filtra por `company_id`.
 *
 * **Fix directo (2026-09-22): el catalogo ya NO es «todos los roles».** El rol administrador se
 * queda fuera: el select de la pantalla de usuarios no debe poder ofrecerlo (R24) y el alta/edicion
 * lo rechaza igualmente en el puerto —dos capas, la de listado y la de escritura, por si un
 * llamante se salta el catalogo. El nombre sale de `ROLE_ADMINISTRADOR` importado del dominio
 * (R24): ni literal nuevo ni constante nueva.
 */
export async function listAllRoles(): Promise<readonly RoleOption[]> {
  return prisma.role.findMany({
    select: { id: true, name: true },
    where: { name: { not: ROLE_ADMINISTRADOR } },
    orderBy: { name: 'asc' },
  });
}
