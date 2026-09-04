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

// **2026-09-04 (QC-44, pantalla-de-proveedores):** el tercer caso se RETENSO. Afirmaba que no
// existia pantalla de proveedores ni spec E2E porque las dos estaban diferidas a QC-44 (R47,
// decision cerrada 8); QC-44 las construye (R1, R51, R52), asi que la premisa caduco por diseno.
// El caso no se borra ni se vacia: pasa de «no existe» a «existe y vive SOLO donde la declara
// QC-44». El motivo entero y que sigue vigilando, dentro del propio caso.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SUPPLIERS_ROUTE } from '@/lib/shared/routes'

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

/**
 * Rutas RELATIVAS al directorio barrido, en POSIX, de los archivos cuya ruta delata la
 * feature. Relativas y en POSIX para poder compararlas contra una carpeta de ruta concreta
 * sin depender del separador del sistema operativo.
 */
function coincidenciasEn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  return filesIn(dir)
    .map((ruta) => relative(dir, ruta).split(sep).join('/'))
    .filter((relativa) => PATRON_PROVEEDORES.test(relativa))
    .sort()
}

const moduloDir = join(repoRoot, 'lib', 'modules', 'proveedores')

/**
 * R18 INVERTIDO — las marcas concretas por las que `proveedores` conocia a `inventario`.
 *
 * QC-43 tenia un caso que AFIRMABA que el modulo importaba el contrato de `inventario`; con
 * la decision cerrada 3 de QC-52 ese caso se invierte y pasa a afirmar que NO aparece.
 *
 * Se buscan MARCAS, no la palabra suelta: un comentario que explique por que la linea ya no
 * conoce ningun articulo del inventario es informacion util y no puede poner el test rojo.
 * Lo que no puede aparecer es ninguna de estas, y cada una es un vinculo real.
 */
const MARCAS_DE_INVENTARIO: readonly { readonly nombre: string; readonly pattern: RegExp }[] = [
  { nombre: 'tipo ProductCatalog / ProductRef / ProductId', pattern: /\bProduct(Catalog|Ref|Id)\b/ },
  { nombre: 'llamada a findRefs', pattern: /\bfindRefs\b/ },
  { nombre: 'consulta del modelo Product por Prisma', pattern: /prisma\.product/i },
  { nombre: 'campo productId / productName', pattern: /\bproduct(Id|Name)\b/ },
  { nombre: 'columna product_id', pattern: /\bproduct_id\b/ },
  { nombre: 'error de producto no encontrado', pattern: /ProductNotFound|product_not_found/ },
]

describe('alcance de QC-43 (crud-de-proveedores): sin route handler; la pantalla, solo la de QC-44', () => {
  it('ningun archivo del modulo importa inventario ni conserva una sola marca suya (R18)', () => {
    // R18, decision cerrada 3, y es el corazon de QC-52: «Ninguna operacion del catalogo del
    // proveedor DEBE leer, comprobar ni resolver nada del producto».
    //
    // Este caso ESTA INVERTIDO respecto a QC-43, donde afirmaba lo contrario: que el modulo
    // consumia el contrato publico de `inventario` y que lo hacia por el barrel. Aquella
    // regla (QC-43 R26) queda derogada entera.
    //
    // Dos mitades, y ninguna basta sola:
    //   1. Ningun IMPORT -estatico, de tipo o dinamico- cuyo especificador nombre el modulo.
    //      Se mira el especificador, no el texto entero del archivo: un comentario que
    //      explique la separacion es documentacion valiosa y no puede ponerlo rojo.
    //   2. Ninguna MARCA de las de arriba en ningun sitio del archivo, ni en el codigo ni en
    //      un comentario: `ProductCatalog`, `findRefs`, `prisma.product`, `productId`,
    //      `product_id` o el error borrado. Cualquiera de ellas seria el vinculo volviendo.
    const hallazgos: string[] = []
    const archivos = filesIn(moduloDir, /\.tsx?$/)
    expect(archivos.length, 'el modulo proveedores no tiene archivos que revisar').toBeGreaterThan(
      0,
    )

    for (const archivo of archivos) {
      const fuente = readFileSync(archivo, 'utf8')
      const relativo = archivo.slice(repoRoot.length + 1)

      for (const coincidencia of fuente.matchAll(
        /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g,
      )) {
        const especificador = coincidencia[1] as string
        if (/inventario/.test(especificador)) {
          hallazgos.push(`${relativo}: importa '${especificador}'`)
        }
      }

      for (const { nombre, pattern } of MARCAS_DE_INVENTARIO) {
        if (pattern.test(fuente)) hallazgos.push(`${relativo}: ${nombre}`)
      }
    }

    expect(
      hallazgos,
      `lib/modules/proveedores/** sigue atado a inventario: ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('la composicion deja de pasar el catalogo de articulos a proveedores, pero no lo borra (R18)', () => {
    // `lib/composition` es el UNICO sitio del repo que puede volver a atar los dos modulos,
    // asi que el corte tiene que verse tambien ahi: la fachada `proveedores` no recibe
    // `products` en ninguna de sus nueve entradas.
    //
    // Y la otra mitad, que es la que evita romper a un vecino: `productCatalog` SIGUE
    // construido y cableado, porque `recetas` lo usa en tres de sus casos de uso. Lo que se
    // quita son las dos lineas que se lo pasaban a `proveedores`, no la constante.
    const fuente = readFileSync(join(repoRoot, 'lib', 'composition', 'index.ts'), 'utf8')
    const bloque = (/export const proveedores = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? '')
      // Sin los comentarios: el bloque explica POR QUE se quitaron esas dos lineas, y esa
      // explicacion no puede poner el test rojo. Lo que se mide es el cableado real.
      .replace(/\/\/.*$/gm, '')
    expect(
      bloque,
      'no se encontro la fachada `proveedores` en lib/composition',
    ).toContain('createCatalogLine:')
    expect(
      bloque,
      'la fachada de proveedores sigue recibiendo el catalogo de articulos',
    ).not.toMatch(/products\s*:/)

    expect(fuente, 'productCatalog desaparecio de la composicion y recetas lo necesita').toMatch(
      /const productCatalog\s*:/,
    )
    const recetas = /export const recetas = \{([\s\S]*?)\n\} as const;/.exec(fuente)?.[1] ?? ''
    expect(recetas, 'recetas dejo de recibir productCatalog').toMatch(/products: productCatalog/)
  })

  it('la pantalla de proveedores vive solo donde la declara QC-44, y en ningun otro sitio', () => {
    // CENTINELA RETENSADO el 2026-09-04 (QC-44, pantalla-de-proveedores).
    //
    // Hasta hoy este caso afirmaba, por R47 de QC-43, que «no existe ninguna pantalla, pagina
    // ni componente de proveedores, ni spec E2E nuevo»: la pantalla estaba DIFERIDA a QC-44 y
    // el E2E con ella (decision cerrada 8). QC-44 es precisamente la ficha que las construye
    // (R1, R51, R52), asi que la premisa caduco POR DISENO, no por defecto, y el centinela se
    // **retensa, no se borra ni se vacia**. Mismo trato que recibio
    // `tests/unit/inventario/scope.test.ts` cuando QC-22 construyo la pantalla del catalogo.
    //
    // Lo que R47 protegia de verdad NO era la ausencia: era que la pantalla de proveedores no
    // apareciese por goteo, repartida por el repositorio y sin ficha que la respalde. Eso
    // sigue vigente y es lo que se vigila ahora: la pantalla existe, vive ENTERA bajo su
    // carpeta de ruta, `components/` sigue sin una sola pieza de proveedores, y el unico spec
    // E2E de proveedores es el que trae QC-44. Un `app/api/proveedores/route.ts`, un
    // `app/(private)/compras/supplier-table.tsx` o un segundo `e2e/suppliers.spec.ts` de
    // manana —los tres sin ficha— ponen esto en rojo igual que antes.
    //
    // Se busca en la RUTA COMPLETA, no solo en el nombre del archivo: una ruta de Next como
    // `app/(private)/proveedores/page.tsx` delata la feature por el nombre de CARPETA
    // (`page.tsx` es generico y no diria nada).
    //
    // La carpeta permitida se deriva de `SUPPLIERS_ROUTE` (`@/lib/shared/routes`), nunca de un
    // literal a mano: si la ruta se renombra, esta guardia la sigue.
    const RUTA_DE_LA_PANTALLA = join(
      '(private)',
      ...SUPPLIERS_ROUTE.split('/').filter((segmento) => segmento.length > 0),
    )
      .split(sep)
      .join('/')

    // La pantalla EXISTE, con sus DOS rutas (R1 lista, R3 detalle). Sin este assert el resto
    // del caso pasaria en verde sobre un repositorio sin pantalla, que es justo el falso verde
    // que el retensado tiene que evitar: si manana desaparece, la excepcion sobra y hay que
    // borrar el caso entero, no dejarlo pasando por vacio.
    const enApp = coincidenciasEn(join(repoRoot, 'app'))
    expect(enApp, 'la pantalla de proveedores de QC-44 no aparece bajo app/').toContain(
      `${RUTA_DE_LA_PANTALLA}/page.tsx`,
    )
    expect(enApp, 'la pagina de detalle de proveedor de QC-44 no aparece bajo app/').toContain(
      `${RUTA_DE_LA_PANTALLA}/[id]/page.tsx`,
    )

    // Y vive ENTERA ahi: ni una pieza de proveedores suelta en otra ruta de `app/`. Lo que se
    // permite es LA PANTALLA DE QC-44, no «cualquier cosa bajo app/»: un route handler en
    // `app/api/proveedores/` o un componente de proveedores colgado de otra ruta caen aqui
    // porque no empiezan por la carpeta de la pantalla.
    const fueraDeSuCarpeta = enApp.filter(
      (relativa) => !relativa.startsWith(`${RUTA_DE_LA_PANTALLA}/`),
    )
    expect(
      fueraDeSuCarpeta,
      `pieza de proveedores fuera de app/${RUTA_DE_LA_PANTALLA}/: ${fueraDeSuCarpeta.join(', ')}`,
    ).toEqual([])

    // Esta mitad sigue INTACTA y en negativo: QC-44 monto sus piezas dentro de la carpeta de
    // ruta, asi que `components/` (compartido entre pantallas) no gano ninguna de proveedores.
    const enComponents = coincidenciasEn(join(repoRoot, 'components'))
    expect(
      enComponents,
      `componente de proveedores encontrado bajo components/: ${enComponents.join(', ')}`,
    ).toEqual([])

    // El E2E dejo de estar diferido (la decision cerrada 8 de QC-43 queda superada por QC-44,
    // R51 y R52), pero la lista es CERRADA y nombra EL spec de QC-44: un segundo spec de
    // proveedores sin ficha pone esto en rojo, y si el de QC-44 desaparece, tambien.
    const enE2e = coincidenciasEn(join(repoRoot, 'e2e'))
    expect(enE2e, `spec E2E de proveedores inesperado: ${enE2e.join(', ')}`).toEqual([
      'proveedores.spec.ts',
    ])
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

    // Y no hay ningun route handler escondido en otro sitio de `app/api` que llegue al
    // modulo: se mira el CONTENIDO, no solo el nombre de la carpeta. Se busca la PALABRA,
    // no el import de `lib/modules/proveedores`, porque el camino corto para saltarse esto
    // es pedirle la fachada a `@/lib/composition` desde una carpeta con otro nombre
    // (`app/api/compras/route.ts` con `proveedores.listSuppliers(...)`): ahi no aparece la
    // ruta del modulo por ningun lado y el test se quedaria verde. Mismo criterio que
    // `module-contract.test.ts` usa para todo `app/`.
    for (const archivo of filesIn(join(repoRoot, 'app', 'api'), /\.tsx?$/)) {
      const fuente = readFileSync(archivo, 'utf8')
      expect(
        PATRON_PROVEEDORES.test(fuente),
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

    // `SupplierCatalogLine` tras QC-52: pierde la columna que la unia a `inventario`, su
    // `@@unique` y su `@@index` (R9), y gana `name`, `nameNormalized`, `presentationId`,
    // `unitId`, `imagePath` y `deletedAt` con los dos `@@index` de las FK nuevas (R8). Ni una
    // columna mas: en particular NO gana `stock` ni `qtyAlert` -cuanto tienes es tuyo, no del
    // proveedor- ni ningun `@relation` hacia otro modulo.
    //
    // Y NO hay ningun `@@unique` nuevo, que es lo que mas facil se cuela: la unicidad de la
    // linea es un indice PARCIAL sobre las vivas (R15, R17) y Prisma no modela indices
    // parciales, asi que vive escrito a mano en la migracion. Un `@@unique` aqui seria un
    // indice TOTAL que romperia R17 -dar de baja una linea no liberaria su combinacion-.
    expect(
      camposDe('SupplierCatalogLine'),
      'model SupplierCatalogLine no quedo como lo dejo QC-52',
    ).toEqual([
      'id',
      'supplierId',
      'name',
      'nameNormalized',
      'presentationId',
      'unitId',
      'imagePath',
      'cost',
      'minPurchase',
      'deliveryTime',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'supplier',
      '@@index([presentationId], map: "supplier_catalog_lines_presentation_id_idx")',
      '@@index([unitId], map: "supplier_catalog_lines_unit_id_idx")',
      '@@index([createdBy], map: "supplier_catalog_lines_created_by_idx")',
      '@@index([updatedBy], map: "supplier_catalog_lines_updated_by_idx")',
      '@@map("supplier_catalog_lines")',
    ])
    expect(
      camposDe('SupplierCatalogLine').some((linea) => linea.startsWith('@@unique')),
      'la unicidad de la linea es un indice PARCIAL escrito a mano, no un @@unique de Prisma',
    ).toBe(false)

    // Y SOLO TRES migraciones del repo tocan estas dos tablas: la de QC-42 que las creo, la
    // de QC-43 con sus tres cambios y la de QC-52 que separa las dos tablas. Una cuarta seria
    // alcance escapandose por una via que el censo de campos de arriba no ve (p. ej. un
    // CHECK, que Prisma no modela).
    const migracionesDir = join(repoRoot, 'db', 'migrations')
    const tocanLasTablas = readdirSync(migracionesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const sql = join(migracionesDir, entry.name, 'migration.sql')
        if (!existsSync(sql)) return false
        // RETENSADO 2026-09-04 (QC-47). Antes se buscaba el nombre de la tabla en el texto
        // CRUDO del SQL, comentarios incluidos, y eso daba un falso positivo: la migracion de
        // QC-47 solo NOMBRA `suppliers` en dos lineas de comentario que explican por que NO le
        // hace DDL. Un comentario no toca una tabla. Se quitan los comentarios (`--` de linea y
        // bloques) ANTES de buscar, asi que la lista de abajo sigue teniendo TRES entradas y no
        // cuatro: la guardia no se afloja -no se anade ninguna migracion a la lista permitida-,
        // se le quita el ruido para que mida DDL de verdad. Si QC-47 escribiera un solo ALTER
        // sobre esas tablas, este caso caeria.
        const sqlSinComentarios = readFileSync(sql, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/--[^\n]*/g, ' ')
        return /\b(suppliers|supplier_catalog_lines)\b/i.test(sqlSinComentarios)
      })
      .map((entry) => entry.name)
      .sort()

    expect(
      tocanLasTablas,
      'solo la migracion de QC-42 y la de QC-43 pueden tocar suppliers y supplier_catalog_lines',
    ).toEqual([
      '20260903131417_suppliers_and_supplier_catalog_lines',
      '20260903200343_supplier_contact_cost_and_line_audit',
      '20260904123854_split_product_and_supplier_catalog',
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
