import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type {
  PresentationByName,
  PresentationId,
  PresentationRef,
} from '../../../domain/presentation-catalog';

import { presentationCompanyScope } from './company-scope';

/**
 * Implementa `PresentationCatalog['findRefs']`: el hueco que el contrato publico de
 * `inventario` deja abierto para que otro modulo pueda resolver el nombre de una presentacion,
 * SIN tocar la tabla ni el repositorio de presentacion.
 *
 * Una sola consulta, con el ambito de empresa compuesto con `presentationCompanyScope` en un
 * `AND` aparte del filtro por identificadores: una presentacion de otra empresa se resuelve
 * exactamente igual que una inexistente, simplemente no vuelve. `presentations` no tiene
 * borrado logico, asi que no hay condicion de vida que componer.
 */

type PresentationCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly content: Prisma.Decimal | null;
  readonly unitId: string;
};

/** Fila de Prisma -> `PresentationRef` del contrato publico. Funcion pura, testeable sin base. */
export function toPresentationRef(row: PresentationCatalogRow): PresentationRef {
  return {
    id: row.id,
    name: row.name,
    content: row.content === null ? null : row.content.toFixed(4),
    unitId: row.unitId,
  };
}

/**
 * La consulta real. Vive aparte de `findPresentationRefs` para que declare el `scope` con el
 * mismo tipo que el resto del modulo -`InventoryScope`, no la cadena suelta del contrato
 * publico- y lo lleve hasta `presentationCompanyScope` igual que cualquier otra lectura de
 * `inventario`.
 */
async function findScopedPresentations(
  ids: readonly PresentationId[],
  scope: InventoryScope,
): Promise<readonly PresentationCatalogRow[]> {
  return prisma.presentation.findMany({
    where: {
      AND: [presentationCompanyScope(scope), { id: { in: [...ids] } }],
    },
    select: { id: true, name: true, content: true, unitId: true },
  });
}

export async function findPresentationRefs(
  ids: readonly PresentationId[],
  companyId: string,
): Promise<readonly PresentationRef[]> {
  if (ids.length === 0) return [];

  const rows = await findScopedPresentations(ids, { companyId });

  return rows.map(toPresentationRef);
}

type PresentationByNameRow = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly unitId: string;
};

/** Fila de Prisma -> `PresentationByName` del contrato publico. Funcion pura, testeable sin base. */
export function toPresentationByName(row: PresentationByNameRow): PresentationByName {
  return { id: row.id, name: row.name, nameNormalized: row.nameNormalized, unitId: row.unitId };
}

async function findScopedPresentationsByNormalizedNames(
  names: readonly string[],
  scope: InventoryScope,
): Promise<readonly PresentationByNameRow[]> {
  return prisma.presentation.findMany({
    where: {
      AND: [presentationCompanyScope(scope), { nameNormalized: { in: [...names] } }],
    },
    select: { id: true, name: true, nameNormalized: true, unitId: true },
  });
}

export async function findPresentationsByNormalizedNames(
  names: readonly string[],
  companyId: string,
): Promise<readonly PresentationByName[]> {
  if (names.length === 0) return [];

  const rows = await findScopedPresentationsByNormalizedNames(names, { companyId });

  return rows.map(toPresentationByName);
}
