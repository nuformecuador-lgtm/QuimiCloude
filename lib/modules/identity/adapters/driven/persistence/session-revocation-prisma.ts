// lib/modules/identity/adapters/driven/persistence/session-revocation-prisma.ts
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

/**
 * QC-23 T8 — Implementa `SessionRevocationRepository` (`ports/session-revocation-repository.ts`,
 * `design.md > 6`) con Prisma. Cubre R12, R20, R25, R28, R39, R44, R45, R46.
 *
 * Se exportan funciones SUELTAS, no un objeto ya construido: quien ata el puerto a esta
 * implementacion es SOLO `lib/composition/index.ts` (R46), igual que hace `user-admin-prisma.ts`.
 *
 * Es el UNICO archivo del repositorio con `prisma.revokedSession`, y el modelo es
 * `/// @module identity`: no cruza ninguna frontera de modulo (lo vigila
 * `guard-arquitectura-modulos`).
 *
 * CUATRO propiedades de este adaptador son el requisito, no estilo:
 *
 *   1. **Ningun `SELECT` previo de existencia.** Se inserta y se traduce el choque; entre un
 *      `SELECT` y el `INSERT` cabe otra transaccion, y esa carrera es justo lo que R12 no puede
 *      permitirse. Criterio ya fijado por QC-38, QC-43 y QC-66.
 *   2. **El choque se reconoce por el CODIGO (`P2002`, SQLSTATE `23505`), jamas por el texto del
 *      mensaje** —en esta maquina Postgres responde en espanol—. Mismo criterio, y mismo motivo,
 *      que `isUniqueViolation` de `user-admin-prisma.ts`.
 *   3. **La purga va DENTRO de la misma transaccion que la escritura** (R39) y esta acotada a
 *      `user_id = ?`: usa `revoked_sessions_user_id_expires_at_idx` y no recorre la tabla. No
 *      existe ninguna tarea programada ni proceso de fondo que la haga (R40) — este ERP no los
 *      tiene—, y **no se purga en el camino de lectura por peticion**: eso convertiria la ruta
 *      mas caliente del ERP en una escritura (alternativa descartada 6 de `design.md > 9`).
 *   4. **El borrado de la purga es FISICO** (R45): la fila de una sesion cerrada es un hecho
 *      inmutable sin `updated_at` ni `deleted_at`, y pasada su caducidad natural ya no protege de
 *      nada. Es la unica escritura posterior que admite.
 */

/**
 * `23505` / `P2002`. **Se afirma sobre el codigo del error, nunca sobre su texto.**
 *
 * Aqui no hace falta mirar `meta.target` —a diferencia de `user-admin-prisma.ts`, que distingue
 * tres indices—: `revoked_sessions` tiene UN solo indice unico,
 * `revoked_sessions_session_id_key`, asi que ningun otro `P2002` puede nacer de este `INSERT`.
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * `revokeSession` del puerto (R20, R39, R12).
 *
 * **La purga va ANTES del `INSERT`, y el orden es deliberado.** En Postgres una sentencia que
 * falla aborta la transaccion entera, asi que atrapar el `23505` DENTRO del callback y seguir
 * con el `DELETE` no funcionaria: la siguiente sentencia moriria con `25P02`. Poniendo el
 * `DELETE` primero, el choque se atrapa **inmediatamente fuera del `$transaction`** —mismo sitio
 * y mismo motivo que el `RollbackToInvalid` de `credential-setup-link-prisma.ts`— y el caso
 * «ya estaba cerrada» revierte sin escribir nada, que es exactamente lo que significa. Y el
 * orden no deja ningun hueco: la fila que se inserta caduca en el futuro, asi que la purga no
 * podria llevarsela.
 *
 * No toca `users` y no sube ningun sello (R24): cerrar sesion en el movil no echa a nadie de la
 * oficina.
 */
export async function revokeSession(input: {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  now: Date;
}): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. La purga de R39, acotada a ESA persona y a lo que ya caduco.
      await tx.revokedSession.deleteMany({
        where: { userId: input.userId, expiresAt: { lte: input.now } },
      });

      // 2. El cierre. Sin `SELECT` previo: si ya estaba, choca y se traduce abajo.
      await tx.revokedSession.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          expiresAt: input.expiresAt,
          revokedAt: input.now,
        },
      });
    });
  } catch (error) {
    // R12: registrar dos veces el cierre de la MISMA sesion es «ya estaba», no un error. Lo que
    // no sea ese caso se RELANZA: aqui no hay ningun `catch` que descarte un error
    // (`docs/conventions.md > Manejo de errores`).
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

/**
 * `stampAll` del puerto (R25, R28, R39).
 *
 * **El ambito vive AQUI, en el `where`, y no en el caso de uso** (`design.md > 5.2`): `id`,
 * `company_id` y `deleted_at IS NULL` juntos, igual que en `UserAdminRepository`. Si el filtro
 * estuviera en el dominio, el proximo caso de uso podria olvidarlo; aqui no puede.
 *
 * `updateMany` y no `update`: si la persona no existe, esta borrada logicamente o es de otra
 * empresa, `count` sale 0 y se devuelve `'not_found'` en vez de lanzar. Los TRES casos salen por
 * la misma puerta y el dominio los traduce al mismo `UserNotFoundError` (R28).
 *
 * **Si el sello no sube, no se purga nada**: una persona que no es de esta empresa —o que no
 * existe— no tiene filas que este llamante pueda tocar. El `return` temprano es parte del
 * ambito, no una optimizacion.
 *
 * `validFrom` llega ya truncado al segundo (`floorToSecond`, `design.md > 2.3`) y se escribe tal
 * cual: este adaptador no redondea ni inventa instantes. Ese mismo instante es el corte de la
 * purga, que es el unico «ahora» que la firma del puerto trae.
 */
export async function stampAll(input: {
  userId: string;
  companyId: string;
  validFrom: Date;
}): Promise<'ok' | 'not_found'> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: input.userId, companyId: input.companyId, deletedAt: null },
      data: { sessionsValidFrom: input.validFrom },
    });

    if (count === 0) return 'not_found';

    // La purga de R39, en la MISMA transaccion que la subida del sello y acotada a esa persona.
    await tx.revokedSession.deleteMany({
      where: { userId: input.userId, expiresAt: { lte: input.validFrom } },
    });

    return 'ok';
  });
}
