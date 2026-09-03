// T10 — Forma del modulo `recetas` y frontera con `inventario` (QC-24).
//
// `recetas` es el primer modulo hexagonal que este repo crea desde cero: `identity` e
// `inventario` los sembro QC-15. Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de
// los fuentes, no el comportamiento —no hay comportamiento todavia—: que el contrato publico
// solo reexporte dominio, que las carpetas sean las tres de la guardia, que nada de servidor
// sea alcanzable desde el barrel, y que `recetas` no sepa nada de la tabla `products`.
//
// La guardia `tests/guards/guard-arquitectura-modulos.test.ts` ya prohibe casi todo esto de
// forma generica. Aqui se deja escrito como REQUISITO de esta feature (R18, R20, R31) en vez
// de como efecto colateral de una guardia que manana podria cambiar de alcance
// (`design.md` seccion 5.3).
//
// Cubre R18, R20, R31, y refuerza R8.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeRecipeName } from '@/lib/modules/recetas'

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
const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')
const inventarioDir = join(repoRoot, 'lib', 'modules', 'inventario')

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
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
 * Fuente SIN comentarios: lo que se vigila es el codigo, no la prosa.
 *
 * No es un detalle: la cabecera del propio contrato de `recetas` dice «nada de 'use server',
 * @prisma/client ni next/*», y un barrido sobre el texto crudo la leeria como una violacion.
 * Un test que confunde la advertencia con la infraccion no vigila nada, molesta.
 */
function read(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
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

const barrel = join(recetasDir, 'index.ts')
const recetasSources = sourcesIn(recetasDir)

describe('lib/modules/recetas — forma del modulo y frontera con inventario', () => {
  it("el modulo recetas tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R20: el modulo nace con la forma hexagonal del repositorio (`design.md` seccion 5.1).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/recetas/index.ts').toBe(true)

    // Las carpetas de primer nivel son EXACTAMENTE las tres que admite la guardia.
    const carpetas = readdirSync(recetasDir)
      .filter((name) => statSync(join(recetasDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    // Y dentro de `adapters`, los dos lados de siempre.
    expect(
      readdirSync(join(recetasDir, 'adapters'))
        .filter((name) => statSync(join(recetasDir, 'adapters', name)).isDirectory())
        .sort(),
    ).toEqual(['driven', 'driving'])

    // El contrato solo reexporta de `./domain`: ni adaptadores, ni puertos, ni nada de fuera.
    const contrato = read(barrel)
    const specs = importSpecifiers(contrato)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec, `el barrel no puede reexportar de ${spec}`).toMatch(/^\.\/domain(\/|$)/)
    }

    // Cierre transitivo del barrel: nada de servidor. Un componente de cliente tiene que
    // poder importar `@/lib/modules/recetas` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(1)
    for (const file of alcanzables) {
      const source = read(file)
      const etiqueta = toPosix(relative(repoRoot, file))
      expect(source, `${etiqueta} declara 'use server' y es alcanzable desde el barrel`).not.toMatch(
        /['"]use server['"]/,
      )
      expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      expect(source, `${etiqueta} importa next/*`).not.toMatch(/from\s+'next(\/|')/)
      expect(source, `${etiqueta} importa react`).not.toMatch(/from\s+'react/)
      // El dominio no depende de `lib/shared`: si lo necesitara, lo pediria por un puerto.
      expect(source, `${etiqueta} importa @/lib/shared`).not.toMatch(/@\/lib\/shared/)
      // Ni de la composicion, que es quien ata los puertos, no quien los usa.
      expect(source, `${etiqueta} importa @/lib/composition`).not.toMatch(/@\/lib\/composition/)
    }
  })

  it('lib/modules/recetas no contiene prisma.product, @prisma/client fuera de su unico adaptador ni rutas profundas a inventario', () => {
    // R18: todo lo que `recetas` sepa del producto llega por el contrato publico de
    // `inventario`. Se barre TODO el modulo, no solo lo alcanzable desde el barrel: un
    // adaptador driven que consultara `prisma.product` violaria R18 igual (`design.md` 5.3).
    //
    // AJUSTE T10 (QC-25, Grupo C): `prisma.product` sigue prohibido en TODO el modulo sin
    // excepcion. `@prisma/client` en cambio SI tiene una excepcion, unica y nombrada por
    // el propio `design.md > 1` y `> 7.3`: `adapters/driven/persistence/recipe-prisma.ts`
    // es "el UNICO archivo del modulo que importa `@prisma/client`" -es el adaptador de
    // persistencia de `Recipe`/`RecipeLine`, modelos que `recetas` SI posee (`@module
    // recetas` en `db/schema.prisma`)-. Prohibirlo aqui por completo chocaria con ese
    // requisito de diseno; la guardia real de "solo un archivo lo importa" la vigila
    // `tests/guards/guard-arquitectura-modulos.test.ts` (bloque 10, propiedad de modelos).
    const RECIPE_PRISMA_ADAPTER = 'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts'
    expect(recetasSources.length).toBeGreaterThan(0)
    for (const file of recetasSources) {
      const source = read(file)
      const etiqueta = toPosix(relative(repoRoot, file))
      expect(source, `${etiqueta} consulta la tabla de productos`).not.toMatch(/prisma\.product/i)
      if (etiqueta !== RECIPE_PRISMA_ADAPTER) {
        expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      }
      // Ninguna ruta profunda a otro modulo: solo el barrel.
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${etiqueta}: ruta profunda a inventario`).not.toMatch(
          /^@\/lib\/modules\/inventario\/./,
        )
        expect(spec, `${etiqueta}: ruta profunda a identity`).not.toMatch(
          /^@\/lib\/modules\/identity\/./,
        )
      }
    }
  })

  it('@/lib/modules/inventario publica ProductCatalog', () => {
    // R18: `inventario` DEBE publicar ese contrato, o `recetas` no tendria forma legitima de
    // saber que un producto existe. Se comprueba sobre el TEXTO del barrel y no con un
    // import en ejecucion a proposito: los tres simbolos son SOLO TIPOS y desaparecen al
    // compilar, asi que en tiempo de ejecucion no hay nada que mirar (`design.md` 5.2).
    const contratoInventario = read(join(inventarioDir, 'index.ts'))
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductCatalog\b[^}]*\}/)
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductId\b[^}]*\}/)
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductRef\b[^}]*\}/)
    expect(contratoInventario).toMatch(/from '\.\/domain\/product-catalog'/)
    // Ya no es el slot vacio que sembro QC-15.
    expect(contratoInventario).not.toMatch(/^\s*export \{\};\s*$/m)
    // Y sigue reexportando SOLO de su dominio.
    for (const spec of importSpecifiers(contratoInventario)) {
      expect(spec, `el barrel de inventario no puede reexportar de ${spec}`).toMatch(
        /^\.\/domain(\/|$)/,
      )
    }

    // El contrato existe de verdad en el dominio de `inventario`, que es el modulo DUENO del
    // dato: la interfaz no vive en `recetas/ports/` (alternativa descartada 8.6).
    const productCatalog = join(inventarioDir, 'domain', 'product-catalog.ts')
    expect(existsSync(productCatalog)).toBe(true)
    const fuente = read(productCatalog)
    expect(fuente).toMatch(/export interface ProductCatalog \{/)
    expect(fuente).toMatch(/findRefs\(/)
    expect(fuente).toMatch(/export type ProductId/)
    expect(fuente).toMatch(/export type ProductRef/)
    // Solo tipos: ninguna implementacion ni import de Prisma en el contrato.
    expect(fuente).not.toMatch(/@prisma\/client|prisma\./)
    expect(existsSync(join(recetasDir, 'ports', 'product-catalog.ts'))).toBe(false)
  })

  it('el barrel de recetas exporta normalizeRecipeName', () => {
    // R8: la normalizacion tiene UNA sola definicion y la publica el contrato del modulo,
    // para que la columna `name_normalized` y cualquier consumidor futuro normalicen igual.
    // Aqui si se afirma en ejecucion: es una funcion, no un tipo.
    expect(typeof normalizeRecipeName).toBe('function')
    expect(normalizeRecipeName('Bidón 20 L')).toBe('bidon20l')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bnormalizeRecipeName\b[^}]*\} from '\.\/domain\//)

    // Y esta implementada UNA sola vez en todo el repo: si hubiera una segunda copia (en un
    // service, en la migracion, en un componente), R8 dejaria de cumplirse.
    const definiciones = sourcesIn(join(repoRoot, 'lib'))
      .concat(sourcesIn(join(repoRoot, 'app')))
      .filter((file) => /function normalizeRecipeName/.test(read(file)))
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(definiciones).toEqual(['lib/modules/recetas/domain/recipe-name.ts'])
  })

  it('la feature no anade ninguna pantalla ni route handler bajo app/ (la pantalla es QC-26)', () => {
    // Esta afirmacion nacio en QC-24 (T10 de esa ficha), cuando `recetas` era solo
    // esquema y armazon vacio, y se endurecio en el Grupo A/B de QC-25 (`ports/` y
    // `domain/` con contenido, `adapters/` todavia vacia). El Grupo C (T9-T13) es
    // EXACTAMENTE el que llena `adapters/driven/` (Prisma, Supabase Storage) y
    // `adapters/driving/` (la Server Action) y cablea `lib/composition`: por eso las
    // afirmaciones de "adapters vacia", "ningun 'use server' en el modulo" y
    // "composicion no menciona recetas" de las rondas anteriores se retiran aqui a
    // proposito, no por descuido -son justo lo que esta ronda construye, y quedan
    // cubiertas por sus propios tests (`scope.test.ts`, `recipe-actions.test.ts`)-. Lo
    // que SIGUE sin existir, y es lo unico que sigue siendo requisito de ESTA feature
    // (R44), es la pantalla: no hay ruta HTTP ni componente de recetas bajo `app/`.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'recipes'),
      join(repoRoot, 'app', 'api', 'recetas'),
      join(repoRoot, 'app', '(private)', 'recetas'),
      join(repoRoot, 'app', '(private)', 'recipes'),
    ]) {
      expect(existsSync(ruta), `${toPosix(relative(repoRoot, ruta))} no debe existir`).toBe(false)
    }
    // Y ningun archivo de `app/` conoce todavia el modulo: la pantalla es QC-26.
    for (const file of sourcesIn(join(repoRoot, 'app'))) {
      expect(read(file), `${toPosix(relative(repoRoot, file))} menciona recetas`).not.toMatch(
        /recetas|recipe/i,
      )
    }
  })
})
