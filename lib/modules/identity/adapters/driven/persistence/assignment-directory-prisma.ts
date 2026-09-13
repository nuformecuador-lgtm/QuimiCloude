// lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma.ts
/**
 * QC-87 T3 — La implementacion Prisma de los DOS contratos que `identity` publica para que otro
 * modulo pueda asignar responsables sin tocar sus tablas: `PeopleDirectory` y `WorkGroupDirectory`
 * (`design.md > 2.2`, R6, R19, R20, R21, R25, R37).
 *
 * **UN archivo para las dos interfaces, y no dos.** Comparten el mismo filtro de empresa, la misma
 * proyeccion de persona y —sobre todo— la MISMA traduccion del estado de cuenta. Partirlos
 * invitaria a que la segunda copia de esa traduccion naciera en el archivo de al lado, que es
 * exactamente lo que R21 prohibe.
 *
 * LO QUE ESTE ARCHIVO **NO** HACE, y es el corazon de R21: no escribe ninguna definicion propia de
 * «cuenta activa».
 *
 *   - Quien dice quien es miembro vivo del grupo es **`listMembersAliveInCompany`**, el metodo del
 *     repositorio de QC-84 que ya alimenta la pantalla de miembros. Reutilizarlo es lo que hace que
 *     «a quien se asigna al aplicar el grupo» y «a quien se ve en esa pantalla» sean la misma lista
 *     **por construccion** (decision 3: nadie pulsa 5 y obtiene otra cosa).
 *   - Quien dice si esa cuenta esta activa es **`effectiveAccountStatus(view, now)`**, la unica
 *     funcion por la que pasan todos los lectores del estado de una cuenta (QC-78 R7).
 *
 * Un `WHERE account_status = 'active'` a secas estaria MAL de las dos maneras: dejaria entrar a una
 * cuenta bloqueada por la politica de intentos que sigue diciendo `active` en la columna (QC-78
 * R11) y dejaria fuera a una bloqueada cuyo plazo ya vencio (QC-78 R8). Por eso el estado se
 * traduce **en memoria** con el reloj, y por eso `now` entra siempre **por parametro**: aqui no hay
 * ni un `new Date()`.
 *
 * Un adaptador driven PUEDE apoyarse en otro driven de su propio modulo (`guard-arquitectura-
 * modulos`, bloque 7, excepcion de QC-9) y PUEDE importar el `domain/` de su propio modulo:
 * ninguna de las dos cosas rompe la regla de dependencias.
 */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { listMembersAliveInCompany } from './work-group-prisma';

import { buildDisplayName } from '../../../domain/display-name';
import { effectiveAccountStatus } from '../../../domain/effective-account-status';

import type { AccountStatusView } from '../../../domain/effective-account-status';
import type { PeopleDirectory, PersonRef } from '../../../domain/people-directory';
import type { WorkGroupDirectory, WorkGroupSnapshot } from '../../../domain/work-group-directory';

// ---------------------------------------------------------------------------------------------
// La proyeccion: columnas ENUMERADAS
// ---------------------------------------------------------------------------------------------

/**
 * Exactamente lo que `PersonRef` necesita: los tres campos que consume `buildDisplayName` y los
 * DOS que consume `effectiveAccountStatus`. Ni correo, ni documento, ni rol, ni `passwordHash`:
 * lo que no esta en esta lista no puede escaparse a un payload del navegador.
 *
 * Es la misma forma que `MEMBER_CANDIDATE_SELECT` de `work-group-prisma.ts` y **no se reutiliza a
 * proposito**: aquel es la proyeccion del puerto de grupos y este es la de este contrato; atarlos
 * haria que cambiar uno moviera el otro sin quererlo.
 */
const PERSON_REF_SELECT = {
  id: true,
  firstNames: true,
  lastNames: true,
  username: true,
  accountStatus: true,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

type PersonRefPayload = Prisma.UserGetPayload<{ select: typeof PERSON_REF_SELECT }>;

/**
 * «Esta cuenta cuenta como activa AHORA». Una sola linea, un solo sitio y una sola llamada: la
 * traduccion es de `effectiveAccountStatus`, y este archivo solo compara su resultado con el
 * literal del catalogo de QC-65.
 *
 * El parametro es `AccountStatusView` —el tipo que esa funcion declara—, asi que sirve igual para
 * la fila que devuelve Prisma y para el `MemberCandidate` que devuelve el puerto de grupos: las
 * dos lo satisfacen estructuralmente, y **no hay dos filtros**, hay uno.
 */
function isEffectivelyActive(account: AccountStatusView, now: Date): boolean {
  return effectiveAccountStatus(account, now) === 'active';
}

/**
 * Fila -> `PersonRef`. Las dos reglas que aplica —como se compone el nombre y que significa el
 * estado de la cuenta AHORA— son las del dominio; aqui no se decide ninguna.
 */
function toPersonRef(row: PersonRefPayload, now: Date): PersonRef {
  return {
    id: row.id,
    displayName: buildDisplayName(row.firstNames, row.lastNames, row.username),
    isActive: isEffectivelyActive(row, now),
  };
}

// ---------------------------------------------------------------------------------------------
// `PeopleDirectory`
// ---------------------------------------------------------------------------------------------

/**
 * Las personas VIVAS de la empresa (R6). El `where` lleva SIEMPRE los tres filtros —los
 * identificadores pedidos, la empresa y `deleted_at IS NULL`—, asi que «no existe», «esta de baja»
 * y «es de otra empresa» acaban los tres en lo mismo: la fila no vuelve.
 *
 * La lista vacia se corta antes de la consulta: un `IN ()` no tiene ninguna respuesta que dar.
 */
export async function findAliveRefsInCompany(
  companyId: string,
  ids: readonly string[],
  now: Date,
): Promise<readonly PersonRef[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.user.findMany({
    where: { id: { in: [...ids] }, companyId, deletedAt: null },
    select: PERSON_REF_SELECT,
  });

  return rows.map((row) => toPersonRef(row, now));
}

/**
 * Lo mismo **sin** el filtro de baja (R37): una persona dada de baja, inactiva o bloqueada sigue
 * siendo responsable de los pedidos a los que se la asigno, y la consulta tiene que devolverla.
 *
 * El filtro de EMPRESA no se relaja (R7): que la fila de baja vuelva no es excusa para devolver
 * una persona ajena.
 */
export async function findRefsIncludingDeletedInCompany(
  companyId: string,
  ids: readonly string[],
  now: Date,
): Promise<readonly PersonRef[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.user.findMany({
    where: { id: { in: [...ids] }, companyId },
    select: PERSON_REF_SELECT,
  });

  return rows.map((row) => toPersonRef(row, now));
}

// ---------------------------------------------------------------------------------------------
// `WorkGroupDirectory`
// ---------------------------------------------------------------------------------------------

/**
 * La foto del grupo (R19, R20, R21, R25).
 *
 * Dos pasos, y el segundo NO es una consulta escrita aqui:
 *
 *   1. El grupo VIVO de la empresa, del que sale el nombre que se va a congelar. Inexistente, dado
 *      de baja o de otra empresa -> `null`, los tres el mismo caso (R25).
 *   2. `listMembersAliveInCompany` —el metodo de QC-84— y el filtro del estado EFECTIVO en
 *      memoria. `'not_found'` aqui solo puede venir de que el grupo desapareciera entre los dos
 *      pasos; se trata como `null`, que es lo que el contrato promete.
 *
 * El orden de `activeMemberIds` es el que pone el SQL de QC-84 (`last_names, first_names, id`) y
 * filtrar lo CONSERVA: la composicion determinista de R24 se apoya en el.
 */
export async function findSnapshotAliveInCompany(
  companyId: string,
  workGroupId: string,
  now: Date,
): Promise<WorkGroupSnapshot | null> {
  const group = await prisma.workGroup.findFirst({
    where: { id: workGroupId, companyId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (group === null) return null;

  const members = await listMembersAliveInCompany(companyId, group.id);
  if (members === 'not_found') return null;

  return {
    id: group.id,
    name: group.name,
    activeMemberIds: members
      .filter((member) => isEffectivelyActive(member, now))
      .map((member) => member.id),
  };
}

/**
 * El objeto que `lib/composition` cablea (R47). Se declara con el tipo de las DOS interfaces para
 * que quitar un metodo —o cambiarle la firma— no compile, en vez de romper en produccion.
 */
export const assignmentDirectoryPrisma: PeopleDirectory & WorkGroupDirectory = {
  findAliveRefsInCompany,
  findRefsIncludingDeletedInCompany,
  findSnapshotAliveInCompany,
};
