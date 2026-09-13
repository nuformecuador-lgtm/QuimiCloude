/**
 * QC-77 — el guardian de R12: los cinco desenlaces del aborto, y el verde.
 *
 * Por que existe: `tests/integration/_setup.ts` es la UNICA red que convierte «la URL no se
 * propago al worker» en un rojo, en vez de en «los 41 archivos de integracion contra la base
 * de desarrollo, en silencio y en verde». Hasta hoy esa red estaba medida a mano una vez
 * (`progress/qc77-mediciones/T7-T9.md`): si alguien la relajaba, nada se ponia rojo y la
 * ficha volvia al estado del que salio. Aqui el juicio vuelve a correr en cada gate.
 *
 * **No toca la base ni el entorno real**: cae en el proyecto `node` y el entorno se le pasa
 * como argumento, porque `runDatabaseGuardFailure` es puro a proposito.
 */
import { runDatabaseGuardFailure } from '@/tests/helpers/run-database-guard'

const LA_DE_ESTA_CORRIDA = 'qct_qc77_7a512e99_mtyoo5ht_c7s'
const LA_DE_OTRA_CORRIDA = 'qct_qc23_deadbeef_mtyoo5ht_9f1'

function urlDe(base: string): string {
  return `postgresql://postgres:p%2Fss@127.0.0.1:5432/${base}?schema=public`
}

/** El entorno correcto: las dos URLs a la base que la corrida publico. */
function entornoBueno(): { DATABASE_URL: string; DIRECT_URL: string; QC77_RUN_DATABASE: string } {
  return {
    DATABASE_URL: urlDe(LA_DE_ESTA_CORRIDA),
    DIRECT_URL: urlDe(LA_DE_ESTA_CORRIDA),
    QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
  }
}

/**
 * Todo aborto tiene que **nombrar la base que encontro** — R12 lo exige literalmente, y sin
 * eso quien lea el mensaje no sabe si apunta a desarrollo, a otra corrida o a ninguna.
 */
function esperarAbortoQueNombra(mensaje: string | undefined, loEncontrado: string): string {
  expect(mensaje).toBeDefined()
  const texto = mensaje ?? ''
  expect(texto).toContain('ABORTADO antes del primer caso')
  expect(texto).toContain(loEncontrado)
  return texto
}

describe('el guardian de R12 aborta y nombra la base que encontro', () => {
  it('cuando DATABASE_URL no esta definida', () => {
    // R12 — desenlace 1
    const mensaje = runDatabaseGuardFailure({ QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA })

    const texto = esperarAbortoQueNombra(mensaje, '«(DATABASE_URL sin definir)»')
    expect(texto).toContain('no se puede leer ningun nombre de base')
  })

  it('cuando de DATABASE_URL no sale ningun nombre de base', () => {
    // R12 — desenlace 1, con una URL que existe pero no lleva base
    const mensaje = runDatabaseGuardFailure({
      DATABASE_URL: 'postgresql://postgres:pss@127.0.0.1:5432/',
      QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
    })

    esperarAbortoQueNombra(mensaje, '«postgresql://postgres:pss@127.0.0.1:5432/»')
  })

  it('cuando el nombre no lleva el prefijo reservado qct_ (la base de desarrollo)', () => {
    // R12 — desenlace 2. Este es el bug del que viene la ficha, literal.
    const mensaje = runDatabaseGuardFailure({
      DATABASE_URL: urlDe('QuimiCloude'),
      DIRECT_URL: urlDe('QuimiCloude'),
      QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
    })

    const texto = esperarAbortoQueNombra(mensaje, '«QuimiCloude»')
    expect(texto).toContain('no es el de una base efimera de test')
  })

  it('cuando la corrida no publico ninguna base en QC77_RUN_DATABASE', () => {
    // R12 — desenlace 3, ausente y vacio: los dos abortan
    for (const publicada of [undefined, '']) {
      const mensaje = runDatabaseGuardFailure({
        DATABASE_URL: urlDe(LA_DE_ESTA_CORRIDA),
        QC77_RUN_DATABASE: publicada,
      })

      const texto = esperarAbortoQueNombra(mensaje, `«${LA_DE_ESTA_CORRIDA}»`)
      expect(texto).toContain('QC77_RUN_DATABASE')
    }
  })

  it('cuando la base es qct_ pero de OTRA corrida', () => {
    // R12 — desenlace 4. El prefijo solo no basta: una base efimera ajena lo pasaria, y
    // ensuciarla es exactamente lo que R12 prohibe.
    const mensaje = runDatabaseGuardFailure({
      DATABASE_URL: urlDe(LA_DE_OTRA_CORRIDA),
      DIRECT_URL: urlDe(LA_DE_OTRA_CORRIDA),
      QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
    })

    const texto = esperarAbortoQueNombra(mensaje, `«${LA_DE_OTRA_CORRIDA}»`)
    expect(texto).toContain(`la base de esta corrida es «${LA_DE_ESTA_CORRIDA}»`)
  })

  it('cuando DIRECT_URL se queda en otra base que DATABASE_URL', () => {
    // R12 — desenlace 5. Medio agujero es un agujero: DIRECT_URL es la que usa Migrate.
    const mensaje = runDatabaseGuardFailure({
      DATABASE_URL: urlDe(LA_DE_ESTA_CORRIDA),
      DIRECT_URL: urlDe('QuimiCloude'),
      QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
    })

    const texto = esperarAbortoQueNombra(mensaje, `«${LA_DE_ESTA_CORRIDA}»`)
    expect(texto).toContain('DIRECT_URL en «QuimiCloude»')
  })
})

describe('el guardian de R12 deja pasar la corrida legitima', () => {
  it('no aborta cuando las dos URLs apuntan a la base que publico la corrida', () => {
    // R12 — el verde. Sin este caso, un guardian que abortara SIEMPRE pasaria los seis
    // rojos de arriba y nadie se enteraria hasta ver la suite entera caida.
    expect(runDatabaseGuardFailure(entornoBueno())).toBeUndefined()
  })

  it('no aborta cuando DIRECT_URL no esta definida', () => {
    // R12 — `DIRECT_URL` opcional: solo se juzga si existe.
    expect(
      runDatabaseGuardFailure({
        DATABASE_URL: urlDe(LA_DE_ESTA_CORRIDA),
        QC77_RUN_DATABASE: LA_DE_ESTA_CORRIDA,
      }),
    ).toBeUndefined()
  })
})
