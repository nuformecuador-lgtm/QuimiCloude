// T15 — Guardia: la firma de sesion tiene UN SOLO dueño (R5).
//
// R5 exige que NO exista una segunda implementacion del algoritmo de firma en el repositorio:
// la verificacion DEBE recomputar la firma con `signSessionValue()`, la misma funcion que la
// emite (`lib/modules/identity/adapters/driven/session/session-cookie.ts`), nunca con su propio
// `createHmac`. Hasta hoy eso solo se habia comprobado a mano con un `grep`; esta guardia lo
// afirma en el gate: si mañana alguien escribe un `createHmac('sha256', ...)` propio en otro
// archivo de produccion -- por prisa, por no encontrar `signSessionValue()`, o por copiar y
// pegar --, el repo se desincroniza en silencio (decision cerrada el 2026-09-01, `design.md >
// 6.5`): el escritor cambia el formato, el lector que se quedo atras deja de casar, y nada de
// eso compila en rojo porque los dos lados siguen siendo TypeScript valido. Esta guardia es la
// unica red para ese caso.
//
// Recorre el ARBOL DE ARCHIVOS de produccion, no el comportamiento: mismo patron que
// `tests/guards/guard-password-hash-module.test.ts` (`findRepoRoot`, funciones puras
// exportadas, fuente sintetico que demuestra que la regla dispara Y el caso simetrico que no
// la viola). `tests/`, `e2e/` y `scripts/` no son produccion y no entran en el barrido: el
// propio archivo `session-cookie.ts` y este test SI mencionan `createHmac`, y el test que lo
// mockea (`session-cookie.test.ts`) tambien lo hace, a proposito.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, sep } from 'node:path'
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

/** Directorios de codigo de PRODUCCION (no tests, no e2e, no scripts). */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks']

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

/** Unico dueño autorizado del algoritmo de firma (R5, `design.md > 4.1` y `> 6.5`). */
const UNICO_DUENO = 'lib/modules/identity/adapters/driven/session/session-cookie.ts'

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
}

function readDirEntries(dir: string): { name: string; isDirectory: boolean }[] {
  let names: readonly string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.map((name) => ({ name, isDirectory: statSync(join(dir, name)).isDirectory() }))
}

function listSourceFiles(dir: string): readonly string[] {
  return readDirEntries(dir).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory) {
      return IGNORED_DIRS.has(entry.name) ? [] : listSourceFiles(full)
    }
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [full] : []
  })
}

/** Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** `true` si el fuente (sin comentarios) invoca `createHmac`. */
export function mentionsCreateHmac(source: string): boolean {
  return /\bcreateHmac\s*\(/.test(stripComments(source))
}

/** Archivos de produccion (rutas relativas en POSIX) que invocan `createHmac`. */
export function findCreateHmacUsers(root: string): readonly string[] {
  const files = PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName)))
  return files
    .filter((absPath) => mentionsCreateHmac(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)))
}

describe('guardia — un unico dueño de la firma de sesion (R5)', () => {
  it('createHmac solo aparece en el adaptador que emite y verifica la cookie', () => {
    const encontrados = findCreateHmacUsers(repoRoot)

    const intrusos = encontrados.filter((file) => file !== UNICO_DUENO)

    expect(
      intrusos,
      intrusos.length === 0
        ? undefined
        : `La firma de sesion tiene un solo dueño (R5): ${UNICO_DUENO}. ` +
            `Se encontro tambien createHmac en: ${intrusos.join(', ')}. ` +
            'No reimplementes el algoritmo de firma ahi: importa y reutiliza ' +
            "signSessionValue() desde ese adaptador. Un formato con dos dueños se " +
            'desincroniza en silencio (design.md > 6.5).',
    ).toEqual([])

    // Y el dueño legitimo tiene que aparecer: si algun dia deja de usar createHmac (cambio de
    // algoritmo), esta linea avisa de que la constante UNICO_DUENO quedo obsoleta.
    expect(encontrados).toContain(UNICO_DUENO)
  })

  it('la comparacion de firmas es en tiempo constante (R5): el unico dueño usa timingSafeEqual', () => {
    const fuente = stripComments(readFileSync(join(repoRoot, UNICO_DUENO), 'utf8'))

    expect(
      /\btimingSafeEqual\s*\(/.test(fuente),
      'R5 exige comparar la firma de sesion en tiempo constante: usa timingSafeEqual() de ' +
        "node:crypto, no '===' ni cualquier comparacion que corte en la primera diferencia. " +
        `Eso filtra la firma esperada por el tiempo de respuesta (side-channel timing attack). ` +
        `El unico dueño autorizado es ${UNICO_DUENO}; ahi es donde debe vivir esa llamada.`,
    ).toBe(true)
  })

  it('la regla detecta un createHmac propio en un archivo sintetico, y no un comentario que lo menciona', () => {
    expect(mentionsCreateHmac("import { createHmac } from 'node:crypto'; createHmac('sha256', s)")).toBe(
      true,
    )
    expect(mentionsCreateHmac('const x = createHmac(\'sha256\', secret).update(y).digest()')).toBe(
      true,
    )
    // Un comentario que solo lo menciona no es una segunda implementacion.
    expect(mentionsCreateHmac('// antes esto llamaba a createHmac(...) directamente')).toBe(false)
    expect(mentionsCreateHmac('export function signSessionValue() { return "no-op" }')).toBe(false)
  })
})
