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

// La carpeta de la pantalla que estrena la tabla se DERIVA de esta constante, nunca de un
// literal escrito a mano: asi un cambio de ruta arrastra esta prueba con el mismo commit.
import { ORDERS_ROUTE } from '@/lib/shared/routes'

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

describe('Alcance QC-55: la pantalla de pedidos es su UNICO consumidor (R34)', () => {
  // CENTINELA INVERTIDO el 2026-09-07 (QC-35), y lo decide el HUMANO. Hasta hoy este bloque
  // afirmaba «ninguna pantalla lo consume todavia», y era cierto: cuando QC-55 se escribio, la
  // tabla compartida llevaba mergeada sin UN SOLO consumidor. El humano decidio el 2026-09-06
  // que QC-35 la estrena -«un componente compartido que nadie usa es un componente que nadie
  // sabe si funciona»-, asi que la premisa cayo. Mismo trato que ya recibieron los centinelas
  // de inventario (QC-22) y de recetas (QC-26): se INVIERTE, no se borra ni se relaja.
  //
  // Y la inversion NO es «ya puede importarlo cualquiera», que seria tirar el centinela: lo que
  // este bloque protege ahora es el alcance de QC-56. La pantalla de pedidos es el UNICO
  // consumidor; productos y recetas siguen SIN tocarlo hasta que QC-56 las migre. Meter
  // `data-table` en inventario o en formulas manana vuelve a poner esto en rojo.
  const consumerDirs = ['app', 'lib/modules', 'db', 'e2e']

  /** La carpeta de la pantalla, DERIVADA de `ORDERS_ROUTE` y nunca de un literal. */
  const carpetaDeLaPantalla = join(
    repoRoot,
    'app',
    '(private)',
    ...ORDERS_ROUTE.split('/').filter((segmento) => segmento.length > 0),
  )

  it('solo la pantalla de pedidos importa components/shared/data-table', () => {
    let consumidores = 0
    for (const relDir of consumerDirs) {
      const files = walkCodeFiles(join(repoRoot, ...relDir.split('/')))
      for (const file of files) {
        if (!/components\/shared\/data-table/.test(readSource(file))) continue
        expect(
          !relative(carpetaDeLaPantalla, file).startsWith(`..${sep}`),
          `${relative(repoRoot, file)} importa components/shared/data-table y no es la pantalla de pedidos: migrar las demas es QC-56 (R34)`,
        ).toBe(true)
        consumidores += 1
      }
    }
    // Sin esto, el bucle pasaria en verde por no haber encontrado ningun consumidor, que es
    // justo el estado que esta ficha vino a terminar.
    expect(consumidores, 'la pantalla de pedidos deberia consumir la tabla compartida').toBeGreaterThan(0)
  })

  it('las pantallas de productos y de recetas siguen SIN consumirlo: migrarlas es QC-56', () => {
    // La mitad del centinela que NO se afloja, y la razon de que este bloque siga existiendo.
    const territorioDeQc56 = [
      join(repoRoot, 'app', '(private)', 'inventario'),
      join(repoRoot, 'app', '(private)', 'produccion'),
    ]
    for (const dir of territorioDeQc56) {
      const files = walkCodeFiles(dir)
      expect(files.length, `${relative(repoRoot, dir)} deberia tener archivos que mirar`).toBeGreaterThan(0)
      for (const file of files) {
        expect(
          readSource(file),
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

describe('Alcance QC-55: el unico E2E que lo referencia es el de pedidos (R36)', () => {
  // CENTINELA INVERTIDO el 2026-09-07 (QC-35), y lo decide el HUMANO. QC-55 no anadia E2E
  // porque no tenia consumidor (su decision 11); QC-35 estrena la tabla y su E2E lo aprobo el
  // humano el 2026-09-06 (R48, R49). La lista es CERRADA: en cuanto el E2E de inventario o el
  // de recetas referencien `data-table` -es decir, en cuanto QC-56 los migre sin su ficha-,
  // esto vuelve a ponerse rojo.
  it('la lista de specs E2E que referencian data-table es cerrada, y es solo el de pedidos', () => {
    const e2eFiles = walkCodeFiles(join(repoRoot, 'e2e'))
    expect(e2eFiles.length, 'e2e/ deberia tener specs que mirar').toBeGreaterThan(0)
    const referencian = e2eFiles
      .filter((file) => /data-table/.test(readSource(file)))
      .map((file) => relative(repoRoot, file).split(sep).join('/'))
    expect(referencian, 'solo el E2E de pedidos puede referenciar la tabla compartida (R36)').toEqual([
      'e2e/pedidos.spec.ts',
    ])
  })
})
