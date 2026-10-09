/**
 * db:seed:demo — siembra datos de DEMOSTRACION (ficticios) sobre la empresa del seed base.
 * Idempotente: una segunda corrida no duplica nada. Que crea: `docs/verification.md >
 * Datos de demostracion`.
 *
 * Cascara fina, como `scripts/seed.ts`: carga el entorno, aplica las guardas (nunca con un
 * `VERCEL_ENV` distinto de `development`, preview incluido, ni en CI; contra una base que no sea local, solo con `--forzar`), lee las contrasenas
 * de demo del entorno y delega en `seed-demo/run.ts`. Prisma y la composicion se cargan
 * con `import()` DESPUES de `loadDotEnv()`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { evaluateDemoSeedGuard, readDemoCredentials } from './seed-demo/guard'

function loadDotEnv(): void {
  if (!existsSync(join(process.cwd(), '.env'))) return
  process.loadEnvFile()
}

async function main(): Promise<void> {
  loadDotEnv()

  const verdict = evaluateDemoSeedGuard({ argv: process.argv.slice(2), env: process.env })
  if (!verdict.allowed) throw new Error(verdict.reason)
  if (verdict.forced) console.warn('db:seed:demo: AVISO — corre forzado sobre una base que no es local')

  const credentials = readDemoCredentials(process.env)

  const { prisma } = await import('../lib/shared/db/prisma')
  try {
    const { createPrismaDemoSeedGateway } = await import('./seed-demo/gateway')
    const { runDemoSeed } = await import('./seed-demo/run')
    const { DEMO_DATASET } = await import('./seed-demo/data')

    const report = await runDemoSeed(createPrismaDemoSeedGateway(), DEMO_DATASET, credentials)

    const lineas = Object.keys(report.created).map(
      (kind) => `${kind}: ${report.created[kind as keyof typeof report.created]} creados, ${report.existing[kind as keyof typeof report.existing]} ya estaban`,
    )
    console.log(`db:seed:demo:\n  ${lineas.join('\n  ')}`)
    for (const warning of report.warnings) console.warn(`db:seed:demo: aviso — ${warning}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  // La politica de credenciales dice que regla no se cumple en `unmet`, nunca el valor.
  const unmet = error instanceof Error && 'unmet' in error && Array.isArray(error.unmet) ? ` (${error.unmet.join(', ')})` : ''
  console.error(`db:seed:demo: fallo — ${detail}${unmet}`)
  process.exit(1)
})
