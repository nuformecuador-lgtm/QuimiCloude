// T9 — `seedStarterUnits` con DOBLES del puerto (QC-32, R25, R26).
//
// El caso de uso vive en `domain/` y no conoce Prisma: todo entra por
// `UnitSeedRepository`, asi que aqui no hay base, ni cliente, ni transaccion — y no hace
// falta ninguna (`design.md > 9`, fila «Unitario»). Lo que se vigila es el ALGORITMO:
// «leer que falta y crear exactamente eso» (`design.md > 6.2`), que es lo unico que hace
// idempotente al seed. Un `upsert` tambien pareceria idempotente y estaria mal: pisaria el
// simbolo de una unidad cambiada a mano, y R26 lo prohibe.
//
// El doble registra TODA escritura, incluidas las que el puerto ni siquiera declara
// (`update`, `updateMany`, `upsert`): si el dominio intentara llamarlas, quedaria en el
// registro en vez de fallar por «no es una funcion». Un doble que solo implementa lo
// permitido no puede demostrar que lo prohibido no ocurre.
//
// Cubre R25 y R26.

import { describe, expect, it } from 'vitest'

import { createSeedStarterUnits, normalizeUnitName, STARTER_UNITS } from '@/lib/modules/unidades'
// Ruta profunda A PROPOSITO y solo aqui: el doble tiene que implementar el PUERTO real, para
// que cambiarlo rompa este test. Los tests no estan bajo los `SCAN_ROOTS` de
// `tests/guards/guard-arquitectura-modulos.test.ts`, asi que esto no afloja ninguna frontera.
import type { UnitSeedRepository } from '@/lib/modules/unidades/ports/unit-seed-repository'

/** Fila del catalogo tal como la ve el doble. `sello` hace de marca de tiempo: si el seed
 *  tocara la fila, la comparacion contra la instantanea previa lo delataria (R26). */
type UnidadGuardada = {
  name: string
  nameNormalized: string
  symbol: string | null
  sello: string
}

/** Una entrada del registro de operaciones. `findExistingNormalizedNames` es lectura; el
 *  resto son escrituras y ninguna deberia aparecer salvo los `createUnit` de lo que falta. */
type Operacion =
  | { op: 'findExistingNormalizedNames'; claves: readonly string[] }
  | { op: 'createUnit'; name: string; nameNormalized: string; symbol: string | null }
  | { op: 'update' | 'updateMany' | 'upsert' }

/** Un metodo de escritura que el PUERTO no declara: si el dominio lo llamara, el doble lo
 *  anota y revienta. Devuelve `never` porque siempre lanza. */
type MetodoProhibido = () => never

type RepositorioDoble = UnitSeedRepository & {
  readonly registro: readonly Operacion[]
  readonly catalogo: readonly UnidadGuardada[]
  instantanea(): readonly UnidadGuardada[]
  escrituras(): readonly Operacion[]
  creados(): readonly string[]
  update: MetodoProhibido
  updateMany: MetodoProhibido
  upsert: MetodoProhibido
}

/** Doble en memoria del catalogo. `presentes` son las unidades que YA existian. */
function repositorioDoble(presentes: readonly UnidadGuardada[] = []): RepositorioDoble {
  const registro: Operacion[] = []
  const catalogo: UnidadGuardada[] = presentes.map((fila) => ({ ...fila }))

  const prohibida =
    (op: 'update' | 'updateMany' | 'upsert'): MetodoProhibido =>
    () => {
      registro.push({ op })
      throw new Error(`el seed llamo a ${op}, que R26 prohibe`)
    }

  return {
    registro,
    catalogo,
    instantanea: () => catalogo.map((fila) => ({ ...fila })),
    escrituras: () => registro.filter((entrada) => entrada.op !== 'findExistingNormalizedNames'),
    creados: () =>
      registro.flatMap((entrada) => (entrada.op === 'createUnit' ? [entrada.name] : [])),

    async findExistingNormalizedNames(normalizedNames) {
      registro.push({ op: 'findExistingNormalizedNames', claves: [...normalizedNames] })
      const pedidas = new Set(normalizedNames)
      return catalogo
        .filter((fila) => pedidas.has(fila.nameNormalized))
        .map((fila) => fila.nameNormalized)
    },

    async createUnit(unit) {
      registro.push({ op: 'createUnit', ...unit })
      if (catalogo.some((fila) => fila.nameNormalized === unit.nameNormalized)) {
        // Es lo que haria el indice unico `units_name_normalized_key` (R5): el doble no
        // puede ser mas permisivo que la base, o taparia un duplicado.
        throw new Error(`duplicado: ya existe una unidad con clave «${unit.nameNormalized}»`)
      }
      catalogo.push({ ...unit, sello: 'creada-por-el-seed' })
    },

    // Metodos que el puerto NO declara. Estan aqui como trampa: si algun dia el dominio
    // intentara actualizar, quedaria registrado y el test lo diria con ese nombre.
    update: prohibida('update'),
    updateMany: prohibida('updateMany'),
    upsert: prohibida('upsert'),
  }
}

/** Una unidad que ya estaba en el catalogo antes del seed, con su sello propio. */
function yaEnCatalogo(name: string, symbol: string | null, sello = 'anterior'): UnidadGuardada {
  return { name, symbol, nameNormalized: normalizeUnitName(name), sello }
}

describe('seedStarterUnits — el conjunto arrancador, sin base', () => {
  it('sobre catalogo vacio crea las cinco unidades arrancadoras y ninguna mas', async () => {
    // R25: las cinco de `design.md > 6.1`, con su nombre y su simbolo exactos, y NINGUNA
    // otra. Si alguien anadiera una sexta a STARTER_UNITS, este test se pone rojo, que es
    // justo lo que R25 pide («no DEBE crear ninguna otra»).
    const repositorio = repositorioDoble()
    const seed = createSeedStarterUnits({ repository: repositorio })

    const resultado = await seed()

    expect(resultado.createdUnits).toEqual(['kilogramo', 'gramo', 'litro', 'mililitro', 'unidad'])
    expect(repositorio.catalogo.map(({ name, symbol }) => ({ name, symbol }))).toEqual([
      { name: 'kilogramo', symbol: 'kg' },
      { name: 'gramo', symbol: 'g' },
      { name: 'litro', symbol: 'L' },
      { name: 'mililitro', symbol: 'mL' },
      { name: 'unidad', symbol: null },
    ])
    expect(repositorio.catalogo).toHaveLength(5)

    // «unidad» estrena el simbolo opcional (R3): ausencia, no cadena vacia.
    const unidad = repositorio.catalogo.find((fila) => fila.name === 'unidad')
    expect(unidad?.symbol).toBeNull()
    expect(unidad?.symbol).not.toBe('')

    // Los simbolos se guardan TAL CUAL, sin normalizar (R7): 'L' y 'mL' con su mayuscula.
    expect(repositorio.catalogo.find((fila) => fila.name === 'litro')?.symbol).toBe('L')
    expect(repositorio.catalogo.find((fila) => fila.name === 'mililitro')?.symbol).toBe('mL')

    // Lo que se persiste como clave es lo que devuelve la unica definicion de R4.
    for (const fila of repositorio.catalogo) {
      expect(fila.nameNormalized).toBe(normalizeUnitName(fila.name))
    }

    // Y el catalogo resultante es exactamente STARTER_UNITS, sin nada de mas.
    expect(repositorio.catalogo.map(({ name, symbol }) => ({ name, symbol }))).toEqual(
      STARTER_UNITS.map(({ name, symbol }) => ({ name, symbol })),
    )
  })

  it('lee primero que falta, por nombre normalizado y en una sola consulta', async () => {
    // R25/R26: la idempotencia viene de la LECTURA previa (`design.md > 6.2`), no de un
    // `upsert`. Se comprueba que la lectura ocurre, que va por clave normalizada y que
    // precede a toda escritura.
    const repositorio = repositorioDoble()
    await createSeedStarterUnits({ repository: repositorio })()

    const lecturas = repositorio.registro.filter(
      (entrada) => entrada.op === 'findExistingNormalizedNames',
    )
    expect(lecturas).toHaveLength(1)
    expect(repositorio.registro[0]?.op).toBe('findExistingNormalizedNames')
    expect(lecturas[0]).toEqual({
      op: 'findExistingNormalizedNames',
      claves: STARTER_UNITS.map((unidad) => normalizeUnitName(unidad.name)),
    })
  })

  it('con tres presentes crea solo las dos que faltan', async () => {
    // R26: «crear solo las que falten». Tres ya estan —una de ellas con el simbolo
    // cambiado a mano— y el seed no debe fallar por ello.
    const repositorio = repositorioDoble([
      yaEnCatalogo('kilogramo', 'kg'),
      yaEnCatalogo('litro', 'l'),
      yaEnCatalogo('unidad', 'u'),
    ])

    const resultado = await createSeedStarterUnits({ repository: repositorio })()

    expect(resultado.createdUnits).toEqual(['gramo', 'mililitro'])
    expect(repositorio.creados()).toEqual(['gramo', 'mililitro'])
    expect(repositorio.catalogo).toHaveLength(5)
  })

  it('no actualiza ninguna unidad existente: solo hay createUnit de las que faltaban', async () => {
    // R26: «NO DEBE modificar ninguna unidad existente — ni su nombre, ni su simbolo, ni
    // sus marcas de tiempo». Dos afirmaciones a la vez: el REGISTRO no tiene mas escrituras
    // que los dos `createUnit`, y la INSTANTANEA de las tres presentes es identica despues
    // de la corrida (sello incluido, que hace de marca de tiempo).
    const presentes = [
      yaEnCatalogo('kilogramo', 'KILOS', 'sello-1'),
      yaEnCatalogo('litro', null, 'sello-2'),
      yaEnCatalogo('unidad', 'u', 'sello-3'),
    ]
    const repositorio = repositorioDoble(presentes)
    const antes = repositorio.instantanea()

    await createSeedStarterUnits({ repository: repositorio })()

    // Cero escrituras sobre las presentes: ni un `createUnit` con su clave.
    const escrituras = repositorio.escrituras()
    expect(escrituras.map((entrada) => entrada.op)).toEqual(['createUnit', 'createUnit'])
    for (const entrada of escrituras) {
      if (entrada.op !== 'createUnit') continue
      expect(['gramo', 'mililitro']).toContain(entrada.nameNormalized)
    }
    // Y ninguna llamada a un metodo de actualizacion, que ni siquiera existe en el puerto.
    expect(
      repositorio.registro.filter((entrada) =>
        ['update', 'updateMany', 'upsert'].includes(entrada.op),
      ),
    ).toEqual([])

    // Las tres filas anteriores siguen exactamente como estaban.
    const despues = repositorio.instantanea()
    for (const fila of antes) {
      expect(despues.find((otra) => otra.nameNormalized === fila.nameNormalized)).toEqual(fila)
    }
  })

  it('dos corridas seguidas dejan el mismo estado: la segunda no crea nada', async () => {
    // R26: «ejecutarlo dos veces seguidas DEBE dejar exactamente el mismo estado que
    // ejecutarlo una». Es la definicion operativa de idempotente, y el motivo por el que el
    // seed se encadena al `build` (QC-6).
    const repositorio = repositorioDoble()
    const seed = createSeedStarterUnits({ repository: repositorio })

    const primera = await seed()
    const trasLaPrimera = repositorio.instantanea()
    const escriturasTrasLaPrimera = repositorio.escrituras().length

    const segunda = await seed()

    expect(primera.createdUnits).toHaveLength(5)
    expect(segunda.createdUnits).toEqual([])
    expect(repositorio.instantanea()).toEqual(trasLaPrimera)
    expect(repositorio.escrituras()).toHaveLength(escriturasTrasLaPrimera)

    // Una tercera tampoco mueve nada.
    await seed()
    expect(repositorio.instantanea()).toEqual(trasLaPrimera)
  })

  it('una unidad renombrada a mano no se duplica y no se toca', async () => {
    // R26 en su forma exacta (`design.md > 6.2`): «si alguien renombro "litro" a "Litro",
    // el seed NO crea un duplicado y NO lo toca». La comparacion va por `name_normalized`,
    // no por `name`; el simbolo cambiado a mano tampoco se pisa —eso es justo lo que haria
    // un `upsert`—.
    const renombrada: UnidadGuardada = {
      name: 'Litro',
      nameNormalized: normalizeUnitName('Litro'),
      symbol: 'lt',
      sello: 'editada-a-mano',
    }
    expect(renombrada.nameNormalized).toBe(normalizeUnitName('litro'))

    const repositorio = repositorioDoble([renombrada])
    const resultado = await createSeedStarterUnits({ repository: repositorio })()

    expect(resultado.createdUnits).not.toContain('litro')
    expect(resultado.createdUnits).toEqual(['kilogramo', 'gramo', 'mililitro', 'unidad'])
    expect(repositorio.catalogo).toHaveLength(5)
    expect(repositorio.catalogo.filter((fila) => fila.nameNormalized === 'litro')).toEqual([
      renombrada,
    ])
  })
})
