// T3 (QC-25) — Test de alcance, adelantado (`tasks.md > Grupo A`).
//
// Se escribe ANTES de que `domain/` se llene a proposito: es mientras se llena cuando el
// alcance se escapa (leccion de QC-20 T15, citada en `tasks.md`). Cubre R31, R41, R43, R44.
//
// Recorre el ARBOL DE ARCHIVOS y el TEXTO de `db/schema.prisma`, no el grafo de imports:
// por eso vive fuera de `tests/guards/` (esas guardias siguen imports; esto es una foto
// del disco). Ninguna aclaracion aqui hace un censo GLOBAL del repo -numero de modelos,
// de migraciones, etc.-: solo mide lo que la feature `recetas` garantiza sobre si misma
// (`design.md > 14`, quinto aviso).
//
// ACTUALIZADO 2026-09-03 (QC-26): el primer caso afirmaba «no existe ninguna pantalla,
// pagina ni componente de recetas»; esa era el LIMITE DE ALCANCE de QC-25 -«la pantalla es
// QC-26»-, no una invariante permanente. QC-26 la trajo, asi que la premisa cayo y el
// criterio se INVIERTE, no se borra ni se afloja: la pantalla de recetas tiene que existir
// EXACTAMENTE donde la ubica `FORMULAS_ROUTE` (`@/lib/shared/routes`) -nunca un literal
// escrito a mano, para que un cambio de ruta futuro mueva esta prueba con el mismo commit
// que la mueve de verdad- y en NINGUN otro sitio de `app/` ni de `components/`. Lo que
// seguia protegiendo de verdad ese caso -que no apareciera una ruta HTTP de recetas- ya
// estaba cubierto por el segundo caso de este archivo y sigue intacto ahi.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { FORMULAS_ROUTE } from '@/lib/shared/routes'

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

/** Recorre un directorio recursivamente y devuelve las rutas absolutas a archivos dados. */
function filesIn(dir: string, pattern: RegExp): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

describe('alcance de QC-25 (crud-de-recetas): sin route handler; la pantalla, solo la de QC-26', () => {
  it('la pantalla de recetas vive solo donde la declara QC-26, y en ningun otro sitio', () => {
    // CENTINELA INVERTIDO el 2026-09-03 (QC-26). Hasta hoy este caso afirmaba «no existe
    // ninguna pantalla, pagina ni componente de recetas»: la pantalla estaba DIFERIDA a
    // QC-26 (D23). QC-26 es precisamente la ficha que la construye, asi que esa premisa
    // dejo de ser cierta -mismo trato que recibio `tests/unit/inventario/scope.test.ts`
    // cuando QC-22 trajo la pantalla del catalogo-.
    //
    // Lo que R44 protegia de verdad no era la ausencia: era que la pantalla no apareciera
    // por goteo, repartida por el repositorio y sin ficha que la respalde. Eso sigue
    // vigente y es lo que este caso vigila ahora: la carpeta permitida se DERIVA de
    // `FORMULAS_ROUTE` (nunca de un literal escrito a mano, para que un cambio de ruta
    // arrastre esta prueba con el mismo commit que la mueve de verdad), la pantalla existe
    // ahi, y ni `app/` fuera de esa carpeta ni `components/` tienen una sola pieza de
    // recetas. Un `app/(private)/dashboard/recetas-algo.tsx` o un
    // `components/recipe-card.tsx` de manana -los dos sin ficha- ponen esto en rojo igual
    // que antes.
    const screenPattern = /recet|recipe/i

    // `FORMULAS_ROUTE` es '/produccion/formulas': la carpeta real cuelga de `app/(private)`
    // -el route group no aparece en la URL, pero si en el disco-.
    const routeSegments = FORMULAS_ROUTE.split('/').filter((segment) => segment.length > 0)
    const recipesRouteDir = join(repoRoot, 'app', '(private)', ...routeSegments)
    expect(routeSegments.length, 'FORMULAS_ROUTE no tiene segmentos').toBeGreaterThan(0)

    function matchingFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
        .filter((absolutePath) => screenPattern.test(absolutePath.slice(dir.length)))
    }

    // La pantalla EXISTE: si alguien la borra, el resto del caso pasaria en verde sobre un
    // repositorio sin pantalla de recetas, que es justo el falso verde que la inversion
    // tenia que evitar.
    expect(existsSync(join(recipesRouteDir, 'page.tsx')), `falta ${join(recipesRouteDir, 'page.tsx')}`).toBe(
      true,
    )

    const appMatches = matchingFiles(join(repoRoot, 'app'))
    const fueraDeSuCarpeta = appMatches.filter(
      (absolutePath) => relative(recipesRouteDir, absolutePath).startsWith(`..${sep}`),
    )
    expect(
      fueraDeSuCarpeta,
      `pantalla de recetas fuera de ${relative(repoRoot, recipesRouteDir)}/: ${fueraDeSuCarpeta.join(', ')}`,
    ).toEqual([])

    const componentMatches = matchingFiles(join(repoRoot, 'components'))
    expect(
      componentMatches,
      `componente de recetas encontrado bajo components/: ${componentMatches.join(', ')}`,
    ).toEqual([])

    // R44: el E2E de recetas estaba diferido a QC-26 (D23); esa mitad de la premisa tambien
    // cayo -QC-26 trajo `e2e/recetas.spec.ts`- y se invierte igual que las dos de arriba: la
    // lista es CERRADA, un segundo spec de recetas sin ficha pone esto en rojo.
    const e2eDir = join(repoRoot, 'e2e')
    const e2eMatches = matchingFiles(e2eDir).map((absolutePath) => relative(e2eDir, absolutePath).split(sep).join('/'))
    expect(e2eMatches, `spec E2E de recetas inesperado: ${e2eMatches.join(', ')}`).toEqual([
      'recetas.spec.ts',
    ])
  })

  it('las mutaciones de recetas son Server Actions y no hay ningun route handler bajo app/api', () => {
    // R39, R44: ninguna ruta HTTP de recetas, hoy ni nunca en esta feature. Falsable con
    // solo crear `app/api/recetas/route.ts` (o `recipes`): el `existsSync` pasa a `true` y
    // la asercion cae.
    const RECIPE_API_ROUTES = [join(repoRoot, 'app', 'api', 'recetas'), join(repoRoot, 'app', 'api', 'recipes')]
    for (const route of RECIPE_API_ROUTES) {
      expect(existsSync(route), `${route} no debe existir: las mutaciones son Server Actions`).toBe(
        false,
      )
    }

    // Todo archivo que aparezca en `adapters/driving/` (T13 lo llena) es una Server
    // Action, nunca un route handler disfrazado. Hoy la carpeta esta vacia (solo el
    // `.gitkeep`), asi que el bucle no itera nada TODAVIA -en cuanto T13 ponga el primer
    // archivo sin la directiva `'use server'` en la primera linea util, esta asercion cae.
    const drivingDir = join(repoRoot, 'lib', 'modules', 'recetas', 'adapters', 'driving')
    for (const file of filesIn(drivingDir, /\.tsx?$/)) {
      const source = readFileSync(file, 'utf8').trimStart()
      expect(source, `${file} debe declarar 'use server' en la primera linea`).toMatch(
        /^(['"])use server\1/,
      )
    }
  })

  it('el modulo recetas no reimplementa el calculo de paginacion', () => {
    // R31: `recetas` reutiliza `lib/shared/pagination.ts` (offset/limit/totalPages) y no
    // contiene ninguna aritmetica propia de desplazamiento, limite ni total de paginas.
    // Se busca en el TEXTO fuente de `lib/modules/recetas/**` (excluidos los tests, que
    // pueden mencionar la aritmetica al describir el comportamiento esperado del util) los
    // patrones que delatarian una reimplementacion: `Math.ceil`/`Math.floor` sobre un
    // total, `(page - 1) * algo` y una asignacion directa a `offset`/`totalPages`.
    const SUSPICIOUS_PATTERNS: readonly { readonly nombre: string; readonly pattern: RegExp }[] = [
      { nombre: 'Math.ceil sobre un total (calculo de totalPages a mano)', pattern: /Math\.ceil\(\s*total\b/ },
      { nombre: '(page - 1) * algo (calculo de offset a mano)', pattern: /\(\s*page\s*-\s*1\s*\)\s*\*/ },
      { nombre: 'multiplicacion directa por pageSize (calculo de offset/limit a mano)', pattern: /\*\s*pageSize\b|\bpageSize\s*\*/ },
    ]

    const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')
    const hallazgos: string[] = []
    for (const file of filesIn(recetasDir, /\.tsx?$/)) {
      const source = readFileSync(file, 'utf8')
      for (const { nombre, pattern } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(source)) hallazgos.push(`${file}: ${nombre}`)
      }
    }

    expect(
      hallazgos,
      `lib/modules/recetas/** parece reimplementar la aritmetica de paginacion en vez de ` +
        `usar lib/shared/pagination.ts: ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('ningun test importa @supabase/storage-js ni el adaptador de Storage', () => {
    // R43: la verificacion de esta feature corre sin red y sin bucket. Ningun archivo bajo
    // `tests/` puede importar la libreria del cliente ni el adaptador driven que la usa
    // -eso obligaria a un doble/mock explicito, que es justo lo que R43 exige en su lugar-.
    const testsDir = join(repoRoot, 'tests')
    const selfPath = fileURLToPath(import.meta.url) // este mismo archivo cita los patrones a proposito
    const hallazgos: string[] = []
    for (const file of filesIn(testsDir, /\.tsx?$/)) {
      if (file === selfPath) continue
      const source = readFileSync(file, 'utf8')
      const importsStorageJs = /from\s+['"]@supabase\/storage-js['"]|require\(\s*['"]@supabase\/storage-js['"]\s*\)/.test(
        source,
      )
      const importsStorageAdapter = /recipe-image-supabase/.test(source)
      if (importsStorageJs) hallazgos.push(`${file}: importa @supabase/storage-js`)
      if (importsStorageAdapter) hallazgos.push(`${file}: importa el adaptador de Storage`)
    }

    expect(
      hallazgos,
      `Tests que dependen del Storage real (deben usar un doble del puerto): ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('esta feature no anade ninguna columna, indice ni restriccion a recipes ni a recipe_lines', () => {
    // R41: el esquema de `recipes` y `recipe_lines` lo dejo QC-24 y esta ficha lo consume
    // tal cual. Es una afirmacion DESCRIPTIVA sobre el archivo actual, ligada al CONJUNTO
    // DE NOMBRES de columna de `Recipe`/`RecipeLine` (y a sus `@@unique`/`@@index`/`@@map`
    // completos) -no un censo global del schema-: si alguien anade, quita o renombra una
    // columna, un indice o una restriccion de estos DOS modelos, esta prueba cae.
    //
    // Se compara solo el NOMBRE de cada campo de columna, no su declaracion entera (tipo,
    // atributos, `@map`, etc.): comparar la linea completa es fragil ante cambios legitimos
    // de una ficha vecina que no tocan el ALCANCE que R41 vigila -p. ej. QC-32 cambiando
    // `unit String` por `unitId String @db.Uuid` ya rompio esta prueba una vez sin que R41
    // se hubiera violado-. Las lineas `@@...` (restricciones e indices compuestos) SI se
    // comparan completas: ahi el valor de la prueba esta en la restriccion exacta, no solo
    // en su nombre.
    //
    // NOTA (2026-09-03): `RecipeLine.unit` (texto) paso a `RecipeLine.unitId` (UUID, FK al
    // catalogo de `unidades`, R50) cuando QC-32 se mergeo a `dev` a mitad de la
    // implementacion de esta ficha. NO es una regresion de R41: esta feature (QC-25) no
    // anadio la columna, la trajo QC-32 por su cuenta; este test solo se actualiza para
    // reflejar el estado REAL y correcto del schema tras ese merge -"design.md > 14"
    // preveia que QC-32 lo actualizaria, pero por el orden real del merge quedo pendiente
    // hasta este cierre.
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    function bodyOfModel(model: string): string {
      const match = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`, 'm').exec(schema)
      if (!match) throw new Error(`no se encontro "model ${model}" en db/schema.prisma`)
      return match[1]
    }

    /** Lineas no vacias, sin comentarios, con espacios internos colapsados a uno solo. */
    function normalizedLines(body: string): string[] {
      return body
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0 && !line.startsWith('//'))
    }

    /**
     * Para una linea de restriccion (`@@...`) la deja tal cual -ahi importa la declaracion
     * completa-; para una linea de campo se queda solo con la PRIMERA palabra, su nombre
     * (R41 solo exige que no se anada/quite/renombre una columna, no que su tipo o sus
     * atributos no cambien por una razon legitima de otra ficha).
     */
    function fieldNamesOf(lines: readonly string[]): string[] {
      return lines.map((line) => (line.startsWith('@@') ? line : (line.split(' ')[0] as string)))
    }

    const EXPECTED_RECIPE_FIELDS = [
      'id',
      'name',
      'nameNormalized',
      'description',
      'steps',
      'imagePath',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'lines',
      '@@index([createdBy], map: "recipes_created_by_idx")',
      '@@index([updatedBy], map: "recipes_updated_by_idx")',
      '@@map("recipes")',
    ]

    const EXPECTED_RECIPE_LINE_FIELDS = [
      'id',
      'recipeId',
      'productId',
      'quantity',
      'unitId',
      'createdAt',
      'updatedAt',
      'recipe',
      '@@unique([recipeId, productId], map: "recipe_lines_recipe_id_product_id_key")',
      '@@index([productId], map: "recipe_lines_product_id_idx")',
      '@@index([unitId], map: "recipe_lines_unit_id_idx")',
      '@@map("recipe_lines")',
    ]

    expect(
      fieldNamesOf(normalizedLines(bodyOfModel('Recipe'))),
      'model Recipe gano, perdio o renombro un campo, indice o restriccion respecto al estado que dejo QC-24',
    ).toEqual(EXPECTED_RECIPE_FIELDS)
    expect(
      fieldNamesOf(normalizedLines(bodyOfModel('RecipeLine'))),
      'model RecipeLine gano, perdio o renombro un campo, indice o restriccion respecto al estado que dejo QC-24',
    ).toEqual(EXPECTED_RECIPE_LINE_FIELDS)
  })
})
