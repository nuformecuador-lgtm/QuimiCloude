/**
 * El adaptador de `CustomerCatalog` contra Postgres REAL.
 *
 * Lo que un doble no puede demostrar: que el ambito de empresa filtra de verdad, que las bajas
 * entran o no segun `includeDeleted`, que el motor ordena el conjunto completo por apellidos,
 * nombres e id antes de paginar, y que la busqueda por palabra ignora acentos y mayusculas.
 *
 * AISLAMIENTO: el adaptador llama al cliente Prisma GLOBAL, asi que una transaccion del test con
 * ROLLBACK no lo envolveria. Dos empresas efimeras (randomUUID) nacen en `beforeAll`; sus clientes
 * llevan un marcador irrepetible y `afterAll` los borra por `company_id` antes de borrar las
 * empresas. Ninguna afirmacion es global: toda busqueda se acota con el marcador.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  findAliveCustomerRefById,
  findCustomerRefsIncludingDeleted,
  searchCustomerRefs,
} from '@/lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma'
import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

import type { CustomerScope } from '@/lib/modules/clientes/domain/customer-scope'

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Solo letras: `normalizeCustomerText` quita lo que no lo es, y el marcador tiene que casar. */
function letras(n: number): string {
  return token()
    .replace(/[0-9]/g, (d) => String.fromCharCode(103 + Number(d)))
    .slice(0, n)
}

const MARCA = `zqccat${letras(10)}`

let propia: CustomerScope
let ajena: CustomerScope

async function crearEmpresa(): Promise<CustomerScope> {
  const name = `Empresa customer-catalog ${token()}`
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return { companyId: company.id }
}

type Semilla = { firstNames: string; lastNames: string; city?: string; deleted?: boolean }

async function sembrar(scope: CustomerScope, semilla: Semilla): Promise<string> {
  const city = semilla.city ?? `Ciudad ${MARCA}`
  const created = await prisma.customer.create({
    data: {
      firstNames: semilla.firstNames,
      firstNamesNormalized: normalizeCustomerText(semilla.firstNames),
      lastNames: semilla.lastNames,
      lastNamesNormalized: normalizeCustomerText(semilla.lastNames),
      city,
      cityNormalized: normalizeCustomerText(city),
      companyId: scope.companyId,
      deletedAt: semilla.deleted === true ? new Date() : null,
    },
    select: { id: true },
  })
  return created.id
}

beforeAll(async () => {
  propia = await crearEmpresa()
  ajena = await crearEmpresa()
})

afterAll(async () => {
  const companyIds = [propia, ajena].filter((s) => s !== undefined).map((s) => s.companyId)
  await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } })
  expect(await prisma.customer.count({ where: { companyId: { in: companyIds } } })).toBe(0)
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  await prisma.$disconnect()
})

describe('findCustomerRefsIncludingDeleted', () => {
  it('R37: devuelve los de la empresa, vivos y de baja, y nunca los de otra empresa ni inexistentes', async () => {
    const vivo = await sembrar(propia, { firstNames: 'Ana', lastNames: `Vivo ${MARCA}` })
    const deBaja = await sembrar(propia, { firstNames: 'Luis', lastNames: `Baja ${MARCA}`, deleted: true })
    const deOtra = await sembrar(ajena, { firstNames: 'Eva', lastNames: `Ajena ${MARCA}` })

    const refs = await findCustomerRefsIncludingDeleted([vivo, deBaja, deOtra, randomUUID()], propia)
    const porId = new Map(refs.map((ref) => [ref.id, ref]))

    expect([...porId.keys()].sort()).toEqual([vivo, deBaja].sort())
    expect(porId.get(vivo)).toEqual({ id: vivo, firstNames: 'Ana', lastNames: `Vivo ${MARCA}`, isDeleted: false })
    expect(porId.get(deBaja)?.isDeleted).toBe(true)
    // Solo las cuatro claves publicadas: ni ciudad ni ningun otro dato personal.
    for (const ref of refs) expect(Object.keys(ref).sort()).toEqual(['firstNames', 'id', 'isDeleted', 'lastNames'])
  })
})

describe('findAliveCustomerRefById', () => {
  it('R28: vivo de la empresa -> ref; de baja, de otra empresa o inexistente -> null', async () => {
    const vivo = await sembrar(propia, { firstNames: 'Rosa', lastNames: `Viva ${MARCA}` })
    const deBaja = await sembrar(propia, { firstNames: 'Pepe', lastNames: `Baja2 ${MARCA}`, deleted: true })
    const deOtra = await sembrar(ajena, { firstNames: 'Juan', lastNames: `Ajeno2 ${MARCA}` })

    expect(await findAliveCustomerRefById(vivo, propia)).toEqual({
      id: vivo,
      firstNames: 'Rosa',
      lastNames: `Viva ${MARCA}`,
      isDeleted: false,
    })
    expect(await findAliveCustomerRefById(deBaja, propia)).toBeNull()
    expect(await findAliveCustomerRefById(deOtra, propia)).toBeNull()
    expect(await findAliveCustomerRefById(randomUUID(), propia)).toBeNull()
  })
})

describe('searchCustomerRefs', () => {
  it('R27, R28: bajas incluidas solo con includeDeleted; nunca otra empresa; orden apellidos, nombres, id', async () => {
    const grupo = letras(8)
    const ids = {
      zetaAna: await sembrar(propia, { firstNames: `Ana ${grupo}`, lastNames: 'Zeta' }),
      alfaBeto: await sembrar(propia, { firstNames: `Beto ${grupo}`, lastNames: 'Alfa' }),
      alfaAna: await sembrar(propia, { firstNames: `Ana ${grupo}`, lastNames: 'Alfa' }),
      alfaAnaBis: await sembrar(propia, { firstNames: `Ana ${grupo}`, lastNames: 'Alfa' }),
      deBaja: await sembrar(propia, { firstNames: `Carla ${grupo}`, lastNames: 'Media', deleted: true }),
      ajeno: await sembrar(ajena, { firstNames: `Ana ${grupo}`, lastNames: 'Alfa' }),
    }
    const empatados = [ids.alfaAna, ids.alfaAnaBis].sort()

    const filtro = await searchCustomerRefs({ search: grupo, includeDeleted: true, page: 1 }, propia)
    expect(filtro.items.map((ref) => ref.id)).toEqual([
      ...empatados,
      ids.alfaBeto,
      ids.deBaja,
      ids.zetaAna,
    ])
    expect(filtro.total).toBe(5)
    expect(filtro.items.find((ref) => ref.id === ids.deBaja)?.isDeleted).toBe(true)

    const selector = await searchCustomerRefs({ search: grupo, includeDeleted: false, page: 1 }, propia)
    expect(selector.items.map((ref) => ref.id)).toEqual([...empatados, ids.alfaBeto, ids.zetaAna])
    expect(selector.total).toBe(4)
    expect(selector.items.every((ref) => !ref.isDeleted)).toBe(true)

    expect(filtro.items.map((ref) => ref.id)).not.toContain(ids.ajeno)
  })

  it('R27: busca por palabra en nombres, apellidos o ciudad, sin acentos ni mayusculas', async () => {
    const grupo = letras(8)
    const porNombre = await sembrar(propia, { firstNames: `José ${grupo}`, lastNames: 'Núñez' })
    const porCiudad = await sembrar(propia, { firstNames: `Marta ${grupo}`, lastNames: 'Ríos', city: 'Bogotá' })
    await sembrar(propia, { firstNames: `Otro ${grupo}`, lastNames: 'Distinto', city: 'Cali' })

    const ids = async (search: string): Promise<string[]> =>
      (await searchCustomerRefs({ search, includeDeleted: false, page: 1 }, propia)).items.map((r) => r.id)

    expect(await ids(`${grupo.toUpperCase()} JOSE nunez`)).toEqual([porNombre])
    expect(await ids(`bogota ${grupo}`)).toEqual([porCiudad])
    // Cada palabra tiene que casar: una que no casa con nadie deja la lista vacia.
    expect(await ids(`${grupo} inexistentezz`)).toEqual([])
  })

  it('R27, R28: pagina 10 por defecto y acota a 25 cuando se piden mas', async () => {
    const grupo = letras(8)
    for (let i = 0; i < 26; i += 1) {
      await sembrar(propia, { firstNames: `Cliente ${grupo}`, lastNames: `Apellido ${String(i).padStart(2, '0')}` })
    }

    const primera = await searchCustomerRefs({ search: grupo, includeDeleted: false, page: 1 }, propia)
    expect(primera).toMatchObject({ page: 1, pageSize: 10, total: 26, totalPages: 3 })
    expect(primera.items).toHaveLength(10)

    const tercera = await searchCustomerRefs({ search: grupo, includeDeleted: false, page: 3 }, propia)
    expect(tercera.items.map((r) => r.lastNames)).toEqual([
      'Apellido 20',
      'Apellido 21',
      'Apellido 22',
      'Apellido 23',
      'Apellido 24',
      'Apellido 25',
    ])

    const acotada = await searchCustomerRefs(
      { search: grupo, includeDeleted: false, page: 1, pageSize: 100 },
      propia,
    )
    expect(acotada.pageSize).toBe(25)
    expect(acotada.items).toHaveLength(25)
    expect(acotada.totalPages).toBe(2)
  })
})
