// La guardia de alcance del modulo de clientes.
//
// QC-153 la escribio cuando la ficha era SOLO el modelo, el armazon del modulo y la enmienda al
// catalogo de permisos. QC-154 (`design.md > 11`) llena el modulo con los cinco casos de uso, el
// puerto, el adaptador y la Server Action, asi que los casos que asumian un modulo vacio cambian
// -uno a uno, y se anota cual- y se anaden los propios de esta ficha (R36, R37, R38, R40). Sigue
// sin E2E (decision 7, R38 de QC-154). Se censa el ARBOL DE ARCHIVOS y el TEXTO de produccion, no
// el grafo de imports.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
const moduloDir = join(repoRoot, 'lib', 'modules', 'clientes')

function filesIn(dir: string, pattern: RegExp = /./): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

function leer(ruta: string): string {
  return readFileSync(ruta, 'utf8')
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

// ---------------------------------------------------------------------------------------------
// R20 — forma hexagonal del armazon
// ---------------------------------------------------------------------------------------------

/** El predicado real de R20: las carpetas de primer nivel, ordenadas por nombre. */
function carpetasDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

describe('R20 — el modulo clientes nace con la forma hexagonal', () => {
  it('index.ts existe y solo reexporta simbolos de ./domain', () => {
    const contrato = join(moduloDir, 'index.ts')
    expect(existsSync(contrato), 'falta lib/modules/clientes/index.ts').toBe(true)
    const codigo = stripComments(leer(contrato))
    const reexportes = (codigo.match(/from\s+['"]\.\/[^'"]+['"]/g) ?? [])
      .map((trozo) => trozo.replace(/from\s+['"]|['"]/g, ''))
      .filter((origen) => !origen.startsWith('./domain'))
    expect(
      reexportes,
      `index.ts reexporta fuera de ./domain: ${reexportes.join(', ')}`,
    ).toEqual([])
    // Y el contrato SI exporta algo: una regla que pasa en verde por vacio no vigila nada.
    expect(codigo).toMatch(/from\s+['"]\.\/domain\/customer['"]/)
  })

  it('las unicas carpetas del modulo son domain, ports y adapters', () => {
    expect(carpetasDe(moduloDir)).toEqual(['adapters', 'domain', 'ports'])

    // Sensibilidad: la MISMA funcion tiene que detectar una carpeta ajena real en disco, no un
    // array retocado en memoria.
    const fixture = mkdtempSync(join(tmpdir(), 'qc153-scope-'))
    try {
      for (const nombre of ['adapters', 'domain', 'ports', 'services']) {
        mkdirSync(join(fixture, nombre))
      }
      const conCarpetaAjena = carpetasDe(fixture)
      expect(conCarpetaAjena).toContain('services')
      expect(conCarpetaAjena).not.toEqual(['adapters', 'domain', 'ports'])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('R20 (QC-153), R35 (QC-154) — lista cerrada de archivos del modulo tras QC-154', () => {
    // QC-153 exigia "domain solo tiene customer.ts" y "ports/adapters vacios salvo .gitkeep":
    // esas dos aserciones son FALSAS a proposito desde QC-154 (`design.md > 11`), que llena el
    // armazon con los cinco casos de uso, el puerto, el adaptador y la Server Action. Lo que las
    // sustituye sigue siendo una lista CERRADA -sin ningun .gitkeep sobrante-: un archivo de mas
    // o de menos la pone roja igual que antes.
    const ARCHIVOS_ESPERADOS = [
      'adapters/driven/persistence/company-scope.ts',
      'adapters/driven/persistence/customer-prisma.ts',
      'adapters/driven/persistence/list-query-sql.ts',
      'adapters/driving/customer-actions.ts',
      'domain/actor.ts',
      'domain/create-customer.ts',
      'domain/customer-id.ts',
      'domain/customer-input.ts',
      'domain/customer-queryable.ts',
      'domain/customer-scope.ts',
      'domain/customer-text.ts',
      'domain/customer-view.ts',
      'domain/customer.ts',
      'domain/delete-customer.ts',
      'domain/errors.ts',
      'domain/get-customer.ts',
      'domain/list-customers.ts',
      'domain/list-query.ts',
      'domain/page.ts',
      'domain/update-customer.ts',
      'index.ts',
      'ports/customer-repository.ts',
      'ports/list-query-log.ts',
    ]
    const archivosReales = filesIn(moduloDir, /\.tsx?$/)
      .map((ruta) => relative(moduloDir, ruta).split(sep).join('/'))
      .sort()
    expect(archivosReales).toEqual(ARCHIVOS_ESPERADOS)
  })

  it('R20 (QC-153), R35 (QC-154) — ningun archivo alcanzable desde el contrato declara \'use server\'', () => {
    // Acotado (`design.md > 11`): antes barria TODO el modulo; desde QC-154 el modulo tiene una
    // Server Action de verdad en adapters/driving/, que SI declara 'use server', y el contrato
    // (index.ts) no la reexporta -no es "alcanzable desde el contrato"-.
    for (const archivo of filesIn(moduloDir, /\.tsx?$/)) {
      const relativa = relative(moduloDir, archivo).split(sep).join('/')
      if (relativa.startsWith('adapters/driving/')) continue
      const fuente = leer(archivo)
      const primeraLineaUtil = fuente.split('\n').find((line) => line.trim().length > 0) ?? ''
      expect(
        /^(['"])use server\1/.test(primeraLineaUtil.trim()),
        `${archivo} no puede declarar 'use server' fuera de adapters/driving/`,
      ).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// R26 — ningun CRUD, ningun caso de uso, ningun consumo de los dos permisos fuera del catalogo
// ---------------------------------------------------------------------------------------------

describe('R26 — sin alta, consulta, edicion ni baja de clientes en esta ficha', () => {
  const RAICES_DE_PRODUCCION = ['lib', 'app', 'components', 'hooks'] as const
  const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

  /** Parametrizada por raiz (real por defecto) para que la sensibilidad pueda fabricar un arbol
   *  en un tmpdir en vez de escribir dentro del repo. */
  function fuentesDeProduccion(raiz: string = repoRoot): string[] {
    const encontrados: string[] = []
    function recorrer(relativo: string): void {
      const absoluto = join(raiz, relativo)
      if (!existsSync(absoluto)) return
      for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        const hijo = `${relativo}/${entrada.name}`
        if (entrada.isDirectory()) {
          recorrer(hijo)
          continue
        }
        if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entrada.name)) encontrados.push(hijo)
      }
    }
    for (const raizProduccion of RAICES_DE_PRODUCCION) recorrer(raizProduccion)
    if (existsSync(join(raiz, 'middleware.ts'))) encontrados.push('middleware.ts')
    return encontrados.sort()
  }

  const PERMISO_YA_CUBIERTO = 'lib/modules/identity/domain/permissions.ts'

  /** Rutas de produccion donde el literal de permiso SI puede aparecer desde QC-154
   *  (`design.md > 11`): `permissions.ts`, que ya lo cubria, y `lib/modules/clientes/domain/**`,
   *  porque los cinco casos de uso nombran `'clientes.consultar'`/`'clientes.modificar'` en su
   *  primera linea (R2, R3). Cualquier OTRO archivo de produccion sigue en rojo: `app/`,
   *  `components/`, otro modulo o `adapters/` de clientes. */
  function permisoPermitidoEn(relativo: string): boolean {
    return relativo === PERMISO_YA_CUBIERTO || relativo.startsWith('lib/modules/clientes/domain/')
  }

  /** El predicado real de R26: que archivos de produccion, fuera de lo permitido, nombran los
   *  dos literales de permiso. Lo usan el caso real y los casos «que muerde». */
  function detectarLiteralesDePermiso(raiz: string = repoRoot): string[] {
    const PERMISOS_CLIENTES = /'clientes\.consultar'|'clientes\.modificar'/
    const hallazgos: string[] = []
    for (const relativo of fuentesDeProduccion(raiz)) {
      if (permisoPermitidoEn(relativo)) continue
      const fuente = stripComments(leer(join(raiz, relativo)))
      if (PERMISOS_CLIENTES.test(fuente)) hallazgos.push(relativo)
    }
    return hallazgos
  }

  it('R26 (QC-153) — el literal de los dos permisos solo aparece en permissions.ts o en lib/modules/clientes/domain', () => {
    const hallazgos = detectarLiteralesDePermiso()
    expect(
      hallazgos,
      'ningun archivo distinto de permissions.ts o de lib/modules/clientes/domain/** puede ' +
        'nombrar clientes.consultar/modificar: ' + hallazgos.join(', '),
    ).toEqual([])
  })

  it('R26 (QC-153) — adapters/driving/ contiene exactamente customer-actions.ts', () => {
    const driving = filesIn(join(moduloDir, 'adapters', 'driving'), /\.tsx?$/).map((ruta) =>
      relative(join(moduloDir, 'adapters', 'driving'), ruta).split(sep).join('/'),
    )
    expect(driving).toEqual(['customer-actions.ts'])
  })

  it('la regla de literales dispara con un archivo fabricado que si nombra el permiso', () => {
    // El MISMO detector que usa el caso real, aplicado a un archivo de produccion de verdad,
    // FUERA de lib/modules/clientes/domain/. Se fabrica en un tmpdir, nunca en el repo.
    const raiz = mkdtempSync(join(tmpdir(), 'qc154-scope-'))
    try {
      const relativoFabricado = 'lib/modules/clientes/__sensibilidad_literal__.ts'
      const rutaFabricada = join(raiz, relativoFabricado)
      mkdirSync(dirname(rutaFabricada), { recursive: true })
      writeFileSync(rutaFabricada, "export const puedeVer = (p: string) => p === 'clientes.consultar'\n")
      expect(detectarLiteralesDePermiso(raiz)).toContain(relativoFabricado)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('el caso simetrico: el mismo literal DENTRO de domain/ no dispara', () => {
    // Es justo lo que la relajacion permite: un caso de uso de verdad nombra el permiso ahi.
    const raiz = mkdtempSync(join(tmpdir(), 'qc154-scope-'))
    try {
      const relativoFabricado = 'lib/modules/clientes/domain/__sensibilidad_literal__.ts'
      const rutaFabricada = join(raiz, relativoFabricado)
      mkdirSync(dirname(rutaFabricada), { recursive: true })
      writeFileSync(rutaFabricada, "export const puedeVer = (p: string) => p === 'clientes.consultar'\n")
      expect(detectarLiteralesDePermiso(raiz)).not.toContain(relativoFabricado)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------------------------
// R28 — ningun test E2E nombra clientes
// ---------------------------------------------------------------------------------------------

describe('R28 — sin ningun test E2E de clientes', () => {
  it('ningun nombre de archivo de e2e/ menciona clientes', () => {
    const e2eDir = join(repoRoot, 'e2e')
    const coincidencias = filesIn(e2eDir)
      .map((ruta) => relative(e2eDir, ruta).split(sep).join('/'))
      .filter((relativa) => /cliente/i.test(relativa))
    expect(coincidencias, `spec E2E de clientes inesperado: ${coincidencias.join(', ')}`).toEqual([])
  })

  // "cliente" a secas es ambiguo en este repo -"componente de CLIENTE", "el cliente insertara la
  // fila"- asi que el contenido se vigila con marcadores propios del modulo, no con la palabra
  // suelta: la tabla, los dos codigos de permiso o la ruta.
  it('ningun contenido de e2e/ nombra la tabla, el permiso o la ruta de clientes', () => {
    const e2eDir = join(repoRoot, 'e2e')
    const MARCADORES_DE_CLIENTES = /\bcustomers\b|\/clientes\b|clientes\.(consultar|modificar)|['"]Clientes['"]/
    const coincidencias = filesIn(e2eDir)
      .map((ruta) => relative(e2eDir, ruta).split(sep).join('/'))
      .filter((relativa) => MARCADORES_DE_CLIENTES.test(leer(join(e2eDir, relativa))))
    expect(coincidencias, `contenido E2E de clientes inesperado: ${coincidencias.join(', ')}`).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// R29 — ninguna dependencia de terceros nueva
// ---------------------------------------------------------------------------------------------

describe('R29 — sin dependencias nuevas', () => {
  function nombresDeDependencias(packageJson: unknown): string[] {
    const pkg = packageJson as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort()
  }

  function dependenciasAnadidas(antes: readonly string[], despues: readonly string[]): string[] {
    const previas = new Set(antes)
    return despues.filter((nombre) => !previas.has(nombre)).sort()
  }

  // Comparar con `origin/dev` castigaba a cualquier rama posterior que anadiera una dependencia
  // aprobada. Lo que se protege es un hecho historico: el merge con el que el modulo entro en dev no
  // anadio dependencias. Por eso se compara ese merge con su primer padre. (2026-09-24)
  const MERGE_DE_ENTRADA = 'cf99cc2b4ae72995a26238b68ce8b89393707f8a'

  function dependenciasEn(commit: string): string[] {
    try {
      const contenido = execSync(`git show ${commit}:package.json`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 8 * 1024 * 1024,
      })
      return nombresDeDependencias(JSON.parse(contenido))
    } catch (error) {
      throw new Error(
        `no se pudo leer package.json en ${commit} (clon superficial o commit ausente), asi que este ` +
          `caso no ha comprobado nada. ${String(error)}`,
      )
    }
  }

  it('el merge de entrada del modulo no anadio ninguna clave de dependencia respecto a su primer padre', () => {
    const antes = dependenciasEn(`${MERGE_DE_ENTRADA}~1`)
    const despues = dependenciasEn(MERGE_DE_ENTRADA)
    expect(dependenciasAnadidas(antes, despues)).toEqual([])
  })

  it('la deteccion de dependencias anadidas dispara con datos fabricados', () => {
    expect(
      dependenciasAnadidas(['zod'], ['zod', 'left-pad']),
    ).toEqual(['left-pad'])
    expect(dependenciasAnadidas(['zod'], ['zod'])).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// R36 — sin aritmetica de paginacion propia
// ---------------------------------------------------------------------------------------------

describe('R36 — el modulo clientes no reimplementa el calculo de paginacion', () => {
  // Copia del detector de `tests/unit/proveedores/scope.test.ts`: `clientes` CONSUME
  // `lib/shared/pagination.ts` (`toOffsetLimit`, `buildPage`, `DEFAULT_PAGE_SIZE`,
  // `MAX_PAGE_SIZE`) y no lleva ninguna aritmetica propia de desplazamiento, limite ni total
  // de paginas.
  const SOSPECHOSOS: readonly { readonly nombre: string; readonly pattern: RegExp }[] = [
    { nombre: 'Math.ceil sobre un total (calculo de totalPages a mano)', pattern: /Math\.ceil\(\s*total\b/ },
    { nombre: '(page - 1) * algo (calculo de offset a mano)', pattern: /\(\s*page\s*-\s*1\s*\)\s*\*/ },
    { nombre: 'multiplicacion por pageSize (calculo de offset/limit a mano)', pattern: /\*\s*pageSize\b|\bpageSize\s*\*/ },
    { nombre: 'segunda declaracion del defecto o del tope de pagina', pattern: /(DEFAULT_PAGE_SIZE|MAX_PAGE_SIZE)\s*=/ },
    { nombre: 'Math.min contra un literal de tope de pagina', pattern: /Math\.min\([^)]*\b25\b/ },
  ]

  function hallazgosDePaginacion(dir: string = moduloDir): string[] {
    const hallazgos: string[] = []
    for (const archivo of filesIn(dir, /\.tsx?$/)) {
      const fuente = leer(archivo)
      for (const { nombre, pattern } of SOSPECHOSOS) {
        if (pattern.test(fuente)) hallazgos.push(`${archivo}: ${nombre}`)
      }
    }
    return hallazgos
  }

  it('R36 — lib/modules/clientes/** no reimplementa la aritmetica de paginacion', () => {
    const hallazgos = hallazgosDePaginacion()
    expect(
      hallazgos,
      `lib/modules/clientes/** parece reimplementar la aritmetica de paginacion en vez de usar ` +
        `lib/shared/pagination.ts: ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('el detector dispara con un archivo fabricado que calcula el offset a mano', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'qc154-scope-'))
    try {
      const rutaFabricada = join(raiz, 'domain', '__sensibilidad_paginacion__.ts')
      mkdirSync(dirname(rutaFabricada), { recursive: true })
      writeFileSync(rutaFabricada, 'export const offset = (page: number, pageSize: number) => (page - 1) * pageSize\n')
      expect(hallazgosDePaginacion(raiz).some((h) => h.startsWith(rutaFabricada))).toBe(true)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------------------------
// R37 (enmendado) — una sola migracion nueva, y solo los tres campos normalizados en schema.prisma
// ---------------------------------------------------------------------------------------------

describe('R37 — una sola migracion nueva y solo tres campos normalizados en Customer', () => {
  const schema = leer(join(repoRoot, 'db', 'schema.prisma'))

  // `schemaTexto` es parametrizable para que la sensibilidad pueda ejercer este MISMO predicado
  // contra un modelo fabricado en memoria, sin escribir en db/schema.prisma.
  function cuerpoDeModelo(modelo: string, schemaTexto: string = schema): string {
    const match = new RegExp(`model ${modelo} \\{([\\s\\S]*?)\\n\\}`, 'm').exec(schemaTexto)
    if (!match) throw new Error(`no se encontro "model ${modelo}" en el schema`)
    return match[1] as string
  }

  function camposDe(modelo: string, schemaTexto: string = schema): readonly string[] {
    return cuerpoDeModelo(modelo, schemaTexto)
      .split('\n')
      .map((linea) => linea.trim().replace(/\s+/g, ' '))
      .filter((linea) => linea.length > 0 && !linea.startsWith('//'))
      .map((linea) => (linea.startsWith('@@') ? linea : (linea.split(' ')[0] as string)))
  }

  it('model Customer solo gano los tres campos normalizados respecto a QC-153', () => {
    expect(camposDe('Customer')).toEqual([
      'id',
      'firstNames',
      'lastNames',
      'city',
      'phone',
      'email',
      'address',
      // F1.4: las tres unicas columnas nuevas de esta ficha.
      'firstNamesNormalized',
      'lastNamesNormalized',
      'cityNormalized',
      'companyId',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      '@@unique([companyId, id], map: "customers_company_id_id_key")',
      '@@index([createdBy], map: "customers_created_by_idx")',
      '@@index([updatedBy], map: "customers_updated_by_idx")',
      '@@map("customers")',
    ])
  })

  it('solo dos migraciones del repo tocan la tabla customers: la de QC-153 y la de esta ficha', () => {
    const migracionesDir = join(repoRoot, 'db', 'migrations')
    const tocanCustomers = readdirSync(migracionesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const sql = join(migracionesDir, entry.name, 'migration.sql')
        if (!existsSync(sql)) return false
        const sinComentarios = leer(sql)
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/--[^\n]*/g, ' ')
        return /\bcustomers\b/i.test(sinComentarios)
      })
      .map((entry) => entry.name)
      .sort()
    expect(tocanCustomers).toEqual(['20260924120000_customers', '20260924190000_customers_search_normalized'])
  })

  it('el censo de campos dispara con un campo fabricado de mas', () => {
    // Ejerce el MISMO `camposDe` que usa el caso real, contra un schema fabricado en memoria
    // (nunca contra db/schema.prisma), para que un campo de mas de verdad se cuele en el censo.
    const schemaFabricado = 'model Customer {\n  id String\n  extra String\n}\n'
    const campos = camposDe('Customer', schemaFabricado)
    expect(campos).toEqual(['id', 'extra'])
    expect(campos).not.toEqual(camposDe('Customer'))
  })
})

// ---------------------------------------------------------------------------------------------
// R38 — nada bajo app/ que nombre clientes
// ---------------------------------------------------------------------------------------------

describe('R38 — nada bajo app/ que nombre clientes', () => {
  const MARCADORES_DE_CLIENTES = /\bcustomers\b|\/clientes\b|clientes\.(consultar|modificar)|['"]Clientes['"]/

  function coincidenciasEnApp(appDir: string = join(repoRoot, 'app')): string[] {
    return filesIn(appDir)
      .map((ruta) => relative(appDir, ruta).split(sep).join('/'))
      .filter((relativa) => /cliente/i.test(relativa) || MARCADORES_DE_CLIENTES.test(leer(join(appDir, relativa))))
  }

  it('ningun archivo de app/ nombra ni el nombre, ni la tabla, ni el permiso ni la ruta de clientes', () => {
    const coincidencias = coincidenciasEnApp()
    expect(coincidencias, `archivo de app/ con marca de clientes inesperada: ${coincidencias.join(', ')}`).toEqual([])
  })

  it('el detector dispara con una pantalla fabricada que nombra la ruta de clientes', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'qc154-scope-'))
    try {
      const relativoFabricado = '__sensibilidad_clientes__/page.tsx'
      const rutaFabricada = join(appDir, relativoFabricado)
      mkdirSync(dirname(rutaFabricada), { recursive: true })
      writeFileSync(rutaFabricada, "export default function Pagina() { return <a href=\"/clientes\">Clientes</a> }\n")
      expect(coincidenciasEnApp(appDir)).toContain(relativoFabricado)
    } finally {
      rmSync(appDir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------------------------
// R40 — clientes no nombra pedidos, ni pedidos nombra clientes
// ---------------------------------------------------------------------------------------------

describe('R40 — clientes no nombra pedidos ni pedidos nombra clientes', () => {
  const PEDIDOS_DIR = join(repoRoot, 'lib', 'modules', 'pedidos')

  /** Especificador de import de otro modulo, sea barrel o ruta profunda: `@/lib/modules/<x>`. */
  function importaModulo(fuente: string, modulo: string): boolean {
    return new RegExp(`@/lib/modules/${modulo}\\b`).test(fuente)
  }

  function hallazgosDeAcoplamiento(
    modDir: string = moduloDir,
    pedidosDir: string = PEDIDOS_DIR,
  ): string[] {
    const hallazgos: string[] = []
    for (const archivo of filesIn(modDir, /\.tsx?$/)) {
      if (importaModulo(leer(archivo), 'pedidos')) hallazgos.push(archivo)
    }
    for (const archivo of filesIn(pedidosDir, /\.tsx?$/)) {
      if (importaModulo(leer(archivo), 'clientes')) hallazgos.push(archivo)
    }
    return hallazgos
  }

  it('ningun archivo de clientes importa pedidos, y ninguno de pedidos importa clientes', () => {
    const hallazgos = hallazgosDeAcoplamiento()
    expect(hallazgos, `acoplamiento entre clientes y pedidos: ${hallazgos.join(', ')}`).toEqual([])
  })

  it('el detector dispara con un import fabricado de pedidos desde clientes', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'qc154-scope-'))
    try {
      const rutaFabricada = join(raiz, 'domain', '__sensibilidad_pedidos__.ts')
      mkdirSync(dirname(rutaFabricada), { recursive: true })
      writeFileSync(rutaFabricada, "import type { Order } from '@/lib/modules/pedidos'\nexport type { Order }\n")
      expect(hallazgosDeAcoplamiento(raiz, PEDIDOS_DIR)).toContain(rutaFabricada)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

})

// ---------------------------------------------------------------------------------------------
// Sello contra la regresion de B2: ningun fabricado de este archivo escribe en el arbol real.
// ---------------------------------------------------------------------------------------------

describe('este propio archivo no escribe fabricados dentro del repo', () => {
  it('ningun writeFileSync/mkdirSync apunta a repoRoot o moduloDir sin pasar por un tmpdir', () => {
    const propioArchivo = fileURLToPath(import.meta.url)
    const fuente = stripComments(leer(propioArchivo))
    const escrituraFueraDeTmp = /(writeFileSync|mkdirSync)\(\s*join\(\s*(repoRoot|moduloDir)\b/
    expect(
      escrituraFueraDeTmp.test(fuente),
      'un writeFileSync/mkdirSync de este archivo apunta directo a repoRoot/moduloDir en vez de a un mkdtempSync',
    ).toBe(false)
  })
})
