// T3 (QC-25) — Test de alcance, adelantado (`tasks.md > Grupo A`).
//
// Se escribe ANTES de que `domain/` se llene a proposito: es mientras se llena cuando el
// alcance se escapa (leccion de QC-20 T15, citada en `tasks.md`). Cubre R31, R41, R43, R44.
//
// Recorre el ARBOL DE ARCHIVOS y el TEXTO de `db/schema.prisma`, no el grafo de imports:
// por eso vive fuera de `tests/guards/` (esas guardias siguen imports; esto es una foto
// del disco). Ninguna aclaracion aqui hace un censo GLOBAL del repo -numero de modelos,
// de migraciones, etc.-: solo mide lo que la feature `recetas` garantiza sobre si misma
// (`design.md > 14`, quinto aviso).
//
// ACTUALIZADO 2026-09-03 (QC-26): el primer caso afirmaba «no existe ninguna pantalla,
// pagina ni componente de recetas»; esa era el LIMITE DE ALCANCE de QC-25 -«la pantalla es
// QC-26»-, no una invariante permanente. QC-26 la trajo, asi que la premisa cayo y el
// criterio se INVIERTE, no se borra ni se afloja: la pantalla de recetas tiene que existir
// EXACTAMENTE donde la ubica `FORMULAS_ROUTE` (`@/lib/shared/routes`) -nunca un literal
// escrito a mano, para que un cambio de ruta futuro mueva esta prueba con el mismo commit
// que la mueve de verdad- y en NINGUN otro sitio de `app/` ni de `components/`. Lo que
// seguia protegiendo de verdad ese caso -que no apareciera una ruta HTTP de recetas- ya
// estaba cubierto por el segundo caso de este archivo y sigue intacto ahi.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

/** Recorre un directorio recursivamente y devuelve las rutas absolutas a archivos dados. */
function filesIn(dir: string, pattern: RegExp): readonly string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

describe('alcance de QC-25 (crud-de-recetas): sin route handler; la pantalla, solo la de QC-26', () => {
  it('la pantalla de recetas vive solo donde la declara QC-26, y en ningun otro sitio', () => {
    // CENTINELA INVERTIDO el 2026-09-03 (QC-26). Hasta hoy este caso afirmaba «no existe
    // ninguna pantalla, pagina ni componente de recetas»: la pantalla estaba DIFERIDA a
    // QC-26 (D23). QC-26 es precisamente la ficha que la construye, asi que esa premisa
    // dejo de ser cierta -mismo trato que recibio `tests/unit/inventario/scope.test.ts`
    // cuando QC-22 trajo la pantalla del catalogo-.
    //
    // Lo que R44 protegia de verdad no era la ausencia: era que la pantalla no apareciera
    // por goteo, repartida por el repositorio y sin ficha que la respalde. Eso sigue
    // vigente y es lo que este caso vigila ahora: la carpeta permitida se DERIVA de
    // `FORMULAS_ROUTE` (nunca de un literal escrito a mano, para que un cambio de ruta
    // arrastre esta prueba con el mismo commit que la mueve de verdad), la pantalla existe
    // ahi, y ni `app/` fuera de esa carpeta ni `components/` tienen una sola pieza de
    // recetas. Un `app/(private)/dashboard/recetas-algo.tsx` o un
    // `components/recipe-card.tsx` de manana -los dos sin ficha- ponen esto en rojo igual
    // que antes.
    //
    // AJUSTADO el 2026-09-07 (QC-35), y lo decide el HUMANO. La mitad de `app/` de este caso
    // reconocia una «pantalla de recetas» POR EL NOMBRE del archivo, y eso declaraba
    // violacion sin que nada estuviera mal en cuanto otra pantalla consumia el catalogo: lo
    // disparo `recipe-picker.tsx`, el selector de receta de la pantalla de pedidos (QC-35
    // R31), aprobado el 2026-09-06.
    //
    // El criterio que lo sustituye, con las palabras del humano: «pedidos tiene su propia
    // ruta separada, con acceso solo para el administrador». Una PANTALLA se reconoce por
    // tener RUTA PROPIA, no por llamarse de una manera. No hay lista blanca de rutas escrita
    // a mano -envejeceria y habria que tocarla en cada ficha-: se deriva del arbol,
    // preguntando si el archivo cuelga de una carpeta con su propio `page.tsx`. Y mover el
    // selector bajo la carpeta de formulas quedaba descartado por el mismo motivo: seria
    // poner un componente de pedidos bajo otra pantalla y otra superficie de permiso.
    //
    // Que sigue PROHIBIDO, y es lo que este caso protege de verdad:
    //   * una SEGUNDA pantalla de recetas: ningun `page.tsx` ni `layout.tsx` fuera de esta
    //     carpeta puede renderizar recetas;
    //   * el goteo suelto: un archivo de recetas que no cuelgue de ninguna pantalla con ruta
    //     propia -un `app/(private)/recetas-algo.tsx` de manana cae igual que antes-;
    //   * y `components/` sigue con CERO menciones, sin aflojar: ahi no hay ruta ni ficha que
    //     respalde nada, asi que es exactamente el goteo que R44 caza.
    const screenPattern = /recet|recipe/i

    // `FORMULAS_ROUTE` es '/produccion/formulas': la carpeta real cuelga de `app/(private)`
    // -el route group no aparece en la URL, pero si en el disco-.
    const routeSegments = FORMULAS_ROUTE.split('/').filter((segment) => segment.length > 0)
    const recipesRouteDir = join(repoRoot, 'app', '(private)', ...routeSegments)
    expect(routeSegments.length, 'FORMULAS_ROUTE no tiene segmentos').toBeGreaterThan(0)

    function matchingFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
        .filter((absolutePath) => screenPattern.test(absolutePath.slice(dir.length)))
    }

    // La pantalla EXISTE: si alguien la borra, el resto del caso pasaria en verde sobre un
    // repositorio sin pantalla de recetas, que es justo el falso verde que la inversion
    // tenia que evitar.
    expect(existsSync(join(recipesRouteDir, 'page.tsx')), `falta ${join(recipesRouteDir, 'page.tsx')}`).toBe(
      true,
    )

    const appDir = join(repoRoot, 'app')

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
     * Fuente SIN comentarios: lo que se vigila es el CODIGO, no la prosa. Sin esto, una
     * pagina que solo menciona recetas en un comentario -«mismo criterio que la pagina de
     * edicion de receta»- se leeria como una segunda pantalla. Mismo criterio que el `read`
     * de `tests/unit/recetas/module-contract.test.ts`.
     */
    function codeOf(file: string): string {
      return readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
    }

    // Una SEGUNDA pantalla de recetas sigue prohibida: se mira el `page.tsx`/`layout.tsx` de
    // cualquier carpeta de `app/` fuera de la de formulas, por su ruta Y por su codigo.
    // Anadida el 2026-09-17: la pantalla de ejecucion de un pedido asignado tiene RUTA PROPIA y
    // llega a la receta por el `recipeId` de un pedido, nunca navegando el catalogo. Se nombra el
    // archivo EXACTO, nunca la carpeta: cualquier OTRA segunda pantalla sigue prohibida.
    const PANTALLA_DE_EJECUCION = join('app', '(private)', 'asignacion', '[id]', 'page.tsx')

    const segundasPantallas = filesIn(appDir, /^(page|layout)\.tsx$/)
      .filter((file) => relative(recipesRouteDir, file).startsWith(`..${sep}`))
      .filter((file) => relative(repoRoot, file) !== PANTALLA_DE_EJECUCION)
      .filter(
        (file) =>
          screenPattern.test(file.slice(appDir.length)) || screenPattern.test(codeOf(file)),
      )
    expect(
      segundasPantallas,
      `segunda pantalla de recetas fuera de ${relative(repoRoot, recipesRouteDir)}/: ${segundasPantallas.join(', ')}`,
    ).toEqual([])

    // Y el goteo suelto: un archivo de recetas que no cuelgue de NINGUNA pantalla con ruta
    // propia. El que si cuelga de una -el selector de receta de pedidos- esta permitido, y
    // que solo consuma el contrato publico lo comprueba
    // `tests/unit/recetas/module-contract.test.ts`.
    const appMatches = matchingFiles(appDir)
    const sinPantallaPropia = appMatches
      .filter((absolutePath) => relative(recipesRouteDir, absolutePath).startsWith(`..${sep}`))
      .filter((absolutePath) => screenRootOf(absolutePath) === null)
    expect(
      sinPantallaPropia,
      `archivo de recetas que no cuelga de ninguna pantalla con ruta propia: ${sinPantallaPropia.join(', ')}`,
    ).toEqual([])

    const componentMatches = matchingFiles(join(repoRoot, 'components'))
    expect(
      componentMatches,
      `componente de recetas encontrado bajo components/: ${componentMatches.join(', ')}`,
    ).toEqual([])

    // R44: el E2E de recetas estaba diferido a QC-26 (D23); esa mitad de la premisa tambien
    // cayo -QC-26 trajo `e2e/recetas.spec.ts`- y se invierte igual que las dos de arriba: la
    // lista es CERRADA, un segundo spec de recetas sin ficha pone esto en rojo.
    const e2eDir = join(repoRoot, 'e2e')
    const e2eMatches = matchingFiles(e2eDir).map((absolutePath) => relative(e2eDir, absolutePath).split(sep).join('/'))
    //
    // AMPLIADA 2026-09-07 (QC-64, editor-y-lectura-de-pasos): la lista pasa de uno a DOS
    // literales, y sigue siendo CERRADA -no se convierte en `toContain`, ni en un
    // `startsWith('recetas')`, ni en un glob: un TERCER spec de recetas sin ficha tiene que
    // seguir poniendo esto en rojo, que es justo lo unico que este caso protege-. El spec que
    // entra lo pide R28 de `specs/QC-64-editor-y-lectura-de-pasos/requirements.md`: un E2E que
    // recorra el camino completo en un navegador real -redactar un paso con negrilla y una
    // lista de verificacion, guardar la receta, reabrirla y comprobar que el paso se ve igual
    // que se guardo, y recorrer el asistente dentro de la vista previa marcando los items hasta
    // Finalizar-. O sea: NO es crecimiento por goteo, es una ficha con su requisito, y el spec
    // lo aprobo el humano en F1.4. El orden de los literales es el que devuelve `readdirSync`
    // (`matchingFiles` no ordena aqui), y por eso `recetas-pasos.spec.ts` va primero.
    //
    // AMPLIADA de nuevo (QC-50, aislamiento-por-empresa-en-recetas): la lista pasa de DOS a
    // TRES literales, y sigue siendo CERRADA -mismo criterio de siempre: un cuarto spec de
    // recetas sin ficha tiene que seguir poniendo esto en rojo-. El spec que entra es el E2E de
    // aislamiento por empresa que pide R31 de `specs/QC-50-aislamiento-por-empresa-en-recetas/requirements.md`,
    // aprobado por el humano en T20. Verificado con `readdirSync` sobre `e2e/`
    // (no me fio de memoria): devuelve `aislamiento-recetas.spec.ts` PRIMERO -antes que
    // `recetas-pasos.spec.ts`-, asi que va al frente de la lista.
    //
    // AMPLIADA de nuevo el 2026-09-17 (QC-63, ejecutar-receta-operador): la lista pasa de TRES a
    // CUATRO literales, y sigue siendo CERRADA -mismo criterio de siempre: un quinto spec de
    // recetas sin ficha tiene que seguir poniendo esto en rojo, y por eso NO se convierte en
    // `toContain` ni en un glob-. El spec que entra lo piden R29 y R30 de
    // `specs/QC-63-ejecutar-receta-operador/requirements.md`. VERIFICADO antes de darlo de alta,
    // no supuesto: ese spec NO pinta ni ejercita la pantalla de recetas -no navega a
    // `FORMULAS_ROUTE` ni a `recipeEditRoute`; sus unicas navegaciones son `assignedOrderRoute` y
    // `ASSIGNED_ORDERS_ROUTE`-. Aparece aqui porque EJECUTA la receta de un pedido asignado, que
    // es el alcance de esa ficha: llega por `Order.recipeId`, nunca navegando el catalogo. El
    // orden es el que devuelve `readdirSync`, asi que va SEGUNDO.
    //
    // AMPLIADA de nuevo el 2026-09-22 (QC-147, cantidades-de-receta-en-porcentaje): la lista pasa
    // de CUATRO a CINCO literales, y sigue siendo CERRADA -mismo criterio de siempre: un sexto
    // spec de recetas sin ficha tiene que seguir poniendo esto en rojo-. El spec que entra lo
    // pide R22 de `specs/QC-147-cantidades-de-receta-en-porcentaje/requirements.md`: cubre que
    // una receta cuyas lineas suman 97,50 % no se guarda y con 100,00 % si, que una receta sin
    // ninguna linea no se guarda, el costo de ingredientes de un pedido calculado con el
    // porcentaje, y lo que ve el Operario en la linea de un pedido. VERIFICADO con `readdirSync`
    // antes de darlo de alta: `recetas-porcentaje.spec.ts` cae entre `recetas-pasos.spec.ts` y
    // `recetas.spec.ts`, asi que va en medio de esas dos.
    expect(e2eMatches, `spec E2E de recetas inesperado: ${e2eMatches.join(', ')}`).toEqual([
      'aislamiento-recetas.spec.ts', // QC-50 / R31: E2E de aislamiento por empresa
      'ejecucion-receta.spec.ts', // QC-63 / R29, R30: E2E de la ejecucion desde un pedido asignado
      'recetas-pasos.spec.ts', // QC-64 / R28: E2E del camino completo del editor y el asistente
      'recetas-porcentaje.spec.ts', // QC-147 / R22: E2E del porcentaje en lineas de receta
      'recetas.spec.ts', // QC-26: E2E del CRUD de la pantalla de recetas
    ])
  })

  it('las mutaciones de recetas son Server Actions y no hay ningun route handler bajo app/api', () => {
    // R39, R44: ninguna ruta HTTP de recetas, hoy ni nunca en esta feature. Falsable con
    // solo crear `app/api/recetas/route.ts` (o `recipes`): el `existsSync` pasa a `true` y
    // la asercion cae.
    const RECIPE_API_ROUTES = [join(repoRoot, 'app', 'api', 'recetas'), join(repoRoot, 'app', 'api', 'recipes')]
    for (const route of RECIPE_API_ROUTES) {
      expect(existsSync(route), `${route} no debe existir: las mutaciones son Server Actions`).toBe(
        false,
      )
    }

    // Todo archivo que aparezca en `adapters/driving/` (T13 lo llena) es una Server
    // Action, nunca un route handler disfrazado. Hoy la carpeta esta vacia (solo el
    // `.gitkeep`), asi que el bucle no itera nada TODAVIA -en cuanto T13 ponga el primer
    // archivo sin la directiva `'use server'` en la primera linea util, esta asercion cae.
    const drivingDir = join(repoRoot, 'lib', 'modules', 'recetas', 'adapters', 'driving')
    for (const file of filesIn(drivingDir, /\.tsx?$/)) {
      const source = readFileSync(file, 'utf8').trimStart()
      expect(source, `${file} debe declarar 'use server' en la primera linea`).toMatch(
        /^(['"])use server\1/,
      )
    }
  })

  it('el modulo recetas no reimplementa el calculo de paginacion', () => {
    // R31: `recetas` reutiliza `lib/shared/pagination.ts` (offset/limit/totalPages) y no
    // contiene ninguna aritmetica propia de desplazamiento, limite ni total de paginas.
    // Se busca en el TEXTO fuente de `lib/modules/recetas/**` (excluidos los tests, que
    // pueden mencionar la aritmetica al describir el comportamiento esperado del util) los
    // patrones que delatarian una reimplementacion: `Math.ceil`/`Math.floor` sobre un
    // total, `(page - 1) * algo` y una asignacion directa a `offset`/`totalPages`.
    const SUSPICIOUS_PATTERNS: readonly { readonly nombre: string; readonly pattern: RegExp }[] = [
      { nombre: 'Math.ceil sobre un total (calculo de totalPages a mano)', pattern: /Math\.ceil\(\s*total\b/ },
      { nombre: '(page - 1) * algo (calculo de offset a mano)', pattern: /\(\s*page\s*-\s*1\s*\)\s*\*/ },
      { nombre: 'multiplicacion directa por pageSize (calculo de offset/limit a mano)', pattern: /\*\s*pageSize\b|\bpageSize\s*\*/ },
    ]

    const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')
    const hallazgos: string[] = []
    for (const file of filesIn(recetasDir, /\.tsx?$/)) {
      const source = readFileSync(file, 'utf8')
      for (const { nombre, pattern } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(source)) hallazgos.push(`${file}: ${nombre}`)
      }
    }

    expect(
      hallazgos,
      `lib/modules/recetas/** parece reimplementar la aritmetica de paginacion en vez de ` +
        `usar lib/shared/pagination.ts: ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('ningun test importa @supabase/storage-js ni el adaptador de Storage', () => {
    // R43: la verificacion de esta feature corre sin red y sin bucket. Ningun test DE ESTE MODULO
    // puede importar la libreria del cliente ni el adaptador driven que la usa -eso obligaria a un
    // doble/mock explicito, que es justo lo que R43 exige en su lugar-.
    //
    // ACOTADO al directorio de este modulo (2026-09-16). Antes barria `tests/` ENTERO y afirmaba
    // algo global mientras protegia un alcance local, asi que se disparaba con tests de otros
    // modulos que hacen cumplir esta MISMA regla: basta con que el texto del archivo NOMBRE la
    // libreria -aunque sea como dato de prueba o dentro de una cadena- para que la expresion
    // regular muerda, porque mira el texto y no los imports reales. R43 habla de la verificacion de
    // ESTE modulo; el aislamiento de los demas lo afirma cada uno en su propio alcance.
    const testsDir = join(repoRoot, 'tests', 'unit', 'recetas')
    const selfPath = fileURLToPath(import.meta.url) // este mismo archivo cita los patrones a proposito
    const hallazgos: string[] = []
    for (const file of filesIn(testsDir, /\.tsx?$/)) {
      if (file === selfPath) continue
      const source = readFileSync(file, 'utf8')
      const importsStorageJs = /from\s+['"]@supabase\/storage-js['"]|require\(\s*['"]@supabase\/storage-js['"]\s*\)/.test(
        source,
      )
      // Mismo criterio que `importsStorageJs`: exige FORMA de import/require, no un
      // substring pelado. Un test como R27 (`recipe-image-scope.test.ts`) lee el adaptador
      // como TEXTO con `readFileSync` para afirmar cosas sobre su codigo fuente -sin
      // importarlo-, y cita su nombre de archivo (p. ej. en un segmento de ruta) sin que eso
      // cree ninguna dependencia real en la corrida. Esa mencion textual no es lo que R43
      // prohibe; lo que R43 prohibe es que el adaptador SE EJECUTE dentro de un test de este
      // modulo, y eso solo pasa si hay un `import`/`require` real. La comprobacion hermana de
      // `@supabase/storage-js`, arriba, siempre exigio forma de import: esta se habia quedado
      // como substring por descuido, no por diseno -misma correccion que el ACOTADO de mas
      // abajo, en la otra mitad de este caso-. Un import real del adaptador se sigue cazando
      // exactamente igual.
      const importsStorageAdapter =
        /from\s+['"][^'"]*recipe-image-supabase(?:\.[jt]sx?)?['"]|require\(\s*['"][^'"]*recipe-image-supabase(?:\.[jt]sx?)?['"]\s*\)/.test(
          source,
        )
      if (importsStorageJs) hallazgos.push(`${file}: importa @supabase/storage-js`)
      if (importsStorageAdapter) hallazgos.push(`${file}: importa el adaptador de Storage`)
    }

    expect(
      hallazgos,
      `Tests que dependen del Storage real (deben usar un doble del puerto): ${hallazgos.join('; ')}`,
    ).toEqual([])
  })

  it('el conjunto de columnas, indices y restricciones de recipes y recipe_lines es exactamente el esperado', () => {
    // R41: el esquema de `recipes` y `recipe_lines` lo dejo QC-24 y esta ficha lo consume
    // tal cual, salvo por `companyId` (QC-50, ver abajo). Es una afirmacion DESCRIPTIVA sobre
    // el archivo actual, ligada al CONJUNTO DE NOMBRES de columna de `Recipe`/`RecipeLine`
    // (y a sus `@@unique`/`@@index`/`@@map` completos) -no un censo global del schema-: si
    // alguien anade, quita o renombra una columna, un indice o una restriccion de estos DOS
    // modelos fuera de lo que las listas de abajo ya reflejan, esta prueba cae.
    //
    // Se compara solo el NOMBRE de cada campo de columna, no su declaracion entera (tipo,
    // atributos, `@map`, etc.): comparar la linea completa es fragil ante cambios legitimos
    // de una ficha vecina que no tocan el ALCANCE que R41 vigila -p. ej. QC-32 cambiando
    // `unit String` por `unitId String @db.Uuid` ya rompio esta prueba una vez sin que R41
    // se hubiera violado-. Las lineas `@@...` (restricciones e indices compuestos) SI se
    // comparan completas: ahi el valor de la prueba esta en la restriccion exacta, no solo
    // en su nombre.
    //
    // NOTA (2026-09-03): `RecipeLine.unit` (texto) paso a `RecipeLine.unitId` (UUID, FK al
    // catalogo de `unidades`, R50) cuando QC-32 se mergeo a `dev` a mitad de la
    // implementacion de esta ficha. NO es una regresion de R41: esta feature (QC-25) no
    // anadio la columna, la trajo QC-32 por su cuenta; este test solo se actualiza para
    // reflejar el estado REAL y correcto del schema tras ese merge -"design.md > 14"
    // preveia que QC-32 lo actualizaria, pero por el orden real del merge quedo pendiente
    // hasta este cierre.
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    function bodyOfModel(model: string): string {
      const match = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`, 'm').exec(schema)
      if (!match) throw new Error(`no se encontro "model ${model}" en db/schema.prisma`)
      return match[1]
    }

    /** Lineas no vacias, sin comentarios, con espacios internos colapsados a uno solo. */
    function normalizedLines(body: string): string[] {
      return body
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0 && !line.startsWith('//'))
    }

    /**
     * Para una linea de restriccion (`@@...`) la deja tal cual -ahi importa la declaracion
     * completa-; para una linea de campo se queda solo con la PRIMERA palabra, su nombre
     * (R41 solo exige que no se anada/quite/renombre una columna, no que su tipo o sus
     * atributos no cambien por una razon legitima de otra ficha).
     */
    function fieldNamesOf(lines: readonly string[]): string[] {
      return lines.map((line) => (line.startsWith('@@') ? line : (line.split(' ')[0] as string)))
    }

    const EXPECTED_RECIPE_FIELDS = [
      'id',
      'name',
      'nameNormalized',
      'description',
      'steps',
      'imagePath',
      // QC-50: aislamiento por empresa de esta ficha. `companyId` entra ENTRE `imagePath` y
      // `createdBy`, que es el lugar exacto donde `db/schema.prisma` lo coloco -no al final-,
      // porque esta lista compara el ORDEN de los campos, no solo su presencia.
      'companyId',
      'createdBy',
      'updatedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'parentRecipeId',
      'lines',
      'parent',
      'versions',
      '@@index([createdBy], map: "recipes_created_by_idx")',
      '@@index([updatedBy], map: "recipes_updated_by_idx")',
      '@@map("recipes")',
    ]

    // QC-50: `RecipeLine` NO gana `companyId` propio -a proposito-. Su empresa es la de su
    // receta (via `recipeId`), y darle una columna propia abriria la puerta a que una linea
    // apuntara a una empresa distinta de la de su receta. Esta lista SIGUE IGUAL que antes de
    // QC-50: si algun dia cambiara, seria la prueba de que ese aislamiento se rompio.
    const EXPECTED_RECIPE_LINE_FIELDS = [
      'id',
      'recipeId',
      'productId',
      'percentage',
      'createdAt',
      'updatedAt',
      'recipe',
      '@@unique([recipeId, productId], map: "recipe_lines_recipe_id_product_id_key")',
      '@@index([productId], map: "recipe_lines_product_id_idx")',
      '@@map("recipe_lines")',
    ]

    expect(
      fieldNamesOf(normalizedLines(bodyOfModel('Recipe'))),
      'model Recipe gano, perdio o renombro un campo, indice o restriccion respecto al estado que dejo QC-24',
    ).toEqual(EXPECTED_RECIPE_FIELDS)
    expect(
      fieldNamesOf(normalizedLines(bodyOfModel('RecipeLine'))),
      'model RecipeLine gano, perdio o renombro un campo, indice o restriccion respecto al estado que dejo QC-24',
    ).toEqual(EXPECTED_RECIPE_LINE_FIELDS)
  })
})
