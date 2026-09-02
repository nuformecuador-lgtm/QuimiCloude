// T15 — Test estatico del enganche al despliegue (QC-6).
//
// Cubre R19 (el seed corre automaticamente en cada despliegue, encadenado en el `build`),
// R20 (si el seed falla, el despliegue falla de forma visible: `&&`, nunca `;` ni `||`),
// R21 (el seed no anade ninguna dependencia nueva a `package.json`) y R6 (las tres
// `SEED_ADMIN_*` estan en `.env.example` sin ningun valor).
//
// Lee package.json como texto/JSON y recorre el arbol de archivos del seed; no ejecuta nada
// (eso es T16, a mano, contra una base real).

import { builtinModules } from 'node:module'
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

const packageJsonText = readFileSync(join(repoRoot, 'package.json'), 'utf8')
const packageJson = JSON.parse(packageJsonText) as {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('package.json — el build encadena el seed (R19, R20)', () => {
  it('existe scripts.build', () => {
    expect(packageJson.scripts).toBeDefined()
    expect(packageJson.scripts?.build).toBeDefined()
    expect(typeof packageJson.scripts?.build).toBe('string')
  })

  const build = packageJson.scripts?.build ?? ''

  it('scripts.build contiene los tres comandos, en orden: migrar, sembrar, compilar', () => {
    const posMigrate = build.indexOf('prisma migrate deploy')
    const posSeed = build.indexOf('scripts/seed.ts')
    const posBuild = build.indexOf('next build')

    expect(posMigrate, `"prisma migrate deploy" no aparece en scripts.build: ${build}`).toBeGreaterThanOrEqual(0)
    expect(posSeed, `"scripts/seed.ts" no aparece en scripts.build: ${build}`).toBeGreaterThanOrEqual(0)
    expect(posBuild, `"next build" no aparece en scripts.build: ${build}`).toBeGreaterThanOrEqual(0)

    expect(posMigrate, 'la migracion debe ir antes del seed').toBeLessThan(posSeed)
    expect(posSeed, 'el seed debe ir antes de next build').toBeLessThan(posBuild)
  })

  it('los tres comandos van unidos por && y no por ; ni ||, en ese orden', () => {
    const tramos = build.split('&&').map((tramo) => tramo.trim())

    expect(tramos, `scripts.build partido por && deberia tener tres tramos: ${build}`).toHaveLength(3)
    expect(tramos[0]).toContain('prisma migrate deploy')
    expect(tramos[1]).toContain('scripts/seed.ts')
    expect(tramos[2]).toContain('next build')
  })

  it('scripts.build no usa ; ni || como separador entre los comandos (no cortarian ante un fallo)', () => {
    expect(build, `scripts.build no debe contener ";": ${build}`).not.toContain(';')
    expect(build, `scripts.build no debe contener "||": ${build}`).not.toContain('||')
  })

  it('existe scripts["db:seed"] y ejecuta scripts/seed.ts', () => {
    const dbSeed = packageJson.scripts?.['db:seed']
    expect(dbSeed).toBeDefined()
    expect(dbSeed).toContain('scripts/seed.ts')
  })
})

// ---------------------------------------------------------------------------------------
// Bloque 1b — .env.example trae las tres claves del seed, sin ningun valor (R6)
// ---------------------------------------------------------------------------------------

const SEED_ADMIN_ENV_VAR_NAMES = ['SEED_ADMIN_USERNAME', 'SEED_ADMIN_PASSWORD', 'SEED_ADMIN_EMAIL'] as const

describe('.env.example — las tres SEED_ADMIN_* sin valor (R6)', () => {
  const envExampleText = readFileSync(join(repoRoot, '.env.example'), 'utf8')

  it('las tres claves estan presentes', () => {
    for (const name of SEED_ADMIN_ENV_VAR_NAMES) {
      expect(envExampleText, `falta la clave ${name} en .env.example`).toMatch(new RegExp(`^${name}=`, 'm'))
    }
  })

  it('las tres claves tienen valor vacio', () => {
    for (const name of SEED_ADMIN_ENV_VAR_NAMES) {
      const match = new RegExp(`^${name}=(.*)$`, 'm').exec(envExampleText)
      expect(match, `no se encontro ${name}= en .env.example`).not.toBeNull()
      expect((match?.[1] ?? '').trim(), `${name} no deberia traer un valor en .env.example`).toBe('')
    }
  })
})

// ---------------------------------------------------------------------------------------
// Bloque 2 — ninguna dependencia nueva (R21)
// ---------------------------------------------------------------------------------------

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

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

function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

/** El nombre base (sin extension ni carpeta) de un archivo. */
function baseName(absPath: string): string {
  const posix = toPosix(absPath)
  const last = posix.split('/').pop() ?? posix
  return last
}

/** Archivos del seed: dentro de lib/modules/identity/** con "seed" en el nombre o que
 *  empiecen por "initial-access", mas scripts/seed.ts. */
function archivosDelSeed(): readonly string[] {
  const identityRoot = join(repoRoot, 'lib', 'modules', 'identity')
  const dentroDeIdentity = listSourceFiles(identityRoot).filter((absPath) => {
    const name = baseName(absPath)
    return name.includes('seed') || name.startsWith('initial-access')
  })

  const scriptsSeed = join(repoRoot, 'scripts', 'seed.ts')
  const scripts = statSync(scriptsSeed, { throwIfNoEntry: false }) ? [scriptsSeed] : []

  return [...dentroDeIdentity, ...scripts]
}

/** Quita comentarios de linea y de bloque antes de buscar imports (mismo patron que las guardias). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Todo especificador importado/reexportado/requerido por un archivo (mismo patron que las guardias). */
function extractImportSpecifiers(source: string): readonly string[] {
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

/** Nombre de paquete de un especificador bare, contemplando scopes (@scope/pkg) y subrutas (pkg/sub). */
function nombreDePaquete(specifier: string): string {
  const partes = specifier.split('/')
  if (specifier.startsWith('@')) return partes.slice(0, 2).join('/')
  return partes[0] as string
}

function esBare(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('@/')
}

function esBuiltinDeNode(nombre: string): boolean {
  const sinPrefijo = nombre.startsWith('node:') ? nombre.slice('node:'.length) : nombre
  return builtinModules.includes(sinPrefijo)
}

function paquetesDeclarados(): Set<string> {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ])
}

describe('archivos del seed — ninguna dependencia nueva (R21)', () => {
  const archivos = archivosDelSeed()

  it('encontro archivos del seed (barrer una lista vacia pasaria en verde para siempre)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('la lista incluye por nombre los archivos que deben existir', () => {
    const relPaths = archivos.map((absPath) => toPosix(absPath.slice(repoRoot.length + 1)))

    expect(relPaths).toContain('scripts/seed.ts')
    expect(relPaths).toContain('lib/modules/identity/domain/seed-initial-access.ts')
    expect(relPaths).toContain('lib/modules/identity/ports/initial-access-repository.ts')
    expect(relPaths).toContain('lib/modules/identity/ports/initial-access-credentials.ts')
  })

  const bareSpecifiers = archivos.flatMap((absPath) =>
    extractImportSpecifiers(readFileSync(absPath, 'utf8')).filter(esBare),
  )

  it('se recolecto al menos un especificador bare entre todos los archivos del seed', () => {
    expect(bareSpecifiers.length).toBeGreaterThan(0)
  })

  it('todo especificador bare es un paquete ya declarado en package.json o un builtin de Node', () => {
    const declarados = paquetesDeclarados()
    const noDeclarados = bareSpecifiers
      .map(nombreDePaquete)
      .filter((nombre) => !declarados.has(nombre) && !esBuiltinDeNode(nombre))

    expect(
      noDeclarados,
      `Especificadores del seed que no son ni dependencia declarada ni builtin de Node: ${noDeclarados.join(', ')}. ` +
        'El seed no puede anadir ninguna dependencia nueva (R21).',
    ).toEqual([])
  })
})
