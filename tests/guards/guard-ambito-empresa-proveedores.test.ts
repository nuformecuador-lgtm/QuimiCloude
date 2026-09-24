// GUARDIA — el ambito de empresa de `proveedores`, comprobado FUNCION POR FUNCION.
//
// Calcada de `guard-ambito-empresa-recetas.test.ts`, de `guard-ambito-empresa-pedidos.test.ts`
// y de `guard-ambito-empresa-inventario.test.ts`, y por el MISMO motivo, que es lo unico que
// justifica una guardia mas.
//
// POR QUE EXISTE. El ambito esta en la firma de los dos puertos, asi que una LLAMADA que lo
// omita no compila: los cinco metodos de `SupplierRepository` y los cuatro de
// `SupplierCatalogRepository` exigen `scope: SupplierScope` al final de la firma. Pero una
// IMPLEMENTACION que lo omita SI COMPILA. TypeScript admite asignar una funcion de MENOR aridad
// donde se espera una de mayor, y asi es exactamente como `lib/composition/index.ts` ata las
// funciones sueltas de los adaptadores driven a los dos puertos:
//
//     interface Repo { findAliveById(id: string, scope: Scope): Promise<Row | null> }
//     async function findAliveById(id: string): Promise<Row | null> { ... }
//     const repo: Repo = { findAliveById }            // COMPILA, exit 0
//
// Un `findFirst` nuevo sin ambito compila, se cablea y lee los proveedores de TODAS las
// empresas.
//
// Una guardia POR ARCHIVO -«`supplier-prisma.ts` importa `./company-scope`»- no muerde: un
// metodo NUEVO que se olvide del ambito la pasa, porque el archivo sigue importando el punto
// unico por culpa de sus otras consultas. Esta es la que muerde con UNA sola funcion mal
// escrita. De cada funcion de persistencia del modulo comprueba LAS DOS MITADES:
//
//   1. que DECLARA el ambito (`scope: SupplierScope`), y
//   2. que ese valor LLEGA de verdad hasta una envoltura de `./company-scope` -directamente o
//      a traves de un ayudante del mismo archivo al que se le pasa-. Declararlo y no usarlo
//      seria la misma fuga con mejor cara.
//
// `isSupplierAlive` TIENE SU PROPIO CASO, explicito. No es metodo de ningun puerto -es una
// funcion privada que comparten el alta de linea y el listado del catalogo-, asi que el barrido
// por puerto no la veria, y es justo el punto que mas facil se escapa: sin ambito, un proveedor
// de otra empresa seguiria pareciendo «vivo» para cualquiera.
//
// **SIN LISTA DE EXCEPCIONES.** No hay ninguna en el modulo y esta guardia no crea ninguna: hay
// un caso que lo afirma. Si una funcion real no pudiera cumplirlo, eso es un hallazgo que
// aprueba un humano en un spec, no una lista que escriba quien entrega el adaptador.
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
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'proveedores')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

/** El punto unico. Es el UNICO archivo de persistencia que puede leer `scope.companyId`. */
const PUNTO_UNICO = 'company-scope.ts'

/** La UNICA forma en que una funcion de persistencia de este modulo declara el ambito. */
const FORMA_DE_AMBITO = { identificador: 'scope', declaracion: /\bscope\s*:\s*SupplierScope\b/ } as const

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

/** ¿La funcion DECLARA el ambito en su firma? */
function declaraElAmbito(funcion: FuncionDeclarada): boolean {
  return FORMA_DE_AMBITO.declaracion.test(funcion.parametros)
}

/**
 * ¿Alguna llamada a `nombre` que hay en `cuerpo` recibe el ambito entre sus argumentos,
 * directamente o a traves de una variable local cuya declaracion lo contiene?
 */
function lePasaElAmbito(cuerpo: string, nombre: string): boolean {
  const llamada = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
  const valor = new RegExp(`\\b${FORMA_DE_AMBITO.identificador}\\b`)

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
 * (`tx.`): un modelo (`prisma.supplier.findFirst(`) o un metodo crudo (`prisma.$transaction(`).
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
      if (!declaraElAmbito(funcion)) continue
      for (const consumidora of consumidoras) {
        if (lePasaElAmbito(funcion.cuerpo, consumidora)) {
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

/** El objeto que `lib/composition` ata al puerto: `{ metodoDelPuerto -> funcionDelAdaptador }`. */
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
    nombre: 'SupplierRepository',
    ruta: join(MODULE_ROOT, 'ports', 'supplier-repository.ts'),
    constante: 'supplierRepository',
    adaptador: 'supplier-prisma.ts',
    metodosEsperados: 6,
  },
  {
    nombre: 'SupplierCatalogRepository',
    ruta: join(MODULE_ROOT, 'ports', 'supplier-catalog-repository.ts'),
    constante: 'supplierCatalogRepository',
    adaptador: 'supplier-catalog-line-prisma.ts',
    metodosEsperados: 4,
  },
] as const

const LITERAL = 'scope: SupplierScope'

describe('R23 — el punto unico es de verdad UNA definicion', () => {
  // Toda la guardia se apoya en que «llegar hasta una envoltura de `./company-scope`» significa
  // «filtrar por empresa». Eso solo es cierto si las envolturas DELEGAN en la definicion unica y
  // esa definicion es la unica lectura de `scope.companyId` del modulo.
  it('company-scope.ts: `companyScope` es privada, es la unica lectura del ambito y las TRES envolturas delegan en ella', () => {
    const analizado = analizar(PUNTO_UNICO)
    const exportadas = analizado.funciones.filter((f) =>
      new RegExp(`^export\\s+function\\s+${f.nombre}\\b`, 'm').test(analizado.codigo),
    )
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      'catalogLineCompanyScope',
      'companyScopeColumns',
      'supplierCompanyScope',
    ])

    for (const envoltura of exportadas) {
      expect(
        envoltura.cuerpo.trim(),
        `${envoltura.nombre} tiene que delegar en \`companyScope\` y en nada mas: una segunda definicion de «de la empresa» es exactamente lo que R23 prohibe`,
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

describe('R23 — cada metodo de los dos puertos declara Y consume el ambito de empresa', () => {
  for (const puerto of PUERTOS) {
    const metodos = metodosDeLaInterfaz(puerto.ruta, puerto.nombre)
    const cableado = cableadoDe(puerto.constante, puerto.nombre)
    const adaptador = analizar(puerto.adaptador)

    it(`${puerto.nombre}: los ${String(puerto.metodosEsperados)} metodos estan cableados, con nombre, y ninguno se queda fuera`, () => {
      // Sin esto, un metodo NUEVO del puerto podria no aparecer en el barrido de abajo y la
      // guardia lo ignoraria en silencio, que es justo el fallo que viene a cerrar.
      expect(metodos.size).toBe(puerto.metodosEsperados)
      expect([...cableado.keys()].sort()).toEqual([...metodos.keys()].sort())
      for (const [metodo, implementacion] of cableado) {
        expect(
          implementacion,
          `${puerto.constante}.${metodo} no esta cableado a una funcion con nombre del adaptador: la guardia no puede seguir una lambda, un bind ni un spread`,
        ).toMatch(/^\w+$/)
      }
    })

    it(`${puerto.nombre}: el propio puerto EXIGE \`${LITERAL}\` en la firma de cada metodo`, () => {
      // La mitad que SI cierra el compilador, pero solo mientras la firma la traiga. Se ancla
      // aqui para que quitarla del puerto no deje la otra mitad vigilando una firma que ya no la
      // pide. Y nunca opcional: `scope?:` o un valor por defecto la desarmarian en silencio.
      for (const [metodo, parametros] of metodos) {
        expect(
          FORMA_DE_AMBITO.declaracion.test(parametros),
          `${puerto.nombre}.${metodo} ya no exige \`${LITERAL}\` en su firma (R23)`,
        ).toBe(true)
        expect(
          /\bscope\s*\?\s*:/.test(parametros) || /\bscope\s*:[^,)]*=/.test(parametros),
          `${puerto.nombre}.${metodo} declara el ambito OPCIONAL: entonces la llamada que lo olvide vuelve a compilar (R23)`,
        ).toBe(false)
      }
    })

    for (const metodo of metodos.keys()) {
      it(`${puerto.nombre}.${metodo} declara \`${LITERAL}\` y lo lleva hasta el punto unico`, () => {
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
          declaraElAmbito(funcion),
          `${puerto.adaptador}:${funcion.nombre} implementa ${puerto.nombre}.${metodo} SIN declarar \`${LITERAL}\`. TypeScript lo acepta -una funcion de menos parametros satisface la firma-, asi que la unica forma de que no se cuele es esta (R23)`,
        ).toBe(true)

        // 2. LO USA. Declararlo y no usarlo seria la misma fuga con mejor cara: la llamada
        //    compilaria, el ambito viajaria hasta aqui y la consulta leeria los proveedores de
        //    todas las empresas.
        expect(
          adaptador.consumidoras.has(funcion.nombre),
          `${puerto.adaptador}:${funcion.nombre} declara el ambito pero NO lo lleva hasta \`./company-scope\`: \`scope\` tiene que acabar en una de sus envolturas (${adaptador.envolturas.join(', ') || 'el archivo no importa ninguna'}), aqui o en un ayudante de este mismo archivo al que se le pase (R23)`,
        ).toBe(true)
      })
    }
  }
})

describe('R23 — `isSupplierAlive`: el punto que no es metodo de ningun puerto', () => {
  // Es la funcion que comparten el alta de linea y el listado del catalogo. Como no la cablea
  // `lib/composition`, el barrido por puerto no la mira; y sin ambito, un proveedor de otra
  // empresa seguiria pareciendo «vivo» para quien pregunte. Por eso tiene caso propio y no se
  // conforma con el barrido generico de mas abajo.
  const adaptador = analizar('supplier-catalog-line-prisma.ts')
  const funcion = adaptador.funciones.find((f) => f.nombre === 'isSupplierAlive')

  it('existe, toca la base y NO la cablea ningun puerto (anti-placebo de este describe)', () => {
    expect(funcion, 'supplier-catalog-line-prisma.ts deberia declarar isSupplierAlive').toBeTruthy()
    expect(funcion !== undefined && tocaLaBase(funcion.cuerpo)).toBe(true)

    const cableado = cableadoDe('supplierCatalogRepository', 'SupplierCatalogRepository')
    expect([...cableado.values()]).not.toContain('isSupplierAlive')
  })

  it('declara el ambito y lo compone con `supplierCompanyScope` en su propio `where`', () => {
    if (funcion === undefined) return
    expect(declaraElAmbito(funcion), `isSupplierAlive tiene que declarar \`${LITERAL}\``).toBe(true)
    expect(
      /\bsupplierCompanyScope\s*\(\s*scope\s*\)/.test(funcion.cuerpo),
      'isSupplierAlive tiene que acotar su `where` con `supplierCompanyScope(scope)`: sin eso, un proveedor de otra empresa responde «vivo» (R23)',
    ).toBe(true)
    expect(adaptador.consumidoras.has('isSupplierAlive')).toBe(true)
  })

  it('sus dos llamantes le pasan SU ambito, no uno construido a mano', () => {
    for (const llamante of ['createCatalogLine', 'listCatalogLinesBySupplierAlive']) {
      const f = adaptador.funciones.find((x) => x.nombre === llamante)
      expect(f, `${llamante} deberia existir`).toBeTruthy()
      if (f === undefined) continue
      expect(declaraElAmbito(f)).toBe(true)
      expect(
        /\bisSupplierAlive\s*\(\s*[\w.]+\s*,\s*scope\s*\)/.test(f.cuerpo),
        `${llamante} tiene que llamar a isSupplierAlive con su propio \`scope\` (R23)`,
      ).toBe(true)
    }
  })
})

describe('R23 — las escrituras sobre filas existentes llevan el ambito en el `where`', () => {
  // No es una comprobacion de parametro sino de ESTRUCTURA, y cubre los dos sitios donde acotar
  // «a medias» no se notaria: el arrastre del catalogo en la baja del proveedor -dos sentencias,
  // las dos acotadas- y el filtro por relacion de las dos escrituras de la linea, que tiene que
  // acotar TAMBIEN al proveedor y no solo a la linea.
  const proveedor = analizar('supplier-prisma.ts')
  const catalogo = analizar('supplier-catalog-line-prisma.ts')

  function argumentosDe(cuerpo: string, patron: RegExp): string {
    const match = patron.exec(cuerpo)
    if (match === null) return ''
    const abre = cuerpo.indexOf('(', match.index)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    return cierra === -1 ? '' : cuerpo.slice(abre + 1, cierra)
  }

  it('la baja del proveedor acota SUS DOS sentencias, dentro de la misma transaccion', () => {
    const funcion = proveedor.funciones.find((f) => f.nombre === 'softDeleteAliveSupplier')
    expect(funcion, 'deberia existir softDeleteAliveSupplier').toBeTruthy()
    if (funcion === undefined) return

    expect([...funcion.cuerpo.matchAll(/\bprisma\s*\.\s*\$transaction\s*\(/g)]).toHaveLength(1)

    const delProveedor = argumentosDe(funcion.cuerpo, /\btx\s*\.\s*supplier\s*\.\s*updateMany\s*\(/)
    expect(
      /\bsupplierCompanyScope\s*\(\s*scope\s*\)/.test(delProveedor),
      'el `updateMany` de `supplier` tiene que acotar su `where` con el ambito (R23)',
    ).toBe(true)

    const delCatalogo = argumentosDe(
      funcion.cuerpo,
      /\btx\s*\.\s*supplierCatalogLine\s*\.\s*updateMany\s*\(/,
    )
    expect(
      /\bcatalogLineCompanyScope\s*\(\s*scope\s*\)/.test(delCatalogo),
      'el arrastre del catalogo tiene que acotar TAMBIEN por el ambito de la linea: la linea lleva empresa PROPIA (R23)',
    ).toBe(true)
  })

  it('las dos escrituras de la linea acotan la linea Y el proveedor del que cuelga', () => {
    for (const nombre of ['replaceAliveCatalogLine', 'softDeleteAliveCatalogLine']) {
      const funcion = catalogo.funciones.find((f) => f.nombre === nombre)
      expect(funcion, `deberia existir ${nombre}`).toBeTruthy()
      if (funcion === undefined) continue

      const argumentos = argumentosDe(
        funcion.cuerpo,
        /\bprisma\s*\.\s*supplierCatalogLine\s*\.\s*updateMany\s*\(/,
      )
      expect(
        /\bcatalogLineCompanyScope\s*\(\s*scope\s*\)/.test(argumentos),
        `${nombre}: falta el ambito de la LINEA en el \`where\` (R23)`,
      ).toBe(true)
      expect(
        /\bsupplier\s*:\s*\{[^{}]*supplierCompanyScope\s*\(\s*scope\s*\)/.test(argumentos),
        `${nombre}: el filtro por relacion \`supplier\` tiene que llevar TAMBIEN el ambito del proveedor, no solo \`deletedAt: null\` (R23)`,
      ).toBe(true)
    }
  })

  it('los dos listados cuentan con el MISMO objeto `where` que traen', () => {
    // Un `total` calculado con otro `where` describiria un conjunto que la pagina no muestra.
    for (const [analizado, nombre, modelo] of [
      [proveedor, 'listAliveSuppliers', 'supplier'],
      [catalogo, 'listCatalogLinesBySupplierAlive', 'supplierCatalogLine'],
    ] as const) {
      const funcion = analizado.funciones.find((f) => f.nombre === nombre)
      expect(funcion, `deberia existir ${nombre}`).toBeTruthy()
      if (funcion === undefined) continue
      expect(
        new RegExp(`\\bprisma\\s*\\.\\s*${modelo}\\s*\\.\\s*count\\s*\\(\\s*\\{\\s*where\\s*\\}\\s*\\)`).test(
          funcion.cuerpo,
        ),
        `${nombre}: el \`count\` tiene que reutilizar literalmente el mismo objeto \`where\` del \`findMany\` (R23)`,
      ).toBe(true)
    }
  })
})

describe('R23, R24 — ninguna consulta del modulo se queda sin ambito, y NO hay lista de excepciones', () => {
  /** Los archivos de persistencia del modulo, leidos del disco y no de una lista a mano. */
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia se barren todos, y el troceo VE las consultas', () => {
    expect(archivos).toContain('supplier-prisma.ts')
    expect(archivos).toContain('supplier-catalog-line-prisma.ts')
    expect(archivos).toContain(PUNTO_UNICO)

    // ANTI-PLACEBO del troceador. Si `funcionesDe` dejara de reconocer las declaraciones -o se
    // quedara con la llave de un tipo de retorno-, el barrido de abajo no encontraria NINGUNA
    // funcion que toque la base y pasaria en verde sin mirar nada.
    const conConsulta = (archivo: string): readonly string[] =>
      analizar(archivo)
        .funciones.filter((f) => tocaLaBase(f.cuerpo))
        .map((f) => f.nombre)

    expect(conConsulta('supplier-prisma.ts').length).toBeGreaterThanOrEqual(5)
    expect(conConsulta('supplier-prisma.ts')).toContain('softDeleteAliveSupplier')
    expect(conConsulta('supplier-catalog-line-prisma.ts').length).toBeGreaterThanOrEqual(5)
    expect(conConsulta('supplier-catalog-line-prisma.ts')).toContain('isSupplierAlive')
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito`, () => {
      const analizado = analizar(archivo)

      // Ninguna consulta vive FUERA de una `function` que el troceo vea. Sin esto, una consulta
      // escrita como `const leer = async () => prisma.supplier.findMany()` no entraria en el
      // barrido y la guardia la ignoraria sin decir nada.
      for (const match of analizado.codigo.matchAll(TOCA_LA_BASE)) {
        const dentro = analizado.funciones.some((f) => match.index > f.inicio && match.index < f.fin)
        const linea = analizado.codigo.slice(0, match.index).split('\n').length
        expect(
          dentro,
          `${archivo}:${String(linea)} ejecuta una consulta fuera de una \`function\` declarada: la guardia no puede comprobar su ambito. Escribela como \`function\` que declare \`${LITERAL}\``,
        ).toBe(true)
      }

      for (const funcion of analizado.funciones) {
        if (!tocaLaBase(funcion.cuerpo)) continue

        // SIN excepciones: aqui no hay ningun `if (EXCEPCIONES.has(...)) continue`, ni una
        // funcion eximida por nombre. `proveedores` no tiene ninguna consulta sin ambito
        // aprobada.
        expect(
          declaraElAmbito(funcion),
          `${archivo}:${funcion.nombre} consulta la base SIN declarar \`${LITERAL}\`. \`proveedores\` NO tiene ninguna consulta sin ambito aprobada (R23, R24)`,
        ).toBe(true)
        expect(
          analizado.consumidoras.has(funcion.nombre),
          `${archivo}:${funcion.nombre} declara el ambito pero no lo lleva hasta las envolturas de \`./company-scope\`: un ambito que no entra en el \`where\` -o en lo que se escribe- no filtra nada (R23)`,
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
            `${archivo}:${String(linea)} lee la empresa del ambito a mano. Eso es una segunda definicion de «de la empresa»: usa \`supplierCompanyScope(scope)\`/\`catalogLineCompanyScope(scope)\` en un \`where\` o \`companyScopeColumns(scope)\` en lo que se escribe (R23)`,
          ).toBeNull()
        }
      })
    }
  }

  it('R24: no existe NINGUNA lista de excepciones de ambito, ni en esta guardia ni en el modulo', () => {
    // La ultima del repo murio con el arco multiempresa y esta ficha no abre otra. Se afirma
    // sobre el texto de esta propia guardia -para que no se pueda «arreglar» un hallazgo
    // metiendo el nombre de la funcion en una constante- y sobre el modulo entero.
    const estaGuardia = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // Lo que se busca es la DECLARACION de la lista, no la palabra suelta: la palabra aparece
    // en este mismo caso -es lo que se persigue- y un patron por palabra se delataria a si
    // mismo sin vigilar nada.
    const NOMBRES_DE_LISTA = ['SIN_AMBITO_POR_DECISION_APROBADA', 'EXCEPCIONES', 'EXENTAS']
    const marcas = NOMBRES_DE_LISTA.map(
      (nombre) => new RegExp(`^\\s*(?:const|let|type|enum)\\s+${nombre}\\b`, 'm'),
    )

    for (const [indice, marca] of marcas.entries()) {
      expect(
        marca.test(sinComentarios(estaGuardia)),
        `esta guardia declara una lista de excepciones (${NOMBRES_DE_LISTA[indice] ?? ''}): R24 no admite ninguna`,
      ).toBe(false)
    }

    // Anti-placebo del patron: sobre un texto que SI la declararia, cae.
    expect(marcas.some((marca) => marca.test('const EXCEPCIONES = new Set([])'))).toBe(true)

    const fuentesDelModulo = (dir: string): readonly string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(dir, entrada.name)
        if (entrada.isDirectory()) return fuentesDelModulo(ruta)
        return entrada.isFile() && ruta.endsWith('.ts') ? [ruta] : []
      })

    for (const ruta of fuentesDelModulo(MODULE_ROOT)) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
      for (const marca of marcas) {
        expect(marca.test(codigo), `${ruta} declara una lista de excepciones de ambito`).toBe(false)
      }
    }
  })
})
