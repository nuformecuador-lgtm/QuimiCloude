// Guardia: la conversion entre unidades que publica QC-76 NO tiene todavia ningun consumidor
// (R26, decision cerrada 18). `inventario`, `recetas` y `pedidos` siguen tratando la unidad como
// ANOTATIVA: el contrato la publica y la prueba, y quien la estrene abre su propia ficha con su
// propia decision de negocio.
//
// POR QUE ES UNA GUARDIA Y NO UN TEST NORMAL. R26 es un requisito NEGATIVO sobre el arbol
// -«nadie la llama»-, no sobre el comportamiento de ninguna funcion. Ningun test unitario lo
// cubre, porque un test unitario solo ve lo que importa, y aqui lo que hay que vigilar es
// justo lo que NADIE importa todavia. Por eso recorre ARCHIVOS y vive en `tests/guards/`, que
// `test:rapido` corre SIEMPRE enteras: el grafo de imports jamas seleccionaria este archivo
// (`docs/verification.md > Las guardias van SIEMPRE`).
//
// `design.md > 9` de QC-76 la prometia en la fila de R26 y la ficha se cerro sin escribirla;
// el `reviewer` lo levanto como hallazgo menor el 2026-09-08 y esto lo cierra.
//
// CUANDO ESTA GUARDIA SE PONGA ROJA no se la relaja: significa que alguien estreno la
// conversion, y eso necesita ficha propia. La respuesta es retirar esta guardia EN ESA FICHA,
// junto con la decision de negocio que la justifique, no aqui y no de paso.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
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

/** El simbolo vigilado y su unica casa legitima. */
const SIMBOLO = 'convertQuantity'
const MODULO = join('lib', 'modules', 'unidades')

/**
 * Donde se busca: TODO el codigo de produccion. `tests/` queda fuera a proposito -R26 habla de
 * consumidores reales, y los tests de la conversion la llaman por definicion-, igual que
 * `node_modules`, `.next`, `.worktrees` y `db/`.
 */
const RAICES = ['app', 'components', 'hooks', 'lib', 'e2e', 'scripts', 'middleware.ts']

const EXTENSIONES = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']

function esFuente(archivo: string): boolean {
  return EXTENSIONES.some((ext) => archivo.endsWith(ext))
}

/** Todos los archivos de fuente bajo `dir`, a cualquier profundidad. */
function archivosDe(dir: string): readonly string[] {
  let entradas: readonly string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return []
  }
  return entradas.flatMap((entrada) => {
    if (entrada === 'node_modules' || entrada === '.next') return []
    const completo = join(dir, entrada)
    return statSync(completo).isDirectory()
      ? archivosDe(completo)
      : esFuente(completo)
        ? [completo]
        : []
  })
}

function fuentesDeProduccion(): readonly string[] {
  return RAICES.flatMap((raiz) => {
    const completo = join(repoRoot, raiz)
    let esDirectorio: boolean
    try {
      esDirectorio = statSync(completo).isDirectory()
    } catch {
      return []
    }
    return esDirectorio ? archivosDe(completo) : esFuente(completo) ? [completo] : []
  })
}

describe('guardia: la conversion de unidades no tiene consumidores todavia (QC-76 R26)', () => {
  it('ningun archivo de produccion fuera de `lib/modules/unidades` nombra convertQuantity', () => {
    const infractores = fuentesDeProduccion()
      .filter((archivo) => !relative(repoRoot, archivo).startsWith(MODULO + sep))
      .filter((archivo) => readFileSync(archivo, 'utf8').includes(SIMBOLO))
      .map((archivo) => relative(repoRoot, archivo).split(sep).join('/'))

    expect(
      infractores,
      `${SIMBOLO} aparece fuera de lib/modules/unidades: ${infractores.join(', ')}. ` +
        'QC-76 R26 (decision cerrada 18) dice que NADIE la usa todavia: inventario, recetas y ' +
        'pedidos siguen tratando la unidad como anotativa. Si de verdad hay que estrenarla, ' +
        'va en su propia ficha con su propia decision de negocio, y esa ficha retira esta ' +
        'guardia; no se relaja aqui.',
    ).toEqual([])
  })

  it('y sigue existiendo y publicada, para que la guardia no pase por vacuidad', () => {
    // Sin este caso, renombrar la funcion dejaria el caso de arriba en verde para siempre
    // sin vigilar nada: no habria ningun `convertQuantity` que encontrar en ningun sitio.
    const barrel = readFileSync(join(repoRoot, MODULO, 'index.ts'), 'utf8')
    const dominio = readFileSync(join(repoRoot, MODULO, 'domain', 'convert-quantity.ts'), 'utf8')

    expect(barrel, 'el contrato publico de `unidades` debe seguir publicando la conversion (R22)').toContain(
      SIMBOLO,
    )
    expect(dominio, 'la conversion debe seguir viviendo en el dominio puro del modulo').toContain(
      `export function ${SIMBOLO}`,
    )
  })
})
