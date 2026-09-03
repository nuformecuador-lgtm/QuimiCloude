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
//
// **2026-09-03 (QC-22, pantalla-de-productos):** el segundo caso se INVIRTIO. Afirmaba que no
// existia pantalla de catalogo porque estaba diferida a QC-22; QC-22 la construyo, asi que la
// premisa cayo. El motivo entero y que sigue vigilando, dentro del propio caso.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

describe('alcance de QC-20 (crud-de-productos): sin route handlers; la pantalla, solo la de QC-22', () => {
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

  it('la pantalla del catalogo vive solo donde la declara QC-22, y en ningun otro sitio', () => {
    // CENTINELA INVERTIDO el 2026-09-03 (QC-22, pantalla-de-productos).
    //
    // Hasta hoy este caso afirmaba, por R34 de QC-20, que «no existe ninguna pantalla, pagina
    // ni componente de productos, ni spec E2E nuevo»: la pantalla del catalogo estaba
    // DIFERIDA a QC-22. QC-22 es precisamente la ficha que la construye, asi que esa premisa
    // dejo de ser cierta y el centinela se **invierte, no se borra ni se salta**. Es el mismo
    // trato que recibieron `tests/unit/private-layout.test.tsx` y
    // `tests/unit/sidebar-mobile.test.tsx` en esta feature.
    //
    // Lo que R34 protegia de verdad NO era la ausencia: era que la pantalla del catalogo no
    // apareciese por goteo, repartida por el repositorio y sin ficha que la respalde. Eso
    // sigue vigente y es lo que este caso vigila ahora: la pantalla existe, vive ENTERA bajo
    // su carpeta de ruta (`app/(private)/inventario/`), `components/` sigue sin una sola
    // pieza de catalogo, y el unico spec E2E del catalogo es el que trae QC-22. Un
    // `app/(private)/products/page.tsx` o un `components/product-table.tsx` de manana —los
    // dos sin ficha— ponen esto en rojo igual que antes.
    //
    // Lo que QC-20 afirmaba sobre SU PROPIO alcance no se pierde: sigue siendo cierto que
    // QC-20 no trajo pantalla, y el primer caso de este archivo (R29, sin route handlers)
    // queda intacto.

    // Se busca la palabra en la RUTA COMPLETA (no solo en el nombre del archivo): una carpeta
    // de ruta de Next como `app/(private)/products/page.tsx` delata el catalogo por el nombre
    // de carpeta, no del archivo (`page.tsx` es generico), y hay que cazarla igual.
    // `inventario` entra en el patron porque es el nombre de la ruta real del catalogo: sin el,
    // ni `app/(private)/inventario/page.tsx` ni `e2e/inventario.spec.ts` casarian y la mitad de
    // esta guardia no miraria nada.
    const screenPattern = /product|presentation|inventario/i

    /** Rutas relativas al directorio barrido, en POSIX, para comparar sin depender del SO. */
    function matchingFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath ?? entry.path, entry.name)))
        .map((relPath) => relPath.split(sep).join('/'))
        .filter((relPath) => screenPattern.test(relPath))
        .sort()
    }

    // La pantalla EXISTE: si alguien la borra, esto cae. Sin este assert, el resto del caso
    // pasaria en verde sobre un repositorio sin catalogo, que es justo el falso verde que la
    // inversion tenia que evitar.
    const CATALOG_ROUTE_DIR = join('(private)', 'inventario').split(sep).join('/')
    const appMatches = matchingFiles(join(repoRoot, 'app'))
    expect(appMatches, 'la pantalla del catalogo de QC-22 no aparece bajo app/').toContain(
      `${CATALOG_ROUTE_DIR}/page.tsx`,
    )

    // Y vive ENTERA ahi: ni una pieza de catalogo suelta en otra ruta de `app/`.
    const fueraDeSuCarpeta = appMatches.filter(
      (relPath) => !relPath.startsWith(`${CATALOG_ROUTE_DIR}/`),
    )
    expect(
      fueraDeSuCarpeta,
      `pantalla de catalogo fuera de app/${CATALOG_ROUTE_DIR}/: ${fueraDeSuCarpeta.join(', ')}`,
    ).toEqual([])

    // Esta mitad de R34 sigue INTACTA y en negativo: QC-22 monto sus piezas dentro de la
    // carpeta de ruta, asi que `components/` (compartido entre pantallas) no gano ninguna.
    const componentMatches = matchingFiles(join(repoRoot, 'components'))
    expect(
      componentMatches,
      `componente de catalogo encontrado bajo components/: ${componentMatches.join(', ')}`,
    ).toEqual([])

    // El E2E del catalogo dejo de estar diferido (D4 de QC-20 queda superada por QC-22), pero
    // la lista es CERRADA: un segundo spec de catalogo sin ficha pone esto en rojo.
    const e2eMatches = matchingFiles(join(repoRoot, 'e2e'))
    expect(e2eMatches, `spec E2E de catalogo inesperado: ${e2eMatches.join(', ')}`).toEqual([
      'inventario.spec.ts',
    ])
  })
})
