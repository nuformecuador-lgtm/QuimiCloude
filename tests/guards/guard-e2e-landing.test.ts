// Guardia de QC-93 (R9): ningun E2E vuelve a afirmar un aterrizaje con una ruta ESCRITA A MANO.
//
// Desde QC-93 hay UN sitio donde se decide a donde aterriza un login en los E2E:
// `e2e/helpers/landing.ts`, que deriva el destino del menu filtrado por los permisos reales del
// usuario. Antes habia trece copias con la ruta dentro; QC-75 cambio la regla, ninguna se
// actualizo y los casos se quedaron afirmando algo que ya no pasaba. Esta guardia muerde, nombrando
// archivo y linea, ante las dos formas en que esa copia vuelve a nacer:
//
//   (a) una definicion local de la funcion de entrada (`function login(`, `const login = ...`);
//   (b) una espera de URL (`waitForURL`, `toHaveURL`, `expect(...pathname).toBe`) cuya expectativa
//       es una ruta FIJA -constante, literal o un parametro tipo `landing`- justo despues de un
//       `login-submit`.
//
// Vive en `tests/guards/` porque `init.sh` no corre Playwright y ningun grafo de imports llega a un
// `.spec.ts` desde Vitest: fuera de las guardias nadie la ejecutaria (`docs/gate.md > Las
// guardias van SIEMPRE`).
//
// LIMITE HONESTO (`specs/QC-93-.../design.md > 3`): comprueba LA FORMA DEL TEXTO, no que el
// aterrizaje afirmado sea cierto. Un spec puede usar el helper y afirmar una tonteria, o esconder la
// ruta tras un nombre que aqui no se reconoce, y esta guardia saldra verde. Lo que compra es que la
// copia numero catorce no nazca en silencio. Y no es hipotetica: `e2e/pedidos-responsables.spec.ts`
// (QC-102) llego DESPUES del censo del spec con su propio `login()` y su `DASHBOARD_ROUTE` dentro.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const RAIZ_E2E = 'e2e'
const SUFIJO_DE_SPEC = '.spec.ts'
const HELPER = 'e2e/helpers/landing.ts'
const SPEC = 'specs/QC-93-aterrizaje-sin-permiso-de-modulo'

/**
 * Cuantas lineas DE CODIGO despues del `login-submit` se mira buscando la espera: 3.
 *
 * Se cuentan lineas de codigo (sin blancos ni comentarios) y no lineas del archivo porque los
 * comentarios entre el click y la espera crecen a gusto de quien escribe: en `login.spec.ts` hay
 * tres lineas de prosa entre `login-submit` (:309) y su `waitForURL` (:314). Medido en disco el
 * 2026-09-15 sobre las catorce copias reales (las trece del censo mas `pedidos-responsables`), la
 * espera esta SIEMPRE en la linea de codigo siguiente al click. 3 deja margen para una o dos
 * comprobaciones intercaladas (un `expect` de toast antes de esperar) sin llegar a otro gesto: la
 * ventana se corta ademas en cuanto aparece un `goto(` o empieza otro `test(`, porque una espera
 * detras de una navegacion nueva afirma el resultado de ESA navegacion, no el aterrizaje.
 */
const VENTANA = 3

/**
 * Excepciones POR NOMBRE, con su motivo. Solo eximen de la regla (b): una definicion local de
 * `login()` no tiene motivo que la justifique en ningun archivo.
 */
const EXCEPCIONES: ReadonlyArray<{ archivo: string; motivo: string }> = [
  {
    archivo: 'e2e/session.spec.ts',
    motivo:
      'llega a la pantalla privada por destino de vuelta (`returnTo`): pide `/inventario` sin ' +
      'sesion, entra desde el login con la ruta recordada y espera ESA ruta (`session.spec.ts:247-260`). ' +
      'Ahi el destino lo fija la ruta pedida, no el menu, y derivarlo del menu afirmaria otra cosa ' +
      '(QC-93 R10).',
  },
  {
    archivo: 'e2e/permisos.spec.ts',
    motivo:
      'es la suite que AFIRMA la regla de aterrizaje por permisos: su espera a ' +
      '`ASSIGNED_ORDERS_ROUTE` (`permisos.spec.ts:219`, QC-88 R34 — antes `INVENTORY_ROUTE` en la ' +
      'linea 214, hasta que QC-88 antepuso «Asignación» a «Inventario» en el menu del Operador) es ' +
      'el aterrizaje ya derivado del menu del Operador, escrito como sujeto de la prueba y no como ' +
      'premisa de otra. Es la MISMA excepcion de QC-93 R10, no una nueva: solo cambia que ruta se ' +
      'afirma (`specs/QC-88-listado-de-pedidos-asignados/design.md > 7.2`).',
  },
]

// ---------------------------------------------------------------------------------------
// El analisis: funcion pura sobre (ruta, contenido). No lee disco.
// ---------------------------------------------------------------------------------------

type Regla = 'definicion-local' | 'ruta-fija'
type Hallazgo = { archivo: string; linea: number; regla: Regla; motivo: string }

/** El boton de enviar del login. Cualquier mencion en codigo abre la ventana de (b). */
const ANCLA = /login-submit/

/** Donde se corta la ventana: una navegacion nueva o el principio de otro caso. */
const CORTE_DE_VENTANA = /\.goto\s*\(|^\s*(?:test|it|describe)(?:\.\w+)?\s*\(/

/** Las tres formas de decir «estoy en la ruta X» que se ven (o se pueden ver) en `e2e/`. */
const ESPERA = /\b(waitForURL|toHaveURL)\s*\(|\.pathname\s*\)\s*\.(?:toBe|toEqual)\s*\(/

/** (a): la funcion de entrada propia, declarada o asignada. */
const DEFINICION_LOCAL = [/\bfunction\s+login\s*[(<]/, /\b(?:const|let|var)\s+login\s*[:=]/]

/** Constantes en mayusculas: `DASHBOARD_ROUTE`, `INVENTORY_ROUTE`... son rutas fijas por definicion. */
const CONSTANTE = /^[A-Z][A-Z0-9_]*$/

/**
 * Las de LOGIN no son aterrizaje: tras un `login-submit` con credenciales malas o una cuenta que no
 * esta activa, quedarse en el login es justo lo que se afirma (`login.spec.ts:343`, `:370`).
 */
const CONSTANTE_DE_LOGIN = /^LOGIN_(?:PATH|ROUTE)\w*$/

/** Las funciones del helper: un identificador asignado desde ellas es destino DERIVADO, no fijo. */
const DERIVACIONES = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:await\s+)?(?:loginAndLand|expectedLandingRoute|landingRouteForPermissions)\s*\(/g

const LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/.source
const REGEX_LITERAL = /\/(?:\\.|[^/\n])+\/[a-z]*/.source
const IDENTIFICADOR = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.source
const OPERANDO_DELANTERO = new RegExp(`^\\s*(${LITERAL}|${REGEX_LITERAL}|${IDENTIFICADOR}(?:\\s*\\()?)`)
const OPERANDO_TRASERO = new RegExp(`(${LITERAL}|${IDENTIFICADOR})\\s*$`)

/** El contenido por lineas, con los comentarios en blanco: se mira codigo, no prosa, y sin mover numeros de linea. */
function lineasDeCodigo(contenido: string): string[] {
  let dentroDeBloque = false
  return contenido.split(/\r?\n/).map((linea) => {
    const limpia = linea.trim()
    if (dentroDeBloque) {
      if (limpia.includes('*/')) dentroDeBloque = false
      return ''
    }
    if (limpia.startsWith('//')) return ''
    if (limpia.startsWith('/*')) {
      dentroDeBloque = !limpia.includes('*/')
      return ''
    }
    return linea
  })
}

function esRutaDeLogin(texto: string): boolean {
  return /\/login\b/i.test(texto)
}

/** El texto entre el parentesis de apertura dado y su cierre, saltando lo que va entre comillas. */
function argumentoDesde(texto: string, parentesis: number): string {
  let profundidad = 0
  let comilla: string | null = null
  for (let i = parentesis; i < texto.length; i++) {
    const c = texto[i]
    if (comilla !== null) {
      if (c === comilla && texto[i - 1] !== '\\') comilla = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      comilla = c
      continue
    }
    if (c === '(') profundidad++
    if (c === ')') {
      profundidad--
      if (profundidad === 0) return texto.slice(parentesis + 1, i)
    }
  }
  return texto.slice(parentesis + 1)
}

/** Si el operando es una ruta fija de aterrizaje, como describirla; si no, `null`. */
function operandoFijo(token: string, derivados: ReadonlySet<string>): string | null {
  const t = token.trim()
  if (t.startsWith("'") || t.startsWith('"')) {
    return esRutaDeLogin(t) ? null : `el literal ${t}`
  }
  if (t.startsWith('`')) {
    const interpolaciones = [...t.matchAll(/\$\{\s*([^}]*?)\s*\}/g)].map((m) => m[1] ?? '')
    if (interpolaciones.some((i) => !CONSTANTE.test(i) || CONSTANTE_DE_LOGIN.test(i))) return null
    return esRutaDeLogin(t) ? null : `la plantilla fija ${t}`
  }
  if (t.startsWith('/')) {
    return esRutaDeLogin(t) ? null : `la expresion regular ${t}`
  }
  // Una llamada (`supplierDetailRoute(id)`, `groupsTabUrl()`) calcula la ruta: no es aterrizaje fijo.
  if (t.endsWith('(')) return null
  if (CONSTANTE.test(t)) {
    return CONSTANTE_DE_LOGIN.test(t) ? null : `la constante ${t}`
  }
  if (/^[A-Za-z_$][\w$]*$/.test(t) && /landing/i.test(t)) {
    return derivados.has(t) ? null : `el parametro \`${t}\` (el aterrizaje llega escrito desde la llamada)`
  }
  return null
}

/** Los operandos que pueden ser la ruta esperada dentro del argumento de una espera. */
function operandosDe(argumento: string): string[] {
  const encontrados: string[] = []

  const directo = OPERANDO_DELANTERO.exec(argumento)
  if (directo?.[1] !== undefined) encontrados.push(directo[1])

  for (const comparacion of argumento.matchAll(/(?<![!=])={2,3}(?!=)/g)) {
    const antes = argumento.slice(0, comparacion.index)
    const despues = argumento.slice(comparacion.index + comparacion[0].length)
    const izquierdo = OPERANDO_TRASERO.exec(antes)?.[1]
    const derecho = OPERANDO_DELANTERO.exec(despues)?.[1]
    if (izquierdo !== undefined) encontrados.push(izquierdo)
    if (derecho !== undefined) encontrados.push(derecho)
  }

  for (const metodo of argumento.matchAll(/\.(?:startsWith|endsWith|includes)\s*\(/g)) {
    const despues = argumento.slice(metodo.index + metodo[0].length)
    const operando = OPERANDO_DELANTERO.exec(despues)?.[1]
    if (operando !== undefined) encontrados.push(operando)
  }

  return encontrados
}

/** Si la linea `indice` es una espera con ruta fija, su descripcion; si no, `null`. */
function esperaFija(lineas: readonly string[], indice: number, derivados: ReadonlySet<string>): string | null {
  const linea = lineas[indice] ?? ''
  const espera = ESPERA.exec(linea)
  if (espera === null) return null

  // La llamada puede partirse en varias lineas (el formateador lo hace con predicados largos).
  const texto = lineas.slice(indice, indice + 8).join('\n')
  const argumento = argumentoDesde(texto, espera.index + espera[0].length - 1)
  const forma = espera[1] ?? 'expect(...pathname).toBe'

  for (const operando of operandosDe(argumento)) {
    const fijo = operandoFijo(operando, derivados)
    if (fijo !== null) return `\`${forma}\` espera ${fijo}`
  }
  return null
}

/** El analisis entero de un spec. Entrada: ruta y contenido. Salida: hallazgos con linea y motivo. */
function analizarSpec(archivo: string, contenido: string): Hallazgo[] {
  const lineas = lineasDeCodigo(contenido)
  const hallazgos: Hallazgo[] = []

  // (a) La funcion de entrada propia.
  lineas.forEach((linea, i) => {
    if (DEFINICION_LOCAL.some((regla) => regla.test(linea))) {
      hallazgos.push({
        archivo,
        linea: i + 1,
        regla: 'definicion-local',
        motivo: 'define su propia funcion `login`: la entrada es `loginAndLand` de ' + HELPER,
      })
    }
  })

  // (b) Una espera con ruta fija en la ventana de un `login-submit`.
  const derivados = new Set([...lineas.join('\n').matchAll(DERIVACIONES)].map((m) => m[1] ?? ''))
  const significativas = lineas.flatMap((linea, i) => (linea.trim() === '' ? [] : [i]))
  const yaVistas = new Set<number>()

  significativas.forEach((ancla, posicion) => {
    if (!ANCLA.test(lineas[ancla] ?? '')) return

    const candidatas: number[] = [ancla]

    // `Promise.all([page.waitForURL(...), page.getByTestId('login-submit').click()])`: la espera
    // va ANTES del click en el texto. Solo se mira hacia atras si hay un `Promise.all` que las una.
    for (let atras = 1; atras <= VENTANA && posicion - atras >= 0; atras++) {
      if (/Promise\.all\s*\(/.test(lineas[significativas[posicion - atras] ?? -1] ?? '')) {
        for (let k = atras; k >= 1; k--) candidatas.push(significativas[posicion - k] ?? -1)
        break
      }
    }

    for (let adelante = 1; adelante <= VENTANA && posicion + adelante < significativas.length; adelante++) {
      const siguiente = significativas[posicion + adelante] ?? -1
      if (CORTE_DE_VENTANA.test(lineas[siguiente] ?? '')) break
      candidatas.push(siguiente)
    }

    for (const candidata of candidatas) {
      if (candidata < 0 || yaVistas.has(candidata)) continue
      const fija = esperaFija(lineas, candidata, derivados)
      if (fija === null) continue
      yaVistas.add(candidata)
      hallazgos.push({
        archivo,
        linea: candidata + 1,
        regla: 'ruta-fija',
        motivo: `${fija} como aterrizaje tras el \`login-submit\` de la linea ${ancla + 1}`,
      })
    }
  })

  return hallazgos.sort((a, b) => a.linea - b.linea)
}

/** Las excepciones que apuntan a un archivo que el recorrido ya no encuentra. */
function excepcionesMuertas(excepciones: ReadonlyArray<{ archivo: string }>, existentes: readonly string[]): string[] {
  return excepciones.map(({ archivo }) => archivo).filter((archivo) => !existentes.includes(archivo))
}

/** Aplica las excepciones: solo eximen de (b), nunca de (a). */
function hallazgosTrasExcepciones(hallazgos: readonly Hallazgo[]): Hallazgo[] {
  const exentos = new Set(EXCEPCIONES.map(({ archivo }) => archivo))
  return hallazgos.filter((h) => !(h.regla === 'ruta-fija' && exentos.has(h.archivo)))
}

// ---------------------------------------------------------------------------------------
// El recorrido del disco.
// ---------------------------------------------------------------------------------------

const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage', 'test-results'])

/** Todos los `e2e/**\/*.spec.ts`, relativos a la raiz y con `/` siempre (tambien en Windows). */
function specsE2E(): string[] {
  const encontrados: string[] = []

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name)
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        recorrer(completa)
        continue
      }
      if (entrada.name.endsWith(SUFIJO_DE_SPEC)) {
        encontrados.push(relative(RAIZ, completa).split('\\').join('/'))
      }
    }
  }

  recorrer(join(RAIZ, RAIZ_E2E))
  return encontrados.sort()
}

// ---------------------------------------------------------------------------------------
// Autoprueba: la regla muerde con fixtures sinteticos, y no muerde en los falsos positivos conocidos.
// ---------------------------------------------------------------------------------------

const fixture = (...lineas: string[]) => lineas.join('\n')

const ENTRAR = [
  "  await page.goto(LOGIN_ROUTE);",
  "  await page.getByTestId('login-username').fill(user.username);",
  "  await page.getByTestId('login-password').fill(user.password);",
  "  await page.getByTestId('login-submit').click();",
]

describe('guardia QC-93: autoprueba de la regla sobre texto sintetico (R9)', () => {
  it('verde: una suite que entra con el helper no da ningun hallazgo', () => {
    const contenido = fixture(
      "import { loginAndLand } from './helpers/landing';",
      "test('el administrador ve el catalogo', async ({ page }) => {",
      '  await loginAndLand(page, adminUser);',
      '  await page.goto(INVENTORY_ROUTE);',
      "  await expect(page.getByTestId('inventario-title')).toBeVisible();",
      '});',
    )
    expect(analizarSpec('e2e/verde.spec.ts', contenido)).toEqual([])
  })

  it('(a) muerde ante `async function login(`, nombrando la linea', () => {
    const contenido = fixture(
      "import { test } from '@playwright/test';",
      '',
      'async function login(page: Page, user: Credentials): Promise<void> {',
      '  await loginAndLand(page, user);',
      '}',
    )
    expect(analizarSpec('e2e/a.spec.ts', contenido)).toEqual([
      expect.objectContaining({ archivo: 'e2e/a.spec.ts', linea: 3, regla: 'definicion-local' }),
    ])
  })

  it('(a) muerde tambien sin `async` y como `const login = async (`', () => {
    expect(analizarSpec('e2e/a1.spec.ts', 'function login(page) {\n}')).toEqual([
      expect.objectContaining({ linea: 1, regla: 'definicion-local' }),
    ])
    expect(analizarSpec('e2e/a2.spec.ts', 'const x = 1;\nconst login = async (page: Page) => {\n};')).toEqual([
      expect.objectContaining({ linea: 2, regla: 'definicion-local' }),
    ])
  })

  it('(b) muerde ante una constante `*_ROUTE` tras `login-submit`, aunque haya comentarios en medio', () => {
    const contenido = fixture(
      "test('entra', async ({ page }) => {",
      ...ENTRAR,
      '',
      '  // Se espera por la RUTA, no por contenido de la pagina:',
      '  // tres lineas de prosa como en login.spec.ts.',
      '  // No cuentan para la ventana.',
      '  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });',
      '});',
    )
    const hallazgos = analizarSpec('e2e/b-constante.spec.ts', contenido)
    expect(hallazgos).toEqual([expect.objectContaining({ linea: 10, regla: 'ruta-fija' })])
    expect(hallazgos[0]?.motivo).toContain('DASHBOARD_ROUTE')
    expect(hallazgos[0]?.motivo).toContain('linea 5')
  })

  it('(b) muerde ante un literal de cadena', () => {
    const contenido = fixture(...ENTRAR, "  await page.waitForURL('/dashboard');")
    expect(analizarSpec('e2e/b-literal.spec.ts', contenido)).toEqual([
      expect.objectContaining({ linea: 5, regla: 'ruta-fija', motivo: expect.stringContaining("'/dashboard'") }),
    ])
  })

  it('(b) muerde ante un parametro `landing`, se llame como se llame la funcion', () => {
    const contenido = fixture(
      'async function signIn(page: Page, user: Credentials, landing: string): Promise<void> {',
      ...ENTRAR,
      '  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });',
      '}',
    )
    expect(analizarSpec('e2e/b-parametro.spec.ts', contenido)).toEqual([
      expect.objectContaining({ linea: 6, regla: 'ruta-fija', motivo: expect.stringContaining('landing') }),
    ])
  })

  it('(b) muerde en las otras formas: `toHaveURL`, `pathname).toBe`, llamada partida y `Promise.all`', () => {
    expect(
      analizarSpec('e2e/b-have.spec.ts', fixture(...ENTRAR, '  await expect(page).toHaveURL(INVENTORY_ROUTE);')),
    ).toEqual([expect.objectContaining({ linea: 5, regla: 'ruta-fija' })])

    expect(
      analizarSpec(
        'e2e/b-tobe.spec.ts',
        fixture(...ENTRAR, '  await page.waitForLoadState();', '  expect(new URL(page.url()).pathname).toBe(DASHBOARD_ROUTE);'),
      ),
    ).toEqual([expect.objectContaining({ linea: 6, regla: 'ruta-fija' })])

    expect(
      analizarSpec(
        'e2e/b-partida.spec.ts',
        fixture(...ENTRAR, '  await page.waitForURL(', '    (url) => url.pathname === DASHBOARD_ROUTE,', '    { timeout: 60_000 },', '  );'),
      ),
    ).toEqual([expect.objectContaining({ linea: 5, regla: 'ruta-fija' })])

    expect(
      analizarSpec(
        'e2e/b-promise.spec.ts',
        fixture(
          "  await page.getByTestId('login-password').fill(user.password);",
          '  await Promise.all([',
          '    page.waitForURL(/\\/dashboard/),',
          "    page.getByTestId('login-submit').click(),",
          '  ]);',
        ),
      ),
    ).toEqual([expect.objectContaining({ linea: 3, regla: 'ruta-fija' })])
  })

  it('no muerde: esperar la ruta de LOGIN tras `login-submit` (credenciales malas, cuenta no activa)', () => {
    const contenido = fixture(
      ...ENTRAR,
      '  await expect(page.getByText(GENERIC_CREDENTIALS_ERROR)).toBeVisible({ timeout: 60_000 });',
      '  expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);',
      "  await page.getByTestId('login-submit').click();",
      '  await page.waitForURL((url) => url.pathname === LOGIN_ROUTE, { timeout: 60_000 });',
      "  await page.getByTestId('login-submit').click();",
      "  await page.waitForURL('/login?returnTo=%2Finventario');",
    )
    expect(analizarSpec('e2e/fp-login.spec.ts', contenido)).toEqual([])
  })

  it('no muerde: un `waitForURL` con ruta fija que no sigue a ningun `login-submit`', () => {
    // La forma de `recetas-pasos.spec.ts:387`, `recetas.spec.ts:355` o `proveedores.spec.ts:400`.
    const contenido = fixture(
      "test('guarda la receta', async ({ page }) => {",
      '  await loginAndLand(page, adminUser);',
      '  await page.goto(NEW_RECIPE_ROUTE);',
      "  await page.getByTestId('recipe-save').click();",
      '  await page.waitForURL((url) => url.pathname === FORMULAS_ROUTE, { timeout: 60_000 });',
      '});',
    )
    expect(analizarSpec('e2e/fp-sin-submit.spec.ts', contenido)).toEqual([])
  })

  it('no muerde: el caso R4 de inventario ya migrado (goto + espera fija, con el login dentro del helper)', () => {
    const contenido = fixture(
      "test('un usuario que no es Administrador ... (R4)', async ({ page }) => {",
      '  await loginAndLand(page, operatorUser);',
      '',
      '  await page.goto(INVENTORY_ROUTE);',
      '  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });',
      '});',
    )
    expect(analizarSpec('e2e/fp-inventario-r4.spec.ts', contenido)).toEqual([])
  })

  it('no muerde: destino derivado del helper, ruta calculada por una funcion, o prosa en comentarios', () => {
    const derivado = fixture(
      'const landing = await expectedLandingRoute(user.username);',
      ...ENTRAR,
      '  await page.waitForURL((url) => url.pathname === landing, { timeout: 60_000 });',
    )
    expect(analizarSpec('e2e/fp-derivado.spec.ts', derivado)).toEqual([])

    const calculada = fixture(
      ...ENTRAR,
      '  await page.waitForURL((url) => url.pathname === supplierDetailRoute(supplier.id), {',
      '    timeout: 60_000,',
      '  });',
    )
    expect(analizarSpec('e2e/fp-calculada.spec.ts', calculada)).toEqual([])

    const prosa = fixture(
      '// Antes aqui habia un `async function login(` con DASHBOARD_ROUTE dentro.',
      '/*',
      " * await page.getByTestId('login-submit').click();",
      ' * await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE);',
      ' */',
    )
    expect(analizarSpec('e2e/fp-prosa.spec.ts', prosa)).toEqual([])
  })

  it(`los limites de la ventana: mas alla de ${VENTANA} lineas de codigo, o tras un goto, no es aterrizaje`, () => {
    const lejos = fixture(
      ...ENTRAR,
      ...Array.from({ length: VENTANA }, (_, i) => `  await expect(page.getByTestId('x${i}')).toBeVisible();`),
      '  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE);',
    )
    expect(analizarSpec('e2e/limite-lejos.spec.ts', lejos)).toEqual([])

    const trasGoto = fixture(
      ...ENTRAR,
      '  await page.goto(INVENTORY_ROUTE);',
      '  await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE);',
    )
    expect(analizarSpec('e2e/limite-goto.spec.ts', trasGoto)).toEqual([])
  })

  it('las excepciones solo eximen de (b), y una excepcion que apunta a un archivo inexistente se detecta', () => {
    const [exceptuado] = EXCEPCIONES
    const archivo = exceptuado?.archivo ?? ''
    const hallazgos: Hallazgo[] = [
      { archivo, linea: 1, regla: 'ruta-fija', motivo: '' },
      { archivo, linea: 2, regla: 'definicion-local', motivo: '' },
    ]
    expect(hallazgosTrasExcepciones(hallazgos)).toEqual([hallazgos[1]])

    expect(excepcionesMuertas([{ archivo: 'e2e/existe.spec.ts' }, { archivo: 'e2e/borrado.spec.ts' }], ['e2e/existe.spec.ts'])).toEqual([
      'e2e/borrado.spec.ts',
    ])
  })
})

// ---------------------------------------------------------------------------------------
// La regla sobre el arbol real.
// ---------------------------------------------------------------------------------------

describe('guardia QC-93: ningun E2E afirma un aterrizaje con ruta escrita a mano (R9)', () => {
  it('el recorrido de e2e/ encuentra specs, no recoge el helper y el helper existe', () => {
    // Sin esto, un recorrido roto dejaria el caso de abajo verde por vacuidad.
    const specs = specsE2E()
    expect(
      specs.length,
      `el recorrido de ${RAIZ_E2E}/**/*${SUFIJO_DE_SPEC} deberia encontrar mas de diez specs (eran 18 el ` +
        `2026-09-15) y encontro ${specs.length}: la guardia estaria pasando en vacio.`,
    ).toBeGreaterThan(10)
    expect(specs.includes(HELPER), `${HELPER} no es un spec y no debe recorrerse`).toBe(false)
    expect(
      existsSync(join(RAIZ, HELPER)),
      `${HELPER} no existe. Es el UNICO sitio donde se decide el aterrizaje de un login E2E ` +
        `(${SPEC}/requirements.md > R1); sin el, esta guardia prohibe algo sin ofrecer la alternativa.`,
    ).toBe(true)
  })

  it('cada excepcion nombra un spec que existe y dice por que', () => {
    const muertas = excepcionesMuertas(EXCEPCIONES, specsE2E())
    expect(
      muertas,
      `Excepciones de esta guardia que apuntan a un archivo que ya no existe: ${muertas.join(', ')}.\n` +
        'Si se renombro, renombra la excepcion; si se borro, quitala. Una excepcion muerta no puede ' +
        'quedarse en silencio: el dia que alguien cree un archivo con ese nombre, nacera exento sin ' +
        'haberlo decidido nadie.',
    ).toEqual([])

    const sinMotivo = EXCEPCIONES.filter(({ motivo }) => motivo.trim() === '').map(({ archivo }) => archivo)
    expect(sinMotivo, `Excepciones sin motivo escrito: ${sinMotivo.join(', ')}`).toEqual([])
  })

  it('ningun spec define su propio login ni espera una ruta fija tras login-submit', () => {
    const hallazgos = hallazgosTrasExcepciones(
      specsE2E().flatMap((archivo) => analizarSpec(archivo, readFileSync(join(RAIZ, archivo), 'utf8'))),
    )
    const lista = hallazgos.map((h) => `  - ${h.archivo}:${h.linea}  ${h.motivo}`)

    expect(
      lista,
      `Specs E2E que afirman un aterrizaje escrito a mano:\n${lista.join('\n')}\n` +
        `QUE HACER: borra la funcion local y entra con \`loginAndLand(page, credenciales)\` de ${HELPER}. ` +
        'Devuelve el destino DERIVADO de los permisos reales de ese usuario; si el caso necesita la ' +
        'ruta, usa lo que devuelve. No admite parametro de aterrizaje, a proposito.\n' +
        'POR QUE: habia trece copias de esta linea con la ruta dentro. Cuando QC-75 cambio la regla de ' +
        'aterrizaje no se actualizo ninguna, y los casos de permisos pasaron a no afirmar nada ' +
        `(${SPEC}/requirements.md).\n` +
        'SI DE VERDAD NO ES UN ATERRIZAJE (destino de vuelta por `returnTo`, o la suite cuyo sujeto ES ' +
        'la regla de aterrizaje): anade el archivo a EXCEPCIONES de esta guardia CON SU MOTIVO. Lo que ' +
        'no vale es esquivar el patron renombrando la constante.',
    ).toEqual([])
  })
})
