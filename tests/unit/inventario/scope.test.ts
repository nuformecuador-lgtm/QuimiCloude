// T15 — Test de alcance de QC-20 (crud-de-productos).
//
// QC-14 sembro un test de alcance parecido (`tests/unit/inventario/schema/inventario-schema.test.ts`)
// que afirmaba que el modulo `inventario` seguia siendo el slot vacio de QC-15: sin
// adaptadores driving, sin domain, con el contrato en `export {};`. QC-20 es precisamente
// la ficha que le da contenido a ese modulo (R31, R34), asi que esas tres clausulas ya no
// podian seguir vivas ahi. Este archivo hereda, adaptada, la unica que QC-20 SI puede
// seguir cumpliendo: que las mutaciones del catalogo entran como Server Actions bajo
// `adapters/driving/`, nunca como route handler bajo `app/api/`.
//
// Recorre el ARBOL DE ARCHIVOS, no el grafo de imports: por eso vive fuera de
// `tests/guards/` (esas guardias siguen imports; esto es una foto del disco).
//
// Cubre R29, R34.
//
// **2026-09-03 (QC-22, pantalla-de-productos):** el segundo caso se INVIRTIO. Afirmaba que no
// existia pantalla de catalogo porque estaba diferida a QC-22; QC-22 la construyo, asi que la
// premisa cayo. El motivo entero y que sigue vigilando, dentro del propio caso.
//
// **2026-09-03 (QC-26, pantalla-de-recetas):** el segundo caso volvio a moverse, esta vez sin
// invertirse -es un FALSO POSITIVO de un barrido por NOMBRE, no un cambio de premisa-. QC-26
// anadio `app/(private)/produccion/formulas/components/product-picker.tsx`: el barrido por
// `/product|presentation|inventario/i` lo marcaba solo porque su nombre contiene «product».
// Ese archivo no es una SEGUNDA pantalla del catalogo: es el selector de producto de una linea
// de receta, que CONSUME `listProductsAction` -exactamente lo que QC-26/R28 y R49 mandan
// hacer-. Lo que este caso protege de verdad -que no aparezca una segunda pantalla del
// catalogo fuera de `app/(private)/inventario/`- no cambia; lo que cambia es el criterio para
// distinguir «pantalla de catalogo» de «componente que solo consume la operacion de
// productos»: se excluye por nombre y motivo la carpeta de la ruta de recetas, y ademas se
// exige, para lo que quede fuera de esa exclusion, una senal real de pantalla de catalogo
// (`page.tsx`, o un archivo que declare `ProductListSection`/una tabla de productos), no basta
// con que el nombre de archivo contenga la palabra. El detalle, dentro del caso.
//
// **2026-09-04 (QC-44, pantalla-de-proveedores):** tercera vez, y otra vez el mismo tipo de ajuste
// -FALSO POSITIVO del barrido por NOMBRE-. QC-44 promovio el selector de presentacion a
// `components/shared/presentation-select.tsx` porque dos pantallas lo necesitan con la misma API;
// ese archivo no es una segunda pantalla del catalogo, solo consume `listPresentationsAction` y
// `createPresentationAction`. Se excluye por nombre y motivo, con la misma defensa extra que la
// exclusion de recetas: el archivo tiene que existir y no puede llevar senal de pantalla. El
// motivo entero, dentro del caso.
//
// **2026-09-07 (QC-45, pantalla-de-presentaciones):** cuarta vez, mismo tipo de ajuste -FALSO
// POSITIVO del barrido por NOMBRE-. QC-45 monta la pantalla del catalogo de PRESENTACIONES bajo
// `PRESENTATIONS_ROUTE`; sus once componentes se llaman `presentation-*.tsx` y casan con
// `screenPattern` por la palabra «presentation». No son una segunda pantalla del catalogo de
// PRODUCTOS: son otra entidad del mismo modulo `inventario`, consumidora nueva y legitima
// aprobada por el humano el 2026-09-07. Se excluye esa carpeta por nombre y motivo, con una
// defensa extra AUN MAS estrecha que las anteriores -dentro de la exclusion solo se perdona lo
// que casa por «presentation»-. El detalle, dentro del caso.
//
// **2026-09-11 (QC-49, aislamiento-por-empresa-en-inventario):** quinta vez, y esta NO es una
// exclusion sino un renglon mas en la LISTA CERRADA de specs E2E: `e2e/aislamiento-inventario.spec.ts`
// (T15) casa con `screenPattern` por la palabra «inventario» y no es una segunda pantalla del
// catalogo, es el recorrido de dos empresas que CONSUME las pantallas ya existentes. Se enumera
// con su motivo -no se afina el matcher, que es un barrido por nombre y cualquier ajuste seria
// una regla que el spec de manana esquiva- y con la misma defensa extra que las demas. El
// detalle, dentro del caso.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { FORMULAS_ROUTE, PRESENTATIONS_ROUTE } from '@/lib/shared/routes'

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

/** Rutas del catalogo bajo `app/api/`: ninguna debe existir, la migracion NUNCA lo permite. */
const CATALOG_API_ROUTES = [
  join(repoRoot, 'app', 'api', 'products'),
  join(repoRoot, 'app', 'api', 'presentations'),
  join(repoRoot, 'app', 'api', 'inventario'),
]

/** Recorre un directorio recursivamente y devuelve las rutas absolutas a archivos `.ts`/`.tsx`. */
function typescriptFilesIn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

describe('alcance de QC-20 (crud-de-productos): sin route handlers; la pantalla, solo la de QC-22', () => {
  it('las mutaciones del catalogo son Server Actions y no hay ningun route handler bajo app/api', () => {
    // R29, parte 1: ninguna ruta HTTP del catalogo, hoy ni nunca en esta feature. Falsable
    // con solo crear `app/api/products/route.ts` (o `presentations`/`inventario`): el
    // `existsSync` pasa a `true` y la asercion cae.
    for (const route of CATALOG_API_ROUTES) {
      expect(existsSync(route), `${route} no debe existir: las mutaciones son Server Actions`).toBe(
        false,
      )
    }

    // R29, parte 2: todo archivo que aparezca en `adapters/driving/` (T12 lo llena) es una
    // Server Action, nunca un route handler disfrazado. Hoy la carpeta esta vacia (solo el
    // `.gitkeep` de QC-15), asi que el bucle no itera nada TODAVIA — pero en cuanto T12
    // ponga el primer archivo sin la directiva `'use server'` en la primera linea util, esta
    // asercion cae. Es la misma tecnica que usa `identity` para sus propias Server Actions.
    const drivingDir = join(repoRoot, 'lib', 'modules', 'inventario', 'adapters', 'driving')
    for (const file of typescriptFilesIn(drivingDir)) {
      const source = readFileSync(file, 'utf8').trimStart()
      expect(source, `${file} debe declarar 'use server' en la primera linea`).toMatch(
        /^(['"])use server\1/,
      )
    }
  })

  it('la pantalla del catalogo vive solo donde la declara QC-22, y en ningun otro sitio', () => {
    // CENTINELA INVERTIDO el 2026-09-03 (QC-22, pantalla-de-productos).
    //
    // Hasta hoy este caso afirmaba, por R34 de QC-20, que «no existe ninguna pantalla, pagina
    // ni componente de productos, ni spec E2E nuevo»: la pantalla del catalogo estaba
    // DIFERIDA a QC-22. QC-22 es precisamente la ficha que la construye, asi que esa premisa
    // dejo de ser cierta y el centinela se **invierte, no se borra ni se salta**. Es el mismo
    // trato que recibieron `tests/unit/private-layout.test.tsx` y
    // `tests/unit/sidebar-mobile.test.tsx` en esta feature.
    //
    // Lo que R34 protegia de verdad NO era la ausencia: era que la pantalla del catalogo no
    // apareciese por goteo, repartida por el repositorio y sin ficha que la respalde. Eso
    // sigue vigente y es lo que este caso vigila ahora: la pantalla existe, vive ENTERA bajo
    // su carpeta de ruta (`app/(private)/inventario/`), `components/` sigue sin una sola
    // pieza de catalogo, y el unico spec E2E del catalogo es el que trae QC-22. Un
    // `app/(private)/products/page.tsx` o un `components/product-table.tsx` de manana —los
    // dos sin ficha— ponen esto en rojo igual que antes.
    //
    // Lo que QC-20 afirmaba sobre SU PROPIO alcance no se pierde: sigue siendo cierto que
    // QC-20 no trajo pantalla, y el primer caso de este archivo (R29, sin route handlers)
    // queda intacto.

    // Se busca la palabra en la RUTA COMPLETA (no solo en el nombre del archivo): una carpeta
    // de ruta de Next como `app/(private)/products/page.tsx` delata el catalogo por el nombre
    // de carpeta, no del archivo (`page.tsx` es generico), y hay que cazarla igual.
    // `inventario` entra en el patron porque es el nombre de la ruta real del catalogo: sin el,
    // ni `app/(private)/inventario/page.tsx` ni `e2e/inventario.spec.ts` casarian y la mitad de
    // esta guardia no miraria nada.
    const screenPattern = /product|presentation|inventario/i

    /** Rutas relativas al directorio barrido, en POSIX, para comparar sin depender del SO. */
    function matchingFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath ?? entry.path, entry.name)))
        .map((relPath) => relPath.split(sep).join('/'))
        .filter((relPath) => screenPattern.test(relPath))
        .sort()
    }

    // La pantalla EXISTE: si alguien la borra, esto cae. Sin este assert, el resto del caso
    // pasaria en verde sobre un repositorio sin catalogo, que es justo el falso verde que la
    // inversion tenia que evitar.
    const CATALOG_ROUTE_DIR = join('(private)', 'inventario').split(sep).join('/')
    const appMatches = matchingFiles(join(repoRoot, 'app'))
    expect(appMatches, 'la pantalla del catalogo de QC-22 no aparece bajo app/').toContain(
      `${CATALOG_ROUTE_DIR}/page.tsx`,
    )

    // Y vive ENTERA ahi: ni una pieza de catalogo suelta en otra ruta de `app/`.
    //
    // ACTUALIZADO 2026-09-03 (QC-26): `appMatches` ya no se compara directo contra
    // `CATALOG_ROUTE_DIR` -QC-26 anadio `product-picker.tsx` bajo la ruta de recetas
    // (`FORMULAS_ROUTE`, derivada de `@/lib/shared/routes` y nunca de un literal a mano), y
    // ese archivo casa con `screenPattern` por su nombre («product») aunque no sea una
    // pantalla de catalogo: es el selector de producto de una linea de receta, que CONSUME
    // `listProductsAction` (R28/R49 de QC-26), no una segunda pantalla del catalogo. Se
    // excluye esa carpeta EXPLICITAMENTE, con el motivo escrito arriba -no se afloja el
    // patron ni se vacia la lista de matches-, y lo que quede FUERA de las dos exclusiones
    // (la del catalogo y la de recetas) sigue teniendo que estar vacio.
    const RECIPES_ROUTE_DIR = join('(private)', ...FORMULAS_ROUTE.split('/').filter((s) => s.length > 0))
      .split(sep)
      .join('/')
    // ACTUALIZADO 2026-09-07 (QC-45, pantalla-de-presentaciones): TERCERA exclusion de carpeta, y
    // otra vez un FALSO POSITIVO del barrido por NOMBRE. QC-45 monta la pantalla del catalogo de
    // PRESENTACIONES bajo `PRESENTATIONS_ROUTE` (`/configuracion/presentaciones`, derivada de
    // `@/lib/shared/routes` y nunca de un literal a mano). Sus archivos casan con `screenPattern`
    // solo porque se llaman `presentation-*.tsx`: son OTRA entidad -el catalogo de envases-, una
    // consumidora nueva y legitima del modulo `inventario` aprobada por el HUMANO el 2026-09-07
    // (QC-45 R6, `design.md > 1`), no una segunda pantalla del catalogo de PRODUCTOS, que es lo
    // que esta guardia de QC-20 vigila. Se excluye la carpeta por nombre y motivo, con la misma
    // defensa extra que las otras dos exclusiones -abajo-, y lo que quede FUERA de las tres
    // sigue teniendo que estar vacio.
    const PRESENTATIONS_ROUTE_DIR = join(
      '(private)',
      ...PRESENTATIONS_ROUTE.split('/').filter((s) => s.length > 0),
    )
      .split(sep)
      .join('/')
    // 2026-09-24 (importacion de catalogo desde PDF): CUARTO falso positivo por nombre, y se
    // excluye un ARCHIVO, no una carpeta. La revision de la importacion elige la unidad de cada
    // presentacion NUEVA en `new-presentation-units.tsx`; casa con `screenPattern` solo por llamarse
    // `*presentation*`. No lista ni edita el catalogo de productos: es un selector de unidad dentro
    // de la pantalla de proveedores. Cualquier otro archivo de esa carpeta que case sigue en rojo.
    const SELECTOR_DE_UNIDAD_DE_LA_IMPORTACION =
      '(private)/proveedores/[id]/importar/[documentoId]/components/new-presentation-units.tsx'
    const fueraDeSuCarpeta = appMatches.filter(
      (relPath) =>
        !relPath.startsWith(`${CATALOG_ROUTE_DIR}/`) &&
        !relPath.startsWith(`${RECIPES_ROUTE_DIR}/`) &&
        !relPath.startsWith(`${PRESENTATIONS_ROUTE_DIR}/`) &&
        relPath !== SELECTOR_DE_UNIDAD_DE_LA_IMPORTACION,
    )
    expect(
      fueraDeSuCarpeta,
      `pantalla de catalogo fuera de app/${CATALOG_ROUTE_DIR}/: ${fueraDeSuCarpeta.join(', ')}`,
    ).toEqual([])

    // Defensa extra, para que la exclusion de arriba no se convierta en una puerta trasera:
    // de lo que SI cae bajo la carpeta de recetas y casa con `screenPattern`, ninguno puede
    // llevar una senal REAL de pantalla de catalogo -un `page.tsx`, o un archivo que declare
    // `ProductListSection` o una tabla de productos (`product-table`)-. Si manana alguien
    // monta una `page.tsx` de productos bajo la ruta de recetas para esquivar esta guardia,
    // esto cae aunque la exclusion de arriba lo deje pasar.
    const dentroDeRecetas = appMatches.filter((relPath) => relPath.startsWith(`${RECIPES_ROUTE_DIR}/`))
    const SENAL_DE_PANTALLA_DE_CATALOGO = /\/page\.tsx$|ProductListSection|product-table/i
    const filtracionesDeCatalogo = dentroDeRecetas.filter((relPath) => {
      if (/\/page\.tsx$/.test(relPath)) return true
      const source = readFileSync(join(repoRoot, 'app', relPath), 'utf8')
      return SENAL_DE_PANTALLA_DE_CATALOGO.test(relPath) || /ProductListSection|product-table/.test(source)
    })
    expect(
      filtracionesDeCatalogo,
      `pantalla de catalogo escondida bajo la ruta de recetas: ${filtracionesDeCatalogo.join(', ')}`,
    ).toEqual([])

    // Misma defensa extra para la exclusion de QC-45, y ESTRECHADA un paso mas: bajo la ruta de
    // presentaciones solo se perdona lo que casa con `screenPattern` POR LA PALABRA
    // «presentation». Un archivo que casase por «product» o por «inventario», un `page.tsx` de
    // productos, o cualquier fuente que declare `ProductListSection`/`product-table` sigue
    // poniendo esto en rojo: la exclusion no es una puerta trasera para meter la pantalla de
    // productos bajo `/configuracion`. Y la carpeta tiene que existir: si QC-45 desapareciera,
    // la exclusion sobra y hay que borrarla.
    const dentroDePresentaciones = appMatches.filter((relPath) =>
      relPath.startsWith(`${PRESENTATIONS_ROUTE_DIR}/`),
    )
    expect(
      dentroDePresentaciones.length,
      `la pantalla de presentaciones de QC-45 no aparece bajo app/${PRESENTATIONS_ROUTE_DIR}/`,
    ).toBeGreaterThan(0)
    const filtracionesEnPresentaciones = dentroDePresentaciones.filter((relPath) => {
      if (/\/page\.tsx$/.test(relPath)) return true
      if (/product|inventario/i.test(relPath)) return true
      const source = readFileSync(join(repoRoot, 'app', relPath), 'utf8')
      return /ProductListSection|product-table/.test(source)
    })
    expect(
      filtracionesEnPresentaciones,
      `pantalla de catalogo de productos escondida bajo la ruta de presentaciones: ${filtracionesEnPresentaciones.join(', ')}`,
    ).toEqual([])

    // Esta mitad de R34 sigue INTACTA y en negativo: QC-22 monto sus piezas dentro de la
    // carpeta de ruta, asi que `components/` (compartido entre pantallas) no gano ninguna
    // PANTALLA de catalogo.
    //
    // ACTUALIZADO 2026-09-04 (QC-44, pantalla-de-proveedores): mismo movimiento que hizo QC-26
    // arriba y por el mismo motivo -un FALSO POSITIVO del barrido por NOMBRE, no un cambio de
    // premisa-. QC-44 (T7) promovio el selector de presentacion de la ruta de inventario a
    // `components/shared/presentation-select.tsx` porque la pantalla de proveedores lo necesita
    // con la MISMA API (`design.md > 8.1`, `docs/architecture.md > Regla: sin sobre-ingenieria`).
    // Ese archivo casa con `screenPattern` solo porque su nombre contiene «presentation»: NO es
    // una segunda pantalla del catalogo, es el selector que unicamente CONSUME
    // `listPresentationsAction`/`createPresentationAction` -las dos operaciones que QC-44/R39 le
    // permite tocar-. Se excluye por nombre y motivo, no se afloja `screenPattern` ni se vacia
    // la lista de matches: cualquier OTRO archivo de catalogo bajo `components/` sigue poniendo
    // esto en rojo.
    //
    // ACTUALIZADO 2026-09-11 (QC-80, unidad-desde-la-presentacion): un SEGUNDO archivo entra en la
    // misma exclusion y por el mismo motivo. El alta rapida del selector de arriba pasa a pedir la
    // unidad (R10, R11), asi que reusa el selector de unidad de la presentacion, que estaba en la
    // ruta de presentaciones; dejarlo alli obligaria a que `components/shared/` importara de
    // `app/`. Promovido a `components/shared/presentation-unit-select.tsx`, casa con
    // `screenPattern` tambien por la palabra «presentation» y tampoco es una pantalla: solo pinta
    // un `Select` con las unidades que le bajan POR PROPS, sin consultar ninguna operacion.
    // ACTUALIZADO 2026-09-22 (QC-146, presentacion-del-pedido): un TERCER archivo entra en la
    // misma exclusion. `order-presentation-label.tsx` casa con `screenPattern` por la palabra
    // «presentation» en su nombre; no es una pantalla del catalogo, es la marca que pinta el
    // nombre de la presentacion de un pedido (o «Sin presentacion») a partir de lo que le llega
    // por props, sin consultar ninguna operacion del catalogo.
    // ACTUALIZADO 2026-10-01 (pedido-en-varias-presentaciones): ese tercer archivo se
    // renombro a `order-distribution-label.tsx`; el nombre nuevo ya no casa con `screenPattern`,
    // asi que la exclusion sobra y se retira.
    const SELECTORES_PROMOVIDOS = [
      'shared/presentation-select.tsx',
      'shared/presentation-unit-select.tsx',
    ] as const
    const componentMatches = matchingFiles(join(repoRoot, 'components'))
    const componentesDeCatalogo = componentMatches.filter(
      (relPath) => !(SELECTORES_PROMOVIDOS as readonly string[]).includes(relPath),
    )
    expect(
      componentesDeCatalogo,
      `componente de catalogo encontrado bajo components/: ${componentesDeCatalogo.join(', ')}`,
    ).toEqual([])

    // Y la exclusion no es una puerta trasera, exactamente igual que la de la ruta de recetas:
    // el archivo promovido tiene que seguir existiendo -si desaparece, la exclusion sobra y hay
    // que borrarla- y no puede llevar ninguna senal REAL de pantalla de catalogo
    // (`ProductListSection` o una tabla de productos). Si manana alguien convierte ese archivo
    // en una pantalla para esquivar esta guardia, esto cae aunque la exclusion lo deje pasar.
    for (const promovido of SELECTORES_PROMOVIDOS) {
      expect(
        componentMatches,
        `selector promovido que no esta donde dice la exclusion: ${componentMatches.join(', ')}`,
      ).toContain(promovido)
      const fuenteDelSelector = readFileSync(
        join(repoRoot, 'components', ...promovido.split('/')),
        'utf8',
      )
      expect(
        /ProductListSection|product-table/.test(fuenteDelSelector),
        `${promovido} no puede ser una pantalla de catalogo`,
      ).toBe(false)
    }

    // El E2E del catalogo dejo de estar diferido (D4 de QC-20 queda superada por QC-22), pero
    // la lista es CERRADA: un segundo spec de catalogo sin ficha pone esto en rojo.
    //
    // ACTUALIZADO 2026-09-11 (QC-49, aislamiento-por-empresa-en-inventario, T15): entra un
    // SEGUNDO nombre, `aislamiento-inventario.spec.ts`, y entra CON FICHA —`design.md > 8` y
    // `tasks.md > T15` lo piden por su nombre— y con su motivo escrito aqui, que es justo lo que
    // «lista cerrada» significa: no que no pueda crecer, sino que no crezca en silencio.
    //
    // Por que se AÑADE a la lista en vez de afinar `screenPattern` para que no lo capture: el
    // matcher es un barrido por NOMBRE, y cualquier ajuste que dejara fuera a este archivo
    // (excluir «aislamiento», exigir que el nombre empiece por «inventario», …) seria una regla
    // de nombres que el spec de mañana esquiva llamandose distinto. Enumerar es mas estrecho:
    // un TERCER spec que case con el patron sigue poniendo esto en rojo hasta que alguien
    // escriba aqui por que existe. La guardia no se afloja; se le añade un renglon.
    //
    // Y este archivo NO es una segunda pantalla del catalogo —casa con `screenPattern` solo por
    // la palabra «inventario», como `product-picker.tsx` casaba por «product»—: es un recorrido
    // de AISLAMIENTO POR EMPRESA que CONSUME las dos pantallas que ya existen (la de QC-22 y la
    // de QC-45) con datos de dos empresas. La defensa extra de abajo es la misma que la de las
    // otras exclusiones: el archivo tiene que existir y tiene que llevar la señal de lo que dice
    // ser.
    // ACTUALIZADO 2026-09-18 (QC-92, ajuste-de-inventario): entra un TERCER nombre,
    // `ajuste-de-inventario.spec.ts`, en el orden que el matcher devuelve (alfabetico). Casa con
    // `screenPattern` por la MISMA razon que `aislamiento-inventario.spec.ts`: por la palabra
    // «inventario» en el nombre del archivo. Y por la MISMA razon que aquel, no es una segunda
    // pantalla del catalogo: lo que ejercita es el PANEL DE LOTES y el AJUSTE DE EXISTENCIA, que
    // es la pantalla que esta ficha añade -el alta del catalogo la sigue cubriendo
    // `inventario.spec.ts` y esta ficha no la toca-. La guardia no se afloja; se le añade un
    // renglon.
    // ACTUALIZADO: entra un CUARTO nombre, `producto-terminado.spec.ts`, en el orden que el
    // matcher devuelve (alfabetico). Casa con `screenPattern` por la palabra «producto» en el
    // nombre del archivo. No es una segunda pantalla del catalogo: lo que ejercita es el
    // recorrido de un pedido que se finaliza y hace nacer un producto terminado con su lote en
    // la pestaña «Producto terminado» de Inventario -el alta del catalogo la sigue cubriendo
    // `inventario.spec.ts` y esta ficha no la toca-. La guardia no se afloja; se le añade un
    // renglon.
    const E2E_DE_AISLAMIENTO = 'aislamiento-inventario.spec.ts'
    const e2eMatches = matchingFiles(join(repoRoot, 'e2e'))
    expect(e2eMatches, `spec E2E de catalogo inesperado: ${e2eMatches.join(', ')}`).toEqual([
      E2E_DE_AISLAMIENTO,
      'ajuste-de-inventario.spec.ts',
      'inventario.spec.ts',
      'producto-terminado.spec.ts',
    ])

    // Defensa extra, para que el renglon nuevo no sea una puerta trasera: el spec de QC-49 tiene
    // que seguir siendo el recorrido de DOS EMPRESAS que dice ser —nombra la empresa y el campo
    // oculto del borrado ajeno— y no puede convertirse en un segundo recorrido de alta del
    // catalogo. Si mañana alguien vacia ese archivo y le mete la pantalla de productos para
    // esquivar la lista cerrada, esto cae aunque el nombre siga en la lista.
    const fuenteDelAislamiento = readFileSync(join(repoRoot, 'e2e', E2E_DE_AISLAMIENTO), 'utf8')
    for (const senal of ['companyId', 'delete-product-id']) {
      expect(
        fuenteDelAislamiento.includes(senal),
        `${E2E_DE_AISLAMIENTO} debe seguir siendo el recorrido de aislamiento de QC-49: falta «${senal}»`,
      ).toBe(true)
    }
  })
})

// AMPLIACION 2026-09-11 (QC-49, R28) — EL ALCANCE DE LA MIGRACION, MEDIDO.
//
// QC-49 aisla por empresa TRES tablas: `products`, `presentations` y `product_batches`. Ni una
// mas. `recipes` y `recipe_lines` son QC-50, `suppliers` y `supplier_catalog_lines` son QC-59 y
// `orders` es QC-60 — y a estas alturas varias de ellas YA tienen su empresa, puesta cada una
// por su propia migracion y no por esta: `suppliers` y `supplier_catalog_lines` desde el
// 2026-09-17. Que ya la tengan no afloja nada de lo que se mide aqui, porque lo que se mide es
// que ESTA migracion no las toca, y eso sigue siendo cierto. La tentacion de «ya que estoy» es
// real y cara: una columna de empresa puesta desde aqui, sin el filtro del modulo que la
// consulta, no aisla nada y ademas rompe la ficha que si iba a hacerlo, porque le deja el
// esquema a medias y sin su backfill.
//
// Por eso este bloque mide el ALCANCE, y lo mide en los dos sitios donde se puede desbordar: el
// texto de la migracion -que es lo que se aplica- y el esquema de Prisma -que es lo que el
// codigo ve-. Es un barrido de texto, como el resto de este archivo: mira el disco, no el grafo.
//
// Cubre R28.
describe('alcance de QC-49 (aislamiento-por-empresa-en-inventario): tres tablas y ninguna mas', () => {
  /**
   * Las cinco que R28 deja EXPLICITAMENTE fuera, con la ficha que se ocupa de cada una. La
   * ficha anotada NO significa «todavia sin empresa»: varias ya la tienen, puesta por su propia
   * migracion. Lo que esta lista afirma es que ninguna de las cinco puede aparecer en el UP ni
   * en el DOWN de la migracion de este modulo, y eso vale igual antes y despues de que su ficha
   * cierre. Cuales ya la ganaron se lee abajo, en `MODELOS_YA_AISLADOS_POR_SU_MIGRACION`.
   */
  const TABLAS_FUERA_DE_ALCANCE = [
    { tabla: 'recipes', modelo: 'Recipe', ficha: 'QC-50' },
    { tabla: 'recipe_lines', modelo: 'RecipeLine', ficha: 'QC-50' },
    { tabla: 'suppliers', modelo: 'Supplier', ficha: 'QC-59' },
    { tabla: 'supplier_catalog_lines', modelo: 'SupplierCatalogLine', ficha: 'QC-59' },
    { tabla: 'orders', modelo: 'Order', ficha: 'QC-60' },
  ] as const

  /**
   * Modelos de `TABLAS_FUERA_DE_ALCANCE` que ya ganaron empresa con su propia migracion. Siguen
   * vetados en el UP y el DOWN de esta migracion; en el esquema se exige lo contrario, que SI la
   * declaren. Se nombran uno a uno: un `companyId` en cualquier otro modelo de la lista sigue en rojo.
   *
   * 2026-09-16, QC-50 (aislamiento-por-empresa-en-recetas): entra `Recipe`, con la misma forma
   * que QC-60 metio a `Order` -su propia migracion (`_recipes_company_scope`, no esta) le da el
   * `companyId`, no la de QC-49-. `RecipeLine` NO entra: sigue sin empresa propia a proposito
   * (se alcanza solo a traves de su receta, ver el comentario del modelo en `schema.prisma`), asi
   * que sigue vetada por `TABLAS_FUERA_DE_ALCANCE` sin excepcion, igual que antes de esta ficha.
   *
   * 2026-09-17, aislamiento por empresa en proveedores: entran `Supplier` y
   * `SupplierCatalogLine`, con la misma forma que las anteriores. Su propia migracion
   * (`_suppliers_company_scope`, que no es esta) les da el `companyId`, asi que las dos siguen
   * vetadas en el UP y en el DOWN de aqui y en el esquema se les exige lo contrario. Entran
   * LAS DOS -y no solo la cabecera, como paso con las recetas- porque aqui la linea si lleva
   * empresa propia: la hereda su clave foranea compuesta en vez de alcanzarse solo a traves de
   * su proveedor. Se nombran una a una: cualquier otro modelo de la lista con `companyId` sigue
   * cayendo.
   */
  const MODELOS_YA_AISLADOS_POR_SU_MIGRACION: readonly string[] = [
    'Order',
    'Recipe',
    'Supplier',
    'SupplierCatalogLine',
  ]

  /** La carpeta de la migracion de esta ficha, localizada por su sufijo y no por su marca de tiempo. */
  function carpetaDeLaMigracion(): string {
    const raiz = join(repoRoot, 'db', 'migrations')
    const candidatas = readdirSync(raiz, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('_inventory_company_scope'))
      .map((entry) => entry.name)
    // Cero carpetas = este bloque no vigila nada; dos = alguien duplico la migracion.
    expect(candidatas, 'se esperaba UNA migracion _inventory_company_scope').toHaveLength(1)
    return join(raiz, candidatas[0] as string)
  }

  /** SQL sin comentarios: la migracion DOCUMENTA en prosa que deja esas tablas fuera (R28), y
   *  esa prosa no puede hacer fallar al barrido -lo que se mide es lo que se EJECUTA-. */
  function sqlEjecutable(archivo: string): string {
    return readFileSync(archivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--.*$/gm, '')
  }

  it('el UP y el DOWN de la migracion no nombran ninguna tabla fuera de alcance', () => {
    const carpeta = carpetaDeLaMigracion()
    const up = sqlEjecutable(join(carpeta, 'migration.sql'))
    const down = sqlEjecutable(join(carpeta, 'down.sql'))

    // Ancla contra el verde por vacuidad: si los archivos estuvieran vacios o solo fueran
    // comentarios, todo lo de abajo pasaria sin mirar nada.
    expect(up.trim().length, 'migration.sql no puede quedar vacio al quitar comentarios').toBeGreaterThan(0)
    expect(down.trim().length, 'down.sql no puede quedar vacio al quitar comentarios').toBeGreaterThan(0)

    // Y mide lo que SI toca: las tres tablas de la ficha aparecen en el UP. Sin esto, un
    // `migration.sql` que no hiciera nada tambien pasaria el barrido de ausencias.
    for (const tabla of ['products', 'presentations', 'product_batches']) {
      expect(up, `el UP deberia tocar ${tabla}`).toContain(tabla)
    }

    for (const { tabla, ficha } of TABLAS_FUERA_DE_ALCANCE) {
      expect(up, `${tabla} no entra en QC-49: es ${ficha}`).not.toContain(tabla)
      expect(down, `${tabla} no entra en QC-49: es ${ficha}`).not.toContain(tabla)
    }
  })

  it('ningun modelo fuera de alcance declara companyId en el esquema de Prisma', () => {
    // La otra cara: aunque la migracion no la crease, un `companyId` en el modelo seria drift
    // -y el codigo de otro modulo empezaria a verlo-. Se recorta el bloque de CADA modelo y se
    // mira dentro; comparar sobre el archivo entero seria inutil, porque `products` y
    // `presentations` SI la declaran.
    const esquema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    /**
     * El bloque `model X { ... }`, recortado hasta su llave de cierre. El corte en la llave NO
     * es cosmetico: sin el, el trozo se llevaria por delante los comentarios `///` del modelo
     * SIGUIENTE, y un `companyId` del vecino se leeria como propio (pasa de verdad:
     * `SupplierCatalogLine` linda con `Unit`, que si la declara desde QC-76).
     */
    function cuerpoDelModelo(modelo: string): string {
      const bloque = esquema.split(/^model /m).find((trozo) => trozo.startsWith(`${modelo} {`))
      expect(bloque, `el esquema no declara el modelo ${modelo}`).toBeDefined()
      if (bloque === undefined) return ''
      const cierre = bloque.search(/^\}/m)
      expect(cierre, `el modelo ${modelo} no cierra`).toBeGreaterThan(0)
      return bloque.slice(0, cierre)
    }

    // Ancla positiva: el recorte funciona y las tres tablas de la ficha SI la declaran. Si
    // `cuerpoDelModelo` devolviera basura, esto es lo que lo delata.
    for (const modelo of ['Product', 'Presentation', 'ProductBatch']) {
      expect(cuerpoDelModelo(modelo), `${modelo} deberia declarar companyId (R1, R2)`).toContain(
        'companyId',
      )
    }

    for (const modelo of MODELOS_YA_AISLADOS_POR_SU_MIGRACION) {
      expect(
        TABLAS_FUERA_DE_ALCANCE.some((fuera) => fuera.modelo === modelo),
        `${modelo} no esta en TABLAS_FUERA_DE_ALCANCE: su alta aqui no exime a nadie`,
      ).toBe(true)
      expect(cuerpoDelModelo(modelo), `${modelo} ya deberia declarar companyId`).toContain('companyId')
    }

    for (const { modelo, ficha } of TABLAS_FUERA_DE_ALCANCE) {
      if (MODELOS_YA_AISLADOS_POR_SU_MIGRACION.includes(modelo)) continue
      const cuerpo = cuerpoDelModelo(modelo)
      expect(cuerpo, `${modelo} no gana empresa en QC-49: es ${ficha}`).not.toContain('companyId')
      expect(cuerpo, `${modelo} no gana empresa en QC-49: es ${ficha}`).not.toContain('company_id')
    }
  })
})
