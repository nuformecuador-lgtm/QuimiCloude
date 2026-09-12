// QC-23 T16 — Guardia: TODA escritura del hash de contrasena sube el sello «sesiones validas
// desde» en la MISMA sentencia (R30, R32, R38; `design.md > 5.4`, decision cerrada 2).
//
// POR QUE ES UNA GUARDIA Y NO UN TEST DE COMPORTAMIENTO. El gancho del cambio de contrasena **no
// es una funcion que haya que acordarse de llamar**: es una regla sobre la escritura. QC-89 (el
// administrador restablece la contrasena de otro) y QC-96 (la recuperacion) todavia no existen, y
// cuando se escriban -dentro de seis semanas, por otra persona o por otro agente- van a anadir un
// `UPDATE` del hash en ALGUN sitio del repositorio, y nadie puede saber hoy en cual. Un test de
// comportamiento no puede fallar por codigo que aun no se ha escrito; esta guardia si. Ese es todo
// su trabajo: ponerse roja en el commit que introduce el olvido, no en la auditoria de seguridad de
// seis meses despues. Por eso el ambito que barre es `lib/` y `scripts/` enteros y no un
// directorio concreto: el porque esta escrito en la cabecera de `WATCHED_ROOTS`, y es la leccion
// que costo que esta guardia se pudiera esquivar cambiando de carpeta.
//
// LAS DOS FORMAS, y esto es lo unico que el diseno no dijo con precision. `design.md > 5.4`
// describe la guardia como «busca escrituras de Prisma con `passwordHash:` en su `data`». Eso, a
// dia de hoy, **no veria el unico `UPDATE` del hash que existe en el repositorio**, porque ese se
// escribe en SQL CRUDO. El hash se escribe hoy en tres sitios:
//
//   1. `credential-setup-link-prisma.ts` — `$executeRaw` con `UPDATE "users" SET "password_hash"`
//      (QC-79). Es un UPDATE: **tiene que subir el sello**, y lo sube desde T15.
//   2. `initial-access-repository-prisma.ts` — `passwordHash:` en el `data` de una CREACION.
//   3. `user-admin-prisma.ts` — `passwordHash:` en el `data` de una CREACION.
//
// Asi que la guardia cubre las DOS formas: el objeto `data` de Prisma y el SQL crudo.
//
// LA CREACION ESTA EXENTA, Y EL MOTIVO SE ESCRIBE AQUI PARA QUE NO SE LEA COMO UN DESCUIDO: una
// fila que acaba de nacer **no tiene ninguna sesion emitida**, asi que no hay nada que cortar; y la
// columna nace sola con `@default(now())` (`db/schema.prisma`, QC-23 T1), que es exactamente el
// sello correcto para ese instante. Exigir `sessionsValidFrom:` en un `create` seria exigir
// reescribir a mano un valor que la base ya pone bien. Lo que NO esta exento, y es el caso que esta
// guardia vino a vigilar, es el `UPDATE`.
//
// Cada regla se autocomprueba sobre fuentes SINTETICOS que la violan y sobre fuentes que la
// cumplen: un `toEqual([])` sobre un directorio que ya cumple no demuestra que la guardia funcione.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
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

/**
 * LO QUE SE BARRE: `lib/` y `scripts/` ENTEROS. No `adapters/driven/`, y menos aun un unico
 * directorio de persistencia.
 *
 * EL MOTIVO, ESCRITO AQUI PORQUE ES LA LECCION QUE PAGO ESTA GUARDIA. La version anterior vigilaba
 * solo `lib/modules/identity/adapters/driven/persistence/` y justificaba ese recorte **afirmando**
 * que ese era el unico sitio del repositorio donde se podia escribir en `users`. Esa afirmacion no
 * la comprobaba nadie: un archivo con `prisma.user.update({ data: { passwordHash } })` colocado en
 * `adapters/driven/credenciales/` dejaba las dos guardias en verde —verificado, no supuesto—,
 * porque `guard-arquitectura-modulos` permite alcanzar el cliente de Prisma desde **todo**
 * `adapters/driven/**`, no solo desde `persistence/`. Una carpeta nueva y la promesa se caia.
 *
 * De ahi la regla que fija este ambito: **una guardia no puede apoyarse en la convencion que
 * vigila otra guardia**. Si el ambito fuera `adapters/driven/`, seguir cumpliendo la promesa
 * dependeria de que alguien se acuerde de ampliar esta constante el dia que la convencion cambie
 * —y «acordarse» es justo el trabajo que una guardia existe para quitar—. Barriendo `lib/` y
 * `scripts/` la afirmacion «toda escritura del hash sube el sello» **se comprueba sola**: donde
 * sea que nazca el archivo, cae dentro.
 *
 * `scripts/` entra porque tiene su **propio** cliente de Prisma (`scripts/seed.ts`) y no pasa por
 * los adaptadores del modulo. `app/` y `components/` quedan fuera a proposito: no pueden tocar
 * Prisma —eso si lo vigila `guard-arquitectura-modulos`, y ahi es una regla, no una suposicion
 * sobre donde se guardan los archivos—.
 *
 * El coste: son ~280 archivos de texto, se leen una vez y la guardia sigue por debajo del medio
 * segundo. `node_modules`, `.next` y compania se saltan explicitamente por si algun dia aparecen
 * dentro (ver `IGNORED_DIRS`).
 */
const WATCHED_ROOTS = [join(repoRoot, 'lib'), join(repoRoot, 'scripts')]

/** Directorios que nunca se recorren: son codigo ajeno o generado, y solo cuestan tiempo. */
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage'])

/** Extensiones que se leen. Todo lo demas (`.sh`, `.gitkeep`, binarios) no puede escribir con Prisma. */
const WATCHED_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/** El UPDATE del enlace de credencial de QC-79: el unico UPDATE del hash que existe hoy. */
const CREDENTIAL_LINK_FILE = join(
  repoRoot,
  'lib',
  'modules',
  'identity',
  'adapters',
  'driven',
  'persistence',
  'credential-setup-link-prisma.ts',
)

/** El mensaje que ve quien encuentre esta guardia en rojo. Nombra la ficha y la decision. */
export const REMEDY =
  'QC-23 (decision cerrada 2, requirements.md R30/R32/R38, design.md > 5.4): toda transaccion que ' +
  'escriba `users.password_hash` DEBE subir `sessions_valid_from` en la MISMA sentencia. No se ' +
  'anade una segunda escritura ni un caso de uso «revocar» aparte: serian dos transacciones sobre ' +
  'la misma fila y una ventana en la que la contrasena ya cambio pero las cookies viejas todavia ' +
  'valen. En un `data` de Prisma se anade `sessionsValidFrom: floorToSecond(now)`; en SQL crudo, ' +
  '`"sessions_valid_from" = ${floorToSecond(now)}` como una columna mas del mismo SET. La CREACION ' +
  'de una fila esta exenta a proposito: no tiene ninguna sesion emitida y la columna nace con ' +
  '@default(now()).'

/**
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo — si no, el propio
 * texto de esta cabecera, copiado en un archivo vigilado, contaria como una escritura.
 *
 * Limite conocido y aceptado: un `//` dentro de una cadena de texto se comeria el resto de esa
 * linea. Para que eso escondiera una infraccion, la escritura del hash tendria que ir DESPUES de
 * un `://` en la misma linea; y en el sentido contrario el efecto es que la guardia se ponga roja
 * de mas, que es el lado correcto por el que fallar.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Una escritura del hash que no sube el sello. `operation` dice por que forma se detecto. */
export type Finding = {
  readonly form: 'data' | 'sql'
  readonly operation: string
  readonly excerpt: string
}

/** Las cinco escrituras de Prisma que aceptan un `data`. `create*` queda exenta (ver cabecera). */
const PRISMA_WRITE_VERBS = /\.\s*(createManyAndReturn|createMany|create|updateMany|update|upsert)\s*\(/g

/** El objeto literal `{ … }` que CONTIENE la posicion dada, por conteo de llaves. */
function enclosingObject(source: string, index: number): { start: number; end: number } | null {
  let depth = 0
  let start = -1
  for (let i = index; i >= 0; i -= 1) {
    const char = source[i]
    if (char === '}') depth += 1
    else if (char === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth -= 1
    }
  }
  if (start < 0) return null

  let open = 0
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') open += 1
    else if (char === '}') {
      open -= 1
      if (open === 0) return { start, end: i + 1 }
    }
  }
  return null
}

/** El ultimo verbo de escritura de Prisma ANTES del objeto: es quien dice si esto crea o actualiza. */
function operationBefore(source: string, objectStart: number): string {
  const head = source.slice(0, objectStart)
  let last = 'desconocida'
  for (const match of head.matchAll(PRISMA_WRITE_VERBS)) last = match[1] as string
  return last
}

/**
 * El nombre del que CUELGA el objeto: `data: { … }`, `update: { … }`, `create: { … }`, o tambien
 * `const data = { … }` si alguien lo extrae a una variable antes de pasarlo.
 *
 * Hace falta para distinguir una ESCRITURA de una LECTURA, que es la unica ambiguedad real de la
 * forma 1: `user-credentials-prisma.ts` tiene un `passwordHash: fila.password_hash` dentro de un
 * `return { … }` que MAPEA una fila leida a un objeto de dominio. Eso no escribe nada, y exigirle
 * un sello seria pedir que una lectura suba el sello. Una escritura de Prisma, en cambio, SIEMPRE
 * pasa su carga por una de esas tres claves: no hay forma de escribir sin `data`, `create` o
 * `update`. Y lo que no pase por Prisma pasa por SQL crudo, que cubre la forma 2.
 */
function payloadKeyOf(source: string, objectStart: number): string {
  const head = source.slice(0, objectStart).trimEnd()
  const match = /(?:^|[^\w$])([\w$]+)\s*[:=]$/.exec(head)
  return match?.[1] ?? ''
}

/**
 * FORMA 1 — el objeto `data` de Prisma: `passwordHash:` sin `sessionsValidFrom:` en el mismo objeto.
 *
 * `create`, `createMany` y `createManyAndReturn` quedan exentas, y tambien la rama `create:` de un
 * `upsert` (ver cabecera: una fila recien nacida no tiene ninguna sesion emitida). Un verbo que no
 * se reconoce en una carga de escritura cuenta como violacion: fallar cerrado es lo que evita que
 * la guardia se esquive extrayendo el `data` a una variable.
 */
export function findDataWritesWithoutStamp(source: string): readonly Finding[] {
  const clean = stripComments(source)
  const findings: Finding[] = []

  for (const match of clean.matchAll(/\bpasswordHash\s*:/g)) {
    const object = enclosingObject(clean, match.index)
    if (object === null) {
      findings.push({ form: 'data', operation: 'desconocida', excerpt: match[0] })
      continue
    }

    const key = payloadKeyOf(clean, object.start)
    // Ni `data`, ni `update`, ni `create`: no es una carga de escritura de Prisma sino un objeto
    // cualquiera -tipicamente el mapeo de una fila LEIDA-. La forma 2 cubre el SQL crudo.
    if (key !== 'data' && key !== 'update' && key !== 'create') continue
    // La creacion esta exenta a proposito, tanto por la clave `create:` de un `upsert` como por el
    // verbo `create`/`createMany` que precede al `data:`.
    if (key === 'create') continue
    const operation = operationBefore(clean, object.start)
    if (key === 'data' && operation.startsWith('create')) continue

    const body = clean.slice(object.start, object.end)
    if (/\bsessionsValidFrom\s*:/.test(body)) continue
    findings.push({ form: 'data', operation, excerpt: body.replace(/\s+/g, ' ').slice(0, 160) })
  }

  return findings
}

/**
 * FORMA 2 — SQL crudo: un `UPDATE "users"` cuyo `SET` toca `password_hash` sin tocar
 * `sessions_valid_from`.
 *
 * La sentencia se acota desde el `UPDATE "users"` hasta el cierre del literal de plantilla que la
 * contiene (o 1200 caracteres, lo que llegue antes), que es como se escriben los `Prisma.sql` de
 * este directorio. Un `INSERT INTO "users"` queda fuera por construccion: enumera columnas y no
 * lleva `password_hash =`, y ademas la creacion esta exenta.
 */
export function findRawSqlWritesWithoutStamp(source: string): readonly Finding[] {
  const clean = stripComments(source)
  const findings: Finding[] = []

  for (const match of clean.matchAll(/\bUPDATE\s+"?users"?\b/gi)) {
    const closing = clean.indexOf('`', match.index)
    const end = closing === -1 ? match.index + 1200 : closing
    const statement = clean.slice(match.index, Math.min(end, match.index + 1200))
    if (!/"?password_hash"?\s*=/i.test(statement)) continue
    if (/"?sessions_valid_from"?\s*=/i.test(statement)) continue
    findings.push({
      form: 'sql',
      operation: 'UPDATE crudo',
      excerpt: statement.replace(/\s+/g, ' ').slice(0, 160),
    })
  }

  return findings
}

/** Las dos formas juntas: es lo que se aplica a cada archivo vigilado. */
export function findPasswordWritesWithoutStamp(source: string): readonly Finding[] {
  return [...findDataWritesWithoutStamp(source), ...findRawSqlWritesWithoutStamp(source)]
}

/**
 * Todos los fuentes bajo un directorio, recursivamente, saltando `IGNORED_DIRS` y quedandose con
 * `WATCHED_EXTENSIONS`. El filtro es lo que mantiene barata la ampliacion de ambito: se abren ~280
 * archivos de texto y ninguno de otra cosa.
 */
function listSourceFiles(dir: string): readonly string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full))
    else if (WATCHED_EXTENSIONS.some((ext) => full.endsWith(ext))) out.push(full)
  }
  return out
}

/**
 * ¿Caeria este archivo dentro de la barredora? Se escribe aparte del recorrido porque es la
 * pregunta que la version anterior de esta guardia respondia mal: la deteccion estaba bien, el
 * **ambito** no. Con esto, «un archivo en tal sitio queda vigilado» es una asercion y no una
 * suposicion.
 */
export function isWatched(absolutePath: string): boolean {
  const normalized = absolutePath.replaceAll('\\', '/')
  if (!WATCHED_EXTENSIONS.some((ext) => normalized.endsWith(ext))) return false
  if (normalized.split('/').some((segment) => IGNORED_DIRS.has(segment))) return false
  return WATCHED_ROOTS.some((root) => normalized.startsWith(`${root.replaceAll('\\', '/')}/`))
}

/** Lo mismo, sobre las varias raices vigiladas. */
function listWatchedFiles(roots: readonly string[] = WATCHED_ROOTS): readonly string[] {
  return roots.flatMap((root) => listSourceFiles(root))
}

/** Las infracciones de un conjunto de archivos, con la ruta relativa al repo. */
function offendersIn(files: readonly string[]) {
  return files.flatMap((file) =>
    findPasswordWritesWithoutStamp(readFileSync(file, 'utf8')).map((finding) => ({
      file: relative(repoRoot, file).replaceAll('\\', '/'),
      ...finding,
    })),
  )
}

describe('guardia — el cambio de contrasena corta las sesiones vivas (QC-23)', () => {
  const files = listWatchedFiles()

  it('las raices vigiladas existen y tienen archivos que leer', () => {
    // Sin esto, un cambio de ruta dejaria la guardia verde sin haber mirado nada.
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((file) => file.endsWith('credential-setup-link-prisma.ts'))).toBe(true)
    // Y que las DOS raices aportan algo: `scripts/` tiene su propio cliente de Prisma.
    for (const root of WATCHED_ROOTS) {
      expect(listSourceFiles(root).length, `raiz vacia: ${root}`).toBeGreaterThan(0)
    }
  })

  it('ninguna escritura del hash de contrasena olvida el sello', () => {
    const offenders = offendersIn(files)

    expect(offenders, `${REMEDY}\n\nEscrituras sin sello:\n${JSON.stringify(offenders, null, 2)}`)
      .toEqual([])
  })

  it('el `UPDATE` del enlace de credencial esta cubierto de verdad, no por casualidad', () => {
    // El caso concreto de T15: si alguien quita esa linea, el archivo de arriba se pone rojo. Esto
    // lo ancla por nombre para que el «ninguna escritura olvida el sello» no pueda quedarse verde
    // porque el archivo dejo de estar en la lista.
    const source = readFileSync(CREDENTIAL_LINK_FILE, 'utf8')
    expect(findPasswordWritesWithoutStamp(source)).toEqual([])
    expect(stripComments(source)).toMatch(/"sessions_valid_from"\s*=/)
  })

  it('el mensaje de remedio nombra QC-23 y la decision cerrada 2', () => {
    expect(REMEDY).toContain('QC-23')
    expect(REMEDY).toContain('decision cerrada 2')
    expect(REMEDY).toContain('sessions_valid_from')
  })

  // -------------------------------------------------------------------------------------------
  // Autocomprobacion: la guardia se pone roja de verdad
  // -------------------------------------------------------------------------------------------

  it('marca un `update` de Prisma que escribe el hash sin sello', () => {
    const source = `
      await tx.user.update({
        where: { id },
        data: { passwordHash: hash, updatedAt: now },
      })
    `
    const findings = findDataWritesWithoutStamp(source)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.operation).toBe('update')
  })

  it('marca tambien `updateMany` y `upsert`, y no marca el que si lleva el sello', () => {
    const many = `await tx.user.updateMany({ where: { id }, data: { passwordHash: h } })`
    expect(findDataWritesWithoutStamp(many)).toHaveLength(1)

    const up = `await tx.user.upsert({ where: { id }, update: { passwordHash: h }, create: {} })`
    expect(findDataWritesWithoutStamp(up)).toHaveLength(1)

    const ok = `await tx.user.updateMany({
      where: { id },
      data: { passwordHash: h, sessionsValidFrom: floorToSecond(now) },
    })`
    expect(findDataWritesWithoutStamp(ok)).toEqual([])
  })

  it('NO marca la creacion de una fila: no tiene ninguna sesion emitida y la columna nace sola', () => {
    const created = `await prisma.user.create({ data: { email, passwordHash: hash } })`
    expect(findDataWritesWithoutStamp(created)).toEqual([])
    expect(findDataWritesWithoutStamp(`await tx.user.createMany({ data: { passwordHash: h } })`))
      .toEqual([])
    // Y la rama `create:` de un `upsert`, por el mismo motivo.
    const upsert = `await tx.user.upsert({ where: { id }, update: { updatedAt: now }, create: { passwordHash: h } })`
    expect(findDataWritesWithoutStamp(upsert)).toEqual([])
  })

  it('NO marca el mapeo de una fila LEIDA: una lectura no tiene ningun sello que subir', () => {
    const read = `return { id: fila.id, passwordHash: fila.password_hash }`
    expect(findDataWritesWithoutStamp(read)).toEqual([])
  })

  it('falla cerrado: un `data` extraido a variable, sin verbo reconocible, cuenta igual', () => {
    const findings = findDataWritesWithoutStamp(`const data = { passwordHash: hash }`)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.operation).toBe('desconocida')
  })

  it('un `passwordHash` mencionado en un comentario no es una escritura', () => {
    expect(findDataWritesWithoutStamp(`// data: { passwordHash: hash }`)).toEqual([])
    expect(findDataWritesWithoutStamp(`/* data: { passwordHash: hash } */`)).toEqual([])
  })

  it('marca un `UPDATE "users"` crudo que escribe el hash sin sello', () => {
    const source = 'await tx.$executeRaw(Prisma.sql`\n' +
      '  UPDATE "users"\n' +
      '     SET "password_hash" = ${hash},\n' +
      '         "account_status" = ${ACTIVE}::"UserAccountStatus"\n' +
      '   WHERE "id" = ${userId}::uuid\n' +
      '`)'
    const findings = findRawSqlWritesWithoutStamp(source)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.form).toBe('sql')
  })

  it('no marca el `UPDATE "users"` crudo que si sube el sello en el mismo SET', () => {
    const source = 'await tx.$executeRaw(Prisma.sql`\n' +
      '  UPDATE "users"\n' +
      '     SET "password_hash" = ${hash},\n' +
      '         "sessions_valid_from" = ${floorToSecond(now)}\n' +
      '   WHERE "id" = ${userId}::uuid\n' +
      '`)'
    expect(findRawSqlWritesWithoutStamp(source)).toEqual([])
  })

  it('no marca un `INSERT INTO "users"` crudo ni un `UPDATE` que no toca el hash', () => {
    const insert = 'Prisma.sql`INSERT INTO "users" ("email", "password_hash") VALUES (${e}, ${h})`'
    expect(findRawSqlWritesWithoutStamp(insert)).toEqual([])

    const other = 'Prisma.sql`UPDATE "users" SET "deleted_at" = ${now} WHERE "id" = ${id}::uuid`'
    expect(findRawSqlWritesWithoutStamp(other)).toEqual([])
  })

  it('cada `UPDATE "users"` crudo se juzga por separado, no por el archivo entero', () => {
    // El hueco que habria si la guardia mirara el archivo completo: un UPDATE que sube el sello sin
    // tocar el hash NO absuelve a otro que escribe el hash sin sello.
    const source =
      'Prisma.sql`UPDATE "users" SET "sessions_valid_from" = ${s} WHERE "id" = ${a}::uuid`\n' +
      'Prisma.sql`UPDATE "users" SET "password_hash" = ${h} WHERE "id" = ${b}::uuid`'
    expect(findRawSqlWritesWithoutStamp(source)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------------------------
  // EL RECORRIDO: DONDE mira la guardia
  //
  // Esta es la parte que fallaba, y no fallaba la deteccion: con el ambito viejo, el mismo
  // `prisma.user.update` que ponia la guardia roja dentro de `persistence/` la dejaba verde una
  // carpeta mas alla. Los tres casos de abajo vigilan el recorrido, no la regla.
  // -------------------------------------------------------------------------------------------

  it('el recorrido entra en un subdirectorio hermano RECIEN NACIDO, y salta lo que debe saltar', () => {
    // POR QUE EL ARBOL SINTETICO NO SE ESCRIBE DENTRO DE `lib/`, aunque sea ahi donde muerde de
    // verdad: `test:guardias` corre los 32 archivos EN PARALELO y hay 17 guardias mas que leen
    // `lib/` del disco. Comprobado: un `reset-prisma.ts` real bajo `adapters/driven/credenciales/`
    // pone roja tambien a `guard-password-never-plaintext`. Un archivo de usar y tirar dentro del
    // arbol vigilado seria una guardia roja aleatoria segun quien lea primero. Asi que el arbol va
    // en un temporal del sistema —que es lo que prueba el RECORRIDO: recursion, subdirectorio
    // nuevo, filtro de extension y salto de `node_modules`— y la cobertura del ambito REAL la
    // prueban los dos casos siguientes, sobre rutas de verdad.
    const root = mkdtempSync(join(tmpdir(), 'qc23-guardia-'))
    try {
      const nuevo = join(root, 'adapters', 'driven', 'credenciales')
      mkdirSync(nuevo, { recursive: true })
      writeFileSync(
        join(nuevo, 'reset-prisma.ts'),
        'await prisma.user.update({ where: { id }, data: { passwordHash: hash } })\n',
        'utf8',
      )
      // Ruido que NO debe contarse: un `.sh` con la misma escritura y una copia bajo node_modules.
      writeFileSync(join(nuevo, 'reset.sh'), 'data: { passwordHash: hash }\n', 'utf8')
      const ajeno = join(root, 'node_modules', 'paquete')
      mkdirSync(ajeno, { recursive: true })
      writeFileSync(join(ajeno, 'index.ts'), 'data: { passwordHash: hash }\n', 'utf8')

      const encontrados = listSourceFiles(root)
      expect(encontrados).toHaveLength(1)
      expect(encontrados[0]?.endsWith('reset-prisma.ts')).toBe(true)

      const offenders = offendersIn(encontrados)
      expect(offenders).toHaveLength(1)
      expect(offenders[0]?.operation).toBe('update')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('la ruta EXACTA con la que se esquivo la guardia cae dentro del ambito', () => {
    // El experimento del reviewer, anclado por ruta: si alguien vuelve a encoger `WATCHED_ROOTS`,
    // esto se pone rojo antes de que exista el archivo.
    const evasion = join(
      repoRoot, 'lib', 'modules', 'identity', 'adapters', 'driven', 'credenciales',
      'reset-prisma.ts',
    )
    expect(isWatched(evasion)).toBe(true)
    // Y cualquier otro sitio de `lib/`, que es el punto de barrer la carpeta entera.
    expect(isWatched(join(repoRoot, 'lib', 'shared', 'db', 'reset.ts'))).toBe(true)
    expect(isWatched(join(repoRoot, 'lib', 'modules', 'otro', 'domain', 'x.ts'))).toBe(true)
    // `scripts/` entra: tiene su propio cliente de Prisma.
    expect(isWatched(join(repoRoot, 'scripts', 'seed.ts'))).toBe(true)
    // Lo que queda fuera, y a proposito: lo que no es fuente, y el codigo ajeno.
    expect(isWatched(join(repoRoot, 'scripts', 'algo.sh'))).toBe(false)
    expect(isWatched(join(repoRoot, 'lib', 'node_modules', 'p', 'index.ts'))).toBe(false)
  })

  it('sobre el arbol REAL, la lista leida desborda `persistence/` por los cuatro costados', () => {
    const rutas = files.map((file) => relative(repoRoot, file).replaceAll('\\', '/'))
    const dentroDePersistence = 'lib/modules/identity/adapters/driven/persistence/'
    expect(rutas.some((ruta) => ruta.startsWith(dentroDePersistence))).toBe(true)
    // Un directorio HERMANO de `persistence/`, que es exactamente el caso de la evasion.
    expect(rutas.some((ruta) =>
      ruta.startsWith('lib/modules/identity/adapters/driven/observability/'))).toBe(true)
    // Y las dos raices, mas alla del modulo.
    expect(rutas.some((ruta) => ruta.startsWith('lib/composition/'))).toBe(true)
    expect(rutas.some((ruta) => ruta.startsWith('scripts/'))).toBe(true)
    // La mayoria de lo leido NO esta en `persistence/`: si esto cae, el ambito se encogio.
    expect(rutas.filter((ruta) => !ruta.startsWith(dentroDePersistence)).length)
      .toBeGreaterThan(100)
  })
})
