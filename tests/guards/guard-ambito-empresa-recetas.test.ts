// GUARDIA (QC-50 R14, T24) — el ambito de empresa de `recetas`, comprobado FUNCION POR FUNCION.
//
// Calcada de `guard-ambito-empresa-pedidos.test.ts` (QC-60 R18) y de
// `guard-ambito-empresa-inventario.test.ts` (QC-49 R13), y por el MISMO motivo, que es lo unico
// que justifica una guardia mas.
//
// POR QUE EXISTE. El ambito esta en la firma del puerto, asi que una LLAMADA que lo omita no
// compila: los cinco metodos de `RecipeRepository` exigen `scope: RecipeScope` al final de la
// firma y `RecipeCatalog.findRefsIncludingDeleted` exige `companyId: string`. Pero una
// IMPLEMENTACION que lo omita SI COMPILA. TypeScript admite asignar una funcion de MENOR aridad
// donde se espera una de mayor, y asi es exactamente como `lib/composition/index.ts` ata las
// funciones sueltas del adaptador driven a `RecipeRepository` y a `RecipeCatalog`:
//
//     interface Repo { findAliveById(id: string, scope: Scope): Promise<Row | null> }
//     async function findAliveById(id: string): Promise<Row | null> { ... }
//     const repo: Repo = { findAliveById }            // COMPILA, exit 0
//
// Verificado contra el `tsc` de este repo (QC-49 `design.md > 4.2`). Un `findFirst` nuevo sin
// ambito compila, se cablea y lee las recetas de TODAS las empresas.
//
// Una guardia POR ARCHIVO -«`recipe-prisma.ts` importa `./company-scope`»- no muerde: un metodo
// NUEVO que se olvide del ambito la pasa, porque el archivo sigue importando el punto unico por
// culpa de sus otras consultas. Esta es la que muerde con UNA sola funcion mal escrita. De cada
// funcion de persistencia del modulo comprueba LAS DOS MITADES:
//
//   1. que DECLARA el ambito: `scope: RecipeScope` en el repositorio, `companyId: string` en el
//      catalogo (el catalogo recibe una cadena y no el `RecipeScope`: ese tipo es interno del
//      modulo, y publicarlo por el barrel para que OTRO modulo lo construya acoplaria dos
//      modulos por un dato que ya es una cadena en los dos lados), y
//   2. que ese valor LLEGA de verdad hasta una envoltura de `./company-scope` -directamente, a
//      traves de un ayudante del mismo archivo al que se le pasa, o -patron unico de
//      `recipe-catalog-prisma.ts`- envuelto en un `RecipeScope` local que luego se le pasa a la
//      envoltura-. Declararlo y no usarlo seria la misma fuga con mejor cara.
//
// LAS LINEAS DE UNA RECETA (`recipe_lines`) NO LLEVAN AMBITO PROPIO, Y ESO NO ES UNA EXCEPCION:
// su empresa es la de la receta a la que pertenecen (asi lo dice `company-scope.ts`). Por eso
// `replaceAliveRecipe` recibe una comprobacion aparte, estructural, no de parametro: sus TRES
// pasos (el `updateMany` acotado, el `deleteMany` y los `upsert` de lineas) tienen que correr
// DENTRO de una unica `prisma.$transaction`, con el `updateMany` acotado corriendo PRIMERO y con
// salida temprana si `count === 0`, y las consultas de `recipe_lines` filtrando por el `id` YA
// VERIFICADO por ese `updateMany` -nunca por un ambito propio, porque no lo hay-.
//
// QC-172 (versiones de receta) anade tres funciones con la misma forma de riesgo y les da su
// comprobacion estructural al final del archivo: `replaceAliveRecipeWithPropagation` (escribe
// lineas de la original Y de sus versiones), `createRecipeVersion` (lee la original `FOR SHARE`
// en SQL crudo, donde el ambito no pasa por `recipeCompanyScope`) y `softDeleteAliveRecipe`
// (baja en cascada de las versiones).
//
// **SIN LISTA DE EXCEPCIONES.** Esta ficha ademas vacio la unica que quedaba en el repo
// (`findProductRefs` en `guard-ambito-empresa-inventario.test.ts`, QC-50 R29). No se crea aqui
// una nueva: toda funcion de persistencia de `recetas` que toque la base declara y usa su
// ambito, sin `SIN_AMBITO_POR_DECISION_APROBADA` ni equivalente. Si una funcion real no lo
// cumpliera, eso es un hallazgo que aprueba un humano en un spec, no una lista que escriba quien
// entrega el adaptador.
//
// TECNICA: barrido de TEXTO sobre el disco, como el resto de `tests/guards/`. No se importa
// ningun modulo ni se mira el grafo de imports: lo que se vigila es lo que esta ESCRITO, que es
// justo lo que el compilador no mira.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i += 1) {
    try {
      readFileSync(join(dir, 'package.json'), 'utf8')
      return dir
    } catch {
      dir = dirname(dir)
    }
  }
  throw new Error('no se encontro la raiz del repo')
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'recetas')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

/** El punto unico. Es el UNICO archivo de persistencia que puede leer `scope.companyId`. */
const PUNTO_UNICO = 'company-scope.ts'

/** Las dos formas en que una funcion de persistencia del modulo puede declarar el ambito. */
const FORMAS_DE_AMBITO = [
  { identificador: 'scope', declaracion: /\bscope\s*:\s*RecipeScope\b/ },
  { identificador: 'companyId', declaracion: /\bcompanyId\s*:\s*string\b/ },
] as const

type Identificador = (typeof FORMAS_DE_AMBITO)[number]['identificador']

// --- Lectura y troceado del texto -------------------------------------------------------------

/** Quita los comentarios: la prosa explica la regla y no puede contar como implementacion.
 *  Conserva la longitud del texto. */
function sinComentarios(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
}

/** Vacia el contenido de las cadenas y plantillas, para que ningun parentesis ni llave de dentro
 *  de un literal descuadre el conteo. Conserva las comillas y la longitud. */
function vaciarCadenas(source: string): string {
  const vaciar = (match: string): string =>
    match.charAt(0) + match.slice(1, -1).replace(/[^\n]/g, ' ') + match.charAt(match.length - 1)
  return source
    .replace(/'(?:\\.|[^'\\\n])*'/g, vaciar)
    .replace(/"(?:\\.|[^"\\\n])*"/g, vaciar)
    .replace(/`(?:\\.|[^`\\])*`/g, vaciar)
}

/** Indice del cierre que equilibra la apertura que hay en `open`. */
function cierreEquilibrado(source: string, open: number, abre: string, cierra: string): number {
  let nivel = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === abre) nivel += 1
    else if (source[i] === cierra) {
      nivel -= 1
      if (nivel === 0) return i
    }
  }
  return -1
}

type FuncionDeclarada = {
  readonly nombre: string
  readonly parametros: string
  /** Cuerpo SIN comentarios y SIN contenido de cadenas: para contar llaves y buscar llamadas. */
  readonly cuerpo: string
  /** El mismo cuerpo, sin comentarios pero CON cadenas: para leer literales como `'not_found'`. */
  readonly cuerpoConCadenas: string
  readonly inicio: number
  readonly fin: number
}

/**
 * Donde EMPIEZA el cuerpo: la primera llave que TERMINA LA LINEA despues de los parametros, que
 * es donde prettier deja siempre la del cuerpo y nunca la de un tipo en linea. Quedarse con la
 * llave de `Promise<{ id: string } | 'duplicate'>` daria por cuerpo un tipo sin ni una consulta y
 * la guardia pasaria en VERDE por el motivo equivocado.
 */
function inicioDelCuerpo(codigo: string, desde: number): number {
  for (let i = desde; i < codigo.length; i += 1) {
    if (codigo[i] !== '{') continue
    if (/^[ \t]*\r?\n/.test(codigo.slice(i + 1))) return i
  }
  return -1
}

/** Todas las `function` de nivel superior de un archivo, con sus parametros y su cuerpo. */
function funcionesDe(codigo: string, conCadenas: string): readonly FuncionDeclarada[] {
  const declaraciones = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm
  const funciones: FuncionDeclarada[] = []

  for (const match of codigo.matchAll(declaraciones)) {
    const abreParams = codigo.indexOf('(', match.index)
    const cierraParams = cierreEquilibrado(codigo, abreParams, '(', ')')
    if (cierraParams === -1) continue
    const abreCuerpo = inicioDelCuerpo(codigo, cierraParams)
    const cierraCuerpo = cierreEquilibrado(codigo, abreCuerpo, '{', '}')
    if (abreCuerpo === -1 || cierraCuerpo === -1) continue

    funciones.push({
      nombre: match[1] ?? '',
      parametros: codigo.slice(abreParams + 1, cierraParams),
      cuerpo: codigo.slice(abreCuerpo + 1, cierraCuerpo),
      cuerpoConCadenas: conCadenas.slice(abreCuerpo + 1, cierraCuerpo),
      inicio: match.index,
      fin: cierraCuerpo,
    })
  }

  return funciones
}

/** El ambito que DECLARA una funcion, o `null` si no declara ninguno. */
function ambitoDeclarado(funcion: FuncionDeclarada): Identificador | null {
  const forma = FORMAS_DE_AMBITO.find((f) => f.declaracion.test(funcion.parametros))
  return forma === undefined ? null : forma.identificador
}

/**
 * ¿Alguna llamada a `nombre` que hay en `cuerpo` recibe `identificador` entre sus argumentos,
 * directamente o a traves de una variable local cuya declaracion lo contiene?
 *
 * El segundo caso es el patron de `recipe-catalog-prisma.ts`: `findRefsIncludingDeleted` declara
 * `companyId: string` y lo ENVUELVE en un `RecipeScope` local (`const scope: RecipeScope = {
 * companyId };`) antes de pasarselo a `recipeCompanyScope(scope)`. La llamada en si no menciona
 * `companyId`, asi que hace falta seguir el rastro un salto: si `scope` se declaro con
 * `companyId` en su lado derecho, y `scope` es lo que se le pasa a la envoltura, el ambito SI
 * llego.
 */
function lePasaElAmbito(cuerpo: string, nombre: string, identificador: Identificador): boolean {
  const llamada = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
  const valor = new RegExp(`\\b${identificador}\\b`)

  // Variables locales cuyo lado derecho contiene el identificador, p. ej.
  // `const scope: RecipeScope = { companyId };`.
  const variablesConAmbito = new Set<string>()
  for (const m of cuerpo.matchAll(/\b(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*([^;]+);/g)) {
    const nombreVar = m[1] ?? ''
    const derecha = m[2] ?? ''
    if (valor.test(derecha)) variablesConAmbito.add(nombreVar)
  }

  for (const match of cuerpo.matchAll(llamada)) {
    const abre = cuerpo.indexOf('(', match.index)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    if (cierra === -1) continue
    const argumentos = cuerpo.slice(abre + 1, cierra)
    if (valor.test(argumentos)) return true
    for (const variable of variablesConAmbito) {
      if (new RegExp(`\\b${variable}\\b`).test(argumentos)) return true
    }
  }
  return false
}

/** Las envolturas que el archivo importa del punto unico `./company-scope`. */
function envolturasImportadas(source: string): readonly string[] {
  const importacion = /import\s*\{([^}]*)\}\s*from\s*'\.\/company-scope'/.exec(source)
  if (importacion === null) return []
  return (importacion[1] ?? '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0)
}

/**
 * «Toca la base» = ejecuta algo por el cliente (`prisma.`) o por el cliente de transaccion
 * (`tx.`): un modelo (`prisma.recipe.findFirst(`) o un metodo crudo (`prisma.$transaction(`).
 */
const TOCA_LA_BASE = /\b(?:prisma|tx)\s*\.\s*(?:\$\w+|\w+\s*\.\s*\w+)\s*[(<]/g
const tocaLaBase = (cuerpo: string): boolean => new RegExp(TOCA_LA_BASE.source).test(cuerpo)

/** Lectura SUELTA de la empresa del ambito, fuera del punto unico. */
const LECTURA_SUELTA: readonly RegExp[] = [
  /\bscope\s*\??\.\s*companyId\b/,
  /\bscope\s*\[/,
  /\{[^{}]*\bcompanyId\b[^{}]*\}\s*=\s*scope\b/,
]

type ArchivoAnalizado = {
  readonly archivo: string
  readonly codigo: string
  readonly funciones: readonly FuncionDeclarada[]
  readonly envolturas: readonly string[]
  readonly consumidoras: ReadonlySet<string>
}

function analizar(archivo: string): ArchivoAnalizado {
  const source = readFileSync(join(PERSISTENCE_ROOT, archivo), 'utf8')
  const conCadenas = sinComentarios(source)
  const codigo = vaciarCadenas(conCadenas)
  const funciones = funcionesDe(codigo, conCadenas)
  const envolturas = envolturasImportadas(source)

  // Semilla: las envolturas del punto unico. Cierre transitivo: una funcion CONSUME el ambito si
  // le pasa SU PROPIO ambito declarado a algo que ya lo consume (directamente o via variable
  // local, ver `lePasaElAmbito`).
  const consumidoras = new Set<string>(envolturas)
  let crecio = true
  while (crecio) {
    crecio = false
    for (const funcion of funciones) {
      if (consumidoras.has(funcion.nombre)) continue
      const ambito = ambitoDeclarado(funcion)
      if (ambito === null) continue
      for (const consumidora of consumidoras) {
        if (lePasaElAmbito(funcion.cuerpo, consumidora, ambito)) {
          consumidoras.add(funcion.nombre)
          crecio = true
          break
        }
      }
    }
  }

  return { archivo, codigo, funciones, envolturas, consumidoras }
}

// --- Los dos puertos y su cableado --------------------------------------------------------------

/** El cuerpo `{ … }` de `export interface <interfaz>`, ya sin comentarios ni cadenas. */
function cuerpoDeLaInterfaz(ruta: string, interfaz: string): string {
  const source = vaciarCadenas(sinComentarios(readFileSync(ruta, 'utf8')))
  const inicio = source.indexOf(`export interface ${interfaz} {`)
  expect(inicio, `no se encontro la interfaz ${interfaz} en ${ruta}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  return source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))
}

/** Metodo -> sus parametros, tal como los declara la interfaz. */
function metodosDeLaInterfaz(ruta: string, interfaz: string): ReadonlyMap<string, string> {
  const cuerpo = cuerpoDeLaInterfaz(ruta, interfaz)
  const metodos = new Map<string, string>()
  for (const match of cuerpo.matchAll(/^\s{2}(\w+)\s*\(/gm)) {
    const abre = cuerpo.indexOf('(', match.index)
    metodos.set(match[1] ?? '', cuerpo.slice(abre + 1, cierreEquilibrado(cuerpo, abre, '(', ')')))
  }
  return metodos
}

/** Trocea un texto por sus comas de NIVEL CERO (fuera de parentesis, llaves y corchetes). */
function porComasDeNivelCero(texto: string): readonly string[] {
  const trozos: string[] = []
  let nivel = 0
  let actual = ''
  for (const caracter of texto) {
    if ('({['.includes(caracter)) nivel += 1
    if (')}]'.includes(caracter)) nivel -= 1
    if (caracter === ',' && nivel === 0) {
      trozos.push(actual)
      actual = ''
      continue
    }
    actual += caracter
  }
  trozos.push(actual)
  return trozos.map((trozo) => trozo.trim()).filter((trozo) => trozo.length > 0)
}

/**
 * El objeto que `lib/composition` ata al puerto: `{ metodoDelPuerto -> funcionDelAdaptador }`.
 * Se trocea por COMAS y no por lineas: `recipeCatalog` esta escrito en UNA sola linea
 * (`{ findRefsIncludingDeleted: findRecipeRefsIncludingDeleted }`) mientras que
 * `recipeRepository` va uno por linea; el troceo por comas de nivel cero sirve para los dos
 * formatos sin distinguirlos.
 */
function cableadoDe(constante: string, interfaz: string): ReadonlyMap<string, string> {
  const ruta = join(repoRoot, 'lib', 'composition', 'index.ts')
  const source = vaciarCadenas(sinComentarios(readFileSync(ruta, 'utf8')))
  const inicio = source.indexOf(`const ${constante}: ${interfaz} = {`)
  expect(inicio, `lib/composition no ata ${constante}: ${interfaz}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  const cuerpo = source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))

  const cableado = new Map<string, string>()
  for (const entrada of porComasDeNivelCero(cuerpo)) {
    const conNombre = /^(\w+)\s*:\s*(\w+)$/.exec(entrada)
    if (conNombre !== null) {
      cableado.set(conNombre[1] ?? '', conNombre[2] ?? '')
      continue
    }
    const abreviado = /^(\w+)$/.exec(entrada)
    if (abreviado !== null) {
      cableado.set(abreviado[1] ?? '', abreviado[1] ?? '')
      continue
    }
    // Una entrada que no es `metodo: funcion` ni `metodo` -una lambda en linea, un `bind`, un
    // spread- no se puede seguir hasta una funcion del adaptador. Se registra tal cual para que
    // el test la NOMBRE en vez de ignorarla en silencio.
    cableado.set(entrada, '')
  }
  return cableado
}

const PUERTOS = [
  {
    nombre: 'RecipeRepository',
    ruta: join(MODULE_ROOT, 'ports', 'recipe-repository.ts'),
    constante: 'recipeRepository',
    adaptador: 'recipe-prisma.ts',
    ambito: 'scope',
    literal: 'scope: RecipeScope',
  },
  {
    nombre: 'RecipeCatalog',
    ruta: join(MODULE_ROOT, 'domain', 'recipe-catalog.ts'),
    constante: 'recipeCatalog',
    adaptador: 'recipe-catalog-prisma.ts',
    ambito: 'companyId',
    literal: 'companyId: string',
  },
] as const

describe('QC-50 R14 — el punto unico es de verdad UNA definicion', () => {
  // Toda la guardia se apoya en que «llegar hasta una envoltura de `./company-scope`» significa
  // «filtrar por empresa». Eso solo es cierto si las envolturas DELEGAN en la definicion unica y
  // esa definicion es la unica lectura de `scope.companyId` del modulo.
  it('company-scope.ts: `companyScope` es privada, es la unica lectura del ambito y las dos envolturas delegan en ella', () => {
    const analizado = analizar(PUNTO_UNICO)
    const exportadas = analizado.funciones.filter((f) =>
      new RegExp(`^export\\s+function\\s+${f.nombre}\\b`, 'm').test(analizado.codigo),
    )
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      'companyScopeColumns',
      'recipeCompanyScope',
    ])

    for (const envoltura of exportadas) {
      expect(
        envoltura.cuerpo.trim(),
        `${envoltura.nombre} tiene que delegar en \`companyScope\` y en nada mas: una segunda definicion de «de la empresa» es exactamente lo que R14 prohibe`,
      ).toMatch(/^return\s+companyScope\s*\(\s*scope\s*\)\s*;?$/)
    }

    const privada = analizado.funciones.find((f) => f.nombre === 'companyScope')
    expect(privada, 'company-scope.ts tiene que declarar la funcion `companyScope`').toBeTruthy()
    expect(analizado.codigo, '`companyScope` no se exporta').not.toMatch(
      /export\s+function\s+companyScope\b/,
    )

    const lecturas = [...analizado.codigo.matchAll(/\bscope\s*\.\s*companyId\b/g)]
    expect(lecturas, 'el punto unico lee `scope.companyId` UNA sola vez').toHaveLength(1)
    const posicion = lecturas[0]?.index ?? -1
    expect(
      privada !== undefined && posicion > privada.inicio && posicion < privada.fin,
      'la unica lectura de `scope.companyId` vive dentro de `companyScope`',
    ).toBe(true)
  })
})

describe('QC-50 R14 — cada metodo de los dos puertos declara Y consume el ambito de empresa', () => {
  for (const puerto of PUERTOS) {
    const metodos = metodosDeLaInterfaz(puerto.ruta, puerto.nombre)
    const cableado = cableadoDe(puerto.constante, puerto.nombre)
    const adaptador = analizar(puerto.adaptador)
    const forma = FORMAS_DE_AMBITO.find((f) => f.identificador === puerto.ambito)

    it(`${puerto.nombre}: los ${String(metodos.size)} metodos estan cableados, con nombre, y ninguno se queda fuera`, () => {
      // Sin esto, un metodo NUEVO del puerto podria no aparecer en el barrido de abajo y la
      // guardia lo ignoraria en silencio, que es justo el fallo que viene a cerrar.
      expect(metodos.size, `${puerto.nombre} deberia declarar metodos`).toBeGreaterThan(0)
      expect([...cableado.keys()].sort()).toEqual([...metodos.keys()].sort())
      for (const [metodo, implementacion] of cableado) {
        expect(
          implementacion,
          `${puerto.constante}.${metodo} no esta cableado a una funcion con nombre del adaptador: la guardia no puede seguir una lambda, un bind ni un spread`,
        ).toMatch(/^\w+$/)
      }
    })

    it(`${puerto.nombre}: el propio puerto EXIGE \`${puerto.literal}\` en la firma de cada metodo`, () => {
      // La mitad que SI cierra el compilador, pero solo mientras la firma la traiga. Se ancla
      // aqui para que quitarla del puerto no deje la otra mitad vigilando una firma que ya no la
      // pide.
      for (const [metodo, parametros] of metodos) {
        expect(
          forma?.declaracion.test(parametros),
          `${puerto.nombre}.${metodo} ya no exige \`${puerto.literal}\` en su firma (R14)`,
        ).toBe(true)
      }
    })

    for (const metodo of metodos.keys()) {
      it(`${puerto.nombre}.${metodo} declara \`${puerto.literal}\` y lo lleva hasta el punto unico`, () => {
        const implementacion = cableado.get(metodo)
        expect(implementacion, `${metodo} no esta cableado en lib/composition`).toBeTruthy()

        const funcion = adaptador.funciones.find((f) => f.nombre === implementacion)
        expect(
          funcion,
          `${puerto.adaptador} no declara la funcion ${implementacion ?? '?'} que cablea ${metodo}`,
        ).toBeTruthy()
        if (funcion === undefined) return

        // 1. LA DECLARA. El compilador NO lo exige: una implementacion de menor aridad satisface
        //    la firma del puerto. Esta linea es lo unico que lo impide.
        expect(
          ambitoDeclarado(funcion),
          `${puerto.adaptador}:${funcion.nombre} implementa ${puerto.nombre}.${metodo} SIN declarar \`${puerto.literal}\`. TypeScript lo acepta -una funcion de menos parametros satisface la firma-, asi que la unica forma de que no se cuele es esta (R14)`,
        ).toBe(puerto.ambito)

        // 2. LO USA. Declararlo y no usarlo seria la misma fuga con mejor cara: la llamada
        //    compilaria, el ambito viajaria hasta aqui y la consulta leeria las recetas de todas
        //    las empresas.
        expect(
          adaptador.consumidoras.has(funcion.nombre),
          `${puerto.adaptador}:${funcion.nombre} declara el ambito pero NO lo lleva hasta \`./company-scope\`: \`${puerto.ambito}\` tiene que acabar en una de sus envolturas (${adaptador.envolturas.join(', ') || 'el archivo no importa ninguna'}), aqui, en un ayudante de este mismo archivo al que se le pase, o -patron de \`recipe-catalog-prisma.ts\`- en un \`RecipeScope\` local construido con el (R14)`,
        ).toBe(true)
      })
    }
  }
})

describe('QC-50 R14 — ninguna consulta del modulo se queda sin ambito, y NO hay lista de excepciones', () => {
  /** Los archivos de persistencia del modulo, leidos del disco y no de una lista a mano. */
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia se barren todos, y el troceo VE las consultas', () => {
    expect(archivos).toContain('recipe-prisma.ts')
    expect(archivos).toContain('recipe-catalog-prisma.ts')
    expect(archivos).toContain(PUNTO_UNICO)

    // ANTI-PLACEBO del troceador. Si `funcionesDe` dejara de reconocer las declaraciones -o se
    // quedara con la llave de un tipo de retorno-, el barrido de abajo no encontraria NINGUNA
    // funcion que toque la base y pasaria en verde sin mirar nada.
    const conConsulta = (archivo: string): readonly string[] =>
      analizar(archivo)
        .funciones.filter((f) => tocaLaBase(f.cuerpo))
        .map((f) => f.nombre)

    expect(conConsulta('recipe-prisma.ts').length).toBeGreaterThanOrEqual(5)
    expect(conConsulta('recipe-prisma.ts')).toContain('replaceAliveRecipe')
    // QC-172: las tres funciones de versiones tienen que verse, o el barrido no las mira.
    expect(conConsulta('recipe-prisma.ts')).toEqual(
      expect.arrayContaining([
        'createRecipeVersion',
        'listAliveRecipeVersions',
        'replaceAliveRecipeWithPropagation',
        'softDeleteAliveRecipe',
      ]),
    )
    expect(conConsulta('recipe-catalog-prisma.ts').length).toBeGreaterThanOrEqual(1)
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito`, () => {
      const analizado = analizar(archivo)

      // Ninguna consulta vive FUERA de una `function` que el troceo vea. Sin esto, una consulta
      // escrita como `const leer = async () => prisma.recipe.findMany()` no entraria en el
      // barrido y la guardia la ignoraria sin decir nada.
      for (const match of analizado.codigo.matchAll(TOCA_LA_BASE)) {
        const dentro = analizado.funciones.some(
          (f) => match.index > f.inicio && match.index < f.fin,
        )
        const linea = analizado.codigo.slice(0, match.index).split('\n').length
        expect(
          dentro,
          `${archivo}:${String(linea)} ejecuta una consulta fuera de una \`function\` declarada: la guardia no puede comprobar su ambito. Escribela como \`function\` que declare \`scope: RecipeScope\``,
        ).toBe(true)
      }

      for (const funcion of analizado.funciones) {
        if (!tocaLaBase(funcion.cuerpo)) continue

        // Excepcion estructural, NO de parametro: `recipe_lines` no lleva ambito propio (su
        // empresa es la de su receta, ver la cabecera). En `replaceAliveRecipe` su ambito lo
        // verifica la transaccion, no un `scope` en cada `tx.recipeLine.*`. La comprobacion
        // estructural corre en el describe de abajo; aqui solo se la exime de la de parametro.
        // QC-172: `replaceAliveRecipeWithPropagation` tambien consulta `recipeLine`, pero NO se
        // exime: pasa el barrido de parametro Y tiene su propio describe estructural.
        if (funcion.nombre === 'replaceAliveRecipe') continue

        // SIN excepciones ademas de esa: aqui no hay ningun
        // `if (EXCEPCIONES.has(...)) continue` de decision aprobada.
        expect(
          ambitoDeclarado(funcion),
          `${archivo}:${funcion.nombre} consulta la base SIN declarar \`scope: RecipeScope\` (o \`companyId: string\` en el catalogo). \`recetas\` NO tiene ninguna consulta sin ambito aprobada (QC-50 R14)`,
        ).not.toBeNull()
        expect(
          analizado.consumidoras.has(funcion.nombre),
          `${archivo}:${funcion.nombre} declara el ambito pero no lo lleva hasta las envolturas de \`./company-scope\`: un ambito que no entra en el \`where\` (o en lo que se escribe) no filtra nada (R14)`,
        ).toBe(true)
      }
    })

    if (archivo !== PUNTO_UNICO) {
      it(`${archivo}: no lee la empresa del ambito a mano; sale SOLO de \`./company-scope\``, () => {
        const { codigo } = analizar(archivo)
        for (const patron of LECTURA_SUELTA) {
          const match = patron.exec(codigo)
          const linea = match === null ? 0 : codigo.slice(0, match.index).split('\n').length
          expect(
            match?.[0] ?? null,
            `${archivo}:${String(linea)} lee la empresa del ambito a mano. Eso es una segunda definicion de «de la empresa»: usa \`recipeCompanyScope(scope)\` en un \`where\` o \`companyScopeColumns(scope)\` en lo que se escribe (R14)`,
          ).toBeNull()
        }
      })
    }
  }
})

describe('QC-50 R14 — `replaceAliveRecipe`: las lineas de una receta no llevan ambito propio, y eso lo verifica la transaccion', () => {
  // `recipe_lines` no tiene `company_id` (`company-scope.ts`, cabecera de este archivo): su
  // empresa es la de la receta a la que pertenece, PROBADA por el `updateMany` acotado que corre
  // primero, en la MISMA transaccion. Esta descripcion se comprueba por ESTRUCTURA, no por un
  // parametro de ambito que `recipeLine` no tiene ni debe tener.
  const adaptador = analizar('recipe-prisma.ts')
  const funcion = adaptador.funciones.find((f) => f.nombre === 'replaceAliveRecipe')

  it('la funcion existe y toca la base (anti-placebo del resto de este describe)', () => {
    expect(funcion, 'recipe-prisma.ts deberia declarar replaceAliveRecipe').toBeTruthy()
    expect(funcion !== undefined && tocaLaBase(funcion.cuerpo)).toBe(true)
  })

  it('los tres pasos corren dentro de UNA sola `prisma.$transaction`', () => {
    if (funcion === undefined) return
    const transacciones = [...funcion.cuerpo.matchAll(/\bprisma\s*\.\s*\$transaction\s*\(/g)]
    expect(transacciones, 'replaceAliveRecipe tiene que envolver sus pasos en $transaction').toHaveLength(1)

    const abre = funcion.cuerpo.indexOf('(', transacciones[0]?.index ?? 0)
    const cierra = cierreEquilibrado(funcion.cuerpo, abre, '(', ')')
    expect(cierra, 'no se encontro el cierre de $transaction(...)').toBeGreaterThan(-1)

    // Todo acceso a `tx.` (o a `prisma.recipe`/`prisma.recipeLine` fuera de la envoltura de
    // arriba) tiene que vivir DENTRO de esos parentesis: si algo tocara `recipeLine` fuera de la
    // transaccion, correria sin la garantia que da el `updateMany` acotado de dentro.
    for (const match of funcion.cuerpo.matchAll(/\btx\s*\.\s*\w+\s*\.\s*\w+\s*\(/g)) {
      const indice = match.index
      expect(
        indice > abre && indice < cierra,
        `replaceAliveRecipe usa \`tx.\` fuera de los parentesis de $transaction en el indice ${String(indice)}`,
      ).toBe(true)
    }
    for (const match of funcion.cuerpo.matchAll(/\bprisma\s*\.\s*recipeLine\s*\./g)) {
      expect(
        false,
        `replaceAliveRecipe consulta \`prisma.recipeLine\` directamente (fuera de \`tx.\`), en el indice ${String(match.index)}: las lineas de una receta solo pueden tocarse dentro de la transaccion que ya verifico la receta (R14)`,
      ).toBe(true)
    }
  })

  it('el primer paso es un `updateMany` acotado con el ambito, con salida temprana si `count === 0`, ANTES de tocar `recipeLine`', () => {
    if (funcion === undefined) return
    const cuerpo = funcion.cuerpo

    const updateMany = /\btx\s*\.\s*recipe\s*\.\s*updateMany\s*\(/.exec(cuerpo)
    expect(updateMany, 'no se encontro `tx.recipe.updateMany(...)`').not.toBeNull()
    if (updateMany === null) return

    const abre = cuerpo.indexOf('(', updateMany.index)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    expect(cierra).toBeGreaterThan(-1)
    const argumentos = cuerpo.slice(abre + 1, cierra)
    expect(
      /\brecipeCompanyScope\s*\(\s*scope\s*\)/.test(argumentos),
      'el `updateMany` de `recipe` tiene que acotar su `where` con `recipeCompanyScope(scope)`: es el paso que prueba que la receta es de esta empresa (R14)',
    ).toBe(true)

    // Salida temprana: en algun punto DESPUES del updateMany y ANTES de la primera consulta a
    // `recipeLine`, el cuerpo comprueba `count === 0` y devuelve `'not_found'`.
    const primerRecipeLine = /\btx\s*\.\s*recipeLine\s*\./.exec(cuerpo)
    expect(primerRecipeLine, 'replaceAliveRecipe no consulta recipeLine en absoluto').not.toBeNull()
    if (primerRecipeLine === null) return

    expect(
      updateMany.index,
      'el updateMany de recipe corre DESPUES de tocar recipeLine: el orden tiene que ser al reves',
    ).toBeLessThan(primerRecipeLine.index)

    const entreMedias = cuerpo.slice(cierra, primerRecipeLine.index)
    // `entreMediasConCadenas` usa el cuerpo CON cadenas -misma longitud, mismos indices- porque
    // `cuerpo` tiene el contenido de los literales vaciado (`'not_found'` -> `'         '`) y ahi
    // el texto que se busca no existe.
    const entreMediasConCadenas = funcion.cuerpoConCadenas.slice(cierra, primerRecipeLine.index)
    expect(
      /count\s*===\s*0/.test(entreMedias),
      'entre el updateMany y la primera consulta a recipeLine no hay ninguna comprobacion de `count === 0`: sin salida temprana, un `updated.count === 0` seguiria a las lineas de otra receta (R14)',
    ).toBe(true)
    expect(
      /return\s+'not_found'/.test(entreMediasConCadenas),
      'la comprobacion de `count === 0` no devuelve `\'not_found\'` antes de tocar recipeLine (R14)',
    ).toBe(true)
  })

  it('el `deleteMany` y los `upsert` de lineas filtran por el `id` ya verificado por el `updateMany`, nunca por un ambito propio', () => {
    if (funcion === undefined) return
    const cuerpo = funcion.cuerpo

    const deleteMany = /\btx\s*\.\s*recipeLine\s*\.\s*deleteMany\s*\(/.exec(cuerpo)
    expect(deleteMany, 'no se encontro `tx.recipeLine.deleteMany(...)`').not.toBeNull()
    if (deleteMany !== null) {
      const abre = cuerpo.indexOf('(', deleteMany.index)
      const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
      const argumentos = cuerpo.slice(abre + 1, cierra)
      expect(
        /\brecipeId\s*:\s*id\b/.test(argumentos),
        'el `deleteMany` de `recipeLine` tiene que filtrar por `recipeId: id` -el identificador que ya probo el `updateMany`-, no por un ambito propio: `recipe_lines` no tiene `company_id` (R14)',
      ).toBe(true)
      expect(
        /\bcompanyId\b/.test(argumentos),
        'el `deleteMany` de `recipeLine` no deberia mencionar `companyId`: su ambito es el de su receta, ya probado antes',
      ).toBe(false)
    }

    const upsert = /\btx\s*\.\s*recipeLine\s*\.\s*upsert\s*\(/.exec(cuerpo)
    expect(upsert, 'no se encontro `tx.recipeLine.upsert(...)`').not.toBeNull()
    if (upsert !== null) {
      const abre = cuerpo.indexOf('(', upsert.index)
      const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
      const argumentos = cuerpo.slice(abre + 1, cierra)
      expect(
        /\brecipeId\s*:\s*id\b/.test(argumentos),
        'el `upsert` de `recipeLine` tiene que llevar `recipeId: id` -en su `where` compuesto y en su `create`- y no un ambito propio (R14)',
      ).toBe(true)
      expect(
        /\bcompanyId\b/.test(argumentos),
        'el `upsert` de `recipeLine` no deberia mencionar `companyId`: su ambito es el de su receta, ya probado antes',
      ).toBe(false)
    }
  })
})

// --- QC-172: versiones de receta ---------------------------------------------------------------
//
// Cada comprobacion es una funcion que devuelve la lista de violaciones de un TEXTO fuente, y no un
// `expect` directo sobre el disco, para poder mutar el fuente en memoria y ver que la comprobacion
// MUERE. Sin eso, un regex que no casara con nada dejaria la guardia en verde sin mirar.

const RECIPE_PRISMA_SOURCE = readFileSync(join(PERSISTENCE_ROOT, 'recipe-prisma.ts'), 'utf8')

function funcionDeTexto(source: string, nombre: string): FuncionDeclarada | undefined {
  const conCadenas = sinComentarios(source)
  return funcionesDe(vaciarCadenas(conCadenas), conCadenas).find((f) => f.nombre === nombre)
}

type Llamada = {
  readonly indice: number
  readonly abre: number
  readonly cierra: number
  /** Argumentos con las cadenas vaciadas. */
  readonly argumentos: string
  /** Los mismos argumentos con el contenido de las cadenas, para leer SQL crudo. */
  readonly argumentosConCadenas: string
}

/** Las llamadas que casan con `patron` (que termina en `(`), con sus argumentos. */
function llamadasA(funcion: FuncionDeclarada, patron: RegExp): readonly Llamada[] {
  const llamadas: Llamada[] = []
  for (const match of funcion.cuerpo.matchAll(new RegExp(patron.source, 'g'))) {
    const abre = match.index + match[0].length - 1
    const cierra = cierreEquilibrado(funcion.cuerpo, abre, '(', ')')
    if (cierra === -1) continue
    llamadas.push({
      indice: match.index,
      abre,
      cierra,
      argumentos: funcion.cuerpo.slice(abre + 1, cierra),
      argumentosConCadenas: funcion.cuerpoConCadenas.slice(abre + 1, cierra),
    })
  }
  return llamadas
}

const TRANSACCION = /\bprisma\s*\.\s*\$transaction\s*\(/
const UPDATE_MANY_DE_RECETA = /\btx\s*\.\s*recipe\s*\.\s*updateMany\s*\(/
const CONSULTA_DE_LINEAS = /\btx\s*\.\s*recipeLine\s*\.\s*\w+\s*\(/
const CON_AMBITO = /\.\.\.\s*recipeCompanyScope\s*\(\s*scope\s*\)/

/** Una sola `$transaction` y todo `tx.` dentro; ninguna consulta por el cliente global. */
function violacionesDeTransaccion(funcion: FuncionDeclarada): readonly string[] {
  const transacciones = llamadasA(funcion, TRANSACCION)
  if (transacciones.length !== 1) {
    return [
      `${funcion.nombre}: tiene que envolver todo en UNA prisma.$transaction (hay ${String(transacciones.length)})`,
    ]
  }
  const violaciones: string[] = []
  const { abre, cierra } = transacciones[0] as Llamada
  for (const match of funcion.cuerpo.matchAll(/\btx\s*\.\s*(?:\$\w+|\w+\s*\.\s*\w+)\s*[(<]/g)) {
    if (match.index < abre || match.index > cierra) {
      violaciones.push(`${funcion.nombre}: usa \`tx.\` fuera de la transaccion (indice ${String(match.index)})`)
    }
  }
  if (/\bprisma\s*\.\s*recipe(?:Line|Tool)?\s*\./.test(funcion.cuerpo)) {
    violaciones.push(`${funcion.nombre}: consulta por el cliente global (\`prisma.recipe*\`) en vez de por \`tx.\``)
  }
  return violaciones
}

/** `count === 0` y la salida (`return '<literal>'` o `throw`) entre dos posiciones del cuerpo. */
function saleSiNoHayFila(funcion: FuncionDeclarada, desde: number, hasta: number, salida: RegExp): boolean {
  return (
    /count\s*===\s*0/.test(funcion.cuerpo.slice(desde, hasta)) &&
    salida.test(funcion.cuerpoConCadenas.slice(desde, hasta))
  )
}

function violacionesDePropagacion(source: string): readonly string[] {
  const funcion = funcionDeTexto(source, 'replaceAliveRecipeWithPropagation')
  if (funcion === undefined) return ['recipe-prisma.ts no declara replaceAliveRecipeWithPropagation']
  const violaciones = [...violacionesDeTransaccion(funcion)]

  const updates = llamadasA(funcion, UPDATE_MANY_DE_RECETA)
  if (updates.length !== 2) {
    return [
      ...violaciones,
      `tiene que haber exactamente dos tx.recipe.updateMany (original y version), hay ${String(updates.length)}`,
    ]
  }
  const [original, version] = updates as [Llamada, Llamada]

  if (!CON_AMBITO.test(original.argumentos)) {
    violaciones.push('el updateMany de la ORIGINAL no acota con `...recipeCompanyScope(scope)`')
  }
  if (!/\bparentRecipeId\s*:\s*null\b/.test(original.argumentos)) {
    violaciones.push('el updateMany de la original no exige `parentRecipeId: null`: se podria propagar desde una version')
  }
  if (!CON_AMBITO.test(version.argumentos)) {
    violaciones.push(
      'el updateMany de la VERSION no acota con `...recipeCompanyScope(scope)`: se escribirian las lineas de una receta de otra empresa',
    )
  }
  if (!/\bid\s*:\s*versionId\b/.test(version.argumentos) || !/\bparentRecipeId\s*:\s*id\b/.test(version.argumentos)) {
    violaciones.push('el updateMany de la version tiene que filtrar por `id: versionId` y `parentRecipeId: id`')
  }
  if (!/for\s*\(\s*const\s+versionId\s+of\s+versionIds\s*\)/.test(funcion.cuerpo.slice(0, version.indice))) {
    violaciones.push('el updateMany de la version no esta dentro de `for (const versionId of versionIds)`')
  }

  const lineas = llamadasA(funcion, CONSULTA_DE_LINEAS)
  const primeraDeLaOriginal = lineas[0]
  if (primeraDeLaOriginal === undefined || primeraDeLaOriginal.indice < original.cierra) {
    violaciones.push('ninguna consulta de lineas puede ir antes del updateMany acotado de la original')
  } else if (!saleSiNoHayFila(funcion, original.cierra, primeraDeLaOriginal.indice, /return\s+'not_found'/)) {
    violaciones.push("entre el updateMany de la original y su primera consulta de lineas falta `count === 0` -> `return 'not_found'`")
  }

  const primeraDeVersion = lineas.find((l) => /\brecipeId\s*:\s*versionId\b/.test(l.argumentos))
  if (primeraDeVersion === undefined) {
    violaciones.push('ninguna consulta de lineas filtra por `recipeId: versionId`')
  } else if (primeraDeVersion.indice < version.cierra) {
    violaciones.push('las lineas de la version se tocan antes del updateMany acotado de la version')
  } else if (!saleSiNoHayFila(funcion, version.cierra, primeraDeVersion.indice, /\bthrow\b/)) {
    violaciones.push('entre el updateMany de la version y sus lineas falta `count === 0` -> `throw` (que revierte todo)')
  }

  for (const linea of lineas) {
    if (!/\brecipeId\s*:\s*(?:id|versionId)\b/.test(linea.argumentos)) {
      violaciones.push(
        `una consulta de lineas (indice ${String(linea.indice)}) no filtra por \`recipeId: id\` ni \`recipeId: versionId\``,
      )
    }
    if (/\bcompanyId\b/.test(linea.argumentos)) {
      violaciones.push('una consulta de lineas menciona `companyId`: su ambito es el de su receta, ya probado')
    }
  }
  return violaciones
}

function violacionesDeAltaDeVersion(source: string): readonly string[] {
  const funcion = funcionDeTexto(source, 'createRecipeVersion')
  if (funcion === undefined) return ['recipe-prisma.ts no declara createRecipeVersion']
  const violaciones = [...violacionesDeTransaccion(funcion)]

  const columnas = /\bconst\s+(\w+)\s*=\s*companyScopeColumns\s*\(\s*scope\s*\)/.exec(funcion.cuerpo)
  if (columnas === null) {
    return [...violaciones, 'no construye las columnas de empresa con `companyScopeColumns(scope)`']
  }
  const variable = columnas[1] as string

  const lecturas = llamadasA(funcion, /\btx\s*\.\s*\$queryRaw\s*(?:<[^(]*>)?\s*\(/)
  const lectura = lecturas[0]
  if (lecturas.length !== 1 || lectura === undefined) {
    return [...violaciones, 'tiene que leer la original con UN tx.$queryRaw']
  }
  const exigido: readonly (readonly [RegExp, string])[] = [
    [
      new RegExp(`"company_id"\\s*=\\s*\\$\\{\\s*${variable}\\s*\\.\\s*companyId\\s*\\}`),
      `"company_id" = \${${variable}.companyId}`,
    ],
    [/"deleted_at"\s+IS\s+NULL/i, '"deleted_at" IS NULL'],
    [/"parent_recipe_id"\s+IS\s+NULL/i, '"parent_recipe_id" IS NULL'],
    [/\bFOR\s+SHARE\b/i, 'FOR SHARE'],
  ]
  for (const [patron, texto] of exigido) {
    if (!patron.test(lectura.argumentosConCadenas)) {
      violaciones.push(`la lectura de la original no lleva \`${texto}\``)
    }
  }

  const altas = llamadasA(funcion, /\btx\s*\.\s*recipe\s*\.\s*create\s*\(/)
  const alta = altas[0]
  if (altas.length !== 1 || alta === undefined) {
    return [...violaciones, 'tiene que crear la version con UN tx.recipe.create']
  }
  if (alta.indice < lectura.cierra) violaciones.push('crea la version antes de leer la original')
  if (!/return\s+'not_found'/.test(funcion.cuerpoConCadenas.slice(lectura.cierra, alta.indice))) {
    violaciones.push("entre la lectura de la original y el alta falta `return 'not_found'`")
  }
  if (!new RegExp(`\\.\\.\\.\\s*${variable}\\b`).test(alta.argumentos)) {
    violaciones.push(`el alta no escribe la empresa desde \`...${variable}\``)
  }
  if (!/\bparentRecipeId\s*:\s*originalId\b/.test(alta.argumentos)) {
    violaciones.push('el alta no cuelga la version de `originalId`')
  }
  return violaciones
}

function violacionesDeBajaEnCascada(source: string): readonly string[] {
  const funcion = funcionDeTexto(source, 'softDeleteAliveRecipe')
  if (funcion === undefined) return ['recipe-prisma.ts no declara softDeleteAliveRecipe']
  const violaciones = [...violacionesDeTransaccion(funcion)]

  const updates = llamadasA(funcion, UPDATE_MANY_DE_RECETA)
  if (updates.length !== 2) {
    return [
      ...violaciones,
      `tiene que haber dos tx.recipe.updateMany (la fila y sus versiones), hay ${String(updates.length)}`,
    ]
  }
  const [fila, versiones] = updates as [Llamada, Llamada]
  if (!CON_AMBITO.test(fila.argumentos)) {
    violaciones.push('la baja de la fila no acota con `...recipeCompanyScope(scope)`')
  }
  if (!CON_AMBITO.test(versiones.argumentos)) {
    violaciones.push('la baja de las versiones no acota con `...recipeCompanyScope(scope)`')
  }
  if (!/\bparentRecipeId\s*:\s*id\b/.test(versiones.argumentos)) {
    violaciones.push('la baja de las versiones no filtra por `parentRecipeId: id`')
  }
  if (!saleSiNoHayFila(funcion, fila.cierra, versiones.indice, /return\s+'not_found'/)) {
    violaciones.push("entre la baja de la fila y la de sus versiones falta `count === 0` -> `return 'not_found'`")
  }
  return violaciones
}

const CONSULTA_DE_HERRAMIENTAS = /\btx\s*\.\s*recipeTool\s*\.\s*\w+\s*\(/

/**
 * `recipe_tools`, como `recipe_lines`, no lleva empresa propia: cada `tx.recipeTool.*` tiene que
 * ir DESPUES del `updateMany` acotado que probo su receta (y de su salida temprana) y filtrar por
 * ese mismo id, nunca por un ambito propio.
 */
function violacionesDeHerramientas(source: string, nombre: string): readonly string[] {
  const funcion = funcionDeTexto(source, nombre)
  if (funcion === undefined) return [`recipe-prisma.ts no declara ${nombre}`]
  const violaciones = [...violacionesDeTransaccion(funcion)]

  const herramientas = llamadasA(funcion, CONSULTA_DE_HERRAMIENTAS)
  if (herramientas.length === 0) return [...violaciones, `${nombre} no toca recipeTool en absoluto`]

  const updates = llamadasA(funcion, UPDATE_MANY_DE_RECETA)
  const original = updates[0]
  if (original === undefined) return [...violaciones, `${nombre} no tiene tx.recipe.updateMany`]
  if (!CON_AMBITO.test(original.argumentos)) {
    violaciones.push(`${nombre}: el updateMany de la receta no acota con \`...recipeCompanyScope(scope)\``)
  }
  const version = updates.find((u) => /\bid\s*:\s*versionId\b/.test(u.argumentos))

  for (const herramienta of herramientas) {
    const donde = `${nombre}: una consulta de herramientas (indice ${String(herramienta.indice)})`
    if (/\bcompanyId\b/.test(herramienta.argumentos)) {
      violaciones.push(`${donde} menciona \`companyId\`: su ambito es el de su receta, ya probado`)
    }
    if (/\brecipeId\s*:\s*versionId\b/.test(herramienta.argumentos)) {
      if (version === undefined || herramienta.indice < version.cierra) {
        violaciones.push(`${donde} toca una version antes del updateMany acotado de la version`)
      } else if (!saleSiNoHayFila(funcion, version.cierra, herramienta.indice, /\bthrow\b/)) {
        violaciones.push(`${donde}: entre el updateMany de la version y ella falta \`count === 0\` -> \`throw\``)
      }
    } else if (/\brecipeId\s*:\s*id\b/.test(herramienta.argumentos)) {
      if (herramienta.indice < original.cierra) {
        violaciones.push(`${donde} va antes del updateMany acotado de la receta`)
      } else if (!saleSiNoHayFila(funcion, original.cierra, herramienta.indice, /return\s+'not_found'/)) {
        violaciones.push(`${donde}: entre el updateMany de la receta y ella falta \`count === 0\` -> \`return 'not_found'\``)
      }
    } else {
      violaciones.push(`${donde} no filtra por \`recipeId: id\` ni \`recipeId: versionId\``)
    }
  }
  return violaciones
}

/** Aplica una mutacion y exige que cambie el texto: una mutacion que no casa no prueba nada. */
function mutar(source: string, patron: RegExp, por: string): string {
  const mutado = source.replace(patron, por)
  expect(mutado, `la mutacion ${String(patron)} no cambio nada: el anti-placebo no esta mirando`).not.toBe(source)
  return mutado
}

describe('QC-172 — `replaceAliveRecipeWithPropagation`: toca las lineas de la original y de cada version solo tras probar su fila', () => {
  it('cumple la estructura en el fuente real', () => {
    expect(violacionesDePropagacion(RECIPE_PRISMA_SOURCE)).toEqual([])
  })

  it('MUERE si se le quita `recipeCompanyScope(scope)` al updateMany de la version (el barrido por parametro no lo veria: el de la original ya consume el ambito)', () => {
    const mutado = mutar(
      RECIPE_PRISMA_SOURCE,
      /(where:\s*\{\s*id:\s*versionId,[^}]*?),\s*\.\.\.recipeCompanyScope\(scope\)/,
      '$1',
    )
    expect(violacionesDePropagacion(mutado)).toContainEqual(
      expect.stringMatching(/updateMany de la VERSION no acota/),
    )
  })

  it('MUERE si el updateMany de la version deja de exigir `parentRecipeId: id`', () => {
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /(id:\s*versionId,\s*)parentRecipeId:\s*id,\s*/, '$1')
    expect(violacionesDePropagacion(mutado)).toContainEqual(expect.stringMatching(/parentRecipeId: id/))
  })

  it('MUERE si una version que no existe deja de abortar la transaccion', () => {
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /if \(touched\.count === 0\) throw new VersionNotFound\(\);/, '')
    expect(violacionesDePropagacion(mutado)).toContainEqual(expect.stringMatching(/-> `throw`/))
  })
})

describe('QC-172 — `createRecipeVersion`: la original se lee FOR SHARE con la empresa del ambito', () => {
  it('cumple la estructura en el fuente real', () => {
    expect(violacionesDeAltaDeVersion(RECIPE_PRISMA_SOURCE)).toEqual([])
  })

  it('MUERE si el SQL crudo deja de filtrar por empresa', () => {
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /AND "company_id" = \$\{columns\.companyId\}::uuid/, '')
    expect(violacionesDeAltaDeVersion(mutado)).toContainEqual(expect.stringMatching(/"company_id"/))
  })

  it('MUERE si se quita el FOR SHARE', () => {
    // Anclado al SQL: la primera aparicion de «FOR SHARE» en el archivo esta en un comentario.
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /("parent_recipe_id" IS NULL\s*)FOR SHARE/, '$1')
    expect(violacionesDeAltaDeVersion(mutado)).toContainEqual(expect.stringMatching(/FOR SHARE/))
  })
})

describe('QC-172 — `softDeleteAliveRecipe`: la baja en cascada de las versiones va acotada a la empresa', () => {
  it('cumple la estructura en el fuente real', () => {
    expect(violacionesDeBajaEnCascada(RECIPE_PRISMA_SOURCE)).toEqual([])
  })

  it('MUERE si la baja de las versiones pierde `recipeCompanyScope(scope)`', () => {
    const mutado = mutar(
      RECIPE_PRISMA_SOURCE,
      /(where:\s*\{\s*parentRecipeId:\s*id,\s*deletedAt:\s*null),\s*\.\.\.recipeCompanyScope\(scope\)/,
      '$1',
    )
    expect(violacionesDeBajaEnCascada(mutado)).toContainEqual(expect.stringMatching(/versiones no acota/))
  })
})

describe('`recipe_tools`: las herramientas se escriben solo tras probar su receta, y por su id', () => {
  for (const nombre of ['replaceAliveRecipe', 'replaceAliveRecipeWithPropagation']) {
    it(`${nombre}: cumple la estructura en el fuente real`, () => {
      expect(violacionesDeHerramientas(RECIPE_PRISMA_SOURCE, nombre)).toEqual([])
    })
  }

  it('MUERE si una consulta de herramientas va antes del updateMany acotado', () => {
    const mutado = mutar(
      RECIPE_PRISMA_SOURCE,
      /(return await prisma\.\$transaction\(async \(tx\) => \{\s*)(const updated = await tx\.recipe\.updateMany)/,
      '$1await tx.recipeTool.deleteMany({ where: { recipeId: id } });\n$2',
    )
    expect(violacionesDeHerramientas(mutado, 'replaceAliveRecipe')).toContainEqual(
      expect.stringMatching(/antes del updateMany acotado de la receta/),
    )
  })

  it('MUERE si el deleteMany de herramientas deja de filtrar por `recipeId: id`', () => {
    const mutado = mutar(
      RECIPE_PRISMA_SOURCE,
      /(tx\.recipeTool\.deleteMany\(\{\s*where:\s*\{\s*)recipeId: id,/,
      '$1companyId: id,',
    )
    expect(violacionesDeHerramientas(mutado, 'replaceAliveRecipe')).toEqual(
      expect.arrayContaining([expect.stringMatching(/no filtra por/), expect.stringMatching(/menciona `companyId`/)]),
    )
  })

  it('MUERE si una version que no existe deja de abortar antes de tocar sus herramientas', () => {
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /if \(touched\.count === 0\) throw new VersionNotFound\(\);/, '')
    expect(violacionesDeHerramientas(mutado, 'replaceAliveRecipeWithPropagation')).toContainEqual(
      expect.stringMatching(/-> `throw`/),
    )
  })

  it('MUERE si las herramientas se tocan por el cliente global', () => {
    const mutado = mutar(RECIPE_PRISMA_SOURCE, /await tx\.recipeTool\.deleteMany\(/, 'await prisma.recipeTool.deleteMany(')
    expect(violacionesDeHerramientas(mutado, 'replaceAliveRecipe')).toContainEqual(
      expect.stringMatching(/cliente global/),
    )
  })
})
