// T5 — Guardia: propiedades ESTATICAS del modulo de credenciales (R8, R16, R17, R18).
//
// Las cuatro reglas miran TEXTO y ARBOL DE ARCHIVOS, no comportamiento: un test de reloj de
// pared para el tiempo constante es ruido estadistico (design.md > 6), y "quien importa el
// modulo desde Edge" es una propiedad del arbol que ningun test unitario puede observar.
//
// Cada regla se autocomprueba sobre fuentes SINTETICOS que la violan (mismo patron que las
// guardias de la feature 1). La regla 4 no tiene hoy ningun archivo Edge real que barrer: sin
// su caso sintetico seria un assert vacio disfrazado de proteccion.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
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
const modulePath = join(repoRoot, 'lib', 'utils', 'password-hash.ts')
const moduleSource = readFileSync(modulePath, 'utf8')

/** Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

function codeLines(source: string): readonly string[] {
  return stripComments(source)
    .split('\n')
    .filter((line) => line.trim().length > 0)
}

// ---------------------------------------------------------------------------------------
// Regla 1 — comparacion en tiempo constante (R8)
// ---------------------------------------------------------------------------------------

/** Un identificador que nombra material derivado: clave, digest o hash comparable. */
function mentionsKeyMaterial(line: string): boolean {
  return /\b[\w$]*(?:key|digest)[\w$]*\b/i.test(line)
}

/**
 * Dos exenciones, y las dos son deliberadas:
 * - `x.length`: comparar TAMANOS no filtra el contenido y design.md > 6 exige comprobar la
 *   longitud antes de llamar a `timingSafeEqual`, que lanza si difieren.
 * - `=== null` / `=== undefined`: una guarda de ausencia no compara material derivado.
 */
function normalizeForComparisonScan(line: string): string {
  return line
    .replace(/\b[A-Za-z_$][\w$.]*\.length\b/g, 'LONGITUD')
    .replace(/(?:===|!==|==|!=)\s*(?:null|undefined)\b/g, 'GUARDA_DE_AUSENCIA')
}

const SHORT_CIRCUIT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['comparacion con ==/===', /(?:===|!==|==(?!=)|!=(?!=))/],
  ['Buffer.compare', /\bBuffer\s*\.\s*compare\s*\(/],
  ['.equals(', /\.equals\s*\(/],
  ['localeCompare', /\blocaleCompare\s*\(/],
]

/** Lineas que comparan material derivado con algo que cortocircuita. */
export function findShortCircuitComparisons(source: string): readonly string[] {
  return codeLines(source).flatMap((line) => {
    const scanned = normalizeForComparisonScan(line)
    if (!mentionsKeyMaterial(scanned)) return []
    return SHORT_CIRCUIT_PATTERNS.filter(([, pattern]) => pattern.test(scanned)).map(
      ([name]) => `${name}: ${line.trim()}`,
    )
  })
}

export function usesConstantTimeComparison(source: string): boolean {
  return /\btimingSafeEqual\s*\(/.test(stripComments(source))
}

// ---------------------------------------------------------------------------------------
// Regla 2 — nada que bloquee el hilo (R16)
// ---------------------------------------------------------------------------------------

export function findBlockingCalls(source: string): readonly string[] {
  return [...stripComments(source).matchAll(/\b(scryptSync|pbkdf2Sync|randomFillSync)\b/g)].map(
    (match) => match[1] as string,
  )
}

// ---------------------------------------------------------------------------------------
// Regla 3 — ningun canal de salida (R17)
// ---------------------------------------------------------------------------------------

export function findOutputChannels(source: string): readonly string[] {
  return [
    ...stripComments(source).matchAll(/\b(console\s*\.\s*\w+|process\s*\.\s*std(?:out|err))\b/g),
  ].map((match) => (match[1] as string).replace(/\s+/g, ''))
}

// ---------------------------------------------------------------------------------------
// Regla 4 — frontera de runtime (R18)
// ---------------------------------------------------------------------------------------

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs'])

/**
 * Se barre lo que se DESPLIEGA (`app/`, `lib/`, `scripts/` y el `middleware.ts` de la raiz).
 * `tests/` queda fuera a proposito: un test no se ejecuta en el runtime Edge, y esta misma
 * guardia contiene fuentes sinteticos que la marcarian a si misma.
 */
const SCANNED_DIRS = ['app', 'lib', 'scripts'] as const

function listFiles(dir: string): readonly string[] {
  let entries: readonly string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      return IGNORED_DIRS.has(entry) ? [] : listFiles(full)
    }
    return SCANNED_EXTENSIONS.has(extname(entry)) ? [full] : []
  })
}

export function isEdgeSource(file: string, content: string): boolean {
  if (basename(file) === 'middleware.ts' || basename(file) === 'middleware.js') return true
  return /export\s+const\s+runtime\s*=\s*['"`]edge['"`]/.test(stripComments(content))
}

export function importsPasswordHashModule(content: string): boolean {
  return /(?:from|import|require)\s*\(?\s*['"`][^'"`]*password-hash['"`]/.test(stripComments(content))
}

/** Hallazgo si un fuente que corre en Edge alcanza el modulo Node-only. */
export function findEdgeImportsOfPasswordHash(file: string, content: string): readonly string[] {
  if (!isEdgeSource(file, content) || !importsPasswordHashModule(content)) return []
  return [`${file}: importa password-hash desde un fuente que corre en el runtime Edge`]
}

const deployedFiles = [
  ...SCANNED_DIRS.flatMap((dir) => listFiles(join(repoRoot, dir))),
  ...['middleware.ts', 'middleware.js'].map((name) => join(repoRoot, name)),
].filter((file) => {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
})

// ---------------------------------------------------------------------------------------

describe('guardia — modulo de credenciales', () => {
  it('la comparacion usa timingSafeEqual y no cortocircuita', () => {
    expect(usesConstantTimeComparison(moduleSource)).toBe(true)
    expect(findShortCircuitComparisons(moduleSource)).toEqual([])
  })

  it('la regla 1 detecta cada forma de comparacion que cortocircuita', () => {
    const conIgualdad = "const ok = derivedKey.toString('hex') === storedKey.toString('hex')"
    const conBufferCompare = 'const ok = Buffer.compare(derivedKey, storedKey) === 0'
    const conEquals = 'const ok = derivedKey.equals(storedKey)'
    const conLocaleCompare = 'const ok = derivedKey.toString().localeCompare(storedKey.toString()) === 0'

    for (const malo of [conIgualdad, conBufferCompare, conEquals, conLocaleCompare]) {
      expect(findShortCircuitComparisons(malo), malo).not.toEqual([])
    }
    expect(usesConstantTimeComparison(conIgualdad)).toBe(false)

    // Y no marca lo que design.md > 6 EXIGE hacer antes de comparar.
    const bueno = [
      'if (derivedKey.length !== parsed.storedKey.length) return false',
      'if (storedKey === null) return null',
      'return timingSafeEqual(derivedKey, storedKey)',
    ].join('\n')
    expect(findShortCircuitComparisons(bueno)).toEqual([])
    expect(usesConstantTimeComparison(bueno)).toBe(true)

    // Un comentario que mencione timingSafeEqual no cuenta como usarlo.
    expect(usesConstantTimeComparison('// aqui iria timingSafeEqual(a, b)')).toBe(false)
  })

  it('el modulo no bloquea el hilo: nada de scryptSync ni pbkdf2Sync', () => {
    expect(findBlockingCalls(moduleSource)).toEqual([])
  })

  it('la regla 2 detecta una derivacion sincrona', () => {
    expect(findBlockingCalls("const key = scryptSync(plaintext, salt, 32)")).toEqual(['scryptSync'])
    expect(findBlockingCalls('const key = pbkdf2Sync(a, b, 1, 32, "sha256")')).toEqual(['pbkdf2Sync'])
    expect(findBlockingCalls('const key = await deriveKey(plaintext, salt, params, 32)')).toEqual([])
  })

  it('el modulo no escribe en ningun canal de salida', () => {
    expect(findOutputChannels(moduleSource)).toEqual([])
  })

  it('la regla 3 detecta un console y una escritura directa a stdout', () => {
    expect(findOutputChannels('console.log(plaintext)')).toEqual(['console.log'])
    expect(findOutputChannels('console . error(storedHash)')).toEqual(['console.error'])
    expect(findOutputChannels('process.stdout.write(storedHash)')).toEqual(['process.stdout'])
    expect(findOutputChannels('// console.log(plaintext)')).toEqual([])
  })

  it('ningun archivo desplegable que corra en Edge importa el modulo de credenciales', () => {
    expect(deployedFiles.length, 'el barrido no encontro ningun archivo que revisar').toBeGreaterThan(0)

    const hallazgos = deployedFiles.flatMap((file) =>
      findEdgeImportsOfPasswordHash(
        relative(repoRoot, file).split(sep).join('/'),
        readFileSync(file, 'utf8'),
      ),
    )
    expect(hallazgos).toEqual([])
  })

  it('la regla 4 detecta un fuente Edge que importa el modulo (hoy no existe ninguno real)', () => {
    const middleware = [
      "import { verifyPasswordHash } from '@/lib/utils/password-hash'",
      'export function middleware() { return verifyPasswordHash }',
    ].join('\n')
    expect(findEdgeImportsOfPasswordHash('middleware.ts', middleware)).toHaveLength(1)

    const rutaEdge = [
      "export const runtime = 'edge'",
      "import { createPasswordHash } from '../../lib/utils/password-hash'",
    ].join('\n')
    expect(findEdgeImportsOfPasswordHash('app/api/login/route.ts', rutaEdge)).toHaveLength(1)

    const requireEdge = [
      'export const runtime = "edge"',
      'const mod = require("@/lib/utils/password-hash")',
    ].join('\n')
    expect(findEdgeImportsOfPasswordHash('app/api/otro/route.ts', requireEdge)).toHaveLength(1)

    // Y no marca lo que si es legitimo: Node importando el modulo, o Edge sin importarlo.
    const rutaNode = "import { verifyPasswordHash } from '@/lib/utils/password-hash'"
    expect(findEdgeImportsOfPasswordHash('app/api/login/route.ts', rutaNode)).toEqual([])
    const edgeSinImportar = "export const runtime = 'edge'\nexport function GET() { return null }"
    expect(findEdgeImportsOfPasswordHash('middleware-otro.ts', edgeSinImportar)).toEqual([])
    const edgeComentado = "// export const runtime = 'edge'\nimport '@/lib/utils/password-hash'"
    expect(findEdgeImportsOfPasswordHash('app/api/x/route.ts', edgeComentado)).toEqual([])
  })
})
