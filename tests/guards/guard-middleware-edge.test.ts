// QC-9 T15 — Guardia: lo que el middleware arrastra al BORDE (`design.md > 9`, R4, R15).
//
// El runtime del borde no tiene `node:crypto`, ni Prisma, ni `next/headers`. Lo que decide si el
// middleware carga no es lo que importa `middleware.ts`, sino lo que importa **todo lo que el
// alcanza**: basta que un archivo a tres saltos de distancia traiga el cliente de Prisma para que
// el portero deje de existir en produccion. Por eso esta guardia recorre el CIERRE DE IMPORTS
// completo desde la raiz y no la primera capa.
//
// Por que es una guardia y no un test de comportamiento: el fallo no se ve ejecutando el
// middleware en Node —donde `node:crypto` existe y todo funciona—, se ve al desplegar. La
// propiedad es del grafo de imports del codigo fuente, asi que se comprueba sobre el codigo fuente.
//
// Mismo patron que las guardias que ya existen: `findRepoRoot`, funciones puras exportadas y casos
// SINTETICOS que la ponen roja, mas su simetrico que no. Un `expect(hallazgos).toEqual([])` sobre
// el repo real, solo, no demuestra que la regla dispare.

import { readFileSync, statSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
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

/** El archivo por el que Next entra: la raiz del cierre. */
export const ENTRY_POINT = 'middleware.ts'

/**
 * Paquetes que no existen —o no deben cargarse— en el runtime del borde. `next/headers` es el
 * caso sutil: existe, pero solo en el servidor Node, y arrastrarlo desde el middleware significa
 * que alguien esta leyendo la cookie por el camino equivocado (en el borde llega en la
 * `NextRequest`).
 */
export const FORBIDDEN_PACKAGES = ['node:crypto', 'crypto', '@prisma/client', 'next/headers'] as const

/**
 * Archivos internos prohibidos, SIN extension: el cliente Prisma compartido abre la base entera
 * desde el borde (R4). Se comparan sin extension porque un import que no resuelve a un archivo
 * real —el caso de los arboles sinteticos, y el de un import roto— llega aqui como
 * `lib/shared/db/prisma` a secas, y dejarlo escapar por eso seria el peor de los falsos verdes.
 */
export const FORBIDDEN_INTERNAL_FILES = ['lib/shared/db/prisma'] as const

/** Ruta sin extension `.ts`/`.tsx`, para comparar destinos resueltos y sin resolver por igual. */
function withoutExtension(relPath: string): string {
  return relPath.replace(/\.tsx?$/, '')
}

/**
 * Quita comentarios antes de buscar imports.
 *
 * **Los de linea PRIMERO, y no al reves como en las guardias mas viejas.** Si se quitan antes los
 * bloques, un comentario de linea que mencione una ruta con comodin abre un bloque falso que se
 * cierra en el siguiente JSDoc y se lleva por delante los imports que haya en medio: el archivo
 * parece no importar nada y la guardia pasa en verde sin haber mirado. Se ha visto de verdad al
 * escribir esta ficha, y es exactamente el modo de fallo que una guardia no puede permitirse.
 */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Todo especificador importado/reexportado/requerido por un archivo. */
export function extractImportSpecifiers(source: string): readonly string[] {
  const stripped = stripComments(source)
  const patterns = [
    /import\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  const specifiers: string[] = []
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) specifiers.push(match[1] as string)
  }
  return specifiers
}

/**
 * Resuelve un especificador visto desde `fromRel` (ruta POSIX relativa a la raiz). Devuelve el
 * paquete externo por su nombre, o el archivo interno al que apunta. Un import interno que no
 * resuelve a ningun archivo se devuelve igualmente como interno: tratarlo como externo lo dejaria
 * escapar de la regla en silencio.
 */
export function resolveSpecifier(
  fromRel: string,
  specifier: string,
  exists: (relPath: string) => boolean,
): { kind: 'external'; name: string } | { kind: 'internal'; relPath: string } {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
    return { kind: 'external', name: specifier }
  }
  const base = specifier.startsWith('@/')
    ? posix.normalize(specifier.slice(2))
    : posix.normalize(posix.join(posix.dirname(fromRel), specifier))

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, posix.join(base, 'index.ts')]) {
    if (exists(candidate)) return { kind: 'internal', relPath: candidate }
  }
  return { kind: 'internal', relPath: base }
}

/** Como se llego hasta un archivo, para que el hallazgo diga por donde entro lo prohibido. */
function formatChain(chain: readonly string[]): string {
  return chain.join(' -> ')
}

export type EdgeClosure = {
  /** Todos los archivos internos alcanzables desde el punto de entrada, incluido el. */
  readonly files: readonly string[]
  /** Un hallazgo por cada import prohibido, con la cadena que lleva hasta el. */
  readonly findings: readonly string[]
}

/**
 * Recorre el cierre de imports desde `entry` y devuelve los archivos alcanzados y los hallazgos.
 *
 * `readSource` devuelve el contenido de un archivo o `null` si no existe: eso es lo que permite
 * ejercitar la guardia con un arbol SINTETICO en memoria, sin escribir nada en el repo.
 */
export function walkEdgeClosure(
  entry: string,
  readSource: (relPath: string) => string | null,
): EdgeClosure {
  const exists = (relPath: string) => readSource(relPath) !== null
  const visited = new Set<string>()
  const findings: string[] = []

  function visit(relPath: string, chain: readonly string[]): void {
    if (visited.has(relPath)) return
    visited.add(relPath)

    const source = readSource(relPath)
    if (source === null) return

    for (const specifier of extractImportSpecifiers(source)) {
      const target = resolveSpecifier(relPath, specifier, exists)

      if (target.kind === 'external') {
        if ((FORBIDDEN_PACKAGES as readonly string[]).includes(target.name)) {
          findings.push(
            `${formatChain(chain)} importa '${target.name}', que no existe en el borde (R15)`,
          )
        }
        continue
      }

      if ((FORBIDDEN_INTERNAL_FILES as readonly string[]).includes(withoutExtension(target.relPath))) {
        findings.push(
          `${formatChain(chain)} importa '${target.relPath}', que abre la base desde el borde (R4)`,
        )
        continue
      }

      visit(target.relPath, [...chain, target.relPath])
    }
  }

  visit(entry, [entry])

  return { files: [...visited], findings }
}

/** Lector real: el arbol del repo. */
function readRepoSource(relPath: string): string | null {
  const absPath = join(repoRoot, relPath)
  try {
    if (statSync(absPath).isDirectory()) return null
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

describe('guardia: el middleware carga en el borde', () => {
  it('el cierre de imports desde middleware.ts no trae nada prohibido', () => {
    const { findings } = walkEdgeClosure(ENTRY_POINT, readRepoSource)

    expect(findings).toEqual([])
  })

  it('el cierre recorre de verdad la cadena y no se queda en el primer archivo', () => {
    // Si el recorrido se rompiera, el test de arriba pasaria en verde sin mirar nada. Esto ancla
    // que llega hasta el codec, que es donde vive el HMAC y el candidato numero uno a importar
    // `node:crypto`.
    const { files } = walkEdgeClosure(ENTRY_POINT, readRepoSource)

    expect(files).toContain('middleware.ts')
    expect(files).toContain('lib/modules/identity/adapters/driving/route-guard-middleware.ts')
    expect(files).toContain('lib/composition/edge.ts')
    expect(files).toContain('lib/modules/identity/adapters/driven/session/session-token.ts')
    // Y NO llega a la composicion Node, que es la que cablea Prisma.
    expect(files).not.toContain('lib/composition/index.ts')
  })
})

describe('guardia: casos sinteticos', () => {
  /** Arbol en memoria: `middleware.ts` -> `a.ts` -> `b.ts`, con lo que se le añada a `b.ts`. */
  function arbolDeTresSaltos(extraEnB: string) {
    const archivos = new Map<string, string>([
      ['middleware.ts', "export { middleware } from '@/a'"],
      ['a.ts', "import { b } from './b'\nexport const middleware = b"],
      ['b.ts', `${extraEnB}\nexport const b = 1`],
    ])
    return (relPath: string) => archivos.get(relPath) ?? null
  }

  it('caza next/headers a tres saltos del punto de entrada', () => {
    const { findings } = walkEdgeClosure('middleware.ts', arbolDeTresSaltos("import { cookies } from 'next/headers'"))

    expect(findings).toEqual([
      "middleware.ts -> a.ts -> b.ts importa 'next/headers', que no existe en el borde (R15)",
    ])
  })

  it('caza node:crypto y @prisma/client igual de lejos', () => {
    const cripto = walkEdgeClosure('middleware.ts', arbolDeTresSaltos("import { createHmac } from 'node:crypto'"))
    const prisma = walkEdgeClosure('middleware.ts', arbolDeTresSaltos("import { Prisma } from '@prisma/client'"))

    expect(cripto.findings).toHaveLength(1)
    expect(cripto.findings[0]).toContain("importa 'node:crypto'")
    expect(prisma.findings).toHaveLength(1)
    expect(prisma.findings[0]).toContain("importa '@prisma/client'")
  })

  it('caza el cliente Prisma compartido aunque se importe por alias', () => {
    const { findings } = walkEdgeClosure(
      'middleware.ts',
      arbolDeTresSaltos("import { prisma } from '@/lib/shared/db/prisma'"),
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('lib/shared/db/prisma')
  })

  it('el caso simetrico -- la misma cadena sin el import prohibido -- no produce hallazgos', () => {
    const { findings, files } = walkEdgeClosure('middleware.ts', arbolDeTresSaltos("import { z } from 'zod'"))

    expect(findings).toEqual([])
    expect(files).toEqual(['middleware.ts', 'a.ts', 'b.ts'])
  })

  it('no se cuelga con un ciclo de imports', () => {
    const ciclo = new Map<string, string>([
      ['middleware.ts', "import './a'"],
      ['a.ts', "import './middleware'\nimport { createHmac } from 'node:crypto'"],
    ])

    const { findings } = walkEdgeClosure('middleware.ts', (relPath) => ciclo.get(relPath) ?? null)

    expect(findings).toHaveLength(1)
  })
})
