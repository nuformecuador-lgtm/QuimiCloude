// T15 — Test de alcance de QC-20 (crud-de-productos).
//
// QC-14 sembro un test de alcance parecido (`tests/unit/inventario/schema/inventario-schema.test.ts`)
// que afirmaba que el modulo `inventario` seguia siendo el slot vacio de QC-15: sin
// adaptadores driving, sin domain, con el contrato en `export {};`. QC-20 es precisamente
// la ficha que le da contenido a ese modulo (R31, R34), asi que esas tres clausulas ya no
// podian seguir vivas ahi. Este archivo hereda, adaptada, la unica que QC-20 SI puede
// seguir cumpliendo: que las mutaciones del catalogo entran como Server Actions bajo
// `adapters/driving/`, nunca como route handler bajo `app/api/`.
//
// Recorre el ARBOL DE ARCHIVOS, no el grafo de imports: por eso vive fuera de
// `tests/guards/` (esas guardias siguen imports; esto es una foto del disco).
//
// Cubre R29, R34.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

/** Rutas del catalogo bajo `app/api/`: ninguna debe existir, la migracion NUNCA lo permite. */
const CATALOG_API_ROUTES = [
  join(repoRoot, 'app', 'api', 'products'),
  join(repoRoot, 'app', 'api', 'presentations'),
  join(repoRoot, 'app', 'api', 'inventario'),
]

/** Recorre un directorio recursivamente y devuelve las rutas absolutas a archivos `.ts`/`.tsx`. */
function typescriptFilesIn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

describe('alcance de QC-20 (crud-de-productos): sin route handlers, sin pantalla, sin E2E nuevo', () => {
  it('las mutaciones del catalogo son Server Actions y no hay ningun route handler bajo app/api', () => {
    // R29, parte 1: ninguna ruta HTTP del catalogo, hoy ni nunca en esta feature. Falsable
    // con solo crear `app/api/products/route.ts` (o `presentations`/`inventario`): el
    // `existsSync` pasa a `true` y la asercion cae.
    for (const route of CATALOG_API_ROUTES) {
      expect(existsSync(route), `${route} no debe existir: las mutaciones son Server Actions`).toBe(
        false,
      )
    }

    // R29, parte 2: todo archivo que aparezca en `adapters/driving/` (T12 lo llena) es una
    // Server Action, nunca un route handler disfrazado. Hoy la carpeta esta vacia (solo el
    // `.gitkeep` de QC-15), asi que el bucle no itera nada TODAVIA — pero en cuanto T12
    // ponga el primer archivo sin la directiva `'use server'` en la primera linea util, esta
    // asercion cae. Es la misma tecnica que usa `identity` para sus propias Server Actions.
    const drivingDir = join(repoRoot, 'lib', 'modules', 'inventario', 'adapters', 'driving')
    for (const file of typescriptFilesIn(drivingDir)) {
      const source = readFileSync(file, 'utf8').trimStart()
      expect(source, `${file} debe declarar 'use server' en la primera linea`).toMatch(
        /^(['"])use server\1/,
      )
    }
  })

  it('no existe ninguna pantalla, pagina ni componente de productos, ni spec E2E nuevo', () => {
    // R34: la pantalla del catalogo es QC-22, no esta feature. Se busca la palabra en la
    // RUTA COMPLETA (no solo en el nombre del archivo): una carpeta de ruta de Next como
    // `app/(private)/products/page.tsx` delata el catalogo por el nombre de carpeta, no del
    // archivo (`page.tsx` es generico), y hay que cazarla igual.
    const screenPattern = /product|presentation/i

    function matchingFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
        .filter((absolutePath) => screenPattern.test(absolutePath.slice(dir.length)))
    }

    const appMatches = matchingFiles(join(repoRoot, 'app'))
    const componentMatches = matchingFiles(join(repoRoot, 'components'))
    expect(appMatches, `pantalla de catalogo encontrada bajo app/: ${appMatches.join(', ')}`).toEqual([])
    expect(
      componentMatches,
      `componente de catalogo encontrado bajo components/: ${componentMatches.join(', ')}`,
    ).toEqual([])

    // R34 (D4): el E2E del catalogo queda diferido, ningun spec nuevo bajo e2e/.
    const e2eMatches = matchingFiles(join(repoRoot, 'e2e'))
    expect(e2eMatches, `spec E2E de catalogo encontrado: ${e2eMatches.join(', ')}`).toEqual([])
  })
})
