/**
 * QC-77 — las cinco guardas del barrido: la tabla de `progress/qc77-mediciones/T11.md`, pero
 * corriendo en cada gate y sin tocar Postgres.
 *
 * Por que existe: `verdictFor` es el UNICO codigo de esta ficha que acaba en un
 * `DROP DATABASE`, y su cobertura eran cinco fixtures montados a mano una vez. Reordenar las
 * guardas —o colar un `safe(...)` antes de la guarda 1— borraria la base de desarrollo con el
 * gate en verde. Aqui el juicio se mide con el contexto inyectado a mano: ni conexion, ni
 * `pg_database`, ni git.
 *
 * **No toca la base**: cae en el proyecto `node` de Vitest.
 */
import {
  classifyDatabaseName,
  dropSweptDatabase,
  verdictFor,
  type VerdictContext,
} from '@/tests/helpers/test-database'

/** El `<wt8>` de un worktree vivo y el de uno que ya no existe. */
const WT_VIVO = '7a512e99'
const WT_MUERTO = 'deadbeef'

const DESARROLLO = 'QuimiCloude'

/** Contexto por defecto: git legible, la ficha 77 viva, plantillas fuera del barrido. */
function contexto(parcial: Partial<VerdictContext> = {}): VerdictContext {
  return {
    developmentNames: new Set([DESARROLLO]),
    connections: new Map<string, number>(),
    owners: { worktreeHashes: new Set([WT_VIVO]), tickets: new Set(['77']) },
    includeTemplates: false,
    ...parcial,
  }
}

describe('guarda 1 — la base de desarrollo no cae nunca', () => {
  it('retiene la base de desarrollo aunque su nombre sea un qct_ perfectamente valido', () => {
    // R30 — el caso que nadie cubria: hasta hoy solo estaba automatizado
    // `classifyDatabaseName('QuimiCloude') === 'unknown'`, que es la guarda **2**. Si la base
    // de desarrollo se llamara algun dia con forma `qct_`, lo unico que la salva es esta.
    const base = `qct_labs_${WT_MUERTO}_mtyoo5ht_c7s`

    expect(classifyDatabaseName(base)).toBe('run')
    const veredicto = verdictFor(base, contexto({ developmentNames: new Set([base]) }))

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain('es la base de desarrollo')
  })

  it('retiene tambien la segunda URL de desarrollo (DIRECT_URL apuntando a otra base)', () => {
    // R30 — `developmentNames` lleva las DOS URLs, y las dos son «la base del humano».
    const veredicto = verdictFor(
      'QuimiCloude_QC42',
      contexto({ developmentNames: new Set([DESARROLLO, 'QuimiCloude_QC42']) }),
    )

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain('es la base de desarrollo')
  })

  it('gana sobre las demas: una base que dispararia varias guardas sale por la guarda 1', () => {
    // R30 — **este caso existe para fijar el ORDEN de las guardas.** La base de abajo es a la
    // vez: (a) la de desarrollo, (b) un nombre `qct_` valido, (c) sin conexiones y (d) sin
    // worktree dueno vivo — o sea, la guarda 4 la mandaria a SAFE. La primera afirmacion mide
    // exactamente esa distancia: con el mismo nombre y el mismo contexto, quitando solo la
    // guarda 1, el veredicto es SAFE. Si alguien reordena las guardas o cuela un `safe(...)`
    // antes de la 1, este caso se pone rojo y nadie borra la base del humano.
    const base = `qct_labs_${WT_MUERTO}_mtyoo5ht_c7s`
    const ctx = contexto({ developmentNames: new Set([base]) })

    expect(verdictFor(base, contexto()).verdict).toBe('SAFE')
    expect(verdictFor(base, ctx).verdict).toBe('HOLD')
    expect(verdictFor(base, ctx).reason).toContain('es la base de desarrollo')
  })
})

describe('guarda 2 — un nombre que no sabemos leer no se toca', () => {
  it('retiene lo desconocido y dice por que', () => {
    // R28, R29
    for (const base of ['postgres', 'template0', DESARROLLO, 'QuimiCloude_FIXGATE']) {
      const veredicto = verdictFor(base, contexto({ developmentNames: new Set<string>() }))

      expect(veredicto.verdict).toBe('HOLD')
      expect(veredicto.kind).toBe('unknown')
      expect(veredicto.reason).toContain('el nombre no encaja')
    }
  })
})

describe('guarda 3 — alguien la esta usando ahora mismo', () => {
  it('retiene una qct_ huerfana con conexiones abiertas y dice cuantas', () => {
    // R29 — puede ser una corrida en vuelo de otro worktree (R10).
    const base = `qct_qc23_${WT_MUERTO}_mtyoo5ht_c7s`
    const veredicto = verdictFor(base, contexto({ connections: new Map([[base, 3]]) }))

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain('3 conexion(es) abierta(s)')
  })
})

describe('guarda 4 — el worktree o la rama de su feature siguen vivos', () => {
  it('retiene una qct_ cuyo worktree sigue montado, nombrando la identidad', () => {
    // R29
    const veredicto = verdictFor(`qct_qc77_${WT_VIVO}_mtyoo5ht_c7s`, contexto())

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain(`su worktree sigue vivo (${WT_VIVO})`)
  })

  it('retiene una heredada QuimiCloude_QC<n> cuya ficha sigue viva', () => {
    // R28, R29 — la ficha 77 tiene worktree o rama `feature/QC-77-*`.
    const veredicto = verdictFor('QuimiCloude_QC77', contexto())

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.kind).toBe('legacy')
    expect(veredicto.reason).toContain('QC-77 sigue viva')
  })
})

describe('guarda 5 — lo que no se puede juzgar no se borra', () => {
  it('retiene TODO con la razon escrita cuando git no se pudo leer, y nunca dice SAFE', () => {
    // R29 — sin git no hay forma de contestar a la guarda 4.
    const ctx = contexto({ owners: { error: 'git worktree list salio con codigo 128' } })

    for (const base of [`qct_qc23_${WT_MUERTO}_mtyoo5ht_c7s`, 'QuimiCloude_QC42']) {
      const veredicto = verdictFor(base, ctx)

      expect(veredicto.verdict).toBe('HOLD')
      expect(veredicto.verdict).not.toBe('SAFE')
      expect(veredicto.reason).toContain('no se pudo leer su estado')
      expect(veredicto.reason).toContain('git worktree list salio con codigo 128')
    }
  })

  it('retiene una qct_ que lleva el prefijo pero de la que no se lee el worktree dueno', () => {
    // R29 — sub-caso «nombre no parseable», rama `run`: el prefijo esta, el `<wt8>` no.
    const veredicto = verdictFor('qct_sinduenio', contexto())

    expect(veredicto.kind).toBe('run')
    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain('no se pudo leer el worktree dueno')
  })

  it('el sub-caso heredado no parseable es inalcanzable, y esto lo fija', () => {
    // R28, R29 — la rama `no se pudo leer el numero de ficha` solo se alcanza si alguien
    // afloja `classifyDatabaseName` para que llame `legacy` a algo que
    // `QuimiCloude_QC<n>` no captura. Mientras las dos formas coincidan, no hay hueco: este
    // caso se pone rojo el dia que dejen de coincidir, que es cuando habria que escribir el
    // fixture de verdad.
    for (const base of ['QuimiCloude_QC', 'QuimiCloude_QCxx', 'QuimiCloude_FIXGATE']) {
      expect(classifyDatabaseName(base)).toBe('unknown')
      expect(verdictFor(base, contexto()).reason).toContain('el nombre no encaja')
    }
  })
})

describe('las plantillas son cache, no basura', () => {
  it('retiene qct_tpl_* por defecto', () => {
    // R29
    const veredicto = verdictFor('qct_tpl_1db8043a68e0', contexto())

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.kind).toBe('template')
    expect(veredicto.reason).toContain('--incluir-plantillas')
  })

  it('la deja borrable solo cuando se pide a mano', () => {
    // R26, R27
    const veredicto = verdictFor('qct_tpl_1db8043a68e0', contexto({ includeTemplates: true }))

    expect(veredicto.verdict).toBe('SAFE')
    expect(veredicto.reason).toContain('se pidio --incluir-plantillas')
  })

  it('pero una plantilla con conexiones abiertas sigue retenida aunque se pidan', () => {
    // R29 — la guarda 3 va ANTES que la regla de las plantillas, y eso tambien es orden.
    const veredicto = verdictFor(
      'qct_tpl_1db8043a68e0',
      contexto({ includeTemplates: true, connections: new Map([['qct_tpl_1db8043a68e0', 1]]) }),
    )

    expect(veredicto.verdict).toBe('HOLD')
    expect(veredicto.reason).toContain('1 conexion(es) abierta(s)')
  })
})

describe('el caso positivo: lo que SI se borra', () => {
  it('una qct_ sin conexiones y sin worktree dueno vivo sale SAFE', () => {
    // R27 — sin este caso, un barrido que dijera HOLD a todo pasaria todo lo de arriba.
    const veredicto = verdictFor(`qct_qc23_${WT_MUERTO}_mtyoo5ht_c7s`, contexto())

    expect(veredicto.verdict).toBe('SAFE')
    expect(veredicto.reason).toContain('sin worktree dueno vivo y sin conexiones')
  })

  it('una heredada sin worktree ni rama de su ficha sale SAFE', () => {
    // R27, R28
    const veredicto = verdictFor('QuimiCloude_QC85', contexto())

    expect(veredicto.verdict).toBe('SAFE')
    expect(veredicto.kind).toBe('legacy')
    expect(veredicto.reason).toContain('feature/QC-85-*')
  })
})

describe('el borrado del barrido no toca lo que no sabe leer', () => {
  it('lanza ante un nombre desconocido ANTES de abrir ninguna conexion', async () => {
    // R29 — la validacion va delante de `withAdminClient`, asi que esto se mide sin servidor:
    // la URL de abajo apunta a un puerto donde no escucha nadie y aun asi el error que llega
    // es el del nombre, no uno de red. Si alguien mueve la validacion detras de la conexion,
    // el mensaje cambia y este caso se pone rojo.
    await expect(
      dropSweptDatabase('postgres', 'postgresql://nadie:nadie@127.0.0.1:1/postgres'),
    ).rejects.toThrow('no encaja en ninguna forma conocida')
  })
})
