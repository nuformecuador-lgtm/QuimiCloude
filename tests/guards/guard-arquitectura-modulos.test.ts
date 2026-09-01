// T9 — Guardia: arquitectura hexagonal por modulos (R1, R2, R4-R17, R19).
//
// Recorre el ARBOL DE ARCHIVOS y el GRAFO DE IMPORTS, no el comportamiento: la propiedad
// que se exige ("el dominio no conoce Prisma", "solo la composicion cablea adaptadores
// driven"...) es del CODIGO FUENTE, no de lo que hace en ejecucion. Por eso vive en
// `tests/guards/` y entra en `pnpm run test:guardias` (patron `guard`, R20).
//
// Mismo patron que las guardias que ya existen: `findRepoRoot`, funciones puras
// exportadas, barrido del arbol. R21: cada bloque se demuestra con un fuente SINTETICO
// que la viola Y con el caso simetrico que no la viola. Un `expect(hallazgos).toEqual([])`
// sobre el repo real, solo, no demuestra que la regla dispare.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
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

/** Artefactos generados y dependencias: no son codigo de este repo. */
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
export function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

function relPosix(from: string, to: string): string {
  return toPosix(relative(from, to))
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

function tryReadReal(absPath: string): string | null {
  try {
    const stat = statSync(absPath)
    if (stat.isDirectory()) return null
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

/** Quita comentarios de linea y de bloque antes de buscar imports (mismo patron que las otras guardias). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Todo especificador importado/reexportado/requerido por un archivo (import, export...from, require, import()). */
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

/** Solo los especificadores de una reexportacion `export ... from '...'` (no `import`). */
export function extractExportFromSpecifiers(source: string): readonly string[] {
  const stripped = stripComments(source)
  return [...stripped.matchAll(/export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  )
}

/** `'use server'`/`'use client'` como PRIMERA sentencia no vacia del archivo (regla real de Next). */
function hasLeadingDirective(source: string, directive: 'use server' | 'use client'): boolean {
  const firstStatement = stripComments(source)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstStatement) return false
  return firstStatement === `'${directive}';` || firstStatement === `"${directive}";` ||
    firstStatement === `'${directive}'` || firstStatement === `"${directive}"`
}

export function hasUseServerDirective(source: string): boolean {
  return hasLeadingDirective(source, 'use server')
}

export function hasUseClientDirective(source: string): boolean {
  return hasLeadingDirective(source, 'use client')
}

/** `lib/modules/<m>/...` -> `<m>`; para cualquier otra ruta, `null`. */
export function moduleOfPath(relPath: string): string | null {
  const match = /^lib\/modules\/([^/]+)\//.exec(relPath)
  return match ? (match[1] as string) : null
}

/** Capa de un archivo DENTRO de un modulo (domain/ports/driven/driving/index). `null` si no aplica. */
export function layerOfPath(relPath: string): 'domain' | 'ports' | 'driven' | 'driving' | 'index' | null {
  const match = /^lib\/modules\/[^/]+\/(.+)$/.exec(relPath)
  if (!match) return null
  const rest = match[1] as string
  if (rest === 'index.ts') return 'index'
  if (rest.startsWith('domain/')) return 'domain'
  if (rest.startsWith('ports/')) return 'ports'
  if (rest.startsWith('adapters/driven/')) return 'driven'
  if (rest.startsWith('adapters/driving/')) return 'driving'
  return null
}

// ---------------------------------------------------------------------------
// BLOQUE 1 — Forma del modulo (R1, R2, R4)
// ---------------------------------------------------------------------------

const ALLOWED_MODULE_FOLDERS = new Set(['domain', 'ports', 'adapters'])

/** Un modulo debe tener `index.ts` y solo carpetas `domain`/`ports`/`adapters` (R1, R2). */
export function findModuleShapeFindings(
  modules: ReadonlyArray<{ module: string; entries: ReadonlyArray<{ name: string; isDirectory: boolean }> }>,
): readonly string[] {
  const findings: string[] = []
  for (const { module: moduleName, entries } of modules) {
    const hasIndex = entries.some((entry) => entry.name === 'index.ts' && !entry.isDirectory)
    if (!hasIndex) findings.push(`lib/modules/${moduleName}/: falta index.ts (R1)`)
    for (const entry of entries) {
      if (entry.name === 'index.ts') continue
      if (!entry.isDirectory) {
        findings.push(`lib/modules/${moduleName}/${entry.name}: archivo ajeno al contrato en la raiz del modulo (R1)`)
      } else if (!ALLOWED_MODULE_FOLDERS.has(entry.name)) {
        findings.push(`lib/modules/${moduleName}/${entry.name}/: carpeta ajena a domain/ports/adapters (R2)`)
      }
    }
  }
  return findings
}

const REQUIRED_MODULES = ['identity', 'inventario'] as const

/** Los modulos `identity` e `inventario` deben existir (R4). */
export function findMissingRequiredModules(moduleNames: readonly string[]): readonly string[] {
  return REQUIRED_MODULES.filter((required) => !moduleNames.includes(required)).map(
    (required) => `lib/modules/: falta el modulo obligatorio '${required}' (R4)`,
  )
}

// ---------------------------------------------------------------------------
// BLOQUE 2 — Carpetas horizontales (R5)
// ---------------------------------------------------------------------------

export const FORBIDDEN_LIB_DIRS = ['actions', 'services', 'repositories', 'interfaces', 'types', 'navigation', 'utils'] as const

/** Ninguna de las carpetas horizontales viejas puede existir bajo `lib/` (R5). */
export function findForbiddenLibDirFindings(libEntries: ReadonlyArray<{ name: string; isDirectory: boolean }>): readonly string[] {
  return libEntries
    .filter((entry) => entry.isDirectory && (FORBIDDEN_LIB_DIRS as readonly string[]).includes(entry.name))
    .map((entry) => `lib/${entry.name}/: carpeta horizontal prohibida (R5)`)
}

// ---------------------------------------------------------------------------
// BLOQUE 3 — Alias de shadcn (R6)
// ---------------------------------------------------------------------------

/** `lib/utils.ts` debe existir y exportar `cn` (fijado por `components.json`, R6). */
export function findUtilsAliasFindings(exists: boolean, source: string | null): readonly string[] {
  if (!exists) return [`lib/utils.ts: no existe (R6)`]
  if (!source || !/export\s+(?:function\s+cn\b|const\s+cn\b|\{[^}]*\bcn\b[^}]*\})/.test(source)) {
    return [`lib/utils.ts: no exporta 'cn' (R6)`]
  }
  return []
}

// ---------------------------------------------------------------------------
// Resolucion de especificadores (comun a varios bloques)
// ---------------------------------------------------------------------------

function candidatePaths(base: string): readonly string[] {
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
}

/** Clasifica un especificador visto desde `fromFileAbs`: paquete externo, o ruta interna resuelta. */
export function classifyImportTarget(
  fromFileAbs: string,
  specifier: string,
  root: string,
  exists: (absPath: string) => boolean,
): { kind: 'external'; name: string } | { kind: 'internal'; relPath: string } {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
    return { kind: 'external', name: specifier }
  }
  const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : join(dirname(fromFileAbs), specifier)
  for (const candidate of candidatePaths(base)) {
    if (exists(candidate)) return { kind: 'internal', relPath: relPosix(root, candidate) }
  }
  // Import roto (no resuelve a ningun archivo real): se trata como interno con la ruta
  // base, para que no se cuele como "externo" y escape de la regla en silencio.
  return { kind: 'internal', relPath: relPosix(root, base) }
}

// ---------------------------------------------------------------------------
// BLOQUE 4 — Pureza del dominio (R7, R8, R9)
// ---------------------------------------------------------------------------

export const PURE_PACKAGES: readonly string[] = ['zod']

const FRAMEWORK_PACKAGE_PATTERN = /^(next(\/.*)?|react(-dom)?(\/.*)?|react)$/

/** Imports prohibidos/permitidos para un archivo de `domain/` o `ports/` de un modulo (R7, R8, R9). */
export function findDomainPurityFindings(
  file: { absPath: string; relPath: string; content: string },
  root: string,
  exists: (absPath: string) => boolean,
): readonly string[] {
  const ownModule = moduleOfPath(file.relPath)
  const layer = layerOfPath(file.relPath)
  if (!ownModule || (layer !== 'domain' && layer !== 'ports')) return []

  const findings: string[] = []
  for (const specifier of extractImportSpecifiers(file.content)) {
    const target = classifyImportTarget(file.absPath, specifier, root, exists)

    if (target.kind === 'external') {
      if (FRAMEWORK_PACKAGE_PATTERN.test(target.name)) {
        findings.push(`${file.relPath} importa '${target.name}' (R7)`)
      } else if (target.name === '@prisma/client') {
        findings.push(`${file.relPath} importa '@prisma/client' (R7)`)
      } else if (!PURE_PACKAGES.includes(target.name)) {
        findings.push(`${file.relPath} importa el paquete no puro '${target.name}' (R8)`)
      }
      continue
    }

    const { relPath: targetRel } = target
    if (targetRel.startsWith('lib/shared/') || targetRel === 'lib/shared') {
      findings.push(`${file.relPath} importa '${specifier}' de lib/shared (R7)`)
    } else if (targetRel === 'lib/composition/index.ts' || targetRel.startsWith('lib/composition/')) {
      findings.push(`${file.relPath} importa el punto de composicion '${specifier}' (R7)`)
    } else if (targetRel.startsWith('app/') || targetRel.startsWith('components/') || targetRel.startsWith('hooks/')) {
      findings.push(`${file.relPath} importa de la UI '${specifier}' (R7)`)
    } else if (targetRel.startsWith('lib/modules/')) {
      const targetModule = moduleOfPath(targetRel)
      const targetLayer = layerOfPath(targetRel)
      if (targetModule === ownModule) {
        if (targetLayer !== 'domain' && targetLayer !== 'ports') {
          findings.push(`${file.relPath} importa '${specifier}', fuera de domain/ports de su propio modulo (R7)`)
        }
      } else if (targetLayer !== 'index') {
        findings.push(`${file.relPath} importa '${specifier}', ruta profunda de otro modulo (R9)`)
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// BLOQUE 5 — Frontera entre modulos (R9), para CUALQUIER archivo del repo
// ---------------------------------------------------------------------------

/**
 * Un archivo que pertenece a un modulo no puede importar las tripas de OTRO modulo:
 * solo su barrel `@/lib/modules/<otro>` (R9).
 *
 * Deliberadamente NO aplica a `app/`, `components/`, `hooks/` ni `lib/composition/`:
 * esos consumidores tienen sus propias reglas, mas permisivas (R11-R14, bloques 7 y 8),
 * porque la composicion SI debe llegar a `ports/`/`adapters/driven/` y la UI SI debe
 * llegar a `adapters/driving/`. R9 es la frontera MODULO <-> MODULO.
 */
export function findCrossModuleDeepImportFinding(relPath: string, specifier: string): string | null {
  const ownModule = moduleOfPath(relPath)
  if (!ownModule) return null
  const match = /^@\/lib\/modules\/([^/]+)\/(.+)$/.exec(specifier)
  if (!match) return null
  const targetModule = match[1] as string
  if (ownModule === targetModule) return null
  return `${relPath} importa '${specifier}', ruta profunda a otro modulo (R9)`
}

// ---------------------------------------------------------------------------
// BLOQUE 6 — Contrato limpio (R10), cierre TRANSITIVO de imports
// ---------------------------------------------------------------------------

/** Resuelve un especificador interno (relativo o `@/`) a `{ path, content }`, o `null` si es externo/roto. */
export function resolveInternalSpecifier(
  fromFileAbs: string,
  specifier: string,
  root: string,
  tryRead: (absPath: string) => string | null,
): { path: string; content: string } | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : join(dirname(fromFileAbs), specifier)
  for (const candidate of candidatePaths(base)) {
    const content = tryRead(candidate)
    if (content !== null) return { path: candidate, content }
  }
  return null
}

/** Sigue `./x` y `@/...` hasta el cierre transitivo. Cualquier import de paquete npm es una hoja. */
export function collectTransitiveClosure(
  entryFile: string,
  entryContent: string,
  root: string,
  tryRead: (absPath: string) => string | null,
): { internalFiles: Map<string, string>; externalPackages: Set<string> } {
  const internalFiles = new Map<string, string>()
  const externalPackages = new Set<string>()
  const visited = new Set<string>([entryFile])
  const queue: Array<{ path: string; content: string }> = [{ path: entryFile, content: entryContent }]

  while (queue.length > 0) {
    const current = queue.shift() as { path: string; content: string }
    for (const specifier of extractImportSpecifiers(current.content)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
        externalPackages.add(specifier)
        continue
      }
      const resolved = resolveInternalSpecifier(current.path, specifier, root, tryRead)
      if (!resolved || visited.has(resolved.path)) continue
      visited.add(resolved.path)
      internalFiles.set(resolved.path, resolved.content)
      queue.push(resolved)
    }
  }
  return { internalFiles, externalPackages }
}

const CONTRACT_FORBIDDEN_EXTERNALS = /^(next(\/.*)?|@prisma\/client)$/

/** El contrato solo reexporta `./domain` y no arrastra servidor, ni directa ni transitivamente (R10). */
export function findContractLeakage(
  moduleIndexPath: string,
  moduleIndexContent: string,
  root: string,
  tryRead: (absPath: string) => string | null,
): readonly string[] {
  const findings: string[] = []
  const relIndex = relPosix(root, moduleIndexPath)

  for (const spec of extractExportFromSpecifiers(moduleIndexContent)) {
    if (!spec.startsWith('./domain')) {
      findings.push(`${relIndex} reexporta '${spec}', fuera de ./domain (R10)`)
    }
  }
  if (hasUseServerDirective(moduleIndexContent)) {
    findings.push(`${relIndex} declara 'use server' en el contrato (R10)`)
  }

  const { internalFiles, externalPackages } = collectTransitiveClosure(moduleIndexPath, moduleIndexContent, root, tryRead)

  for (const pkg of externalPackages) {
    if (CONTRACT_FORBIDDEN_EXTERNALS.test(pkg)) {
      findings.push(`${relIndex} arrastra '${pkg}' transitivamente (R10)`)
    }
  }
  for (const [path, content] of internalFiles) {
    if (hasUseServerDirective(content)) {
      findings.push(`${relIndex} arrastra '${relPosix(root, path)}' con 'use server' transitivamente (R10)`)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// BLOQUE 7 — Composicion unica (R11, R12)
// ---------------------------------------------------------------------------

/** Solo `lib/composition/**` puede importar un adaptador driven de cualquier modulo (R11). */
export function findDrivenImportOutsideComposition(relPath: string, specifier: string): string | null {
  if (relPath.startsWith('lib/composition/')) return null
  if (/^@\/lib\/modules\/[^/]+\/adapters\/driven\//.test(specifier)) {
    return `${relPath} importa el adaptador driven '${specifier}' fuera de lib/composition (R11)`
  }
  return null
}

/** `lib/composition/**` no puede importar ningun adaptador driving (R12). */
export function findDrivingImportInsideComposition(relPath: string, specifier: string): string | null {
  if (!relPath.startsWith('lib/composition/')) return null
  if (/^@\/lib\/modules\/[^/]+\/adapters\/driving\//.test(specifier)) {
    return `${relPath} importa el adaptador driving '${specifier}' desde la composicion (R12)`
  }
  return null
}

// ---------------------------------------------------------------------------
// BLOQUE 8 — Consumo desde UI (R13, R14)
// ---------------------------------------------------------------------------

const UI_ROOTS = ['app/', 'components/', 'hooks/']

/** `app/`, `components/`, `hooks/` solo consumen el contrato o un adaptador driving (R13). */
export function findUiLayerImportFinding(relPath: string, specifier: string): string | null {
  if (!UI_ROOTS.some((root) => relPath.startsWith(root))) return null
  if (/^@\/lib\/modules\/[^/]+\/(domain|ports|adapters\/driven)\//.test(specifier)) {
    return `${relPath} importa '${specifier}' saltandose el contrato del modulo (R13)`
  }
  return null
}

/** Un archivo `'use client'` no puede importar la composicion ni un adaptador driven (R14). */
export function findClientForbiddenImportFinding(relPath: string, isClient: boolean, specifier: string): string | null {
  if (!isClient) return null
  if (specifier === '@/lib/composition' || specifier.startsWith('@/lib/composition/')) {
    return `${relPath} ('use client') importa el punto de composicion '${specifier}' (R14)`
  }
  if (/^@\/lib\/modules\/[^/]+\/adapters\/driven\//.test(specifier)) {
    return `${relPath} ('use client') importa el adaptador driven '${specifier}' (R14)`
  }
  return null
}

// ---------------------------------------------------------------------------
// BLOQUE 9 — Nucleo compartido (R15)
// ---------------------------------------------------------------------------

/** `lib/shared/**` no importa modulos ni el punto de composicion: es una HOJA (R15). */
export function findSharedImportFinding(relPath: string, specifier: string): string | null {
  if (!relPath.startsWith('lib/shared/')) return null
  if (specifier.startsWith('@/lib/modules/')) return `${relPath} importa '${specifier}' de un modulo (R15)`
  if (specifier === '@/lib/composition' || specifier.startsWith('@/lib/composition/')) {
    return `${relPath} importa el punto de composicion '${specifier}' (R15)`
  }
  return null
}

// ---------------------------------------------------------------------------
// BLOQUE 10 — Propiedad de modelos (R16)
// ---------------------------------------------------------------------------

/** Extrae `(modelo, modulo propietario)` leyendo el `/// @module` que precede a cada `model X {`. */
export function extractModelOwners(schemaSource: string): ReadonlyMap<string, string | null> {
  const lines = schemaSource.split('\n')
  const owners = new Map<string, string | null>()
  for (let i = 0; i < lines.length; i += 1) {
    const modelMatch = /^model\s+(\w+)\s*\{/.exec((lines[i] as string).trim())
    if (!modelMatch) continue
    const modelName = modelMatch[1] as string
    let owner: string | null = null
    let cursor = i - 1
    while (cursor >= 0 && (lines[cursor] as string).trim().startsWith('///')) {
      const moduleMatch = /^\/\/\/\s*@module\s+(\S+)/.exec((lines[cursor] as string).trim())
      if (moduleMatch) {
        owner = moduleMatch[1] as string
        break
      }
      cursor -= 1
    }
    owners.set(modelName, owner)
  }
  return owners
}

/** Todo modelo del esquema debe declarar su modulo propietario (R16). */
export function findModelOwnershipFindings(owners: ReadonlyMap<string, string | null>): readonly string[] {
  return [...owners.entries()]
    .filter(([, owner]) => owner === null)
    .map(([model]) => `db/schema.prisma: el modelo '${model}' no declara '/// @module' (R16)`)
}

function toLowerCamel(model: string): string {
  return model.length === 0 ? model : model.charAt(0).toLowerCase() + model.slice(1)
}

/** El cliente Prisma solo consulta un modelo desde el adaptador driven de su modulo propietario (R16). */
export function findModelAccessFindings(
  owners: ReadonlyMap<string, string | null>,
  drivenFiles: ReadonlyArray<{ relPath: string; module: string; content: string }>,
): readonly string[] {
  const fieldToModel = new Map<string, string>()
  for (const model of owners.keys()) fieldToModel.set(toLowerCamel(model), model)

  const findings: string[] = []
  for (const file of drivenFiles) {
    for (const match of file.content.matchAll(/\bprisma\s*\.\s*([a-zA-Z_]\w*)/g)) {
      const field = match[1] as string
      const model = fieldToModel.get(field)
      if (!model) continue
      const owner = owners.get(model)
      if (owner !== file.module) {
        findings.push(
          `${file.relPath} accede a 'prisma.${field}' (modelo '${model}', dueño '${owner ?? 'ninguno'}') desde el modulo '${file.module}' (R16)`,
        )
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// BLOQUE 11 — Cliente Prisma (R17)
// ---------------------------------------------------------------------------

/** `@/lib/shared/db/prisma` solo se importa desde `adapters/driven/**`, `scripts/` o `tests/` (R17). */
export function findPrismaClientImportFinding(relPath: string, specifier: string): string | null {
  const isSharedPrismaImport = specifier === '@/lib/shared/db/prisma' || /(^|\/)lib\/shared\/db\/prisma$/.test(specifier)
  if (!isSharedPrismaImport) return null
  const allowed =
    (relPath.startsWith('lib/modules/') && relPath.includes('/adapters/driven/')) ||
    relPath.startsWith('scripts/') ||
    relPath.startsWith('tests/')
  if (allowed) return null
  return `${relPath} importa el cliente Prisma compartido '${specifier}' fuera de un adaptador driven (R17)`
}

// ---------------------------------------------------------------------------
// BLOQUE 12 — Documentacion (R19)
// ---------------------------------------------------------------------------

export const LEGACY_LIB_PATHS = ['lib/services/', 'lib/repositories/', 'lib/interfaces/', 'lib/actions/'] as const

/** `docs/architecture.md` no presenta como vigentes las rutas viejas, y menciona `lib/modules/` (R19). */
export function findArchitectureDocFindings(docSource: string): readonly string[] {
  const findings: string[] = []
  for (const legacyPath of LEGACY_LIB_PATHS) {
    if (docSource.includes(legacyPath)) {
      findings.push(`docs/architecture.md menciona '${legacyPath}' como vigente (R19)`)
    }
  }
  if (!docSource.includes('lib/modules/')) {
    findings.push(`docs/architecture.md no menciona 'lib/modules/' (R19)`)
  }
  return findings
}

// ---------------------------------------------------------------------------
// Datos del repo real, calculados una vez
// ---------------------------------------------------------------------------

const modulesRoot = join(repoRoot, 'lib', 'modules')
const moduleNames = readDirEntries(modulesRoot)
  .filter((entry) => entry.isDirectory)
  .map((entry) => entry.name)
const modulesData = moduleNames.map((moduleName) => ({
  module: moduleName,
  entries: readDirEntries(join(modulesRoot, moduleName)),
}))

const libEntries = readDirEntries(join(repoRoot, 'lib'))

const utilsPath = join(repoRoot, 'lib', 'utils.ts')
const utilsSource = tryReadReal(utilsPath)

const SCAN_ROOTS = ['app', 'components', 'hooks', 'lib'] as const
const allSourceFiles = SCAN_ROOTS.flatMap((root) => listSourceFiles(join(repoRoot, root))).map((absPath) => {
  const content = readFileSync(absPath, 'utf8')
  return {
    absPath,
    relPath: relPosix(repoRoot, absPath),
    content,
    specifiers: extractImportSpecifiers(content),
  }
})

const schemaSource = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
const modelOwners = extractModelOwners(schemaSource)

const drivenFiles = allSourceFiles
  .filter((file) => layerOfPath(file.relPath) === 'driven')
  .map((file) => ({ relPath: file.relPath, module: moduleOfPath(file.relPath) as string, content: file.content }))

const docSource = readFileSync(join(repoRoot, 'docs', 'architecture.md'), 'utf8')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('guardia — arquitectura hexagonal por modulos', () => {
  describe('bloque 1 — forma del modulo (R1, R2, R4)', () => {
    it('todo modulo del repo tiene contrato y solo carpetas domain/ports/adapters', () => {
      expect(modulesData.length, 'no se encontro ningun modulo bajo lib/modules').toBeGreaterThan(0)
      expect(findModuleShapeFindings(modulesData)).toEqual([])
    })

    it('existen los modulos obligatorios identity e inventario', () => {
      expect(findMissingRequiredModules(moduleNames)).toEqual([])
    })

    it('detecta un modulo sin index.ts y una carpeta ajena a domain/ports/adapters', () => {
      const malo = [
        {
          module: 'identity',
          entries: [
            { name: 'domain', isDirectory: true },
            { name: 'ports', isDirectory: true },
            { name: 'adapters', isDirectory: true },
            { name: 'services', isDirectory: true }, // carpeta ajena
          ],
        },
      ]
      const findings = findModuleShapeFindings(malo)
      expect(findings).toContainEqual('lib/modules/identity/: falta index.ts (R1)')
      expect(findings).toContainEqual("lib/modules/identity/services/: carpeta ajena a domain/ports/adapters (R2)")
    })

    it('un modulo con index.ts y solo domain/ports/adapters no genera hallazgos', () => {
      const bueno = [
        {
          module: 'identity',
          entries: [
            { name: 'index.ts', isDirectory: false },
            { name: 'domain', isDirectory: true },
            { name: 'ports', isDirectory: true },
            { name: 'adapters', isDirectory: true },
          ],
        },
      ]
      expect(findModuleShapeFindings(bueno)).toEqual([])
    })

    it('detecta la ausencia del modulo inventario', () => {
      expect(findMissingRequiredModules(['identity'])).toEqual([
        "lib/modules/: falta el modulo obligatorio 'inventario' (R4)",
      ])
    })
  })

  describe('bloque 2 — carpetas horizontales (R5)', () => {
    it('lib/ del repo no contiene ninguna carpeta horizontal vieja', () => {
      expect(findForbiddenLibDirFindings(libEntries)).toEqual([])
    })

    it('detecta lib/services/ y lib/actions/ como carpetas prohibidas', () => {
      const malo = [
        { name: 'services', isDirectory: true },
        { name: 'actions', isDirectory: true },
        { name: 'modules', isDirectory: true },
      ]
      const findings = findForbiddenLibDirFindings(malo)
      expect(findings).toContainEqual('lib/services/: carpeta horizontal prohibida (R5)')
      expect(findings).toContainEqual('lib/actions/: carpeta horizontal prohibida (R5)')
      expect(findings).toHaveLength(2)
    })

    it('lib/utils.ts como ARCHIVO (no carpeta) no dispara la regla', () => {
      const bueno = [
        { name: 'utils.ts', isDirectory: false },
        { name: 'modules', isDirectory: true },
        { name: 'shared', isDirectory: true },
        { name: 'composition', isDirectory: true },
      ]
      expect(findForbiddenLibDirFindings(bueno)).toEqual([])
    })
  })

  describe('bloque 3 — alias de shadcn (R6)', () => {
    it('lib/utils.ts existe y exporta cn', () => {
      expect(findUtilsAliasFindings(utilsSource !== null, utilsSource)).toEqual([])
    })

    it('detecta lib/utils.ts ausente y lib/utils.ts sin cn', () => {
      expect(findUtilsAliasFindings(false, null)).toEqual(['lib/utils.ts: no existe (R6)'])
      expect(findUtilsAliasFindings(true, 'export const otraCosa = 1;')).toEqual([
        "lib/utils.ts: no exporta 'cn' (R6)",
      ])
    })

    it('un lib/utils.ts que exporta cn no genera hallazgos', () => {
      expect(
        findUtilsAliasFindings(true, "export function cn(...inputs) { return inputs.join(' '); }"),
      ).toEqual([])
    })
  })

  describe('bloque 4 — pureza del dominio (R7, R8, R9)', () => {
    it('ningun archivo real de domain/ports importa algo prohibido', () => {
      const findings = allSourceFiles.flatMap((file) =>
        findDomainPurityFindings(file, repoRoot, (absPath) => tryReadReal(absPath) !== null),
      )
      expect(findings).toEqual([])
    })

    it('detecta Prisma, next/*, un paquete no puro y una ruta profunda de otro modulo', () => {
      const exists = (absPath: string) =>
        [
          join(repoRoot, 'lib', 'shared', 'db', 'prisma.ts'),
          join(repoRoot, 'lib', 'modules', 'inventario', 'domain', 'stock.ts'),
        ].includes(absPath)

      const file = {
        absPath: join(repoRoot, 'lib', 'modules', 'identity', 'domain', 'credentials.ts'),
        relPath: 'lib/modules/identity/domain/credentials.ts',
        content: [
          "import { prisma } from '@/lib/shared/db/prisma';",
          "import { redirect } from 'next/navigation';",
          "import leftPad from 'left-pad';",
          "import { calculateStock } from '@/lib/modules/inventario/domain/stock';",
        ].join('\n'),
      }
      const findings = findDomainPurityFindings(file, repoRoot, exists)
      expect(findings).toContainEqual(
        "lib/modules/identity/domain/credentials.ts importa '@/lib/shared/db/prisma' de lib/shared (R7)",
      )
      expect(findings).toContainEqual("lib/modules/identity/domain/credentials.ts importa 'next/navigation' (R7)")
      expect(findings).toContainEqual(
        "lib/modules/identity/domain/credentials.ts importa el paquete no puro 'left-pad' (R8)",
      )
      expect(findings).toContainEqual(
        "lib/modules/identity/domain/credentials.ts importa '@/lib/modules/inventario/domain/stock', ruta profunda de otro modulo (R9)",
      )
    })

    it('el mismo archivo importando zod y el barrel de otro modulo no genera hallazgos', () => {
      const exists = (absPath: string) => absPath === join(repoRoot, 'lib', 'modules', 'inventario', 'index.ts')
      const file = {
        absPath: join(repoRoot, 'lib', 'modules', 'identity', 'domain', 'credentials.ts'),
        relPath: 'lib/modules/identity/domain/credentials.ts',
        content: [
          "import { z } from 'zod';",
          "import type { Stock } from '@/lib/modules/inventario';",
        ].join('\n'),
      }
      expect(findDomainPurityFindings(file, repoRoot, exists)).toEqual([])
    })
  })

  describe('bloque 5 — frontera entre modulos (R9)', () => {
    it('ningun archivo del repo importa las tripas de otro modulo', () => {
      const findings = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findCrossModuleDeepImportFinding(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      expect(findings).toEqual([])
    })

    it('detecta un archivo de inventario que importa el dominio de identity por ruta profunda', () => {
      const finding = findCrossModuleDeepImportFinding(
        'lib/modules/inventario/adapters/driving/movimiento-action.ts',
        '@/lib/modules/identity/domain/credentials',
      )
      expect(finding).toBe(
        "lib/modules/inventario/adapters/driving/movimiento-action.ts importa '@/lib/modules/identity/domain/credentials', ruta profunda a otro modulo (R9)",
      )
    })

    it('importar el barrel de otro modulo, una ruta profunda al PROPIO modulo, o no ser un archivo de modulo, no dispara la regla', () => {
      expect(
        findCrossModuleDeepImportFinding('lib/modules/inventario/adapters/driving/movimiento-action.ts', '@/lib/modules/identity'),
      ).toBeNull()
      expect(
        findCrossModuleDeepImportFinding(
          'lib/modules/identity/adapters/driving/login-action.ts',
          '@/lib/modules/identity/domain/credentials',
        ),
      ).toBeNull()
      // app/, components/, lib/composition/ tienen sus propias reglas (bloques 7 y 8): esta
      // funcion no se les aplica, aunque el especificador tenga la misma forma "profunda".
      expect(findCrossModuleDeepImportFinding('app/page.tsx', '@/lib/modules/identity/domain/credentials')).toBeNull()
      expect(
        findCrossModuleDeepImportFinding('lib/composition/index.ts', '@/lib/modules/identity/adapters/driven/security/password-hash'),
      ).toBeNull()
    })
  })

  describe('bloque 6 — contrato limpio, cierre transitivo (R10)', () => {
    it('los contratos reales (identity, inventario) no arrastran servidor', () => {
      for (const moduleName of moduleNames) {
        const indexPath = join(modulesRoot, moduleName, 'index.ts')
        const content = tryReadReal(indexPath)
        if (content === null) continue
        expect(findContractLeakage(indexPath, content, repoRoot, tryReadReal)).toEqual([])
      }
    })

    it('detecta un index.ts que reexporta un adaptador driving y arrastra next/* transitivamente', () => {
      const files = new Map<string, string>([
        [
          join(repoRoot, 'lib', 'modules', 'identity', 'index.ts'),
          "export { loginAction } from './adapters/driving/login-action';",
        ],
        [
          join(repoRoot, 'lib', 'modules', 'identity', 'adapters', 'driving', 'login-action.ts'),
          "'use server';\nimport { redirect } from 'next/navigation';\nexport async function loginAction() {}",
        ],
      ])
      const tryRead = (absPath: string) => files.get(absPath) ?? null
      const indexPath = join(repoRoot, 'lib', 'modules', 'identity', 'index.ts')
      const findings = findContractLeakage(indexPath, files.get(indexPath) as string, repoRoot, tryRead)

      expect(findings).toContainEqual(
        "lib/modules/identity/index.ts reexporta './adapters/driving/login-action', fuera de ./domain (R10)",
      )
      expect(findings).toContainEqual(
        "lib/modules/identity/index.ts arrastra 'lib/modules/identity/adapters/driving/login-action.ts' con 'use server' transitivamente (R10)",
      )
      expect(findings).toContainEqual("lib/modules/identity/index.ts arrastra 'next/navigation' transitivamente (R10)")
    })

    it('un index.ts que solo reexporta ./domain, sin arrastrar servidor, no genera hallazgos', () => {
      const files = new Map<string, string>([
        [
          join(repoRoot, 'lib', 'modules', 'identity', 'index.ts'),
          "export type { LoginInput } from './domain/credentials';",
        ],
        [
          join(repoRoot, 'lib', 'modules', 'identity', 'domain', 'credentials.ts'),
          "import { z } from 'zod';\nexport const loginInputSchema = z.object({});",
        ],
      ])
      const tryRead = (absPath: string) => files.get(absPath) ?? null
      const indexPath = join(repoRoot, 'lib', 'modules', 'identity', 'index.ts')
      expect(findContractLeakage(indexPath, files.get(indexPath) as string, repoRoot, tryRead)).toEqual([])
    })
  })

  describe('bloque 7 — composicion unica (R11, R12)', () => {
    it('solo lib/composition importa adaptadores driven, y la composicion no importa driving', () => {
      const findingsR11 = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findDrivenImportOutsideComposition(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      const findingsR12 = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findDrivingImportInsideComposition(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      expect(findingsR11).toEqual([])
      expect(findingsR12).toEqual([])
    })

    it('detecta un import de driven fuera de composicion y uno de driving dentro de composicion', () => {
      expect(
        findDrivenImportOutsideComposition(
          'app/(private)/layout.tsx',
          '@/lib/modules/identity/adapters/driven/session/session-stub',
        ),
      ).toBe(
        "app/(private)/layout.tsx importa el adaptador driven '@/lib/modules/identity/adapters/driven/session/session-stub' fuera de lib/composition (R11)",
      )
      expect(
        findDrivingImportInsideComposition(
          'lib/composition/index.ts',
          '@/lib/modules/identity/adapters/driving/login-action',
        ),
      ).toBe(
        "lib/composition/index.ts importa el adaptador driving '@/lib/modules/identity/adapters/driving/login-action' desde la composicion (R12)",
      )
    })

    it('composicion importando driven, y cualquier otro archivo importando driving, no disparan la regla', () => {
      expect(
        findDrivenImportOutsideComposition(
          'lib/composition/index.ts',
          '@/lib/modules/identity/adapters/driven/security/password-hash',
        ),
      ).toBeNull()
      expect(
        findDrivingImportInsideComposition(
          'app/(public)/login/components/login-form.tsx',
          '@/lib/modules/identity/adapters/driving/login-action',
        ),
      ).toBeNull()
    })
  })

  describe('bloque 8 — consumo desde UI (R13, R14)', () => {
    it('app/, components/ y hooks/ del repo solo consumen el contrato o un adaptador driving', () => {
      const findingsR13 = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findUiLayerImportFinding(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      const findingsR14 = allSourceFiles.flatMap((file) => {
        const isClient = hasUseClientDirective(file.content)
        return file.specifiers
          .map((specifier) => findClientForbiddenImportFinding(file.relPath, isClient, specifier))
          .filter((finding): finding is string => finding !== null)
      })
      expect(findingsR13).toEqual([])
      expect(findingsR14).toEqual([])
    })

    it('detecta un app/page.tsx que importa domain/ y un componente cliente que importa la composicion', () => {
      expect(findUiLayerImportFinding('app/page.tsx', '@/lib/modules/identity/domain/credentials')).toBe(
        "app/page.tsx importa '@/lib/modules/identity/domain/credentials' saltandose el contrato del modulo (R13)",
      )
      expect(findUiLayerImportFinding('app/page.tsx', '@/lib/modules/identity/adapters/driven/security/password-hash')).toBe(
        "app/page.tsx importa '@/lib/modules/identity/adapters/driven/security/password-hash' saltandose el contrato del modulo (R13)",
      )
      expect(findClientForbiddenImportFinding('components/private/nav-user.tsx', true, '@/lib/composition')).toBe(
        "components/private/nav-user.tsx ('use client') importa el punto de composicion '@/lib/composition' (R14)",
      )
      expect(
        findClientForbiddenImportFinding(
          'components/private/nav-user.tsx',
          true,
          '@/lib/modules/identity/adapters/driven/session/session-stub',
        ),
      ).toBe(
        "components/private/nav-user.tsx ('use client') importa el adaptador driven '@/lib/modules/identity/adapters/driven/session/session-stub' (R14)",
      )
    })

    it('consumir el barrel o un adaptador driving desde la UI no dispara la regla, ni siendo cliente', () => {
      expect(findUiLayerImportFinding('app/page.tsx', '@/lib/modules/identity')).toBeNull()
      expect(
        findUiLayerImportFinding('app/(public)/login/components/login-form.tsx', '@/lib/modules/identity/adapters/driving/login-action'),
      ).toBeNull()
      expect(findClientForbiddenImportFinding('components/private/nav-user.tsx', true, '@/lib/modules/identity')).toBeNull()
      expect(
        findClientForbiddenImportFinding(
          'components/private/nav-user.tsx',
          true,
          '@/lib/modules/identity/adapters/driving/logout-action',
        ),
      ).toBeNull()
      // Y el mismo import de composicion en un archivo de SERVIDOR (sin 'use client') no es R14.
      expect(findClientForbiddenImportFinding('app/(private)/layout.tsx', false, '@/lib/composition')).toBeNull()
    })
  })

  describe('bloque 9 — nucleo compartido (R15)', () => {
    it('lib/shared/ del repo no importa modulos ni la composicion', () => {
      const findings = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findSharedImportFinding(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      expect(findings).toEqual([])
    })

    it('detecta lib/shared/ importando un modulo y la composicion', () => {
      expect(findSharedImportFinding('lib/shared/ui/initials.ts', '@/lib/modules/identity')).toBe(
        "lib/shared/ui/initials.ts importa '@/lib/modules/identity' de un modulo (R15)",
      )
      expect(findSharedImportFinding('lib/shared/ui/initials.ts', '@/lib/composition')).toBe(
        "lib/shared/ui/initials.ts importa el punto de composicion '@/lib/composition' (R15)",
      )
    })

    it('lib/shared/ importando otro archivo de lib/shared o un paquete npm no dispara la regla', () => {
      expect(findSharedImportFinding('lib/shared/ui/initials.ts', '@/lib/shared/routes')).toBeNull()
      expect(findSharedImportFinding('lib/shared/ui/initials.ts', '@prisma/client')).toBeNull()
      // Y fuera de lib/shared/, la funcion no aplica en absoluto.
      expect(findSharedImportFinding('lib/modules/identity/index.ts', '@/lib/modules/identity')).toBeNull()
    })
  })

  describe('bloque 10 — propiedad de modelos (R16)', () => {
    it('todo modelo del esquema real declara su modulo propietario', () => {
      expect(modelOwners.size, 'no se encontro ningun modelo en db/schema.prisma').toBeGreaterThan(0)
      expect(findModelOwnershipFindings(modelOwners)).toEqual([])
    })

    it('ningun adaptador driven real accede a un modelo de otro modulo', () => {
      expect(findModelAccessFindings(modelOwners, drivenFiles)).toEqual([])
    })

    it('detecta un modelo sin /// @module y un acceso de un modulo que no es el propietario', () => {
      const schemaMalo = [
        '/// @module identity',
        'model User {',
        '  id String @id',
        '}',
        '',
        'model DocumentType {',
        '  code String @id',
        '}',
      ].join('\n')
      const owners = extractModelOwners(schemaMalo)
      expect(owners.get('User')).toBe('identity')
      expect(owners.get('DocumentType')).toBeNull()
      expect(findModelOwnershipFindings(owners)).toEqual([
        "db/schema.prisma: el modelo 'DocumentType' no declara '/// @module' (R16)",
      ])

      const findings = findModelAccessFindings(owners, [
        {
          relPath: 'lib/modules/inventario/adapters/driven/movimientos-repo.ts',
          module: 'inventario',
          content: 'export function auditar() { return prisma.user.findMany(); }',
        },
      ])
      expect(findings).toEqual([
        "lib/modules/inventario/adapters/driven/movimientos-repo.ts accede a 'prisma.user' (modelo 'User', dueño 'identity') desde el modulo 'inventario' (R16)",
      ])
    })

    it('el modulo propietario accediendo a su propio modelo no dispara la regla', () => {
      const owners = extractModelOwners('/// @module identity\nmodel User {\n  id String @id\n}\n')
      const findings = findModelAccessFindings(owners, [
        {
          relPath: 'lib/modules/identity/adapters/driven/user-repo.ts',
          module: 'identity',
          content: 'export function buscar() { return prisma.user.findMany(); }',
        },
      ])
      expect(findings).toEqual([])
    })
  })

  describe('bloque 11 — cliente Prisma compartido (R17)', () => {
    it('nadie fuera de adapters/driven, scripts o tests importa el cliente Prisma compartido', () => {
      const findings = allSourceFiles.flatMap((file) =>
        file.specifiers
          .map((specifier) => findPrismaClientImportFinding(file.relPath, specifier))
          .filter((finding): finding is string => finding !== null),
      )
      expect(findings).toEqual([])
    })

    it('detecta el cliente Prisma compartido importado desde el dominio (el ejemplo exacto del encargo)', () => {
      expect(
        findPrismaClientImportFinding('lib/modules/identity/domain/credentials.ts', '@/lib/shared/db/prisma'),
      ).toBe(
        "lib/modules/identity/domain/credentials.ts importa el cliente Prisma compartido '@/lib/shared/db/prisma' fuera de un adaptador driven (R17)",
      )
    })

    it('importarlo desde un adaptador driven, un script o un test no dispara la regla', () => {
      expect(
        findPrismaClientImportFinding(
          'lib/modules/identity/adapters/driven/security/password-hash.ts',
          '@/lib/shared/db/prisma',
        ),
      ).toBeNull()
      expect(findPrismaClientImportFinding('scripts/seed.ts', '@/lib/shared/db/prisma')).toBeNull()
      expect(findPrismaClientImportFinding('tests/unit/identity/user.test.ts', '@/lib/shared/db/prisma')).toBeNull()
    })
  })

  describe('bloque 12 — documentacion (R19)', () => {
    it('docs/architecture.md no presenta como vigentes las rutas viejas y menciona lib/modules/', () => {
      expect(findArchitectureDocFindings(docSource)).toEqual([])
    })

    it('detecta un docs/architecture.md que sigue describiendo lib/services/ y lib/actions/ como vigentes', () => {
      const docMalo = [
        '## Patron de capas',
        'lib/services/<Recurso>Service.ts     <- Service',
        'lib/actions/<feature>.ts             <- Server Action',
      ].join('\n')
      const findings = findArchitectureDocFindings(docMalo)
      expect(findings).toContainEqual("docs/architecture.md menciona 'lib/services/' como vigente (R19)")
      expect(findings).toContainEqual("docs/architecture.md menciona 'lib/actions/' como vigente (R19)")
      expect(findings).toContainEqual("docs/architecture.md no menciona 'lib/modules/' (R19)")
    })

    it('un documento que describe lib/modules/ sin mencionar las rutas viejas no genera hallazgos', () => {
      const docBueno = '## Modulos\nlib/modules/<modulo>/index.ts es el contrato publico.'
      expect(findArchitectureDocFindings(docBueno)).toEqual([])
    })
  })
})
