// QC-71 T5 — Guardia: el identificador de peticion no se desborda (R9, R19, R20, R21) y el
// suelo sobre el que se apoya no cambia sin que nadie mire (`design.md > 3.2`).
//
// Misma forma que `guard-arquitectura-modulos.test.ts` y `guard-catalogo-de-errores.test.ts`:
// funciones puras EXPORTADAS que reciben lo leido del disco y devuelven hallazgos, mas un caso
// que las alimenta con el repositorio real. Cada comprobacion trae ademas su caso ROJO
// sintetico: un `expect(hallazgos).toEqual([])` sobre el repo real, solo, no demuestra que la
// regla dispare (`docs/verification.md > Probar que muerde`).
//
// Lo que NO comprueba: que el cruce borde -> Server Action funcione. Eso no es una propiedad del
// codigo fuente. Lo cubren, en tres niveles, `tests/unit/identity/route-guard-request-id.test.ts`
// (la respuesta del middleware), el `origen=respaldo` de R8 como senal de campo, y la
// comprobacion manual registrada en `progress/impl_QC-71-identificador-de-request.md`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
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

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

// ---------------------------------------------------------------------------
// 1. Centinela de version de Next (`design.md > 3.2`)
// ---------------------------------------------------------------------------
//
// El mecanismo con el que `NextResponse.next({ request: { headers } })` transporta las cabeceras
// reescritas —`x-middleware-override-headers` y `x-middleware-request-<nombre>`— es INTERNO de
// Next y puede cambiar de forma en cualquier actualizacion. Esta guardia no comprueba que
// funcione: comprueba que nadie cambie el suelo sin volver a mirar.

/** Version de `next` contra la que se verifico A MANO el mecanismo, y cuando. */
export const VERSION_DE_NEXT_VERIFICADA = '16.3.0'
export const FECHA_DE_LA_VERIFICACION = '2026-09-10'

export function hallazgosDeVersionDeNext(
  versionDeclarada: string,
  versionVerificada: string,
): readonly string[] {
  if (versionDeclarada === versionVerificada) return []
  return [
    `next paso de ${versionVerificada} (verificada a mano el ${FECHA_DE_LA_VERIFICACION}) a ` +
      `${versionDeclarada}. El transporte de la peticion reescrita ` +
      "('x-middleware-override-headers' + 'x-middleware-request-x-request-id') es interno de " +
      'Next. REPITE la comprobacion manual de progress/impl_QC-71-identificador-de-request.md ' +
      '(build + start, provocar un error inesperado, comparar el id de la pantalla con el de la ' +
      'linea de log) y actualiza VERSION_DE_NEXT_VERIFICADA con su fecha.',
  ]
}

// ---------------------------------------------------------------------------
// 2. R21 — ni un archivo nuevo en `e2e/`, y el test que lo sustituye existe
// ---------------------------------------------------------------------------
//
// La comparacion es contra una LISTA CERRADA declarada aqui, no contra un rango de git a
// proposito: una guardia que se apoya en `git diff origin/dev...HEAD` falla en `dev`, donde el
// rango esta vacio, y de eso ya hay dos entradas conocidas en `tests/baseline-rojos.json`. La
// lista se lee del disco una vez y se escribe aqui; si alguien anade un `.spec.ts`, esto se pone
// rojo y hay que reabrir la decision cerrada, que es justo lo que se quiere.
export const E2E_ESPERADOS = [
  'errores.spec.ts',
  'inventario.spec.ts',
  'login-skin.spec.ts',
  'login.spec.ts',
  'pedidos.spec.ts',
  'permisos.spec.ts',
  'presentaciones.spec.ts',
  'proveedores.spec.ts',
  'recetas-pasos.spec.ts',
  'recetas.spec.ts',
  'session.spec.ts',
  'theme.spec.ts',
  'unidades.spec.ts',
] as const

/** El test de unidad que R21 exige a cambio del E2E diferido. */
export const TEST_DEL_CRUCE = 'tests/unit/identity/route-guard-request-id.test.ts'

export function hallazgosDeE2e(
  actuales: readonly string[],
  esperados: readonly string[],
): readonly string[] {
  const conocidos = new Set(esperados)
  return [...actuales]
    .filter((archivo) => !conocidos.has(archivo))
    .sort()
    .map(
      (archivo) =>
        `e2e/${archivo}: archivo nuevo en e2e/. QC-71 difirio el E2E con motivo (R21): el ` +
        `cruce borde -> accion se prueba en ${TEST_DEL_CRUCE}. Si de verdad hace falta un E2E, ` +
        'es otra ficha y otra decision.',
    )
}

export function hallazgosDelTestDelCruce(existe: boolean): readonly string[] {
  if (existe) return []
  return [
    `${TEST_DEL_CRUCE}: falta el test que sustituye al E2E diferido (R21). Sin el, la ficha se ` +
      'queda sin ninguna prueba del cruce borde -> Server Action.',
  ]
}

// ---------------------------------------------------------------------------
// 3. R19 — el identificador no se persiste
// ---------------------------------------------------------------------------

/** Migraciones que existen en el arbol donde se escribio esta guardia (lista cerrada). */
export const MIGRACIONES_ESPERADAS = [
  '20260806122638_users_and_roles',
  '20260901220609_user_login_lockout',
  '20260902005510_products_and_presentations',
  '20260902132253_user_must_change_credential',
  '20260902163256_recipes_and_recipe_lines',
  '20260902170759_product_audit_and_presentation_uniqueness',
  '20260903121404_units_catalog',
  '20260903131417_suppliers_and_supplier_catalog_lines',
  '20260903191204_orders',
  '20260903200000_product_image_path',
  '20260903200343_supplier_contact_cost_and_line_audit',
  '20260904123854_split_product_and_supplier_catalog',
  '20260904135210_order_cancellation',
  '20260904160000_list_query_indexes',
  '20260904180600_companies_and_user_company',
  '20260904181500_recipe_steps_reset',
  '20260907120000_orders_drop_unit_and_unit_price',
  '20260907183034_permissions_and_role_permissions',
  '20260907190000_units_equivalence_and_scope',
  '20260908190002_user_account_status',
  '20260908210000_work_groups_and_members',
  '20260909120000_product_batches',
] as const

export function hallazgosDeMigraciones(
  actuales: readonly string[],
  esperadas: readonly string[],
): readonly string[] {
  const conocidas = new Set(esperadas)
  return [...actuales]
    .filter((nombre) => !conocidas.has(nombre))
    .sort()
    .map(
      (nombre) =>
        `db/migrations/${nombre}: migracion nueva. QC-71 no persiste el identificador y no ` +
        'toca db/ (R19). Si esta migracion es de otra ficha, esa ficha actualiza esta lista.',
    )
}

/** Terminos con los que el identificador se nombra en el codigo. */
export const TERMINOS_DEL_IDENTIFICADOR = [
  'x-request-id',
  'requestId',
  'newRequestId',
  'REQUEST_ID_HEADER',
] as const

export function hallazgosDeSchema(schemaSource: string): readonly string[] {
  const encontrados = TERMINOS_DEL_IDENTIFICADOR.filter((termino) =>
    schemaSource.toLowerCase().includes(termino.toLowerCase()),
  )
  return encontrados.map(
    (termino) =>
      `db/schema.prisma menciona '${termino}': el identificador de peticion no se guarda en ` +
      'ninguna tabla (R19). Vive en la peticion y en la linea de log, y nada mas.',
  )
}

// ---------------------------------------------------------------------------
// 4. R20 — `package.json` no gana ni una dependencia
// ---------------------------------------------------------------------------
//
// Que TODA dependencia tenga su fila en `docs/dependencias.md` ya lo cubre
// `guard-dependencias-aprobadas.test.ts`. Aqui se afirma lo especifico de esta ficha: que el
// conteo no se movio y que nadie colo una libreria de identificadores. `crypto.randomUUID()` es
// un global; no hay nada que instalar.
export const DEPENDENCIAS_ESPERADAS = 30
export const DEV_DEPENDENCIAS_ESPERADAS = 20

/** Fragmentos que delatan una libreria de identificadores o de criptografia. */
export const FRAGMENTOS_PROHIBIDOS = ['uuid', 'nanoid', 'cuid', 'crypto'] as const

export function hallazgosDeDependencias(
  dependencias: readonly string[],
  devDependencias: readonly string[],
): readonly string[] {
  const findings: string[] = []

  if (dependencias.length !== DEPENDENCIAS_ESPERADAS) {
    findings.push(
      `package.json declara ${dependencias.length} dependencies y se esperaban ` +
        `${DEPENDENCIAS_ESPERADAS}: QC-71 no anade ninguna (R20).`,
    )
  }
  if (devDependencias.length !== DEV_DEPENDENCIAS_ESPERADAS) {
    findings.push(
      `package.json declara ${devDependencias.length} devDependencies y se esperaban ` +
        `${DEV_DEPENDENCIAS_ESPERADAS}: QC-71 no anade ninguna (R20).`,
    )
  }
  for (const nombre of [...dependencias, ...devDependencias].sort()) {
    for (const fragmento of FRAGMENTOS_PROHIBIDOS) {
      if (nombre.toLowerCase().includes(fragmento)) {
        findings.push(
          `package.json declara '${nombre}': el identificador sale del global ` +
            'crypto.randomUUID(), sin ninguna libreria (R2, R20).',
        )
      }
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// 5. R9 acotado — el identificador no atraviesa el contrato de ningun modulo de negocio
// ---------------------------------------------------------------------------
//
// **`errores` y `observabilidad` quedan FUERA de este barrido a proposito: son sus dos duenos
// legitimos.** `observabilidad/domain/request-id.ts` es donde el `design.md > 1` coloca la regla,
// y `errores/domain/error-state.ts` es el traductor que lo recoge. Leer R9 al pie de la letra
// —«ni aparece en `lib/modules/*/domain/**`»— prohibiria el propio diseno; lo que R9 protege es
// que el identificador no entre hacia adentro de los modulos DE NEGOCIO. Esta lectura acotada la
// fijo T1 y esta escrita en `progress/impl_QC-71-identificador-de-request.md > T1`, hallazgo 4.
export const MODULOS_DE_NEGOCIO = [
  'identity',
  'inventario',
  'pedidos',
  'proveedores',
  'recetas',
  'unidades',
] as const

/** Los ocho modulos, para la comprobacion de «ningun puerto nuevo». */
export const TODOS_LOS_MODULOS = [...MODULOS_DE_NEGOCIO, 'errores', 'observabilidad'] as const

export type ArchivoLeido = { readonly relPath: string; readonly source: string }

export function hallazgosDeAislamiento(archivos: readonly ArchivoLeido[]): readonly string[] {
  const findings: string[] = []
  for (const { relPath, source } of archivos) {
    for (const termino of TERMINOS_DEL_IDENTIFICADOR) {
      if (source.includes(termino)) {
        findings.push(
          `${relPath} menciona '${termino}': el identificador no atraviesa el contrato de un ` +
            'modulo de negocio hacia adentro (R9). Se queda en el borde y en la capa que ' +
            'traduce los errores.',
        )
      }
    }
  }
  return findings
}

export function hallazgosDePuertoNuevo(rutasDePuertos: readonly string[]): readonly string[] {
  return [...rutasDePuertos]
    .filter((relPath) => /request[-_]?id/i.test(relPath))
    .sort()
    .map(
      (relPath) =>
        `${relPath}: ningun modulo declara un puerto para el identificador (R9). La decision ` +
        'cerrada lo dice con su precedente: el puerto ListQueryLog de QC-57 acabo declarado ' +
        'cinco veces para una sola implementacion.',
    )
}

// ---------------------------------------------------------------------------
// Lectura del repositorio real
// ---------------------------------------------------------------------------

function listarDirectorio(absPath: string): readonly string[] {
  try {
    return readdirSync(absPath)
  } catch {
    return []
  }
}

function listarArchivosFuente(absDir: string, relDir: string): readonly ArchivoLeido[] {
  const archivos: ArchivoLeido[] = []
  for (const nombre of listarDirectorio(absDir)) {
    const abs = join(absDir, nombre)
    const rel = `${relDir}/${nombre}`
    if (statSync(abs).isDirectory()) {
      archivos.push(...listarArchivosFuente(abs, rel))
    } else if (/\.tsx?$/.test(nombre)) {
      archivos.push({ relPath: toPosix(rel), source: readFileSync(abs, 'utf8') })
    }
  }
  return archivos
}

function existeArchivo(relPath: string): boolean {
  try {
    return statSync(join(repoRoot, relPath)).isFile()
  } catch {
    return false
  }
}

function packageJson(): {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
}

describe('guardia: el identificador de peticion, sobre el repositorio real', () => {
  it('la version de next es la que se verifico a mano (design.md > 3.2)', () => {
    const pkg = packageJson()
    const versionDeclarada = pkg.dependencies?.next ?? '(ausente)'

    expect(hallazgosDeVersionDeNext(versionDeclarada, VERSION_DE_NEXT_VERIFICADA)).toEqual([])
  })

  it('no hay ningun archivo nuevo en e2e/ y existe el test que lo sustituye (R21)', () => {
    const actuales = listarDirectorio(join(repoRoot, 'e2e')).filter((n) => n.endsWith('.spec.ts'))

    expect(hallazgosDeE2e(actuales, E2E_ESPERADOS)).toEqual([])
    expect(hallazgosDelTestDelCruce(existeArchivo(TEST_DEL_CRUCE))).toEqual([])
  })

  it('db/ no gana ni una migracion ni una mencion al identificador (R19)', () => {
    const migraciones = listarDirectorio(join(repoRoot, 'db', 'migrations')).filter((nombre) =>
      statSync(join(repoRoot, 'db', 'migrations', nombre)).isDirectory(),
    )
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    expect(hallazgosDeMigraciones(migraciones, MIGRACIONES_ESPERADAS)).toEqual([])
    expect(hallazgosDeSchema(schema)).toEqual([])
  })

  it('package.json no gana ninguna dependencia, ni una libreria de identificadores (R20)', () => {
    const pkg = packageJson()

    expect(
      hallazgosDeDependencias(
        Object.keys(pkg.dependencies ?? {}),
        Object.keys(pkg.devDependencies ?? {}),
      ),
    ).toEqual([])
  })

  it('ningun domain/ ni ports/ de los modulos de negocio menciona el identificador (R9)', () => {
    const archivos: ArchivoLeido[] = []
    for (const modulo of MODULOS_DE_NEGOCIO) {
      for (const carpeta of ['domain', 'ports']) {
        archivos.push(
          ...listarArchivosFuente(
            join(repoRoot, 'lib', 'modules', modulo, carpeta),
            `lib/modules/${modulo}/${carpeta}`,
          ),
        )
      }
    }

    // Si esto quedara vacio, el `toEqual([])` de abajo seria un falso verde.
    expect(archivos.length).toBeGreaterThan(20)
    expect(hallazgosDeAislamiento(archivos)).toEqual([])
  })

  it('ninguno de los ocho modulos declara un puerto para el identificador (R9)', () => {
    const puertos: string[] = []
    for (const modulo of TODOS_LOS_MODULOS) {
      for (const nombre of listarDirectorio(join(repoRoot, 'lib', 'modules', modulo, 'ports'))) {
        puertos.push(`lib/modules/${modulo}/ports/${nombre}`)
      }
    }

    expect(hallazgosDePuertoNuevo(puertos)).toEqual([])
  })
})

describe('guardia: casos sinteticos -- cada comprobacion, con su rojo y su verde', () => {
  it('el centinela dispara cuando next cambia de version, y calla cuando no', () => {
    const rojo = hallazgosDeVersionDeNext('16.4.0', '16.3.0')

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('REPITE la comprobacion manual')
    expect(rojo[0]).toContain('progress/impl_QC-71-identificador-de-request.md')
    expect(hallazgosDeVersionDeNext('16.3.0', '16.3.0')).toEqual([])
  })

  it('e2e/: un .spec.ts nuevo se caza; los de siempre no', () => {
    const rojo = hallazgosDeE2e([...E2E_ESPERADOS, 'request-id.spec.ts'], E2E_ESPERADOS)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('e2e/request-id.spec.ts')
    expect(hallazgosDeE2e(E2E_ESPERADOS, E2E_ESPERADOS)).toEqual([])
    // Y borrar un E2E existente no es lo que esta regla vigila: no produce hallazgo.
    expect(hallazgosDeE2e(['login.spec.ts'], E2E_ESPERADOS)).toEqual([])
  })

  it('el test que sustituye al E2E: si falta, hallazgo; si esta, ninguno', () => {
    expect(hallazgosDelTestDelCruce(false)).toHaveLength(1)
    expect(hallazgosDelTestDelCruce(true)).toEqual([])
  })

  it('db/: una migracion nueva se caza; la lista intacta no', () => {
    const rojo = hallazgosDeMigraciones(
      [...MIGRACIONES_ESPERADAS, '20260911000000_request_log'],
      MIGRACIONES_ESPERADAS,
    )

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('20260911000000_request_log')
    expect(hallazgosDeMigraciones(MIGRACIONES_ESPERADAS, MIGRACIONES_ESPERADAS)).toEqual([])
  })

  it('db/schema.prisma: una columna con el identificador se caza; el schema sin el, no', () => {
    const rojo = hallazgosDeSchema('model ErrorLog {\n  requestId String\n}')

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('requestId')
    expect(hallazgosDeSchema('model Product {\n  id String @id\n}')).toEqual([])
  })

  it('package.json: una libreria de uuid se caza aunque el conteo cuadre', () => {
    const conUuid = Array.from({ length: DEPENDENCIAS_ESPERADAS - 1 }, (_, i) => `paquete-${i}`)
    conUuid.push('uuid')
    const dev = Array.from({ length: DEV_DEPENDENCIAS_ESPERADAS }, (_, i) => `dev-${i}`)

    const rojo = hallazgosDeDependencias(conUuid, dev)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain("declara 'uuid'")
    // Y el simetrico: mismo conteo, ningun nombre delator.
    const limpias = Array.from({ length: DEPENDENCIAS_ESPERADAS }, (_, i) => `paquete-${i}`)
    expect(hallazgosDeDependencias(limpias, dev)).toEqual([])
  })

  it('package.json: una dependencia de mas se caza aunque su nombre sea inocente', () => {
    const dev = Array.from({ length: DEV_DEPENDENCIAS_ESPERADAS }, (_, i) => `dev-${i}`)
    const unaDeMas = Array.from({ length: DEPENDENCIAS_ESPERADAS + 1 }, (_, i) => `paquete-${i}`)

    const rojo = hallazgosDeDependencias(unaDeMas, dev)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain(`declara ${DEPENDENCIAS_ESPERADAS + 1} dependencies`)
    // Y tambien una devDependency de mas, que es el agujero por el que suelen entrar.
    expect(
      hallazgosDeDependencias(
        Array.from({ length: DEPENDENCIAS_ESPERADAS }, (_, i) => `paquete-${i}`),
        [...dev, 'dev-extra'],
      ),
    ).toHaveLength(1)
  })

  it('R9: un domain/ que nombra el identificador se caza, en cualquiera de sus cuatro formas', () => {
    const rojo = hallazgosDeAislamiento([
      {
        relPath: 'lib/modules/pedidos/domain/create-order.ts',
        source: 'export function crear(requestId: string) { return requestId }',
      },
      {
        relPath: 'lib/modules/inventario/ports/product-repository.ts',
        source: "const cabecera = 'x-request-id'",
      },
      {
        relPath: 'lib/modules/recetas/domain/recipe.ts',
        source: "import { newRequestId } from '@/lib/modules/observabilidad'",
      },
      {
        relPath: 'lib/modules/unidades/domain/unit.ts',
        source: "import { REQUEST_ID_HEADER } from '@/lib/modules/observabilidad'",
      },
    ])

    expect(rojo).toHaveLength(4)
    expect(rojo[0]).toContain('lib/modules/pedidos/domain/create-order.ts')
    // El simetrico: los mismos archivos sin el identificador no producen nada.
    expect(
      hallazgosDeAislamiento([
        { relPath: 'lib/modules/pedidos/domain/create-order.ts', source: 'export const x = 1' },
      ]),
    ).toEqual([])
  })

  it('R9: un puerto nuevo para el identificador se caza, se llame como se llame', () => {
    const rojo = hallazgosDePuertoNuevo([
      'lib/modules/pedidos/ports/request-id-provider.ts',
      'lib/modules/identity/ports/RequestIdReader.ts',
      'lib/modules/inventario/ports/product-repository.ts',
    ])

    expect(rojo).toHaveLength(2)
    expect(hallazgosDePuertoNuevo(['lib/modules/inventario/ports/product-repository.ts'])).toEqual(
      [],
    )
  })
})
