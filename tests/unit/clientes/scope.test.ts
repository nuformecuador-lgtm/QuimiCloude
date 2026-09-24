// La guardia de alcance del modelo de clientes.
//
// Esta ficha es SOLO el modelo, el armazon del modulo y la enmienda al catalogo de permisos: sin
// caso de uso, sin puerto con metodos, sin adaptador, sin Server Action, sin ruta, sin pantalla y
// sin E2E. Eso llega mas adelante. Se censa el ARBOL DE ARCHIVOS y el TEXTO de produccion, no el
// grafo de imports.

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

  it('ports y adapters estan vacios salvo su .gitkeep: ningun caso de uso, puerto ni adaptador todavia', () => {
    for (const carpeta of ['ports', 'adapters']) {
      const contenido = filesIn(join(moduloDir, carpeta))
      expect(
        contenido.map((ruta) => relative(moduloDir, ruta)),
        `${carpeta} deberia estar vacia salvo .gitkeep`,
      ).toEqual([join(carpeta, '.gitkeep')])
    }
    // domain solo tiene el tipo, sin caso de uso.
    const domainFiles = filesIn(join(moduloDir, 'domain'), /\.tsx?$/)
    expect(domainFiles.map((ruta) => relative(moduloDir, ruta))).toEqual([join('domain', 'customer.ts')])
  })

  it('ningun archivo alcanzable desde el contrato declara \'use server\'', () => {
    for (const archivo of filesIn(moduloDir, /\.tsx?$/)) {
      const fuente = leer(archivo)
      const primeraLineaUtil = fuente.split('\n').find((line) => line.trim().length > 0) ?? ''
      expect(
        /^(['"])use server\1/.test(primeraLineaUtil.trim()),
        `${archivo} no puede declarar 'use server' en esta ficha`,
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

  function fuentesDeProduccion(): string[] {
    const encontrados: string[] = []
    function recorrer(relativo: string): void {
      const absoluto = join(repoRoot, relativo)
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
    for (const raiz of RAICES_DE_PRODUCCION) recorrer(raiz)
    if (existsSync(join(repoRoot, 'middleware.ts'))) encontrados.push('middleware.ts')
    return encontrados.sort()
  }

  const PERMISO_YA_CUBIERTO = 'lib/modules/identity/domain/permissions.ts'

  /** El predicado real de R26: que archivos de produccion, fuera de permissions.ts, nombran los
   *  dos literales de permiso. Lo usan el caso real y el caso «que muerde». */
  function detectarLiteralesDePermiso(): string[] {
    const PERMISOS_CLIENTES = /'clientes\.consultar'|'clientes\.modificar'/
    const hallazgos: string[] = []
    for (const relativo of fuentesDeProduccion()) {
      if (relativo === PERMISO_YA_CUBIERTO) continue
      const fuente = stripComments(leer(join(repoRoot, relativo)))
      if (PERMISOS_CLIENTES.test(fuente)) hallazgos.push(relativo)
    }
    return hallazgos
  }

  it('el literal de los dos permisos solo aparece en permissions.ts', () => {
    const hallazgos = detectarLiteralesDePermiso()
    expect(
      hallazgos,
      'ningun archivo distinto de permissions.ts puede nombrar clientes.consultar/modificar ' +
        '(QC-154 relaja esta regla al consumir los permisos): ' +
        hallazgos.join(', '),
    ).toEqual([])
  })

  it('adapters/driving/ esta vacio: ningun caso de uso ni Server Action todavia', () => {
    const driving = filesIn(join(moduloDir, 'adapters', 'driving'), /\.tsx?$/)
    expect(
      driving,
      'no puede haber ningun archivo en adapters/driving/ en esta ficha (QC-154 relaja esta regla al consumir los permisos)',
    ).toEqual([])
  })

  it('la regla de literales dispara con un archivo fabricado que si nombra el permiso', () => {
    // El MISMO detector que usa el caso real, aplicado a un archivo de produccion de verdad.
    const relativoFabricado = 'lib/modules/clientes/__sensibilidad_literal__.ts'
    const rutaFabricada = join(repoRoot, relativoFabricado)
    writeFileSync(rutaFabricada, "export const puedeVer = (p: string) => p === 'clientes.consultar'\n")
    try {
      expect(detectarLiteralesDePermiso()).toContain(relativoFabricado)
    } finally {
      rmSync(rutaFabricada)
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
