/**
 * db:test — la CLI de las bases de test: estado, plantilla, inventario y barrido.
 *
 * Existe por dos razones distintas que comparten maquinaria:
 *
 *   1. `init.sh` necesita poder decir «tu base de desarrollo va N migraciones atras» sin
 *      cambiar el codigo de salida del gate (R14–R16). Eso es `status`.
 *   2. El servidor local acumula bases de test que nadie borra —37 contadas el 2026-09-12,
 *      20 de ellas heredadas de fichas ya cerradas—. Eso es `list` / `clean`.
 *
 * **El barrido es una copia deliberada de `scripts/wt.sh`**: inventario con veredicto y
 * razon por fila, dry-run por defecto, `--force` para ejecutar, y la regla de oro **ante la
 * duda, NO borra**. El coste de dejar una base de mas es disco; el de borrar la equivocada
 * es trabajo perdido — y una de las candidatas posibles es la base con la que el humano
 * trabaja a mano, que por eso tiene su propia guarda y va la primera.
 *
 * Las cinco guardas viven en `tests/helpers/test-database.ts` (`inventoryTestDatabases`),
 * no aqui: este archivo solo imprime y, con `--force`, borra lo que ya salio `SAFE`.
 *
 * Se importa la libreria por ruta **relativa** y no por alias: con `tsx` los alias de
 * `tsconfig` no estan verificados en este repo (misma nota que `scripts/seed.ts:12-14`).
 *
 * Identificadores en ingles (R31); los mensajes por consola, en castellano.
 */
import {
  describePendingMigrations,
  dropSweptDatabase,
  ensureTemplateDatabase,
  inventoryTestDatabases,
  migrationDirectoryNames,
  pendingMigrations,
  resolveDevelopmentUrl,
  type DatabaseVerdict,
} from '../tests/helpers/test-database'

const RED = '\u001b[0;31m'
const GREEN = '\u001b[0;32m'
const YELLOW = '\u001b[1;33m'
const DIM = '\u001b[2m'
const NC = '\u001b[0m'

/** Sin TTY (o con `NO_COLOR`) los codigos ANSI ensucian el log en vez de ayudar. */
const COLOR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined

function paint(color: string, text: string): string {
  return COLOR ? `${color}${text}${NC}` : text
}

function ok(message: string): void {
  console.log(paint(GREEN, `✓ ${message}`))
}

function warn(message: string): void {
  console.log(paint(YELLOW, `! ${message}`))
}

function fail(message: string): never {
  console.error(paint(RED, `✗ ${message}`))
  process.exit(1)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const USAGE = `db:test — las bases de test: estado, plantilla, inventario y barrido.

  pnpm run db:test status                  compara db/migrations/ con la base de desarrollo
  pnpm run db:test template                construye (o reutiliza) la plantilla de esta rama
  pnpm run db:test list                    inventario con veredicto SAFE / HOLD por base
  pnpm run db:test clean [--force]         dry-run por defecto; con --force borra los SAFE

Opciones:
  --force                 solo \`clean\`: borra de verdad las bases juzgadas SAFE
  --incluir-plantillas    mete las plantillas (qct_tpl_*) en el barrido. Son cache, no
                          basura: por defecto se listan aparte y se retienen

Las cinco guardas (cualquiera que salte deja la base en pie):
  1. es la base de desarrollo          4. su worktree o su rama siguen vivos
  2. el nombre no encaja en qct_* ni   5. no se pudo leer su estado
     en QuimiCloude_QC<n>
  3. tiene conexiones abiertas`

// ------------------------------------------------------------------ entorno

const repoRoot = process.cwd()

/**
 * Las dos URLs de desarrollo, para la guarda 1.
 *
 * Se miran las **dos** porque en este repo `DATABASE_URL` (pooler) y `DIRECT_URL` (directa)
 * pueden apuntar a bases distintas, y las dos son «la base con la que trabaja el humano».
 * `resolveDevelopmentUrl` ya carga el `.env` si hace falta, asi que `DIRECT_URL` se lee
 * despues de llamarla y no antes.
 */
function developmentUrls(): string[] {
  const databaseUrl = resolveDevelopmentUrl(repoRoot)
  const directUrl = process.env.DIRECT_URL
  const urls = [databaseUrl]
  if (directUrl !== undefined && directUrl.trim() !== '' && directUrl !== databaseUrl) {
    urls.push(directUrl)
  }
  return urls
}

function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

// ------------------------------------------------------------------ status

/**
 * El aviso de R14–R16. **Nunca sale distinto de 0**: el estado de una base local no puede
 * decidir el color de un gate (R15), asi que hasta el «no se pudo consultar» sale en 0.
 *
 * Los tres desenlaces se escriben distintos a proposito: «al dia», «va N atras y la mas
 * antigua que falta es X» y «no se pudo consultar, y por que». Un array vacio no distingue
 * las dos ultimas, que es justo lo que R16 prohibe confundir.
 */
async function commandStatus(): Promise<void> {
  let url: string
  try {
    url = resolveDevelopmentUrl(repoRoot)
  } catch (error) {
    warn(`no se pudo consultar la base de desarrollo: ${describeError(error)}`)
    return
  }

  const state = await pendingMigrations(url, repoRoot)
  const report = describePendingMigrations(state, databaseNameOf(url))
  if (report.level === 'ok') ok(report.message)
  else warn(report.message)
}

// ---------------------------------------------------------------- template

async function commandTemplate(): Promise<void> {
  const [url] = developmentUrls()
  if (url === undefined) fail('no hay URL de desarrollo que usar')
  const template = await ensureTemplateDatabase({
    repoRoot,
    worktreePath: repoRoot,
    developmentUrl: url,
  })
  ok(`plantilla de esta rama: ${template} (${migrationDirectoryNames(repoRoot).length} migraciones)`)
}

// ------------------------------------------------------------ list / clean

function printRow(row: DatabaseVerdict): void {
  const color = row.verdict === 'SAFE' ? GREEN : YELLOW
  const verdict = paint(color, row.verdict.padEnd(4))
  console.log(`${verdict}  ${row.database.padEnd(44)} ${row.kind.padEnd(8)} ${paint(DIM, row.reason)}`)
}

/**
 * Imprime el inventario y devuelve lo juzgado `SAFE`.
 *
 * Las plantillas van en una seccion aparte —son cache, no basura— para que el recuento del
 * final no invite a barrerlas de pasada.
 */
async function inventory(includeTemplates: boolean): Promise<DatabaseVerdict[]> {
  const urls = developmentUrls()
  const rows = await inventoryTestDatabases({ repoRoot, developmentUrls: urls, includeTemplates })

  console.log(
    paint(DIM, `repo: ${repoRoot}   desarrollo: ${urls.map(databaseNameOf).join(', ')}`),
  )
  console.log()

  const templates = rows.filter((row) => row.kind === 'template')
  const rest = rows.filter((row) => row.kind !== 'template')
  for (const row of rest) printRow(row)

  if (templates.length > 0) {
    console.log()
    console.log(paint(DIM, 'plantillas (cache de esquema; se reconstruyen solas):'))
    for (const row of templates) printRow(row)
  }

  const safe = rows.filter((row) => row.verdict === 'SAFE')
  console.log()
  console.log(
    paint(
      DIM,
      `${rows.length} base(s): ${safe.length} borrable(s), ${rows.length - safe.length} retenida(s)` +
        ` — ${templates.length} plantilla(s) listada(s) aparte.`,
    ),
  )
  return safe
}

async function commandList(includeTemplates: boolean): Promise<void> {
  await inventory(includeTemplates)
}

/**
 * El barrido. **Dry-run por defecto** (R26): sin `--force` no se borra nada y se dice.
 * Con `--force` se borra exactamente lo que salio `SAFE`, nombrando cada base (R27).
 */
async function commandClean(force: boolean, includeTemplates: boolean): Promise<void> {
  const safe = await inventory(includeTemplates)

  if (safe.length === 0) {
    console.log()
    ok('no hay ninguna base borrable: no se borro nada.')
    return
  }

  if (!force) {
    console.log()
    warn(
      `dry-run: NO se borro ninguna base. Repite con --force para borrar las ${safe.length} ` +
        'marcadas SAFE.',
    )
    return
  }

  const [url] = developmentUrls()
  if (url === undefined) fail('no hay URL de desarrollo que usar')
  console.log()
  for (const row of safe) {
    await dropSweptDatabase(row.database, url)
    ok(`borrada ${row.database}  (${row.reason})`)
  }
  console.log()
  ok(`${safe.length} base(s) borrada(s).`)
}

// -------------------------------------------------------------------- main

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const includeTemplates = args.includes('--incluir-plantillas')
  const positional = args.filter((arg) => !arg.startsWith('-'))
  const unknown = args.filter(
    (arg) => arg.startsWith('-') && !['--force', '--incluir-plantillas', '-h', '--help'].includes(arg),
  )

  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return
  }
  if (unknown.length > 0) fail(`opcion desconocida: ${unknown[0]} (usa --help)`)

  switch (positional[0]) {
    case 'status':
      return commandStatus()
    case 'template':
      return commandTemplate()
    case 'list':
      return commandList(includeTemplates)
    case 'clean':
      return commandClean(force, includeTemplates)
    default:
      console.error(USAGE)
      process.exit(2)
  }
}

main().catch((error: unknown) => {
  fail(describeError(error))
})
