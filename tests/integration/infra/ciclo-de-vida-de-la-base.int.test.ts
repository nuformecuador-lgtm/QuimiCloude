/**
 * QC-77 — el ciclo de vida de la base efimera, medido contra `pg_database` (R7, R8, R9).
 *
 * POR QUE EXISTE. El reviewer de F2.2 (`progress/review_QC-77-*.md > 3, M3`) rechazo la ficha
 * porque R7, R8 y R9 solo tenian medicion manual, y el criterio es explicito:
 *
 *   > una medicion cuenta como cobertura solo si romper el requisito pone el gate en rojo por
 *   > si solo.
 *
 * Si el teardown deja de borrar, hoy **no se pone nada en rojo**: el sintoma es un servidor que
 * engorda, que es exactamente el fallo del que viene esta ficha, del reves. Este archivo es el
 * rojo que faltaba.
 *
 * COMO LO MIDE. No se cree la palabra de la libreria: despues de cada borrado consulta
 * `pg_database` con un cliente `pg` propio. Un `DROP` convertido en no-op sigue devolviendo
 * `void` sin quejarse; lo unico que lo delata es preguntarle al catalogo.
 *
 * POR QUE ESTE ARCHIVO CREA SUS PROPIAS BASES. Corre dentro del proyecto `integration`, o sea
 * dentro de una corrida que YA tiene su base efimera. Esa base no se toca: lo que se prueba
 * aqui es el nacimiento y la muerte de una base, asi que el test fabrica las suyas desde la
 * misma plantilla y las borra. De la URL de la corrida solo se toma la coordenada de conexion
 * (usuario, host, puerto); el nombre de la base se sustituye siempre.
 *
 * POR QUE LOS CASOS DE R9 USAN DIRECTORIOS TEMPORALES Y NO ESTE WORKTREE.
 * `reclaimAbandonedDatabases(ruta)` esta parametrizada por la ruta: «este worktree» es la que
 * se le pasa. Pasarle el worktree de verdad significaria ponerle delante el rastro de la
 * corrida VIVA —la que sostiene estos 41 archivos— y confiar en que la juzgue viva. Lo hace,
 * pero un test que puede borrarle la base a su propia corrida es precisamente lo que esta
 * ficha vino a evitar. Con un directorio temporal el escenario es identico para la funcion y
 * ademas es determinista: los tres rastros que ve son los tres que el test escribio.
 *
 * HIGIENE. Todo lo que se crea queda anotado y el `afterAll` lo borra pase lo que pase,
 * tambien si un caso revienta a mitad; y ademas **comprueba** contra `pg_database` que no
 * quedo ninguna. Nunca se toca `QuimiCloude`, ninguna `QuimiCloude_QC<n>` ni la plantilla
 * `qct_tpl_*` (es cache legitima: borrarla le cuesta ~40 s a la corrida siguiente).
 *
 * Censo: declarado como `commit` en `tests/integration/aislamiento.json` — hace DDL contra
 * `pg_database`, que no es transaccionable por el patron de QC-4/QC-47.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createRunDatabase,
  destroyRunDatabase,
  dropRunDatabase,
  dropRunDatabaseSync,
  ensureTemplateDatabase,
  reclaimAbandonedDatabases,
  withDatabaseName,
  type RunDatabase,
  type TestDatabaseContext,
} from '../../helpers/test-database'

/** Raiz del worktree: tres niveles por encima de `tests/integration/infra/`. */
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Un pid que no existe. Se comprueba en `beforeAll` en vez de darlo por hecho: si algun dia
 * la maquina lo tuviera vivo, los casos de R9 pasarian en verde sin probar nada.
 */
const PID_MUERTO = 999_999

/**
 * Plazo de los hooks. El `testTimeout` de los tres proyectos es 15 s
 * (`vitest.config.mts`, vigilado por `guard-teclear-y-plazo`), pero el de los HOOKS sigue
 * siendo el de por defecto (10 s) y aqui un hook crea hasta tres bases. Se iguala a mano,
 * por la misma razon que QC-58 subio el otro: bajo carga, copiar una base tarda mas de lo
 * que tarda en reposo, y un gate que cambia de color segun lo ocupada que este la maquina no
 * informa de nada. No se toca la config: es un plazo local de este archivo.
 */
const PLAZO_DE_HOOK_MS = 15_000

/** La coordenada de conexion. `_setup.ts` ya garantizo que apunta a la base de esta corrida. */
let urlDeConexion: string

/** Cliente de mantenimiento contra `postgres`: es quien responde la verdad sobre las bases. */
let mantenimiento: Client

/** La plantilla ya construida por el `globalSetup` de esta corrida. Aqui solo se reutiliza. */
let plantilla: string

/** Todo lo que este archivo crea, para que el `afterAll` no dependa de la memoria de nadie. */
const basesCreadas = new Set<string>()
const directoriosTemporales: string[] = []

/**
 * Registra una base creada y ademas ejerce de seguro: si alguna vez el nombre generado
 * coincidiera con la base de la corrida viva, el test para aqui y no la borra.
 */
function registrar(base: RunDatabase): RunDatabase {
  expect(
    base.name,
    'una base de este test coincidio con la base de la corrida viva. NO se borra nada.',
  ).not.toBe(process.env.QC77_RUN_DATABASE)
  basesCreadas.add(base.name)
  return base
}

/** La pregunta que hace que estos tests muerdan: ¿esta esa base en el catalogo de Postgres? */
async function baseExiste(nombre: string): Promise<boolean> {
  const fila = await mantenimiento.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre])
  return (fila.rowCount ?? 0) > 0
}

function worktreeTemporal(): string {
  // El prefijo `qc77infra-` hace que la clave legible del nombre salga `qc77`, asi que
  // cualquier base que este archivo dejara suelta se reconoce a simple vista en `\l`.
  const directorio = mkdtempSync(join(tmpdir(), 'qc77infra-'))
  directoriosTemporales.push(directorio)
  return directorio
}

/**
 * Crea una base desde la plantilla ya existente. `now` se inyecta para que dos creaciones
 * dentro del mismo milisegundo no puedan generar el mismo nombre.
 */
let secuencia = 0
async function crearBase(worktreePath: string, pid: number): Promise<RunDatabase> {
  secuencia += 1
  const contexto: TestDatabaseContext = {
    repoRoot,
    worktreePath,
    developmentUrl: urlDeConexion,
    templateDatabase: plantilla,
    now: new Date(Date.now() + secuencia),
    pid,
  }
  return registrar(await createRunDatabase(contexto))
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL: este archivo corre dentro del proyecto `integration`.')
  }
  urlDeConexion = url

  mantenimiento = new Client({ connectionString: withDatabaseName(url, 'postgres') })
  await mantenimiento.connect()

  // La plantilla ya existe (la aseguro el `globalSetup` de esta corrida), asi que esto es una
  // consulta, no los ~40 s de la receta.
  plantilla = await ensureTemplateDatabase({
    repoRoot,
    worktreePath: repoRoot,
    developmentUrl: url,
  })

  let vivo = true
  try {
    process.kill(PID_MUERTO, 0)
  } catch {
    vivo = false
  }
  expect(
    vivo,
    `el pid ${PID_MUERTO} esta vivo en esta maquina y los casos de R9 no probarian nada`,
  ).toBe(false)
}, PLAZO_DE_HOOK_MS)

afterAll(async () => {
  // Se borra TODO lo creado, aunque un caso haya reventado a mitad, y despues se comprueba.
  // Un test que deja bases sueltas es exactamente el fallo que esta ficha vino a arreglar.
  for (const nombre of basesCreadas) {
    try {
      await dropRunDatabase(nombre, urlDeConexion)
    } catch (error) {
      console.warn(`limpieza: no se pudo borrar ${nombre}: ${String(error)}`)
    }
  }
  for (const directorio of directoriosTemporales) {
    rmSync(directorio, { recursive: true, force: true })
  }

  const supervivientes: string[] = []
  for (const nombre of basesCreadas) {
    if (await baseExiste(nombre)) supervivientes.push(nombre)
  }
  await mantenimiento.end()

  expect(
    supervivientes,
    'este archivo dejo bases de test sueltas en el servidor. Borralas a mano antes de seguir.',
  ).toEqual([])
}, PLAZO_DE_HOOK_MS)

describe('R7 — al terminar la corrida, la base y su rastro desaparecen', () => {
  it('`dropRunDatabase` borra la base de verdad, y `pg_database` lo confirma', async () => {
    const base = await crearBase(worktreeTemporal(), process.pid)

    // La mitad que suele faltar: afirmar que ANTES estaba. Sin esto, un `createRunDatabase`
    // que no creara nada dejaria el caso en verde por vacuidad.
    expect(await baseExiste(base.name), `${base.name} deberia existir recien creada`).toBe(true)

    await dropRunDatabase(base.name, urlDeConexion)

    expect(
      await baseExiste(base.name),
      `${base.name} sigue en pg_database despues del DROP. Si el borrado se convirtio en un ` +
        'no-op, cada corrida de integracion deja una base en el servidor (R7).',
    ).toBe(false)
  })

  it('`destroyRunDatabase` se lleva tambien el rastro de `.qc-test-db/` (R7)', async () => {
    const base = await crearBase(worktreeTemporal(), process.pid)

    expect(existsSync(base.tracePath), `deberia haberse escrito el rastro ${base.tracePath}`).toBe(
      true,
    )

    await destroyRunDatabase(base, urlDeConexion)

    expect(await baseExiste(base.name), `${base.name} sigue viva tras destroyRunDatabase`).toBe(
      false,
    )
    expect(
      existsSync(base.tracePath),
      `el rastro ${base.tracePath} sobrevivio a la base. Un rastro sin base hace que la ` +
        'corrida siguiente intente reclamar algo que ya no existe (R7).',
    ).toBe(false)
  })
})

describe('R8 — el borrado del camino de senal borra, y SIGUE SIENDO SINCRONO', () => {
  it('`dropRunDatabaseSync` no devuelve una promesa y la base ya no existe al volver', async () => {
    const base = await crearBase(worktreeTemporal(), process.pid)
    expect(await baseExiste(base.name)).toBe(true)

    // (a) Que no sea asincrona no es cosmetica. Vitest registra su propio handler de
    // SIGINT/SIGTERM y lo ultimo que hace es `setTimeout(() => process.exit(), 1)`: UN
    // milisegundo. Una promesa no llega a resolverse en ese plazo, asi que convertir esto en
    // `async` devuelve la base VIVA despues de un Ctrl-C — medido en
    // `progress/qc77-mediciones/T7-T9.md`, desenlace 2. Este es el unico sitio donde esa
    // propiedad se puede vigilar sola: el Ctrl-C real no se automatiza, pero esto si.
    const resultado: unknown = dropRunDatabaseSync(base.name, urlDeConexion)

    // (b) Y aqui NO hay ningun `await` entre la llamada y la comprobacion, a proposito: si el
    // borrado fuera diferido, en este punto la base seguiria en pie.
    const existeJustoDespues = await baseExiste(base.name)

    expect(
      resultado,
      'dropRunDatabaseSync devolvio algo parecido a una promesa: dejo de ser sincrona y la ' +
        'base sobrevivira al Ctrl-C (R8).',
    ).not.toBeInstanceOf(Promise)
    expect(resultado).toBeUndefined()
    expect(
      dropRunDatabaseSync.constructor.name,
      'dropRunDatabaseSync se declaro `async`. Lee el comentario que tiene encima en ' +
        '`tests/helpers/test-database.ts` antes de hacer eso (R8).',
    ).toBe('Function')
    expect(
      existeJustoDespues,
      `${base.name} seguia en pg_database inmediatamente despues del borrado sincrono (R8).`,
    ).toBe(false)
  })
})

describe('R9 — la corrida siguiente recoge lo que dejo una corrida muerta', () => {
  /** El worktree (temporal) desde el que se barre. Es «este worktree» para la funcion. */
  let mio: string
  /** La abandonada por un pid muerto de ESTE worktree: es la unica que debe caer. */
  let abandonada: RunDatabase
  /** Rastro de OTRO worktree con pid muerto, copiado dentro del mio. No se debe tocar. */
  let ajena: RunDatabase
  let rastroDeLaAjenaEnMio: string
  /** Del worktree propio, pero con el pid de ESTE proceso, que esta vivo. No se debe tocar. */
  let viva: RunDatabase
  let reclamadas: string[]

  beforeAll(async () => {
    mio = worktreeTemporal()
    const otro = worktreeTemporal()

    abandonada = await crearBase(mio, PID_MUERTO)
    ajena = await crearBase(otro, PID_MUERTO)
    viva = await crearBase(mio, process.pid)

    // El rastro de la ajena se planta DENTRO del directorio propio: asi el barrido lo lee y
    // la unica cosa que lo salva es el campo `worktreePath` del contenido. Si ese filtro
    // desaparece, el control negativo de abajo se pone rojo.
    rastroDeLaAjenaEnMio = join(mio, '.qc-test-db', `${ajena.name}.json`)
    copyFileSync(ajena.tracePath, rastroDeLaAjenaEnMio)

    reclamadas = await reclaimAbandonedDatabases(mio)
  }, PLAZO_DE_HOOK_MS)

  it('borra la base y el rastro de la corrida cuyo pid ya no vive, y lo dice', async () => {
    expect(
      reclamadas,
      'el barrido no nombro la base abandonada. R9 exige borrarla Y decir cual.',
    ).toContain(abandonada.name)
    expect(
      await baseExiste(abandonada.name),
      `${abandonada.name} sigue en pg_database: la auto-curacion no borro nada (R9).`,
    ).toBe(false)
    expect(
      existsSync(abandonada.tracePath),
      'el rastro de la base reclamada sigue en disco; la corrida siguiente volveria a ' +
        'intentarlo (R9).',
    ).toBe(false)
  })

  it('control negativo: no toca la base de otro worktree ni la de un pid vivo (R9)', async () => {
    // Sin estos dos casos, un barrido que borrara de mas pasaria el caso de arriba en verde.
    // Ante la duda, NO borra: la regla de oro heredada de `scripts/wt.sh`.
    expect(reclamadas, 'el barrido reclamo una base de OTRO worktree').not.toContain(ajena.name)
    expect(
      await baseExiste(ajena.name),
      `${ajena.name} es de otro worktree —puede ser una corrida en vuelo— y el barrido la ` +
        'borro (R9).',
    ).toBe(true)
    expect(
      existsSync(rastroDeLaAjenaEnMio),
      'el barrido borro el rastro de otro worktree sin poder juzgarlo (R9).',
    ).toBe(true)

    expect(reclamadas, 'el barrido reclamo una base cuyo proceso sigue vivo').not.toContain(
      viva.name,
    )
    expect(
      await baseExiste(viva.name),
      `${viva.name} la creo un proceso que sigue vivo y el barrido la borro: eso es borrarle ` +
        'la base a una corrida en marcha (R9).',
    ).toBe(true)
    expect(
      existsSync(viva.tracePath),
      'el barrido borro el rastro de una corrida viva (R9).',
    ).toBe(true)
  })
})
