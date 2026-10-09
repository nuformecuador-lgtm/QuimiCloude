// Cobertura de alcance de QC-55: R31, R33, R34, R35, R1 (imports por barrel), R36.
//
// Archivo SIN DOM (`.test.ts`, proyecto `node` de Vitest): recorre el arbol de archivos con
// `node:fs`/`node:path`, al estilo de `tests/guards/guard-dependencias-aprobadas.test.ts`. No
// monta nada ni importa React: lo que verifica es DONDE viven los archivos y QUE se importa
// desde donde, no como se comporta el componente (eso va en `data-table-contrato.test.tsx`).

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, type TestContext } from 'vitest'

// La carpeta de la pantalla que estrena la tabla se DERIVA de esta constante, nunca de un
// literal escrito a mano: asi un cambio de ruta arrastra esta prueba con el mismo commit.
import {
  ASSIGNED_ORDERS_ROUTE,
  CUSTOMERS_ROUTE,
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  SUPPLIERS_ROUTE,
  UNITS_ROUTE,
  USERS_ROUTE,
} from '@/lib/shared/routes'

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
  //
  // AMPLIADO el 2026-09-08 (QC-39, pantalla-de-unidades): entra un QUINTO consumidor declarado
  // -la pantalla de unidades-, y lo trae una decision cerrada, no un descuido: la fila «¿La lista
  // usa la tabla compartida?» de `specs/QC-39-pantalla-de-unidades/requirements.md > Decisiones
  // cerradas` (2026-09-08) dice «si, la de QC-55, por su barrel publico y sin tocar ni un archivo
  // suyo» (QC-39 R15, R31). Se anade la fila y se TENSA el resto del centinela -el ancla de
  // consumidores minimos sube de tres a cuatro-, nunca se afloja: la lista sigue CERRADA, la
  // pantalla de recetas sigue fuera y una SEXTA pantalla vuelve a poner esto en rojo.
  //
  // AMPLIADO el 2026-09-11 (QC-67, pantalla-de-usuarios): entra un SEXTO consumidor declarado
  // -la pantalla de administracion de usuarios-, y lo trae una decision cerrada, no un descuido:
  // la fila «Base heredada, sin re-crear» de
  // `specs/QC-67-pantalla-de-usuarios/requirements.md > Decisiones cerradas` (2026-09-11) dice
  // «tabla compartida de QC-55», y R9 lo escribe como requisito: por su barrel publico, sin
  // declarar tabla ni paginacion propias y sin modificar ni un archivo de
  // `components/shared/data-table/` -lo ata `tests/unit/configuracion-ui/data-table-intacta-usuarios.test.ts`
  // sobre el diff-. Sus acciones de fila van, como las de unidades, en una columna normal con
  // `pinnable: false`. Se anade la fila y se TENSA el resto del centinela -el ancla de consumidores
  // minimos sube de cuatro a cinco-, nunca se afloja: la lista sigue CERRADA, la pantalla de
  // recetas sigue fuera y una SEPTIMA pantalla vuelve a poner esto en rojo.
  //
  // AMPLIADO el 2026-09-15 (QC-56): entra la pantalla de recetas como SEPTIMO consumidor
  // declarado. El caso que la dejaba fuera se invierte; una OCTAVA pantalla sigue en rojo.
  //
  // Entra la NOVENA pantalla declarada -clientes-: su lista se monta sobre la tabla compartida
  // por su barrel publico, sin tocar ni un archivo de `components/shared/data-table/`. Se anade
  // la fila y se TENSA el resto del centinela -el ancla de consumidores minimos sube de siete a
  // ocho-, nunca se afloja: la lista sigue CERRADA y una DECIMA pantalla vuelve a poner esto en
  // rojo.
  const consumerDirs = ['app', 'lib/modules', 'db', 'e2e']

  /**
   * Las carpetas autorizadas a consumir la tabla compartida. Todas se DERIVAN de constantes
   * de ruta y nunca de un literal escrito a mano: un cambio de ruta arrastra esta prueba con el
   * mismo commit. La CUARTA -`PRESENTATIONS_ROUTE`- la trae QC-45 (R8): su pantalla consume la
   * tabla compartida por decision de diseno, asi que es un consumidor declarado, no un descuido.
   * La QUINTA -`UNITS_ROUTE`- la trae QC-39 (R15, R31) con el mismo criterio: su lista se monta
   * sobre la tabla compartida por decision cerrada del 2026-09-08 y sus acciones de fila van como
   * columna normal `pinnable: false`, sin anadirle nada a `components/shared/data-table/`. La
   * SEXTA -`USERS_ROUTE`- la trae QC-67 (R9) con el mismo criterio y por la misma via.
   * La NOVENA -`CUSTOMERS_ROUTE`- la trae la pantalla de clientes con el mismo criterio.
   */
  const carpetasAutorizadas = [
    ORDERS_ROUTE,
    INVENTORY_ROUTE,
    SUPPLIERS_ROUTE,
    PRESENTATIONS_ROUTE,
    UNITS_ROUTE,
    USERS_ROUTE,
    // 2026-09-15: la pantalla de recetas pasa a montarse sobre la tabla compartida.
    FORMULAS_ROUTE,
    // 2026-09-16: la lista de pedidos asignados pasa a montarse sobre la tabla compartida.
    ASSIGNED_ORDERS_ROUTE,
    // 2026-09-25: la pantalla de clientes se monta sobre la tabla compartida.
    CUSTOMERS_ROUTE,
    // 2026-10-08 (QC-167): la lista del recorrido de ejecucion del dashboard se monta sobre la
    // tabla compartida por decision de diseno (`design.md` de QC-167 > 4.3). Es la DECIMA.
    DASHBOARD_ROUTE,
  ].map(carpetaDeRuta)

  function carpetaDeRuta(ruta: string): string {
    return join(repoRoot, 'app', '(private)', ...ruta.split('/').filter((segmento) => segmento.length > 0))
  }

  function autorizada(file: string): boolean {
    return carpetasAutorizadas.some(
      (carpeta) => !relative(carpeta, file).startsWith(`..${sep}`),
    )
  }

  it('solo las diez pantallas autorizadas importan components/shared/data-table', () => {
    let consumidores = 0
    for (const relDir of consumerDirs) {
      const files = walkCodeFiles(join(repoRoot, ...relDir.split('/')))
      for (const file of files) {
        if (!/components\/shared\/data-table/.test(readSource(file))) continue
        expect(
          autorizada(file),
          `${relative(repoRoot, file)} importa components/shared/data-table y no es ninguna de las diez pantallas autorizadas (pedidos, inventario, proveedores, presentaciones, unidades, usuarios, recetas, asignacion, clientes, dashboard): migrar una undecima es una decision, no un descuido (R29, R34)`,
        ).toBe(true)
        consumidores += 1
      }
    }
    // Sin esto, el bucle pasaria en verde por no haber encontrado ningun consumidor. El ancla se
    // TENSA con cada alta: hoy son NUEVE pantallas autorizadas, asi que se exige al menos un
    // consumidor por pantalla (2026-09-25; antes eran ocho). 2026-10-08 (QC-167): DIEZ, con el
    // dashboard.
    expect(consumidores, 'las pantallas autorizadas deberian consumir la tabla compartida').toBeGreaterThan(9)
  })

  it('la pantalla de recetas SI consume la tabla compartida (R29)', () => {
    // Invertido el 2026-09-15: sin esto, deshacer la migracion dejaria la lista autorizando una
    // carpeta que ya no consume nada, y el ancla de arriba lo taparia con los demas consumidores.
    const dir = carpetaDeRuta(FORMULAS_ROUTE)
    const files = walkCodeFiles(dir)
    expect(files.length, `${relative(repoRoot, dir)} deberia tener archivos que mirar`).toBeGreaterThan(0)
    const consumidores = files.filter((file) => /components\/shared\/data-table/.test(readSource(file)))
    expect(
      consumidores.length,
      `ningun archivo de ${relative(repoRoot, dir)} importa components/shared/data-table: la pantalla de recetas deberia estar migrada (R29)`,
    ).toBeGreaterThan(0)
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
  //
  // AMPLIADA POR TERCERA VEZ el 2026-09-08 (QC-39, pantalla-de-unidades): entra la QUINTA entrada,
  // `e2e/unidades.spec.ts`, y la trae la misma decision cerrada que dio de alta a la pantalla de
  // unidades como consumidora de la tabla compartida (QC-39 R15, R31,
  // `specs/QC-39-pantalla-de-unidades/requirements.md > Decisiones cerradas`, 2026-09-08): su E2E
  // -exigido por QC-39 R50- localiza `data-table-cell-name`, `data-table-cell-equivalence` y
  // `data-table-row-<id>` porque la lista que recorre ES la tabla compartida. Se anade la fila y se
  // TENSA el centinela -el ancla pasa de cuatro entradas a cinco-, nunca se afloja: la lista sigue
  // CERRADA, el E2E de recetas sigue fuera y un SEXTO spec que referencie `data-table` vuelve a
  // ponerla en rojo.
  //
  // AMPLIADA POR CUARTA VEZ el 2026-09-11 (QC-49, aislamiento-por-empresa-en-inventario): entra la
  // SEXTA entrada, `e2e/aislamiento-inventario.spec.ts`, y NO estrena ninguna pantalla. La trae el
  // E2E que exige QC-49 R27 (`specs/QC-49-aislamiento-por-empresa-en-inventario/requirements.md >
  // Decisiones cerradas`, «¿Hace falta E2E? Si»), cuyo recorrido atraviesa LAS DOS pantallas que ya
  // consumen la tabla compartida -inventario (entrada 1) y presentaciones (entrada 3)- y afirma
  // sobre LAS FILAS QUE EL SERVIDOR SIRVE: que con sesion en la empresa A no aparece ninguna fila
  // de la B en ninguna de las dos listas, y que borrar una fila de la B conociendo su identificador
  // se rechaza y la deja intacta. Por eso localiza `data-table-cell-name`: la celda de nombre de la
  // tabla compartida es donde se leen esas filas, exactamente como la localizan QC-45 y QC-39.
  // Se anade la fila y se TENSA el centinela, nunca se afloja.
  //
  // OJO -- QC-49 y QC-67 ampliaron esta lista EL MISMO DIA, cada una creyendo que la suya era la
  // SEXTA entrada, y el merge las junto: son la SEXTA y la SEPTIMA. El ancla pasa de cinco a
  // SIETE de una vez. La lista sigue CERRADA, el E2E de recetas sigue fuera y un OCTAVO spec que
  // referencie `data-table` vuelve a ponerla en rojo.
  //
  // AMPLIADA POR CUARTA VEZ el 2026-09-11 (QC-67, pantalla-de-usuarios): entra la SEXTA entrada,
  // `e2e/usuarios.spec.ts`, por la misma via que la quinta. Su E2E -exigido por QC-67 R42- localiza
  // `data-table-cell-<columna>` y `data-table-row-<id>` porque la lista de usuarios ES la tabla
  // compartida (QC-67 R9), que esta feature consume por su barrel publico sin abrir ni uno de sus
  // archivos (`tests/unit/configuracion-ui/data-table-intacta-usuarios.test.ts`). Se anade la fila
  // y se TENSA el centinela, nunca se afloja (ver la nota de arriba sobre las dos ampliaciones).
  // AMPLIADA POR QUINTA VEZ el 2026-09-12 (QC-85, pantalla-de-grupos-de-trabajo): entra la OCTAVA
  // entrada, `e2e/grupos-de-trabajo.spec.ts`, por la MISMA via que la sexta y la septima. Su E2E
  // -exigido por QC-85 R42- localiza `data-table-row-<id>` y las celdas porque la lista de GRUPOS
  // es la tabla compartida (QC-85 R12), que esa feature consume por su barrel publico sin abrir ni
  // uno de sus archivos -su `grupos/alcance.test.ts` lo mide con el diff vacio en
  // `components/shared/data-table/`-. No estrena pantalla: la pestana vive dentro de la de usuarios,
  // que ya estaba en esta lista. Se anade la fila y se TENSA el centinela, nunca se afloja: un
  // NOVENO spec que referencie `data-table` vuelve a ponerlo en rojo.
  //
  // AMPLIADA POR SEXTA VEZ el 2026-09-13 (QC-102, responsables-en-la-pantalla-de-pedidos, T16, R37):
  // entra la NOVENA entrada, `e2e/pedidos-responsables.spec.ts`, por la MISMA via que la sexta: no
  // estrena pantalla, recorre la de PEDIDOS, que ya estaba en esta lista desde QC-35. Su E2E abre un
  // pedido, marca a una persona, aplica un grupo, saca a alguien y vuelve al LISTADO a comprobar los
  // avatares de la fila y el nombre del grupo CONGELADO; por eso localiza `data-table-row-<id>` y
  // las celdas: la lista de pedidos ES la tabla compartida. Se anade la fila y se TENSA el
  // centinela, nunca se afloja: la lista sigue CERRADA, el E2E de recetas sigue fuera y un DECIMO
  // spec que referencie `data-table` vuelve a ponerla en rojo.
  //
  // AMPLIADA POR SEPTIMA VEZ el 2026-09-15 (QC-93, aterrizaje-sin-permiso-de-modulo, R18): entra la
  // DECIMA entrada, `e2e/login.spec.ts`, y a diferencia de todas las anteriores no estrena pantalla
  // y NO consume la tabla compartida: no hace clic, no lee filas ni celdas. La referencia es la
  // sonda de QC-93 R18 del caso nuevo para quien no tiene ningun permiso de modulo, que recorre los
  // `data-testid` de datos de todos los modulos y AFIRMA SU AUSENCIA (`toHaveCount(0)`); `data-table`
  // entra porque es el contenedor de las listas de inventario, presentaciones, unidades, usuarios y
  // pedidos. Conviene que este AQUI y no fuera: si ese `data-testid` se renombrara, la cuenta cero
  // seguiria en verde sin comprobar nada, y esta lista es lo que lo delataria. Se anade la fila y se
  // TENSA el centinela, nunca se afloja: la lista sigue CERRADA, el E2E de recetas sigue fuera y un
  // UNDECIMO spec que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-15: entran los dos E2E de recetas, que ya localizan la tabla compartida.
  // `e2e/errores.spec.ts` sigue fuera: solo mira el error de la pagina de edicion.
  //
  // 2026-09-16: entra `e2e/aislamiento-pedidos.spec.ts`, que no estrena pantalla: recorre la de
  // pedidos, ya en esta lista, y localiza `data-table-row-<id>` y la celda del numero de pedido
  // porque lo que afirma son las filas servidas con sesion en una empresa. Se anade la fila y se
  // TENSA el centinela de doce a trece; un spec mas que referencie `data-table` vuelve a ponerlo
  // en rojo.
  //
  // 2026-09-16: entran dos specs a la vez, y ninguno afloja la lista.
  // `e2e/aislamiento-recetas.spec.ts` no estrena pantalla: recorre la de recetas, que ya consume la
  // tabla compartida, y localiza `data-table-cell-name` porque lo que afirma son LAS FILAS
  // SERVIDAS -con sesion en una empresa no aparece ninguna fila de la receta de otra-.
  // `e2e/pedidos-asignados.spec.ts` si estrena pantalla, y localiza sus filas por
  // `data-table-row-<id>`. Se TENSA el centinela de trece a quince; la lista sigue CERRADA, y un
  // spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-17: entra `e2e/ejecucion-receta.spec.ts` (QC-63, R29/R30), y NO afloja la lista. No
  // estrena pantalla propia de tabla: recorre la de pedidos asignados -ya en esta lista- y
  // localiza `data-table-row-<id>` y la celda del numero de pedido para llegar al disparador de
  // entrar. Se TENSA el centinela de quince a DIECISEIS; la lista sigue CERRADA, y un spec mas que
  // referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-17: entra `e2e/aislamiento-proveedores.spec.ts`, y no afloja la lista. No estrena
  // pantalla: recorre la de proveedores, que ya consume la tabla compartida, y localiza
  // `data-table-cell-name` y `data-table-row-<id>` porque lo que afirma son LAS FILAS SERVIDAS
  // -con sesion en una empresa no aparece ninguna fila del proveedor de otra, ni al pedirla
  // conociendo su identificador-. Se TENSA el centinela de dieciseis a DIECISIETE; la lista sigue
  // CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-23: entra `e2e/reserva-de-material.spec.ts`, y no afloja la lista. No estrena
  // pantalla: recorre las de pedidos e inventario, las dos ya en esta lista. Su recorrido crea dos
  // pedidos que compiten por el mismo lote, cancela, reedita y entrega, y localiza
  // `data-table-row-<id>`, `data-table-cell-orderNumber`, `data-table-next` y las filas de
  // inventario por `product-stock` porque lo que afirma -lo apartado, lo disponible y la cobertura
  // de cada pedido- se lee de las dos listas que monta la tabla compartida. Se TENSA el centinela
  // de diecisiete a DIECIOCHO; la lista sigue CERRADA, y un spec mas que referencie `data-table`
  // vuelve a ponerla en rojo.
  //
  // 2026-09-23: entra tambien `e2e/pedidos-terminados.spec.ts`, y no afloja la lista. No estrena
  // pantalla de tabla propia: recorre la nueva pantalla de asignacion, que monta la tabla
  // compartida para sus listas de asignados y terminados, y localiza `data-table-row-<id>` y las
  // celdas de pedido y responsables. Se TENSA el centinela de dieciocho a DIECINUEVE; la lista
  // sigue CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-23 (QC-122, busqueda-y-total-en-la-pantalla-de-pedidos, R25/R9/R26/R27): entra la
  // VIGESIMA entrada, `e2e/pedidos-busqueda.spec.ts`, y no afloja la lista. No estrena
  // pantalla: recorre la de pedidos, ya en esta lista, y localiza `data-table-search` y
  // `data-table-cell-orderNumber` porque lo que afirma es la caja de busqueda compartida y las
  // filas que devuelve. Se TENSA el centinela de diecinueve a VEINTE; la lista sigue CERRADA,
  // y un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-23 (QC-151, cotizacion-del-coste-en-el-pedido, R11): entra la VIGESIMOPRIMERA entrada,
  // `e2e/pedidos-cotizacion.spec.ts`, y no afloja la lista. No estrena pantalla: recorre la de
  // pedidos, ya en esta lista, y localiza `data-table-row-<id>` y `data-table-cell-orderNumber`
  // porque lo que afirma es la fila del pedido recien creado, localizada por su correlativo, para
  // reabrir su edicion y comprobar que el coste se reabre sin teclear nada. Se TENSA el centinela
  // de veinte a VEINTIUNO; la lista sigue CERRADA, y un spec mas que referencie `data-table`
  // vuelve a ponerla en rojo.
  //
  // 2026-09-23: SALE `e2e/aislamiento-proveedores.spec.ts`. La pantalla que recorre dejo de montar
  // la tabla compartida: ahora es una lista con carga perezosa que localiza sus filas por
  // `supplier-showcase-row-<id>` y el nombre por el enlace de detalle, no por celdas de
  // `data-table`. El centinela AFLOJA por primera vez, de VEINTIUNO a VEINTE, porque la unica
  // razon de que este spec estuviera aqui ya no existe; sigue siendo una lista cerrada y un spec
  // mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-09-24: entra `e2e/catalogo-desde-pdf.spec.ts` (importacion de catalogo desde PDF). No
  // estrena pantalla: recorre el catalogo del detalle de un proveedor y localiza
  // `data-table-row-<id>` y `data-table-cell-cost` para afirmar el costo de la linea importada. El
  // centinela vuelve de VEINTE a VEINTIUNO; la lista sigue CERRADA.
  //
  // 2026-09-24: entra tambien `e2e/producto-terminado.spec.ts`, y no afloja la lista. No estrena
  // pantalla: recorre las de presentaciones, pedidos, asignacion e inventario, ya en esta lista,
  // y localiza `data-table-cell-orderNumber`, `data-table-row-<id>` y `data-table-cell-name`
  // porque lo que afirma -el pedido finalizado y el lote de producto terminado que nace de el- se
  // lee de las listas que monta la tabla compartida. El centinela vuelve de VEINTIUNO a
  // VEINTIDOS; la lista sigue CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla
  // en rojo.
  //
  // 2026-09-25: entra `e2e/empaque.spec.ts` (QC-168), y no afloja la lista. No estrena pantalla:
  // recorre las de pedidos y asignacion, ya en esta lista -localiza la fila de «Mis asignados» y
  // la de «Terminados» por `data-table-row-<id>` y `data-table-cell-orderNumber`, y la de Pedidos
  // por las mismas celdas y `data-table-next` para hojear hasta encontrar el pedido-. La pantalla
  // de «Por empacar» que SI estrena usa sus propios `packing-order-row`/`packing-order-link`, no
  // la tabla compartida. El centinela vuelve de VEINTIDOS a VEINTITRES; la lista sigue CERRADA, y
  // un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // Entra la pantalla de clientes como NOVENA pantalla que consume la tabla compartida, y su E2E
  // `e2e/clientes.spec.ts` entra con ella. Su recorrido localiza `data-table-search`,
  // `data-table-cell-lastNames`, `data-table-cell-city` y `data-table-row-<id>` porque la lista
  // de clientes ES la tabla compartida, y el recorrido busca, edita y da de baja sobre la fila
  // que ella sirve. El centinela vuelve de VEINTITRES a VEINTICUATRO; la lista sigue CERRADA, y un
  // spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-10-02: entra `e2e/pedido-bloqueado.spec.ts` (QC-138), y no afloja la lista. No estrena
  // pantalla: recorre la lista de pedidos, ya en esta lista, y localiza la fila del pedido
  // bloqueado por `data-table-row-<id>` y `data-table-cell-orderNumber`, con `data-table-next` y
  // `data-table` para hojear hasta encontrarlo. El centinela vuelve de VEINTICUATRO a
  // VEINTICINCO; la lista sigue CERRADA, y un spec mas que referencie `data-table` vuelve a
  // ponerla en rojo.
  //
  // QC-199: entra `e2e/insumo-por-unidad.spec.ts`, y no afloja la lista. No estrena pantalla:
  // recorre el listado de inventario, ya en esta lista, y localiza `data-table-cell-name` para
  // encontrar el insumo recien dado de alta. El centinela pasa de VEINTICINCO a VEINTISEIS.
  //
  // 2026-10-05: entra `e2e/pasos-de-envasado.spec.ts` (QC-211), y no afloja la lista. No estrena
  // pantalla: recorre la de asignacion, ya en esta lista, y localiza la fila de «Mis asignados»
  // por `data-table-row-<id>` y `data-table-cell-orderNumber`. El centinela pasa de VEINTISEIS a
  // VEINTISIETE; la lista sigue CERRADA, y un spec mas que referencie `data-table` vuelve a
  // ponerla en rojo.
  //
  // 2026-10-06: entra `e2e/inventario-importar.spec.ts` (QC-209), y no afloja la lista. Recorre la
  // vista previa de la importacion, que monta la tabla compartida, y localiza sus filas por
  // `data-table-row-<n>`; despues busca lo importado en el listado de inventario, ya en esta lista,
  // por `data-table-cell-name`. El centinela pasa de VEINTISIETE a VEINTIOCHO; la lista sigue
  // CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-10-06: entra `e2e/pedido-con-cliente.spec.ts` (QC-156), y no afloja la lista. No estrena
  // pantalla: recorre la lista de pedidos, ya en esta lista, y localiza la fila del pedido por
  // `data-table-row-<id>` y su cliente por `data-table-cell-customer`. El centinela pasa de
  // VEINTIOCHO a VEINTINUEVE; la lista sigue CERRADA, y un spec mas que referencie `data-table`
  // vuelve a ponerla en rojo.
  //
  // 2026-10-06: entra `e2e/registro-ejecucion.spec.ts` (QC-82), y no afloja la lista. No estrena
  // pantalla: recorre la de asignacion, ya en esta lista, y localiza la fila de «Mis asignados» por
  // `data-table-row-<id>` y `data-table-cell-orderNumber`. El centinela pasa de VEINTINUEVE a
  // TREINTA; la lista sigue CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla
  // en rojo.
  //
  // 2026-10-08: entra `e2e/recorrido-ejecucion.spec.ts` (QC-167), y no afloja la lista. Recorre la
  // lista del recorrido de ejecucion del dashboard, decima pantalla autorizada, y localiza sus filas
  // por `data-table-row-<id>`. El centinela pasa de TREINTA a TREINTA Y UNO; la lista sigue
  // CERRADA, y un spec mas que referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-10-08: entra `e2e/acondicionamiento.spec.ts`, y no afloja la lista. No estrena tabla:
  // recorre las pestanas del acondicionador en la pantalla de asignacion, ya en esta lista, y
  // localiza la fila de cada pedido por `data-table-row-<id>` y `data-table-cell-orderNumber`. El
  // centinela pasa de TREINTA Y UNO a TREINTA Y DOS; la lista sigue CERRADA, y un spec mas que
  // referencie `data-table` vuelve a ponerla en rojo.
  //
  // 2026-10-09: entra `e2e/datos-de-lote-en-acondicionamiento.spec.ts` (QC-219), y no afloja la
  // lista. No estrena tabla: al final recorre `/inventario`, ya en esta lista, y localiza el
  // producto terminado por `data-table-row-<id>` y `data-table-cell-name`. El centinela pasa de
  // TREINTA Y DOS a TREINTA Y TRES; la lista sigue CERRADA.
  it('la lista de specs E2E que referencian data-table es cerrada, y son estos treinta y tres', () => {
    const e2eFiles = walkCodeFiles(join(repoRoot, 'e2e'))
    expect(e2eFiles.length, 'e2e/ deberia tener specs que mirar').toBeGreaterThan(0)
    const referencian = e2eFiles
      .filter((file) => /data-table/.test(readSource(file)))
      .map((file) => relative(repoRoot, file).split(sep).join('/'))
      .sort()
    expect(referencian, 'e2e/errores.spec.ts no referencia la tabla compartida').not.toContain(
      'e2e/errores.spec.ts',
    )
    expect(referencian, 'solo estos treinta y tres E2E pueden referenciar la tabla compartida (R36)').toEqual([
      // Las pestanas del acondicionador: ver la nota de arriba (2026-10-08).
      'e2e/acondicionamiento.spec.ts',
      // La SEXTA entrada la trae QC-49 el 2026-09-11 (R27): su E2E recorre LAS DOS pantallas que
      // ya consumen la tabla compartida -inventario y presentaciones- y localiza
      // `data-table-cell-name` porque lo que afirma son LAS FILAS SERVIDAS: ninguna de la empresa
      // B con sesion en la A, ni siquiera al borrar conociendo el identificador. No estrena
      // pantalla: mide las que ya estaban.
      'e2e/aislamiento-inventario.spec.ts',
      // Las filas servidas de la lista de pedidos con sesion en una empresa: ver la nota de arriba.
      'e2e/aislamiento-pedidos.spec.ts',
      // Las filas servidas de la lista de recetas con sesion en una empresa: ver la nota de arriba.
      'e2e/aislamiento-recetas.spec.ts',
      // Ver la nota de arriba (2026-09-24). Va antes
      // que `e2e/clientes.spec.ts` porque la lista esta ORDENADA y 'a' precede a 'l'.
      'e2e/catalogo-desde-pdf.spec.ts',
      // Ver la nota de arriba. Va antes que `e2e/ejecucion-receta.spec.ts` porque la lista esta
      // ORDENADA y 'c' precede a 'e'.
      'e2e/clientes.spec.ts',
      // Ver la nota de arriba (2026-10-09, QC-219). Entre `clientes` y `ejecucion-receta` porque
      // la lista esta ORDENADA: 'd' va entre 'c' y 'e'.
      'e2e/datos-de-lote-en-acondicionamiento.spec.ts',
      // La DECIMOSEXTA la trae QC-63 el 2026-09-17 (R29, R30): ver la nota de arriba. Llega a la
      // tabla por la lista de pedidos asignados, que ya la consumia.
      'e2e/ejecucion-receta.spec.ts',
      // Ver la nota de arriba (2026-09-25, QC-168). Va antes que `grupos-de-trabajo` porque la
      // lista esta ORDENADA y 'e' precede a 'g'.
      'e2e/empaque.spec.ts',
      // La OCTAVA la trae QC-85 el 2026-09-12 (R42): ver la nota de arriba.
      'e2e/grupos-de-trabajo.spec.ts',
      // QC-199: ver la nota de arriba.
      'e2e/insumo-por-unidad.spec.ts',
      // Ver la nota de arriba (2026-10-06, QC-209). Va antes que `inventario.spec.ts` porque la
      // lista esta ORDENADA y '-' precede a '.'.
      'e2e/inventario-importar.spec.ts',
      'e2e/inventario.spec.ts',
      // La DECIMA la trae QC-93 el 2026-09-15 (R18): ver la nota de arriba. Es la sonda del usuario
      // sin permisos de modulo: afirma que `data-table` NO esta, no consume la tabla.
      'e2e/login.spec.ts',
      // Ver la nota de arriba (2026-10-05, QC-211). Va antes que `pedido-bloqueado` porque la
      // lista esta ORDENADA y 'a' precede a 'e'.
      'e2e/pasos-de-envasado.spec.ts',
      // Ver la nota de arriba (2026-10-02, QC-138). Va antes que `pedidos-asignados` porque la
      // lista esta ORDENADA y '-' precede a 's'.
      'e2e/pedido-bloqueado.spec.ts',
      // Ver la nota de arriba (2026-10-06, QC-156). Entre `pedido-bloqueado` y `pedidos-asignados`
      // porque la lista esta ORDENADA: 'b' precede a 'c', y '-' precede a 's'.
      'e2e/pedido-con-cliente.spec.ts',
      // Ver la nota de arriba. Va antes que `pedidos-busqueda` porque la lista esta ORDENADA.
      'e2e/pedidos-asignados.spec.ts',
      // La VIGESIMA la trae QC-122 el 2026-09-23: ver la nota de arriba. Va antes que
      // `pedidos-cotizacion` porque la lista esta ORDENADA y 'b' precede a 'c'.
      'e2e/pedidos-busqueda.spec.ts',
      // La VIGESIMOPRIMERA la trae QC-151 el 2026-09-23 (R11): ver la nota de arriba. Va antes que
      // `pedidos-responsables` porque la lista esta ORDENADA y 'c' precede a 'r'.
      'e2e/pedidos-cotizacion.spec.ts',
      // La NOVENA la trae QC-102 el 2026-09-13 (T16, R37): ver la nota de arriba. Va antes que
      // `e2e/pedidos.spec.ts` porque la lista esta ORDENADA y '-' precede a '.'.
      'e2e/pedidos-responsables.spec.ts',
      // 2026-09-23: la pantalla de asignacion monta la tabla compartida para «Mis asignados» y
      // «Terminados»; ver la nota de arriba.
      'e2e/pedidos-terminados.spec.ts',
      'e2e/pedidos.spec.ts',
      // La CUARTA entrada la trae QC-45 el 2026-09-07: su E2E localiza la tabla compartida porque
      // la pantalla de presentaciones la consume (QC-45 R8, R36). La lista sigue CERRADA: un
      // sexto spec que referencie `data-table` vuelve a ponerla en rojo.
      'e2e/presentaciones.spec.ts',
      // Ver la nota de arriba. Va antes que `proveedores`
      // porque la lista esta ORDENADA y 'd' precede a 'v'.
      'e2e/producto-terminado.spec.ts',
      'e2e/proveedores.spec.ts',
      // '-' precede a '.', igual que en pedidos.
      'e2e/recetas-pasos.spec.ts',
      'e2e/recetas.spec.ts',
      // Ver la nota de arriba (2026-10-08, QC-167). Entre `recetas` y `registro-ejecucion` porque
      // la lista esta ORDENADA: 'e' precede a 'o', y 'c' precede a 'g'.
      'e2e/recorrido-ejecucion.spec.ts',
      // Ver la nota de arriba (2026-10-06, QC-82). Va antes que `reserva-de-material` porque la
      // lista esta ORDENADA y 'g' precede a 's'.
      'e2e/registro-ejecucion.spec.ts',
      // La DECIMOCTAVA entra el 2026-09-23: ver la nota de arriba. Llega a la tabla por las listas
      // de pedidos e inventario, que ya la consumian.
      'e2e/reserva-de-material.spec.ts',
      // La QUINTA la trae QC-39 el 2026-09-08 (R50): el E2E de la pantalla de unidades localiza
      // las celdas y la fila de la tabla compartida, que es la que su lista monta (QC-39 R15).
      'e2e/unidades.spec.ts',
      // La SEPTIMA la trae QC-67 el 2026-09-11 (R42): el E2E de la pantalla de usuarios localiza las
      // celdas y la fila de la tabla compartida, que es la que su lista monta (QC-67 R9).
      'e2e/usuarios.spec.ts',
    ])
  })
})

/** La rama de QC-56: la UNICA en la que R20 y R28 miden algo. */
const RAMA_DE_QC56 = 'feature/QC-56-migrar-listas-a-tabla-compartida'

export function esLaRamaDeQC56(rama: string | null): boolean {
  return rama === RAMA_DE_QC56
}

describe('Alcance QC-56: la migracion no abre la tabla compartida (R20)', () => {
  // Mide el CAMBIO, no el arbol: R20 mira `origin/dev...HEAD` mas el arbol de trabajo, para morder
  // antes de commitear; R28 solo el rango commiteado. Si el rango no resuelve, lanza: una guardia
  // que no puede mirar no pasa en verde.
  //
  // PRECONDICION DE RAMA: solo mide en la rama de QC-56. Una vez mergeada, cualquier otra rama
  // que tuviera motivo para tocar la tabla compartida saldria roja aqui por una regla ajena.
  //
  // La senal es el NOMBRE de la rama, por igualdad exacta, como en `guard-piezas-base.test.ts`.
  // Hasta el 2026-10-08 se deducia del diff -la pagina de recetas mas algo bajo la carpeta de
  // spec de la ficha-, con la premisa de que esa carpeta solo aparece en el rango de esta rama.
  // QC-231 la desmintio: toca la pagina de recetas y enmienda este spec con todo derecho, y R20 y
  // R28 la midieron con el alcance de QC-56. Que el diff traiga archivos compartidos no dice de
  // quien es la rama. En HEAD separado (CI hace checkout del PR asi) se cae a `GITHUB_HEAD_REF`.
  // Fuera de la rama el caso queda `skipped`, con el motivo escrito.
  //
  // Los diffs de aqui NO llevan `--diff-filter=d`: solo listan nombres, no leen ningun archivo, y
  // borrar un archivo de la tabla compartida o de producto TIENE que contar como tocarlo.
  const RANGO = 'origin/dev...HEAD'
  const CARPETA_DE_LA_TABLA = 'components/shared/data-table/'
  const PAGINA_DE_RECETAS = `app/(private)${FORMULAS_ROUTE}/page.tsx`
  const CARPETA_SPEC = 'specs/QC-56-migrar-listas-a-tabla-compartida/'

  function git(comando: string): string {
    return execSync(comando, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  }

  /** La rama del checkout; en HEAD separado (CI), la rama de origen del PR. `null` si no hay. */
  function ramaActual(): string | null {
    let rama: string
    try {
      rama = git('git rev-parse --abbrev-ref HEAD').trim()
    } catch {
      return null
    }
    if (rama === 'HEAD') rama = (process.env.GITHUB_HEAD_REF ?? '').trim()
    return rama.length === 0 ? null : rama
  }

  function aPosix(ruta: string): string {
    return ruta.split('\\').join('/')
  }

  // Solo lo commiteado: el arbol de trabajo lo pueden ensuciar otros cambios en curso.
  function archivosDelRango(): readonly string[] {
    let delRango: string
    try {
      delRango = git(`git diff --name-only ${RANGO}`)
    } catch (error) {
      throw new Error(
        `No se pudo calcular el diff \`${RANGO}\`, asi que ni R20 ni R28 se han comprobado. ` +
          `Esta guardia falla en vez de pasar en silencio. Causa: ${String(error)}`,
      )
    }

    const tocados = new Set<string>()
    for (const linea of delRango.split('\n')) {
      const limpia = linea.trim()
      if (limpia.length > 0) tocados.add(aPosix(limpia))
    }
    return [...tocados].sort()
  }

  function archivosTocados(): readonly string[] {
    const tocados = new Set<string>(archivosDelRango())

    for (const linea of git('git status --porcelain').split('\n')) {
      if (linea.trim().length === 0) continue
      const camino = linea.slice(3).trim()
      const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino
      tocados.add(aPosix(destino.replace(/^"|"$/g, '')))
    }

    return [...tocados].sort()
  }

  function saltarSiNoEsLaRamaDeQC56(ctx: Pick<TestContext, 'skip'>): void {
    const rama = ramaActual()
    if (!esLaRamaDeQC56(rama)) {
      ctx.skip(
        (rama === null
          ? 'no se pudo leer la rama actual (ni con git ni por `GITHUB_HEAD_REF`)'
          : `la rama actual es '${rama}' y no '${RAMA_DE_QC56}'`) +
          ': esta NO es la rama de QC-56, asi que este caso NO ha comprobado nada, aunque el diff ' +
          `traiga \`${PAGINA_DE_RECETAS}\` o algo bajo \`${CARPETA_SPEC}\`.`,
      )
    }
  }

  describe('la senal de RAMA discrimina de verdad la rama de QC-56', () => {
    it('con el nombre exacto de su rama, es la rama de QC-56', () => {
      expect(esLaRamaDeQC56(RAMA_DE_QC56)).toBe(true)
    })

    it('es IGUALDAD, no prefijo: ni un sufijo, ni una ficha vecina, ni dev cuentan', () => {
      expect(esLaRamaDeQC56(`${RAMA_DE_QC56}-bis`)).toBe(false)
      expect(esLaRamaDeQC56('feature/QC-560-migrar-listas-a-tabla-compartida')).toBe(false)
      expect(esLaRamaDeQC56('QC-56-migrar-listas-a-tabla-compartida')).toBe(false)
      expect(esLaRamaDeQC56('dev')).toBe(false)
    })

    it('sin rama legible -HEAD separado sin GITHUB_HEAD_REF- no lo es: salta, no mide', () => {
      expect(esLaRamaDeQC56(null)).toBe(false)
      expect(esLaRamaDeQC56('HEAD')).toBe(false)
    })

    it('la rama de QC-231, que trae la pagina de recetas y enmienda el spec de QC-56, NO cuenta', () => {
      // El caso que motivo el cambio de senal, como muestra que muerde: la senal vieja -la pagina
      // de recetas mas algo bajo la carpeta de spec- daba positivo con este diff.
      const diffDeQC231 = [
        PAGINA_DE_RECETAS,
        `${CARPETA_SPEC}requirements.md`,
        'components/shared/data-table/data-table.tsx',
      ]
      const senalVieja =
        diffDeQC231.includes(PAGINA_DE_RECETAS) && diffDeQC231.some((archivo) => archivo.startsWith(CARPETA_SPEC))

      expect(senalVieja).toBe(true)
      expect(esLaRamaDeQC56('feature/QC-231-componentizacion-piezas-base')).toBe(false)
    })
  })

  it('R20: el diff de la rama no toca ningun archivo de components/shared/data-table/', (ctx) => {
    saltarSiNoEsLaRamaDeQC56(ctx)
    const tocados = archivosTocados()

    const violaciones = tocados.filter((ruta) => ruta.startsWith(CARPETA_DE_LA_TABLA))
    expect(violaciones, 'la migracion no puede modificar la tabla compartida (R20)').toEqual([])
  })

  // Lista de raices de producto, no de exclusiones: asi el board, docs/ o AGENTS.md no cuentan,
  // y cualquier raiz de codigo nueva tendria que anadirse a proposito.
  const RAICES_DE_PRODUCTO = ['app/', 'lib/', 'components/', 'hooks/', 'db/']
  const ARCHIVOS_DE_PRODUCTO = ['middleware.ts', 'package.json', 'pnpm-lock.yaml']

  function esDeProducto(ruta: string): boolean {
    return ARCHIVOS_DE_PRODUCTO.includes(ruta) || RAICES_DE_PRODUCTO.some((raiz) => ruta.startsWith(raiz))
  }

  it('R28: en el rango commiteado, fuera de las dos rutas ningun archivo de producto cambia salvo el barrel de proveedores, y nada de db/', (ctx) => {
    saltarSiNoEsLaRamaDeQC56(ctx)
    const tocados = archivosDelRango()

    const carpetasDeRuta = [`app/(private)${FORMULAS_ROUTE}/`, `app/(private)${SUPPLIERS_ROUTE}/`]
    const fuera = tocados
      .filter(esDeProducto)
      .filter((ruta) => !carpetasDeRuta.some((carpeta) => ruta.startsWith(carpeta)))

    expect(fuera, 'el unico cambio de producto fuera de las rutas es publicar la lista blanca de proveedores (R28, R31)').toEqual([
      'lib/modules/proveedores/index.ts',
    ])
    expect(
      tocados.filter((ruta) => ruta.startsWith('db/')),
      'la migracion no toca el esquema de datos (R28)',
    ).toEqual([])
  })
})
