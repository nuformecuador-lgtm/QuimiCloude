// QC-232 T5a — Guardia: formularios, confirmaciones y acciones por fila no vuelven a copiarse
// (R4, R28, R30, R31; design.md > 9).
//
// QC-232 saco a piezas compartidas el boton de envio, el dialogo de confirmacion y el menu de
// acciones por fila. Esta guardia impide que la copia vuelva. Recorre `app/` y `components/` (solo
// produccion) y busca cuatro cosas:
//
//   1. `envio-local`           — `useFormStatus` (importado, renombrado o llamado). El boton de envio
//                                vive en `FormSheet` y en `SubmitButton` (R28).
//   2. `confirmacion-local`    — `AlertDialogAction`. La confirmacion vive en `ConfirmDialog` (R28).
//   3. `accion-de-fila-local`  — en un `*-columns`, `*-row-actions` o `*-table`: lo que devuelve la
//                                celda de acciones (el argumento de `actionsColumn()`, la `cell` de una
//                                columna con `id` de acciones, o una prop `rowActions` / `lineActions`)
//                                es un control (`Button`, `button`, `a`, `Link`) o un fragmento con
//                                varios disparadores; o hay un `Button size="icon"` en un
//                                `*-row-actions` o en un componente `*RowActions` del archivo. Lo que
//                                se pinta en la celda es UN `RowActionsMenu` (R20, R28).
//                                Mira la FORMA y no el texto: asi no salta con los botones de las
//                                cabeceras ni con los de los paneles.
//   4. `confirm-action-dialog` — un import (estatico, reexportacion o `import()`) de
//                                `components/shared/confirm-action-dialog`, o el nombre
//                                `ConfirmActionDialog` (R28: la pieza se borro).
//
// Y, por diff contra el merge-base con `origin/dev`, que la rama de QC-232 no toca los archivos de
// design.md > 7, los buscadores de QC-233 ni `app/(public)/**` (R30), que `package.json` no gana
// dependencias (R31) y que todo test o snapshot EXISTENTE que edita esta en tasks.md > Archivos
// esperados (R4). Esos casos solo corren en la rama de la ficha: fuera de ella hacen `skip` RUIDOSO,
// porque un censo de diff que corre en toda rama acaba cazando a la ficha siguiente, no a la suya.
//
// **Las excepciones son una lista cerrada de archivos, cada una con su motivo.** Ningun patron. Una
// excepcion que apunta a un archivo que no existe, o que ya no muerde, es un hallazgo.
//
// Analiza con el compilador de TypeScript (`typescript`, ya declarado en `devDependencies`), no con
// expresiones regulares: asi un comentario que nombra el hook o la pieza no cuenta como hallazgo.

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

export type Regla = 'envio-local' | 'confirmacion-local' | 'accion-de-fila-local' | 'confirm-action-dialog'

const CARPETAS = ['app', 'components'] as const

const HOOK_DE_ENVIO = 'useFormStatus'
const ACCION_DE_CONFIRMACION = 'AlertDialogAction'
/** La pieza borrada, sin extension, relativa a la raiz. */
const MODULO_BORRADO = 'components/shared/confirm-action-dialog'
const COMPONENTE_BORRADO = 'ConfirmActionDialog'

/** Los archivos donde vive la celda de acciones (R28). */
const ARCHIVO_DE_TABLA = /-(columns|row-actions|table)\.tsx?$/
const ARCHIVO_DE_ACCIONES_DE_FILA = /-row-actions\.tsx?$/
/** Los controles que no pueden pintarse sueltos en la celda de acciones. */
const CONTROLES = new Set(['Button', 'button', 'a', 'Link'])
const PROPS_DE_ACCIONES = new Set(['rowActions', 'lineActions'])
const ID_DE_ACCIONES = 'actions'
const CONSTANTE_ID_DE_ACCIONES = /ACTIONS_COLUMN_ID$/
const COMPONENTE_DE_ACCIONES = /RowActions$/

type Excepcion = {
  readonly archivo: string
  readonly reglas: readonly Regla[]
  readonly motivo: string
}

export const EXCEPCIONES: readonly Excepcion[] = [
  // envio-local
  {
    archivo: 'components/shared/form-sheet.tsx',
    reglas: ['envio-local'],
    motivo: 'R28: `FormSheet` es la pieza que pinta el boton de envio del panel (`SaveButton`)',
  },
  {
    archivo: 'components/shared/submit-button.tsx',
    reglas: ['envio-local'],
    motivo: 'R28: es el `SubmitButton` compartido (el del login y el de establecer contrasena)',
  },
  {
    archivo: 'app/(private)/components/logout-button.tsx',
    reglas: ['envio-local'],
    motivo:
      'requirements > Lo que NO entra: el logout no es formulario en panel ni borrado; su boton ' +
      'lee `useFormStatus` del `<form>` de cierre de sesion, que no es un `FormSheet`',
  },
  // confirmacion-local
  {
    archivo: 'components/shared/confirm-dialog.tsx',
    reglas: ['confirmacion-local'],
    motivo: 'R28: `ConfirmDialog` es la pieza que compone `AlertDialogAction`',
  },
  {
    archivo: 'components/ui/alert-dialog.tsx',
    reglas: ['confirmacion-local'],
    motivo: 'es la definicion del primitivo `AlertDialogAction`, no un consumidor',
  },
  {
    archivo: 'app/(private)/pedidos/components/blocked-order-dialog.tsx',
    reglas: ['confirmacion-local'],
    motivo:
      'requirements > Lo que NO entra: aviso de pedido bloqueado, no es borrado ni confirmacion ' +
      'con form, y queda como excepcion con nombre',
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

/** Si el especificador de un import, visto desde `archivo`, apunta a la pieza borrada. */
export function apuntaALaPiezaBorrada(archivo: string, especificador: string): boolean {
  let destino: string
  if (especificador.startsWith('@/')) {
    destino = especificador.slice(2)
  } else if (especificador.startsWith('./') || especificador.startsWith('../')) {
    destino = posix.normalize(posix.join(posix.dirname(archivo), especificador))
  } else {
    return false
  }
  destino = destino.replace(/\/$/, '').replace(/\.(tsx?|jsx?)$/, '').replace(/\/index$/, '')
  return destino === MODULO_BORRADO
}

function nombreDeEtiqueta(tag: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(tag)) return tag.text
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text
  return ''
}

function valorDeAtributo(attr: ts.JsxAttribute): string | null {
  const init = attr.initializer
  if (init === undefined) return null
  if (ts.isStringLiteral(init)) return init.text
  if (ts.isJsxExpression(init) && init.expression !== undefined) {
    const e = init.expression
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
  }
  return null
}

/** Un `<Button size="icon">` (o `icon-sm`, `icon-lg`...). */
function esBotonDeIcono(n: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  if (nombreDeEtiqueta(n.tagName) !== 'Button') return false
  return n.attributes.properties.some(
    (p) =>
      ts.isJsxAttribute(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'size' &&
      (valorDeAtributo(p) ?? '').startsWith('icon'),
  )
}

function nombreDePropiedad(nombre: ts.PropertyName | ts.JsxAttributeName): string | null {
  if (ts.isIdentifier(nombre) || ts.isStringLiteral(nombre)) return nombre.text
  return null
}

/** Si un objeto literal declara una columna con el `id` de acciones. */
function esColumnaDeAcciones(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some((p) => {
    if (!ts.isPropertyAssignment(p) || nombreDePropiedad(p.name) !== 'id') return false
    const v = p.initializer
    if (ts.isStringLiteral(v)) return v.text === ID_DE_ACCIONES
    if (ts.isIdentifier(v)) return CONSTANTE_ID_DE_ACCIONES.test(v.text)
    if (ts.isPropertyAccessExpression(v)) return CONSTANTE_ID_DE_ACCIONES.test(v.name.text)
    return false
  })
}

/**
 * Las regiones de la celda de acciones de un archivo de tabla, de dos clases:
 * - `valores`: lo que la celda devuelve (el argumento de `actionsColumn()`, la `cell` de la columna
 *   de acciones y las props `rowActions` / `lineActions`). Ahi va UN elemento: el menu o el
 *   componente `*RowActions` que lo pinta.
 * - `componentes`: el cuerpo de un componente `*RowActions` declarado en el propio archivo. Ahi
 *   viven el menu y sus paneles y dialogos montados; lo que no puede haber es un boton de icono.
 */
function celdasDeAcciones(sf: ts.SourceFile): { valores: readonly ts.Node[]; componentes: readonly ts.Node[] } {
  const valores: ts.Node[] = []
  const componentes: ts.Node[] = []
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const llamado = n.expression
      const nombre = ts.isIdentifier(llamado)
        ? llamado.text
        : ts.isPropertyAccessExpression(llamado)
          ? llamado.name.text
          : ''
      if (nombre === 'actionsColumn') valores.push(...n.arguments)
    }
    if (ts.isObjectLiteralExpression(n) && esColumnaDeAcciones(n)) {
      for (const p of n.properties) {
        if (ts.isPropertyAssignment(p) && nombreDePropiedad(p.name) === 'cell') valores.push(p.initializer)
      }
    }
    if (ts.isPropertyAssignment(n) && PROPS_DE_ACCIONES.has(nombreDePropiedad(n.name) ?? '')) {
      valores.push(n.initializer)
    }
    if (ts.isJsxAttribute(n) && PROPS_DE_ACCIONES.has(nombreDePropiedad(n.name) ?? '') && n.initializer) {
      valores.push(n.initializer)
    }
    if (ts.isFunctionDeclaration(n) && n.name !== undefined && COMPONENTE_DE_ACCIONES.test(n.name.text) && n.body) {
      componentes.push(n.body)
    }
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      COMPONENTE_DE_ACCIONES.test(n.name.text) &&
      n.initializer !== undefined
    ) {
      componentes.push(n.initializer)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return { valores, componentes }
}

/** Los hijos de un fragmento que son elementos o expresiones (no el texto en blanco). */
function hijosQuePintan(f: ts.JsxFragment): number {
  return f.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces)).length
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
  const anotados = new Set<string>()
  const anotar = (n: ts.Node, regla: Regla) => {
    const clave = `${n.getStart(sf)}:${regla}`
    if (anotados.has(clave)) return
    anotados.add(clave)
    const linea = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const texto = n.getText(sf).split('\n')[0]?.slice(0, 120) ?? ''
    hallazgos.push({ archivo, linea, regla, texto })
  }
  const especificador = (expr: ts.Expression | undefined): string | null =>
    expr !== undefined && (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
      ? expr.text
      : null

  const visitar = (n: ts.Node): void => {
    // La etiqueta de cierre repite el nombre de la de apertura: no es un segundo uso.
    if (ts.isIdentifier(n) && !ts.isJsxClosingElement(n.parent)) {
      if (n.text === HOOK_DE_ENVIO) anotar(n, 'envio-local')
      if (n.text === ACCION_DE_CONFIRMACION) anotar(n, 'confirmacion-local')
      if (n.text === COMPONENTE_BORRADO) anotar(n, 'confirm-action-dialog')
    }
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const modulo = especificador(n.moduleSpecifier)
      if (modulo !== null && apuntaALaPiezaBorrada(archivo, modulo)) anotar(n, 'confirm-action-dialog')
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const modulo = especificador(n.arguments[0])
      if (modulo !== null && apuntaALaPiezaBorrada(archivo, modulo)) anotar(n, 'confirm-action-dialog')
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)

  if (ARCHIVO_DE_TABLA.test(archivo)) {
    const { valores, componentes } = celdasDeAcciones(sf)
    // Lo que devuelve la celda: ni un control suelto ni varios disparadores en un fragmento.
    const enValor = (n: ts.Node): void => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && CONTROLES.has(nombreDeEtiqueta(n.tagName))) {
        anotar(n, 'accion-de-fila-local')
      }
      if (ts.isJsxFragment(n) && hijosQuePintan(n) > 1) anotar(n, 'accion-de-fila-local')
      ts.forEachChild(n, enValor)
    }
    for (const v of valores) enValor(v)
    // El cuerpo de un `*RowActions` (o el archivo `*-row-actions` entero): ningun boton de icono.
    const enComponente = (n: ts.Node): void => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && esBotonDeIcono(n)) {
        anotar(n, 'accion-de-fila-local')
      }
      ts.forEachChild(n, enComponente)
    }
    for (const c of componentes) enComponente(c)
    if (ARCHIVO_DE_ACCIONES_DE_FILA.test(archivo)) enComponente(sf)
  }
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

/** Las excepciones (archivo y regla) que ya no muerden: el archivo existe pero no da esa regla. */
export function excepcionesQueNoMuerden(
  excepciones: readonly Excepcion[],
  hallazgosDe: (archivo: string) => readonly Hallazgo[],
): readonly string[] {
  const salida: string[] = []
  for (const e of excepciones) {
    const reglas = new Set(hallazgosDe(e.archivo).map((h) => h.regla))
    for (const r of e.reglas) if (!reglas.has(r)) salida.push(`${e.archivo} [${r}]`)
  }
  return salida
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
// Lo que el diff de la rama no toca (R30), no anade (R31) y solo edita si lo declara (R4)
// ---------------------------------------------------------------------------------------------

/** design.md > 7 y requirements.md > Lo que NO entra: archivos en vuelo de QC-223, QC-217 y QC-234. */
export const NO_SE_TOCAN_R30 = [
  // QC-223
  'app/(private)/pedidos/components/order-row-actions.tsx',
  'app/(private)/pedidos/components/order-columns.tsx',
  'app/(private)/pedidos/components/order-table.tsx',
  'app/(private)/pedidos/components/order-list-section.tsx',
  'app/(private)/pedidos/components/index.ts',
  'app/(private)/pedidos/components/order-list-empty.tsx',
  'app/(private)/pedidos/components/order-list-error.tsx',
  'app/(private)/pedidos/components/order-list-skeleton.tsx',
  'app/(private)/pedidos/components/order-recipe-image.tsx',
  'app/(private)/pedidos/components/order-delivery-sheet.tsx',
  'app/(private)/inventario/components/batch-history.tsx',
  'tests/unit/pedidos-ui/order-row-actions.test.tsx',
  'tests/guards/guard-identificador-de-request.test.ts',
  'e2e/entregar-producto-terminado.spec.ts',
  // QC-217
  'app/(private)/asignacion/components/order-distribution-full.tsx',
  'app/(private)/asignacion/components/index.ts',
  'app/(private)/asignacion/components/assignment-view-tabs.tsx',
  'tests/unit/pedidos-ui/order-route-contract.test.ts',
  'e2e/acondicionamiento.spec.ts',
  'tests/unit/asignaciones-ui/conditioning-orders-columns.test.tsx',
  'tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx',
  'tests/unit/asignaciones-ui/conditioning-order-page.test.tsx',
  'tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx',
  'tests/unit/asignaciones-ui/asignacion-page.test.tsx',
  // QC-217, QC-223 y QC-234
  'lib/composition/index.ts',
  // QC-233: los buscadores (specs/QC-233 > tasks.md > Archivos esperados > Produccion)
  'components/shared/async-autocomplete.tsx',
  'hooks/use-async-paginated-options.ts',
  'app/(private)/produccion/formulas/components/product-picker.tsx',
  'app/(private)/pedidos/components/recipe-picker.tsx',
  'app/(private)/pedidos/components/packaging-select.tsx',
  'app/(private)/inventario/components/product-name-picker.tsx',
  'components/shared/presentation-select.tsx',
] as const

/** Carpetas y prefijos que R30 prohibe tocar enteros. */
export const PREFIJOS_QUE_NO_SE_TOCAN_R30 = [
  // QC-217: los conjuntos de acondicionamiento y su pantalla
  'app/(private)/asignacion/components/conditioning-orders-',
  'app/(private)/asignacion/components/conditioned-orders-',
  'app/(private)/asignacion/acondicionamiento/[id]/',
  // R30
  'app/(public)/',
] as const

/** Los archivos del diff que R30 prohibe tocar. */
export function tocadosProhibidosR30(archivos: readonly string[]): readonly string[] {
  const prohibidos = new Set<string>(NO_SE_TOCAN_R30)
  return archivos.filter((a) => prohibidos.has(a) || PREFIJOS_QUE_NO_SE_TOCAN_R30.some((p) => a.startsWith(p)))
}

type Dependencias = Readonly<Record<string, string>>
type Manifiesto = { dependencies?: Dependencias; devDependencies?: Dependencias }

/** Las dependencias de `despues` que no estaban en `antes`, con su seccion (R31). */
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

const TASKS = 'specs/QC-232-componentizacion-formularios-y-acciones/tasks.md'

/** Las rutas de `tasks.md > Archivos esperados`: el primer `codigo` de cada item de lista. */
export function archivosEsperados(tasks: string): readonly string[] {
  const lineas = tasks.split(/\r?\n/)
  const inicio = lineas.findIndex((l) => /^## Archivos esperados\s*$/.test(l))
  if (inicio < 0) return []
  const salida: string[] = []
  for (const linea of lineas.slice(inicio + 1)) {
    if (/^## /.test(linea)) break
    const m = /^\s*-\s+`([^`]+)`/.exec(linea)
    if (m?.[1] !== undefined) salida.push(m[1])
  }
  return salida
}

/** Si una ruta del diff es un test, un helper de test o un snapshot. */
export function esTestOSnapshot(archivo: string): boolean {
  return (
    archivo.startsWith('tests/') ||
    archivo.startsWith('e2e/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(archivo) ||
    archivo.endsWith('.snap')
  )
}

/** Una linea de `git diff --name-status --no-renames`: el estado y la ruta. */
export type CambioDelDiff = { readonly estado: string; readonly archivo: string }

/** Los tests o snapshots que ya existian (no los crea la rama) y que el diff edita o borra sin declararlos (R4). */
export function testsExistentesNoDeclarados(
  cambios: readonly CambioDelDiff[],
  esperados: readonly string[],
): readonly string[] {
  const declarados = new Set(esperados)
  return cambios
    .filter((c) => c.estado !== 'A' && esTestOSnapshot(c.archivo) && !declarados.has(c.archivo))
    .map((c) => `${c.estado} ${c.archivo}`)
}

const RAMA_DE_LA_FICHA = 'feature/QC-232-componentizacion-formularios-y-acciones'
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

/** Cambios de los commits de esta rama Y del arbol de trabajo, desde el merge-base. */
function cambiosDeLaFicha(mergeBase: string): readonly CambioDelDiff[] {
  const salida = git(['diff', '--name-status', '--no-renames', mergeBase])
  if (salida === null) return []
  return salida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const [estado = '', ...ruta] = l.split('\t')
      return { estado: estado.charAt(0), archivo: ruta.join('\t') }
    })
    .sort((a, b) => a.archivo.localeCompare(b.archivo))
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
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R4, R30 y R31 hablan de lo que ` +
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

describe('QC-232 — formularios, confirmaciones y acciones por fila no vuelven a copiarse', () => {
  it('el recorrido ve el codigo de produccion (si no, todo pasaria en verde sin mirar)', () => {
    expect(archivos.length).toBeGreaterThan(200)
    expect(archivos).toContain('components/shared/form-sheet.tsx')
    expect(archivos).toContain('components/shared/row-actions-menu.tsx')
    expect(archivos.filter((a) => ARCHIVO_DE_TABLA.test(a)).length).toBeGreaterThan(20)
  })

  it('R28: las piezas compartidas si dan la regla (la guardia las reconoce)', () => {
    const reglas = (a: string) => analizar(a, leer(a)).map((h) => h.regla)
    expect(reglas('components/shared/form-sheet.tsx')).toContain('envio-local')
    expect(reglas('components/shared/submit-button.tsx')).toContain('envio-local')
    expect(reglas('components/shared/confirm-dialog.tsx')).toContain('confirmacion-local')
  })

  it('R28 (envio-local): nadie fuera de FormSheet y SubmitButton usa useFormStatus', () => {
    const lista = deLaRegla('envio-local')
    expect(lista, `R28: envia con \`FormSheet\` o \`SubmitButton\`:\n${informe(lista)}`).toEqual([])
  })

  it('R28 (confirmacion-local): nadie fuera de ConfirmDialog compone AlertDialogAction', () => {
    const lista = deLaRegla('confirmacion-local')
    expect(lista, `R28: confirma con \`ConfirmDialog\` / \`DeleteConfirmDialog\`:\n${informe(lista)}`).toEqual([])
  })

  it('R28 (accion-de-fila-local): la celda de acciones es un RowActionsMenu, no controles sueltos', () => {
    const lista = deLaRegla('accion-de-fila-local')
    expect(lista, `R20/R28: pinta las acciones con \`RowActionsMenu\` y \`actionsColumn()\`:\n${informe(lista)}`).toEqual([])
  })

  it('R28 (confirm-action-dialog): ConfirmActionDialog no vuelve', () => {
    expect(existsSync(join(repoRoot, `${MODULO_BORRADO}.tsx`)), `${MODULO_BORRADO}.tsx debia estar borrado`).toBe(false)
    const lista = deLaRegla('confirm-action-dialog')
    expect(lista, `R28: usa \`ConfirmDialog\`:\n${informe(lista)}`).toEqual([])
  })

  it('R28: las excepciones son la lista cerrada, con motivo, sin archivos muertos y todas muerden', () => {
    expect(EXCEPCIONES.map((e) => [e.archivo, [...e.reglas]])).toEqual([
      ['components/shared/form-sheet.tsx', ['envio-local']],
      ['components/shared/submit-button.tsx', ['envio-local']],
      ['app/(private)/components/logout-button.tsx', ['envio-local']],
      ['components/shared/confirm-dialog.tsx', ['confirmacion-local']],
      ['components/ui/alert-dialog.tsx', ['confirmacion-local']],
      ['app/(private)/pedidos/components/blocked-order-dialog.tsx', ['confirmacion-local']],
    ])
    for (const e of EXCEPCIONES) expect(e.motivo.length, `${e.archivo} sin motivo`).toBeGreaterThan(0)
    const muertas = excepcionesMuertas(EXCEPCIONES, (a) => existsSync(join(repoRoot, a)))
    expect(muertas, 'R28: excepcion muerta, el archivo ya no existe: quitala de EXCEPCIONES').toEqual([])
    const sinMorder = excepcionesQueNoMuerden(EXCEPCIONES, (a) => analizar(a, leer(a)))
    expect(sinMorder, 'R28: excepcion que ya no muerde: quitala de EXCEPCIONES').toEqual([])
  })

  it('R30: el diff de esta ficha no toca design 7, los buscadores de QC-233 ni app/(public)', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const diff = cambiosDeLaFicha(listo.mergeBase).map((c) => c.archivo)
    expect(diff.length, `el rango ${listo.mergeBase}..arbol no trae ningun archivo`).toBeGreaterThan(0)
    const tocados = tocadosProhibidosR30(diff)
    expect(tocados, `R30: esta ficha no toca estos archivos:\n${tocados.join('\n')}`).toEqual([])
  })

  it('R31: package.json no gana dependencias respecto del merge-base', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const antes = git(['show', `${listo.mergeBase}:package.json`])
    expect(antes, `no se pudo leer package.json en ${listo.mergeBase}`).not.toBeNull()
    const nuevas = dependenciasNuevas(JSON.parse(antes ?? '{}') as Manifiesto, JSON.parse(leer('package.json')) as Manifiesto)
    expect(nuevas, `R31: dependencias nuevas sin aprobar:\n${nuevas.join('\n')}`).toEqual([])
  })

  it('R4: todo test o snapshot existente que el diff edita esta en tasks.md > Archivos esperados', (ctx) => {
    const listo = preparar(ramaActual(), mergeBaseDeLaRama())
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }
    const esperados = archivosEsperados(leer(TASKS))
    expect(esperados.length, `${TASKS} > Archivos esperados no trae rutas`).toBeGreaterThan(50)
    const fuera = testsExistentesNoDeclarados(cambiosDeLaFicha(listo.mergeBase), esperados)
    expect(fuera, `R4: estos tests existentes se editan sin estar en Archivos esperados:\n${fuera.join('\n')}`).toEqual([])
  })
})

describe('QC-232 — las reglas MUERDEN (muestras sinteticas)', () => {
  const reglasDe = (fuente: string, archivo = 'app/(private)/x/components/muestra.tsx') =>
    quitarExceptuados(analizar(archivo, fuente)).map((h) => h.regla)

  it('envio-local: importar useFormStatus, renombrado o por espacio de nombres, pero no en un comentario', () => {
    expect(reglasDe("import { useFormStatus } from 'react-dom'")).toEqual(['envio-local'])
    expect(reglasDe("import { useFormStatus as s } from 'react-dom'")).toEqual(['envio-local'])
    expect(reglasDe('export const B = () => { const { pending } = ReactDOM.useFormStatus(); return pending }')).toEqual([
      'envio-local',
    ])
    expect(reglasDe('// useFormStatus()\nexport const a = 1')).toEqual([])
    expect(reglasDe("import { useFormStatus } from 'react-dom'", 'components/shared/form-sheet.tsx')).toEqual([])
  })

  it('confirmacion-local: AlertDialogAction importado o pintado, pero no en un comentario', () => {
    expect(reglasDe("import { AlertDialogAction } from '@/components/ui/alert-dialog'")).toEqual(['confirmacion-local'])
    expect(reglasDe('export const D = () => <AlertDialogAction>Borrar</AlertDialogAction>')).toEqual([
      'confirmacion-local',
    ])
    expect(reglasDe("import { AlertDialogCancel } from '@/components/ui/alert-dialog'")).toEqual([])
    expect(reglasDe('// <AlertDialogAction />\nexport const a = 1')).toEqual([])
    expect(
      reglasDe("import { AlertDialogAction } from '@/components/ui/alert-dialog'", 'components/shared/confirm-dialog.tsx'),
    ).toEqual([])
  })

  it('accion-de-fila-local: un control suelto en la celda de actionsColumn() o en la columna de acciones', () => {
    const columnas = 'app/(private)/x/components/foo-columns.tsx'
    expect(
      reglasDe('export const c = actionsColumn({ cell: (r) => <Button size="icon" aria-label="Editar" /> })', columnas),
    ).toEqual(['accion-de-fila-local'])
    expect(
      reglasDe("export const c = [{ id: 'actions', label: 'Acciones', cell: (r) => <a href={r.href}>Editar</a> }]", columnas),
    ).toEqual(['accion-de-fila-local'])
    expect(
      reglasDe('export const c = [{ id: ACTIONS_COLUMN_ID, cell: (r) => <><button>x</button></> }]', columnas),
    ).toEqual(['accion-de-fila-local'])
    // No muerden: el menu, un componente de acciones de fila, o un boton en OTRA columna.
    expect(reglasDe('export const c = actionsColumn({ cell: (r) => <RowActionsMenu items={[]} /> })', columnas)).toEqual([])
    expect(reglasDe('export const c = actionsColumn({ cell: (r) => <FooRowActions foo={r} /> })', columnas)).toEqual([])
    expect(
      reglasDe("export const c = [{ id: 'name', cell: (r) => <Button size=\"icon\" aria-label=\"Abrir\" /> }]", columnas),
    ).toEqual([])
    // Fuera de un archivo de tabla, la forma no cuenta.
    expect(reglasDe('export const c = actionsColumn({ cell: (r) => <Button size="icon" /> })')).toEqual([])
  })

  it('accion-de-fila-local: una prop rowActions / lineActions que devuelve controles', () => {
    const tabla = 'app/(private)/x/components/foo-table.tsx'
    expect(reglasDe('const c = buildColumns({ rowActions: (r) => <Button onClick={f}>Editar</Button> })', tabla)).toEqual([
      'accion-de-fila-local',
    ])
    expect(reglasDe('const c = buildColumns({ lineActions: (p, l) => <Link href="/x">Ver</Link> })', tabla)).toEqual([
      'accion-de-fila-local',
    ])
    expect(reglasDe('export const T = () => <Foo rowActions={(r) => <button>x</button>} />', tabla)).toEqual([
      'accion-de-fila-local',
    ])
    // Varios disparadores en un fragmento, aunque cada uno sea un componente (la forma de antes).
    expect(
      reglasDe('const c = buildColumns({ rowActions: (r) => (<>\n<FooSheet foo={r} />\n<DeleteFooDialog foo={r} />\n</>) })', tabla),
    ).toEqual(['accion-de-fila-local'])
    expect(reglasDe('const c = buildColumns({ rowActions: (r) => <FooRowActions foo={r} /> })', tabla)).toEqual([])
    expect(reglasDe('const c = buildColumns({ rowActions: (r) => <><FooRowActions foo={r} /></> })', tabla)).toEqual([])
    // Un boton de cabecera en la misma tabla no cuenta.
    expect(reglasDe('export const T = () => <Button size="icon" aria-label="Filtros" />', tabla)).toEqual([])
  })

  it('accion-de-fila-local: un Button size="icon" en un *-row-actions', () => {
    const acciones = 'app/(private)/x/components/foo-row-actions.tsx'
    expect(reglasDe('export const A = () => <Button size="icon" aria-label="Editar" />', acciones)).toEqual([
      'accion-de-fila-local',
    ])
    expect(reglasDe("export const A = () => <Button size={'icon-sm'} aria-label=\"Editar\" />", acciones)).toEqual([
      'accion-de-fila-local',
    ])
    expect(reglasDe('export const A = () => <RowActionsMenu label="Acciones" items={[]} />', acciones)).toEqual([])
    expect(reglasDe('export const A = () => <Button variant="outline">Cancelar</Button>', acciones)).toEqual([])
    // Un componente `*RowActions` declarado dentro de un `*-columns` (la forma de `WorkGroupRowActions`).
    const columnas = 'app/(private)/x/components/foo-columns.tsx'
    expect(
      reglasDe('export function FooRowActions() { return <div><Button size="icon" aria-label="Editar" /></div> }', columnas),
    ).toEqual(['accion-de-fila-local'])
    expect(reglasDe('export const FooRowActions = () => <Button size="icon" aria-label="Editar" />', columnas)).toEqual([
      'accion-de-fila-local',
    ])
    expect(reglasDe('export function FooHeader() { return <Button size="icon" aria-label="Filtros" /> }', columnas)).toEqual(
      [],
    )
  })

  it('confirm-action-dialog: importar la pieza borrada por alias, relativa, reexportacion o import(), o nombrarla', () => {
    expect(reglasDe("import { X } from '@/components/shared/confirm-action-dialog'")).toEqual(['confirm-action-dialog'])
    expect(reglasDe("import { X } from './confirm-action-dialog'", 'components/shared/otro.tsx')).toEqual([
      'confirm-action-dialog',
    ])
    expect(reglasDe("export * from '@/components/shared/confirm-action-dialog.tsx'")).toEqual(['confirm-action-dialog'])
    expect(reglasDe("const m = () => import('@/components/shared/confirm-action-dialog')")).toEqual([
      'confirm-action-dialog',
    ])
    expect(reglasDe('export function ConfirmActionDialog() { return null }')).toEqual(['confirm-action-dialog'])
    // No muerden: un comentario u otra pieza.
    expect(reglasDe("// import '@/components/shared/confirm-action-dialog'\nexport const a = 1")).toEqual([])
    expect(reglasDe("import { ConfirmDialog } from '@/components/shared/confirm-dialog'")).toEqual([])
  })

  it('las excepciones son estrechas por regla y por archivo', () => {
    // El logout puede leer useFormStatus, pero no componer AlertDialogAction.
    const logout = 'app/(private)/components/logout-button.tsx'
    expect(reglasDe("import { AlertDialogAction } from '@/components/ui/alert-dialog'", logout)).toEqual([
      'confirmacion-local',
    ])
    // ConfirmDialog no puede leer useFormStatus.
    expect(reglasDe("import { useFormStatus } from 'react-dom'", 'components/shared/confirm-dialog.tsx')).toEqual([
      'envio-local',
    ])
  })

  it('una excepcion que apunta a un archivo inexistente, o que ya no muerde, es un hallazgo', () => {
    const conMuerta = [...EXCEPCIONES, { archivo: 'components/shared/no-existe.tsx', reglas: ['envio-local'], motivo: 'x' }] as const
    expect(excepcionesMuertas(conMuerta, (a) => existsSync(join(repoRoot, a)))).toEqual(['components/shared/no-existe.tsx'])
    const sinMorder = [{ archivo: 'components/shared/a.tsx', reglas: ['envio-local', 'confirmacion-local'], motivo: 'x' }] as const
    expect(
      excepcionesQueNoMuerden(sinMorder, (a) => analizar(a, "import { useFormStatus } from 'react-dom'")),
    ).toEqual(['components/shared/a.tsx [confirmacion-local]'])
  })

  it('R30: el detector ve design 7, los buscadores de QC-233, sus carpetas y app/(public)', () => {
    const lista = [
      'app/(private)/pedidos/components/order-table.tsx',
      'app/(private)/asignacion/components/conditioning-orders-empty.tsx',
      'app/(private)/asignacion/acondicionamiento/[id]/components/finish-conditioning-dialog.tsx',
      'components/shared/async-autocomplete.tsx',
      'lib/composition/index.ts',
      'app/(public)/login/page.tsx',
      'app/(private)/asignacion/components/assigned-orders-empty.tsx',
      'app/(private)/pedidos/components/order-sheet.tsx',
      'components/shared/confirm-dialog.tsx',
    ]
    expect(tocadosProhibidosR30(lista)).toEqual(lista.slice(0, 6))
  })

  it('R30: las rutas que no se tocan existen (una lista con rutas muertas no vigilaria nada)', () => {
    const muertas = NO_SE_TOCAN_R30.filter((a) => !existsSync(join(repoRoot, a)))
    expect(muertas).toEqual([])
  })

  it('R31: el detector ve una dependencia nueva en cualquiera de las dos secciones', () => {
    const antes = { dependencies: { a: '1' }, devDependencies: { b: '1' } }
    expect(dependenciasNuevas(antes, { dependencies: { a: '2' }, devDependencies: { b: '1' } })).toEqual([])
    expect(dependenciasNuevas(antes, { dependencies: { a: '1', c: '1' }, devDependencies: { b: '1', d: '1' } })).toEqual([
      'dependencies: c',
      'devDependencies: d',
    ])
  })

  it('R4: Archivos esperados se lee de tasks.md y un test existente no declarado es un hallazgo', () => {
    const tasks = [
      '## Tanda 5',
      '- `tests/unit/fuera-de-la-seccion.test.tsx`',
      '## Archivos esperados',
      '### Tests',
      '- `tests/unit/a.test.tsx`',
      '- `tests/unit/paridad/__snapshots__/a.test.tsx.snap` (R4 c)',
      '## Otra seccion',
      '- `tests/unit/b.test.tsx`',
    ].join('\n')
    const esperados = archivosEsperados(tasks)
    expect(esperados).toEqual(['tests/unit/a.test.tsx', 'tests/unit/paridad/__snapshots__/a.test.tsx.snap'])
    expect(
      testsExistentesNoDeclarados(
        [
          { estado: 'M', archivo: 'tests/unit/a.test.tsx' },
          { estado: 'M', archivo: 'tests/unit/b.test.tsx' },
          { estado: 'D', archivo: 'e2e/c.spec.ts' },
          { estado: 'M', archivo: 'tests/unit/paridad/__snapshots__/z.test.tsx.snap' },
          { estado: 'A', archivo: 'tests/unit/nuevo.test.tsx' },
          { estado: 'M', archivo: 'app/(private)/x/components/y.tsx' },
        ],
        esperados,
      ),
    ).toEqual(['M tests/unit/b.test.tsx', 'D e2e/c.spec.ts', 'M tests/unit/paridad/__snapshots__/z.test.tsx.snap'])
    // El tasks.md real trae la seccion, con los tests de R25 y los snapshots de R4 (c).
    const reales = archivosEsperados(leer(TASKS))
    expect(reales).toContain('tests/guards/guard-piezas-base.test.ts')
    expect(reales).toContain('tests/unit/paridad/__snapshots__/clientes-paridad.test.tsx.snap')
  })

  it('R4/R30/R31: la precondicion se salta RUIDOSAMENTE fuera de esta rama, y nunca en ella', () => {
    const enDev = preparar('dev', 'abc123')
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada')
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'")
    expect('motivo' in preparar(null, 'abc123')).toBe(true)
    expect((preparar(RAMA_DE_LA_FICHA, null) as { motivo: string }).motivo).toContain('merge-base')
    expect(preparar(RAMA_DE_LA_FICHA, 'abc123')).toEqual({ mergeBase: 'abc123' })
  })
})
