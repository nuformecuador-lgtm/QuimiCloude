import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { WhatsappConnectionExistsError, WhatsappPhoneNumberTakenError } from '../../../domain/errors';

import { companyScopeColumns, whatsappConnectionCompanyScope } from './company-scope';

import type { IntegracionesScope } from '../../../domain/integraciones-scope';
import type { WhatsappConnectionRecord } from '../../../domain/whatsapp-connection';
import type {
  NewWhatsappConnectionRow,
  WhatsappConnectionPatch,
} from '../../../ports/whatsapp-connection-repository';

/** Exactamente los campos de `WhatsappConnectionRecord`: ni la auditoría ni `deleted_at` salen. */
const CONNECTION_SELECT = {
  id: true,
  companyId: true,
  origin: true,
  displayName: true,
  metaAppId: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  verifiedName: true,
  accessTokenEnc: true,
  appSecretEnc: true,
  verifyTokenHash: true,
  status: true,
  lastError: true,
  lastCheckedAt: true,
  lastWebhookAt: true,
} satisfies Prisma.WhatsappConnectionSelect;

type ConnectionRow = Prisma.WhatsappConnectionGetPayload<{ select: typeof CONNECTION_SELECT }>;

function toRecord(row: ConnectionRow): WhatsappConnectionRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    origin: row.origin,
    displayName: row.displayName,
    metaAppId: row.metaAppId,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    accessTokenEnc: row.accessTokenEnc,
    appSecretEnc: row.appSecretEnc,
    verifyTokenHash: row.verifyTokenHash,
    status: row.status,
    lastError: row.lastError,
    lastCheckedAt: row.lastCheckedAt,
    lastWebhookAt: row.lastWebhookAt,
  };
}

/**
 * Los dos índices únicos parciales viven solo en la migración. Se reconocen por el nombre o por
 * las columnas: `meta.target` trae una u otra forma según el índice (`user-admin-prisma.ts`,
 * `work-group-prisma.ts`). Las columnas se comparan enteras porque `company_id` también está en la
 * clave candidata `(company_id, id)`.
 */
const COMPANY_LIVE_INDEX = 'whatsapp_connections_company_live_key';
const PHONE_LIVE_INDEX = 'whatsapp_connections_phone_number_id_live_key';

function targetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) {
    return target.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function isOnlyColumn(targets: readonly string[], column: string): boolean {
  return targets.length === 1 && targets[0] === column;
}

/** Cualquier otra violación, o una que no se puede inspeccionar, se propaga tal cual. */
function translateUniqueViolation(error: unknown): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return error;
  }
  const targets = targetsOf(error);
  if (targets.some((target) => target.includes(PHONE_LIVE_INDEX)) || isOnlyColumn(targets, 'phone_number_id')) {
    return new WhatsappPhoneNumberTakenError();
  }
  if (targets.some((target) => target.includes(COMPANY_LIVE_INDEX)) || isOnlyColumn(targets, 'company_id')) {
    return new WhatsappConnectionExistsError();
  }
  return error;
}

export async function findLiveWhatsappConnection(
  scope: IntegracionesScope,
): Promise<WhatsappConnectionRecord | null> {
  const row = await prisma.whatsappConnection.findFirst({
    where: { deletedAt: null, ...whatsappConnectionCompanyScope(scope) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: CONNECTION_SELECT,
  });
  return row === null ? null : toRecord(row);
}

export async function findLiveWhatsappConnectionById(
  id: string,
  scope: IntegracionesScope,
): Promise<WhatsappConnectionRecord | null> {
  const row = await prisma.whatsappConnection.findFirst({
    where: { id, deletedAt: null, ...whatsappConnectionCompanyScope(scope) },
    select: CONNECTION_SELECT,
  });
  return row === null ? null : toRecord(row);
}

export async function insertWhatsappConnection(
  row: NewWhatsappConnectionRow,
  scope: IntegracionesScope,
): Promise<WhatsappConnectionRecord> {
  try {
    const created = await prisma.whatsappConnection.create({
      data: {
        ...companyScopeColumns(scope),
        id: row.id,
        origin: row.origin,
        displayName: row.displayName,
        metaAppId: row.metaAppId,
        wabaId: row.wabaId,
        phoneNumberId: row.phoneNumberId,
        displayPhoneNumber: row.displayPhoneNumber,
        verifiedName: row.verifiedName,
        accessTokenEnc: row.accessTokenEnc,
        appSecretEnc: row.appSecretEnc,
        verifyTokenHash: row.verifyTokenHash,
        status: row.status,
        lastError: row.lastError,
        lastCheckedAt: row.lastCheckedAt,
        createdById: row.createdById,
      },
      select: CONNECTION_SELECT,
    });
    return toRecord(created);
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

/** `null` si la fila no existe, está borrada o es de otra empresa: el `where` lo decide, no un `if`. */
export async function updateLiveWhatsappConnection(
  id: string,
  patch: WhatsappConnectionPatch,
  scope: IntegracionesScope,
): Promise<WhatsappConnectionRecord | null> {
  let count: number;
  try {
    ({ count } = await prisma.whatsappConnection.updateMany({
      where: { id, deletedAt: null, ...whatsappConnectionCompanyScope(scope) },
      data: {
        displayName: patch.displayName,
        metaAppId: patch.metaAppId,
        wabaId: patch.wabaId,
        phoneNumberId: patch.phoneNumberId,
        displayPhoneNumber: patch.displayPhoneNumber,
        verifiedName: patch.verifiedName,
        accessTokenEnc: patch.accessTokenEnc,
        appSecretEnc: patch.appSecretEnc,
        verifyTokenHash: patch.verifyTokenHash,
        status: patch.status,
        lastError: patch.lastError,
        lastCheckedAt: patch.lastCheckedAt,
      },
    }));
  } catch (error) {
    throw translateUniqueViolation(error);
  }
  return count === 0 ? null : findLiveWhatsappConnectionById(id, scope);
}
