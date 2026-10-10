// Guardia: el catálogo de componentes (`components/shared/CATALOGO.md`) y el código dicen lo mismo.
//
// Sin catálogo fiable, cada ficha re-crea la pieza que ya existía porque no la encuentra. Esta
// guardia cruza las tres tablas del catálogo con el código en las dos direcciones: no hay pieza sin
// fila ni fila que apunte a algo que no existe. También vigila la columna `Diseño` (toda pieza nueva
// cita su tablero versionado en `docs/diseno/canvas/`) y que las reglas estén escritas donde los
// agentes las leen.
//
// Misma forma que `guard-catalogo-de-errores` y `guard-piezas-base`: funciones puras exportadas que
// reciben texto y devuelven hallazgos, cada regla demostrada con una muestra que la viola y otra que
// la cumple, y casos que las alimentan con el repositorio real. Los exports se leen con el
// compilador de TypeScript, no con expresiones regulares: `export type`, alias y especificadores
// `type X` engañan a una regex. Sin lista de exclusiones: lo que no cumple se arregla con una fila.

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
// Datos
// ---------------------------------------------------------------------------------------------

export const CATALOGO = 'components/shared/CATALOGO.md'

export type ClaveSeccion = 'primitivos' | 'compuestos' | 'apoyos'

export const SECCIONES: readonly { readonly clave: ClaveSeccion; readonly titulo: string }[] = [
  { clave: 'primitivos', titulo: '## Primitivos — components/ui' },
  { clave: 'compuestos', titulo: '## Compuestos — components/shared' },
  { clave: 'apoyos', titulo: '## Apoyos — lib/shared/ui y hooks' },
]

export const COLUMNAS = [
  'Pieza',
  'Archivo',
  'Para qué',
  'Alcance',
  'Puntos de extensión',
  'Base de',
  'Diseño',
] as const

const PREVIO = 'previo al rediseño'
const SIN_UI = 'sin UI'
const RUTA_DE_TABLERO = /^docs\/diseno\/canvas\/[^/]+\.dc\.html$/

/**
 * Los `Archivo` de Compuestos y Primitivos que ya estaban catalogados antes del rediseño: pueden
 * llevar `previo al rediseño` en `Diseño`. Lista cerrada que solo encoge: añadir una entrada es
 * saltarse el pase de diseño.
 * Instantánea del 2026-10-10.
 */
export const PIEZAS_PREVIAS_AL_REDISENO: readonly string[] = [
  'components/shared/async-autocomplete.tsx',
  'components/shared/brand-logo.tsx',
  'components/shared/compress-image.ts',
  'components/shared/confirm-dialog.tsx',
  'components/shared/countdown-timer.tsx',
  'components/shared/credential-field.tsx',
  'components/shared/credential-requirements.tsx',
  'components/shared/credential-rule-labels.ts',
  'components/shared/data-table/index.ts',
  'components/shared/date-cell.tsx',
  'components/shared/date-picker.tsx',
  'components/shared/delete-confirm-dialog.tsx',
  'components/shared/document-upload/index.ts',
  'components/shared/empty-state.tsx',
  'components/shared/entity-image.tsx',
  'components/shared/error-alert.tsx',
  'components/shared/error-state.tsx',
  'components/shared/field-error.tsx',
  'components/shared/file-field.tsx',
  'components/shared/file-types.ts',
  'components/shared/form-sheet.tsx',
  'components/shared/order-distribution-label.tsx',
  'components/shared/presentation-select.tsx',
  'components/shared/presentation-unit-select.tsx',
  'components/shared/responsible-avatars.tsx',
  'components/shared/row-actions-menu.tsx',
  'components/shared/select-field.tsx',
  'components/shared/shared-select.tsx',
  'components/shared/spinner.tsx',
  'components/shared/step-reader/index.ts',
  'components/shared/step-reader/step-document-view.tsx',
  'components/shared/submit-button.tsx',
  'components/shared/supplier/index.ts',
  'components/shared/table-skeleton.tsx',
  'components/shared/text-field.tsx',
  'components/shared/theme-provider.tsx',
  'components/shared/unexpected-error-notice.tsx',
  'components/shared/unit-conversion-marks.tsx',
  'components/ui/alert-dialog.tsx',
  'components/ui/autocomplete.tsx',
  'components/ui/avatar.tsx',
  'components/ui/badge.tsx',
  'components/ui/button.tsx',
  'components/ui/calendar.tsx',
  'components/ui/card.tsx',
  'components/ui/checkbox.tsx',
  'components/ui/collapsible.tsx',
  'components/ui/dialog.tsx',
  'components/ui/dropdown-menu.tsx',
  'components/ui/input.tsx',
  'components/ui/label.tsx',
  'components/ui/popover.tsx',
  'components/ui/select.tsx',
  'components/ui/separator.tsx',
  'components/ui/sheet.tsx',
  'components/ui/sidebar.tsx',
  'components/ui/skeleton.tsx',
  'components/ui/sonner.tsx',
  'components/ui/table.tsx',
  'components/ui/tabs.tsx',
  'components/ui/textarea.tsx',
  'components/ui/tooltip.tsx',
]

const CARPETAS_DEL_ARBOL = ['app', 'components', 'hooks', 'lib/shared/ui'] as const
const CARPETAS_IMPORTADORAS = ['app/', 'components/', 'hooks/'] as const

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

export type Regla =
  | 'cabecera'
  | 'celda'
  | 'orden'
  | 'cita'
  | 'sin-fila'
  | 'archivo-sin-fila'
  | 'fila-huerfana'
  | 'pieza-no-exportada'
  | 'base-desconocida'
  | 'export-estrella'
  | 'fila-duplicada'
  | 'diseno-invalido'
  | 'diseno-requerido'
  | 'diseno-inexistente'
  | 'previa-muerta'
  | 'sistema-desincronizado'

export type Hallazgo = {
  readonly regla: Regla
  readonly archivo: string
  readonly pieza?: string
  /** Línea del catálogo donde está la fila. */
  readonly fila?: number
  readonly accion: string
  readonly detalle?: string
}

export type Diseno =
  | { readonly tipo: 'previo' }
  | { readonly tipo: 'sin-ui' }
  | { readonly tipo: 'tablero'; readonly rutas: readonly string[] }
  | { readonly tipo: 'invalido' }

export type Fila = {
  readonly seccion: ClaveSeccion
  readonly linea: number
  readonly piezas: readonly string[]
  readonly archivo: string | null
  readonly base: readonly string[]
  readonly diseno: Diseno
}

export type Seccion = { readonly clave: ClaveSeccion; readonly filas: readonly Fila[] }

export type Catalogo = { readonly secciones: readonly Seccion[]; readonly hallazgos: readonly Hallazgo[] }

/** El árbol que la guardia mira: fuentes `.ts`/`.tsx` de producción y el resto de rutas que existen. */
export type Arbol = {
  readonly fuentes: ReadonlyMap<string, string>
  readonly existentes: ReadonlySet<string>
}

export type Export = { readonly nombre: string; readonly desde?: string }

// ---------------------------------------------------------------------------------------------
// El parser del catálogo (R1–R4, R11, R28)
// ---------------------------------------------------------------------------------------------

/** Parte una fila de tabla en celdas. Un `|` entre backticks o escapado no separa. */
export function celdas(linea: string): string[] {
  let texto = linea.trim()
  if (texto.startsWith('|')) texto = texto.slice(1)
  if (texto.endsWith('|') && !texto.endsWith('\\|')) texto = texto.slice(0, -1)
  const salida: string[] = []
  let actual = ''
  let enCodigo = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '\\' && texto[i + 1] === '|') {
      actual += '|'
      i++
      continue
    }
    if (c === '`') enCodigo = !enCodigo
    if (c === '|' && !enCodigo) {
      salida.push(actual.trim())
      actual = ''
      continue
    }
    actual += c
  }
  salida.push(actual.trim())
  return salida
}

function entreBackticks(texto: string): string[] {
  return [...texto.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '')
}

const IDENTIFICADOR = /^[A-Za-z_$][\w$]*$/

function leerDiseno(celda: string, seccion: ClaveSeccion, archivo: string | null): Diseno {
  const texto = celda.trim()
  if (texto === PREVIO) return { tipo: 'previo' }
  if (texto === SIN_UI) {
    const permitido =
      seccion === 'apoyos' ||
      (seccion === 'compuestos' &&
        archivo !== null &&
        archivo.endsWith('.ts') &&
        !archivo.endsWith('/index.ts'))
    return permitido ? { tipo: 'sin-ui' } : { tipo: 'invalido' }
  }
  const rutas = entreBackticks(texto)
  if (
    rutas.length > 0 &&
    rutas.every((r) => RUTA_DE_TABLERO.test(r)) &&
    !texto.includes(PREVIO) &&
    !texto.includes(SIN_UI)
  ) {
    return { tipo: 'tablero', rutas }
  }
  return { tipo: 'invalido' }
}

/** Parsea el catálogo y valida su forma: secciones, columnas, celdas, orden, citas y `Diseño`. */
export function leerCatalogo(md: string): Catalogo {
  const lineas = md.split(/\r?\n/)
  const hallazgos: Hallazgo[] = []
  const anotar = (regla: Regla, accion: string, detalle: string, fila?: number) => {
    hallazgos.push(
      fila === undefined
        ? { regla, archivo: CATALOGO, accion, detalle }
        : { regla, archivo: CATALOGO, fila, accion, detalle },
    )
  }

  const encabezados = lineas
    .map((texto, i) => ({ texto: texto.trimEnd(), i }))
    .filter((l) => /^## /.test(l.texto))
  const esperados = SECCIONES.map((s) => s.titulo)
  if (
    encabezados.length !== esperados.length ||
    encabezados.some((e, i) => e.texto !== esperados[i])
  ) {
    anotar(
      'cabecera',
      'deja exactamente las tres secciones, con esos títulos y en ese orden',
      `esperadas: ${esperados.join(' | ')}; encontradas: ${encabezados.map((e) => e.texto).join(' | ') || '(ninguna)'}`,
    )
  }

  const secciones: Seccion[] = []
  for (const { clave, titulo } of SECCIONES) {
    const pos = encabezados.findIndex((e) => e.texto === titulo)
    if (pos === -1) continue
    const desde = (encabezados[pos]?.i ?? 0) + 1
    const hasta = encabezados[pos + 1]?.i ?? lineas.length

    const bloques: { linea: number; texto: string }[][] = []
    let bloque: { linea: number; texto: string }[] | null = null
    for (let i = desde; i < hasta; i++) {
      const texto = (lineas[i] ?? '').trim()
      if (texto.startsWith('|')) {
        if (bloque === null) {
          bloque = []
          bloques.push(bloque)
        }
        bloque.push({ linea: i + 1, texto })
      } else {
        bloque = null
      }
    }
    if (bloques.length !== 1) {
      anotar('cabecera', 'deja una única tabla en la sección', `${titulo}: ${bloques.length} tablas`)
    }
    const tabla = bloques[0] ?? []
    const cabecera = tabla[0]
    if (cabecera === undefined) {
      secciones.push({ clave, filas: [] })
      continue
    }
    const columnas = celdas(cabecera.texto)
    if (columnas.length !== COLUMNAS.length || columnas.some((c, i) => c !== COLUMNAS[i])) {
      anotar(
        'cabecera',
        `pon las columnas ${COLUMNAS.join(' | ')}`,
        `${titulo}: ${columnas.join(' | ')}`,
        cabecera.linea,
      )
    }
    const separador = tabla[1]
    if (separador === undefined || !/^\|(\s*:?-+:?\s*\|)+$/.test(separador.texto)) {
      anotar('cabecera', 'pon la fila separadora `|---|` bajo la cabecera', titulo, cabecera.linea)
    }

    const filas: Fila[] = []
    for (const { linea, texto } of tabla.slice(2)) {
      const c = celdas(texto)
      if (c.length !== COLUMNAS.length) {
        anotar('celda', 'corrige la fila', `tiene ${c.length} celdas y no ${COLUMNAS.length}`, linea)
        continue
      }
      const [pieza = '', archivoCelda = '', paraQue = '', alcance = '', puntos = '', base = '', diseno = ''] = c

      const piezas = entreBackticks(pieza)
      if (piezas.length === 0 || piezas.some((p) => !IDENTIFICADOR.test(p))) {
        anotar('celda', 'corrige la fila', '`Pieza` lleva uno o más nombres entre backticks', linea)
      }
      const rutas = entreBackticks(archivoCelda)
      const ruta = rutas[0]
      let archivo: string | null = null
      if (
        rutas.length !== 1 ||
        ruta === undefined ||
        archivoCelda !== `\`${ruta}\`` ||
        /^[./]/.test(ruta) ||
        ruta.includes('\\')
      ) {
        anotar(
          'celda',
          'corrige la fila',
          '`Archivo` lleva exactamente una ruta entre backticks, relativa a la raíz',
          linea,
        )
      } else {
        archivo = ruta
      }
      if (paraQue === '') anotar('celda', 'corrige la fila', '`Para qué` vacía', linea)
      if (!alcance.includes('Cubre:') || !alcance.includes('No cubre:')) {
        anotar('celda', 'corrige la fila', '`Alcance` lleva «Cubre:» y «No cubre:»', linea)
      }
      if (puntos === '') anotar('celda', 'corrige la fila', '`Puntos de extensión` vacía (usa —)', linea)
      if (base === '') anotar('celda', 'corrige la fila', '`Base de` vacía (usa —)', linea)

      const d = leerDiseno(diseno, clave, archivo)
      if (d.tipo === 'invalido') {
        anotar(
          'diseno-invalido',
          `pon \`${PREVIO}\`, la ruta \`docs/diseno/canvas/<Nombre>.dc.html\` de su tablero o, si no pinta, \`${SIN_UI}\``,
          `\`Diseño\` = «${diseno}»`,
          linea,
        )
      }
      filas.push({ seccion: clave, linea, piezas, archivo, base: entreBackticks(base), diseno: d })
    }

    let anterior: string | null = null
    for (const f of filas) {
      if (f.archivo === null) continue
      if (anterior !== null && f.archivo < anterior) {
        anotar(
          'orden',
          'inserta la fila en su sitio, por `Archivo` ascendente',
          `${f.archivo} va antes que ${anterior}`,
          f.linea,
        )
      }
      anterior = f.archivo
    }
    secciones.push({ clave, filas })
  }

  lineas.forEach((texto, i) => {
    const citas = [
      ...texto.matchAll(/QC-\d+/g),
      ...texto.matchAll(/(?:^|[^\w-])(R\d+)(?!\w)/g),
    ].map((m) => (m[1] ?? m[0]).trim())
    for (const cita of citas) {
      anotar('cita', 'quita la cita: la historia vive en specs/ y en git', cita, i + 1)
    }
  })

  return { secciones, hallazgos }
}

// ---------------------------------------------------------------------------------------------
// El analizador de código (R5–R10)
// ---------------------------------------------------------------------------------------------

function fuenteTs(archivo: string, fuente: string): ts.SourceFile {
  return ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function nombresDeEnlace(nombre: ts.BindingName): string[] {
  if (ts.isIdentifier(nombre)) return [nombre.text]
  const elementos: readonly ts.ArrayBindingElement[] = nombre.elements
  return elementos.flatMap((e) => (ts.isOmittedExpression(e) ? [] : nombresDeEnlace(e.name)))
}

function tieneModificador(n: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind)
}

/**
 * Los exports de valor de un archivo. Excluye `export type`, `interface` y los especificadores
 * `type X`. Un `export { A } from './a'` lleva `desde`; un `export *` (con o sin `as`) sale como
 * `{ nombre: '*' }` porque su superficie no se puede enumerar.
 */
export function exportsDeValor(archivo: string, fuente: string): readonly Export[] {
  const sf = fuenteTs(archivo, fuente)
  const tipos = new Set<string>()
  const valores = new Set<string>()
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) tipos.add(st.name.text)
    else if (
      (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) &&
      st.name !== undefined
    ) {
      valores.add(st.name.text)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) nombresDeEnlace(d.name).forEach((n) => valores.add(n))
    } else if (ts.isImportDeclaration(st) && st.importClause !== undefined) {
      const clausula = st.importClause
      const destino = clausula.isTypeOnly ? tipos : valores
      if (clausula.name !== undefined) destino.add(clausula.name.text)
      const enlaces = clausula.namedBindings
      if (enlaces !== undefined && ts.isNamedImports(enlaces)) {
        for (const e of enlaces.elements) (e.isTypeOnly ? tipos : destino).add(e.name.text)
      } else if (enlaces !== undefined) {
        destino.add(enlaces.name.text)
      }
    }
  }

  const salida: Export[] = []
  const vistos = new Set<string>()
  const anotar = (nombre: string, desde?: string) => {
    const clave = `${nombre}\u0000${desde ?? ''}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    salida.push(desde === undefined ? { nombre } : { nombre, desde })
  }

  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue
      const desde =
        st.moduleSpecifier !== undefined && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : undefined
      if (st.exportClause === undefined || ts.isNamespaceExport(st.exportClause)) {
        anotar('*', desde)
        continue
      }
      for (const e of st.exportClause.elements) {
        if (e.isTypeOnly) continue
        const local = (e.propertyName ?? e.name).text
        if (desde === undefined && tipos.has(local) && !valores.has(local)) continue
        anotar(e.name.text, desde)
      }
      continue
    }
    if (ts.isExportAssignment(st)) {
      anotar('default')
      continue
    }
    if (!tieneModificador(st, ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isModuleDeclaration(st)) {
      continue
    }
    if (tieneModificador(st, ts.SyntaxKind.DefaultKeyword)) {
      anotar('default')
      continue
    }
    if (
      (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) &&
      st.name !== undefined
    ) {
      anotar(st.name.text)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) nombresDeEnlace(d.name).forEach((n) => anotar(n))
    }
  }
  return salida
}

/** Un componente: empieza por mayúscula y lleva alguna minúscula (`DataTable` sí, `PDF_TYPE` no). */
export function esComponente(nombre: string): boolean {
  return /^[A-Z]/.test(nombre) && /[a-z]/.test(nombre)
}

/** Lo que un archivo importa (o reexporta) por valor: especificador y nombres originales. */
function importsDeValor(archivo: string, fuente: string): { especificador: string; nombres: string[] }[] {
  const sf = fuenteTs(archivo, fuente)
  const salida: { especificador: string; nombres: string[] }[] = []
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const clausula = st.importClause
      if (clausula === undefined || clausula.isTypeOnly || !ts.isStringLiteral(st.moduleSpecifier)) continue
      const nombres: string[] = []
      if (clausula.name !== undefined) nombres.push('default')
      const enlaces = clausula.namedBindings
      if (enlaces !== undefined && ts.isNamedImports(enlaces)) {
        for (const e of enlaces.elements) if (!e.isTypeOnly) nombres.push((e.propertyName ?? e.name).text)
      } else if (enlaces !== undefined) {
        nombres.push('*')
      }
      salida.push({ especificador: st.moduleSpecifier.text, nombres })
    } else if (
      ts.isExportDeclaration(st) &&
      !st.isTypeOnly &&
      st.moduleSpecifier !== undefined &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      const nombres =
        st.exportClause === undefined || ts.isNamespaceExport(st.exportClause)
          ? ['*']
          : st.exportClause.elements.filter((e) => !e.isTypeOnly).map((e) => (e.propertyName ?? e.name).text)
      salida.push({ especificador: st.moduleSpecifier.text, nombres })
    }
  }
  return salida
}

/** Resuelve un especificador `@/…` o relativo a una ruta del árbol; si no, `null`. */
function resolver(desde: string, especificador: string, rutas: ReadonlySet<string>): string | null {
  let base: string
  if (especificador.startsWith('@/')) base = especificador.slice(2)
  else if (especificador.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(desde), especificador))
  else return null
  for (const candidato of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (rutas.has(candidato)) return candidato
  }
  return null
}

const BARREL = /^components\/shared\/([^/]+)\/index\.ts$/

function esProduccion(ruta: string): boolean {
  return /\.tsx?$/.test(ruta) && !/\.(test|spec)\.tsx?$/.test(ruta) && !ruta.endsWith('.d.ts')
}

function modulosConBarrel(rutas: Iterable<string>): Set<string> {
  const salida = new Set<string>()
  for (const r of rutas) {
    const m = BARREL.exec(r)
    if (m?.[1] !== undefined) salida.add(m[1])
  }
  return salida
}

/**
 * Lo que `app/`, `components/` y `hooks/` importan por ruta profunda de un módulo con barrel de
 * `components/shared` desde fuera de ese módulo: archivo importado → nombres.
 */
export function importsProfundos(
  archivos: readonly { readonly ruta: string; readonly fuente: string }[],
): Map<string, Set<string>> {
  const rutas = new Set(archivos.map((a) => a.ruta))
  const modulos = modulosConBarrel(rutas)
  const salida = new Map<string, Set<string>>()
  for (const { ruta, fuente } of archivos) {
    if (!CARPETAS_IMPORTADORAS.some((c) => ruta.startsWith(c)) || !esProduccion(ruta)) continue
    for (const { especificador, nombres } of importsDeValor(ruta, fuente)) {
      const destino = resolver(ruta, especificador, rutas)
      if (destino === null) continue
      const m = /^components\/shared\/([^/]+)\/(.+)$/.exec(destino)
      const modulo = m?.[1]
      if (modulo === undefined || !modulos.has(modulo) || m?.[2] === 'index.ts') continue
      if (ruta.startsWith(`components/shared/${modulo}/`)) continue
      const conjunto = salida.get(destino) ?? new Set<string>()
      nombres.forEach((n) => conjunto.add(n))
      salida.set(destino, conjunto)
    }
  }
  return salida
}

export type ComponentePublico = { readonly nombre: string; readonly archivo: string }

/** Archivos de entrada: `.ts`/`.tsx` sueltos en `components/shared/` y cada `index.ts` de módulo. */
export function archivosDeEntrada(arbol: Arbol): string[] {
  return [...arbol.fuentes.keys()]
    .filter((r) => esProduccion(r) && (/^components\/shared\/[^/]+\.tsx?$/.test(r) || BARREL.test(r)))
    .sort()
}

/** Componentes públicos de `components/shared`: (a) `.tsx` suelto, (b) barrel, (c) import profundo. */
export function componentesPublicos(arbol: Arbol): ComponentePublico[] {
  const enCache = publicosPorArbol.get(arbol)
  if (enCache !== undefined) return enCache
  const salida: ComponentePublico[] = []
  const vistos = new Set<string>()
  const anotar = (nombre: string, archivo: string) => {
    const clave = `${nombre}\u0000${archivo}`
    if (vistos.has(clave) || !esComponente(nombre)) return
    vistos.add(clave)
    salida.push({ nombre, archivo })
  }
  for (const [ruta, fuente] of arbol.fuentes) {
    if (!esProduccion(ruta)) continue
    if (/^components\/shared\/[^/]+\.tsx$/.test(ruta) || BARREL.test(ruta)) {
      for (const e of exportsDeValor(ruta, fuente)) anotar(e.nombre, ruta)
    }
  }
  const archivos = [...arbol.fuentes].map(([ruta, fuente]) => ({ ruta, fuente }))
  for (const [ruta, nombres] of importsProfundos(archivos)) {
    if (!ruta.endsWith('.tsx')) continue
    const exportados = new Set(exportsDeValor(ruta, arbol.fuentes.get(ruta) ?? '').map((e) => e.nombre))
    for (const n of nombres) if (exportados.has(n)) anotar(n, ruta)
  }
  salida.sort((a, b) => (a.archivo + a.nombre < b.archivo + b.nombre ? -1 : 1))
  publicosPorArbol.set(arbol, salida)
  return salida
}

/** Recorrer `app/` entero es lo caro; varios casos lo piden sobre el mismo árbol. */
const publicosPorArbol = new WeakMap<Arbol, ComponentePublico[]>()

const DE_LA_SECCION: Record<ClaveSeccion, (ruta: string) => boolean> = {
  primitivos: (r) => /^components\/ui\/.+\.tsx$/.test(r) && esProduccion(r),
  compuestos: (r) => /^components\/shared\/.+\.tsx?$/.test(r) && esProduccion(r),
  apoyos: (r) => /^(lib\/shared\/ui|hooks)\/.+\.tsx?$/.test(r) && esProduccion(r),
}

const NOMBRE_SECCION: Record<ClaveSeccion, string> = {
  primitivos: 'Primitivos',
  compuestos: 'Compuestos',
  apoyos: 'Apoyos',
}

function filasDe(catalogo: Catalogo, clave: ClaveSeccion): readonly Fila[] {
  return catalogo.secciones.find((s) => s.clave === clave)?.filas ?? []
}

/** Cruza el catálogo con el árbol: piezas sin fila, filas huérfanas, `Base de` y `export *`. */
export function cruzar(catalogo: Catalogo, arbol: Arbol): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const compuestos = filasDe(catalogo, 'compuestos')

  for (const p of componentesPublicos(arbol)) {
    const n = compuestos.filter((f) => f.archivo === p.archivo && f.piezas.includes(p.nombre)).length
    if (n === 0) {
      hallazgos.push({
        regla: 'sin-fila',
        archivo: p.archivo,
        pieza: p.nombre,
        accion: 'añade su fila en Compuestos',
      })
    } else if (n > 1) {
      hallazgos.push({
        regla: 'fila-duplicada',
        archivo: p.archivo,
        pieza: p.nombre,
        accion: 'quita o corrige la fila: la pieza va en una sola',
      })
    }
  }

  for (const entrada of archivosDeEntrada(arbol)) {
    if (!compuestos.some((f) => f.archivo === entrada)) {
      hallazgos.push({ regla: 'archivo-sin-fila', archivo: entrada, accion: 'añade su fila en Compuestos' })
    }
  }

  for (const clave of ['primitivos', 'apoyos'] as const) {
    const filas = filasDe(catalogo, clave)
    for (const ruta of [...arbol.fuentes.keys()].filter(DE_LA_SECCION[clave]).sort()) {
      const n = filas.filter((f) => f.archivo === ruta).length
      if (n === 0) {
        hallazgos.push({
          regla: 'archivo-sin-fila',
          archivo: ruta,
          accion: `añade su fila en ${NOMBRE_SECCION[clave]}`,
        })
      } else if (n > 1) {
        hallazgos.push({
          regla: 'fila-duplicada',
          archivo: ruta,
          accion: 'quita o corrige la fila: el archivo va en una sola',
        })
      }
    }
  }

  const todasLasPiezas = new Set(catalogo.secciones.flatMap((s) => s.filas.flatMap((f) => f.piezas)))
  for (const seccion of catalogo.secciones) {
    for (const f of seccion.filas) {
      if (f.archivo !== null) {
        const fuente = arbol.fuentes.get(f.archivo)
        if (!DE_LA_SECCION[seccion.clave](f.archivo) || fuente === undefined) {
          hallazgos.push({
            regla: 'fila-huerfana',
            archivo: f.archivo,
            fila: f.linea,
            accion: 'quita o corrige la fila',
            detalle:
              fuente === undefined
                ? 'el archivo no existe'
                : `el archivo no es de ${NOMBRE_SECCION[seccion.clave]}`,
          })
        } else {
          const exportados = new Set(exportsDeValor(f.archivo, fuente).map((e) => e.nombre))
          for (const pieza of f.piezas) {
            if (!exportados.has(pieza)) {
              hallazgos.push({
                regla: 'pieza-no-exportada',
                archivo: f.archivo,
                pieza,
                fila: f.linea,
                accion: 'quita o corrige la fila: el archivo no lo exporta como valor',
              })
            }
          }
        }
      }
      for (const b of f.base) {
        if (!todasLasPiezas.has(b)) {
          hallazgos.push({
            regla: 'base-desconocida',
            archivo: f.archivo ?? CATALOGO,
            pieza: b,
            fila: f.linea,
            accion: 'quita o corrige la fila: `Base de` solo cita piezas del catálogo',
          })
        }
      }
    }
  }

  for (const ruta of [...arbol.fuentes.keys()].filter((r) => BARREL.test(r)).sort()) {
    if (exportsDeValor(ruta, arbol.fuentes.get(ruta) ?? '').some((e) => e.nombre === '*')) {
      hallazgos.push({
        regla: 'export-estrella',
        archivo: ruta,
        accion: 'cambia el `export *` por la lista de lo que el barrel expone',
      })
    }
  }
  return hallazgos
}

/** La columna `Diseño` contra el árbol y la lista de piezas previas (R29–R31). */
export function cruzarDiseno(
  catalogo: Catalogo,
  arbol: Arbol,
  previas: readonly string[] = PIEZAS_PREVIAS_AL_REDISENO,
): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  for (const seccion of catalogo.secciones) {
    for (const f of seccion.filas) {
      const archivo = f.archivo ?? CATALOGO
      if (
        f.diseno.tipo === 'previo' &&
        seccion.clave !== 'apoyos' &&
        (f.archivo === null || !previas.includes(f.archivo))
      ) {
        hallazgos.push({
          regla: 'diseno-requerido',
          archivo,
          fila: f.linea,
          accion: 'cita su tablero `docs/diseno/canvas/…` en `Diseño`: es una pieza nueva',
        })
      }
      if (f.diseno.tipo === 'tablero') {
        for (const ruta of f.diseno.rutas) {
          if (!arbol.existentes.has(ruta)) {
            hallazgos.push({
              regla: 'diseno-inexistente',
              archivo,
              fila: f.linea,
              accion: 'quita o corrige la fila: copia el tablero aprobado o corrige la ruta',
              detalle: ruta,
            })
          }
        }
      }
    }
  }
  for (const previa of previas) {
    if (!arbol.fuentes.has(previa)) {
      hallazgos.push({
        regla: 'previa-muerta',
        archivo: previa,
        accion: 'quítala de PIEZAS_PREVIAS_AL_REDISENO: el archivo ya no existe',
      })
    }
  }
  return hallazgos
}

/** `sistema.css` y `canvas/qc.css` son el mismo archivo (R34). */
export function compararSistema(sistema: Buffer, qc: Buffer): Hallazgo[] {
  return sistema.equals(qc)
    ? []
    : [
        {
          regla: 'sistema-desincronizado',
          archivo: 'docs/diseno/sistema.css',
          accion: 'copia `docs/diseno/canvas/qc.css` sobre `docs/diseno/sistema.css` (o al revés) para que sean idénticos',
        },
      ]
}

/** El texto del fallo: `regla · archivo · pieza/fila · acción`, un hallazgo por línea. */
export function informe(hallazgos: readonly Hallazgo[]): string {
  return hallazgos
    .map((h) => {
      const donde = [
        h.pieza !== undefined ? `pieza ${h.pieza}` : null,
        h.fila !== undefined ? `fila (línea ${h.fila})` : null,
      ]
        .filter((x) => x !== null)
        .join(', ')
      const detalle = h.detalle !== undefined ? ` (${h.detalle})` : ''
      return `  [${h.regla}] · ${h.archivo} · ${donde || '—'} · ${h.accion}${detalle}`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------------------------
// El repositorio real
// ---------------------------------------------------------------------------------------------

function listar(carpeta: string): string[] {
  const salida: string[] = []
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre.startsWith('.')) continue
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else salida.push(relative(repoRoot, ruta).split('\\').join('/'))
    }
  }
  const raiz = join(repoRoot, carpeta)
  if (existsSync(raiz)) recorrer(raiz)
  return salida
}

let arbolCache: Arbol | null = null

function arbolReal(): Arbol {
  if (arbolCache !== null) return arbolCache
  const fuentes = new Map<string, string>()
  for (const carpeta of CARPETAS_DEL_ARBOL) {
    for (const ruta of listar(carpeta)) {
      if (esProduccion(ruta)) fuentes.set(ruta, readFileSync(join(repoRoot, ruta), 'utf8'))
    }
  }
  const existentes = new Set<string>([...fuentes.keys(), ...listar('docs/diseno')])
  arbolCache = { fuentes, existentes }
  return arbolCache
}

function leerTexto(ruta: string): string | null {
  const absoluta = join(repoRoot, ruta)
  return existsSync(absoluta) ? readFileSync(absoluta, 'utf8') : null
}

function catalogoReal(): Catalogo {
  return leerCatalogo(leerTexto(CATALOGO) ?? '')
}

/** Para los casos que pasarían en vacío sin catálogo. */
function exigirCatalogoConFilas(catalogo: Catalogo): void {
  expect(leerTexto(CATALOGO), `${CATALOGO} no existe`).not.toBeNull()
  const filas = catalogo.secciones.reduce((n, s) => n + s.filas.length, 0)
  expect(filas, `${CATALOGO} no tiene filas: este caso pasaría sin mirar nada`).toBeGreaterThan(0)
}

function soloReglas(hallazgos: readonly Hallazgo[], reglas: readonly Regla[]): Hallazgo[] {
  return hallazgos.filter((h) => reglas.includes(h.regla))
}

// ---------------------------------------------------------------------------------------------
// Muestras sintéticas
// ---------------------------------------------------------------------------------------------

type FilaMuestra = {
  readonly pieza: readonly string[]
  readonly archivo: string
  readonly base?: readonly string[]
  readonly diseno?: string
  readonly alcance?: string
  readonly paraQue?: string
}

function filaMd(f: FilaMuestra): string {
  const base = f.base === undefined || f.base.length === 0 ? '—' : f.base.map((b) => `\`${b}\``).join(', ')
  return [
    '',
    f.pieza.map((p) => `\`${p}\``).join(', '),
    `\`${f.archivo}\``,
    f.paraQue ?? 'Para algo.',
    f.alcance ?? 'Cubre: lo suyo. No cubre: lo ajeno.',
    '—',
    base,
    f.diseno ?? PREVIO,
    '',
  ]
    .join(' | ')
    .trim()
}

function tablaMd(titulo: string, filas: readonly FilaMuestra[]): string {
  return [
    titulo,
    '',
    `| ${COLUMNAS.join(' | ')} |`,
    `|${COLUMNAS.map(() => '---').join('|')}|`,
    ...filas.map(filaMd),
  ].join('\n')
}

function catalogoMd(filas: {
  readonly primitivos: readonly FilaMuestra[]
  readonly compuestos: readonly FilaMuestra[]
  readonly apoyos: readonly FilaMuestra[]
}): string {
  return [
    '# Catálogo de componentes',
    '',
    'Índice de piezas.',
    '',
    tablaMd(SECCIONES[0]?.titulo ?? '', filas.primitivos),
    '',
    tablaMd(SECCIONES[1]?.titulo ?? '', filas.compuestos),
    '',
    tablaMd(SECCIONES[2]?.titulo ?? '', filas.apoyos),
    '',
  ].join('\n')
}

function arbolDe(fuentes: Record<string, string>, otros: readonly string[] = []): Arbol {
  const mapa = new Map(Object.entries(fuentes))
  return { fuentes: mapa, existentes: new Set([...mapa.keys(), ...otros]) }
}

const TABLERO = 'docs/diseno/canvas/Botones.dc.html'

const FUENTES_BASE: Record<string, string> = {
  'components/ui/button.tsx':
    "export function Button() { return null }\nexport const buttonVariants = () => ''\nexport type ButtonProps = { a: 1 }\n",
  'components/shared/empty-state.tsx':
    "import { Button } from '@/components/ui/button'\nexport function EmptyState() { return Button() }\n",
  'components/shared/file-types.ts': "export const ACCEPTED_TYPES = ['pdf']\n",
  'components/shared/visor/index.ts':
    "export { Visor } from './visor'\nexport type { VisorProps } from './visor'\n",
  'components/shared/visor/visor.tsx':
    'export function Visor() { return null }\nexport type VisorProps = { a: 1 }\n',
  'components/shared/visor/vista.tsx': 'export function VistaDocumento() { return null }\n',
  'app/(private)/x/components/pantalla.tsx':
    "import { VistaDocumento } from '@/components/shared/visor/vista'\nimport { Visor } from '@/components/shared/visor'\nexport function Pantalla() { return [Visor, VistaDocumento] }\n",
  'lib/shared/ui/touch-target.ts': "export const touchTarget = 'min-h-11'\n",
  'hooks/use-mobile.ts': 'export function useIsMobile() { return false }\n',
}

const FILAS_BASE = {
  primitivos: [{ pieza: ['Button', 'buttonVariants'], archivo: 'components/ui/button.tsx' }],
  compuestos: [
    { pieza: ['EmptyState'], archivo: 'components/shared/empty-state.tsx', base: ['Button'] },
    { pieza: ['ACCEPTED_TYPES'], archivo: 'components/shared/file-types.ts', diseno: SIN_UI },
    { pieza: ['Visor'], archivo: 'components/shared/visor/index.ts' },
    { pieza: ['VistaDocumento'], archivo: 'components/shared/visor/vista.tsx' },
  ],
  apoyos: [
    { pieza: ['useIsMobile'], archivo: 'hooks/use-mobile.ts', diseno: SIN_UI },
    { pieza: ['touchTarget'], archivo: 'lib/shared/ui/touch-target.ts', diseno: SIN_UI },
  ],
} satisfies Record<ClaveSeccion, FilaMuestra[]>

const PREVIAS_BASE = [
  'components/shared/empty-state.tsx',
  'components/shared/visor/index.ts',
  'components/shared/visor/vista.tsx',
  'components/ui/button.tsx',
]

/** Todos los hallazgos de una muestra: forma, correspondencia y `Diseño`. */
function todo(md: string, arbol: Arbol, previas: readonly string[] = PREVIAS_BASE): Hallazgo[] {
  const catalogo = leerCatalogo(md)
  return [...catalogo.hallazgos, ...cruzar(catalogo, arbol), ...cruzarDiseno(catalogo, arbol, previas)]
}

const arbolBase = () => arbolDe(FUENTES_BASE, [TABLERO])

describe('guard-catalogo-de-componentes — muestras sintéticas', () => {
  it('R14 la muestra base cumple todas las reglas (la simétrica de cada violación)', () => {
    const hallazgos = todo(catalogoMd(FILAS_BASE), arbolBase())
    expect(hallazgos, informe(hallazgos)).toEqual([])
  })

  describe('exportsDeValor y esComponente', () => {
    it('R5 R8 exportsDeValor excluye tipos y lee alias, reexportaciones y export *', () => {
      const fuente = [
        "import type { Algo } from './algo'",
        'type Local = { a: 1 }',
        'interface Otra { b: 2 }',
        'const Valor = 1',
        'export { Valor as Renombrado, type Local, Otra }',
        'export type { Algo }',
        'export function Pieza() { return null }',
        'export const { a, b: [c] } = { a: 1, b: [2] }',
        "export { Fuera, type FueraProps } from './fuera'",
        "export * from './todo'",
        'export default function Principal() { return null }',
        'export enum Modo { A }',
      ].join('\n')
      expect(exportsDeValor('x.tsx', fuente)).toEqual([
        { nombre: 'Renombrado' },
        { nombre: 'Pieza' },
        { nombre: 'a' },
        { nombre: 'c' },
        { nombre: 'Fuera', desde: './fuera' },
        { nombre: '*', desde: './todo' },
        { nombre: 'default' },
        { nombre: 'Modo' },
      ])
    })

    it('R5 esComponente: mayúscula inicial y alguna minúscula', () => {
      expect(['DataTable', 'Button', 'X1y'].every(esComponente)).toBe(true)
      expect(['PDF_CONTENT_TYPE', 'actionsColumn', 'useBatchStatus', 'X'].some(esComponente)).toBe(false)
    })
  })

  describe('R1 R2 cabecera', () => {
    it('R1 falta una sección o cambia el orden: rojo', () => {
      const sinApoyos = catalogoMd(FILAS_BASE).split(SECCIONES[2]?.titulo ?? '')[0] ?? ''
      expect(leerCatalogo(sinApoyos).hallazgos.map((h) => h.regla)).toContain('cabecera')
      const desordenado = catalogoMd(FILAS_BASE)
        .replace(SECCIONES[0]?.titulo ?? '', '## TMP')
        .replace(SECCIONES[1]?.titulo ?? '', SECCIONES[0]?.titulo ?? '')
        .replace('## TMP', SECCIONES[1]?.titulo ?? '')
      expect(leerCatalogo(desordenado).hallazgos.map((h) => h.regla)).toContain('cabecera')
    })

    it('R1 una sección extra o con dos tablas: rojo', () => {
      const extra = `${catalogoMd(FILAS_BASE)}\n## Privados — components/private\n`
      expect(leerCatalogo(extra).hallazgos.map((h) => h.regla)).toContain('cabecera')
      const dosTablas = catalogoMd(FILAS_BASE).replace(
        SECCIONES[1]?.titulo ?? '',
        `${SECCIONES[1]?.titulo ?? ''}\n\n| a | b |\n|---|---|\n\ntexto`,
      )
      expect(leerCatalogo(dosTablas).hallazgos.map((h) => h.regla)).toContain('cabecera')
    })

    it('R2 columnas distintas o en otro orden: rojo; las siete en orden: verde', () => {
      const sinDiseno = catalogoMd(FILAS_BASE).replace('| Base de | Diseño |', '| Diseño | Base de |')
      expect(leerCatalogo(sinDiseno).hallazgos.map((h) => h.regla)).toContain('cabecera')
      expect(leerCatalogo(catalogoMd(FILAS_BASE)).hallazgos).toEqual([])
    })
  })

  describe('R3 celdas', () => {
    const conCompuesto = (f: FilaMuestra) =>
      catalogoMd({ ...FILAS_BASE, compuestos: [f, ...FILAS_BASE.compuestos.slice(1)] })
    const base = FILAS_BASE.compuestos[0] as FilaMuestra

    it('R3 Alcance sin «No cubre:»: rojo', () => {
      const md = conCompuesto({ ...base, alcance: 'Cubre: todo.' })
      expect(leerCatalogo(md).hallazgos.map((h) => h.regla)).toEqual(['celda'])
    })

    it('R3 Pieza sin backticks, Archivo con dos rutas o Para qué vacía: rojo', () => {
      const sinBackticks = conCompuesto(base).replace('`EmptyState`', 'EmptyState')
      expect(leerCatalogo(sinBackticks).hallazgos.map((h) => h.regla)).toContain('celda')
      const dosRutas = conCompuesto(base).replace(
        '`components/shared/empty-state.tsx`',
        '`components/shared/empty-state.tsx`, `components/shared/otro.tsx`',
      )
      expect(leerCatalogo(dosRutas).hallazgos.map((h) => h.regla)).toContain('celda')
      const paraQueVacia = conCompuesto({ ...base, paraQue: ' ' })
      expect(leerCatalogo(paraQueVacia).hallazgos.map((h) => h.regla)).toContain('celda')
    })

    it('R3 una fila completa con `|` dentro de backticks: verde', () => {
      const md = conCompuesto({ ...base, alcance: "Cubre: `'a' | 'b'`. No cubre: nada." })
      expect(leerCatalogo(md).hallazgos).toEqual([])
    })
  })

  describe('R4 orden', () => {
    it('R4 filas desordenadas por Archivo: rojo; ordenadas: verde', () => {
      const [a, b, ...resto] = FILAS_BASE.compuestos
      const md = catalogoMd({ ...FILAS_BASE, compuestos: [b as FilaMuestra, a as FilaMuestra, ...resto] })
      expect(leerCatalogo(md).hallazgos.map((h) => h.regla)).toEqual(['orden'])
      expect(leerCatalogo(catalogoMd(FILAS_BASE)).hallazgos).toEqual([])
    })
  })

  describe('R11 citas', () => {
    it('R11 una cita de ficha o de requisito: rojo; sin citas: verde', () => {
      const conFicha = catalogoMd({
        ...FILAS_BASE,
        apoyos: [{ ...(FILAS_BASE.apoyos[0] as FilaMuestra), paraQue: 'La trajo QC-231.' }, ...FILAS_BASE.apoyos.slice(1)],
      })
      expect(leerCatalogo(conFicha).hallazgos.map((h) => h.regla)).toEqual(['cita'])
      const conRequisito = catalogoMd({
        ...FILAS_BASE,
        apoyos: [{ ...(FILAS_BASE.apoyos[0] as FilaMuestra), paraQue: 'Ver R12.' }, ...FILAS_BASE.apoyos.slice(1)],
      })
      expect(leerCatalogo(conRequisito).hallazgos.map((h) => h.regla)).toEqual(['cita'])
      expect(leerCatalogo(catalogoMd(FILAS_BASE)).hallazgos).toEqual([])
    })
  })

  describe('R5 componentes públicos', () => {
    it('R5 (a) un .tsx suelto sin fila: rojo', () => {
      const md = catalogoMd({ ...FILAS_BASE, compuestos: FILAS_BASE.compuestos.slice(1) })
      const h = cruzar(leerCatalogo(md), arbolBase())
      expect(h).toContainEqual(expect.objectContaining({ regla: 'sin-fila', pieza: 'EmptyState' }))
    })

    it('R5 (b) un componente del barrel sin fila en su index.ts: rojo', () => {
      const compuestos = FILAS_BASE.compuestos.map((f) =>
        f.archivo.endsWith('visor/index.ts') ? { ...f, pieza: ['VistaDocumento'], archivo: 'components/shared/visor/vista.tsx' } : f,
      )
      const md = catalogoMd({ ...FILAS_BASE, compuestos })
      const h = cruzar(leerCatalogo(md), arbolBase())
      expect(h).toContainEqual(
        expect.objectContaining({ regla: 'sin-fila', pieza: 'Visor', archivo: 'components/shared/visor/index.ts' }),
      )
    })

    it('R5 (c) un import profundo desde fuera del módulo lo hace público; desde dentro, no', () => {
      const md = catalogoMd({ ...FILAS_BASE, compuestos: FILAS_BASE.compuestos.slice(0, 3) })
      expect(cruzar(leerCatalogo(md), arbolBase())).toContainEqual(
        expect.objectContaining({ regla: 'sin-fila', pieza: 'VistaDocumento' }),
      )
      const fuentes = {
        ...FUENTES_BASE,
        'app/(private)/x/components/pantalla.tsx': "import { Visor } from '@/components/shared/visor'\n",
        'components/shared/visor/visor.tsx':
          "import { VistaDocumento } from './vista'\nexport function Visor() { return VistaDocumento() }\n",
      }
      expect(componentesPublicos(arbolDe(fuentes)).map((p) => p.nombre)).not.toContain('VistaDocumento')
    })

    it('R5 el mismo componente en dos filas de su archivo: rojo', () => {
      const dup = FILAS_BASE.compuestos[0] as FilaMuestra
      const md = catalogoMd({ ...FILAS_BASE, compuestos: [dup, ...FILAS_BASE.compuestos] })
      expect(cruzar(leerCatalogo(md), arbolBase())).toContainEqual(
        expect.objectContaining({ regla: 'fila-duplicada', pieza: 'EmptyState' }),
      )
    })
  })

  describe('R6 R7 archivos con fila', () => {
    it('R6 un .ts de entrada sin fila: rojo', () => {
      const md = catalogoMd({
        ...FILAS_BASE,
        compuestos: FILAS_BASE.compuestos.filter((f) => !f.archivo.endsWith('file-types.ts')),
      })
      expect(cruzar(leerCatalogo(md), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'archivo-sin-fila', archivo: 'components/shared/file-types.ts' }),
      ])
    })

    it('R7 un primitivo o un apoyo sin fila: rojo; con dos filas: rojo', () => {
      const sinPrimitivo = catalogoMd({ ...FILAS_BASE, primitivos: [] })
      expect(cruzar(leerCatalogo(sinPrimitivo), arbolBase())).toContainEqual(
        expect.objectContaining({ regla: 'archivo-sin-fila', archivo: 'components/ui/button.tsx' }),
      )
      const sinHook = catalogoMd({ ...FILAS_BASE, apoyos: FILAS_BASE.apoyos.slice(1) })
      expect(cruzar(leerCatalogo(sinHook), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'archivo-sin-fila', archivo: 'hooks/use-mobile.ts' }),
      ])
      const doble = catalogoMd({
        ...FILAS_BASE,
        primitivos: [...FILAS_BASE.primitivos, { pieza: ['Button'], archivo: 'components/ui/button.tsx' }],
      })
      expect(cruzar(leerCatalogo(doble), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'fila-duplicada', archivo: 'components/ui/button.tsx' }),
      ])
    })
  })

  describe('R8 filas huérfanas', () => {
    it('R8 una fila con un Archivo que no existe: rojo', () => {
      const md = catalogoMd({
        ...FILAS_BASE,
        apoyos: [...FILAS_BASE.apoyos, { pieza: ['useNada'], archivo: 'lib/shared/ui/zzz.ts', diseno: SIN_UI }],
      })
      expect(cruzar(leerCatalogo(md), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'fila-huerfana', archivo: 'lib/shared/ui/zzz.ts' }),
      ])
    })

    it('R8 una fila que nombra lo que su archivo no exporta como valor: rojo', () => {
      const primitivos = [{ pieza: ['Button', 'ButtonProps'], archivo: 'components/ui/button.tsx' }]
      const md = catalogoMd({ ...FILAS_BASE, primitivos })
      expect(cruzar(leerCatalogo(md), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'pieza-no-exportada', pieza: 'ButtonProps' }),
      ])
    })
  })

  describe('R9 Base de', () => {
    it('R9 Base de cita algo que no es Pieza de ninguna fila: rojo; si lo es: verde', () => {
      const compuestos = FILAS_BASE.compuestos.map((f, i) => (i === 0 ? { ...f, base: ['Button', 'Card'] } : f))
      const md = catalogoMd({ ...FILAS_BASE, compuestos })
      expect(cruzar(leerCatalogo(md), arbolBase())).toEqual([
        expect.objectContaining({ regla: 'base-desconocida', pieza: 'Card' }),
      ])
      expect(cruzar(leerCatalogo(catalogoMd(FILAS_BASE)), arbolBase())).toEqual([])
    })
  })

  describe('R10 export *', () => {
    it('R10 un barrel con export *: rojo', () => {
      const fuentes = { ...FUENTES_BASE, 'components/shared/visor/index.ts': "export * from './visor'\n" }
      const md = catalogoMd({
        ...FILAS_BASE,
        compuestos: FILAS_BASE.compuestos.filter((f) => !f.archivo.endsWith('index.ts')),
      })
      const h = cruzar(leerCatalogo(md), arbolDe(fuentes))
      expect(h).toContainEqual(
        expect.objectContaining({ regla: 'export-estrella', archivo: 'components/shared/visor/index.ts' }),
      )
    })
  })

  describe('R12 informe', () => {
    it('R12 el informe nombra regla, archivo, pieza y la acción que lo corrige', () => {
      const md = catalogoMd({ ...FILAS_BASE, compuestos: FILAS_BASE.compuestos.slice(1) })
      const texto = informe(cruzar(leerCatalogo(md), arbolBase()))
      expect(texto).toContain('[sin-fila]')
      expect(texto).toContain('components/shared/empty-state.tsx')
      expect(texto).toContain('pieza EmptyState')
      expect(texto).toContain('añade su fila')

      const huerfana = catalogoMd({
        ...FILAS_BASE,
        apoyos: [...FILAS_BASE.apoyos, { pieza: ['useNada'], archivo: 'lib/shared/ui/zzz.ts', diseno: SIN_UI }],
      })
      const texto2 = informe(cruzar(leerCatalogo(huerfana), arbolBase()))
      expect(texto2).toMatch(/\[fila-huerfana\] · lib\/shared\/ui\/zzz\.ts · fila \(línea \d+\) · quita o corrige la fila/)
    })
  })

  describe('R13 una pieza nueva solo pide su fila', () => {
    const NUEVO_TABLERO = 'docs/diseno/canvas/Nuevo.dc.html'
    const fuentes = {
      ...FUENTES_BASE,
      'components/shared/nueva-pieza.tsx': 'export function NuevaPieza() { return null }\n',
      'components/shared/nuevo/index.ts': "export { Nuevo } from './nuevo'\n",
      'components/shared/nuevo/nuevo.tsx': 'export function Nuevo() { return null }\n',
      'components/ui/etiqueta.tsx': 'export function Etiqueta() { return null }\n',
      'hooks/use-nuevo.ts': 'export function useNuevo() { return 1 }\n',
    }
    const arbol = arbolDe(fuentes, [TABLERO, NUEVO_TABLERO])

    it('R13 sin sus filas: rojo con sin-fila y archivo-sin-fila', () => {
      const h = todo(catalogoMd(FILAS_BASE), arbol)
      expect(h.map((x) => `${x.regla} ${x.archivo} ${x.pieza ?? ''}`.trim()).sort()).toEqual(
        [
          'archivo-sin-fila components/shared/nueva-pieza.tsx',
          'archivo-sin-fila components/shared/nuevo/index.ts',
          'archivo-sin-fila components/ui/etiqueta.tsx',
          'archivo-sin-fila hooks/use-nuevo.ts',
          'sin-fila components/shared/nueva-pieza.tsx NuevaPieza',
          'sin-fila components/shared/nuevo/index.ts Nuevo',
        ].sort(),
      )
    })

    it('R13 añadiendo solo sus filas, en su sitio: verde', () => {
      const compuestosBase: readonly FilaMuestra[] = FILAS_BASE.compuestos
      const apoyosBase: readonly FilaMuestra[] = FILAS_BASE.apoyos
      const [ef, ft, vi, vv] = compuestosBase as [FilaMuestra, FilaMuestra, FilaMuestra, FilaMuestra]
      const [um, tt] = apoyosBase as [FilaMuestra, FilaMuestra]
      const md = catalogoMd({
        primitivos: [
          ...FILAS_BASE.primitivos,
          { pieza: ['Etiqueta'], archivo: 'components/ui/etiqueta.tsx', diseno: `\`${NUEVO_TABLERO}\`` },
        ],
        compuestos: [
          ef,
          ft,
          { pieza: ['NuevaPieza'], archivo: 'components/shared/nueva-pieza.tsx', diseno: `\`${NUEVO_TABLERO}\`` },
          { pieza: ['Nuevo'], archivo: 'components/shared/nuevo/index.ts', diseno: `\`${NUEVO_TABLERO}\` (tablero Nuevo)` },
          vi,
          vv,
        ],
        apoyos: [um, { pieza: ['useNuevo'], archivo: 'hooks/use-nuevo.ts', diseno: SIN_UI }, tt],
      })
      const h = todo(md, arbol)
      expect(h, informe(h)).toEqual([])
    })
  })

  describe('R28–R31 la columna Diseño', () => {
    const nueva = (diseno: string, archivo = 'components/shared/nueva-pieza.tsx') => {
      const fuentes = { ...FUENTES_BASE, [archivo]: 'export function NuevaPieza() { return null }\n' }
      const compuestos = [...FILAS_BASE.compuestos, { pieza: ['NuevaPieza'], archivo, diseno }].sort((a, b) =>
        a.archivo < b.archivo ? -1 : 1,
      )
      return todo(catalogoMd({ ...FILAS_BASE, compuestos }), arbolDe(fuentes, [TABLERO]))
    }

    it('R29 una fila nueva con «previo al rediseño»: rojo pidiendo su tablero', () => {
      const h = nueva(PREVIO)
      expect(h).toEqual([expect.objectContaining({ regla: 'diseno-requerido' })])
      expect(informe(h)).toContain('docs/diseno/canvas/')
    })

    it('R28 R29 la misma fila con su tablero versionado: verde', () => {
      expect(nueva(`\`${TABLERO}\``)).toEqual([])
    })

    it('R30 una ruta de tablero que no existe: rojo', () => {
      expect(nueva('`docs/diseno/canvas/NoExiste.dc.html`')).toEqual([
        expect.objectContaining({ regla: 'diseno-inexistente', detalle: 'docs/diseno/canvas/NoExiste.dc.html' }),
      ])
    })

    it('R28 R30 «sin UI» en un .tsx de Compuestos, o un valor libre: rojo', () => {
      expect(nueva(SIN_UI).map((h) => h.regla)).toEqual(['diseno-invalido'])
      expect(nueva('pendiente').map((h) => h.regla)).toEqual(['diseno-invalido'])
      expect(nueva('`https://claude.ai/artifact/x`').map((h) => h.regla)).toEqual(['diseno-invalido'])
    })

    it('R28 «sin UI» en Apoyos y en un .ts de Compuestos que no es index.ts: verde', () => {
      expect(todo(catalogoMd(FILAS_BASE), arbolBase())).toEqual([])
      const conIndex = FILAS_BASE.compuestos.map((f) =>
        f.archivo.endsWith('visor/index.ts') ? { ...f, diseno: SIN_UI } : f,
      )
      expect(leerCatalogo(catalogoMd({ ...FILAS_BASE, compuestos: conIndex })).hallazgos.map((h) => h.regla)).toEqual([
        'diseno-invalido',
      ])
    })

    it('R29 un primitivo nuevo con «previo al rediseño»: rojo', () => {
      const fuentes = { ...FUENTES_BASE, 'components/ui/etiqueta.tsx': 'export function Etiqueta() { return null }\n' }
      const md = catalogoMd({
        ...FILAS_BASE,
        primitivos: [...FILAS_BASE.primitivos, { pieza: ['Etiqueta'], archivo: 'components/ui/etiqueta.tsx' }],
      })
      expect(todo(md, arbolDe(fuentes, [TABLERO]))).toEqual([
        expect.objectContaining({ regla: 'diseno-requerido', archivo: 'components/ui/etiqueta.tsx' }),
      ])
    })

    it('R31 una pieza previa cuyo archivo ya no existe: rojo pidiendo quitarla; si existe: verde', () => {
      const catalogo = leerCatalogo(catalogoMd(FILAS_BASE))
      expect(
        cruzarDiseno(catalogo, arbolBase(), [...PREVIAS_BASE, 'components/shared/borrada.tsx']),
      ).toEqual([expect.objectContaining({ regla: 'previa-muerta', archivo: 'components/shared/borrada.tsx' })])
      expect(informe(cruzarDiseno(catalogo, arbolBase(), ['components/shared/borrada.tsx']))).toContain('quítala')
      expect(cruzarDiseno(catalogo, arbolBase(), PREVIAS_BASE)).toEqual([])
    })
  })

  describe('R34 sistema visual', () => {
    it('R34 sistema.css distinto de canvas/qc.css: rojo; idéntico: verde', () => {
      expect(compararSistema(Buffer.from('a{}'), Buffer.from('a{ }')).map((h) => h.regla)).toEqual([
        'sistema-desincronizado',
      ])
      expect(compararSistema(Buffer.from('a{}'), Buffer.from('a{}'))).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Contra el repositorio real
// ---------------------------------------------------------------------------------------------

describe('guard-catalogo-de-componentes — repositorio real', () => {
  it('R14 el recorrido ve el repo: data-table/index.ts, ui/button.tsx y más de 30 componentes públicos', () => {
    const arbol = arbolReal()
    expect(arbol.fuentes.has('components/shared/data-table/index.ts')).toBe(true)
    expect(arbol.fuentes.has('components/ui/button.tsx')).toBe(true)
    expect(componentesPublicos(arbol).length).toBeGreaterThan(30)
  })

  it('R1 R2 R3 R4 R11 R15 el catálogo existe y tiene formato válido', () => {
    expect(leerTexto(CATALOGO), `${CATALOGO} no existe`).not.toBeNull()
    const h = soloReglas(catalogoReal().hallazgos, ['cabecera', 'celda', 'orden', 'cita'])
    expect(h, informe(h)).toEqual([])
  })

  it('R5 R15 cada componente público de components/shared tiene exactamente una fila', () => {
    const h = cruzar(catalogoReal(), arbolReal()).filter(
      (x) => x.regla === 'sin-fila' || (x.regla === 'fila-duplicada' && x.pieza !== undefined),
    )
    expect(h, `Componentes públicos sin su fila:\n${informe(h)}`).toEqual([])
  })

  it('R6 R7 R15 cada archivo de entrada tiene fila; cada primitivo y apoyo, exactamente una', () => {
    const h = cruzar(catalogoReal(), arbolReal()).filter(
      (x) => x.regla === 'archivo-sin-fila' || (x.regla === 'fila-duplicada' && x.pieza === undefined),
    )
    expect(h, `Archivos sin su fila:\n${informe(h)}`).toEqual([])
  })

  it('R8 R15 ninguna fila es huérfana ni nombra lo que su archivo no exporta', () => {
    const catalogo = catalogoReal()
    exigirCatalogoConFilas(catalogo)
    const h = soloReglas(cruzar(catalogo, arbolReal()), ['fila-huerfana', 'pieza-no-exportada'])
    expect(h, informe(h)).toEqual([])
  })

  it('R9 R15 Base de solo cita piezas del catálogo', () => {
    const catalogo = catalogoReal()
    exigirCatalogoConFilas(catalogo)
    const h = soloReglas(cruzar(catalogo, arbolReal()), ['base-desconocida'])
    expect(h, informe(h)).toEqual([])
  })

  it('R10 R15 ningún barrel de components/shared usa export *', () => {
    const h = soloReglas(cruzar(leerCatalogo(''), arbolReal()), ['export-estrella'])
    expect(h, informe(h)).toEqual([])
  })

  it('R22 arnes.config.json lista el catálogo como archivo compartido, junto a los de siempre', () => {
    const config = JSON.parse(leerTexto('arnes.config.json') ?? '{}') as {
      equipo?: { archivos_compartidos?: unknown }
    }
    const lista = config.equipo?.archivos_compartidos
    expect(Array.isArray(lista), 'falta `equipo.archivos_compartidos`').toBe(true)
    expect(lista).toEqual(
      expect.arrayContaining([CATALOGO, 'tests/baseline-rojos.json', 'progress/deudas.md']),
    )
  })

  it('R28 R30 la celda Diseño es válida y sus tableros existen', () => {
    const catalogo = catalogoReal()
    exigirCatalogoConFilas(catalogo)
    const h = [
      ...soloReglas(catalogo.hallazgos, ['diseno-invalido']),
      ...soloReglas(cruzarDiseno(catalogo, arbolReal()), ['diseno-inexistente']),
    ]
    expect(h, informe(h)).toEqual([])
  })

  it('R29 toda fila de Compuestos o Primitivos fuera de la lista de previas cita su tablero', () => {
    const catalogo = catalogoReal()
    exigirCatalogoConFilas(catalogo)
    const h = soloReglas(cruzarDiseno(catalogo, arbolReal()), ['diseno-requerido'])
    expect(h, informe(h)).toEqual([])
  })

  it('R31 la lista de piezas previas está tomada y no tiene entradas muertas', () => {
    expect(
      PIEZAS_PREVIAS_AL_REDISENO.length,
      'PIEZAS_PREVIAS_AL_REDISENO está vacía: rellénala con los `Archivo` de Compuestos y Primitivos catalogados',
    ).toBeGreaterThan(0)
    const h = soloReglas(cruzarDiseno(leerCatalogo(''), arbolReal()), ['previa-muerta'])
    expect(h, informe(h)).toEqual([])
  })

  it('R33 R34 docs/diseno está completo y sistema.css es idéntico a canvas/qc.css', () => {
    for (const ruta of [
      'docs/diseno/README.md',
      'docs/diseno/guia-de-marca.html',
      'docs/diseno/sistema.css',
      'docs/diseno/canvas/qc.css',
    ]) {
      expect(existsSync(join(repoRoot, ruta)), `${ruta} no existe`).toBe(true)
    }
    const tableros = listar('docs/diseno/canvas').filter((r) => r.endsWith('.dc.html'))
    expect(tableros.length, 'docs/diseno/canvas/ no tiene ningún tablero *.dc.html').toBeGreaterThan(0)
    const h = compararSistema(
      readFileSync(join(repoRoot, 'docs/diseno/sistema.css')),
      readFileSync(join(repoRoot, 'docs/diseno/canvas/qc.css')),
    )
    expect(h, informe(h)).toEqual([])
  })

  it('R33 el README de docs/diseno explica el canvas privado, support.js y el flujo /design en seis pasos', () => {
    const readme = leerTexto('docs/diseno/README.md') ?? ''
    for (const marca of [
      'https://claude.ai/artifact/Voiri77bod5p5EuzCUkPaq',
      'privado',
      'support.js',
      'Claude Code',
      'rama de la ficha',
    ]) {
      expect(readme, `docs/diseno/README.md no menciona «${marca}»`).toContain(marca)
    }
    for (let n = 1; n <= 6; n++) {
      expect(
        new RegExp(`(^|\\n)\\s*${n}\\.\\s|\\(${n}\\)`).test(readme),
        `docs/diseno/README.md no tiene el paso ${n} del flujo /design`,
      ).toBe(true)
    }
  })

  it('R35 progress/rediseno.md apunta a docs/diseno/ y ya no a _trabajo/rediseno/canvas/', () => {
    const rediseno = leerTexto('progress/rediseno.md') ?? ''
    for (const marca of ['docs/diseno/canvas/', 'docs/diseno/sistema.css', 'docs/diseno/guia-de-marca.html']) {
      expect(rediseno, `progress/rediseno.md no cita ${marca}`).toContain(marca)
    }
    expect(rediseno, 'progress/rediseno.md sigue citando la copia local sin versionar').not.toContain(
      '_trabajo/rediseno/canvas',
    )
  })
})

// ---------------------------------------------------------------------------------------------
// Las reglas escritas donde los agentes las leen
// ---------------------------------------------------------------------------------------------

/** El bloque de un encabezado: hasta el siguiente de su nivel o superior. Vacío si no está. */
function bloque(md: string, encabezado: string): string {
  const lineas = md.split(/\r?\n/)
  const i = lineas.findIndex((l) => l.trim() === encabezado)
  if (i === -1) return ''
  const nivel = /^#+/.exec(encabezado)?.[0].length ?? 1
  const fin = lineas.findIndex((l, j) => j > i && /^#+ /.test(l) && (/^#+/.exec(l)?.[0].length ?? 9) <= nivel)
  return lineas.slice(i, fin === -1 ? undefined : fin).join('\n')
}

/** El `##` bajo el que cuelga un encabezado. */
function seccionPadre(md: string, encabezado: string): string | null {
  const lineas = md.split(/\r?\n/)
  const i = lineas.findIndex((l) => l.trim() === encabezado)
  for (let j = i - 1; j >= 0; j--) {
    if (/^## /.test(lineas[j] ?? '')) return (lineas[j] ?? '').trim()
  }
  return null
}

/** Los puntos de primer nivel de un texto (`- …`, `- [ ] …` o `1. …`) con sus líneas de continuación. */
function puntos(texto: string): string[] {
  const salida: string[] = []
  let abierto = false
  for (const linea of texto.split(/\r?\n/)) {
    if (/^(\d+\.|-)\s/.test(linea)) {
      salida.push(linea)
      abierto = true
    } else if (/^#/.test(linea) || /^\S/.test(linea)) {
      abierto = false
    } else if (abierto && linea.trim() !== '') {
      salida[salida.length - 1] += `\n${linea}`
    }
  }
  return salida
}

/** Sin `**`, tildes ni saltos de línea: las marcas no dependen del énfasis ni del ajuste de línea. */
function plano(texto: string): string {
  return texto.split('**').join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

function contieneTodo(texto: string, marcas: readonly string[]): string[] {
  return marcas.filter((m) => !plano(texto).includes(plano(m)))
}

describe('guard-catalogo-de-componentes — docs', () => {
  const PERFIL = 'docs/perfil-agentes.md'
  const REGLA = '### Regla de decisión para componentes (obligatoria)'
  const PASE = '### Pase de diseño para componentes nuevos (obligatorio)'
  const perfil = () => leerTexto(PERFIL) ?? ''

  it('R16 la regla de decisión: reutiliza, extiende, compón, crea; segunda ruta y excepción', () => {
    const regla = bloque(perfil(), REGLA)
    expect(regla, `${PERFIL} no tiene «${REGLA}»`).not.toBe('')
    const esperados = ['**Reutiliza', '**Extiend', '**Compon', '**Crea']
    esperados.forEach((prefijo, i) => {
      const item = new RegExp(`(^|\\n)${i + 1}\\.\\s+(.*)`).exec(regla)?.[2] ?? ''
      expect(
        item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').startsWith(prefijo),
        `el paso ${i + 1} de la regla de decisión no empieza por ${prefijo}…**`,
      ).toBe(true)
    })
    expect(contieneTodo(regla, ['segunda ruta', 'excepción'])).toEqual([])
  })

  it('R23 la regla es obligatoria, de todos los agentes, con fecha y origen', () => {
    expect(seccionPadre(perfil(), REGLA)).toBe('## Todos los agentes')
    expect(contieneTodo(bloque(perfil(), REGLA), ['SIEMPRE', 'obligatoria', '2026-10-10', 'humano'])).toEqual([])
  })

  it('R24 el pase de diseño: /design, guía de marca, estados, animaciones y tres plataformas antes del spec', () => {
    const pase = bloque(perfil(), PASE)
    expect(pase, `${PERFIL} no tiene «${PASE}»`).not.toBe('')
    expect(
      contieneTodo(pase, [
        '`/design`',
        'escritorio',
        'tablet',
        'teléfono',
        'animaciones',
        'estados',
        'antes del spec',
        'docs/diseno/guia-de-marca.html',
      ]),
    ).toEqual([])
    const componentes = bloque(leerTexto('docs/architecture.md') ?? '', '## Componentes')
    expect(
      contieneTodo(componentes, ['Pase de diseño para componentes nuevos']),
      'docs/architecture.md > ## Componentes no remite al pase de diseño',
    ).toEqual([])
  })

  it('R17 R25 spec_author cita el catálogo en «Lo que ya existe» y para sin el pase /design', () => {
    const spec = bloque(perfil(), '## spec_author')
    expect(contieneTodo(spec, ['components/shared/CATALOGO.md', 'Lo que ya existe'])).toEqual([])
    expect(spec).toContain('BLOQUEADO: falta el pase /design')
  })

  it('R18 R26 frontend_dev lee el catálogo, mantiene la fila y no crea sin referencia de diseño', () => {
    const fd = bloque(perfil(), '## frontend_dev')
    const lista = puntos(fd)
    expect(
      lista.some((p) => contieneTodo(p, ['components/shared/CATALOGO.md', 'mismo commit']).length === 0),
      'ninguna regla de frontend_dev pide leer el catálogo y actualizar la fila en el mismo commit',
    ).toBe(true)
    // «fila en el catálogo» o `CATALOGO.md`: las dos redacciones nombran el mismo archivo.
    expect(
      lista.some((p) => contieneTodo(p, ['referencia de diseño']).length === 0 && /cat[aá]logo/i.test(p)),
      'ninguna regla de frontend_dev junta «referencia de diseño» y el catálogo',
    ).toBe(true)
  })

  it('R19 R27 reviewer bloquea el duplicado sin justificar y el componente sin referencia de diseño', () => {
    const lista = puntos(bloque(perfil(), '## reviewer'))
    expect(
      lista.some(
        (p) =>
          /duplicado/i.test(p) &&
          contieneTodo(p, ['components/shared/CATALOGO.md', 'BLOQUEANTE']).length === 0,
      ),
      'ningún punto del reviewer bloquea el duplicado del catálogo',
    ).toBe(true)
    expect(
      lista.some((p) => contieneTodo(p, ['referencia de diseño', 'BLOQUEANTE']).length === 0),
      'ningún punto del reviewer bloquea el componente sin referencia de diseño',
    ).toBe(true)
  })

  it('R20 architecture: sube a shared con la segunda ruta y remite al catálogo', () => {
    const regla = bloque(leerTexto('docs/architecture.md') ?? '', '### Regla: sin sobre-ingenieria')
    expect(regla, 'docs/architecture.md no tiene «### Regla: sin sobre-ingenieria»').not.toBe('')
    expect(contieneTodo(regla, ['segunda ruta', 'CATALOGO.md', 'Regla de decisión para componentes'])).toEqual([])
    expect(regla).not.toContain('DOS features')
  })

  it('R21 R32 checkpoints: casilla del catálogo al día y casilla del pase /design', () => {
    const calidad = bloque(leerTexto('docs/checkpoints-proyecto.md') ?? '', '## Calidad de codigo')
    const casillas = puntos(calidad).filter((p) => p.startsWith('- ['))
    expect(
      casillas.some((c) => contieneTodo(c, ['components/shared/CATALOGO.md', 'fila']).length === 0),
      'falta la casilla «… tiene su fila al día en components/shared/CATALOGO.md»',
    ).toBe(true)
    expect(
      casillas.some((c) => contieneTodo(c, ['`/design`', '`Diseño`']).length === 0),
      'falta la casilla del pase `/design` citado en `Diseño`',
    ).toBe(true)
  })
})
