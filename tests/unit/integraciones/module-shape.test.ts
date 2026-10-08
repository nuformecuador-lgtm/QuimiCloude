// El modulo `integraciones` es un armazon: contrato vacio, carpetas hexagonales sin codigo y nadie
// que lo importe. Su permiso existe en el catalogo, pero ningun archivo de produccion lo exige aun.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { findForbiddenPatternsInSource } from '../../guards/guard-autorizacion-por-permiso.test'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const moduleDir = join(repoRoot, 'lib', 'modules', 'integraciones')

const CODIGO = 'integraciones.modificar'

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.sql', '.prisma', '.json'])

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

function withoutComments(source: string, extension: string): string {
  if (!CODE_EXTENSIONS.has(extension)) {
    return source
      .split('\n')
      .map((line) => line.replace(/(--|\/\/).*$/, ''))
      .join('\n')
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source)
  const piezas: string[] = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    const esComentario =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    piezas.push(esComentario ? ' ' : scanner.getTokenText())
    token = scanner.scan()
  }
  return piezas.join('')
}

/** Rutas relativas (POSIX) de los archivos de codigo `.ts`/`.tsx` de una lista. */
export function codeFilesAmong(relativePaths: readonly string[]): string[] {
  return relativePaths.filter((path) => /\.tsx?$/.test(path))
}

/** Especificadores de import, export-from, `import()` y `require()` de un fuente. */
export function importSpecifiers(source: string): string[] {
  const codigo = withoutComments(source, '.ts')
  const patrones = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  return patrones.flatMap((patron) => [...codigo.matchAll(patron)].map((match) => match[1] as string))
}

/** ¿El especificador, importado desde `fromFile`, resuelve dentro del modulo? */
export function resolvesIntoTheModule(fromFile: string, specifier: string): boolean {
  let destino: string
  if (specifier.startsWith('@/')) destino = join(repoRoot, specifier.slice(2))
  else if (specifier.startsWith('.')) destino = resolve(dirname(fromFile), specifier)
  else return false
  const normalizado = resolve(destino)
  return normalizado === resolve(moduleDir) || normalizado.startsWith(resolve(moduleDir) + sep)
}

function filesImportingTheModule(): string[] {
  const fuentes = [
    ...['lib', 'app', 'components', 'hooks'].flatMap((dir) => listFiles(join(repoRoot, dir))),
    join(repoRoot, 'middleware.ts'),
  ]
    .filter((file) => CODE_EXTENSIONS.has(extname(file)))
    .filter((file) => !resolve(file).startsWith(resolve(moduleDir) + sep))
  return fuentes
    .filter((file) =>
      importSpecifiers(readFileSync(file, 'utf8')).some((spec) => resolvesIntoTheModule(file, spec)),
    )
    .map((file) => toPosix(relative(repoRoot, file)))
}

function productionFilesContaining(literal: string): string[] {
  return [
    ...['app', 'lib', 'components', 'hooks', 'db'].flatMap((dir) => listFiles(join(repoRoot, dir))),
    join(repoRoot, 'middleware.ts'),
  ]
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .filter((file) => withoutComments(readFileSync(file, 'utf8'), extname(file)).includes(literal))
    .map((file) => toPosix(relative(repoRoot, file)))
}

/** Lo que el permiso tiene permitido: el catalogo y las migraciones. */
export function isAllowedHolderOfTheCode(relativePath: string): boolean {
  return (
    relativePath === 'lib/modules/identity/domain/permissions.ts' ||
    relativePath.startsWith('db/migrations/')
  )
}

describe('la forma del modulo integraciones', () => {
  it('R10: la raiz tiene index.ts, domain/, ports/ y adapters/, y adapters/ tiene driven/ y driving/', () => {
    const raiz = readdirSync(moduleDir, { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort()
    expect(raiz).toEqual(['adapters/', 'domain/', 'index.ts', 'ports/'])

    const adaptadores = readdirSync(join(moduleDir, 'adapters'), { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort()
    expect(adaptadores).toEqual(['driven/', 'driving/'])
  })

  it('R11: el contrato no exporta ningun simbolo: sin comentarios es exactamente export {};', () => {
    const contrato = withoutComments(readFileSync(join(moduleDir, 'index.ts'), 'utf8'), '.ts')
    expect(contrato.replace(/\s+/g, ' ').trim()).toBe('export {};')
  })

  it('R11: domain/, ports/ y adapters/ no contienen ningun archivo .ts ni .tsx', () => {
    const relativos = ['domain', 'ports', 'adapters'].flatMap((dir) =>
      listFiles(join(moduleDir, dir)).map((file) => toPosix(relative(moduleDir, file))),
    )
    expect(relativos.length, 'el barrido deberia ver los .gitkeep del armazon').toBeGreaterThan(0)
    expect(codeFilesAmong(relativos)).toEqual([])
  })

  it('R11: el detector caza un domain/x.ts sintetico y deja pasar los .gitkeep', () => {
    expect(codeFilesAmong(['domain/.gitkeep', 'domain/x.ts', 'adapters/driving/y.tsx'])).toEqual([
      'domain/x.ts',
      'adapters/driving/y.tsx',
    ])
  })

  it('R12: ningun archivo fuera del modulo lo importa, ni por su contrato ni por una ruta profunda', () => {
    expect(filesImportingTheModule()).toEqual([])
  })

  it('R12: el detector reconoce un import por contrato, uno profundo y uno relativo, y no uno ajeno', () => {
    const desde = join(repoRoot, 'lib', 'composition', 'index.ts')
    const fuente =
      "import { a } from '@/lib/modules/integraciones'\n" +
      "export { b } from '@/lib/modules/integraciones/domain/b'\n" +
      "const c = await import('../modules/integraciones/ports/c')\n" +
      "import { d } from '@/lib/modules/identity'\n"
    const resueltos = importSpecifiers(fuente).filter((spec) => resolvesIntoTheModule(desde, spec))
    expect(resueltos).toEqual([
      '@/lib/modules/integraciones',
      '@/lib/modules/integraciones/domain/b',
      '../modules/integraciones/ports/c',
    ])
  })

  it('R12: lib/composition no nombra el modulo', () => {
    const composicion = listFiles(join(repoRoot, 'lib', 'composition'))
      .filter((file) => CODE_EXTENSIONS.has(extname(file)))
      .filter((file) => withoutComments(readFileSync(file, 'utf8'), extname(file)).includes('integraciones'))
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(composicion).toEqual([])
  })

  it('R13: db/schema.prisma no tiene ningun modelo de integraciones', () => {
    const esquema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
    expect(esquema).not.toMatch(/@module\s+integraciones\b/)
    expect(esquema).toMatch(/@module\s+identity\b/)
  })
})

describe('la autorizacion del modulo es por permiso', () => {
  it('R8: ningun archivo de codigo del modulo nombra un rol, con el detector de guard-autorizacion-por-permiso', () => {
    const archivos = listFiles(moduleDir).filter((file) => /\.tsx?$/.test(file))
    expect(archivos.map((file) => toPosix(relative(moduleDir, file)))).toContain('index.ts')
    for (const archivo of archivos) {
      expect(findForbiddenPatternsInSource(readFileSync(archivo, 'utf8')), archivo).toEqual([])
    }
  })

  it('R8: el detector dispara con un fuente sintetico del modulo que compara con el rol Administrador', () => {
    const sintetico =
      "export function puedeConfigurar(actor: { roleName: string }): boolean {\n" +
      "  return actor.roleName === 'Administrador'\n" +
      '}\n'
    expect(findForbiddenPatternsInSource(sintetico).length).toBeGreaterThan(0)
  })

  it('R9: el codigo del permiso solo aparece en el catalogo y en db/migrations/', () => {
    const conElCodigo = productionFilesContaining(CODIGO)

    expect(conElCodigo, 'el barrido deberia ver el catalogo de permisos').toContain(
      'lib/modules/identity/domain/permissions.ts',
    )
    expect(
      conElCodigo.filter((file) => !isAllowedHolderOfTheCode(file)),
      `${CODIGO} aparece fuera del catalogo y de las migraciones. Si lo exige una pagina, un ` +
        'enlace del menu o un caso de uso nuevo (QC-222 o una ficha posterior), anade su ruta ' +
        'EXACTA a isAllowedHolderOfTheCode en vez de abrir una carpeta entera.',
    ).toEqual([])
  })

  it('R9: la regla rechaza un archivo de produccion ajeno y admite el catalogo y las migraciones', () => {
    expect(isAllowedHolderOfTheCode('lib/modules/identity/domain/permissions.ts')).toBe(true)
    expect(isAllowedHolderOfTheCode('db/migrations/x_integrations_permission/migration.sql')).toBe(true)
    expect(isAllowedHolderOfTheCode('app/(private)/integraciones/whatsapp/page.tsx')).toBe(false)
    expect(isAllowedHolderOfTheCode('lib/shared/navigation/private-nav.ts')).toBe(false)
  })
})
