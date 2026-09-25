// Autorizacion POR PERMISO de los cinco casos de uso de `clientes` (R1-R8).
//
// `docs/architecture.md > Acceso a datos y autorizacion`: Prisma se conecta como dueno de las
// tablas y las policies de RLS no filtran ninguna consulta de esta app. La frontera real es el
// caso de uso. Por eso el puerto y el log son dobles que FALLAN SI LOS LLAMAN: no basta con que
// la operacion lance, tiene que lanzar sin haber tocado nada.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { SEED_ROLE_PERMISSIONS, ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR } from '@/lib/modules/identity'
import { createCreateCustomer } from '@/lib/modules/clientes/domain/create-customer'
import { createDeleteCustomer } from '@/lib/modules/clientes/domain/delete-customer'
import { ClientesError, UnauthorizedError } from '@/lib/modules/clientes/domain/errors'
import { createGetCustomer } from '@/lib/modules/clientes/domain/get-customer'
import { createListCustomers } from '@/lib/modules/clientes/domain/list-customers'
import { createUpdateCustomer } from '@/lib/modules/clientes/domain/update-customer'

import type { Actor } from '@/lib/modules/clientes/domain/actor'
import type { CustomerRepository } from '@/lib/modules/clientes/ports/customer-repository'
import type { ListQueryLog } from '@/lib/modules/clientes/ports/list-query-log'

const moduloDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'lib', 'modules', 'clientes')
const COMPANY_ID = '99999999-9999-4999-8999-999999999999'
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222'
const CONSULTAR = 'clientes.consultar'
const MODIFICAR = 'clientes.modificar'
const ENTRADA_VALIDA = {
  firstNames: 'Maria',
  lastNames: 'Perez',
  city: 'Bogota',
  phone: null,
  email: null,
  address: null,
}
const BASURA = { firstNames: 42, city: { no: 'es' } }

/** El puerto y el log; cada metodo explota si alguien lo llama sin autorizacion. */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no debe llamarse sin autorizacion`)
    })

  const customers = {
    create: explota('customers.create'),
    findAliveById: explota('customers.findAliveById'),
    updateAlive: explota('customers.updateAlive'),
    softDeleteAlive: explota('customers.softDeleteAlive'),
    listAlive: explota('customers.listAlive'),
  }
  const log = { ignoredFields: explota('log.ignoredFields') }

  return {
    customers: customers as unknown as CustomerRepository,
    log: log as unknown as ListQueryLog,
    espias: [...Object.values(customers), ...Object.values(log)],
  }
}

type Deps = ReturnType<typeof dobles>

type Caso = {
  readonly nombre: string
  readonly permiso: string
  readonly ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>
  readonly ejecutarConBasura: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>
}

const CASOS_DE_LECTURA: readonly Caso[] = [
  {
    nombre: 'getCustomer',
    permiso: CONSULTAR,
    ejecutar: (d, actor) => createGetCustomer({ customers: d.customers })(CUSTOMER_ID, actor),
    ejecutarConBasura: (d, actor) => createGetCustomer({ customers: d.customers })('no-es-un-uuid', actor),
  },
  {
    nombre: 'listCustomers',
    permiso: CONSULTAR,
    ejecutar: (d, actor) => createListCustomers({ customers: d.customers, log: d.log })({ page: 1 }, actor),
    ejecutarConBasura: (d, actor) =>
      createListCustomers({ customers: d.customers, log: d.log })({ page: 0 }, actor),
  },
]

const CASOS_DE_ESCRITURA: readonly Caso[] = [
  {
    nombre: 'createCustomer',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createCreateCustomer({ customers: d.customers })(ENTRADA_VALIDA, actor),
    ejecutarConBasura: (d, actor) => createCreateCustomer({ customers: d.customers })(BASURA, actor),
  },
  {
    nombre: 'updateCustomer',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createUpdateCustomer({ customers: d.customers })(CUSTOMER_ID, ENTRADA_VALIDA, actor),
    ejecutarConBasura: (d, actor) => createUpdateCustomer({ customers: d.customers })(CUSTOMER_ID, BASURA, actor),
  },
  {
    nombre: 'deleteCustomer',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createDeleteCustomer({ customers: d.customers })(CUSTOMER_ID, actor),
    ejecutarConBasura: (d, actor) => createDeleteCustomer({ customers: d.customers })('no-es-un-uuid', actor),
  },
]

const TODOS_LOS_CASOS: readonly Caso[] = [...CASOS_DE_LECTURA, ...CASOS_DE_ESCRITURA]

function actorCon(...permissions: readonly string[]): Actor {
  return { id: 'u-1', companyId: COMPANY_ID, permissions }
}

async function esperarRechazoSinTocarNada(
  caso: Caso,
  actor: Actor | null | undefined,
  etiqueta: string,
  ejecutar: Caso['ejecutar'] = caso.ejecutar,
): Promise<void> {
  const d = dobles()
  const fallo = await ejecutar(d, actor).then(() => null, (error: unknown) => error)

  expect(fallo, `${caso.nombre} con ${etiqueta} no rechazo`).toBeInstanceOf(UnauthorizedError)
  expect(fallo, `${caso.nombre} con ${etiqueta} no lanzo un error del modulo`).toBeInstanceOf(ClientesError)
  expect((fallo as UnauthorizedError).code).toBe('unauthorized')

  for (const espia of d.espias) {
    expect(espia, `${caso.nombre} con ${etiqueta} toco un puerto`).not.toHaveBeenCalled()
  }
}

async function esperarQueLlegueAlPuerto(caso: Caso, actor: Actor): Promise<void> {
  const d = dobles()
  const resultado = await caso.ejecutar(d, actor).then(() => null, (error: unknown) => error)

  expect(resultado, `${caso.nombre} no llego al puerto con ${caso.permiso}`).not.toBeNull()
  expect(resultado, `${caso.nombre} rechazo teniendo ${caso.permiso}`).not.toBeInstanceOf(UnauthorizedError)
  expect((resultado as Error).message).toMatch(/no debe llamarse sin autorizacion/)
}

describe('R1 — cada operacion recibe el actor por parametro y no lee ninguna sesion', () => {
  it('R1 — cada operacion recibe el actor por parametro y no lee ninguna sesion', async () => {
    for (const archivo of ['actor.ts', 'create-customer.ts', 'update-customer.ts', 'delete-customer.ts', 'get-customer.ts', 'list-customers.ts']) {
      const fuente = readFileSync(join(moduloDir, 'domain', archivo), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
      expect(fuente, `${archivo} lee la sesion`).not.toMatch(
        /getSessionUser|next\/headers|\bcookies?\b|\bheaders\(\)|@\/lib\/composition/i,
      )
    }

    for (const caso of TODOS_LOS_CASOS) {
      await esperarRechazoSinTocarNada(caso, actorCon('inventario.consultar'), 'otro modulo')
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso))
    }
  })
})

describe('R2 — sin clientes.consultar la ficha y el listado se rechazan sin llamar al puerto', () => {
  it('R2 — sin clientes.consultar la ficha y el listado se rechazan sin llamar al puerto', async () => {
    for (const caso of CASOS_DE_LECTURA) {
      await esperarRechazoSinTocarNada(caso, actorCon(MODIFICAR), 'solo clientes.modificar')
      await esperarRechazoSinTocarNada(caso, actorCon(), 'sin ningun permiso')
    }
  })
})

describe('R3 — sin clientes.modificar el alta, la edicion y la baja se rechazan sin llamar al puerto', () => {
  it('R3 — sin clientes.modificar el alta, la edicion y la baja se rechazan sin llamar al puerto', async () => {
    for (const caso of CASOS_DE_ESCRITURA) {
      await esperarRechazoSinTocarNada(caso, actorCon(CONSULTAR), 'solo clientes.consultar')
      await esperarRechazoSinTocarNada(caso, actorCon(), 'sin ningun permiso')
    }
  })
})

describe('R4 — actor ausente, sin permisos o con el permiso contrario se rechaza igual', () => {
  it('R4 — actor ausente, sin permisos o con el permiso contrario se rechaza igual', async () => {
    // `assertPermission` (identity/domain/require-permission.ts) usa `Array.isArray` antes de
    // buscar el codigo: un actor sin la clave `permissions` cae por ese `Array.isArray(undefined)`
    // y se rechaza igual que el resto, sin llegar nunca a `.includes`.
    const sinClavePermissions = { id: 'u-1', companyId: COMPANY_ID } as unknown as Actor

    for (const caso of TODOS_LOS_CASOS) {
      await esperarRechazoSinTocarNada(caso, null, 'actor ausente (null)')
      await esperarRechazoSinTocarNada(caso, undefined, 'actor ausente (undefined)')
      await esperarRechazoSinTocarNada(caso, actorCon(), 'conjunto de permisos vacio')
      await esperarRechazoSinTocarNada(caso, sinClavePermissions, 'actor sin la clave permissions')

      const contrario = caso.permiso === CONSULTAR ? MODIFICAR : CONSULTAR
      await esperarRechazoSinTocarNada(caso, actorCon(contrario), `solo el permiso contrario (${contrario})`)
    }
  })
})

describe('R5 — sin permiso y con entrada invalida responde unauthorized, no invalid_input', () => {
  it('R5 — sin permiso y con entrada invalida responde unauthorized, no invalid_input', async () => {
    for (const caso of TODOS_LOS_CASOS) {
      await esperarRechazoSinTocarNada(
        caso,
        actorCon('inventario.consultar'),
        'entrada invalida y sin permiso',
        caso.ejecutarConBasura,
      )
    }
  })
})

describe('R8 — con los permisos sembrados del Administrador se autorizan las cinco y con los del Operador o el Empacador se rechazan', () => {
  it('R8 — con los permisos sembrados del Administrador se autorizan las cinco y con los del Operador o el Empacador se rechazan', async () => {
    const administrador: Actor = { id: 'admin', companyId: COMPANY_ID, permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [] }
    const operador: Actor = { id: 'operador', companyId: COMPANY_ID, permissions: SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [] }
    const empacador: Actor = { id: 'empacador', companyId: COMPANY_ID, permissions: SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR] ?? [] }

    expect(administrador.permissions).toContain(CONSULTAR)
    expect(administrador.permissions).toContain(MODIFICAR)

    for (const caso of TODOS_LOS_CASOS) {
      await esperarQueLlegueAlPuerto(caso, administrador)
      await esperarRechazoSinTocarNada(caso, operador, 'el Operador sembrado')
      await esperarRechazoSinTocarNada(caso, empacador, 'el Empacador sembrado')
    }
  })
})
