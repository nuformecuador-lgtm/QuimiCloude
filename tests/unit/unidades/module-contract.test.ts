// T9 — Forma del modulo `unidades` y sus fronteras (QC-32).
//
// Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de los fuentes, no el
// comportamiento: que el contrato publico solo reexporte dominio, que las carpetas sean las
// tres de la guardia, que nada de servidor sea alcanzable desde el barrel, que NINGUN archivo
// del repo consulte la tabla `units`, que `inventario` y `recetas` no sepan de `unidades` mas
// que por su barrel, que el catalogo no publique ninguna conversion, y que esta ficha no
// abra ningun flujo navegable. Mismo patron —y buena parte de los mismos ayudantes— que
// `tests/unit/recetas/module-contract.test.ts` (QC-24) y
// `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// La guardia generica ya prohibe casi todo esto. Aqui queda escrito como REQUISITO de esta
// feature (`design.md > 9`, fila «Unitario») en vez de como efecto colateral de una guardia
// que manana podria cambiar de alcance.
//
// ACTUALIZADO el 2026-09-03 (ronda 3), cuando el humano retiro el aparato del seed y el
// conjunto arrancador paso a ser un `INSERT` de la migracion. Dos criterios cambiaron de
// forma —no de exigencia— y esta explicado donde cambian:
//   * «`prisma.unit` solo aparece en el adaptador driven» ya no tiene sujeto: ese adaptador
//     no existe. Ahora se afirma que NINGUN archivo del repo consulta la tabla, y el barrido
//     que lo comprueba se ejercita ademas contra una entrada SINTETICA con una consulta real,
//     para que la lista vacia no pueda ser vacia por vacuidad.
//   * «la composicion cablea el seed» se INVIERTE: ni `lib/composition` ni `scripts/seed.ts`
//     pueden nombrar un seed de unidades. Es la mitad negativa de R26.
//
// ACTUALIZADO el 2026-09-03 (ronda 4, QC-25/R50): el primer CONSUMIDOR de `UnitCatalog`
// -que esta ficha situaba en QC-38- llego antes, con QC-25: `recetas` necesita validar
// `unitId` contra el catalogo en su alta y su edicion. `adapters/driven/` deja de estar
// vacia y `lib/composition` cablea la LECTURA (`findUnitRefs`) -nunca una escritura,
// que sigue siendo QC-38-. Donde eso cambia el criterio de un test, queda anotado ahi.
//
// ACTUALIZADO el 2026-09-03 (ronda 5, QC-26): las tres aserciones que quedaban escritas
// como «esta carpeta esta vacia» codificaban el LIMITE DE ALCANCE de QC-32, no una
// invariante permanente -`design.md > 9` y la fila 4 de «Decisiones cerradas» de
// `requirements.md` mandan explicitamente que ESTA ficha le anada a `unidades` dominio,
// puerto, adaptador driven y adaptador driving-. Lo que cambia:
//   * `ports/` deja de estar vacia: tiene EXACTAMENTE `unit-repository.ts` (R40).
//   * El barrido de `prisma.unit` pasa de un adaptador permitido a EXACTAMENTE dos, los
//     dos de `adapters/driven/persistence/`: `unit-catalog-prisma.ts` (resolver ids
//     conocidos, QC-25/R50) y `unit-prisma.ts` (listar el catalogo entero, QC-26/R40).
//   * `adapters/driving/` deja de estar vacia: tiene EXACTAMENTE `unit-actions.ts`, que
//     exporta EXACTAMENTE `listUnitsAction` y ninguna otra funcion -R44 prohibe que esta
//     ficha anada crear, editar o borrar unidades, eso es QC-38-, y `'use server'` deja
//     de estar prohibido en TODO el modulo para estarlo en TODO menos ese archivo.
//   * La asercion «ningun archivo de `app/` conoce el modulo unidades» se INVIERTE a «solo
//     puede conocerlo por su adaptador driving de listado o por el barrel, nunca por ruta
//     profunda a dominio, puertos o un adaptador driven»: es la forma util de R43 ahora
//     que el formulario de recetas de esta misma ficha importa `listUnitsAction`.
// Lo que NO cambia: `app/api/units`, `app/api/unidades`, `app/(private)/unidades` y
// `app/(private)/units` siguen sin poder existir -no hay pantalla de UNIDADES, sigue
// siendo QC-38/QC-39-, y ninguna operacion de escritura de unidades puede aparecer en
// ningun archivo del modulo.
//
// ACTUALIZADO el 2026-09-08 (ronda 6, QC-38, T10): esta ronda la abre la propia ficha QC-38,
// que la ronda 5 citaba por nombre como el limite de alcance que se quedaba fuera -«eso es
// QC-38»-. Ahora QC-38 YA IMPLEMENTO el alta, la edicion y el borrado (T7, T8, T9) y tres
// centinelas que codificaban ese limite de alcance quedan OBSOLETOS EN SU FORMA, no en su
// exigencia de exactitud -las tres listas SIGUEN siendo listas EXACTAS, solo que con el
// contenido correcto de hoy-:
//   * `ports/` deja de tener EXACTAMENTE dos fuentes para tener EXACTAMENTE tres: se suma
//     `unit-write-repository.ts` (T6), el puerto de las cinco operaciones de escritura.
//   * El barrido de `prisma.unit` deja de aceptar EXACTAMENTE dos adaptadores para aceptar
//     EXACTAMENTE tres: se suma `unit-write-prisma.ts` (T8), el UNICO archivo del modulo
//     autorizado a invocar `create`/`updateMany`/`deleteMany`/`findUnique`/`count` sobre
//     `prisma.unit`. Los dos que ya estaban -`unit-catalog-prisma.ts`, `unit-prisma.ts`- no
//     se tocan.
//   * `adapters/driving/unit-actions.ts` sigue siendo el UNICO archivo de `adapters/driving/`,
//     pero deja de exportar EXACTAMENTE `listUnitsAction` para exportar EXACTAMENTE
//     `listUnitsAction`, `createUnitAction`, `updateUnitAction` y `deleteUnitAction` (T9). La
//     prohibicion de los identificadores `createUnit`/`updateUnit`/`deleteUnit` en TODO el
//     modulo -que era la mitad negativa de R44 mientras QC-38 no existia- se INVIERTE a una
//     comprobacion POSITIVA: esos tres SI tienen que existir, y exactamente en `domain/
//     create-unit.ts`, `domain/update-unit.ts`, `domain/delete-unit.ts` (donde son el nombre
//     de la funcion que crea el caso de uso) y en `adapters/driving/unit-actions.ts` (donde
//     son la llamada al caso de uso via `@/lib/composition`); en cualquier OTRO archivo del
//     modulo siguen prohibidos, y `renameUnit` -que no existe en esta ficha- sigue prohibido
//     en todos. La misma inversion aplica a la escritura de `prisma.unit`: antes NINGUN
//     archivo podia hacerla, ahora EXACTAMENTE `unit-write-prisma.ts` tiene que hacerla y
//     ningun otro. Y la mitad negativa de R26 sobre `lib/composition` -que antes prohibia
//     nombrar `createUnit`/`updateUnit`/`deleteUnit`- se invierte igual: la composicion
//     AHORA TIENE que cablear las tres, con `unit-write-prisma.ts` y `UnitWriteRepository`,
//     porque eso es exactamente lo que pide R1/R7 de QC-38.
// Lo que NO cambia en esta ronda: `index.ts` sigue sin reexportar ninguna action ni contener
// `'use server'` en su cierre de imports (R31), y ninguna de las cuatro rutas de `app/`
// prohibidas nace con esta ficha (siguen siendo QC-38/QC-39 para la PANTALLA, no para el
// dato).
//
// Cubre R4, R14, R15, R16, R17, R19, R26 (su mitad negativa), R27, R40, R43 y R44.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { IncompatibleUnitsError, convertQuantity, normalizeUnitName } from '@/lib/modules/unidades'

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
const unidadesDir = join(repoRoot, 'lib', 'modules', 'unidades')
const inventarioDir = join(repoRoot, 'lib', 'modules', 'inventario')
const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
}

function etiqueta(file: string): string {
  return toPosix(relative(repoRoot, file))
}

/** Todos los archivos bajo `dir`, recursivamente. Rutas absolutas. */
function filesIn(dir: string): readonly string[] {
  if (!existsSync(dir)) return []
  const salida: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) salida.push(...filesIn(full))
    else salida.push(full)
  }
  return salida.sort()
}

/** Solo fuentes TypeScript: los `.gitkeep` del armazon no son codigo. */
function sourcesIn(dir: string): readonly string[] {
  return filesIn(dir).filter((file) => /\.tsx?$/.test(file))
}

/**
 * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. Es el mismo ayudante
 * que usa `tests/unit/recetas/module-contract.test.ts` y no es un detalle cosmetico en esta
 * ficha: hay comentarios en el repo que contienen el texto `prisma.unit` para explicar
 * precisamente quien puede escribirlo —`lib/modules/unidades/domain/unit-catalog.ts` dice que
 * el `UnitCatalog` lo implementara «un adaptador driven DE UNIDADES, el unico que puede tocar
 * `prisma.unit`»—, y este mismo archivo lo escribe varias veces en prosa. Un barrido sobre el
 * texto crudo leeria la ADVERTENCIA como la INFRACCION y este test no vigilaria nada,
 * molestaria.
 *
 * Se quitan los bloques `/* ... *\/` y todo lo que siga a `//` en cada linea. El unico falso
 * negativo posible seria un `prisma.unit` escondido detras de un `//` dentro de una cadena
 * (p. ej. una URL), y en ese caso no seria una consulta a la tabla igualmente.
 */
function read(file: string): string {
  return leerFuente(readFileSync(file, 'utf8'))
}

/** La parte pura de `read`, para poder probar el criterio con fuentes sinteticos. */
export function leerFuente(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Los metodos con los que Prisma consulta una tabla. Lista cerrada a proposito: es lo que
 *  distingue `db.unit.findMany(...)` —una consulta— de `candidate.unit.name`, que es un campo
 *  de un objeto del dominio. Ese segundo caso existio hasta el 2026-09-03 en
 *  `lib/modules/unidades/domain/seed-units.ts`; el archivo se retiro con el seed, pero el
 *  predicado tiene que seguir distinguiendolo: el dia que QC-38 escriba un caso de uso que
 *  reciba `{ unit }` y lea `unit.name`, el barrido no puede ponerse rojo por eso. */
const METODOS_DE_PRISMA =
  'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy'

/**
 * ¿Este fuente CONSULTA la tabla de unidades? Dos formas cuentan, y las dos son acceso real
 * al delegado, no texto: comentarios fuera (ver `leerFuente`).
 *
 * 1. `prisma.unit...` — el cliente compartido, sobre cualquier receptor llamado `prisma`.
 * 2. `<lo que sea>.unit.<metodo de Prisma>(...)` — el delegado sobre un receptor con otro
 *    nombre. Hizo falta cuando el adaptador driven del seed consultaba sobre su parametro
 *    (`db.unit.findMany`), y se queda ahora que ese adaptador no existe: sin esta segunda
 *    forma, R15/R16 podrian incumplirse en cualquier archivo con solo renombrar el receptor,
 *    y el barrido de abajo quedaria verde por vacio.
 *
 * NO cuenta un modelo distinto cuyo nombre EMPIECE por `unit` —`prisma.units`,
 * `prisma.unitConversion`—: serian otra tabla. Ni el acceso a un campo `unit` de un objeto
 * del dominio, que no lleva metodo de Prisma detras.
 */
export function consultaTablaDeUnidades(texto: string): boolean {
  const codigo = leerFuente(texto)
  const clienteCompartido = /\bprisma\s*\.\s*unit(?![A-Za-z0-9_])/
  const delegadoSobreOtroReceptor = new RegExp(
    `[A-Za-z0-9_$]\\s*\\.\\s*unit\\s*\\.\\s*(?:${METODOS_DE_PRISMA})\\s*[(<]`,
  )
  return clienteCompartido.test(codigo) || delegadoSobreOtroReceptor.test(codigo)
}

/** Especificadores de import/reexport de un fuente (`from '...'` y `import '...'`). */
function importSpecifiers(source: string): readonly string[] {
  const specs = new Set<string>()
  for (const match of source.matchAll(/\bfrom\s+'([^']+)'/g)) specs.add(match[1] as string)
  for (const match of source.matchAll(/\bimport\s+'([^']+)'/g)) specs.add(match[1] as string)
  return [...specs]
}

/** Resuelve un especificador RELATIVO a un archivo real. Los no relativos devuelven null. */
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = join(dirname(fromFile), spec)
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`import relativo sin destino: ${spec} desde ${toPosix(fromFile)}`)
}

/** Cierre transitivo de imports relativos desde un archivo, el archivo incluido. */
function reachableFrom(entry: string): readonly string[] {
  const vistos = new Set<string>([entry])
  const pendientes = [entry]
  while (pendientes.length > 0) {
    const file = pendientes.pop() as string
    for (const spec of importSpecifiers(read(file))) {
      const destino = resolveRelative(file, spec)
      if (destino === null || vistos.has(destino)) continue
      vistos.add(destino)
      pendientes.push(destino)
    }
  }
  return [...vistos].sort()
}

const barrel = join(unidadesDir, 'index.ts')
const unidadesSources = sourcesIn(unidadesDir)
const migrationsDir = join(repoRoot, 'db', 'migrations')

/** Todo el codigo de aplicacion del repo, mas los scripts: donde podria esconderse una
 *  consulta a `units`. Incluye `lib/modules/unidades`: desde la ronda 3 tampoco el propio
 *  modulo tiene un sitio donde consultarla. */
const todoElCodigo = [
  ...sourcesIn(join(repoRoot, 'lib')),
  ...sourcesIn(join(repoRoot, 'app')),
  ...sourcesIn(join(repoRoot, 'components')),
  ...sourcesIn(join(repoRoot, 'hooks')),
  ...sourcesIn(join(repoRoot, 'scripts')),
  ...['middleware.ts'].map((f) => join(repoRoot, f)).filter((f) => existsSync(f)),
]

/** Una entrada del barrido: el nombre con el que se reporta, y el texto del fuente. */
export type EntradaDeBarrido = { readonly nombre: string; readonly fuente: string }

/**
 * El BARRIDO, como funcion pura: de una lista de fuentes devuelve los nombres de los que
 * consultan la tabla de unidades, en el orden recibido.
 *
 * Se extrae a una funcion —en vez de filtrar la lista de archivos en el sitio— para poder
 * aplicarla DOS veces en el mismo test: a los archivos reales del repo (donde la respuesta
 * correcta es la lista vacia) y a esos mismos archivos MAS una entrada sintetica con una
 * consulta de verdad. Sin la segunda pasada, la primera seria un `toEqual([])` que tambien
 * saldria verde si el barrido no leyera nada.
 */
export function nombresQueConsultanUnidades(
  entradas: readonly EntradaDeBarrido[],
): readonly string[] {
  return entradas.filter((entrada) => consultaTablaDeUnidades(entrada.fuente)).map((e) => e.nombre)
}

/** Los archivos reales del repo, ya leidos, como entradas del barrido. */
const entradasReales: readonly EntradaDeBarrido[] = todoElCodigo.map((file) => ({
  nombre: etiqueta(file),
  fuente: readFileSync(file, 'utf8'),
}))

describe('lib/modules/unidades — forma del modulo, fronteras y limite de alcance', () => {
  it("el modulo unidades tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R17: el modulo nace con la forma hexagonal del repositorio (`design.md > 5.1`).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/unidades/index.ts').toBe(true)

    const carpetas = readdirSync(unidadesDir)
      .filter((name) => statSync(join(unidadesDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    expect(
      readdirSync(join(unidadesDir, 'adapters'))
        .filter((name) => statSync(join(unidadesDir, 'adapters', name)).isDirectory())
        .sort(),
    ).toEqual(['driven', 'driving'])

    // `ports/` YA NO esta vacia (ACTUALIZADO 2026-09-03, ronda 5, QC-26): esta ficha le
    // anade `UnitRepository`, el puerto que pide el UNICO adaptador driving del modulo
    // para listar el catalogo entero (R40). El contrato de RESOLUCION de ids conocidos
    // (`UnitCatalog`, el que usa `recetas`) se mantiene en `domain/`, sin cambios -mismo
    // criterio que `ProductCatalog` de `inventario`-.
    //
    // Se afirma la lista EXACTA, no que "algo" haya: si manana alguien anade un segundo
    // puerto sin que este test lo sepa, la lista real diverge del `toEqual` y cae.
    //
    // ACTUALIZADO 2026-09-04 (QC-57, T7): se suma `list-query-log.ts`, el puerto del log del
    // campo omitido (R6), declarado en los CINCO modulos con listado porque el dominio no
    // puede importar `lib/shared/**`. Sigue siendo la lista EXACTA: un tercer puerto cae aqui.
    //
    // ACTUALIZADO 2026-09-08 (ronda 6, QC-38, T6/T10): se suma `unit-write-repository.ts`, el
    // puerto de las cinco operaciones de escritura (`create`, `update`, `deleteById`,
    // `findOwnership`, `hasDerivedUnits`) que piden `create-unit.ts`, `update-unit.ts` y
    // `delete-unit.ts`. La lista sigue siendo EXACTA -ahora de TRES-: un cuarto puerto cae
    // aqui igual que caia el tercero.
    expect(sourcesIn(join(unidadesDir, 'ports')).map(etiqueta), 'ports/ ya no tiene EXACTAMENTE tres fuentes').toEqual([
      'lib/modules/unidades/ports/list-query-log.ts',
      'lib/modules/unidades/ports/unit-repository.ts',
      'lib/modules/unidades/ports/unit-write-repository.ts',
    ])
    expect(
      readdirSync(join(unidadesDir, 'ports')).sort(),
      'ports/ deberia tener exactamente .gitkeep, list-query-log.ts, unit-repository.ts y unit-write-repository.ts',
    ).toEqual(['.gitkeep', 'list-query-log.ts', 'unit-repository.ts', 'unit-write-repository.ts'])

    // ACTUALIZADO 2026-09-03 (QC-25, R50): `adapters/driven/` YA NO esta vacia. El
    // consumidor que esta ronda anticipaba para QC-38 llego antes, con QC-25: `recetas`
    // necesita validar `unitId` contra el catalogo en el alta y en la edicion, asi que
    // implementa `unit-catalog-prisma.ts` -uno de los DOS unicos archivos del repo que
    // consultan `prisma.unit`, ver el test de barrido mas abajo-.

    // El contrato solo reexporta de `./domain`: ni puertos, ni adaptadores, ni nada de fuera.
    const contrato = read(barrel)
    const specs = importSpecifiers(contrato)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec, `el barrel no puede reexportar de ${spec}`).toMatch(/^\.\/domain(\/|$)/)
    }
    expect(contrato, 'el barrel reexporta de ./ports').not.toMatch(/from '\.\/ports/)
    expect(contrato, 'el barrel reexporta de ./adapters').not.toMatch(/from '\.\/adapters/)

    // Cierre transitivo del barrel: nada de servidor. Un componente de cliente tiene que
    // poder importar `@/lib/modules/unidades` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(1)
    for (const file of alcanzables) {
      // El barrel solo alcanza DOMINIO y, transitivamente, los PUERTOS que el dominio
      // declara -son la interfaz que el dominio publica hacia su implementacion, pura
      // firma sin framework, tan importable desde cliente como el propio dominio-. Lo que
      // sigue prohibido es un ADAPTADOR: ese si arrastra Prisma, Next o `'use server'`.
      //
      // ACTUALIZADO 2026-09-03 (ronda 5, QC-26): `ports/` dejo de estar vacia y
      // `domain/list-units.ts` importa `UnitRepository` de forma relativa (`../ports/
      // unit-repository`), asi que ese puerto entra al cierre transitivo del barrel a
      // proposito. La regla se estrecha de «ni puertos ni adaptadores» a «ningun
      // adaptador»; los chequeos de abajo (sin 'use server', sin @prisma/client, sin
      // next/react, sin consultar `prisma.unit`) siguen aplicandose IGUAL a `ports/`, asi
      // que un puerto que se saliera de ser una interfaz pura seguiria cayendo ahi.
      expect(
        toPosix(relative(unidadesDir, file)),
        `${etiqueta(file)} vive en adapters/ y es alcanzable desde el barrel`,
      ).not.toMatch(/^adapters\//)
    }
    for (const file of alcanzables) {
      const source = read(file)
      const nombre = etiqueta(file)
      expect(source, `${nombre} declara 'use server' y es alcanzable desde el barrel`).not.toMatch(
        /['"]use server['"]/,
      )
      expect(source, `${nombre} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      expect(source, `${nombre} importa next/*`).not.toMatch(/from\s+'next(\/|')/)
      expect(source, `${nombre} importa react`).not.toMatch(/from\s+'react/)
      // El dominio no depende de `lib/shared`: si lo necesitara, lo pediria por un puerto.
      expect(source, `${nombre} importa @/lib/shared`).not.toMatch(/@\/lib\/shared/)
      // Ni de la composicion, que es quien ata los puertos, no quien los usa.
      expect(source, `${nombre} importa @/lib/composition`).not.toMatch(/@\/lib\/composition/)
      // Ni consulta la tabla: el dominio no sabe que existe Prisma.
      expect(consultaTablaDeUnidades(source), `${nombre} consulta prisma.unit`).toBe(false)
    }
  })

  it('a lo sumo los adaptadores driven de unidades consultan la tabla de unidades, y el barrido lo demuestra sobre una consulta real', () => {
    // R15 y R16, leidos al dia de hoy. El criterio de las rondas 1 y 2 era «`prisma.unit`
    // aparece EXACTAMENTE en el adaptador driven de `unidades` y en ninguno mas». Ese
    // adaptador se retiro el 2026-09-03 con el aparato del seed y la ronda 3 endurecio el
    // criterio a NINGUNO -no habia consumidor todavia-.
    //
    // ACTUALIZADO 2026-09-03 (QC-25, R50): el consumidor que esta ronda situaba en QC-38
    // llego antes, con QC-25 -`recetas` necesita validar `unitId` en el alta y en la
    // edicion-, asi que el criterio vuelve a ser el de las rondas 1 y 2: EXACTAMENTE
    // `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`, y ningun
    // otro archivo.
    //
    // ACTUALIZADO 2026-09-03 (ronda 5, QC-26): el conjunto permitido pasa de UNO a
    // EXACTAMENTE DOS, los dos de `adapters/driven/persistence/`: `unit-catalog-prisma.ts`
    // (resolver ids conocidos para `recetas`, QC-25/R50, sin cambios) y `unit-prisma.ts`
    // (listar el catalogo entero para el adaptador driving de esta ficha, QC-26/R40). El
    // orden es alfabetico por ruta -asi es como recorre `filesIn`-, no de aparicion.
    //
    // ACTUALIZADO 2026-09-08 (ronda 6, QC-38, T8/T10): el conjunto permitido pasa de DOS a
    // EXACTAMENTE TRES: se suma `unit-write-prisma.ts`, el UNICO adaptador driven de esta
    // ficha que implementa `UnitWriteRepository` (`create`, `update`, `deleteById`,
    // `findOwnership`, `hasDerivedUnits`). Sigue en orden alfabetico por ruta -
    // `unit-catalog-prisma.ts` < `unit-prisma.ts` < `unit-write-prisma.ts`-, no de aparicion.
    //
    // QUE LO VOLVERIA ROJO: cualquier `prisma.unit.<metodo>` o `<receptor>.unit.<metodo>` en
    // OTRO archivo de `lib`, `app`, `components`, `hooks`, `scripts` o `middleware.ts`
    // -`lib/composition` incluido, que solo puede REFERENCIAR `findUnitRefs`, `listUnits` y
    // las cinco funciones de `unit-write-prisma.ts`, nunca consultar la tabla por su cuenta-.
    const ADAPTADOR_CATALOGO = 'lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts'
    const ADAPTADOR_LISTADO = 'lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts'
    const ADAPTADOR_ESCRITURA = 'lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts'
    expect(todoElCodigo.length).toBeGreaterThan(0)
    expect(entradasReales).toHaveLength(todoElCodigo.length)
    expect(nombresQueConsultanUnidades(entradasReales)).toEqual([
      ADAPTADOR_CATALOGO,
      ADAPTADOR_LISTADO,
      ADAPTADOR_ESCRITURA,
    ])

    // Y la MISMA funcion, sobre los MISMOS archivos reales mas una entrada sintetica con una
    // consulta de verdad, devuelve los tres adaptadores permitidos MAS esa. Esto es lo que
    // sustituye al viejo «y ese archivo la consulta de verdad»: sin esta segunda pasada, el
    // `toEqual` de arriba seria verde tambien si el barrido no leyera nada o si el predicado
    // hubiera dejado de reconocer una consulta.
    const sintetico: EntradaDeBarrido = {
      nombre: '<sintetico>',
      fuente: 'export async function x(prisma: unknown) { await prisma.unit.findMany({}) }',
    }
    expect(nombresQueConsultanUnidades([...entradasReales, sintetico])).toEqual([
      ADAPTADOR_CATALOGO,
      ADAPTADOR_LISTADO,
      ADAPTADOR_ESCRITURA,
      '<sintetico>',
    ])
    // Tambien con el receptor renombrado, que es la forma por la que se escaparia: el barrido
    // no depende de que el cliente se llame `prisma`.
    const conOtroReceptor: EntradaDeBarrido = {
      nombre: '<sintetico-db>',
      fuente: 'await db.unit.create({ data })',
    }
    expect(nombresQueConsultanUnidades([...entradasReales, conOtroReceptor])).toEqual([
      ADAPTADOR_CATALOGO,
      ADAPTADOR_LISTADO,
      ADAPTADOR_ESCRITURA,
      '<sintetico-db>',
    ])
  })

  it('el criterio de «consulta prisma.unit» distingue codigo de comentario, y cae ante una consulta real', () => {
    // Un test que no puede fallar no vigila nada (`design.md > 9`). Aqui se prueba el
    // PREDICADO con fuentes sinteticos, porque de el depende todo el bloque anterior.
    // Positivos: acceso real, con o sin espacios y con cualquier metodo detras.
    expect(consultaTablaDeUnidades('await prisma.unit.findMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('const a = prisma . unit . create({})')).toBe(true)
    expect(consultaTablaDeUnidades('return tx.prisma.unit.count()')).toBe(true)
    // El delegado sobre un receptor con OTRO nombre: es como consulta hoy el adaptador, y es
    // tambien como se escaparia una consulta prohibida en otro archivo.
    expect(consultaTablaDeUnidades('await db.unit.findMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('await tx.unit.create({ data })')).toBe(true)
    expect(consultaTablaDeUnidades('await cliente . unit . deleteMany({})')).toBe(true)
    expect(consultaTablaDeUnidades('await this.db.unit.upsert({})')).toBe(true)

    // Negativos: los dos tipos de comentario que EXISTEN hoy en el repo con ese texto.
    expect(consultaTablaDeUnidades('// el unico sitio con `prisma.unit` es el adaptador')).toBe(
      false,
    )
    expect(consultaTablaDeUnidades('/** el adaptador que puede tocar `prisma.unit` */')).toBe(false)
    // Y un modelo distinto cuyo nombre empieza igual: no es la tabla `units`.
    expect(consultaTablaDeUnidades('await prisma.units.findMany({})')).toBe(false)
    expect(consultaTablaDeUnidades('await prisma.unitConversion.findMany({})')).toBe(false)
    // Y un campo `unit` de un objeto del dominio, que no es un delegado de Prisma. Este caso
    // EXISTIO hasta el 2026-09-03 en `lib/modules/unidades/domain/seed-units.ts`
    // (`candidate.unit.name`), retirado con el seed. El predicado tiene que seguir
    // distinguiendolo igual: en cuanto QC-38 escriba un caso de uso que reciba una unidad y
    // lea su nombre, un predicado mas grosero pondria el barrido rojo por algo que no es
    // R15/R16, y la respuesta seria aflojar el barrido. Se prueba aqui para que no ocurra.
    expect(consultaTablaDeUnidades('createdUnits.push(candidate.unit.name)')).toBe(false)
    expect(consultaTablaDeUnidades('const s = candidate.unit.symbol')).toBe(false)
  })

  it('inventario y recetas importan unidades solo por el barrel', () => {
    // R16: todo lo que esos dos modulos sepan de una unidad llega por
    // `@/lib/modules/unidades`. Ni dominio, ni puertos, ni adaptadores por ruta profunda.
    const ajenos = [...sourcesIn(inventarioDir), ...sourcesIn(recetasDir)]
    expect(ajenos.length).toBeGreaterThan(0)

    for (const file of ajenos) {
      const source = read(file)
      const nombre = etiqueta(file)
      expect(consultaTablaDeUnidades(source), `${nombre} consulta prisma.unit`).toBe(false)
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${nombre}: ruta profunda a unidades`).not.toMatch(
          /^@\/lib\/modules\/unidades\/./,
        )
      }
    }

    // Y el barrel es un camino REAL, no una regla vacia: `inventario` lo usa hoy (QC-32 T6).
    // El testigo era `product-catalog.ts` hasta QC-80 (R21), que le quito `unitId` a `ProductRef`
    // -sin sustituto: nadie lo consumia- y con el la unica razon que ese archivo tenia para
    // conocer `UnitId`. El testigo pasa a ser `product-view.ts`, que sigue tipando con `UnitId`
    // la unidad DERIVADA del lote mas reciente (R22).
    const porElBarrel = ajenos.filter((file) =>
      importSpecifiers(read(file)).includes('@/lib/modules/unidades'),
    )
    expect(porElBarrel.map(etiqueta)).toContain('lib/modules/inventario/domain/product-view.ts')
  })

  it('el barrel de unidades exporta normalizeUnitName', () => {
    // R4: la normalizacion tiene UNA sola definicion y la publica el contrato del modulo,
    // para que la columna `name_normalized` y cualquier consumidor futuro normalicen igual.
    // Aqui si se afirma en ejecucion: es una funcion, no un tipo.
    expect(typeof normalizeUnitName).toBe('function')
    expect(normalizeUnitName('MILI-LITRO')).toBe('mililitro')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bnormalizeUnitName\b[^}]*\} from '\.\/domain\//)

    // Y esta implementada UNA sola vez en todo el repo: una segunda copia (en un service, en
    // la migracion, en un componente) dejaria de cumplir R4.
    const definiciones = todoElCodigo
      .filter((file) => /function normalizeUnitName/.test(read(file)))
      .map(etiqueta)
    expect(definiciones).toEqual(['lib/modules/unidades/domain/unit-name.ts'])
  })

  it('el contrato de unidades PUBLICA la conversion, y UnitRef sigue teniendo exactamente id, name y symbol', () => {
    // ESTE CASO ESTA INVERTIDO A PROPOSITO — 2026-09-07, QC-76.
    //
    // QUE AFIRMABA ANTES: «el modulo unidades no expone ninguna conversion ni factor». Venia de
    // QC-32 (su R14, decision cerrada 12, `design.md > 10` de aquella ficha) y barria los
    // fuentes del modulo con una expresion regular que prohibia las palabras `factor`,
    // `convert`, `conversion`, `ratio`, `equivalen*`, `multiplier`, `toBase` y `baseUnit`.
    //
    // QUIEN LO DEROGA: QC-76, POR DISENO y no por descuido. **R22** obliga al contrato publico
    // del modulo a publicar una funcion que convierta una cantidad entre dos unidades
    // compatibles, y **R1** obliga al modelo a declarar de que unidad deriva cada una y por que
    // factor. Las dos cosas que la regla prohibia son ahora requisitos. Las decisiones cerradas
    // que lo mandan son la **2** («la equivalencia: unidad de la que deriva + factor») y la
    // **18** («nadie usa la conversion todavia; el contrato la publica»), ambas del 2026-09-07.
    //
    // QUE SOBREVIVE, y por eso el caso se REESCRIBE en vez de borrarse: (a) que el barrel siga
    // sin arrastrar servidor —la conversion es dominio PURO, asi que publicarla no puede meter
    // Prisma ni `next/*` en el cierre de imports—; y (b) que `UnitRef`, el tipo con el que los
    // demas modulos hablan de una unidad, siga teniendo EXACTAMENTE `id`, `name` y `symbol`: la
    // equivalencia vive en la tabla y en `UnitConversion`, no se cuela en la referencia que
    // consumen `inventario` y `recetas`.
    const contrato = read(barrel)

    // (1) R22 — la conversion se publica, y desde `./domain`: el barrel solo reexporta dominio.
    expect(contrato).toMatch(/export \{[^}]*\bconvertQuantity\b[^}]*\} from '\.\/domain\//)
    expect(contrato).toMatch(/export type \{[^}]*\bUnitConversion\b[^}]*\} from '\.\/domain\//)
    expect(contrato).toMatch(/export \{[^}]*\bIncompatibleUnitsError\b[^}]*\} from '\.\/domain\//)

    // Y son alcanzables de verdad, no solo una linea de texto en el barrel.
    expect(typeof convertQuantity).toBe('function')
    expect(typeof IncompatibleUnitsError).toBe('function')

    // (2) R22 — es PURA: su archivo no importa nada de servidor ni de framework. Lo transitivo
    //     lo vigila el caso del cierre de imports del barrel, mas abajo; esto es el archivo.
    const conversion = read(join(unidadesDir, 'domain', 'convert-quantity.ts'))
    for (const prohibido of ['@prisma/client', 'next/', '@/lib/shared', 'use server']) {
      expect(
        conversion,
        `convert-quantity.ts nombra ${prohibido}: la conversion dejaria de ser pura`,
      ).not.toContain(prohibido)
    }

    // (3) `UnitRef` tiene exactamente CINCO campos desde QC-26bis (2026-09-08): a los tres de
    //     QC-32 -identidad, nombre y simbolo- se sumaron `baseUnitId` y `factor`, porque el
    //     formulario de recetas necesita agrupar las unidades por su base efectiva y ese dato
    //     no salia del modulo por ningun sitio. La lista sigue siendo CERRADA y se afirma
    //     entera: lo que este test protege es que el tipo no crezca por descuido.
    //
    //     `UnitConversion` NO se funde con este tipo y sigue siendo otro tipo y otra decision
    //     (`design.md > 5.1`): describe lo que hace falta para CONVERTIR -sin nombre ni
    //     simbolo-, mientras que `UnitRef` describe lo que otro modulo sabe de una unidad.
    const unitCatalog = read(join(unidadesDir, 'domain', 'unit-catalog.ts'))
    const cuerpoUnitRef = /export type UnitRef = \{([\s\S]*?)\n\};/.exec(unitCatalog)?.[1] ?? ''
    const campos = [...cuerpoUnitRef.matchAll(/^\s*readonly (\w+)\s*:/gm)].map((m) => m[1])
    expect(campos).toEqual(['id', 'name', 'symbol', 'baseUnitId', 'factor'])

    // (4) SOBREVIVE de QC-32 — el conjunto arrancador sigue sin tabla de equivalencias
    //     ESCONDIDA: la migracion de QC-32 no se toca (R27) y su `INSERT` rellena exactamente
    //     el nombre, el nombre normalizado, el simbolo y la marca de modificacion. La
    //     equivalencia de las cuatro unidades de sistema la pone la migracion de QC-76 con un
    //     `UPDATE` (R28), y eso lo vigila `schema/unidades-migration.test.ts`.
    const arrancadores = readdirSync(migrationsDir).filter((name) =>
      name.endsWith('_units_catalog'),
    )
    expect(arrancadores, 'debe existir exactamente una migracion *_units_catalog').toHaveLength(1)
    const sqlDelArrancador = readFileSync(
      join(migrationsDir, arrancadores[0] as string, 'migration.sql'),
      'utf8',
    )
    const insert = /INSERT INTO "units"\s*\(([^)]*)\)/.exec(sqlDelArrancador)
    expect(insert, 'la migracion ya no inserta el conjunto arrancador').not.toBeNull()
    const columnasDelInsert = [
      ...((insert as RegExpExecArray)[1] as string).matchAll(/"(\w+)"/g),
    ].map((match) => match[1])
    expect(columnasDelInsert).toEqual(['name', 'name_normalized', 'symbol', 'updated_at'])
  })

  it('la unidad del producto es la columna guardada y nunca un texto (QC-32 R19)', () => {
    // ESTE CASO ESTA AMPLIADO A PROPOSITO.
    //
    // QUE AFIRMABA ANTES: que `ProductRef` -lo que otros modulos ven de un producto- se quedaba
    // SIN unidad de ninguna clase, porque en su momento nadie fuera de `inventario` la
    // necesitaba.
    //
    // QUE AFIRMA AHORA: `ProductRef` SI lleva `unitId`, la unidad guardada del producto, porque
    // ahora hay consumidores que la necesitan para convertir: el costo de una receta que reparte
    // sus insumos en porcentaje, la tabla de ingredientes de un pedido y la pantalla de
    // ejecucion del operario. Lo que la prohibicion original protegia sigue intacto: la unidad
    // se publica como REFERENCIA al catalogo (`unitId`), nunca como el campo de texto suelto
    // `unit` que este caso sigue rechazando.
    const CAMPO_UNIT_TEXTO = /\bunit\s*\??\s*:/

    // `ProductRef` -lo que otros modulos ven- lleva la referencia a la unidad guardada, y nunca
    // un campo de texto.
    const catalogo = read(join(inventarioDir, 'domain', 'product-catalog.ts'))
    expect(catalogo, 'ProductRef perdio la unidad guardada que sus consumidores necesitan').toMatch(
      /readonly unitId: string \| null/,
    )
    expect(catalogo, 'ProductRef conserva un campo `unit` de texto').not.toMatch(CAMPO_UNIT_TEXTO)

    // `ProductView` lleva la unidad guardada, tipada con `UnitId`; `NewProduct` -lo que se
    // escribe- no lleva ninguna: la unidad no se envia, se lee.
    const vista = read(join(inventarioDir, 'domain', 'product-view.ts'))
    expect(vista).toMatch(/readonly unitId: UnitId \| null/) // ProductView, columna guardada
    const nuevoProducto = vista.slice(vista.indexOf('export type NewProduct'), vista.indexOf('export type ProductView'))
    expect(nuevoProducto, 'NewProduct volvio a declarar unidad').not.toMatch(/readonly unitId/)
    expect(vista, 'ProductView/NewProduct conservan un campo `unit`').not.toMatch(CAMPO_UNIT_TEXTO)
    expect(vista).toMatch(/from '@\/lib\/modules\/unidades'/)

    // El esquema de entrada no acepta unidad de NINGUNA forma: ni referencia ni texto.
    const entrada = read(join(inventarioDir, 'domain', 'product-input.ts'))
    expect(entrada, 'el esquema zod volvio a aceptar una unidad').not.toMatch(
      /unitId:\s*unitIdSchema/,
    )
    expect(entrada, 'el esquema zod conserva un campo `unit` de texto').not.toMatch(
      CAMPO_UNIT_TEXTO,
    )
    expect(entrada, 'el esquema zod acepta la unidad como texto').not.toMatch(
      /unit:\s*z\.string\(\)/,
    )

    // Y el borde tampoco la lee del `FormData`, ni con el nombre viejo ni con el nuevo.
    const acciones = read(join(inventarioDir, 'adapters', 'driving', 'product-actions.ts'))
    expect(acciones, "la action sigue leyendo la clave 'unitId'").not.toMatch(
      /formData,\s*'unitId'/,
    )
    expect(acciones, "el formulario sigue leyendo la clave 'unit'").not.toMatch(/'unit'/)
  })

  it('la feature anade las Server Actions de escritura ademas del listado, cada operacion en su sitio y en ninguno mas', () => {
    // ESTE CASO ESTA ACTUALIZADO A PROPOSITO — 2026-09-08, ronda 6, QC-38, T10.
    //
    // QUE AFIRMABA ANTES: que esta ficha anadia UNICAMENTE la Server Action de listado y que
    // NINGUNA operacion de escritura de unidades -ni el nombre de una funcion de mutacion, ni
    // un metodo de escritura de Prisma sobre `unit`- podia aparecer en ningun archivo del
    // modulo. Eso era el limite de alcance de QC-26/QC-32, que citaba a esta misma ficha por
    // nombre («eso es QC-38») para decir donde iba a dejar de ser cierto.
    //
    // QUE AFIRMA AHORA: esta ficha ES QC-38, asi que el alta, la edicion y el borrado YA
    // EXISTEN (T7, T8, T9) y las comprobaciones se INVIERTEN de «en ningun sitio» a «en
    // exactamente estos sitios, y en ningun otro» -misma exactitud, contenido de hoy-.
    //
    // R27, R44: esta ficha es esquema, migracion —con su arrancador en SQL—, armazon del
    // modulo, su lectura del catalogo entero (R40-R42, QC-26) y ahora sus TRES escrituras
    // (R1-R30). Sigue sin haber ninguna pantalla de UNIDADES que un E2E pueda visitar
    // (decision cerrada 18/21): la pantalla que consume estas Server Actions es QC-39, que
    // queda fuera de esta ficha.
    const driving = join(unidadesDir, 'adapters', 'driving')

    // `adapters/driving/` sigue teniendo EXACTAMENTE `unit-actions.ts` -un unico archivo,
    // ahora con cuatro Server Actions en vez de una-. Lista exacta, no "algo hay".
    expect(sourcesIn(driving).map(etiqueta), 'adapters/driving/ ya no tiene EXACTAMENTE un fuente').toEqual([
      'lib/modules/unidades/adapters/driving/unit-actions.ts',
    ])
    expect(
      readdirSync(driving).sort(),
      'adapters/driving/ deberia tener exactamente .gitkeep y unit-actions.ts',
    ).toEqual(['.gitkeep', 'unit-actions.ts'])

    const unitActionsFile = join(driving, 'unit-actions.ts')
    const unitActionsSource = read(unitActionsFile)

    // Ese archivo exporta EXACTAMENTE cuatro funciones (ACTUALIZADO ronda 6, QC-38/T9): la de
    // listado que ya estaba, mas las tres nuevas de escritura. Sigue siendo una lista EXACTA:
    // una quinta funcion exportada -o el nombre de una de estas cuatro mal escrito- la pondria
    // roja igual que antes la ponia roja una segunda funcion cualquiera.
    //
    // ACTUALIZADO ronda 7 (QC-39/T2): `listUnitsAction` pasa a estar SOBRECARGADA -dos
    // declaraciones sin cuerpo mas la implementacion, `design.md > 3` de QC-39-, asi que el
    // barrido la encuentra tres veces. Se DEDUPLICA el resultado, y solo eso: el conjunto sigue
    // siendo exacto -una quinta funcion, o una de estas cuatro mal escrita, lo sigue poniendo
    // rojo- y ningun aserto se relaja. Deduplicar es lo unico que hace falta para que la
    // pregunta que este caso hace -«que funciones exporta este archivo»- siga teniendo la misma
    // respuesta con sobrecargas que sin ellas.
    const funcionesExportadas = [
      ...new Set(
        [
          ...unitActionsSource.matchAll(/export\s+async\s+function\s+(\w+)/g),
          ...unitActionsSource.matchAll(/export\s+function\s+(\w+)/g),
        ].map((m) => m[1]),
      ),
    ]
    expect(funcionesExportadas).toEqual([
      'listUnitsAction',
      'createUnitAction',
      'updateUnitAction',
      'deleteUnitAction',
    ])

    // Las operaciones de escritura de unidades -`createUnit`, `updateUnit`, `deleteUnit`- ya
    // NO estan prohibidas en el modulo: son justo lo que esta ficha construye. Lo que se
    // vigila ahora es que cada una viva SOLO donde debe: en el archivo de dominio que declara
    // el caso de uso con ese nombre, y en `unit-actions.ts`, que lo invoca via
    // `@/lib/composition`. En cualquier OTRO archivo del modulo siguen prohibidas, y
    // `renameUnit` -que no existe en esta ficha, ni falta- sigue prohibido en TODOS. Esto es
    // lo que se pondria rojo si, por ejemplo, `list-units.ts` o `unit-catalog.ts` empezaran a
    // nombrar `createUnit` sin que sea su sitio.
    const OPERACIONES_DE_ESCRITURA = ['createUnit', 'updateUnit', 'deleteUnit'] as const
    const DONDE_VIVE_CADA_ESCRITURA: Readonly<Record<string, readonly string[]>> = {
      'lib/modules/unidades/domain/create-unit.ts': ['createUnit'],
      'lib/modules/unidades/domain/update-unit.ts': ['updateUnit'],
      'lib/modules/unidades/domain/delete-unit.ts': ['deleteUnit'],
      'lib/modules/unidades/adapters/driving/unit-actions.ts': ['createUnit', 'updateUnit', 'deleteUnit'],
    }
    const METODOS_DE_ESCRITURA = 'create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany'
    const escrituraPrisma = new RegExp(
      `[A-Za-z0-9_$]\\s*\\.\\s*unit\\s*\\.\\s*(?:${METODOS_DE_ESCRITURA})\\s*[(<]`,
    )
    // El UNICO archivo autorizado a EJECUTAR una escritura de Prisma sobre `unit` (ACTUALIZADO
    // ronda 6, QC-38/T8): antes ninguno lo estaba, ahora exactamente este.
    const ADAPTADOR_ESCRITURA_FILE = 'lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts'
    for (const file of unidadesSources) {
      const source = read(file)
      const nombre = etiqueta(file)
      const permitidasAqui = DONDE_VIVE_CADA_ESCRITURA[nombre] ?? []
      for (const operacion of OPERACIONES_DE_ESCRITURA) {
        const aparece = new RegExp(`\\b${operacion}\\b`).test(source)
        if (permitidasAqui.includes(operacion)) {
          expect(aparece, `${nombre} deberia nombrar ${operacion} y no lo hace`).toBe(true)
        } else {
          expect(aparece, `${nombre} nombra ${operacion} fuera de donde deberia vivir`).toBe(false)
        }
      }
      expect(source, `${nombre} nombra renameUnit, que no existe en esta ficha`).not.toMatch(
        /\brenameUnit\b/,
      )
      if (nombre === ADAPTADOR_ESCRITURA_FILE) {
        expect(
          escrituraPrisma.test(source),
          `${nombre} deberia escribir la tabla de unidades por Prisma y no lo hace`,
        ).toBe(true)
      } else {
        expect(source, `${nombre} escribe la tabla de unidades por Prisma`).not.toMatch(
          escrituraPrisma,
        )
      }
    }

    // `'use server'` YA NO esta prohibido en TODO el modulo (ronda 3): el unico adaptador
    // driving lo necesita para ser una Server Action. Lo que sigue prohibido es que aparezca
    // en OTRO archivo -eso volveria alcanzable desde el barrel algo de servidor, o abriria
    // una segunda Server Action sin pasar por esta ficha-.
    for (const file of unidadesSources) {
      const nombre = etiqueta(file)
      if (file === unitActionsFile) {
        expect(unitActionsSource, `${nombre} deberia declarar 'use server'`).toMatch(
          /['"]use server['"]/,
        )
        continue
      }
      expect(read(file), `${nombre} declara 'use server' fuera de unit-actions.ts`).not.toMatch(
        /['"]use server['"]/,
      )
    }

    // Ninguna ruta HTTP ni pantalla de UNIDADES: sigue sin haber una pantalla de unidades,
    // la que SI abre esta ficha es la de recetas (QC-38/QC-39 para la de unidades).
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'units'),
      join(repoRoot, 'app', 'api', 'unidades'),
      join(repoRoot, 'app', '(private)', 'unidades'),
      join(repoRoot, 'app', '(private)', 'units'),
    ]) {
      expect(existsSync(ruta), `${etiqueta(ruta)} no debe existir`).toBe(false)
    }

    // ACTUALIZADO 2026-09-03 (ronda 5, QC-26): la vieja asercion «ningun archivo de `app/`
    // conoce el modulo unidades» hoy pasaba pero se iba a poner roja en la siguiente tanda a
    // proposito -el formulario de recetas de esta misma ficha importa `listUnitsAction`,
    // que es exactamente lo que R43 manda-. Se retensa: `app/` puede importar `unidades`
    // SOLO por el adaptador driving de listado o por el barrel, nunca por ruta profunda a
    // `domain/`, `ports/` ni a un adaptador DRIVEN, ni instanciando ese adaptador, ni
    // tocando `prisma` directamente.
    const IMPORT_PERMITIDO_DE_UNIDADES = /^@\/lib\/modules\/unidades(\/adapters\/driving\/unit-actions)?$/
    for (const file of sourcesIn(join(repoRoot, 'app'))) {
      const source = read(file)
      const nombre = etiqueta(file)
      for (const spec of importSpecifiers(source)) {
        if (!spec.startsWith('@/lib/modules/unidades')) continue
        expect(spec, `${nombre}: importa unidades por una ruta que no es el barrel ni la Server Action de listado`).toMatch(
          IMPORT_PERMITIDO_DE_UNIDADES,
        )
      }
      expect(consultaTablaDeUnidades(source), `${nombre} consulta prisma.unit`).toBe(false)
    }

    // MITAD NEGATIVA DE R26 para el SEED, sin cambios en esta ronda: desde el 2026-09-03
    // `lib/composition` no cablea ningun SEED de `unidades` (`design.md > 5.4`, anulada) y
    // `scripts/seed.ts` vuelve a hablar solo de roles y usuario inicial (QC-6): no hay seed de
    // aplicacion que cree, actualice o pise unidades del catalogo. Esta es la asercion que se
    // pone roja si alguien reintroduce ese aparato por la puerta de atras.
    //
    // ACTUALIZADO 2026-09-03 (QC-25, R50): esto NO incluye la LECTURA. `lib/composition`
    // SI cablea `UnitCatalog` -con el adaptador driven de arriba- para que `recetas` pueda
    // validar `unitId`.
    const composicion = sourcesIn(join(repoRoot, 'lib', 'composition'))
      .map((file) => read(file))
      .join('\n')
    expect(composicion.length).toBeGreaterThan(0)
    expect(composicion, 'la composicion volvio a cablear un seed de unidades').not.toMatch(
      /STARTER_UNITS|[sS]eedStarterUnits|[uU]nitSeedRepository|unit-seed-repository|seed-units/,
    )
    expect(composicion, 'la composicion cablea la LECTURA de unidades (UnitCatalog, R50)').toMatch(
      /findUnitRefs/,
    )
    // ACTUALIZADO 2026-09-03 (ronda 5, QC-26): esto TAMPOCO incluye ya solo `findUnitRefs`
    // -R40 anade una SEGUNDA lectura, el listado completo para la pantalla de recetas-.
    // `lib/composition` cablea `UnitRepository` (el puerto de esta ficha) con
    // `unit-prisma.ts` (su unico adaptador driven).
    expect(composicion, 'la composicion cablea la LECTURA de unidades (UnitRepository, R40)').toMatch(
      /listUnits/,
    )

    // ACTUALIZADO 2026-09-08 (ronda 6, QC-38, T9/T10): antes la lista de puertos/adaptadores
    // permitidos era SOLO la de LECTURA -`unit-catalog-prisma`, `unit-prisma`,
    // `unit-repository`, `list-query-log`- y cualquier otro caia aqui, incluida CUALQUIER
    // escritura (`createUnit|updateUnit|deleteUnit`), que estaba explicitamente prohibida.
    // Esta ficha ES esa escritura, asi que las dos aserciones se invierten:
    //   * el conjunto permitido de puertos/adaptadores SUMA `unit-write-prisma` (adaptador) y
    //     `unit-write-repository` (puerto) a los cuatro de lectura; sigue siendo una lista
    //     EXACTA, ahora de seis en vez de cuatro, y un septimo puerto o adaptador -o el
    //     DRIVING, que sigue prohibido por separado dos lineas mas abajo- vuelve a caer aqui.
    //   * `lib/composition` ya NO puede dejar de nombrar `createUnit`/`updateUnit`/
    //     `deleteUnit`: ahora TIENE que cablear los tres, con `UnitWriteRepository` y
    //     `unit-write-prisma.ts`, porque son el puerto y el adaptador de escritura de R1/R7.
    expect(composicion, 'la composicion nombra un puerto o adaptador de unidades fuera de los de lectura y escritura')
      .not.toMatch(
        /modules\/unidades\/(adapters(?!\/driven\/persistence\/(unit-catalog-prisma|unit-prisma|unit-write-prisma))|ports(?!\/(unit-repository|list-query-log|unit-write-repository)))/,
      )
    expect(composicion, 'la composicion importa el adaptador driving de unidades').not.toMatch(
      /modules\/unidades\/adapters\/driving/,
    )
    expect(composicion, 'la composicion deberia cablear el adaptador de escritura unit-write-prisma').toMatch(
      /unit-write-prisma/,
    )
    expect(composicion, 'la composicion deberia cablear el puerto de escritura UnitWriteRepository').toMatch(
      /UnitWriteRepository/,
    )
    expect(composicion, 'la composicion deberia cablear la ESCRITURA de unidades (alta, QC-38/R1)').toMatch(
      /\bcreateUnit:/,
    )
    expect(composicion, 'la composicion deberia cablear la ESCRITURA de unidades (edicion, QC-38/R1)').toMatch(
      /\bupdateUnit:/,
    )
    expect(composicion, 'la composicion deberia cablear la ESCRITURA de unidades (borrado, QC-38/R1)').toMatch(
      /\bdeleteUnit:/,
    )

    // Y `db:seed` no sabe de unidades: el catalogo nace con su migracion, no con este script.
    const seedScript = read(join(repoRoot, 'scripts', 'seed.ts'))
    expect(seedScript.length).toBeGreaterThan(0)
    expect(seedScript, 'scripts/seed.ts volvio a sembrar unidades').not.toMatch(/unidades|unit/i)
  })
})
