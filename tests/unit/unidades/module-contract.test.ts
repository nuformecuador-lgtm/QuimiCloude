// T9 — Forma del modulo `unidades` y sus fronteras (QC-32).
//
// Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el
// comportamiento: que el contrato publico solo reexporte dominio, que las carpetas sean las
// tres de la guardia, que nada de servidor sea alcanzable desde el barrel, que la tabla
// `units` la toque UN solo archivo, que `inventario` y `recetas` no sepan de `unidades` mas
// que por su barrel, que el catalogo no publique ninguna conversion, y que esta ficha no
// abra ningun flujo navegable. Mismo patron —y buena parte de los mismos ayudantes— que
// `tests/unit/recetas/module-contract.test.ts` (QC-24) y
// `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// La guardia generica ya prohibe casi todo esto. Aqui queda escrito como REQUISITO de esta
// feature (`design.md > 9`, fila «Unitario») en vez de como efecto colateral de una guardia
// que manana podria cambiar de alcance.
//
// Cubre R14, R16, R17, R19 y R27; y refuerza R4.

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
 * ficha: hay al menos dos comentarios en el repo que contienen el texto `prisma.unit` para
 * explicar precisamente que solo un archivo puede escribirlo
 * (`lib/modules/unidades/domain/unit-catalog.ts` y la cabecera del propio adaptador). Un
 * barrido sobre el texto crudo leeria la ADVERTENCIA como la INFRACCION y este test no
 * vigilaria nada, molestaria.
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

/**
 * ¿Este fuente CONSULTA la tabla de unidades? Se exige `prisma.unit` como acceso real, no
 * como texto: comentarios fuera (ver `leerFuente`) y sin confundirlo con un modelo distinto
 * cuyo nombre EMPIECE por `unit` —`prisma.units`, `prisma.unitConversion`—, que serian otra
 * cosa y no deben contar como cumplimiento de R16.
 */
export function consultaTablaDeUnidades(texto: string): boolean {
  return /\bprisma\s*\.\s*unit(?![A-Za-z0-9_])/.test(leerFuente(texto))
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
const adaptadorDriven = join(
  unidadesDir,
  'adapters',
  'driven',
  'persistence',
  'unit-seed-repository-prisma.ts',
)
const unidadesSources = sourcesIn(unidadesDir)

/** Todo el codigo de aplicacion del repo, mas los scripts: donde podria esconderse una
 *  consulta a `units` que R16 prohibe fuera del adaptador driven de `unidades`. */
const todoElCodigo = [
  ...sourcesIn(join(repoRoot, 'lib')),
  ...sourcesIn(join(repoRoot, 'app')),
  ...sourcesIn(join(repoRoot, 'components')),
  ...sourcesIn(join(repoRoot, 'hooks')),
  ...sourcesIn(join(repoRoot, 'scripts')),
  ...['middleware.ts'].map((f) => join(repoRoot, f)).filter((f) => existsSync(f)),
]

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
    expect(alcanzables, 'el adaptador driven es alcanzable desde el barrel').not.toContain(
      adaptadorDriven,
    )
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

  it('prisma.unit solo aparece en el adaptador driven de unidades', () => {
    // R16 (y R15): la tabla `units` la toca UN solo archivo de todo el repo. Se barre `lib`,
    // `app`, `components`, `hooks`, `scripts` y `middleware.ts` — `lib/composition` incluido:
    // la composicion CABLEA el adaptador, no consulta la tabla.
    expect(todoElCodigo.length).toBeGreaterThan(0)
    expect(existsSync(adaptadorDriven), `falta ${etiqueta(adaptadorDriven)}`).toBe(true)

    const consultan = todoElCodigo
      .filter((file) => consultaTablaDeUnidades(readFileSync(file, 'utf8')))
      .map(etiqueta)
    expect(consultan).toEqual([
      'lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts',
    ])

    // Y ese archivo la consulta de verdad: si el unico sitio permitido dejara de usarla, la
    // asercion de arriba seguiria verde por vacio.
    expect(read(adaptadorDriven)).toMatch(/prisma\.unit\.(findMany|create)/)
  })

  it('el criterio de «consulta prisma.unit» distingue codigo de comentario, y cae ante una consulta real', () => {
    // Un test que no puede fallar no vigila nada (`design.md > 9`). Aqui se prueba el
    // PREDICADO con fuentes sinteticos, porque de el depende todo el bloque anterior.
    // Positivos: acceso real, con o sin espacios y con cualquier metodo detras.
    expect(consultaTablaDeUnidades('await prisma.unit.findMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('const a = prisma . unit . create({})')).toBe(true)
    expect(consultaTablaDeUnidades('return tx.prisma.unit.count()')).toBe(true)

    // Negativos: los dos tipos de comentario que EXISTEN hoy en el repo con ese texto.
    expect(consultaTablaDeUnidades('// el unico sitio con `prisma.unit` es el adaptador')).toBe(
      false,
    )
    expect(consultaTablaDeUnidades('/** el adaptador que puede tocar `prisma.unit` */')).toBe(false)
    // Y un modelo distinto cuyo nombre empieza igual: no es la tabla `units`.
    expect(consultaTablaDeUnidades('await prisma.units.findMany({})')).toBe(false)
    expect(consultaTablaDeUnidades('await prisma.unitConversion.findMany({})')).toBe(false)
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

    // Tampoco hay una tabla de equivalencias escondida en el conjunto arrancador.
    const starter = read(join(unidadesDir, 'domain', 'starter-units.ts'))
    const cuerpoStarterUnit = /export type StarterUnit = \{([^}]*)\}/.exec(starter)?.[1] ?? ''
    expect([...cuerpoStarterUnit.matchAll(/(\w+)\s*:/g)].map((m) => m[1])).toEqual([
      'name',
      'symbol',
    ])
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
    // R27: esta ficha es esquema, migracion, seed y armazon. Ningun alta, edicion ni borrado
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

    // `lib/composition` SI se toca en esta ficha (`design.md > 5.4`), pero solo para cablear
    // el seed: es lo unico que `unidades` expone hoy.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
      .map((file) => read(file))
      .join('\n')
    expect(composicion).toMatch(/seedStarterUnits/)
    expect(composicion, 'la composicion cablea algo mas que el seed').not.toMatch(
      /unitCatalog|createUnit|updateUnit|deleteUnit/i,
    )
  })
})
