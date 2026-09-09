// QC-70 T3 — Guardia: el catalogo unico de errores (R4, R6, R9, R16, R20, R22, R23, R24,
// R29, R30).
//
// Recorre el ARBOL DE ARCHIVOS y el TEXTO DEL FUENTE, no el comportamiento: la propiedad que
// se exige —«ningun modulo declara un codigo fuera del catalogo», «el estado de error no puede
// ganar un campo», «nadie mas escribe su propio traductor»— es del CODIGO FUENTE. Por eso vive
// en `tests/guards/` y entra en `pnpm run test:guardias` (patron `guard`).
//
// Misma forma que `guard-arquitectura-modulos.test.ts`: funciones puras EXPORTADAS que reciben
// lo leido del disco y devuelven hallazgos, mas un caso que las alimenta con el repositorio
// real. Cada comprobacion se demuestra con una entrada sintetica que la VIOLA y con la
// simetrica que no: un `expect(hallazgos).toEqual([])` sobre el repo real, solo, no demuestra
// que la regla dispare.
//
// Por que guardia y no solo test: un test comprueba que HOY el estado no lleva el diagnostico;
// la guardia comprueba que NADIE PUEDE anadirlo sin ponerse roja. Van las dos.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  ERROR_MESSAGE_KEY,
  ERROR_MESSAGES_ES,
  UNEXPECTED_ERROR_CODE,
} from '@/lib/modules/errores'

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

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const SCAN_ROOTS = ['app', 'components', 'hooks', 'lib']

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

function listSourceFiles(dir: string): readonly string[] {
  let names: readonly string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      return IGNORED_DIRS.has(name) ? [] : listSourceFiles(full)
    }
    return SOURCE_EXTENSIONS.has(extname(name)) ? [full] : []
  })
}

/** Un archivo tal como lo ve la guardia: su ruta relativa en POSIX y su contenido. */
export type SourceFile = { relPath: string; content: string }

const allSourceFiles: readonly SourceFile[] = SCAN_ROOTS.flatMap((root) =>
  listSourceFiles(join(repoRoot, root)).map((absPath) => ({
    relPath: toPosix(relative(repoRoot, absPath)),
    content: readFileSync(absPath, 'utf8'),
  })),
)

const errorFiles = allSourceFiles.filter((file) => /^lib\/modules\/[^/]+\/domain\/errors\.ts$/.test(file.relPath))

export const TRANSLATOR_FILE = 'lib/modules/errores/domain/error-state.ts'

const CATALOG_CODES: readonly string[] = ERROR_CODES

// ---------------------------------------------------------------------------
// Extraccion comun: las clases de error y los codigos que declaran
// ---------------------------------------------------------------------------

export type ErrorClassDeclaration = { name: string; base: string | null; body: string }

/** Trocea un `errors.ts` en sus clases: nombre, clase de la que extiende y cuerpo. */
export function extractErrorClasses(content: string): readonly ErrorClassDeclaration[] {
  const pattern = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?\s*\{/g
  const matches = [...content.matchAll(pattern)]
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const next = matches[index + 1]
    const end = next ? (next.index ?? content.length) : content.length
    return { name: match[1] as string, base: (match[2] as string | undefined) ?? null, body: content.slice(start, end) }
  })
}

/** Los `readonly code = '<x>'` que declara un archivo de errores. */
export function extractDeclaredCodes(file: SourceFile): readonly string[] {
  return [...file.content.matchAll(/readonly\s+code\s*(?::[^=]+)?=\s*'([^']+)'/g)].map((match) => match[1] as string)
}

// ---------------------------------------------------------------------------
// CASO 1 — Codigo fuera del catalogo (R22)
// ---------------------------------------------------------------------------

/** Todo `readonly code` declarado por un modulo tiene que estar en el catalogo (R22). */
export function findCodeOutsideCatalogFindings(
  files: readonly SourceFile[],
  catalogCodes: readonly string[],
): readonly string[] {
  return files.flatMap((file) =>
    extractDeclaredCodes(file)
      .filter((code) => !catalogCodes.includes(code))
      .map((code) => `${file.relPath}: el codigo '${code}' no esta en el catalogo (R22)`),
  )
}

// ---------------------------------------------------------------------------
// CASO 2 — Traductor duplicado (R23)
// ---------------------------------------------------------------------------

/**
 * Ningun archivo fuera del traductor unico define su propia traduccion de error a
 * `{ status: 'error', ... }` a partir de un `instanceof`, ni vuelve a declarar `toErrorState`
 * como funcion (R23). `const toErrorState = createErrorStateTranslator(X)` SI es legitimo.
 */
export function findDuplicateTranslatorFindings(file: SourceFile): readonly string[] {
  if (file.relPath === TRANSLATOR_FILE) return []
  const findings: string[] = []
  if (/(?:function\s+toErrorState\s*\(|toErrorState\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\b|\())/.test(file.content)) {
    findings.push(`${file.relPath}: vuelve a declarar 'toErrorState' como funcion propia (R23)`)
  }
  const construyeEstado = /\{\s*status:\s*'error'[\s\S]{0,200}?\bmessage\s*:/.test(file.content)
  if (construyeEstado && /\binstanceof\b/.test(file.content)) {
    findings.push(`${file.relPath}: traduce un error a { status: 'error', ... } por su cuenta (R23)`)
  }
  return findings
}

// ---------------------------------------------------------------------------
// CASO 3 — Mensaje sobreescribible (R24)
// ---------------------------------------------------------------------------

/** Ningun constructor de clase de error admite un parametro `message` (R24, protege R7). */
export function findMessageParameterFindings(file: SourceFile): readonly string[] {
  return extractErrorClasses(file.content).flatMap((clase) => {
    const constructor = /constructor\s*\(([^)]*)\)/.exec(clase.body)
    if (!constructor) return []
    return /\bmessage\b/.test(constructor[1] as string)
      ? [`${file.relPath}: el constructor de ${clase.name} admite un parametro 'message' (R24)`]
      : []
  })
}

// ---------------------------------------------------------------------------
// CASO 4 — Familia por modulo (R6)
// ---------------------------------------------------------------------------

/** Cada `errors.ts` tiene UNA base que extiende `Error`, y todas las demas derivan de ella (R6). */
export function findErrorFamilyFindings(file: SourceFile): readonly string[] {
  const clases = extractErrorClasses(file.content)
  if (clases.length === 0) return [`${file.relPath}: no declara ninguna clase de error (R6)`]
  const bases = clases.filter((clase) => clase.base === 'Error')
  if (bases.length !== 1) {
    return [`${file.relPath}: se esperaba exactamente una clase base que extienda Error, hay ${bases.length} (R6)`]
  }
  const base = bases[0] as ErrorClassDeclaration
  return clases
    .filter((clase) => clase.name !== base.name && clase.base !== base.name)
    .map((clase) => `${file.relPath}: la clase ${clase.name} no deriva de ${base.name} (R6)`)
}

// ---------------------------------------------------------------------------
// CASO 5 — Entradas huerfanas (R9)
// ---------------------------------------------------------------------------

/** Todo codigo del catalogo lo declara alguna clase, salvo el generico del traductor (R9). */
export function findOrphanCatalogEntryFindings(
  catalogCodes: readonly string[],
  declaredCodes: readonly string[],
): readonly string[] {
  return catalogCodes
    .filter((code) => code !== UNEXPECTED_ERROR_CODE && !declaredCodes.includes(code))
    .map((code) => `catalogo: el codigo '${code}' no lo declara ninguna clase de error (R9)`)
}

// ---------------------------------------------------------------------------
// CASO 6 — Texto duplicado (R4)
// ---------------------------------------------------------------------------

/** Dos claves con el mismo texto serian dos codigos para un solo caso (R4). */
export function findDuplicateMessageFindings(messages: Readonly<Record<string, string>>): readonly string[] {
  const findings: string[] = []
  const vistos = new Map<string, string>()
  for (const [clave, texto] of Object.entries(messages)) {
    const anterior = vistos.get(texto)
    if (anterior !== undefined) {
      findings.push(`catalogo: las claves '${anterior}' y '${clave}' comparten el mismo texto (R4)`)
    } else {
      vistos.set(texto, clave)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// CASO 7 — Genericos prohibidos (R16, R20)
// ---------------------------------------------------------------------------

export const FORBIDDEN_GENERIC_CODES = ['not_found', 'duplicate_name'] as const

/** `not_found` y `duplicate_name` no vuelven al catalogo (R16). */
export function findForbiddenGenericCatalogFindings(catalogCodes: readonly string[]): readonly string[] {
  return FORBIDDEN_GENERIC_CODES.filter((code) => catalogCodes.includes(code)).map(
    (code) => `catalogo: el codigo generico '${code}' esta prohibido (R16)`,
  )
}

/** Ninguna pantalla compara contra el codigo generico (R20). Solo aplica a `app/**` y `components/**`. */
export function findForbiddenGenericComparisonFindings(file: SourceFile): readonly string[] {
  if (!file.relPath.startsWith('app/') && !file.relPath.startsWith('components/')) return []
  return [...file.content.matchAll(/['"](not_found|duplicate_name)['"]/g)].map(
    (match) => `${file.relPath}: compara contra el codigo generico '${match[1] as string}' (R20)`,
  )
}

// ---------------------------------------------------------------------------
// CASO 8 — Forma CERRADA de `ErrorState` (R30)
// ---------------------------------------------------------------------------

export const ERROR_STATE_FIELDS = ['status', 'code', 'message', 'reference'] as const

/** Los campos declarados en `type ErrorState = { ... }`, leidos del fuente. */
export function extractErrorStateFields(source: string): readonly string[] | null {
  const inicio = /type\s+ErrorState\s*=\s*\{/.exec(source)
  if (!inicio) return null
  let profundidad = 0
  let fin = -1
  for (let i = (inicio.index ?? 0) + inicio[0].length - 1; i < source.length; i += 1) {
    const caracter = source[i]
    if (caracter === '{') profundidad += 1
    if (caracter === '}') {
      profundidad -= 1
      if (profundidad === 0) {
        fin = i
        break
      }
    }
  }
  if (fin === -1) return null
  const cuerpo = source
    .slice((inicio.index ?? 0) + inicio[0].length, fin)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n')
  return [...cuerpo.matchAll(/(\w+)\s*\??\s*:/g)].map((match) => match[1] as string)
}

/**
 * La DECLARACION del tipo —no una instancia— tiene exactamente los cuatro campos (R30). Se lee
 * del archivo para que muerda el dia que alguien lo DECLARE, sin necesidad de que llegue a
 * ejecutarse ni de que un objeto concreto lo lleve.
 */
export function findErrorStateShapeFindings(relPath: string, source: string): readonly string[] {
  const campos = extractErrorStateFields(source)
  if (campos === null) return [`${relPath}: no se encontro la declaracion de 'type ErrorState' (R30)`]
  const declarados: readonly string[] = ERROR_STATE_FIELDS
  const findings = campos
    .filter((campo) => !declarados.includes(campo))
    .map((campo) => `${relPath}: el tipo ErrorState declara el campo '${campo}', fuera de ${declarados.join('/')} (R30)`)
  const faltan = declarados.filter((campo) => !campos.includes(campo))
  return [...findings, ...faltan.map((campo) => `${relPath}: el tipo ErrorState ya no declara '${campo}' (R30)`)]
}

// ---------------------------------------------------------------------------
// CASO 9 — El diagnostico no cruza la serializacion (R29, R30)
// ---------------------------------------------------------------------------

/**
 * Ni `app/**`, ni `components/**`, ni ningun `adapters/driving/**` leen `.diagnostic`; y el
 * traductor no construye el estado con `...error` ni con `Object.assign` (R29, R30).
 */
export function findDiagnosticLeakFindings(file: SourceFile): readonly string[] {
  const findings: string[] = []
  const esConsumidor =
    file.relPath.startsWith('app/') ||
    file.relPath.startsWith('components/') ||
    file.relPath.includes('/adapters/driving/')
  if (esConsumidor && (/\.diagnostic\b/.test(file.content) || /\{[^}]*\bdiagnostic\b[^}]*\}\s*=/.test(file.content))) {
    findings.push(`${file.relPath}: lee el campo de diagnostico, que nunca cruza al navegador (R30)`)
  }
  if (file.relPath === TRANSLATOR_FILE) {
    const construccion = file.content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
    if (/\{\s*\.\.\./.test(construccion) || /Object\.assign/.test(construccion)) {
      findings.push(`${file.relPath}: construye el estado con spread u Object.assign en vez de campo a campo (R29)`)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Los casos
// ---------------------------------------------------------------------------

describe('guardia del catalogo de errores (QC-70 T3)', () => {
  it('el barrido encuentra los cinco archivos de errores de modulo y el traductor', () => {
    expect(allSourceFiles.length, 'no se encontro ningun archivo fuente bajo SCAN_ROOTS').toBeGreaterThan(0)
    expect(errorFiles.length).toBeGreaterThanOrEqual(5)
    expect(allSourceFiles.map((file) => file.relPath)).toContain(TRANSLATOR_FILE)
  })

  describe('caso 1 — codigo fuera del catalogo (R22)', () => {
    it('muerde: un modulo que declara un codigo que no esta en el catalogo', () => {
      const findings = findCodeOutsideCatalogFindings(
        [
          {
            relPath: 'lib/modules/pedidos/domain/errors.ts',
            content: `export class NotFoundError extends PedidosError {\n  readonly code = 'not_found';\n}`,
          },
        ],
        CATALOG_CODES,
      )
      expect(findings).toEqual(["lib/modules/pedidos/domain/errors.ts: el codigo 'not_found' no esta en el catalogo (R22)"])
    })

    it('limpio: un modulo que declara solo codigos del catalogo', () => {
      expect(
        findCodeOutsideCatalogFindings(
          [
            {
              relPath: 'lib/modules/pedidos/domain/errors.ts',
              content: `export class OrderNotFoundError extends PedidosError {\n  readonly code = 'order_not_found';\n}\nexport class UnauthorizedError extends PedidosError {\n  readonly code = 'unauthorized';\n}`,
            },
          ],
          CATALOG_CODES,
        ),
      ).toEqual([])
    })
  })

  describe('caso 2 — traductor duplicado (R23)', () => {
    it('muerde: un adaptador driving que se escribe su propio toErrorState', () => {
      const findings = findDuplicateTranslatorFindings({
        relPath: 'lib/modules/pedidos/adapters/driving/order-actions.ts',
        content: `function toErrorState(error: unknown) {\n  if (error instanceof PedidosError) {\n    return { status: 'error', code: error.code, message: error.message };\n  }\n  throw error;\n}`,
      })
      expect(findings).toEqual([
        "lib/modules/pedidos/adapters/driving/order-actions.ts: vuelve a declarar 'toErrorState' como funcion propia (R23)",
        "lib/modules/pedidos/adapters/driving/order-actions.ts: traduce un error a { status: 'error', ... } por su cuenta (R23)",
      ])
    })

    it('limpio: el adaptador que pide el traductor a la fabrica, y el propio traductor unico', () => {
      expect(
        findDuplicateTranslatorFindings({
          relPath: 'lib/modules/pedidos/adapters/driving/order-actions.ts',
          content: `const toErrorState = createErrorStateTranslator(PedidosError);`,
        }),
      ).toEqual([])
      expect(
        findDuplicateTranslatorFindings({
          relPath: TRANSLATOR_FILE,
          content: readFileSync(join(repoRoot, TRANSLATOR_FILE), 'utf8'),
        }),
      ).toEqual([])
    })
  })

  describe('caso 3 — mensaje sobreescribible (R24)', () => {
    it('muerde: un constructor de error que admite un mensaje por parametro', () => {
      const findings = findMessageParameterFindings({
        relPath: 'lib/modules/recetas/domain/errors.ts',
        content: `export class RecipeNotFoundError extends RecetasError {\n  readonly code = 'recipe_not_found';\n\n  constructor(message = 'La receta no existe.') {\n    super(message);\n  }\n}`,
      })
      expect(findings).toEqual([
        "lib/modules/recetas/domain/errors.ts: el constructor de RecipeNotFoundError admite un parametro 'message' (R24)",
      ])
    })

    it('limpio: un constructor que solo admite el diagnostico', () => {
      expect(
        findMessageParameterFindings({
          relPath: 'lib/modules/recetas/domain/errors.ts',
          content: `export class RecipeNotFoundError extends RecetasError {\n  readonly code = 'recipe_not_found';\n\n  constructor(diagnostic?: string) {\n    super('recipe_not_found', diagnostic);\n  }\n}`,
        }),
      ).toEqual([])
    })
  })

  describe('caso 4 — familia por modulo (R6)', () => {
    it('muerde: una clase que no deriva de la base del modulo', () => {
      const findings = findErrorFamilyFindings({
        relPath: 'lib/modules/unidades/domain/errors.ts',
        content: `export abstract class UnidadesError extends Error {}\nexport class UnitInUseError extends Error {}`,
      })
      expect(findings).toEqual([
        'lib/modules/unidades/domain/errors.ts: se esperaba exactamente una clase base que extienda Error, hay 2 (R6)',
      ])
      expect(
        findErrorFamilyFindings({
          relPath: 'lib/modules/unidades/domain/errors.ts',
          content: `export abstract class UnidadesError extends Error {}\nexport class UnitInUseError extends OtraCosa {}`,
        }),
      ).toEqual(['lib/modules/unidades/domain/errors.ts: la clase UnitInUseError no deriva de UnidadesError (R6)'])
    })

    it('limpio: la base extiende Error y las demas extienden la base', () => {
      expect(
        findErrorFamilyFindings({
          relPath: 'lib/modules/unidades/domain/errors.ts',
          content: `export abstract class UnidadesError extends Error {}\nexport class UnitInUseError extends UnidadesError {}\nexport class SystemUnitError extends UnidadesError {}`,
        }),
      ).toEqual([])
    })

    it('el repositorio real: los cinco modulos conservan su familia', () => {
      expect(errorFiles.flatMap((file) => findErrorFamilyFindings(file))).toEqual([])
    })
  })

  describe('caso 5 — entradas huerfanas (R9)', () => {
    it('muerde: un codigo del catalogo que ninguna clase declara', () => {
      expect(findOrphanCatalogEntryFindings(['unauthorized', 'unit_in_use'], ['unauthorized'])).toEqual([
        "catalogo: el codigo 'unit_in_use' no lo declara ninguna clase de error (R9)",
      ])
    })

    it('limpio: todos declarados, y el generico del traductor no cuenta como huerfano', () => {
      expect(findOrphanCatalogEntryFindings(['unauthorized', 'unexpected'], ['unauthorized'])).toEqual([])
    })
  })

  describe('caso 6 — texto duplicado (R4)', () => {
    it('muerde: dos claves con la misma frase', () => {
      expect(
        findDuplicateMessageFindings({
          'errors.unit_not_found': 'La unidad no existe.',
          'errors.unit_duplicate_name': 'La unidad no existe.',
        }),
      ).toEqual(["catalogo: las claves 'errors.unit_not_found' y 'errors.unit_duplicate_name' comparten el mismo texto (R4)"])
    })

    it('limpio: cada clave con su frase', () => {
      expect(
        findDuplicateMessageFindings({
          'errors.unit_not_found': 'La unidad no existe.',
          'errors.unit_duplicate_name': 'Ya existe una unidad con ese nombre.',
        }),
      ).toEqual([])
    })

    it('el repositorio real: el catalogo no tiene dos claves con el mismo texto', () => {
      expect(findDuplicateMessageFindings(ERROR_MESSAGES_ES)).toEqual([])
      expect(Object.keys(ERROR_MESSAGE_KEY)).toHaveLength(ERROR_CODES.length)
    })
  })

  describe('caso 7 — genericos prohibidos (R16, R20)', () => {
    it('muerde: el generico de vuelta al catalogo, y una pantalla que compara contra el', () => {
      expect(findForbiddenGenericCatalogFindings(['unauthorized', 'not_found', 'duplicate_name'])).toEqual([
        "catalogo: el codigo generico 'not_found' esta prohibido (R16)",
        "catalogo: el codigo generico 'duplicate_name' esta prohibido (R16)",
      ])
      expect(
        findForbiddenGenericComparisonFindings({
          relPath: 'app/(private)/proveedores/[id]/page.tsx',
          content: `if (result.code === 'not_found') return notFound();`,
        }),
      ).toEqual(["app/(private)/proveedores/[id]/page.tsx: compara contra el codigo generico 'not_found' (R20)"])
    })

    it('limpio: el catalogo abierto por caso, y una pantalla que compara el codigo concreto', () => {
      expect(findForbiddenGenericCatalogFindings(CATALOG_CODES)).toEqual([])
      expect(
        findForbiddenGenericComparisonFindings({
          relPath: 'app/(private)/proveedores/[id]/page.tsx',
          content: `if (result.code === 'supplier_not_found') return notFound();`,
        }),
      ).toEqual([])
      // Un codigo que CONTIENE la palabra prohibida no es un hallazgo: la comilla delimita.
      expect(
        findForbiddenGenericComparisonFindings({
          relPath: 'components/shared/presentation-select.tsx',
          content: `if (state.code === 'presentation_duplicate_name') setError(state.message);`,
        }),
      ).toEqual([])
      // Y fuera de app/ y components/, la funcion no aplica en absoluto.
      expect(
        findForbiddenGenericComparisonFindings({
          relPath: 'lib/modules/pedidos/domain/errors.ts',
          content: `readonly code = 'not_found';`,
        }),
      ).toEqual([])
    })

    it('el repositorio real: el catalogo no contiene ningun generico', () => {
      expect(findForbiddenGenericCatalogFindings(CATALOG_CODES)).toEqual([])
    })
  })

  describe('caso 8 — forma cerrada de ErrorState (R30)', () => {
    const TIPO_LIMPIO = [
      'export type ErrorState = {',
      "  status: 'error'",
      '  code: ErrorCode',
      '  message: string',
      '  /** Hueco de QC-71. */',
      '  reference?: string',
      '}',
    ].join('\n')

    it('muerde: la DECLARACION del tipo gana un campo de diagnostico', () => {
      const conDiagnostico = TIPO_LIMPIO.replace('  reference?: string', '  reference?: string\n  diagnostic: string')
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, conDiagnostico)).toEqual([
        `${TRANSLATOR_FILE}: el tipo ErrorState declara el campo 'diagnostic', fuera de status/code/message/reference (R30)`,
      ])
    })

    it('muerde tambien: cualquier otro campo de mas, y un campo declarado que desaparece', () => {
      const conExtra = TIPO_LIMPIO.replace('  message: string', '  message: string\n  cause: unknown')
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, conExtra)).toEqual([
        `${TRANSLATOR_FILE}: el tipo ErrorState declara el campo 'cause', fuera de status/code/message/reference (R30)`,
      ])
      const sinReferencia = TIPO_LIMPIO.replace('  reference?: string', '')
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, sinReferencia)).toEqual([
        `${TRANSLATOR_FILE}: el tipo ErrorState ya no declara 'reference' (R30)`,
      ])
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, 'export type Otro = { a: string }')).toEqual([
        `${TRANSLATOR_FILE}: no se encontro la declaracion de 'type ErrorState' (R30)`,
      ])
    })

    it('limpio: los cuatro campos declarados y ninguno mas', () => {
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, TIPO_LIMPIO)).toEqual([])
      expect(extractErrorStateFields(TIPO_LIMPIO)).toEqual(['status', 'code', 'message', 'reference'])
    })

    it('el repositorio real: ErrorState declara exactamente status, code, message y reference', () => {
      const source = readFileSync(join(repoRoot, TRANSLATOR_FILE), 'utf8')
      expect(extractErrorStateFields(source)).toEqual([...ERROR_STATE_FIELDS])
      expect(findErrorStateShapeFindings(TRANSLATOR_FILE, source)).toEqual([])
    })
  })

  describe('caso 9 — el diagnostico no cruza la serializacion (R29, R30)', () => {
    it('muerde: una pantalla o un adaptador driving que lee .diagnostic', () => {
      expect(
        findDiagnosticLeakFindings({
          relPath: 'app/(private)/pedidos/components/order-form.tsx',
          content: `<p>{state.diagnostic}</p>`,
        }),
      ).toEqual([
        'app/(private)/pedidos/components/order-form.tsx: lee el campo de diagnostico, que nunca cruza al navegador (R30)',
      ])
      expect(
        findDiagnosticLeakFindings({
          relPath: 'components/shared/presentation-select.tsx',
          content: `const { diagnostic } = state;`,
        }),
      ).toEqual([
        'components/shared/presentation-select.tsx: lee el campo de diagnostico, que nunca cruza al navegador (R30)',
      ])
      expect(
        findDiagnosticLeakFindings({
          relPath: 'lib/modules/pedidos/adapters/driving/order-actions.ts',
          content: `return { ...base, detalle: error.diagnostic };`,
        }),
      ).toEqual([
        'lib/modules/pedidos/adapters/driving/order-actions.ts: lee el campo de diagnostico, que nunca cruza al navegador (R30)',
      ])
    })

    it('muerde: el traductor construyendo el estado con spread o con Object.assign', () => {
      expect(
        findDiagnosticLeakFindings({
          relPath: TRANSLATOR_FILE,
          content: `return { ...error, status: 'error' as const };`,
        }),
      ).toEqual([
        `${TRANSLATOR_FILE}: construye el estado con spread u Object.assign en vez de campo a campo (R29)`,
      ])
      expect(
        findDiagnosticLeakFindings({
          relPath: TRANSLATOR_FILE,
          content: `return Object.assign({ status: 'error' }, error);`,
        }),
      ).toEqual([
        `${TRANSLATOR_FILE}: construye el estado con spread u Object.assign en vez de campo a campo (R29)`,
      ])
    })

    it('limpio: nadie lee el diagnostico y el traductor construye campo a campo', () => {
      expect(
        findDiagnosticLeakFindings({
          relPath: 'app/(private)/pedidos/components/order-form.tsx',
          content: `<p>{state.message}</p>`,
        }),
      ).toEqual([])
      expect(
        findDiagnosticLeakFindings({
          relPath: TRANSLATOR_FILE,
          content: `return { status: 'error', code: error.code, message: errorMessage(error.code) };`,
        }),
      ).toEqual([])
      // El dominio SI puede leer el diagnostico: no es un consumidor que serialice.
      expect(
        findDiagnosticLeakFindings({
          relPath: 'lib/modules/pedidos/domain/errors.ts',
          content: `this.diagnostic = diagnostic;`,
        }),
      ).toEqual([])
    })

    it('el repositorio real: ni la UI ni ningun driving leen el diagnostico, y el traductor no usa spread', () => {
      expect(allSourceFiles.flatMap((file) => findDiagnosticLeakFindings(file))).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // El repositorio real, para las comprobaciones que la MIGRACION todavia no ha cerrado.
  //
  // Hoy sale ROJO a proposito y esta esperado: los cinco modulos siguen declarando
  // `not_found` y `duplicate_name`, los siete adaptadores driving siguen con su copia de
  // `toErrorState`, los constructores siguen admitiendo `message`, y el catalogo tiene
  // entradas que ninguna clase emite todavia. Es exactamente lo que T4-T8 arreglan.
  //
  // Medido el 2026-09-08 quitando el `.skip`: 9 codigos fuera del catalogo, 14 archivos con
  // traductor propio, 36 constructores con `message`, 10 entradas huerfanas y 8 comparaciones
  // contra un generico en la UI. O sea que estas cinco MUERDEN sobre el arbol real; lo que
  // falta no es la regla, es la migracion.
  //
  // SE DESMARCA EN T9, que es la task que existe para eso.
  // ---------------------------------------------------------------------------
  describe.skip('el repositorio real, tras la migracion (se desmarca en T9)', () => {
    it('ningun modulo declara un codigo fuera del catalogo (R22)', () => {
      expect(findCodeOutsideCatalogFindings(errorFiles, CATALOG_CODES)).toEqual([])
    })

    it('ningun archivo define su propio traductor (R23)', () => {
      expect(allSourceFiles.flatMap((file) => findDuplicateTranslatorFindings(file))).toEqual([])
    })

    it('ningun constructor de error admite un mensaje (R24)', () => {
      expect(errorFiles.flatMap((file) => findMessageParameterFindings(file))).toEqual([])
    })

    it('el catalogo no tiene entradas huerfanas (R9)', () => {
      const declarados = errorFiles.flatMap((file) => extractDeclaredCodes(file))
      expect(findOrphanCatalogEntryFindings(CATALOG_CODES, declarados)).toEqual([])
    })

    it('ninguna pantalla compara contra un codigo generico (R20)', () => {
      expect(allSourceFiles.flatMap((file) => findForbiddenGenericComparisonFindings(file))).toEqual([])
    })
  })
})
