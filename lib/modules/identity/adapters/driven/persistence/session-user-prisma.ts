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
 * `password_hash`, ni los contadores de bloqueo. El nombre del rol viaja en la misma consulta y
 * no como una segunda consulta aparte: es lo que hace barata la decision «el rol es siempre el
 * actual» (R12).
 *
 * QC-47 (R15, R17) — EL ROL YA NO ESTA EN `users`. La columna `users.role_id`, su relacion
 * `role` y su indice `users_role_id_idx` murieron con QC-47 (R14): el rol de una persona es el
 * de su PERTENENCIA, y es el rol que tiene EN ESA EMPRESA. Por eso el `select` pide
 * `memberships` (`design.md > 5.2`), y sigue siendo UNA consulta por clave primaria.
 *
 * Si no hay ninguna pertenencia, devuelve `null`: mismo criterio que `findActiveByUsername` en
 * `user-credentials-prisma.ts` y misma consecuencia — sin pertenencia no hay sesion, y no se
 * inventa ningun rol por defecto (R17). La garantia de «quien tiene sesion tiene rol» ya no la
 * da el `NOT NULL` de una columna sino la existencia de esa fila.
 *
 * El `orderBy` con `take: 1` NO decide nada de negocio —hoy nadie tiene mas de una pertenencia—:
 * es el mismo criterio que el `ORDER BY m.created_at, m.company_id` del SQL del login, para que
 * las dos lecturas resuelvan el MISMO rol el dia que haya varias. Quien elige empresa es QC-48.
 *
 * `id` es `@db.Uuid`: un `sub` sin forma de UUID haria que Prisma lanzara en vez de devolver
 * `null`. Por eso el esquema del dominio exige forma de UUID y corta antes de llegar aqui (R6).
 */
export async function findActiveSessionUserById(id: string): Promise<SessionUserRecord | null> {
  const usuario = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      username: true,
      firstNames: true,
      lastNames: true,
      memberships: {
        select: { role: { select: { name: true } } },
        orderBy: [{ createdAt: 'asc' }, { companyId: 'asc' }],
        take: 1,
      },
    },
  });

  if (usuario === null) return null;

  const pertenencia = usuario.memberships[0];
  if (pertenencia === undefined) return null;

  return {
    id: usuario.id,
    username: usuario.username,
    firstNames: usuario.firstNames,
    lastNames: usuario.lastNames,
    roleName: pertenencia.role.name,
  };
}
