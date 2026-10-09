// Autorizacion de los seis casos de uso de la conexion de WhatsApp. Los puertos son dobles que
// FALLAN SI LOS LLAMAN: no basta con que la operacion lance, tiene que lanzar sin tocar nada.

import { describe, expect, it, vi } from 'vitest'

import type { Actor } from '@/lib/modules/integraciones/domain/actor'
import { createCreateWhatsappConnection } from '@/lib/modules/integraciones/domain/create-whatsapp-connection'
import { UnauthorizedError } from '@/lib/modules/integraciones/domain/errors'
import { createGetWhatsappConnection } from '@/lib/modules/integraciones/domain/get-whatsapp-connection'
import { createRegenerateWhatsappVerifyToken } from '@/lib/modules/integraciones/domain/regenerate-whatsapp-verify-token'
import { createSetWhatsappConnectionEnabled } from '@/lib/modules/integraciones/domain/set-whatsapp-connection-enabled'
import { createTestWhatsappConnection } from '@/lib/modules/integraciones/domain/test-whatsapp-connection'
import { createUpdateWhatsappConnection } from '@/lib/modules/integraciones/domain/update-whatsapp-connection'
import type { RandomSource } from '@/lib/modules/integraciones/ports/random-source'
import type { SecretCipher } from '@/lib/modules/integraciones/ports/secret-cipher'
import type { SecretDigest } from '@/lib/modules/integraciones/ports/secret-digest'
import type { WhatsappConnectionRepository } from '@/lib/modules/integraciones/ports/whatsapp-connection-repository'
import type { WhatsappGraphClient } from '@/lib/modules/integraciones/ports/whatsapp-graph-client'

import {
  ACTOR_ID,
  COMPANY_ID,
  CONNECTION_ID,
  OTHER_COMPANY_ID,
  admin,
  makeCipher,
  makeDigest,
  makeGraph,
  makeRandom,
  makeRepository,
  storedConnection,
  validCreateInput,
} from './whatsapp-doubles'

function explodingDeps() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no debe llamarse sin autorizacion`)
    })
  const connections = {
    findLive: explota('connections.findLive'),
    findLiveById: explota('connections.findLiveById'),
    create: explota('connections.create'),
    update: explota('connections.update'),
  }
  const graph = { fetchPhoneNumber: explota('graph.fetchPhoneNumber') }
  const cipher = { encrypt: explota('cipher.encrypt'), decrypt: explota('cipher.decrypt') }
  const digest = { digestOf: explota('digest.digestOf'), matches: explota('digest.matches') }
  const random = { newId: explota('random.newId'), newVerifyToken: explota('random.newVerifyToken') }
  return {
    deps: {
      connections: connections as unknown as WhatsappConnectionRepository,
      graph: graph as unknown as WhatsappGraphClient,
      cipher: cipher as unknown as SecretCipher,
      digest: digest as unknown as SecretDigest,
      random: random as unknown as RandomSource,
      now: explota('now') as unknown as () => Date,
    },
    espias: [
      ...Object.values(connections),
      ...Object.values(graph),
      ...Object.values(cipher),
      ...Object.values(digest),
      ...Object.values(random),
    ],
  }
}

type Invocacion = (actor: Actor | null | undefined, deps: ReturnType<typeof explodingDeps>['deps']) => Promise<unknown>

// Entradas basura a proposito: el permiso se comprueba antes de validar.
const OPERACIONES: ReadonlyArray<[string, Invocacion]> = [
  ['consultar', (actor, deps) => createGetWhatsappConnection(deps)(actor)],
  ['crear', (actor, deps) => createCreateWhatsappConnection(deps)({ basura: true }, actor)],
  ['editar', (actor, deps) => createUpdateWhatsappConnection(deps)('no-es-uuid', 42, actor)],
  ['probar', (actor, deps) => createTestWhatsappConnection(deps)(CONNECTION_ID, actor)],
  ['deshabilitar', (actor, deps) => createSetWhatsappConnectionEnabled(deps)(CONNECTION_ID, false, actor)],
  ['habilitar', (actor, deps) => createSetWhatsappConnectionEnabled(deps)(CONNECTION_ID, true, actor)],
  ['regenerar verify token', (actor, deps) => createRegenerateWhatsappVerifyToken(deps)(CONNECTION_ID, actor)],
]

const ACTORES_SIN_ACCESO: ReadonlyArray<[string, Actor | null | undefined]> = [
  ['actor nulo (sin sesion)', null],
  ['actor indefinido', undefined],
  ['sin empresa', { id: ACTOR_ID, companyId: '', permissions: ['integraciones.modificar'] }],
  ['sin permisos', { id: ACTOR_ID, companyId: COMPANY_ID, permissions: [] }],
  ['con otro permiso', { id: ACTOR_ID, companyId: COMPANY_ID, permissions: ['clientes.modificar'] }],
]

describe('autorizacion de los casos de uso de la conexion de WhatsApp', () => {
  for (const [operacion, invocar] of OPERACIONES) {
    for (const [quien, actor] of ACTORES_SIN_ACCESO) {
      it(`R1: ${operacion} con ${quien} rechaza con unauthorized sin tocar ningun puerto`, async () => {
        const { deps, espias } = explodingDeps()
        const promesa = invocar(actor, deps)
        await expect(promesa).rejects.toBeInstanceOf(UnauthorizedError)
        await expect(promesa).rejects.toMatchObject({ code: 'unauthorized' })
        for (const espia of espias) expect(espia).not.toHaveBeenCalled()
      })
    }
  }
})

describe('ambito de empresa', () => {
  it('R2: crear usa la empresa del actor aunque la entrada traiga otro companyId', async () => {
    const repo = makeRepository()
    const { cipher, encrypt } = makeCipher()
    const create = createCreateWhatsappConnection({
      connections: repo.connections,
      graph: makeGraph().graph,
      cipher,
      digest: makeDigest(),
      random: makeRandom(),
      now: () => new Date(),
    })

    await create(validCreateInput({ companyId: OTHER_COMPANY_ID }), admin())

    expect(repo.findLive).toHaveBeenCalledWith({ companyId: COMPANY_ID })
    expect(repo.create.mock.calls[0]?.[1]).toEqual({ companyId: COMPANY_ID })
    expect(repo.create.mock.calls[0]?.[0]).not.toHaveProperty('companyId')
    for (const [, context] of encrypt.mock.calls) expect(context.companyId).toBe(COMPANY_ID)
  })

  it('R2: consultar, editar, probar, habilitar y regenerar filtran por la empresa del actor', async () => {
    const { cipher, seed } = makeCipher()
    const repo = makeRepository([storedConnection(seed, { status: 'DISABLED' })])
    const deps = {
      connections: repo.connections,
      graph: makeGraph().graph,
      cipher,
      digest: makeDigest(),
      random: makeRandom(),
    }

    await createGetWhatsappConnection(deps)(admin())
    await createUpdateWhatsappConnection(deps)(CONNECTION_ID, validCreateInput({ accessToken: '', appSecret: '' }), admin())
    await createSetWhatsappConnectionEnabled(deps)(CONNECTION_ID, true, admin())
    await createTestWhatsappConnection(deps)(CONNECTION_ID, admin())
    await createRegenerateWhatsappVerifyToken(deps)(CONNECTION_ID, admin())

    const scopes = [
      ...repo.findLive.mock.calls.map((call) => call[0]),
      ...repo.findLiveById.mock.calls.map((call) => call[1]),
      ...repo.update.mock.calls.map((call) => call[2]),
    ]
    expect(scopes.length).toBeGreaterThan(5)
    for (const scope of scopes) expect(scope).toEqual({ companyId: COMPANY_ID })
  })
})

describe('consultar la conexion', () => {
  it('R2: devuelve la vista de la conexion viva de la empresa del actor, o null si no tiene', async () => {
    const { seed } = makeCipher()
    const repo = makeRepository([storedConnection(seed, { companyId: OTHER_COMPANY_ID })])
    const get = createGetWhatsappConnection({ connections: repo.connections })
    expect(await get(admin())).toBeNull()
    expect(await get(admin({ companyId: OTHER_COMPANY_ID }))).toMatchObject({ id: CONNECTION_ID })
  })
})
