// T7 — El UNICO test caro (R14, R16).
//
// PRESUPUESTO DECLARADO: este archivo gasta 2 transformaciones con `DEFAULT_SCRYPT_PARAMS`
// (una en el caso 2 y otra en el caso 3), y es el unico archivo de toda la suite autorizado a
// hashear con coste real. El techo que fija tasks.md es de 4 transformaciones caras en TODA la
// suite; aqui se usan 2 y en ningun otro archivo se usa ninguna. El caso 1 no hashea: hace
// aritmetica sobre los parametros.
//
// Medicion de T6 en la maquina de desarrollo (Node v22.13.1, win32-x64, i5-11400H):
// muestras 741.5 / 752 / 753 / 764.1 / 815.3 ms -> mediana 753 ms, maximo 815.3 ms. Por la
// regla de design.md > 3.3 (bajar si la mediana supera 1 s, subir si baja de 50 ms) los
// parametros vigentes se quedan como estan.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCRYPT_PARAMS, createPasswordHash } from '@/lib/utils/password-hash'

const TIMEOUT_MS = 15_000
const SECRET = 'la-frase-secreta-de-ana'

describe('coste de los parametros por defecto', () => {
  it('los parametros por defecto exigen al menos 64 MiB por transformacion', () => {
    // Sin hashear: la memoria de trabajo de scrypt es 128 * n * r (design.md > 3.2).
    const memoryBytes = 128 * DEFAULT_SCRYPT_PARAMS.n * DEFAULT_SCRYPT_PARAMS.r
    expect(memoryBytes).toBeGreaterThanOrEqual(67_108_864)
    expect(DEFAULT_SCRYPT_PARAMS.p).toBeGreaterThanOrEqual(1)
  })

  it(
    'una transformacion con los parametros por defecto cuesta al menos 50 ms',
    async () => {
      // Cota INFERIOR a proposito: detecta que alguien abarato el coste. Una cota superior
      // seria un rojo aleatorio en una maquina cargada (tasks.md > T7).
      const startedAt = performance.now()
      const storedHash = await createPasswordHash(SECRET)
      const elapsed = performance.now() - startedAt

      expect(elapsed).toBeGreaterThanOrEqual(50)
      expect(storedHash).toContain(
        `n=${DEFAULT_SCRYPT_PARAMS.n},r=${DEFAULT_SCRYPT_PARAMS.r},p=${DEFAULT_SCRYPT_PARAMS.p}`,
      )
      // No se verifica aqui: verificar con parametros de produccion costaria una segunda
      // derivacion cara y tasks.md pide "una sola transformacion medida". Que la verificacion
      // funciona lo cubren los casos baratos de `password-hash.test.ts`.
    },
    TIMEOUT_MS,
  )

  it(
    'la transformacion no bloquea el hilo principal',
    async () => {
      let ticks = 0
      const timer = setInterval(() => {
        ticks += 1
      }, 5)
      try {
        await createPasswordHash(SECRET)
      } finally {
        clearInterval(timer)
      }
      // Con `scryptSync` el event loop queda parado y el contador se queda en 0.
      expect(ticks).toBeGreaterThanOrEqual(3)
    },
    TIMEOUT_MS,
  )
})
