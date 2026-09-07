import { prisma } from '@/lib/shared/db/prisma';

import type { SessionUserRecord } from '../../../ports/session-user-reader';

/**
 * Implementa `SessionUserReader.findActiveById` (`design.md > 4.2`). Busca por clave primaria,
 * asi que va con la API tipada de Prisma y no con `$queryRaw`: aqui no hay ningun indice
 * funcional que esquivar, a diferencia de `findActiveByUsername` en
 * `user-credentials-prisma.ts`, que si lo tiene.
 *
 * `deletedAt: null` va en el `where`, no en un `if` posterior (R11): un usuario dado de baja
 * no debe salir de la base para la sesion.
 *
 * El `select` es explicito y minimo (R14): ni correo, ni telefono, ni documento, ni
 * `password_hash`, ni los contadores de bloqueo. `role.name` viaja en la misma consulta, por la
 * FK ya indexada `users_role_id_idx`, y no como una segunda consulta aparte: es lo que hace
 * barata la decision «el rol es siempre el actual» (R12).
 *
 * `id` es `@db.Uuid`: un `sub` sin forma de UUID haria que Prisma lanzara en vez de devolver
 * `null`. Por eso el esquema del dominio exige forma de UUID y corta antes de llegar aqui (R6).
 *
 * QC-48 (T6, R13, `design.md > 4.1`): el `select` gana `companyId` y `company.deletedAt`, en
 * ESTA MISMA llamada a `findFirst`. `companyId` es una columna de `users` y ya venia en la fila;
 * `company.deletedAt` vive en `companies` y Prisma lo resuelve por la relacion ya declarada y por
 * la clave primaria de `companies`, igual que ya hace con `role.name`. **Ni una segunda consulta
 * por peticion**, que era la condicion.
 *
 * El coste, aceptado por escrito en `design.md > 4.1` y anotado aqui para que nadie lo descubra
 * de sorpresa: (a) el plan de esta consulta gana un `JOIN` mas —una busqueda por CLAVE PRIMARIA,
 * en la ruta mas caliente de la aplicacion, que ya hacia otro `JOIN` por `users_role_id_idx`—;
 * (b) el `select` deja de ser tan estrecho: sale de la base una marca de tiempo mas, que **no es
 * PII** y no se registra en ningun log.
 */
export async function findActiveSessionUserById(id: string): Promise<SessionUserRecord | null> {
  const usuario = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      username: true,
      firstNames: true,
      lastNames: true,
      role: { select: { name: true } },
      companyId: true,
      company: { select: { deletedAt: true } },
    },
  });

  if (usuario === null) return null;

  return {
    id: usuario.id,
    username: usuario.username,
    firstNames: usuario.firstNames,
    lastNames: usuario.lastNames,
    roleName: usuario.role.name,
    companyId: usuario.companyId,
    // QC-48 R15: la marca cruda. Quien decide si «esta viva» es el dominio, no este adaptador.
    companyDeletedAt: usuario.company.deletedAt,
  };
}
