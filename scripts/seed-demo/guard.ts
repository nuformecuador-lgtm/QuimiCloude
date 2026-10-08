/**
 * Guardas del seed de demostracion, puras: reciben el entorno como dato y no leen
 * `process.env` por su cuenta, para que el test pueda probar cada rama sin tocar el proceso.
 *
 * - `evaluateDemoSeedGuard` decide si el seed puede escribir en la base que apunta
 *   `DATABASE_URL`. Solo una base local (localhost / 127.0.0.1 o un socket Unix). La bandera
 *   `--forzar` de la linea de comandos salta SOLO la regla de base local; con
 *   `VERCEL_ENV=production` o dentro de CI se niega siempre, con o sin bandera.
 * - `readDemoCredentials` lee las contrasenas de los usuarios de demo. Sin valor por
 *   defecto: si falta alguna, falla nombrandolas todas, sin imprimir ningun valor.
 */

export const DEMO_SEED_FORCE_FLAG = '--forzar'

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1']

export type DemoSeedEnvironment = {
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
}

export type DemoSeedGuardVerdict =
  | { readonly allowed: true; readonly forced: boolean }
  | { readonly allowed: false; readonly reason: string }

export type DatabaseHostResult =
  | { readonly ok: true; readonly host: string }
  | { readonly ok: false; readonly reason: string }

/**
 * El host al que de verdad conecta Prisma. Prisma (como libpq) prioriza el parametro `host`
 * de la query sobre el de la autoridad, asi que si viene se toma ese. Cualquier ambiguedad
 * (url ilegible, `host` repetido o vacio) es un error: la guarda no adivina.
 */
export function databaseHost(databaseUrl: string): DatabaseHostResult {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return { ok: false, reason: 'DATABASE_URL no es una url valida' }
  }
  const hostParams = [...url.searchParams.entries()].filter(([key]) => key.toLowerCase() === 'host')
  if (hostParams.length > 1) {
    return { ok: false, reason: 'DATABASE_URL trae el parametro `host` mas de una vez' }
  }
  const [hostParam] = hostParams
  if (hostParam === undefined) return { ok: true, host: url.hostname.toLowerCase() }
  const value = hostParam[1].trim()
  if (value === '') return { ok: false, reason: 'DATABASE_URL trae el parametro `host` vacio' }
  return { ok: true, host: value.startsWith('/') ? value : value.toLowerCase() }
}

/** Un socket Unix es una ruta absoluta: siempre esta en la misma maquina. */
function isLocalHost(host: string): boolean {
  return host.startsWith('/') || LOCAL_HOSTS.includes(host)
}

/** `CI` presente con cualquier valor que no sea vacio, `0` o `false`. */
function isCi(env: DemoSeedEnvironment['env']): boolean {
  const value = (env.CI ?? '').trim().toLowerCase()
  return value !== '' && value !== '0' && value !== 'false'
}

/** Rechazos que ninguna bandera anula. */
function hardRefusal(input: DemoSeedEnvironment): string | null {
  if (input.env.VERCEL_ENV === 'production') {
    return `VERCEL_ENV=production: el seed de demostracion no corre en produccion (${DEMO_SEED_FORCE_FLAG} no lo anula)`
  }
  if (isCi(input.env)) {
    return `variable CI presente: el seed de demostracion no corre en integracion continua (${DEMO_SEED_FORCE_FLAG} no lo anula)`
  }
  return null
}

/** Rechazos por base no local, que `--forzar` si salta. */
function localRefusal(input: DemoSeedEnvironment): string | null {
  const databaseUrl = input.env.DATABASE_URL
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    return 'falta DATABASE_URL: no se puede comprobar que la base sea local'
  }
  const result = databaseHost(databaseUrl)
  if (!result.ok) return `${result.reason}: no se puede comprobar que la base sea local`
  if (!isLocalHost(result.host)) {
    return `DATABASE_URL apunta a "${result.host}", que no es una base local (${LOCAL_HOSTS.join(' o ')} o un socket Unix)`
  }
  return null
}

export function evaluateDemoSeedGuard(input: DemoSeedEnvironment): DemoSeedGuardVerdict {
  const hard = hardRefusal(input)
  if (hard !== null) return { allowed: false, reason: hard }
  const reason = localRefusal(input)
  if (reason === null) return { allowed: true, forced: false }
  if (input.argv.includes(DEMO_SEED_FORCE_FLAG)) return { allowed: true, forced: true }
  return {
    allowed: false,
    reason: `${reason}. Si de verdad quieres sembrar datos de demostracion en esta base, repite con ${DEMO_SEED_FORCE_FLAG}.`,
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
