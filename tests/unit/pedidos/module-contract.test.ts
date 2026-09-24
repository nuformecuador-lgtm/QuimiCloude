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
// La carpeta de la pantalla se DERIVA de esta constante, nunca de un literal escrito a mano.
import { ORDERS_ROUTE } from '@/lib/shared/routes'

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
    // QC-34 llena estas carpetas y borra el `.gitkeep` de cada una al aparecer su primer
    // archivo real (su R52). Lo que se sigue vigilando -y es lo que importaba- es la EXCLUSION
    // MUTUA: o la carpeta esta vacia CON su `.gitkeep`, o tiene codigo y NINGUN `.gitkeep`. Un
    // `.gitkeep` conviviendo con codigo es basura.
    for (const carpeta of [
      join(pedidosDir, 'ports'),
      join(pedidosDir, 'adapters', 'driven'),
      join(pedidosDir, 'adapters', 'driving'),
    ]) {
      const contenido = readdirSync(carpeta)
      if (sourcesIn(carpeta).length === 0) {
        expect(contenido, `${etiqueta(carpeta)} esta vacia y deberia tener solo .gitkeep`).toEqual([
          '.gitkeep',
        ])
      } else {
        expect(contenido, `${etiqueta(carpeta)} tiene codigo y conserva un .gitkeep`).not.toContain(
          '.gitkeep',
        )
      }
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
      // RETENSADO 2026-09-04 (QC-34, T14): antes se prohibia `adapters/` Y `ports/`. Esa
      // premisa cayo, y no por un aflojamiento: el barrel publica ahora las SEIS factories de
      // caso de uso (su R52), y una factory declara su repositorio con el TIPO del puerto, asi
      // que `ports/order-repository.ts` es alcanzable por fuerza. Prohibirlo obligaria a que el
      // dominio dejara de tipar sus dependencias, que es lo contrario de lo que la arquitectura
      // pide.
      //
      // Lo que este caso protegia de verdad -que el barrel no arrastre SERVIDOR- sigue intacto,
      // y con mas dientes que antes: `adapters/` sigue PROHIBIDO -ahi vive Prisma-, y las siete
      // aserciones de abajo (nada de 'use server', ni @prisma/client, ni next, ni react, ni
      // lib/shared, ni lib/composition, ni prisma.order) se aplican a TODO archivo alcanzable,
      // el puerto incluido. Un puerto es una interfaz sin framework; un adaptador es la
      // implementacion, y esa es la linea.
      expect(
        toPosix(relative(pedidosDir, file)),
        `${etiqueta(file)} vive en adapters/ y es alcanzable desde el barrel`,
      ).not.toMatch(/^adapters\//)

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
    //
    // RETENSADO 2026-09-04 (QC-34, T13). La lista permitida deja de estar VACIA y pasa a tener
    // EXACTAMENTE UN archivo, nombrado. No es un aflojamiento: QC-33 escribio el modelo y dejo
    // `adapters/driven/` vacia, asi que entonces la respuesta correcta era «nadie»; QC-34
    // escribe el adaptador, y R52 dice literalmente donde va. Lo que este caso protege -que
    // NINGUN otro modulo, ninguna pantalla y ningun script toquen `orders`, y que dentro de
    // `pedidos` solo lo haga el driven- se vigila ahora mejor: cualquier segundo archivo, aqui
    // o en cualquier otra carpeta del repo, pone esto rojo.
    //
    // RETENSADO 2026-09-13 (QC-87, T2). La lista nombrada pasa de UNO a DOS archivos, los dos
    // en `adapters/driven/persistence/` de `pedidos`: el repositorio de QC-34 y el adaptador
    // del contrato publico `OrderCatalog` (QC-87 R45), que existe precisamente para que
    // `asignaciones` sepa el estado de un pedido SIN escribir `prisma.order`. Es decir: el
    // segundo archivo esta aqui para que no aparezca un tercero fuera de `pedidos`. Lo que se
    // sigue afirmando, y con la misma fuerza, es que NINGUN otro modulo, ninguna pantalla y
    // ningun script tocan `orders`.
    const DUENOS_DE_ORDERS = [
      'lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts',
      // `OrderNumberDirectory` de `inventario` -el numero visible de un pedido para el
      // historial de un lote-, tercer y ultimo dueno.
      'lib/modules/pedidos/adapters/driven/persistence/order-number-directory-prisma.ts',
      'lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts',
    ]
    expect(todoElCodigo.length).toBeGreaterThan(0)
    expect(entradasReales).toHaveLength(todoElCodigo.length)
    expect(nombresQueConsultan(entradasReales, 'order')).toEqual(DUENOS_DE_ORDERS)

    // Y la MISMA funcion, sobre los MISMOS archivos reales mas una entrada sintetica con una
    // consulta de verdad, devuelve exactamente esa entrada. Esto es lo que impide que la lista
    // vacia de arriba lo sea por vacuidad: sin esta segunda pasada, el `toEqual([])` saldria
    // verde tambien si el barrido no leyera nada.
    const sintetico: EntradaDeBarrido = {
      nombre: '<sintetico>',
      fuente: 'export async function x(prisma: unknown) { await prisma.order.findMany({}) }',
    }
    expect(nombresQueConsultan([...entradasReales, sintetico], 'order')).toEqual([
      ...DUENOS_DE_ORDERS,
      '<sintetico>',
    ])

    // Tambien con el receptor renombrado, que es la forma por la que se escaparia: el barrido
    // no depende de que el cliente se llame `prisma`.
    const conOtroReceptor: EntradaDeBarrido = {
      nombre: '<sintetico-db>',
      fuente: 'await db.order.create({ data })',
    }
    expect(nombresQueConsultan([...entradasReales, conOtroReceptor], 'order')).toEqual([
      ...DUENOS_DE_ORDERS,
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

    // Y el cliente de Prisma lo importa UN SOLO archivo del modulo, nombrado.
    //
    // RETENSADO 2026-09-04 (QC-34, T13). Antes: NINGUNO, porque «hoy `pedidos` es modelo y
    // contrato y no habla con ninguna base». Eso dejo de ser cierto con esta ficha, que escribe
    // el adaptador driven que R52 exige. La regla que importaba no era «cero Prisma» sino «un
    // solo dueno»: el dominio y los puertos siguen sin poder verlo -que es lo que los hace
    // testeables sin base-, y un segundo archivo del modulo que importe el cliente sigue
    // poniendo esto rojo.
    //
    // RETENSADO 2026-09-13 (QC-87, T2). Se separan las DOS cosas que antes decia una sola
    // lista, porque han dejado de coincidir: `@prisma/client` -los tipos generados, el
    // `Prisma.Decimal`, el `PrismaClientKnownRequestError`- lo sigue importando UN SOLO
    // archivo, y el CLIENTE compartido lo importan DOS, los dos en `adapters/driven/`: el
    // repositorio de QC-34 y el adaptador del contrato publico `OrderCatalog` (QC-87 R45). El
    // dominio y los puertos siguen sin ver ninguno de los dos, que es lo que los hace
    // testeables sin base, y cualquier archivo fuera de `adapters/` que importe el cliente
    // sigue poniendo esto rojo.
    //
    // RETENSADO 2026-09-15 (QC-60, T8). `@prisma/client` pasa a importarlo un archivo mas, y
    // solo por su TIPO: `company-scope.ts` publica el ambito como `Prisma.OrderWhereInput`, que es
    // justo lo que hace que componerlo sobre otra tabla no compile (`design.md > 5`). Sigue siendo
    // una lista CERRADA y sigue sin haber nada de Prisma en el dominio ni en los puertos.
    const DUENO_DE_PRISMA = 'lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts'
    const AMBITO_DE_EMPRESA = 'lib/modules/pedidos/adapters/driven/persistence/company-scope.ts'
    // `order-unit-of-work-prisma.ts` importa `@prisma/client` SOLO por el tipo
    // `Prisma.TransactionClient` -el `tx` que le pasa a `order-prisma.ts` y a `inventario`-, sin
    // un solo `prisma.<modelo>` propio.
    const UNIDAD_DE_TRABAJO = 'lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts'
    const DUENOS_DE_PRISMA = [AMBITO_DE_EMPRESA, DUENO_DE_PRISMA, UNIDAD_DE_TRABAJO]
    // `order-number-directory-prisma.ts` (`OrderNumberDirectory` de `inventario`) tambien abre
    // el cliente compartido, sin importar `@prisma/client`.
    const DUENOS_DEL_CLIENTE = [
      'lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts',
      'lib/modules/pedidos/adapters/driven/persistence/order-number-directory-prisma.ts',
      DUENO_DE_PRISMA,
      UNIDAD_DE_TRABAJO,
    ]
    expect(
      pedidosSources.filter((file) => /@prisma\/client/.test(read(file))).map(etiqueta),
    ).toEqual(DUENOS_DE_PRISMA)
    expect(
      pedidosSources.filter((file) => /@\/lib\/shared\/(db|prisma)/.test(read(file))).map(etiqueta),
    ).toEqual(DUENOS_DEL_CLIENTE)
    // Y ni el dominio ni los puertos lo ven, dicho aparte para que se lea como lo que es.
    for (const file of pedidosSources) {
      const nombreDelArchivo = etiqueta(file)
      const source = read(file)
      if (!DUENOS_DE_PRISMA.includes(nombreDelArchivo)) {
        expect(source, `${nombreDelArchivo} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      }
      if (!DUENOS_DEL_CLIENTE.includes(nombreDelArchivo)) {
        expect(source, `${nombreDelArchivo} importa el cliente compartido`).not.toMatch(
          /@\/lib\/shared\/(db|prisma)/,
        )
      }
    }
  })

  it('pedidos importa recetas solo por el barrel, y ese barrel publica lo que usa', () => {
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

    // Y el barrel es un camino REAL, no una regla vacia: `order-contents.ts` lo usa hoy
    // (`design.md > 6.3`). Sin esta mitad, R32 pasaria por no existir el sujeto.
    //
    // QC-35bis (2026-09-07): eran DOS barrels. Al salir la unidad del pedido, `pedidos` dejo de
    // importar `@/lib/modules/unidades` en cualquiera de sus archivos -lo sigue vigilando el
    // barrido de rutas profundas de arriba, que cubre los cuatro modulos-, asi que el unico
    // contrato ajeno que este modulo consume es el de `recetas`.
    const contents = read(join(pedidosDir, 'domain', 'order-contents.ts'))
    const specsDeContents = importSpecifiers(contents)
    expect(specsDeContents).toContain('@/lib/modules/recetas')
    expect(specsDeContents).not.toContain('@/lib/modules/unidades')
    expect(contents).toMatch(
      /import type \{[^}]*\bRecipeId\b[^}]*\} from '@\/lib\/modules\/recetas'/,
    )
    expect(contents).not.toContain('UnitId')

    // El contrato ajeno PUBLICA lo que `pedidos` usa: R32 exige que el barrel lo exponga, y
    // `RecipeId` lo anadio esta misma ficha (`design.md > 6.4`).
    const recetas = read(join(repoRoot, 'lib', 'modules', 'recetas', 'index.ts'))
    expect(recetas).toMatch(/export type \{[^}]*\bRecipeId\b[^}]*\} from '\.\/domain\//)
  })

  it('los valores del dominio coinciden, en orden, con los enum del esquema, y los dos defectos con los @default', () => {
    // R35, y es lo UNICO que lo cubre. Los valores del dominio son un duplicado a mano del
    // esquema porque el dominio no puede importar `@prisma/client` (`design.md > 6.2` y
    // `> 8.3`): el duplicado no se evita, se VIGILA. Se compara valor a valor y EN ORDEN —el
    // orden de la prioridad ES el dato (decision cerrada 4)—, asi que un `toEqual` sobre el
    // array, no un `toContain` ni un conjunto.
    // El CUARTO estado -`CANCELADO`- lo anadio QC-34 (su decision cerrada 3) a las DOS listas a
    // la vez; que sigan cuadrando valor a valor y EN ORDEN es exactamente lo que R35 vigila.
    expect(enumValues('OrderStatus')).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'ENTREGADO',
      'CANCELADO',
    ])
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

  it('la regla de transiciones vive en UN SOLO archivo del modulo, y la base no la impone', () => {
    // QC-33 R19 dejo escrito que ESTA base NO restringe que cambio de estado es valido
    // -cualquier estado puede sustituir a cualquier otro, salvo lo que impone el CHECK del
    // entregado- y que las transiciones validas eran de QC-34. YA LO SON: QC-34 las escribio en
    // `domain/order-transitions.ts` como regla de APLICACION (su R22, R23).
    //
    // Asi que lo que este caso vigila ya no es la AUSENCIA sino la UNICIDAD, que es lo que
    // seguia importando de R19: la tabla de transiciones esta en UN SOLO sitio y ningun otro
    // archivo del modulo declara la suya. Dos tablas serian dos verdades sobre lo mismo. Se
    // vigila el CODIGO, comentarios fuera: la prosa si puede hablar de transiciones.
    //
    // AJUSTADO EN T11 (2026-09-04), y hay que decir por que. La version anterior exigia que
    // NINGUN otro archivo nombrase `assertTransition`, y eso no distinguia DECLARAR la tabla
    // de CONSUMIRLA: `updateOrder` tiene que llamar a la guardia -es la tercera de las cuatro
    // capas de `design.md > 8` y lo que hace testeables R21 y R22-, asi que con el criterio
    // viejo la regla no se podia cumplir sin dejar la edicion sin guardia. Lo que se vigila
    // sigue siendo lo mismo y con los mismos dientes: la tabla se DECLARA en un solo sitio y
    // nadie escribe una segunda; lo unico que se admite fuera del dueno es la LLAMADA, y el
    // conjunto de quien llama se afirma explicitamente para que un consumidor nuevo sea una
    // decision y no un descuido.
    const PROHIBIDO =
      /\b(transitions?|transicion\w*|canTransition|allowedStatus\w*|nextStatus|stateMachine|maquina)\b/i
    const DECLARA_LA_TABLA =
      /\bALLOWED\b|export function assertTransition|export function isAllowedTransition/
    const CONSUME_LA_GUARDIA = /\b(assertTransition|isAllowedTransition)\s*\(/
    expect(pedidosSources.length).toBeGreaterThan(0)

    const DUENO = 'lib/modules/pedidos/domain/order-transitions.ts'
    expect(pedidosSources.filter((file) => DECLARA_LA_TABLA.test(read(file))).map(etiqueta)).toEqual(
      [DUENO],
    )

    // Quien la CONSUME, y nadie mas: cancelar no pasa por aqui -es `cancelOrder` y su propio
    // `NotCancellableError`- y borrar tampoco. `transition-order.ts` consume la
    // guardia: es quien implementa `OrderCatalog.transitionAliveById`, y el Finalizar de la
    // planta la comprueba antes de abrir la unidad de trabajo. `update-order.ts` la consume
    // sobre la fila que se acaba de leer -y otra vez sobre la que acaba de bloquear
    // `lockAliveById`-, pero SOLO para comprobar que el pedido admite seguir en su mismo
    // estado: la edicion ya no mueve el estado, asi que nunca llama con dos estados distintos.
    // `order-catalog-prisma.ts` PERDIO
    // su llamada: `transitionAliveOrder`, la unica que la hacia, se retiro sin llamantes -el
    // Finalizar consume dentro de `createTransitionOrder`, que YA es quien cablea
    // `OrderCatalog.transitionAliveById`-, y con ella se fue la ultima razon para que ese
    // adaptador importara `order-transitions.ts`.
    expect(
      pedidosSources.filter((file) => CONSUME_LA_GUARDIA.test(read(file))).map(etiqueta),
    ).toEqual([
      DUENO,
      'lib/modules/pedidos/domain/transition-order.ts',
      'lib/modules/pedidos/domain/update-order.ts',
    ])

    for (const file of pedidosSources) {
      if (etiqueta(file) === DUENO) continue
      // Se descuentan las DOS formas legitimas de consumir al dueno -importarlo y llamarlo-;
      // lo que quede tiene que estar limpio. Un `const ALLOWED = {...}` propio, un
      // `canTransition`, un `nextStatus` o una segunda `stateMachine` siguen cayendo aqui.
      const sinConsumo = read(file)
        .replace(/from\s+'[^']*order-transitions'/g, ' ')
        // La RUTA del archivo nuevo -`domain/transition-order.ts`, quien tambien consume la
        // guardia- contiene la palabra "transition" delimitada por el guion, y el criterio de
        // abajo la leeria como una segunda tabla si no se descuenta aqui igual que la ruta del
        // dueno.
        .replace(/from\s+'[^']*transition-order'/g, ' ')
        .replace(/\b(assertTransition|isAllowedTransition)\b/g, ' ')
      expect(sinConsumo, `${etiqueta(file)} declara una transicion de estado`).not.toMatch(PROHIBIDO)
    }

    // El criterio tiene que poder FALLAR: una segunda tabla en otro archivo se ve, y una
    // simple llamada a la guardia no.
    expect(DECLARA_LA_TABLA.test('const ALLOWED = { PENDIENTE: [] }')).toBe(true)
    expect(DECLARA_LA_TABLA.test('assertTransition(row.status, data.status)')).toBe(false)
    expect(
      PROHIBIDO.test(
        "const nextStatus = 'EN_CURSO'".replace(/\b(assertTransition|isAllowedTransition)\b/g, ' '),
      ),
    ).toBe(true)

    // Y la restriccion NO baja a la base (QC-33 R19, QC-34 R23): ningun trigger impone que
    // estado puede seguir a cual. No hay ni un trigger en este repositorio.
    const sqlDeOrders = readdirSync(join(repoRoot, 'db', 'migrations'))
      .filter((name) => /_orders$|_order_cancellation$/.test(name))
      .flatMap((name) =>
        ['migration.sql', 'down.sql']
          .map((archivo) => join(repoRoot, 'db', 'migrations', name, archivo))
          .filter((archivo) => existsSync(archivo)),
      )
      .map((archivo) => readFileSync(archivo, 'utf8'))
      .join('\n')
    expect(sqlDeOrders.length).toBeGreaterThan(0)
    expect(sqlDeOrders, 'la base impone las transiciones con un trigger').not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i,
    )

    // Lo que el contrato publica sobre el estado sigue siendo la LISTA de valores y su defecto.
    const contrato = read(barrel)
    expect(contrato).toMatch(/ORDER_STATUS_VALUES/)
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

  it('las Server Actions viven en UN SOLO archivo driving, y no hay ninguna ruta HTTP ni pantalla', () => {
    // RETENSADO 2026-09-04 (QC-34, T15). La version de QC-33 exigia que `adapters/driving/`
    // estuviera VACIA y que no hubiera ni un `'use server'` en el modulo, porque aquella ficha
    // era esquema, migracion y armazon: las Server Actions eran explicitamente de QC-34 (su
    // R39 lo decia con esas palabras). QC-34 las escribe (su R54), asi que la premisa cayo por
    // el requisito que la propia QC-33 anuncio, no por conveniencia.
    //
    // Lo que se sigue vigilando -y es todo lo que ese caso protegia de verdad- es el ALCANCE:
    // las actions estan en UN solo archivo dentro de `adapters/driving/`, ningun otro archivo
    // del modulo declara `'use server'`, no hay ninguna ruta HTTP ni pantalla de pedidos, y
    // `app/`/`components/` siguen sin conocer el modulo -la pantalla es QC-35 (R57)-.
    //
    // El proceso diario suma un SEGUNDO archivo driving: un Route Handler, no una
    // Server Action -no hay usuario delante, la puerta es un secreto, no una sesion-, por eso
    // no declara `'use server'` y el `.toEqual` de mas abajo lo sigue dejando fuera.
    const ACTIONS = 'lib/modules/pedidos/adapters/driving/order-actions.ts'
    const CRON_ROUTE = 'lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts'
    const driving = join(pedidosDir, 'adapters', 'driving')
    expect(sourcesIn(driving).map(etiqueta).sort()).toEqual([ACTIONS, CRON_ROUTE].sort())
    expect(readdirSync(driving), 'driving/ conserva un .gitkeep con codigo dentro').not.toContain(
      '.gitkeep',
    )

    // El `'use server'` esta en ese archivo y SOLO en ese: ni el dominio, ni los puertos, ni el
    // adaptador driven, ni el Route Handler del cron pueden declararlo.
    expect(
      pedidosSources.filter((file) => /['"]use server['"]/.test(read(file))).map(etiqueta),
    ).toEqual([ACTIONS])

    // Y la action NO pasa por el barrel (`docs/architecture.md`, excepcion de los driving):
    // QC-35 la importara por su ruta exacta.
    expect(read(barrel), 'el barrel reexporta la Server Action').not.toMatch(/order-actions/)

    // Ninguna ruta HTTP de pedidos: las mutaciones son Server Actions. Esto NO se afloja.
    for (const ruta of [join(repoRoot, 'app', 'api', 'orders'), join(repoRoot, 'app', 'api', 'pedidos')]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false)
    }

    // INVERTIDO 2026-09-07 (QC-35), y lo decide el HUMANO. Hasta hoy este caso exigia que no
    // existiera la carpeta `app/(private)/pedidos` y que ningun archivo de `app/` ni de
    // `components/` importara el modulo. Era el limite de alcance de QC-34 -«la pantalla es
    // QC-35 (R57)»-, anunciado por su propio requisito, y QC-35 es la ficha que la construye:
    // la premisa cayo por el requisito que la anuncio, no por conveniencia. Mismo trato que
    // recibio la version de QC-33 en el RETENSADO de arriba.
    //
    // Lo que se sigue vigilando, que es lo que de verdad protegia: la pantalla vive en la
    // carpeta que DERIVA de `ORDERS_ROUTE` -nunca de un literal- y quien consume el modulo lo
    // hace SOLO por su contrato publico o por el driving por RUTA EXACTA. Consumirlo por
    // dentro -`domain/`, `ports/`, `adapters/driven/`- sigue siendo una infraccion, y
    // `components/`, que no tiene ruta ni ficha, sigue sin poder tocarlo en absoluto.
    const carpetaDeLaPantalla = join(
      repoRoot,
      'app',
      '(private)',
      ...ORDERS_ROUTE.split('/').filter((segmento) => segmento.length > 0),
    )
    expect(
      existsSync(join(carpetaDeLaPantalla, 'page.tsx')),
      `falta ${etiqueta(carpetaDeLaPantalla)}/page.tsx: la pantalla de pedidos es QC-35`,
    ).toBe(true)

    // `app/(private)/asignacion/` es la pantalla de OTRO modulo, que consume el contrato publico
    // de `pedidos` (el tipo `OrderPriority`) y tiene su propio contrato de ruta: no es una fuga
    // por goteo de la pantalla de `pedidos`. Se excluye por PREFIJO DE CARPETA, no por archivo.
    const carpetaAsignacion = join(repoRoot, 'app', '(private)', 'asignacion')

    // El Route Handler del proceso diario consume el driving de `pedidos` por su ruta exacta,
    // no la pantalla: exclusion NOMBRADA, por ARCHIVO y no por carpeta -no hay ninguna otra
    // pieza de pedidos ahi que deba colarse igual-.
    const rutaCronCaducidad = join(repoRoot, 'app', 'api', 'cron', 'caducar-pedidos', 'route.ts')

    let consumidoresDeLaPantalla = 0
    for (const file of [
      ...sourcesIn(join(repoRoot, 'app')),
      ...sourcesIn(join(repoRoot, 'components')),
    ]) {
      const codigo = read(file)
      const especificadores = [...codigo.matchAll(/\bfrom\s+'(@\/lib\/modules\/pedidos[^']*)'/g)].map(
        (match) => match[1] as string,
      )
      if (especificadores.length === 0) continue

      const dentroDeOtraPantallaAutorizada =
        !relative(carpetaAsignacion, file).startsWith(`..${sep}`) || file === rutaCronCaducidad
      if (dentroDeOtraPantallaAutorizada) continue

      const dentroDeLaPantalla = !relative(carpetaDeLaPantalla, file).startsWith(`..${sep}`)
      expect(
        dentroDeLaPantalla,
        `${etiqueta(file)} importa el modulo pedidos fuera de la pantalla que lo consume`,
      ).toBe(true)
      consumidoresDeLaPantalla += 1

      for (const spec of especificadores) {
        expect(
          spec === '@/lib/modules/pedidos' ||
            spec.startsWith('@/lib/modules/pedidos/adapters/driving/'),
          `${etiqueta(file)} consume pedidos por dentro (${spec}): solo el contrato publico o el driving por ruta exacta`,
        ).toBe(true)
      }
    }
    // Sin esto, el bucle de arriba pasaria en verde por no haber iterado sobre nada.
    expect(consumidoresDeLaPantalla, 'la pantalla de pedidos deberia consumir su modulo').toBeGreaterThan(0)

    // `lib/composition` cablea `pedidos`, y es el UNICO sitio del repo que puede hacerlo (R52).
    //
    // RETENSADO 2026-09-04 (QC-34, T14). QC-33 afirmaba aqui que la composicion no nombraba
    // `pedidos` -«no cablea nada porque no tiene puerto ni adaptador»-, y era la asercion que
    // impedia adelantar QC-34 por la puerta de atras. Ya no se adelanta nada: es su ficha. Lo
    // que se vigila ahora es la EXCLUSIVIDAD, que es la regla que de verdad importaba: el
    // puerto se ata a su implementacion en `lib/composition` y en ningun otro sitio.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
      .map((file) => read(file))
      .join('\n')
    expect(composicion.length).toBeGreaterThan(0)
    expect(composicion, 'la composicion deberia cablear pedidos').toMatch(
      /adapters\/driven\/persistence\/order-prisma/,
    )

    // Y nadie mas instancia el adaptador driven: ni una pantalla, ni un script, ni el propio
    // driving -que lo pide a la composicion, nunca lo construye (regla 3 de los modulos)-.
    expect(
      todoElCodigo
        .filter((file) => /adapters\/driven\/persistence\/order-prisma/.test(read(file)))
        .map(etiqueta),
    ).toEqual(['lib/composition/index.ts'])

    // Y `db:seed` tampoco sabe de pedidos.
    const seedScript = read(join(repoRoot, 'scripts', 'seed.ts'))
    expect(seedScript.length).toBeGreaterThan(0)
    expect(seedScript, 'scripts/seed.ts siembra pedidos').not.toMatch(/pedidos|prisma\.order/)
  })
})
