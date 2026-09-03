// QC-32 — el cableado del seed arrancador de unidades, leido como TEXTO (R25, R26).
//
// Por que existe este archivo: `tests/integration/unidades/unidades-seed.int.test.ts`
// ejercita el adaptador de produccion dentro de una transaccion con ROLLBACK, y por eso NO
// puede invocar `unidades.seedStarterUnits()` de `lib/composition` (escribiria por otra
// conexion, en la base de verdad). Sin este archivo, `scripts/seed.ts` podria dejar de
// llamar al seed de unidades —o `lib/composition` podria atar el puerto a otra cosa— y toda
// la suite seguiria verde mientras `pnpm run db:seed` no siembra ni una unidad.
//
// Mismo patron que `tests/unit/identity/seed/deploy-hook.test.ts`, que lee `scripts/seed.ts`
// como texto para comprobar que el script sigue invocando el seed de `identity`. No se
// ejecuta nada: ejecutar el seed escribiria en la base compartida.
//
// Los predicados son FUNCIONES PURAS exportadas y cada uno se demuestra con un fuente
// sintetico que lo viola y otro que no: un predicado que no se demuestra no vigila nada.

import { readFileSync } from 'node:fs'
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
const seedScript = join(repoRoot, 'scripts', 'seed.ts')
const composicion = join(repoRoot, 'lib', 'composition', 'index.ts')

/**
 * Quita comentarios de bloque y de linea. Es imprescindible aqui: tanto `scripts/seed.ts`
 * como `lib/composition/index.ts` explican en prosa lo que hacen, y un barrido sobre el
 * texto crudo leeria la EXPLICACION como el CUMPLIMIENTO. Mismo ayudante que
 * `tests/unit/unidades/module-contract.test.ts` y que las guardias.
 */
export function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** ¿El fuente importa la fachada de composicion? Vale el alias `@/` y el relativo que usa
 *  `scripts/seed.ts` (`tsx` no resuelve los alias, `design.md > 5`), estatico o dinamico. */
export function importaLaComposicion(texto: string): boolean {
  return /(?:from|import|require)\s*\(?\s*'(?:@\/lib\/composition|(?:\.\.?\/)+lib\/composition)'/.test(
    soloCodigo(texto),
  )
}

/** ¿El fuente INVOCA el seed de unidades sobre la fachada? No basta con nombrarlo: se exige
 *  la llamada, con su parentesis. */
export function invocaElSeedDeUnidades(texto: string): boolean {
  return /\bunidades\s*\.\s*seedStarterUnits\s*\(/.test(soloCodigo(texto))
}

/** ¿La composicion ata el puerto del seed al adaptador driven REAL? Se exigen las dos
 *  mitades: importar el adaptador por su ruta, y pasarlo como `repository` del caso de uso.
 *  Con solo el import, la fachada podria estar cableada a cualquier otra cosa. */
export function cableaElAdaptadorDriven(texto: string): boolean {
  const codigo = soloCodigo(texto)
  const importaAdaptador =
    /import\s*\{[^}]*\bunitSeedRepositoryPrisma\b[^}]*\}\s*from\s*'@\/lib\/modules\/unidades\/adapters\/driven\/persistence\/unit-seed-repository-prisma'/.test(
      codigo,
    )
  const loAta =
    /createSeedStarterUnits\s*\(\s*\{\s*repository\s*:\s*unitSeedRepositoryPrisma\s*[,}]/.test(
      codigo,
    )
  return importaAdaptador && loAta
}

// ---------------------------------------------------------------------------
// Los predicados, demostrados con fuentes sinteticos
// ---------------------------------------------------------------------------

describe('los predicados de este archivo caen ante el fuente que los viola', () => {
  it('invocaElSeedDeUnidades exige la llamada, y no la confunde con prosa ni con el import', () => {
    expect(
      invocaElSeedDeUnidades("const { unidades } = await import('../lib/composition')\nawait unidades.seedStarterUnits()"),
    ).toBe(true)
    expect(invocaElSeedDeUnidades('const units = await unidades . seedStarterUnits ( )')).toBe(true)

    // El fuente que MUTAR el seed produciria: importa la fachada, pero ya no la llama.
    expect(
      invocaElSeedDeUnidades("const { identity } = await import('../lib/composition')\nawait identity.seedInitialAccess()"),
    ).toBe(false)
    // Nombrarlo sin llamarlo tampoco cuenta.
    expect(invocaElSeedDeUnidades('const f = unidades.seedStarterUnits')).toBe(false)
    // Ni explicarlo en un comentario, de linea o de bloque.
    expect(invocaElSeedDeUnidades('// aqui iria unidades.seedStarterUnits()')).toBe(false)
    expect(invocaElSeedDeUnidades('/** invoca unidades.seedStarterUnits() */')).toBe(false)
  })

  it('importaLaComposicion acepta el alias y el relativo, y rechaza cualquier otro modulo', () => {
    expect(importaLaComposicion("import { unidades } from '@/lib/composition'")).toBe(true)
    expect(importaLaComposicion("const c = await import('../lib/composition')")).toBe(true)
    expect(importaLaComposicion("const c = await import('../../lib/composition')")).toBe(true)

    expect(importaLaComposicion("import { prisma } from '@/lib/shared/db/prisma'")).toBe(false)
    expect(importaLaComposicion("import { STARTER_UNITS } from '@/lib/modules/unidades'")).toBe(false)
    expect(importaLaComposicion("// import { unidades } from '@/lib/composition'")).toBe(false)
  })

  it('cableaElAdaptadorDriven exige import Y atadura, y cae si falta cualquiera de las dos', () => {
    const bueno = [
      "import { createSeedStarterUnits } from '@/lib/modules/unidades';",
      "import { unitSeedRepositoryPrisma } from '@/lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma';",
      'export const unidades = {',
      '  seedStarterUnits: createSeedStarterUnits({ repository: unitSeedRepositoryPrisma }),',
      '} as const;',
    ].join('\n')
    expect(cableaElAdaptadorDriven(bueno)).toBe(true)

    // Sin el import del adaptador: la fachada no puede estar atada a el.
    expect(cableaElAdaptadorDriven(bueno.split('\n').filter((l) => !l.includes('unit-seed-repository-prisma')).join('\n'))).toBe(false)

    // Con el import, pero atado a un doble: es el cableado que dejaria el seed sin escribir.
    const conDoble = bueno.replace(
      'createSeedStarterUnits({ repository: unitSeedRepositoryPrisma })',
      'createSeedStarterUnits({ repository: noOpRepository })',
    )
    expect(cableaElAdaptadorDriven(conDoble)).toBe(false)

    // Y en comentario no cuenta.
    expect(cableaElAdaptadorDriven(bueno.split('\n').map((l) => `// ${l}`).join('\n'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Los fuentes de verdad
// ---------------------------------------------------------------------------

describe('scripts/seed.ts invoca el seed de unidades (R25, R26)', () => {
  const fuente = readFileSync(seedScript, 'utf8')

  it('el script existe y no esta vacio (barrer una cadena vacia pasaria en verde para siempre)', () => {
    expect(fuente.length).toBeGreaterThan(0)
  })

  it('importa la fachada de composicion', () => {
    expect(
      importaLaComposicion(fuente),
      'scripts/seed.ts dejo de importar lib/composition: `pnpm run db:seed` no siembra nada.',
    ).toBe(true)
  })

  it('invoca unidades.seedStarterUnits()', () => {
    expect(
      invocaElSeedDeUnidades(fuente),
      'scripts/seed.ts ya no invoca `unidades.seedStarterUnits()`: el catalogo arrancador ' +
        'no se siembra en el despliegue ni en `pnpm run db:seed` (R25).',
    ).toBe(true)
  })
})

describe('lib/composition ata el puerto del seed al adaptador driven real (R15, R25)', () => {
  const fuente = readFileSync(composicion, 'utf8')

  it('el archivo existe y no esta vacio', () => {
    expect(fuente.length).toBeGreaterThan(0)
  })

  it('importa el adaptador driven de unidades y se lo pasa a createSeedStarterUnits', () => {
    expect(
      cableaElAdaptadorDriven(fuente),
      'lib/composition/index.ts ya no ata `createSeedStarterUnits` a `unitSeedRepositoryPrisma`: ' +
        'la fachada podria estar cableada a otra implementacion y el seed no escribiria en `units`.',
    ).toBe(true)
  })
})
