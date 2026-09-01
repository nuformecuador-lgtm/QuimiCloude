// T8 — Contrato estatico de `db/schema.prisma` (feature 1: modelo-usuarios-y-roles).
//
// Lee el schema como TEXTO a proposito: lo que se vigila aqui es la DECLARACION, no el
// cliente generado. Un tipo de Prisma no distingue un campo obligatorio de uno con
// default, ni dice si la relacion es `Restrict`, ni si existe un `enum`.
//
// Cubre R1, R2, R3, R8, R10 (parcial), R12, R13, R15, R16, R17 (parcial), R21, R24.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

/** Quita comentarios `//` y `///`: el schema los usa para explicar, no para declarar. */
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

const user = parseModel('User')
const role = parseModel('Role')
const documentType = parseModel('DocumentType')

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

/** Los nueve datos de negocio de R1, con su columna en la base. */
const BUSINESS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['firstNames', 'first_names'],
  ['lastNames', 'last_names'],
  ['birthDate', 'birth_date'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['documentTypeCode', 'document_type_code'],
  ['documentNumber', 'document_number'],
  ['username', 'username'],
  ['passwordHash', 'password_hash'],
]

/**
 * QC-7 / R30 — las tres columnas del bloqueo temporal de cuenta, con su columna en la base.
 * Estado actual del usuario (contador, nivel de escalada y fin del bloqueo), no historico:
 * por eso son columnas de `users` y no una tabla de intentos (`design.md > 5.6`).
 */
const LOCKOUT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['failedLoginAttempts', 'failed_login_attempts'],
  ['lockLevel', 'lock_level'],
  ['lockedUntil', 'locked_until'],
]

describe('db/schema.prisma — modelo de usuarios y roles', () => {
  it('el modelo User declara los nueve datos del usuario', () => {
    for (const [name] of BUSINESS_FIELDS) {
      expect(has(user, name), `falta el campo User.${name}`).toBe(true)
    }
    expect(BUSINESS_FIELDS).toHaveLength(9)

    // La lista completa de columnas: si alguien anade o quita una, este test lo dice.
    const scalarNames = user.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'DocumentType' && candidate.type !== 'Role')
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual(
      [
        'id',
        ...BUSINESS_FIELDS.map(([name]) => name),
        'roleId',
        'createdAt',
        'updatedAt',
        'deletedAt',
        ...LOCKOUT_FIELDS.map(([name]) => name),
      ].sort(),
    )

    for (const [name, column] of BUSINESS_FIELDS) {
      if (name === column) continue
      expect(field(user, name).attributes, `User.${name} debe mapear a ${column}`).toContain(
        `@map("${column}")`,
      )
    }
  })

  it('todo campo de negocio de User es obligatorio, incluidos telefono y fecha de nacimiento', () => {
    for (const [name] of BUSINESS_FIELDS) {
      expect(field(user, name).isOptional, `User.${name} no puede ser opcional`).toBe(false)
    }
    expect(field(user, 'phone').isOptional).toBe(false)
    expect(field(user, 'birthDate').isOptional).toBe(false)
    expect(field(user, 'birthDate').attributes).toContain('@db.Date')
    // Obligatorio de verdad: ninguno se rellena solo con un default.
    for (const [name] of BUSINESS_FIELDS) {
      expect(field(user, name).attributes, `User.${name} no debe tener @default`).not.toMatch(/@default\(/)
    }
  })

  it('User y Role tienen id uuid con default generado', () => {
    for (const [modelName, model] of [
      ['User', user],
      ['Role', role],
    ] as const) {
      const id = field(model, 'id')
      expect(id.type, `${modelName}.id`).toBe('String')
      expect(id.attributes).toContain('@id')
      expect(id.attributes).toContain('@db.Uuid')
      expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
      expect(id.isOptional).toBe(false)
    }
  })

  it('document_type_code es FK a document_types y no hay enum', () => {
    const code = field(user, 'documentTypeCode')
    expect(code.type).toBe('String')
    expect(code.isOptional).toBe(false)
    expect(code.attributes).toContain('@map("document_type_code")')

    const relation = field(user, 'documentType')
    expect(relation.type).toBe('DocumentType')
    expect(relation.attributes).toMatch(/@relation\(/)
    expect(relation.attributes).toMatch(/fields:\s*\[documentTypeCode\]/)
    expect(relation.attributes).toMatch(/references:\s*\[code\]/)
    expect(relation.attributes).toMatch(/onDelete:\s*Restrict/)

    // Ningun `enum` en todo el schema: el conjunto cerrado es una tabla (design.md > 3).
    expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)
  })

  it('el tipo de documento no es enum ni check, es tabla', () => {
    expect(documentType.body).toContain('@@map("document_types")')
    expect(field(documentType, 'code').attributes).toContain('@id')
    expect(has(documentType, 'isActive')).toBe(true)
    // El lado usuario guarda solo el codigo, en texto: anadir un tipo es un INSERT (R10).
    expect(field(user, 'documentTypeCode').type).toBe('String')
    expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)
  })

  it('passwordHash es String sin longitud declarada', () => {
    const passwordHash = field(user, 'passwordHash')
    expect(passwordHash.type).toBe('String')
    expect(passwordHash.isOptional).toBe(false)
    expect(passwordHash.attributes).toContain('@map("password_hash")')
    // Ni `@db.VarChar(n)` ni `@db.Char(n)`: elegir longitud seria elegir algoritmo.
    expect(passwordHash.attributes).not.toMatch(/@db\.(VarChar|Char|Text)\s*\(\s*\d+\s*\)/)
    expect(passwordHash.attributes).not.toMatch(/@db\./)
  })

  it('Role declara name y description obligatorios', () => {
    const name = field(role, 'name')
    const description = field(role, 'description')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(description.type).toBe('String')
    expect(description.isOptional).toBe(false)
    expect(description.attributes).not.toMatch(/@default\(/)
  })

  it('roleId es obligatorio y FK a Role', () => {
    const roleId = field(user, 'roleId')
    expect(roleId.type).toBe('String')
    expect(roleId.isOptional).toBe(false)
    expect(roleId.attributes).toContain('@db.Uuid')
    expect(roleId.attributes).toContain('@map("role_id")')

    const relation = field(user, 'role')
    expect(relation.type).toBe('Role')
    expect(relation.isOptional).toBe(false)
    expect(relation.attributes).toMatch(/fields:\s*\[roleId\]/)
    expect(relation.attributes).toMatch(/references:\s*\[id\]/)
  })

  it('roleId no tiene restriccion de unicidad', () => {
    // Un `@unique` aqui convertiria la relacion en 1-1 y romperia R16 en silencio.
    expect(field(user, 'roleId').attributes).not.toMatch(/@unique/)
    expect(user.body).not.toMatch(/@@unique\([^)]*roleId/)
    expect(role.fields.find((candidate) => candidate.name === 'users')?.isList).toBe(true)
  })

  it('la relacion User-Role declara onDelete Restrict', () => {
    expect(field(user, 'role').attributes).toMatch(/onDelete:\s*Restrict/)
    expect(field(user, 'role').attributes).not.toMatch(/onDelete:\s*(Cascade|SetNull|SetDefault)/)
  })

  it('Role no tiene deletedAt', () => {
    // Deliberado (design.md > 2.2): con `deletedAt`, "borrar" un rol seria un UPDATE y la
    // FK no podria bloquearlo; R17 se quedaria sin ninguna garantia real.
    expect(has(role, 'deletedAt')).toBe(false)
    expect(role.body).not.toMatch(/deleted_at/)
  })

  it('User declara deletedAt opcional', () => {
    const deletedAt = field(user, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
  })

  it('User y Role declaran createdAt y updatedAt', () => {
    for (const [modelName, model] of [
      ['User', user],
      ['Role', role],
    ] as const) {
      const createdAt = field(model, 'createdAt')
      const updatedAt = field(model, 'updatedAt')
      expect(createdAt.type, `${modelName}.createdAt`).toBe('DateTime')
      expect(createdAt.isOptional).toBe(false)
      expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
      expect(createdAt.attributes).toContain('@map("created_at")')
      expect(updatedAt.type, `${modelName}.updatedAt`).toBe('DateTime')
      expect(updatedAt.isOptional).toBe(false)
      expect(updatedAt.attributes).toContain('@updatedAt')
      expect(updatedAt.attributes).toContain('@map("updated_at")')
    }
  })
})

// --- QC-7 — R30: persistencia del bloqueo temporal de cuenta -------------------------

describe('db/schema.prisma — bloqueo temporal de cuenta (R30)', () => {
  it('User declara las tres columnas de bloqueo con su @map', () => {
    for (const [name, column] of LOCKOUT_FIELDS) {
      expect(has(user, name), `falta el campo User.${name}`).toBe(true)
      expect(field(user, name).attributes, `User.${name} debe mapear a ${column}`).toContain(
        `@map("${column}")`,
      )
    }
    expect(LOCKOUT_FIELDS).toHaveLength(3)
  })

  it('failedLoginAttempts y lockLevel son enteros obligatorios con @default(0)', () => {
    // El default es lo que permite aplicar la migracion sobre las filas ya existentes sin
    // backfill: sin el, un `NOT NULL` sin valor reventaria el ALTER TABLE.
    for (const name of ['failedLoginAttempts', 'lockLevel'] as const) {
      const declared = field(user, name)
      expect(declared.type, `User.${name}`).toBe('Int')
      expect(declared.isOptional, `User.${name} no puede ser opcional`).toBe(false)
      expect(declared.attributes, `User.${name} necesita @default(0)`).toMatch(/@default\(0\)/)
    }
  })

  it('lockedUntil es un instante opcional en timestamptz(6)', () => {
    const lockedUntil = field(user, 'lockedUntil')
    expect(lockedUntil.type).toBe('DateTime')
    // Opcional: NULL = cuenta sin bloqueo vigente. No hay valor centinela.
    expect(lockedUntil.isOptional).toBe(true)
    expect(lockedUntil.attributes).toContain('@map("locked_until")')
    // `timestamptz` como el resto de instantes: comparar un bloqueo en hora local seria un
    // error de una hora dos veces al ano (`design.md > 5.6`).
    expect(lockedUntil.attributes).toContain('@db.Timestamptz(6)')
    expect(lockedUntil.attributes).not.toMatch(/@db\.Timestamp\(/)
  })

  it('las columnas de bloqueo no anaden unicidad ni indice nuevo', () => {
    // No se consulta por ellas: se leen junto a la fila que ya localiza
    // `users_username_unique` (`design.md > 5.6`).
    for (const [name] of LOCKOUT_FIELDS) {
      expect(field(user, name).attributes, `User.${name} no debe ser @unique`).not.toMatch(/@unique/)
    }
    expect(user.body).not.toMatch(/@@index\(\[(failedLoginAttempts|lockLevel|lockedUntil)/)
  })

  it('el modelo User sigue siendo propiedad del modulo identity', () => {
    // El dueno no cambia por anadir columnas; el bloque 10 de la guardia lo exige declarado.
    expect(rawSchema.replace(/\r\n/g, '\n')).toContain('/// @module identity\nmodel User {')
  })
})
