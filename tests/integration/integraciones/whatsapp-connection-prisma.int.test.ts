// El repositorio de conexiones de WhatsApp contra Postgres REAL.
//
// Aislamiento: `commit`. Las funciones de `whatsapp-connection-prisma.ts` usan el cliente Prisma
// GLOBAL, no un `tx` inyectado, y R6 necesita dos altas concurrentes de verdad: una transaccion de
// test con ROLLBACK seria aislamiento de mentira. Cada empresa efimera (empresa, rol, tipo de
// documento, usuario) y sus conexiones se borran en `afterAll`, en el orden de las FK, y se
// afirma contando que no queda ninguna conexion de esas empresas.

import { randomBytes, randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { secretCipherAesGcm } from '@/lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm'
import { secretDigestSha256 } from '@/lib/modules/integraciones/adapters/driven/security/secret-digest-sha256'
import { randomSourceNode } from '@/lib/modules/integraciones/adapters/driven/security/random-source-node'
import { whatsappGraphClientCanned } from '@/lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned'
import {
  findLiveWhatsappConnection,
  findLiveWhatsappConnectionById,
  insertWhatsappConnection,
  updateLiveWhatsappConnection,
} from '@/lib/modules/integraciones/adapters/driven/persistence/whatsapp-connection-prisma'
import { createCreateWhatsappConnection } from '@/lib/modules/integraciones/domain/create-whatsapp-connection'
import {
  WhatsappConnectionExistsError,
  WhatsappPhoneNumberTakenError,
} from '@/lib/modules/integraciones/domain/errors'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

import type { IntegracionesScope } from '@/lib/modules/integraciones/domain/integraciones-scope'
import type { NewWhatsappConnectionRow } from '@/lib/modules/integraciones/ports/whatsapp-connection-repository'
import type { WhatsappConnectionRepository } from '@/lib/modules/integraciones/ports/whatsapp-connection-repository'

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

type Empresa = {
  readonly companyId: string
  readonly userId: string
  readonly roleId: string
  readonly documentTypeCode: string
  readonly scope: IntegracionesScope
}

const empresas: Empresa[] = []

async function crearEmpresa(): Promise<Empresa> {
  const marker = token()
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const companyName = `Empresa whatsapp ${marker}`
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  })
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  })
  const empresa: Empresa = {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    scope: { companyId: company.id },
  }
  empresas.push(empresa)
  return empresa
}

function nuevaFila(empresa: Empresa, overrides: Partial<NewWhatsappConnectionRow> = {}): NewWhatsappConnectionRow {
  return {
    id: randomUUID(),
    origin: 'MANUAL',
    displayName: 'Ventas',
    metaAppId: `app-${token()}`,
    wabaId: `waba-${token()}`,
    phoneNumberId: `phone-${token()}`,
    displayPhoneNumber: '+57 300 1234567',
    verifiedName: 'Empresa Verificada',
    accessTokenEnc: 'v1:valor-cifrado-de-prueba',
    appSecretEnc: 'v1:otro-valor-cifrado',
    verifyTokenHash: 'a'.repeat(64),
    status: 'PENDING',
    lastError: null,
    lastCheckedAt: new Date('2026-10-09T12:00:00.000Z'),
    createdById: empresa.userId,
    ...overrides,
  }
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('se esperaba un error y no se lanzo')
}

const ENCRYPTION_VARS = ['INTEGRATIONS_ENCRYPTION_KEYS', 'INTEGRATIONS_ENCRYPTION_ACTIVE'] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const name of ENCRYPTION_VARS) savedEnv[name] = process.env[name]
  process.env.INTEGRATIONS_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64')}`
  process.env.INTEGRATIONS_ENCRYPTION_ACTIVE = 'v1'
})

afterAll(async () => {
  for (const name of ENCRYPTION_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name]
    else process.env[name] = savedEnv[name]
  }
  const ids = empresas.map((empresa) => empresa.companyId)
  await prisma.whatsappConnection.deleteMany({ where: { companyId: { in: ids } } })
  expect(await prisma.whatsappConnection.count({ where: { companyId: { in: ids } } })).toBe(0)
  for (const empresa of empresas) {
    await prisma.user.delete({ where: { id: empresa.userId } })
    await prisma.role.delete({ where: { id: empresa.roleId } })
    await prisma.documentType.delete({ where: { code: empresa.documentTypeCode } })
    await prisma.company.delete({ where: { id: empresa.companyId } })
  }
  await prisma.$disconnect()
})

describe('R5: la tabla tiene RLS activada y forzada', () => {
  it('R5 — pg_class marca whatsapp_connections con relrowsecurity y relforcerowsecurity', async () => {
    const rows = await prisma.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE relname = 'whatsapp_connections' AND relnamespace = 'public'::regnamespace`
    expect(rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])
  })

  it('R5 — company_id es obligatorio en la columna', async () => {
    const rows = await prisma.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'whatsapp_connections' AND column_name = 'company_id'`
    expect(rows).toEqual([{ is_nullable: 'NO' }])
  })
})

describe('R2: la empresa sale del ambito, nunca de la fila', () => {
  it('R2 — el alta queda en la empresa del ambito aunque la fila traiga otra empresa', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const fila = { ...nuevaFila(a), companyId: b.companyId } as NewWhatsappConnectionRow

    const creada = await insertWhatsappConnection(fila, a.scope)

    expect(creada.companyId).toBe(a.companyId)
    const guardada = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: fila.id } })
    expect(guardada.companyId).toBe(a.companyId)
    expect(await findLiveWhatsappConnection(b.scope)).toBeNull()
  })

  it('R2 — findLive devuelve la conexion viva de la empresa y la fila completa del puerto', async () => {
    const a = await crearEmpresa()
    const fila = nuevaFila(a)
    await insertWhatsappConnection(fila, a.scope)

    const leida = await findLiveWhatsappConnection(a.scope)
    expect(leida).toEqual({
      ...fila,
      companyId: a.companyId,
      createdById: undefined,
      lastWebhookAt: null,
    })
  })
})

describe('R3: otra empresa, inexistente o borrada se ven igual', () => {
  it('R3 — la empresa B no lee ni actualiza la conexion de A, y la fila de A no cambia', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const fila = nuevaFila(a)
    await insertWhatsappConnection(fila, a.scope)
    const antes = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: fila.id } })

    expect(await findLiveWhatsappConnectionById(fila.id, b.scope)).toBeNull()
    expect(
      await updateLiveWhatsappConnection(fila.id, { displayName: 'Robada', status: 'DISABLED' }, b.scope),
    ).toBeNull()

    const despues = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: fila.id } })
    expect(despues).toEqual(antes)
  })

  it('R3 — un id inexistente da null al leer y al actualizar', async () => {
    const a = await crearEmpresa()
    expect(await findLiveWhatsappConnectionById(randomUUID(), a.scope)).toBeNull()
    expect(await updateLiveWhatsappConnection(randomUUID(), { displayName: 'X' }, a.scope)).toBeNull()
  })

  it('R3 — una conexion borrada no se lee ni se actualiza, ni aparece en findLive', async () => {
    const a = await crearEmpresa()
    const fila = nuevaFila(a)
    await insertWhatsappConnection(fila, a.scope)
    await prisma.whatsappConnection.update({ where: { id: fila.id }, data: { deletedAt: new Date() } })

    expect(await findLiveWhatsappConnectionById(fila.id, a.scope)).toBeNull()
    expect(await findLiveWhatsappConnection(a.scope)).toBeNull()
    expect(await updateLiveWhatsappConnection(fila.id, { displayName: 'X' }, a.scope)).toBeNull()
    const guardada = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: fila.id } })
    expect(guardada.displayName).toBe('Ventas')
  })

  it('R3 — en su empresa, update cambia solo lo del parche y devuelve la fila releida', async () => {
    const a = await crearEmpresa()
    const fila = nuevaFila(a)
    await insertWhatsappConnection(fila, a.scope)

    const actualizada = await updateLiveWhatsappConnection(
      fila.id,
      { displayName: 'Soporte', status: 'ERROR', lastError: 'fallo' },
      a.scope,
    )
    expect(actualizada).toMatchObject({
      id: fila.id,
      displayName: 'Soporte',
      status: 'ERROR',
      lastError: 'fallo',
      accessTokenEnc: fila.accessTokenEnc,
      appSecretEnc: fila.appSecretEnc,
      phoneNumberId: fila.phoneNumberId,
    })
  })
})

describe('R6: una sola conexion viva por empresa', () => {
  it('R6 — una segunda alta viva en la misma empresa da whatsapp_connection_exists', async () => {
    const a = await crearEmpresa()
    await insertWhatsappConnection(nuevaFila(a), a.scope)

    const error = await errorOf(insertWhatsappConnection(nuevaFila(a), a.scope))
    expect(error).toBeInstanceOf(WhatsappConnectionExistsError)
    expect(await prisma.whatsappConnection.count({ where: { companyId: a.companyId } })).toBe(1)
  })

  it('R6 — dos altas concurrentes acaban en una fila y un whatsapp_connection_exists', async () => {
    const a = await crearEmpresa()
    const resultados = await Promise.allSettled([
      insertWhatsappConnection(nuevaFila(a), a.scope),
      insertWhatsappConnection(nuevaFila(a), a.scope),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rechazos).toHaveLength(1)
    expect(rechazos[0]?.reason).toBeInstanceOf(WhatsappConnectionExistsError)
    expect(await prisma.whatsappConnection.count({ where: { companyId: a.companyId } })).toBe(1)
  })

  it('R6 — con la anterior borrada, la empresa puede dar de alta otra', async () => {
    const a = await crearEmpresa()
    const vieja = nuevaFila(a)
    await insertWhatsappConnection(vieja, a.scope)
    await prisma.whatsappConnection.update({ where: { id: vieja.id }, data: { deletedAt: new Date() } })

    await expect(insertWhatsappConnection(nuevaFila(a), a.scope)).resolves.toBeTruthy()
  })
})

describe('R7: un phone_number_id vivo en una sola conexion de cualquier empresa', () => {
  it('R7 — el mismo numero en otra empresa da whatsapp_phone_number_taken sin nombrar la empresa', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const filaA = nuevaFila(a)
    await insertWhatsappConnection(filaA, a.scope)

    const error = await errorOf(
      insertWhatsappConnection(nuevaFila(b, { phoneNumberId: filaA.phoneNumberId }), b.scope),
    )
    expect(error).toBeInstanceOf(WhatsappPhoneNumberTakenError)
    expect(String((error as Error).message)).not.toContain(a.companyId)
    expect(await prisma.whatsappConnection.count({ where: { companyId: b.companyId } })).toBe(0)
  })

  it('R7 — editar una conexion para usar un numero vivo de otra empresa da whatsapp_phone_number_taken', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const filaA = nuevaFila(a)
    const filaB = nuevaFila(b)
    await insertWhatsappConnection(filaA, a.scope)
    await insertWhatsappConnection(filaB, b.scope)

    const error = await errorOf(
      updateLiveWhatsappConnection(filaB.id, { phoneNumberId: filaA.phoneNumberId }, b.scope),
    )
    expect(error).toBeInstanceOf(WhatsappPhoneNumberTakenError)
    const guardadaB = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: filaB.id } })
    expect(guardadaB.phoneNumberId).toBe(filaB.phoneNumberId)
  })

  it('R7 — un numero de una conexion borrada se puede volver a usar', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const filaA = nuevaFila(a)
    await insertWhatsappConnection(filaA, a.scope)
    await prisma.whatsappConnection.update({ where: { id: filaA.id }, data: { deletedAt: new Date() } })

    await expect(
      insertWhatsappConnection(nuevaFila(b, { phoneNumberId: filaA.phoneNumberId }), b.scope),
    ).resolves.toBeTruthy()
  })

  it('R7 — cualquier otra violacion de unicidad (la clave primaria) se propaga sin traducir', async () => {
    const a = await crearEmpresa()
    const b = await crearEmpresa()
    const filaA = nuevaFila(a)
    await insertWhatsappConnection(filaA, a.scope)

    const error = await errorOf(insertWhatsappConnection(nuevaFila(b, { id: filaA.id }), b.scope))
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002')
  })
})

describe('R9: a la base solo llegan valores cifrados y el resumen del verify token', () => {
  it('R9 — un alta por el caso de uso guarda *_enc con prefijo v<n>: sin el texto en claro, y el resumen hex de 64', async () => {
    const a = await crearEmpresa()
    const connections: WhatsappConnectionRepository = {
      findLive: findLiveWhatsappConnection,
      findLiveById: findLiveWhatsappConnectionById,
      create: insertWhatsappConnection,
      update: updateLiveWhatsappConnection,
    }
    const create = createCreateWhatsappConnection({
      connections,
      graph: whatsappGraphClientCanned,
      cipher: secretCipherAesGcm,
      digest: secretDigestSha256,
      random: randomSourceNode,
    })
    const accessToken = `EAAG-${token()}`
    const appSecret = `secreto-${token()}`

    const result = await create(
      {
        displayName: 'Ventas',
        metaAppId: '1234567890',
        wabaId: '2345678901',
        phoneNumberId: `phone-${token()}`,
        accessToken,
        appSecret,
      },
      { id: a.userId, companyId: a.companyId, permissions: ['integraciones.modificar'] },
    )
    expect(result.status).toBe('created')
    if (result.status !== 'created') return

    const rows = await prisma.$queryRaw<
      { access_token_enc: string; app_secret_enc: string; verify_token_hash: string; row: string }[]
    >`
      SELECT access_token_enc, app_secret_enc, verify_token_hash, row_to_json(w)::text AS row
      FROM whatsapp_connections w WHERE id = ${result.connection.id}::uuid`
    const row = rows[0]
    expect(row).toBeDefined()
    if (row === undefined) return

    expect(row.access_token_enc).toMatch(/^v\d+:/)
    expect(row.app_secret_enc).toMatch(/^v\d+:/)
    expect(row.verify_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.verify_token_hash).toBe(secretDigestSha256.digestOf(result.verifyToken))
    for (const plaintext of [accessToken, appSecret, result.verifyToken]) {
      expect(row.row).not.toContain(plaintext)
    }
  })
})
