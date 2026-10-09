// GUARDIA — el ambito de empresa de `integraciones`, comprobado FUNCION POR FUNCION.
//
// Calcada de `guard-ambito-empresa-clientes.test.ts`, y por el mismo motivo: el puerto exige
// `scope: IntegracionesScope` en cada firma, asi que una LLAMADA que lo omita no compila; pero una
// IMPLEMENTACION que lo omita SI compila, porque TypeScript acepta una funcion de menor aridad donde
// se espera una de mayor. Un `findFirst` sin ambito se cablea y lee las conexiones de TODAS las
// empresas, con sus secretos cifrados.
//
// De cada funcion de persistencia del modulo comprueba las dos mitades: que DECLARA el ambito y que
// ese valor LLEGA hasta una envoltura de `./company-scope`. Sin lista de excepciones.
//
// Diferencia con la de `clientes`: el puerto se ata a su adaptador con la tabla `ADAPTADOR_DE` de
// abajo, no leyendo `lib/composition`. Cuando la composicion lo cablee, el cableado tiene que usar
// exactamente esas funciones; eso lo fija quien lo cablee.
//
// TECNICA: barrido de TEXTO sobre el disco, como el resto de `tests/guards/`.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'integraciones')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

const PUNTO_UNICO = 'company-scope.ts'
const ADAPTADOR = 'whatsapp-connection-prisma.ts'

const FORMA_DE_AMBITO = {
  identificador: 'scope',
  declaracion: /\bscope\s*:\s*IntegracionesScope\b/,
} as const
const LITERAL = 'scope: IntegracionesScope'

const PUERTO = {
  nombre: 'WhatsappConnectionRepository',
  ruta: join(MODULE_ROOT, 'ports', 'whatsapp-connection-repository.ts'),
  metodosEsperados: 4,
} as const

/** Metodo del puerto -> funcion del adaptador que lo implementa. */
const ADAPTADOR_DE: Readonly<Record<string, string>> = {
  findLive: 'findLiveWhatsappConnection',
  findLiveById: 'findLiveWhatsappConnectionById',
  create: 'insertWhatsappConnection',
  update: 'updateLiveWhatsappConnection',
}

// --- Lectura y troceado del texto -------------------------------------------------------------

function sinComentarios(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
}

function vaciarCadenas(source: string): string {
  const vaciar = (match: string): string =>
    match.charAt(0) + match.slice(1, -1).replace(/[^\n]/g, ' ') + match.charAt(match.length - 1)
  return source
    .replace(/'(?:\\.|[^'\\\n])*'/g, vaciar)
    .replace(/"(?:\\.|[^"\\\n])*"/g, vaciar)
    .replace(/`(?:\\.|[^`\\])*`/g, vaciar)
}

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
  readonly cuerpo: string
  readonly inicio: number
  readonly fin: number
}

/** La primera llave que termina la linea despues de los parametros: la del cuerpo, no la de un tipo. */
function inicioDelCuerpo(codigo: string, desde: number): number {
  for (let i = desde; i < codigo.length; i += 1) {
    if (codigo[i] !== '{') continue
    if (/^[ \t]*\r?\n/.test(codigo.slice(i + 1))) return i
  }
  return -1
}

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

function declaraElAmbito(funcion: FuncionDeclarada): boolean {
  return FORMA_DE_AMBITO.declaracion.test(funcion.parametros)
}

/** ¿Alguna llamada a `nombre` en `cuerpo` recibe el ambito, directo o por una variable local? */
function lePasaElAmbito(cuerpo: string, nombre: string): boolean {
  const llamada = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
  const valor = new RegExp(`\\b${FORMA_DE_AMBITO.identificador}\\b`)

  const variablesConAmbito = new Set<string>()
  for (const m of cuerpo.matchAll(/\b(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*([^;]+);/g)) {
    if (valor.test(m[2] ?? '')) variablesConAmbito.add(m[1] ?? '')
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

function envolturasImportadas(source: string): readonly string[] {
  const importacion = /import\s*\{([^}]*)\}\s*from\s*'\.\/company-scope'/.exec(source)
  if (importacion === null) return []
  return (importacion[1] ?? '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0)
}

const TOCA_LA_BASE = /\b(?:prisma|tx)\s*\.\s*(?:\$\w+|\w+\s*\.\s*\w+)\s*[(<]/g
const tocaLaBase = (cuerpo: string): boolean => new RegExp(TOCA_LA_BASE.source).test(cuerpo)

const LECTURA_SUELTA: readonly RegExp[] = [
  /\bscope\s*\??\.\s*companyId\b/,
  /\bscope\s*\[/,
  /\{[^{}]*\bcompanyId\b[^{}]*\}\s*=\s*scope\b/,
]

type ArchivoAnalizado = {
  readonly codigo: string
  readonly funciones: readonly FuncionDeclarada[]
  readonly envolturas: readonly string[]
  readonly consumidoras: ReadonlySet<string>
}

/** Trabaja sobre el TEXTO para que los casos de sensibilidad puedan darle un fuente sintetico. */
function analizarFuente(source: string): ArchivoAnalizado {
  const codigo = vaciarCadenas(sinComentarios(source))
  const funciones = funcionesDe(codigo)
  const envolturas = envolturasImportadas(source)

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

  return { codigo, funciones, envolturas, consumidoras }
}

function analizar(archivo: string): ArchivoAnalizado {
  return analizarFuente(readFileSync(join(PERSISTENCE_ROOT, archivo), 'utf8'))
}

/** Los hallazgos de un archivo de persistencia: lo que la guardia rechaza, en una lista. */
function hallazgosDe(nombre: string, analizado: ArchivoAnalizado, esPuntoUnico: boolean): readonly string[] {
  const hallazgos: string[] = []

  for (const match of analizado.codigo.matchAll(TOCA_LA_BASE)) {
    const dentro = analizado.funciones.some((f) => match.index > f.inicio && match.index < f.fin)
    if (!dentro) {
      const linea = analizado.codigo.slice(0, match.index).split('\n').length
      hallazgos.push(`${nombre}:${String(linea)} consulta fuera de una \`function\` declarada`)
    }
  }

  for (const funcion of analizado.funciones) {
    if (!tocaLaBase(funcion.cuerpo)) continue
    if (!declaraElAmbito(funcion)) {
      hallazgos.push(`${nombre}:${funcion.nombre} consulta la base sin declarar \`${LITERAL}\``)
    } else if (!analizado.consumidoras.has(funcion.nombre)) {
      hallazgos.push(`${nombre}:${funcion.nombre} declara el ambito pero no lo lleva a \`./company-scope\``)
    }
  }

  if (!esPuntoUnico) {
    for (const patron of LECTURA_SUELTA) {
      const match = patron.exec(analizado.codigo)
      if (match !== null) {
        const linea = analizado.codigo.slice(0, match.index).split('\n').length
        hallazgos.push(`${nombre}:${String(linea)} lee la empresa del ambito a mano`)
      }
    }
  }

  return hallazgos
}

function metodosDeLaInterfaz(ruta: string, interfaz: string): ReadonlyMap<string, string> {
  const source = vaciarCadenas(sinComentarios(readFileSync(ruta, 'utf8')))
  const inicio = source.indexOf(`export interface ${interfaz} {`)
  expect(inicio, `no se encontro la interfaz ${interfaz} en ${ruta}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  const cuerpo = source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))

  const metodos = new Map<string, string>()
  for (const match of cuerpo.matchAll(/^\s{2}(\w+)\s*\(/gm)) {
    const abreM = cuerpo.indexOf('(', match.index)
    metodos.set(match[1] ?? '', cuerpo.slice(abreM + 1, cierreEquilibrado(cuerpo, abreM, '(', ')')))
  }
  return metodos
}

// --- Casos -------------------------------------------------------------------------------------

describe('R2 — el punto unico de integraciones es de verdad UNA definicion', () => {
  it('company-scope.ts: `companyScope` es privada, es la unica lectura del ambito y las dos envolturas delegan en ella', () => {
    const analizado = analizar(PUNTO_UNICO)
    const exportadas = analizado.funciones.filter((f) =>
      new RegExp(`^export\\s+function\\s+${f.nombre}\\b`, 'm').test(analizado.codigo),
    )
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      'companyScopeColumns',
      'whatsappConnectionCompanyScope',
    ])

    for (const envoltura of exportadas) {
      expect(
        envoltura.cuerpo.trim(),
        `${envoltura.nombre} tiene que delegar en \`companyScope\` y en nada mas`,
      ).toMatch(/^return\s+companyScope\s*\(\s*scope\s*\)\s*;?$/)
    }

    const privada = analizado.funciones.find((f) => f.nombre === 'companyScope')
    expect(privada, 'company-scope.ts tiene que declarar la funcion `companyScope`').toBeTruthy()
    expect(analizado.codigo).not.toMatch(/export\s+function\s+companyScope\b/)

    const lecturas = [...analizado.codigo.matchAll(/\bscope\s*\.\s*companyId\b/g)]
    expect(lecturas, 'el punto unico lee `scope.companyId` una sola vez').toHaveLength(1)
    const posicion = lecturas[0]?.index ?? -1
    expect(privada !== undefined && posicion > privada.inicio && posicion < privada.fin).toBe(true)
  })
})

describe('R2 — cada metodo del puerto declara Y consume el ambito de empresa', () => {
  const metodos = metodosDeLaInterfaz(PUERTO.ruta, PUERTO.nombre)
  const adaptador = analizar(ADAPTADOR)

  it(`${PUERTO.nombre}: los ${String(PUERTO.metodosEsperados)} metodos tienen su funcion en el adaptador, y ninguno se queda fuera`, () => {
    expect(metodos.size).toBe(PUERTO.metodosEsperados)
    expect(Object.keys(ADAPTADOR_DE).sort()).toEqual([...metodos.keys()].sort())
  })

  it(`${PUERTO.nombre}: el propio puerto EXIGE \`${LITERAL}\` en cada firma, y no opcional`, () => {
    for (const [metodo, parametros] of metodos) {
      expect(FORMA_DE_AMBITO.declaracion.test(parametros), `${metodo} ya no exige \`${LITERAL}\``).toBe(true)
      expect(
        /\bscope\s*\?\s*:/.test(parametros) || /\bscope\s*:[^,)]*=/.test(parametros),
        `${metodo} declara el ambito opcional`,
      ).toBe(false)
    }
  })

  for (const [metodo, implementacion] of Object.entries(ADAPTADOR_DE)) {
    it(`${PUERTO.nombre}.${metodo} -> ${implementacion} declara \`${LITERAL}\` y lo lleva hasta el punto unico`, () => {
      const funcion = adaptador.funciones.find((f) => f.nombre === implementacion)
      expect(funcion, `${ADAPTADOR} no declara ${implementacion}`).toBeTruthy()
      if (funcion === undefined) return
      expect(new RegExp(`^export\\s+async\\s+function\\s+${implementacion}\\b`, 'm').test(adaptador.codigo)).toBe(true)
      expect(declaraElAmbito(funcion), `${implementacion} no declara \`${LITERAL}\``).toBe(true)
      expect(adaptador.consumidoras.has(funcion.nombre), `${implementacion} no lleva el ambito a ./company-scope`).toBe(true)
    })
  }

  it('R2 — la escritura sobre una fila existente lleva el ambito en el `where` de su `updateMany`', () => {
    const funcion = adaptador.funciones.find((f) => f.nombre === ADAPTADOR_DE.update)
    expect(funcion).toBeTruthy()
    const cuerpo = funcion?.cuerpo ?? ''
    const match = /\bprisma\s*\.\s*whatsappConnection\s*\.\s*updateMany\s*\(/.exec(cuerpo)
    expect(match, 'la actualizacion tiene que ser un `updateMany` acotado').not.toBeNull()
    const abre = cuerpo.indexOf('(', match?.index ?? 0)
    const argumentos = cuerpo.slice(abre + 1, cierreEquilibrado(cuerpo, abre, '(', ')'))
    expect(/\bwhatsappConnectionCompanyScope\s*\(\s*scope\s*\)/.test(argumentos)).toBe(true)
  })
})

describe('R2 — ninguna consulta del modulo se queda sin ambito, y NO hay lista de excepciones', () => {
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia se barren todos, y el troceo VE las consultas', () => {
    expect(archivos).toContain(ADAPTADOR)
    expect(archivos).toContain(PUNTO_UNICO)
    const conConsulta = analizar(ADAPTADOR)
      .funciones.filter((f) => tocaLaBase(f.cuerpo))
      .map((f) => f.nombre)
    expect(conConsulta.sort()).toEqual(Object.values(ADAPTADOR_DE).sort())
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito, y nadie lee la empresa a mano`, () => {
      expect(hallazgosDe(archivo, analizar(archivo), archivo === PUNTO_UNICO)).toEqual([])
    })
  }

  it('no existe ninguna lista de excepciones de ambito en el modulo', () => {
    const marcas = ['SIN_AMBITO_POR_DECISION_APROBADA', 'EXCEPCIONES', 'EXENTAS'].map(
      (nombre) => new RegExp(`^\\s*(?:const|let|type|enum)\\s+${nombre}\\b`, 'm'),
    )
    expect(marcas.some((marca) => marca.test('const EXCEPCIONES = new Set([])'))).toBe(true)

    const fuentesDelModulo = (dir: string): readonly string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(dir, entrada.name)
        if (entrada.isDirectory()) return fuentesDelModulo(ruta)
        return entrada.isFile() && ruta.endsWith('.ts') ? [ruta] : []
      })

    const fuentes = [...fuentesDelModulo(MODULE_ROOT), fileURLToPath(import.meta.url)]
    for (const ruta of fuentes) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
      for (const marca of marcas) {
        expect(marca.test(codigo), `${ruta} declara una lista de excepciones de ambito`).toBe(false)
      }
    }
  })
})

describe('R2 — sensibilidad: la guardia muerde con fuentes sinteticos', () => {
  const CABECERA = "import { whatsappConnectionCompanyScope } from './company-scope'\n"

  it('una consulta sin `scope` en la firma da hallazgo', () => {
    const fuente =
      CABECERA +
      'export async function leak(id: string) {\n' +
      '  return prisma.whatsappConnection.findFirst({ where: { id } })\n' +
      '}\n'
    expect(hallazgosDe('x.ts', analizarFuente(fuente), false).join('\n')).toMatch(/sin declarar/)
  })

  it('declarar el ambito y no llevarlo al punto unico da hallazgo', () => {
    const fuente =
      CABECERA +
      'export async function leak(id: string, scope: IntegracionesScope) {\n' +
      '  return prisma.whatsappConnection.findFirst({ where: { id } })\n' +
      '}\n'
    expect(hallazgosDe('x.ts', analizarFuente(fuente), false).join('\n')).toMatch(/no lo lleva/)
  })

  it('leer `scope.companyId` a mano fuera del punto unico da hallazgo', () => {
    const fuente =
      CABECERA +
      'export async function leak(id: string, scope: IntegracionesScope) {\n' +
      '  return prisma.whatsappConnection.findFirst({ where: { id, companyId: scope.companyId, ...whatsappConnectionCompanyScope(scope) } })\n' +
      '}\n'
    expect(hallazgosDe('x.ts', analizarFuente(fuente), false).join('\n')).toMatch(/a mano/)
  })

  it('una consulta fuera de una `function` declarada da hallazgo', () => {
    const fuente = CABECERA + 'export const leak = () => prisma.whatsappConnection.findMany({})\n'
    expect(hallazgosDe('x.ts', analizarFuente(fuente), false).join('\n')).toMatch(/fuera de una/)
  })

  it('el ambito llevado por un ayudante del mismo archivo cuenta como consumido', () => {
    const fuente =
      CABECERA +
      'function whereOf(id: string, scope: IntegracionesScope) {\n' +
      '  return { id, ...whatsappConnectionCompanyScope(scope) }\n' +
      '}\n' +
      'export async function ok(id: string, scope: IntegracionesScope) {\n' +
      '  return prisma.whatsappConnection.findFirst({ where: whereOf(id, scope) })\n' +
      '}\n'
    expect(hallazgosDe('x.ts', analizarFuente(fuente), false)).toEqual([])
  })
})
