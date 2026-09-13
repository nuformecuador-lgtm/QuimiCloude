// QC-102 T17 — Guardia: la pantalla de pedidos CONSUME QC-87, no lo reescribe (R40).
//
// R40 dice dos cosas y las dos se comprueban aqui, sobre el CODIGO en disco y sin mirar el diff de
// nadie —la leccion de las seis entradas de `tests/baseline-rojos.json`: un limite escrito como
// censo de rama caza a la ficha siguiente, no a la propia—. Lo que se vigila es una propiedad
// permanente del repo, asi que sigue mordiendo en `dev` y en cualquier rama futura:
//
//   (a) **Las Server Actions de QC-87 se importan por su RUTA EXACTA**
//       (`@/lib/modules/asignaciones/adapters/driving/order-assignment-actions`), nunca desde el
//       barrel `@/lib/modules/asignaciones`. No es cosmetica: el contrato del modulo solo reexporta
//       `./domain` y NO puede arrastrar servidor (`guard-arquitectura-modulos`, R10), asi que
//       sacar las acciones por el barrel romperia el contrato del modulo entero, no solo el estilo
//       de este import. El barrel SI vale para los tipos (`OrderResponsible`), que es como se usa.
//
//   (b) **La pantalla no vuelve a escribir ninguna regla de QC-87.** Las cuatro que la decision
//       cerrada 12 enumera —que estados admiten asignacion, «solo cuentas `active`», «reaplicar
//       añade a los que faltan» y el congelado de personas y de nombre de grupo— viven en
//       `lib/modules/asignaciones/domain/**` y en ningun otro sitio. Se comprueba por los dos
//       lados: que la pantalla no las tenga y que el dominio SIGA teniendolas, porque «no esta en
//       la pantalla» tambien seria cierto si alguien las borrara de los dos sitios.
//
// Lo que esta guardia NO puede ver, y se dice en vez de fingir: que la pantalla no calcule «los que
// faltan» antes de asignar es una propiedad de COMPORTAMIENTO, y la prueba
// `tests/unit/pedidos-ui/assign.test.tsx` (R32) y `remove-work-group.test.tsx` (R30), que cuentan
// llamadas. Aqui solo se vigila lo que es visible en el texto del codigo.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
const PANTALLA = join(repoRoot, 'app', '(private)', 'pedidos')
const DOMINIO = join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain')

/** La ruta exacta por la que se consumen las acciones de QC-87 (R40). */
const RUTA_EXACTA = '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions'
const BARREL = '@/lib/modules/asignaciones'

/** Las cinco Server Actions del modulo: las cuatro de QC-87 mas la del lote que anade QC-102. */
const ACCIONES = [
  'assignResponsiblesAction',
  'unassignResponsibleAction',
  'removeWorkGroupFromOrderAction',
  'listOrderResponsiblesAction',
  'listResponsiblesForOrdersAction',
] as const

export type Fuente = { readonly relPath: string; readonly content: string }

/** Comentarios de LINEA primero y de BLOQUE despues, con `[^\n]` para que funcione con CRLF: el
 *  mismo orden que `guard-arquitectura-modulos`, y por la misma razon (un comentario de linea que
 *  abre bloque se traga el archivo entero y la guardia pasa en verde sin mirar nada). */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Todo bloque `import ... from 'x'` / `export ... from 'x'` como `{ clausula, especificador }`. */
export function importBlocks(source: string): ReadonlyArray<{ clause: string; specifier: string }> {
  const limpio = stripComments(source)
  const bloques: Array<{ clause: string; specifier: string }> = []
  for (const match of limpio.matchAll(/\b(?:import|export)\b([\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g)) {
    bloques.push({ clause: match[1] as string, specifier: match[2] as string })
  }
  return bloques
}

// ---------------------------------------------------------------------------
// (a) Las acciones, por su ruta exacta y nunca por el barrel
// ---------------------------------------------------------------------------

/**
 * Hallazgos de (a). Dos infracciones distintas:
 *   - sacar UNA accion del barrel del modulo;
 *   - importar el barrel con valores (no `import type`), que es lo que permitiria lo anterior.
 */
export function findActionImportFindings(files: readonly Fuente[]): readonly string[] {
  const findings: string[] = []
  for (const file of files) {
    for (const { clause, specifier } of importBlocks(file.content)) {
      if (specifier !== BARREL) continue
      const nombradas = ACCIONES.filter((accion) => new RegExp(`\\b${accion}\\b`).test(clause))
      for (const accion of nombradas) {
        findings.push(
          `${file.relPath}: importa '${accion}' desde el barrel '${BARREL}'; las Server Actions se ` +
            `consumen por su ruta exacta '${RUTA_EXACTA}' (R40)`,
        )
      }
      if (nombradas.length === 0 && !/^\s*type\b/.test(clause)) {
        findings.push(
          `${file.relPath}: importa VALORES desde el barrel '${BARREL}'; del contrato del modulo ` +
            'solo se toman tipos (`import type`), y las acciones van por su ruta exacta (R40)',
        )
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (b) La pantalla no reescribe ninguna regla de QC-87
// ---------------------------------------------------------------------------

/**
 * Señales de que una regla de QC-87 se ha vuelto a escribir en la pantalla. Cada una nombra la
 * regla concreta de la decision cerrada 12, para que el hallazgo diga QUE se ha duplicado y no solo
 * «patron prohibido».
 */
const SEÑALES: ReadonlyArray<{ readonly patron: RegExp; readonly regla: string }> = [
  {
    patron: /\baccountStatus\b|\bisActive\b|['"]active['"]/,
    regla: '«solo cuentas `active`»: quien cuenta como persona asignable lo decide `assign-responsibles.ts`',
  },
  {
    patron: /\bactiveMemberIds\b/,
    regla: '«un grupo aporta solo sus miembros activos»: lo resuelve el puerto de grupos en QC-87',
  },
  {
    patron: /\bassertOrderAcceptsWrites\b/,
    regla: 'la tabla de estados que admiten asignacion vive en `domain/order-state.ts` (QC-87 R8-R12)',
  },
  {
    patron: /@\/lib\/modules\/asignaciones\/(domain|ports)\//,
    regla: 'el dominio y los puertos de `asignaciones` no se consumen desde la pantalla: solo el contrato y las acciones',
  },
]

export function findRuleDuplicationFindings(files: readonly Fuente[]): readonly string[] {
  const findings: string[] = []
  for (const file of files) {
    const limpio = stripComments(file.content)
    for (const { patron, regla } of SEÑALES) {
      if (patron.test(limpio)) {
        findings.push(`${file.relPath}: reimplementa una regla de QC-87 — ${regla} (R40)`)
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// (b bis) ...y el dominio SIGUE teniendolas: los cuatro casos de uso, intactos
// ---------------------------------------------------------------------------

/** Los cuatro casos de uso de QC-87, con lo que cada uno tiene que seguir haciendo. */
const CASOS_DE_USO_QC87: ReadonlyArray<{
  readonly archivo: string
  readonly factory: string
  readonly exige: readonly string[]
  readonly prohibe: readonly string[]
}> = [
  {
    archivo: 'assign-responsibles.ts',
    factory: 'createAssignResponsibles',
    exige: ["requirePermission(actor, 'asignaciones.modificar')", 'assertOrderAcceptsWrites('],
    prohibe: [],
  },
  {
    archivo: 'unassign-responsible.ts',
    factory: 'createUnassignResponsible',
    exige: ["requirePermission(actor, 'asignaciones.modificar')", 'assertOrderAcceptsWrites('],
    prohibe: [],
  },
  {
    archivo: 'remove-work-group-from-order.ts',
    factory: 'createRemoveWorkGroupFromOrder',
    exige: ["requirePermission(actor, 'asignaciones.modificar')", 'assertOrderAcceptsWrites('],
    prohibe: [],
  },
  {
    // La CONSULTA no pasa por la tabla de estados (QC-87 R13): devuelve lo mismo en los cuatro.
    archivo: 'list-order-responsibles.ts',
    factory: 'createListOrderResponsibles',
    exige: ["requirePermission(actor, 'pedidos.consultar')"],
    prohibe: ['assertOrderAcceptsWrites('],
  },
]

export function findUseCaseIntegrityFindings(
  leer: (archivo: string) => string | null,
): readonly string[] {
  const findings: string[] = []
  for (const caso of CASOS_DE_USO_QC87) {
    const fuente = leer(caso.archivo)
    if (fuente === null) {
      findings.push(`lib/modules/asignaciones/domain/${caso.archivo}: el caso de uso de QC-87 ha desaparecido (R40)`)
      continue
    }
    const limpio = stripComments(fuente)
    if (!new RegExp(`export function ${caso.factory}\\b`).test(limpio)) {
      findings.push(`${caso.archivo}: ya no exporta '${caso.factory}' (R40)`)
    }
    for (const exigido of caso.exige) {
      if (!limpio.includes(exigido)) {
        findings.push(`${caso.archivo}: ya no hace '${exigido}' (R40)`)
      }
    }
    for (const prohibido of caso.prohibe) {
      if (limpio.includes(prohibido)) {
        findings.push(`${caso.archivo}: la CONSULTA no pasa por '${prohibido}' (QC-87 R13, R40)`)
      }
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Datos reales del repo
// ---------------------------------------------------------------------------

function sourcesIn(absDir: string): readonly string[] {
  if (!existsSync(absDir)) return []
  const salida: string[] = []
  for (const name of readdirSync(absDir)) {
    const full = join(absDir, name)
    if (statSync(full).isDirectory()) salida.push(...sourcesIn(full))
    else if (/\.tsx?$/.test(name)) salida.push(full)
  }
  return salida.sort()
}

const fuentesDeLaPantalla: readonly Fuente[] = sourcesIn(PANTALLA).map((file) => ({
  relPath: relative(repoRoot, file).split(sep).join('/'),
  content: readFileSync(file, 'utf8'),
}))

const leerDominio = (archivo: string): string | null => {
  try {
    return readFileSync(join(DOMINIO, archivo), 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('(a) las Server Actions de QC-87 se importan por su ruta exacta (R40)', () => {
  it('la pantalla real tiene fuentes, usa la ruta exacta y no saca ninguna accion del barrel', () => {
    expect(fuentesDeLaPantalla.length, 'no se encontro ningun fuente de la pantalla de pedidos').toBeGreaterThan(0)

    const conAcciones = fuentesDeLaPantalla.filter((file) =>
      importBlocks(file.content).some((bloque) => bloque.specifier === RUTA_EXACTA),
    )
    expect(
      conAcciones.map((file) => file.relPath).length,
      'ningun fuente de la pantalla importa las acciones por su ruta exacta: o el detector no ve ' +
        'los imports, o la pantalla dejo de consumir QC-87.',
    ).toBeGreaterThan(0)

    expect(findActionImportFindings(fuentesDeLaPantalla)).toEqual([])
  })

  it('MUERE si se muta el fuente REAL: la accion de asignar, sacada del barrel', () => {
    const panel = fuentesDeLaPantalla.find((file) => file.relPath.endsWith('components/order-responsibles.tsx'))
    expect(panel, 'no se encontro order-responsibles.tsx').toBeDefined()

    const real = panel as Fuente
    const mutado: Fuente = {
      relPath: real.relPath,
      content: real.content.replace(
        `} from '${RUTA_EXACTA}';`,
        `} from '${BARREL}';`,
      ),
    }
    expect(mutado.content).not.toBe(real.content)

    const findings = findActionImportFindings([mutado])
    expect(findings).toHaveLength(3)
    expect(findings.join(' | ')).toContain("importa 'assignResponsiblesAction' desde el barrel")
  })

  it('`import type` desde el barrel es legitimo, y un valor suelto no lo es', () => {
    const tipos: Fuente = {
      relPath: 'sintetico.tsx',
      content: `import type { OrderResponsible } from '${BARREL}';`,
    }
    expect(findActionImportFindings([tipos])).toEqual([])

    const valor: Fuente = {
      relPath: 'sintetico.tsx',
      content: `import { MAX_ORDERS_PER_BATCH } from '${BARREL}';`,
    }
    expect(findActionImportFindings([valor])).toHaveLength(1)

    // Y un comentario que nombre la accion y el barrel no es una infraccion.
    const comentario: Fuente = {
      relPath: 'sintetico.tsx',
      content: `// ojo: assignResponsiblesAction NO se importa de '${BARREL}'\nexport const x = 1;`,
    }
    expect(findActionImportFindings([comentario])).toEqual([])
  })
})

describe('(b) la pantalla no reescribe ninguna regla de QC-87 (R40)', () => {
  it('ningun fuente de la pantalla real duplica una regla del dominio', () => {
    expect(findRuleDuplicationFindings(fuentesDeLaPantalla)).toEqual([])
  })

  it('MUERE si se muta el fuente REAL: la pantalla filtrando por cuenta `active`', () => {
    const panel = fuentesDeLaPantalla.find((file) => file.relPath.endsWith('components/order-responsibles.tsx'))
    const real = panel as Fuente
    const mutado: Fuente = {
      relPath: real.relPath,
      content: real.content.replace(
        'export function OrderResponsibles(',
        "const asignables = (personas: ReadonlyArray<{ accountStatus: string }>) =>\n" +
          "  personas.filter((persona) => persona.accountStatus === 'active');\n\n" +
          'export function OrderResponsibles(',
      ),
    }
    expect(mutado.content).not.toBe(real.content)

    const findings = findRuleDuplicationFindings([mutado])
    expect(findings.join(' | ')).toContain('«solo cuentas `active`»')
  })

  it('MUERE tambien si la pantalla se trae la tabla de estados del dominio', () => {
    const panel = fuentesDeLaPantalla.find((file) => file.relPath.endsWith('components/order-responsibles.tsx'))
    const real = panel as Fuente
    const mutado: Fuente = {
      relPath: real.relPath,
      content:
        "import { assertOrderAcceptsWrites } from '@/lib/modules/asignaciones/domain/order-state';\n" +
        real.content,
    }

    const findings = findRuleDuplicationFindings([mutado])
    expect(findings).toHaveLength(2)
    expect(findings.join(' | ')).toContain('domain/order-state.ts')
    expect(findings.join(' | ')).toContain('no se consumen desde la pantalla')
  })

  it('no confunde la PROSA con la infraccion: los comentarios explican las reglas que NO duplican', () => {
    const sintetico: Fuente = {
      relPath: 'sintetico.tsx',
      content: [
        "// Aqui NO se decide quien esta 'active' ni se llama a assertOrderAcceptsWrites.",
        '/* tampoco se importa @/lib/modules/asignaciones/domain/order-state */',
        'export const x = 1;',
      ].join('\n'),
    }
    expect(findRuleDuplicationFindings([sintetico])).toEqual([])
  })
})

describe('(b bis) los cuatro casos de uso de QC-87 siguen intactos (R40)', () => {
  it('los cuatro existen, con su factory, su permiso y su tabla de estados', () => {
    expect(findUseCaseIntegrityFindings(leerDominio)).toEqual([])
  })

  it('MUERE si a un caso de uso REAL se le quita el permiso o la tabla de estados', () => {
    const real = leerDominio('unassign-responsible.ts')
    expect(real, 'no se encontro unassign-responsible.ts').not.toBeNull()

    const sinPermiso = (real as string).replace(
      "requirePermission(actor, 'asignaciones.modificar');",
      '',
    )
    expect(sinPermiso).not.toBe(real)
    const sinEstados = (real as string).replace('assertOrderAcceptsWrites(order);', '')
    expect(sinEstados).not.toBe(real)

    const leerMutado = (mutacion: string) => (archivo: string) =>
      archivo === 'unassign-responsible.ts' ? mutacion : leerDominio(archivo)

    expect(findUseCaseIntegrityFindings(leerMutado(sinPermiso))).toEqual([
      "unassign-responsible.ts: ya no hace 'requirePermission(actor, 'asignaciones.modificar')' (R40)",
    ])
    expect(findUseCaseIntegrityFindings(leerMutado(sinEstados))).toEqual([
      "unassign-responsible.ts: ya no hace 'assertOrderAcceptsWrites(' (R40)",
    ])
  })

  it('MUERE si un caso de uso desaparece, y tambien si la CONSULTA se pone a decidir estados', () => {
    const sinArchivo = (archivo: string) =>
      archivo === 'remove-work-group-from-order.ts' ? null : leerDominio(archivo)
    expect(findUseCaseIntegrityFindings(sinArchivo)).toEqual([
      'lib/modules/asignaciones/domain/remove-work-group-from-order.ts: el caso de uso de QC-87 ha desaparecido (R40)',
    ])

    const consulta = leerDominio('list-order-responsibles.ts') as string
    const conEstados = consulta.replace(
      "requirePermission(actor, 'pedidos.consultar');",
      "requirePermission(actor, 'pedidos.consultar');\n    assertOrderAcceptsWrites(order);",
    )
    expect(conEstados).not.toBe(consulta)
    const leerMutado = (archivo: string) =>
      archivo === 'list-order-responsibles.ts' ? conEstados : leerDominio(archivo)
    expect(findUseCaseIntegrityFindings(leerMutado)).toEqual([
      "list-order-responsibles.ts: la CONSULTA no pasa por 'assertOrderAcceptsWrites(' (QC-87 R13, R40)",
    ])
  })
})
