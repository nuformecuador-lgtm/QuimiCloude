// T2 (QC-43) — Test de alcance, adelantado (`tasks.md > Grupo A`).
//
// Se escribe ANTES de que `domain/`, `ports/` y `adapters/` se llenen a proposito: es
// MIENTRAS se llenan cuando el alcance se escapa (leccion de QC-20 T15 y QC-25 T3, citada
// en `tasks.md`). Cubre R38, R42, R45 y R47.
//
// Recorre el ARBOL DE ARCHIVOS y el TEXTO de `db/schema.prisma` y de las migraciones, no
// el grafo de imports: por eso vive fuera de `tests/guards/` (esas guardias siguen
// imports; esto es una foto del disco). Ninguna afirmacion de aqui hace un censo GLOBAL
// del repo -numero de modelos, de migraciones, de rutas-: solo mide lo que la feature
// `proveedores` garantiza sobre si misma, para no romperse cuando una ficha vecina se
// mergee.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

/** Recorre un directorio recursivamente y devuelve las rutas absolutas de sus archivos. */
function filesIn(dir: string, pattern: RegExp = /./): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

/** La palabra delata la feature tanto en el nombre del archivo como en el de la carpeta. */
const PATRON_PROVEEDORES = /proveedor|supplier/i

function coincidenciasEn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  return filesIn(dir).filter((ruta) => PATRON_PROVEEDORES.test(ruta.slice(dir.length)))
}

const moduloDir = join(repoRoot, 'lib', 'modules', 'proveedores')

describe('alcance de QC-43 (crud-de-proveedores): sin pantalla, sin route handler, sin E2E nuevo', () => {
  it('no existe ninguna pantalla, pagina ni componente de proveedores, ni spec E2E nuevo', () => {
    // R47: la pantalla de proveedores es QC-44, que ya existe en el board y esta bloqueada
    // por esta ficha. Se busca en la RUTA COMPLETA, no solo en el nombre del archivo: una
    // ruta de Next como `app/(private)/proveedores/page.tsx` delata la feature por el
    // nombre de CARPETA (`page.tsx` es generico y no diria nada).
    const enApp = coincidenciasEn(join(repoRoot, 'app'))
    const enComponents = coincidenciasEn(join(repoRoot, 'components'))
    expect(enApp, `pantalla de proveedores encontrada bajo app/: ${enApp.join(', ')}`).toEqual([])
    expect(
      enComponents,
      `componente de proveedores encontrado bajo components/: ${enComponents.join(', ')}`,
    ).toEqual([])

    // R47: el E2E queda DIFERIDO CON MOTIVO a QC-44 (decision cerrada 8) -- esta ficha es
    // backend puro y Playwright no tendria pantalla que abrir--. Ningun spec nuevo.
    const enE2e = coincidenciasEn(join(repoRoot, 'e2e'))
    expect(enE2e, `spec E2E de proveedores encontrado: ${enE2e.join(', ')}`).toEqual([])
  })

  it('no hay ningun route handler de proveedores bajo app/api', () => {
    // R42: las mutaciones son Server Actions. Una ruta API interna seria una superficie
    // publica nueva que habria que proteger aparte, y `docs/architecture.md` la reserva
    // para webhooks y APIs publicas. Falsable con solo crear
    // `app/api/proveedores/route.ts`: el `existsSync` pasa a `true` y la asercion cae.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'proveedores'),
      join(repoRoot, 'app', 'api', 'suppliers'),
    ]) {
      expect(existsSync(ruta), `${ruta} no debe existir: las mutaciones son Server Actions`).toBe(
        false,
      )
    }

    // Y no hay ningun route handler escondido en otro sitio de `app/api` que mencione al
    // modulo: se mira el CONTENIDO, no solo el nombre de la carpeta.
    for (const archivo of filesIn(join(repoRoot, 'app', 'api'), /\.tsx?$/)) {
      const fuente = readFileSync(archivo, 'utf8')
      expect(
        /lib\/modules\/proveedores/.test(fuente),
        `${archivo} no puede consumir el modulo proveedores: R42 prohibe la ruta API`,
      ).toBe(false)
    }

    // Todo archivo que aparezca en `adapters/driving/` (T14 lo llena) es una Server
    // Action, nunca un route handler disfrazado. Hoy la carpeta esta vacia, asi que el
    // bucle no itera TODAVIA: en cuanto T14 ponga el primer archivo sin la directiva
    // `'use server'` en su primera linea util, esta asercion cae.
    for (const archivo of filesIn(join(moduloDir, 'adapters', 'driving'), /\.tsx?$/)) {
      const fuente = readFileSync(archivo, 'utf8').trimStart()
      expect(fuente, `${archivo} debe declarar 'use server' en la primera linea`).toMatch(
        /^(['"])use server\1/,
      )
    }
  })

  it('el modulo proveedores no reimplementa el calculo de paginacion', () => {
    // R45: `proveedores` CONSUME `lib/shared/pagination.ts` (`toOffsetLimit`, `buildPage`,
    // `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`) y no contiene ninguna aritmetica propia de
    // desplazamiento, limite ni total de paginas. Se busca en el TEXTO fuente de
    // `lib/modules/proveedores/**` lo que delataria una copia.
    const SOSPECHOSOS: readonly { readonly nombre: string; readonly pattern: RegExp }[] = [
      {
        nombre: 'Math.ceil sobre un total (calculo de totalPages a mano)',
        pattern: /Math\.ceil\(\s*total\b/,
      },
      {
        nombre: '(page - 1) * algo (calculo de offset a mano)',
        pattern: /\(\s*page\s*-\s*1\s*\)\s*\*/,
      },
      {
        nombre: 'multiplicacion por pageSize (calculo de offset/limit a mano)',
        pattern: /\*\s*pageSize\b|\bpageSize\s*\*/,
      },
      {
        nombre: 'segunda declaracion del defecto o del tope de pagina',
        pattern: /(DEFAULT_PAGE_SIZE|MAX_PAGE_SIZE)\s*=/,
      },
      {
        nombre: 'Math.min contra un literal de tope de pagina',
        pattern: /Math\.min\([^)]*\b25\b/,
      },
    ]

    const hallazgos: string[] = []
    for (const archivo of filesIn(moduloDir, /\.tsx?$/)) {
      const fuente = readFileSync(archivo, 'utf8')
      for (const { nombre, pattern } of SOSPECHOSOS) {
        if (pattern.test(fuente)) hallazgos.push(`${archivo}: ${nombre}`)
      }
    }

    expect(
      hallazgos,
      `lib/modules/proveedores/** parece reimplementar la aritmetica de paginacion en vez ` +
        `de usar lib/shared/pagination.ts: ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('esta feature no anade ninguna columna, indice ni restriccion fuera de los tres cambios', () => {
    // R38. Afirmacion DESCRIPTIVA sobre el estado actual de los DOS modelos de la feature,
    // no un censo global del schema (eso rompe con fichas paralelas). Si alguien anade,
    // quita o renombra una columna, un indice o una restriccion de `Supplier` o de
    // `SupplierCatalogLine`, esta prueba cae.
    //
    // De cada linea de campo se compara solo el NOMBRE; las lineas `@@...` se comparan
    // ENTERAS, porque ahi el valor esta en la restriccion exacta y no solo en su nombre.
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    function cuerpoDe(modelo: string): string {
      const match = new RegExp(`model ${modelo} \\{([\\s\\S]*?)\\n\\}`, 'm').exec(schema)
      if (!match) throw new Error(`no se encontro "model ${modelo}" en db/schema.prisma`)
      return match[1] as string
    }

    function camposDe(modelo: string): readonly string[] {
      return cuerpoDe(modelo)
        .split('\n')
        .map((linea) => linea.trim().replace(/\s+/g, ' '))
        .filter((linea) => linea.length > 0 && !linea.startsWith('//'))
        .map((linea) => (linea.startsWith('@@') ? linea : (linea.split(' ')[0] as string)))
    }

    // `Supplier` queda EXACTAMENTE como lo dejo QC-42: esta feature no le toca ni una
    // columna (sus dos CHECK no son modelables por Prisma y viven en la migracion).
    expect(
      camposDe('Supplier'),
      'model Supplier gano, perdio o renombro algo respecto al estado que dejo QC-42',
    ).toEqual([
      'id',
      'name',
      'nameNormalized',
      'phone',
      'email',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'catalogLines',
      '@@index([createdBy], map: "suppliers_created_by_idx")',
      '@@index([updatedBy], map: "suppliers_updated_by_idx")',
      '@@map("suppliers")',
    ])

    // `SupplierCatalogLine` gana EXACTAMENTE dos columnas y dos indices, los del cambio 3.
    // Ni una mas: en particular NO gana `deletedAt` (decision cerrada 11 de QC-42) ni
    // ningun `@relation` hacia `Product` o `User`.
    expect(
      camposDe('SupplierCatalogLine'),
      'model SupplierCatalogLine gano algo fuera de las dos columnas de autor del cambio 3',
    ).toEqual([
      'id',
      'supplierId',
      'productId',
      'cost',
      'minPurchase',
      'deliveryTime',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'supplier',
      '@@unique([supplierId, productId], map: "supplier_catalog_lines_supplier_id_product_id_key")',
      '@@index([productId], map: "supplier_catalog_lines_product_id_idx")',
      '@@index([createdBy], map: "supplier_catalog_lines_created_by_idx")',
      '@@index([updatedBy], map: "supplier_catalog_lines_updated_by_idx")',
      '@@map("supplier_catalog_lines")',
    ])

    // Y SOLO DOS migraciones del repo tocan estas dos tablas: la de QC-42 que las creo y
    // la de QC-43 con los tres cambios. Una tercera seria alcance escapandose por una via
    // que el censo de campos de arriba no ve (p. ej. un CHECK, que Prisma no modela).
    const migracionesDir = join(repoRoot, 'db', 'migrations')
    const tocanLasTablas = readdirSync(migracionesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const sql = join(migracionesDir, entry.name, 'migration.sql')
        if (!existsSync(sql)) return false
        return /\b(suppliers|supplier_catalog_lines)\b/i.test(readFileSync(sql, 'utf8'))
      })
      .map((entry) => entry.name)
      .sort()

    expect(
      tocanLasTablas,
      'solo la migracion de QC-42 y la de QC-43 pueden tocar suppliers y supplier_catalog_lines',
    ).toEqual([
      '20260903131417_suppliers_and_supplier_catalog_lines',
      '20260903200343_supplier_contact_cost_and_line_audit',
    ])
  })

  it('ningun .gitkeep convive con archivos reales en las carpetas del modulo', () => {
    // QC-42 dejo `ports/`, `adapters/driven/` y `adapters/driving/` vacios con un
    // `.gitkeep` esperando a esta ficha. Git no versiona carpetas vacias, pero tampoco
    // carpetas con contenido y un `.gitkeep` sobrante: en cuanto aparece el primer archivo
    // real de una carpeta, su `.gitkeep` se borra.
    const hallazgos: string[] = []
    for (const gitkeep of filesIn(moduloDir, /^\.gitkeep$/)) {
      const carpeta = dirname(gitkeep)
      const vecinos = readdirSync(carpeta, { withFileTypes: true }).filter(
        (entry) => entry.name !== '.gitkeep',
      )
      if (vecinos.length > 0) {
        hallazgos.push(`${gitkeep} convive con ${vecinos.map((e) => e.name).join(', ')}`)
      }
    }
    expect(hallazgos, `.gitkeep sobrante: ${hallazgos.join('; ')}`).toEqual([])
  })
})
