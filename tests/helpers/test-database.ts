/**
 * QC-77 — el ciclo de vida de la base efimera de cada corrida de integracion.
 *
 * Por que existe: hasta hoy los 41 archivos de `tests/integration/` pegaban contra la
 * MISMA base que la app abierta a mano, asi que una corrida veia las filas de la anterior
 * y el gate cambiaba de color segun lo que hubiera quedado. Aqui vive la maquinaria para
 * que cada corrida trabaje sobre una copia propia, creada desde una plantilla ya migrada
 * y sembrada, y borrada al terminar (el `design.md` de QC-77, secciones 1, 2, 3 y 5).
 *
 * Se usa `pg` y NO `psql`, por la misma razon que `scripts/db-rollback.ts`: `psql` obliga
 * a tener los binarios cliente de Postgres en cada maquina; `pg` ya es dependencia de
 * Node. Ninguna dependencia nueva entra por este archivo (R23).
 *
 * Regla de oro heredada de `scripts/wt.sh`: **ante la duda, NO borra**. Un rastro que no
 * se puede leer, un pid que no se puede juzgar o una base de otro worktree se dejan en
 * pie. El coste de una base de mas es disco; el de borrar la equivocada es trabajo.
 *
 * **Este modulo no tiene efectos al importarse**: no abre conexiones, no lee el `.env` y
 * no crea directorios. Todo pasa dentro de las funciones, a proposito — lo importa tanto
 * el `globalSetup` de Vitest como la CLI de `scripts/`.
 *
 * Identificadores en ingles (R31); los mensajes por consola, en castellano, como el resto
 * del arnes.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'

import { Client } from 'pg'

// ---------------------------------------------------------------------------- contrato

/** Lo que hace falta para nombrar, construir y copiar bases. Sin estado global. */
export interface TestDatabaseContext {
  /** Raiz del repo (o del worktree): de ahi salen `db/migrations/` y los scripts. */
  repoRoot: string
  /** Ruta absoluta del worktree que crea la base. Es la identidad del dueno (R9, R10). */
  worktreePath: string
  /**
   * URL de la base de desarrollo. Solo se le toma la coordenada de conexion
   * —usuario, host, puerto y query—; el nombre de la base se sustituye siempre.
   */
  developmentUrl: string
  /** Plantilla ya asegurada. Si falta, `createRunDatabase` la asegura por su cuenta. */
  templateDatabase?: string
  /** Inyectables para poder probar el nombre sin depender del reloj ni del proceso. */
  now?: Date
  pid?: number
}

/** La base de una corrida, ya creada y con su rastro escrito en disco. */
export interface RunDatabase {
  name: string
  url: string
  tracePath: string
}

/** El rastro de `.qc-test-db/<nombre>.json` (campos en ingles, R31). */
export interface DatabaseTrace {
  database: string
  worktreePath: string
  pid: number
  createdAt: string
}

/** Una fila del inventario del barrido (`design.md > 6`). La llena la CLI en T10. */
export interface DatabaseVerdict {
  database: string
  verdict: 'SAFE' | 'HOLD'
  reason: string
  kind: 'run' | 'template' | 'legacy' | 'unknown'
}

/**
 * El estado de migraciones de una base. Union discriminada y no `pending: string[] | null`
 * a proposito: R16 exige distinguir «no falta ninguna» de «no se pudo comprobar», y con un
 * array vacio las dos cosas se escriben igual.
 */
export type PendingMigrations =
  | { readable: true; applied: string[]; pending: string[] }
  | { readable: false; reason: string }

// ------------------------------------------------------------------------- constantes

/** `<timestamp>_<nombre>`, tal como los genera Prisma Migrate. */
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-zA-Z0-9_-]+$/

/**
 * La migracion de QC-49 falla a proposito sobre una base vacia (`migration.sql:130`): es
 * el unico fallo que la receta de `design.md > 3` tiene permitido tragarse. Cualquier otra
 * migracion que falle es un error de verdad y para el script.
 */
const EXPECTED_FAILING_MIGRATION = '20260911130000_inventory_company_scope'

/**
 * Todo nombre de base de test empieza por este prefijo reservado. Es lo que permite al
 * barrido distinguir lo suyo de `postgres`, `template0` y de la base de desarrollo sin
 * enumerarlas (guarda 2 de `design.md > 6`).
 */
const TEST_DATABASE_PREFIX = 'qct_'

/**
 * La cota real es 63 bytes (identificador de Postgres). El patron ya la garantiza —4 del
 * prefijo + 58— pero se valida ANTES de construir cualquier DDL, porque el nombre de una
 * base no se puede parametrizar: acaba concatenado en el `CREATE DATABASE`.
 */
const TEST_DATABASE_NAME_PATTERN = /^qct_[a-z0-9_]{1,58}$/

/** Directorio de rastros, relativo al worktree. Va al `.gitignore` (T7). */
const TRACE_DIRECTORY = '.qc-test-db'

/** Postgres responde esto cuando alguien tiene abierta la base que se quiere copiar. */
const SQLSTATE_SOURCE_DATABASE_IN_USE = '55006'

/** Espera creciente del reintento de `CREATE DATABASE ... TEMPLATE` (~3,75 s en total). */
const TEMPLATE_COPY_BACKOFF_MS = [250, 500, 1000, 2000]

function log(message: string): void {
  console.log(`test-db: ${message}`)
}

// ------------------------------------------------------------------ nombres y huellas

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Normaliza una ruta para hashearla: separadores a `/`, sin barra final y en minusculas.
 * Windows es case-insensitive y el mismo worktree puede llegar como `C:\...` o `c:/...`;
 * sin esto, la identidad del dueno cambiaria segun quien la escribiera.
 */
function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Lee un archivo del arbol para la huella, con los saltos de linea normalizados.
 *
 * El `\r\n` no cambia lo que hace una migracion, pero si cambiaria el hash entre un
 * checkout de Windows y uno de Linux. Normalizarlo evita reconstruir la plantilla por una
 * diferencia que no existe.
 */
function hashFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `test-db: falta ${path}, y forma parte de la huella de la plantilla. ` +
        'Si el archivo se movio, hay que actualizar `migrationsFingerprint`.',
    )
  }
  return sha256(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'))
}

/** Los nombres de carpeta de `db/migrations/`, ordenados. Es tambien el orden de Prisma. */
export function migrationDirectoryNames(repoRoot: string): string[] {
  const migrationsDir = join(repoRoot, 'db', 'migrations')
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => MIGRATION_NAME_PATTERN.test(name))
    .sort()
}

/**
 * 12 hex que resumen «que esquema y que datos iniciales tendria una base recien
 * preparada»: el contenido de cada migracion **y** el del sembrado.
 *
 * Es lo que hace automaticos R5 y R6 sin ninguna bandera: si cambia cualquiera de esos
 * archivos cambia la huella, cambia el nombre de la plantilla, no existe ninguna base con
 * ese nombre y se construye una nueva. Y si no cambia nada, la plantilla ya esta ahi y se
 * reutiliza. Una bandera `--rebuild` seria algo que alguien tiene que acordarse de poner.
 */
export function migrationsFingerprint(repoRoot: string): string {
  const migrations = migrationDirectoryNames(repoRoot).map(
    (name) => `${name}:${hashFile(join(repoRoot, 'db', 'migrations', name, 'migration.sql'))}`,
  )
  const seeds = [
    `scripts/seed.ts:${hashFile(join(repoRoot, 'scripts', 'seed.ts'))}`,
    `seed-initial-access:${hashFile(
      join(repoRoot, 'lib', 'modules', 'identity', 'domain', 'seed-initial-access.ts'),
    )}`,
  ]
  return sha256([...migrations, ...seeds].join('\n')).slice(0, 12)
}

/**
 * La clave legible de la ficha, sacada del nombre del directorio del worktree
 * (`QC-77-aislamiento-...` -> `qc77`). No es la identidad —esa es el `<wt8>`—: es para que
 * un humano mirando `\l` en psql sepa de quien es la base.
 */
function worktreeKey(worktreePath: string): string {
  const directory = basename(normalizePath(worktreePath))
  const ticket = /^qc-?(\d+)/.exec(directory)
  if (ticket !== null) return `qc${ticket[1]}`.slice(0, 12)
  const sanitized = directory.replace(/[^a-z0-9]/g, '').slice(0, 12)
  // El worktree principal se llama como el repo; sin clave legible no es un error, es `main`.
  return sanitized === '' ? 'main' : sanitized
}

/** 8 hex de la ruta del worktree: la identidad real del dueno de la base (R9, R10). */
export function worktreeHash(worktreePath: string): string {
  return sha256(normalizePath(worktreePath)).slice(0, 8)
}

/** Falla ANTES de cualquier DDL. Un nombre raro es un error, no un `CREATE DATABASE` raro. */
function assertTestDatabaseName(name: string): string {
  if (!TEST_DATABASE_NAME_PATTERN.test(name)) {
    throw new Error(
      `test-db: «${name}» no es un nombre de base de test valido. Debe casar con ` +
        `${String(TEST_DATABASE_NAME_PATTERN)} (prefijo reservado ${TEST_DATABASE_PREFIX}, ` +
        'solo minusculas, digitos y guion bajo, 63 bytes maximo).',
    )
  }
  if (Buffer.byteLength(name, 'utf8') > 63) {
    throw new Error(
      `test-db: «${name}» pasa de los 63 bytes que admite un identificador de Postgres.`,
    )
  }
  return name
}

/**
 * Entrecomillado del identificador. El patron de arriba ya garantiza que no haria falta;
 * se hace igual porque la proxima persona que toque esto quiza relaje el patron, y
 * entonces el entrecomillado es lo unico que queda en pie.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** `qct_<key>_<wt8>_<base36 del epoch>_<pid>` (`design.md > 2`). Puro: no toca la base. */
export function runDatabaseName(worktreePath: string, now: Date, pid: number): string {
  const run = `${now.getTime().toString(36)}_${pid.toString(36)}`
  return assertTestDatabaseName(
    `${TEST_DATABASE_PREFIX}${worktreeKey(worktreePath)}_${worktreeHash(worktreePath)}_${run}`,
  )
}

/** `qct_tpl_<migrations12>`. El nombre ES la invalidacion de cache (R5, R6). */
export function templateDatabaseName(migrationsFingerprint: string): string {
  return assertTestDatabaseName(`${TEST_DATABASE_PREFIX}tpl_${migrationsFingerprint}`)
}

/**
 * Nombre de la base intermedia donde se CONSTRUYE la plantilla, antes de renombrarla.
 *
 * Por que no se construye directamente sobre el nombre final: la receta tarda ~38 s, y una
 * corrida matada a mitad dejaria una plantilla incompleta con el nombre bueno, que todas
 * las corridas siguientes reutilizarian sin sospechar nada (R6 jugando en contra). Con el
 * rename al final, el nombre bueno solo aparece cuando la receta termino entera.
 */
function templateBuildDatabaseName(fingerprint: string, pid: number): string {
  return assertTestDatabaseName(
    `${TEST_DATABASE_PREFIX}tplbuild_${fingerprint}_${pid.toString(36)}`,
  )
}

/** Clasifica un nombre para el inventario del barrido (`design.md > 6`, R28). */
export function classifyDatabaseName(database: string): DatabaseVerdict['kind'] {
  if (/^qct_tpl(build)?_/.test(database)) return 'template'
  if (TEST_DATABASE_NAME_PATTERN.test(database)) return 'run'
  if (/^QuimiCloude_QC\d+$/.test(database)) return 'legacy'
  return 'unknown'
}

// ------------------------------------------------------------------------------- URLs

/**
 * Sustituye SOLO el nombre de la base en una URL de conexion, conservando usuario,
 * contrasena, host, puerto y query (`?schema=public`, `connection_limit`, ...). Se hace con
 * `new URL` y no con una expresion regular porque la contrasena puede contener cualquier
 * cosa, incluida una barra.
 */
export function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${encodeURIComponent(database)}`
  return parsed.toString()
}

/**
 * La conexion de mantenimiento. `CREATE DATABASE` y `DROP DATABASE` no se pueden ejecutar
 * desde la base afectada, asi que todo el DDL va contra `postgres`.
 */
function adminUrl(developmentUrl: string): string {
  return withDatabaseName(developmentUrl, 'postgres')
}

/**
 * La URL de desarrollo, del entorno o del `.env`.
 *
 * `tsx` y Vitest no cargan el `.env` por su cuenta (`scripts/db-rollback.ts` tiene la misma
 * nota); `init.sh` si lo hace antes de los tests. Se carga aqui solo si hace falta, y
 * `loadEnvFile` **no pisa** una variable ya presente en el entorno —medido en T2—, asi que
 * lo que venga exportado manda.
 */
export function resolveDevelopmentUrl(repoRoot: string = process.cwd()): string {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
    if (existsSync(join(repoRoot, '.env'))) process.loadEnvFile(join(repoRoot, '.env'))
  }
  const url = process.env.DATABASE_URL
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'test-db: falta DATABASE_URL. Copia `.env.example` a `.env` y rellenala antes de ' +
        'correr los tests de integracion.',
    )
  }
  return url
}

// ------------------------------------------------------------------- DDL de bases

async function withAdminClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminUrl(url) })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function databaseExists(client: Client, database: string): Promise<boolean> {
  const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
  return (found.rowCount ?? 0) > 0
}

/**
 * `WITH (FORCE)` (Postgres 13+, aqui hay 16) expulsa las conexiones que algun worker haya
 * dejado colgando. Sin el, el `DROP` de limpieza falla justo cuando mas falta hace: al
 * final de una corrida que murio dejando una conexion abierta.
 */
export async function dropRunDatabase(name: string, developmentUrl?: string): Promise<void> {
  assertTestDatabaseName(name)
  const url = developmentUrl ?? resolveDevelopmentUrl()
  await withAdminClient(url, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`)
  })
}

/**
 * El mismo `DROP` que `dropRunDatabase`, pero **sincrono**: bloquea el hilo principal hasta
 * que la base ha desaparecido. Existe para UN caso, el handler de senal del `globalSetup`
 * (R8), y fuera de ahi hay que usar la version asincrona.
 *
 * Por que no vale `await dropRunDatabase(...)` dentro de un handler de senal, que seria lo
 * obvio: Vitest registra su propio handler de `SIGINT`/`SIGTERM` y lo ultimo que hace es
 * `setTimeout(() => process.exit(), 1)` (`node_modules/vitest/dist/chunks/cli-api.*.js`, en
 * `addCleanupListeners`). **Un milisegundo.** Un `DROP DATABASE` necesita abrir una conexion
 * TCP y esperar al servidor: la promesa no llega nunca a resolverse y el proceso se va con la
 * base viva. Medido en T8, y el sintoma era exactamente ese — Ctrl-C y base en pie. Si
 * alguien «arregla» esto convirtiendolo en `async`, la base vuelve a sobrevivir al Ctrl-C.
 *
 * `spawnSync` bloquea el hilo principal, asi que el `setTimeout` de Vitest ni siquiera puede
 * dispararse hasta que el borrado ha terminado. Es la unica forma de hacer trabajo de red
 * dentro de un handler de senal cuando otro handler del mismo proceso va a llamar a
 * `process.exit` enseguida.
 *
 * El hijo es un `node -e` de seis lineas con `pg` —ninguna dependencia nueva (R23)— al que se
 * le pasa la ruta ya resuelta del paquete, para no depender del `cwd` con el que se invoque.
 * **Revalida el nombre** contra el mismo patron antes de construir el DDL: el nombre de una
 * base no se puede parametrizar, acaba concatenado en el `DROP`.
 *
 * Lanza si el borrado falla, con el codigo y la salida del hijo dentro del mensaje; quien
 * llama decide que hacer con eso (en el `globalSetup`, avisar y dejar el rastro en pie para
 * que la corrida siguiente lo reclame).
 */
export function dropRunDatabaseSync(name: string, developmentUrl?: string): void {
  assertTestDatabaseName(name)
  const url = adminUrl(developmentUrl ?? resolveDevelopmentUrl())
  const pgEntryPoint = createRequire(import.meta.url).resolve('pg')

  const script = [
    'const [pgPath, url, database] = process.argv.slice(1)',
    "if (!/^qct_[a-z0-9_]{1,58}$/.test(database)) { console.error('nombre invalido'); process.exit(2) }",
    'const { Client } = require(pgPath)',
    'const client = new Client({ connectionString: url })',
    'client.connect()',
    '  .then(() => client.query(\'DROP DATABASE IF EXISTS "\' + database + \'" WITH (FORCE)\'))',
    '  .then(() => client.end())',
    '  .then(() => process.exit(0))',
    '  .catch((error) => { console.error(error.message); process.exit(1) })',
  ].join('\n')

  const result = spawnSync(process.execPath, ['-e', script, pgEntryPoint, url, name], {
    encoding: 'utf8',
  })
  if (result.status === 0) return
  throw new Error(
    `test-db: el borrado sincrono de ${name} fallo (codigo ${String(result.status)}): ` +
      `${result.stderr ?? ''}${result.error === undefined ? '' : describeError(result.error)}`,
  )
}

// --------------------------------------------------------------- la receta de QC-49

/** El `code` de un error, venga de `pg` (SQLSTATE) o de `node:process` (`ESRCH`). */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface CommandResult {
  code: number
  output: string
}

/**
 * Ejecuta un comando del repo con las dos URLs apuntando a la base indicada.
 *
 * `shell: true` es necesario en Windows —`pnpm` es un `.cmd` y `spawnSync` no lo resuelve
 * solo— y es seguro aqui porque los argumentos son constantes de este archivo: no entra
 * ningun dato de fuera.
 *
 * Se escriben las DOS variables: en local apuntan al mismo sitio (`prisma.config.ts:25-27`)
 * y dejar `DIRECT_URL` en la de desarrollo seria migrar la base equivocada.
 */
function runRepoCommand(repoRoot: string, databaseUrl: string, args: string[]): CommandResult {
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  })
  if (result.error !== undefined) {
    throw new Error(
      `test-db: no se pudo ejecutar «pnpm ${args.join(' ')}»: ${describeError(result.error)}`,
    )
  }
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function expectSuccess(step: string, result: CommandResult): void {
  if (result.code !== 0) {
    throw new Error(
      `test-db: la construccion de la plantilla fallo en ${step} (codigo ${result.code}).\n${result.output}`,
    )
  }
}

/**
 * La siembra MINIMA que la migracion de QC-49 exige, con SQL crudo (ver
 * `buildTemplateSchema`: por que no se puede usar aqui el cliente de Prisma).
 *
 * Lo unico que QC-49 necesita para elegir empresa esta en su `migration.sql`, bloque 2.1:
 * una fila de `companies` con `name_normalized = 'quimicloud'` —y como unico fallback, que
 * haya EXACTAMENTE UNA empresa en la tabla—. Ni roles, ni permisos, ni administrador.
 *
 * Las columnas son las que `companies` tiene EN ESE PUNTO de la historia de migraciones
 * (`20260904180600_companies_and_user_company`, y ninguna posterior la altera):
 * `id` (default `gen_random_uuid()`), `name`, `name_normalized`, `created_at` (default),
 * `updated_at` **sin default** —lo pone `@updatedAt` del cliente, asi que un INSERT crudo
 * tiene que darlo— y `deleted_at`. Los literales son los mismos que el backfill de QC-47
 * escribe a mano, por la misma razon que alli: desde SQL no se puede llamar a
 * `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName`.
 *
 * El `WHERE NOT EXISTS` no hace falta sobre una base recien creada; se escribe igual para
 * que este paso se pueda repetir sin chocar con `companies_name_unique`.
 */
async function seedInitialCompany(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(
      'INSERT INTO "companies" ("name", "name_normalized", "updated_at") ' +
        "SELECT 'QuimiCloud', 'quimicloud', CURRENT_TIMESTAMP " +
        'WHERE NOT EXISTS (SELECT 1 FROM "companies" WHERE "name_normalized" = \'quimicloud\')',
    )
  } finally {
    // Se cierra SIEMPRE: el `ALTER DATABASE ... RENAME` de `ensureTemplateDatabase` exige
    // cero conexiones contra la base de construccion.
    await client.end()
  }
}

/**
 * Los pasos de `design.md > 3`, mas la comprobacion final y el sembrado. El paso 1 **falla y
 * eso es lo esperado**: la migracion de QC-49 exige que exista la empresa inicial y falla
 * cerrado a proposito (QC-49 R3). Lo que NO es esperado es que falle otra migracion; en ese
 * caso se para y se dice cual. Tragarse cualquier fallo del paso 1 convertiria un error
 * real en una plantilla a medias que todas las corridas reutilizarian.
 *
 * POR QUE EL SEMBRADO COMPLETO VA AL FINAL Y NO EN EL HUECO DE QC-49 (cambiado en QC-23):
 * la receta original corria `pnpm run db:seed` justo despues del paso 1, que es el unico
 * punto donde QC-49 pide la empresa. Pero ahi el esquema esta A MEDIAS: las migraciones
 * POSTERIORES a QC-49 todavia no estan aplicadas. Y Prisma rellena del lado del CLIENTE los
 * `@default(...)` de escalares —`now()`, `uuid()`, ...—, asi que el `INSERT` del seed nombra
 * columnas que en ese instante no existen en la base y Postgres responde «no existe la
 * columna ...» (QC-23 lo destapo al anadir `users.sessions_valid_from` en
 * `20260912103000_session_revocation`, con `@default(now())`; el mensaje de Prisma se queda
 * con una palabra suelta del error en castellano, «existe», que despista).
 *
 * No es un problema de una ficha: **cualquier ficha futura que anada a una tabla que el seed
 * escriba una columna con default de cliente, despues del corte de QC-49, lo rompe igual**, y
 * no se ve en `dev` mientras no exista ninguna columna asi. QC-79 no lo destapo solo porque
 * anadio una TABLA que el seed no toca.
 *
 * El arreglo, por tanto, es de orden y no de una columna concreta: en el hueco de QC-49 se
 * siembra SOLO lo que esa migracion exige —la empresa inicial, con SQL crudo, porque el
 * cliente de Prisma es justo lo que esta desincronizado ahi—, y el sembrado completo se corre
 * al final, con el esquema ya entero. El seed es idempotente (lee que falta y crea solo eso,
 * `lib/modules/identity/domain/seed-initial-access.ts`) y resuelve la empresa inicial por
 * nombre normalizado reutilizandola si ya esta, asi que se encuentra la del paso 2 y no crea
 * una segunda.
 */
async function buildTemplateSchema(repoRoot: string, databaseUrl: string): Promise<void> {
  log('paso 1/6: migrando (se espera que se detenga en la migracion de QC-49)')
  const firstDeploy = runRepoCommand(repoRoot, databaseUrl, ['exec', 'prisma', 'migrate', 'deploy'])
  const stoppedAtQc49 = firstDeploy.output.includes(`Migration name: ${EXPECTED_FAILING_MIGRATION}`)
  if (firstDeploy.code !== 0 && !stoppedAtQc49) {
    throw new Error(
      'test-db: el primer `migrate deploy` fallo, pero NO en ' +
        `${EXPECTED_FAILING_MIGRATION}, que es el unico fallo que esta receta tiene permitido ` +
        `esperar (design.md > 3). Codigo ${firstDeploy.code}.\n${firstDeploy.output}`,
    )
  }

  if (stoppedAtQc49) {
    log('paso 2/6: sembrando SOLO la empresa inicial, que es lo que exige QC-49')
    await seedInitialCompany(databaseUrl)
  } else {
    log('paso 2/6: omitido — el paso 1 no se detuvo en la migracion de QC-49')
  }

  if (stoppedAtQc49) {
    log(`paso 3/6: marcando ${EXPECTED_FAILING_MIGRATION} como revertida`)
    expectSuccess(
      '`prisma migrate resolve --rolled-back`',
      runRepoCommand(repoRoot, databaseUrl, [
        'exec',
        'prisma',
        'migrate',
        'resolve',
        '--rolled-back',
        EXPECTED_FAILING_MIGRATION,
      ]),
    )
  } else {
    // Si algun dia la migracion de QC-49 deja de fallar sobre base vacia, este paso sobra.
    log('paso 3/6: omitido — el paso 1 no se detuvo en ninguna migracion')
  }

  log('paso 4/6: migrando lo que queda')
  expectSuccess(
    'el segundo `migrate deploy`',
    runRepoCommand(repoRoot, databaseUrl, ['exec', 'prisma', 'migrate', 'deploy']),
  )

  // El paso 4 en verde no basta: lo que decide que la receta fue bien es que Prisma diga
  // que el esquema esta al dia (`design.md > 3`). Se paga una vez por huella, no por corrida.
  log('paso 5/6: comprobando que el esquema queda al dia')
  expectSuccess(
    '`prisma migrate status`',
    runRepoCommand(repoRoot, databaseUrl, ['exec', 'prisma', 'migrate', 'status']),
  )

  // Y solo ahora, con el esquema entero, el sembrado completo (roles, permisos, empresa
  // inicial y admin). Va DESPUES del paso 5 a proposito: ver la nota de cabecera.
  log('paso 6/6: sembrando (roles, permisos, empresa inicial y admin)')
  expectSuccess(
    'el sembrado (`pnpm run db:seed`)',
    runRepoCommand(repoRoot, databaseUrl, ['run', 'db:seed']),
  )
}

/**
 * Entero para el `pg_advisory_lock`. 12 hex = 48 bits, dentro del entero seguro de
 * JavaScript y dentro del `bigint` que espera Postgres.
 */
function advisoryLockKey(fingerprint: string): number {
  return Number.parseInt(fingerprint, 16)
}

/**
 * Asegura la plantilla de esta huella de migraciones y devuelve su nombre (R2, R3, R5, R6).
 *
 * Si ya existe, se reutiliza tal cual: ni se migra ni se siembra. Si no existe, se
 * construye **bajo `pg_advisory_lock`**, para que dos corridas simultaneas que descubren a
 * la vez que falta no la construyan dos veces; la segunda espera y encuentra la de la
 * primera.
 *
 * Al volver no queda ninguna conexion abierta contra la plantilla —la de mantenimiento va
 * contra `postgres` y se cierra igual—: `CREATE DATABASE ... TEMPLATE` exige cero
 * conexiones contra el origen (`design.md > 3`).
 */
export async function ensureTemplateDatabase(ctx: TestDatabaseContext): Promise<string> {
  const fingerprint = migrationsFingerprint(ctx.repoRoot)
  const template = templateDatabaseName(fingerprint)
  const buildName = templateBuildDatabaseName(fingerprint, ctx.pid ?? process.pid)

  return withAdminClient(ctx.developmentUrl, async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey(fingerprint)])
    try {
      if (await databaseExists(client, template)) {
        log(`plantilla reutilizada: ${template} (las migraciones no han cambiado)`)
        return template
      }

      log(
        `no hay plantilla para esta huella de migraciones. Construyendo ${template}: ` +
          'la receta tarda ~40 s y se paga UNA vez por conjunto de migraciones, no por corrida.',
      )
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(buildName)} WITH (FORCE)`)
      await client.query(`CREATE DATABASE ${quoteIdentifier(buildName)}`)
      try {
        await buildTemplateSchema(ctx.repoRoot, withDatabaseName(ctx.developmentUrl, buildName))
        // El nombre bueno solo aparece cuando la receta termino entera: ver
        // `templateBuildDatabaseName`.
        await client.query(
          `ALTER DATABASE ${quoteIdentifier(buildName)} RENAME TO ${quoteIdentifier(template)}`,
        )
      } catch (error) {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(buildName)} WITH (FORCE)`)
        throw error
      }
      log(`plantilla lista: ${template}`)
      return template
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockKey(fingerprint)])
    }
  })
}

// ------------------------------------------------------- la base de cada corrida

function traceDirectory(worktreePath: string): string {
  return join(worktreePath, TRACE_DIRECTORY)
}

function tracePathFor(worktreePath: string, database: string): string {
  return join(traceDirectory(worktreePath), `${database}.json`)
}

function writeTrace(worktreePath: string, trace: DatabaseTrace): string {
  const path = tracePathFor(worktreePath, trace.database)
  mkdirSync(traceDirectory(worktreePath), { recursive: true })
  writeFileSync(path, `${JSON.stringify(trace, null, 2)}\n`, 'utf8')
  return path
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

/**
 * Crea la base de esta corrida copiando la plantilla (R1, R10).
 *
 * `CREATE DATABASE ... TEMPLATE` es una copia de ficheros: no vuelve a correr las 27
 * migraciones ni el sembrado. Postgres exige cero conexiones contra el origen mientras
 * copia; si las hay responde `55006`, que es justo el caso de dos corridas simultaneas
 * copiando a la vez, y por eso se reintenta con espera creciente antes de rendirse.
 *
 * El rastro en disco se escribe DESPUES del `CREATE`: un rastro sin base haria que el
 * barrido intentara borrar algo que no existe.
 */
export async function createRunDatabase(ctx: TestDatabaseContext): Promise<RunDatabase> {
  const template = ctx.templateDatabase ?? (await ensureTemplateDatabase(ctx))
  assertTestDatabaseName(template)
  const pid = ctx.pid ?? process.pid
  const name = runDatabaseName(ctx.worktreePath, ctx.now ?? new Date(), pid)

  await withAdminClient(ctx.developmentUrl, async (client) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await client.query(
          `CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE ${quoteIdentifier(template)}`,
        )
        return
      } catch (error) {
        const wait = TEMPLATE_COPY_BACKOFF_MS[attempt]
        if (errorCode(error) !== SQLSTATE_SOURCE_DATABASE_IN_USE || wait === undefined) throw error
        log(`la plantilla ${template} esta ocupada (55006); reintentando en ${wait} ms`)
        await sleep(wait)
      }
    }
  })

  const tracePath = writeTrace(ctx.worktreePath, {
    database: name,
    worktreePath: normalizePath(ctx.worktreePath),
    pid,
    createdAt: new Date().toISOString(),
  })

  return { name, url: withDatabaseName(ctx.developmentUrl, name), tracePath }
}

/** Borra la base de la corrida y su rastro. Es el teardown normal (R7) y el de senal (R8). */
export async function destroyRunDatabase(run: RunDatabase, developmentUrl?: string): Promise<void> {
  await dropRunDatabase(run.name, developmentUrl)
  rmSync(run.tracePath, { force: true })
}

// ------------------------------------------------------------------ auto-curacion

function readTrace(path: string): DatabaseTrace | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { database, worktreePath, pid, createdAt } = parsed as Record<string, unknown>
    if (typeof database !== 'string' || typeof worktreePath !== 'string') return undefined
    if (typeof pid !== 'number' || typeof createdAt !== 'string') return undefined
    return { database, worktreePath, pid, createdAt }
  } catch {
    // Un rastro ilegible no se juzga: ante la duda, NO borra (regla de oro de `wt.sh`).
    return undefined
  }
}

/**
 * ¿Sigue vivo el proceso que creo esa base? `process.kill(pid, 0)` no manda ninguna senal:
 * solo comprueba. `ESRCH` = no existe. Cualquier otro error (`EPERM`: existe pero es de
 * otro usuario) cuenta como vivo, porque no se puede afirmar lo contrario.
 */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

/**
 * Borra las bases que dejo colgando una corrida anterior de ESTE worktree (R9, capa 3 de
 * `design.md > 5`). Devuelve los nombres borrados.
 *
 * Es la red que recoge lo que ni el teardown ni las senales pueden: un `SIGKILL`, un cierre
 * de terminal o un corte de luz no ejecutan nada.
 *
 * Solo mira los rastros del propio worktree, y ademas comprueba el campo `worktreePath`:
 * un pid de otro worktree no se puede juzgar desde aqui —puede ser una corrida en vuelo—,
 * asi que no se toca. Ante la duda, NO borra.
 */
export async function reclaimAbandonedDatabases(worktreePath: string): Promise<string[]> {
  const directory = traceDirectory(worktreePath)
  if (!existsSync(directory)) return []

  const mine = normalizePath(worktreePath)
  const developmentUrl = resolveDevelopmentUrl(worktreePath)
  const reclaimed: string[] = []

  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue
    const path = join(directory, entry)
    const trace = readTrace(path)
    if (trace === undefined) {
      console.warn(`test-db: rastro ilegible, se deja en pie: ${path}`)
      continue
    }
    if (trace.worktreePath !== mine) continue
    if (!TEST_DATABASE_NAME_PATTERN.test(trace.database)) {
      console.warn(`test-db: rastro con nombre de base no valido, se deja en pie: ${path}`)
      continue
    }
    if (trace.pid === process.pid || processIsAlive(trace.pid)) continue

    await dropRunDatabase(trace.database, developmentUrl)
    rmSync(path, { force: true })
    reclaimed.push(trace.database)
    log(
      `borrada ${trace.database}: la dejo la corrida del pid ${trace.pid} ` +
        `(creada ${trace.createdAt}), que ya no esta viva.`,
    )
  }

  return reclaimed
}

// ---------------------------------------------------------- estado de migraciones

/**
 * Compara `db/migrations/` con lo que la base dice tener aplicado (R14–R16).
 *
 * **Filtra `rolled_back_at IS NULL`, y no es un detalle:** la receta de `design.md > 3`
 * deja en `_prisma_migrations` la fila del intento fallido de QC-49, con `rolled_back_at`
 * puesto y `finished_at` nulo, y la plantilla la arrastra a todas sus copias. Medido en T2:
 * 28 filas para 27 migraciones. Contar filas sin filtrar daria «una de mas» en cada base
 * efimera. Por lo mismo se exige `finished_at IS NOT NULL`: una migracion que fallo y nadie
 * resolvio no esta aplicada.
 *
 * Si la base no se puede consultar, se devuelve `readable: false` con la razon y el gate
 * sigue (R16): el estado de una base local no bloquea un PR.
 */
export async function pendingMigrations(
  url: string,
  repoRoot: string = process.cwd(),
): Promise<PendingMigrations> {
  const onDisk = migrationDirectoryNames(repoRoot)
  const client = new Client({ connectionString: url })
  try {
    await client.connect()
    const rows = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM "_prisma_migrations" ' +
        'WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL',
    )
    const applied = new Set(rows.rows.map((row) => row.migration_name))
    return {
      readable: true,
      applied: [...applied].sort(),
      pending: onDisk.filter((name) => !applied.has(name)),
    }
  } catch (error) {
    return { readable: false, reason: describeError(error) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** El aviso de R14–R16 ya escrito: `ok` es verde, `warn` es amarillo. **Nunca hay `fail`.** */
export interface PendingMigrationsReport {
  level: 'ok' | 'warn'
  message: string
}

/**
 * Convierte el estado de migraciones en el texto del aviso del gate (R14, R15, R16).
 *
 * Esta separado de `pendingMigrations` a proposito: la consulta necesita servidor, el texto
 * no. Asi los tres desenlaces se pueden medir en cada gate sin base
 * (`tests/unit/test-database/aviso-base-atrasada.test.ts`), que es lo que R15 pide de verdad:
 * el nivel que devuelve esta funcion es SIEMPRE `ok` o `warn`, nunca algo que `init.sh` pueda
 * traducir a un fallo. El estado de una base local no decide el color de un gate.
 *
 * Los tres textos se escriben distintos a proposito: «al dia», «va N atras y la mas antigua que
 * falta es X» y «no se pudo consultar, y por que». Un array vacio no distingue las dos
 * ultimas, que es justo lo que R16 prohibe confundir.
 *
 * Las pendientes se ordenan aqui antes de elegir la mas antigua: el nombre de una migracion
 * empieza por su `<timestamp>` de 14 digitos, asi que el orden lexicografico ES el
 * cronologico. `pendingMigrations` ya las entrega ordenadas, pero R14 promete «la mas
 * antigua», no «la primera del array», y esa promesa no puede depender de quien llame.
 */
export function describePendingMigrations(
  result: PendingMigrations,
  database: string,
): PendingMigrationsReport {
  if (!result.readable) {
    return {
      level: 'warn',
      message: `no se pudo consultar la base de desarrollo «${database}»: ${result.reason}`,
    }
  }
  if (result.pending.length === 0) {
    return {
      level: 'ok',
      message:
        `base de desarrollo «${database}» al dia: ${result.applied.length} migracion(es) aplicada(s)`,
    }
  }
  const oldest = [...result.pending].sort()[0]
  return {
    level: 'warn',
    message:
      `la base de desarrollo «${database}» va ${result.pending.length} migracion(es) atras; ` +
      `la mas antigua que falta es ${oldest}. Ponla al dia con: pnpm run db:migrate`,
  }
}

// ------------------------------------------------------- el inventario del barrido

/** Lo que necesita el barrido para juzgar. Sin estado global, igual que el resto. */
export interface InventoryOptions {
  /** Raiz del worktree desde el que se barre: de ahi salen los comandos de git. */
  repoRoot: string
  /**
   * Las URLs de desarrollo (`DATABASE_URL` y `DIRECT_URL`). **Todas** sus bases quedan
   * retenidas por la guarda 1. La primera da ademas la coordenada de la conexion de
   * mantenimiento.
   */
  developmentUrls: string[]
  /** Las plantillas son cache, no basura: solo entran al barrido si se pide a mano. */
  includeTemplates?: boolean
}

/** `qct_<key>_<wt8>_<run>`: lo unico que interesa del nombre es el `<wt8>`. */
const RUN_DATABASE_OWNER_PATTERN = /^qct_[a-z0-9]+_([0-9a-f]{8})_/

/** La forma heredada. El numero es el de la ficha, y con el se le pregunta a git. */
const LEGACY_DATABASE_PATTERN = /^QuimiCloude_QC(\d+)$/

/** Ramas `feature/QC-<n>-*`, tanto `refs/heads/...` como `refs/remotes/origin/...`. */
const FEATURE_BRANCH_PATTERN = /(?:^|\/)feature\/QC-?(\d+)-/i

/**
 * Lo que git sabe de quien sigue vivo. Un `error` puesto significa **no se pudo leer**, y
 * eso es la guarda 5: HOLD con la razon escrita, nunca SAFE.
 */
interface LiveOwners {
  /** `worktreeHash` de cada ruta de `git worktree list`. */
  worktreeHashes?: Set<string>
  /** Numeros de ficha con worktree o con rama `feature/QC-<n>-*`, local **o** remota. */
  tickets?: Set<string>
  /** Por que no se pudo leer, si no se pudo. Se escribe tal cual en la razon del HOLD. */
  error?: string
}

function runGit(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })
  if (result.error !== undefined) throw new Error(describeError(result.error))
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} salio con codigo ${result.status ?? -1}`)
  }
  return result.stdout ?? ''
}

/**
 * Quien sigue vivo, segun git.
 *
 * Las ramas cuentan **locales y remotas**, y es una decision de coste medida en T3: en este
 * repo las ramas remotas de feature no se borran tras el merge, asi que casi toda base
 * heredada tiene todavia una rama remota y sale HOLD. Se acepta a proposito — la regla de
 * oro es «ante la duda, NO borra», y aflojar esto para barrer mas bases seria elegir el
 * disco por encima del trabajo de otro. Quien quiera barrer mas, lo decide mirando la lista.
 */
function readLiveOwners(repoRoot: string): LiveOwners {
  try {
    const worktreeHashes = new Set<string>()
    const tickets = new Set<string>()

    for (const line of runGit(repoRoot, ['worktree', 'list', '--porcelain']).split('\n')) {
      if (!line.startsWith('worktree ')) continue
      const path = line.slice('worktree '.length).trim()
      if (path === '') continue
      worktreeHashes.add(worktreeHash(path))
      const ticket = /^qc-?(\d+)/.exec(basename(normalizePath(path)))
      if (ticket !== null) tickets.add(ticket[1])
    }

    const refs = runGit(repoRoot, [
      'for-each-ref',
      '--format=%(refname)',
      'refs/heads',
      'refs/remotes',
    ])
    for (const refname of refs.split('\n')) {
      const ticket = FEATURE_BRANCH_PATTERN.exec(refname.trim())
      if (ticket !== null) tickets.add(ticket[1])
    }

    return { worktreeHashes, tickets }
  } catch (error) {
    return { error: describeError(error) }
  }
}

/**
 * Contexto ya resuelto que necesita cada veredicto. Se calcula una vez por inventario.
 *
 * Se exporta junto con `verdictFor` para que el juicio —el unico codigo de esta ficha que
 * acaba en un `DROP DATABASE`— se pueda probar inyectandole el contexto a mano, sin servidor
 * (`tests/unit/test-database/barrido-veredictos.test.ts`).
 */
export interface VerdictContext {
  developmentNames: Set<string>
  connections: Map<string, number>
  owners: LiveOwners
  includeTemplates: boolean
}

/**
 * Las cinco guardas de `design.md > 6`, **en su orden**, y la regla de las plantillas.
 *
 * El orden no es decorativo: la guarda 1 va la primera para que la base de desarrollo quede
 * retenida aunque su nombre encajara con una forma conocida (R30). Cualquier guarda que
 * salte devuelve HOLD con la razon; solo llega a `SAFE` lo que pasa las cinco.
 */
export function verdictFor(database: string, ctx: VerdictContext): DatabaseVerdict {
  const kind = classifyDatabaseName(database)
  const hold = (reason: string): DatabaseVerdict => ({ database, verdict: 'HOLD', reason, kind })
  const safe = (reason: string): DatabaseVerdict => ({ database, verdict: 'SAFE', reason, kind })

  // (1) la base con la que trabaja el humano no cae nunca, encaje o no su nombre (R30)
  if (ctx.developmentNames.has(database)) {
    return hold('es la base de desarrollo (DATABASE_URL / DIRECT_URL)')
  }
  // (2) un nombre que no sabemos leer no se toca (R28)
  if (kind === 'unknown') {
    return hold('el nombre no encaja en qct_* ni en QuimiCloude_QC<n>')
  }
  // (3) alguien la esta usando ahora mismo: puede ser una corrida de otro worktree (R10)
  const openConnections = ctx.connections.get(database) ?? 0
  if (openConnections > 0) {
    return hold(`tiene ${openConnections} conexion(es) abierta(s)`)
  }

  if (kind === 'template') {
    // Cache, no basura: borrar la de la rama de al lado solo cuesta reconstruirla (~40 s).
    if (!ctx.includeTemplates) {
      return hold('plantilla: es cache, no basura (cae solo con --incluir-plantillas)')
    }
    return safe('plantilla sin conexiones, y se pidio --incluir-plantillas')
  }

  // (5) sin git no hay forma de juzgar la guarda 4: HOLD con la razon, nunca SAFE
  if (ctx.owners.error !== undefined) {
    return hold(`no se pudo leer su estado: ${ctx.owners.error}`)
  }
  const worktreeHashes = ctx.owners.worktreeHashes ?? new Set<string>()
  const tickets = ctx.owners.tickets ?? new Set<string>()

  if (kind === 'run') {
    const owner = RUN_DATABASE_OWNER_PATTERN.exec(database)
    // (5) empieza por el prefijo reservado pero no se parsea: no se juzga
    if (owner === null) return hold('no se pudo leer el worktree dueno del nombre')
    // (4) el worktree que la creo sigue montado
    if (worktreeHashes.has(owner[1])) return hold(`su worktree sigue vivo (${owner[1]})`)
    return safe('sin worktree dueno vivo y sin conexiones')
  }

  const legacy = LEGACY_DATABASE_PATTERN.exec(database)
  // (5) clasificada como heredada pero el numero no se lee: no se juzga
  if (legacy === null) return hold('no se pudo leer el numero de ficha del nombre')
  // (4) worktree o rama de la ficha, local O remota
  if (tickets.has(legacy[1])) {
    return hold(`QC-${legacy[1]} sigue viva (worktree o rama feature/QC-${legacy[1]}-*)`)
  }
  return safe(`sin worktree ni rama feature/QC-${legacy[1]}-*, y sin conexiones`)
}

/**
 * El inventario del servidor con su veredicto y su razon (R26, R28, R29, R30).
 *
 * Lista **todas** las bases, no solo las de test: una base retenida con su razon escrita es
 * informacion para el humano, y una base que no aparece en la lista es una sorpresa. Van
 * ordenadas por nombre para poder comparar dos inventarios a ojo.
 *
 * No borra nada. Quien borra es la CLI, y solo con `--force`.
 */
export async function inventoryTestDatabases(
  options: InventoryOptions,
): Promise<DatabaseVerdict[]> {
  const [primaryUrl] = options.developmentUrls
  if (primaryUrl === undefined) {
    throw new Error('test-db: el inventario necesita al menos una URL de desarrollo.')
  }

  const developmentNames = new Set(
    options.developmentUrls.map((url) => decodeURIComponent(new URL(url).pathname.slice(1))),
  )
  const owners = readLiveOwners(options.repoRoot)

  return withAdminClient(primaryUrl, async (client) => {
    const databases = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database ORDER BY datname',
    )
    const activity = await client.query<{ datname: string; connections: string }>(
      'SELECT datname, count(*) AS connections FROM pg_stat_activity ' +
        'WHERE datname IS NOT NULL GROUP BY datname',
    )
    const connections = new Map(
      activity.rows.map((row) => [row.datname, Number.parseInt(row.connections, 10)]),
    )

    const ctx: VerdictContext = {
      developmentNames,
      connections,
      owners,
      includeTemplates: options.includeTemplates ?? false,
    }
    return databases.rows.map((row) => verdictFor(row.datname, ctx))
  })
}

/**
 * Borra una base ya juzgada `SAFE` por el inventario. No vuelve a juzgarla: eso es de quien
 * llama, igual que `remove_wt` en `scripts/wt.sh`.
 *
 * Existe aparte de `dropRunDatabase` porque el barrido tambien borra bases **heredadas**
 * (`QuimiCloude_QC<n>`), que a proposito no pasan la validacion del prefijo reservado. Lo
 * que si se exige aqui es que el nombre encaje en una de las dos formas conocidas: un
 * nombre que no sabemos leer no llega nunca a un `DROP DATABASE`.
 */
export async function dropSweptDatabase(name: string, developmentUrl: string): Promise<void> {
  if (classifyDatabaseName(name) === 'unknown') {
    throw new Error(
      `test-db: «${name}» no encaja en ninguna forma conocida (qct_* ni QuimiCloude_QC<n>); ` +
        'el barrido no borra lo que no sabe leer.',
    )
  }
  await withAdminClient(developmentUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`)
  })
}
