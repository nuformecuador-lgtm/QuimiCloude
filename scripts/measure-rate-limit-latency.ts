/**
 * Mide la latencia que anade el contador de limite de peticiones: lanza N peticiones
 * SECUENCIALES contra una URL y escribe p50 y p95 (en ms) por stdout.
 *
 * Uso:
 *   tsx scripts/measure-rate-limit-latency.ts <url> [n]
 *
 * Ejemplos:
 *   tsx scripts/measure-rate-limit-latency.ts http://localhost:3117/ 200
 *   tsx scripts/measure-rate-limit-latency.ts http://localhost:3000/dashboard 300
 *
 * La URL tiene que caer en la cuota GENERAL, no en `/login` (techo mucho mas bajo). Para
 * que las N peticiones midan latencia y no el propio freno, N debe quedar por debajo de
 * `RATE_LIMIT_GENERAL_MAX` (600 por defecto) o esa variable se sube en el entorno del
 * SERVIDOR medido antes de arrancarlo, p. ej.:
 *
 *   RATE_LIMIT_GENERAL_MAX=5000 pnpm start
 *   tsx scripts/measure-rate-limit-latency.ts http://localhost:3000/ 1000
 */
import { pathToFileURL } from 'node:url'

/**
 * Percentil por rango mas cercano (nearest-rank): ordena, calcula
 * `ceil(p/100 * n)` y toma esa posicion. No promedia entre dos posiciones en los
 * pares, a proposito: es el metodo mas simple de reproducir a mano al leer el numero.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    throw new Error('percentile: no hay valores')
  }

  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1)
  return sorted[index]
}

export interface LatencySummary {
  p50: number
  p95: number
}

export function summarizeLatencies(durationsMs: number[]): LatencySummary {
  return { p50: percentile(durationsMs, 50), p95: percentile(durationsMs, 95) }
}

/** Peticiones GET secuenciales (nunca en paralelo: eso mediria otra cosa). */
async function measureSequential(url: string, n: number): Promise<number[]> {
  const durations: number[] = []
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    const response = await fetch(url)
    await response.arrayBuffer()
    durations.push(performance.now() - start)
  }
  return durations
}

function fail(message: string): never {
  console.error(`measure-rate-limit-latency: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const url = process.argv[2]
  const n = Number.parseInt(process.argv[3] ?? '100', 10)

  if (url === undefined || url.trim() === '') {
    fail('falta la URL. Uso: tsx scripts/measure-rate-limit-latency.ts <url> [n]')
  }
  if (!Number.isInteger(n) || n <= 0) {
    fail(`n invalido: "${process.argv[3]}"`)
  }

  console.log(`measure-rate-limit-latency: ${n} peticiones secuenciales a ${url}`)
  const durations = await measureSequential(url, n)
  const { p50, p95 } = summarizeLatencies(durations)
  console.log(`measure-rate-limit-latency: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`)
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error)
    fail(detail)
  })
}
