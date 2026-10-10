// Guardia de movimiento (QC-228 R1, R2, R23).
//
// La guía de marca §08 fija cuánto y cómo se mueve la interfaz: nada dura más de 400 ms, toda
// curva sale de los tres tokens `--ease-standard`, `--ease-enter` y `--ease-exit`, nada rebota y
// nada se repite en bucle sobre el contenido. La única excepción es el fondo del login de QC-226
// (D7), que vive entre los delimitadores «Pantalla de login — INICIO/FIN» de `app/globals.css`;
// y, según P2, los indicadores de carga (`animate-spin`, `animate-pulse`), cuyo bucle lo declara
// Tailwind y no este repo.
//
// Recorre ARCHIVOS de `app/` y `components/` (`.ts`, `.tsx`, `.css`), por el mismo motivo que sus
// hermanas de esta carpeta: una clase prohibida es texto, y donde se ve es en el texto. Cada
// detector se prueba primero con un fuente inventado que lo contiene (casos negativos), para que
// el verde del barrido real no sea un falso verde.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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

const CARPETAS = ['app', 'components'] as const

/** Tope de la guía §08 para cualquier duración de transición o animación (R1). */
const TOPE_MS = 400

/** Las tres curvas de la marca (R2). Son las únicas que pueden declarar un `cubic-bezier`. */
const TOKENS_DE_CURVA = ['--ease-standard', '--ease-enter', '--ease-exit'] as const

/** Archivos cuyo contenido no se anima nunca: tablas, badges de estado y el logo (R23). */
const SIN_ANIMACION = ['components/ui/table.tsx', 'components/ui/badge.tsx', 'components/shared/brand-logo.tsx']

/**
 * Ancla de no-vacuidad. Si el barrido devolviera pocos archivos —carpeta movida, extensión mal
 * escrita— el `toEqual([])` de abajo sería un falso verde.
 */
const ARCHIVOS_MINIMOS = 50

const LOGIN_INICIO = /\/\*\s*══[^*]*pantalla de login — INICIO[^*]*\*\//i
const LOGIN_FIN = /\/\*\s*══[^*]*pantalla de login — FIN[^*]*\*\//i

function archivos(carpeta: string): string[] {
  const base = join(repoRoot, carpeta)
  return readdirSync(base, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => relative(repoRoot, join(e.parentPath, e.name)).split('\\').join('/'))
}

/** Texto sin comentarios: nombrar una clase prohibida al explicarla no es usarla. */
function sinComentarios(ruta: string, fuente: string): string {
  const sinBloques = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (ruta.endsWith('.css')) return sinBloques
  // `//` precedido de `:` es una URL dentro de una cadena, no un comentario.
  return sinBloques.replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** El CSS sin el bloque del login de QC-226, con su movimiento ambiental (D7). */
function fueraDelLogin(fuente: string): string {
  const inicio = LOGIN_INICIO.exec(fuente)
  if (!inicio) return fuente
  const fin = LOGIN_FIN.exec(fuente)
  if (!fin) throw new Error('el bloque del login tiene INICIO y no FIN')
  return fuente.slice(0, inicio.index) + fuente.slice(fin.index + fin[0].length)
}

/** Milisegundos de un literal de tiempo de CSS (`450ms`, `.5s`), o `null` si no lo es. */
function ms(literal: string): number | null {
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(literal.trim())
  if (!m) return null
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1)
}

/** Las duraciones `--dur-*` que declara el CSS, para resolver `var(--dur-*)` y `duration-(--dur-*)`. */
function tokensDeDuracion(css: string): Map<string, number> {
  const tokens = new Map<string, number>()
  for (const [, nombre, valor] of css.matchAll(/(--dur-[a-z-]+)\s*:\s*([^;]+);/g)) {
    const valorMs = ms(valor)
    if (valorMs !== null) tokens.set(nombre, valorMs)
  }
  return tokens
}

/** Puntos de control Y de un `cubic-bezier(x1, y1, x2, y2)`. */
function yDeLaCurva(curva: string): number[] {
  const numeros = curva.split(',').map((n) => Number(n.trim()))
  return [numeros[1], numeros[3]]
}

/**
 * Las infracciones de un archivo. `tokens` son las duraciones `--dur-*` de `globals.css`: una
 * referencia a una variable de duración que no está ahí no se puede medir y cuenta como infracción.
 */
function infracciones(ruta: string, fuenteOriginal: string, tokens: Map<string, number>): string[] {
  const esCss = ruta.endsWith('.css')
  const fuente = sinComentarios(ruta, esCss ? fueraDelLogin(fuenteOriginal) : fuenteOriginal)
  const halladas: string[] = []
  const anotar = (motivo: string) => halladas.push(`${ruta}: ${motivo}`)

  // R1 — clases de duración.
  for (const [clase, n] of fuente.matchAll(/(?<![\w-])duration-(\d+)(?![\w-])/g)) {
    if (Number(n) > TOPE_MS) anotar(`${clase} supera ${TOPE_MS} ms`)
  }
  for (const [clase, valor] of fuente.matchAll(/(?<![\w-])duration-\[([^\]]+)\]/g)) {
    const valorMs = ms(valor)
    if (valorMs === null || valorMs > TOPE_MS) anotar(`${clase} supera ${TOPE_MS} ms o no se puede medir`)
  }
  for (const [clase, variable] of fuente.matchAll(/(?<![\w-])duration-\((--[\w-]+)\)/g)) {
    const valorMs = tokens.get(variable)
    if (valorMs === undefined || valorMs > TOPE_MS) anotar(`${clase} no es un --dur-* de ${TOPE_MS} ms o menos`)
  }

  // R2 — curvas en clases.
  for (const [clase] of fuente.matchAll(/(?<![\w-])ease-(?:linear|in-out|in|out)(?![\w-])/g)) {
    anotar(`${clase} no es una curva de la marca`)
  }
  for (const [clase, variable] of fuente.matchAll(/(?<![\w-])ease-\((--[\w-]+)\)/g)) {
    if (!(TOKENS_DE_CURVA as readonly string[]).includes(variable)) anotar(`${clase} no es una curva de la marca`)
  }
  for (const [clase] of fuente.matchAll(/(?<![\w-])ease-\[[^\]]+\]/g)) {
    anotar(`${clase} es una curva literal; usa ease-(--ease-*)`)
  }

  // R2, R23 — `cubic-bezier` literal: solo en la declaración de los tres tokens, y sin rebote.
  const declaracionesDeToken = new RegExp(`(?:${TOKENS_DE_CURVA.join('|')})\\s*:\\s*cubic-bezier\\(([^)]*)\\)\\s*;`, 'g')
  for (const [, curva] of esCss ? fuente.matchAll(declaracionesDeToken) : []) {
    if (yDeLaCurva(curva).some((y) => !(y >= 0 && y <= 1))) anotar(`cubic-bezier(${curva}) rebota (Y fuera de [0, 1])`)
  }
  const restoSinTokens = esCss ? fuente.replace(declaracionesDeToken, '') : fuente
  for (const [curva] of restoSinTokens.matchAll(/cubic-bezier\s*\([^)]*\)/g)) {
    anotar(`${curva} literal fuera de --ease-* y del bloque del login`)
  }

  // R1 — duraciones literales en declaraciones de CSS.
  if (esCss) {
    const declaraciones = /(?<![\w-])(transition|transition-duration|animation|animation-duration)\s*:\s*([^;}]+)/g
    for (const [, propiedad, valor] of fuente.matchAll(declaraciones)) {
      for (const literal of valor.match(/(?<![\w.-])\d*\.?\d+m?s(?![\w-])/g) ?? []) {
        const valorMs = ms(literal)
        if (valorMs !== null && valorMs > TOPE_MS) anotar(`${propiedad}: ${literal} supera ${TOPE_MS} ms`)
      }
      for (const [, variable] of valor.matchAll(/var\((--dur-[\w-]+)\)/g)) {
        const valorMs = tokens.get(variable)
        if (valorMs === undefined || valorMs > TOPE_MS) anotar(`${propiedad}: var(${variable}) supera ${TOPE_MS} ms o no existe`)
      }
    }
    for (const [nombre, valorMs] of tokensDeDuracion(fuente)) {
      if (valorMs > TOPE_MS) anotar(`${nombre} vale ${valorMs} ms y supera ${TOPE_MS} ms`)
    }
  }

  // R23 — rebotes, pings y bucles.
  for (const [clase] of fuente.matchAll(/(?<![\w-])animate-(?:bounce|ping)(?![\w-])/g)) {
    anotar(`${clase} está prohibida`)
  }
  for (const [bucle] of fuente.matchAll(/(?<![\w-])infinite(?![\w-])/g)) {
    anotar(`animación en bucle (\`${bucle}\`) fuera del login y de animate-spin/animate-pulse`)
  }

  // R23 — tablas, badges y logo no se animan.
  if (SIN_ANIMACION.includes(ruta)) {
    for (const [clase] of fuente.matchAll(/(?<![\w-])animate-[\w-]+/g)) anotar(`${clase} en un archivo que no se anima`)
    for (const [animacion] of fuente.matchAll(/@keyframes|(?<![\w-])animation(?:-name)?\s*:/g)) {
      anotar(`\`${animacion}\` en un archivo que no se anima`)
    }
  }

  return halladas
}

const css = readFileSync(join(repoRoot, 'app/globals.css'), 'utf8')
const tokens = tokensDeDuracion(css)

describe('guardia de movimiento: los detectores muerden (casos negativos)', () => {
  const tsx = (clases: string) => `export const X = () => <div className="${clases}" />\n`
  const detecta = (ruta: string, fuente: string) => expect(infracciones(ruta, fuente, tokens)).not.toEqual([])
  const deja = (ruta: string, fuente: string) => expect(infracciones(ruta, fuente, tokens)).toEqual([])

  it('R1: duration-N por encima de 400', () => {
    detecta('components/x.tsx', tsx('transition-opacity duration-500'))
    detecta('components/x.tsx', tsx('data-open:duration-700'))
    deja('components/x.tsx', tsx('duration-300'))
    deja('components/x.tsx', tsx('duration-400'))
  })

  it('R1: duration-[...] por encima de 400 ms, o sin medida', () => {
    detecta('components/x.tsx', tsx('duration-[450ms]'))
    detecta('components/x.tsx', tsx('duration-[.5s]'))
    detecta('components/x.tsx', tsx('duration-[var(--lento)]'))
    deja('components/x.tsx', tsx('duration-[250ms]'))
  })

  it('R1: duration-(--x) que no es un --dur-* de 400 ms o menos', () => {
    detecta('components/x.tsx', tsx('duration-(--dur-eterno)'))
    deja('components/x.tsx', tsx('duration-(--dur-slow)'))
  })

  it('R1: duraciones literales y tokens --dur-* de CSS por encima de 400 ms', () => {
    detecta('app/x.css', '.a { transition: opacity 500ms; }')
    detecta('app/x.css', '.a { animation-duration: 1s; }')
    detecta('app/x.css', '.a { transition-duration: var(--dur-eterno); }')
    detecta('app/x.css', ':root { --dur-lento: 600ms; }')
    deja('app/x.css', '.a { transition: opacity 150ms var(--ease-exit); animation-delay: 900ms; }')
  })

  it('R2: ease-linear, ease-in, ease-out y ease-in-out', () => {
    for (const curva of ['ease-linear', 'ease-in', 'ease-out', 'ease-in-out']) {
      detecta('components/x.tsx', tsx(`transition ${curva}`))
      detecta('app/x.tsx', tsx(`hover:${curva}`))
    }
    deja('components/x.tsx', tsx('ease-(--ease-enter) ease-(--ease-exit) ease-(--ease-standard)'))
  })

  it('R2: ease-(--x) que no es un token de la marca, y ease-[...] literal', () => {
    detecta('components/x.tsx', tsx('ease-(--ease-propia)'))
    detecta('components/x.tsx', tsx('ease-[cubic-bezier(0.1,0,0,1)]'))
  })

  it('R2: cubic-bezier fuera de los tokens --ease-* y del bloque del login', () => {
    detecta('app/x.css', '.a { transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }')
    detecta('components/x.tsx', 'const curva = "cubic-bezier(0.2, 0, 0, 1)"')
    deja('app/x.css', ':root { --ease-standard: cubic-bezier(0.2, 0, 0, 1); }')
    deja(
      'app/x.css',
      '/* ══ Pantalla de login — INICIO ══ */\n.m { animation: f 22s cubic-bezier(0.2, 0, 0, 1) infinite; }\n/* ══ Pantalla de login — FIN ══ */',
    )
  })

  it('R23: una curva de la marca con rebote (Y fuera de [0, 1])', () => {
    detecta('app/x.css', ':root { --ease-enter: cubic-bezier(0.3, 1.6, 0.6, 1); }')
  })

  it('R23: animate-bounce y animate-ping', () => {
    detecta('components/x.tsx', tsx('animate-bounce'))
    detecta('app/x.tsx', tsx('motion-safe:animate-ping'))
  })

  it('R23: infinite fuera del login; animate-spin y animate-pulse no cuentan', () => {
    detecta('app/x.css', '.a { animation: girar 300ms infinite; }')
    detecta('components/x.tsx', tsx('[animation-iteration-count:infinite]'))
    deja('components/x.tsx', tsx('animate-spin'))
    deja('components/x.tsx', tsx('animate-pulse'))
  })

  it('R23: animate-* y animaciones CSS en la tabla, el badge y el logo', () => {
    for (const ruta of SIN_ANIMACION) {
      detecta(ruta, tsx('animate-in fade-in-0'))
      detecta(ruta, tsx('[animation:pulso_1s]'))
    }
    deja('components/ui/dialog.tsx', tsx('data-open:animate-in'))
  })

  it('un comentario que nombra una clase prohibida no es usarla', () => {
    deja('components/x.tsx', '// no usar ease-in ni animate-bounce\n/* duration-1000 */\nexport const a = 1\n')
    // Pero un `//` de URL no es un comentario: lo que va detrás en la línea se sigue mirando.
    detecta('components/x.tsx', 'const url = "https://ejemplo.com"; const c = "ease-in"')
  })
})

describe('guardia de movimiento: app/ y components/ (R1, R2, R23)', () => {
  const rutas = CARPETAS.flatMap(archivos)

  it('recorre suficientes archivos para que el verde signifique algo', () => {
    expect(rutas.length).toBeGreaterThanOrEqual(ARCHIVOS_MINIMOS)
    expect(rutas).toContain('app/globals.css')
    for (const ruta of SIN_ANIMACION) expect(rutas).toContain(ruta)
  })

  it('los tokens --dur-* de globals.css se leen y ninguno supera 400 ms', () => {
    expect([...tokens.keys()].sort()).toEqual(['--dur-base', '--dur-fast', '--dur-instant', '--dur-slow'])
    for (const valorMs of tokens.values()) expect(valorMs).toBeLessThanOrEqual(TOPE_MS)
  })

  it('el bloque del login está delimitado, y es lo único que la guardia deja fuera', () => {
    expect(LOGIN_INICIO.test(css)).toBe(true)
    expect(LOGIN_FIN.test(css)).toBe(true)
    // Sin los delimitadores el bloque del login sí tendría infracciones: la exclusión es real.
    expect(infracciones('app/globals.css', css.replace(LOGIN_INICIO, '').replace(LOGIN_FIN, ''), tokens)).not.toEqual([])
  })

  it('ningún archivo declara movimiento prohibido', () => {
    const halladas = rutas.flatMap((ruta) => infracciones(ruta, readFileSync(join(repoRoot, ruta), 'utf8'), tokens))
    expect(halladas).toEqual([])
  })
})
