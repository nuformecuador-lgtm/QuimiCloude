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
import { INVENTORY_ROUTE, ORDERS_ROUTE, PRESENTATIONS_ROUTE, SUPPLIERS_ROUTE } from '@/lib/shared/routes'

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

describe('Alcance QC-55: sus consumidores son una lista CERRADA (R34)', () => {
  // CENTINELA INVERTIDO POR SEGUNDA VEZ el 2026-09-07, y lo decide el HUMANO.
  //
  // Historia, porque importa para entender que protege: cuando QC-55 se escribio, este bloque
  // afirmaba «ninguna pantalla lo consume todavia» -y era cierto: la tabla compartida llevaba
  // mergeada sin UN SOLO consumidor-. El 2026-09-06 el humano decidio que QC-35 la estrenara
  // («un componente compartido que nadie usa es un componente que nadie sabe si funciona») y el
  // bloque paso a «pedidos es el UNICO consumidor; migrar las demas es QC-56». Hoy el humano ha
  // pedido justamente esa migracion para inventario y para el catalogo de un proveedor, asi que
  // la premisa cae otra vez.
  //
  // La inversion NO es «ya puede importarlo cualquiera», que seria tirar el centinela: la lista
  // de consumidores es CERRADA y se declara aqui. La pantalla de recetas sigue SIN tocarlo, y
  // meter `data-table` en una quinta pantalla vuelve a poner esto en rojo.
  //
  // AMPLIADO el 2026-09-07 (QC-45, pantalla-de-presentaciones): entra un CUARTO consumidor
  // declarado -la pantalla de presentaciones-, que se monta sobre la tabla compartida en vez de
  // dibujar la suya (QC-45 R8, R33, `design.md > 1`). Se anade la fila, no se afloja el
  // centinela: la lista sigue cerrada y la pantalla de recetas sigue fuera.
  const consumerDirs = ['app', 'lib/modules', 'db', 'e2e']

  /**
   * Las carpetas autorizadas a consumir la tabla compartida. Las cuatro se DERIVAN de constantes
   * de ruta y nunca de un literal escrito a mano: un cambio de ruta arrastra esta prueba con el
   * mismo commit. La CUARTA -`PRESENTATIONS_ROUTE`- la trae QC-45 (R8): su pantalla consume la
   * tabla compartida por decision de diseno, asi que es un consumidor declarado, no un descuido.
   */
  const carpetasAutorizadas = [ORDERS_ROUTE, INVENTORY_ROUTE, SUPPLIERS_ROUTE, PRESENTATIONS_ROUTE].map((ruta) =>
    join(repoRoot, 'app', '(private)', ...ruta.split('/').filter((segmento) => segmento.length > 0)),
  )

  function autorizada(file: string): boolean {
    return carpetasAutorizadas.some(
      (carpeta) => !relative(carpeta, file).startsWith(`..${sep}`),
    )
  }

  it('solo las cuatro pantallas autorizadas importan components/shared/data-table', () => {
    let consumidores = 0
    for (const relDir of consumerDirs) {
      const files = walkCodeFiles(join(repoRoot, ...relDir.split('/')))
      for (const file of files) {
        if (!/components\/shared\/data-table/.test(readSource(file))) continue
        expect(
          autorizada(file),
          `${relative(repoRoot, file)} importa components/shared/data-table y no es ninguna de las cuatro pantallas autorizadas (pedidos, inventario, detalle de proveedor, presentaciones): migrar una quinta es una decision, no un descuido (R34)`,
        ).toBe(true)
        consumidores += 1
      }
    }
    // Sin esto, el bucle pasaria en verde por no haber encontrado ningun consumidor.
    expect(consumidores, 'las pantallas autorizadas deberian consumir la tabla compartida').toBeGreaterThan(3)
  })

  it('la pantalla de recetas sigue SIN consumirlo', () => {
    // La mitad del centinela que NO se afloja, y la razon de que este bloque siga existiendo.
    const dir = join(repoRoot, 'app', '(private)', 'produccion')
    const files = walkCodeFiles(dir)
    expect(files.length, `${relative(repoRoot, dir)} deberia tener archivos que mirar`).toBeGreaterThan(0)
    for (const file of files) {
      expect(
        readSource(file),
        `${relative(repoRoot, file)} no debe importar components/shared/data-table: la pantalla de recetas no se ha migrado (R34)`,
      ).not.toMatch(/components\/shared\/data-table/)
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

describe('Alcance QC-55: los E2E que lo referencian son una lista CERRADA (R36)', () => {
  // CENTINELA INVERTIDO DOS VECES, las dos por decision del HUMANO: QC-55 no anadia E2E porque
  // no tenia consumidor (su decision 11); QC-35 estreno la tabla y su E2E se aprobo el
  // 2026-09-06; y el 2026-09-07 se migraron inventario y el catalogo de un proveedor, cuyos E2E
  // ya existian y ahora localizan la tabla compartida.
  //
  // La lista sigue siendo CERRADA: en cuanto el E2E de recetas -o uno nuevo- referencie
  // `data-table`, esto vuelve a ponerse rojo.
  it('la lista de specs E2E que referencian data-table es cerrada, y son estos cuatro', () => {
    const e2eFiles = walkCodeFiles(join(repoRoot, 'e2e'))
    expect(e2eFiles.length, 'e2e/ deberia tener specs que mirar').toBeGreaterThan(0)
    const referencian = e2eFiles
      .filter((file) => /data-table/.test(readSource(file)))
      .map((file) => relative(repoRoot, file).split(sep).join('/'))
      .sort()
    expect(referencian, 'solo estos cuatro E2E pueden referenciar la tabla compartida (R36)').toEqual([
      'e2e/inventario.spec.ts',
      'e2e/pedidos.spec.ts',
      // La CUARTA entrada la trae QC-45 el 2026-09-07: su E2E localiza la tabla compartida porque
      // la pantalla de presentaciones la consume (QC-45 R8, R36). La lista sigue CERRADA: un
      // quinto spec que referencie `data-table` vuelve a ponerla en rojo.
      'e2e/presentaciones.spec.ts',
      'e2e/proveedores.spec.ts',
    ])
  })
})
