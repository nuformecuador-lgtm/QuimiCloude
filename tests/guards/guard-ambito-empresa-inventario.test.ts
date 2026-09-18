// GUARDIA (QC-49 R13) — el ambito de empresa, comprobado FUNCION POR FUNCION.
//
// POR QUE EXISTE, que es lo unico que justifica una guardia mas.
//
// El spec de QC-49 daba por hecho que el compilador cerraba R13 entero: «una implementacion o
// una llamada que omita el ambito NO DEBE compilar». La mitad de la LLAMADA es cierta -pasar
// menos argumentos de los que declara la firma es un error de tipos-. La mitad de la
// IMPLEMENTACION es FALSA, y se verifico con el `tsc` de este repo:
//
//     interface Repo { findAliveById(id: string, scope: Scope): Promise<string | null> }
//     async function findAliveById(id: string): Promise<string | null> { return id }
//     const repo: Repo = { findAliveById }            // COMPILA, exit 0
//
// TypeScript admite asignar una funcion de MENOR aridad donde se espera una de mayor, y asi es
// exactamente como `lib/composition/index.ts` ata las funciones sueltas de los adaptadores a
// `ProductRepository` y `PresentationRepository`. Las ESCRITURAS se salvan de rebote -Prisma
// exige `companyId: string` obligatorio en los `…UncheckedCreateInput`-, pero las LECTURAS no
// tienen ese seguro: un `findFirst` nuevo sin ambito compila, se cablea y lee lo de todas las
// empresas.
//
// Y las dos guardias estaticas de `tests/unit/inventario/company-scope.test.ts` son POR ARCHIVO
// -que `product-prisma.ts`/`presentation-prisma.ts` no escriban `companyId: scope.companyId` a
// mano y que importen `./company-scope`-. Un metodo de lectura NUEVO que omita el ambito las pasa
// las dos: el archivo sigue importando el punto unico por culpa de sus otras once consultas.
//
// Esta guardia es la que muerde con UNA sola funcion mal escrita. De cada funcion de persistencia
// del modulo comprueba LAS DOS MITADES:
//   1. que DECLARA el parametro `scope: InventoryScope`, y
//   2. que lo USA de verdad en el cuerpo -que el `scope` llega hasta una de las envolturas del
//      punto unico (`./company-scope`), directamente o a traves de un ayudante del mismo archivo
//      al que se le pasa-. Declararlo y no usarlo seria la misma fuga con mejor cara.
//
// No hay ninguna excepcion permitida: toda funcion del modulo que toque `prisma.` sin ambito
// pone esto en rojo. QC-50 cerro la unica excepcion que existia (`findProductRefs`) y con eso
// borro tambien `SIN_AMBITO_POR_DECISION_APROBADA` y la rama que la comprobaba: con la lista
// vacia esa rama era codigo muerto -nunca se ejecutaba-, y `docs/architecture.md` es explicito:
// "No se prepara infraestructura por si acaso". Guardar la maquinaria de una excepcion que hoy
// no protege nada, para una hipotetica de manana, es exactamente eso. Si alguna ficha futura
// necesita abrir una excepcion de ambito, la aprueba un humano en el spec y trae su propia
// comprobacion: no se hereda de aqui.
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
const MODULE_ROOT = join(repoRoot, 'lib', 'modules', 'inventario')
const PERSISTENCE_ROOT = join(MODULE_ROOT, 'adapters', 'driven', 'persistence')

/** El parametro exacto que toda funcion de persistencia del modulo tiene que declarar. */
const PARAMETRO_DE_AMBITO = /\bscope\s*:\s*InventoryScope\b/

// --- Lectura y troceado del texto -------------------------------------------------------------

/**
 * Deja el CODIGO: sin comentarios -la prosa explica la regla y no puede contar como
 * implementacion- y sin el contenido de las cadenas, para que ningun parentesis ni llave de
 * dentro de un literal descuadre el conteo de abajo.
 */
function soloCodigo(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
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
  readonly cuerpo: string
}

/**
 * Donde EMPIEZA el cuerpo, que no es simplemente «la primera llave despues de los parametros».
 *
 * El tipo de retorno puede traer llaves suyas -`Promise<{ id: string } | 'duplicate'>`- y
 * quedarse con esa llave daria por cuerpo `{ id: string }`, o sea un cuerpo sin ni una consulta:
 * la guardia leeria una funcion que no existe y daria VERDE por el motivo equivocado. Se toma la
 * primera llave que TERMINA LA LINEA, que es donde prettier deja siempre la del cuerpo y nunca
 * la de un tipo en linea.
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
    const abreParams = codigo.indexOf('(', match.index ?? 0)
    const cierraParams = cierreEquilibrado(codigo, abreParams, '(', ')')
    if (cierraParams === -1) continue
    const abreCuerpo = inicioDelCuerpo(codigo, cierraParams)
    const cierraCuerpo = cierreEquilibrado(codigo, abreCuerpo, '{', '}')
    if (abreCuerpo === -1 || cierraCuerpo === -1) continue

    funciones.push({
      nombre: match[1] ?? '',
      parametros: codigo.slice(abreParams + 1, cierraParams),
      cuerpo: codigo.slice(abreCuerpo + 1, cierraCuerpo),
    })
  }

  return funciones
}

/** ¿La llamada a `nombre` que hay en `cuerpo` le pasa el `scope`? */
function lePasaElAmbito(cuerpo: string, nombre: string): boolean {
  const llamada = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
  for (const match of cuerpo.matchAll(llamada)) {
    const abre = cuerpo.indexOf('(', match.index ?? 0)
    const cierra = cierreEquilibrado(cuerpo, abre, '(', ')')
    if (cierra === -1) continue
    if (/\bscope\b/.test(cuerpo.slice(abre + 1, cierra))) return true
  }
  return false
}

/** Las envolturas que el archivo importa del punto unico `./company-scope` (texto SIN vaciar). */
function envolturasImportadas(source: string): readonly string[] {
  const importacion = /import\s*\{([^}]*)\}\s*from\s*'\.\/company-scope'/.exec(source)
  if (importacion === null) return []
  return (importacion[1] ?? '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0)
}

type ArchivoAnalizado = {
  readonly archivo: string
  readonly funciones: readonly FuncionDeclarada[]
  readonly consumidoras: ReadonlySet<string>
}

function analizar(archivo: string): ArchivoAnalizado {
  const source = readFileSync(join(PERSISTENCE_ROOT, archivo), 'utf8')
  const codigo = soloCodigo(source)
  const funciones = funcionesDe(codigo)

  // Semilla: las envolturas del punto unico. Cierre transitivo sobre ellas.
  const consumidoras = new Set<string>(envolturasImportadas(source))
  let crecio = true
  while (crecio) {
    crecio = false
    for (const funcion of funciones) {
      if (consumidoras.has(funcion.nombre)) continue
      for (const consumidora of consumidoras) {
        if (lePasaElAmbito(funcion.cuerpo, consumidora)) {
          consumidoras.add(funcion.nombre)
          crecio = true
          break
        }
      }
    }
  }

  return { archivo, funciones, consumidoras }
}

// --- Los dos puertos y su cableado -------------------------------------------------------------

/** Los nombres de metodo que declara una interfaz de puerto. */
function metodosDelPuerto(archivo: string, interfaz: string): readonly string[] {
  const source = soloCodigo(readFileSync(join(MODULE_ROOT, 'ports', archivo), 'utf8'))
  const inicio = source.indexOf(`export interface ${interfaz} {`)
  expect(inicio, `no se encontro la interfaz ${interfaz} en ports/${archivo}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  const cuerpo = source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))
  return [...cuerpo.matchAll(/^\s{2}(\w+)\s*\(/gm)].map((match) => match[1] ?? '')
}

/** El objeto que `lib/composition` ata al puerto: `{ metodoDelPuerto -> funcionDelAdaptador }`. */
function cableadoDe(constante: string, interfaz: string): ReadonlyMap<string, string> {
  const source = soloCodigo(readFileSync(join(repoRoot, 'lib', 'composition', 'index.ts'), 'utf8'))
  const inicio = source.indexOf(`const ${constante}: ${interfaz} = {`)
  expect(inicio, `lib/composition no ata ${constante}: ${interfaz}`).toBeGreaterThan(-1)
  const abre = source.indexOf('{', inicio)
  const cuerpo = source.slice(abre + 1, cierreEquilibrado(source, abre, '{', '}'))

  const cableado = new Map<string, string>()
  for (const linea of cuerpo.split('\n')) {
    const conNombre = /^\s*(\w+)\s*:\s*(\w+)\s*,\s*$/.exec(linea)
    if (conNombre !== null) {
      cableado.set(conNombre[1] ?? '', conNombre[2] ?? '')
      continue
    }
    const abreviado = /^\s*(\w+)\s*,\s*$/.exec(linea)
    if (abreviado !== null) cableado.set(abreviado[1] ?? '', abreviado[1] ?? '')
  }
  return cableado
}

const PUERTOS = [
  {
    nombre: 'ProductRepository',
    port: 'product-repository.ts',
    constante: 'productRepository',
    // `findBatchMovements` vive en `batch-movement-prisma.ts`, no en `product-prisma.ts`: el
    // puerto tiene mas de un archivo que lo implementa, y la guardia busca en los dos.
    adaptadores: ['product-prisma.ts', 'batch-movement-prisma.ts'],
  },
  {
    nombre: 'PresentationRepository',
    port: 'presentation-repository.ts',
    constante: 'presentationRepository',
    adaptadores: ['presentation-prisma.ts'],
  },
] as const

describe('QC-49 R13 — cada metodo de los dos puertos declara Y consume el ambito de empresa', () => {
  for (const puerto of PUERTOS) {
    const metodos = metodosDelPuerto(puerto.port, puerto.nombre)
    const cableado = cableadoDe(puerto.constante, puerto.nombre)
    const adaptadores = puerto.adaptadores.map((archivo) => analizar(archivo))

    it(`${puerto.nombre}: los ${metodos.length} metodos estan cableados y ninguno se queda fuera`, () => {
      // Sin esto, un metodo NUEVO del puerto podria no aparecer en el barrido de abajo y la
      // guardia lo ignoraria en silencio, que es justo el fallo que viene a cerrar.
      expect(metodos.length, `${puerto.port} deberia declarar metodos`).toBeGreaterThan(0)
      expect([...cableado.keys()].sort()).toEqual([...metodos].sort())
    })

    for (const metodo of metodos) {
      it(`${puerto.nombre}.${metodo} declara \`scope: InventoryScope\` y lo lleva hasta el punto unico`, () => {
        const implementacion = cableado.get(metodo)
        expect(implementacion, `${metodo} no esta cableado en lib/composition`).toBeTruthy()

        const hallazgo = adaptadores
          .map((adaptador) => ({ adaptador, funcion: adaptador.funciones.find((f) => f.nombre === implementacion) }))
          .find((par) => par.funcion !== undefined)
        expect(
          hallazgo,
          `ninguno de ${puerto.adaptadores.join(', ')} exporta la funcion ${implementacion ?? '?'} que cablea ${metodo}`,
        ).toBeTruthy()
        if (hallazgo === undefined) return
        const { adaptador, funcion } = hallazgo
        if (funcion === undefined) return

        // 1. LA DECLARA. El compilador NO lo exige: una implementacion de menor aridad satisface
        //    la firma del puerto. Esta linea es lo unico que lo impide.
        expect(
          PARAMETRO_DE_AMBITO.test(funcion.parametros),
          `${adaptador.archivo}:${funcion.nombre} implementa ${puerto.nombre}.${metodo} SIN declarar \`scope: InventoryScope\`. TypeScript lo acepta -una funcion de menos parametros satisface la firma-, asi que la unica forma de que no se cuele es esta (R13)`,
        ).toBe(true)

        // 2. LO USA. Declararlo y no usarlo seria la misma fuga con mejor cara: la llamada
        //    compilaria, el ambito viajaria hasta aqui y la consulta leeria el inventario de
        //    todas las empresas.
        expect(
          adaptador.consumidoras.has(funcion.nombre),
          `${adaptador.archivo}:${funcion.nombre} declara el ambito pero NO lo lleva hasta \`./company-scope\`: el \`scope\` tiene que acabar en una de sus envolturas (${envolturasImportadas(readFileSync(join(PERSISTENCE_ROOT, adaptador.archivo), 'utf8')).join(', ')}), aqui o en un ayudante de este mismo archivo al que se le pase (R13)`,
        ).toBe(true)
      })
    }
  }
})

describe('QC-49 R13/R29 — ninguna otra consulta del modulo se queda sin ambito', () => {
  /** Los archivos de persistencia del modulo, leidos del disco y no de una lista a mano. */
  const archivos = readdirSync(PERSISTENCE_ROOT).filter((archivo) => archivo.endsWith('.ts'))

  it('los archivos de persistencia del modulo se barren todos, y el troceo VE las consultas', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos).toContain('product-prisma.ts')
    expect(archivos).toContain('presentation-prisma.ts')
    expect(archivos).toContain('product-catalog-prisma.ts')

    // ANTI-PLACEBO del troceador. Si `funcionesDe` dejara de reconocer las declaraciones -o se
    // quedara con la llave de un tipo de retorno en vez de con la del cuerpo-, el barrido de
    // abajo no encontraria NINGUNA funcion que toque la base y pasaria en verde sin mirar nada.
    // Las cuentas de hoy: ocho consultas en productos, cuatro en presentaciones, una en el
    // catalogo. Se exige el minimo, no la igualdad: la guardia no debe estorbar a quien anada
    // una consulta MAS -esa entra por el barrido, que es donde tiene que morder-.
    const conConsulta = (archivo: string): number =>
      analizar(archivo).funciones.filter((f) => /\b(?:prisma|tx)\.\w+\.\w+\(/.test(f.cuerpo)).length

    expect(conConsulta('product-prisma.ts')).toBeGreaterThanOrEqual(8)
    expect(conConsulta('presentation-prisma.ts')).toBeGreaterThanOrEqual(4)
    expect(conConsulta('product-catalog-prisma.ts')).toBeGreaterThanOrEqual(1)
  })

  for (const archivo of archivos) {
    it(`${archivo}: toda funcion que toca la base declara y consume el ambito`, () => {
      const analizado = analizar(archivo)

      // «Toca la base» = su cuerpo ejecuta una consulta, por el cliente (`prisma.`) o por el
      // cliente de transaccion (`tx.`). Las funciones puras -mapeadores, traductores de error,
      // constructores de `orderBy`- no leen ni escriben y no tienen nada que acotar.
      const tocaLaBase = (cuerpo: string): boolean => /\b(?:prisma|tx)\.\w+\.\w+\(/.test(cuerpo)

      for (const funcion of analizado.funciones) {
        if (!tocaLaBase(funcion.cuerpo)) continue

        expect(
          PARAMETRO_DE_AMBITO.test(funcion.parametros),
          `${archivo}:${funcion.nombre} consulta la base SIN declarar \`scope: InventoryScope\`. El modulo no tiene ninguna excepcion aprobada; una consulta sin ambito hay que aprobarla en el spec, no aqui`,
        ).toBe(true)
        expect(
          analizado.consumidoras.has(funcion.nombre),
          `${archivo}:${funcion.nombre} declara \`scope\` pero no lo lleva hasta las envolturas de \`./company-scope\`: un ambito que no entra en el \`where\` (o en el \`data\`) no filtra nada (R13)`,
        ).toBe(true)
      }
    })
  }
})
