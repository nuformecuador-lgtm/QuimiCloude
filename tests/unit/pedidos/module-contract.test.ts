// T7 — Forma del modulo `pedidos`, sus fronteras y el limite de alcance de la ficha (QC-33).
//
// Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el
// comportamiento: que el contrato publico solo reexporte dominio, que las carpetas sean las
// tres de la guardia, que nada de servidor sea alcanzable desde el barrel, que NINGUN archivo
// del repo consulte `prisma.order`, que `pedidos` no consulte las tablas de `recetas`,
// `unidades` ni `identity` y solo las conozca por su barrel, y que esta ficha no abra ningun
// flujo navegable. Mismo patron —y buena parte de los mismos ayudantes— que
// `tests/unit/unidades/module-contract.test.ts` (QC-32) y
// `tests/unit/recetas/module-contract.test.ts` (QC-24).
//
// La guardia generica (`tests/guards/guard-arquitectura-modulos.test.ts`) ya prohibe casi todo
// esto. Aqui queda escrito como REQUISITO de esta feature (`design.md > 9`, fila «Unitario»)
// en vez de como efecto colateral de una guardia que manana podria cambiar de alcance.
//
// Y aqui vive R35, que ninguna otra cosa cubre: los valores de estado y prioridad del dominio
// son un DUPLICADO a mano del `enum` de `db/schema.prisma` (`design.md > 6.2`, el dominio no
// puede importar `@prisma/client`). Este archivo lee las dos fuentes y las compara valor a
// valor y EN ORDEN. Es lo unico que detecta que se han desincronizado.
//
// Cubre R19, R24, R31, R32, R34, R35 y R39.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_STATUS,
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  formatOrderNumber,
} from '@/lib/modules/pedidos'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const pedidosDir = join(repoRoot, 'lib', 'modules', 'pedidos')
const schemaPath = join(repoRoot, 'db', 'schema.prisma')

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
}

function etiqueta(file: string): string {
  return toPosix(relative(repoRoot, file))
}

/** Todos los archivos bajo `dir`, recursivamente. Rutas absolutas. */
function filesIn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  const salida: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) salida.push(...filesIn(full))
    else salida.push(full)
  }
  return salida.sort()
}

/** Solo fuentes TypeScript: los `.gitkeep` del armazon no son codigo. */
function sourcesIn(dir: string): readonly string[] {
  return filesIn(dir).filter((file) => /\.tsx?$/.test(file))
}

/**
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. Es el mismo ayudante que
 * usan los `module-contract` de QC-24 y QC-32, y no es cosmetico: este mismo archivo y varios
 * comentarios del repo escriben `prisma.order` o `prisma.recipe` para explicar precisamente
 * quien NO puede escribirlos. Un barrido sobre el texto crudo leeria la ADVERTENCIA como la
 * INFRACCION y este test no vigilaria nada, molestaria.
 */
function read(file: string): string {
  return leerFuente(readFileSync(file, 'utf8'))
}

/** La parte pura de `read`, para poder probar el criterio con fuentes sinteticos. */
export function leerFuente(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Los metodos con los que Prisma consulta una tabla. Lista cerrada a proposito: es lo que
 *  distingue `db.order.findMany(...)` —una consulta— de `algo.order.year`, que seria un campo
 *  de un objeto del dominio. El dia que QC-34 escriba un caso de uso que reciba `{ order }` y
 *  lea `order.status`, el barrido no puede ponerse rojo por eso. */
const METODOS_DE_PRISMA =
  'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy'

/**
 * ¿Este fuente CONSULTA el modelo indicado con el cliente Prisma? Dos formas cuentan, y las dos
 * son acceso real al delegado, no texto: comentarios fuera (ver `leerFuente`).
 *
 * 1. `prisma.<modelo>...` — el cliente compartido, sobre cualquier receptor llamado `prisma`.
 * 2. `<lo que sea>.<modelo>.<metodo de Prisma>(...)` — el delegado sobre un receptor con otro
 *    nombre (`db`, `tx`, `this.db`). Sin esta segunda forma, R31 y R32 se incumplirian con solo
 *    renombrar el receptor y el barrido quedaria verde por vacio.
 *
 * NO cuenta un modelo distinto cuyo nombre EMPIECE igual —`prisma.orders`, `prisma.orderLine`,
 * `prisma.recipeLine`—: serian otra tabla. Ni el `orderBy` de cualquier consulta.
 */
export function consultaModelo(texto: string, modelo: string): boolean {
  const codigo = leerFuente(texto)
  const clienteCompartido = new RegExp(`\\bprisma\\s*\\.\\s*${modelo}(?![A-Za-z0-9_])`)
  const delegadoSobreOtroReceptor = new RegExp(
    `[A-Za-z0-9_$]\\s*\\.\\s*${modelo}\\s*\\.\\s*(?:${METODOS_DE_PRISMA})\\s*[(<]`,
  )
  return clienteCompartido.test(codigo) || delegadoSobreOtroReceptor.test(codigo)
}

/** ¿Consulta la tabla de pedidos? (R31) */
export function consultaTablaDePedidos(texto: string): boolean {
  return consultaModelo(texto, 'order')
}

/** Especificadores de import/reexport de un fuente (`from '...'` y `import '...'`). */
function importSpecifiers(source: string): readonly string[] {
  const specs = new Set<string>()
  for (const match of source.matchAll(/\bfrom\s+'([^']+)'/g)) specs.add(match[1] as string)
  for (const match of source.matchAll(/\bimport\s+'([^']+)'/g)) specs.add(match[1] as string)
  return [...specs]
}

/** Resuelve un especificador RELATIVO a un archivo real. Los no relativos devuelven null. */
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = join(dirname(fromFile), spec)
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`import relativo sin destino: ${spec} desde ${toPosix(fromFile)}`)
}

/** Cierre transitivo de imports relativos desde un archivo, el archivo incluido. */
function reachableFrom(entry: string): readonly string[] {
  const vistos = new Set<string>([entry])
  const pendientes = [entry]
  while (pendientes.length > 0) {
    const file = pendientes.pop() as string
    for (const spec of importSpecifiers(read(file))) {
      const destino = resolveRelative(file, spec)
      if (destino === null || vistos.has(destino)) continue
      vistos.add(destino)
      pendientes.push(destino)
    }
  }
  return [...vistos].sort()
}

const barrel = join(pedidosDir, 'index.ts')
const pedidosSources = sourcesIn(pedidosDir)

/** Todo el codigo de aplicacion del repo, mas los scripts: donde podria esconderse una consulta
 *  a `orders`. Incluye `lib/modules/pedidos`: hoy tampoco el propio modulo tiene un sitio donde
 *  consultarla —`adapters/driven/` esta vacia y la llena QC-34 (R39)—. */
const todoElCodigo = [
  ...sourcesIn(join(repoRoot, 'lib')),
  ...sourcesIn(join(repoRoot, 'app')),
  ...sourcesIn(join(repoRoot, 'components')),
  ...sourcesIn(join(repoRoot, 'hooks')),
  ...sourcesIn(join(repoRoot, 'scripts')),
  ...['middleware.ts'].map((f) => join(repoRoot, f)).filter((f) => existsSync(f)),
]

/** Una entrada del barrido: el nombre con el que se reporta, y el texto del fuente. */
export type EntradaDeBarrido = { readonly nombre: string; readonly fuente: string }

/**
 * El BARRIDO, como funcion pura: de una lista de fuentes devuelve los nombres de los que
 * consultan el modelo indicado, en el orden recibido.
 *
 * Se extrae a una funcion —en vez de filtrar la lista de archivos en el sitio— para poder
 * aplicarla DOS veces en el mismo test: a los archivos reales del repo (donde la respuesta
 * correcta es la lista VACIA) y a esos mismos archivos MAS una entrada sintetica con una
 * consulta de verdad. Sin la segunda pasada, la primera seria un `toEqual([])` que tambien
 * saldria verde si el barrido no leyera nada o si el predicado hubiera dejado de reconocer una
 * consulta: una lista vacia por vacuidad no vigila nada (patron de QC-32 § 9).
 */
export function nombresQueConsultan(
  entradas: readonly EntradaDeBarrido[],
  modelo: string,
): readonly string[] {
  return entradas.filter((entrada) => consultaModelo(entrada.fuente, modelo)).map((e) => e.nombre)
}

/** Los archivos reales del repo, ya leidos, como entradas del barrido. */
const entradasReales: readonly EntradaDeBarrido[] = todoElCodigo.map((file) => ({
  nombre: etiqueta(file),
  fuente: readFileSync(file, 'utf8'),
}))

/** Los fuentes de `pedidos` como entradas del barrido, para los modelos ajenos (R32). */
const entradasDePedidos: readonly EntradaDeBarrido[] = pedidosSources.map((file) => ({
  nombre: etiqueta(file),
  fuente: readFileSync(file, 'utf8'),
}))

const schema = readFileSync(schemaPath, 'utf8')

/** Los valores de un `enum` de `db/schema.prisma`, EN SU ORDEN DE DECLARACION. Se lee el
 *  esquema como TEXTO, no el cliente generado: el cliente es un artefacto y podria estar
 *  desactualizado justo cuando este test tiene que ponerse rojo. */
function enumValues(nombre: string): readonly string[] {
  const bloque = new RegExp(`(^|\\n)enum ${nombre} \\{([^}]*)\\}`).exec(schema)
  if (bloque === null) throw new Error(`no existe \`enum ${nombre}\` en db/schema.prisma`)
  return (bloque[2] as string)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0)
}

/** El cuerpo del modelo indicado del esquema, para leer sus `@default`. */
function modelBody(nombre: string): string {
  const bloque = new RegExp(`(^|\\n)model ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(schema)
  if (bloque === null) throw new Error(`no existe \`model ${nombre}\` en db/schema.prisma`)
  return bloque[2] as string
}

/** El `@default(...)` de un campo del modelo `Order`. */
function defaultOf(campo: string): string {
  const cuerpo = modelBody('Order')
  const linea = new RegExp(`\\n\\s*${campo}\\s+[^\\n]*`).exec(cuerpo)
  if (linea === null) throw new Error(`el modelo Order no declara el campo ${campo}`)
  const valor = /@default\(([^)]*)\)/.exec(linea[0] as string)
  if (valor === null) throw new Error(`el campo Order.${campo} no declara @default`)
  return (valor[1] as string).trim()
}

describe('lib/modules/pedidos — forma del modulo, fronteras y limite de alcance', () => {
  it("el modulo pedidos tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R34: el modulo nace con la forma hexagonal del repositorio (`design.md > 6.1`).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/pedidos/index.ts').toBe(true)

    const carpetas = readdirSync(pedidosDir)
      .filter((name) => statSync(join(pedidosDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    expect(
      readdirSync(join(pedidosDir, 'adapters'))
        .filter((name) => statSync(join(pedidosDir, 'adapters', name)).isDirectory())
        .sort(),
    ).toEqual(['driven', 'driving'])

    // Las tres carpetas nacen VACIAS y sembradas con `.gitkeep`, para que git las versione
    // (`design.md > 6.1`). Las llena QC-34.
    for (const vacia of [
      join(pedidosDir, 'ports'),
      join(pedidosDir, 'adapters', 'driven'),
      join(pedidosDir, 'adapters', 'driving'),
    ]) {
      expect(sourcesIn(vacia), `${etiqueta(vacia)} deberia estar vacia`).toEqual([])
      expect(readdirSync(vacia), `${etiqueta(vacia)} deberia tener solo .gitkeep`).toEqual([
        '.gitkeep',
      ])
    }

    // El contrato solo reexporta de `./domain`: ni puertos, ni adaptadores, ni nada de fuera.
    const contrato = read(barrel)
    const specs = importSpecifiers(contrato)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec, `el barrel no puede reexportar de ${spec}`).toMatch(/^\.\/domain(\/|$)/)
    }
    expect(contrato, 'el barrel reexporta de ./ports').not.toMatch(/from '\.\/ports/)
    expect(contrato, 'el barrel reexporta de ./adapters').not.toMatch(/from '\.\/adapters/)

    // Cierre transitivo del barrel: nada de servidor. Un componente de cliente tiene que poder
    // importar `@/lib/modules/pedidos` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(1)
    for (const file of alcanzables) {
      expect(
        toPosix(relative(pedidosDir, file)),
        `${etiqueta(file)} vive en adapters/ o ports/ y es alcanzable desde el barrel`,
      ).not.toMatch(/^(adapters|ports)\//)

      const source = read(file)
      const nombre = etiqueta(file)
      expect(source, `${nombre} declara 'use server' y es alcanzable desde el barrel`).not.toMatch(
        /['"]use server['"]/,
      )
      expect(source, `${nombre} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      expect(source, `${nombre} importa next/*`).not.toMatch(/from\s+'next(\/|')/)
      expect(source, `${nombre} importa react`).not.toMatch(/from\s+'react/)
      // El dominio no depende de `lib/shared`: si lo necesitara, lo pediria por un puerto.
      expect(source, `${nombre} importa @/lib/shared`).not.toMatch(/@\/lib\/shared/)
      // Ni de la composicion, que es quien ata los puertos, no quien los usa.
      expect(source, `${nombre} importa @/lib/composition`).not.toMatch(/@\/lib\/composition/)
      // Ni consulta la tabla: el dominio no sabe que existe Prisma.
      expect(consultaTablaDePedidos(source), `${nombre} consulta prisma.order`).toBe(false)
    }
  })

  it('ningun archivo del repo consulta prisma.order, y el barrido señala una entrada sintetica que si lo hace', () => {
    // R31: `pedidos` es el modulo propietario del modelo y hoy NADIE lo consulta, ni siquiera
    // el —`adapters/driven/` esta vacia hasta QC-34 (R39)—. Lo que se afirma es la lista vacia
    // sobre TODO el codigo de aplicacion: `lib`, `app`, `components`, `hooks`, `scripts` y
    // `middleware.ts`.
    expect(todoElCodigo.length).toBeGreaterThan(0)
    expect(entradasReales).toHaveLength(todoElCodigo.length)
    expect(nombresQueConsultan(entradasReales, 'order')).toEqual([])

    // Y la MISMA funcion, sobre los MISMOS archivos reales mas una entrada sintetica con una
    // consulta de verdad, devuelve exactamente esa entrada. Esto es lo que impide que la lista
    // vacia de arriba lo sea por vacuidad: sin esta segunda pasada, el `toEqual([])` saldria
    // verde tambien si el barrido no leyera nada.
    const sintetico: EntradaDeBarrido = {
      nombre: '<sintetico>',
      fuente: 'export async function x(prisma: unknown) { await prisma.order.findMany({}) }',
    }
    expect(nombresQueConsultan([...entradasReales, sintetico], 'order')).toEqual(['<sintetico>'])

    // Tambien con el receptor renombrado, que es la forma por la que se escaparia: el barrido
    // no depende de que el cliente se llame `prisma`.
    const conOtroReceptor: EntradaDeBarrido = {
      nombre: '<sintetico-db>',
      fuente: 'await db.order.create({ data })',
    }
    expect(nombresQueConsultan([...entradasReales, conOtroReceptor], 'order')).toEqual([
      '<sintetico-db>',
    ])
  })

  it('el criterio de «consulta el modelo» distingue codigo de comentario, y cae ante una consulta real', () => {
    // Un test que no puede fallar no vigila nada (`design.md > 9`). Aqui se prueba el
    // PREDICADO con fuentes sinteticos, porque de el dependen los dos barridos.
    // Positivos: acceso real, con o sin espacios y con cualquier metodo detras.
    expect(consultaTablaDePedidos('await prisma.order.findMany({})')).toBe(true)
    expect(consultaTablaDePedidos('const a = prisma . order . create({})')).toBe(true)
    expect(consultaTablaDePedidos('return tx.prisma.order.count()')).toBe(true)
    expect(consultaTablaDePedidos('await db.order.findMany({})')).toBe(true)
    expect(consultaTablaDePedidos('await tx.order.update({ where })')).toBe(true)
    expect(consultaTablaDePedidos('await this.db.order.deleteMany({})')).toBe(true)
    expect(consultaModelo('await prisma.recipe.findMany({})', 'recipe')).toBe(true)
    expect(consultaModelo('await db.unit.create({ data })', 'unit')).toBe(true)
    expect(consultaModelo('await prisma.user.findUnique({})', 'user')).toBe(true)

    // Negativos: los comentarios que EXISTEN hoy en el repo con ese texto —este mismo archivo
    // y el propio `db/schema.prisma` explican quien NO puede escribirlo—.
    expect(consultaTablaDePedidos('// nadie consulta `prisma.order` todavia')).toBe(false)
    expect(
      consultaTablaDePedidos('/** el adaptador que tocara `prisma.order` es de QC-34 */'),
    ).toBe(false)
    // Un modelo distinto cuyo nombre empieza igual: no es la tabla `orders`.
    expect(consultaTablaDePedidos('await prisma.orders.findMany({})')).toBe(false)
    expect(consultaTablaDePedidos('await prisma.orderLine.findMany({})')).toBe(false)
    expect(consultaModelo('await prisma.recipeLine.findMany({})', 'recipe')).toBe(false)
    // Y un campo `order` de un objeto del dominio, que no lleva metodo de Prisma detras. El dia
    // que QC-34 escriba un caso de uso que reciba `{ order }`, esto no puede ponerse rojo.
    expect(consultaTablaDePedidos('const y = vista.order.year')).toBe(false)
    expect(consultaTablaDePedidos('rows.push(fila.order.status)')).toBe(false)
    // `orderBy` es la clausula de ordenacion de CUALQUIER consulta, no un delegado.
    expect(
      consultaTablaDePedidos("await prisma.recipe.findMany({ orderBy: { name: 'asc' } })"),
    ).toBe(false)
  })

  it('pedidos no nombra prisma.recipe, prisma.unit ni prisma.user', () => {
    // R32, primera mitad: el modulo NO consulta con Prisma el modelo de receta, el de unidad ni
    // el de usuario. Las cuatro FK son reales en la base pero se declaran sin `@relation`
    // (`design.md > 4`), justo para que ese cruce no exista ni siquiera como posibilidad.
    expect(pedidosSources.length).toBeGreaterThan(0)
    expect(entradasDePedidos).toHaveLength(pedidosSources.length)
    for (const modelo of ['recipe', 'unit', 'user']) {
      expect(
        nombresQueConsultan(entradasDePedidos, modelo),
        `algun fuente de pedidos consulta prisma.${modelo}`,
      ).toEqual([])

      // Y el mismo barrido, con una entrada sintetica que si lo hace, la señala: la lista vacia
      // de arriba no lo es por vacuidad.
      const sintetico: EntradaDeBarrido = {
        nombre: `<sintetico-${modelo}>`,
        fuente: `await prisma.${modelo}.findMany({})`,
      }
      expect(nombresQueConsultan([...entradasDePedidos, sintetico], modelo)).toEqual([
        `<sintetico-${modelo}>`,
      ])
    }

    // Tampoco importa el cliente de Prisma en ningun archivo del modulo, ni el cliente
    // compartido: hoy `pedidos` es modelo y contrato, y no habla con ninguna base.
    for (const file of pedidosSources) {
      const source = read(file)
      expect(source, `${etiqueta(file)} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      expect(source, `${etiqueta(file)} importa el cliente compartido`).not.toMatch(
        /@\/lib\/shared\/(db|prisma)/,
      )
    }
  })

  it('pedidos importa recetas y unidades solo por el barrel, y los dos barrels publican lo que usa', () => {
    // R32, segunda mitad: todo lo que `pedidos` sabe de una receta o de una unidad llega por
    // `@/lib/modules/recetas` y `@/lib/modules/unidades`. Ni dominio, ni puertos, ni
    // adaptadores por ruta profunda; tampoco de `identity` ni de `inventario`.
    for (const file of pedidosSources) {
      const nombre = etiqueta(file)
      for (const spec of importSpecifiers(read(file))) {
        expect(spec, `${nombre}: ruta profunda a otro modulo`).not.toMatch(
          /^@\/lib\/modules\/(recetas|unidades|identity|inventario)\/./,
        )
      }
    }

    // Y el barrel de cada uno es un camino REAL, no una regla vacia: `order-contents.ts` los usa
    // hoy (`design.md > 6.3`). Sin esta mitad, R32 pasaria por no existir el sujeto.
    const contents = read(join(pedidosDir, 'domain', 'order-contents.ts'))
    const specsDeContents = importSpecifiers(contents)
    expect(specsDeContents).toContain('@/lib/modules/recetas')
    expect(specsDeContents).toContain('@/lib/modules/unidades')
    expect(contents).toMatch(
      /import type \{[^}]*\bRecipeId\b[^}]*\} from '@\/lib\/modules\/recetas'/,
    )
    expect(contents).toMatch(
      /import type \{[^}]*\bUnitId\b[^}]*\} from '@\/lib\/modules\/unidades'/,
    )

    // Los dos contratos ajenos PUBLICAN lo que `pedidos` usa: R32 exige que los barrels lo
    // expongan, y `RecipeId` lo anadio esta misma ficha (`design.md > 6.4`).
    const recetas = read(join(repoRoot, 'lib', 'modules', 'recetas', 'index.ts'))
    expect(recetas).toMatch(/export type \{[^}]*\bRecipeId\b[^}]*\} from '\.\/domain\//)
    const unidades = read(join(repoRoot, 'lib', 'modules', 'unidades', 'index.ts'))
    expect(unidades).toMatch(/export type \{[^}]*\bUnitId\b[^}]*\} from '\.\/domain\//)
  })

  it('los valores del dominio coinciden, en orden, con los enum del esquema, y los dos defectos con los @default', () => {
    // R35, y es lo UNICO que lo cubre. Los valores del dominio son un duplicado a mano del
    // esquema porque el dominio no puede importar `@prisma/client` (`design.md > 6.2` y
    // `> 8.3`): el duplicado no se evita, se VIGILA. Se compara valor a valor y EN ORDEN —el
    // orden de la prioridad ES el dato (decision cerrada 4)—, asi que un `toEqual` sobre el
    // array, no un `toContain` ni un conjunto.
    expect(enumValues('OrderStatus')).toEqual(['PENDIENTE', 'EN_CURSO', 'ENTREGADO'])
    expect([...ORDER_STATUS_VALUES]).toEqual(enumValues('OrderStatus'))

    expect(enumValues('OrderPriority')).toEqual(['BAJA', 'MEDIA', 'ALTA', 'CRITICA'])
    expect([...ORDER_PRIORITY_VALUES]).toEqual(enumValues('OrderPriority'))

    // Sin sobrar ni faltar: el largo se afirma aparte para que el mensaje diga cual de las dos
    // listas crecio si alguien anade un valor a una sola.
    expect(ORDER_STATUS_VALUES).toHaveLength(enumValues('OrderStatus').length)
    expect(ORDER_PRIORITY_VALUES).toHaveLength(enumValues('OrderPriority').length)

    // Y los dos defectos, que son el otro duplicado: `@default(PENDIENTE)` y `@default(BAJA)`.
    expect(defaultOf('status')).toBe(DEFAULT_ORDER_STATUS)
    expect(defaultOf('priority')).toBe(DEFAULT_ORDER_PRIORITY)
    // Cada defecto pertenece ademas a su propia lista: un `@default` que no fuera un valor del
    // enum lo rechazaria `prisma validate`, pero un DEFAULT_* copiado de la otra lista
    // compilaria sin quejarse.
    expect(ORDER_STATUS_VALUES).toContain(DEFAULT_ORDER_STATUS)
    expect(ORDER_PRIORITY_VALUES).toContain(DEFAULT_ORDER_PRIORITY)

    // El lector del esquema tiene que poder FALLAR: si no distinguiera un enum de otro, o
    // devolviera siempre lo mismo, todo lo de arriba seria decorativo.
    expect(enumValues('OrderStatus')).not.toEqual(enumValues('OrderPriority'))
    expect(() => enumValues('OrderInexistente')).toThrow(/no existe/)
    expect(() => defaultOf('quantity')).toThrow(/no declara @default/)
    expect(() => defaultOf('campoInexistente')).toThrow(/no declara el campo/)
  })

  it('el modulo pedidos no declara ninguna transicion ni maquina de estados', () => {
    // R19: esta ficha NO restringe que cambio de estado es valido —cualquier estado puede
    // sustituir a cualquier otro, salvo lo que impone el CHECK del entregado (R29, R30)—. Las
    // transiciones validas son de QC-34, y adelantarlas aqui seria decidir sin el caso de uso
    // delante. Se vigila el CODIGO del modulo entero, comentarios fuera: la prosa SI puede
    // decir que las transiciones son de QC-34, y de hecho lo dice.
    const PROHIBIDO =
      /\b(transitions?|transicion\w*|canTransition|allowedStatus\w*|nextStatus|stateMachine|maquina)\b/i
    expect(pedidosSources.length).toBeGreaterThan(0)
    for (const file of pedidosSources) {
      expect(read(file), `${etiqueta(file)} declara una transicion de estado`).not.toMatch(PROHIBIDO)
    }

    // Lo que el modulo publica sobre el estado es la LISTA de valores y su defecto, nada mas:
    // ninguna funcion que decida si un cambio es legal.
    const contrato = read(barrel)
    expect(contrato).toMatch(/ORDER_STATUS_VALUES/)
    expect(contrato, 'el contrato publica una regla de transicion').not.toMatch(PROHIBIDO)
  })

  it('el barrel de pedidos exporta formatOrderNumber y no hay ninguna otra composicion del numero visible', () => {
    // R24: UNA sola definicion del formato, publicada por el contrato del modulo. Aqui se
    // afirma en ejecucion —es una funcion, no un tipo— y ademas se comprueba que no hay una
    // segunda copia del formato en ningun otro archivo del repo: un `padStart(7, '0')` suelto
    // en un componente o en un caso de uso seria exactamente el tercer sitio que R24 prohibe.
    expect(typeof formatOrderNumber).toBe('function')
    expect(formatOrderNumber({ year: 2026, sequence: 1 })).toBe('2026-0000001')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bformatOrderNumber\b[^}]*\} from '\.\/domain\//)

    const definiciones = todoElCodigo
      .filter((file) => /function formatOrderNumber/.test(read(file)))
      .map(etiqueta)
    expect(definiciones).toEqual(['lib/modules/pedidos/domain/order-number.ts'])

    const rellenos = todoElCodigo
      .filter((file) => /padStart\s*\(\s*7\s*,/.test(read(file)))
      .map(etiqueta)
    expect(rellenos).toEqual(['lib/modules/pedidos/domain/order-number.ts'])
  })

  it('la feature no añade adaptadores driving, rutas ni Server Actions', () => {
    // R39: esta ficha es esquema, migracion y armazon del modulo. Ninguna alta, consulta,
    // edicion ni borrado de pedidos —eso es QC-34— y por tanto ningun flujo navegable que un
    // E2E pueda visitar (decision cerrada 25).
    const driving = join(pedidosDir, 'adapters', 'driving')
    expect(sourcesIn(driving), `${etiqueta(driving)} deberia estar vacia`).toEqual([])
    expect(readdirSync(driving)).toEqual(['.gitkeep'])

    // Ningun 'use server' en TODO el modulo, no solo en lo alcanzable desde el barrel.
    for (const file of pedidosSources) {
      expect(read(file), `${etiqueta(file)} declara 'use server'`).not.toMatch(/['"]use server['"]/)
    }

    // Ninguna ruta HTTP ni pantalla de pedidos.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'orders'),
      join(repoRoot, 'app', 'api', 'pedidos'),
      join(repoRoot, 'app', '(private)', 'pedidos'),
      join(repoRoot, 'app', '(private)', 'orders'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false)
    }

    // Y ningun archivo de `app/` ni de `components/` conoce todavia el modulo: la pantalla es
    // QC-35.
    for (const file of [
      ...sourcesIn(join(repoRoot, 'app')),
      ...sourcesIn(join(repoRoot, 'components')),
    ]) {
      expect(read(file), `${etiqueta(file)} importa el modulo pedidos`).not.toMatch(
        /@\/lib\/modules\/pedidos/,
      )
    }

    // `lib/composition` NO se toca: `pedidos` no cablea nada porque no tiene puerto ni
    // adaptador (`design.md > 1`). Esta es la asercion que se pone roja si alguien adelanta
    // QC-34 por la puerta de atras.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
      .map((file) => read(file))
      .join('\n')
    expect(composicion.length).toBeGreaterThan(0)
    expect(composicion, 'la composicion ya cablea algo de pedidos').not.toMatch(/modules\/pedidos/)

    // Y `db:seed` tampoco sabe de pedidos.
    const seedScript = read(join(repoRoot, 'scripts', 'seed.ts'))
    expect(seedScript.length).toBeGreaterThan(0)
    expect(seedScript, 'scripts/seed.ts siembra pedidos').not.toMatch(/pedidos|prisma\.order/)
  })
})
