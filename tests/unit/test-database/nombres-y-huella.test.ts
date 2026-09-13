/**
 * QC-77 — las partes PURAS de `tests/helpers/test-database.ts`: como se llama cada base,
 * que huella tienen las migraciones, como se reescribe la URL y como se clasifica un nombre
 * para el barrido (`design.md > 2`, `> 6` y `> 10`).
 *
 * Por que existe: R4, R5, R6, R10, R28, R30 y R31 estaban medidos a mano una sola vez, y una
 * medicion manual no vuelve a correr nunca. Estas funciones son puras, asi que el dia que
 * alguien cambie la forma de un nombre o la composicion de la huella, esto se pone rojo.
 *
 * **No toca la base**: cae en el proyecto `node` de Vitest (no en `integration`) y no abre
 * ninguna conexion. El propio `import` de abajo es parte de la prueba: el modulo declara no
 * tener efectos al importarse (`test-database.ts:18`).
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as testDatabase from '@/tests/helpers/test-database'

const {
  classifyDatabaseName,
  migrationDirectoryNames,
  migrationsFingerprint,
  runDatabaseName,
  templateDatabaseName,
  withDatabaseName,
} = testDatabase

/** El mismo patron que valida el modulo antes de construir cualquier DDL (`design.md > 2`). */
const NOMBRE_VALIDO = /^qct_[a-z0-9_]{1,58}$/

/** `qct_<key>_<wt8>_<run>`: el grupo es la identidad del worktree que crea la base. */
const IDENTIDAD_DEL_WORKTREE = /^qct_[a-z0-9]+_([0-9a-f]{8})_/

const AHORA = new Date('2026-09-12T10:00:00.000Z')
const PID = 4242

function esperarIdentificadorDePostgres(nombre: string): void {
  expect(nombre).toMatch(NOMBRE_VALIDO)
  expect(Buffer.byteLength(nombre, 'utf8')).toBeLessThanOrEqual(63)
  expect(nombre).toBe(nombre.toLowerCase())
}

function identidadDe(nombre: string): string {
  const encontrada = IDENTIDAD_DEL_WORKTREE.exec(nombre)
  if (encontrada === null) {
    throw new Error(`«${nombre}» no tiene la forma qct_<key>_<wt8>_<run>`)
  }
  return encontrada[1]
}

describe('el nombre de la base de cada corrida', () => {
  it('lleva el prefijo reservado, la clave de la ficha, la identidad del worktree y la corrida', () => {
    // R4
    const nombre = runDatabaseName('C:/wt/QC-77-aislamiento-de-la-base', AHORA, PID)

    expect(nombre).toMatch(/^qct_qc77_[0-9a-f]{8}_[0-9a-z]+_[0-9a-z]+$/)
  })

  it('cae en una clave legible cuando el directorio del worktree no deja ninguna letra ni digito', () => {
    // R4 — `main` es el ULTIMO recurso del modulo, no la marca del worktree principal:
    // ver el hallazgo anotado en `progress/qc77-mediciones/unit-nombres.md`.
    expect(runDatabaseName('C:/wt/### $$$', AHORA, PID)).toMatch(/^qct_main_/)
    // El worktree principal se llama como el repo, y de ahi sale su clave.
    expect(runDatabaseName('C:/trabajo/arc/labs', AHORA, PID)).toMatch(/^qct_labs_/)
  })

  it('es un identificador de Postgres valido en todos los casos', () => {
    // R4
    for (const ruta of [
      'C:/wt/QC-77-aislamiento-de-la-base-en-tests-de-integracion',
      'C:/trabajo/arc/labs',
      'C:/wt/### $$$',
      'C:/wt/MAYUSCULAS-Y-Acentos-Raros',
      `C:/wt/${'x'.repeat(300)}`,
    ]) {
      esperarIdentificadorDePostgres(runDatabaseName(ruta, AHORA, PID))
    }
  })

  it('da identidades distintas a worktrees distintos', () => {
    // R10 — el `<wt8>` es lo que el barrido cruza contra `git worktree list`.
    const unWorktree = runDatabaseName('C:/wt/QC-77-aislamiento', AHORA, PID)
    const otroWorktree = runDatabaseName('C:/wt/QC-78-estado-de-cuenta', AHORA, PID)

    expect(identidadDe(unWorktree)).not.toBe(identidadDe(otroWorktree))
    expect(unWorktree).not.toBe(otroWorktree)
  })

  it('da la misma identidad al mismo worktree escrito de dos formas distintas', () => {
    // R10 — medido contra la implementacion: `normalizePath` resuelve la ruta, pasa los
    // separadores a `/`, quita la barra final y lo baja todo a minusculas.
    const conBarrasInvertidas = runDatabaseName('C:\\wt\\QC-77-aislamiento', AHORA, PID)
    const conBarras = runDatabaseName('c:/wt/qc-77-aislamiento/', AHORA, PID)

    expect(identidadDe(conBarras)).toBe(identidadDe(conBarrasInvertidas))
    expect(conBarras).toBe(conBarrasInvertidas)
  })

  it('es estable: la misma ruta da siempre la misma identidad', () => {
    // R10
    const ruta = 'C:/wt/QC-77-aislamiento'

    expect(identidadDe(runDatabaseName(ruta, AHORA, PID))).toBe(
      identidadDe(runDatabaseName(ruta, new Date('2020-01-01T00:00:00.000Z'), 7)),
    )
  })

  it('no colisiona entre dos corridas del mismo worktree, ni por reloj ni por proceso', () => {
    // R10
    const ruta = 'C:/wt/QC-77-aislamiento'
    const primera = runDatabaseName(ruta, AHORA, PID)
    const otroReloj = runDatabaseName(ruta, new Date(AHORA.getTime() + 1), PID)
    const otroProceso = runDatabaseName(ruta, AHORA, PID + 1)

    expect(new Set([primera, otroReloj, otroProceso]).size).toBe(3)
  })
})

describe('el nombre de la plantilla', () => {
  it('es el prefijo reservado mas la huella de las migraciones', () => {
    // R4, R5 — el nombre ES la invalidacion de cache: otra huella, otra plantilla.
    const nombre = templateDatabaseName('0123456789ab')

    expect(nombre).toBe('qct_tpl_0123456789ab')
    esperarIdentificadorDePostgres(nombre)
    expect(templateDatabaseName('ab0123456789')).not.toBe(nombre)
  })
})

describe('la huella de las migraciones', () => {
  const temporales: string[] = []

  /** Copia a un temporal SOLO lo que entra en la huella (`design.md > 2`). */
  function copiarArbolDeHuella(): string {
    const origen = process.cwd()
    const destino = mkdtempSync(join(tmpdir(), 'qc77-huella-'))
    temporales.push(destino)

    cpSync(join(origen, 'db', 'migrations'), join(destino, 'db', 'migrations'), {
      recursive: true,
    })
    mkdirSync(join(destino, 'scripts'), { recursive: true })
    cpSync(join(origen, 'scripts', 'seed.ts'), join(destino, 'scripts', 'seed.ts'))
    const semilla = join('lib', 'modules', 'identity', 'domain', 'seed-initial-access.ts')
    mkdirSync(join(destino, 'lib', 'modules', 'identity', 'domain'), { recursive: true })
    cpSync(join(origen, semilla), join(destino, semilla))

    return destino
  }

  afterAll(() => {
    for (const directorio of temporales) rmSync(directorio, { recursive: true, force: true })
  })

  it('son 12 hex y no cambia si no cambia nada del arbol', () => {
    // R6 — mientras el conjunto no cambie, la plantilla se reutiliza.
    const arbol = copiarArbolDeHuella()

    expect(migrationsFingerprint(arbol)).toMatch(/^[0-9a-f]{12}$/)
    expect(migrationsFingerprint(arbol)).toBe(migrationsFingerprint(arbol))
    // El arbol copiado es el del repo: la huella no depende de donde este el arbol.
    expect(migrationsFingerprint(arbol)).toBe(migrationsFingerprint(process.cwd()))
  })

  it('cambia cuando se anade una migracion', () => {
    // R5
    const arbol = copiarArbolDeHuella()
    const antes = migrationsFingerprint(arbol)

    const nueva = join(arbol, 'db', 'migrations', '29990101000000_probe')
    mkdirSync(nueva, { recursive: true })
    writeFileSync(join(nueva, 'migration.sql'), 'SELECT 1;\n', 'utf8')

    expect(migrationsFingerprint(arbol)).not.toBe(antes)
  })

  it('cambia cuando se borra una migracion', () => {
    // R5
    const arbol = copiarArbolDeHuella()
    const antes = migrationsFingerprint(arbol)

    const nombres = migrationDirectoryNames(arbol)
    expect(nombres.length).toBeGreaterThan(0)
    rmSync(join(arbol, 'db', 'migrations', nombres[nombres.length - 1]), {
      recursive: true,
      force: true,
    })

    expect(migrationsFingerprint(arbol)).not.toBe(antes)
  })

  it('cambia cuando cambia el contenido de una migracion', () => {
    // R5
    const arbol = copiarArbolDeHuella()
    const antes = migrationsFingerprint(arbol)

    const [primera] = migrationDirectoryNames(arbol)
    const sql = join(arbol, 'db', 'migrations', primera, 'migration.sql')
    writeFileSync(sql, `${readFileSync(sql, 'utf8')}\n-- una linea mas\n`, 'utf8')

    expect(migrationsFingerprint(arbol)).not.toBe(antes)
  })

  it('cambia cuando cambia el sembrado', () => {
    // R5 — el sembrado forma parte del estado que hereda cada copia de la plantilla.
    const arbol = copiarArbolDeHuella()
    const antes = migrationsFingerprint(arbol)

    const seed = join(arbol, 'scripts', 'seed.ts')
    writeFileSync(seed, `${readFileSync(seed, 'utf8')}\n// una linea mas\n`, 'utf8')

    expect(migrationsFingerprint(arbol)).not.toBe(antes)
  })
})

describe('la URL de la base efimera', () => {
  it('sustituye solo el nombre de la base y conserva credenciales, host, puerto y query', () => {
    // R1
    const desarrollo =
      'postgresql://quimi:p%40ss%2Fword@db.example.com:6543/QuimiCloude?schema=public&connection_limit=1'

    const efimera = new URL(withDatabaseName(desarrollo, 'qct_qc77_deadbeef_abc_1'))

    expect(efimera.pathname).toBe('/qct_qc77_deadbeef_abc_1')
    expect(efimera.username).toBe('quimi')
    expect(efimera.password).toBe('p%40ss%2Fword')
    expect(efimera.hostname).toBe('db.example.com')
    expect(efimera.port).toBe('6543')
    expect(efimera.search).toBe('?schema=public&connection_limit=1')
    expect(efimera.protocol).toBe('postgresql:')
  })
})

describe('la clasificacion de un nombre de base para el barrido', () => {
  it('reconoce las bases de corrida y las plantillas del prefijo reservado', () => {
    // R28
    expect(classifyDatabaseName('qct_qc77_deadbeef_m1x2y3_3a')).toBe('run')
    expect(classifyDatabaseName('qct_main_deadbeef_m1x2y3_3a')).toBe('run')
    expect(classifyDatabaseName('qct_tpl_0123456789ab')).toBe('template')
    expect(classifyDatabaseName('qct_tplbuild_0123456789ab_3a')).toBe('template')
  })

  it('reconoce la forma heredada QuimiCloude_QC<n>', () => {
    // R28
    expect(classifyDatabaseName('QuimiCloude_QC77')).toBe('legacy')
    expect(classifyDatabaseName('QuimiCloude_QC7')).toBe('legacy')
  })

  it('deja como desconocido todo lo demas, incluida la base de desarrollo', () => {
    // R28, R30 — `QuimiCloude_FIXGATE` se parece pero `FIXGATE` no son digitos, y por eso
    // cae en la guarda 2 del barrido (medido en `progress/qc77-mediciones/T3.md`).
    expect(classifyDatabaseName('QuimiCloude')).toBe('unknown')
    expect(classifyDatabaseName('QuimiCloude_FIXGATE')).toBe('unknown')
    expect(classifyDatabaseName('QuimiCloude_QC')).toBe('unknown')
    expect(classifyDatabaseName('postgres')).toBe('unknown')
    expect(classifyDatabaseName('template0')).toBe('unknown')
    expect(classifyDatabaseName('QCT_QC77_deadbeef_m1x2y3_3a')).toBe('unknown')
  })
})

describe('el contrato del modulo', () => {
  it('exporta solo identificadores escritos en ingles', () => {
    // R31 — se juzga palabra a palabra: un nombre en castellano trae una palabra que no
    // esta en este vocabulario y el caso se pone rojo.
    const vocabulario = new Set([
      'abandoned',
      'classify',
      'create',
      'database',
      'databases',
      'describe',
      'destroy',
      'development',
      'directory',
      'drop',
      'ensure',
      'fingerprint',
      'inventory',
      'migration',
      'migrations',
      'name',
      'names',
      'pending',
      'reclaim',
      'resolve',
      'run',
      'swept',
      'sync',
      'template',
      'test',
      'for',
      'url',
      'verdict',
      'with',
      'worktree',
      'hash',
    ])

    const exportados = Object.keys(testDatabase)
    expect(exportados.length).toBeGreaterThan(0)

    const ajenas = exportados.flatMap((nombre) =>
      nombre
        .split(/(?=[A-Z])/)
        .map((palabra) => palabra.toLowerCase())
        .filter((palabra) => !vocabulario.has(palabra)),
    )

    expect(ajenas).toEqual([])
  })
})
