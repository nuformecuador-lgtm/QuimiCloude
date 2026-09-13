// Guardia: TODO archivo de `tests/integration/**` declara COMO se aisla, en el censo
// `tests/integration/aislamiento.json` (QC-77, R18-R21).
//
// Recorre ARCHIVOS, no el grafo de imports —por eso vive en `tests/guards/` y entra sola en
// `pnpm run test:guardias`, o sea en `./init.sh --rapido` (R21)—. El grafo nunca seleccionaria
// esta comprobacion: el censo es un JSON que no importa nadie, asi que `vitest related` no lo
// relaciona con ningun cambio. Mismo patron y mismos helpers que
// `tests/guards/guard-editor-aislado.test.ts`, incluida la normalizacion de los separadores de
// ruta de Windows (el censo se escribe SIEMPRE con `/` para ser identico en las dos plataformas).
//
// POR QUE UN CENSO APARTE Y NO DEDUCIRLO DEL CODIGO. La idea obvia —un `grep` de
// `inRolledBackTransaction|RollbackSignal`— esta medida y es FALSA: devuelve 19 archivos y la
// verdad son 18, porque `identity/work-group-crud.int.test.ts` usa ese patron para un sondeo
// suelto del 23505 y el resto de sus casos committea. Una guardia que cuenta mal desde el primer
// dia entrena a todos a ignorarla. Ver `design.md > 0` (observacion del ancla 2) y `> 9, A7`.
//
// LO QUE ESTA GUARDIA **NO** COMPRUEBA, y hay que decirlo en voz alta: que el modo declarado sea
// CIERTO. Un archivo puede declararse `transaccion` y committear, y aqui saldria verde.
// Comprobarlo de verdad exigiria leer el codigo del test, que es justo lo que el ancla 2
// demuestra que no es fiable. Lo que esta guardia compra es mas modesto y aun asi vale la pena:
// que **nadie anada un archivo de integracion sin haber pensado como se aisla**.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const RAIZ_INTEGRACION = 'tests/integration'
const CENSO = `${RAIZ_INTEGRACION}/aislamiento.json`
const DESIGN = 'specs/QC-77-aislamiento-de-la-base-en-tests-de-integracion/design.md'
const MODOS = ['transaccion', 'commit'] as const

/**
 * El sufijo que define «archivo de test de integracion», y **no** es `.test.ts` a secas.
 *
 * Es deliberado: `tests/integration/` aloja tambien la fontaneria del proyecto de integracion
 * —`_global-setup.ts` y `_setup.ts` (QC-77 T7)—, que NO son suites, no los recoge el `include`
 * de Vitest y por tanto tampoco deben exigirse en el censo. Quedan fuera POR CONSTRUCCION al
 * filtrar por `.int.test.ts`, no por una lista de excepciones que habria que ir manteniendo.
 * Si algun dia se anade una suite con otro sufijo, esta constante es el sitio donde se dice.
 */
const SUFIJO_DE_SUITE = '.int.test.ts'

/** Carpetas que nunca se recorren: no son fuente del repo. */
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
}

/**
 * Los archivos de suite bajo `tests/integration/`, en rutas relativas a ESA carpeta y con `/`
 * siempre: es la forma exacta en la que se escriben en el censo, en Windows y en Linux.
 */
function suitesDeIntegracion(): string[] {
  const encontradas: string[] = []
  const base = join(RAIZ, RAIZ_INTEGRACION)

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name)
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        recorrer(completa)
        continue
      }
      if (entrada.name.endsWith(SUFIJO_DE_SUITE)) {
        encontradas.push(relative(base, completa).split('\\').join('/'))
      }
    }
  }

  recorrer(base)
  return encontradas.sort()
}

type EntradaDeCommit = { archivo?: unknown; motivo?: unknown; desde?: unknown }
type Censo = { transaccion?: unknown; commit?: unknown }

function censo(): Censo {
  return JSON.parse(leer(CENSO)) as Censo
}

/** Las entradas de `commit` tal cual estan escritas, sin dar por hecho que estan bien formadas. */
function entradasDeCommit(): EntradaDeCommit[] {
  const { commit } = censo()
  return Array.isArray(commit) ? (commit as EntradaDeCommit[]) : []
}

/** Las de `transaccion`: rutas sueltas, sin motivo (el mecanismo se explica en el propio test). */
function entradasDeTransaccion(): string[] {
  const { transaccion } = censo()
  return Array.isArray(transaccion) ? (transaccion as unknown[]).filter((r): r is string => typeof r === 'string') : []
}

/** Todo lo declarado, en los dos modos, en el orden en que se lee. */
function declarados(): string[] {
  return [
    ...entradasDeTransaccion(),
    ...entradasDeCommit().map((entrada) => (typeof entrada.archivo === 'string' ? entrada.archivo : '(entrada sin `archivo`)')),
  ]
}

const COMO_DECLARAR =
  `Declaralo en ${CENSO}, en uno de los dos modos admitidos:\n` +
  '  - "transaccion": el archivo se aisla el solo, con una transaccion interactiva que termina ' +
  'en ROLLBACK (SAVEPOINT para lo que se espera que falle). Es el patron heredado de QC-4 y ' +
  'ampliado en QC-47; va como una cadena suelta en el array `transaccion`.\n' +
  '  - "commit": el archivo escribe de verdad (o no escribe nada) y se limpia el solo. Va como ' +
  'un objeto en el array `commit` con `archivo`, `motivo` y `desde`.\n' +
  `El por que de todo esto esta en ${DESIGN} > 8.`

describe(`guardia: cada test de integracion declara como se aisla (${CENSO}, R18-R21)`, () => {
  it('el recorrido encuentra archivos de integracion y no se ha quedado vacio', () => {
    // Sin esto, un fallo del recorrido —la carpeta renombrada, el sufijo cambiado, un
    // `readdirSync` que devuelve nada— dejaria los casos de abajo en verde por vacuidad: la
    // guardia mas peligrosa es la que pasa porque no mira nada.
    const suites = suitesDeIntegracion()

    expect(
      suites.length,
      `el recorrido de ${RAIZ_INTEGRACION}/**/*${SUFIJO_DE_SUITE} deberia encontrar decenas de ` +
        `archivos (eran 41 el 2026-09-12) y encontro ${suites.length}. Si encontro pocos o ` +
        'ninguno, la carpeta o el sufijo cambiaron y esta guardia esta pasando en vacio.',
    ).toBeGreaterThan(20)

    expect(existsSync(join(RAIZ, CENSO)), `${CENSO} no existe: sin censo no hay nada que comparar`).toBe(true)

    // Y la fontaneria del proyecto (`_global-setup.ts`, `_setup.ts`) NO entra en el recorrido:
    // no son suites. Si algun dia lo hicieran, el censo empezaria a pedir entradas para ellas.
    const coladas = suites.filter((ruta) => ruta.split('/').pop()?.startsWith('_'))
    expect(
      coladas,
      `el recorrido recogio archivos de fontaneria (${coladas.join(', ')}), que no son suites y ` +
        `no deben exigirse en el censo. El filtro es el sufijo ${SUFIJO_DE_SUITE}.`,
    ).toEqual([])
  })

  it('ningun archivo del arbol se queda fuera del censo (R19)', () => {
    const declarado = new Set(declarados())
    const sinDeclarar = suitesDeIntegracion().filter((ruta) => !declarado.has(ruta)).sort()

    expect(
      sinDeclarar,
      `Archivos bajo ${RAIZ_INTEGRACION}/ que NO estan en el censo:\n` +
        `${sinDeclarar.map((ruta) => `  - ${ruta}`).join('\n')}\n` +
        `${COMO_DECLARAR}\n` +
        'Las rutas van relativas a ' +
        `${RAIZ_INTEGRACION}/ y SIEMPRE con "/", tambien desde Windows.`,
    ).toEqual([])
  })

  it('ninguna entrada del censo nombra un archivo que ya no existe (R20)', () => {
    // Aqui SI se falla, a diferencia del aviso de `tests/baseline-rojos.json`. Alli la razon de
    // avisar y no fallar es que un archivo que no se ejecuto no dice nada sobre si sigue en
    // rojo. Aqui la verdad es el ARBOL DE FICHEROS: se lee entera, siempre, y no depende de que
    // nada corra. Una entrada huerfana es un renombrado a medias o un borrado sin limpiar.
    const enElArbol = new Set(suitesDeIntegracion())
    const huerfanas = declarados().filter((ruta) => !enElArbol.has(ruta)).sort()

    expect(
      huerfanas,
      `Entradas de ${CENSO} cuyo archivo ya no existe:\n` +
        `${huerfanas.map((ruta) => `  - ${ruta}`).join('\n')}\n` +
        'Si el archivo se renombro, renombra tambien su entrada; si se borro, borrala. Un censo ' +
        'con entradas huerfanas deja de ser un inventario y pasa a ser una lista de deseos.',
    ).toEqual([])
  })

  it('toda entrada de `commit` dice por que (`motivo`) (R18)', () => {
    const sinMotivo = entradasDeCommit()
      .filter((entrada) => typeof entrada.motivo !== 'string' || entrada.motivo.trim() === '')
      .map((entrada) => (typeof entrada.archivo === 'string' ? entrada.archivo : JSON.stringify(entrada)))
      .sort()

    expect(
      sinMotivo,
      `Entradas de \`commit\` en ${CENSO} sin \`motivo\`:\n` +
        `${sinMotivo.map((ruta) => `  - ${ruta}`).join('\n')}\n` +
        'Un archivo que no se aisla por si mismo tiene que decir POR QUE (normalmente: su ' +
        'adaptador habla con el cliente Prisma global, asi que la transaccion del test no lo ' +
        'envolveria). Sin ese campo el censo se vuelve el sitio donde se mete lo que estorba, ' +
        'que es la leccion escrita de tests/baseline-rojos.json.',
    ).toEqual([])
  })

  it('toda entrada de `commit` dice desde cuando (`desde`) (R18)', () => {
    const sinDesde = entradasDeCommit()
      .filter((entrada) => typeof entrada.desde !== 'string' || entrada.desde.trim() === '')
      .map((entrada) => (typeof entrada.archivo === 'string' ? entrada.archivo : JSON.stringify(entrada)))
      .sort()

    expect(
      sinDesde,
      `Entradas de \`commit\` en ${CENSO} sin \`desde\`:\n` +
        `${sinDesde.map((ruta) => `  - ${ruta}`).join('\n')}\n` +
        'La fecha es lo que permite ver, dentro de un ano, si la lista crecio o se quedo quieta. ' +
        'Mismo campo obligatorio que en tests/baseline-rojos.json, y por el mismo motivo.',
    ).toEqual([])
  })

  it('el censo no declara dos veces el mismo archivo ni usa otro modo que los dos admitidos', () => {
    // Un archivo en los dos arrays a la vez pasaria los casos de arriba (esta declarado, y
    // existe) y sin embargo el censo no diria como se aisla, sino dos cosas incompatibles.
    const todos = declarados()
    const repetidos = [...new Set(todos.filter((ruta, i) => todos.indexOf(ruta) !== i))].sort()

    expect(
      repetidos,
      `Archivos declarados mas de una vez en ${CENSO}: ${repetidos.join(', ')}. ` +
        'Cada archivo se aisla de UNA forma; dos declaraciones no son mas informacion, son una ' +
        'contradiccion.',
    ).toEqual([])

    const modosPresentes = Object.keys(censo()).filter((clave) => !clave.startsWith('_'))
    expect(
      modosPresentes.sort(),
      `Las claves de modo de ${CENSO} son exactamente ${MODOS.join(' y ')} (las que empiezan por ` +
        '"_" son notas y no cuentan). Encontradas: ' +
        `${modosPresentes.join(', ')}. Anadir un modo nuevo es una conversacion sobre ${DESIGN} > 8, ` +
        'no una clave mas en un JSON.',
    ).toEqual([...MODOS].sort())
  })
})
