// T2 — El LIMITE DE ALCANCE de QC-34, adelantado (R37, R52, R53, R57, R58).
//
// Esta ficha es backend puro: los seis casos de uso, sus puertos, su adaptador driven y sus
// Server Actions. La pantalla es QC-35. Este archivo es lo que impide que «ya que estoy» se
// cuele una pagina, una ruta de API, un spec de Playwright, una copia de la aritmetica de
// paginacion o una dependencia nueva — y se escribe ANTES que los casos de uso, no despues,
// porque una vez escrito el codigo el test se acomoda a lo que hay.
//
// TECNICA (la misma que `schema/pedidos-migration.test.ts` y `module-contract.test.ts` de
// QC-33): cada regla se escribe como un PREDICADO PURO sobre una lista de entradas, y se
// aplica DOS VECES: al arbol REAL (donde la respuesta correcta es la lista VACIA) y a esas
// mismas entradas MAS una sintetica que viola la regla (donde tiene que devolver justo esa).
// Sin la segunda pasada, el `toEqual([])` saldria verde tambien si el barrido no leyera nada o
// si el predicado hubiera dejado de reconocer la infraccion: una lista vacia por vacuidad no
// vigila nada. Un test que no puede fallar no vigila nada.
//
// El arbol REAL no se toca nunca: la entrada sintetica vive solo en memoria.
//
// ACTUALIZADO 2026-09-07 (QC-35), y lo decide el HUMANO. Tres casos de este archivo afirmaban
// «no hay ninguna pagina, componente ni ruta de pedidos», «ningun archivo importa el modulo
// pedidos» y «no hay ningun spec E2E nuevo». Eso era el LIMITE DE ALCANCE de QC-34 -«la
// pantalla es QC-35»-, no una invariante permanente: QC-35 es precisamente la ficha que la
// construye, y su E2E lo aprobo el humano el 2026-09-06. La premisa cayo, asi que los tres se
// INVIERTEN -no se borran, no se relajan y no se meten en ningun baseline-, que es el mismo
// trato que ya recibieron `tests/unit/inventario/scope.test.ts` con QC-22 y
// `tests/unit/recetas/scope.test.ts` con QC-26.
//
// Lo que los tres siguen protegiendo, y por eso siguen aqui: que la pantalla NO aparezca por
// goteo. Vive EXACTAMENTE en la carpeta que deriva de `ORDERS_ROUTE` -nunca de un literal
// escrito a mano, para que un cambio de ruta arrastre esta prueba con el mismo commit que la
// mueve de verdad-, existe de verdad ahi, `components/` sigue sin una sola pieza de pedidos,
// el spec E2E es una lista CERRADA de uno, y quien consume el modulo lo hace solo por su
// contrato publico o por el driving por ruta exacta.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
}

function etiqueta(file: string): string {
  return toPosix(relative(repoRoot, file))
}

/** Todos los archivos bajo `dir`, recursivamente, `.gitkeep` INCLUIDOS. */
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

function sourcesIn(dir: string): readonly string[] {
  return filesIn(dir).filter((file) => /\.tsx?$/.test(file))
}

/**
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. No es cosmetico — este
 * mismo archivo escribe `prisma.recipe` y `'use server'` para explicar quien NO puede
 * escribirlos, y un barrido sobre el texto crudo leeria la ADVERTENCIA como la INFRACCION.
 */
export function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Una entrada del barrido: el nombre con el que se reporta y, cuando hace falta, su fuente. */
export type Entrada = { readonly nombre: string; readonly fuente: string }

function entradasDe(files: readonly string[]): readonly Entrada[] {
  return files.map((file) => ({ nombre: etiqueta(file), fuente: readFileSync(file, 'utf8') }))
}

// ---------------------------------------------------------------------------------------
// Los predicados. Puros: de una lista de entradas a los nombres que INFRINGEN la regla.
// ---------------------------------------------------------------------------------------

/**
 * La pantalla de OTRO modulo (`asignaciones`), no de `pedidos`, aunque varios de sus archivos
 * lleven "orders" en el nombre por hablar de pedidos asignados. Tiene su propio contrato de ruta,
 * y su limite de alcance no es responsabilidad de este archivo. Se excluye por PREFIJO DE CARPETA:
 * cualquier pieza de `pedidos` fuera de su carpeta y fuera de esta sigue cayendo igual que antes.
 */
const CARPETA_ASIGNACION = 'app/(private)/asignacion/'

/** Coincide con `/pedidos|orders/i` por el nombre, pero ejercita la pantalla de `asignaciones`.
 *  Nombrado, y no un patron: un spec de pedidos nuevo sigue cayendo. */
const SPECS_E2E_AJENOS_QUE_COINCIDEN_POR_NOMBRE = new Set(['e2e/pedidos-asignados.spec.ts'])

/**
 * El Route Handler del proceso diario que caduca la reserva de los pedidos: un cron interno,
 * no una Server Action -no hay sesion que abrir, la puerta es un secreto- y no la pantalla de
 * pedidos. Exclusion NOMBRADA, igual que `CARPETA_ASIGNACION`: cualquier otra ruta HTTP de
 * pedidos sigue cayendo.
 */
const RUTA_CRON_CADUCIDAD = 'app/api/cron/caducar-pedidos/route.ts'

/**
 * R57, INVERTIDO por QC-35: la pantalla de pedidos vive en `carpetaDeLaPantalla` -derivada de
 * `ORDERS_ROUTE`- y en NINGUN otro sitio de `app/` ni de `components/`.
 *
 * `components/` sigue prohibido del todo, sin aflojar: nunca empieza por la carpeta de la
 * pantalla, asi que un `components/orders/order-form.tsx` de manana cae igual que antes. Ahi
 * no hay ruta ni ficha que respalde nada.
 */
export function pantallasDePedidosFueraDeSuCarpeta(
  rutas: readonly string[],
  carpetaDeLaPantalla: string,
): readonly string[] {
  return rutas.filter(
    (ruta) =>
      /^(app|components)\/.*\b(pedidos|orders)\b/i.test(ruta) &&
      !ruta.startsWith(`${carpetaDeLaPantalla}/`) &&
      !ruta.startsWith(CARPETA_ASIGNACION) &&
      ruta !== RUTA_CRON_CADUCIDAD,
  )
}

/** Ningun route handler —`app/**\/route.ts`— de esta feature, salvo el cron nombrado
 *  en `RUTA_CRON_CADUCIDAD`. Las mutaciones van como Server Actions y los webhooks no son de
 *  esta ficha; el proceso diario tampoco es una mutacion de usuario y no tiene sesion que
 *  abrir, asi que va como Route Handler (`docs/architecture.md > Server Actions vs Route
 *  Handlers`). */
export function routeHandlersDePedidos(rutas: readonly string[]): readonly string[] {
  return rutas.filter(
    (ruta) =>
      /^app\/.*\/route\.tsx?$/.test(ruta) && /pedidos|orders/i.test(ruta) && ruta !== RUTA_CRON_CADUCIDAD,
  )
}

/** R57: los specs E2E de pedidos que hay. QC-35 trajo el suyo; la lista se afirma CERRADA. */
export function specsE2eDePedidos(rutas: readonly string[]): readonly string[] {
  return rutas.filter(
    (ruta) =>
      /^e2e\/.*\.spec\.tsx?$/.test(ruta) &&
      /pedidos|orders/i.test(ruta) &&
      !SPECS_E2E_AJENOS_QUE_COINCIDEN_POR_NOMBRE.has(ruta),
  )
}

/**
 * R57, INVERTIDO por QC-35: quien consume el modulo desde `app/` o `components/` tiene que
 * estar DENTRO de la carpeta de la pantalla. Fuera de ella sigue sin conocerlo nadie.
 */
export function consumidoresDeUiFueraDeSuCarpeta(
  entradas: readonly Entrada[],
  carpetaDeLaPantalla: string,
): readonly string[] {
  return entradas
    .filter((entrada) => /@\/lib\/modules\/pedidos/.test(soloCodigo(entrada.fuente)))
    .filter((entrada) => !entrada.nombre.startsWith(`${carpetaDeLaPantalla}/`))
    // Segunda pantalla legitima que consume el contrato publico de `pedidos`, no una fuga por
    // goteo de la pantalla de `pedidos` (ver `CARPETA_ASIGNACION` arriba).
    .filter((entrada) => !entrada.nombre.startsWith(CARPETA_ASIGNACION))
    // El Route Handler del cron consume el driving de `pedidos` por su ruta exacta, no la
    // pantalla (ver `RUTA_CRON_CADUCIDAD` arriba).
    .filter((entrada) => entrada.nombre !== RUTA_CRON_CADUCIDAD)
    .map((entrada) => entrada.nombre)
}

/**
 * Y por dentro de esa carpeta, el modulo se toca SOLO por su contrato publico o por sus
 * adaptadores driving por RUTA EXACTA -que es lo que manda `docs/architecture.md` y lo que el
 * propio `lib/modules/pedidos/index.ts` deja escrito-. Nunca `domain/`, `ports/` ni
 * `adapters/driven/`: eso seria consumir el modulo por dentro.
 */
export function consumosPorDentroDelModulo(entradas: readonly Entrada[]): readonly string[] {
  const hallazgos: string[] = []
  for (const entrada of entradas) {
    for (const match of soloCodigo(entrada.fuente).matchAll(/\bfrom\s+'([^']+)'/g)) {
      const spec = match[1] as string
      if (!spec.startsWith('@/lib/modules/pedidos')) continue
      if (spec === '@/lib/modules/pedidos') continue
      if (spec.startsWith('@/lib/modules/pedidos/adapters/driving/')) continue
      hallazgos.push(`${entrada.nombre}: ${spec}`)
    }
  }
  return hallazgos
}

/**
 * R37: la aritmetica de paginacion NO se reimplementa dentro de `pedidos`. Lo que se busca es
 * el CALCULO —el offset, el techo de paginas, el defecto y el tope—, no la palabra «pagina»:
 * `pedidos` habla de paginas todo el rato y eso es legitimo. Quien hace la cuenta es
 * `lib/shared/pagination.ts`, y lo llama el adaptador driven (el dominio no puede importarlo).
 */
export function reimplementanPaginacion(entradas: readonly Entrada[]): readonly string[] {
  const CUENTAS = [
    /\(\s*page\s*-\s*1\s*\)\s*\*/, //            offset = (page - 1) * size
    /Math\s*\.\s*ceil\s*\(\s*total\s*\//, //     totalPages = ceil(total / size)
    /Math\s*\.\s*min\s*\([^)]*\b25\b/, //        el tope de 25, acotado a mano
    /\?\?\s*10\b/, //                            el defecto de 10, puesto a mano
    /\b(DEFAULT|MAX)_PAGE_SIZE\s*=/, //          una segunda declaracion de las constantes
  ]
  return entradas
    .filter((entrada) => {
      const codigo = soloCodigo(entrada.fuente)
      return CUENTAS.some((cuenta) => cuenta.test(codigo))
    })
    .map((entrada) => entrada.nombre)
}

/** R52: ningun `.gitkeep` en una carpeta que ya tenga archivos reales. El `.gitkeep` existe
 *  para que git versione una carpeta VACIA; con un archivo dentro solo es basura. */
export function gitkeepsSobrantes(rutas: readonly string[]): readonly string[] {
  const carpetasConCodigo = new Set(
    rutas.filter((ruta) => !ruta.endsWith('/.gitkeep')).map((ruta) => ruta.replace(/\/[^/]+$/, '')),
  )
  return rutas.filter(
    (ruta) => ruta.endsWith('/.gitkeep') && carpetasConCodigo.has(ruta.replace(/\/\.gitkeep$/, '')),
  )
}

/** R52: el contrato publico no arrastra servidor ni reexporta fuera de `./domain`. */
export function infraccionesDelContrato(fuente: string): readonly string[] {
  const codigo = soloCodigo(fuente)
  const hallazgos: string[] = []
  if (/['"]use server['"]/.test(codigo)) hallazgos.push("'use server'")
  if (/@prisma\/client/.test(codigo)) hallazgos.push('@prisma/client')
  if (/from\s+'next(\/|')/.test(codigo)) hallazgos.push('next/*')
  for (const match of codigo.matchAll(/\bfrom\s+'([^']+)'/g)) {
    const spec = match[1] as string
    if (!spec.startsWith('./domain')) hallazgos.push(spec)
  }
  return hallazgos
}

/** Los metodos con los que Prisma consulta una tabla (lista cerrada, copiada de
 *  `module-contract.test.ts` de QC-33: es lo que distingue `db.recipe.findMany(...)` de
 *  `algo.recipe.name`, que seria un campo de un objeto del dominio). */
const METODOS_DE_PRISMA =
  'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy'

/** R53: ¿este fuente CONSULTA el modelo indicado con el cliente Prisma? */
export function consultaModelo(texto: string, modelo: string): boolean {
  const codigo = soloCodigo(texto)
  const clienteCompartido = new RegExp(`\\bprisma\\s*\\.\\s*${modelo}(?![A-Za-z0-9_])`)
  const delegadoSobreOtroReceptor = new RegExp(
    `[A-Za-z0-9_$]\\s*\\.\\s*${modelo}\\s*\\.\\s*(?:${METODOS_DE_PRISMA})\\s*[(<]`,
  )
  return clienteCompartido.test(codigo) || delegadoSobreOtroReceptor.test(codigo)
}

export function consultanModelo(
  entradas: readonly Entrada[],
  modelo: string,
): readonly string[] {
  return entradas.filter((entrada) => consultaModelo(entrada.fuente, modelo)).map((e) => e.nombre)
}

/** R53: ningun import PROFUNDO hacia otro modulo. De otro modulo se importa SOLO su contrato. */
export function importsProfundos(entradas: readonly Entrada[]): readonly string[] {
  const PROFUNDO = /^@\/lib\/modules\/(?!pedidos\b)[a-z-]+\/./
  const hallazgos: string[] = []
  for (const entrada of entradas) {
    for (const match of soloCodigo(entrada.fuente).matchAll(/\bfrom\s+'([^']+)'/g)) {
      const spec = match[1] as string
      if (PROFUNDO.test(spec)) hallazgos.push(`${entrada.nombre}: ${spec}`)
    }
  }
  return hallazgos
}

/**
 * R58: `pedidos` no incorpora ninguna dependencia de terceros nueva. La guardia
 * `guard-dependencias-aprobadas` vigila `package.json` contra `docs/dependencias.md`; aqui se
 * vigila lo que el MODULO importa, que es donde nace una dependencia nueva. La lista es
 * CERRADA: `zod` (borde) y `@prisma/client` (solo el adaptador driven, y ya esta aprobado).
 */
export function importsExternosNoAprobados(entradas: readonly Entrada[]): readonly string[] {
  const APROBADOS = new Set(['zod', '@prisma/client'])
  const hallazgos: string[] = []
  for (const entrada of entradas) {
    for (const match of soloCodigo(entrada.fuente).matchAll(/\bfrom\s+'([^']+)'/g)) {
      const spec = match[1] as string
      if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('node:')) continue
      const paquete = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      if (!APROBADOS.has(paquete as string)) hallazgos.push(`${entrada.nombre}: ${spec}`)
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------------------
// El arbol real.
// ---------------------------------------------------------------------------------------

const rutasDeUi = [
  ...sourcesIn(join(repoRoot, 'app')),
  ...sourcesIn(join(repoRoot, 'components')),
].map(etiqueta)
const rutasE2e = filesIn(join(repoRoot, 'e2e')).map(etiqueta)
const rutasDePedidos = filesIn(pedidosDir).map(etiqueta)
const entradasDeUi = entradasDe([
  ...sourcesIn(join(repoRoot, 'app')),
  ...sourcesIn(join(repoRoot, 'components')),
])
const entradasDePedidos = entradasDe(sourcesIn(pedidosDir))
const barrel = join(pedidosDir, 'index.ts')

/**
 * La carpeta de la pantalla, DERIVADA de `ORDERS_ROUTE` y nunca de un literal escrito a mano:
 * asi un cambio de ruta arrastra esta prueba con el mismo commit que la mueve de verdad. El
 * route group `(private)` no aparece en la URL, pero si en el disco.
 */
const carpetaDeLaPantalla = join(
  repoRoot,
  'app',
  '(private)',
  ...ORDERS_ROUTE.split('/').filter((segmento) => segmento.length > 0),
)
const carpetaDeLaPantallaRel = etiqueta(carpetaDeLaPantalla)

describe('QC-34 — limite de alcance de la feature', () => {
  it('la pantalla de pedidos vive donde la declara QC-35, y en ningun otro sitio (R57)', () => {
    // CENTINELA INVERTIDO el 2026-09-07 (QC-35): la pantalla estaba DIFERIDA a esta ficha y ya
    // existe. Lo que se sigue vigilando es que no aparezca por goteo, repartida por el arbol.
    expect(rutasDeUi.length).toBeGreaterThan(0)

    // La pantalla EXISTE donde la declara su constante de ruta. Sin esto, el resto del caso
    // pasaria en verde sobre un repositorio sin pantalla de pedidos: el falso verde que la
    // inversion tiene que evitar.
    expect(
      existsSync(join(carpetaDeLaPantalla, 'page.tsx')),
      `falta ${carpetaDeLaPantallaRel}/page.tsx`,
    ).toBe(true)

    // Y no hay ni una pieza de pedidos fuera de ella.
    expect(pantallasDePedidosFueraDeSuCarpeta(rutasDeUi, carpetaDeLaPantallaRel)).toEqual([])

    // La MISMA funcion, sobre las MISMAS rutas reales mas una sintetica, la señala. Una
    // segunda pantalla en otra ruta, y un componente suelto bajo `components/`, que sigue
    // prohibido del todo.
    expect(
      pantallasDePedidosFueraDeSuCarpeta(
        [...rutasDeUi, 'app/(private)/dashboard/pedidos-resumen.tsx'],
        carpetaDeLaPantallaRel,
      ),
    ).toEqual(['app/(private)/dashboard/pedidos-resumen.tsx'])
    expect(
      pantallasDePedidosFueraDeSuCarpeta(
        [...rutasDeUi, 'components/orders/order-form.tsx'],
        carpetaDeLaPantallaRel,
      ),
    ).toEqual(['components/orders/order-form.tsx'])

    // Las dos carpetas de API siguen sin poder existir: las mutaciones son Server Actions.
    for (const ruta of [join(repoRoot, 'app', 'api', 'orders'), join(repoRoot, 'app', 'api', 'pedidos')]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false)
    }
  })

  it('no hay ningun route handler de pedidos: las mutaciones van como Server Actions (R54, R57)', () => {
    // `docs/architecture.md > Server Actions vs Route Handlers`: los webhooks y las APIs
    // publicas van como route handler; esto no es ni lo uno ni lo otro.
    expect(routeHandlersDePedidos(rutasDeUi)).toEqual([])
    expect(routeHandlersDePedidos([...rutasDeUi, 'app/api/orders/route.ts'])).toEqual([
      'app/api/orders/route.ts',
    ])
    expect(routeHandlersDePedidos([...rutasDeUi, 'app/api/pedidos/[id]/route.ts'])).toEqual([
      'app/api/pedidos/[id]/route.ts',
    ])
  })

  it('los specs E2E de pedidos son estos SEIS -QC-35, QC-102, QC-60, QC-145, QC-122 y QC-151-, y la lista sigue cerrada (R57)', () => {
    // CENTINELA INVERTIDO el 2026-09-07 (QC-35). El E2E estaba diferido a esa ficha y el
    // humano lo aprobo el 2026-09-06 (R48, R49). La lista es CERRADA: un spec de pedidos sin
    // ficha que lo respalde vuelve a poner esto en rojo.
    //
    // AMPLIADA el 2026-09-13 (QC-102, responsables-en-la-pantalla-de-pedidos, T16, R37): entra la
    // SEGUNDA entrada, el spec e2e/pedidos-responsables.spec.ts. Su recorrido abre un pedido, marca a una
    // persona, aplica un grupo, saca a alguien y vuelve al LISTADO a comprobar los avatares de la
    // fila y el nombre del GRUPO CONGELADO. No sustituye al de QC-35 -que recorre el alta y la
    // edicion del pedido- porque lo que ejercita es otra cosa: los responsables. La lista se AMPLIA
    // y se TENSA -el ancla pasa de una entrada a dos-, nunca se afloja: sigue CERRADA y un TERCER
    // spec de pedidos sin ficha que lo respalde vuelve a ponerla en rojo.
    //
    // AMPLIADA el 2026-09-16 (QC-60, aislamiento-por-empresa-en-pedidos, T17, R31): entra la
    // TERCERA entrada, el spec e2e/aislamiento-pedidos.spec.ts. Con sesion en la empresa A comprueba
    // que la lista no trae pedidos de B, que borrar un pedido de B conociendo su identificador se
    // rechaza como inexistente y lo deja intacto, y que el alta de A numera en su propia serie
    // (R19, R20, R21, R11). No sustituye al de QC-35 -alta y edicion del pedido- ni al de QC-102
    // -responsables- porque lo que ejercita es otra cosa: la frontera entre empresas. La lista se
    // AMPLIA y se TENSA -el ancla pasa de dos entradas a tres-, nunca se afloja: sigue CERRADA y un
    // CUARTO spec de pedidos sin ficha que lo respalde vuelve a ponerla en rojo. El orden es el de
    // `filesIn` (orden alfabetico de ruta), no el de llegada.
    //
    // AMPLIADA el 2026-09-23: entra la CUARTA entrada,
    // el spec e2e/pedidos-terminados.spec.ts. Con los tres roles reales del seed comprueba las
    // pestañas de la nueva pantalla de asignacion y que el panel de edicion de pedidos ya no
    // ofrece ningun control de estado. No sustituye a ninguno de los otros tres porque lo que
    // ejercita es otra cosa: la vista de terminados y la retirada del estado del formulario. La
    // lista se AMPLIA y se TENSA -el ancla pasa de tres entradas a cuatro-, nunca se afloja: sigue
    // CERRADA y un QUINTO spec de pedidos sin ficha que lo respalde vuelve a ponerla en rojo.
    //
    // AMPLIADA el 2026-09-23 (QC-122, busqueda-y-total-en-la-pantalla-de-pedidos, R25/R9/R26/R27):
    // entra la QUINTA entrada, el spec e2e/pedidos-busqueda.spec.ts. Escribe un termino en la caja
    // de busqueda de la pantalla y comprueba que la lista se recorta a lo que devuelve la
    // consulta y que la URL lleva `q`; que un termino sin coincidencias muestra el estado propio
    // dentro de la tabla y que limpiar devuelve todo; y que el termino sobrevive a cambiar de
    // pagina, al panel lateral, a recargar y a «Atras» -incluso entre dos terminos distintos-. No
    // sustituye a ninguno de los cuatro anteriores -alta y edicion, responsables, aislamiento por
    // empresa, terminados- porque lo que ejercita es otra cosa: la busqueda. La lista se AMPLIA y
    // se TENSA -el ancla pasa de cuatro entradas a cinco-, nunca se afloja: sigue CERRADA y un
    // SEXTO spec de pedidos sin ficha que lo respalde vuelve a ponerla en rojo.
    //
    // AMPLIADA el 2026-09-23 (QC-151, cotizacion-del-coste-en-el-pedido, R11): entra la SEXTA
    // entrada, el spec e2e/pedidos-cotizacion.spec.ts. Abre el alta, escoge una receta y comprueba
    // que el bloque de coste cotiza con cada cantidad -incluido el guion cuando la existencia no
    // alcanza-, que guarda el mismo importe que queda en `orders.ingredients_cost` y que la edicion
    // lo reabre sin teclear nada. No sustituye a ninguno de los cinco anteriores -alta y edicion,
    // responsables, aislamiento por empresa, terminados, busqueda- porque lo que ejercita es otra
    // cosa: la cotizacion del coste. La lista se AMPLIA y se TENSA -el ancla pasa de cinco entradas
    // a seis-, nunca se afloja: sigue CERRADA y un SEPTIMO spec de pedidos sin ficha que lo
    // respalde vuelve a ponerla en rojo.
    expect(rutasE2e.length).toBeGreaterThan(0)
    expect(specsE2eDePedidos(rutasE2e)).toEqual([
      'e2e/aislamiento-pedidos.spec.ts',
      'e2e/pedidos-busqueda.spec.ts',
      'e2e/pedidos-cotizacion.spec.ts',
      'e2e/pedidos-responsables.spec.ts',
      'e2e/pedidos-terminados.spec.ts',
      'e2e/pedidos.spec.ts',
    ])
    expect(specsE2eDePedidos([...rutasE2e, 'e2e/orders-extra.spec.ts'])).toEqual([
      'e2e/aislamiento-pedidos.spec.ts',
      'e2e/pedidos-busqueda.spec.ts',
      'e2e/pedidos-cotizacion.spec.ts',
      'e2e/pedidos-responsables.spec.ts',
      'e2e/pedidos-terminados.spec.ts',
      'e2e/pedidos.spec.ts',
      'e2e/orders-extra.spec.ts',
    ])
  })

  it('solo la pantalla de pedidos importa el modulo, y solo por su contrato (R57)', () => {
    // CENTINELA INVERTIDO el 2026-09-07 (QC-35): la pantalla ya existe y es su consumidor.
    // Fuera de su carpeta sigue sin conocerlo nadie, y por dentro solo se toca el contrato
    // publico o el driving por ruta exacta.
    expect(entradasDeUi.length).toBeGreaterThan(0)
    expect(consumidoresDeUiFueraDeSuCarpeta(entradasDeUi, carpetaDeLaPantallaRel)).toEqual([])
    expect(consumosPorDentroDelModulo(entradasDeUi)).toEqual([])

    // La pantalla lo consume DE VERDAD: sin esto, las dos listas vacias lo serian por vacuidad.
    expect(
      entradasDeUi.filter((entrada) => /@\/lib\/modules\/pedidos/.test(soloCodigo(entrada.fuente)))
        .length,
    ).toBeGreaterThan(0)

    // Un consumidor fuera de la carpeta de la pantalla lo señala.
    expect(
      consumidoresDeUiFueraDeSuCarpeta(
        [
          ...entradasDeUi,
          { nombre: '<sintetico>', fuente: "import { x } from '@/lib/modules/pedidos'" },
        ],
        carpetaDeLaPantallaRel,
      ),
    ).toEqual(['<sintetico>'])

    // Y consumir el modulo POR DENTRO tambien, aunque sea desde la propia pantalla.
    expect(
      consumosPorDentroDelModulo([
        {
          nombre: '<profundo>',
          fuente: "import { x } from '@/lib/modules/pedidos/domain/order-view'",
        },
      ]),
    ).toEqual(['<profundo>: @/lib/modules/pedidos/domain/order-view'])
    // El contrato publico y el driving por ruta exacta NO son infraccion: es como se consume.
    expect(
      consumosPorDentroDelModulo([
        { nombre: '<barrel>', fuente: "import { x } from '@/lib/modules/pedidos'" },
        {
          nombre: '<driving>',
          fuente: "import { y } from '@/lib/modules/pedidos/adapters/driving/order-actions'",
        },
      ]),
    ).toEqual([])

    // Y el mismo import DENTRO de un comentario no cuenta: se vigila el codigo, no la prosa.
    expect(
      consumidoresDeUiFueraDeSuCarpeta(
        [
          ...entradasDeUi,
          { nombre: '<comentario>', fuente: '// la pantalla de @/lib/modules/pedidos es QC-35' },
        ],
        carpetaDeLaPantallaRel,
      ),
    ).toEqual([])
  })

  it('pedidos no reimplementa la aritmetica de paginacion (R37)', () => {
    // El defecto de 10 y el tope de 25 ya tienen su test en `tests/unit/pagination.test.ts`;
    // duplicar el calculo aqui seria justo el error que ese util existe para evitar.
    expect(entradasDePedidos.length).toBeGreaterThan(0)
    expect(reimplementanPaginacion(entradasDePedidos)).toEqual([])

    for (const [nombre, fuente] of [
      ['<offset>', 'const offset = (page - 1) * pageSize'],
      ['<techo>', 'const totalPages = Math.ceil(total / pageSize)'],
      ['<tope>', 'const limit = Math.min(pageSize, 25)'],
      ['<defecto>', 'const size = pageSize ?? 10'],
      ['<constante>', 'export const MAX_PAGE_SIZE = 25'],
    ] as const) {
      expect(reimplementanPaginacion([...entradasDePedidos, { nombre, fuente }])).toEqual([nombre])
    }
  })

  it('no queda ningun .gitkeep en una carpeta que ya tenga archivos reales (R52)', () => {
    expect(rutasDePedidos.length).toBeGreaterThan(0)
    expect(gitkeepsSobrantes(rutasDePedidos)).toEqual([])

    // `ports/` ya tiene su puerto: si el `.gitkeep` siguiera ahi, esto lo señalaria.
    expect(rutasDePedidos).toContain('lib/modules/pedidos/ports/order-repository.ts')
    expect(rutasDePedidos).not.toContain('lib/modules/pedidos/ports/.gitkeep')
    expect(gitkeepsSobrantes([...rutasDePedidos, 'lib/modules/pedidos/ports/.gitkeep'])).toEqual([
      'lib/modules/pedidos/ports/.gitkeep',
    ])
    // Y un `.gitkeep` en una carpeta que sigue vacia NO es una infraccion: es su motivo.
    expect(gitkeepsSobrantes(['lib/modules/pedidos/adapters/driven/.gitkeep'])).toEqual([])
  })

  it("el contrato del modulo no lleva 'use server' ni reexporta nada que no sea ./domain (R52)", () => {
    // Un componente de cliente tiene que poder importar `@/lib/modules/pedidos` sin arrastrar
    // servidor. Los adaptadores driving de esta ficha NO pasan por aqui.
    expect(existsSync(barrel)).toBe(true)
    expect(infraccionesDelContrato(readFileSync(barrel, 'utf8'))).toEqual([])

    expect(infraccionesDelContrato("'use server'\nexport {}")).toContain("'use server'")
    expect(
      infraccionesDelContrato("export { createOrder } from './adapters/driving/order-actions'"),
    ).toContain('./adapters/driving/order-actions')
    expect(infraccionesDelContrato("export type { Prisma } from '@prisma/client'")).toContain(
      '@prisma/client',
    )
    expect(infraccionesDelContrato("export { x } from './ports/order-repository'")).toContain(
      './ports/order-repository',
    )
  })

  it('pedidos no consulta prisma.recipe, prisma.unit ni prisma.user (R53)', () => {
    // Todo lo que `pedidos` sabe de una receta o de una unidad llega por su contrato publico
    // (QC-33 R32): `recetas` es el unico que puede consultar `prisma.recipe`.
    for (const modelo of ['recipe', 'unit', 'user']) {
      expect(consultanModelo(entradasDePedidos, modelo), `prisma.${modelo}`).toEqual([])
      expect(
        consultanModelo(
          [...entradasDePedidos, { nombre: `<${modelo}>`, fuente: `await db.${modelo}.findMany({})` }],
          modelo,
        ),
      ).toEqual([`<${modelo}>`])
    }
    // El predicado distingue codigo de comentario y no confunde un campo del dominio con un
    // delegado de Prisma.
    expect(consultaModelo('// pedidos no puede llamar a prisma.recipe', 'recipe')).toBe(false)
    expect(consultaModelo('const n = fila.recipe.name', 'recipe')).toBe(false)
    expect(consultaModelo('await prisma.recipeLine.findMany({})', 'recipe')).toBe(false)
    expect(consultaModelo('await prisma.recipe.findMany({})', 'recipe')).toBe(true)
  })

  it('pedidos importa los demas modulos SOLO por su contrato, nunca por ruta profunda (R53)', () => {
    expect(importsProfundos(entradasDePedidos)).toEqual([])
    expect(
      importsProfundos([
        ...entradasDePedidos,
        { nombre: '<profundo>', fuente: "import { x } from '@/lib/modules/recetas/domain/recipe'" },
      ]),
    ).toEqual(["<profundo>: @/lib/modules/recetas/domain/recipe"])
    // Una ruta profunda al PROPIO modulo no es una infraccion: es su casa.
    expect(
      importsProfundos([
        { nombre: '<propio>', fuente: "import { x } from '@/lib/modules/pedidos/domain/errors'" },
      ]),
    ).toEqual([])
  })

  it('pedidos no incorpora ninguna dependencia de terceros nueva (R58)', () => {
    // Ninguna se instala sin aprobacion humana y sin su fila en `docs/dependencias.md` (regla 7
    // de `CLAUDE.md`). Si el diseño creyera necesitar una, el `backend_dev` PARA y la propone.
    expect(importsExternosNoAprobados(entradasDePedidos)).toEqual([])
    expect(
      importsExternosNoAprobados([
        ...entradasDePedidos,
        { nombre: '<decimal>', fuente: "import Decimal from 'decimal.js'" },
      ]),
    ).toEqual(["<decimal>: decimal.js"])
    expect(
      importsExternosNoAprobados([
        { nombre: '<fechas>', fuente: "import { addDays } from 'date-fns/addDays'" },
      ]),
    ).toEqual(["<fechas>: date-fns/addDays"])
    // `zod` si esta aprobado y `pedidos` lo usa de verdad: sin esto, la lista vacia lo seria
    // por no haber ningun import externo que mirar.
    expect(
      entradasDePedidos.filter((entrada) => /from 'zod'/.test(entrada.fuente)).length,
    ).toBeGreaterThan(0)
  })
})
