// T11 — Contrato del modulo `asignaciones` y su frontera (QC-86: R29, R30, R31, R36).
//
// Vigila el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el comportamiento: esta ficha no trae
// caso de uso, ni puerto, ni repositorio, ni Server Action (R36), asi que no hay comportamiento que
// ejercitar. Lo que si hay son cuatro propiedades del CODIGO FUENTE que la feature promete y que
// alguien podria romper manana sin darse cuenta:
//
//   (a) el modulo tiene `index.ts` y SOLO `domain/` — ni `ports/` ni `adapters/` (R36);
//   (b) ningun archivo de `lib/modules/asignaciones/**` importa una ruta interna de otro modulo ni
//       `@/lib/shared/db/prisma` (R31);
//   (c) el contrato publico no arrastra `next/*` ni `@prisma/client` — comprobado sobre el CIERRE
//       de imports del barril, como el bloque 6 de `tests/guards/guard-arquitectura-modulos.test.ts`,
//       no sobre el archivo suelto: la fuga real llega por un archivo intermedio, no por el barril;
//   (d) ningun archivo FUERA de `lib/modules/asignaciones/**` consulta `prisma.orderAssignment` (R30);
//   (e) R29 EN NEGATIVO: `asignaciones.consultar` y `asignaciones.modificar` no se consumen desde
//       ningun punto del codigo salvo el catalogo que los declara.
//
// La guardia generica ya prohibe parte de esto para CUALQUIER modulo. Aqui se deja escrito como
// REQUISITO de esta feature —igual que hizo `tests/unit/recetas/module-contract.test.ts` con
// QC-24— en vez de como efecto colateral de una guardia que manana podria cambiar de alcance.
//
// Patron de `tests/guards/` (R21 de QC-9): funciones PURAS exportadas, y cada regla se demuestra
// con un fuente SINTETICO que la viola Y con el caso simetrico correcto que NO la viola. Un
// `expect(hallazgos).toEqual([])` sobre el repo real, solo, no demuestra que la regla dispare; por
// eso el bloque final vuelve a pasar los detectores sobre los fuentes REALES MUTADOS.
//
// Este test NO se conecta a la base: solo lee archivos.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
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

/** El modulo de esta ficha, y el unico archivo al que (e) le permite nombrar los dos codigos. */
const ASIGNACIONES = 'lib/modules/asignaciones'
const BARRIL = `${ASIGNACIONES}/index.ts`
const CATALOGO_DE_PERMISOS = 'lib/modules/identity/domain/permissions.ts'

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

/** Ruta absoluta -> ruta POSIX relativa a la raiz del repo. */
function relPosix(absPath: string): string {
  return toPosix(relative(repoRoot, absPath))
}

/** Ruta POSIX relativa al repo -> ruta absoluta del sistema. */
function absOf(relPath: string): string {
  return join(repoRoot, ...relPath.split('/'))
}

/**
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa.
 *
 * No es un detalle cosmetico. La cabecera del propio barril de `asignaciones` dice «nada de
 * 'use server', @prisma/client ni ningun import de `next`», y el dominio explica que el dia que
 * necesite otro modulo lo pedira a su barril: un barrido sobre el texto crudo leeria esas
 * advertencias como infracciones. Y en (e) pasa lo mismo con los dos codigos de permiso, que
 * varios comentarios de `identity` nombran al explicar el seed. Un test que confunde la
 * advertencia con la infraccion no vigila nada, molesta.
 *
 * El orden importa: primero los comentarios de LINEA y despues los de BLOQUE. Al reves, un `//`
 * que contenga una apertura de bloque abre un bloque falso que se traga el resto del archivo
 * (el defecto que QC-9 documenta en su guardia) y el test pasaria en verde sin mirar nada.
 *
 * **CORREGIDO 2026-09-13 por QC-87**: el patron era `/\/\/.*$/` y en este repo —archivos con
 * CRLF— NO borraba nada. En JavaScript el `.` no casa `\r`, y sin la bandera `m` el `$` solo casa
 * al final de la cadena: en una linea acabada en `\r` la expresion no encontraba final y el
 * comentario sobrevivia entero. El efecto era el que este mismo bloque dice que hay que evitar:
 * una MENCION en un comentario de linea contaba como infraccion. `[^\n]` si casa `\r`, y con eso
 * el comportamiento vuelve a ser el documentado. El caso sintetico que lo afirmaba pasaba porque
 * sus cadenas literales usan `\n`.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Especificadores importados/reexportados/requeridos por un fuente (import, export...from, require, import()). */
export function extractImportSpecifiers(source: string): readonly string[] {
  const stripped = stripComments(source)
  const patterns = [
    /import\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  const specifiers = new Set<string>()
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) specifiers.add(match[1] as string)
  }
  return [...specifiers]
}

/** `'use server'` como PRIMERA sentencia no vacia del archivo (la regla real de Next). */
export function hasUseServerDirective(source: string): boolean {
  const first = stripComments(source)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (first === undefined) return false
  return ["'use server'", '"use server"', "'use server';", '"use server";'].includes(first)
}

/**
 * Especificador -> ruta del repo (POSIX, SIN extension), o `null` si es un paquete externo.
 *
 * Se decide sobre el DESTINO NORMALIZADO y no sobre el texto: `'@/lib/modules/pedidos/domain/x'` y
 * `'../pedidos/domain/x'` escritos desde el mismo archivo son el mismo import, y una regla que
 * mirase el texto solo cazaria el primero. Es puro a proposito —no toca el disco—: asi los casos
 * sinteticos pueden inventar rutas que no existen.
 */
export function resolveSpecifier(fromRelPath: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return posix.normalize(specifier.slice(2))
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(fromRelPath), specifier))
  return null
}

/** `lib/modules/<m>/...` -> `<m>`; para cualquier otra ruta, `null`. */
export function moduleOfPath(relPath: string): string | null {
  const match = /^lib\/modules\/([^/]+)(?:\/|$)/.exec(relPath)
  return match ? (match[1] as string) : null
}

// ---------------------------------------------------------------------------
// (a) Forma del modulo: `index.ts` y SOLO `domain/` (R36)
// ---------------------------------------------------------------------------

/**
 * `asignaciones` nacio con `index.ts` y una sola carpeta, `domain/` (QC-86 `design.md > 3`).
 *
 * **RETENSADO 2026-09-13 por QC-87**, que es la ficha que este mismo caso nombraba de antemano:
 * «quien estrene la primera operacion (QC-87) creara esas carpetas entonces, y retensara este
 * caso nombrando su ficha». Eso es lo que pasa aqui, y se hace **ampliando la lista cerrada, no
 * retirando la asercion**.
 *
 * QC-87 estrena los cuatro casos de uso del modulo, y con ellos:
 *   - `ports/` — el puerto `OrderAssignmentRepository` (QC-87 T4, su R45/R47);
 *   - `adapters/` — el adaptador Prisma del puerto y las Server Actions (QC-87 T5 y T12).
 *
 * Lo que NO se relaja: la comparacion sigue siendo contra una **lista cerrada de tres carpetas**.
 * Una cuarta carpeta cualquiera —`utils/`, `helpers/`, `lib/`— sigue siendo un hallazgo, y un
 * archivo suelto en la raiz del modulo tambien. Lo unico que cambio es CUALES son las carpetas
 * legitimas, y cada una entra con la task de QC-87 que la crea.
 */
const CARPETAS_PERMITIDAS = ['adapters', 'domain', 'ports'] as const

export function findModuleShapeFindings(
  entries: ReadonlyArray<{ name: string; isDirectory: boolean }>,
): readonly string[] {
  const findings: string[] = []
  if (!entries.some((entry) => entry.name === 'index.ts' && !entry.isDirectory)) {
    findings.push(`${ASIGNACIONES}/: falta el contrato publico index.ts (R31)`)
  }
  for (const entry of entries) {
    if (entry.name === 'index.ts' && !entry.isDirectory) continue
    if (!entry.isDirectory) {
      findings.push(`${ASIGNACIONES}/${entry.name}: archivo ajeno al contrato en la raiz del modulo (R31)`)
    } else if (!(CARPETAS_PERMITIDAS as readonly string[]).includes(entry.name)) {
      findings.push(`${ASIGNACIONES}/${entry.name}/: carpeta fuera del alcance del modulo (R36)`)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (b) Frontera de imports del modulo (R31)
// ---------------------------------------------------------------------------

const CLIENTE_PRISMA_COMPARTIDO = 'lib/shared/db/prisma'

/**
 * Un archivo de `asignaciones` solo puede llegar a otro modulo por su BARRIL (R31): el dia que
 * necesite el pedido, la persona o el grupo, los pedira a `@/lib/modules/<otro>` —nunca a
 * `.../domain/x`—. QC-87 lo cumple al pie de la letra con los tres contratos de su `design.md > 2`.
 *
 * **RETENSADO 2026-09-13 por QC-87** en la mitad del cliente Prisma. QC-86 escribio «no puede
 * tocar el cliente Prisma compartido» cuando el modulo **no tenia adaptadores**: entonces esa
 * frase y «ningun archivo» querian decir lo mismo. QC-87 estrena el adaptador driven de
 * persistencia, que es **por definicion** el archivo que habla con Prisma
 * (`docs/architecture.md > Modulos y arquitectura hexagonal`).
 *
 * La regla no se retira: **se acota**. El cliente compartido solo puede entrar por
 * `adapters/driven/persistence/`; en `domain/`, en `ports/` y en el barril sigue siendo un
 * hallazgo, que es donde importaba que lo fuera —un dominio que importa Prisma es exactamente el
 * anti-patron que R31 vino a impedir—. Prohibirlo tambien en el adaptador obligaria a que el
 * modulo no pudiera persistir nada.
 */
const PERSISTENCIA_DRIVEN = `${ASIGNACIONES}/adapters/driven/persistence/`

export function findModuleBoundaryFindings(file: {
  relPath: string
  content: string
}): readonly string[] {
  if (!file.relPath.startsWith(`${ASIGNACIONES}/`)) return []
  const findings: string[] = []
  for (const specifier of extractImportSpecifiers(file.content)) {
    const target = resolveSpecifier(file.relPath, specifier)
    if (target === null) continue // paquete externo: lo juzga (c), no esta regla
    if (target === CLIENTE_PRISMA_COMPARTIDO) {
      if (!file.relPath.startsWith(PERSISTENCIA_DRIVEN)) {
        findings.push(`${file.relPath} importa el cliente Prisma compartido '${specifier}' (R31)`)
      }
      continue
    }
    const targetModule = moduleOfPath(target)
    if (targetModule === null || targetModule === 'asignaciones') continue
    // El barril ES el contrato: `lib/modules/<m>` y `lib/modules/<m>/index` son legitimos.
    const esBarril = target === `lib/modules/${targetModule}` || target === `lib/modules/${targetModule}/index`
    if (!esBarril) {
      findings.push(`${file.relPath} importa '${specifier}', ruta interna del modulo '${targetModule}' (R31)`)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (c) Contrato limpio sobre el CIERRE de imports del barril (R31)
// ---------------------------------------------------------------------------

/** Lee un destino interno probando las extensiones del repo. Devuelve `null` si no resuelve. */
export type ReadSource = (relBase: string) => { relPath: string; content: string } | null

/** Construye un lector sobre un mapa `rutaExacta -> contenido` (para los fuentes sinteticos). */
export function readerFromMap(files: ReadonlyMap<string, string>): ReadSource {
  return (relBase) => {
    for (const candidate of [relBase, `${relBase}.ts`, `${relBase}.tsx`, `${relBase}/index.ts`]) {
      const content = files.get(candidate)
      if (content !== undefined) return { relPath: candidate, content }
    }
    return null
  }
}

/** Cierre TRANSITIVO de imports desde un archivo: archivos internos alcanzados y paquetes externos. */
export function collectClosure(
  entryRelPath: string,
  entryContent: string,
  readSource: ReadSource,
): { internos: ReadonlyMap<string, string>; externos: ReadonlySet<string> } {
  const internos = new Map<string, string>()
  const externos = new Set<string>()
  const vistos = new Set<string>([entryRelPath])
  const pendientes: Array<{ relPath: string; content: string }> = [
    { relPath: entryRelPath, content: entryContent },
  ]
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as { relPath: string; content: string }
    for (const specifier of extractImportSpecifiers(actual.content)) {
      const target = resolveSpecifier(actual.relPath, specifier)
      if (target === null) {
        externos.add(specifier)
        continue
      }
      const resuelto = readSource(target)
      // Un destino interno que no resuelve se anota como hallazgo en la funcion de abajo; aqui
      // solo se deja de seguir, para no perder el resto del cierre.
      if (resuelto === null || vistos.has(resuelto.relPath)) continue
      vistos.add(resuelto.relPath)
      internos.set(resuelto.relPath, resuelto.content)
      pendientes.push(resuelto)
    }
  }
  return { internos, externos }
}

const EXTERNOS_PROHIBIDOS_EN_EL_CONTRATO = /^(next(\/.*)?|@prisma\/client)$/

/**
 * El contrato publico tiene que poder importarse desde un componente de cliente: nada de servidor
 * en TODO su cierre de imports, ni `'use server'` en ningun archivo alcanzable (R31).
 *
 * Se mira el cierre y no el archivo suelto a proposito, igual que el bloque 6 de la guardia: un
 * barril que solo dice `export type { X } from './domain/x'` esta limpio a simple vista aunque
 * `./domain/x` importe `@prisma/client`, y esa es justo la forma que toma la fuga en la practica.
 */
export function findContractLeakageFindings(
  entryRelPath: string,
  entryContent: string,
  readSource: ReadSource,
): readonly string[] {
  const findings: string[] = []
  if (hasUseServerDirective(entryContent)) {
    findings.push(`${entryRelPath} declara 'use server' en el contrato (R31)`)
  }
  const { internos, externos } = collectClosure(entryRelPath, entryContent, readSource)
  for (const paquete of externos) {
    if (EXTERNOS_PROHIBIDOS_EN_EL_CONTRATO.test(paquete)) {
      findings.push(`${entryRelPath} arrastra '${paquete}' en su cierre de imports (R31)`)
    }
  }
  for (const [relPath, content] of internos) {
    if (hasUseServerDirective(content)) {
      findings.push(`${entryRelPath} arrastra '${relPath}' con 'use server' transitivamente (R31)`)
    }
    for (const paquete of extractImportSpecifiers(content)) {
      if (resolveSpecifier(relPath, paquete) === null && EXTERNOS_PROHIBIDOS_EN_EL_CONTRATO.test(paquete)) {
        // Ya lo cubre el barrido de `externos`; se deja la comprobacion aqui solo para nombrar
        // el archivo culpable, que es lo que hace util el mensaje.
        findings.push(`${entryRelPath} arrastra '${paquete}' a traves de '${relPath}' (R31)`)
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (d) Propiedad de la tabla: solo `asignaciones` consulta `order_assignments` (R30)
// ---------------------------------------------------------------------------

const CONSULTA_ORDER_ASSIGNMENT = /\bprisma\s*\.\s*orderAssignment\b/

/**
 * `/// @module asignaciones` declara el dueño de la tabla en el esquema; esto comprueba la otra
 * mitad de R30: que nadie mas la consulte con el cliente Prisma. Hoy NO la consulta ni el propio
 * modulo —esta ficha no trae repositorio (R36)—, asi que la regla nace cazando cualquier consulta
 * fuera del modulo, no la ausencia total.
 */
export function findForeignPrismaAccessFindings(
  files: ReadonlyArray<{ relPath: string; content: string }>,
): readonly string[] {
  return files
    .filter((file) => !file.relPath.startsWith(`${ASIGNACIONES}/`))
    .filter((file) => CONSULTA_ORDER_ASSIGNMENT.test(stripComments(file.content)))
    .map((file) => `${file.relPath} consulta 'prisma.orderAssignment' fuera de ${ASIGNACIONES}/ (R30)`)
}

// ---------------------------------------------------------------------------
// (e) R29 en negativo: los dos permisos se declaran y casi nadie los consume
// ---------------------------------------------------------------------------

export const CODIGOS_NUEVOS = ['asignaciones.consultar', 'asignaciones.modificar', 'asignaciones.ejecutar'] as const

/** Las cuatro raices de CODIGO de aplicacion donde R29 exige silencio. */
const RAICES_VIGILADAS = ['app/', 'components/', 'lib/shared/', 'lib/modules/'] as const

/**
 * Alcance de (e), escrito con precision para no autolesionarse.
 *
 * DENTRO: `app/**`, `components/**`, `lib/shared/**` y `lib/modules/**`, menos el catalogo que
 * DECLARA los dos codigos —`lib/modules/identity/domain/permissions.ts`—, que por definicion los
 * nombra.
 *
 * FUERA, y no por descuido: `tests/**` (este mismo archivo los escribe literalmente, y el test del
 * catalogo y el del seed tambien), `db/**` (el SQL de la migracion de esta ficha los inserta, que
 * es R28) y `specs/**` (la prosa de la ficha). Confundir «el codigo los exige» con «alguien
 * escribe la cadena» convertiria en rojo justo el trabajo que R28 y R25 mandan hacer.
 */
export function isScopedForPermissionCodes(relPath: string): boolean {
  if (relPath === CATALOGO_DE_PERMISOS) return false
  return RAICES_VIGILADAS.some((raiz) => relPath.startsWith(raiz))
}

/**
 * **ENMENDADO 2026-09-13 por QC-87**, y es la ficha que invalida a proposito la mitad de esta
 * regla: QC-86 R29 decia que los dos permisos se declaraban y **nadie** los exigia todavia, porque
 * QC-86 no traia ninguna operacion. QC-87 estrena los **tres casos de uso de escritura** del
 * modulo, y su **R1** exige `asignaciones.modificar` en la PRIMERA LINEA de cada uno: mantener la
 * regla tal cual obligaria a elegir entre R29 de QC-86 y R1 de QC-87, y el trabajo que R1 manda
 * hacer saldria rojo.
 *
 * La enmienda **abre exactamente una puerta y ni un milimetro mas**:
 *
 *   - `asignaciones.modificar` es legitimo **solo** en `lib/modules/asignaciones/domain/**`, que es
 *     donde vive la frontera de autorizacion (`docs/architecture.md > Acceso a datos y
 *     autorizacion`). Ni en sus adaptadores —el driving NO comprueba permisos por su cuenta
 *     (QC-87 R43)—, ni en otro modulo, ni en `lib/shared/**`.
 *   - `asignaciones.consultar` **sigue prohibido en todas partes**. No es descuido: es el hallazgo 3
 *     de `design.md > 0` de QC-87 —lo estrena QC-88— y el riesgo 3 de su `> 10`, «que alguien lo
 *     exija en la consulta de responsables porque se llama asi». Exigirlo aqui dejaria sin ver los
 *     avatares a quien puede ver el pedido (QC-87 R3).
 *   - `app/**` y `components/**` **siguen sin poder nombrar ninguno de los dos**, que es donde esta
 *     el valor de la regla: R29 de QC-86 y **R50** de QC-87 —la pantalla es de QC-102—.
 *
 * **ENMENDADO despues**: el caso de uso `domain/list-assigned-orders.ts` exige
 * `asignaciones.consultar` en su primera linea, asi que ese codigo deja de estar prohibido en
 * todas partes. La puerta es de **un archivo y un codigo**, por igualdad exacta y no por prefijo:
 * ni el resto de `domain/` puede exigirlo. Ensancharla a la carpeta, al modulo o a los dos codigos
 * destruye la garantia.
 *
 * **ENMENDADO otra vez**: los tres casos de uso de la pantalla de ejecucion
 * (`get-assigned-order-execution.ts`, `start-assigned-order.ts`, `finish-assigned-order.ts`)
 * exigen el mismo `asignaciones.consultar` en su primera linea. Se nombran los TRES archivos
 * exactos, no la carpeta: `list-order-responsibles.ts` sigue sin poder exigirlo.
 *
 * **ENMENDADO por QC-201** (R15): nace `asignaciones.ejecutar`. Lo exigen esos tres casos de uso y
 * la pantalla de ejecucion, que DEJAN de poder nombrar `asignaciones.consultar`; y lo nombra
 * `domain/actor.ts`, que define `canExecuteAssignedOrders`. Las vistas, «Mis asignados» y
 * «Terminados» preguntan a esa funcion, no escriben el codigo.
 */
type ConsumoLegitimo =
  /** Toda una carpeta del dominio puede exigir el codigo. */
  | { readonly tipo: 'carpeta'; readonly prefijo: string; readonly codigo: string }
  /** UN archivo exacto, y ninguno mas, puede exigir el codigo. */
  | { readonly tipo: 'archivo'; readonly archivo: string; readonly codigo: string }

const CASO_DE_USO_QC88 = `${ASIGNACIONES}/domain/list-assigned-orders.ts`

/**
 * La pantalla y el item de menu son los DOS puntos de consumo GENERICOS del catalogo
 * (`requirePagePermission(...)` en cada `page.tsx`, `permission: '<codigo>'` en cada `NavLink`):
 * escribir ahi el codigo no es «reimplementar la autorizacion» -eso seria una SEGUNDA comparacion
 * manual del permiso, que sigue prohibida en TODAS partes-, es invocar la unica puerta que ya
 * existia. Se nombran los DOS archivos exactos, nunca una carpeta ni el modulo entero.
 */
const PAGINA_QC88 = 'app/(private)/asignacion/page.tsx'
const NAV_PRIVADO = 'lib/shared/navigation/private-nav.ts'

// La SEGUNDA pantalla de la zona, anadida el 2026-09-17: la de ejecucion consume el catalogo por
// la misma puerta generica (`requirePagePermission`) y con el mismo codigo de consulta. Se nombra
// el archivo EXACTO, como los otros dos: la carpeta sigue sin estar permitida.
const PAGINA_EJECUCION = 'app/(private)/asignacion/[id]/page.tsx'

const PREDICADO_DE_EJECUCION = `${ASIGNACIONES}/domain/actor.ts`

const CASOS_DE_USO_QC63 = [
  `${ASIGNACIONES}/domain/get-assigned-order-execution.ts`,
  `${ASIGNACIONES}/domain/start-assigned-order.ts`,
  `${ASIGNACIONES}/domain/finish-assigned-order.ts`,
]

const CONSUMO_LEGITIMO: ReadonlyArray<ConsumoLegitimo> = [
  { tipo: 'carpeta', prefijo: `${ASIGNACIONES}/domain/`, codigo: 'asignaciones.modificar' },
  { tipo: 'archivo', archivo: CASO_DE_USO_QC88, codigo: 'asignaciones.consultar' },
  { tipo: 'archivo', archivo: PAGINA_QC88, codigo: 'asignaciones.consultar' },
  { tipo: 'archivo', archivo: PAGINA_EJECUCION, codigo: 'asignaciones.ejecutar' },
  { tipo: 'archivo', archivo: NAV_PRIVADO, codigo: 'asignaciones.consultar' },
  { tipo: 'archivo', archivo: PREDICADO_DE_EJECUCION, codigo: 'asignaciones.ejecutar' },
  ...CASOS_DE_USO_QC63.map(
    (archivo): ConsumoLegitimo => ({ tipo: 'archivo', archivo, codigo: 'asignaciones.ejecutar' }),
  ),
]

/** ¿Ese archivo puede exigir ESE codigo? */
export function isLegitimatePermissionConsumer(relPath: string, codigo: string): boolean {
  return CONSUMO_LEGITIMO.some((permitido) => {
    if (codigo !== permitido.codigo) return false
    return permitido.tipo === 'archivo'
      ? relPath === permitido.archivo
      : relPath.startsWith(permitido.prefijo)
  })
}

/** Nadie consume los dos permisos nuevos fuera de la unica puerta que QC-87 abre (R29, R50). */
export function findPermissionUsageFindings(
  files: ReadonlyArray<{ relPath: string; content: string }>,
): readonly string[] {
  const findings: string[] = []
  for (const file of files) {
    if (!isScopedForPermissionCodes(file.relPath)) continue
    const code = stripComments(file.content)
    for (const codigo of CODIGOS_NUEVOS) {
      if (!code.includes(codigo)) continue
      if (isLegitimatePermissionConsumer(file.relPath, codigo)) continue
      findings.push(`${file.relPath} nombra '${codigo}' (R29)`)
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Datos del repo real, calculados una vez
// ---------------------------------------------------------------------------

const IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', '.worktrees'])

/** Todos los fuentes `.ts`/`.tsx` bajo `dir`, recursivamente, como rutas absolutas. */
function sourcesIn(absDir: string): readonly string[] {
  if (!existsSync(absDir)) return []
  const salida: string[] = []
  for (const name of readdirSync(absDir)) {
    if (IGNORADAS.has(name)) continue
    const full = join(absDir, name)
    if (statSync(full).isDirectory()) salida.push(...sourcesIn(full))
    else if (/\.tsx?$/.test(name)) salida.push(full)
  }
  return salida.sort()
}

/** Fuentes de varias raices del repo; una raiz puede ser una CARPETA o un archivo suelto (`middleware.ts`). */
function loadFiles(relRoots: readonly string[]): ReadonlyArray<{ relPath: string; content: string }> {
  return relRoots.flatMap((relRoot) => {
    const abs = absOf(relRoot)
    if (!existsSync(abs)) return []
    const archivos = statSync(abs).isDirectory() ? sourcesIn(abs) : [abs]
    return archivos.map((file) => ({ relPath: relPosix(file), content: readFileSync(file, 'utf8') }))
  })
}

const asignacionesEntries = readdirSync(absOf(ASIGNACIONES)).map((name) => ({
  name,
  isDirectory: statSync(join(absOf(ASIGNACIONES), name)).isDirectory(),
}))

/** Todo el codigo de aplicacion: es el alcance de (d) y el universo del que (e) filtra. */
const appSources = loadFiles(['app', 'components', 'hooks', 'lib', 'scripts', 'middleware.ts'])
const asignacionesSources = appSources.filter((file) => file.relPath.startsWith(`${ASIGNACIONES}/`))

/** Lector real del disco para el cierre de imports del barril. */
const leerDelDisco: ReadSource = (relBase) => {
  for (const candidate of [relBase, `${relBase}.ts`, `${relBase}.tsx`, `${relBase}/index.ts`]) {
    const abs = absOf(candidate)
    if (existsSync(abs) && statSync(abs).isFile()) {
      return { relPath: candidate, content: readFileSync(abs, 'utf8') }
    }
  }
  return null
}

const barrilContent = readFileSync(absOf(BARRIL), 'utf8')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lib/modules/asignaciones — contrato del modulo y frontera (QC-86 T11)', () => {
  describe('(a) forma del modulo: index.ts y solo domain/ (R36)', () => {
    it('el modulo real tiene index.ts y exactamente domain/, ports/ y adapters/ (R36, QC-87)', () => {
      expect(asignacionesEntries.length, 'lib/modules/asignaciones esta vacio').toBeGreaterThan(0)
      expect(findModuleShapeFindings(asignacionesEntries)).toEqual([])
      // Dicho tambien en positivo, para que el mensaje de un futuro rojo sea legible.
      expect(
        asignacionesEntries
          .filter((entry) => entry.isDirectory)
          .map((entry) => entry.name)
          .sort(),
      ).toEqual(['adapters', 'domain', 'ports'])
      // RETENSADO por QC-87: donde antes se exigia que NO existieran, ahora se exige que SI
      // existan. La asercion no desaparece, cambia de signo — si alguien borrara el puerto o el
      // adaptador, esto se pondria rojo igual que antes se ponia al crearlos.
      expect(existsSync(absOf(`${ASIGNACIONES}/ports`))).toBe(true)
      expect(existsSync(absOf(`${ASIGNACIONES}/adapters`))).toBe(true)
    })

    it('detecta un modulo sin index.ts, una carpeta fuera de la lista y un archivo suelto en su raiz (R36)', () => {
      // RETENSADO por QC-87: `ports/` y `adapters/` ya NO son un hallazgo —son suyas—, asi que la
      // pasada sintetica usa carpetas que siguen estando fuera de la lista cerrada. Si esto se
      // hubiera limitado a borrar las dos aserciones viejas, la lista habria dejado de vigilar
      // que NINGUNA otra carpeta entra, que es lo unico que este caso protege.
      const findings = findModuleShapeFindings([
        { name: 'domain', isDirectory: true },
        { name: 'ports', isDirectory: true },
        { name: 'adapters', isDirectory: true },
        { name: 'utils', isDirectory: true },
        { name: 'helpers', isDirectory: true },
        { name: 'order-assignment-repository.ts', isDirectory: false },
      ])
      expect(findings).toContainEqual('lib/modules/asignaciones/: falta el contrato publico index.ts (R31)')
      expect(findings).toContainEqual('lib/modules/asignaciones/utils/: carpeta fuera del alcance del modulo (R36)')
      expect(findings).toContainEqual('lib/modules/asignaciones/helpers/: carpeta fuera del alcance del modulo (R36)')
      expect(findings).toContainEqual(
        'lib/modules/asignaciones/order-assignment-repository.ts: archivo ajeno al contrato en la raiz del modulo (R31)',
      )
      // Y las tres legitimas NO generan hallazgo: sin esto, un `includes` roto pasaria inadvertido.
      expect(findings).not.toContainEqual('lib/modules/asignaciones/ports/: carpeta fuera del alcance del modulo (R36)')
      expect(findings).not.toContainEqual(
        'lib/modules/asignaciones/adapters/: carpeta fuera del alcance del modulo (R36)',
      )
      expect(findings).not.toContainEqual('lib/modules/asignaciones/domain/: carpeta fuera del alcance del modulo (R36)')
    })

    it('el caso simetrico —index.ts y solo domain/— no genera ningun hallazgo (R36)', () => {
      expect(
        findModuleShapeFindings([
          { name: 'index.ts', isDirectory: false },
          { name: 'domain', isDirectory: true },
        ]),
      ).toEqual([])
    })
  })

  describe('(b) frontera de imports del modulo (R31)', () => {
    it('ningun archivo real de lib/modules/asignaciones importa una ruta interna de otro modulo ni el cliente Prisma (R31)', () => {
      expect(asignacionesSources.length, 'no se leyo ningun fuente de lib/modules/asignaciones').toBeGreaterThan(0)
      expect(asignacionesSources.flatMap(findModuleBoundaryFindings)).toEqual([])
    })

    it('el cliente Prisma solo se admite en adapters/driven/persistence/, y en ningun otro sitio (R31, QC-87)', () => {
      // La excepcion que QC-87 abre, probada POR SUS DOS LADOS. Sin el lado negativo, ensanchar
      // manana el permiso a todo `adapters/` —o al modulo entero— no rompería nada.
      const importPrisma = "import { prisma } from '@/lib/shared/db/prisma';"
      const hallazgoDe = (relPath: string) =>
        findModuleBoundaryFindings({ relPath, content: importPrisma }).filter((f) =>
          f.includes('cliente Prisma compartido'),
        )

      // PERMITIDO: el adaptador driven de persistencia es quien habla con Prisma por definicion.
      expect(hallazgoDe(`${ASIGNACIONES}/adapters/driven/persistence/order-assignment-prisma.ts`)).toEqual([])

      // PROHIBIDO en todo lo demas, incluido el resto de `adapters/`: el driving traduce
      // `FormData` y errores, no persiste (QC-87 R43).
      for (const relPath of [
        `${ASIGNACIONES}/domain/assign-responsibles.ts`,
        `${ASIGNACIONES}/ports/order-assignment-repository.ts`,
        `${ASIGNACIONES}/index.ts`,
        `${ASIGNACIONES}/adapters/driving/order-assignment-actions.ts`,
        `${ASIGNACIONES}/adapters/driven/config/algo.ts`,
      ]) {
        expect(hallazgoDe(relPath), `${relPath} deberia seguir siendo un hallazgo`).toEqual([
          `${relPath} importa el cliente Prisma compartido '@/lib/shared/db/prisma' (R31)`,
        ])
      }
    })

    it('detecta la ruta interna de otro modulo —por alias y por ruta relativa— y el import de @/lib/shared/db/prisma (R31)', () => {
      const porAlias = findModuleBoundaryFindings({
        relPath: `${ASIGNACIONES}/domain/order-assignment.ts`,
        content: [
          "import type { Order } from '@/lib/modules/pedidos/domain/order';",
          "import { prisma } from '@/lib/shared/db/prisma';",
        ].join('\n'),
      })
      expect(porAlias).toContainEqual(
        "lib/modules/asignaciones/domain/order-assignment.ts importa '@/lib/modules/pedidos/domain/order', ruta interna del modulo 'pedidos' (R31)",
      )
      expect(porAlias).toContainEqual(
        "lib/modules/asignaciones/domain/order-assignment.ts importa el cliente Prisma compartido '@/lib/shared/db/prisma' (R31)",
      )

      // Mismo destino escrito con ruta RELATIVA: la regla decide sobre el destino normalizado, no
      // sobre el texto del especificador. Si mirase el texto, este import se colaria en verde.
      expect(
        findModuleBoundaryFindings({
          relPath: `${ASIGNACIONES}/domain/order-assignment.ts`,
          content: "import type { SessionUser } from '../../identity/domain/session-user';",
        }),
      ).toEqual([
        "lib/modules/asignaciones/domain/order-assignment.ts importa '../../identity/domain/session-user', ruta interna del modulo 'identity' (R31)",
      ])
    })

    it('el barril de otro modulo, una ruta del PROPIO modulo y un paquete externo no disparan la regla (R31)', () => {
      expect(
        findModuleBoundaryFindings({
          relPath: `${ASIGNACIONES}/domain/assign-order.ts`,
          content: [
            "import type { OrderRef } from '@/lib/modules/pedidos';",
            "import type { SessionUser } from '@/lib/modules/identity';",
            "import type { OrderAssignment } from './order-assignment';",
            "import { z } from 'zod';",
          ].join('\n'),
        }),
      ).toEqual([])

      // Y un archivo que NO es del modulo queda fuera del alcance de esta regla: `identity`
      // importando sus propias tripas es legitimo y no es asunto de (b).
      expect(
        findModuleBoundaryFindings({
          relPath: 'lib/modules/identity/adapters/driving/login-action.ts',
          content: "import { prisma } from '@/lib/shared/db/prisma';",
        }),
      ).toEqual([])
    })
  })

  describe('(c) el contrato no arrastra servidor, sobre el CIERRE de imports (R31)', () => {
    it('el cierre de imports del barril real no arrastra next/*, @prisma/client ni use server (R31)', () => {
      expect(findContractLeakageFindings(BARRIL, barrilContent, leerDelDisco)).toEqual([])
      // El cierre alcanza de verdad al dominio: si el barril no llegara a ningun archivo, el
      // caso pasaria en verde sin haber mirado nada.
      const { internos } = collectClosure(BARRIL, barrilContent, leerDelDisco)
      expect([...internos.keys()]).toContain(`${ASIGNACIONES}/domain/order-assignment.ts`)
    })

    it('detecta next/* y @prisma/client arrastrados TRANSITIVAMENTE, no solo escritos en el barril (R31)', () => {
      // El barril, leido solo, esta impecable: reexporta de `./domain` y nada mas. La fuga esta
      // un salto mas alla. Esta es la razon de comprobar el cierre y no el archivo suelto.
      const files = new Map<string, string>([
        [BARRIL, "export type { OrderAssignment } from './domain/order-assignment';"],
        [
          `${ASIGNACIONES}/domain/order-assignment.ts`,
          [
            "import type { Prisma } from '@prisma/client';",
            "import { cookies } from 'next/headers';",
            'export type OrderAssignment = { readonly orderId: string };',
          ].join('\n'),
        ],
      ])
      const findings = findContractLeakageFindings(BARRIL, files.get(BARRIL) as string, readerFromMap(files))
      expect(findings).toContainEqual(
        "lib/modules/asignaciones/index.ts arrastra '@prisma/client' en su cierre de imports (R31)",
      )
      expect(findings).toContainEqual(
        "lib/modules/asignaciones/index.ts arrastra 'next/headers' en su cierre de imports (R31)",
      )
      // Y nombra el archivo culpable, que es lo que hace accionable el mensaje.
      expect(findings).toContainEqual(
        "lib/modules/asignaciones/index.ts arrastra '@prisma/client' a traves de 'lib/modules/asignaciones/domain/order-assignment.ts' (R31)",
      )
    })

    it("detecta un 'use server' alcanzable desde el barril (R31)", () => {
      const files = new Map<string, string>([
        [BARRIL, "export { assignOrder } from './domain/assign-order';"],
        [
          `${ASIGNACIONES}/domain/assign-order.ts`,
          "'use server';\nexport async function assignOrder() {}",
        ],
      ])
      expect(
        findContractLeakageFindings(BARRIL, files.get(BARRIL) as string, readerFromMap(files)),
      ).toContainEqual(
        "lib/modules/asignaciones/index.ts arrastra 'lib/modules/asignaciones/domain/assign-order.ts' con 'use server' transitivamente (R31)",
      )
    })

    it('el caso simetrico —un cierre que solo llega a dominio puro— no genera hallazgos (R31)', () => {
      const files = new Map<string, string>([
        [BARRIL, "export type { OrderAssignment } from './domain/order-assignment';"],
        [
          `${ASIGNACIONES}/domain/order-assignment.ts`,
          [
            '// Este comentario nombra @prisma/client y next/headers a proposito: es prosa, no codigo.',
            'export type OrderAssignment = { readonly orderId: string };',
          ].join('\n'),
        ],
      ])
      expect(findContractLeakageFindings(BARRIL, files.get(BARRIL) as string, readerFromMap(files))).toEqual([])
    })
  })

  describe('(d) solo asignaciones consulta la tabla que crea la ficha (R30)', () => {
    it('ningun archivo del repo fuera de lib/modules/asignaciones consulta prisma.orderAssignment (R30)', () => {
      expect(appSources.length, 'no se leyo ningun fuente de la aplicacion').toBeGreaterThan(0)
      expect(findForeignPrismaAccessFindings(appSources)).toEqual([])
    })

    it('detecta prisma.orderAssignment en otro modulo, en la UI y en un script, y no lo detecta dentro de asignaciones (R30)', () => {
      const findings = findForeignPrismaAccessFindings([
        {
          relPath: 'lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts',
          content: 'const filas = await prisma.orderAssignment.findMany({ where: { orderId } });',
        },
        { relPath: 'app/(private)/pedidos/page.tsx', content: 'await prisma . orderAssignment . count()' },
        { relPath: 'scripts/seed.ts', content: 'await prisma.orderAssignment.deleteMany();' },
        {
          // El dueño SI puede: el dia que QC-87 traiga el repositorio, este archivo existira.
          relPath: `${ASIGNACIONES}/adapters/driven/persistence/order-assignment-prisma.ts`,
          content: 'await prisma.orderAssignment.create({ data });',
        },
        {
          // Y una MENCION en un comentario no es una consulta.
          relPath: 'lib/modules/pedidos/domain/order.ts',
          content: '// el responsable vive en prisma.orderAssignment, que es de otro modulo',
        },
      ])
      expect(findings).toEqual([
        "lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts consulta 'prisma.orderAssignment' fuera de lib/modules/asignaciones/ (R30)",
        "app/(private)/pedidos/page.tsx consulta 'prisma.orderAssignment' fuera de lib/modules/asignaciones/ (R30)",
        "scripts/seed.ts consulta 'prisma.orderAssignment' fuera de lib/modules/asignaciones/ (R30)",
      ])
    })
  })

  describe('(e) R29 en negativo, ENMENDADO por QC-87: quien puede exigirlos y quien no', () => {
    it('nadie los nombra fuera del catalogo, salvo los casos de uso de asignaciones/domain (R29, R50)', () => {
      expect(findPermissionUsageFindings(appSources)).toEqual([])
      // La otra mitad: el catalogo SI los declara. Sin esto, borrar los dos permisos del repo
      // entero dejaria este caso en verde.
      const catalogo = appSources.find((file) => file.relPath === CATALOGO_DE_PERMISOS)
      expect(catalogo, `no se leyo ${CATALOGO_DE_PERMISOS}`).toBeDefined()
      for (const codigo of CODIGOS_NUEVOS) {
        expect(stripComments((catalogo as { content: string }).content)).toContain(codigo)
      }
    })

    it('detecta el consumo de los dos codigos desde app/, components/, lib/shared/ y otro modulo (R29)', () => {
      const findings = findPermissionUsageFindings([
        {
          relPath: 'app/(private)/pedidos/page.tsx',
          content: "await requirePermission(actor, 'asignaciones.consultar');",
        },
        {
          relPath: 'components/orders/assign-button.tsx',
          content: "const puede = permisos.includes('asignaciones.modificar');",
        },
        {
          relPath: 'lib/shared/navigation/menu.ts',
          content: "{ href: PEDIDOS_ROUTE, permission: 'asignaciones.consultar' }",
        },
        {
          relPath: 'lib/modules/pedidos/domain/assign.ts',
          content: "requirePermission(actor, 'asignaciones.modificar');",
        },
      ])
      expect(findings).toEqual([
        "app/(private)/pedidos/page.tsx nombra 'asignaciones.consultar' (R29)",
        "components/orders/assign-button.tsx nombra 'asignaciones.modificar' (R29)",
        "lib/shared/navigation/menu.ts nombra 'asignaciones.consultar' (R29)",
        "lib/modules/pedidos/domain/assign.ts nombra 'asignaciones.modificar' (R29)",
      ])
    })

    /**
     * La puerta que QC-87 abre, y los tres portazos que siguen cerrados. Este caso es el que cae si
     * alguien «arregla» la enmienda ensanchandola: bastaria con permitir todo el modulo, o con
     * permitir los dos codigos, para que alguna de las tres ultimas lineas dejara de dar hallazgo.
     */
    it('la enmienda de QC-87 abre UNA puerta: `asignaciones.modificar` en asignaciones/domain/ y nada mas (R29, R1)', () => {
      const findings = findPermissionUsageFindings([
        // (1) LEGITIMO: es literalmente lo que R1 manda escribir.
        {
          relPath: `${ASIGNACIONES}/domain/assign-responsibles.ts`,
          content: "requirePermission(actor, 'asignaciones.modificar');",
        },
        // (2) El OTRO codigo, en OTRO archivo del mismo `domain/`: sigue siendo hallazgo.
        //     Exigirlo aqui, en la consulta de responsables, dejaria sin avatares a quien si puede
        //     ver el pedido; por eso su puerta es por ARCHIVO y no por carpeta.
        {
          relPath: `${ASIGNACIONES}/domain/list-order-responsibles.ts`,
          content: "requirePermission(actor, 'asignaciones.consultar');",
        },
        // (3) El MISMO codigo, en el adaptador driving del propio modulo: la autorizacion no vive
        //     ahi (QC-87 R43), y por eso la puerta es `domain/` y no el modulo entero.
        {
          relPath: `${ASIGNACIONES}/adapters/driving/order-assignment-actions.ts`,
          content: "if (!actor.permissions.includes('asignaciones.modificar')) return;",
        },
        // (4) Y en la pantalla, que es donde R50 pone el limite: QC-102.
        {
          relPath: 'app/(private)/pedidos/[id]/page.tsx',
          content: "const puede = permisos.includes('asignaciones.modificar');",
        },
      ])

      expect(findings).toEqual([
        `${ASIGNACIONES}/domain/list-order-responsibles.ts nombra 'asignaciones.consultar' (R29)`,
        `${ASIGNACIONES}/adapters/driving/order-assignment-actions.ts nombra 'asignaciones.modificar' (R29)`,
        "app/(private)/pedidos/[id]/page.tsx nombra 'asignaciones.modificar' (R29)",
      ])
      expect(
        isLegitimatePermissionConsumer(`${ASIGNACIONES}/domain/assign-responsibles.ts`, 'asignaciones.modificar'),
      ).toBe(true)
      expect(
        isLegitimatePermissionConsumer(`${ASIGNACIONES}/domain/assign-responsibles.ts`, 'asignaciones.consultar'),
      ).toBe(false)
    })

    /**
     * La segunda puerta y sus tres portazos: este es el caso que cae si alguien «arregla» la
     * enmienda ensanchandola a la carpeta, al modulo o a los dos codigos.
     */
    it('la enmienda de QC-88 abre UNA puerta: `asignaciones.consultar` en UN archivo de domain/ y nada mas (R29, R36)', () => {
      const findings = findPermissionUsageFindings([
        // (1) LEGITIMO, y solo esto: la primera linea del caso de uso nuevo.
        {
          relPath: CASO_DE_USO_QC88,
          content: "requirePermission(actor, 'asignaciones.consultar');",
        },
        // (2) PORTAZO: el mismo codigo en el adaptador `driving` del propio modulo. La autorizacion
        //     no vive ahi: la Server Action no comprueba permisos.
        {
          relPath: `${ASIGNACIONES}/adapters/driving/order-assignment-actions.ts`,
          content: "requirePermission(actor, 'asignaciones.consultar');",
        },
        // (3) PORTAZO: el mismo codigo en la pantalla, que es donde esta el limite.
        {
          relPath: 'app/(private)/mis-pedidos/page.tsx',
          content: "const puede = permisos.includes('asignaciones.consultar');",
        },
        // (4) PORTAZO: el mismo codigo en OTRO modulo. Un permiso de `asignaciones` lo exige
        //     `asignaciones`, no quien le pasa por al lado.
        {
          relPath: 'lib/modules/pedidos/domain/list-orders.ts',
          content: "requirePermission(actor, 'asignaciones.consultar');",
        },
      ])

      expect(findings).toEqual([
        `${ASIGNACIONES}/adapters/driving/order-assignment-actions.ts nombra 'asignaciones.consultar' (R29)`,
        "app/(private)/mis-pedidos/page.tsx nombra 'asignaciones.consultar' (R29)",
        "lib/modules/pedidos/domain/list-orders.ts nombra 'asignaciones.consultar' (R29)",
      ])

      // `components/**` y `lib/shared/**` cierran la lista de raices vigiladas. Se comprueban
      // aparte para que el mensaje de un futuro rojo diga cual de las cinco se aflojo.
      for (const relPath of ['components/orders/my-orders-table.tsx', 'lib/shared/navigation/menu.ts']) {
        expect(
          findPermissionUsageFindings([{ relPath, content: "const p = 'asignaciones.consultar';" }]),
          `${relPath} deberia seguir siendo un hallazgo (R36)`,
        ).toEqual([`${relPath} nombra 'asignaciones.consultar' (R29)`])
      }

      // La puerta es por IGUALDAD de ruta, no por prefijo: el archivo exacto si, su carpeta no.
      expect(isLegitimatePermissionConsumer(CASO_DE_USO_QC88, 'asignaciones.consultar')).toBe(true)
      expect(
        isLegitimatePermissionConsumer(`${ASIGNACIONES}/domain/list-order-responsibles.ts`, 'asignaciones.consultar'),
      ).toBe(false)
      // Y un vecino cuyo nombre EMPIEZA por el del archivo abierto tampoco entra: si esto se
      // escribiera con `startsWith`, `list-assigned-orders-v2.ts` colaria en verde.
      expect(
        isLegitimatePermissionConsumer(`${ASIGNACIONES}/domain/list-assigned-orders-v2.ts`, 'asignaciones.consultar'),
      ).toBe(false)
    })

    it('el alcance excluye permissions.ts, tests/, db/ y specs/, y tambien las simples menciones en comentarios (R29)', () => {
      // El catalogo DECLARA los dos codigos: es su trabajo (R25), no una violacion de R29.
      expect(isScopedForPermissionCodes(CATALOGO_DE_PERMISOS)).toBe(false)
      // `tests/**`, `db/**` y `specs/**` estan fuera a proposito: este mismo archivo escribe las
      // dos cadenas, el SQL de la migracion las inserta (R28) y la ficha las explica. Incluirlos
      // convertiria en rojo justo el trabajo que R25 y R28 mandan hacer.
      for (const ruta of [
        'tests/unit/asignaciones/module-contract.test.ts',
        'tests/unit/identity/permissions.test.ts',
        'db/migrations/20260911120000_order_assignments/migration.sql',
        'specs/QC-86-modelo-de-asignacion-de-pedidos/design.md',
      ]) {
        expect(isScopedForPermissionCodes(ruta)).toBe(false)
      }
      // Y dentro del alcance, una mencion en PROSA no es un consumo.
      expect(
        findPermissionUsageFindings([
          {
            relPath: 'app/(private)/pedidos/page.tsx',
            content: "// todavia nadie exige 'asignaciones.modificar' aqui (QC-86 R29)\nexport default function Page() { return null; }",
          },
        ]),
      ).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Mutaciones: cada regla DISPARA sobre el arbol y los fuentes REALES
  // -------------------------------------------------------------------------
  //
  // Los casos de arriba ya demuestran cada regla con un fuente sintetico, pero lo hacen sobre
  // datos inventados: si manana el barrido del repo real dejara de leer archivos —una raiz mal
  // escrita, un filtro de extension de mas—, todos los `toEqual([])` seguirian en verde sobre un
  // conjunto VACIO. Este bloque cierra ese agujero: toma lo que se leyo DEL DISCO, introduce la
  // violacion, y exige rojo. Si el barrido no ve nada, estas mutaciones tampoco disparan y el
  // test cae, que es lo que se quiere.
  describe('mutaciones — cada regla dispara sobre los datos REALES del repo', () => {
    it('mutacion (a): añadir una carpeta fuera de la lista al arbol real del modulo pone la regla en rojo (R36)', () => {
      // RETENSADO por QC-87: la mutacion ya no puede ser `ports/` —ahora es legitima—, asi que usa
      // una carpeta que sigue estando fuera de la lista cerrada. El proposito del bloque no
      // cambia: partir del arbol REAL leido del disco, meterle la violacion y exigir rojo.
      expect(findModuleShapeFindings(asignacionesEntries)).toEqual([])
      expect(
        findModuleShapeFindings([...asignacionesEntries, { name: 'utils', isDirectory: true }]),
      ).toContainEqual('lib/modules/asignaciones/utils/: carpeta fuera del alcance del modulo (R36)')
    })

    it('mutacion (b): añadir un import de ruta interna de otro modulo al barril real pone la regla en rojo (R31)', () => {
      const barrilReal = asignacionesSources.find((file) => file.relPath === BARRIL)
      expect(barrilReal, `no se leyo ${BARRIL}`).toBeDefined()
      const mutado = {
        relPath: BARRIL,
        content: `import type { Order } from '@/lib/modules/pedidos/domain/order';\n${(barrilReal as { content: string }).content}`,
      }
      expect(findModuleBoundaryFindings(mutado)).toContainEqual(
        "lib/modules/asignaciones/index.ts importa '@/lib/modules/pedidos/domain/order', ruta interna del modulo 'pedidos' (R31)",
      )
    })

    it('mutacion (c): un @prisma/client en el dominio real alcanzable desde el barril pone la regla en rojo (R31)', () => {
      const dominio = `${ASIGNACIONES}/domain/order-assignment.ts`
      const original = leerDelDisco(dominio)
      expect(original, `no se leyo ${dominio}`).not.toBeNull()
      // Lector REAL con un solo archivo sustituido: el barril no se toca.
      const lectorMutado: ReadSource = (relBase) => {
        const leido = leerDelDisco(relBase)
        if (leido === null) return null
        if (leido.relPath !== dominio) return leido
        return { relPath: leido.relPath, content: `import type { Prisma } from '@prisma/client';\n${leido.content}` }
      }
      expect(findContractLeakageFindings(BARRIL, barrilContent, lectorMutado)).toContainEqual(
        "lib/modules/asignaciones/index.ts arrastra '@prisma/client' en su cierre de imports (R31)",
      )
    })

    it('mutacion (d): consultar prisma.orderAssignment desde un archivo real de otro modulo pone la regla en rojo (R30)', () => {
      const ajeno = appSources.find((file) => file.relPath === CATALOGO_DE_PERMISOS)
      expect(ajeno, `no se leyo ${CATALOGO_DE_PERMISOS}`).toBeDefined()
      const mutados = appSources.map((file) =>
        file.relPath === CATALOGO_DE_PERMISOS
          ? { relPath: file.relPath, content: `${file.content}\nconst x = prisma.orderAssignment.findMany();` }
          : file,
      )
      expect(findForeignPrismaAccessFindings(mutados)).toEqual([
        `${CATALOGO_DE_PERMISOS} consulta 'prisma.orderAssignment' fuera de ${ASIGNACIONES}/ (R30)`,
      ])
    })

    it('mutacion (e): consumir asignaciones.modificar desde un archivo real de app/ pone la regla en rojo (R29)', () => {
      const pantalla = appSources.find((file) => file.relPath.startsWith('app/') && file.relPath.endsWith('page.tsx'))
      expect(pantalla, 'no se leyo ninguna pantalla bajo app/').toBeDefined()
      const objetivo = pantalla as { relPath: string; content: string }
      const mutados = appSources.map((file) =>
        file.relPath === objetivo.relPath
          ? { relPath: file.relPath, content: `${file.content}\nconst p = 'asignaciones.modificar';` }
          : file,
      )
      expect(findPermissionUsageFindings(mutados)).toEqual([`${objetivo.relPath} nombra 'asignaciones.modificar' (R29)`])
    })

    /**
     * La otra mitad de la mutacion (e), que QC-87 añade con su enmienda: la puerta abierta no tapa
     * `asignaciones.consultar`. Se hace sobre el fuente REAL del caso de uso que mas cerca esta de
     * caer en la tentacion —la consulta de responsables—, que hoy exige `pedidos.consultar`.
     */
    it('mutacion (e2): exigir asignaciones.consultar desde un caso de uso real de asignaciones pone la regla en rojo (R29)', () => {
      const objetivo = `${ASIGNACIONES}/domain/list-order-responsibles.ts`
      const caso = appSources.find((file) => file.relPath === objetivo)
      expect(caso, `no se leyo ${objetivo}`).toBeDefined()
      const mutados = appSources.map((file) =>
        file.relPath === objetivo
          ? { relPath: file.relPath, content: `${file.content}\nconst p = 'asignaciones.consultar';` }
          : file,
      )
      expect(findPermissionUsageFindings(mutados)).toEqual([`${objetivo} nombra 'asignaciones.consultar' (R29)`])
    })

    function conLinea(objetivo: string, linea: string): ReadonlyArray<{ relPath: string; content: string }> {
      expect(
        appSources.some((file) => file.relPath === objetivo),
        `no se leyo ${objetivo}`,
      ).toBe(true)
      return appSources.map((file) =>
        file.relPath === objetivo ? { relPath: file.relPath, content: `${file.content}
${linea}` } : file,
      )
    }

    it('R15: asignaciones.ejecutar se nombra solo en los tres casos de uso, actor.ts y la pantalla de ejecucion', () => {
      const nombran = appSources
        .filter((file) => isScopedForPermissionCodes(file.relPath))
        .filter((file) => stripComments(file.content).includes('asignaciones.ejecutar'))
        .map((file) => file.relPath)
        .sort()
      expect(nombran).toEqual([PAGINA_EJECUCION, PREDICADO_DE_EJECUCION, ...CASOS_DE_USO_QC63].sort())
    })

    it.each([
      `${ASIGNACIONES}/domain/assignment-views.ts`,
      `${ASIGNACIONES}/domain/list-assigned-orders.ts`,
      `${ASIGNACIONES}/domain/list-finished-orders.ts`,
      'app/(private)/asignacion/page.tsx',
    ])('R15 mutacion: nombrar asignaciones.ejecutar en %s pone la regla en rojo', (objetivo) => {
      const mutados = conLinea(objetivo, "const p = 'asignaciones.ejecutar';")
      expect(findPermissionUsageFindings(mutados)).toEqual([`${objetivo} nombra 'asignaciones.ejecutar' (R29)`])
    })

    it.each([...CASOS_DE_USO_QC63, PAGINA_EJECUCION])(
      'R15 mutacion: %s ya no puede nombrar asignaciones.consultar',
      (objetivo) => {
        const mutados = conLinea(objetivo, "const p = 'asignaciones.consultar';")
        expect(findPermissionUsageFindings(mutados)).toEqual([`${objetivo} nombra 'asignaciones.consultar' (R29)`])
      },
    )
  })
})
