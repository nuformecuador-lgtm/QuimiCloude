/**
 * QC-77 — el aviso de base de desarrollo atrasada (R14, R15, R16).
 *
 * Por que existe: los tres desenlaces («al dia», «va N atras», «no se pudo consultar») estaban
 * medidos a mano una sola vez (`progress/qc77-mediciones/T12.md`). `docs/verification.md >
 * Cuando lo que verificas es el gate mismo` pide demostrar que cada validacion nueva **muerde**,
 * y probarlo una vez no es dejarlo probado: el dia que el formateo pierda el conteo, o que
 * alguien quite el `|| true` de `init.sh`, nada se pondria rojo.
 *
 * Dos mitades:
 *   - el texto, contra `describePendingMigrations`, que es puro (R14, R16 y la mitad de R15);
 *   - el gate, **leyendo `init.sh` como arbol**, igual que hace una guardia (la otra mitad de
 *     R15). No se importa ni se ejecuta nada: se afirma sobre el texto del bloque `6.c`.
 *
 * **No toca la base**: cae en el proyecto `node` de Vitest.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  describePendingMigrations,
  type PendingMigrations,
} from '@/tests/helpers/test-database'

const BASE = 'QuimiCloude'

/** Tres migraciones reales del repo, a proposito **desordenadas** en el array. */
const DESORDENADAS = [
  '20260911130000_inventory_company_scope',
  '20260908190002_user_account_status',
  '20260910120000_presentation_unit',
]

/** La mas antigua de las tres: su `<timestamp>` de 14 digitos es el menor. */
const LA_MAS_ANTIGUA = '20260908190002_user_account_status'

describe('el aviso cuando la base va atrasada (R14)', () => {
  it('dice cuantas faltan y nombra la mas antigua que falta', () => {
    // R14
    const aviso = describePendingMigrations(
      { readable: true, applied: ['20260101000000_init'], pending: DESORDENADAS },
      BASE,
    )

    expect(aviso.level).toBe('warn')
    expect(aviso.message).toContain(`va ${DESORDENADAS.length} migracion(es) atras`)
    expect(aviso.message).toContain(`la mas antigua que falta es ${LA_MAS_ANTIGUA}`)
    expect(aviso.message).toContain(`«${BASE}»`)
    expect(aviso.message).toContain('pnpm run db:migrate')
  })

  it('elige la mas antigua de verdad, no la primera del array', () => {
    // R14 — R14 promete «la mas antigua», no «la primera que me pasen». Este caso mete la mas
    // antigua en ULTIMA posicion: si el formateo se limitara a `pending[0]`, se pone rojo.
    const alReves = [...DESORDENADAS].sort().reverse()
    expect(alReves[0]).not.toBe(LA_MAS_ANTIGUA)

    const aviso = describePendingMigrations(
      { readable: true, applied: [], pending: alReves },
      BASE,
    )

    expect(aviso.message).toContain(`la mas antigua que falta es ${LA_MAS_ANTIGUA}`)
  })

  it('con una sola pendiente sigue diciendo el conteo y esa misma', () => {
    // R14
    const aviso = describePendingMigrations(
      { readable: true, applied: [], pending: [LA_MAS_ANTIGUA] },
      BASE,
    )

    expect(aviso.message).toContain('va 1 migracion(es) atras')
    expect(aviso.message).toContain(LA_MAS_ANTIGUA)
  })
})

describe('el aviso cuando la base no se puede consultar (R16)', () => {
  it('avisa en amarillo diciendo que no se pudo comprobar, y con la razon', () => {
    // R16 — «no falta ninguna» y «no se pudo comprobar» NO se escriben igual.
    const aviso = describePendingMigrations(
      { readable: false, reason: 'getaddrinfo ENOTFOUND no-existe.supabase.co' },
      BASE,
    )

    expect(aviso.level).toBe('warn')
    expect(aviso.message).toContain('no se pudo consultar la base de desarrollo')
    expect(aviso.message).toContain(`«${BASE}»`)
    expect(aviso.message).toContain('getaddrinfo ENOTFOUND no-existe.supabase.co')
    // Y sobre todo: no se parece al mensaje de «al dia».
    expect(aviso.message).not.toContain('al dia')
  })
})

describe('el aviso cuando la base esta al dia', () => {
  it('sale en verde con el conteo de migraciones aplicadas', () => {
    // R14 — el caso positivo: sin el, un formateador que avisara SIEMPRE pasaria lo de arriba.
    const aviso = describePendingMigrations(
      { readable: true, applied: ['a', 'b', 'c'], pending: [] },
      BASE,
    )

    expect(aviso.level).toBe('ok')
    expect(aviso.message).toContain(`base de desarrollo «${BASE}» al dia`)
    expect(aviso.message).toContain('3 migracion(es) aplicada(s)')
  })
})

describe('el aviso NO puede tumbar el gate (R15)', () => {
  it('ningun desenlace devuelve un nivel distinto de ok o warn', () => {
    // R15 — el tipo ya lo promete; esto lo mide sobre los tres desenlaces reales, porque el
    // tipo desaparece al compilar y el `if/else` de `scripts/test-db.ts` no.
    const desenlaces: PendingMigrations[] = [
      { readable: true, applied: ['a'], pending: [] },
      { readable: true, applied: [], pending: DESORDENADAS },
      { readable: false, reason: 'la base no existe' },
    ]

    for (const desenlace of desenlaces) {
      const aviso = describePendingMigrations(desenlace, BASE)
      // Se ensancha a `string` a proposito: el tipo desaparece al compilar, y lo que se
      // quiere medir es el valor que llega al `if/else` de `scripts/test-db.ts`.
      const nivel: string = aviso.level

      expect(['ok', 'warn']).toContain(nivel)
      expect(nivel).not.toBe('fail')
      expect(nivel).not.toBe('error')
    }
  })
})

// --------------------------------------------------------------- el bloque 6.c de init.sh

/** Se lee el arbol, no se importa nada: el gate es un `.sh` y aqui se le trata como texto. */
function bloque6c(): string {
  const init = readFileSync(join(process.cwd(), 'init.sh'), 'utf8').replace(/\r\n/g, '\n')
  const desde = init.indexOf('# 6.c')
  const hasta = init.indexOf('if [ -f package.json ]', desde)

  expect(desde).toBeGreaterThan(-1)
  expect(hasta).toBeGreaterThan(desde)
  return init.slice(desde, hasta)
}

describe('el bloque 6.c de init.sh avisa, no falla (R15)', () => {
  it('invoca db:test status conservando su `|| true`', () => {
    // R15 — **este caso existe para cazar el dia que alguien quite el `|| true`.** `init.sh`
    // corre con `set -e`: sin el, un `db:test status` que devolviera no-cero cortaria el gate
    // entero, y el estado de UNA base local decidiria el color del gate de TODOS. Es
    // exactamente lo que R15 prohibe, y hoy lo unico que lo impide son esos siete caracteres.
    // Se normalizan separadores y espacios: nada de numeros de linea.
    const normalizado = bloque6c().replace(/[ \t]+/g, ' ')

    expect(
      normalizado,
      'el bloque 6.c de init.sh invoca `db:test status` sin `|| true`: con `set -e`, ' +
        'una base de desarrollo atrasada o inalcanzable tumbaria el gate (QC-77, R15)',
    ).toContain('pnpm run db:test status 2>&1) || true')
  })

  it('su unico `fail` es el de scripts/test-db.ts ausente', () => {
    // R15 — que falte el script SI es una rotura del arnes (`docs/verification.md > El
    // anti-patron: la validacion opcional`). Cualquier OTRO `fail` que aparezca en este
    // bloque seria el estado de una base local decidiendo el codigo de salida del gate.
    const fails = bloque6c()
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('#'))
      .filter((linea) => /\bfail\b/.test(linea))

    expect(
      fails,
      'el bloque 6.c de init.sh gano un `fail` nuevo: el aviso de R14-R16 no puede alterar ' +
        'el codigo de salida del gate (QC-77, R15)',
    ).toHaveLength(1)
    expect(fails[0]).toContain('scripts/test-db.ts')
  })

  it('los desenlaces que no son «al dia» se imprimen con warn, nunca con fail', () => {
    // R15, R16 — el `else` del bloque es el que recoge «va N atras» y «no se pudo consultar».
    const bloque = bloque6c()

    expect(bloque).toContain('warn "$LINEA_DB"')
    expect(bloque).not.toContain('fail "$LINEA_DB"')
  })
})
