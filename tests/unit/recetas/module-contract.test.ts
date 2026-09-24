// T10 — Forma del modulo `recetas` y frontera con `inventario` (QC-24).
//
// `recetas` es el primer modulo hexagonal que este repo crea desde cero: `identity` e
// `inventario` los sembro QC-15. Lo que se vigila aqui es el ARBOL DE ARCHIVOS y el TEXTO de
// los fuentes, no el comportamiento —no hay comportamiento todavia—: que el contrato publico
// solo reexporte dominio, que las carpetas sean las tres de la guardia, que nada de servidor
// sea alcanzable desde el barrel, y que `recetas` no sepa nada de la tabla `products`.
//
// La guardia `tests/guards/guard-arquitectura-modulos.test.ts` ya prohibe casi todo esto de
// forma generica. Aqui se deja escrito como REQUISITO de esta feature (R18, R20, R31) en vez
// de como efecto colateral de una guardia que manana podria cambiar de alcance
// (`design.md` seccion 5.3).
//
// Cubre R18, R20, R31, y refuerza R8.
//
// ACTUALIZADO 2026-09-03 (QC-26): el ultimo caso afirmaba «la feature no anade ninguna
// pantalla ni route handler bajo app/» y, como mitad positiva de esa frase, que NINGUN
// archivo de `app/` mencionara «receta»/«recipe». Esa mitad codificaba el LIMITE DE ALCANCE
// de QC-25 -«la pantalla es QC-26»-, no una propiedad del MODULO: QC-26 llego y monto la
// pantalla de recetas, que por definicion menciona «receta» por todas partes DENTRO de la
// carpeta que declara `FORMULAS_ROUTE`, y eso no es una violacion de este contrato -es su
// objeto-. Lo que este archivo vigila de verdad es la forma de `lib/modules/recetas`, y eso
// NO cambio: el caso se retensa para seguir garantizando que QC-26 no toca
// `lib/modules/recetas/**` -comprobado sobre el DIFF DE LA RAMA, no con un censo literal del
// arbol de un modulo ajeno, que congelaria a `recetas` y volveria roja a QC-26 en cuanto
// aquel creciera- y que sigue sin existir ningun route handler de recetas bajo `app/api/`
// -esa mitad SI sigue siendo una invariante del modulo, y se conserva igual-. Se conserva ademas, en forma mas estrecha,
// la mitad de la vieja asercion que SI seguia siendo una invariante util: ningun archivo de
// `app/` FUERA de esa carpeta menciona recetas -mismo criterio de ubicacion que vigila
// `tests/unit/recetas/scope.test.ts`, aqui como defensa redundante desde el angulo del
// modulo en vez del angulo de la pantalla.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeRecipeName } from '@/lib/modules/recetas'
import { FORMULAS_ROUTE } from '@/lib/shared/routes'

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
const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')
const inventarioDir = join(repoRoot, 'lib', 'modules', 'inventario')

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/')
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
 * Fuente SIN comentarios: lo que se vigila es el codigo, no la prosa.
 *
 * No es un detalle: la cabecera del propio contrato de `recetas` dice «nada de 'use server',
 * @prisma/client ni next/*», y un barrido sobre el texto crudo la leeria como una violacion.
 * Un test que confunde la advertencia con la infraccion no vigila nada, molesta.
 */
function read(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
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

const barrel = join(recetasDir, 'index.ts')
const recetasSources = sourcesIn(recetasDir)

describe('lib/modules/recetas — forma del modulo y frontera con inventario', () => {
  it("el modulo recetas tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel", () => {
    // R20: el modulo nace con la forma hexagonal del repositorio (`design.md` seccion 5.1).
    expect(existsSync(barrel), 'falta el contrato publico lib/modules/recetas/index.ts').toBe(true)

    // Las carpetas de primer nivel son EXACTAMENTE las tres que admite la guardia.
    const carpetas = readdirSync(recetasDir)
      .filter((name) => statSync(join(recetasDir, name)).isDirectory())
      .sort()
    expect(carpetas).toEqual(['adapters', 'domain', 'ports'])
    // Y dentro de `adapters`, los dos lados de siempre.
    expect(
      readdirSync(join(recetasDir, 'adapters'))
        .filter((name) => statSync(join(recetasDir, 'adapters', name)).isDirectory())
        .sort(),
    ).toEqual(['driven', 'driving'])

    // El contrato solo reexporta de `./domain`: ni adaptadores, ni puertos, ni nada de fuera.
    const contrato = read(barrel)
    const specs = importSpecifiers(contrato)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec, `el barrel no puede reexportar de ${spec}`).toMatch(/^\.\/domain(\/|$)/)
    }

    // Cierre transitivo del barrel: nada de servidor. Un componente de cliente tiene que
    // poder importar `@/lib/modules/recetas` sin arrastrar Prisma ni Next.
    const alcanzables = reachableFrom(barrel)
    expect(alcanzables.length).toBeGreaterThan(1)
    for (const file of alcanzables) {
      const source = read(file)
      const etiqueta = toPosix(relative(repoRoot, file))
      expect(source, `${etiqueta} declara 'use server' y es alcanzable desde el barrel`).not.toMatch(
        /['"]use server['"]/,
      )
      expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      expect(source, `${etiqueta} importa next/*`).not.toMatch(/from\s+'next(\/|')/)
      expect(source, `${etiqueta} importa react`).not.toMatch(/from\s+'react/)
      // El dominio no depende de `lib/shared`: si lo necesitara, lo pediria por un puerto.
      expect(source, `${etiqueta} importa @/lib/shared`).not.toMatch(/@\/lib\/shared/)
      // Ni de la composicion, que es quien ata los puertos, no quien los usa.
      expect(source, `${etiqueta} importa @/lib/composition`).not.toMatch(/@\/lib\/composition/)
    }
  })

  it('lib/modules/recetas no contiene prisma.product, @prisma/client fuera de su unico adaptador ni rutas profundas a inventario', () => {
    // R18: todo lo que `recetas` sepa del producto llega por el contrato publico de
    // `inventario`. Se barre TODO el modulo, no solo lo alcanzable desde el barrel: un
    // adaptador driven que consultara `prisma.product` violaria R18 igual (`design.md` 5.3).
    //
    // AJUSTE T10 (QC-25, Grupo C): `prisma.product` sigue prohibido en TODO el modulo sin
    // excepcion. `@prisma/client` en cambio SI tiene una excepcion, unica y nombrada por
    // el propio `design.md > 1` y `> 7.3`: `adapters/driven/persistence/recipe-prisma.ts`
    // es "el UNICO archivo del modulo que importa `@prisma/client`" -es el adaptador de
    // persistencia de `Recipe`/`RecipeLine`, modelos que `recetas` SI posee (`@module
    // recetas` en `db/schema.prisma`)-. Prohibirlo aqui por completo chocaria con ese
    // requisito de diseno; la guardia real de "solo un archivo lo importa" la vigila
    // `tests/guards/guard-arquitectura-modulos.test.ts` (bloque 10, propiedad de modelos).
    //
    // RETENSADO 2026-09-16 (QC-50, T8). `@prisma/client` pasa a importarlo un archivo mas, y
    // solo por su TIPO: `company-scope.ts` publica el ambito como `Prisma.RecipeWhereInput`, que
    // es justo lo que hace que componerlo sobre otra tabla no compile (`design.md`). El precedente
    // es el mismo que QC-60 dejo escrito en `tests/unit/pedidos/module-contract.test.ts` cuando le
    // nacio su propio `company-scope.ts`: la lista se RETENSA nombrando el archivo de mas, no se
    // ensancha el patron. Sigue siendo una lista CERRADA y sigue sin haber nada de Prisma en el
    // dominio ni en los puertos.
    const RECIPE_PRISMA_ADAPTER = 'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts'
    const COMPANY_SCOPE_ADAPTER = 'lib/modules/recetas/adapters/driven/persistence/company-scope.ts'
    const DUENOS_DE_PRISMA = [COMPANY_SCOPE_ADAPTER, RECIPE_PRISMA_ADAPTER]
    expect(recetasSources.length).toBeGreaterThan(0)
    for (const file of recetasSources) {
      const source = read(file)
      const etiqueta = toPosix(relative(repoRoot, file))
      expect(source, `${etiqueta} consulta la tabla de productos`).not.toMatch(/prisma\.product/i)
      if (!DUENOS_DE_PRISMA.includes(etiqueta)) {
        expect(source, `${etiqueta} importa @prisma/client`).not.toMatch(/@prisma\/client/)
      }
      // Ninguna ruta profunda a otro modulo: solo el barrel.
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${etiqueta}: ruta profunda a inventario`).not.toMatch(
          /^@\/lib\/modules\/inventario\/./,
        )
        expect(spec, `${etiqueta}: ruta profunda a identity`).not.toMatch(
          /^@\/lib\/modules\/identity\/./,
        )
      }
    }
  })

  it('@/lib/modules/inventario publica ProductCatalog', () => {
    // R18: `inventario` DEBE publicar ese contrato, o `recetas` no tendria forma legitima de
    // saber que un producto existe. Se comprueba sobre el TEXTO del barrel y no con un
    // import en ejecucion a proposito: los tres simbolos son SOLO TIPOS y desaparecen al
    // compilar, asi que en tiempo de ejecucion no hay nada que mirar (`design.md` 5.2).
    const contratoInventario = read(join(inventarioDir, 'index.ts'))
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductCatalog\b[^}]*\}/)
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductId\b[^}]*\}/)
    expect(contratoInventario).toMatch(/export type \{[^}]*\bProductRef\b[^}]*\}/)
    expect(contratoInventario).toMatch(/from '\.\/domain\/product-catalog'/)
    // Ya no es el slot vacio que sembro QC-15.
    expect(contratoInventario).not.toMatch(/^\s*export \{\};\s*$/m)
    // Y sigue reexportando SOLO de su dominio.
    for (const spec of importSpecifiers(contratoInventario)) {
      expect(spec, `el barrel de inventario no puede reexportar de ${spec}`).toMatch(
        /^\.\/domain(\/|$)/,
      )
    }

    // El contrato existe de verdad en el dominio de `inventario`, que es el modulo DUENO del
    // dato: la interfaz no vive en `recetas/ports/` (alternativa descartada 8.6).
    const productCatalog = join(inventarioDir, 'domain', 'product-catalog.ts')
    expect(existsSync(productCatalog)).toBe(true)
    const fuente = read(productCatalog)
    expect(fuente).toMatch(/export interface ProductCatalog \{/)
    expect(fuente).toMatch(/findRefs\(/)
    expect(fuente).toMatch(/export type ProductId/)
    expect(fuente).toMatch(/export type ProductRef/)
    // Solo tipos: ninguna implementacion ni import de Prisma en el contrato.
    expect(fuente).not.toMatch(/@prisma\/client|prisma\./)
    expect(existsSync(join(recetasDir, 'ports', 'product-catalog.ts'))).toBe(false)
  })

  it('el barrel de recetas exporta normalizeRecipeName', () => {
    // R8: la normalizacion tiene UNA sola definicion y la publica el contrato del modulo,
    // para que la columna `name_normalized` y cualquier consumidor futuro normalicen igual.
    // Aqui si se afirma en ejecucion: es una funcion, no un tipo.
    expect(typeof normalizeRecipeName).toBe('function')
    expect(normalizeRecipeName('Bidón 20 L')).toBe('bidon20l')

    const contrato = read(barrel)
    expect(contrato).toMatch(/export \{[^}]*\bnormalizeRecipeName\b[^}]*\} from '\.\/domain\//)

    // Y esta implementada UNA sola vez en todo el repo: si hubiera una segunda copia (en un
    // service, en la migracion, en un componente), R8 dejaria de cumplirse.
    const definiciones = sourcesIn(join(repoRoot, 'lib'))
      .concat(sourcesIn(join(repoRoot, 'app')))
      .filter((file) => /function normalizeRecipeName/.test(read(file)))
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(definiciones).toEqual(['lib/modules/recetas/domain/recipe-name.ts'])
  })

  it('la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma (la pantalla es QC-26)', () => {
    // Esta afirmacion nacio en QC-24 (T10 de esa ficha), cuando `recetas` era solo
    // esquema y armazon vacio, y se endurecio en el Grupo A/B de QC-25 (`ports/` y
    // `domain/` con contenido, `adapters/` todavia vacia). El Grupo C (T9-T13) es
    // EXACTAMENTE el que llena `adapters/driven/` (Prisma, Supabase Storage) y
    // `adapters/driving/` (la Server Action) y cablea `lib/composition`: por eso las
    // afirmaciones de "adapters vacia", "ningun 'use server' en el modulo" y
    // "composicion no menciona recetas" de las rondas anteriores se retiran aqui a
    // proposito, no por descuido -son justo lo que esta ronda construye, y quedan
    // cubiertas por sus propios tests (`scope.test.ts`, `recipe-actions.test.ts`)-.
    //
    // ACTUALIZADO 2026-09-03 (QC-26): la segunda mitad de este caso afirmaba que NINGUN
    // archivo de `app/` mencionaba «receta»/«recipe» -era la forma que tomaba, aqui, el
    // LIMITE DE ALCANCE «la pantalla es QC-26», no una propiedad de este modulo-. QC-26
    // llego y monto la pantalla bajo `app/(private)/produccion/formulas/` (verificado con
    // su propio criterio en `tests/unit/recetas/scope.test.ts`), asi que esa mitad ya no
    // aplica y se retira DE AQUI a proposito -no se afloja, se muda al test que de verdad
    // vigila la pantalla-. Lo que este caso sigue garantizando, retensado sobre `lib/
    // modules/recetas` en vez de sobre `app/`:
    //   * ninguna ruta HTTP de recetas bajo `app/api/` -sin cambios-;
    //   * QC-26 no toca `lib/modules/recetas/**`: se comprueba sobre el DIFF DE LA RAMA
    //     (`git diff --name-only origin/dev...HEAD`), no con un censo literal del arbol del
    //     modulo. QC-26 es una feature de PRESENTACION y consume `recetas` por su barrel y
    //     sus Server Actions; si lo tocara por la puerta de atras, el archivo aparece en el
    //     diff y la prueba cae. Un censo cerrado, en cambio, congelaria un modulo ajeno.
    for (const ruta of [
      join(repoRoot, 'app', 'api', 'recipes'),
      join(repoRoot, 'app', 'api', 'recetas'),
    ]) {
      expect(existsSync(ruta), `${toPosix(relative(repoRoot, ruta))} no debe existir`).toBe(false)
    }

    // «QC-26 no toca `recetas` por la puerta de atras» se afirma sobre el DIFF DE LA RAMA, no
    // sobre un censo literal del arbol del modulo. Un censo cerrado de `lib/modules/recetas/**`
    // congela un modulo AJENO (QC-25, ya `done`): cualquier ampliacion legitima futura de
    // `recetas` -por ejemplo un archivo nuevo para `revalidatePath`- se convertiria en un rojo
    // de QC-26 sin que nada de QC-26 estuviera mal. El diff expresa la misma intencion y solo
    // habla de lo que esta rama cambia. Mismo criterio que el caso de R44 en
    // `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
    let diff: string[] = []
    try {
      const salida = execSync('git diff --name-only origin/dev...HEAD', {
        cwd: repoRoot,
        encoding: 'utf8',
      })
      diff = salida
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => linea.length > 0)
    } catch {
      // El rango no esta disponible: `diff` queda vacio a proposito para que la asercion de
      // abajo ponga el caso ROJO diciendolo, nunca verde en silencio.
      diff = []
    }

    expect(
      diff.length,
      'el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada',
    ).toBeGreaterThan(0)
    // ACTUALIZADO 2026-09-04 (QC-34, T10): la lista permitida deja de estar VACIA y pasa a
    // tener exactamente TRES entradas, y no es un aflojamiento. QC-34 necesita el nombre de la
    // receta de un pedido, incluida la dada de baja (R43, R44), y QC-33 R32 le prohibe
    // consultar `prisma.recipe`: la unica salida que ese mismo requisito preve es que
    // `recetas` AMPLIE su contrato publico -exactamente el movimiento que QC-25 hizo con
    // `ProductCatalog` en `inventario`-. Ese trabajo es, por definicion, un cambio dentro de
    // `lib/modules/recetas/`, asi que un filtro vacio lo declararia violacion. Lo que este
    // caso sigue vigilando -y es lo que de verdad protegia- es que NADA MAS del modulo se
    // toque por la puerta de atras: el repositorio, los casos de uso, la Server Action y el
    // adaptador de almacenamiento de QC-25 siguen congelados, y que el cambio sea ADITIVO
    // (ninguna firma anterior cambio) lo demuestra `tests/unit/recetas/recipe-catalog.test.ts`.
    const AMPLIACION_QC34 = [
      // El barrel gana DOS reexportaciones de tipo (`RecipeCatalog`, `RecipeRef`).
      'lib/modules/recetas/index.ts',
      // El contrato de catalogo, que ya existia con `RecipeId` desde QC-33, gana los dos tipos.
      'lib/modules/recetas/domain/recipe-catalog.ts',
      // Y su implementacion, adaptador driven NUEVO -no toca `recipe-prisma.ts`-.
      'lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts',
    ]
    // ACTUALIZADO 2026-09-04 (QC-62, T1-T3): segunda lista permitida, NOMBRADA APARTE de la de
    // QC-34 a proposito. Meter estos archivos en `AMPLIACION_QC34` seria mas corto y mentiria
    // sobre de que ficha vienen: dentro de seis meses nadie sabria cual de las dos features
    // justifica cual ruta, que es justo lo que una guardia de alcance tiene que poder decir.
    //
    // Por que entran: QC-62 cambia la FORMA del paso de receta -de `{ body, type }` a un
    // documento de estructura cerrada- y retira el tipo de paso del contrato (R1-R5, R9). Eso es,
    // por definicion, trabajo DENTRO del dominio de `recetas`, aprobado por el humano en F1.4;
    // un filtro que no lo contemple lo declararia violacion sin que nada este mal.
    //
    // Que sigue PROHIBIDO, y es lo que este caso protege de verdad:
    //   * que la PANTALLA vuelva a caer dentro del modulo -sigue siendo QC-26/QC-64 y vive bajo
    //     `app/(private)/produccion/formulas/`; la asercion de `fueraDeSuCarpeta`, mas abajo, es
    //     la que lo vigila desde el otro angulo-;
    //   * que aparezca cualquier route handler de recetas bajo `app/api/` (asercion de arriba);
    //   * y que se toque NADA MAS del modulo por la puerta de atras: el repositorio, los cinco
    //     casos de uso, la Server Action y el adaptador de almacenamiento de QC-25 siguen
    //     congelados -QC-62 no los abre-, igual que `db/schema.prisma`, que su decision cerrada 6
    //     declara intocable.
    //
    // `lib/modules/recetas/index.ts` NO se repite aqui: ya esta en `AMPLIACION_QC34`. QC-62
    // tambien lo cambia -retira `RECIPE_STEP_TYPES` y `RecipeStepType` y publica el esquema del
    // documento, `MAX_STEP_ELEMENTS` y `countRecipeStepElements`-, y se deja dicho por escrito en
    // vez de duplicar la entrada.
    const CAMBIO_DE_FORMA_DEL_PASO_QC62 = [
      // El esquema del documento del paso, con el tope de elementos y el conteo (T1).
      'lib/modules/recetas/domain/recipe-input.ts',
      // `RecipeStepView` pasa a ser un ALIAS del documento, no una copia (T2).
      'lib/modules/recetas/domain/recipe-view.ts',
      // `toSteps` valida cada elemento guardado y descarta el que no pase (T3, R17). Es lo UNICO
      // que QC-62 abre del adaptador de Prisma: la escritura y las consultas no cambian.
      'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts',
    ]
    // RETENSADO 2026-09-07 (QC-74 T10), mismo criterio que los dos de arriba: el rango mide la
    // rama que corre el gate, asi que cada cambio legitimo posterior se NOMBRA uno a uno. QC-74
    // sustituye la pregunta de autorizacion —«es Administrador»— por «tiene este permiso» en los
    // CINCO casos de uso (R12, R16), y retira el nombre del rol del `Actor` (R18). Son estos
    // ocho archivos y ninguno mas: el envoltorio del actor, su error de autorizacion, los cinco
    // casos de uso y el adaptador driving que arma el actor con `permissions`. El repositorio,
    // el adaptador de almacenamiento, el catalogo y `db/schema.prisma` siguen congelados, y
    // `lib/modules/recetas/index.ts` NO se repite: ya esta en `AMPLIACION_QC34` -QC-74 solo
    // renombra el export `requireAdmin` a `requirePermission`-.
    const AUTORIZACION_POR_PERMISO_QC74 = [
      'lib/modules/recetas/domain/actor.ts',
      'lib/modules/recetas/domain/errors.ts',
      'lib/modules/recetas/domain/get-recipe.ts',
      'lib/modules/recetas/domain/list-recipes.ts',
      'lib/modules/recetas/domain/create-recipe.ts',
      'lib/modules/recetas/domain/update-recipe.ts',
      'lib/modules/recetas/domain/delete-recipe.ts',
      'lib/modules/recetas/adapters/driving/recipe-actions.ts',
    ]
    // QC-50 aisla recetas por empresa. Este caso solo mira el DIFF contra `origin/dev`, asi
    // que con los cambios sin commitear pasaba en verde igual -no muerde hasta que hay commit-.
    // Son tres archivos nuevos/modificados, ninguno mas:
    //   * `domain/recipe-scope.ts` (nuevo): el tipo del ambito del modulo -la empresa en cuyo
    //     nombre se consulta o se escribe-. Dominio puro: no autoriza, solo nombra el ambito.
    //   * `adapters/driven/persistence/company-scope.ts` (nuevo): el punto UNICO donde se
    //     escribe «de la empresa» al armar el filtro/los datos de Prisma, para que ninguna
    //     consulta ni escritura del modulo lo repita por su cuenta y diverja.
    //   * `ports/recipe-repository.ts` (modificado): los cinco metodos ganan el ambito en la
    //     FIRMA, que es lo que hace que una llamada que lo omita no compile.
    const AISLAMIENTO_POR_EMPRESA_QC50 = [
      'lib/modules/recetas/domain/recipe-scope.ts',
      'lib/modules/recetas/adapters/driven/persistence/company-scope.ts',
      'lib/modules/recetas/ports/recipe-repository.ts',
    ]
    // QC-147 (2026-09-22): la linea de receta pasa de cantidad absoluta a PORCENTAJE. Son los
    // archivos que el diff de esta rama toca bajo `lib/modules/recetas/`, y ninguno mas: la
    // aritmetica nueva (`domain/recipe-percentage.ts`), el contrato de entrada y la vista de la
    // linea (`recipe-input.ts`, `recipe-view.ts`), los tres casos de uso que la escriben o la
    // leen (`create-recipe.ts`, `get-recipe.ts`, `update-recipe.ts`), el catalogo y el puerto
    // del repositorio (`recipe-catalog.ts`, `ports/recipe-repository.ts`), los dos adaptadores
    // de persistencia (`recipe-catalog-prisma.ts`, `recipe-prisma.ts`) y el barrel del contrato
    // publico (`index.ts`, que ya figuraba en `AMPLIACION_QC34` pero cambia de forma otra vez).
    const CANTIDADES_EN_PORCENTAJE_QC147 = [
      'lib/modules/recetas/index.ts',
      'lib/modules/recetas/domain/create-recipe.ts',
      'lib/modules/recetas/domain/get-recipe.ts',
      'lib/modules/recetas/domain/recipe-catalog.ts',
      'lib/modules/recetas/domain/recipe-input.ts',
      'lib/modules/recetas/domain/recipe-percentage.ts',
      'lib/modules/recetas/domain/recipe-view.ts',
      'lib/modules/recetas/domain/update-recipe.ts',
      'lib/modules/recetas/ports/recipe-repository.ts',
      'lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts',
      'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts',
    ]
    const AMPLIACIONES_APROBADAS = [
      ...AMPLIACION_QC34,
      ...CAMBIO_DE_FORMA_DEL_PASO_QC62,
      ...AUTORIZACION_POR_PERMISO_QC74,
      ...AISLAMIENTO_POR_EMPRESA_QC50,
      ...CANTIDADES_EN_PORCENTAJE_QC147,
    ]
    expect(
      diff
        .filter((ruta) => ruta.startsWith('lib/modules/recetas/'))
        .filter((ruta) => !AMPLIACIONES_APROBADAS.includes(ruta)),
      'ningun archivo de lib/modules/recetas/ fuera de la ampliacion de contrato de QC-34 (T10), del cambio de forma del paso de QC-62 (T1-T3), del aislamiento por empresa de QC-50 y de las cantidades en porcentaje de QC-147 puede estar en el diff',
    ).toEqual([])

    // Defensa redundante de ubicacion, desde el angulo del modulo: la carpeta permitida se
    // DERIVA de `FORMULAS_ROUTE` -nunca de un literal a mano-, igual que en
    // `tests/unit/recetas/scope.test.ts`.
    //
    // AJUSTADO el 2026-09-07 (QC-35), y lo decide el HUMANO. Hasta hoy esta asercion exigia
    // que ningun archivo de `app/` fuera de la carpeta de formulas mencionara recetas. Esa
    // regla aproximaba POR PALABRA algo que en realidad es ESTRUCTURAL, y declaraba violacion
    // sin que nada estuviera mal en cuanto otra pantalla consumia el catalogo: la disparo el
    // selector de receta de la pantalla de pedidos (QC-35 R31), aprobado el 2026-09-06.
    //
    // El criterio que la sustituye, con las palabras del humano: «pedidos tiene su propia
    // ruta separada, con acceso solo para el administrador». Una PANTALLA se reconoce por
    // tener RUTA PROPIA, no por mencionar una palabra. Por eso aqui NO hay lista blanca de
    // rutas escrita a mano -envejeceria y habria que tocarla en cada ficha-: la condicion se
    // deriva del arbol, preguntando si el archivo cuelga de una carpeta con su propio
    // `page.tsx`. Mover el selector bajo la carpeta de formulas quedaba descartado por el
    // mismo motivo: seria poner un componente de pedidos bajo otra pantalla y otra superficie
    // de permiso.
    //
    // Que sigue PROHIBIDO, y es lo que este caso protege de verdad:
    //   * una SEGUNDA pantalla de recetas: ningun `page.tsx` ni `layout.tsx` fuera de la
    //     carpeta derivada de `FORMULAS_ROUTE` puede renderizar recetas;
    //   * el goteo suelto: un archivo que mencione recetas sin colgar de ninguna pantalla con
    //     ruta propia -y `components/`, que no tiene ruta ninguna, sigue con CERO menciones;
    //     lo vigila `tests/unit/recetas/scope.test.ts`-;
    //   * y consumir el modulo POR DENTRO: desde otra pantalla solo se toca el contrato
    //     publico y los adaptadores driving, nunca `domain/` ni `adapters/driven/`.
    const routeSegments = FORMULAS_ROUTE.split('/').filter((segment) => segment.length > 0)
    const recipesRouteDir = join(repoRoot, 'app', '(private)', ...routeSegments)
    const appDir = join(repoRoot, 'app')
    const RECIPE_MENTION = /recet|recipe/i

    /**
     * La carpeta de la pantalla a la que pertenece el archivo, o `null` si no cuelga de
     * ninguna. Es la condicion ESTRUCTURAL -«tener ruta propia»-, derivada del arbol: se sube
     * desde el archivo hasta `app/` buscando el primer ancestro que declare su `page.tsx`.
     */
    function screenRootOf(file: string): string | null {
      // `app/` NO cuenta como carpeta de pantalla, a proposito: un archivo suelto en la raiz
      // o en un route group -`app/(private)/recetas-algo.tsx`- no cuelga de ninguna pantalla
      // y no es routable, que es exactamente el goteo que este caso caza. Sin esta condicion,
      // `app/page.tsx` haria pasar por «pantalla propia» a cualquier archivo del arbol.
      let dir = dirname(file)
      while (dir.startsWith(appDir) && dir !== appDir) {
        if (existsSync(join(dir, 'page.tsx'))) return dir
        dir = dirname(dir)
      }
      return null
    }

    /**
     * Solo el contrato publico y los adaptadores driving; nunca las tripas del modulo.
     *
     * Se miran los especificadores que apuntan AL MODULO `recetas`, no todo lo que suene a
     * receta: un `from './recipe-picker'` es un archivo de la propia pantalla, no un consumo
     * del modulo, y confundirlos declararia violacion sin que nada estuviera mal. Los driving
     * entran por su ruta exacta a proposito: es lo que manda `docs/architecture.md` y lo que
     * el propio `lib/modules/recetas/index.ts` deja escrito.
     */
    const RECETAS_MODULE = 'lib/modules/recetas'
    function consumesOnlyPublicContract(source: string): boolean {
      return importSpecifiers(source)
        .filter((spec) => spec.includes(RECETAS_MODULE))
        .every(
          (spec) =>
            spec === '@/lib/modules/recetas' ||
            spec.startsWith('@/lib/modules/recetas/adapters/driving/'),
        )
    }

    // Anadida el 2026-09-17: la pantalla de ejecucion de un pedido asignado tiene RUTA PROPIA y
    // llega a la receta por el `recipeId` de un pedido, no navegando el catalogo. Se nombra el
    // archivo EXACTO, nunca la carpeta, y NO queda exenta: se le sigue exigiendo que consuma
    // `recetas` solo por su contrato publico, igual que a cualquier otro archivo de fuera.
    const PANTALLAS_AUTORIZADAS = new Set(['app/(private)/asignacion/[id]/page.tsx'])

    const fueraDeSuCarpeta = sourcesIn(appDir).filter(
      (file) => relative(recipesRouteDir, file).startsWith(`..${sep}`),
    )
    const violaciones: string[] = []
    for (const file of fueraDeSuCarpeta) {
      const source = read(file)
      if (!RECIPE_MENTION.test(source)) continue
      const nombre = toPosix(relative(repoRoot, file))
      if (/^(page|layout)\.tsx$/.test(basename(file))) {
        if (!PANTALLAS_AUTORIZADAS.has(nombre)) {
          violaciones.push(`${nombre}: segunda pantalla de recetas fuera de su carpeta`)
        } else if (!consumesOnlyPublicContract(source)) {
          violaciones.push(`${nombre}: consume recetas por dentro, no por su contrato publico`)
        }
      } else if (screenRootOf(file) === null) {
        violaciones.push(`${nombre}: menciona recetas sin colgar de ninguna pantalla con ruta propia`)
      } else if (!consumesOnlyPublicContract(source)) {
        violaciones.push(`${nombre}: consume recetas por dentro, no por su contrato publico`)
      }
    }
    expect(
      violaciones,
      `la pantalla de recetas vive en ${toPosix(relative(repoRoot, recipesRouteDir))}; ` +
        `fuera de ahi solo se permite consumir su contrato publico desde una pantalla con ` +
        `ruta propia: ${violaciones.join('; ')}`,
    ).toEqual([])
  })
})
