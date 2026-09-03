// T9 — Forma del modulo `proveedores`, frontera de imports y CRUCE POR ORM (QC-42).
//
// Dos mitades, igual que anuncia `design.md` seccion 5.4 y `tasks.md` T9:
//
// 1. Forma del modulo y frontera de imports (arbol de archivos y texto de los fuentes):
//    el barrel solo reexporta de `./domain`, las carpetas son exactamente
//    `domain`/`ports`/`adapters`, ningun 'use server' alcanzable desde el barrel, ninguna
//    mencion a `prisma.product`, `prisma.user`, `@prisma/client` ni ruta profunda a
//    `inventario`/`identity`, y la feature no crea nada en `adapters/driving/` ni en `app/`.
//
// 2. EL CRUCE POR ORM (R22, el encargo especifico de esta feature) — contra `Prisma.dmmf`,
//    NO contra el texto del esquema. `tests/guards/guard-arquitectura-modulos.test.ts` busca
//    imports y la cadena `prisma.<modelo>`; ninguna de las dos cosas ve que
//    `SupplierCatalogLine` declarase `product Product @relation(...)`: cualquier adaptador
//    driven de `proveedores` podria entonces escribir
//    `prisma.supplierCatalogLine.findMany({ include: { product: true } })` —una consulta
//    LEGITIMA sobre su propio modelo— y leer la tabla de `inventario` sin un solo import
//    prohibido y sin la cadena `prisma.product`. La guardia quedaria verde. Por eso esta
//    mitad afirma sobre `Prisma.dmmf.datamodel.models`, que es el modelo de datos TAL COMO
//    el cliente generado lo entiende: si alguien anade el `@relation` "que faltaba" en
//    `productId`, `createdBy` o `updatedBy` (decision cerrada 13/14 del spec), el campo de
//    relacion aparece en el `dmmf` de `SupplierCatalogLine`/`Supplier` (y su reverso en
//    `Product`/`User`) aunque el texto del esquema se lea "bien" a simple vista, y las
//    aserciones `toEqual` de mas abajo caen. Mutacion exacta que rompe este test:
//    agregar a `db/schema.prisma`
//      `product Product @relation(fields: [productId], references: [id])`
//    dentro de `model SupplierCatalogLine` (con su reverso
//    `supplierCatalogLines SupplierCatalogLine[]` en `model Product`, que Prisma exige para
//    toda relacion), y `pnpm exec prisma generate`: el dmmf de `SupplierCatalogLine` pasaria
//    a incluir `'Product'` y el de `Product` a incluir `'SupplierCatalogLine'`, y las dos
//    aserciones `toEqual(['Supplier'])` / `toEqual(['Presentation'])` de este archivo
//    fallarian. Lo mismo aplica a `createdBy`/`updatedBy` con `@relation(...)` hacia `User`.
//
// Cubre R20, R21, R22, R23, R35, y refuerza R8.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { normalizeSupplierName } from '@/lib/modules/proveedores'

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
const proveedoresDir = join(repoRoot, 'lib', 'modules', 'proveedores')

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
 * La cabecera del propio contrato de `proveedores` dice «nada de 'use server', @prisma/client
 * ni next/*», y un barrido sobre el texto crudo la leeria como una violacion. Un test que
 * confunde la advertencia con la infraccion no vigila nada, molesta.
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

const barrel = join(proveedoresDir, 'index.ts')
const proveedoresSources = sourcesIn(proveedoresDir)

describe('lib/modules/proveedores — forma del modulo y frontera de imports', () => {
  it("el modulo proveedores tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R20, R23: el modulo nace con la forma hexagonal del repositorio (`design.md` seccion 5.1).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/proveedores/index.ts').toBe(
      true,
    )

    // Las carpetas de primer nivel son EXACTAMENTE las tres que admite la guardia.
    const carpetas = readdirSync(proveedoresDir)
      .filter((name) => statSync(join(proveedoresDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    // Y dentro de `adapters`, los dos lados de siempre.
    expect(
      readdirSync(join(proveedoresDir, 'adapters'))
        .filter((name) => statSync(join(proveedoresDir, 'adapters', name)).isDirectory())
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
    // poder importar `@/lib/modules/proveedores` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(0)
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

  it('lib/modules/proveedores no contiene prisma.product, prisma.user, @prisma/client ni rutas profundas a inventario/identity', () => {
    // R21: todo lo que `proveedores` sepa de producto o de usuario llega por el contrato
    // publico de `inventario`/`identity`, nunca por un import profundo ni por Prisma directo.
    // Se barre TODO el modulo, no solo lo alcanzable desde el barrel: un adaptador driven que
    // consultara `prisma.product` o `prisma.user` violaria R21 igual (`design.md` seccion 5.2/5.3).
    expect(proveedoresSources.length).toBeGreaterThan(0)
    for (const file of proveedoresSources) {
      const source = read(file)
      const etiqueta = toPosix(relative(repoRoot, file))
      expect(source, `${etiqueta} consulta la tabla de productos`).not.toMatch(/prisma\.product/i)
      expect(source, `${etiqueta} consulta la tabla de usuarios`).not.toMatch(/prisma\.user/i)
      expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      // Ninguna ruta profunda a otro modulo: solo el barrel de cada uno.
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

  it('el barrel de proveedores exporta normalizeSupplierName', () => {
    // Refuerza R8: la normalizacion tiene UNA sola definicion y la publica el contrato del
    // modulo, para que la columna `name_normalized` y cualquier consumidor futuro normalicen
    // igual.
    expect(typeof normalizeSupplierName).toBe('function')
    expect(normalizeSupplierName('Químicos del Pacífico S.A.')).toBe('quimicosdelpacificosa')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bnormalizeSupplierName\b[^}]*\} from '\.\/domain\//)

    // Y esta implementada UNA sola vez en todo el repo.
    const definiciones = sourcesIn(join(repoRoot, 'lib'))
      .concat(sourcesIn(join(repoRoot, 'app')))
      .filter((file) => /function normalizeSupplierName/.test(read(file)))
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(definiciones).toEqual(['lib/modules/proveedores/domain/supplier-name.ts'])
  })

  it('la feature no anade adaptadores driving, rutas ni Server Actions', () => {
    // R35: esta ficha es esquema, migracion y armazon. Ningun alta, consulta, edicion ni
    // borrado, y por tanto ningun flujo navegable que un E2E pueda visitar (decision 21).
    for (const carpeta of [
      join(proveedoresDir, 'adapters', 'driving'),
      join(proveedoresDir, 'adapters', 'driven'),
      join(proveedoresDir, 'ports'),
    ]) {
      expect(sourcesIn(carpeta), `${toPosix(relative(repoRoot, carpeta))} deberia estar vacia`)
        .toEqual([])
    }
    // Las tres siguen sembradas con su `.gitkeep`, para que git las versione.
    for (const carpeta of ['ports', 'adapters/driven', 'adapters/driving']) {
      expect(existsSync(join(proveedoresDir, ...carpeta.split('/'), '.gitkeep')), carpeta).toBe(
        true,
      )
    }

    // Ningun 'use server' en TODO el modulo, no solo en lo alcanzable desde el barrel.
    for (const file of proveedoresSources) {
      expect(read(file), `${toPosix(relative(repoRoot, file))} declara 'use server'`).not.toMatch(
        /['"]use server['"]/,
      )
    }

    // Ninguna ruta HTTP ni pantalla de proveedores.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'suppliers'),
      join(repoRoot, 'app', 'api', 'proveedores'),
      join(repoRoot, 'app', '(private)', 'proveedores'),
      join(repoRoot, 'app', '(private)', 'suppliers'),
    ]) {
      expect(existsSync(ruta), `${toPosix(relative(repoRoot, ruta))} no debe existir`).toBe(false)
    }
    // Y ningun archivo de `app/` conoce todavia el modulo: la pantalla es QC-44.
    for (const file of sourcesIn(join(repoRoot, 'app'))) {
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} menciona proveedores`,
      ).not.toMatch(/proveedores|supplier/i)
    }

    // `lib/composition` NO se toca en esta ficha: sin puertos ni adaptadores no hay nada que
    // cablear, y un `export const proveedores = {}` seria una fachada vacia (`design.md` 5.5).
    for (const file of sourcesIn(join(repoRoot, 'lib', 'composition'))) {
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} cablea proveedores`,
      ).not.toMatch(/proveedores|supplier/i)
    }
  })
})

describe('el cruce por ORM (R22): Prisma.dmmf, no el texto del esquema', () => {
  /**
   * Los campos de RELACION que el cliente generado conoce para un modelo: `kind === 'object'`
   * en el dmmf, con el nombre del modelo al que apuntan. Un campo escalar sin `@relation`
   * (como `productId`, `createdBy`, `updatedBy`) nunca aparece aqui, aunque la columna exista
   * de verdad en la base: eso es exactamente lo que la decision cerrada 13/14 pide.
   */
  function relationTargets(modelName: string): readonly string[] {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)
    expect(model, `Prisma.dmmf no conoce el modelo ${modelName}`).toBeDefined()
    return model!.fields
      .filter((field) => field.kind === 'object')
      .map((field) => field.type)
      .sort()
  }

  it('la UNICA relacion que el cliente generado conoce entre SupplierCatalogLine y Supplier es mutua, e intra-modulo', () => {
    // `productId` es un escalar sin `@relation`: no genera campo de relacion. Por eso el
    // dmmf de `SupplierCatalogLine` no puede traer nada mas que `Supplier`, la relacion
    // intra-modulo declarada a proposito con `@relation` (`design.md` 2.2).
    expect(relationTargets('SupplierCatalogLine')).toEqual(['Supplier'])
    // Y en el otro sentido: `Supplier` solo conoce sus propias lineas de catalogo.
    expect(relationTargets('Supplier')).toEqual(['SupplierCatalogLine'])
  })

  it('Product NO gana ningun campo de relacion de vuelta hacia SupplierCatalogLine ni hacia Supplier', () => {
    // Si `productId` llevara `@relation`, Prisma exigiria el campo reverso en `Product`
    // (`supplierCatalogLines SupplierCatalogLine[]`) y este `toEqual` completo —no un
    // `not.toContain` suelto— caeria en el instante en que apareciera. La lista esperada es
    // el conjunto EXACTO y completo de relaciones que QC-14/QC-20 ya le dieron a `Product`
    // (hacia `Presentation`), sin proveedores adentro.
    expect(relationTargets('Product')).toEqual(['Presentation'])
    expect(relationTargets('Product')).not.toContain('SupplierCatalogLine')
    expect(relationTargets('Product')).not.toContain('Supplier')
  })

  it('User NO gana ningun campo de relacion de vuelta hacia Supplier', () => {
    // Si `createdBy` o `updatedBy` llevaran `@relation`, `User` ganaria un campo reverso
    // (`createdSuppliers Supplier[]` o similar) y este `toEqual` completo caeria. La lista
    // esperada es el conjunto EXACTO que QC-4 ya le dio a `User` (hacia `DocumentType` y
    // `Role`), sin proveedores adentro.
    expect(relationTargets('User')).toEqual(['DocumentType', 'Role'])
    expect(relationTargets('User')).not.toContain('Supplier')
    expect(relationTargets('User')).not.toContain('SupplierCatalogLine')
  })
})
