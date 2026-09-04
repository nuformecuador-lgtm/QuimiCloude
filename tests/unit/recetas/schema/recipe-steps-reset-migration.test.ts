// T11 — Contrato estatico del SQL de la migracion `recipe_steps_reset` (QC-62 R14, R15, R16).
//
// Esta migracion no la genero Prisma y no hay drift de esquema que la respalde: la carpeta se
// escribio a mano (`design.md > 4`). Nada del toolchain la vigila, asi que la unica guardia que
// tiene es este archivo.
//
// Mismo metodo que `recetas-migration.test.ts`: cada afirmacion se escribe como un PREDICADO
// reutilizable y se aplica dos veces, al SQL real y a una version MUTADA EN MEMORIA (el archivo
// en disco no se toca). Las dos mutaciones obligatorias son "anadir WHERE deleted_at IS NULL"
// -que dejaria fuera a las recetas borradas logicamente, incumpliendo R14- y "convertir el
// UPDATE en un no-op" -que aparentaria borrar sin borrar-. Un test que no puede fallar no
// vigila nada.

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260904181500_recipe_steps_reset')

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas. */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

// --- Predicados reutilizables: los mismos que usan los tests de sensibilidad de abajo ---

/**
 * ¿La sentencia deja `recipes.steps` en la lista JSON vacia? (R14, R16)
 *
 * En positivo Y en negativo: no basta con que aparezca `UPDATE "recipes"`, tiene que asignar a
 * ESA columna un `'[]'` y no cualquier otro valor -un `steps` a `steps` seria un no-op-.
 */
function vaciaLosPasos(statement: string): boolean {
  return /^UPDATE "?recipes"? SET "?steps"? = '\[\]'(::jsonb)? *$/i.test(statement)
}

/** ¿La sentencia alcanza a TODAS las filas, sin filtro que deje ninguna fuera? (R14) */
function alcanzaTodasLasFilas(statement: string): boolean {
  return !/\bWHERE\b/i.test(statement)
}

/** ¿La sentencia toca la ESTRUCTURA de la base en vez de solo los datos? (R16) */
function tocaElEsquema(statement: string): boolean {
  return /\b(CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN|DROP\s+(TABLE|COLUMN)|CREATE\s+INDEX)\b/i.test(
    statement,
  )
}

/** ¿La sentencia intenta restaurar algo -leer de otro sitio y volcarlo-? (R15) */
function intentaRestaurar(statement: string): boolean {
  return /\b(SELECT|INSERT\s+INTO|COPY|RESTORE)\b/i.test(statement)
}

describe('migration.sql de recipe_steps_reset — el UP borra los pasos de TODAS (R14)', () => {
  it('la unica sentencia del UP deja recipes.steps en la lista vacia', () => {
    expect(up).toHaveLength(1)
    expect(vaciaLosPasos(up[0] as string)).toBe(true)

    // Sensibilidad: un UPDATE que se asigna a si mismo es un no-op disfrazado de borrado, y el
    // predicado tiene que verlo. Mutacion EN MEMORIA, el archivo en disco no se toca.
    const noOp = (up[0] as string).replace("'[]'::jsonb", '"steps"')
    expect(noOp, 'la mutacion no se aplico: cambio el texto de la migracion').not.toBe(up[0])
    expect(vaciaLosPasos(noOp)).toBe(false)

    // Y tampoco vale dejar otra cosa dentro: R14 dice lista VACIA, no "algo por defecto".
    const otroValor = (up[0] as string).replace("'[]'", `'[{"blocks": []}]'`)
    expect(vaciaLosPasos(otroValor)).toBe(false)

    // Ni tocar otra tabla: el borrado es de `recipes`.
    const otraTabla = (up[0] as string).replace('"recipes"', '"recipe_lines"')
    expect(vaciaLosPasos(otraTabla)).toBe(false)
  })

  it('el UP no lleva WHERE: alcanza tambien a las recetas borradas logicamente', () => {
    expect(alcanzaTodasLasFilas(up[0] as string)).toBe(true)

    // Sensibilidad, la mutacion que da nombre a R14: filtrar por vivas dejaria con pasos a las
    // borradas logicamente, que es exactamente lo que el requisito prohibe.
    const conFiltro = `${up[0] as string} WHERE "deleted_at" IS NULL`
    expect(conFiltro).not.toBe(up[0])
    expect(alcanzaTodasLasFilas(conFiltro)).toBe(false)
    expect(vaciaLosPasos(conFiltro)).toBe(false)
  })

  it('el UP no convierte ningun paso guardado a la nueva forma', () => {
    // R14 y decision cerrada 5: no se convierte, se BORRA. Cualquier lectura de la columna
    // vieja para reescribirla seria una conversion.
    expect(intentaRestaurar(up[0] as string)).toBe(false)
    expect(upSource).not.toMatch(/jsonb_build_object|jsonb_agg|->>|\bbody\b/i)
  })
})

describe('down.sql de recipe_steps_reset — la reversion es honesta (R15)', () => {
  it('el down.sql existe, deja steps en la lista vacia y no restaura nada', () => {
    expect(down).toHaveLength(1)
    expect(vaciaLosPasos(down[0] as string)).toBe(true)
    expect(alcanzaTodasLasFilas(down[0] as string)).toBe(true)
    // No hay copia de los pasos anteriores en ninguna parte: revertir no puede leer de ningun
    // sitio, y fingir que restaura seria peor que no revertir.
    expect(intentaRestaurar(down[0] as string)).toBe(false)

    // Sensibilidad del predicado de restauracion, sobre el mismo SQL mutado.
    const fingeRestaurar = `${down[0] as string} FROM (SELECT 1) AS copia`
    expect(intentaRestaurar(fingeRestaurar)).toBe(true)
  })

  it('el down.sql declara POR ESCRITO que el borrado es irreversible', () => {
    // R15 exige que la reversion lo declare, no solo que no restaure: el comentario es parte
    // del requisito, asi que se afirma sobre la fuente SIN despojarla de comentarios.
    expect(downSource).toMatch(/IRREVERSIBLE/i)
    expect(downSource).toMatch(/no hay (nada que restaurar|copia)/i)
    // Y la declaracion tiene que estar en un comentario SQL, no ser una sentencia rota.
    expect(stripSqlComments(downSource)).not.toMatch(/IRREVERSIBLE/i)
  })
})

describe('recipe_steps_reset no toca el esquema (R16)', () => {
  it('ni el UP ni el DOWN contienen CREATE TABLE, ALTER TABLE ni ADD COLUMN', () => {
    for (const statement of [...up, ...down]) {
      expect(tocaElEsquema(statement), `esta sentencia toca el esquema: ${statement}`).toBe(false)
    }

    // Sensibilidad: si alguien colara un ALTER en cualquiera de los dos archivos, el predicado
    // tiene que verlo.
    expect(tocaElEsquema('ALTER TABLE "recipes" ADD COLUMN "step_order" INTEGER')).toBe(true)
    expect(tocaElEsquema('CREATE TABLE "recipe_steps" ("id" UUID)')).toBe(true)
  })

  it('Recipe.steps sigue siendo un unico campo Json en schema.prisma', () => {
    // La columna ya existe desde QC-24 R4 y esta ficha NO abre `db/schema.prisma`: si alguien
    // lo abriera para modelar el paso, este test lo delata.
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
    expect(schema).toMatch(/^\s*steps\s+Json\b/m)
    expect(schema).not.toMatch(/model\s+RecipeStep\b/)
    expect(schema).not.toMatch(/@@map\("recipe_steps"\)/)
  })
})
