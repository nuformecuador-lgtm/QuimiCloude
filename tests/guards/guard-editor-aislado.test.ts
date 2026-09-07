// Guardia: la libreria del editor (`@tiptap/*`) esta AISLADA en los dos archivos que enumera
// `specs/QC-64-editor-y-lectura-de-pasos/design.md > 7` (R25).
//
// Recorre ARCHIVOS, no el grafo de imports —por eso vive en `tests/guards/` y entra en
// `pnpm run test:guardias`, o sea en `./init.sh --rapido`—. El grafo solo ve lo que ya cuelga
// de algo testeado: un import nuevo de `@tiptap` en una ruta sin test no lo veria nadie, y el
// dia que alguien lo mete, sustituir el editor deja de ser «reescribir dos archivos» y pasa a
// ser «buscar la libreria por todo el repo», que es exactamente lo que R25 prohibe.
//
// Copia el patron de la guardia de `@dnd-kit` de
// `tests/unit/recetas-ui/recipe-route-contract.test.ts` (helpers `leer` /
// `fuenteSinComentarios` y normalizado de separadores de Windows), ampliado a TODO el fuente
// del repo en vez de a una sola carpeta de ruta.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const DESIGN = 'specs/QC-64-editor-y-lectura-de-pasos/design.md'
const REGISTRO = 'docs/dependencias.md'

/** Los dos —y solo dos— archivos que `design.md > 7` autoriza a importar la libreria. */
const IMPORTADORES_AUTORIZADOS = [
  'app/(private)/produccion/formulas/components/recipe-step-editor.tsx',
  'app/(private)/produccion/formulas/components/recipe-step-schema.ts',
].sort()

/**
 * Excepciones, por NOMBRE y no por patron amplio: son los dos unicos archivos que **escriben**
 * el nombre de la libreria sin consumirla, precisamente para poder afirmar algo sobre ella.
 *
 * - Este mismo archivo: contiene los literales `@tiptap/...` que la guardia compara.
 * - `tests/unit/recetas-ui/recipe-step-editor.test.tsx`: es el test del editor. **No importa**
 *   `@tiptap/*` (sus imports son `@testing-library/react`, `react`, `vitest` y el barrel de la
 *   ruta); lo que hace es LEER el fuente de `recipe-step-schema.ts` y comparar sus imports
 *   contra una lista de literales, que es como verifica R2 (el esquema cerrado). Excluirlo no
 *   abre ningun agujero: si manana ese test importase la libreria de verdad seguiria sin ser
 *   un consumidor de produccion, y el resto de la guardia —el conjunto exacto de importadores—
 *   seguiria mordiendo sobre `app/`, `components/`, `lib/` y demas.
 */
const EXCEPCIONES_DOCUMENTADAS = [
  'tests/guards/guard-editor-aislado.test.ts',
  'tests/unit/recetas-ui/recipe-step-editor.test.tsx',
]

/** Carpetas que nunca se recorren: no son fuente del repo. */
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])

/** Raices de fuente del repo. Se filtran por existencia: `hooks/` o `scripts/` pueden no estar. */
const RAICES_DE_FUENTE = ['app', 'components', 'lib', 'hooks', 'e2e', 'tests', 'scripts', 'db']

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return leer(rutaRelativa)
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim()
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'))
    })
    .join('\n')
}

/** Todos los `.ts`/`.tsx` bajo una carpeta, en rutas relativas a la raiz y con `/` siempre. */
function fuentesBajo(carpetaRelativa: string): string[] {
  const encontradas: string[] = []

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name)
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        recorrer(completa)
        continue
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'))
      }
    }
  }

  recorrer(join(RAIZ, carpetaRelativa))
  return encontradas
}

/** Los `.ts`/`.tsx` sueltos en la raiz del repo (`middleware.ts`, `next.config.ts`...). */
function fuentesEnLaRaiz(): string[] {
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre.endsWith('.ts') || nombre.endsWith('.tsx'))
}

/** Todo el codigo fuente del repo, menos las dos excepciones documentadas arriba. */
const TODAS_LAS_FUENTES = [
  ...RAICES_DE_FUENTE.filter((carpeta) => existsSync(join(RAIZ, carpeta))).flatMap(fuentesBajo),
  ...fuentesEnLaRaiz(),
]
  .filter((ruta) => !EXCEPCIONES_DOCUMENTADAS.includes(ruta))
  .sort()

/** Entradas directas de `package.json` (`dependencies` + `devDependencies`). */
function dependenciasDeclaradas(): Record<string, string> {
  const pkg = JSON.parse(leer('package.json')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
}

/** Filas del registro, indexadas por paquete: `| \`nombre\` | para que | estado | ... |`. */
function filasDelRegistro(): Map<string, { estado: string; fila: string }> {
  const filas = new Map<string, { estado: string; fila: string }>()
  for (const linea of leer(REGISTRO).split('\n')) {
    const fila = linea.trim()
    if (!fila.startsWith('|')) continue
    const celdas = fila.split('|')
    const match = /^`([^`]+)`$/.exec(celdas[1]?.trim() ?? '')
    if (match) filas.set(match[1], { estado: celdas[3]?.trim() ?? '', fila })
  }
  return filas
}

describe(`guardia: la libreria del editor esta aislada (${DESIGN} > 7, R25)`, () => {
  it('el recorrido cubre el fuente del repo y no se ha quedado vacio', () => {
    // Sin esto, un fallo del recorrido —una raiz renombrada, un `readdirSync` que devuelve
    // nada— dejaria los casos de abajo en verde por vacuidad: la guardia mas peligrosa es la
    // que pasa porque no mira nada.
    expect(
      TODAS_LAS_FUENTES.length,
      'el recorrido de fuentes deberia encontrar cientos de archivos; si encuentra pocos, ' +
        'las raices de RAICES_DE_FUENTE ya no existen y la guardia esta pasando en vacio',
    ).toBeGreaterThan(100)

    for (const ruta of IMPORTADORES_AUTORIZADOS) {
      expect(
        existsSync(join(RAIZ, ruta)),
        `${ruta} lo enumera ${DESIGN} > 7 como uno de los dos importadores de la libreria, ` +
          'pero no existe: o se ha renombrado (actualiza design.md y esta guardia) o se ha borrado',
      ).toBe(true)
    }
  })

  it('solo los dos archivos que enumera design.md > 7 mencionan @tiptap', () => {
    const conTiptap = TODAS_LAS_FUENTES.filter((ruta) =>
      fuenteSinComentarios(ruta).includes('@tiptap'),
    ).sort()

    expect(
      conTiptap,
      'La libreria del editor esta AISLADA en dos archivos y solo dos ' +
        `(${DESIGN} > 7, requisito R25):\n` +
        `${IMPORTADORES_AUTORIZADOS.map((ruta) => `  - ${ruta}`).join('\n')}\n` +
        `Encontrados: ${conTiptap.join(', ') || '(ninguno)'}.\n` +
        'Si SOBRA uno: mueve lo que necesites al editor o al esquema y pasalo por props/tipos ' +
        'propios; sustituir el editor tiene que ser reescribir esos dos archivos y el mapeo, ' +
        'no buscar `@tiptap` por todo el arbol. Si FALTA uno: el aislamiento se documento en ' +
        `${DESIGN} > 7 y en la fila de \`@tiptap/react\` de ${REGISTRO}; si el inventario ` +
        'cambia de verdad, cambia primero el design.md y luego esta lista.',
    ).toEqual(IMPORTADORES_AUTORIZADOS)
  })

  it('@tiptap/starter-kit no aparece ni en package.json ni en el fuente', () => {
    const PROHIBIDO = '@tiptap/starter-kit'
    const enPackageJson = Object.keys(dependenciasDeclaradas()).filter((nombre) =>
      nombre.startsWith(PROHIBIDO),
    )

    expect(
      enPackageJson,
      `${PROHIBIDO} NO entra, y ese «no» es el diseno (${DESIGN} > 2.1): trae encabezados, ` +
        'listas numeradas, cita, bloque de codigo y regla horizontal. Un esquema cerrado que ' +
        'se construye QUITANDO cosas se rompe en la siguiente version menor que anada un nodo; ' +
        'el de QC-64 se construye DECLARANDO cuatro construcciones (R2). Desinstalalo.',
    ).toEqual([])

    const enFuente = TODAS_LAS_FUENTES.filter((ruta) =>
      fuenteSinComentarios(ruta).includes(PROHIBIDO),
    ).sort()

    expect(
      enFuente,
      `Archivos que importan o nombran ${PROHIBIDO} en codigo: ${enFuente.join(', ')}. ` +
        `El esquema cerrado se declara extension a extension (${DESIGN} > 2.1 y > 3, R2).`,
    ).toEqual([])
  })

  it('TaskList y TaskItem se importan de ./task-list y ./task-item, nunca del kit ni de la raiz', () => {
    const esquema = fuenteSinComentarios(IMPORTADORES_AUTORIZADOS[1])
    const PORQUE =
      `${DESIGN} > 2.3 y R2: \`@tiptap/extension-list\` tambien publica \`BulletList\` y ` +
      '`OrderedList`, y su `./kit` los REGISTRA. Importar del kit o de la raiz ampliaria el ' +
      'esquema cerrado —metiendo lista con vinetas y lista numerada— sin que nadie escriba una ' +
      'linea, que es justo lo que se evito descartando `@tiptap/starter-kit`.'

    expect(
      esquema,
      `${IMPORTADORES_AUTORIZADOS[1]} debe importar TaskList de '@tiptap/extension-list/task-list'. ${PORQUE}`,
    ).toContain("from '@tiptap/extension-list/task-list'")
    expect(
      esquema,
      `${IMPORTADORES_AUTORIZADOS[1]} debe importar TaskItem de '@tiptap/extension-list/task-item'. ${PORQUE}`,
    ).toContain("from '@tiptap/extension-list/task-item'")

    const conKit = TODAS_LAS_FUENTES.filter((ruta) => {
      const fuente = fuenteSinComentarios(ruta)
      return fuente.includes('@tiptap/extension-list/kit') || fuente.includes("'@tiptap/extension-list'")
    }).sort()

    expect(
      conKit,
      `Archivos que importan de '@tiptap/extension-list/kit' o de la raiz del paquete: ` +
        `${conKit.join(', ')}. ${PORQUE}`,
    ).toEqual([])
  })

  it('las nueve entradas de TipTap estan en package.json y ninguna fila del registro es excepcion', () => {
    const instaladas = dependenciasDeclaradas()
    const paquetes = Object.keys(instaladas)
      .filter((nombre) => nombre.startsWith('@tiptap/'))
      .sort()

    expect(
      paquetes.length,
      `${DESIGN} > 2.3 cerro la propuesta en NUEVE entradas directas de TipTap ` +
        '(no once: `TaskList`/`TaskItem` salen de `@tiptap/extension-list`, verificado con ' +
        `\`npm pack\` sobre el paquete publicado). Hay ${paquetes.length}: ${paquetes.join(', ')}. ` +
        'Si el reparto cambia, se cambia primero el design.md y la fila del registro.',
    ).toBe(9)

    const registro = filasDelRegistro()

    const sinFila = paquetes.filter((nombre) => !registro.has(nombre)).sort()
    expect(
      sinFila,
      `Entradas de TipTap en package.json sin fila en ${REGISTRO}: ${sinFila.join(', ')}. ` +
        'R25: cada entrada nueva lleva su fila con el resultado de los cuatro checks, y ' +
        'ninguna dependencia entra sin aprobacion humana (CLAUDE.md regla 7).',
    ).toEqual([])

    const comoExcepcion = paquetes
      .filter((nombre) => (registro.get(nombre)?.estado ?? '').toLowerCase().includes('excepcion'))
      .sort()
    expect(
      comoExcepcion,
      `Filas de TipTap marcadas como \`excepcion\` en ${REGISTRO}: ${comoExcepcion.join(', ')}. ` +
        `Los cuatro checks PASARON para las nueve el 2026-09-06 (${DESIGN} > 2.3: sin ` +
        'deprecated, release del 2026-09-04, >13M descargas/semana, licencia MIT), asi que ' +
        'ninguna nace como excepcion. Si una empieza a fallar un check, se dice cual y por que ' +
        'se acepta —el precedente es `@dnd-kit`—, y se actualiza tambien el design.md.',
    ).toEqual([])
  })

  it('el asistente de lectura no conoce la libreria del editor', () => {
    // Riesgo 2 de `design.md > 10`: el asistente es lo que QC-63 pondra en manos del Operador.
    // Si arrastra el editor, esa ruta se traga un bundle de ProseMirror que no usa.
    const CARPETA_ASISTENTE = 'components/shared/step-reader'
    expect(
      existsSync(join(RAIZ, CARPETA_ASISTENTE)) && statSync(join(RAIZ, CARPETA_ASISTENTE)).isDirectory(),
      `${CARPETA_ASISTENTE} deberia existir: es el asistente de lectura de ${DESIGN} > 5`,
    ).toBe(true)

    const conTiptap = fuentesBajo(CARPETA_ASISTENTE)
      .filter((ruta) => fuenteSinComentarios(ruta).includes('@tiptap'))
      .sort()

    expect(
      conTiptap,
      `Archivos de ${CARPETA_ASISTENTE} que mencionan la libreria: ${conTiptap.join(', ')}. ` +
        `El asistente renderiza el documento del contrato de QC-62 y NADA MAS (${DESIGN} > 5): ` +
        'es riesgo 2 de la seccion 10 —la ruta del Operador que traera QC-63 no debe arrastrar ' +
        'el editor—. Pasa lo que necesites como tipos propios del contrato.',
    ).toEqual([])
  })
})
