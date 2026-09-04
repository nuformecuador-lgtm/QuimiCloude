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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
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

/** R57: ninguna pagina, layout, componente ni ruta de PEDIDOS bajo `app/` o `components/`. */
export function pantallasDePedidos(rutas: readonly string[]): readonly string[] {
  return rutas.filter((ruta) => /^(app|components)\/.*\b(pedidos|orders)\b/i.test(ruta))
}

/** R54, R57: ningun route handler —`app/**\/route.ts`— de esta feature. Las mutaciones van
 *  como Server Actions y los webhooks no son de esta ficha. */
export function routeHandlersDePedidos(rutas: readonly string[]): readonly string[] {
  return rutas.filter((ruta) => /^app\/.*\/route\.tsx?$/.test(ruta) && /pedidos|orders/i.test(ruta))
}

/** R57: ningun spec E2E nuevo. El diferimiento esta declarado en el spec, no al final. */
export function specsE2eDePedidos(rutas: readonly string[]): readonly string[] {
  return rutas.filter((ruta) => /^e2e\/.*\.spec\.tsx?$/.test(ruta) && /pedidos|orders/i.test(ruta))
}

/** R57: nadie de `app/` ni de `components/` conoce todavia el modulo. */
export function consumidoresDeUi(entradas: readonly Entrada[]): readonly string[] {
  return entradas
    .filter((entrada) => /@\/lib\/modules\/pedidos/.test(soloCodigo(entrada.fuente)))
    .map((entrada) => entrada.nombre)
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

describe('QC-34 — limite de alcance de la feature', () => {
  it('no hay ninguna pagina, componente ni ruta de pedidos bajo app/ o components/ (R57)', () => {
    // La pantalla es QC-35. Esta ficha no aporta ningun flujo navegable, y por eso su
    // verificacion es unitaria y de integracion (decision cerrada 24).
    expect(rutasDeUi.length).toBeGreaterThan(0)
    expect(pantallasDePedidos(rutasDeUi)).toEqual([])

    // La MISMA funcion, sobre las MISMAS rutas reales mas una sintetica, la señala.
    expect(pantallasDePedidos([...rutasDeUi, 'app/(private)/pedidos/page.tsx'])).toEqual([
      'app/(private)/pedidos/page.tsx',
    ])
    expect(pantallasDePedidos([...rutasDeUi, 'components/orders/order-form.tsx'])).toEqual([
      'components/orders/order-form.tsx',
    ])

    // Y las cuatro carpetas que tampoco pueden existir todavia.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'orders'),
      join(repoRoot, 'app', 'api', 'pedidos'),
      join(repoRoot, 'app', '(private)', 'pedidos'),
      join(repoRoot, 'app', '(private)', 'orders'),
    ]) {
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

  it('no hay ningun spec E2E nuevo, y el diferimiento esta declarado en el spec (R57)', () => {
    expect(rutasE2e.length).toBeGreaterThan(0)
    expect(specsE2eDePedidos(rutasE2e)).toEqual([])
    expect(specsE2eDePedidos([...rutasE2e, 'e2e/pedidos.spec.ts'])).toEqual(['e2e/pedidos.spec.ts'])
  })

  it('ningun archivo de app/ ni de components/ importa el modulo pedidos (R57)', () => {
    expect(entradasDeUi.length).toBeGreaterThan(0)
    expect(consumidoresDeUi(entradasDeUi)).toEqual([])
    expect(
      consumidoresDeUi([
        ...entradasDeUi,
        { nombre: '<sintetico>', fuente: "import { pedidos } from '@/lib/modules/pedidos'" },
      ]),
    ).toEqual(['<sintetico>'])
    // Y el mismo import DENTRO de un comentario no cuenta: se vigila el codigo, no la prosa.
    expect(
      consumidoresDeUi([
        ...entradasDeUi,
        { nombre: '<comentario>', fuente: '// la pantalla de @/lib/modules/pedidos es QC-35' },
      ]),
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
