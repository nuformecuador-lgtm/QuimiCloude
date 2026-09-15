// QC-102 T17 — Guardia: a la pantalla de pedidos se le AÑADE, no se la reescribe (R41).
//
// R41 dice que esta ficha no rehace la pantalla de QC-35, ni la tabla de datos compartida (QC-55),
// ni el orden y el filtro (QC-57): les añade una columna, una seccion y una accion de fila.
//
// **Lo que esta guardia NO hace, y es la mitad del diseño.** No prohibe el diff. Esta ficha SI
// modifico —legitimamente— `order-sheet.tsx`, `order-columns.tsx`, `order-row-actions.tsx`,
// `order-form.tsx`, `order-table.tsx` y `order-list-section.tsx`: les añadio props y una columna.
// Una guardia escrita como censo de diff se pondria roja sobre ese trabajo legitimo y no serviria
// para nada —es exactamente el error que `tests/baseline-rojos.json` documenta SEIS veces—.
//
// Lo que distingue «añadir» de «reescribir» es que **nada de lo que ya habia desaparece**:
//
//   (1) Las ANCLAS de QC-35 —todo lo que el barrel de la ruta exportaba antes de esta ficha— se
//       siguen exportando, desde el mismo archivo y con el mismo nombre. Copiadas a mano, como el
//       catalogo de permisos de QC-74: si alguien las renombra, tiene que venir aqui y decirlo.
//       Corre en CUALQUIER rama, hoy y despues del merge.
//   (2) Lo mismo para la superficie publica de la tabla compartida (QC-55).
//   (3) Y, solo dentro de la rama de esta ficha, que los archivos de QC-55/QC-57 no aparezcan
//       siquiera en el diff, y que los seis de QC-35 que SI cambian solo hayan GANADO exportaciones
//       respecto del merge-base. Estos tres casos llevan precondicion de rama y `skip` ruidoso.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
const RUTA = 'app/(private)/pedidos/components'
const RAMA_DE_LA_FICHA = 'feature/QC-102-responsables-en-la-pantalla-de-pedidos'
const BASES = ['dev', 'origin/dev'] as const

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Lectura de exportaciones
// ---------------------------------------------------------------------------

/** Comentarios de LINEA primero, de BLOQUE despues (misma razon que en las otras guardias). */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * Nombres exportados por un fuente: los de `export const/function/type/interface/enum/class X` y
 * los de las llaves de `export { A, type B } from '...'` o `export { A }`. El `type` delante del
 * nombre se descarta: lo que importa es el NOMBRE, no si viaja como tipo.
 */
export function exportedNames(source: string): ReadonlySet<string> {
  const limpio = stripComments(source)
  const nombres = new Set<string>()
  for (const match of limpio.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    nombres.add(match[1] as string)
  }
  for (const match of limpio.matchAll(/\bexport\s*(?:type\s*)?\{([\s\S]*?)\}/g)) {
    for (const bruto of (match[1] as string).split(',')) {
      const nombre = bruto.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? ''
      if (/^[A-Za-z_$][\w$]*$/.test(nombre)) nombres.add(nombre)
    }
  }
  return nombres
}

/** Hallazgos: anclas que su archivo ya no exporta. */
export function findMissingAnchors(
  anclas: Readonly<Record<string, readonly string[]>>,
  leer: (archivoRelativo: string) => string | null,
): readonly string[] {
  const findings: string[] = []
  for (const [archivo, esperados] of Object.entries(anclas)) {
    const fuente = leer(archivo)
    if (fuente === null) {
      findings.push(`${archivo}: el archivo ha desaparecido (R41)`)
      continue
    }
    const exportados = exportedNames(fuente)
    for (const ancla of esperados) {
      if (!exportados.has(ancla)) {
        findings.push(`${archivo}: ya no exporta '${ancla}' (R41)`)
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Las anclas, copiadas a mano
// ---------------------------------------------------------------------------

/**
 * La superficie publica de la pantalla de pedidos TAL COMO ESTABA antes de QC-102, leida del barrel
 * de la ruta en el merge-base (`4a9bc4f`). Ninguna de estas entradas es de QC-102: son las de
 * QC-35, QC-55 y QC-57 que R41 protege. Lo que esta ficha añade —`RESPONSIBLES_COLUMN_ID`,
 * `OrderResponsibles`, `ResponsibleAvatars`, `OrderRowResponsibles`…— NO se lista aqui a proposito:
 * esta guardia vigila lo que NO puede desaparecer, no lo que se añade.
 */
const ANCLAS_DE_LA_PANTALLA: Readonly<Record<string, readonly string[]>> = {
  'cancel-order-dialog.tsx': [
    'CANCEL_ORDER_CONFIRM_TESTID',
    'CANCEL_ORDER_DIALOG_TESTID',
    'CANCEL_ORDER_DISMISS_TESTID',
    'CANCEL_ORDER_ERROR_TESTID',
    'CANCEL_ORDER_ID_FIELD',
    'CANCEL_ORDER_ID_TESTID',
    'CANCEL_ORDER_REASON_FIELD',
    'CANCEL_ORDER_REASON_TESTID',
    'CancelOrderDialog',
    'CancelOrderDialogProps',
  ],
  'delete-order-dialog.tsx': [
    'DELETE_ORDER_CONFIRM_TESTID',
    'DELETE_ORDER_DIALOG_TESTID',
    'DELETE_ORDER_DISMISS_TESTID',
    'DELETE_ORDER_ERROR_TESTID',
    'DELETE_ORDER_ID_FIELD',
    'DELETE_ORDER_ID_TESTID',
    'DELETE_ORDER_MESSAGE_TESTID',
    'DeleteOrderDialog',
    'DeleteOrderDialogProps',
  ],
  // QC-35: la declaracion de columnas. QC-102 le añade una; las siete de antes siguen.
  'order-columns.tsx': [
    'ACTIONS_COLUMN_ID',
    'CANCELLATION_REASON_COLUMN_ID',
    'MISSING_VALUE_MARK',
    'ORDER_DEFAULT_PINNED_COLUMNS',
    'ORDER_NUMBER_COLUMN_ID',
    'QUANTITY_COLUMN_ID',
    'RECIPE_NAME_COLUMN_ID',
    'buildOrderColumns',
    'OrderColumnsDeps',
  ],
  'order-field.tsx': ['OrderField', 'OrderFieldProps'],
  'order-decimal.ts': ['multiplyDecimal', 'subtractDecimal'],
  'order-form.tsx': [
    'ORDER_BUSINESS_FIELDS',
    'ORDER_FORM_CANCEL_TESTID',
    'ORDER_FORM_ERROR_TESTID',
    'ORDER_FORM_SUBMIT_TESTID',
    'ORDER_FORM_TESTID',
    'ORDER_FORM_TITLE_TESTID',
    'ORDER_PRIORITY_OPTION_TESTID',
    'ORDER_PRIORITY_SELECT_TESTID',
    'ORDER_STATUS_FIELD',
    'ORDER_STATUS_OPTION_TESTID',
    'ORDER_STATUS_SELECT_TESTID',
    'OrderForm',
    'OrderFormProps',
  ],
  'order-list-empty.tsx': ['OrderListEmpty'],
  'order-ingredients-table.tsx': [
    'ORDER_INGREDIENTS_EMPTY_TESTID',
    'ORDER_INGREDIENTS_ERROR_TESTID',
    'ORDER_INGREDIENTS_LOADING_TESTID',
    'ORDER_INGREDIENTS_TABLE_TESTID',
    'ORDER_INGREDIENTS_TESTID',
    'OrderIngredientsTable',
    'OrderIngredientsTableProps',
  ],
  'order-recipe-image.tsx': ['ORDER_RECIPE_IMAGE_TESTID', 'OrderRecipeImage', 'OrderRecipeImageProps'],
  'order-list-error.tsx': ['OrderListError'],
  // QC-57: el orden y el filtro por URL. Esta ficha NO los toca (R33: el refresco es
  // `router.refresh()`, para que pagina, tamaño, orden y filtros se conserven).
  'order-list-params.ts': [
    'CREATED_AT_COLUMN_ID',
    'CREATED_FROM_PARAM',
    'CREATED_TO_PARAM',
    'FILTER_SEPARATOR',
    'FIRST_PAGE',
    'PAGE_PARAM',
    'PAGE_SIZE_PARAM',
    'PRIORITY_COLUMN_ID',
    'PRIORITY_PARAM',
    'SORT_PARAM',
    'SORT_SEPARATOR',
    'STATUS_COLUMN_ID',
    'STATUS_PARAM',
    'buildOrderListQuery',
    'orderListHref',
    'parseOrderListParams',
    'OrderListSearchParams',
  ],
  'order-list-section.tsx': ['OrderListSection'],
  'order-list-skeleton.tsx': ['ORDER_SKELETON_COLUMN_COUNT', 'OrderListSkeleton'],
  'order-row-actions.tsx': ['FINAL_ORDER_REASON', 'OrderRowActions', 'isFinalOrderStatus', 'OrderRowActionsProps'],
  'order-sheet.tsx': [
    'ORDER_CREATE_OPEN_TESTID',
    'ORDER_SHEET_TESTID',
    'OrderRowSheetActions',
    'OrderSheet',
    'OrderRowSheetActionsProps',
    'OrderSheetProps',
  ],
  'recipe-picker.tsx': [
    'RECIPE_FIELD',
    'RECIPE_PICKER_TESTID',
    'RecipePicker',
    'RecipePickerOption',
    'RecipePickerPage',
    'RecipePickerProps',
  ],
  'order-status-badge.tsx': [
    'ORDER_PRIORITY_FILTER_OPTIONS',
    'ORDER_PRIORITY_LABELS',
    'ORDER_STATUS_FILTER_OPTIONS',
    'ORDER_STATUS_LABELS',
    'OrderPriorityBadge',
    'OrderStatusBadge',
  ],
  'order-table.tsx': ['ORDER_TABLE_ID', 'ORDER_TABLE_TEXTS', 'OrderTable', 'OrderTableProps'],
}

/** La superficie publica de la tabla compartida de QC-55, leida de su barrel. */
const ANCLAS_DE_LA_TABLA: readonly string[] = [
  'DataTable',
  'DATA_TABLE_FEATURES',
  'DATA_TABLE_OPTED_FEATURES',
  'createDefaultParams',
  'PAGE_SIZE_OPTIONS',
  'SEARCH_DEBOUNCE_MS',
  'withFilter',
  'withPage',
  'withPageSize',
  'withSearch',
  'withSort',
  'DataTableColumn',
  'DataTableFilterSpec',
  'DataTableFilterValue',
  'DataTableParams',
  'DataTableProps',
  'DataTableSort',
  'DataTableTexts',
  'SortDirection',
]

/** Los archivos de QC-55 y QC-57 que esta ficha NO toca en absoluto. */
const INTOCABLES: readonly string[] = [
  'components/shared/data-table/data-table.tsx',
  'components/shared/data-table/data-table-filters.tsx',
  'components/shared/data-table/data-table-header-menu.tsx',
  'components/shared/data-table/data-table-pagination.tsx',
  'components/shared/data-table/data-table-params.ts',
  'components/shared/data-table/data-table-states.tsx',
  'components/shared/data-table/data-table-types.ts',
  'components/shared/data-table/index.ts',
  'components/shared/data-table/use-pinned-columns.ts',
  `${RUTA}/order-list-params.ts`,
]

/** Los seis de QC-35 que esta ficha SI modifica, y legitimamente. */
const AMPLIADOS: readonly string[] = [
  `${RUTA}/order-columns.tsx`,
  `${RUTA}/order-form.tsx`,
  `${RUTA}/order-list-section.tsx`,
  `${RUTA}/order-row-actions.tsx`,
  `${RUTA}/order-sheet.tsx`,
  `${RUTA}/order-table.tsx`,
]

// ---------------------------------------------------------------------------
// Datos reales
// ---------------------------------------------------------------------------

const leerDeLaRuta = (archivo: string): string | null => {
  const abs = join(repoRoot, RUTA, archivo)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

const rama = (git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '').trim()
const mergeBase = (() => {
  for (const base of BASES) {
    const sha = (git(['merge-base', base, 'HEAD']) ?? '').trim()
    if (sha.length > 0) return sha
  }
  return null
})()

/** Motivo por el que los casos de rango no aplican, o `null` si SI aplican. */
export function motivoDeSalto(ramaActual: string, base: string | null): string | null {
  if (ramaActual !== RAMA_DE_LA_FICHA) {
    return (
      `la rama actual es '${ramaActual || '(desconocida)'}' y no '${RAMA_DE_LA_FICHA}': R41 habla de ` +
      'lo que hace ESTA ficha con la pantalla, no de lo que haga quien pase despues. Este caso NO ' +
      'ha comprobado nada.'
    )
  }
  if (base === null) {
    return `no se pudo calcular el merge-base con ${BASES.join(' ni con ')}: este caso NO ha comprobado nada.`
  }
  return null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('R41 — la pantalla de pedidos conserva TODAS sus anclas (QC-35, QC-57)', () => {
  it('los archivos de la ruta siguen exportando lo que exportaban antes de esta ficha', () => {
    expect(Object.keys(ANCLAS_DE_LA_PANTALLA).length).toBeGreaterThan(0)
    expect(findMissingAnchors(ANCLAS_DE_LA_PANTALLA, leerDeLaRuta)).toEqual([])
  })

  it('y el barrel de la ruta las sigue reexportando todas', () => {
    const barrel = leerDeLaRuta('index.ts')
    expect(barrel, 'no se encontro el barrel de la ruta').not.toBeNull()
    const expuestos = exportedNames(barrel as string)

    const ausentes = Object.values(ANCLAS_DE_LA_PANTALLA)
      .flat()
      .filter((ancla) => !expuestos.has(ancla))
      .sort()
    expect(
      ausentes,
      `anclas de QC-35/QC-57 que el barrel ya no reexporta: ${ausentes.join(', ')}. A la pantalla se ` +
        'le AÑADE (R41): quitar una exportacion es reescribirla.',
    ).toEqual([])
  })

  it('MUERE si se muta el archivo REAL: `order-columns.tsx` sin `RECIPE_NAME_COLUMN_ID`', () => {
    // La columna de responsables se AÑADE junto a las de QC-35; si al añadirla desapareciera una de
    // las de antes, eso ya no seria añadir.
    const real = leerDeLaRuta('order-columns.tsx')
    expect(real, 'no se encontro order-columns.tsx').not.toBeNull()

    const mutado = (real as string).replace(
      "export const RECIPE_NAME_COLUMN_ID",
      'const RECIPE_NAME_COLUMN_ID',
    )
    expect(mutado).not.toBe(real)

    const leerMutado = (archivo: string) =>
      archivo === 'order-columns.tsx' ? mutado : leerDeLaRuta(archivo)
    expect(findMissingAnchors(ANCLAS_DE_LA_PANTALLA, leerMutado)).toEqual([
      "order-columns.tsx: ya no exporta 'RECIPE_NAME_COLUMN_ID' (R41)",
    ])
  })

  it('MUERE tambien si el `order-sheet` pierde una de sus anclas, o si un archivo desaparece', () => {
    const real = leerDeLaRuta('order-sheet.tsx') as string
    const mutado = real.replace('export function OrderSheet', 'function OrderSheet')
    expect(mutado).not.toBe(real)
    expect(
      findMissingAnchors(
        { 'order-sheet.tsx': ANCLAS_DE_LA_PANTALLA['order-sheet.tsx'] as readonly string[] },
        () => mutado,
      ),
    ).toEqual(["order-sheet.tsx: ya no exporta 'OrderSheet' (R41)"])

    expect(findMissingAnchors({ 'order-table.tsx': ['OrderTable'] }, () => null)).toEqual([
      'order-table.tsx: el archivo ha desaparecido (R41)',
    ])
  })

  it('`exportedNames` ve las dos formas y no se ciega con un comentario', () => {
    expect([...exportedNames('export const A = 1;\nexport type B = string;')].sort()).toEqual(['A', 'B'])
    expect([...exportedNames("export { C, type D } from './x';")].sort()).toEqual(['C', 'D'])
    expect([...exportedNames("export { E as F } from './x';")]).toEqual(['E'])
    expect([...exportedNames('// export const G = 1;\n/* export const H = 2; */')]).toEqual([])
  })
})

describe('R41 — la tabla de datos compartida de QC-55 conserva su superficie', () => {
  it('el barrel de `components/shared/data-table` exporta las diecinueve piezas de siempre', () => {
    const barrel = readFileSync(join(repoRoot, 'components/shared/data-table/index.ts'), 'utf8')
    const expuestos = exportedNames(barrel)
    const ausentes = ANCLAS_DE_LA_TABLA.filter((ancla) => !expuestos.has(ancla))
    expect(ausentes, `la tabla compartida ya no exporta: ${ausentes.join(', ')} (R41)`).toEqual([])
  })

  it('MUERE si se muta el barrel REAL de la tabla: sin `DataTable`', () => {
    const real = readFileSync(join(repoRoot, 'components/shared/data-table/index.ts'), 'utf8')
    const mutado = real.replace('export { DataTable,', 'export {')
    expect(mutado).not.toBe(real)

    const expuestos = exportedNames(mutado)
    expect(ANCLAS_DE_LA_TABLA.filter((ancla) => !expuestos.has(ancla))).toEqual(['DataTable'])
  })
})

describe('R41 — dentro de la rama de la ficha: se añade, no se reescribe', () => {
  it('los archivos de QC-55 y QC-57 no aparecen ni en el diff de esta ficha', (ctx) => {
    const motivo = motivoDeSalto(rama, mergeBase)
    if (motivo !== null) {
      ctx.skip(motivo)
      return
    }

    const salida = git(['diff', '--name-only', mergeBase as string, '--', ...INTOCABLES])
    expect(salida, 'git no pudo calcular el diff de los intocables').not.toBeNull()
    const tocados = (salida as string)
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0)
      .sort()

    expect(
      tocados,
      `QC-102 R41: la tabla compartida (QC-55) y el orden/filtro (QC-57) no se rehacen, y el diff ` +
        `dice lo contrario:\n${tocados.join('\n')}`,
    ).toEqual([])
  })

  it('los seis archivos de QC-35 que si cambian solo GANAN exportaciones', (ctx) => {
    const motivo = motivoDeSalto(rama, mergeBase)
    if (motivo !== null) {
      ctx.skip(motivo)
      return
    }

    const perdidas: string[] = []
    for (const archivo of AMPLIADOS) {
      const antes = git(['show', `${mergeBase as string}:${archivo}`])
      expect(antes, `no se pudo leer ${archivo} en el merge-base`).not.toBeNull()
      const ahora = readFileSync(join(repoRoot, archivo), 'utf8')

      const expuestosAhora = exportedNames(ahora)
      for (const nombre of exportedNames(antes as string)) {
        if (!expuestosAhora.has(nombre)) perdidas.push(`${archivo}: perdio la exportacion '${nombre}'`)
      }
    }

    expect(
      perdidas,
      `QC-102 R41: a estos archivos se les AÑADEN props y una columna; ninguno se reescribe.\n` +
        `${perdidas.join('\n')}`,
    ).toEqual([])
  })

  it('la precondicion de rama se salta RUIDOSAMENTE fuera de esta rama, y nunca en ella', () => {
    expect(motivoDeSalto('dev', 'abc123')).toContain('NO ha comprobado nada')
    expect(motivoDeSalto('feature/QC-999-otra', 'abc123')).toContain("la rama actual es 'feature/QC-999-otra'")
    expect(motivoDeSalto(RAMA_DE_LA_FICHA, null)).toContain('merge-base')
    expect(motivoDeSalto(RAMA_DE_LA_FICHA, 'abc123')).toBeNull()
  })
})
