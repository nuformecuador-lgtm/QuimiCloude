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

import { DOCUMENT_TYPE_CODES } from '@/lib/modules/identity'

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
const company = parseModel('Company')

/** Los modelos a los que `User` apunta con `@relation`: no son columnas escalares. */
const USER_RELATION_TYPES = ['DocumentType', 'Role', 'Company']

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

/** Un bloque `enum` del esquema: su nombre y sus valores. */
interface PrismaEnum {
  readonly name: string
  readonly values: readonly string[]
}

function parseEnums(source: string): readonly PrismaEnum[] {
  return [...source.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map((match): PrismaEnum | null => {
      const [, name, body] = match
      if (name === undefined || body === undefined) return null
      return {
        name,
        values: body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('@')),
      }
    })
    .filter((candidate): candidate is PrismaEnum => candidate !== null)
}

const schemaEnums = parseEnums(schema)

/**
 * ACOTADO EL 2026-09-03 POR QC-33 (`specs/QC-33-modelo-pedidos/`).
 *
 * Antes se afirmaba `expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)`: NINGUN `enum` en
 * TODO el esquema. Esa mitad CADUCA. El repo no tenia ni uno el dia que se escribio, pero
 * el requisito de esta ficha (R10, `design.md > 3`) es que EL TIPO DE DOCUMENTO sea una
 * tabla ampliable con un INSERT, no que el repositorio entero carezca de enums. QC-33
 * declara `OrderStatus` y `OrderPriority` por decision cerrada 4 del humano, apartandose a
 * conciencia de este precedente porque su conjunto NO tiene que crecer sin migrar. Una
 * feature no puede cumplir la afirmacion de alcance de otra.
 *
 * Lo que R10 vigilaba y SIGUE VIGENTE se conserva entero: ningun `enum` del esquema es el
 * tipo de documento —ni por nombre ni por contenido—. Este helper muere si alguien declara
 * `enum DocumentType { CC }`, y muere igual si lo bautiza `TipoDocumento` o si mete los
 * codigos de `document_types` como valores de un enum con cualquier otro nombre.
 *
 * Los codigos NO se escriben aqui a mano: salen de `DOCUMENT_TYPE_CODES`, la contrapartida
 * en TypeScript de las filas que siembra `20260806122638_users_and_roles/migration.sql`.
 *
 * SEGUNDO ACOTAMIENTO, EL 2026-09-18 POR QC-111 (`specs/QC-111-procesamiento-de-pdf-en-cola/`).
 *
 * La comprobacion por NOMBRE mordia de mas: `/documen|tipodoc/i` cazaba tambien `DocumentStrategy`
 * y `DocumentFileStatus`, los dos enums del modulo `documentos` que QC-111 declara, y que no son
 * el tipo de documento de identidad. Se acota la comprobacion por nombre con una excepcion literal
 * para esos dos nombres exactos, para que siga muriendo con `DocumentType`, `TipoDocumento` o
 * `DocumentTypeCode`. La comprobacion por CONTENIDO —contra `DOCUMENT_TYPE_CODES`— es la
 * proteccion real y NO se toca.
 */
function expectDocumentTypeIsNotAnEnum(): void {
  for (const declared of schemaEnums) {
    expect(
      declared.name,
      `el enum ${declared.name} no puede ser el tipo de documento`,
    ).not.toMatch(/documen(?!tstrategy|tfilestatus)|tipodoc/i)
    const upperValues = declared.values.map((value) => value.toUpperCase())
    for (const code of DOCUMENT_TYPE_CODES) {
      expect(
        upperValues,
        `el enum ${declared.name} no puede declarar el codigo de documento ${code}`,
      ).not.toContain(code.toUpperCase())
    }
  }
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

/**
 * QC-6 / R9, R10 — marca de "debe cambiar la contrasena la primera vez que entre".
 * NO es un dato de negocio del usuario (por eso no entra en BUSINESS_FIELDS): es una
 * marca de estado que escribe el seed y que lee QC-7. El nombre evita el segmento
 * `password` a proposito (specs/QC-6-.../design.md > 2).
 */
const SEED_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['mustChangeCredential', 'must_change_credential'],
]

/**
 * QC-65 / R1, R8, R10 — el estado de la cuenta y el rastro de su ULTIMO cambio, con su columna
 * en la base. Estado actual sobre la propia fila, no historico: solo se guarda el ultimo cambio
 * (R13, decision cerrada 5), igual que `LOCKOUT_FIELDS` y por el mismo motivo.
 *
 * ANADIDO EL 2026-09-08 (QC-65) PARA RETENSAR ESTA GUARDIA, no para relajarla: el censo de
 * escalares de `User` de mas abajo sigue siendo una igualdad EXACTA y estos tres nombres entran
 * en el, en su propio bloque, al estilo de `LOCKOUT_FIELDS`. Las columnas del bloqueo de QC-19
 * NO se tocan (QC-65 R18) y siguen viviendo en su bloque de arriba.
 *
 * El contrato completo del estado —el `enum`, los defaults, el `@db.` y la FK a mano— lo vigila
 * `tests/unit/identity/schema/account-status-schema.test.ts`; aqui solo entra el censo.
 */
const ACCOUNT_STATUS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['accountStatus', 'account_status'],
  ['accountStatusChangedAt', 'account_status_changed_at'],
  ['accountStatusChangedBy', 'account_status_changed_by'],
]

/**
 * QC-23 / R7, R8 — el sello «sesiones validas desde». Estado actual del usuario sobre su propia
 * fila, no historico: una sola columna que dice desde cuando valen sus sesiones, igual que
 * `LOCKOUT_FIELDS` y `ACCOUNT_STATUS_FIELDS` y por el mismo motivo. El registro de sesiones
 * cerradas UNA A UNA (R10) NO vive aqui: es la tabla `revoked_sessions`, no una columna de
 * `users`, asi que no entra en este censo de escalares.
 *
 * ANADIDO EL 2026-09-12 (QC-23) PARA RETENSAR ESTA GUARDIA, no para relajarla: el censo de
 * escalares de `User` de mas abajo sigue siendo una igualdad EXACTA -no se cambio por ningun
 * `toContain`- y este nombre entra en el, en su propio bloque, al estilo de QC-65. Si alguien
 * anade una segunda columna de sesiones, o quita esta, el caso cae.
 *
 * El contrato completo del sello -el `@default(now())`, el `@db.Timestamptz(6)`, que no sea
 * opcional y que no lleve indice- lo vigila
 * `tests/unit/identity/schema/session-revocation-migration.test.ts`; aqui solo entra el censo.
 */
const SESSION_STAMP_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['sessionsValidFrom', 'sessions_valid_from'],
]

describe('db/schema.prisma — modelo de usuarios y roles', () => {
  it('el modelo User declara los nueve datos del usuario', () => {
    for (const [name] of BUSINESS_FIELDS) {
      expect(has(user, name), `falta el campo User.${name}`).toBe(true)
    }
    expect(BUSINESS_FIELDS).toHaveLength(9)

    // La lista completa de columnas: si alguien anade o quita una, este test lo dice.
    const scalarNames = user.fields
      .filter((candidate) => !candidate.isList && !USER_RELATION_TYPES.includes(candidate.type))
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual(
      [
        'id',
        ...BUSINESS_FIELDS.map(([name]) => name),
        // QC-47: `roleId` NO se movio (R13) y `companyId` es LO UNICO que entro (R9). Los dos
        // conviven en la misma fila; si alguien vuelve a sacar el rol de aqui, este test cae.
        'roleId',
        'companyId',
        'createdAt',
        'updatedAt',
        'deletedAt',
        ...LOCKOUT_FIELDS.map(([name]) => name),
        ...SEED_FIELDS.map(([name]) => name),
        // QC-65: las tres columnas del estado de cuenta. La igualdad sigue siendo EXACTA -no
        // se cambio por ningun `toContain`-: si alguien anade una cuarta columna de estado, o
        // quita una de estas, este caso cae, que es justo lo que la guardia existe para hacer.
        ...ACCOUNT_STATUS_FIELDS.map(([name]) => name),
        // QC-23 (R7): el sello de sesiones. La igualdad sigue siendo EXACTA por el mismo motivo
        // que la anoto QC-65; `revokedSessions` NO aparece aqui porque es una LISTA (el filtro de
        // arriba tira los `isList`) y porque no es ninguna columna de `users`.
        ...SESSION_STAMP_FIELDS.map(([name]) => name),
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

    // El conjunto cerrado del tipo de documento es una TABLA, no un `enum` (design.md > 3).
    // Acotado por QC-33: ver `expectDocumentTypeIsNotAnEnum`.
    expectDocumentTypeIsNotAnEnum()
  })

  it('el tipo de documento no es enum ni check, es tabla', () => {
    expect(documentType.body).toContain('@@map("document_types")')
    expect(field(documentType, 'code').attributes).toContain('@id')
    expect(has(documentType, 'isActive')).toBe(true)
    // El lado usuario guarda solo el codigo, en texto: anadir un tipo es un INSERT (R10).
    expect(field(user, 'documentTypeCode').type).toBe('String')
    // Ni enum ni check: acotado por QC-33 a SU sujeto, ver `expectDocumentTypeIsNotAnEnum`.
    expectDocumentTypeIsNotAnEnum()
  })

  // QC-111: el acotamiento del 2026-09-18 no desarma la regla, solo la afina. Un enum llamado
  // `DocumentType` -- que no es ninguno de los dos exceptuados-- sigue mordiendo por nombre.
  it('la regla del tipo de documento sigue mordiendo un enum llamado DocumentType', () => {
    const nombreDelTipoDeDocumento = /documen(?!tstrategy|tfilestatus)|tipodoc/i

    expect('DocumentType').toMatch(nombreDelTipoDeDocumento)
    expect('TipoDocumento').toMatch(nombreDelTipoDeDocumento)
    expect('DocumentTypeCode').toMatch(nombreDelTipoDeDocumento)
    // Los dos nombres exceptuados del modulo `documentos` no son el tipo de documento.
    expect('DocumentStrategy').not.toMatch(nombreDelTipoDeDocumento)
    expect('DocumentFileStatus').not.toMatch(nombreDelTipoDeDocumento)
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

// --- QC-6 — R9, R10: marca "debe cambiar la contrasena la primera vez que entre" -----

describe('db/schema.prisma — marca de cambio de credencial obligatorio (R9, R10)', () => {
  it('User declara mustChangeCredential booleano, obligatorio, con @default(false) y su @map', () => {
    for (const [name, column] of SEED_FIELDS) {
      expect(has(user, name), `falta el campo User.${name}`).toBe(true)
      const declared = field(user, name)
      expect(declared.type, `User.${name}`).toBe('Boolean')
      expect(declared.isOptional, `User.${name} no puede ser opcional`).toBe(false)
      expect(declared.attributes, `User.${name} necesita @default(false)`).toMatch(/@default\(false\)/)
      expect(declared.attributes, `User.${name} debe mapear a ${column}`).toContain(`@map("${column}")`)
    }
    expect(SEED_FIELDS).toHaveLength(1)
  })
})

// --- QC-47 — la empresa y la columna de empresa del usuario -------------------------

describe('db/schema.prisma — la empresa (QC-47)', () => {
  it('Company es del modulo identity (R27)', () => {
    // R27 y decision cerrada 16: la empresa cuelga del usuario y el usuario es de
    // `identity`. Es lo que hace cumplir `tests/guards/guard-arquitectura-modulos.test.ts`
    // cuando prohibe que otro modulo la consulte con Prisma. Se afirma sobre el schema CRUDO:
    // `/// @module` ES un comentario, y es justo lo que se vigila.
    expect(rawSchema.replace(/\r\n/g, '\n')).toContain('/// @module identity\nmodel Company {')
  })

  it('Company declara id uuid generado por la base, nombre, normalizado y sus tres fechas', () => {
    // R1: UUID aleatorio generado por la BASE, ni correlativo ni derivado del nombre.
    const id = field(company, 'id')
    expect(id.type).toBe('String')
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)

    // R2 y R3: nombre y normalizado obligatorios, sin longitud declarada (R8).
    for (const [name, column] of [
      ['name', 'name'],
      ['nameNormalized', 'name_normalized'],
    ] as const) {
      const declared = field(company, name)
      expect(declared.type, `Company.${name}`).toBe('String')
      expect(declared.isOptional, `Company.${name} no puede ser opcional`).toBe(false)
      expect(declared.attributes).not.toMatch(/@default\(/)
      expect(declared.attributes).not.toMatch(/@db\.(VarChar|Char)\s*\(/)
      if (name !== column) expect(declared.attributes).toContain(`@map("${column}")`)
    }

    // R7: las dos marcas de tiempo, con `@updatedAt` de verdad.
    expect(field(company, 'createdAt').attributes).toMatch(/@default\(now\(\)\)/)
    expect(field(company, 'updatedAt').attributes).toContain('@updatedAt')

    // R6: la baja logica nace con la tabla y nace VACIA (opcional).
    expect(field(company, 'deletedAt').isOptional).toBe(true)
    expect(field(company, 'deletedAt').attributes).toContain('@map("deleted_at")')
  })

  it('la unicidad del nombre de empresa NO esta en el esquema, y es deliberado (R4, R5)', () => {
    // `companies_name_unique` es FUNCIONAL (`lower(...)`) y PARCIAL
    // (`WHERE deleted_at IS NULL`) y Prisma no modela ninguna de las dos cosas. Si alguien
    // "arregla" el esquema con un `@unique`, la unicidad pasa a ser TOTAL sin que nadie se
    // entere y una empresa dada de baja quema su nombre para siempre.
    expect(field(company, 'name').attributes).not.toMatch(/@unique/)
    expect(field(company, 'nameNormalized').attributes).not.toMatch(/@unique/)
    expect(company.body).not.toMatch(/@@unique\(/)
  })
})

describe('db/schema.prisma — la columna de empresa del usuario (QC-47)', () => {
  it('QC-161 R26, R27: companyId es opcional solo en la columna, uuid, mapea a company_id y sin @default', () => {
    // Antes QC-47 R9 lo exigia obligatorio. Ahora la columna admite NULL para el Maestro y la
    // obligacion para el resto la pone el disparador `users_check_company_by_role`, no Prisma.
    const companyId = field(user, 'companyId')
    expect(companyId.type).toBe('String')
    expect(companyId.isOptional, 'User.companyId tiene que ser opcional: el Maestro no tiene empresa').toBe(true)
    expect(companyId.attributes).toContain('@db.Uuid')
    expect(companyId.attributes).toContain('@map("company_id")')
    // Un `@default` rellenaria la empresa sola y el disparador dejaria de ver la fila sin empresa.
    expect(companyId.attributes).not.toMatch(/@default\(/)
  })

  it('la relacion User-Company va con @relation y ON DELETE RESTRICT (R10, R11; opcional desde QC-161)', () => {
    const relation = field(user, 'company')
    expect(relation.type).toBe('Company')
    expect(relation.isOptional).toBe(true)
    expect(relation.attributes).toMatch(/fields:\s*\[companyId\]/)
    expect(relation.attributes).toMatch(/references:\s*\[id\]/)
    // R11: borrar una empresa con usuarios —vivos o de baja— tiene que fallar con 23503.
    expect(relation.attributes).toMatch(/onDelete:\s*Restrict/)
    expect(relation.attributes).not.toMatch(/onDelete:\s*(Cascade|SetNull|SetDefault)/)
    expect(relation.attributes).toMatch(/onUpdate:\s*Cascade/)
    // El lado inverso existe y es lista: una empresa tiene muchos usuarios.
    expect(company.fields.find((candidate) => candidate.name === 'users')?.isList).toBe(true)
  })

  it('companyId lleva su indice y NO lleva unicidad (R12)', () => {
    // El indice no es redundante con los tres unicos de `users`: esos son PARCIALES y la
    // verificacion del RESTRICT tiene que ver tambien a los usuarios dados de baja.
    expect(user.body).toMatch(/@@index\(\[companyId\],\s*map:\s*"users_company_id_idx"\)/)
    // Un `@unique` aqui convertiria la relacion en 1-1: una empresa, un usuario.
    expect(field(user, 'companyId').attributes).not.toMatch(/@unique/)

    // RETENSADO POR QC-83 (R23). Antes esto era un `not.toMatch(/@@unique\([^)]*companyId/)`,
    // o sea "ningun `@@unique` puede nombrar `companyId`". QC-83 anade UNO —y el humano lo
    // aprobo explicitamente— para que la FK compuesta de `work_group_members` tenga a donde
    // apuntar (una FK compuesta exige restriccion unica en el padre, o `42830`). Ese `@@unique`
    // NO reabre R12: `id` ya es la PK, asi que `(id, company_id)` es unico TRIVIALMENTE y no
    // puede rechazar ninguna fila que hoy se acepte ni volver 1-1 la relacion.
    // La lista se enumera ENTERA en vez de negar un patron: asi cualquier `@@unique` NUEVO que
    // nombre `companyId` —`[companyId]`, `[companyId, email]`, o el mismo con otro `map`— cae
    // aqui, que es MAS de lo que vigilaba la version anterior.
    const uniquesConEmpresa = [...user.body.matchAll(/@@unique\(([^\n]*)\)/g)]
      .map((match) => (match[1] as string).trim())
      .filter((args) => /\bcompanyId\b/.test(args))
    expect(uniquesConEmpresa).toEqual(['[id, companyId], map: "users_id_company_id_key"'])
  })

  it('nadie puede estar en dos empresas: no hay modelo intermedio (R12)', () => {
    // R12. `User` apunta a `Company` con UNA sola relacion escalar y no hay ninguna lista de
    // empresas; y ningun modelo del esquema apunta a la vez a `User` y a `Company`, que es la
    // forma que tendria una tabla intermedia si volviera por la puerta de atras.
    const empresas = user.fields.filter((candidate) => candidate.type === 'Company')
    expect(empresas).toHaveLength(1)
    expect(empresas[0]?.isList, 'un usuario no puede declarar una LISTA de empresas').toBe(false)

    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1] as string)
      .filter((name) => name !== 'User' && name !== 'Company')
    for (const name of modelNames) {
      const otro = parseModel(name)
      const apunta = (tipo: string): boolean =>
        otro.fields.some((candidate) => candidate.type === tipo)
      expect(
        apunta('User') && apunta('Company'),
        `${name} une usuario y empresa: eso reabre el modelo de muchos a muchos`,
      ).toBe(false)
    }
  })

  it('roles y tipos de documento NO ganan columna de empresa (R15)', () => {
    // Decision cerrada 8: son catalogos del sistema. "Administrador" significa lo mismo en
    // todas las empresas.
    for (const [name, model] of [
      ['Role', role],
      ['DocumentType', documentType],
    ] as const) {
      expect(
        model.fields.some((candidate) => /^company/i.test(candidate.name)),
        `${name} no debe tener columna de empresa (R15)`,
      ).toBe(false)
    }
  })
})
