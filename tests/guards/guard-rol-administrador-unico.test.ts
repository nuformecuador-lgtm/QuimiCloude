// T11 (QC-54) — Guardia: el rol Administrador tiene UN SOLO dueño (R1, R11, R12).
//
// R1 exige exactamente una declaracion del literal del rol Administrador en todo el codigo de
// produccion: `ROLE_ADMINISTRADOR`, en `lib/modules/identity/domain/roles.ts`. Hasta QC-54 el
// literal `'Administrador'` estaba declarado cuatro veces (`ADMIN_ROLE_NAME` en `inventario`,
// `recetas` y `unidades`, mas la buena en `identity`); esta ficha borro las tres copias, pero sin
// una guardia ejecutable el proximo modulo puede volver a declarar el suyo sin que nada avise --
// exactamente como paso con esos tres, que nacieron con `identity` ya delante. Esta guardia es la
// unica red para ese caso (R11).
//
// Recorre el ARBOL DE ARCHIVOS de produccion, no el comportamiento: mismo patron que
// `tests/guards/guard-firma-sesion-unica.test.ts` y que la mitad centinela de
// `tests/unit/pedidos/authorization.test.ts` (~L275-295), que es la prueba de concepto de esta
// idea a escala de un solo modulo. `findRepoRoot`, funciones puras exportadas, fuentes sinteticos
// que demuestran que la regla dispara Y el caso simetrico que no la viola.
//
// Alcance del barrido (design.md > 5): `PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks']`
// mas los `.ts`/`.tsx` de PRIMER NIVEL de la raiz, con `.worktrees` en `IGNORED_DIRS`. `tests/`,
// `e2e/`, `scripts/` y `db/` quedan fuera del barrido: mencionan el literal a proposito (el
// centinela de `pedidos`, este mismo archivo, `e2e/session.spec.ts`, etc). Se barre el conjunto de
// produccion entero -no solo `lib/modules`- porque un consumidor del rol puede vivir fuera de
// `lib/modules` (hasta QC-75 lo hacia `lib/composition/route-role-rules.ts`, la lista ruta->rol
// que esa ficha retiro), y porque una pagina que escriba el rol a mano es exactamente la misma
// deuda.
//
// **QC-75 no afloja esta guardia, la deja mas estrecha.** Al irse esa lista, el unico dueño del
// literal en produccion es `lib/modules/identity/domain/roles.ts` -- mas la excepcion nombrada del
// seed, que no es un rol sino un nombre de pila. Ningun exento sobraba por ese borrado: aquella
// lista importaba `ROLE_ADMINISTRADOR` del barrel, no declaraba el literal, asi que nunca estuvo
// en `EXENTOS`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'

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

/** Directorios de codigo de PRODUCCION (no tests, no e2e, no scripts, no db). Se barren en profundidad. */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks']

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

/**
 * Los dos unicos archivos autorizados a que el literal del rol Administrador case con el patron
 * (decision del humano, 2026-09-07).
 *
 * `roles.ts` es la unica declaracion legitima DEL ROL (R1): `ROLE_ADMINISTRADOR = 'Administrador'`.
 *
 * `seed-initial-access.ts` NO declara el rol: `INITIAL_ADMIN_FIRST_NAMES = 'Administrador'` es el
 * NOMBRE DE PILA del usuario que siembra el sistema, hermano de
 * `INITIAL_ADMIN_LAST_NAMES = 'Inicial'` -- no el nombre del rol. Una guardia por texto no puede
 * distinguir un nombre de persona de un nombre de rol, asi que se exime este archivo puntual en vez
 * de sumarlo a `roles.ts`. Renombrar ese marcador esta descartado: rompe
 * `tests/unit/identity/seed/seed-initial-access.test.ts:220`
 * (`expect(input.firstNames).toBe('Administrador')`) y cambiaria un dato ya sembrado en la base,
 * que se sale del «cero cambios en `db/`» de esta ficha.
 *
 * A proposito NO se exime `lib/modules/identity/domain/` entera: eso dejaria entrar un segundo
 * literal DEL ROL dentro de `identity` sin que nada avise, que es medio motivo por el que esta
 * guardia existe.
 */
const EXENTOS = [
  'lib/modules/identity/domain/roles.ts',
  'lib/modules/identity/domain/seed-initial-access.ts',
]

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
}

function readDirEntries(dir: string): { name: string; isDirectory: boolean }[] {
  let names: readonly string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.map((name) => ({ name, isDirectory: statSync(join(dir, name)).isDirectory() }))
}

function listSourceFiles(dir: string): readonly string[] {
  return readDirEntries(dir).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory) {
      return IGNORED_DIRS.has(entry.name) ? [] : listSourceFiles(full)
    }
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [full] : []
  })
}

/**
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se cierra en el siguiente
 * cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga todo lo que haya en medio,
 * imports incluidos. El caso real, documentado en `guard-firma-sesion-unica.test.ts`: un comentario
 * de linea con el comodin `app/**` (R19 de QC-9) dejaba `middleware.ts` reducido a su
 * `export const config`, y esa guardia pasaba en VERDE sin haber mirado el archivo. Quitando
 * primero la linea entera, esa apertura desaparece junto con el comentario que la contiene y nunca
 * llega a abrir nada. No lo "simplifiques" de vuelta: el test «no se ciega...» de mas abajo vigila
 * exactamente eso.
 */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Escapa metacaracteres de regex. Hoy `ROLE_ADMINISTRADOR` no tiene ninguno, pero el patron se
 * deriva igual: si el valor cambiara de forma, el patron sigue siendo correcto sin tocar esta
 * guardia. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * El patron se DERIVA del valor de `ROLE_ADMINISTRADOR`, nunca se escribe a mano (R12).
 *
 * Escribir la cadena `"'Administrador'"` a mano tenia dos agujeros medidos en
 * `progress/impl_QC-34-crud-de-pedidos.md`: (a) buscar solo la comilla simple dejaba pasar la
 * doble y el backtick, y ninguna regla de lint obliga a una comilla concreta -la puerta quedaba
 * abierta de verdad-; y (b) si `identity` renombrara el rol, una guardia con el texto a mano
 * seguiria vigilando un nombre inexistente y quedaria VERDE POR VACUIDAD.
 */
const LITERAL_DEL_ROL = new RegExp(`['"\`]${escapeRegExp(ROLE_ADMINISTRADOR)}['"\`]`)

/** `true` si el fuente (sin comentarios) declara el literal del rol Administrador entre comillas. */
export function mentionsRoleLiteral(source: string): boolean {
  return LITERAL_DEL_ROL.test(stripComments(source))
}

/**
 * Archivos `.ts`/`.tsx` sueltos en el PRIMER NIVEL del repositorio (no recursivo): hoy
 * `next.config.ts`, `next-env.d.ts`, `playwright.config.ts`, `prisma.config.ts` y
 * `middleware.ts`. No se recorren las subcarpetas de la raiz aqui: las de produccion ya entran por
 * `PRODUCTION_DIRS`, y `tests/`, `e2e/`, `scripts/` y `db/` no son produccion.
 */
export function listRootLevelSourceFiles(root: string): readonly string[] {
  return readDirEntries(root)
    .filter((entry) => !entry.isDirectory && SOURCE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(root, entry.name))
}

/**
 * Todo el codigo de produccion barrido por la guardia: los `PRODUCTION_DIRS` en profundidad **mas**
 * los archivos de primer nivel de la raiz. `tests/`, `e2e/`, `scripts/` y `db/` no entran.
 */
export function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ]
}

/** Archivos de produccion (rutas relativas en POSIX) que declaran el literal del rol Administrador. */
export function findRoleLiteralDeclarations(root: string): readonly string[] {
  const files = listProductionFiles(root)
  return files
    .filter((absPath) => mentionsRoleLiteral(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)))
}

describe('guardia — un unico dueño del rol Administrador (R1, R11)', () => {
  it('el literal del rol solo aparece en identity/domain/roles.ts, salvo la excepcion nombrada del seed', () => {
    const conElLiteral = findRoleLiteralDeclarations(repoRoot)

    const intrusos = conElLiteral.filter((file) => !EXENTOS.includes(file))

    expect(
      intrusos,
      intrusos.length === 0
        ? undefined
        : 'El rol Administrador tiene un unico dueño (R1): lib/modules/identity/domain/roles.ts. ' +
            `Se encontro el literal declarado tambien en: ${intrusos.join(', ')}. ` +
            'No repitas la cadena ahi: importa ROLE_ADMINISTRADOR del barrel ' +
            "'@/lib/modules/identity' (nunca por ruta profunda, nunca desde otro barrel). " +
            'Un literal con dos dueños se desincroniza en silencio si identity renombrara el rol.',
    ).toEqual([])

    // Anclas de los dos exentos, contra el verde por vacuidad (decision del humano, 2026-09-07):
    // si alguno dejara de casar con el patron, esta guardia tiene que avisar, no callarse.
    expect(conElLiteral).toContain('lib/modules/identity/domain/roles.ts')
    expect(conElLiteral).toContain('lib/modules/identity/domain/seed-initial-access.ts')
  })

  it('la regla deriva el patron del valor de ROLE_ADMINISTRADOR y reconoce las tres comillas', () => {
    // Comilla simple.
    expect(mentionsRoleLiteral("const x = 'Administrador';")).toBe(true)
    // Comilla doble: el primer agujero medido de la version escrita a mano.
    expect(mentionsRoleLiteral('const x = "Administrador";')).toBe(true)
    // Backtick: el segundo agujero medido.
    expect(mentionsRoleLiteral('const x = `Administrador`;')).toBe(true)
    // El mismo literal DENTRO de un comentario no es una infraccion: la prosa de un actor.ts que
    // advierte sobre «Administradores externos» no debe colarse como infractor.
    expect(mentionsRoleLiteral("// no confundir con 'Administrador' que es el rol bueno")).toBe(false)
    expect(mentionsRoleLiteral('/** advertencia: "Administrador" no es un rol externo */')).toBe(false)
    // El caso simetrico: importar ROLE_ADMINISTRADOR del barrel no declara ningun literal.
    expect(
      mentionsRoleLiteral("import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';"),
    ).toBe(false)
  })

  // Regresion del cegado de stripComments: mismo patron que guard-firma-sesion-unica.test.ts.
  it('no se ciega: un comentario de linea con un comodin `app/` + dos asteriscos NO esconde el literal que va debajo', () => {
    const cegado = [
      '// ... app/** (R19)',
      "export const nombreDelRolAdministrador = 'Administrador';",
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\n')

    expect(
      mentionsRoleLiteral(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione una ruta con comodin se traga el codigo que ' +
        'tenga debajo y esta guardia pasa en verde sin haber mirado el archivo.',
    ).toBe(true)

    // Y el mismo fuente sin la linea de comentario tiene que dar lo mismo: lo que se afirma es que
    // el comentario NO cambia el veredicto, no que el fuente case por casualidad.
    expect(mentionsRoleLiteral(cegado.split('\n').slice(1).join('\n'))).toBe(true)
  })

  it('el barrido incluye la raiz del repositorio y excluye tests/, e2e/, scripts/ y db/', () => {
    const relativos = listProductionFiles(repoRoot).map((absPath) =>
      toPosix(absPath.slice(repoRoot.length + 1)),
    )

    // Los `.ts` sueltos de la raiz entran.
    expect(relativos).toContain('next.config.ts')

    // Un archivo de primer nivel es exactamente eso: sin ninguna barra en su ruta relativa.
    const primerNivel = relativos.filter((file) => !file.includes('/'))
    expect(primerNivel.length).toBeGreaterThan(0)

    // Las carpetas que mencionan el literal a proposito quedan fuera del barrido.
    expect(relativos.some((file) => file.startsWith('tests/'))).toBe(false)
    expect(relativos.some((file) => file.startsWith('e2e/'))).toBe(false)
    expect(relativos.some((file) => file.startsWith('scripts/'))).toBe(false)
    expect(relativos.some((file) => file.startsWith('db/'))).toBe(false)

    // Lo que ya barria sigue barriendose.
    expect(relativos).toContain('lib/modules/identity/domain/roles.ts')
  })

  // Ancla del valor (R4): si identity cambiara el valor del rol, este caso lo dice en vez de callarse.
  it('ROLE_ADMINISTRADOR sigue valiendo exactamente "Administrador"', () => {
    expect(ROLE_ADMINISTRADOR).toBe('Administrador')
  })
})
