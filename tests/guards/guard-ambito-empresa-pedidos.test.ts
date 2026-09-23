// GUARDIA (QC-60 R18, T15) — el ambito de empresa de `pedidos`, comprobado FUNCION POR FUNCION.
//
// Calcada de `guard-ambito-empresa-inventario.test.ts` (QC-49 R13), y por el MISMO motivo, que es
// lo unico que justifica una guardia mas.
//
// POR QUE EXISTE. R18 pide dos cosas y el compilador solo cierra una:
//
//   - Una LLAMADA que omita el ambito NO COMPILA: los seis metodos de `OrderRepository` exigen
//     `scope: OrderScope` al final de la firma y `OrderCatalog.findAliveById` exige
//     `companyId: string`. Pasar menos argumentos de los que declara la firma es error de tipos.
//   - Una IMPLEMENTACION que lo omita SI COMPILA. TypeScript admite asignar una funcion de MENOR
//     aridad donde se espera una de mayor, y asi es exactamente como `lib/composition/index.ts`
//     ata las funciones sueltas del adaptador driven a `OrderRepository` y a `OrderCatalog`:
//
//         interface Repo { findAliveById(id: string, scope: Scope): Promise<Row | null> }
//         async function findAliveById(id: string): Promise<Row | null> { ... }
//         const repo: Repo = { findAliveById }            // COMPILA, exit 0
//
//     Lo verifico el reviewer de QC-49 contra el `tsc` de este repo (`design.md > 4.2`). Un
//     `findFirst` nuevo sin ambito compila, se cablea y lee los pedidos de TODAS las empresas.
//
// Y una guardia POR ARCHIVO -«`order-prisma.ts` importa `./company-scope`»- no muerde: un metodo
// NUEVO que se olvide del ambito la pasa, porque el archivo sigue importando el punto unico por
// culpa de sus otras seis consultas. Esta es la que muerde con UNA sola funcion mal escrita. De
// cada funcion de persistencia del modulo comprueba LAS DOS MITADES:
//
//   1. que DECLARA el ambito: `scope: OrderScope` en el repositorio, `companyId: string` en el
//      catalogo (`design.md > 6`: el catalogo recibe una cadena y no el `OrderScope`, para no
//      obligar a `asignaciones` a construir un tipo interno de `pedidos`), y
//   2. que ese valor LLEGA de verdad hasta una envoltura de `./company-scope` -directamente o a
//      traves de un ayudante del mismo archivo al que se le pasa-. Declararlo y no usarlo seria la
//      misma fuga con mejor cara.
//
// EL CAMINO DEL SQL CRUDO DEL ALTA (`design.md > 5`, «el caso raro»). `createOrder` no puede
// recibir un `Prisma.OrderWhereInput`: escribe con `$queryRaw`. Para ese camino no basta con que
// la funcion llame a `companyScopeColumns(scope)`, porque podria llamarla y luego escribir
// `scope.companyId` a mano en el SQL. Asi que aqui se LEE LA PLANTILLA SQL y se exige que la
// empresa que se ESCRIBE en `company_id` y la que acota el SUBSELECT DEL MAXIMO (R24) sean las dos
// el valor que sale de `companyScopeColumns`, y no una lectura suelta de `scope.companyId`.
//
// **SIN LISTA DE EXCEPCIONES.** Es una mejora DELIBERADA sobre QC-49, que dejo `findProductRefs`
// fuera de ambito por escrito (su R29) porque `recetas` lo llama sin sesion. Aqui hasta
// `OrderCatalog` se acota: sus cuatro llamantes son casos de uso de `asignaciones` que ya tienen
// la empresa en su propio `Actor` (`design.md > 5` y `> 6`). Copiar aquella excepcion seria
// heredar el problema sin heredar el motivo: es la alternativa I, descartada en
// `design.md > 10`. Si algun dia una consulta de `pedidos` tuviera que quedarse sin ambito, eso
// lo aprueba un humano en un spec y SOLO ENTONCES se anade aqui una lista con su motivo; no la
// anade quien escribe el adaptador para poner esto en verde.
//
// TECNICA: barrido de TEXTO sobre el disco, como el resto de `tests/guards/`. No se importa ningun
// modulo ni se mira el grafo de imports: lo que se vigila es lo que esta ESCRITO, que es justo lo
// que el compilador no mira.

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
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'pedidos')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

/** El punto unico. Es el UNICO archivo de persistencia que puede leer `scope.companyId`. */
const PUNTO_UNICO = 'company-scope.ts'

/** Las dos formas en que una funcion de persistencia puede declarar el ambito. */
const FORMAS_DE_AMBITO = [
  { identificador: 'scope', declaracion: /\bscope\s*:\s*OrderScope\b/ },
  { identificador: 'companyId', declaracion: /\bcompanyId\s*:\s*string\b/ },
] as const

type Identificador = (typeof FORMAS_DE_AMBITO)[number]['identificador']

// --- Lectura y troceado del texto -------------------------------------------------------------

/**
 * Quita los comentarios: la prosa explica la regla y no puede contar como implementacion.
 *
 * Todo reemplazo de este archivo CONSERVA LA LONGITUD: asi un indice calculado sobre el texto
 * vaciado vale tambien sobre el texto con cadenas, y el cuerpo de una funcion se puede releer CON
 * su SQL -que es lo que hace falta para el alta- sin volver a trocear.
 */
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
  /** El mismo cuerpo, sin comentarios pero CON cadenas y plantillas: para leer el SQL. */
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

/** ¿Alguna llamada a `nombre` que hay en `cuerpo` recibe `identificador` entre sus argumentos? */
function lePasaElAmbito(cuerpo: string, nombre: string, identificador: Identificador): boolean {
  const llamada = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
  const valor = new RegExp(`\\b${identificador}\\b`)
  for (const match of cuerpo.matchAll(llamada)) {
    const abre = cuerpo.indexOf('(', match.index)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    if (cierra === -1) continue
    if (valor.test(cuerpo.slice(abre + 1, cierra))) return true
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
 * (`tx.`): un modelo (`prisma.order.findFirst(`) o un metodo crudo (`prisma.$transaction(`,
 * `tx.$executeRaw(`, `tx.$queryRaw<…>(`). La guardia de inventario solo miraba la primera forma;
 * aqui la segunda es OBLIGATORIA, porque el alta entera va por ella y sin esto `createOrder` ni
 * siquiera contaria como consulta.
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
  // le pasa SU PROPIO ambito declarado a algo que ya lo consume.
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

// --- Los dos puertos y su cableado -------------------------------------------------------------

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
 * Se trocea por COMAS y no por lineas: `orderCatalog` esta escrito en UNA sola linea
 * (`{ findAliveById: findAliveOrderTargetById }`) y el troceo por lineas de la guardia de
 * inventario no veria nada.
 */
type Cableado = {
  readonly cableado: ReadonlyMap<string, string>
  /** El lado derecho tal cual, por metodo: lo que necesita `METODOS_DELEGADOS_EN_DOMINIO` para
   *  comprobar la llamada entera y no solo el nombre de la fabrica. */
  readonly crudo: ReadonlyMap<string, string>
}

function cableadoDe(constante: string, interfaz: string): Cableado {
  const ruta = join(repoRoot, 'lib', 'composition', 'index.ts')
  const source = vaciarCadenas(sinComentarios(readFileSync(ruta, 'utf8')))
  const inicio = source.indexOf(`const ${constante}: ${interfaz} = {`)
  expect(inicio, `lib/composition no ata ${constante}: ${interfaz}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  const cuerpo = source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))

  const cableado = new Map<string, string>()
  const crudo = new Map<string, string>()
  for (const entrada of porComasDeNivelCero(cuerpo)) {
    const conNombre = /^(\w+)\s*:\s*(\w+)$/.exec(entrada)
    if (conNombre !== null) {
      cableado.set(conNombre[1] ?? '', conNombre[2] ?? '')
      crudo.set(conNombre[1] ?? '', (conNombre[2] ?? '').trim())
      continue
    }
    const abreviado = /^(\w+)$/.exec(entrada)
    if (abreviado !== null) {
      cableado.set(abreviado[1] ?? '', abreviado[1] ?? '')
      crudo.set(abreviado[1] ?? '', (abreviado[1] ?? '').trim())
      continue
    }
    // `metodo: fabricaDeDominio(...)` -una llamada, no una referencia suelta- es la forma de
    // `transitionAliveById` (`METODOS_DELEGADOS_EN_DOMINIO`, mas abajo). Se registra
    // metodo -> nombre de la fabrica para que el cableado SIGA teniendo la clave correcta; el
    // resto de la verificacion la hace un `it` propio, no el barrido generico.
    const conLlamada = /^(\w+)\s*:\s*(\w+)\s*\(/.exec(entrada)
    if (conLlamada !== null) {
      const metodo = conLlamada[1] ?? ''
      cableado.set(metodo, conLlamada[2] ?? '')
      crudo.set(metodo, entrada.slice(entrada.indexOf(':') + 1).trim())
      continue
    }
    // Una entrada que no es `metodo: funcion`, `metodo` ni `metodo: fabrica(...)` -una lambda en
    // linea, un `bind`, un spread- no se puede seguir hasta una funcion del adaptador. Se
    // registra tal cual para que el test la NOMBRE en vez de ignorarla en silencio.
    cableado.set(entrada, '')
  }
  return { cableado, crudo }
}

const PUERTOS = [
  {
    nombre: 'OrderRepository',
    ruta: join(MODULE_ROOT, 'ports', 'order-repository.ts'),
    constante: 'orderRepository',
    adaptador: 'order-prisma.ts',
    ambito: 'scope',
    literal: 'scope: OrderScope',
  },
  {
    nombre: 'OrderCatalog',
    ruta: join(MODULE_ROOT, 'domain', 'order-catalog.ts'),
    constante: 'orderCatalog',
    adaptador: 'order-catalog-prisma.ts',
    ambito: 'companyId',
    literal: 'companyId: string',
  },
] as const

/**
 * `OrderCatalog.transitionAliveById` ya no cablea una funcion cruda de
 * `order-catalog-prisma.ts` -cablea `createTransitionOrder`, un caso de uso de
 * `pedidos/domain` que abre `OrderUnitOfWork` y, por dentro, llama a
 * `OrderWriteRepository.lockAliveById` y `.setStatus`, implementadas en `order-prisma.ts`. Esas
 * dos SI declaran y consumen `scope: OrderScope`, y el barrido sin lista de excepciones de mas
 * abajo -que recorre TODA funcion de persistencia que toque la base- ya lo exige de ellas: el
 * ambito de este metodo no deja de vigilarse, se vigila donde la base se toca de verdad. Por eso
 * este metodo se verifica aparte del barrido generico «cableado a una funcion con nombre del
 * adaptador», que asume un adaptador que lee `prisma.order` directamente.
 */
const METODOS_DELEGADOS_EN_DOMINIO: ReadonlyMap<string, RegExp> = new Map([
  ['transitionAliveById', /^createTransitionOrder\s*\(\s*\{\s*unitOfWork\s*:\s*orderUnitOfWork\s*,\s*recipes\s*:\s*recipeCatalog\s*\}\s*\)$/],
])

describe('QC-60 R18 — el punto unico es de verdad UNA definicion', () => {
  // Toda la guardia se apoya en que «llegar hasta una envoltura de `./company-scope`» significa
  // «filtrar por empresa». Eso solo es cierto si las envolturas DELEGAN en la definicion unica y
  // esa definicion es la unica lectura de `scope.companyId` del modulo. Si alguien reescribiera una
  // envoltura con su propia condicion, la semilla de este barrido dejaria de ser de fiar.
  it('company-scope.ts: `companyScope` es privada, es la unica lectura del ambito y las dos envolturas delegan en ella', () => {
    const analizado = analizar(PUNTO_UNICO)
    const exportadas = analizado.funciones.filter((f) =>
      new RegExp(`^export\\s+function\\s+${f.nombre}\\b`, 'm').test(analizado.codigo),
    )
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      'companyScopeColumns',
      'orderCompanyScope',
    ])

    for (const envoltura of exportadas) {
      expect(
        envoltura.cuerpo.trim(),
        `${envoltura.nombre} tiene que delegar en \`companyScope\` y en nada mas: una segunda definicion de «de la empresa» es exactamente lo que R18 prohibe`,
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

describe('QC-60 R18 — cada metodo de los dos puertos declara Y consume el ambito de empresa', () => {
  for (const puerto of PUERTOS) {
    const metodos = metodosDeLaInterfaz(puerto.ruta, puerto.nombre)
    const { cableado, crudo } = cableadoDe(puerto.constante, puerto.nombre)
    const adaptador = analizar(puerto.adaptador)
    const forma = FORMAS_DE_AMBITO.find((f) => f.identificador === puerto.ambito)

    it(`${puerto.nombre}: los ${String(metodos.size)} metodos estan cableados, con nombre, y ninguno se queda fuera`, () => {
      // Sin esto, un metodo NUEVO del puerto podria no aparecer en el barrido de abajo y la
      // guardia lo ignoraria en silencio, que es justo el fallo que viene a cerrar.
      expect(metodos.size, `${puerto.nombre} deberia declarar metodos`).toBeGreaterThan(0)
      expect([...cableado.keys()].sort()).toEqual([...metodos.keys()].sort())
      for (const [metodo, implementacion] of cableado) {
        if (METODOS_DELEGADOS_EN_DOMINIO.has(metodo)) continue
        expect(
          implementacion,
          `${puerto.constante}.${metodo} no esta cableado a una funcion con nombre del adaptador: la guardia no puede seguir una lambda, un bind ni un spread`,
        ).toMatch(/^\w+$/)
      }
    })

    it(`${puerto.nombre}: el propio puerto EXIGE \`${puerto.literal}\` en la firma de cada metodo`, () => {
      // La mitad que SI cierra el compilador, pero solo mientras la firma la traiga. Se ancla aqui
      // para que quitarla del puerto no deje la otra mitad vigilando una firma que ya no la pide.
      for (const [metodo, parametros] of metodos) {
        expect(
          forma?.declaracion.test(parametros),
          `${puerto.nombre}.${metodo} ya no exige \`${puerto.literal}\` en su firma (R18)`,
        ).toBe(true)
      }
    })

    for (const metodo of metodos.keys()) {
      const delegado = METODOS_DELEGADOS_EN_DOMINIO.get(metodo)

      if (delegado !== undefined) {
        it(`${puerto.nombre}.${metodo} delega en una fabrica de dominio cuya escritura real YA vigila el barrido sin excepciones`, () => {
          const llamada = crudo.get(metodo)
          expect(
            llamada !== undefined && delegado.test(llamada),
            `${puerto.constante}.${metodo} deberia estar cableado exactamente a ${delegado.source}, y esta a: ${llamada ?? '(nada)'}`,
          ).toBe(true)
          // El adaptador crudo del puerto NO declara ya esta funcion: quien de verdad toca la
          // base para este metodo es `OrderWriteRepository.lockAliveById`/`.setStatus`
          // (`order-prisma.ts`), y esas SI estan en el barrido sin lista de excepciones de mas
          // abajo.
          expect(adaptador.funciones.some((f) => f.nombre === metodo)).toBe(false)
        })
        continue
      }

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
          `${puerto.adaptador}:${funcion.nombre} implementa ${puerto.nombre}.${metodo} SIN declarar \`${puerto.literal}\`. TypeScript lo acepta -una funcion de menos parametros satisface la firma-, asi que la unica forma de que no se cuele es esta (R18)`,
        ).toBe(puerto.ambito)

        // 2. LO USA. Declararlo y no usarlo seria la misma fuga con mejor cara: la llamada
        //    compilaria, el ambito viajaria hasta aqui y la consulta leeria los pedidos de todas
        //    las empresas.
        expect(
          adaptador.consumidoras.has(funcion.nombre),
          `${puerto.adaptador}:${funcion.nombre} declara el ambito pero NO lo lleva hasta \`./company-scope\`: \`${puerto.ambito}\` tiene que acabar en una de sus envolturas (${adaptador.envolturas.join(', ') || 'el archivo no importa ninguna'}), aqui o en un ayudante de este mismo archivo al que se le pase (R18)`,
        ).toBe(true)
      })
    }
  }
})

describe('QC-60 R18 — ninguna consulta del modulo se queda sin ambito, y NO hay lista de excepciones', () => {
  /** Los archivos de persistencia del modulo, leidos del disco y no de una lista a mano. */
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia se barren todos, y el troceo VE las consultas', () => {
    expect(archivos).toContain('order-prisma.ts')
    expect(archivos).toContain('order-catalog-prisma.ts')
    expect(archivos).toContain(PUNTO_UNICO)

    // ANTI-PLACEBO del troceador. Si `funcionesDe` dejara de reconocer las declaraciones -o se
    // quedara con la llave de un tipo de retorno-, el barrido de abajo no encontraria NINGUNA
    // funcion que toque la base y pasaria en verde sin mirar nada. Las cuentas de hoy: seis en
    // `order-prisma.ts` (el alta, la ficha, el listado y las tres escrituras) y una en el
    // catalogo. Se exige el minimo, no la igualdad: la consulta numero ocho entra por el barrido,
    // que es donde tiene que morder.
    const conConsulta = (archivo: string): readonly string[] =>
      analizar(archivo)
        .funciones.filter((f) => tocaLaBase(f.cuerpo))
        .map((f) => f.nombre)

    expect(conConsulta('order-prisma.ts').length).toBeGreaterThanOrEqual(6)
    expect(conConsulta('order-prisma.ts')).toContain('createOrder')
    expect(conConsulta('order-catalog-prisma.ts').length).toBeGreaterThanOrEqual(1)
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito`, () => {
      const analizado = analizar(archivo)

      // Ninguna consulta vive FUERA de una `function` que el troceo vea. Sin esto, una consulta
      // escrita como `const leer = async () => prisma.order.findMany()` no entraria en el barrido
      // y la guardia la ignoraria sin decir nada.
      for (const match of analizado.codigo.matchAll(TOCA_LA_BASE)) {
        const dentro = analizado.funciones.some(
          (f) => match.index > f.inicio && match.index < f.fin,
        )
        const linea = analizado.codigo.slice(0, match.index).split('\n').length
        expect(
          dentro,
          `${archivo}:${String(linea)} ejecuta una consulta fuera de una \`function\` declarada: la guardia no puede comprobar su ambito. Escribela como \`function\` que declare \`scope: OrderScope\``,
        ).toBe(true)
      }

      for (const funcion of analizado.funciones) {
        if (!tocaLaBase(funcion.cuerpo)) continue
        // SIN excepciones: aqui no hay ningun `if (EXCEPCIONES.has(...)) continue`, y es a
        // proposito (ver la cabecera).
        expect(
          ambitoDeclarado(funcion),
          `${archivo}:${funcion.nombre} consulta la base SIN declarar \`scope: OrderScope\` (o \`companyId: string\` en el catalogo). \`pedidos\` NO tiene ninguna consulta sin ambito aprobada (QC-60 R18, design.md > 5)`,
        ).not.toBeNull()
        expect(
          analizado.consumidoras.has(funcion.nombre),
          `${archivo}:${funcion.nombre} declara el ambito pero no lo lleva hasta las envolturas de \`./company-scope\`: un ambito que no entra en el \`where\` (o en lo que se escribe) no filtra nada (R18)`,
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
            `${archivo}:${String(linea)} lee la empresa del ambito a mano. Eso es una segunda definicion de «de la empresa»: usa \`orderCompanyScope(scope)\` en un \`where\` o \`companyScopeColumns(scope)\` en lo que se escribe (R18)`,
          ).toBeNull()
        }
      })
    }
  }
})

describe('QC-60 R18, R22, R24 — el SQL crudo escribe y numera con la empresa de `companyScopeColumns`', () => {
  /** Las funciones de persistencia que ejecutan SQL crudo, en todos los archivos del modulo. */
  const conSqlCrudo = readdirSync(PERSISTENCE_ROOT)
    .filter((archivo) => archivo.endsWith('.ts'))
    .flatMap((archivo) =>
      analizar(archivo)
        .funciones.filter((f) => /\.\s*\$(?:queryRaw|executeRaw)\w*\s*[(<`]/.test(f.cuerpo))
        .map((funcion) => ({ archivo, funcion })),
    )

  it('el barrido encuentra el alta: `createOrder` ejecuta SQL crudo', () => {
    // ANTI-PLACEBO: si el troceo no viera el `$queryRaw`, los casos de abajo no correrian sobre
    // nada y R24 quedaria sin vigilar.
    expect(conSqlCrudo.map(({ archivo, funcion }) => `${archivo}:${funcion.nombre}`)).toContain(
      'order-prisma.ts:createOrder',
    )
  })

  for (const { archivo, funcion } of conSqlCrudo) {
    it(`${archivo}:${funcion.nombre}: sin variantes Unsafe, y toda \`company_id\` del SQL es el valor de \`companyScopeColumns(scope)\``, () => {
      // Las variantes `Unsafe` reciben una CADENA ya compuesta: la empresa iria interpolada como
      // texto, no parametrizada, y ninguna comprobacion de abajo podria ver de donde sale.
      expect(
        funcion.cuerpo,
        `${funcion.nombre} usa $queryRawUnsafe/$executeRawUnsafe`,
      ).not.toMatch(/\$(?:queryRaw|executeRaw)Unsafe\b/)

      // DE DONDE SALE EL VALOR. Solo cuenta lo que se ata a `companyScopeColumns(scope)`:
      //   const { companyId } = companyScopeColumns(scope)       -> `companyId`
      //   const { companyId: x } = companyScopeColumns(scope)    -> `x`
      //   const columnas = companyScopeColumns(scope)            -> `columnas.companyId`
      //   companyScopeColumns(scope).companyId                   -> en linea
      const validos = new Set<string>(['companyScopeColumns(scope).companyId'])
      for (const m of funcion.cuerpo.matchAll(
        /\b(?:const|let)\s*\{\s*companyId(?:\s*:\s*(\w+))?\s*\}\s*=\s*companyScopeColumns\s*\(\s*scope\s*\)/g,
      )) {
        validos.add(m[1] ?? 'companyId')
      }
      for (const m of funcion.cuerpo.matchAll(
        /\b(?:const|let)\s+(\w+)\s*=\s*companyScopeColumns\s*\(\s*scope\s*\)/g,
      )) {
        validos.add(`${m[1] ?? ''}.companyId`)
      }
      const esValido = (expresion: string): boolean => validos.has(expresion.replace(/\s+/g, ''))

      const sql = funcion.cuerpoConCadenas

      // Los sitios donde el SQL FILTRA por empresa: `"company_id" = ${…}`.
      const comparaciones = [...sql.matchAll(/"?company_id"?\s*=\s*\$\{([^}]*)\}/g)].map(
        (m) => m[1] ?? '',
      )

      // La columna que se ESCRIBE: la posicion de `company_id` en la lista de columnas del
      // `INSERT` y el valor que ocupa esa MISMA posicion en `VALUES (…)`.
      const escrituras: string[] = []
      for (const m of sql.matchAll(/INSERT\s+INTO\s+"?orders"?\s*\(/gi)) {
        const abreColumnas = m.index + m[0].length - 1
        const cierraColumnas = cierreEquilibrado(sql, abreColumnas, '(', ')')
        const columnas = sql
          .slice(abreColumnas + 1, cierraColumnas)
          .split(',')
          .map((columna) => columna.trim().replace(/"/g, ''))
        const indice = columnas.indexOf('company_id')
        expect(
          indice,
          `${funcion.nombre} inserta en \`orders\` SIN escribir \`company_id\` (R22)`,
        ).toBeGreaterThan(-1)

        const values = /^\s*VALUES\s*\(/i.exec(sql.slice(cierraColumnas + 1))
        expect(values, `${funcion.nombre}: no se encontro el \`VALUES (\` del INSERT`).not.toBeNull()
        if (values === null) return
        const abreValores = cierraColumnas + 1 + values[0].length - 1
        const cierraValores = cierreEquilibrado(sql, abreValores, '(', ')')
        const valores = porComasDeNivelCero(sql.slice(abreValores + 1, cierraValores))
        expect(valores.length, `${funcion.nombre}: columnas y valores del INSERT no cuadran`).toBe(
          columnas.length,
        )
        const valor = /^\$\{([^}]*)\}\s*::\s*uuid$/.exec(valores[indice] ?? '')
        expect(
          valor?.[1] ?? null,
          `${funcion.nombre} escribe \`company_id\` con \`${valores[indice] ?? '?'}\`: tiene que ser un parametro del template tag con \`::uuid\`, jamas un literal ni una cadena interpolada (R22)`,
        ).not.toBeNull()
        escrituras.push(valor?.[1] ?? '')
      }

      expect(
        escrituras.length + comparaciones.length,
        `${funcion.nombre} ejecuta SQL crudo sobre \`orders\` y no nombra \`company_id\` ni al escribir ni al filtrar`,
      ).toBeGreaterThan(0)

      if (escrituras.length > 0) {
        // R24: el alta numera DENTRO de la empresa que escribe. Tiene que haber al menos una
        // comparacion -la del subselect del maximo- y, abajo, tiene que usar el MISMO valor.
        expect(
          comparaciones.length,
          `${funcion.nombre} escribe \`company_id\` pero su SQL no filtra por empresa en ningun sitio: el maximo del correlativo se calcularia sobre TODAS las empresas (R24)`,
        ).toBeGreaterThan(0)
      }

      for (const expresion of [...escrituras, ...comparaciones]) {
        expect(
          esValido(expresion),
          `${funcion.nombre} usa \`\${${expresion.trim()}}\` como empresa en el SQL crudo. Tiene que ser el valor que devuelve \`companyScopeColumns(scope)\` (${[...validos].join(' | ')}), no una lectura suelta del ambito (R18, R24)`,
        ).toBe(true)
      }
    })
  }
})
