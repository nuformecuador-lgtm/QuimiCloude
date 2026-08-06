// T2 — Parametros de coste BARATOS, solo para la suite (design.md > 11).
//
// ATENCION: `{ n: 1024, r: 8, p: 1 }` son 1 MiB por transformacion y son
// CRIPTOGRAFICAMENTE INSUFICIENTES. Existen unicamente para que la suite sea usable: con
// los parametros de produccion (64 MiB, ~10^2 ms) cada caso de comportamiento costaria
// decimas de segundo y la suite dejaria de correrse.
//
// Por eso viven aqui y NO se exportan desde `lib/`: ningun archivo de produccion puede
// importarlos ni por accidente. El unico archivo que puede hashear con
// `DEFAULT_SCRYPT_PARAMS` es `tests/unit/password/password-cost.test.ts` (T7).

import type { ScryptCostParams } from '@/lib/utils/password-hash'

/** Coste de test: 1 MiB. Insuficiente para produccion, a proposito. */
export const TEST_SCRYPT_PARAMS: ScryptCostParams = { n: 1024, r: 8, p: 1 }

/** Segundo juego de coste, para probar que se verifica lo generado con otros parametros. */
export const ALTERNATE_TEST_SCRYPT_PARAMS: ScryptCostParams = { n: 2048, r: 8, p: 1 }
