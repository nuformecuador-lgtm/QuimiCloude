// T9 — Forma del modulo `unidades` y sus fronteras (QC-32).
//
// Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el
// comportamiento: que el contrato publico solo reexporte dominio, que las carpetas sean las
// tres de la guardia, que nada de servidor sea alcanzable desde el barrel, que NINGUN archivo
// del repo consulte la tabla `units`, que `inventario` y `recetas` no sepan de `unidades` mas
// que por su barrel, que el catalogo no publique ninguna conversion, y que esta ficha no
// abra ningun flujo navegable. Mismo patron —y buena parte de los mismos ayudantes— que
// `tests/unit/recetas/module-contract.test.ts` (QC-24) y
// `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// La guardia generica ya prohibe casi todo esto. Aqui queda escrito como REQUISITO de esta
// feature (`design.md > 9`, fila «Unitario») en vez de como efecto colateral de una guardia
// que manana podria cambiar de alcance.
//
// ACTUALIZADO el 2026-09-03 (ronda 3), cuando el humano retiro el aparato del seed y el
// conjunto arrancador paso a ser un `INSERT` de la migracion. Dos criterios cambiaron de
// forma —no de exigencia— y esta explicado donde cambian:
//   * «`prisma.unit` solo aparece en el adaptador driven» ya no tiene sujeto: ese adaptador
//     no existe. Ahora se afirma que NINGUN archivo del repo consulta la tabla, y el barrido
//     que lo comprueba se ejercita ademas contra una entrada SINTETICA con una consulta real,
//     para que la lista vacia no pueda ser vacia por vacuidad.
//   * «la composicion cablea el seed» se INVIERTE: ni `lib/composition` ni `scripts/seed.ts`
//     pueden nombrar un seed de unidades. Es la mitad negativa de R26.
//
// ACTUALIZADO el 2026-09-03 (ronda 4, QC-25/R50): el primer CONSUMIDOR de `UnitCatalog`
// -que esta ficha situaba en QC-38- llego antes, con QC-25: `recetas` necesita validar
// `unitId` contra el catalogo en su alta y su edicion. `adapters/driven/` deja de estar
// vacia y `lib/composition` cablea la LECTURA (`findUnitRefs`) -nunca una escritura,
// que sigue siendo QC-38-. Donde eso cambia el criterio de un test, queda anotado ahi.
//
// Cubre R14, R16, R17, R19, R26 (su mitad negativa) y R27; y refuerza R4 y R15.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeUnitName } from '@/lib/modules/unidades'

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
const unidadesDir = join(repoRoot, 'lib', 'modules', 'unidades')
const inventarioDir = join(repoRoot, 'lib', 'modules', 'inventario')
const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')

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
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. Es el mismo ayudante
 * que usa `tests/unit/recetas/module-contract.test.ts` y no es un detalle cosmetico en esta
 * ficha: hay comentarios en el repo que contienen el texto `prisma.unit` para explicar
 * precisamente quien puede escribirlo —`lib/modules/unidades/domain/unit-catalog.ts` dice que
 * el `UnitCatalog` lo implementara «un adaptador driven DE UNIDADES, el unico que puede tocar
 * `prisma.unit`»—, y este mismo archivo lo escribe varias veces en prosa. Un barrido sobre el
 * texto crudo leeria la ADVERTENCIA como la INFRACCION y este test no vigilaria nada,
 * molestaria.
 *
 * Se quitan los bloques `/* ... *\/` y todo lo que siga a `//` en cada linea. El unico falso
 * negativo posible seria un `prisma.unit` escondido detras de un `//` dentro de una cadena
 * (p. ej. una URL), y en ese caso no seria una consulta a la tabla igualmente.
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
 *  distingue `db.unit.findMany(...)` —una consulta— de `candidate.unit.name`, que es un campo
 *  de un objeto del dominio. Ese segundo caso existio hasta el 2026-09-03 en
 *  `lib/modules/unidades/domain/seed-units.ts`; el archivo se retiro con el seed, pero el
 *  predicado tiene que seguir distinguiendolo: el dia que QC-38 escriba un caso de uso que
 *  reciba `{ unit }` y lea `unit.name`, el barrido no puede ponerse rojo por eso. */
const METODOS_DE_PRISMA =
  'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy'

/**
 * ¿Este fuente CONSULTA la tabla de unidades? Dos formas cuentan, y las dos son acceso real
 * al delegado, no texto: comentarios fuera (ver `leerFuente`).
 *
 * 1. `prisma.unit...` — el cliente compartido, sobre cualquier receptor llamado `prisma`.
 * 2. `<lo que sea>.unit.<metodo de Prisma>(...)` — el delegado sobre un receptor con otro
 *    nombre. Hizo falta cuando el adaptador driven del seed consultaba sobre su parametro
 *    (`db.unit.findMany`), y se queda ahora que ese adaptador no existe: sin esta segunda
 *    forma, R15/R16 podrian incumplirse en cualquier archivo con solo renombrar el receptor,
 *    y el barrido de abajo quedaria verde por vacio.
 *
 * NO cuenta un modelo distinto cuyo nombre EMPIECE por `unit` —`prisma.units`,
 * `prisma.unitConversion`—: serian otra tabla. Ni el acceso a un campo `unit` de un objeto
 * del dominio, que no lleva metodo de Prisma detras.
 */
export function consultaTablaDeUnidades(texto: string): boolean {
  const codigo = leerFuente(texto)
  const clienteCompartido = /\bprisma\s*\.\s*unit(?![A-Za-z0-9_])/
  const delegadoSobreOtroReceptor = new RegExp(
    `[A-Za-z0-9_$]\\s*\\.\\s*unit\\s*\\.\\s*(?:${METODOS_DE_PRISMA})\\s*[(<]`,
  )
  return clienteCompartido.test(codigo) || delegadoSobreOtroReceptor.test(codigo)
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

const barrel = join(unidadesDir, 'index.ts')
const unidadesSources = sourcesIn(unidadesDir)
const migrationsDir = join(repoRoot, 'db', 'migrations')

/** Todo el codigo de aplicacion del repo, mas los scripts: donde podria esconderse una
 *  consulta a `units`. Incluye `lib/modules/unidades`: desde la ronda 3 tampoco el propio
 *  modulo tiene un sitio donde consultarla. */
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
 * consultan la tabla de unidades, en el orden recibido.
 *
 * Se extrae a una funcion —en vez de filtrar la lista de archivos en el sitio— para poder
 * aplicarla DOS veces en el mismo test: a los archivos reales del repo (donde la respuesta
 * correcta es la lista vacia) y a esos mismos archivos MAS una entrada sintetica con una
 * consulta de verdad. Sin la segunda pasada, la primera seria un `toEqual([])` que tambien
 * saldria verde si el barrido no leyera nada.
 */
export function nombresQueConsultanUnidades(
  entradas: readonly EntradaDeBarrido[],
): readonly string[] {
  return entradas.filter((entrada) => consultaTablaDeUnidades(entrada.fuente)).map((e) => e.nombre)
}

/** Los archivos reales del repo, ya leidos, como entradas del barrido. */
const entradasReales: readonly EntradaDeBarrido[] = todoElCodigo.map((file) => ({
  nombre: etiqueta(file),
  fuente: readFileSync(file, 'utf8'),
}))

describe('lib/modules/unidades — forma del modulo, fronteras y limite de alcance', () => {
  it("el modulo unidades tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R17: el modulo nace con la forma hexagonal del repositorio (`design.md > 5.1`).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/unidades/index.ts').toBe(true)

    const carpetas = readdirSync(unidadesDir)
      .filter((name) => statSync(join(unidadesDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    expect(
      readdirSync(join(unidadesDir, 'adapters'))
        .filter((name) => statSync(join(unidadesDir, 'adapters', name)).isDirectory())
        .sort(),
    ).toEqual(['driven', 'driving'])

    // `ports/` sigue VACIA y sembrada con `.gitkeep` (`design.md > 5.1`, ronda 3): el
    // contrato de lectura (`UnitCatalog`) vive en `domain/`, mismo criterio que
    // `ProductCatalog` de `inventario` -no hace falta un puerto aparte para el, es la
    // interfaz que el propio dominio publica-.
    //
    // ACTUALIZADO 2026-09-03 (QC-25, R50): `adapters/driven/` YA NO esta vacia. El
    // consumidor que esta ronda anticipaba para QC-38 llego antes, con QC-25: `recetas`
    // necesita validar `unitId` contra el catalogo en el alta y en la edicion, asi que
    // implementa `unit-catalog-prisma.ts` -el UNICO archivo del repo que consulta
    // `prisma.unit`, ver el test de barrido mas abajo-.
    expect(sourcesIn(join(unidadesDir, 'ports')), 'ports/ no deberia tener fuentes').toEqual([])
    expect(readdirSync(join(unidadesDir, 'ports')), 'ports/ deberia tener solo .gitkeep').toEqual([
      '.gitkeep',
    ])

    // El contrato solo reexporta de `./domain`: ni puertos, ni adaptadores, ni nada de fuera.
    const contrato = read(barrel)
    const specs = importSpecifiers(contrato)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec, `el barrel no puede reexportar de ${spec}`).toMatch(/^\.\/domain(\/|$)/)
    }
    expect(contrato, 'el barrel reexporta de ./ports').not.toMatch(/from '\.\/ports/)
    expect(contrato, 'el barrel reexporta de ./adapters').not.toMatch(/from '\.\/adapters/)

    // Cierre transitivo del barrel: nada de servidor. Un componente de cliente tiene que
    // poder importar `@/lib/modules/unidades` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(1)
    for (const file of alcanzables) {
      // El barrel solo alcanza DOMINIO: ni un puerto ni un adaptador. Antes esto se escribia
      // como «el adaptador driven del seed no es alcanzable»; ese archivo ya no existe, asi
      // que la regla se afirma sobre la CAPA y no sobre un nombre concreto, y sigue valiendo
      // el dia que QC-38 llene esas dos carpetas.
      expect(
        toPosix(relative(unidadesDir, file)),
        `${etiqueta(file)} vive en adapters/ o ports/ y es alcanzable desde el barrel`,
      ).not.toMatch(/^(adapters|ports)\//)
    }
    for (const file of alcanzables) {
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
      expect(consultaTablaDeUnidades(source), `${nombre} consulta prisma.unit`).toBe(false)
    }
  })

  it('a lo sumo el adaptador driven de unidades consulta la tabla de unidades, y el barrido lo demuestra sobre una consulta real', () => {
    // R15 y R16, leidos al dia de hoy. El criterio de las rondas 1 y 2 era «`prisma.unit`
    // aparece EXACTAMENTE en el adaptador driven de `unidades` y en ninguno mas». Ese
    // adaptador se retiro el 2026-09-03 con el aparato del seed y la ronda 3 endurecio el
    // criterio a NINGUNO -no habia consumidor todavia-.
    //
    // ACTUALIZADO 2026-09-03 (QC-25, R50): el consumidor que esta ronda situaba en QC-38
    // llego antes, con QC-25 -`recetas` necesita validar `unitId` en el alta y en la
    // edicion-, asi que el criterio vuelve a ser el de las rondas 1 y 2: EXACTAMENTE
    // `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`, y ningun
    // otro archivo.
    //
    // QUE LO VOLVERIA ROJO: cualquier `prisma.unit.<metodo>` o `<receptor>.unit.<metodo>` en
    // OTRO archivo de `lib`, `app`, `components`, `hooks`, `scripts` o `middleware.ts`
    // -`lib/composition` incluido, que solo puede REFERENCIAR `findUnitRefs`, nunca
    // consultar la tabla por su cuenta-.
    const ADAPTADOR_PERMITIDO = 'lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts'
    expect(todoElCodigo.length).toBeGreaterThan(0)
    expect(entradasReales).toHaveLength(todoElCodigo.length)
    expect(nombresQueConsultanUnidades(entradasReales)).toEqual([ADAPTADOR_PERMITIDO])

    // Y la MISMA funcion, sobre los MISMOS archivos reales mas una entrada sintetica con una
    // consulta de verdad, devuelve el adaptador permitido MAS esa. Esto es lo que sustituye
    // al viejo «y ese archivo la consulta de verdad»: sin esta segunda pasada, el `toEqual`
    // de arriba seria verde tambien si el barrido no leyera nada o si el predicado hubiera
    // dejado de reconocer una consulta.
    const sintetico: EntradaDeBarrido = {
      nombre: '<sintetico>',
      fuente: 'export async function x(prisma: unknown) { await prisma.unit.findMany({}) }',
    }
    expect(nombresQueConsultanUnidades([...entradasReales, sintetico])).toEqual([
      ADAPTADOR_PERMITIDO,
      '<sintetico>',
    ])
    // Tambien con el receptor renombrado, que es la forma por la que se escaparia: el barrido
    // no depende de que el cliente se llame `prisma`.
    const conOtroReceptor: EntradaDeBarrido = {
      nombre: '<sintetico-db>',
      fuente: 'await db.unit.create({ data })',
    }
    expect(nombresQueConsultanUnidades([...entradasReales, conOtroReceptor])).toEqual([
      ADAPTADOR_PERMITIDO,
      '<sintetico-db>',
    ])
  })

  it('el criterio de «consulta prisma.unit» distingue codigo de comentario, y cae ante una consulta real', () => {
    // Un test que no puede fallar no vigila nada (`design.md > 9`). Aqui se prueba el
    // PREDICADO con fuentes sinteticos, porque de el depende todo el bloque anterior.
    // Positivos: acceso real, con o sin espacios y con cualquier metodo detras.
    expect(consultaTablaDeUnidades('await prisma.unit.findMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('const a = prisma . unit . create({})')).toBe(true)
    expect(consultaTablaDeUnidades('return tx.prisma.unit.count()')).toBe(true)
    // El delegado sobre un receptor con OTRO nombre: es como consulta hoy el adaptador, y es
    // tambien como se escaparia una consulta prohibida en otro archivo.
    expect(consultaTablaDeUnidades('await db.unit.findMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('await tx.unit.create({ data })')).toBe(true)
    expect(consultaTablaDeUnidades('await cliente . unit . deleteMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('await this.db.unit.upsert({})')).toBe(true)

    // Negativos: los dos tipos de comentario que EXISTEN hoy en el repo con ese texto.
    expect(consultaTablaDeUnidades('// el unico sitio con `prisma.unit` es el adaptador')).toBe(
      false,
    )
    expect(consultaTablaDeUnidades('/** el adaptador que puede tocar `prisma.unit` */')).toBe(false)
    // Y un modelo distinto cuyo nombre empieza igual: no es la tabla `units`.
    expect(consultaTablaDeUnidades('await prisma.units.findMany({})')).toBe(false)
    expect(consultaTablaDeUnidades('await prisma.unitConversion.findMany({})')).toBe(false)
    // Y un campo `unit` de un objeto del dominio, que no es un delegado de Prisma. Este caso
    // EXISTIO hasta el 2026-09-03 en `lib/modules/unidades/domain/seed-units.ts`
    // (`candidate.unit.name`), retirado con el seed. El predicado tiene que seguir
    // distinguiendolo igual: en cuanto QC-38 escriba un caso de uso que reciba una unidad y
    // lea su nombre, un predicado mas grosero pondria el barrido rojo por algo que no es
    // R15/R16, y la respuesta seria aflojar el barrido. Se prueba aqui para que no ocurra.
    expect(consultaTablaDeUnidades('createdUnits.push(candidate.unit.name)')).toBe(false)
    expect(consultaTablaDeUnidades('const s = candidate.unit.symbol')).toBe(false)
  })

  it('inventario y recetas importan unidades solo por el barrel', () => {
    // R16: todo lo que esos dos modulos sepan de una unidad llega por
    // `@/lib/modules/unidades`. Ni dominio, ni puertos, ni adaptadores por ruta profunda.
    const ajenos = [...sourcesIn(inventarioDir), ...sourcesIn(recetasDir)]
    expect(ajenos.length).toBeGreaterThan(0)

    for (const file of ajenos) {
      const source = read(file)
      const nombre = etiqueta(file)
      expect(consultaTablaDeUnidades(source), `${nombre} consulta prisma.unit`).toBe(false)
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${nombre}: ruta profunda a unidades`).not.toMatch(
          /^@\/lib\/modules\/unidades\/./,
        )
      }
    }

    // Y el barrel es un camino REAL, no una regla vacia: `inventario` lo usa hoy (QC-32 T6).
    const porElBarrel = ajenos.filter((file) =>
      importSpecifiers(read(file)).includes('@/lib/modules/unidades'),
    )
    expect(porElBarrel.map(etiqueta)).toContain('lib/modules/inventario/domain/product-catalog.ts')
  })

  it('el barrel de unidades exporta normalizeUnitName', () => {
    // R4: la normalizacion tiene UNA sola definicion y la publica el contrato del modulo,
    // para que la columna `name_normalized` y cualquier consumidor futuro normalicen igual.
    // Aqui si se afirma en ejecucion: es una funcion, no un tipo.
    expect(typeof normalizeUnitName).toBe('function')
    expect(normalizeUnitName('MILI-LITRO')).toBe('mililitro')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bnormalizeUnitName\b[^}]*\} from '\.\/domain\//)

    // Y esta implementada UNA sola vez en todo el repo: una segunda copia (en un service, en
    // la migracion, en un componente) dejaria de cumplir R4.
    const definiciones = todoElCodigo
      .filter((file) => /function normalizeUnitName/.test(read(file)))
      .map(etiqueta)
    expect(definiciones).toEqual(['lib/modules/unidades/domain/unit-name.ts'])
  })

  it('el modulo unidades no expone ninguna conversion ni factor', () => {
    // R14: la unidad es puramente ANOTATIVA. No se convierte, no se deriva y no se compara
    // entre unidades distintas (decision cerrada 12, `design.md > 10`). Se vigila el codigo
    // del modulo entero, no solo el barrel: un `factor` en el adaptador tambien seria una
    // conversion a medio construir.
    const PROHIBIDO = /\b(factor|convert|conversion|ratio|equivalen\w*|multiplier|toBase|baseUnit)\b/i
    expect(unidadesSources.length).toBeGreaterThan(0)
    for (const file of unidadesSources) {
      expect(read(file), `${etiqueta(file)} nombra una conversion o un factor`).not.toMatch(
        PROHIBIDO,
      )
    }

    // Y el tipo que `unidades` publica hacia fuera tiene exactamente tres campos: identidad,
    // nombre y simbolo. Nada con lo que multiplicar.
    const unitCatalog = read(join(unidadesDir, 'domain', 'unit-catalog.ts'))
    const cuerpoUnitRef = /export type UnitRef = \{([^}]*)\}/.exec(unitCatalog)?.[1] ?? ''
    const campos = [...cuerpoUnitRef.matchAll(/(\w+)\s*:/g)].map((m) => m[1])
    expect(campos).toEqual(['id', 'name', 'symbol'])

    // Tampoco hay una tabla de equivalencias escondida en el conjunto arrancador. Desde el
    // 2026-09-03 el arrancador no es `domain/starter-units.ts` —retirado con el seed— sino el
    // `INSERT` de la migracion, asi que la comprobacion se hace DONDE AHORA VIVE EL DATO: las
    // columnas que ese INSERT rellena son exactamente el nombre, el nombre normalizado, el
    // simbolo y la marca de modificacion. Ni `factor`, ni `base`, ni `equivalencia`: si algun
    // dia alguien las anade al arrancador, tendra que anadirlas ahi y este test cae.
    const arrancadores = readdirSync(migrationsDir).filter((name) =>
      name.endsWith('_units_catalog'),
    )
    expect(arrancadores, 'debe existir exactamente una migracion *_units_catalog').toHaveLength(1)
    const sqlDelArrancador = readFileSync(
      join(migrationsDir, arrancadores[0] as string, 'migration.sql'),
      'utf8',
    )
    const insert = /INSERT INTO "units"\s*\(([^)]*)\)/.exec(sqlDelArrancador)
    expect(insert, 'la migracion ya no inserta el conjunto arrancador').not.toBeNull()
    const columnasDelInsert = [
      ...((insert as RegExpExecArray)[1] as string).matchAll(/"(\w+)"/g),
    ].map((match) => match[1])
    expect(columnasDelInsert).toEqual(['name', 'name_normalized', 'symbol', 'updated_at'])
  })

  it('ProductRef, ProductView, NewProduct y el esquema zod de producto usan unitId y ningun texto de unidad', () => {
    // R19: donde `inventario` publica la unidad hacia fuera o la recibe del borde, lo hace
    // con la REFERENCIA al catalogo y con el tipo que publica `@/lib/modules/unidades`
    // (`design.md > 5.3`). Un campo llamado `unit` de tipo texto seria justo lo que R19
    // prohibe, asi que se busca el nombre de campo exacto `unit:` —`unitId:` no lo activa—.
    const CAMPO_UNIT_TEXTO = /\bunit\s*\??\s*:/

    const catalogo = read(join(inventarioDir, 'domain', 'product-catalog.ts'))
    expect(catalogo).toMatch(/readonly unitId: UnitId \| null/)
    expect(catalogo, 'ProductRef conserva un campo `unit`').not.toMatch(CAMPO_UNIT_TEXTO)
    expect(catalogo).toMatch(/import type \{[^}]*\bUnitId\b[^}]*\} from '@\/lib\/modules\/unidades'/)

    const vista = read(join(inventarioDir, 'domain', 'product-view.ts'))
    expect(vista).toMatch(/readonly unitId\?: UnitId \| null/) // NewProduct
    expect(vista).toMatch(/readonly unitId: UnitId \| null/) // ProductView
    expect(vista, 'ProductView/NewProduct conservan un campo `unit`').not.toMatch(CAMPO_UNIT_TEXTO)
    expect(vista).toMatch(/from '@\/lib\/modules\/unidades'/)

    const entrada = read(join(inventarioDir, 'domain', 'product-input.ts'))
    expect(entrada).toMatch(/unitId:\s*unitIdSchema\.nullish\(\)/)
    // La forma que se valida es un uuid, no un texto libre: que EXISTA lo rechaza la FK (R12).
    expect(entrada).toMatch(/const unitIdSchema = z\.string\(\)\.uuid\(\)/)
    expect(entrada, 'el esquema zod conserva un campo `unit` de texto').not.toMatch(
      CAMPO_UNIT_TEXTO,
    )
    expect(entrada, 'el esquema zod acepta la unidad como texto').not.toMatch(
      /unit:\s*z\.string\(\)/,
    )

    // El borde tambien: el `FormData` trae `unitId`, no `unit`.
    const acciones = read(join(inventarioDir, 'adapters', 'driving', 'product-actions.ts'))
    expect(acciones).toMatch(/readOptionalFormString\(formData, 'unitId'\)/)
    expect(acciones, "el formulario sigue leyendo la clave 'unit'").not.toMatch(/'unit'/)
  })

  it('la feature no anade adaptadores driving, rutas ni Server Actions', () => {
    // R27: esta ficha es esquema, migracion —con su arrancador en SQL— y armazon del modulo.
    // Ningun alta, edicion ni borrado
    // de unidades —eso es QC-38— y por tanto ningun flujo navegable que un E2E pueda visitar
    // (decision cerrada 18).
    const driving = join(unidadesDir, 'adapters', 'driving')
    expect(sourcesIn(driving), `${etiqueta(driving)} deberia estar vacia`).toEqual([])
    // Sigue sembrada con su `.gitkeep`, para que git la versione (`design.md > 5.1`).
    expect(readdirSync(driving)).toEqual(['.gitkeep'])

    // Ningun 'use server' en TODO el modulo, no solo en lo alcanzable desde el barrel.
    for (const file of unidadesSources) {
      expect(read(file), `${etiqueta(file)} declara 'use server'`).not.toMatch(
        /['"]use server['"]/,
      )
    }

    // Ninguna ruta HTTP ni pantalla de unidades.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'units'),
      join(repoRoot, 'app', 'api', 'unidades'),
      join(repoRoot, 'app', '(private)', 'unidades'),
      join(repoRoot, 'app', '(private)', 'units'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false)
    }

    // Y ningun archivo de `app/` conoce todavia el modulo: la pantalla es QC-39.
    for (const file of sourcesIn(join(repoRoot, 'app'))) {
      expect(read(file), `${etiqueta(file)} importa el modulo unidades`).not.toMatch(
        /@\/lib\/modules\/unidades/,
      )
    }

    // MITAD NEGATIVA DE R26, y el criterio esta INVERTIDO respecto a las rondas 1 y 2: ahi se
    // exigia que `lib/composition` nombrara `seedStarterUnits`. Desde el 2026-09-03
    // `lib/composition` no cablea ningun SEED de `unidades` (`design.md > 5.4`, anulada) y
    // `scripts/seed.ts` vuelve a hablar solo de roles y usuario inicial (QC-6): no hay seed de
    // aplicacion que cree, actualice o pise unidades del catalogo. Esta es la asercion que se
    // pone roja si alguien reintroduce ese aparato por la puerta de atras.
    //
    // ACTUALIZADO 2026-09-03 (QC-25, R50): esto NO incluye la LECTURA. `lib/composition`
    // SI cablea `UnitCatalog` -con el adaptador driven de arriba- para que `recetas` pueda
    // validar `unitId`; lo que sigue prohibido es CUALQUIER escritura (alta, edicion o
    // borrado de unidades: eso sigue siendo QC-38) y cualquier seed.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
      .map((file) => read(file))
      .join('\n')
    expect(composicion.length).toBeGreaterThan(0)
    expect(composicion, 'la composicion volvio a cablear un seed de unidades').not.toMatch(
      /STARTER_UNITS|[sS]eedStarterUnits|[uU]nitSeedRepository|unit-seed-repository|seed-units/,
    )
    expect(composicion, 'la composicion cablea la LECTURA de unidades (UnitCatalog, R50)').toMatch(
      /findUnitRefs/,
    )
    expect(composicion, 'la composicion nombra un puerto o adaptador de unidades fuera del de lectura')
      .not.toMatch(/modules\/unidades\/(adapters(?!\/driven\/persistence\/unit-catalog-prisma)|ports)/)
    expect(composicion, 'la composicion cablea una ESCRITURA de unidades (alta/edicion/borrado, QC-38)').not.toMatch(
      /createUnit|updateUnit|deleteUnit/i,
    )

    // Y `db:seed` no sabe de unidades: el catalogo nace con su migracion, no con este script.
    const seedScript = read(join(repoRoot, 'scripts', 'seed.ts'))
    expect(seedScript.length).toBeGreaterThan(0)
    expect(seedScript, 'scripts/seed.ts volvio a sembrar unidades').not.toMatch(/unidades|unit/i)
  })
})
