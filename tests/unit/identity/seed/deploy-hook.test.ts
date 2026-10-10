// T15 — Test estatico del enganche al despliegue (QC-6).
//
// Cubre R19 (el seed corre automaticamente en cada despliegue de produccion, como paso del
// `build`), R20 (si el seed falla, el despliegue falla de forma visible),
// R21 (el seed no anade ninguna dependencia nueva a `package.json`) y R6 (las tres
// `SEED_ADMIN_*` estan en `.env.example` sin ningun valor).
//
// Lee package.json como texto/JSON y recorre el arbol de archivos del seed; no ejecuta nada
// (eso es T16, a mano, contra una base real).
//
// R19/R20 cambiaron de mecanismo, no de intencion (enmienda del 2026-10-08 en
// specs/QC-6-seed-roles-y-usuario-inicial/requirements.md): `scripts.build` ya no es una cadena
// de `&&`, delega en `scripts/build.mjs`. El orden de los pasos vive en `pasosDelBuild` y el corte
// al primer fallo en `ejecutarBuild`; aqui se fija lo que R19/R20 exigen de ambos. El detalle de
// cada entorno de Vercel esta en tests/unit/scripts/build.test.ts.

import { builtinModules } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ejecutarBuild, pasosDelBuild } from '@/scripts/build.mjs'

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

describe('package.json + scripts/build.mjs — el build corre el seed (R19, R20)', () => {
  it('existe scripts.build', () => {
    expect(packageJson.scripts).toBeDefined()
    expect(packageJson.scripts?.build).toBeDefined()
    expect(typeof packageJson.scripts?.build).toBe('string')
  })

  it('scripts.build delega en scripts/build.mjs', () => {
    expect(packageJson.scripts?.build).toBe('node scripts/build.mjs')
  })

  // El build lleva `prisma generate` entre la migracion y el seed (b79a43c4; decision del
  // 2026-10-08 en specs/QC-6-seed-roles-y-usuario-inicial/requirements.md): el seed necesita
  // el cliente generado y Vercel cachea node_modules, asi que sin generar quedaria uno viejo.
  const CUATRO = ['prisma migrate deploy', 'prisma generate', 'tsx scripts/seed.ts', 'next build']

  it.each([
    ['fuera de Vercel', {}],
    ['en Vercel production', { VERCEL: '1', VERCEL_ENV: 'production' }],
  ])('%s: los cuatro pasos, en orden: migrar, generar, sembrar, compilar (R19)', (_nombre, env) => {
    const { pasos } = pasosDelBuild(env)
    expect(pasos).toEqual(CUATRO)
    expect(pasos.indexOf('tsx scripts/seed.ts'), 'el seed debe ir antes de next build').toBeLessThan(
      pasos.indexOf('next build'),
    )
  })

  it('si el seed falla, el build sale con su codigo distinto de 0 y next build no corre (R20)', () => {
    const llamados: string[] = []
    const codigo = ejecutarBuild(
      { VERCEL: '1', VERCEL_ENV: 'production' },
      (comando: string) => {
        llamados.push(comando)
        return { status: comando === 'tsx scripts/seed.ts' ? 1 : 0 }
      },
      { log: () => {}, error: () => {} },
    )
    expect(codigo).not.toBe(0)
    expect(llamados).not.toContain('next build')
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

const SEED_MAESTRO_ENV_VAR_NAMES = ['SEED_MAESTRO_USERNAME', 'SEED_MAESTRO_PASSWORD', 'SEED_MAESTRO_EMAIL'] as const

describe('.env.example — las tres SEED_MAESTRO_* sin valor (QC-161)', () => {
  const envExampleText = readFileSync(join(repoRoot, '.env.example'), 'utf8')

  it('QC-161 R14: las tres claves del Maestro estan declaradas una sola vez y sin valor', () => {
    for (const name of SEED_MAESTRO_ENV_VAR_NAMES) {
      const matches = [...envExampleText.matchAll(new RegExp(`^${name}=(.*)$`, 'gm'))]
      expect(matches, `${name} debe aparecer exactamente una vez en .env.example`).toHaveLength(1)
      expect((matches[0]?.[1] ?? '').trim(), `${name} no deberia traer un valor en .env.example`).toBe('')
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
