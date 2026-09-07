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
//
// **2026-09-04 (QC-44, pantalla-de-proveedores):** dos ajustes en este archivo, ninguno un
// aflojamiento.
//   1. El caso «la feature no anade adaptadores driving, rutas ni Server Actions» se RETENSO:
//      afirmaba que `app/(private)/proveedores` no existia porque la pantalla estaba diferida a
//      QC-44, y QC-44 la construye (R1, R3). Pasa de «no existe» a «existe y es la unica».
//   2. El caso del cableado corrige un FALSO POSITIVO de su propia regex: filtraba
//      `(adapters|ports)/`, que atrapaba tambien `adapters/driving/` -las Server Actions que
//      R43 autoriza consumir desde `app/`-. Se estrecha a `adapters/driven/` y `ports/`, que es
//      lo que el caso dice vigilar. El motivo entero, en cada caso.

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
      // `@prisma/client` solo lo pueden importar los DOS adaptadores driven de persistencia
      // que trae QC-43 (T11, T12): son el unico sitio del modulo que habla con el ORM
      // (`design.md > 7`). En QC-42 no habia ninguno y la prohibicion era total; la lista
      // blanca es EXACTA, asi que un tercer archivo con Prisma sigue cayendo aqui.
      const ADAPTADORES_CON_ORM = [
        'lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts',
        'lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts',
      ]
      if (!ADAPTADORES_CON_ORM.includes(etiqueta)) {
        expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      }
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

  it('la feature no anade adaptadores driving ni rutas API, y la unica pantalla es la de QC-44', () => {
    // R35 de QC-42 decia «ni ports/ ni adapters/»: esa era la frontera de la ficha de
    // ESQUEMA. QC-43 la DEROGA expresamente (`tasks.md` T7, T11, T12: «borra el
    // .gitkeep»), asi que la afirmacion pasa de «vacias» a «exactamente estos archivos»,
    // que es igual de falsable y sigue cerrando el hueco: cualquier archivo de mas en
    // `ports/` o en `adapters/driven/` cae aqui.
    expect(
      sourcesIn(join(proveedoresDir, 'ports')).map((f) => toPosix(relative(proveedoresDir, f))),
      'ports/ gano un archivo fuera de los puertos de QC-43 y QC-57',
      // ACTUALIZADO 2026-09-04 (QC-57, T7): `list-query-log.ts` es el TERCER puerto del
      // modulo -el log del campo omitido (R6)-, declarado en los CINCO modulos con listado
      // porque el dominio no puede importar `lib/shared/**`. La afirmacion sigue siendo la
      // lista EXACTA, que es lo que la hace falsable: un cuarto puerto cae aqui igual.
    ).toEqual([
      'ports/list-query-log.ts',
      'ports/supplier-catalog-repository.ts',
      'ports/supplier-repository.ts',
    ])
    expect(
      sourcesIn(join(proveedoresDir, 'adapters', 'driven')).map((f) =>
        toPosix(relative(proveedoresDir, f)),
      ),
      'adapters/driven/ gano un archivo fuera de los adaptadores de QC-43 y QC-57',
      // ACTUALIZADO 2026-09-04 (QC-57, T17/T18): `list-query-sql.ts` traduce el contrato
      // generico de consulta a las condiciones de Prisma y lo comparten los DOS adaptadores
      // del modulo. Vive aqui -y no en `lib/shared/`- porque es una copia deliberada de la
      // gemela de `inventario`: importar de otro modulo por una ruta profunda es lo que la
      // regla de dependencias prohibe. La afirmacion sigue siendo la lista EXACTA.
    ).toEqual([
      'adapters/driven/persistence/list-query-sql.ts',
      'adapters/driven/persistence/supplier-catalog-line-prisma.ts',
      'adapters/driven/persistence/supplier-prisma.ts',
    ])
    // `adapters/driving/` estaba vacia con su `.gitkeep` hasta T14, que la llena con las
    // DOS Server Actions y borra el `.gitkeep`. La afirmacion pasa de «vacia» a «exactamente
    // estos dos archivos», igual de falsable: un tercero cae aqui.
    expect(
      sourcesIn(join(proveedoresDir, 'adapters', 'driving')).map((f) =>
        toPosix(relative(proveedoresDir, f)),
      ),
      'adapters/driving/ gano un archivo fuera de las dos Server Actions de QC-43',
    ).toEqual([
      'adapters/driving/supplier-actions.ts',
      'adapters/driving/supplier-catalog-actions.ts',
    ])
    // Y los `.gitkeep` de las tres carpetas que T7, T11, T12 y T14 llenaron ya NO estan: git
    // no versiona carpetas vacias, pero tampoco carpetas con contenido y un `.gitkeep`
    // sobrante.
    for (const carpeta of ['ports', 'adapters/driven', 'adapters/driving']) {
      expect(
        existsSync(join(proveedoresDir, ...carpeta.split('/'), '.gitkeep')),
        `${carpeta}/.gitkeep sobra: la carpeta ya tiene archivos reales`,
      ).toBe(false)
    }

    // `'use server'` SOLO en `adapters/driving/`, y en su primera linea util. En el resto del
    // modulo -dominio, puertos, adaptadores driven- sigue prohibido: una directiva de
    // servidor colada en `domain/` haria del caso de uso una frontera HTTP.
    for (const file of proveedoresSources) {
      const etiqueta = toPosix(relative(repoRoot, file))
      const esDriving = toPosix(file).includes('/adapters/driving/')
      if (esDriving) {
        expect(
          readFileSync(file, 'utf8').trimStart(),
          `${etiqueta} debe declarar 'use server' en la primera linea`,
        ).toMatch(/^(['"])use server\1/)
      } else {
        expect(read(file), `${etiqueta} declara 'use server'`).not.toMatch(/['"]use server['"]/)
      }
    }

    // Ninguna ruta HTTP de proveedores: las mutaciones son Server Actions y `app/api/` queda
    // reservado a webhooks y APIs publicas (`docs/architecture.md`). Falsable con solo crear
    // `app/api/proveedores/route.ts`.
    //
    // RETENSADO el 2026-09-04 (QC-44, pantalla-de-proveedores): esta lista incluia tambien
    // `app/(private)/proveedores` y `app/(private)/suppliers`, porque QC-42/QC-43 eran fichas
    // de backend y la pantalla estaba DIFERIDA a QC-44. QC-44 es precisamente la ficha que la
    // construye (R1, R3), asi que esa premisa caduco POR DISENO y sale de la lista **solo la
    // ruta que QC-44 declara**: `app/(private)/suppliers` sigue prohibida -la ruta real es la
    // castellana, `SUPPLIERS_ROUTE`- y las dos de `app/api/` siguen intactas.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'suppliers'),
      join(repoRoot, 'app', 'api', 'proveedores'),
      join(repoRoot, 'app', '(private)', 'suppliers'),
    ]) {
      expect(existsSync(ruta), `${toPosix(relative(repoRoot, ruta))} no debe existir`).toBe(false)
    }

    // La pantalla de QC-44 EXISTE: si desaparece, la excepcion de arriba sobra y hay que
    // borrarla. Sin este assert el resto pasaria en verde sobre un repo sin pantalla.
    const PANTALLA_QC44 = join(repoRoot, 'app', '(private)', 'proveedores')
    expect(
      existsSync(join(PANTALLA_QC44, 'page.tsx')),
      'la pantalla de proveedores de QC-44 no existe: la excepcion de arriba sobra',
    ).toBe(true)

    // Y el modulo lo conoce SOLO esa pantalla: lo que se permite es la pantalla de QC-44, no
    // «cualquier cosa bajo app/». Cualquier otro archivo de `app/` que mencione proveedores
    // -un route handler con otro nombre de carpeta, un componente suelto en otra ruta- cae
    // aqui igual que antes. Se mira el CONTENIDO sin comentarios (`read`), no el nombre de la
    // carpeta: el camino corto para esquivar esto es pedirle la fachada a `@/lib/composition`
    // desde una ruta que no se llame «proveedores».
    for (const file of sourcesIn(join(repoRoot, 'app'))) {
      if (toPosix(file).startsWith(toPosix(PANTALLA_QC44))) continue
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} menciona proveedores fuera de la pantalla de QC-44`,
      ).not.toMatch(/proveedores|supplier/i)
    }

    // Y la excepcion no es una puerta trasera: lo que R49 SIGUE prohibiendo es que la pantalla
    // anada Server Actions. Los adaptadores driving del modulo ya quedaron cerrados arriba en
    // los dos de QC-43; aqui se cierra la otra mitad, que ninguna Server Action se declare en
    // la propia pantalla. Falsable poniendo `'use server'` en cualquier archivo suyo.
    for (const file of sourcesIn(PANTALLA_QC44)) {
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} declara 'use server': R49 prohibe anadir Server Actions`,
      ).not.toMatch(/['"]use server['"]/)
    }

    // QC-42 afirmaba aqui que `lib/composition` NO menciona `proveedores`: sin puertos ni
    // adaptadores no habia nada que cablear (`design.md` de QC-42, 5.5). QC-43 T13 lo
    // DEROGA -es literalmente su encargo-, y la afirmacion se invierte: la composicion
    // cablea la fachada, y lo hace EXACTAMENTE una vez. Ver el caso de mas abajo.
  })

  it('el cableado puerto-implementacion de proveedores vive SOLO en lib/composition y una sola vez', () => {
    // T13, R44: `lib/composition` es el UNICO sitio del repo que puede atar un puerto de
    // `proveedores` a su adaptador driven. Se afirma en los dos sentidos, y los dos son
    // falsables:
    //
    //  a) La fachada existe y esta completa: las nueve claves, ni una mas ni una menos.
    //     Un caso de uso sin cablear -o un decimo colado- cae aqui.
    //  b) Nadie MAS instancia esos adaptadores: si un archivo de `app/`, de otro modulo o
    //     un adaptador driving importara `adapters/driven/persistence/*` de `proveedores`,
    //     el cableado habria dejado de ser exclusivo de la composicion.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
    const cablean = composicion.filter((file) => /export const proveedores\b/.test(read(file)))
    expect(
      cablean.map((f) => toPosix(relative(repoRoot, f))),
      'la fachada `proveedores` tiene que existir exactamente una vez en lib/composition',
    ).toEqual(['lib/composition/index.ts'])

    const fuente = read(cablean[0] as string)
    const inicioBloque = fuente.indexOf('export const proveedores')
    // Acotado al OBJETO de `proveedores`, no al resto del archivo: hasta QC-26 este bloque
    // era el ultimo de `lib/composition/index.ts`, y `slice(inicioBloque)` sin un limite de
    // cierre en realidad afirmaba sobre "lo que venga despues de `proveedores`", no sobre
    // `proveedores` mismo. Al resolver el conflicto de F2.3 el bloque `unidades` de QC-26 quedo
    // detras del de `proveedores`, y sus claves (`listUnits`) se colaron en `claves`. La
    // garantia real -nueve claves, ni una mas ni una menos- solo puede sostenerse cerrando el
    // slice en el `};` que cierra ESTE objeto, la primera linea que empieza por `};` despues del
    // inicio del bloque. Retensado el 2026-09-03; no reordenar `index.ts` para volver a poner
    // `proveedores` al final: eso solo traslada la misma trampa a la siguiente feature que
    // añada un bloque detras.
    const cierreRelativo = fuente.slice(inicioBloque).search(/^\};$/m)
    if (cierreRelativo === -1) {
      throw new Error('no se encontro el cierre `};` del objeto `proveedores` en lib/composition/index.ts')
    }
    const bloque = fuente.slice(inicioBloque, inicioBloque + cierreRelativo)
    const claves = [...bloque.matchAll(/^  (\w+):/gm)].map((m) => m[1] as string).sort()
    expect(claves).toEqual([
      'createCatalogLine',
      'createSupplier',
      'deleteCatalogLine',
      'deleteSupplier',
      'getSupplier',
      'listCatalogLines',
      'listSuppliers',
      'updateCatalogLine',
      'updateSupplier',
    ])

    // `productCatalog` se REUTILIZA, no se vuelve a construir (`design.md > 10`): una
    // segunda instancia serian dos cableados del mismo puerto que pueden divergir.
    expect(
      [...fuente.matchAll(/const productCatalog\s*:/g)].length,
      'productCatalog se construye mas de una vez en lib/composition',
    ).toBe(1)

    // Nadie mas que la composicion instancia los adaptadores driven de `proveedores`.
    //
    // FALSO POSITIVO CORREGIDO el 2026-09-04 (QC-44, pantalla-de-proveedores). El filtro decia
    // `(adapters|ports)/`, que ademas de `adapters/driven/` atrapaba `adapters/driving/`. Eso
    // no es lo que este caso quiere vigilar: consumir una Server Action del modulo desde `app/`
    // es EXACTAMENTE el unico camino que R43 autoriza -y lo que la pantalla de inventario de
    // QC-22 lleva haciendo con `adapters/driving/product-actions`-. Nunca habia saltado porque
    // hasta QC-44 no existia ninguna pantalla de proveedores. El filtro se ESTRECHA al camino
    // real: `adapters/driven/` y `ports/`. NO se afloja nada: si un archivo de `app/` o de otro
    // sitio de `lib/` importara `adapters/driven/persistence/*` o un `ports/*` de proveedores,
    // el cableado dejaria de ser exclusivo de la composicion y esto seguiria cayendo.
    const fuera = sourcesIn(join(repoRoot, 'lib'))
      .concat(sourcesIn(join(repoRoot, 'app')))
      .filter((file) => !toPosix(file).includes('/lib/composition/'))
      .filter((file) =>
        /@\/lib\/modules\/proveedores\/(adapters\/driven|ports)\//.test(read(file)),
      )
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(fuera, `cablean proveedores fuera de la composicion: ${fuera.join(', ')}`).toEqual([])

    // Y el dominio, los puertos y los adaptadores DRIVEN no importan la composicion: la
    // flecha va driving -> composicion -> driven, nunca al reves (regla 3 de
    // `docs/architecture.md`). El driving SI puede -y debe- pedirle la fachada.
    for (const file of proveedoresSources) {
      if (toPosix(file).includes('/adapters/driving/')) continue
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} importa @/lib/composition`,
      ).not.toMatch(/@\/lib\/composition/)
    }

    // Los dos adaptadores driving piden la fachada a la composicion, no instancian nada.
    for (const file of sourcesIn(join(proveedoresDir, 'adapters', 'driving'))) {
      expect(
        read(file),
        `${toPosix(relative(repoRoot, file))} deberia consumir @/lib/composition`,
      ).toMatch(/from '@\/lib\/composition'/)
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
    // `presentationId` y `unitId` son escalares sin `@relation`: no generan campo de
    // relacion. Por eso el dmmf de `SupplierCatalogLine` no puede traer nada mas que
    // `Supplier`, la relacion intra-modulo declarada a proposito con `@relation`
    // (`design.md > 2.2`). Desde QC-52 ya no hay ningun `productId` que vigilar (R9).
    expect(relationTargets('SupplierCatalogLine')).toEqual(['Supplier'])
    // Y en el otro sentido: `Supplier` solo conoce sus propias lineas de catalogo.
    expect(relationTargets('Supplier')).toEqual(['SupplierCatalogLine'])
  })

  it('Product NO gana ningun campo de relacion de vuelta hacia SupplierCatalogLine ni hacia Supplier', () => {
    // QC-52 borro la columna que unia las dos tablas (R9), asi que hoy ni siquiera existe el
    // escalar del que podria colgar un `@relation`. El caso se conserva igualmente porque es
    // el que caeria si alguien reintrodujera el vinculo: Prisma exigiria el campo reverso en
    // `Product` (`supplierCatalogLines SupplierCatalogLine[]`) y este `toEqual` completo —no
    // un `not.toContain` suelto— caeria en el instante en que apareciera. La lista esperada
    // es el conjunto EXACTO de relaciones que QC-14/QC-20 le dieron a `Product` (hacia
    // `Presentation`), sin proveedores adentro.
    expect(relationTargets('Product')).toEqual(['Presentation'])
    expect(relationTargets('Product')).not.toContain('SupplierCatalogLine')
    expect(relationTargets('Product')).not.toContain('Supplier')
  })

  it('el catalogo no gana ninguna relacion Prisma hacia Product ni hacia User', () => {
    // T15 (QC-43), R26 y R44. QC-42 ya afirmaba que `SupplierCatalogLine` no tenia relacion
    // hacia `Product`; QC-43 anadio `createdBy`/`updatedBy` y QC-52 anade `presentationId` y
    // `unitId`: CUATRO columnas que apuntan a otra tabla con una FK real en la base. Esa es
    // exactamente la tentacion que este caso vigila: declararlas con `@relation` "porque la
    // FK existe" (decision cerrada 14 de QC-42, mantenida por la 3 de QC-43 y por
    // `design.md > 12.9`).
    //
    // Ninguna guardia detecta ese cruce -`guard-arquitectura-modulos` busca imports y la
    // cadena `prisma.<modelo>`, y un `include: { creator: true }` no es ninguna de las dos
    // cosas-, y por eso este test existe. Se afirma sobre el dmmf, que es el modelo TAL COMO
    // el cliente generado lo entiende, con el censo EXACTO de campos: cualquier `@relation`
    // anadido aparece como un campo `object` de mas y el `toEqual` cae. Requiere el cliente
    // regenerado (`pnpm prisma generate`), que es justo lo que hace que el test siga a la
    // verdad y no al texto del esquema.
    const linea = Prisma.dmmf.datamodel.models.find((m) => m.name === 'SupplierCatalogLine')
    expect(linea, 'Prisma.dmmf no conoce SupplierCatalogLine').toBeDefined()

    // Las dos columnas de autor EXISTEN, y existen como ESCALARES anulables: si estuvieran
    // ausentes, el cambio 3 de la migracion no estaria en el esquema; si fueran `object`,
    // serian la relacion que la decision 14 prohibe. Las dos mitades importan.
    const autoria = linea!.fields.filter((f) => f.name === 'createdBy' || f.name === 'updatedBy')
    expect(autoria.map((f) => `${f.name}:${f.kind}:${f.type}:${f.isRequired}`)).toEqual([
      'createdBy:scalar:String:false',
      'updatedBy:scalar:String:false',
    ])

    // Censo COMPLETO de campos de la linea tras QC-52: ni una relacion de mas, ni una
    // columna de mas. `productId` YA NO ESTA (R9) y en su lugar entran `name`,
    // `nameNormalized`, `presentationId`, `unitId`, `imagePath` y `deletedAt` (R8).
    expect(linea!.fields.map((f) => f.name)).toEqual([
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
    ])

    // R30 — las DOS claves foraneas nuevas se declaran como ESCALARES SIN `@relation`, y por
    // eso el cliente del ORM no puede atravesar de `proveedores` a `inventario` ni a
    // `unidades`: no hay `include: { presentation: true }` que ofrecer. Se afirma sobre el
    // dmmf (`kind`), no sobre el texto del esquema. La FK existe de verdad en la base y eso
    // lo prueba `proveedores-constraints.int.test.ts` contra Postgres: son las dos mitades
    // de R30 y ninguna basta sola.
    expect(
      linea!.fields
        .filter((f) => f.name === 'presentationId' || f.name === 'unitId')
        .map((f) => `${f.name}:${f.kind}:${f.type}:${f.isRequired}`),
    ).toEqual(['presentationId:scalar:String:true', 'unitId:scalar:String:false'])
    expect(relationTargets('SupplierCatalogLine')).not.toContain('Presentation')
    expect(relationTargets('SupplierCatalogLine')).not.toContain('Unit')

    // Y la unica relacion sigue siendo la intra-modulo hacia su proveedor.
    expect(relationTargets('SupplierCatalogLine')).toEqual(['Supplier'])
    expect(relationTargets('SupplierCatalogLine')).not.toContain('Product')
    expect(relationTargets('SupplierCatalogLine')).not.toContain('User')

    // `Supplier` tampoco cambia por esta ficha: sus columnas de autor son de QC-42 y
    // tampoco llevan `@relation`.
    expect(
      Prisma.dmmf.datamodel.models
        .find((m) => m.name === 'Supplier')!
        .fields.filter((f) => f.name === 'createdBy' || f.name === 'updatedBy')
        .map((f) => `${f.name}:${f.kind}`),
    ).toEqual(['createdBy:scalar', 'updatedBy:scalar'])

    // El reverso: `User` no gana ningun campo hacia la linea ni hacia el proveedor. La lista
    // esperada es el conjunto EXACTO que tiene hoy `User`.
    // RETENSADO 2026-09-04 (QC-47): entra `Company` -R9, `users.company_id`-. Sigue siendo
    // igualdad EXACTA sobre el conjunto entero, no un `toContain`: cualquier relacion nueva
    // hacia proveedores, o hacia lo que sea, pone el caso rojo igual que antes.
    expect(relationTargets('User')).toEqual(['Company', 'DocumentType', 'Role'])
  })

  it('User NO gana ningun campo de relacion de vuelta hacia Supplier', () => {
    // Si `createdBy` o `updatedBy` llevaran `@relation`, `User` ganaria un campo reverso
    // (`createdSuppliers Supplier[]` o similar) y este `toEqual` completo caeria. La lista
    // esperada es el conjunto EXACTO que `User` tiene hoy (hacia `DocumentType`, `Role` y
    // -desde QC-47 R9- `Company`), sin proveedores adentro.
    expect(relationTargets('User')).toEqual(['Company', 'DocumentType', 'Role'])
    expect(relationTargets('User')).not.toContain('Supplier')
    expect(relationTargets('User')).not.toContain('SupplierCatalogLine')
  })
})
