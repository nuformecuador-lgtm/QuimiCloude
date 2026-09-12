// lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { UserAccountStatus } from '../../../domain/account-status';
import type { ApplyOutcome, IssueOutcome } from '../../../ports/credential-setup-link-repository';

/**
 * QC-79 T10 — Implementa `CredentialSetupLinkRepository`
 * (`ports/credential-setup-link-repository.ts`, `design.md > 6.2`) con Prisma: las DOS
 * transacciones de `design.md > 4.5` y `> 4.6`. Cubre R11, R12, R15, R16, R19, R20, R22.
 *
 * Se exportan funciones SUELTAS, no un objeto ya construido: quien ata el puerto a esta
 * implementacion es SOLO `lib/composition/index.ts`, igual que hace `user-admin-prisma.ts`.
 *
 * TRES propiedades de este adaptador son el requisito, no estilo:
 *
 *   1. **El dominio nunca ve una excepcion de Prisma** (`design.md > 4.5`): el `23505` del indice
 *      unico parcial `credential_setup_tokens_one_live_per_user` se traduce a `'superseded'`, que
 *      es un resultado discriminado del puerto. Lo que no sea ese caso se RELANZA: aqui no hay
 *      ningun `catch` que descarte un error (`docs/conventions.md > Manejo de errores`).
 *   2. **El choque se reconoce por el CODIGO (`P2002`, SQLSTATE `23505`), jamas por el texto del
 *      mensaje** —en esta maquina Postgres responde en espanol—. Mismo criterio, y mismo motivo,
 *      que `isUniqueViolation` de `user-admin-prisma.ts`.
 *   3. **No hay ninguna lectura de enlaces** —el puerto no la ofrece a proposito—: el consumo de
 *      § 4.6 es un compare-and-set atomico, nunca un `SELECT` seguido de un `UPDATE`.
 */

const PENDING_ACCOUNT_STATUS = 'pending' satisfies UserAccountStatus;
const ACTIVE_ACCOUNT_STATUS = 'active' satisfies UserAccountStatus;

/**
 * `23505` / `P2002`. **Se afirma sobre el codigo del error, nunca sobre su texto.**
 *
 * Aqui no hace falta mirar `meta.target` —a diferencia de `user-admin-prisma.ts`, que distingue
 * tres indices—: la tabla tiene dos indices unicos y los dos significan lo mismo para el llamante.
 * `credential_setup_tokens_one_live_per_user` es la carrera de R11, y
 * `credential_setup_tokens_token_digest_key` solo podria chocar si dos secretos de 256 bits del
 * CSPRNG colisionaran, que es el mismo «vuelve a emitir» y nunca un exito silencioso.
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Senal interna con la que el paso 2 de `design.md > 4.6` hace **revertir la transaccion entera**.
 *
 * No es un error de dominio y no sale de este archivo: se lanza para abortar y se atrapa
 * inmediatamente fuera del `$transaction` para devolver `'invalid'`. Devolver `'invalid'` desde
 * DENTRO del callback confirmaria la transaccion, y con ella el `consumed_at` del paso 1: el
 * enlace quedaria quemado sin que la cuenta se hubiera activado.
 */
class RollbackToInvalid extends Error {
  constructor() {
    super('credential setup link: rollback');
    this.name = 'RollbackToInvalid';
  }
}

/**
 * `issueForPendingUser` del puerto (`design.md > 4.5`; R11, R15, R16).
 *
 * Primero resuelve al usuario objetivo —tiene que existir, estar VIVO y seguir en `pending`— y
 * solo entonces, en la misma transaccion, mata el enlace vivo anterior e inserta el nuevo.
 *
 * **El ambito por empresa vive aqui, no en el dominio**: cuando `companyId` llega —el reenvio lo
 * pasa SIEMPRE— se anade `company_id` al `where`, que es lo que hace cierto R15 sin que el caso de
 * uso tenga que acordarse. El alta pasa `null`: acaba de crear la fila con la empresa del actor y
 * no hay nada que reacotar.
 *
 * **`'not_found'` es deliberadamente indistinguible** entre «no existe», «esta borrado» y «es de
 * otra empresa» (R15, mismo criterio que QC-66 R33 y R34): no revela que existe.
 *
 * Devuelve el CORREO del destinatario, leido de la base, para que la direccion no pueda llegar del
 * llamante (`design.md > 6.2`).
 */
export async function issueForPendingUser(input: {
  userId: string;
  companyId: string | null;
  digest: string;
  expiresAt: Date;
  now: Date;
}): Promise<IssueOutcome | { readonly email: string }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: {
        id: input.userId,
        deletedAt: null,
        ...(input.companyId === null ? {} : { companyId: input.companyId }),
      },
      select: { email: true, accountStatus: true },
    });

    if (user === null) return 'not_found';
    if (user.accountStatus !== PENDING_ACCOUNT_STATUS) return 'user_not_pending';

    // 1. Muere el anterior (R11, R16). `updateMany` y ningun `count` que mirar: que hubiera cero o
    //    uno no cambia nada, y quien garantiza que no queden DOS vivos es el indice parcial.
    await tx.credentialSetupToken.updateMany({
      where: { userId: input.userId, consumedAt: null, supersededAt: null },
      data: { supersededAt: input.now },
    });

    // 2. Nace el nuevo. Se guarda la HUELLA, nunca el secreto (R9).
    try {
      await tx.credentialSetupToken.create({
        data: {
          userId: input.userId,
          tokenDigest: input.digest,
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      // La carrera de R11: otra emision simultanea gano y su fila viva hace fallar este `INSERT`
      // con `23505`. El `INSERT` fallido ABORTA la transaccion en Postgres, asi que la sustitucion
      // del paso 1 tampoco se confirma y el enlace de la ganadora sigue VIVO — que es justo lo que
      // se quiere. Contra Postgres real lo confirma la integracion de T20.
      if (isUniqueViolation(error)) return 'superseded';
      throw error;
    }

    return { email: user.email };
  });
}

/**
 * `applyCredentialAndActivate` del puerto (`design.md > 4.6`; R12, R19, R20, R22).
 *
 * Los dos `UPDATE` van en **SQL crudo** porque los dos necesitan algo que la API de Prisma no
 * expresa: el primero, `RETURNING user_id` sobre una actualizacion condicional; el segundo, el
 * `NULL` explicito del autor junto al casteo del enum. Es el mismo motivo por el que
 * `lockActiveAdministratorIds` usa `$queryRaw`. Los valores van SIEMPRE como parametros del
 * `Prisma.sql`, nunca interpolados: no se construye SQL por concatenacion.
 *
 * **`must_change_credential` NO se toca (R21).** No aparece en el `SET` y no aparece en este
 * archivo: la marca con la que la cuenta nacio se queda como esta mientras la pregunta abierta P3
 * de `requirements.md` siga sin cerrar. Cerrarla seria anadir una columna a ESTE `SET`.
 */
export async function applyCredentialAndActivate(input: {
  digest: string;
  credentialHash: string;
  now: Date;
}): Promise<ApplyOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Compare-and-set ATOMICO del consumo (R12, R20): de dos usos simultaneos del mismo
      //    secreto, solo el primero ve `consumed_at IS NULL`; el segundo recibe 0 filas. Las
      //    cuatro condiciones juntas son los cuatro primeros casos de R22 —no existe, caducado,
      //    consumido, sustituido— y los cuatro salen por la MISMA puerta.
      const consumed = await tx.$queryRaw<ReadonlyArray<{ user_id: string }>>(Prisma.sql`
        UPDATE "credential_setup_tokens"
           SET "consumed_at" = ${input.now}
         WHERE "token_digest" = ${input.digest}
           AND "consumed_at" IS NULL
           AND "superseded_at" IS NULL
           AND "expires_at" > ${input.now}
        RETURNING "user_id"
      `);

      const userId = consumed[0]?.user_id;
      // Nada que revertir: el `UPDATE` no toco ninguna fila.
      if (userId === undefined) return 'invalid';

      // 2. La credencial y la activacion, con su propia condicion (R19). Si entre el correo y el
      //    clic el administrador borro al usuario, lo bloqueo o lo activo, el `WHERE` no encaja y
      //    la transaccion revierte ENTERA: el enlace no queda consumido, pero tampoco sirve, y la
      //    respuesta es la misma `'invalid'` de R22.
      //
      //    `account_status_changed_by = NULL` es el `NULL` de QC-65 R10: «lo cambio el sistema, no
      //    una persona». Aqui no hay actor ni sesion (R18).
      const activated = await tx.$executeRaw(Prisma.sql`
        UPDATE "users"
           SET "password_hash" = ${input.credentialHash},
               "account_status" = ${ACTIVE_ACCOUNT_STATUS}::"UserAccountStatus",
               "account_status_changed_at" = ${input.now},
               "account_status_changed_by" = NULL
         WHERE "id" = ${userId}::uuid
           AND "deleted_at" IS NULL
           AND "account_status" = ${PENDING_ACCOUNT_STATUS}::"UserAccountStatus"
      `);

      if (activated === 0) throw new RollbackToInvalid();

      return 'ok';
    });
  } catch (error) {
    if (error instanceof RollbackToInvalid) return 'invalid';
    throw error;
  }
}
