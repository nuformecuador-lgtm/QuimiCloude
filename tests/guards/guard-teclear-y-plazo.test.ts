// Guardia de QC-58: las DOS mitades del arreglo de los flakes de saturacion siguen en pie.
//
//   1. El PLAZO: los tres proyectos de Vitest declaran `testTimeout >= 15000` (R1, R2).
//   2. La FORMA DE TECLEAR: nadie abre su propia sesion (`userEvent.setup(`) NI teclea con la
//      API directa (`userEvent.click(...)`, que no hereda `delay: null`) fuera de la
//      definicion compartida y de las excepciones declaradas (R6, R7).
//
// Vive en `tests/guards/` a proposito. `./init.sh --rapido` selecciona por GRAFO DE IMPORTS, y
// ningun grafo llega ni a `vitest.config.mts` ni a un archivo de test que nadie importa: sin
// esta guardia las dos mitades se podrian deshacer sin que el gate dijera nada. Es el agujero
// que describe `docs/verification.md > Las guardias van SIEMPRE`.
//
// Patron, helpers de lectura y normalizado de separadores de Windows: copiados de
// `tests/guards/guard-editor-aislado.test.ts`.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// El especificador dice `.mjs` y el archivo del disco es `vitest.config.mts`: es la regla de
// TypeScript para modulos ES (un `.mts` se importa por su nombre de SALIDA). Escribir
// `@/vitest.config.mts` falla con TS5097 y escribirlo sin extension falla con TS2307. Vite
// resuelve el `.mts` real, asi que typecheck y ejecucion coinciden.
import configDeVitest from '@/vitest.config.mjs'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const SPEC = 'specs/QC-58-timeout-tests-ui-bajo-carga'

// ---------------------------------------------------------------------------------------
// 1. El plazo
// ---------------------------------------------------------------------------------------

/** El minimo que fijo la decision n.o 2 del humano (2026-09-07). */
const PLAZO_MINIMO = 15_000

/**
 * Los tres proyectos que existen hoy. Se comprueba que SIGAN existiendo, y no solo que los
 * que haya cumplan el plazo: si alguien renombra o borra uno, el recorrido de abajo se
 * quedaria satisfecho mirando menos cosas. Una guardia que se ablanda sola no es una guardia.
 */
const PROYECTOS_CONOCIDOS = ['ui', 'node', 'integration']

type ProyectoLeido = { nombre: string; plazo: unknown }

/**
 * Lee los proyectos de la CONFIGURACION, no del texto del archivo.
 *
 * Buscar 15000 con una expresion regular sobre el fuente daria verde con el numero escrito
 * dentro de un comentario, o escrito en la RAIZ de la config creyendo que los proyectos lo
 * heredan -que es justo el falso verde que design.md > 8c descarta-. Importar el modulo y
 * mirar el objeto resuelto no tiene esa salida.
 */
function proyectosDeclarados(): ProyectoLeido[] {
  const raiz = configDeVitest as { test?: { projects?: unknown[] } }
  const projects = raiz.test?.projects

  expect(
    Array.isArray(projects),
    'vitest.config.mts ya no declara test.projects como un array. Esta guardia lee la ' +
      'configuracion resuelta para comprobar el plazo por proyecto; si la forma de la config ' +
      'cambia, actualiza la guardia a la vez (' + SPEC + '/design.md > 3.1).',
  ).toBe(true)

  return (projects as unknown[]).map((proyecto, indice) => {
    const test = (proyecto as { test?: { name?: unknown; testTimeout?: unknown } }).test
    const nombre = typeof test?.name === 'string' ? test.name : '(proyecto sin nombre #' + indice + ')'
    return { nombre, plazo: test?.testTimeout }
  })
}

// ---------------------------------------------------------------------------------------
// 2. La forma de teclear
// ---------------------------------------------------------------------------------------

/** La llamada cruda que esta guardia persigue por todo tests/. Partida para no autodelatarse. */
const LLAMADA_CRUDA = 'userEvent' + '.setup('

/** El paquete. Partido por el mismo motivo que el literal de arriba. */
const PAQUETE = '@testing-library/user' + '-event'

/**
 * La OTRA via, la que la primera version de esta guardia no veia (review de QC-58, mayor 1).
 *
 * `userEvent.click(...)` sin `setup()` es la API DIRECTA, y no hereda `delay: null`: en
 * `user-event`, `defaultOptionsDirect` declara `delay: 0`, o sea que sigue intercalando el
 * `setTimeout(0)` entre eventos que esta ficha quita. Buscar solo `setup(` dejaba abierta
 * exactamente la puerta por la que R7 existe, con otro nombre: se colaron 5 llamadas en 2
 * archivos, uno de ellos tecleando de las dos formas a la vez.
 *
 * Se persiguen las dos senales, porque cada una tapa el agujero de la otra:
 *
 * - **Cualquier acceso `userEvent.<algo>(`**, que es lo que se escribe al usar la API directa
 *   (y lo que aparece si alguien copia una llamada suelta de otro repo sin importar nada).
 * - **Cualquier import de VALOR del paquete**, que caza tambien el renombrado
 *   (`import ue from ...; await ue.click(...)`), donde el nombre `userEvent` ya no aparece.
 *   `import type` SI pasa: un tipo no teclea.
 */
const ACCESO_DIRECTO = new RegExp('userEvent' + '\\.[A-Za-z]+\\s*\\(')
const DESDE_EL_PAQUETE = new RegExp('from\\s*[\'"]' + PAQUETE + '[\'"]', 'g')

/**
 * ¿La fuente importa el paquete como VALOR (y no solo como tipo)?
 *
 * Para cada `from '<paquete>'` se retrocede hasta el `import` que lo abre, en vez de casar
 * `import[\s\S]*?from '<paquete>'` de una pieza: esa forma perezosa empieza en el PRIMER
 * `import` del archivo y se traga los de en medio, con lo que un `import type` precedido de
 * otros imports se leeria como import de valor. Aqui hay archivos con y sin punto y coma, asi
 * que tampoco vale cortar por `;`.
 */
function importaElPaqueteComoValor(fuente: string): boolean {
  for (const encontrado of fuente.matchAll(DESDE_EL_PAQUETE)) {
    const inicio = fuente.lastIndexOf('import', encontrado.index)
    if (inicio === -1) continue
    if (!/^import\s+type\b/.test(fuente.slice(inicio, encontrado.index))) return true
  }
  return false
}

/**
 * Excepciones POR NOMBRE, nunca por patron amplio. Son tres y cada una tiene motivo:
 *
 * - `tests/helpers/user-event.ts`: es LA definicion compartida. Es el unico sitio del repo
 *   donde esta escrito como se teclea aqui (R5).
 * - `tests/unit/async-autocomplete.test.tsx`: excepcion deliberada de R8. Necesita retardo
 *   REAL entre teclas porque los 20 ms son el sujeto de la prueba -teclear mas rapido que una
 *   persona contra un rebote de 250 ms-. Su propio archivo lo explica y remite aqui: quitar
 *   ese retardo obliga a borrarlo de dos sitios, o sea a decidirlo.
 * - este mismo archivo: escribe el literal para poder compararlo. Misma excepcion
 *   autoconsciente que ya tiene `guard-editor-aislado`.
 */
const EXCEPCIONES_DECLARADAS = [
  'tests/guards/guard-teclear-y-plazo.test.ts',
  'tests/helpers/user-event.ts',
  'tests/unit/async-autocomplete.test.tsx',
]

const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])

/** Todos los .ts/.tsx bajo una carpeta, en rutas relativas a la raiz y con / siempre. */
function fuentesBajo(carpetaRelativa: string): string[] {
  const encontradas: string[] = []
  const BARRA_WINDOWS = String.fromCharCode(92)

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name)
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        recorrer(completa)
        continue
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relative(RAIZ, completa).split(BARRA_WINDOWS).join('/'))
      }
    }
  }

  recorrer(join(RAIZ, carpetaRelativa))
  return encontradas
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim()
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'))
    })
    .join('\n')
}

const TODOS_LOS_TESTS = fuentesBajo('tests').sort()

// ---------------------------------------------------------------------------------------

describe('guardia QC-58: el plazo de 15 s sigue declarado en los tres proyectos (R1/R2)', () => {
  it('cada proyecto de vitest.config.mts declara testTimeout >= 15000', () => {
    const flojos = proyectosDeclarados()
      .filter(({ plazo }) => typeof plazo !== 'number' || plazo < PLAZO_MINIMO)
      .map(
        ({ nombre, plazo }) =>
          nombre + ' (declara ' + (plazo === undefined ? 'nada' : String(plazo)) + ')',
      )

    expect(
      flojos,
      'Proyectos de Vitest sin el plazo de QC-58: ' +
        flojos.join(', ') +
        '.\n' +
        'Cada proyecto DEBE declarar testTimeout: ' +
        PLAZO_MINIMO +
        ' DENTRO de su propio bloque test, no en la raiz de la config: testTimeout es opcion ' +
        'por proyecto y confiar en la herencia es una apuesta que sale VERDE si la pierdes (el ' +
        'gate no distingue «el plazo se aplico» de «se ignoro y hoy ningun test tardo tanto»).\n' +
        'El numero no es al azar: los 5000 ms por defecto son literalmente el numero del error ' +
        'de los flakes de saturacion, medidos en ui Y en node. Lee ' +
        'docs/verification.md > Los flakes de saturacion antes de bajarlo.',
    ).toEqual([])
  })

  it('los tres proyectos conocidos siguen existiendo', () => {
    const declarados = proyectosDeclarados().map(({ nombre }) => nombre)
    const ausentes = PROYECTOS_CONOCIDOS.filter((nombre) => !declarados.includes(nombre))

    expect(
      ausentes,
      'Proyectos que QC-58 dejo cubiertos y ya no aparecen en vitest.config.mts: ' +
        ausentes.join(', ') +
        '. Declarados ahora: ' +
        (declarados.join(', ') || '(ninguno)') +
        '.\n' +
        'Sin este caso, el de arriba se quedaria satisfecho recorriendo menos proyectos: ' +
        'renombrar o borrar uno bastaria para que el plazo dejara de estar vigilado ahi. Si el ' +
        'reparto de proyectos cambia de verdad, cambia primero ' +
        SPEC +
        '/design.md > 1 y luego esta lista.',
    ).toEqual([])
  })
})

describe('guardia QC-58: solo hay una forma de teclear en este repo (R6/R7)', () => {
  it('el recorrido de tests/ no se ha quedado vacio', () => {
    // Sin esto, un recorrido roto dejaria el caso de abajo verde por vacuidad: la guardia mas
    // peligrosa es la que pasa porque no mira nada.
    expect(
      TODOS_LOS_TESTS.length,
      'el recorrido de tests/ deberia encontrar cientos de archivos; si encuentra pocos, la ' +
        'guardia esta pasando en vacio',
    ).toBeGreaterThan(100)

    for (const ruta of EXCEPCIONES_DECLARADAS) {
      expect(
        TODOS_LOS_TESTS.includes(ruta),
        ruta +
          ' figura como excepcion declarada pero el recorrido no lo encuentra: o se ha ' +
          'renombrado (actualiza esta lista y el motivo) o se ha borrado (quitalo de la lista).',
      ).toBe(true)
    }
  })

  it('ningun test abre su propia sesion de user-event fuera de la definicion compartida', () => {
    const infractores = TODOS_LOS_TESTS.filter(
      (ruta) =>
        !EXCEPCIONES_DECLARADAS.includes(ruta) &&
        fuenteSinComentarios(ruta).includes(LLAMADA_CRUDA),
    ).sort()

    expect(
      infractores,
      'Archivos de test que abren su propia sesion de user-event: ' +
        infractores.join(', ') +
        '.\n' +
        'QUE HACER: importa setupUser de tests/helpers/user-event y llama a setupUser() en vez ' +
        'de a ' +
        LLAMADA_CRUDA +
        ').\n' +
        'POR QUE: la sesion compartida teclea con delay: null, que quita la espera artificial ' +
        'entre eventos -no relaja NINGUNA comprobacion, ni siquiera la de pointer-events- y es ' +
        'la mitad de la cura de los flakes de saturacion. Antes de QC-58 habia 206 llamadas ' +
        'sueltas en 33 archivos y ningun sitio donde estuviera escrito como se teclea aqui: la ' +
        'numero 207 volvia a nacer mal sin que nadie lo decidiera.\n' +
        'SI DE VERDAD NECESITAS OTRA COSA (retardo real, porque el retardo ES lo que tu test ' +
        'prueba): anadelo a EXCEPCIONES_DECLARADAS de esta guardia CON SU MOTIVO escrito, y ' +
        'deja el motivo tambien en el propio archivo. El precedente es ' +
        'tests/unit/async-autocomplete.test.tsx (R8). Lo que no vale es colarla en silencio.',
    ).toEqual([])
  })

  it('ningun test teclea con la API directa de user-event, ni importa el paquete como valor', () => {
    const infractores = TODOS_LOS_TESTS.filter((ruta) => {
      if (EXCEPCIONES_DECLARADAS.includes(ruta)) return false
      const fuente = fuenteSinComentarios(ruta)
      return ACCESO_DIRECTO.test(fuente) || importaElPaqueteComoValor(fuente)
    }).sort()

    expect(
      infractores,
      'Archivos de test que usan user-event por fuera de la sesion compartida: ' +
        infractores.join(', ') +
        '.\n' +
        'QUE HACER: importa setupUser de tests/helpers/user-event, llama a setupUser() una vez ' +
        'por caso y teclea con esa sesion. Si solo necesitas el TIPO, usa ' +
        'ReturnType<typeof setupUser> o import type { UserEvent }: los tipos si pasan.\n' +
        'POR QUE: la API directa (userEvent' +
        '.click(...) sin setup()) NO hereda delay: null. En user-event, defaultOptionsDirect ' +
        'declara delay: 0, o sea que sigue intercalando el setTimeout(0) entre eventos que esta ' +
        'ficha quita: la mitad de la cura de los flakes de saturacion se pierde en silencio, y ' +
        'sale VERDE. Esta comprobacion existe porque la primera version de la guardia solo ' +
        'miraba ' +
        LLAMADA_CRUDA +
        '), y por el hueco se colaron 5 llamadas en 2 archivos -uno de ellos tecleando de las ' +
        'dos formas a la vez- (review de QC-58, mayor 1).\n' +
        'SI DE VERDAD NECESITAS OTRA COSA: se decide con el humano y se anade a ' +
        'EXCEPCIONES_DECLARADAS CON SU MOTIVO, como ' +
        'tests/unit/async-autocomplete.test.tsx (R8). Una deuda anotada en una bitacora NO es ' +
        'una excepcion aprobada.',
    ).toEqual([])
  })
})
