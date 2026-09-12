// Guardia: ninguna primitiva de `components/ui/` trae `cn` de un paquete de terceros.
//
// **Por que existe, con la fecha y el hecho delante.** El 2026-09-12, desde la rama de QC-85,
// `pnpm dlx shadcn@latest add tabs` —y tambien la CLI pineada del repo, `shadcn@4.16.2`— genero
// `components/ui/tabs.tsx` con `import { cn } from "cn"` y, de paso, anadio `"cn": "^0.3.0"` a
// `package.json` y a `pnpm-lock.yaml`. `cn@0.3.0` es un paquete oficial de shadcn-ui y es MIT,
// pero hace **exactamente** lo que este repo ya tiene en `lib/utils.ts` —`twMerge(clsx(inputs))`,
// sobre `clsx` y `tailwind-merge`, las dos ya declaradas—: seria una dependencia REDUNDANTE y una
// SEGUNDA definicion de `cn` conviviendo con la primera.
//
// La decision del humano fue no instalarla y corregir a mano esa unica linea del archivo
// generado. Esta guardia es lo que impide que la proxima ejecucion de la CLI —sobre `tabs` o
// sobre cualquier otra primitiva— vuelva a colarla sin que nadie se entere: el fallo aparece en
// `pnpm run test:guardias`, no seis semanas despues.
//
// **No duplica a `guard-dependencias-aprobadas`**, que mira si `package.json` tiene fila en
// `docs/dependencias.md`. Esa vigila el MANIFIESTO; esta vigila el IMPORT, que es donde la CLI
// escribe primero. Un `import { cn } from "cn"` con la dependencia ya aprobada pasaria la otra y
// caeria aqui.
//
// Recorre ARCHIVOS y no el grafo de imports, por el mismo motivo que sus hermanas de esta carpeta.

import { readFileSync, readdirSync } from 'node:fs'
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

/** La carpeta de primitivas que la CLI de shadcn escribe. */
const CARPETA_DE_PRIMITIVAS = 'components/ui'

/** La UNICA procedencia admitida de `cn` en todo el repo: la helper del propio repo. */
const ORIGEN_UNICO_DE_CN = '@/lib/utils'

/**
 * Ancla de no-vacuidad. Si el barrido devolviera cero archivos —carpeta movida, glob mal escrito—
 * el `toEqual([])` de abajo seria un falso verde. El repo tiene mas de veinte primitivas.
 */
const PRIMITIVAS_MINIMAS = 20

function fuentesDeLasPrimitivas(): readonly string[] {
  const base = join(repoRoot, CARPETA_DE_PRIMITIVAS)
  return readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && /\.tsx?$/.test(entrada.name))
    .map((entrada) => `${CARPETA_DE_PRIMITIVAS}/${entrada.name}`)
}

/** Texto sin comentarios: nombrar `cn` en una explicacion no es importarlo. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * Las procedencias desde las que el archivo importa el identificador `cn`. Acepta comillas simples
 * y dobles —la CLI escribe dobles y el repo usa simples en su codigo propio— y tolera que `cn`
 * venga acompanado de otros nombres en la misma llave.
 */
function origenesDeCn(fuente: string): readonly string[] {
  const origenes: string[] = []
  const importes = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g

  for (const [, nombres, origen] of sinComentarios(fuente).matchAll(importes)) {
    const traeCn = nombres
      .split(',')
      .map((nombre) => nombre.trim().split(/\s+as\s+/)[0]?.trim())
      .some((nombre) => nombre === 'cn')

    if (traeCn) origenes.push(origen)
  }

  return origenes
}

describe(`guardia: las primitivas de ${CARPETA_DE_PRIMITIVAS} usan el \`cn\` del repo`, () => {
  it(`ninguna importa \`cn\` de algo que no sea \`${ORIGEN_UNICO_DE_CN}\``, () => {
    const primitivas = fuentesDeLasPrimitivas()

    expect(
      primitivas.length,
      'el barrido no encontro las primitivas: la guardia no ha comprobado nada',
    ).toBeGreaterThanOrEqual(PRIMITIVAS_MINIMAS)

    const culpables = primitivas.flatMap((ruta) =>
      origenesDeCn(readFileSync(join(repoRoot, ruta), 'utf8'))
        .filter((origen) => origen !== ORIGEN_UNICO_DE_CN)
        .map((origen) => `${ruta} importa \`cn\` de '${origen}'`),
    )

    expect(
      culpables,
      `primitivas con un \`cn\` ajeno: ${culpables.join(', ')}. El repo ya tiene el suyo en ` +
        `${ORIGEN_UNICO_DE_CN}; instalar otro seria una dependencia redundante (CLAUDE.md regla 7)`,
    ).toEqual([])
  })

  it('y al menos una primitiva lo importa de verdad, para que el criterio no sea vacio', () => {
    const conCn = fuentesDeLasPrimitivas().filter(
      (ruta) => origenesDeCn(readFileSync(join(repoRoot, ruta), 'utf8')).length > 0,
    )

    expect(
      conCn.length,
      'ninguna primitiva importa `cn`: o el repo cambio de helper o el detector no muerde',
    ).toBeGreaterThanOrEqual(PRIMITIVAS_MINIMAS)
  })

  it('el detector muerde el import exacto que la CLI escribio, y no muerde al correcto', () => {
    expect(origenesDeCn('import { cn } from "cn"')).toEqual(['cn'])
    expect(origenesDeCn(`import { cn } from '${ORIGEN_UNICO_DE_CN}'`)).toEqual([ORIGEN_UNICO_DE_CN])
    expect(origenesDeCn(`import { cn } from "${ORIGEN_UNICO_DE_CN}"`)).toEqual([ORIGEN_UNICO_DE_CN])
    // Acompanado de otros nombres, que es como aparece en varias primitivas.
    expect(origenesDeCn(`import { cn, formatearAlgo } from '${ORIGEN_UNICO_DE_CN}'`)).toEqual([
      ORIGEN_UNICO_DE_CN,
    ])
    // `cva` no es `cn`, y un comentario que lo nombra tampoco lo es.
    expect(origenesDeCn('import { cva } from "class-variance-authority"')).toEqual([])
    expect(origenesDeCn('// import { cn } from "cn"')).toEqual([])
  })
})
