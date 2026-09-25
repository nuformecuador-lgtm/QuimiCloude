// GUARDIA — el ambito de empresa de `clientes`, comprobado FUNCION POR FUNCION.
//
// Calcada de `guard-ambito-empresa-proveedores.test.ts`, y por el MISMO motivo, que es lo unico
// que justifica una guardia mas.
//
// POR QUE EXISTE. El ambito esta en la firma del puerto, asi que una LLAMADA que lo omita no
// compila: los cinco metodos de `CustomerRepository` exigen `scope: CustomerScope` al final de
// la firma. Pero una IMPLEMENTACION que lo omita SI COMPILA. TypeScript admite asignar una
// funcion de MENOR aridad donde se espera una de mayor, y asi es exactamente como
// `lib/composition/index.ts` ata las funciones sueltas del adaptador driven al puerto:
//
//     interface Repo { findAliveById(id: string, scope: Scope): Promise<Row | null> }
//     async function findAliveById(id: string): Promise<Row | null> { ... }
//     const repo: Repo = { findAliveById }            // COMPILA, exit 0
//
// Un `findFirst` nuevo sin ambito compila, se cablea y lee los clientes de TODAS las empresas.
//
// De cada funcion de persistencia del modulo comprueba LAS DOS MITADES:
//
//   1. que DECLARA el ambito (`scope: CustomerScope`), y
//   2. que ese valor LLEGA de verdad hasta una envoltura de `./company-scope` -directamente o a
//      traves de un ayudante del mismo archivo al que se le pasa-. Declararlo y no usarlo seria
//      la misma fuga con mejor cara.
//
// **SIN LISTA DE EXCEPCIONES.** No hay ninguna en el modulo y esta guardia no crea ninguna.
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
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'clientes')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

/** El punto unico. Es el UNICO archivo de persistencia que puede leer `scope.companyId`. */
const PUNTO_UNICO = 'company-scope.ts'

/** La UNICA forma en que una funcion de persistencia de este modulo declara el ambito. */
const FORMA_DE_AMBITO = { identificador: 'scope', declaracion: /\bscope\s*:\s*CustomerScope\b/ } as const

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
  readonly inicio: number
  readonly fin: number
}

/**
 * Donde EMPIEZA el cuerpo: la primera llave que TERMINA LA LINEA despues de los parametros, que
 * es donde prettier deja siempre la del cuerpo y nunca la de un tipo en linea.
 */
function inicioDelCuerpo(codigo: string, desde: number): number {
  for (let i = desde; i < codigo.length; i += 1) {
    if (codigo[i] !== '{') continue
    if (/^[ \t]*\r?\n/.test(codigo.slice(i + 1))) return i
  }
  return -1
}

/** Todas las `function` de nivel superior de un archivo, con sus parametros y su cuerpo. */
function funcionesDe(codigo: string): readonly FuncionDeclarada[] {
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

/** «Toca la base» = ejecuta algo por el cliente (`prisma.`): un modelo (`prisma.customer.findFirst(`). */
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
  const codigo = vaciarCadenas(sinComentarios(source))
  const funciones = funcionesDe(codigo)
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

// --- El puerto y su cableado --------------------------------------------------------------

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
    cableado.set(entrada, '')
  }
  return cableado
}

const PUERTO = {
  nombre: 'CustomerRepository',
  ruta: join(MODULE_ROOT, 'ports', 'customer-repository.ts'),
  constante: 'customerRepository',
  adaptador: 'customer-prisma.ts',
  metodosEsperados: 5,
} as const

const LITERAL = 'scope: CustomerScope'

describe('R12 — el punto unico es de verdad UNA definicion', () => {
  it('company-scope.ts: `companyScope` es privada, es la unica lectura del ambito y las DOS envolturas delegan en ella', () => {
    const analizado = analizar(PUNTO_UNICO)
    const exportadas = analizado.funciones.filter((f) =>
      new RegExp(`^export\\s+function\\s+${f.nombre}\\b`, 'm').test(analizado.codigo),
    )
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      'companyScopeColumns',
      'customerCompanyScope',
    ])

    for (const envoltura of exportadas) {
      expect(
        envoltura.cuerpo.trim(),
        `${envoltura.nombre} tiene que delegar en \`companyScope\` y en nada mas: una segunda definicion de «de la empresa» es exactamente lo que esta guardia prohibe`,
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

describe('R12 — cada metodo del puerto declara Y consume el ambito de empresa', () => {
  const metodos = metodosDeLaInterfaz(PUERTO.ruta, PUERTO.nombre)
  const cableado = cableadoDe(PUERTO.constante, PUERTO.nombre)
  const adaptador = analizar(PUERTO.adaptador)

  it(`${PUERTO.nombre}: los ${String(PUERTO.metodosEsperados)} metodos estan cableados, con nombre, y ninguno se queda fuera`, () => {
    expect(metodos.size).toBe(PUERTO.metodosEsperados)
    expect([...cableado.keys()].sort()).toEqual([...metodos.keys()].sort())
    for (const [metodo, implementacion] of cableado) {
      expect(
        implementacion,
        `${PUERTO.constante}.${metodo} no esta cableado a una funcion con nombre del adaptador: la guardia no puede seguir una lambda, un bind ni un spread`,
      ).toMatch(/^\w+$/)
    }
  })

  it(`${PUERTO.nombre}: el propio puerto EXIGE \`${LITERAL}\` en la firma de cada metodo`, () => {
    for (const [metodo, parametros] of metodos) {
      expect(
        FORMA_DE_AMBITO.declaracion.test(parametros),
        `${PUERTO.nombre}.${metodo} ya no exige \`${LITERAL}\` en su firma (R12)`,
      ).toBe(true)
      expect(
        /\bscope\s*\?\s*:/.test(parametros) || /\bscope\s*:[^,)]*=/.test(parametros),
        `${PUERTO.nombre}.${metodo} declara el ambito OPCIONAL: entonces la llamada que lo olvide vuelve a compilar (R12)`,
      ).toBe(false)
    }
  })

  for (const metodo of metodos.keys()) {
    it(`${PUERTO.nombre}.${metodo} declara \`${LITERAL}\` y lo lleva hasta el punto unico`, () => {
      const implementacion = cableado.get(metodo)
      expect(implementacion, `${metodo} no esta cableado en lib/composition`).toBeTruthy()

      const funcion = adaptador.funciones.find((f) => f.nombre === implementacion)
      expect(
        funcion,
        `${PUERTO.adaptador} no declara la funcion ${implementacion ?? '?'} que cablea ${metodo}`,
      ).toBeTruthy()
      if (funcion === undefined) return

      // 1. LA DECLARA. El compilador NO lo exige: una implementacion de menor aridad satisface
      //    la firma del puerto. Esta linea es lo unico que lo impide.
      expect(
        declaraElAmbito(funcion),
        `${PUERTO.adaptador}:${funcion.nombre} implementa ${PUERTO.nombre}.${metodo} SIN declarar \`${LITERAL}\`. TypeScript lo acepta -una funcion de menos parametros satisface la firma-, asi que la unica forma de que no se cuele es esta (R12)`,
      ).toBe(true)

      // 2. LO USA. Declararlo y no usarlo seria la misma fuga con mejor cara.
      expect(
        adaptador.consumidoras.has(funcion.nombre),
        `${PUERTO.adaptador}:${funcion.nombre} declara el ambito pero NO lo lleva hasta \`./company-scope\`: \`scope\` tiene que acabar en una de sus envolturas (${adaptador.envolturas.join(', ') || 'el archivo no importa ninguna'}), aqui o en un ayudante de este mismo archivo al que se le pase (R12)`,
      ).toBe(true)
    })
  }
})

describe('R12 — las escrituras sobre filas existentes llevan el ambito en el `where`', () => {
  const adaptador = analizar('customer-prisma.ts')

  function argumentosDe(cuerpo: string, patron: RegExp): string {
    const match = patron.exec(cuerpo)
    if (match === null) return ''
    const abre = cuerpo.indexOf('(', match.index)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    return cierra === -1 ? '' : cuerpo.slice(abre + 1, cierra)
  }

  it.each(['updateAliveCustomer', 'softDeleteAliveCustomer'])('%s acota su `updateMany` con el ambito', (nombre) => {
    const funcion = adaptador.funciones.find((f) => f.nombre === nombre)
    expect(funcion, `deberia existir ${nombre}`).toBeTruthy()
    if (funcion === undefined) return

    const argumentos = argumentosDe(funcion.cuerpo, /\bprisma\s*\.\s*customer\s*\.\s*updateMany\s*\(/)
    expect(
      /\bcustomerCompanyScope\s*\(\s*scope\s*\)/.test(argumentos),
      `${nombre}: el \`updateMany\` tiene que acotar su \`where\` con el ambito (R12)`,
    ).toBe(true)
  })

  it('el listado cuenta con el MISMO objeto `where` que trae', () => {
    const funcion = adaptador.funciones.find((f) => f.nombre === 'listAliveCustomers')
    expect(funcion, 'deberia existir listAliveCustomers').toBeTruthy()
    if (funcion === undefined) return
    expect(
      /\bprisma\s*\.\s*customer\s*\.\s*count\s*\(\s*\{\s*where\s*\}\s*\)/.test(funcion.cuerpo),
      'listAliveCustomers: el `count` tiene que reutilizar literalmente el mismo objeto `where` del `findMany` (R12)',
    ).toBe(true)
  })
})

describe('R12 — ninguna consulta del modulo se queda sin ambito, y NO hay lista de excepciones', () => {
  /** Los archivos de persistencia del modulo, leidos del disco y no de una lista a mano. */
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia se barren todos, y el troceo VE las consultas', () => {
    expect(archivos).toContain('customer-prisma.ts')
    expect(archivos).toContain(PUNTO_UNICO)

    // ANTI-PLACEBO del troceador. Si `funcionesDe` dejara de reconocer las declaraciones -o se
    // quedara con la llave de un tipo de retorno-, el barrido de abajo no encontraria NINGUNA
    // funcion que toque la base y pasaria en verde sin mirar nada.
    const conConsulta = (archivo: string): readonly string[] =>
      analizar(archivo)
        .funciones.filter((f) => tocaLaBase(f.cuerpo))
        .map((f) => f.nombre)

    expect(conConsulta('customer-prisma.ts').length).toBeGreaterThanOrEqual(5)
    expect(conConsulta('customer-prisma.ts')).toContain('softDeleteAliveCustomer')
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito`, () => {
      const analizado = analizar(archivo)

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

        expect(
          declaraElAmbito(funcion),
          `${archivo}:${funcion.nombre} consulta la base SIN declarar \`${LITERAL}\`. \`clientes\` NO tiene ninguna consulta sin ambito aprobada (R12)`,
        ).toBe(true)
        expect(
          analizado.consumidoras.has(funcion.nombre),
          `${archivo}:${funcion.nombre} declara el ambito pero no lo lleva hasta las envolturas de \`./company-scope\`: un ambito que no entra en el \`where\` -o en lo que se escribe- no filtra nada (R12)`,
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
            `${archivo}:${String(linea)} lee la empresa del ambito a mano. Eso es una segunda definicion de «de la empresa»: usa \`customerCompanyScope(scope)\` en un \`where\` o \`companyScopeColumns(scope)\` en lo que se escribe (R12)`,
          ).toBeNull()
        }
      })
    }
  }

  it('no existe NINGUNA lista de excepciones de ambito, ni en esta guardia ni en el modulo', () => {
    const estaGuardia = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const NOMBRES_DE_LISTA = ['SIN_AMBITO_POR_DECISION_APROBADA', 'EXCEPCIONES', 'EXENTAS']
    const marcas = NOMBRES_DE_LISTA.map(
      (nombre) => new RegExp(`^\\s*(?:const|let|type|enum)\\s+${nombre}\\b`, 'm'),
    )

    for (const [indice, marca] of marcas.entries()) {
      expect(
        marca.test(sinComentarios(estaGuardia)),
        `esta guardia declara una lista de excepciones (${NOMBRES_DE_LISTA[indice] ?? ''}): no se admite ninguna`,
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
