// Contrato estatico de `db/schema.prisma` para el modelo Customer.
//
// Lee el schema como TEXTO, igual que `tests/unit/proveedores/schema/proveedores-schema.test.ts`:
// lo que se vigila aqui es la DECLARACION, no el cliente generado. Ata el tipo `Customer` del
// armazon a los campos del modelo.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { Customer } from '@/lib/modules/clientes'

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

/** Texto crudo, con los `///`: R16 y R19 afirman sobre los comentarios. */
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const schema = stripComments(rawSchema)

interface PrismaField {
  readonly name: string
  readonly type: string
  readonly attributes: string
  readonly isOptional: boolean
  readonly isList: boolean
}

interface PrismaModel {
  readonly body: string
  readonly fields: readonly PrismaField[]
}

function parseModel(name: string): PrismaModel {
  const match = new RegExp(`^model\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) throw new Error(`no existe el modelo ${name}`)
  const body = match[1]
  const fields = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('@@'))
    .map((line): PrismaField | null => {
      const field = /^(\w+)\s+(\S+)\s*(.*)$/.exec(line)
      if (field === null || field[1] === undefined || field[2] === undefined) return null
      const rawType = field[2]
      return {
        name: field[1],
        type: rawType.replace(/[?[\]]/g, ''),
        attributes: field[3] ?? '',
        isOptional: rawType.endsWith('?'),
        isList: rawType.endsWith('[]'),
      }
    })
    .filter((field): field is PrismaField => field !== null)
  return { body, fields }
}

const customer = parseModel('Customer')

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

/** Censo EXACTO de columnas de `Customer`, con la columna en ingles que le toca (R16). */
const CUSTOMER_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['firstNames', 'first_names'],
  ['lastNames', 'last_names'],
  ['city', 'city'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['address', 'address'],
  ['companyId', 'company_id'],
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['deletedAt', 'deleted_at'],
]

describe('db/schema.prisma — modelo Customer', () => {
  it('declara id uuid propio mas los seis datos de R1, y ninguno mas (R1, R4)', () => {
    const id = field(customer, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    expect(customer.body).not.toMatch(/@@id\(/)

    for (const name of ['firstNames', 'lastNames', 'city', 'phone', 'email', 'address']) {
      expect(has(customer, name), `Customer.${name} debe existir`).toBe(true)
    }

    // Censo EXACTO: cualquier columna de mas -NIT, documento, persona de contacto- rompe esto.
    const scalarNames = customer.fields
      .filter((candidate) => !candidate.isList)
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual(CUSTOMER_COLUMNS.map(([name]) => name).sort())
    expect(customer.body).toContain('@@map("customers")')
  })

  it('nombres, apellidos y ciudad son obligatorios; telefono, correo y direccion son opcionales por separado (R3)', () => {
    for (const obligatorio of ['firstNames', 'lastNames', 'city'] as const) {
      expect(field(customer, obligatorio).isOptional, `Customer.${obligatorio}`).toBe(false)
      expect(field(customer, obligatorio).attributes).not.toMatch(/@default\(/)
    }
    for (const opcional of ['phone', 'email', 'address'] as const) {
      expect(field(customer, opcional).isOptional, `Customer.${opcional}`).toBe(true)
    }
  })

  it('los seis datos de negocio son String sin @db.VarChar ni ningun otro tipo nativo (R5)', () => {
    for (const name of ['firstNames', 'lastNames', 'city', 'phone', 'email', 'address'] as const) {
      const candidate = field(customer, name)
      expect(candidate.type, `Customer.${name} debe ser String`).toBe('String')
      expect(candidate.attributes, `Customer.${name} no debe declarar varchar`).not.toMatch(
        /@db\.(VarChar|Char)\s*\(/,
      )
      expect(candidate.attributes, `Customer.${name} no debe declarar tipo nativo`).not.toMatch(
        /@db\.\w+/,
      )
    }
  })

  /** El predicado real que R7 exige: nada de mirar el texto sintetico por fuera de esta funcion. */
  function noLlevaUnique(attributes: string): boolean {
    return !/@unique/.test(attributes)
  }

  it('ningun campo lleva @unique y el unico @@unique es la clave candidata (empresa, id) (R7)', () => {
    for (const name of ['firstNames', 'lastNames', 'city', 'phone', 'email', 'address']) {
      expect(
        noLlevaUnique(field(customer, name).attributes),
        `${name} no puede llevar @unique`,
      ).toBe(true)
    }
    const uniques = customer.body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@@unique('))
    expect(uniques).toEqual(['@@unique([companyId, id], map: "customers_company_id_id_key")'])

    // Sensibilidad: la MISMA funcion que aprueba arriba tiene que reprobar un `@unique` en `email`.
    const mutado = `${field(customer, 'email').attributes} @unique`
    expect(mutado, 'la mutacion no se aplico').not.toBe(field(customer, 'email').attributes)
    expect(noLlevaUnique(mutado)).toBe(false)
  })

  /** El predicado real que R11 exige: nada de mirar el texto sintetico por fuera de esta funcion. */
  function llevaRelation(attributes: string): boolean {
    return /@relation/.test(attributes)
  }

  it('companyId, createdBy y updatedBy son escalares uuid SIN @relation (R11)', () => {
    for (const [name, column] of [
      ['companyId', 'company_id'],
      ['createdBy', 'created_by'],
      ['updatedBy', 'updated_by'],
    ] as const) {
      const candidate = field(customer, name)
      expect(candidate.type, `${name} debe ser String`).toBe('String')
      expect(candidate.attributes, `${name} debe ser uuid`).toContain('@db.Uuid')
      expect(candidate.attributes, `${name} debe mapear a ${column}`).toContain(`@map("${column}")`)
      expect(llevaRelation(candidate.attributes), `${name} NO puede llevar @relation`).toBe(false)
    }
    expect(field(customer, 'companyId').isOptional).toBe(false)
    expect(field(customer, 'createdBy').isOptional).toBe(true)
    expect(field(customer, 'updatedBy').isOptional).toBe(true)

    // Ningun campo del modelo apunta como OBJETO a Company o a User: nada por donde atravesar
    // con un `include`.
    for (const candidate of customer.fields) {
      for (const ajeno of ['Company', 'User']) {
        expect(candidate.type, `${candidate.name} no puede apuntar a ${ajeno}`).not.toBe(ajeno)
      }
    }
    expect(customer.fields.some((candidate) => llevaRelation(candidate.attributes))).toBe(false)

    // Sensibilidad: la MISMA funcion `llevaRelation` tiene que caer con un `@relation` en
    // `companyId`. Se muta EN MEMORIA el atributo real, no un texto inventado.
    const mutado = `${field(customer, 'companyId').attributes} @relation(fields: [companyId], references: [id])`
    expect(mutado, 'la mutacion no se aplico').not.toBe(field(customer, 'companyId').attributes)
    expect(llevaRelation(mutado)).toBe(true)

    // Con sus indices: Postgres no indexa el lado hijo de una FK.
    expect(customer.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"customers_created_by_idx"\)/)
    expect(customer.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"customers_updated_by_idx"\)/)
  })

  it('deletedAt es opcional y no hay ninguna columna de estado activo/inactivo', () => {
    const deletedAt = field(customer, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)
    for (const forbidden of ['isActive', 'active', 'status', 'state', 'enabled']) {
      expect(has(customer, forbidden), `Customer.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('declara createdAt y updatedAt, y el segundo se actualiza solo (R15)', () => {
    const createdAt = field(customer, 'createdAt')
    const updatedAt = field(customer, 'updatedAt')
    expect(createdAt.type).toBe('DateTime')
    expect(createdAt.isOptional).toBe(false)
    expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
    expect(createdAt.attributes).toContain('@map("created_at")')
    expect(createdAt.attributes).toContain('@db.Timestamptz(6)')
    expect(updatedAt.type).toBe('DateTime')
    expect(updatedAt.isOptional).toBe(false)
    expect(updatedAt.attributes).toContain('@updatedAt')
    expect(updatedAt.attributes).toContain('@map("updated_at")')
    expect(updatedAt.attributes).toContain('@db.Timestamptz(6)')
  })

  it('mapea a snake_case en ingles, y la tabla se llama customers (R16)', () => {
    expect(customer.body).toContain('@@map("customers")')
    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [name, column] of CUSTOMER_COLUMNS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(customer, name).attributes)
      const real = mapped?.[1] ?? name
      expect(real, `Customer.${name} debe mapear a ${column}`).toBe(column)
      expect(column, `Customer.${name} -> ${column}`).toMatch(SNAKE_CASE)
    }
    const indexMaps = [...customer.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(indexMaps).toEqual(['customers_created_by_idx', 'customers_updated_by_idx'])
  })

  it('declara /// @module clientes, y ningun otro modelo lo reclama (R19)', () => {
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Customer')).toBe('clientes')

    const clientesModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'clientes')
      .map(([modelName]) => modelName)
    expect(clientesModels).toEqual(['Customer'])
    // No se afirma el censo global del schema: otras fichas paralelas tocan otros modelos.
    expect(owners.get('Supplier')).toBe('proveedores')
  })

  it('el tipo Customer del armazon tiene exactamente las claves de los campos del modelo', () => {
    // `satisfies Record<keyof Customer, true>`: si el tipo `Customer` gana o pierde un campo sin
    // que este objeto cambie, `typecheck` cae antes que este test. Y si alguien cambia el
    // OBJETO sin tocar el tipo, el `toEqual` de abajo lo caza contra el esquema real.
    const CUSTOMER_TYPE_FIELDS = {
      id: true,
      firstNames: true,
      lastNames: true,
      city: true,
      phone: true,
      email: true,
      address: true,
      companyId: true,
      createdBy: true,
      updatedBy: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Record<keyof Customer, true>

    const modelFieldNames = customer.fields.map((candidate) => candidate.name).sort()
    expect(Object.keys(CUSTOMER_TYPE_FIELDS).sort()).toEqual(modelFieldNames)

    // Sensibilidad OBLIGATORIA: un campo de mas (o de menos) en el tipo tiene que tumbar el
    // `toEqual` de arriba.
    const conCampoDeMas = { ...CUSTOMER_TYPE_FIELDS, taxId: true }
    expect(Object.keys(conCampoDeMas).sort()).not.toEqual(modelFieldNames)
    const conCampoDeMenos: Record<string, true> = { ...CUSTOMER_TYPE_FIELDS }
    delete conCampoDeMenos.city
    expect(Object.keys(conCampoDeMenos).sort()).not.toEqual(modelFieldNames)
  })
})
