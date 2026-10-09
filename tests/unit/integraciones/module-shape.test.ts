// El modulo `integraciones` guarda el cifrado de los secretos de las integraciones: un contrato con
// sus errores y el contexto de un secreto, dos puertos y sus adaptadores driven, y un unico
// importador de fuera, `lib/composition`. Su permiso solo lo exigen las tres paginas de
// integraciones y lo declara el menu.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { findDomainPurityFindings } from '../../guards/guard-arquitectura-modulos.test'
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

/**
 * Archivos que exigen o declaran el permiso por su ruta exacta. Una pantalla, un enlace o un caso
 * de uso nuevo entra con su ruta EXACTA, nunca abriendo una carpeta.
 */
const EXACT_HOLDERS_OUTSIDE_THE_CATALOG = [
  'app/(private)/integraciones/proveedor-ia/page.tsx',
  'app/(private)/integraciones/inventarios/page.tsx',
  'app/(private)/integraciones/whatsapp/page.tsx',
  'lib/shared/navigation/private-nav.ts',
  'lib/modules/integraciones/domain/actor.ts',
] as const

/** Lo que el permiso tiene permitido: el catalogo, las migraciones y las rutas exactas de arriba. */
export function isAllowedHolderOfTheCode(relativePath: string): boolean {
  return (
    relativePath === 'lib/modules/identity/domain/permissions.ts' ||
    relativePath.startsWith('db/migrations/') ||
    (EXACT_HOLDERS_OUTSIDE_THE_CATALOG as readonly string[]).includes(relativePath)
  )
}

/** Los archivos de codigo del modulo, uno a uno. Un archivo nuevo entra aqui con su ruta exacta. */
const MODULE_CODE_FILES = [
  'adapters/driven/config/e2e-doubles-env.ts',
  'adapters/driven/config/encryption-keys-env.ts',
  'adapters/driven/config/public-base-url-env.ts',
  'adapters/driven/config/whatsapp-config-env.ts',
  'adapters/driven/graph/whatsapp-graph-client-canned.ts',
  'adapters/driven/graph/whatsapp-graph-client-fetch.ts',
  'adapters/driven/persistence/company-scope.ts',
  'adapters/driven/persistence/whatsapp-connection-prisma.ts',
  'adapters/driven/security/random-source-node.ts',
  'adapters/driven/security/secret-cipher-aes-gcm.ts',
  'adapters/driven/security/secret-digest-sha256.ts',
  'domain/actor.ts',
  'domain/connection-secrets.ts',
  'domain/connection-status.ts',
  'domain/create-whatsapp-connection.ts',
  'domain/errors.ts',
  'domain/get-whatsapp-connection.ts',
  'domain/graph-failure.ts',
  'domain/integraciones-scope.ts',
  'domain/regenerate-whatsapp-verify-token.ts',
  'domain/secret-context.ts',
  'domain/set-whatsapp-connection-enabled.ts',
  'domain/stored-secret.ts',
  'domain/test-whatsapp-connection.ts',
  'domain/update-whatsapp-connection.ts',
  'domain/whatsapp-connection-input.ts',
  'domain/whatsapp-connection.ts',
  'index.ts',
  'ports/random-source.ts',
  'ports/secret-cipher.ts',
  'ports/secret-digest.ts',
  'ports/whatsapp-connection-repository.ts',
  'ports/whatsapp-graph-client.ts',
] as const

/** ¿El fuente importa la criptografia de Node, con o sin prefijo `node:`? */
export function importsNodeCrypto(source: string): boolean {
  return importSpecifiers(source).some((spec) => spec === 'node:crypto' || spec === 'crypto')
}

/** Lo que reexporta un contrato: cada nombre, si es solo de tipo y de donde sale. */
export function contractReexports(
  source: string,
): { otherStatements: number; reexports: { name: string; typeOnly: boolean; from: string }[] } {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const reexports: { name: string; typeOnly: boolean; from: string }[] = []
  let otherStatements = 0
  for (const statement of file.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      otherStatements += 1
      continue
    }
    for (const element of statement.exportClause.elements) {
      reexports.push({
        name: element.name.text,
        typeOnly: statement.isTypeOnly || element.isTypeOnly,
        from: statement.moduleSpecifier.text,
      })
    }
  }
  return { otherStatements, reexports }
}

/** Los miembros del `export const integraciones` de la composicion, y el tipo con que se declara cada uno. */
export function integracionesWiring(source: string): { members: string[]; typeOf: Record<string, string> } | null {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const typeOf: Record<string, string> = {}
  let members: string[] | null = null
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const exported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue
      if (declaration.type) typeOf[declaration.name.text] = declaration.type.getText(file)
      if (!exported || declaration.name.text !== 'integraciones' || !declaration.initializer) continue
      let init: ts.Expression = declaration.initializer
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression
      }
      if (!ts.isObjectLiteralExpression(init)) return null
      members = init.properties.map((property) =>
        property.name && ts.isIdentifier(property.name) ? property.name.text : property.getText(file),
      )
    }
  }
  return members === null ? null : { members, typeOf }
}

/** Lo que esta feature no toca: prefijos de carpeta y archivos exactos. */
const UNTOUCHED_PREFIXES = ['db/', 'app/', 'components/', 'hooks/'] as const
const UNTOUCHED_FILES = ['package.json', 'pnpm-lock.yaml', 'docs/dependencias.md', 'middleware.ts'] as const

/** De una lista de rutas del diff, las que caen en lo que esta feature no toca. */
export function untouchablesAmong(paths: readonly string[]): string[] {
  return paths.filter(
    (path) =>
      UNTOUCHED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
      (UNTOUCHED_FILES as readonly string[]).includes(path),
  )
}

/**
 * El diff solo dice algo en la rama de esta feature: en otra rama, lo que toque quien pase despues
 * no es asunto de este caso. En CI el checkout de un PR deja HEAD suelto y la rama llega por
 * `GITHUB_HEAD_REF`.
 */
const FEATURE_BRANCH = 'feature/QC-234-cifrado-de-secretos-de-integraciones'
const BASE_CANDIDATES = ['dev', 'origin/dev'] as const

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function currentBranch(): string | null {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') return process.env.GITHUB_HEAD_REF || null
  return branch === null || branch.length === 0 ? null : branch
}

/** O el merge-base de la rama con su base, o el motivo por el que no se puede comprobar nada. */
export function branchRange(
  branch: string | null,
  mergeBase: string | null,
): { mergeBase: string } | { reason: string } {
  if (branch === null) return { reason: 'no se pudo leer la rama actual con git: este caso NO ha comprobado nada.' }
  if (branch !== FEATURE_BRANCH) {
    return {
      reason:
        `la rama actual es '${branch}' y no '${FEATURE_BRANCH}': el caso habla de lo que toca ESTA ` +
        'feature, no de lo que toque quien pase despues. Este caso NO ha comprobado nada.',
    }
  }
  if (mergeBase === null) {
    return {
      reason: `no se pudo calcular el merge-base con ${BASE_CANDIDATES.join(' ni con ')}: este caso NO ha comprobado nada.`,
    }
  }
  return { mergeBase }
}

function mergeBaseWithDev(): string | null {
  for (const base of BASE_CANDIDATES) {
    const sha = git(['merge-base', base, 'HEAD'])
    if (sha !== null && sha.length > 0) return sha
  }
  return null
}

/** Archivos que tocan los commits de la rama y el arbol de trabajo (sin versionar incluidos), desde el merge-base. */
function filesChangedSince(mergeBase: string): string[] {
  const outputs = [
    git(['diff', '--name-only', mergeBase]),
    git(['ls-files', '--others', '--exclude-standard']),
  ]
  return outputs
    .flatMap((output) => (output ?? '').split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
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

  it('R20: el contrato reexporta exactamente los tres errores y el tipo SecretContext, y solo desde ./domain', () => {
    const { otherStatements, reexports } = contractReexports(readFileSync(join(moduleDir, 'index.ts'), 'utf8'))

    expect(otherStatements, 'el contrato solo reexporta: ni declaraciones ni export *').toBe(0)
    expect(reexports.map((r) => r.name).sort()).toEqual([
      'IntegracionesError',
      'SecretContext',
      'SecretUnreadableError',
      'ValidationError',
    ])
    expect(reexports.filter((r) => r.typeOnly).map((r) => r.name)).toEqual(['SecretContext'])
    for (const reexport of reexports) {
      expect(reexport.from, reexport.name).toMatch(/^\.\/domain(\/|$)/)
    }
  })

  it('R20: el lector del contrato distingue una reexportacion de ports/ y una declaracion propia', () => {
    const { otherStatements, reexports } = contractReexports(
      "export type { SecretCipher } from './ports/secret-cipher'\nexport const x = 1\n",
    )
    expect(otherStatements).toBe(1)
    expect(reexports).toEqual([{ name: 'SecretCipher', typeOnly: true, from: './ports/secret-cipher' }])
  })

  it('R18: los archivos de codigo del modulo son exactamente los del cifrado de secretos y los de la conexion de WhatsApp', () => {
    const relativos = listFiles(moduleDir).map((file) => toPosix(relative(moduleDir, file)))
    expect(codeFilesAmong(relativos).sort()).toEqual([...MODULE_CODE_FILES])
  })

  it('R18: el detector de archivos de codigo caza un domain/x.ts sintetico y deja pasar los .gitkeep', () => {
    expect(codeFilesAmong(['domain/.gitkeep', 'domain/x.ts', 'adapters/driving/y.tsx'])).toEqual([
      'domain/x.ts',
      'adapters/driving/y.tsx',
    ])
  })

  it('R18: node:crypto solo aparece en adapters/driven/, y ningun archivo de domain/ ni de ports/ lo importa', () => {
    const codigo = listFiles(moduleDir)
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => ({ rel: toPosix(relative(moduleDir, file)), source: readFileSync(file, 'utf8') }))

    const delNucleo = codigo.filter(({ rel }) => rel.startsWith('domain/') || rel.startsWith('ports/'))
    expect(delNucleo.length, 'el barrido deberia ver domain/ y ports/').toBeGreaterThan(0)

    const conCripto = codigo.filter(({ source }) => importsNodeCrypto(source)).map(({ rel }) => rel)
    expect(conCripto.length, 'el cifrador y el resumidor importan node:crypto').toBeGreaterThan(0)
    expect(conCripto.filter((rel) => !rel.startsWith('adapters/driven/'))).toEqual([])
  })

  it('R18: el detector de criptografia reconoce node:crypto y crypto, y no un import ajeno', () => {
    expect(importsNodeCrypto("import { randomBytes } from 'node:crypto'\n")).toBe(true)
    expect(importsNodeCrypto("import { createHash } from 'crypto'\n")).toBe(true)
    expect(importsNodeCrypto("import { z } from 'zod'\n")).toBe(false)
  })

  it('R18: la pureza de dominio de guard-arquitectura-modulos da un hallazgo con un domain/x.ts sintetico que importa node:crypto', () => {
    const relPath = 'lib/modules/integraciones/domain/x.ts'
    const hallazgos = findDomainPurityFindings(
      {
        absPath: join(repoRoot, relPath),
        relPath,
        content: "import { randomBytes } from 'node:crypto'\nexport const x = randomBytes(1)\n",
      },
      repoRoot,
      existsSync,
    )
    expect(hallazgos.length).toBeGreaterThan(0)
    expect(hallazgos.join('\n')).toContain('node:crypto')
  })

  it('R19: el unico archivo de produccion fuera del modulo que lo importa es lib/composition/index.ts', () => {
    expect(filesImportingTheModule()).toEqual(['lib/composition/index.ts'])
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

  it('R19: lib/composition exporta integraciones con exactamente secretCipher y secretDigest, tipados con sus puertos', () => {
    const cableado = integracionesWiring(readFileSync(join(repoRoot, 'lib', 'composition', 'index.ts'), 'utf8'))

    expect(cableado, 'lib/composition/index.ts deberia exportar const integraciones = { ... }').not.toBeNull()
    expect([...(cableado?.members ?? [])].sort()).toEqual(['secretCipher', 'secretDigest'])
    expect(cableado?.typeOf.secretCipher).toBe('SecretCipher')
    expect(cableado?.typeOf.secretDigest).toBe('SecretDigest')
  })

  it('R19: el lector del cableado ve un miembro de mas y un tipo que no es el puerto', () => {
    const cableado = integracionesWiring(
      'const secretCipher: unknown = 1\nconst secretDigest: SecretDigest = 2\n' +
        'export const integraciones = { secretCipher, secretDigest, extra: 3 } as const\n',
    )
    expect(cableado?.members).toEqual(['secretCipher', 'secretDigest', 'extra'])
    expect(cableado?.typeOf.secretCipher).toBe('unknown')
    expect(integracionesWiring('export const otra = {}\n')).toBeNull()
  })

  it('R22: el diff de la rama contra dev no toca db/, package.json, pnpm-lock.yaml, docs/dependencias.md, app/, components/, hooks/ ni middleware.ts', (ctx) => {
    const range = branchRange(currentBranch(), mergeBaseWithDev())
    if ('reason' in range) {
      ctx.skip(range.reason)
      return
    }

    const changed = filesChangedSince(range.mergeBase)
    expect(
      changed.length,
      `el rango ${range.mergeBase}..arbol no trae ningun archivo: sin archivos este caso pasaria sin mirar nada.`,
    ).toBeGreaterThan(0)
    expect(untouchablesAmong(changed)).toEqual([])
  })

  it('R22: el detector del diff caza cada ruta vigilada y deja pasar el modulo, .env.example y los tests', () => {
    expect(
      untouchablesAmong([
        'db/schema.prisma',
        'package.json',
        'pnpm-lock.yaml',
        'docs/dependencias.md',
        'app/(private)/integraciones/whatsapp/page.tsx',
        'components/ui/button.tsx',
        'hooks/use-x.ts',
        'middleware.ts',
        'lib/modules/integraciones/index.ts',
        'lib/composition/index.ts',
        '.env.example',
        'tests/unit/integraciones/module-shape.test.ts',
        'docs/architecture.md',
      ]),
    ).toEqual([
      'db/schema.prisma',
      'package.json',
      'pnpm-lock.yaml',
      'docs/dependencias.md',
      'app/(private)/integraciones/whatsapp/page.tsx',
      'components/ui/button.tsx',
      'hooks/use-x.ts',
      'middleware.ts',
    ])
  })

  it('R22: el caso del diff se salta con motivo fuera de esta rama o sin merge-base, y nunca en ella', () => {
    expect(branchRange(null, 'abc')).toHaveProperty('reason')
    expect((branchRange('dev', 'abc') as { reason: string }).reason).toContain('NO ha comprobado nada')
    expect((branchRange(FEATURE_BRANCH, null) as { reason: string }).reason).toContain('merge-base')
    expect(branchRange(FEATURE_BRANCH, 'abc')).toEqual({ mergeBase: 'abc' })
  })

  it('R13: db/schema.prisma tiene exactamente un modelo de integraciones, WhatsappConnection', () => {
    const esquema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n')
    // El `/// @module` va encima del `model`, con solo lineas `///` entre medias.
    const modelos = [
      ...esquema.matchAll(
        /\/\/\/\s*@module\s+integraciones\b[^\n]*\n(?:[ \t]*\/\/\/[^\n]*\n)*[ \t]*model\s+(\w+)/g,
      ),
    ].map((match) => match[1])
    expect(modelos).toEqual(['WhatsappConnection'])
    expect(esquema.match(/@module\s+integraciones\b/g)).toHaveLength(1)
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

  it('R17: el codigo del permiso solo aparece en el catalogo, en db/migrations/, en las tres paginas de integraciones, en el menu privado y en el actor del modulo', () => {
    const conElCodigo = productionFilesContaining(CODIGO)

    expect(conElCodigo, 'el barrido deberia ver el catalogo de permisos').toContain(
      'lib/modules/identity/domain/permissions.ts',
    )
    expect(
      conElCodigo.filter((file) => !isAllowedHolderOfTheCode(file)),
      `${CODIGO} aparece fuera de los archivos permitidos. Si lo exige una pagina, un enlace del ` +
        'menu o un caso de uso nuevo, anade su ruta EXACTA a isAllowedHolderOfTheCode en vez de ' +
        'abrir una carpeta entera.',
    ).toEqual([])
  })

  it('R17: el barrido ve el codigo del permiso en cada una de las cinco rutas exactas admitidas', () => {
    const conElCodigo = productionFilesContaining(CODIGO)
    for (const ruta of EXACT_HOLDERS_OUTSIDE_THE_CATALOG) {
      expect(conElCodigo, ruta).toContain(ruta)
    }
  })

  it('R17: la regla admite el catalogo, las migraciones y las cinco rutas exactas, y rechaza un archivo vecino', () => {
    expect(isAllowedHolderOfTheCode('lib/modules/identity/domain/permissions.ts')).toBe(true)
    expect(isAllowedHolderOfTheCode('db/migrations/x_integrations_permission/migration.sql')).toBe(true)
    expect(isAllowedHolderOfTheCode('app/(private)/integraciones/proveedor-ia/page.tsx')).toBe(true)
    expect(isAllowedHolderOfTheCode('app/(private)/integraciones/inventarios/page.tsx')).toBe(true)
    expect(isAllowedHolderOfTheCode('app/(private)/integraciones/whatsapp/page.tsx')).toBe(true)
    expect(isAllowedHolderOfTheCode('lib/shared/navigation/private-nav.ts')).toBe(true)
    expect(isAllowedHolderOfTheCode('lib/modules/integraciones/domain/actor.ts')).toBe(true)
    expect(isAllowedHolderOfTheCode('lib/modules/integraciones/domain/errors.ts')).toBe(false)
    expect(
      isAllowedHolderOfTheCode('app/(private)/integraciones/components/integration-placeholder.tsx'),
    ).toBe(false)
    expect(isAllowedHolderOfTheCode('lib/shared/routes.ts')).toBe(false)
  })
})
