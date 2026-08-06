// T10 — Guardia: ninguna columna ni campo guarda la contrasena en claro (R11).
//
// Recorre el ARBOL DE ARCHIVOS, no el grafo de imports: un `migration.sql` o un script
// suelto que nadie importa tambien puede introducir una columna de contrasena en claro,
// y ningun test unitario lo veria. Por eso vive en `tests/guards/` y entra en
// `pnpm run test:guardias`.
//
// Solo mira POSICIONES DE DECLARACION (columna SQL, campo Prisma, propiedad o variable
// TypeScript). Una cadena cualquiera que contenga "pass" —p. ej. la bandera
// `--passWithNoTests` de vitest— no es una columna y no debe teñir la guardia de rojo.

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

/** Carpetas barridas: todo lo que puede declarar una columna o un campo. */
const SCANNED_DIRS = ['db', 'lib', 'app', 'scripts'] as const

/** Artefactos generados y dependencias: no son codigo de este repo. */
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.sql', '.prisma'])

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

/** Palabras que no pueden nombrar una columna ni un campo si no acaban en `_hash`. */
const FORBIDDEN_SEGMENTS = ['password', 'pass', 'contrasena', 'contraseña'] as const

/**
 * Sufijos que hacen que un identificador NO nombre un valor almacenado, sino el
 * artefacto que lo rodea. El criterio para admitir uno es estrecho: el ultimo
 * segmento tiene que denotar por si solo una CATEGORIA de cosa que no es un dato
 * persistido, de forma que `<lo_que_sea>_<sufijo>` no pueda leerse nunca como
 * "columna que guarda <lo que sea>".
 *
 *  - `route`, `path`, `url`, `href`  -> destino de navegacion (p. ej. `FORGOT_PASSWORD_ROUTE`).
 *  - `id`, `ids`                     -> identificador de nodo DOM / referencia (p. ej. `PASSWORD_ERROR_ID`).
 *  - `error`, `errors`, `message`    -> texto o estado de validacion (p. ej. `passwordError`).
 *  - `label`, `placeholder`          -> copy de formulario.
 *  - `field`, `input`                -> el control, no su contenido.
 *
 * Deliberadamente FUERA: `name`, `key`, `type`, `value`, `data`, `text` y similares,
 * porque cualquiera de ellos si puede ser el nombre de una columna real.
 *
 * `hash` NO vive aqui: es un caso distinto (si es un valor almacenado, solo que uno
 * legitimo) y se sigue tratando aparte, exactamente igual que antes.
 */
const NON_COLUMN_SUFFIXES = new Set([
  'route',
  'path',
  'url',
  'href',
  'id',
  'ids',
  'error',
  'errors',
  'message',
  'label',
  'placeholder',
  'field',
  'input',
])

/**
 * Contrasena EN TRANSITO permitida, acotada por ruta de archivo. Una pantalla de login
 * tiene que recibir y validar una contrasena en claro; lo que no puede es persistirla.
 * Cada entrada es un archivo concreto y la lista exacta de identificadores tolerados en
 * el: el mismo nombre en `db/`, en `scripts/` o en cualquier otro archivo de `lib/`
 * sigue siendo un hallazgo.
 */
const IN_TRANSIT_ALLOWLIST: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  // Campo del `FormData` que llega del formulario de login y se pasa a zod. No se
  // escribe en ninguna tabla: la action solo lo valida y delega la verificacion.
  ['lib/actions/login.ts', new Set(['password'])],
  // Clave del schema zod que valida esa entrada (y del mapa de errores de campo).
  // Es el contrato del formulario, no un modelo de datos.
  ['lib/types/auth.ts', new Set(['password'])],
])

/** Ruta comparable: separadores POSIX, para casar la allowlist venga la ruta como venga. */
function toPosixPath(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

/** Identificadores tolerados en ESTE archivo por estar en transito, no almacenados. */
function allowlistFor(file: string): ReadonlySet<string> {
  const posix = toPosixPath(file)
  for (const [allowedPath, identifiers] of IN_TRANSIT_ALLOWLIST) {
    if (posix === allowedPath || posix.endsWith(`/${allowedPath}`)) return identifiers
  }
  return new Set()
}

/** `passwordHash` -> `password_hash`; `"PASSWORD"` -> `password`. */
function toSnake(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/** Un identificador es "de contrasena en claro" si nombra la contrasena y no es un hash. */
export function isPlaintextPasswordIdentifier(identifier: string): boolean {
  const snake = toSnake(identifier)
  const segments = snake.split('_').filter((segment) => segment.length > 0)
  if (segments.length === 0) return false
  const nombraLaContrasena = segments.some((segment) =>
    (FORBIDDEN_SEGMENTS as readonly string[]).includes(segment),
  )
  if (!nombraLaContrasena) return false
  const ultimo = segments[segments.length - 1] as string
  if (ultimo === 'hash') return false
  // Supresion POR FORMA del identificador, no por lista de nombres: lo que decide es el
  // ultimo segmento, asi que `password` a secas sigue siendo un hallazgo.
  return !NON_COLUMN_SUFFIXES.has(ultimo)
}

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function stripLineComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Identificadores en posicion de DECLARACION, segun el tipo de archivo. */
function declaredIdentifiers(file: string, content: string): readonly string[] {
  const extension = extname(file)
  if (extension === '.sql') {
    // En SQL todo identificador es un nombre de objeto: columna, tabla, indice o constraint.
    return [...stripSqlComments(content).matchAll(/"?\b([A-Za-z_][A-Za-z0-9_]*)\b"?/g)].map(
      (match) => match[1] as string,
    )
  }
  if (extension === '.prisma') {
    // Campo de modelo: `nombre Tipo @atributos`, y el destino de `@map("columna")`.
    const source = stripLineComments(content)
    const fields = [...source.matchAll(/^\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s+\S+/gm)].map(
      (match) => match[1] as string,
    )
    const maps = [...source.matchAll(/@map\("([^"]+)"\)/g)].map((match) => match[1] as string)
    return [...fields, ...maps]
  }
  // TypeScript/JavaScript: claves de objeto, propiedades de clase, variables y asignaciones.
  const source = stripLineComments(content).replace(/\/\*[\s\S]*?\*\//g, ' ')
  const keys = [...source.matchAll(/(?:^|[{,;(])\s*(?:readonly\s+)?['"]?([A-Za-z_$][\w$]*)['"]?\s*[:=]/gm)].map(
    (match) => match[1] as string,
  )
  const declarations = [...source.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map(
    (match) => match[1] as string,
  )
  const assignments = [...source.matchAll(/\.([A-Za-z_$][\w$]*)\s*=[^=]/g)].map(
    (match) => match[1] as string,
  )
  return [...keys, ...declarations, ...assignments]
}

/** Hallazgos `archivo → identificador` de contrasena en claro. */
export function findPlaintextPasswordDeclarations(
  file: string,
  content: string,
): readonly string[] {
  const permitidos = allowlistFor(file)
  return [
    ...new Set(
      declaredIdentifiers(file, content)
        .filter(isPlaintextPasswordIdentifier)
        .filter((identifier) => !permitidos.has(identifier)),
    ),
  ]
}

const scannedFiles = SCANNED_DIRS.flatMap((dir) => listFiles(join(repoRoot, dir)))

describe('guardia — contrasena nunca en claro', () => {
  it('ninguna columna ni campo guarda la contrasena en claro', () => {
    expect(scannedFiles.length, 'el barrido no encontro ningun archivo que revisar').toBeGreaterThan(0)

    const hallazgos = scannedFiles.flatMap((file) => {
      const encontrados = findPlaintextPasswordDeclarations(file, readFileSync(file, 'utf8'))
      return encontrados.map((identifier) => `${relative(repoRoot, file).split(sep).join('/')}: ${identifier}`)
    })

    expect(hallazgos).toEqual([])
  })

  it('la guardia acepta el sufijo _hash y rechaza cualquier otra forma', () => {
    for (const permitido of ['password_hash', 'passwordHash', 'PASSWORD_HASH']) {
      expect(isPlaintextPasswordIdentifier(permitido), permitido).toBe(false)
    }
    for (const prohibido of [
      'password',
      'pass',
      'plain_password',
      'clear_password',
      'contrasena',
      'plainPassword',
      'clearPassword',
      'user_password',
      'password_plain',
    ]) {
      expect(isPlaintextPasswordIdentifier(prohibido), prohibido).toBe(true)
    }
  })

  it('la guardia detecta una columna de contrasena en claro si alguien la introduce', () => {
    const sqlMalo = 'CREATE TABLE "users" (\n  "id" UUID NOT NULL,\n  "plain_password" TEXT NOT NULL\n);'
    expect(findPlaintextPasswordDeclarations('migration.sql', sqlMalo)).toContain('plain_password')

    const prismaMalo = 'model User {\n  id       String @id\n  password String @map("password")\n}'
    expect(findPlaintextPasswordDeclarations('schema.prisma', prismaMalo)).toContain('password')

    const tsMalo = 'export const seed = { username: "ana", password: "1234" }'
    expect(findPlaintextPasswordDeclarations('seed.ts', tsMalo)).toContain('password')
  })

  it('la guardia no confunde texto suelto con una declaracion', () => {
    const banderaDeVitest = "runPnpmExec(['vitest', 'related', '--run', '--passWithNoTests'])"
    expect(findPlaintextPasswordDeclarations('test-rapido.ts', banderaDeVitest)).toEqual([])

    const comentario = '-- la contrasena se guarda solo como hash\nCREATE TABLE "roles" ("id" UUID);'
    expect(findPlaintextPasswordDeclarations('migration.sql', comentario)).toEqual([])
  })

  it('la supresion de rutas, ids y errores es por FORMA del identificador, no por lista de nombres', () => {
    // Cualquier nombre con uno de esos ultimos segmentos queda fuera, sin estar listado.
    for (const permitido of [
      'password_route',
      'passwordId',
      'passwordError',
      'PASSWORD_ERROR_ID',
      'FORGOT_PASSWORD_ROUTE',
      'contrasenaPlaceholder',
      'plain_password_label',
      'passField',
    ]) {
      expect(isPlaintextPasswordIdentifier(permitido), permitido).toBe(false)
    }
    // Y el nombre pelado, o con un sufijo que si puede ser columna, sigue en rojo.
    for (const prohibido of [
      'password',
      'pass',
      'password_value',
      'passwordText',
      'route_password',
      'error_password',
      'id_password',
    ]) {
      expect(isPlaintextPasswordIdentifier(prohibido), prohibido).toBe(true)
    }
  })

  it('la allowlist de contrasena en transito esta acotada por ruta de archivo', () => {
    const actionDeLogin = 'const password = readField(formData, "password")'
    expect(findPlaintextPasswordDeclarations('lib/actions/login.ts', actionDeLogin)).toEqual([])

    const schemaZod = 'export const loginInputSchema = z.object({ password: z.string().min(1) })'
    expect(findPlaintextPasswordDeclarations('lib/types/auth.ts', schemaZod)).toEqual([])

    // El MISMO identificador fuera de esos dos archivos sigue siendo un hallazgo.
    const prismaMalo = 'model User {\n  id       String @id\n  password String\n}'
    expect(findPlaintextPasswordDeclarations('db/schema.prisma', prismaMalo)).toContain('password')

    const seedMalo = 'export const seed = { username: "ana", password: "1234" }'
    expect(findPlaintextPasswordDeclarations('scripts/seed.ts', seedMalo)).toContain('password')

    const otroServicio = 'const password = req.body.password'
    expect(findPlaintextPasswordDeclarations('lib/services/otro.ts', otroServicio)).toContain(
      'password',
    )

    const sqlMalo = 'CREATE TABLE "users" ("password" TEXT NOT NULL);'
    expect(findPlaintextPasswordDeclarations('db/migrations/1_init/migration.sql', sqlMalo)).toContain(
      'password',
    )

    // La allowlist tampoco abre la mano dentro de sus propios archivos: solo `password`.
    const persistenciaEnLaAction = 'const plain_password = readField(formData, "password")'
    expect(
      findPlaintextPasswordDeclarations('lib/actions/login.ts', persistenciaEnLaAction),
    ).toContain('plain_password')
  })
})
