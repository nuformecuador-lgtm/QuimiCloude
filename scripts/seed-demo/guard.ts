/**
 * Guardas del seed de demostracion, puras: reciben el entorno como dato y no leen
 * `process.env` por su cuenta, para que el test pueda probar cada rama sin tocar el proceso.
 *
 * - `evaluateDemoSeedGuard` decide si el seed puede escribir en la base que apunta
 *   `DATABASE_URL`. Solo una base local (localhost / 127.0.0.1) y nunca con
 *   `VERCEL_ENV=production`, salvo bandera explicita (`--forzar` o `SEED_DEMO_FORZAR=1`).
 * - `readDemoCredentials` lee las contrasenas de los usuarios de demo. Sin valor por
 *   defecto: si falta alguna, falla nombrandolas todas, sin imprimir ningun valor.
 */

export const DEMO_SEED_FORCE_FLAG = '--forzar'
export const DEMO_SEED_FORCE_ENV = 'SEED_DEMO_FORZAR'

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1']

export type DemoSeedEnvironment = {
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
}

export type DemoSeedGuardVerdict =
  | { readonly allowed: true; readonly forced: boolean }
  | { readonly allowed: false; readonly reason: string }

function isForced(input: DemoSeedEnvironment): boolean {
  return input.argv.includes(DEMO_SEED_FORCE_FLAG) || input.env[DEMO_SEED_FORCE_ENV] === '1'
}

/** El host de la url de conexion, o `null` si la url no se puede leer. */
export function databaseHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

function refusal(input: DemoSeedEnvironment): string | null {
  if (input.env.VERCEL_ENV === 'production') {
    return 'VERCEL_ENV=production: el seed de demostracion no corre en produccion'
  }
  const databaseUrl = input.env.DATABASE_URL
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    return 'falta DATABASE_URL: no se puede comprobar que la base sea local'
  }
  const host = databaseHost(databaseUrl)
  if (host === null) return 'DATABASE_URL no es una url valida: no se puede comprobar que la base sea local'
  if (!LOCAL_HOSTS.includes(host)) {
    return `DATABASE_URL apunta a "${host}", que no es una base local (${LOCAL_HOSTS.join(' o ')})`
  }
  return null
}

export function evaluateDemoSeedGuard(input: DemoSeedEnvironment): DemoSeedGuardVerdict {
  const reason = refusal(input)
  if (reason === null) return { allowed: true, forced: false }
  if (isForced(input)) return { allowed: true, forced: true }
  return {
    allowed: false,
    reason: `${reason}. Si de verdad quieres sembrar datos de demostracion en esta base, repite con ${DEMO_SEED_FORCE_FLAG} o con ${DEMO_SEED_FORCE_ENV}=1.`,
  }
}

/** Nombre de la variable de entorno con la contrasena de cada rol de demo. */
export const DEMO_CREDENTIAL_ENV = {
  operador: 'SEED_DEMO_OPERADOR_PASSWORD',
  empacador: 'SEED_DEMO_EMPACADOR_PASSWORD',
  acondicionamiento: 'SEED_DEMO_ACONDICIONAMIENTO_PASSWORD',
} as const

export type DemoRoleKey = keyof typeof DEMO_CREDENTIAL_ENV

export type DemoCredentials = Readonly<Record<DemoRoleKey, string>>

export function readDemoCredentials(env: Readonly<Record<string, string | undefined>>): DemoCredentials {
  const keys = Object.keys(DEMO_CREDENTIAL_ENV) as DemoRoleKey[]
  const missing = keys
    .map((key) => DEMO_CREDENTIAL_ENV[key])
    .filter((name) => (env[name] ?? '').trim() === '')
  if (missing.length > 0) {
    throw new Error(
      `faltan las variables de entorno: ${missing.join(', ')}. Ponlas en el entorno del comando (no en un archivo versionado).`,
    )
  }
  const entries = keys.map((key) => [key, env[DEMO_CREDENTIAL_ENV[key]] as string] as const)
  return Object.fromEntries(entries) as DemoCredentials
}
