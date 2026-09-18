// T15 — Guardia: la firma de sesion tiene UN SOLO dueño (R5).
//
// R5 exige que NO exista una segunda implementacion del algoritmo de firma en el repositorio:
// la verificacion DEBE recomputar la firma con `signSessionValue()`, la misma funcion que la
// emite (`lib/modules/identity/adapters/driven/session/session-cookie.ts`), nunca con su propio
// `createHmac`. Hasta hoy eso solo se habia comprobado a mano con un `grep`; esta guardia lo
// afirma en el gate: si mañana alguien escribe un `createHmac('sha256', ...)` propio en otro
// archivo de produccion -- por prisa, por no encontrar `signSessionValue()`, o por copiar y
// pegar --, el repo se desincroniza en silencio (decision cerrada el 2026-09-01, `design.md >
// 6.5`): el escritor cambia el formato, el lector que se quedo atras deja de casar, y nada de
// eso compila en rojo porque los dos lados siguen siendo TypeScript valido. Esta guardia es la
// unica red para ese caso.
//
// Recorre el ARBOL DE ARCHIVOS de produccion, no el comportamiento: mismo patron que
// `tests/guards/guard-password-hash-module.test.ts` (`findRepoRoot`, funciones puras
// exportadas, fuente sintetico que demuestra que la regla dispara Y el caso simetrico que no
// la viola). `tests/`, `e2e/` y `scripts/` no son produccion y no entran en el barrido: el
// propio archivo `session-cookie.ts` y este test SI mencionan `createHmac`, y el test que lo
// mockea (`session-cookie.test.ts`) tambien lo hace, a proposito.
//
// QC-9 T1 (R19): el barrido pasa a incluir tambien los archivos `.ts`/`.tsx` de PRIMER NIVEL de la
// raiz del repositorio. Hasta hoy solo miraba `lib`, `app`, `components` y `hooks`, asi que un
// `createHmac` propio en un archivo de la raiz pasaba el gate en verde -- lo verifico a mano el
// reviewer de QC-8 creando el archivo y borrandolo. Como `middleware.ts` va a nacer justo ahi y es
// el candidato numero uno a convertirse en la segunda implementacion, la ampliacion va ANTES de que
// ese archivo exista (QC-9 `design.md > 3.5`, punto 1).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, sep } from 'node:path'
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

/** Directorios de codigo de PRODUCCION (no tests, no e2e, no scripts). Se barren en profundidad. */
const PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks']

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.prisma', 'dist', '.worktrees'])

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

/**
 * Unico dueño autorizado del algoritmo de firma (R5, `design.md > 4.1` y `> 6.5`).
 *
 * QC-9 T6: pasa a ser el CODEC. `session-cookie.ts` se quedo con el transporte —`cookies()` de
 * `next/headers`— y el formato entero (troceado, version, base64url y HMAC) vive ahora en
 * `session-token.ts`, que es lo unico que el middleware puede cargar en el borde.
 */
const UNICO_DUENO = 'lib/modules/identity/adapters/driven/session/session-token.ts'

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
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves --como estuvo hasta
 * QC-9-- un comentario de linea que contenga una apertura de bloque abre un bloque FALSO que se
 * cierra en el siguiente cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga
 * todo lo que haya en medio, imports incluidos. El caso real, con el comodin escrito con dos
 * asteriscos: `// se juzga con las mismas reglas que app/` + `** (R19)` dejaba `middleware.ts`
 * reducido a su `export const config`, sin el reexport, y esta guardia pasaba en VERDE sin haber
 * mirado el archivo. Quitando primero la linea entera, esa apertura desaparece junto con el
 * comentario que la contiene y nunca llega a abrir nada. No lo "simplifiques" de vuelta: el test
 * «no se ciega...» de mas abajo vigila exactamente eso.
 */
function stripComments(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * `true` si el fuente (sin comentarios) IMPLEMENTA el algoritmo de firma, con la API que sea.
 *
 * QC-9 T6 — la huella deja de ser solo `createHmac(`. Esto es lo critico de esta task: al migrar
 * el HMAC a WebCrypto, una guardia que solo buscara `createHmac(` se habria quedado sin nada que
 * vigilar —ningun archivo de produccion volveria a mencionarlo— y habria seguido en VERDE mientras
 * cualquiera escribia su propio `crypto.subtle.sign(...)` en otro sitio. Desactivarse en silencio
 * es el peor final posible para una guardia, asi que la huella cubre las dos APIs: la que se va y
 * la que llega (`design.md > 3.5`, punto 2).
 *
 * El assert `expect(encontrados).toContain(UNICO_DUENO)` es la otra mitad de la red: si el dueño
 * dejara de casar con la huella, la guardia avisa en vez de quedarse muda.
 */
export function mentionsSignatureAlgorithm(source: string): boolean {
  const codigo = stripComments(source)

  return (
    /\bcreateHmac\s*\(/.test(codigo) ||
    /\bcrypto\.subtle\b/.test(codigo) ||
    /\bsubtle\.importKey\s*\(/.test(codigo) ||
    /\bsubtle\.sign\s*\(/.test(codigo)
  )
}

/**
 * Archivos `.ts`/`.tsx` sueltos en el PRIMER NIVEL del repositorio (no recursivo): hoy
 * `next.config.ts`, `next-env.d.ts`, `playwright.config.ts` y `prisma.config.ts`, y manana
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
 * los archivos de primer nivel de la raiz (QC-9 R19). Sin esa segunda mitad, un `createHmac` propio
 * en la raiz del repo pasaba el gate en verde -- lo comprobo a mano el reviewer de QC-8, y por eso
 * la ampliacion es bloqueante y va ANTES de que exista `middleware.ts` (QC-9 `design.md > 3.5`).
 */
export function listProductionFiles(root: string): readonly string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dirName) => listSourceFiles(join(root, dirName))),
    ...listRootLevelSourceFiles(root),
  ]
}

/** Archivos de produccion (rutas relativas en POSIX) que implementan el algoritmo de firma. */
export function findSignatureAlgorithmUsers(root: string): readonly string[] {
  const files = listProductionFiles(root)
  return files
    .filter((absPath) => mentionsSignatureAlgorithm(readFileSync(absPath, 'utf8')))
    .map((absPath) => toPosix(absPath.slice(root.length + 1)))
}

describe('guardia — un unico dueño de la firma de sesion (R5)', () => {
  it('el algoritmo de firma solo aparece en el codec que emite y verifica la cookie', () => {
    const encontrados = findSignatureAlgorithmUsers(repoRoot)

    const intrusos = encontrados.filter((file) => file !== UNICO_DUENO)

    expect(
      intrusos,
      intrusos.length === 0
        ? undefined
        : `La firma de sesion tiene un solo dueño (R5): ${UNICO_DUENO}. ` +
            `Se encontro tambien createHmac o crypto.subtle en: ${intrusos.join(', ')}. ` +
            'No reimplementes el algoritmo de firma ahi: importa y reutiliza ' +
            "signSessionValue() desde ese codec. Un formato con dos dueños se " +
            'desincroniza en silencio (design.md > 6.5).',
    ).toEqual([])

    // Y el dueño legitimo tiene que aparecer: si algun dia deja de casar con la huella (otro
    // cambio de algoritmo), esta linea avisa de que la constante UNICO_DUENO quedo obsoleta.
    expect(encontrados).toContain(UNICO_DUENO)
  })

  // QC-9 T6 (R17) — `timingSafeEqual` es de `node:crypto` y NO sobrevive al borde; WebCrypto no
  // ofrece equivalente. La comparacion en tiempo constante pasa a ser propia y la guardia busca
  // esa, no la anterior.
  it('la comparacion de firmas es en tiempo constante (R5, R17): el unico dueño usa equalsInConstantTime', () => {
    const fuente = stripComments(readFileSync(join(repoRoot, UNICO_DUENO), 'utf8'))

    expect(
      /\bequalsInConstantTime\s*\(/.test(fuente),
      'R5/R17 exigen comparar la firma de sesion en tiempo constante: usa ' +
        "equalsInConstantTime(), no '===' ni cualquier comparacion que corte en la primera " +
        'diferencia. Eso filtra la firma esperada por el tiempo de respuesta (side-channel ' +
        `timing attack). El unico dueño autorizado es ${UNICO_DUENO}; ahi es donde debe vivir ` +
        'esa comparacion.',
    ).toBe(true)
  })

  // QC-9 T6 (R15) — el dueño corre TAMBIEN en el borde: si importara `node:crypto`, el
  // middleware no cargaria. No basta con que use WebCrypto; no puede quedar ni el import viejo.
  it('el unico dueño no importa node:crypto (R15): tiene que cargar en el borde', () => {
    const fuente = stripComments(readFileSync(join(repoRoot, UNICO_DUENO), 'utf8'))

    expect(
      /['"]node:crypto['"]/.test(fuente),
      `${UNICO_DUENO} importa node:crypto. El middleware corre en el runtime del borde, donde ` +
        'ese modulo no existe: la peticion fallaria al cargar. La firma se calcula con ' +
        'crypto.subtle, que existe en Node y en el borde (design.md > 3.2).',
    ).toBe(false)
  })

  it('la regla detecta una implementacion propia con cualquiera de las dos APIs, y no un comentario que las menciona', () => {
    // La API que se va.
    expect(
      mentionsSignatureAlgorithm("import { createHmac } from 'node:crypto'; createHmac('sha256', s)"),
    ).toBe(true)
    expect(mentionsSignatureAlgorithm('const x = createHmac(\'sha256\', secret).update(y).digest()')).toBe(
      true,
    )
    // Y la que llega: sin esto, migrar el algoritmo habria desactivado la guardia en silencio.
    expect(
      mentionsSignatureAlgorithm("const k = await crypto.subtle.importKey('raw', b, alg, false, ['sign'])"),
    ).toBe(true)
    expect(mentionsSignatureAlgorithm("await crypto.subtle.sign('HMAC', key, msg)")).toBe(true)
    expect(mentionsSignatureAlgorithm("const { subtle } = crypto; await subtle.sign('HMAC', k, m)")).toBe(
      true,
    )
    // Un comentario que solo las menciona no es una segunda implementacion.
    expect(mentionsSignatureAlgorithm('// antes esto llamaba a createHmac(...) directamente')).toBe(false)
    expect(mentionsSignatureAlgorithm('/* migrado de crypto.subtle.sign a otra cosa */')).toBe(false)
    expect(mentionsSignatureAlgorithm('export function signSessionValue() { return "no-op" }')).toBe(false)
    // `crypto.randomUUID()` no es firmar: la huella no puede ser "menciona crypto".
    expect(mentionsSignatureAlgorithm('const id = crypto.randomUUID()')).toBe(false)
  })

  // QC-9 — regresion del CEGADO: la guardia no puede quedarse muda por un comentario.
  it('no se ciega: un comentario de linea con un comodin `app/` + dos asteriscos NO esconde el createHmac que va debajo', () => {
    // Fuente sintetico calcado del caso real. Con el orden viejo (bloques primero), la apertura de
    // bloque que vive DENTRO del comentario de linea abria un bloque falso que se cerraba en el
    // JSDoc de la penultima linea: `stripComments` devolvia solo `export const otra = 1;` y la
    // guardia daba VERDE sobre un archivo que implementa la firma. El fallo no era un falso
    // positivo (ruidoso y visible), sino un falso NEGATIVO: la guardia dejaba de vigilar en
    // silencio, que es lo unico que una guardia no puede permitirse.
    const cegado = [
      '// se juzga con las mismas reglas que app/** (R19)',
      "import { createHmac } from 'node:crypto';",
      "export const firma = createHmac('sha256', secreto);",
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\n')

    expect(
      mentionsSignatureAlgorithm(cegado),
      'stripComments quita los comentarios de LINEA antes que los de BLOQUE. Si alguien invierte ' +
        'ese orden, un comentario de linea que mencione una ruta con comodin se traga los imports ' +
        'que tenga debajo y esta guardia pasa en verde sin haber mirado el archivo.',
    ).toBe(true)

    // Y el mismo fuente sin la linea de comentario tiene que dar lo mismo: lo que se afirma es que
    // el comentario NO cambia el veredicto, no que el fuente case por casualidad.
    expect(mentionsSignatureAlgorithm(cegado.split('\n').slice(1).join('\n'))).toBe(true)
  })

  // Regresion CRLF: `core.autocrlf=true` deja cada linea terminada en `\r`, y sin normalizar antes
  // de partir por lineas ni `.*$` ni `$` sin bandera `m` casan antes de el.
  it('no se ciega con CRLF: el mismo cegado con `\\r\\n` NO esconde el createHmac que va debajo', () => {
    const cegadoCrlf = [
      '// se juzga con las mismas reglas que app/** (R19)',
      "import { createHmac } from 'node:crypto';",
      "export const firma = createHmac('sha256', secreto);",
      '/** JSDoc posterior que cierra el bloque falso. */',
      'export const otra = 1;',
    ].join('\r\n')

    expect(mentionsSignatureAlgorithm(cegadoCrlf)).toBe(true)
    // Y un comentario que solo MENCIONA el algoritmo, con CRLF, sigue sin ser una implementacion.
    expect(mentionsSignatureAlgorithm('// antes esto llamaba a createHmac(...) directamente\r\n')).toBe(false)
  })

  // QC-9 R19 — la raiz del repositorio tambien se barre.
  it('un createHmac en un archivo de primer nivel se detecta: el barrido incluye la raiz del repositorio (R19)', () => {
    const relativos = listProductionFiles(repoRoot).map((absPath) => toPosix(absPath.slice(repoRoot.length + 1)))

    // Los `.ts` sueltos de la raiz entran: aqui es donde vivira `middleware.ts`.
    expect(relativos).toContain('next.config.ts')
    expect(relativos).toContain('playwright.config.ts')
    expect(relativos).toContain('prisma.config.ts')

    // Un archivo de primer nivel es exactamente eso: sin ninguna barra en su ruta relativa.
    const primerNivel = relativos.filter((file) => !file.includes('/'))
    expect(primerNivel.length).toBeGreaterThan(0)

    // Y la ampliacion NO arrastra las carpetas que no son produccion: `tests/`, `e2e/` y
    // `scripts/` mencionan `createHmac` a proposito y deben seguir fuera del barrido.
    expect(relativos.some((file) => file.startsWith('tests/'))).toBe(false)
    expect(relativos.some((file) => file.startsWith('e2e/'))).toBe(false)
    expect(relativos.some((file) => file.startsWith('scripts/'))).toBe(false)

    // Lo que ya barria sigue barriendose.
    expect(relativos).toContain(UNICO_DUENO)
  })
})
