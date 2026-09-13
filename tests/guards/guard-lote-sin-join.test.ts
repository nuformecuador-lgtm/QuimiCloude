// QC-102 T17 — Guardia: la consulta EN LOTE de responsables NO navega ninguna relacion entre
// `orders` y `order_assignments` (R5).
//
// R4 y R5 son dos requisitos DISTINTOS porque se rompen de dos maneras distintas: R4 cuenta
// CONSULTAS —y un `join` lo pasaria en verde— y R5 prohibe NAVEGAR una relacion. Esta guardia es la
// mitad de R5, y vigila las dos unicas formas que tendria de colarse:
//
//   (a) una `@relation` entre `Order` y `OrderAssignment` en `db/schema.prisma`. QC-33 dejo las FK
//       de `orders` como escalares SIN `@relation` justamente para que no hubiera relacion que
//       navegar ni por descuido, y QC-86 hizo lo mismo con `order_assignments`. Declararla no
//       rompe nada por si sola: habilita el `include` que R5 prohibe, y por eso se caza antes.
//   (b) un `include` en cualquier consulta de `lib/modules/asignaciones/**`. El modulo compone
//       SIEMPRE en memoria, con los identificadores ya leidos (el mismo patron con el que
//       `list-orders.ts` resuelve `recipeName`), asi que un `include` aqui solo puede significar
//       que alguien decidio traerse el pedido —o la persona, o el grupo— por una relacion.
//
// Patron de `tests/guards/` (QC-9 R21): detectores PUROS exportados, cada regla demostrada con un
// fuente SINTETICO que la viola y con su simetrico correcto, y ademas los fuentes REALES MUTADOS,
// para que la guardia demuestre que MUERE y no solo que pasa en verde.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
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
const SCHEMA = join(repoRoot, 'db', 'schema.prisma')
const MODULO = join(repoRoot, 'lib', 'modules', 'asignaciones')

/** Los DOS modelos que R5 prohibe atar. Se nombran aqui y en ningun otro sitio. */
const MODELO_PEDIDO = 'Order'
const MODELO_ASIGNACION = 'OrderAssignment'

// ---------------------------------------------------------------------------
// (a) Ninguna `@relation` entre `orders` y `order_assignments` en el esquema
// ---------------------------------------------------------------------------

/** Cuerpo de un `model X { ... }` del esquema, o `null` si ese modelo no existe. */
export function modelBody(schema: string, model: string): string | null {
  const inicio = new RegExp(`^model\\s+${model}\\s*\\{`, 'm').exec(schema)
  if (inicio === null) return null
  const desde = inicio.index + inicio[0].length
  const fin = schema.indexOf('\n}', desde)
  return fin === -1 ? schema.slice(desde) : schema.slice(desde, fin)
}

/** Quita los comentarios `///` y `//` del esquema: se vigila el CODIGO, no la prosa —que nombra
 *  las dos tablas juntas justo para explicar por que NO estan relacionadas—. */
export function stripPrismaComments(schema: string): string {
  return schema
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
}

/**
 * Hallazgos de (a): un campo del modelo del pedido cuyo TIPO sea el de la asignacion, o al reves.
 * Se mira el tipo del campo y no la palabra `@relation`, porque Prisma infiere la relacion sin ese
 * atributo en el lado de la lista (`assignments OrderAssignment[]` ya es navegable).
 */
export function findSchemaRelationFindings(schema: string): readonly string[] {
  const limpio = stripPrismaComments(schema)
  const findings: string[] = []
  const pares: ReadonlyArray<readonly [string, string]> = [
    [MODELO_PEDIDO, MODELO_ASIGNACION],
    [MODELO_ASIGNACION, MODELO_PEDIDO],
  ]
  for (const [modelo, otro] of pares) {
    const cuerpo = modelBody(limpio, modelo)
    if (cuerpo === null) continue
    const campos = cuerpo.matchAll(/^\s*(\w+)\s+(\w+)(\[\])?(\?)?/gm)
    for (const campo of campos) {
      if (campo[2] !== otro) continue
      findings.push(
        `db/schema.prisma: model ${modelo} declara el campo '${campo[1]}' de tipo ${otro}: es una relacion navegable entre pedidos y asignaciones (R5)`,
      )
    }
    if (/@relation/.test(cuerpo) && new RegExp(`\\b${otro}\\b`).test(cuerpo)) {
      findings.push(
        `db/schema.prisma: model ${modelo} declara una @relation que nombra ${otro} (R5)`,
      )
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (b) Ningun `include` en `lib/modules/asignaciones/**`
// ---------------------------------------------------------------------------

/** Igual que en `module-contract.test.ts`: primero los comentarios de LINEA y despues los de
 *  BLOQUE, y con `[^\n]` para que funcione tambien con CRLF. */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Hallazgos de (b): cualquier `include:` en el codigo del modulo. El modulo compone en memoria;
 *  no tiene ningun uso legitimo de `include`. */
export function findIncludeFindings(
  files: ReadonlyArray<{ relPath: string; content: string }>,
): readonly string[] {
  return files
    .filter((file) => /\binclude\s*:/.test(stripComments(file.content)))
    .map((file) => `${file.relPath}: usa 'include' para traerse datos por una relacion (R5)`)
}

// ---------------------------------------------------------------------------
// Datos reales del repo
// ---------------------------------------------------------------------------

function sourcesIn(absDir: string): readonly string[] {
  if (!existsSync(absDir)) return []
  const salida: string[] = []
  for (const name of readdirSync(absDir)) {
    const full = join(absDir, name)
    if (statSync(full).isDirectory()) salida.push(...sourcesIn(full))
    else if (/\.tsx?$/.test(name)) salida.push(full)
  }
  return salida.sort()
}

const schemaReal = readFileSync(SCHEMA, 'utf8')
const fuentesDelModulo = sourcesIn(MODULO).map((file) => ({
  relPath: relative(repoRoot, file).split(sep).join('/'),
  content: readFileSync(file, 'utf8'),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('(a) el esquema real no ata `orders` con `order_assignments` (R5)', () => {
  it('los dos modelos existen y ninguno declara un campo del otro', () => {
    expect(modelBody(schemaReal, MODELO_PEDIDO)).not.toBeNull()
    expect(modelBody(schemaReal, MODELO_ASIGNACION)).not.toBeNull()
    expect(findSchemaRelationFindings(schemaReal)).toEqual([])
  })

  it('MUERE si se muta el esquema REAL: una lista de asignaciones en el pedido es un hallazgo', () => {
    // Mutacion del archivo de verdad, no de un fuente inventado: es lo que demuestra que la
    // guardia vigila ESTE esquema y no una copia que se quedo vieja.
    const mutado = schemaReal.replace(
      /^model Order \{$/m,
      'model Order {\n  assignments        OrderAssignment[]',
    )
    expect(mutado).not.toBe(schemaReal)

    const findings = findSchemaRelationFindings(mutado)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain("model Order declara el campo 'assignments'")
  })

  it('MUERE tambien por el otro lado: un `order Order @relation(...)` en la asignacion', () => {
    const mutado = schemaReal.replace(
      /^model OrderAssignment \{$/m,
      'model OrderAssignment {\n  order         Order    @relation(fields: [orderId], references: [id])',
    )
    expect(mutado).not.toBe(schemaReal)

    expect(findSchemaRelationFindings(mutado).join(' | ')).toContain('model OrderAssignment')
  })

  it('no confunde la PROSA con la infraccion: los comentarios pueden nombrar las dos tablas', () => {
    const sintetico = [
      'model Order {',
      '  id String @id',
      '  /// Aqui NO hay ninguna relacion con OrderAssignment, y es deliberado.',
      '  // Tampoco con OrderAssignment[] ni con @relation.',
      '}',
      '',
      'model OrderAssignment {',
      '  orderId String',
      '}',
    ].join('\n')

    expect(findSchemaRelationFindings(sintetico)).toEqual([])
  })
})

describe('(b) `lib/modules/asignaciones/**` no usa ningun `include` (R5)', () => {
  it('el modulo real tiene fuentes y ninguno usa `include`', () => {
    expect(fuentesDelModulo.length).toBeGreaterThan(0)
    expect(findIncludeFindings(fuentesDelModulo)).toEqual([])
  })

  it('MUERE si se muta el adaptador REAL: un `include` en la consulta en lote es un hallazgo', () => {
    const adaptador = fuentesDelModulo.find((file) =>
      file.relPath.endsWith('adapters/driven/persistence/order-assignment-prisma.ts'),
    )
    expect(adaptador, 'no se encontro el adaptador driven de asignaciones').toBeDefined()

    const mutado = {
      relPath: (adaptador as { relPath: string }).relPath,
      content: (adaptador as { content: string }).content.replace(
        'select: { ...ASSIGNMENT_SELECT, orderId: true },',
        'include: { order: true },',
      ),
    }
    expect(mutado.content).not.toBe((adaptador as { content: string }).content)

    expect(findIncludeFindings([mutado])).toEqual([
      `${mutado.relPath}: usa 'include' para traerse datos por una relacion (R5)`,
    ])
  })

  it('un `include` escrito solo en un COMENTARIO no es un hallazgo', () => {
    const sintetico = [
      '// Nada de `include:` aqui: la composicion es en memoria (R5).',
      '/* ni siquiera include: { order: true } dentro de un bloque */',
      'export const x = { select: { userId: true } };',
    ].join('\n')

    expect(findIncludeFindings([{ relPath: 'sintetico.ts', content: sintetico }])).toEqual([])
  })
})
