// T10 — la guardia de alcance de QC-153 (modelo-de-clientes). Cubre R20, R26, R28, R29.
//
// Esta ficha es SOLO el modelo, el armazon del modulo y la enmienda al catalogo de permisos: sin
// caso de uso, sin puerto con metodos, sin adaptador, sin Server Action, sin ruta, sin pantalla y
// sin E2E. Eso es QC-154 y QC-155. Se censa el ARBOL DE ARCHIVOS y el TEXTO de produccion, no el
// grafo de imports.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
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
    const entries = readdirSync(moduloDir, { withFileTypes: true })
    const carpetas = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    expect([...carpetas].sort()).toEqual(['adapters', 'domain', 'ports'])

    // Sensibilidad: una carpeta ajena tiene que aparecer en el censo real si alguien la crea.
    const conCarpetaAjena = [...carpetas, 'services']
    expect([...conCarpetaAjena].sort()).not.toEqual(['adapters', 'domain', 'ports'])
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

  it('el literal de los dos permisos solo aparece en permissions.ts', () => {
    const PERMISOS_CLIENTES = /'clientes\.consultar'|'clientes\.modificar'/
    const hallazgos: string[] = []
    for (const relativo of fuentesDeProduccion()) {
      if (relativo === 'lib/modules/identity/domain/permissions.ts') continue
      const fuente = stripComments(leer(join(repoRoot, relativo)))
      if (PERMISOS_CLIENTES.test(fuente)) hallazgos.push(relativo)
    }
    expect(
      hallazgos,
      `ningun archivo distinto de permissions.ts puede nombrar clientes.consultar/modificar: ${hallazgos.join(', ')}`,
    ).toEqual([])
  })

  it('adapters/driving/ esta vacio: ningun caso de uso ni Server Action todavia', () => {
    const driving = filesIn(join(moduloDir, 'adapters', 'driving'), /\.tsx?$/)
    expect(driving, 'no puede haber ningun archivo en adapters/driving/ en esta ficha').toEqual([])
  })

  it('la regla de literales dispara con un archivo fabricado que si nombra el permiso', () => {
    const fabricado = "export const puedeVer = (p: string) => p === 'clientes.consultar'"
    expect(/'clientes\.consultar'|'clientes\.modificar'/.test(fabricado)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// R28 — ningun test E2E nombra clientes
// ---------------------------------------------------------------------------------------------

describe('R28 — sin ningun test E2E de clientes', () => {
  it('ningun archivo de e2e/ menciona clientes', () => {
    const e2eDir = join(repoRoot, 'e2e')
    const coincidencias = filesIn(e2eDir)
      .map((ruta) => relative(e2eDir, ruta).split(sep).join('/'))
      .filter((relativa) => /cliente/i.test(relativa))
    expect(coincidencias, `spec E2E de clientes inesperado: ${coincidencias.join(', ')}`).toEqual([])
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

  function mergeBaseConDev(): string | null {
    try {
      return execSync('git merge-base origin/dev HEAD', {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return null
    }
  }

  it('package.json no gano ninguna clave de dependencia contra el merge-base con origin/dev', () => {
    const base = mergeBaseConDev()
    if (base === null) {
      // Sin remoto o sin rango: no hay nada que medir. Saltar explicitamente, no pasar en verde
      // por vacio (leccion de qc75-convenciones.test.ts).
      return
    }
    let anterior: string | null
    try {
      anterior = execSync(`git show ${base}:package.json`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 8 * 1024 * 1024,
      })
    } catch {
      anterior = null
    }
    if (anterior === null) return

    const antes = nombresDeDependencias(JSON.parse(anterior))
    const actual = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    const despues = nombresDeDependencias(actual)
    expect(dependenciasAnadidas(antes, despues)).toEqual([])
  })

  it('la deteccion de dependencias anadidas dispara con datos fabricados', () => {
    expect(
      dependenciasAnadidas(['zod'], ['zod', 'left-pad']),
    ).toEqual(['left-pad'])
    expect(dependenciasAnadidas(['zod'], ['zod'])).toEqual([])
  })
})
