// Contrato estatico de `db/schema.prisma` para el estado de cuenta (QC-65).
//
// Cubre R1, R3, R4, R5, R8, R10 y R13. Lee el esquema como TEXTO a proposito —igual que
// `identity-schema.test.ts`—: lo que se vigila es la DECLARACION (el `@default`, el `@map`, la
// opcionalidad, el `@db.`), y un tipo del cliente generado no distingue nada de eso. Lo que SI
// se mira en el cliente es el dmmf, y solo para una cosa: que `accountStatusChangedBy` NO sea
// un campo de relacion (`design.md > 1.3`).
//
// R3 es el sujeto principal: `USER_ACCOUNT_STATUSES` es la UNICA definicion del conjunto y
// aqui se IMPORTA de verdad desde el contrato del modulo. Los cuatro valores NO se escriben a
// mano en este archivo en ningun sitio; si alguien cambia la constante y no el esquema —o al
// reves— este test es lo que se entera (mismo patron que `companies-migration.test.ts` con
// `INITIAL_COMPANY_NAME`).
//
// Las afirmaciones sensibles se escriben como PREDICADOS PUROS que reciben el texto del
// esquema, y se aplican dos veces: al esquema real y a una copia MUTADA EN MEMORIA. El archivo
// en disco no se toca.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUSES,
} from '@/lib/modules/identity'

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

/** Quita comentarios `//` y `///`: aqui se vigila lo DECLARADO, no lo explicado. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const schema = stripComments(rawSchema)

// --- Predicados puros ----------------------------------------------------------------------

/**
 * R1, R3, R4. Los valores del `enum` pedido, EN SU ORDEN DE DECLARACION, o `null` si el enum
 * no existe. El orden importa para poder comparar con una igualdad ordenada: es lo que pide
 * `design.md > 1.1`, y un conjunto desordenado dejaria pasar una reordenacion que en Postgres
 * NO es cosmetica (obliga a recrear el tipo).
 */
export function enumValues(source: string, name: string): readonly string[] | null {
  const match = new RegExp(`^enum\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(
    stripComments(source),
  )
  if (match === null || match[1] === undefined) return null
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('@'))
}

interface PrismaField {
  readonly name: string
  readonly type: string
  readonly attributes: string
  readonly isOptional: boolean
  readonly isList: boolean
}

/** Los campos declarados de un modelo del esquema, o `null` si el modelo no existe. */
export function modelFields(source: string, name: string): readonly PrismaField[] | null {
  const match = new RegExp(`^model\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(
    stripComments(source),
  )
  if (match === null || match[1] === undefined) return null
  return match[1]
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
}

function userField(source: string, name: string): PrismaField | null {
  const fields = modelFields(source, 'User')
  if (fields === null) return null
  return fields.find((candidate) => candidate.name === name) ?? null
}

/**
 * R3. ¿El `enum` del esquema declara EXACTAMENTE los cuatro valores de `USER_ACCOUNT_STATUSES`,
 * en el mismo orden y con la misma grafia? La lista esperada se IMPORTA; no se copia.
 */
export function schemaEnumMatchesTheOnlyDefinition(source: string): boolean {
  const values = enumValues(source, 'UserAccountStatus')
  if (values === null) return false
  return values.join(',') === [...USER_ACCOUNT_STATUSES].join(',')
}

/**
 * R5. ¿La columna del estado nace con el estado inicial del dominio como `@default`? El literal
 * esperado sale de `INITIAL_USER_ACCOUNT_STATUS`, no de una copia escrita aqui.
 */
export function statusDefaultIsTheInitialStatus(source: string): boolean {
  const declared = userField(source, 'accountStatus')
  if (declared === null) return false
  return new RegExp(`@default\\(${INITIAL_USER_ACCOUNT_STATUS}\\)`).test(declared.attributes)
}

/**
 * R13. ¿El esquema gana algun modelo o algun campo que sea un HISTORIAL de estados? La decision
 * cerrada 5 dice que solo se guarda el ULTIMO cambio: tres columnas sobre la propia fila.
 * Se mira sobre lo DECLARADO —la prosa habla de historial justo para decir que no lo hay—.
 */
export function declaresStatusHistory(source: string): boolean {
  const declaraciones = stripComments(source)
  const modelos = [...declaraciones.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
    (match) => match[1] as string,
  )
  if (modelos.some((modelo) => /status.?histor|histor.*(status|estado)|account_status_log/i.test(modelo))) {
    return true
  }
  const campos = modelFields(declaraciones, 'User') ?? []
  return campos.some((campo) =>
    /(previous|old|former|anterior).*(status)|status.*(histor|log$)/i.test(campo.name),
  )
}

/**
 * Los campos de RELACION que el cliente generado conoce para un modelo (`kind === 'object'`).
 * Un escalar sin `@relation` nunca aparece aqui, aunque la columna y su FK existan de verdad en
 * la base: es exactamente lo que `design.md > 1.3` pide para `accountStatusChangedBy`.
 */
function relationTargets(modelName: string): readonly string[] {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName)
  expect(model, `Prisma.dmmf no conoce el modelo ${modelName}`).toBeDefined()
  return (model as { fields: readonly { kind: string; type: string }[] }).fields
    .filter((field) => field.kind === 'object')
    .map((field) => field.type)
    .sort()
}

// --- El conjunto cerrado -------------------------------------------------------------------

describe('db/schema.prisma — el conjunto cerrado de estados de cuenta (R1, R3, R4)', () => {
  it('el enum del esquema es EXACTAMENTE la lista del dominio, y cae si divergen', () => {
    // R3: una sola definicion. La del dominio se importa de verdad; los cuatro literales NO se
    // escriben en este archivo.
    expect(schemaEnumMatchesTheOnlyDefinition(rawSchema)).toBe(true)
    expect(enumValues(rawSchema, 'UserAccountStatus')).toEqual([...USER_ACCOUNT_STATUSES])
    expect(USER_ACCOUNT_STATUSES).toHaveLength(4)

    // --- Sensibilidad (mutacion EN MEMORIA; el archivo en disco no se toca):
    // un quinto valor colado en el enum cae.
    const conQuinto = rawSchema.replace(
      /(enum UserAccountStatus \{)/,
      '$1\n  suspended',
    )
    expect(conQuinto, 'la mutacion no anadio el quinto valor').not.toBe(rawSchema)
    expect(schemaEnumMatchesTheOnlyDefinition(conQuinto)).toBe(false)

    // Quitar uno, tambien.
    const sinUno = rawSchema.replace(
      new RegExp(`\\n\\s+${USER_ACCOUNT_STATUSES[3]}(?=\\n\\})`),
      '',
    )
    expect(sinUno, 'la mutacion no quito ningun valor').not.toBe(rawSchema)
    expect(schemaEnumMatchesTheOnlyDefinition(sinUno)).toBe(false)

    // Y "normalizar" la grafia a mayusculas —riesgo 4 de `design.md > 8`— tambien cae: en
    // Postgres eso es una migracion del tipo, no un cambio cosmetico.
    const enMayusculas = rawSchema.replace(
      /(enum UserAccountStatus \{[\s\S]*?\n\})/,
      (bloque) => bloque.toUpperCase().replace('ENUM USERACCOUNTSTATUS', 'enum UserAccountStatus'),
    )
    expect(enMayusculas, 'la mutacion no cambio la grafia').not.toBe(rawSchema)
    expect(schemaEnumMatchesTheOnlyDefinition(enMayusculas)).toBe(false)
  })

  it('los cuatro valores van en ingles y en minuscula (R4)', () => {
    for (const valor of USER_ACCOUNT_STATUSES) {
      expect(valor, `${valor} tiene que ir en minuscula`).toBe(valor.toLowerCase())
      expect(valor, `${valor} no puede llevar separadores raros`).toMatch(/^[a-z]+$/)
    }
    // Los dos estados con nombre del dominio pertenecen al conjunto: si alguien renombrara un
    // valor y olvidara una de las dos constantes, el default o el seed apuntarian a la nada.
    expect(USER_ACCOUNT_STATUSES).toContain(INITIAL_USER_ACCOUNT_STATUS)
    expect(USER_ACCOUNT_STATUSES).toContain(SEED_ADMIN_ACCOUNT_STATUS)
    // Y no son el mismo: el seed escribe EXPLICITAMENTE algo distinto del default (R7).
    expect(SEED_ADMIN_ACCOUNT_STATUS).not.toBe(INITIAL_USER_ACCOUNT_STATUS)
  })
})

// --- Las tres columnas ---------------------------------------------------------------------

describe('db/schema.prisma — las tres columnas del estado (R1, R5, R8, R10)', () => {
  it('accountStatus es el enum, obligatorio, con el default del dominio y su @map (R1, R5)', () => {
    const declared = userField(rawSchema, 'accountStatus')
    expect(declared, 'falta el campo User.accountStatus').not.toBeNull()
    const campo = declared as PrismaField
    expect(campo.type).toBe('UserAccountStatus')
    // R1: nunca esta ausente. Un `?` aqui permitiria una fila sin estado.
    expect(campo.isOptional, 'User.accountStatus no puede ser opcional (R1)').toBe(false)
    expect(campo.attributes).toContain('@map("account_status")')
    expect(statusDefaultIsTheInitialStatus(rawSchema)).toBe(true)

    // --- Sensibilidad: cambiar el default a otro valor del conjunto cae.
    // La mutacion apunta a la DECLARACION, no a la prosa: el comentario `///` de la columna
    // tambien escribe `@default(pending)` para explicarla, y cambiar ahi no probaria nada
    // (`stripComments` lo tira antes de mirar).
    const otroDefault = rawSchema.replace(
      `UserAccountStatus @default(${INITIAL_USER_ACCOUNT_STATUS})`,
      `UserAccountStatus @default(${SEED_ADMIN_ACCOUNT_STATUS})`,
    )
    expect(otroDefault, 'la mutacion no cambio el default').not.toBe(rawSchema)
    expect(statusDefaultIsTheInitialStatus(otroDefault)).toBe(false)

    // Y quitarlo del todo tambien: sin default, una fila nueva no nace `pending` (R5).
    const sinDefault = rawSchema.replace(
      `UserAccountStatus @default(${INITIAL_USER_ACCOUNT_STATUS}) `,
      'UserAccountStatus ',
    )
    expect(sinDefault, 'la mutacion no quito el default').not.toBe(rawSchema)
    expect(statusDefaultIsTheInitialStatus(sinDefault)).toBe(false)
  })

  it('accountStatusChangedAt es un instante obligatorio, timestamptz(6), con default now() (R8, R9)', () => {
    const campo = userField(rawSchema, 'accountStatusChangedAt') as PrismaField
    expect(campo, 'falta el campo User.accountStatusChangedAt').not.toBeNull()
    expect(campo.type).toBe('DateTime')
    // R8: el instante nunca esta ausente.
    expect(campo.isOptional, 'User.accountStatusChangedAt no puede ser opcional (R8)').toBe(false)
    // R9: en un alta sin instante lo pone la base.
    expect(campo.attributes).toMatch(/@default\(now\(\)\)/)
    expect(campo.attributes).toContain('@map("account_status_changed_at")')
    // `timestamptz` como el resto de instantes del repo: comparar en hora local seria un error
    // de una hora dos veces al ano.
    expect(campo.attributes).toContain('@db.Timestamptz(6)')
    expect(campo.attributes).not.toMatch(/@db\.Timestamp\(/)
    // No es `@updatedAt`: no cambia en cada escritura de la fila, solo cuando cambia el ESTADO.
    expect(campo.attributes, 'no puede ser @updatedAt: no es la fecha de la fila').not.toContain(
      '@updatedAt',
    )
  })

  it('accountStatusChangedBy es un uuid OPCIONAL con su @map (R10)', () => {
    const campo = userField(rawSchema, 'accountStatusChangedBy') as PrismaField
    expect(campo, 'falta el campo User.accountStatusChangedBy').not.toBeNull()
    expect(campo.type).toBe('String')
    // R10: opcional a proposito. NULL = «lo cambio el sistema», nunca «se perdio el dato».
    expect(campo.isOptional, 'User.accountStatusChangedBy tiene que ser opcional (R10)').toBe(true)
    expect(campo.attributes).toContain('@db.Uuid')
    expect(campo.attributes).toContain('@map("account_status_changed_by")')
    // Sin default: nadie nace con autor.
    expect(campo.attributes).not.toMatch(/@default\(/)
  })

  it('las tres columnas van en ingles y snake_case (R4)', () => {
    for (const [campo, columna] of [
      ['accountStatus', 'account_status'],
      ['accountStatusChangedAt', 'account_status_changed_at'],
      ['accountStatusChangedBy', 'account_status_changed_by'],
    ] as const) {
      expect((userField(rawSchema, campo) as PrismaField).attributes).toContain(
        `@map("${columna}")`,
      )
      expect(columna, `${columna} tiene que ser snake_case en ingles`).toMatch(/^[a-z_]+$/)
    }
  })

  it('el estado lleva el indice de la FK del autor y NINGUNO sobre el estado (R19)', () => {
    const cuerpo = /^model\s+User\s*\{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? ''
    // El lado hijo de la FK, que Postgres no indexa solo: por ahi pasa el RESTRICT (R12).
    expect(cuerpo).toMatch(
      /@@index\(\[accountStatusChangedBy\],\s*map:\s*"users_account_status_changed_by_idx"\)/,
    )
    // Y NADA sobre `accountStatus`: no hay ninguna consulta que filtre por el (R19). El indice
    // lo anade quien estrene la consulta (QC-67), con su forma y su parcialidad.
    expect(cuerpo, 'nadie consulta por estado todavia (R19)').not.toMatch(
      /@@index\(\[accountStatus\]/,
    )
    expect(cuerpo).not.toMatch(/@@unique\([^)]*accountStatus/)
    expect((userField(rawSchema, 'accountStatus') as PrismaField).attributes).not.toMatch(
      /@unique/,
    )
  })
})

// --- El escalar y las relaciones -----------------------------------------------------------

describe('Prisma.dmmf — el autor del cambio es un ESCALAR, no una relacion (design.md > 1.3)', () => {
  it('accountStatusChangedBy no es campo de relacion en el cliente generado', () => {
    const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === 'User')
    expect(model, 'Prisma.dmmf no conoce el modelo User').toBeDefined()
    const campo = (
      model as { fields: readonly { name: string; kind: string }[] }
    ).fields.find((field) => field.name === 'accountStatusChangedBy')
    expect(campo, 'el cliente no conoce accountStatusChangedBy').toBeDefined()
    // `kind: 'scalar'` y no `'object'`: no habilita ningun `include` hacia la ficha del autor.
    expect((campo as { kind: string }).kind).toBe('scalar')
  })

  it('User NO gana ninguna relacion nueva: sigue apuntando a Company, DocumentType y Role', () => {
    // Es la guardia ajena que se protege eligiendo el escalar:
    // `tests/unit/proveedores/module-contract.test.ts` lleva esta MISMA igualdad exacta y no se
    // toca (`design.md > 5.3`). Si alguien "arregla" el esquema con una auto-relacion, `User`
    // aparece en su propia lista y los dos tests caen a la vez.
    // RETENSADO 2026-09-11 (QC-79): entra `CredentialSetupToken` -R11, el lado inverso de
    // `credential_setup_tokens.user_id`, que Prisma EXIGE para el `@relation` del enlace-.
    // Sigue siendo igualdad EXACTA sobre el conjunto entero, no un `toContain`.
    expect(relationTargets('User')).toEqual([
      'Company',
      'CredentialSetupToken',
      'DocumentType',
      'Role',
    ])
    expect(relationTargets('User')).not.toContain('User')
  })
})

// --- Sin historial -------------------------------------------------------------------------

describe('db/schema.prisma — solo el ULTIMO cambio, sin historial (R13)', () => {
  it('no hay tabla ni columna de cambios anteriores de estado, y el test cae si aparece', () => {
    expect(declaresStatusHistory(rawSchema)).toBe(false)

    // --- Sensibilidad: una tabla de historial cae.
    const conTabla = `${rawSchema}\n\nmodel UserAccountStatusHistory {\n  id String @id\n\n  @@map("user_account_status_history")\n}\n`
    expect(declaresStatusHistory(conTabla)).toBe(true)

    // Y una columna con el estado anterior sobre la propia fila, tambien: acumular es
    // exactamente lo que la decision cerrada 5 descarta.
    const conColumna = rawSchema.replace(
      /(\n\s+accountStatusChangedBy String\?)/,
      '\n  previousAccountStatus UserAccountStatus?$1',
    )
    expect(conColumna, 'la mutacion no anadio la columna').not.toBe(rawSchema)
    expect(declaresStatusHistory(conColumna)).toBe(true)
  })

  it('el modelo User sigue siendo del modulo identity', () => {
    // Anadir columnas no cambia al dueno; el bloque 10 de `guard-arquitectura-modulos` lo
    // exige declarado. Se afirma sobre el esquema CRUDO: `/// @module` ES un comentario.
    expect(rawSchema.replace(/\r\n/g, '\n')).toContain('/// @module identity\nmodel User {')
  })
})
