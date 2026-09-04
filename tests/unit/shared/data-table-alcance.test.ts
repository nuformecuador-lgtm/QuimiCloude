// Cobertura de alcance de QC-55: R31, R33, R34, R35, R1 (imports por barrel), R36.
//
// Archivo SIN DOM (`.test.ts`, proyecto `node` de Vitest): recorre el arbol de archivos con
// `node:fs`/`node:path`, al estilo de `tests/guards/guard-dependencias-aprobadas.test.ts`. No
// monta nada ni importa React: lo que verifica es DONDE viven los archivos y QUE se importa
// desde donde, no como se comporta el componente (eso va en `data-table-contrato.test.tsx`).

import { readFileSync, readdirSync, statSync } from 'node:fs'
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
const DATA_TABLE_DIR = join(repoRoot, 'components', 'shared', 'data-table')

/** Directorios que nunca se recorren: dependencias, artefactos de build y otros worktrees. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.worktrees', 'dist', 'coverage'])

const CODE_EXTENSIONS = ['.ts', '.tsx']

/** Recorre `dir` recursivamente y devuelve las rutas absolutas de los archivos de codigo. */
function walkCodeFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...walkCodeFiles(full))
    } else if (CODE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

function readSource(path: string): string {
  return readFileSync(path, 'utf-8')
}

function pkgJson(): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
  return JSON.parse(readSource(join(repoRoot, 'package.json'))) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
}

describe('Alcance QC-55: dependencias (R31)', () => {
  const pkg = pkgJson()
  const dependencies = pkg.dependencies ?? {}
  const devDependencies = pkg.devDependencies ?? {}

  it('las UNICAS entradas nuevas de esta feature son @tanstack/react-table y react-day-picker', () => {
    expect(dependencies['@tanstack/react-table'], 'package.json debe declarar @tanstack/react-table en dependencies').toBeDefined()
    expect(dependencies['react-day-picker'], 'package.json debe declarar react-day-picker en dependencies').toBeDefined()
  })

  it('las transitivas @tanstack/react-store, date-fns y @date-fns/tz NO llevan entrada directa (decision 14)', () => {
    const transitivas = ['@tanstack/react-store', 'date-fns', '@date-fns/tz']
    for (const nombre of transitivas) {
      expect(dependencies[nombre], `${nombre} es transitiva y NO debe estar en dependencies`).toBeUndefined()
      expect(devDependencies[nombre], `${nombre} es transitiva y NO debe estar en devDependencies`).toBeUndefined()
    }
  })

  it('@tanstack/react-table y react-day-picker tienen su fila en docs/dependencias.md', () => {
    const registro = readSource(join(repoRoot, 'docs', 'dependencias.md'))
    for (const nombre of ['@tanstack/react-table', 'react-day-picker']) {
      const filaRegex = new RegExp('\\|\\s*`' + nombre.replace(/[/]/g, '\\/') + '`\\s*\\|')
      expect(filaRegex.test(registro), `docs/dependencias.md no tiene fila para \`${nombre}\``).toBe(true)
    }
  })
})

describe('Alcance QC-55: primitivas de UI (R33)', () => {
  const uiDir = join(repoRoot, 'components', 'ui')
  const uiFiles = walkCodeFiles(uiDir)

  it('ningun archivo de components/ui/ importa components/shared/data-table', () => {
    for (const file of uiFiles) {
      const contenido = readSource(file)
      expect(
        contenido,
        `${relative(repoRoot, file)} no debe importar components/shared/data-table (las primitivas no conocen la feature, R33)`,
      ).not.toMatch(/components\/shared\/data-table/)
    }
  })

  it('existe components/ui/calendar.tsx (anadido por CLI, R33)', () => {
    expect(
      uiFiles.some((file) => file.endsWith(join('ui', 'calendar.tsx'))),
      'components/ui/calendar.tsx debe existir',
    ).toBe(true)
  })

  it('components/ui/table.tsx sigue conteniendo data-slot="table-container" y overflow-x-auto (no se degrado, R33)', () => {
    const tableSource = readSource(join(uiDir, 'table.tsx'))
    expect(tableSource, 'table.tsx debe conservar data-slot="table-container"').toMatch(/data-slot="table-container"/)
    expect(tableSource, 'table.tsx debe conservar overflow-x-auto').toMatch(/overflow-x-auto/)
  })
})

describe('Alcance QC-55: ninguna pantalla lo consume todavia (R34)', () => {
  const consumerDirs = ['app', 'lib/modules', 'db', 'e2e']

  it('ningun archivo bajo app/, lib/modules/, db/ o e2e/ importa components/shared/data-table', () => {
    for (const relDir of consumerDirs) {
      const files = walkCodeFiles(join(repoRoot, ...relDir.split('/')))
      for (const file of files) {
        const contenido = readSource(file)
        expect(
          contenido,
          `${relative(repoRoot, file)} no debe importar components/shared/data-table todavia (migrar es QC-56, R34)`,
        ).not.toMatch(/components\/shared\/data-table/)
      }
    }
  })

  it('ningun archivo de la feature importa app/(private)/inventario/ ni app/(private)/produccion/', () => {
    const files = walkCodeFiles(DATA_TABLE_DIR)
    // Comilla simple o doble seguida SOLO de caracteres de ruta (sin espacios): una ruta de
    // import de verdad, no un comentario en prosa. `[^'"]*` sin restringir a caracteres de ruta
    // saltaria de una comilla de cierre cualquiera (p. ej. la de un import previo) hasta el
    // siguiente backtick de comentario, que no es una comilla: los comentarios de esta feature
    // citan rutas de pantallas existentes entre backticks (p. ej.
    // `` `app/(private)/inventario/components` ``) sin que eso sea un import.
    const prohibidos = [
      /['"][\w@./-]*app\/\(private\)\/inventario/,
      /['"][\w@./-]*app\/\(private\)\/produccion/,
    ]
    for (const file of files) {
      const contenido = readSource(file)
      for (const patron of prohibidos) {
        expect(
          contenido,
          `${relative(repoRoot, file)} no debe importar ${patron} (R34)`,
        ).not.toMatch(patron)
      }
    }
  })
})

describe('Alcance QC-55: no duplica la base heredada (R35)', () => {
  const herencia = [
    'components.json',
    join('lib', 'utils.ts'),
    join('components', 'ui', 'table.tsx'),
    'vitest.config.mts',
    join('tests', 'helpers', 'viewport.ts'),
    join('lib', 'shared', 'pagination.ts'),
  ]

  it('la base heredada existe en el repo', () => {
    for (const relPath of herencia) {
      expect(() => statSync(join(repoRoot, relPath)), `falta ${relPath}`).not.toThrow()
    }
  })

  it('la feature no re-crea ningun archivo con el mismo nombre que la base heredada', () => {
    const featureFiles = readdirSync(DATA_TABLE_DIR)
    const nombresHeredados = new Set(['table.tsx', 'utils.ts', 'viewport.ts', 'pagination.ts'])
    for (const nombre of featureFiles) {
      expect(
        nombresHeredados.has(nombre),
        `components/shared/data-table/${nombre} duplica un nombre de la base heredada (R35)`,
      ).toBe(false)
    }
  })

  it('data-table-params.ts importa DEFAULT_PAGE_SIZE y MAX_PAGE_SIZE de @/lib/shared/pagination, no los declara propios', () => {
    const source = readSource(join(DATA_TABLE_DIR, 'data-table-params.ts'))
    expect(
      source,
      'data-table-params.ts debe importar DEFAULT_PAGE_SIZE y MAX_PAGE_SIZE de @/lib/shared/pagination (R35)',
    ).toMatch(/import\s*\{\s*DEFAULT_PAGE_SIZE,\s*MAX_PAGE_SIZE\s*\}\s*from\s*['"]@\/lib\/shared\/pagination['"]/)
    // Ninguna redeclaracion propia de las constantes con literales 10/25 (R11, R35).
    expect(source, 'no debe redeclarar DEFAULT_PAGE_SIZE como constante propia').not.toMatch(
      /export const DEFAULT_PAGE_SIZE\s*=/,
    )
    expect(source, 'no debe redeclarar MAX_PAGE_SIZE como constante propia').not.toMatch(
      /export const MAX_PAGE_SIZE\s*=/,
    )
  })
})

describe('Alcance QC-55: imports por el barrel, nunca por ruta profunda (R1)', () => {
  it('ningun consumidor fuera de la feature importa una ruta profunda en vez del barrel', () => {
    // Se excluyen `components/shared/data-table/` (imports relativos internos, no aplican) y
    // `tests/` (los tests UNITARIOS de esta misma feature importan a proposito piezas internas
    // que el barrel no reexporta -`DataTablePagination`, `DataTableHeaderMenu`, etc.-, igual que
    // ya hace `data-table.test.tsx`; R1 protege a los CONSUMIDORES de producto, no a la propia
    // suite de tests que ejercita sus modulos internos).
    const allFiles = walkCodeFiles(repoRoot).filter(
      (file) => !file.startsWith(DATA_TABLE_DIR + sep) && !file.startsWith(join(repoRoot, 'tests') + sep),
    )
    // Import por ruta profunda: `@/components/shared/data-table/algo`, con algo despues de la
    // ultima barra. El barrel valido es exactamente `@/components/shared/data-table` (con o sin
    // comillas de cierre inmediatas).
    const rutaProfunda = /['"]@\/components\/shared\/data-table\/[^'"]+['"]/

    for (const file of allFiles) {
      const contenido = readSource(file)
      const match = rutaProfunda.exec(contenido)
      expect(
        match === null,
        `${relative(repoRoot, file)} importa por ruta profunda (${match?.[0]}) en vez de por el barrel @/components/shared/data-table (R1)`,
      ).toBe(true)
    }
  })
})

describe('Alcance QC-55: sin verificacion de extremo a extremo (R36)', () => {
  it('e2e/ no contiene ninguna referencia a data-table', () => {
    const e2eFiles = walkCodeFiles(join(repoRoot, 'e2e'))
    for (const file of e2eFiles) {
      const contenido = readSource(file)
      expect(
        contenido,
        `${relative(repoRoot, file)} no debe referenciar data-table: esta feature no anade E2E (decision 11, R36)`,
      ).not.toMatch(/data-table/)
    }
  })
})
