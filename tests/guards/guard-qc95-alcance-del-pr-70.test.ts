// QC-95 — Guardia: el alcance del PR #70 (R8, R9, R10).
//
//   R8  — la limpieza NO toca la politica de bloqueo por intentos, ni el calculo del estado
//         efectivo de QC-78, ni el login (`verify-credentials`), ni la resolucion de sesion
//         (`resolve-session`).
//   R9  — ni `db/schema.prisma`, ni `db/migrations/`, ni ninguna dependencia nueva
//         (`package.json`, `pnpm-lock.yaml`).
//   R10 — nada bajo `app/` ni `components/`.
//
// **Por que esta guardia NO mide la rama actual (decision humana, 2026-09-15).**
// QC-95 ya esta mergeada en `dev` (PR #70). Una guardia de rama escrita despues del merge no ve
// nunca el diff de la ficha: haria `skip` siempre y seria el anti-patron de la validacion opcional
// (`docs/verification.md`). Por eso se ancla al RANGO INMUTABLE del propio PR, con SHAs completos:
//
//   git diff --name-only --no-renames 0ed8431e7e67c69532c0c0cb40e7d8e0dc04853c f777c56f941b0fdae1566663d24f82fd413fd1b5
//
// - `f777c56…` es el merge del PR #70. Sus padres son `0ed8431…` (dev justo antes) y `f728d15…`
//   (el unico commit de la feature).
// - El rango PRIMARIO es `0ed8431..f777c56` y no `f728d15^..f728d15`. Es exactamente lo que el
//   PR #70 metio en `dev`, INCLUIDA cualquier resolucion de conflictos hecha en el propio merge,
//   que el diff del commit de la feature no veria.
// - `--no-renames`: un renombrado aparece como borrado + alta. Si el PR hubiera movido un archivo
//   de R8, se veria la ruta vieja y no solo la nueva.
//
// **Anclas, para que un rango mal escrito no pase en vacio.**
//   (1) `f777c56` tiene EXACTAMENTE los padres [0ed8431…, f728d15…];
//   (2) el rango no esta vacio y contiene los tres archivos de produccion de QC-95 y la carpeta de
//       su spec;
//   (3) la lista de `f728d15^..f728d15` coincide con la del rango primario.
//
// **Fallo ruidoso, nunca salto.** Si un commit no esta en el clon (clon superficial en CI, remoto
// ausente), los casos LANZAN con un mensaje que dice que R8/R9/R10 NO se han comprobado y como
// arreglarlo (`git fetch --unshallow` / `git fetch origin dev`). Aqui no hay `ctx.skip`: un salto
// seria un verde que no ha mirado nada. El ejecutor de git es inyectable para probar ese camino
// sin tocar el clon (describe final).
//
// **Por que este archivo no se pondra rojo por trabajo ajeno.** El rango es inmutable. Lo que
// hagan las fichas siguientes con `db/`, `app/` o `package.json` no entra en el rango, asi que no
// repite el fallo de las seis guardias de `tests/baseline-rojos.json`. Su unica dependencia del
// arbol vivo es que las rutas de R8 existan, y es a proposito (ver `RUTAS_R8`).

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

// ---------------------------------------------------------------------------------------------
// El rango del PR #70
// ---------------------------------------------------------------------------------------------

/** `dev` justo antes del merge del PR #70 (primer padre de `MERGE_DEL_PR_70`). */
export const BASE_DEL_PR_70 = '0ed8431e7e67c69532c0c0cb40e7d8e0dc04853c'

/** El merge del PR #70 en `dev`. */
export const MERGE_DEL_PR_70 = 'f777c56f941b0fdae1566663d24f82fd413fd1b5'

/** El unico commit de la feature (segundo padre de `MERGE_DEL_PR_70`). */
export const COMMIT_DE_LA_FEATURE = 'f728d154cd3dff6a20f1de0ca9c79ad9b743e102'

/** Los tres archivos de produccion de QC-95: si el rango no los trae, no es el rango de QC-95. */
export const PRODUCCION_DE_QC95 = [
  'lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts',
  'lib/modules/identity/domain/set-user-account-status.ts',
  'lib/modules/identity/ports/user-admin-repository.ts',
] as const

export const CARPETA_DEL_SPEC_DE_QC95 = 'specs/QC-95-desbloqueo-manual-limpia-el-conteo/'

// ---------------------------------------------------------------------------------------------
// Lo que cada requisito prohibe
// ---------------------------------------------------------------------------------------------

/**
 * R8. Rutas POSIX exactas, verificadas en disco y con `git log` el 2026-09-15.
 *
 * ENTRAN:
 * - `domain/account-lock.ts`: `nextLockState` e `isLocked`, que R8 nombra. Es la politica de
 *   bloqueo por intentos. OJO: R8 la atribuye a QC-19, pero `git log` dice que nacio en QC-7
 *   (23323a6) y QC-78 la amplio; el spec de QC-19 no menciona ni bloqueo ni intentos. Se vigila
 *   por lo que R8 NOMBRA (las funciones), no por la etiqueta.
 * - `domain/effective-account-status.ts`: `effectiveAccountStatus`, que R8 nombra, y
 *   `accountStatusAfterAttempt` y `clearedLockState`, de QC-78. QC-95 IMPORTA `clearedLockState`
 *   (R6), pero no la cambia.
 * - `domain/verify-credentials.ts`: el login, que R8 nombra.
 * - `domain/resolve-session.ts`: la resolucion de sesion, que R8 nombra.
 * - `domain/resolve-session-user.ts`: la proyeccion de usuario de esa MISMA resolucion (QC-8).
 *   Envuelve `createResolveSession` y es lo que consume `SessionProvider`. Cambiarla cambia lo
 *   que la resolucion de sesion entrega.
 * - `ports/login-attempt-recorder.ts`: el puerto por el que la politica de intentos PERSISTE lo
 *   que calcula `nextLockState`. Su propio comentario lo dice: «la politica de escalada no se
 *   reparte entre dominio y adaptador». Tocar su contrato es tocar la politica.
 * - `ports/user-credentials-reader.ts`: la entrada del login. Trae crudos `accountStatus` y
 *   `lockedUntil` para `effectiveAccountStatus`.
 * - `adapters/driven/persistence/user-credentials-prisma.ts`: implementa esos dos puertos. Es
 *   quien escribe los contadores en cada intento de login.
 * - `ports/session-user-reader.ts` y `adapters/driven/persistence/session-user-prisma.ts`: la
 *   lectura de la que vive la resolucion de sesion. Trae `lockedUntil` para el calculo del estado
 *   efectivo (QC-78 R20, R21). Es el simetrico, en la sesion, de `user-credentials-prisma.ts` en
 *   el login.
 *
 * NO ENTRA:
 * - `domain/credential-policy.ts`: es la politica de CONTRASENAS de QC-19 (longitud, composicion,
 *   lista de filtradas). No sabe nada de intentos ni de bloqueo, y R8 habla de «bloqueo por
 *   intentos». Meterla por la etiqueta «QC-19» vigilaria algo que R8 no protege.
 * - `domain/account-status.ts`: solo el catalogo de estados, que comparte con QC-66. No es el
 *   mecanismo de bloqueo ni el calculo del estado efectivo.
 * - `lib/composition/index.ts`: cablea el login, pero R8 no lo nombra. Su intangibilidad la
 *   revisa la review (§2), no este requisito.
 *
 * Por que cada ruta tambien tiene que EXISTIR en disco: si alguien renombra una, la lista pasaria
 * a vigilar una ruta que ya no esta y el caso seguiria verde sin mirar nada. Asi cae y obliga a
 * actualizar la lista.
 */
export const RUTAS_R8 = [
  'lib/modules/identity/domain/account-lock.ts',
  'lib/modules/identity/domain/effective-account-status.ts',
  'lib/modules/identity/domain/verify-credentials.ts',
  'lib/modules/identity/domain/resolve-session.ts',
  'lib/modules/identity/domain/resolve-session-user.ts',
  'lib/modules/identity/ports/login-attempt-recorder.ts',
  'lib/modules/identity/ports/user-credentials-reader.ts',
  'lib/modules/identity/ports/session-user-reader.ts',
  'lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts',
  'lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts',
] as const

/** Una regla de alcance: rutas POSIX exactas y prefijos de carpeta (siempre acabados en `/`). */
export interface ReglaDeAlcance {
  readonly exactas: readonly string[]
  readonly prefijos: readonly string[]
}

export const REGLA_R8: ReglaDeAlcance = { exactas: RUTAS_R8, prefijos: [] }

export const REGLA_R9: ReglaDeAlcance = {
  exactas: ['db/schema.prisma', 'package.json', 'pnpm-lock.yaml'],
  prefijos: ['db/migrations/'],
}

export const REGLA_R10: ReglaDeAlcance = { exactas: [], prefijos: ['app/', 'components/'] }

/**
 * Los de `archivos` que caen bajo `regla`. Solo cuenta la ruta POSIX exacta o el prefijo de
 * carpeta. Nunca el basename ni una subcadena: `docs/db/schema.prisma` no es `db/schema.prisma`, y
 * `lib/components/x.tsx` no esta bajo `components/`.
 */
export function coincidencias(archivos: readonly string[], regla: ReglaDeAlcance): string[] {
  return archivos.filter(
    (archivo) =>
      regla.exactas.includes(archivo) || regla.prefijos.some((prefijo) => archivo.startsWith(prefijo)),
  )
}

export function violacionesR8(archivos: readonly string[]): string[] {
  return coincidencias(archivos, REGLA_R8)
}

export function violacionesR9(archivos: readonly string[]): string[] {
  return coincidencias(archivos, REGLA_R9)
}

export function violacionesR10(archivos: readonly string[]): string[] {
  return coincidencias(archivos, REGLA_R10)
}

// ---------------------------------------------------------------------------------------------
// Git, inyectable
// ---------------------------------------------------------------------------------------------

/** Ejecuta git con `args` y devuelve su stdout recortado. LANZA si git sale con codigo != 0. */
export type EjecutorGit = (args: readonly string[]) => string

export const gitReal: EjecutorGit = (args) =>
  execFileSync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

/** El mensaje de TODO fallo que impide medir: dice que no se ha comprobado nada y como arreglarlo. */
export function mensajeNoComprobado(detalle: string): string {
  return (
    `QC-95 R8, R9 y R10 NO se han comprobado: ${detalle}\n` +
    'Esta guardia mide el rango inmutable del PR #70 y necesita sus commits en el clon. Si el ' +
    'clon es superficial, corre `git fetch --unshallow`; si falta el remoto o la rama, ' +
    '`git fetch origin dev`. Despues vuelve a correr la guardia. No se salta a proposito: un ' +
    'salto aqui seria un verde que no ha mirado nada (docs/verification.md > El anti-patron: la ' +
    'validacion opcional).'
  )
}

function esClonSuperficial(git: EjecutorGit): boolean | null {
  try {
    return git(['rev-parse', '--is-shallow-repository']) === 'true'
  } catch {
    return null
  }
}

/** LANZA con `mensajeNoComprobado` si `rev` no resuelve a un commit presente en el clon. */
export function exigirCommit(rev: string, etiqueta: string, git: EjecutorGit): void {
  try {
    git(['cat-file', '-e', `${rev}^{commit}`])
  } catch {
    const superficial = esClonSuperficial(git)
    const estado =
      superficial === true
        ? 'el clon es SUPERFICIAL'
        : superficial === false
          ? 'el clon no es superficial: falta el commit o el remoto'
          : 'no se pudo saber si el clon es superficial'
    throw new Error(
      mensajeNoComprobado(`el commit ${rev} (${etiqueta}) no existe en este clon (${estado}).`),
    )
  }
}

/** Archivos que cambian entre `base` y `punta`, ordenados. LANZA si el rango no resuelve. */
export function archivosDelRango(base: string, punta: string, git: EjecutorGit): string[] {
  exigirCommit(base, 'base del rango', git)
  exigirCommit(punta, 'punta del rango', git)

  let salida: string
  try {
    salida = git(['-c', 'core.quotepath=off', 'diff', '--name-only', '--no-renames', base, punta])
  } catch (error) {
    throw new Error(
      mensajeNoComprobado(
        `\`git diff --name-only ${base} ${punta}\` fallo con los dos commits presentes: ${String(error)}`,
      ),
    )
  }

  return salida
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .sort()
}

/** Padres de `sha`, en orden. LANZA si el commit no esta en el clon. */
export function padresDe(sha: string, git: EjecutorGit): string[] {
  exigirCommit(sha, 'merge del PR #70', git)
  return git(['show', '-s', '--format=%P', sha])
    .split(/\s+/)
    .filter((padre) => padre.length > 0)
}

// ---------------------------------------------------------------------------------------------
// Anclas (puras)
// ---------------------------------------------------------------------------------------------

/** Ancla (1): el merge tiene exactamente los dos padres del PR #70, en ese orden. */
export function anclaPadres(padresDelMerge: readonly string[]): string[] {
  const esperados = [BASE_DEL_PR_70, COMMIT_DE_LA_FEATURE]
  if (padresDelMerge.length === 2 && padresDelMerge.every((padre, i) => padre === esperados[i])) {
    return []
  }
  return [
    `el merge ${MERGE_DEL_PR_70} deberia tener exactamente los padres [${esperados.join(', ')}] ` +
      `y tiene [${padresDelMerge.join(', ')}]: el rango no es el del PR #70.`,
  ]
}

/** Ancla (2): el rango no esta vacio y trae la produccion y el spec de QC-95. */
export function anclaContenido(archivosDelPr: readonly string[]): string[] {
  if (archivosDelPr.length === 0) {
    return ['el rango del PR #70 esta VACIO: sin archivos, R8/R9/R10 pasarian sin mirar nada.']
  }
  const problemas = PRODUCCION_DE_QC95.filter((ruta) => !archivosDelPr.includes(ruta)).map(
    (ruta) => `el rango no contiene ${ruta}: no es el rango de QC-95.`,
  )
  if (!archivosDelPr.some((archivo) => archivo.startsWith(CARPETA_DEL_SPEC_DE_QC95))) {
    problemas.push(`el rango no contiene nada bajo ${CARPETA_DEL_SPEC_DE_QC95}: no es el rango de QC-95.`)
  }
  return problemas
}

/** Ancla (3): el diff del merge y el del commit de la feature listan los mismos archivos. */
export function anclaCoincidencia(
  archivosDelPr: readonly string[],
  archivosDelCommit: readonly string[],
): string[] {
  const soloEnPr = archivosDelPr.filter((archivo) => !archivosDelCommit.includes(archivo))
  const soloEnCommit = archivosDelCommit.filter((archivo) => !archivosDelPr.includes(archivo))
  if (soloEnPr.length === 0 && soloEnCommit.length === 0) return []
  return [
    `el rango ${BASE_DEL_PR_70}..${MERGE_DEL_PR_70} y el commit ${COMMIT_DE_LA_FEATURE} no listan ` +
      `lo mismo. Solo en el merge: [${soloEnPr.join(', ')}]. Solo en el commit: ` +
      `[${soloEnCommit.join(', ')}].`,
  ]
}

// ---------------------------------------------------------------------------------------------
// La auditoria completa
// ---------------------------------------------------------------------------------------------

export interface AuditoriaDelPr {
  readonly padresDelMerge: readonly string[]
  readonly archivosDelPr: readonly string[]
  readonly archivosDelCommit: readonly string[]
  readonly anclas: readonly string[]
  readonly r8: readonly string[]
  readonly r9: readonly string[]
  readonly r10: readonly string[]
}

/** Mide el rango del PR #70 con `git`. LANZA (nunca devuelve «nada que decir») si no puede. */
export function auditarRangoDelPr(git: EjecutorGit): AuditoriaDelPr {
  const padresDelMerge = padresDe(MERGE_DEL_PR_70, git)
  const archivosDelPr = archivosDelRango(BASE_DEL_PR_70, MERGE_DEL_PR_70, git)
  const archivosDelCommit = archivosDelRango(`${COMMIT_DE_LA_FEATURE}^`, COMMIT_DE_LA_FEATURE, git)

  return {
    padresDelMerge,
    archivosDelPr,
    archivosDelCommit,
    anclas: [
      ...anclaPadres(padresDelMerge),
      ...anclaContenido(archivosDelPr),
      ...anclaCoincidencia(archivosDelPr, archivosDelCommit),
    ],
    r8: violacionesR8(archivosDelPr),
    r9: violacionesR9(archivosDelPr),
    r10: violacionesR10(archivosDelPr),
  }
}

// Una sola medicion contra el clon real, compartida por los casos. Si lanza, se guarda el error y
// CADA caso lo relanza: todos quedan rojos con el mismo mensaje, ninguno verde ni saltado.
let medicionReal: { readonly ok: AuditoriaDelPr } | { readonly error: unknown } | null = null

function auditoriaReal(): AuditoriaDelPr {
  if (medicionReal === null) {
    try {
      medicionReal = { ok: auditarRangoDelPr(gitReal) }
    } catch (error) {
      medicionReal = { error }
    }
  }
  if ('error' in medicionReal) throw medicionReal.error
  return medicionReal.ok
}

// ---------------------------------------------------------------------------------------------

describe('QC-95 — el alcance del PR #70, medido sobre su rango inmutable (R8, R9, R10)', () => {
  it('ancla (1): el merge f777c56 tiene exactamente los padres 0ed8431 (dev) y f728d15 (la feature)', () => {
    const { padresDelMerge } = auditoriaReal()
    expect(anclaPadres(padresDelMerge), anclaPadres(padresDelMerge).join('\n')).toEqual([])
  })

  it('ancla (2): el rango del PR no esta vacio y contiene los tres archivos de produccion y el spec de QC-95', () => {
    const { archivosDelPr } = auditoriaReal()
    expect(anclaContenido(archivosDelPr), anclaContenido(archivosDelPr).join('\n')).toEqual([])
  })

  it('ancla (3): el rango del merge y el del commit de la feature listan los mismos archivos', () => {
    const { archivosDelPr, archivosDelCommit } = auditoriaReal()
    const problemas = anclaCoincidencia(archivosDelPr, archivosDelCommit)
    expect(problemas, problemas.join('\n')).toEqual([])
  })

  it('R9: el PR #70 no toca `db/schema.prisma`, `db/migrations/`, `package.json` ni `pnpm-lock.yaml`', () => {
    const { r9 } = auditoriaReal()
    expect(
      r9,
      `QC-95 R9: la ficha no añade columnas, tablas, indices, enums, migraciones ni dependencias, y ` +
        `el rango ${BASE_DEL_PR_70}..${MERGE_DEL_PR_70} trae:\n${r9.join('\n')}`,
    ).toEqual([])
  })

  it('R10: el PR #70 no trae nada bajo `app/` ni `components/`', () => {
    const { r10 } = auditoriaReal()
    expect(
      r10,
      `QC-95 R10: la ficha es backend puro, sin pantallas, componentes ni rutas, y el rango ` +
        `${BASE_DEL_PR_70}..${MERGE_DEL_PR_70} trae:\n${r10.join('\n')}`,
    ).toEqual([])
  })

  it('R8: el PR #70 no modifica la politica de bloqueo por intentos, el estado efectivo, el login ni la resolucion de sesion', () => {
    const { r8 } = auditoriaReal()
    expect(
      r8,
      `QC-95 R8: nextLockState, isLocked, effectiveAccountStatus, verify-credentials y ` +
        `resolve-session (y sus puertos y adaptadores de persistencia) debian quedar intactos, y el ` +
        `rango ${BASE_DEL_PR_70}..${MERGE_DEL_PR_70} trae:\n${r8.join('\n')}`,
    ).toEqual([])
  })

  it('R8: cada archivo vigilado por R8 existe en disco (un renombrado tira la guardia en vez de medir aire)', () => {
    const ausentes = RUTAS_R8.filter((ruta) => !existsSync(join(repoRoot, ruta)))
    expect(
      ausentes,
      `Rutas de R8 que ya no estan en disco:\n${ausentes.join('\n')}\n` +
        'Si se renombraron, actualiza RUTAS_R8 con la ruta nueva Y mira si ese renombrado vino de ' +
        'QC-95 (no deberia: R8). Si se borraron, decide si el requisito sigue teniendo objeto.',
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Casos sinteticos: la guardia MUERDE (sin git real)
// ---------------------------------------------------------------------------------------------

/** La lista real del PR #70, escrita a mano (verificada con `git diff --name-only` el 2026-09-15). */
const ARCHIVOS_DEL_PR_70_A_MANO = [
  'lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts',
  'lib/modules/identity/domain/set-user-account-status.ts',
  'lib/modules/identity/ports/user-admin-repository.ts',
  'progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md',
  'specs/QC-95-desbloqueo-manual-limpia-el-conteo/design.md',
  'specs/QC-95-desbloqueo-manual-limpia-el-conteo/requirements.md',
  'specs/QC-95-desbloqueo-manual-limpia-el-conteo/tasks.md',
  'tests/integration/identity/last-administrator.int.test.ts',
  'tests/integration/identity/session-stamp-writes.int.test.ts',
  'tests/integration/identity/user-crud.int.test.ts',
  'tests/unit/identity/usuarios/set-user-account-status-lock.test.ts',
]

interface ClonFalso {
  readonly commits: readonly string[]
  readonly superficial: boolean
  readonly padres?: Readonly<Record<string, readonly string[]>>
  /** Clave `base..punta`, con la misma grafia que recibe `archivosDelRango`. */
  readonly diffs?: Readonly<Record<string, readonly string[]>>
  readonly diffRoto?: boolean
}

function falloDeGit(que: string): never {
  throw new Error(`fatal (git falso): ${que}`)
}

/** Un git que responde lo justo para `auditarRangoDelPr` y lanza como el real ante lo demas. */
function gitFalso(clon: ClonFalso): EjecutorGit {
  const existe = (rev: string): boolean => {
    const sinPeel = rev.endsWith('^{commit}') ? rev.slice(0, -'^{commit}'.length) : rev
    const sinPadre = sinPeel.endsWith('^') ? sinPeel.slice(0, -1) : sinPeel
    return clon.commits.includes(sinPadre)
  }

  return (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') {
      return String(clon.superficial)
    }
    if (args[0] === 'cat-file') {
      const rev = args[args.length - 1] ?? ''
      return existe(rev) ? '' : falloDeGit(`Not a valid object name ${rev}`)
    }
    if (args[0] === 'show') {
      const sha = args[args.length - 1] ?? ''
      const padres = clon.padres?.[sha]
      return padres === undefined ? falloDeGit(`bad object ${sha}`) : padres.join(' ')
    }
    if (args.includes('diff')) {
      if (clon.diffRoto === true) return falloDeGit('diff roto')
      const [base, punta] = args.slice(-2)
      const lista = clon.diffs?.[`${base}..${punta}`]
      return lista === undefined ? falloDeGit(`bad revision ${base}..${punta}`) : lista.join('\n')
    }
    return falloDeGit(`comando no simulado: git ${args.join(' ')}`)
  }
}

/** Un clon completo y sano cuyo rango del PR (y del commit) es `archivos`. */
function clonSano(archivos: readonly string[], archivosDelCommit: readonly string[] = archivos): ClonFalso {
  return {
    commits: [BASE_DEL_PR_70, MERGE_DEL_PR_70, COMMIT_DE_LA_FEATURE],
    superficial: false,
    padres: { [MERGE_DEL_PR_70]: [BASE_DEL_PR_70, COMMIT_DE_LA_FEATURE] },
    diffs: {
      [`${BASE_DEL_PR_70}..${MERGE_DEL_PR_70}`]: archivos,
      [`${COMMIT_DE_LA_FEATURE}^..${COMMIT_DE_LA_FEATURE}`]: archivosDelCommit,
    },
  }
}

const INOCUO = 'lib/modules/identity/domain/set-user-account-status.ts'

describe('QC-95 — los detectores de alcance MUERDEN (casos sinteticos)', () => {
  it('R9: `db/schema.prisma`, una migracion, `package.json` y `pnpm-lock.yaml` son hallazgo cada uno por separado', () => {
    for (const prohibido of [
      'db/schema.prisma',
      'db/migrations/20260915000000_x/migration.sql',
      'package.json',
      'pnpm-lock.yaml',
    ]) {
      expect(violacionesR9([INOCUO, prohibido]), prohibido).toEqual([prohibido])
    }
  })

  it('R10: una pagina bajo `app/` y un componente bajo `components/` son hallazgo', () => {
    expect(violacionesR10([INOCUO, 'app/(private)/usuarios/page.tsx'])).toEqual([
      'app/(private)/usuarios/page.tsx',
    ])
    expect(violacionesR10([INOCUO, 'components/shared/x.tsx'])).toEqual(['components/shared/x.tsx'])
  })

  it('R8: cada archivo del bloqueo por intentos, del estado efectivo, del login y de la sesion es hallazgo por separado', () => {
    expect(RUTAS_R8.length).toBeGreaterThanOrEqual(5)
    for (const ruta of RUTAS_R8) {
      expect(violacionesR8([INOCUO, ruta]), ruta).toEqual([ruta])
    }
  })

  it('la comparacion es por ruta POSIX exacta y prefijo de carpeta, no por basename ni subcadena', () => {
    const parecidos = [
      'docs/db/schema.prisma',
      'db/schema.prisma.bak',
      'tests/fixtures/package.json',
      'components.json',
      'lib/components/x.tsx',
      'application/page.tsx',
      'tests/unit/app/x.test.ts',
      'lib/modules/otro/domain/account-lock.ts',
      'tests/unit/identity/verify-credentials.test.ts',
    ]
    expect(violacionesR8(parecidos)).toEqual([])
    expect(violacionesR9(parecidos)).toEqual([])
    expect(violacionesR10(parecidos)).toEqual([])

    for (const regla of [REGLA_R8, REGLA_R9, REGLA_R10]) {
      for (const prefijo of regla.prefijos) expect(prefijo.endsWith('/'), prefijo).toBe(true)
    }
  })

  it('la lista REAL del PR #70, escrita a mano, no da ninguna violacion de R8, R9 ni R10', () => {
    expect(ARCHIVOS_DEL_PR_70_A_MANO).toHaveLength(11)
    expect(violacionesR8(ARCHIVOS_DEL_PR_70_A_MANO)).toEqual([])
    expect(violacionesR9(ARCHIVOS_DEL_PR_70_A_MANO)).toEqual([])
    expect(violacionesR10(ARCHIVOS_DEL_PR_70_A_MANO)).toEqual([])
    expect(anclaContenido(ARCHIVOS_DEL_PR_70_A_MANO)).toEqual([])
  })

  it('un rango sintetico sano, con los padres y la lista real, no da hallazgos ni anclas caidas', () => {
    const auditoria = auditarRangoDelPr(gitFalso(clonSano(ARCHIVOS_DEL_PR_70_A_MANO)))
    expect(auditoria.anclas).toEqual([])
    expect(auditoria.r8).toEqual([])
    expect(auditoria.r9).toEqual([])
    expect(auditoria.r10).toEqual([])
  })

  it('un rango sintetico con archivos prohibidos: la auditoria completa los detecta en R8, R9 y R10', () => {
    const conProhibidos = [
      ...ARCHIVOS_DEL_PR_70_A_MANO,
      'app/(private)/usuarios/page.tsx',
      'db/schema.prisma',
      'lib/modules/identity/domain/account-lock.ts',
    ].sort()
    const auditoria = auditarRangoDelPr(gitFalso(clonSano(conProhibidos)))
    expect(auditoria.anclas).toEqual([])
    expect(auditoria.r8).toEqual(['lib/modules/identity/domain/account-lock.ts'])
    expect(auditoria.r9).toEqual(['db/schema.prisma'])
    expect(auditoria.r10).toEqual(['app/(private)/usuarios/page.tsx'])
  })

  it('un rango vacio o sin la produccion y el spec de QC-95 hace caer el ancla (2): no pasa en vacio', () => {
    expect(anclaContenido([])).toHaveLength(1)
    expect(anclaContenido([])[0]).toContain('VACIO')

    const ajeno = anclaContenido(['lib/modules/pedidos/domain/x.ts'])
    expect(ajeno).toHaveLength(PRODUCCION_DE_QC95.length + 1)
    expect(ajeno.join('\n')).toContain(CARPETA_DEL_SPEC_DE_QC95)
  })

  it('padres distintos o una lista del commit distinta hacen caer las anclas (1) y (3)', () => {
    expect(anclaPadres([BASE_DEL_PR_70])).toHaveLength(1)
    expect(anclaPadres([COMMIT_DE_LA_FEATURE, BASE_DEL_PR_70])).toHaveLength(1)
    expect(anclaPadres([BASE_DEL_PR_70, COMMIT_DE_LA_FEATURE, 'otro'])).toHaveLength(1)
    expect(anclaPadres([BASE_DEL_PR_70, COMMIT_DE_LA_FEATURE])).toEqual([])

    const resolucionEnElMerge = [...ARCHIVOS_DEL_PR_70_A_MANO, 'package.json'].sort()
    const auditoria = auditarRangoDelPr(
      gitFalso(clonSano(resolucionEnElMerge, ARCHIVOS_DEL_PR_70_A_MANO)),
    )
    expect(auditoria.anclas.join('\n')).toContain('Solo en el merge: [package.json]')
    expect(auditoria.r9).toEqual(['package.json'])
  })

  it('un commit ausente en un clon SUPERFICIAL lanza con `git fetch --unshallow`, nunca salta', () => {
    const clon: ClonFalso = { ...clonSano(ARCHIVOS_DEL_PR_70_A_MANO), commits: [MERGE_DEL_PR_70], superficial: true }
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(/git fetch --unshallow/)
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(/R8, R9 y R10 NO se han comprobado/)
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(/SUPERFICIAL/)
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(new RegExp(BASE_DEL_PR_70))
  })

  it('un commit ausente en un clon completo tambien lanza, y remite a `git fetch origin dev`', () => {
    const clon: ClonFalso = { ...clonSano(ARCHIVOS_DEL_PR_70_A_MANO), commits: [], superficial: false }
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(/git fetch origin dev/)
    expect(() => auditarRangoDelPr(gitFalso(clon))).toThrow(/NO se han comprobado/)
  })

  it('si `git diff` falla con los commits presentes, tambien lanza en vez de devolver una lista vacia', () => {
    const clon: ClonFalso = { ...clonSano(ARCHIVOS_DEL_PR_70_A_MANO), diffRoto: true }
    expect(() => archivosDelRango(BASE_DEL_PR_70, MERGE_DEL_PR_70, gitFalso(clon))).toThrow(
      /NO se han comprobado[\s\S]*git fetch --unshallow/,
    )
  })
})
