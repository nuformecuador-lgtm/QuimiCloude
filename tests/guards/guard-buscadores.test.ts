// Guardia: los buscadores asincronos componen los primitivos en UN solo sitio (R4, R7, R19-R22).
//
// Los primitivos de autocompletado y el hook de paginacion asincrona se componen solo en
// `AsyncAutocomplete`. Si un buscador vuelve a componerlos por su cuenta, vuelve la copia que esta
// ficha quito. Esta guardia recorre `app/`, `components/` y `hooks/` (solo produccion) y busca:
//
//   1. `primitivo-fuera` — un import (estatico, reexportacion o `import()`) del modulo de los
//                          primitivos, por alias `@/` o por ruta relativa que resuelva a el (R7).
//   2. `hook-fuera`      — una llamada a `useAsyncPaginatedOptions`, o un import que lo renombre
//                          (renombrarlo esconderia la llamada) (R7).
//
// Ademas, que `AsyncAutocomplete` no recorta opciones con `.filter(` (R19: la busqueda la resuelve
// el servidor).
//
// Y, por diff contra el merge-base con `origin/dev`, que la rama no toca lo que R21 prohibe, no edita
// los tests y guardias de R4 y no anade dependencias (R22). Ese caso solo corre en la rama de la
// ficha: fuera de ella hace `skip` RUIDOSO, porque un censo de diff que corre en toda rama acaba
// cazando a la ficha siguiente, no a la suya.
//
// **Las excepciones son una lista cerrada de archivos, cada una con su motivo.** Ningun patron.
//
// Analiza con el compilador de TypeScript (`typescript`, ya declarado en `devDependencies`), no con
// expresiones regulares: asi un comentario que nombra el modulo o el hook no cuenta como hallazgo.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
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

// ---------------------------------------------------------------------------------------------
// Datos: lo que se vigila y lo que se exceptua
// ---------------------------------------------------------------------------------------------

export type Regla = 'primitivo-fuera' | 'hook-fuera'

const CARPETAS = ['app', 'components', 'hooks'] as const

/** El modulo de los primitivos, sin extension, relativo a la raiz. */
const MODULO_PRIMITIVOS = 'components/ui/autocomplete'
const HOOK = 'useAsyncPaginatedOptions'

const COMPOSITOR = 'components/shared/async-autocomplete.tsx'

type Excepcion = {
  readonly archivo: string
  readonly reglas: readonly Regla[]
  readonly motivo: string
}

export const EXCEPCIONES: readonly Excepcion[] = [
  {
    archivo: COMPOSITOR,
    reglas: ['primitivo-fuera', 'hook-fuera'],
    motivo: 'es el unico compositor de los primitivos con el hook',
  },
  {
    archivo: 'components/ui/autocomplete.tsx',
    reglas: ['primitivo-fuera'],
    motivo: 'es la definicion de los primitivos, no un consumidor',
  },
  {
    archivo: 'hooks/use-async-paginated-options.ts',
    reglas: ['hook-fuera'],
    motivo: 'es la definicion del hook',
  },
]

// ---------------------------------------------------------------------------------------------
// El analizador
// ---------------------------------------------------------------------------------------------

export type Hallazgo = {
  readonly archivo: string
  readonly linea: number
  readonly regla: Regla
  readonly texto: string
}

/** Si el especificador de un import, visto desde `archivo`, apunta al modulo de los primitivos. */
export function apuntaALosPrimitivos(archivo: string, especificador: string): boolean {
  let destino: string
  if (especificador.startsWith('@/')) {
    destino = especificador.slice(2)
  } else if (especificador.startsWith('./') || especificador.startsWith('../')) {
    destino = posix.normalize(posix.join(posix.dirname(archivo), especificador))
  } else {
    return false
  }
  destino = destino.replace(/\/$/, '').replace(/\.(tsx?|jsx?)$/, '').replace(/\/index$/, '')
  return destino === MODULO_PRIMITIVOS
}

/** Analiza un archivo de produccion y devuelve sus hallazgos, sin aplicar excepciones. */
export function analizar(archivo: string, fuente: string): readonly Hallazgo[] {
  const sf = ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const hallazgos: Hallazgo[] = []
  const anotar = (n: ts.Node, regla: Regla) => {
    const linea = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const texto = n.getText(sf).split('\n')[0]?.slice(0, 120) ?? ''
    hallazgos.push({ archivo, linea, regla, texto })
  }
  const especificador = (expr: ts.Expression | undefined): string | null =>
    expr !== undefined && (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
      ? expr.text
      : null

  const visitar = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const modulo = especificador(n.moduleSpecifier)
      if (modulo !== null && apuntaALosPrimitivos(archivo, modulo)) anotar(n, 'primitivo-fuera')
    }
    if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const modulo = especificador(n.arguments[0])
        if (modulo !== null && apuntaALosPrimitivos(archivo, modulo)) anotar(n, 'primitivo-fuera')
      }
      const llamado = n.expression
      if (
        (ts.isIdentifier(llamado) && llamado.text === HOOK) ||
        (ts.isPropertyAccessExpression(llamado) && llamado.name.text === HOOK)
      ) {
        anotar(n, 'hook-fuera')
      }
    }
    if (ts.isImportSpecifier(n) && n.propertyName !== undefined && n.propertyName.text === HOOK) {
      anotar(n, 'hook-fuera')
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return hallazgos
}

/** Aplica las excepciones. Lo que devuelve son los hallazgos que cuentan. */
export function quitarExceptuados(
  hallazgos: readonly Hallazgo[],
  excepciones: readonly Excepcion[] = EXCEPCIONES,
): readonly Hallazgo[] {
  return hallazgos.filter(
    (h) => !excepciones.some((e) => e.archivo === h.archivo && e.reglas.includes(h.regla)),
  )
}

/** Las excepciones que apuntan a un archivo que ya no existe. */
export function excepcionesMuertas(
  excepciones: readonly Excepcion[],
  existe: (archivo: string) => boolean,
): readonly string[] {
  return excepciones.filter((e) => !existe(e.archivo)).map((e) => e.archivo)
}

/** Las llamadas a `.filter` (por punto o por corchete) de una fuente; los comentarios no cuentan. */
export function llamadasAFilter(archivo: string, fuente: string): readonly number[] {
  const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lineas: number[] = []
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const e = n.expression
      const esFilter =
        (ts.isPropertyAccessExpression(e) && e.name.text === 'filter') ||
        (ts.isElementAccessExpression(e) &&
          ts.isStringLiteral(e.argumentExpression) &&
          e.argumentExpression.text === 'filter')
      if (esFilter) lineas.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return lineas
}

function archivosDeProduccion(): readonly string[] {
  const salida: string[] = []
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre.startsWith('.')) continue
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) {
        recorrer(ruta)
        continue
      }
      if (!/\.tsx?$/.test(nombre) || /\.(test|spec)\.tsx?$/.test(nombre) || nombre.endsWith('.d.ts')) {
        continue
      }
      salida.push(relative(repoRoot, ruta).split('\\').join('/'))
    }
  }
  for (const carpeta of CARPETAS) {
    const dir = join(repoRoot, carpeta)
    if (existsSync(dir)) recorrer(dir)
  }
  return salida.sort()
}

function leer(archivo: string): string {
  return readFileSync(join(repoRoot, archivo), 'utf8')
}

function informe(hallazgos: readonly Hallazgo[]): string {
  return hallazgos.map((h) => `  ${h.archivo}:${h.linea} [${h.regla}] ${h.texto}`).join('\n')
}

// ---------------------------------------------------------------------------------------------
// Lo que el diff de la rama no toca (R21), no edita (R4) y no anade (R22)
// ---------------------------------------------------------------------------------------------

/** Archivos en vuelo de otra persona y el buscador de clientes, que se queda como esta (R21). */
export const NO_SE_TOCAN_R21 = [
  'app/(private)/inventario/components/batch-history.tsx',
  'app/(private)/pedidos/components/index.ts',
  'app/(private)/pedidos/components/order-columns.tsx',
  'app/(private)/pedidos/components/order-list-section.tsx',
  'app/(private)/pedidos/components/order-sheet.tsx',
  'app/(private)/pedidos/components/order-table.tsx',
  'app/(private)/pedidos/components/order-customer-picker.tsx',
] as const

const BARREL_DE_RUTA = /^app\/.*\/components\/index\.ts$/
const DIRECTORIO_PUBLICO = 'app/(public)/'

/**
 * Tests y guardias que leen los buscadores y que R4 congela. La lista de tests de los buscadores y
 * de sus pantallas sale de buscar sus nombres en `tests/`; los tests nuevos de esta rama no estan.
 */
export const NO_SE_EDITAN_R4 = [
  // AsyncAutocomplete y OrderCustomerPicker
  'tests/unit/async-autocomplete.test.tsx',
  'tests/unit/pedidos-ui/order-customer-picker.test.tsx',
  'tests/unit/pedidos-ui/order-form-customer.test.tsx',
  // Los cinco buscadores y sus pantallas
  'tests/unit/pedidos-ui/recipe-picker.test.tsx',
  'tests/unit/pedidos-ui/packaging-select.test.tsx',
  'tests/unit/pedidos-ui/order-form.test.tsx',
  'tests/unit/pedidos-ui/order-form-quote.test.tsx',
  'tests/unit/pedidos-ui/order-list-section.test.tsx',
  'tests/unit/pedidos-ui/order-row-wiring.test.tsx',
  'tests/unit/pedidos-ui/order-sheet.test.tsx',
  'tests/unit/pedidos-ui/order-sheet-coverage.test.tsx',
  'tests/unit/pedidos-ui/order-sheet-responsibles.test.tsx',
  'tests/unit/pedidos-ui/pedidos-viewport.test.tsx',
  'tests/unit/pedidos-ui/read-only.test.tsx',
  'tests/unit/paridad/order-form-image-paridad.test.tsx',
  'tests/unit/inventario/product-page.test.tsx',
  'tests/unit/inventario-ui/envase-en-inventario.test.tsx',
  'tests/unit/inventario-ui/product-form-unidad.test.tsx',
  'tests/unit/shared/presentation-select-helper.test.tsx',
  'tests/unit/shared/presentation-select-unit-filter.test.tsx',
  'tests/unit/shared-ui/error-alert.test.tsx',
  'tests/unit/recetas-ui/recipe-form.test.tsx',
  'tests/unit/recetas-ui/recipe-lines-sum.test.tsx',
  'tests/unit/recetas-ui/recipe-lines-tabs.test.tsx',
  'tests/unit/recetas-ui/recipe-lines-unavailable.test.tsx',
  'tests/unit/recetas-ui/formula-import-review.test.tsx',
  'tests/unit/documentos-ui/formulas-upload.test.tsx',
  'tests/unit/proveedores-ui/catalog-line-form.test.tsx',
  'tests/unit/proveedores-ui/catalog-line-sheet.test.tsx',
  // Guardias y contratos que leen los archivos de los buscadores
  'tests/guards/guard-identificador-de-request.test.ts',
  'tests/guards/guard-piezas-base.test.ts',
  'tests/guards/guard-pantalla-pedidos-se-amplia.test.ts',
  'tests/guards/guard-catalogo-de-errores.test.ts',
  'tests/guards/guard-teclear-y-plazo.test.ts',
  'tests/unit/proveedores-ui/guard-herencia-armazon-privado.test.ts',
  'tests/unit/recetas-ui/recipe-route-contract.test.ts',
  'tests/unit/inventario/product-route-contract.test.ts',
  'tests/unit/inventario/module-contract.test.ts',
  'tests/unit/inventario/scope.test.ts',
  'tests/unit/recetas/module-contract.test.ts',
  'tests/unit/recetas/scope.test.ts',
] as const

const SNAPSHOTS_DE_PARIDAD = 'tests/unit/paridad/__snapshots__/'
/** El snapshot de paridad propio de esta rama: se crea aqui, no es de los congelados. */
const SNAPSHOT_PROPIO = 'tests/unit/paridad/__snapshots__/buscadores-paridad.test.tsx.snap'

/** Los archivos del diff que R21 prohibe tocar. */
export function tocadosProhibidosR21(archivos: readonly string[]): readonly string[] {
  const prohibidos = new Set<string>(NO_SE_TOCAN_R21)
  return archivos.filter(
    (a) => prohibidos.has(a) || BARREL_DE_RUTA.test(a) || a.startsWith(DIRECTORIO_PUBLICO),
  )
}

/** Los archivos del diff que R4 congela. */
export function editadosProhibidosR4(archivos: readonly string[]): readonly string[] {
  const congelados = new Set<string>(NO_SE_EDITAN_R4)
  return archivos.filter(
    (a) => congelados.has(a) || (a.startsWith(SNAPSHOTS_DE_PARIDAD) && a !== SNAPSHOT_PROPIO),
  )
}

type Dependencias = Readonly<Record<string, string>>
type Manifiesto = { dependencies?: Dependencias; devDependencies?: Dependencias }

/** Las dependencias de `despues` que no estaban en `antes`, con su seccion (R22). */
export function dependenciasNuevas(antes: Manifiesto, despues: Manifiesto): readonly string[] {
  const nuevas: string[] = []
  for (const seccion of ['dependencies', 'devDependencies'] as const) {
    const previas = new Set(Object.keys(antes[seccion] ?? {}))
    for (const nombre of Object.keys(despues[seccion] ?? {})) {
      if (!previas.has(nombre)) nuevas.push(`${seccion}: ${nombre}`)
    }
  }
  return nuevas
}

const RAMA_DE_LA_FICHA = 'feature/QC-233-componentizacion-buscadores'
/** Candidatos de rama base, en orden. El worktree puede no tener remoto configurado. */
const BASES = ['origin/dev', 'dev'] as const

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function ramaActual(): string | null {
  const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return rama === null || rama.length === 0 ? null : rama
}

function mergeBaseDeLaRama(): string | null {
  for (const base of BASES) {
    const sha = git(['merge-base', base, 'HEAD'])
    if (sha !== null && sha.length > 0) return sha
  }
  return null
}

/** Archivos tocados por los commits de esta rama Y por el arbol de trabajo, desde el merge-base. */
function archivosDeLaFicha(mergeBase: string): readonly string[] {
  const salida = git(['diff', '--name-only', mergeBase])
  if (salida === null) return []
  return salida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort()
}

/** O devuelve el merge-base, o el MOTIVO por el que los casos de diff no comprueban nada. */
export function preparar(
  rama: string | null,
  mergeBase: string | null,
): { mergeBase: string } | { motivo: string } {
  if (rama === null) {
    return { motivo: 'no se pudo leer la rama actual con git: este caso NO ha comprobado nada.' }
  }
  if (rama !== RAMA_DE_LA_FICHA) {
    return {
      motivo:
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R4, R21 y R22 hablan de lo que ` +
        'hace ESTA ficha, no de lo que haga quien pase despues. Este caso NO ha comprobado nada.',
    }
  }
  if (mergeBase === null) {
    return {
      motivo: `no se pudo calcular el merge-base con ${BASES.join(' ni con ')}: este caso NO ha comprobado nada.`,
    }
  }
  return { mergeBase }
}

// ---------------------------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------------------------

const archivos = archivosDeProduccion()
const hallazgos = archivos.flatMap((a) => analizar(a, leer(a)))
const quedan = quitarExceptuados(hallazgos)
const deLaRegla = (regla: Regla) => quedan.filter((h) => h.regla === regla)

describe('los buscadores componen los primitivos en un solo sitio', () => {
  it('el recorrido ve el codigo de produccion (si no, todo pasaria en verde sin mirar)', () => {
    expect(archivos.length).toBeGreaterThan(200)
    expect(archivos).toContain(COMPOSITOR)
    expect(archivos.some((a) => a.startsWith('hooks/'))).toBe(true)
  })

  it('R7: el compositor si importa los primitivos y llama al hook (la guardia los reconoce)', () => {
    const propios = analizar(COMPOSITOR, leer(COMPOSITOR)).map((h) => h.regla)
    expect(propios).toContain('primitivo-fuera')
    expect(propios).toContain('hook-fuera')
  })

  it('R7 (primitivo-fuera): ningun archivo de app/, components/ o hooks/ importa los primitivos', () => {
    const lista = deLaRegla('primitivo-fuera')
    expect(lista, `R7: pinta el buscador con \`AsyncAutocomplete\` (${COMPOSITOR}):\n${informe(lista)}`).toEqual([])
  })

  it('R7 (hook-fuera): ningun archivo de app/, components/ o hooks/ llama a useAsyncPaginatedOptions', () => {
    const lista = deLaRegla('hook-fuera')
    expect(lista, `R7: la consulta paginada la compone \`AsyncAutocomplete\`:\n${informe(lista)}`).toEqual([])
  })

  it('R19: AsyncAutocomplete no recorta opciones con `.filter(`', () => {
    const fuente = leer(COMPOSITOR)
    expect(fuente.includes('.filter('), 'R19: la busqueda la resuelve el servidor').toBe(false)
    expect(llamadasAFilter(COMPOSITOR, fuente), 'R19: llamada a filter en el compositor').toEqual([])
  })

  it('R20: las excepciones son exactamente tres, con motivo, y apuntan a archivos que existen', () => {
    expect(EXCEPCIONES.map((e) => [e.archivo, [...e.reglas]])).toEqual([
      [COMPOSITOR, ['primitivo-fuera', 'hook-fuera']],
      ['components/ui/autocomplete.tsx', ['primitivo-fuera']],
      ['hooks/use-async-paginated-options.ts', ['hook-fuera']],
    ])
    for (const e of EXCEPCIONES) expect(e.motivo.length, `${e.archivo} sin motivo`).toBeGreaterThan(0)
    const muertas = excepcionesMuertas(EXCEPCIONES, (a) => existsSync(join(repoRoot, a)))
    expect(muertas, 'R20: excepcion muerta, el archivo ya no existe: quitala de EXCEPCIONES').toEqual([])
  })

  it('R21: el diff de esta ficha no toca QC-223, OrderCustomerPicker, barrels de ruta ni app/(public)', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const diff = archivosDeLaFicha(listo.mergeBase)
    expect(diff.length, `el rango ${listo.mergeBase}..arbol no trae ningun archivo`).toBeGreaterThan(0)
    const tocados = tocadosProhibidosR21(diff)
    expect(tocados, `R21: esta ficha no toca estos archivos:\n${tocados.join('\n')}`).toEqual([])
  })

  it('R4: el diff de esta ficha no edita los tests, guardias ni snapshots de paridad congelados', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const editados = editadosProhibidosR4(archivosDeLaFicha(listo.mergeBase))
    expect(editados, `R4: estos tests siguen afirmando lo mismo, sin editarse:\n${editados.join('\n')}`).toEqual([])
  })

  it('R22: package.json no gana dependencias respecto del merge-base', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const antes = git(['show', `${listo.mergeBase}:package.json`])
    expect(antes, `no se pudo leer package.json en ${listo.mergeBase}`).not.toBeNull()
    const nuevas = dependenciasNuevas(JSON.parse(antes ?? '{}') as Manifiesto, JSON.parse(leer('package.json')) as Manifiesto)
    expect(nuevas, `R22: dependencias nuevas sin aprobar:\n${nuevas.join('\n')}`).toEqual([])
  })
})

describe('las reglas de los buscadores MUERDEN (muestras sinteticas)', () => {
  const reglasDe = (fuente: string, archivo = 'app/(private)/x/components/muestra.tsx') =>
    quitarExceptuados(analizar(archivo, fuente)).map((h) => h.regla)

  it('R20 (primitivo-fuera): importar los primitivos por alias, relativa, reexportacion o import()', () => {
    expect(reglasDe("import { Autocomplete } from '@/components/ui/autocomplete'")).toEqual(['primitivo-fuera'])
    expect(reglasDe("import type { AutocompleteProps } from '@/components/ui/autocomplete.tsx'")).toEqual([
      'primitivo-fuera',
    ])
    expect(reglasDe("import { Autocomplete } from '../ui/autocomplete'", 'components/shared/otro.tsx')).toEqual([
      'primitivo-fuera',
    ])
    expect(reglasDe("export { Autocomplete } from '@/components/ui/autocomplete'")).toEqual(['primitivo-fuera'])
    expect(reglasDe("const m = () => import('@/components/ui/autocomplete')")).toEqual(['primitivo-fuera'])
    // No muerden: un comentario, otro modulo, o el compositor.
    expect(reglasDe("// import { Autocomplete } from '@/components/ui/autocomplete'\nexport const a = 1")).toEqual([])
    expect(reglasDe("import { AsyncAutocomplete } from '@/components/shared/async-autocomplete'")).toEqual([])
    expect(reglasDe("import { X } from '@/components/ui/autocomplete-extra'")).toEqual([])
    expect(reglasDe("import { Autocomplete } from '@/components/ui/autocomplete'", COMPOSITOR)).toEqual([])
  })

  it('R20 (hook-fuera): llamar al hook, tambien por espacio de nombres o renombrado', () => {
    expect(reglasDe('const r = useAsyncPaginatedOptions({ fetchPage })')).toEqual(['hook-fuera'])
    expect(reglasDe('const r = hooks.useAsyncPaginatedOptions({ fetchPage })')).toEqual(['hook-fuera'])
    expect(reglasDe("import { useAsyncPaginatedOptions as u } from '@/hooks/use-async-paginated-options'")).toEqual([
      'hook-fuera',
    ])
    // No muerden: un comentario, importar sus tipos, o el compositor.
    expect(reglasDe('// useAsyncPaginatedOptions({})\nexport const a = 1')).toEqual([])
    expect(reglasDe("import type { PageResult } from '@/hooks/use-async-paginated-options'")).toEqual([])
    expect(reglasDe('const r = useAsyncPaginatedOptions({ fetchPage })', COMPOSITOR)).toEqual([])
  })

  it('R20: las excepciones son estrechas por regla (la definicion del hook no puede importar los primitivos)', () => {
    const hook = 'hooks/use-async-paginated-options.ts'
    expect(reglasDe("import { Autocomplete } from '@/components/ui/autocomplete'", hook)).toEqual(['primitivo-fuera'])
    const primitivos = 'components/ui/autocomplete.tsx'
    expect(reglasDe('const r = useAsyncPaginatedOptions({})', primitivos)).toEqual(['hook-fuera'])
  })

  it('R20: una excepcion que apunta a un archivo inexistente es un hallazgo', () => {
    const conMuerta = [...EXCEPCIONES, { archivo: 'components/shared/no-existe.tsx', reglas: ['hook-fuera'], motivo: 'x' }] as const
    const existe = (a: string) => existsSync(join(repoRoot, a))
    expect(excepcionesMuertas(conMuerta, existe)).toEqual(['components/shared/no-existe.tsx'])
  })

  it('R19: el detector ve `.filter(` por punto y por corchete, pero no en un comentario', () => {
    expect(llamadasAFilter('m.tsx', 'const a = xs.filter((x) => x)')).toEqual([1])
    expect(llamadasAFilter('m.tsx', "const a = xs['filter']((x) => x)")).toEqual([1])
    expect(llamadasAFilter('m.tsx', '// xs.filter(\nconst a = 1')).toEqual([])
  })

  it('R21: el detector ve QC-223, OrderCustomerPicker, cualquier barrel de ruta y app/(public)', () => {
    const lista = [
      'app/(private)/pedidos/components/order-table.tsx',
      'app/(private)/inventario/components/batch-history.tsx',
      'app/(private)/pedidos/components/order-customer-picker.tsx',
      'app/(private)/inventario/components/index.ts',
      'app/(public)/login/page.tsx',
      'app/(private)/pedidos/components/recipe-picker.tsx',
      'components/shared/index.ts',
    ]
    expect(tocadosProhibidosR21(lista)).toEqual([
      'app/(private)/pedidos/components/order-table.tsx',
      'app/(private)/inventario/components/batch-history.tsx',
      'app/(private)/pedidos/components/order-customer-picker.tsx',
      'app/(private)/inventario/components/index.ts',
      'app/(public)/login/page.tsx',
    ])
  })

  it('R4: el detector ve los tests congelados y los snapshots de paridad ajenos, no el propio', () => {
    const lista = [
      'tests/unit/async-autocomplete.test.tsx',
      'tests/guards/guard-piezas-base.test.ts',
      'tests/unit/paridad/__snapshots__/pedidos-paridad.test.tsx.snap',
      SNAPSHOT_PROPIO,
      'tests/unit/paridad/buscadores-paridad.test.tsx',
      'tests/guards/guard-buscadores.test.ts',
    ]
    expect(editadosProhibidosR4(lista)).toEqual([
      'tests/unit/async-autocomplete.test.tsx',
      'tests/guards/guard-piezas-base.test.ts',
      'tests/unit/paridad/__snapshots__/pedidos-paridad.test.tsx.snap',
    ])
  })

  it('R4: los tests congelados existen (una lista con rutas muertas no vigilaria nada)', () => {
    const muertos = NO_SE_EDITAN_R4.filter((a) => !existsSync(join(repoRoot, a)))
    expect(muertos).toEqual([])
  })

  it('R22: el detector ve una dependencia nueva en cualquiera de las dos secciones', () => {
    const antes = { dependencies: { a: '1' }, devDependencies: { b: '1' } }
    expect(dependenciasNuevas(antes, { dependencies: { a: '2' }, devDependencies: { b: '1' } })).toEqual([])
    expect(dependenciasNuevas(antes, { dependencies: { a: '1', c: '1' }, devDependencies: { b: '1', d: '1' } })).toEqual([
      'dependencies: c',
      'devDependencies: d',
    ])
  })

  it('R4/R21/R22: la precondicion se salta RUIDOSAMENTE fuera de esta rama, y nunca en ella', () => {
    const enDev = preparar('dev', 'abc123')
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada')
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'")
    expect('motivo' in preparar(null, 'abc123')).toBe(true)
    expect((preparar(RAMA_DE_LA_FICHA, null) as { motivo: string }).motivo).toContain('merge-base')
    expect(preparar(RAMA_DE_LA_FICHA, 'abc123')).toEqual({ mergeBase: 'abc123' })
  })
})
