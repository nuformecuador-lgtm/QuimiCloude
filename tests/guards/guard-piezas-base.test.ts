// QC-231 T14 — Guardia: las piezas base no vuelven a copiarse (R6, R7, R12, R21, R25, R29, R31, R33).
//
// QC-231 saco a piezas compartidas lo que estaba copiado en muchos sitios. Esta guardia impide que
// la copia vuelva. Recorre `app/`, `components/` y `hooks/` (solo produccion) y busca seis cosas:
//
//   1. `par-en-constante`   — una constante local cuyo valor contiene el par `min-h-11 min-w-11`
//                             (R6, R7). La talla vive en `touchTarget` y en `Button`.
//   2. `par-literal`        — el par escrito como literal fuera de una constante (R7).
//   3. `compara-inesperado` — una comparacion con `UNEXPECTED_ERROR_CODE` fuera de `ErrorAlert`
//                             y `UnexpectedErrorNotice` (R12).
//   4. `local-borrado`      — un vacio, error o esqueleto local de lista que ya no debe existir (R21).
//   5. `marca-en-constante` — una constante que vale `—` (R25). La marca vive en `EMPTY_MARK`.
//   6. `simbolo-borrado`    — `createUrlPageFetcher`, las reexportaciones de `formatDateLocalISO`, las
//                             constantes `MISSING_VALUE_MARK` / `EMPTY_CELL` y las reexportaciones de
//                             `IMAGE_COLUMN_LABEL` / `ACTIONS_COLUMN_LABEL` del barrel de inventario (R31).
//
// Y, por diff contra el merge-base con `origin/dev`, que la rama de QC-231 no toca los archivos de
// R33. Ese caso solo corre en la rama de la ficha: fuera de ella hace `skip` RUIDOSO, por la misma
// leccion que cuenta `guard-qc102-limites-de-la-ficha.test.ts` (un censo de diff que corre en toda
// rama acaba cazando a la ficha siguiente, no a la suya).
//
// **Las exclusiones son una lista explicita de archivos, cada una con su motivo.** Ninguna es un
// patron amplio. La unica excepcion es `app/(public)/establecer-contrasena/`, que el spec define como
// carpeta entera (D3, R7, R12) y que esta guardia nombra por su ruta exacta.
//
// Analiza con el compilador de TypeScript (`typescript`, ya declarado en `devDependencies`), no con
// expresiones regulares: asi un comentario que cita el par o la marca no cuenta como hallazgo.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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
// Datos: lo que se vigila y lo que se excluye
// ---------------------------------------------------------------------------------------------

export type Regla =
  | 'par-en-constante'
  | 'par-literal'
  | 'compara-inesperado'
  | 'local-borrado'
  | 'marca-en-constante'
  | 'simbolo-borrado'

const TODAS: readonly Regla[] = [
  'par-en-constante',
  'par-literal',
  'compara-inesperado',
  'local-borrado',
  'marca-en-constante',
  'simbolo-borrado',
]
const TALLA: readonly Regla[] = ['par-en-constante', 'par-literal']

const CARPETAS = ['app', 'components', 'hooks'] as const

/** La marca de valor ausente (R25). */
const MARCA = '—'

/** Los 14 archivos D11 (requirements.md > Archivos D11). Son de QC-217 y QC-223; los adopta QC-232. */
export const ARCHIVOS_D11 = [
  // QC-217
  'app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx',
  'app/(private)/asignacion/components/assignment-view-tabs.tsx',
  'app/(private)/asignacion/components/conditioned-orders-list-section.tsx',
  'app/(private)/asignacion/components/conditioning-orders-columns.tsx',
  'app/(private)/asignacion/components/conditioning-orders-list-section.tsx',
  'app/(private)/asignacion/components/index.ts',
  'app/(private)/asignacion/components/order-distribution-full.tsx',
  'tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx',
  // QC-223
  'app/(private)/inventario/components/batch-history.tsx',
  'app/(private)/pedidos/components/index.ts',
  'app/(private)/pedidos/components/order-columns.tsx',
  'app/(private)/pedidos/components/order-list-section.tsx',
  'app/(private)/pedidos/components/order-sheet.tsx',
  'app/(private)/pedidos/components/order-table.tsx',
] as const

/** Los vacios y esqueletos de las 5 listas de asignacion: van en QC-232 (D7). */
export const VACIOS_Y_ESQUELETOS_D7 = [
  'app/(private)/asignacion/components/assigned-orders-empty.tsx',
  'app/(private)/asignacion/components/assigned-orders-skeleton.tsx',
  'app/(private)/asignacion/components/company-orders-empty.tsx',
  'app/(private)/asignacion/components/company-orders-skeleton.tsx',
  'app/(private)/asignacion/components/conditioning-orders-empty.tsx',
  'app/(private)/asignacion/components/conditioning-orders-skeleton.tsx',
  'app/(private)/asignacion/components/finished-orders-empty.tsx',
  'app/(private)/asignacion/components/finished-orders-skeleton.tsx',
  'app/(private)/asignacion/components/packing-orders-skeleton.tsx',
] as const

/** La credencial sale de QC-231 (D3): solo `components/submit-button.tsx` se toca (D12). */
const DIRECTORIO_CREDENCIAL = 'app/(public)/establecer-contrasena/'
const SUBMIT_BUTTON_D12 = 'app/(public)/establecer-contrasena/[token]/components/submit-button.tsx'
const COMPONENTES_CREDENCIAL = [
  'components/shared/credential-field.tsx',
  'components/shared/credential-requirements.tsx',
] as const

/**
 * Carpeta del asistente de lectura, compuesta por trozos a proposito: el contrato QC-64 R12 de
 * `recipe-route-contract.test.ts` busca la ruta literal en `tests/` para censar quien importa el
 * asistente, y esta guardia solo la nombra como exclusion, no la importa. El valor es identico.
 */
const CARPETA_ASISTENTE = ['components', 'shared', 'step-reader'].join('/')

type Exclusion = {
  readonly archivo: string
  readonly reglas: readonly Regla[]
  /** Si se da, solo excluye los hallazgos de ese simbolo. */
  readonly simbolo?: string
  /** Si se da, excluye como mucho ese numero de hallazgos; el resto cuenta. */
  readonly hasta?: number
  readonly motivo: string
}

export const EXCLUSIONES: readonly Exclusion[] = [
  ...ARCHIVOS_D11.map(
    (archivo): Exclusion => ({
      archivo,
      reglas: TODAS,
      motivo: 'D11: choque de archivos con QC-217/QC-223; la adopcion de piezas es de QC-232',
    }),
  ),
  ...VACIOS_Y_ESQUELETOS_D7.map(
    (archivo): Exclusion => ({
      archivo,
      reglas: TALLA,
      motivo: 'D7: los vacios y esqueletos de las 5 listas de asignacion van en QC-232',
    }),
  ),
  {
    archivo: 'app/(private)/asignacion/components/packing-orders-list-section.tsx',
    reglas: ['par-literal'],
    hasta: 1,
    motivo:
      'D7: el vacio en linea de la lista de acondicionado (enlace `packing-orders-first-page`) ' +
      'va en QC-232. Solo ese literal: un segundo par en el archivo cuenta',
  },
  {
    archivo: `${CARPETA_ASISTENTE}/step-document-view.tsx`,
    reglas: ['par-en-constante'],
    simbolo: 'TOUCH_TARGET',
    motivo:
      'decision del humano (2026-10-08): sale de QC-231 y va en QC-232, sin enmendar la lista ' +
      'cerrada R18 de order-execution-screen.test.tsx',
  },
  {
    archivo: 'app/(private)/configuracion/usuarios/components/work-group-columns.tsx',
    reglas: ['par-en-constante'],
    simbolo: 'TOUCH_TARGET',
    motivo: 'D13: `WorkGroupRowActions` no se toca; se rehace en QC-232 con su TOUCH_TARGET local',
  },
  // Fuente de la rama del error inesperado (R12).
  {
    archivo: 'components/shared/error-alert.tsx',
    reglas: ['compara-inesperado'],
    motivo: 'R12: `ErrorAlert` es la pieza que decide la rama',
  },
  {
    archivo: 'components/shared/unexpected-error-notice.tsx',
    reglas: ['compara-inesperado'],
    motivo: 'R12: `UnexpectedErrorNotice` es la otra pieza que la spec deja comparar',
  },
  // R12: comparan y pintan porque la ETIQUETA cambia segun la rama (div para el inesperado, p para
  // el de catalogo). `ErrorAlert` tiene `as`, pero reproducirlo exigiria volver a meter la
  // comparacion en el consumidor para elegir `as`. Lo unifica QC-227/QC-232.
  ...[
    'app/(private)/produccion/formulas/components/delete-recipe-dialog.tsx',
    'app/(private)/inventario/components/delete-product-dialog.tsx',
    'app/(private)/proveedores/[id]/components/delete-catalog-line-dialog.tsx',
    'app/(private)/proveedores/[id]/components/delete-supplier-dialog.tsx',
  ].map(
    (archivo): Exclusion => ({
      archivo,
      reglas: ['compara-inesperado'],
      motivo: 'R12: la etiqueta del contenedor cambia segun la rama (div/p); se conserva la comparacion',
    }),
  ),
  // R31: alias de EMPTY_MARK que importan archivos fuera de Archivos esperados.
  {
    archivo: 'app/(private)/inventario/components/product-columns.tsx',
    reglas: ['simbolo-borrado'],
    simbolo: 'EMPTY_CELL',
    motivo:
      'alias `EMPTY_CELL = EMPTY_MARK`: lo importa product-batches-panel.tsx, fuera de la lista ' +
      'de Archivos esperados; decision del humano (2026-10-08): el alias pasa a QC-232',
  },
  {
    archivo: 'app/(private)/proveedores/[id]/components/catalog-columns.tsx',
    reglas: ['simbolo-borrado'],
    simbolo: 'EMPTY_CELL',
    motivo:
      'alias `EMPTY_CELL = EMPTY_MARK`: lo importa supplier-detail-header.tsx, fuera de la lista ' +
      'de Archivos esperados; decision del humano (2026-10-08): el alias pasa a QC-232',
  },
  {
    archivo: 'app/(private)/asignacion/components/assigned-orders-columns.tsx',
    reglas: ['simbolo-borrado'],
    simbolo: 'MISSING_VALUE_MARK',
    motivo: 'alias de EMPTY_MARK que reexporta el barrel de asignacion, que es D11',
  },
]

/**
 * Usan `UNEXPECTED_ERROR_CODE` solo como logica (construir un error, un valor por defecto) y no
 * pintan con el. NO estan excluidos: pasan la regla 3 porque no comparan. Se nombran para que el
 * reviewer vea que se miraron (R12, «la logica que no pinta»).
 */
export const USOS_SOLO_LOGICA = [
  'app/(private)/pedidos/components/order-customer-dialog.tsx',
  'app/(private)/pedidos/components/order-distribution-dialog.tsx',
  'app/(private)/pedidos/components/use-order-cost-quote.ts',
  'app/(private)/pedidos/components/use-order-distribution-availability.ts',
  'app/(private)/pedidos/components/packaging-select.tsx',
  'components/shared/document-upload/labels.ts',
] as const

/**
 * Alias de `EMPTY_MARK` que se conservan porque los reexporta un barrel o los importa un archivo
 * fuera de la lista. NO estan excluidos: no son el literal `—`, asi que pasan la regla 5.
 */
export const ALIAS_DE_EMPTY_MARK = [
  ['app/(private)/inventario/components/product-columns.tsx', 'EMPTY_CELL'],
  ['app/(private)/proveedores/[id]/components/catalog-columns.tsx', 'EMPTY_CELL'],
  ['app/(private)/asignacion/components/assigned-orders-columns.tsx', 'MISSING_VALUE_MARK'],
  ['components/shared/responsible-avatars.tsx', 'MISSING_RESPONSIBLES_MARK'],
  ['app/(private)/configuracion/unidades/components/unit-equivalence.ts', 'NO_EQUIVALENCE_LABEL'],
  ['app/(private)/dashboard/recorrido/[id]/components/execution-trace-detail.tsx', 'MISSING_PERSON_MARK'],
] as const

/**
 * Constantes «tactiles» cuyo valor NO es el par (solo `min-h-11`, o `min-h-16 min-w-11`, o con mas
 * clases sin `min-w-11`). NO estan excluidas: pasan la regla 1 por su valor.
 */
export const CONSTANTES_QUE_NO_SON_EL_PAR = [
  ['components/shared/row-actions-menu.tsx', 'ITEM_TOUCH_TARGET'],
  [`${CARPETA_ASISTENTE}/step-reader.tsx`, 'PRIMARY_TOUCH_TARGET_EJECUCION'],
  ['components/shared/supplier/supplier-field.tsx', 'TOUCH_TARGET'],
  ['app/(private)/pedidos/components/order-field.tsx', 'TOUCH_TARGET'],
  ['app/(private)/pedidos/components/order-customer-picker.tsx', 'OPTION_TOUCH_CLASSES'],
  ['app/(private)/proveedores/components/supplier-showcase-filters.tsx', 'TOUCH_TARGET'],
] as const

/** Los locales de estado que QC-231 borro (R21) y el SubmitButton local del login (R27). */
export const LOCALES_BORRADOS = [
  'app/(private)/clientes/components/customer-list-empty.tsx',
  'app/(private)/clientes/components/customer-list-error.tsx',
  'app/(private)/clientes/components/customer-list-skeleton.tsx',
  'app/(private)/configuracion/presentaciones/components/presentation-list-empty.tsx',
  'app/(private)/configuracion/presentaciones/components/presentation-list-error.tsx',
  'app/(private)/configuracion/presentaciones/components/presentation-list-skeleton.tsx',
  'app/(private)/configuracion/unidades/components/unit-list-empty.tsx',
  'app/(private)/configuracion/unidades/components/unit-list-error.tsx',
  'app/(private)/configuracion/unidades/components/unit-list-skeleton.tsx',
  'app/(private)/configuracion/usuarios/components/user-list-empty.tsx',
  'app/(private)/configuracion/usuarios/components/user-list-error.tsx',
  'app/(private)/configuracion/usuarios/components/user-list-skeleton.tsx',
  'app/(private)/configuracion/usuarios/components/work-group-list-empty.tsx',
  'app/(private)/configuracion/usuarios/components/work-group-list-error.tsx',
  'app/(private)/configuracion/usuarios/components/work-group-list-skeleton.tsx',
  'app/(private)/inventario/components/product-list-empty.tsx',
  'app/(private)/inventario/components/product-list-error.tsx',
  'app/(private)/inventario/components/product-table-skeleton.tsx',
  'app/(private)/produccion/formulas/components/recipe-list-empty.tsx',
  'app/(private)/produccion/formulas/components/recipe-list-error.tsx',
  'app/(private)/produccion/formulas/components/recipe-table-skeleton.tsx',
  'app/(private)/proveedores/[id]/components/catalog-list-empty.tsx',
  'app/(private)/proveedores/[id]/components/catalog-list-error.tsx',
  'app/(private)/proveedores/[id]/components/catalog-table-skeleton.tsx',
  'app/(private)/proveedores/components/supplier-list-empty.tsx',
  'app/(private)/proveedores/components/supplier-list-error.tsx',
  'app/(public)/login/components/submit-button.tsx',
] as const

/** Los nombres de esos componentes, mas `ExecutionTraceListError` (interno del dashboard). */
export const COMPONENTES_BORRADOS = [
  'CustomerListEmpty',
  'CustomerListError',
  'CustomerListSkeleton',
  'PresentationListEmpty',
  'PresentationListError',
  'PresentationListSkeleton',
  'UnitListEmpty',
  'UnitListError',
  'UnitListSkeleton',
  'UserListEmpty',
  'UserListError',
  'UserListSkeleton',
  'WorkGroupListEmpty',
  'WorkGroupListError',
  'WorkGroupListSkeleton',
  'ProductListEmpty',
  'ProductListError',
  'ProductTableSkeleton',
  'RecipeListEmpty',
  'RecipeListError',
  'RecipeTableSkeleton',
  'CatalogListEmpty',
  'CatalogListError',
  'CatalogTableSkeleton',
  'SupplierListEmpty',
  'SupplierListError',
  'ExecutionTraceListError',
] as const

/**
 * Locales de estado que se conservan con su firma (R20, R21). Cualquier otro archivo de `app/` con
 * forma de vacio, error o esqueleto de lista es un hallazgo de la regla 4.
 */
export const LOCALES_CONSERVADOS = [
  // D11: los exporta el barrel de pedidos; delegan en las piezas y se borran en QC-232.
  'app/(private)/pedidos/components/order-list-empty.tsx',
  'app/(private)/pedidos/components/order-list-error.tsx',
  'app/(private)/pedidos/components/order-list-skeleton.tsx',
] as const

const FORMA_DE_LOCAL_DE_LISTA = /-list-(empty|error|skeleton)\.tsx$|-table-skeleton\.tsx$/

const SIMBOLOS_DECLARADOS_BORRADOS = ['createUrlPageFetcher', 'MISSING_VALUE_MARK', 'EMPTY_CELL']
const REEXPORTACIONES_BORRADAS = ['formatDateLocalISO', 'MISSING_VALUE_MARK', 'EMPTY_CELL']
const BARREL_INVENTARIO = 'app/(private)/inventario/components/index.ts'
const REEXPORTACIONES_BORRADAS_DEL_BARREL_INVENTARIO = ['IMAGE_COLUMN_LABEL', 'ACTIONS_COLUMN_LABEL']

// ---------------------------------------------------------------------------------------------
// El analizador
// ---------------------------------------------------------------------------------------------

export type Hallazgo = {
  readonly archivo: string
  readonly linea: number
  readonly regla: Regla
  readonly simbolo?: string
  readonly texto: string
}

/** El par tactil: las DOS clases sueltas, en cualquier orden (`md:min-h-11` no cuenta). */
export function tieneElPar(valor: string): boolean {
  const clases = valor.split(/\s+/)
  return clases.includes('min-h-11') && clases.includes('min-w-11')
}

function desenvolver(expr: ts.Expression): ts.Expression {
  let actual = expr
  while (
    ts.isParenthesizedExpression(actual) ||
    ts.isAsExpression(actual) ||
    ts.isSatisfiesExpression(actual)
  ) {
    actual = actual.expression
  }
  return actual
}

/** El valor de una expresion si es un literal de texto (o una suma de literales); si no, `null`. */
function valorLiteral(expr: ts.Expression, consumidos: Set<ts.Node>): string | null {
  const e = desenvolver(expr)
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    consumidos.add(e)
    return e.text
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const izq = valorLiteral(e.left, consumidos)
    const der = valorLiteral(e.right, consumidos)
    return izq === null || der === null ? null : izq + der
  }
  return null
}

function esElCodigoInesperado(expr: ts.Expression): boolean {
  const e = desenvolver(expr)
  if (ts.isIdentifier(e)) return e.text === 'UNEXPECTED_ERROR_CODE'
  if (ts.isPropertyAccessExpression(e)) return e.name.text === 'UNEXPECTED_ERROR_CODE'
  return false
}

const IGUALDADES = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

/** Analiza un archivo de produccion y devuelve sus hallazgos, sin aplicar exclusiones. */
export function analizar(archivo: string, fuente: string): readonly Hallazgo[] {
  const sf = ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const hallazgos: Hallazgo[] = []
  const consumidos = new Set<ts.Node>()
  const linea = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const anotar = (n: ts.Node, regla: Regla, simbolo?: string) => {
    const texto = n.getText(sf).split('\n')[0]?.slice(0, 120) ?? ''
    hallazgos.push(simbolo === undefined
      ? { archivo, linea: linea(n), regla, texto }
      : { archivo, linea: linea(n), regla, simbolo, texto })
  }

  const visitar = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const nombre = n.name.text
      if (SIMBOLOS_DECLARADOS_BORRADOS.includes(nombre)) anotar(n, 'simbolo-borrado', nombre)
      if (n.initializer !== undefined) {
        const valor = valorLiteral(n.initializer, consumidos)
        if (valor !== null && tieneElPar(valor)) anotar(n, 'par-en-constante', nombre)
        if (valor !== null && valor.trim() === MARCA) anotar(n, 'marca-en-constante', nombre)
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name !== undefined) {
      if (n.name.text === 'createUrlPageFetcher') anotar(n, 'simbolo-borrado', n.name.text)
    }
    if (ts.isExportDeclaration(n)) {
      const modulo =
        n.moduleSpecifier !== undefined && ts.isStringLiteral(n.moduleSpecifier)
          ? n.moduleSpecifier.text
          : ''
      if (n.exportClause === undefined && modulo.endsWith('date-civil')) {
        anotar(n, 'simbolo-borrado', 'formatDateLocalISO')
      }
      if (n.exportClause !== undefined && ts.isNamedExports(n.exportClause)) {
        for (const spec of n.exportClause.elements) {
          const exportado = spec.name.text
          if (REEXPORTACIONES_BORRADAS.includes(exportado)) anotar(spec, 'simbolo-borrado', exportado)
          if (
            archivo === BARREL_INVENTARIO &&
            REEXPORTACIONES_BORRADAS_DEL_BARREL_INVENTARIO.includes(exportado)
          ) {
            anotar(spec, 'simbolo-borrado', exportado)
          }
        }
      }
    }
    if (ts.isIdentifier(n)) {
      if (n.text === 'createUrlPageFetcher' && !ts.isFunctionDeclaration(n.parent)) {
        if (!ts.isVariableDeclaration(n.parent)) anotar(n, 'simbolo-borrado', n.text)
      }
      if ((COMPONENTES_BORRADOS as readonly string[]).includes(n.text)) {
        anotar(n, 'local-borrado', n.text)
      }
    }
    if (ts.isBinaryExpression(n) && IGUALDADES.has(n.operatorToken.kind)) {
      if (esElCodigoInesperado(n.left) || esElCodigoInesperado(n.right)) {
        anotar(n, 'compara-inesperado')
      }
    }
    if (ts.isCaseClause(n) && esElCodigoInesperado(n.expression)) anotar(n, 'compara-inesperado')
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateHead(n) ||
        ts.isTemplateMiddle(n) ||
        ts.isTemplateTail(n)) &&
      !consumidos.has(n) &&
      !ts.isImportDeclaration(n.parent) &&
      !ts.isExportDeclaration(n.parent) &&
      tieneElPar(n.text)
    ) {
      anotar(n, 'par-literal')
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return hallazgos
}

/** Aplica las exclusiones. Lo que devuelve son los hallazgos que cuentan. */
export function quitarExcluidos(
  hallazgos: readonly Hallazgo[],
  exclusiones: readonly Exclusion[] = EXCLUSIONES,
): readonly Hallazgo[] {
  const usados = new Map<Exclusion, number>()
  return hallazgos.filter((h) => {
    if (h.archivo.startsWith(DIRECTORIO_CREDENCIAL) && h.regla !== 'local-borrado') {
      // D3: la credencial sale de QC-231 (R7, R12). La carpeta entera, por su ruta exacta.
      return false
    }
    const exclusion = exclusiones.find(
      (e) =>
        e.archivo === h.archivo &&
        e.reglas.includes(h.regla) &&
        (e.simbolo === undefined || e.simbolo === h.simbolo) &&
        (e.hasta === undefined || (usados.get(e) ?? 0) < e.hasta),
    )
    if (exclusion === undefined) return true
    usados.set(exclusion, (usados.get(exclusion) ?? 0) + 1)
    return false
  })
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
  return hallazgos
    .map((h) => `  ${h.archivo}:${h.linea} [${h.regla}${h.simbolo ? ` ${h.simbolo}` : ''}] ${h.texto}`)
    .join('\n')
}

// ---------------------------------------------------------------------------------------------
// Regla 4, por archivo; y R33, por diff
// ---------------------------------------------------------------------------------------------

/** Archivos de `app/` con forma de vacio, error o esqueleto de lista que no se conservan (R21). */
export function localesConFormaDeLista(archivos: readonly string[]): readonly string[] {
  return archivos.filter(
    (a) =>
      a.startsWith('app/') &&
      FORMA_DE_LOCAL_DE_LISTA.test(a) &&
      !(LOCALES_CONSERVADOS as readonly string[]).includes(a),
  )
}

/** Los archivos del diff que R33 prohibe tocar. */
export function tocadosProhibidos(archivos: readonly string[]): readonly string[] {
  const prohibidos = new Set<string>([...ARCHIVOS_D11, ...COMPONENTES_CREDENCIAL, ...VACIOS_Y_ESQUELETOS_D7])
  return archivos.filter(
    (a) =>
      prohibidos.has(a) || (a.startsWith(DIRECTORIO_CREDENCIAL) && a !== SUBMIT_BUTTON_D12),
  )
}

const RAMA_DE_LA_FICHA = 'feature/QC-231-componentizacion-piezas-base'
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

/** O devuelve el merge-base, o el MOTIVO por el que el caso de diff no comprueba nada. */
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R33 habla de lo que hace ESTA ` +
        'ficha, no de lo que haga quien pase despues. Este caso NO ha comprobado nada.',
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
const quedan = quitarExcluidos(hallazgos)
const deLaRegla = (regla: Regla) => quedan.filter((h) => h.regla === regla)

describe('QC-231 — las piezas base no vuelven a copiarse', () => {
  it('el recorrido ve el codigo de produccion (si no, todo pasaria en verde sin mirar)', () => {
    expect(archivos.length).toBeGreaterThan(200)
    expect(archivos).toContain('components/shared/error-alert.tsx')
    expect(archivos.some((a) => a.startsWith('hooks/'))).toBe(true)
  })

  it('R6: la talla tactil vive en UNA constante exportada, `touchTarget`, con el par exacto', () => {
    const fuente = readFileSync(join(repoRoot, 'lib/shared/ui/touch-target.ts'), 'utf8')
    const propios = analizar('lib/shared/ui/touch-target.ts', fuente)
    expect(propios.map((h) => [h.regla, h.simbolo])).toEqual([['par-en-constante', 'touchTarget']])
    expect(fuente).toMatch(/export const touchTarget = 'min-h-11 min-w-11'/)
  })

  it('R7 (regla 1): ninguna constante local de app/, components/ o hooks/ vale el par', () => {
    const lista = deLaRegla('par-en-constante')
    expect(lista, `R7: usa \`touchTarget\` (lib/shared/ui/touch-target.ts) o \`Button touch\`:\n${informe(lista)}`).toEqual([])
  })

  it('R7 (regla 2): nadie escribe el par como literal', () => {
    const lista = deLaRegla('par-literal')
    expect(lista, `R7: usa \`touchTarget\` o \`buttonVariants({ touch: true })\`:\n${informe(lista)}`).toEqual([])
  })

  it('R12 (regla 3): solo ErrorAlert y UnexpectedErrorNotice comparan con UNEXPECTED_ERROR_CODE', () => {
    const lista = deLaRegla('compara-inesperado')
    expect(lista, `R12: pinta la alerta con \`ErrorAlert\`:\n${informe(lista)}`).toEqual([])
  })

  it('R12: los usos solo de logica siguen sin comparar (por eso no se excluyen)', () => {
    for (const archivo of USOS_SOLO_LOGICA) {
      const fuente = leer(archivo)
      expect(fuente, `${archivo} ya no usa UNEXPECTED_ERROR_CODE: sacalo de USOS_SOLO_LOGICA`).toContain(
        'UNEXPECTED_ERROR_CODE',
      )
      expect(analizar(archivo, fuente).filter((h) => h.regla === 'compara-inesperado')).toEqual([])
    }
  })

  it('R21 (regla 4): los locales borrados no existen ni se nombran', () => {
    const vivos = LOCALES_BORRADOS.filter((a) => existsSync(join(repoRoot, a)))
    expect(vivos, 'R21/R27: estos locales debian estar borrados').toEqual([])
    const conForma = localesConFormaDeLista(archivos)
    expect(conForma, 'R21: vacio/error/esqueleto local de lista; lo pinta la DataTable').toEqual([])
    const lista = deLaRegla('local-borrado')
    expect(lista, `R21: se nombra un local borrado:\n${informe(lista)}`).toEqual([])
  })

  it('R20/R21/R29: los locales que se conservan por D11 delegan en las piezas', () => {
    const delegaciones = [
      ['app/(private)/pedidos/components/order-list-empty.tsx', "from '@/components/shared/empty-state'"],
      ['app/(private)/pedidos/components/order-list-error.tsx', "from '@/components/shared/error-state'"],
      ['app/(private)/pedidos/components/order-list-skeleton.tsx', "from '@/components/shared/table-skeleton'"],
      ['app/(private)/asignacion/components/assigned-orders-error.tsx', "from '@/components/shared/error-state'"],
      ['app/(private)/pedidos/components/order-recipe-image.tsx', "from '@/components/shared/entity-image'"],
    ] as const
    for (const [archivo, importa] of delegaciones) {
      expect(leer(archivo), `${archivo} debe delegar en la pieza compartida`).toContain(importa)
    }
    expect(leer('app/(private)/pedidos/components/order-recipe-image.tsx')).toMatch(/<EntityImage[\s\S]*size="fill"/)
    expect(existsSync(join(repoRoot, 'app/(private)/proveedores/components/supplier-showcase-skeleton.tsx'))).toBe(true)
  })

  it('R25: la marca vive en UNA constante, `EMPTY_MARK`', () => {
    const fuente = readFileSync(join(repoRoot, 'lib/shared/ui/empty-mark.ts'), 'utf8')
    expect(analizar('lib/shared/ui/empty-mark.ts', fuente).map((h) => [h.regla, h.simbolo])).toEqual([
      ['marca-en-constante', 'EMPTY_MARK'],
    ])
  })

  it('R25 (regla 5): ninguna constante de app/, components/ o hooks/ vale «—»', () => {
    const lista = deLaRegla('marca-en-constante')
    expect(lista, `R25: usa \`EMPTY_MARK\` (lib/shared/ui/empty-mark.ts):\n${informe(lista)}`).toEqual([])
  })

  it('R25: los alias de EMPTY_MARK que se conservan no son el literal', () => {
    for (const [archivo, simbolo] of ALIAS_DE_EMPTY_MARK) {
      const fuente = leer(archivo)
      expect(fuente, `${archivo} ya no declara ${simbolo}: sacalo de ALIAS_DE_EMPTY_MARK`).toContain(simbolo)
      expect(analizar(archivo, fuente).filter((h) => h.regla === 'marca-en-constante')).toEqual([])
    }
  })

  it('R7: las constantes tactiles con otro valor no son el par (por eso no se excluyen)', () => {
    for (const [archivo, simbolo] of CONSTANTES_QUE_NO_SON_EL_PAR) {
      const fuente = leer(archivo)
      expect(fuente, `${archivo} ya no declara ${simbolo}`).toContain(simbolo)
      expect(
        analizar(archivo, fuente).filter((h) => h.regla === 'par-en-constante' && h.simbolo === simbolo),
      ).toEqual([])
    }
  })

  it('R31 (regla 6): los simbolos borrados no vuelven', () => {
    const lista = deLaRegla('simbolo-borrado')
    expect(lista, `R31: importa la fuente de verdad:\n${informe(lista)}`).toEqual([])
  })

  it('las exclusiones apuntan a archivos que existen (salvo los D11, que son de otra persona)', () => {
    const muertas = EXCLUSIONES.filter(
      (e) => !(ARCHIVOS_D11 as readonly string[]).includes(e.archivo) && !existsSync(join(repoRoot, e.archivo)),
    ).map((e) => e.archivo)
    expect(muertas, 'exclusion muerta: el archivo ya no existe, quitala de EXCLUSIONES').toEqual([])
  })

  it('R33: el diff de esta ficha no toca D11, la credencial ni los vacios/esqueletos D7', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const diff = archivosDeLaFicha(listo.mergeBase)
    expect(diff.length, `el rango ${listo.mergeBase}..arbol no trae ningun archivo`).toBeGreaterThan(0)
    const tocados = tocadosProhibidos(diff)
    expect(tocados, `R33: esta ficha no toca estos archivos (D3, D7, D11, D12):\n${tocados.join('\n')}`).toEqual([])
  })
})

describe('QC-231 — las reglas MUERDEN (muestras sinteticas)', () => {
  const reglasDe = (fuente: string, archivo = 'app/x/muestra.tsx') =>
    quitarExcluidos(analizar(archivo, fuente)).map((h) => h.regla)

  it('regla 1: una constante local con el par, en cualquier orden', () => {
    expect(reglasDe("const TOUCH_TARGET = 'min-h-11 min-w-11'")).toEqual(['par-en-constante'])
    expect(reglasDe("export const X = 'flex ' + 'min-w-11 min-h-11'")).toEqual(['par-en-constante'])
    expect(reglasDe("const ITEM_TOUCH_TARGET = 'min-h-11 gap-2.5'")).toEqual([])
    expect(reglasDe("const X = 'md:min-h-11 md:min-w-11'")).toEqual([])
  })

  it('regla 2: el par como literal en JSX o en cn(), pero no en un comentario', () => {
    expect(reglasDe("export const A = () => <a className={cn('x', 'min-h-11 min-w-11')} />")).toEqual(['par-literal'])
    expect(reglasDe('export const A = () => <a className="min-h-11 min-w-11" />')).toEqual(['par-literal'])
    expect(reglasDe('// min-h-11 min-w-11\nexport const a = 1')).toEqual([])
  })

  it('regla 3: comparar con UNEXPECTED_ERROR_CODE, en cualquier lado y en un switch', () => {
    expect(reglasDe('const f = (e) => e.code === UNEXPECTED_ERROR_CODE ? 1 : 2')).toEqual(['compara-inesperado'])
    expect(reglasDe('const f = (e) => UNEXPECTED_ERROR_CODE !== e.code')).toEqual(['compara-inesperado'])
    expect(reglasDe('switch (c) { case errores.UNEXPECTED_ERROR_CODE: break }')).toEqual(['compara-inesperado'])
    expect(reglasDe('const e = { code: UNEXPECTED_ERROR_CODE }')).toEqual([])
  })

  it('regla 4: un local borrado nombrado, o un archivo con forma de local de lista', () => {
    expect(reglasDe("import { RecipeListError } from './recipe-list-error'")).toEqual(['local-borrado'])
    expect(localesConFormaDeLista(['app/(private)/x/components/foo-list-empty.tsx'])).toHaveLength(1)
    expect(localesConFormaDeLista(['app/(private)/x/components/foo-table-skeleton.tsx'])).toHaveLength(1)
    expect(localesConFormaDeLista([...LOCALES_CONSERVADOS])).toEqual([])
  })

  it('regla 5: una constante que vale «—»; un alias de EMPTY_MARK no', () => {
    expect(reglasDe("const MARK = '—'")).toEqual(['marca-en-constante'])
    expect(reglasDe('const MARK = `—` as const')).toEqual(['marca-en-constante'])
    expect(reglasDe('export const MARK = EMPTY_MARK')).toEqual([])
  })

  it('regla 6: cada simbolo borrado', () => {
    expect(reglasDe('export function createUrlPageFetcher() {}')).toEqual(['simbolo-borrado'])
    expect(reglasDe("import { createUrlPageFetcher } from 'x'")).toEqual(['simbolo-borrado'])
    expect(reglasDe("export { formatDateLocalISO } from '@/lib/shared/ui/date-civil'")).toEqual(['simbolo-borrado'])
    expect(reglasDe("export * from '@/lib/shared/ui/date-civil'")).toEqual(['simbolo-borrado'])
    expect(reglasDe('export const EMPTY_CELL = EMPTY_MARK')).toEqual(['simbolo-borrado'])
    expect(reglasDe("export { EMPTY_MARK as MISSING_VALUE_MARK } from 'x'")).toEqual(['simbolo-borrado'])
    expect(reglasDe("export { IMAGE_COLUMN_LABEL } from './product-columns'", BARREL_INVENTARIO)).toEqual([
      'simbolo-borrado',
    ])
    expect(reglasDe("export { IMAGE_COLUMN_LABEL } from './product-columns'")).toEqual([])
  })

  it('las exclusiones son estrechas: por archivo, regla, simbolo y cupo', () => {
    // work-group-columns: solo su TOUCH_TARGET; otra constante con el par en el mismo archivo cuenta.
    const wg = 'app/(private)/configuracion/usuarios/components/work-group-columns.tsx'
    expect(reglasDe("const TOUCH_TARGET = 'min-h-11 min-w-11'", wg)).toEqual([])
    expect(reglasDe("const OTRA = 'min-h-11 min-w-11'", wg)).toEqual(['par-en-constante'])
    // packing-orders-list-section: un literal; el segundo cuenta.
    const packing = 'app/(private)/asignacion/components/packing-orders-list-section.tsx'
    const dos = "export const A = () => <><a className='min-h-11 min-w-11' /><b className='min-h-11 min-w-11' /></>"
    expect(reglasDe(dos, packing)).toEqual(['par-literal'])
    // Un dialogo de borrado de R12 sigue sin poder escribir el par.
    const del = 'app/(private)/inventario/components/delete-product-dialog.tsx'
    expect(reglasDe("const T = 'min-h-11 min-w-11'", del)).toEqual(['par-en-constante'])
    // La credencial no cuenta para las reglas de talla ni de comparacion (D3).
    const cred = 'app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx'
    expect(reglasDe("const T = 'min-h-11 min-w-11'", cred)).toEqual([])
  })

  it('R33: el detector ve D11, credencial, la carpeta de establecer-contrasena y D7', () => {
    const lista = [
      'app/(private)/pedidos/components/order-table.tsx',
      'components/shared/credential-field.tsx',
      'app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx',
      SUBMIT_BUTTON_D12,
      'app/(private)/asignacion/components/finished-orders-empty.tsx',
      'app/(private)/clientes/components/customer-table.tsx',
    ]
    expect(tocadosProhibidos(lista)).toEqual([
      'app/(private)/pedidos/components/order-table.tsx',
      'components/shared/credential-field.tsx',
      'app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx',
      'app/(private)/asignacion/components/finished-orders-empty.tsx',
    ])
  })

  it('R33: la precondicion se salta RUIDOSAMENTE fuera de esta rama, y nunca en ella', () => {
    const enDev = preparar('dev', 'abc123')
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada')
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'")
    expect('motivo' in preparar(null, 'abc123')).toBe(true)
    expect((preparar(RAMA_DE_LA_FICHA, null) as { motivo: string }).motivo).toContain('merge-base')
    expect(preparar(RAMA_DE_LA_FICHA, 'abc123')).toEqual({ mergeBase: 'abc123' })
  })
})
