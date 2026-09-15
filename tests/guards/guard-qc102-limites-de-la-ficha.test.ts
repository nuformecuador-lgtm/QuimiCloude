// QC-102 T17 — Guardia: los limites de ESTA ficha (R15, R39).
//
//   R15 — no se toca `db/**`: ni `schema.prisma`, ni una migracion nueva, ni una revertida. Y el
//         catalogo cerrado de permisos sigue teniendo quince entradas.
//   R39 — no entra ninguna dependencia de terceros nueva.
//
// **Por que este archivo se acota a su propia rama, y no es pereza.**
// `tests/baseline-rojos.json` documenta SEIS archivos rojos cuya causa es exactamente esta clase de
// requisito —«MI ficha no toca X»— implementado como CENSO DEL DIFF DE RAMA contra `dev`. Todos
// dicen lo mismo: `recipe-route-contract`, `recetas/module-contract`, `unidades/modulo-intacto`,
// `unidades/unidades-convenciones`, `configuracion-ui/configuracion-convenciones` y
// `configuracion-ui/unidades-convenciones` cazaron, no a su propia ficha, sino a la siguiente que
// paso por ahi con una migracion legitima (QC-35, QC-79) o con una dependencia legitima, aprobada
// por el humano y anotada en `docs/dependencias.md` (`resend`). Y como el gate ignora el ARCHIVO
// entero, cada una de esas entradas apago tambien todos los casos sanos de su archivo.
//
// Aqui la leccion se aplica en tres puntos:
//
//   1. **Precondicion de rama explicita.** Los dos casos de diff solo corren en
//      `feature/QC-102-...`. En cualquier otra rama hacen `ctx.skip` RUIDOSO diciendo que no han
//      comprobado nada, en vez de ponerse rojos sobre trabajo ajeno.
//   2. **Rango = merge-base de MI rama**, no la punta de `dev`: lo que se mide son los commits de
//      esta ficha, no lo que `dev` haya acumulado entretanto.
//   3. **Archivo pequeño y de un solo tema.** Si algun dia hay que meterlo en el baseline, lo que
//      se apaga es esto y nada mas. Las preguntas que SI deben correr en toda rama tienen su propio
//      sitio y no se duplican aqui: «¿toda dependencia declarada esta aprobada?» la responde
//      `guard-dependencias-aprobadas.test.ts`, y «¿el catalogo tiene quince permisos?» la responde
//      `tests/unit/identity/permissions.test.ts` («R2: contiene exactamente los quince codigos»).

import { execFileSync } from 'node:child_process'
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

/** La rama de ESTA ficha. Fuera de ella, los casos de diff se saltan: no tienen nada que decir. */
const RAMA_DE_LA_FICHA = 'feature/QC-102-responsables-en-la-pantalla-de-pedidos'

/** Candidatos de rama base, en orden. El worktree puede no tener remoto configurado. */
const BASES = ['dev', 'origin/dev'] as const

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function ramaActual(): string | null {
  const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return rama === null || rama.length === 0 ? null : rama
}

/** El merge-base de MI rama con la base, o `null` si no hay ninguna base disponible. */
export function mergeBaseDeLaRama(): string | null {
  for (const base of BASES) {
    const sha = git(['merge-base', base, 'HEAD'])
    if (sha !== null && sha.length > 0) return sha
  }
  return null
}

/** Archivos tocados por los commits de esta rama Y por el arbol de trabajo, desde el merge-base. */
export function archivosDeLaFicha(mergeBase: string): readonly string[] {
  const salida = git(['diff', '--name-only', mergeBase])
  if (salida === null) return []
  return salida
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .sort()
}

/** Los de `archivos` que caen bajo alguno de los prefijos vigilados. */
export function bajoPrefijos(
  archivos: readonly string[],
  prefijos: readonly string[],
): readonly string[] {
  return archivos.filter((archivo) => prefijos.some((prefijo) => archivo.startsWith(prefijo)))
}

/** Nombres de `dependencies` + `devDependencies` de un `package.json` ya leido. */
export function nombresDeDependencias(packageJson: string): readonly string[] {
  const pkg = JSON.parse(packageJson) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort()
}

/**
 * La precondicion, en un solo sitio: o devuelve el merge-base, o devuelve el MOTIVO por el que este
 * archivo no puede comprobar nada. Nunca devuelve las dos cosas, y nunca falla en silencio.
 */
export function preparar(rama: string | null, mergeBase: string | null): { mergeBase: string } | { motivo: string } {
  if (rama === null) {
    return { motivo: 'no se pudo leer la rama actual con git: este caso NO ha comprobado nada.' }
  }
  if (rama !== RAMA_DE_LA_FICHA) {
    return {
      motivo:
        `la rama actual es '${rama}' y no '${RAMA_DE_LA_FICHA}': R15 y R39 hablan de lo que hace ` +
        'ESTA ficha, no de lo que haya hecho quien pase despues. Este caso NO ha comprobado nada.',
    }
  }
  if (mergeBase === null) {
    return {
      motivo:
        `no se pudo calcular el merge-base con ${BASES.join(' ni con ')}: este caso NO ha ` +
        'comprobado nada.',
    }
  }
  return { mergeBase }
}

const rama = ramaActual()
const base = mergeBaseDeLaRama()

describe('QC-102 — los limites de la ficha (R15, R39)', () => {
  it('R15: el diff de `db/**` de esta ficha es VACIO', (ctx) => {
    const listo = preparar(rama, base)
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }

    const archivos = archivosDeLaFicha(listo.mergeBase)
    expect(
      archivos.length,
      `el rango ${listo.mergeBase}..arbol no trae ningun archivo: la ficha no se ha escrito todavia, ` +
        'o el rango esta mal calculado. Sin archivos, este caso pasaria en verde sin mirar nada.',
    ).toBeGreaterThan(0)

    const tocados = bajoPrefijos(archivos, ['db/'])
    expect(
      tocados,
      `QC-102 R15: esta ficha NO toca el esquema ni las migraciones, y el diff dice lo contrario:\n` +
        `${tocados.join('\n')}\n` +
        'El modelo es de QC-86 y ya esta en disco; la consulta en lote lee, no migra.',
    ).toEqual([])
  })

  it('R39: `package.json` no aparece en el diff de esta ficha', (ctx) => {
    const listo = preparar(rama, base)
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }

    const tocados = bajoPrefijos(archivosDeLaFicha(listo.mergeBase), ['package.json', 'pnpm-lock.yaml'])
    expect(
      tocados,
      `QC-102 R39: esta ficha no incorpora ninguna dependencia nueva ni abre ninguna primitiva con ` +
        `la CLI de shadcn, y el diff dice lo contrario:\n${tocados.join('\n')}\n` +
        '`getInitials`, `avatar.tsx` y `tooltip.tsx` ya estan en disco (decision cerrada 10).',
    ).toEqual([])
  })

  it('R39: y ni una dependencia mas que en el merge-base, entrada por entrada', (ctx) => {
    const listo = preparar(rama, base)
    if ('motivo' in listo) {
      ctx.skip(listo.motivo)
      return
    }

    const antesRaw = git(['show', `${listo.mergeBase}:package.json`])
    if (antesRaw === null) {
      ctx.skip(`no se pudo leer package.json en ${listo.mergeBase}: este caso NO ha comprobado nada.`)
      return
    }

    const antes = nombresDeDependencias(antesRaw)
    const ahora = nombresDeDependencias(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    expect(antes.length, 'el package.json del merge-base no declara dependencias').toBeGreaterThan(0)

    const anadidas = ahora.filter((nombre) => !antes.includes(nombre))
    expect(
      anadidas,
      `QC-102 R39: dependencias nuevas en esta rama: ${anadidas.join(', ')}. Ninguna entra sin los ` +
        'cuatro checks y aprobacion humana (CLAUDE.md, regla 7), y esta ficha decidio que no entra ' +
        'ninguna.',
    ).toEqual([])
  })

  it('los detectores MUERDEN: un `db/` o un `package.json` en la lista es un hallazgo', () => {
    // La red de la red: si `bajoPrefijos` dejara de ver nada, los tres casos de arriba pasarian en
    // verde sin haber mirado. Esto lo prueba sin depender de git ni de la rama.
    const lista = [
      'app/(private)/pedidos/components/order-columns.tsx',
      'db/migrations/20260913120000_lo_que_sea/migration.sql',
      'db/schema.prisma',
      'package.json',
      'packages-que-no-son-el-manifiesto.md',
    ]
    expect(bajoPrefijos(lista, ['db/'])).toEqual([
      'db/migrations/20260913120000_lo_que_sea/migration.sql',
      'db/schema.prisma',
    ])
    expect(bajoPrefijos(lista, ['package.json', 'pnpm-lock.yaml'])).toEqual(['package.json'])
    expect(bajoPrefijos(lista, ['db/', 'package.json'])).toHaveLength(3)
  })

  it('la precondicion se salta RUIDOSAMENTE fuera de esta rama, y nunca en ella', () => {
    // Lo que separa a esta guardia de las seis del baseline. Un `skip` mudo seria igual de inutil
    // que un rojo ajeno: el motivo tiene que decir que NO se ha comprobado nada.
    const enDev = preparar('dev', 'abc123')
    expect('motivo' in enDev).toBe(true)
    expect((enDev as { motivo: string }).motivo).toContain('NO ha comprobado nada')
    expect((enDev as { motivo: string }).motivo).toContain("la rama actual es 'dev'")

    const enOtraFicha = preparar('feature/QC-999-lo-que-venga', 'abc123')
    expect('motivo' in enOtraFicha).toBe(true)

    const sinRango = preparar(RAMA_DE_LA_FICHA, null)
    expect((sinRango as { motivo: string }).motivo).toContain('merge-base')

    const enLaFicha = preparar(RAMA_DE_LA_FICHA, 'abc123')
    expect(enLaFicha).toEqual({ mergeBase: 'abc123' })
  })

  it('`nombresDeDependencias` lee las dos listas y las ordena', () => {
    const pkg = JSON.stringify({
      dependencies: { zod: '^3', next: '^15' },
      devDependencies: { vitest: '^4' },
    })
    expect(nombresDeDependencias(pkg)).toEqual(['next', 'vitest', 'zod'])
    expect(nombresDeDependencias('{}')).toEqual([])
  })
})
