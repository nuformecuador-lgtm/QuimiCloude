// T7 — Contrato estatico de `db/schema.prisma` (QC-32: modelo-unidades).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/recetas/schema/recetas-schema.test.ts` y
// `tests/unit/inventario/schema/inventario-schema.test.ts`: lo que se vigila aqui es la
// DECLARACION, no el cliente generado. Un tipo de Prisma no distingue un campo obligatorio de
// uno con default, no dice si una columna lleva `@relation`, no dice si `symbol` es `TEXT` o
// `VARCHAR(n)` y no ve los comentarios `/// @module`.
//
// Casi la mitad de los casos afirma una AUSENCIA en positivo, y todas son deliberadas
// (`specs/QC-32-modelo-unidades/design.md` secciones 2.1, 2.2, 2.3 y 4.3): `Unit` SIN
// `deletedAt` (decision cerrada 11, R8), SIN `@unique` ni indice sobre `symbol` (R7, pregunta
// abierta 1), SIN campos de vuelta hacia `Product` ni `RecipeLine` y SIN ningun factor de
// conversion (decision cerrada 12, R14); las dos `unitId` como escalares uuid SIN `@relation`
// —la FK es real pero vive escrita a mano en la migracion, para que el cliente Prisma no pueda
// atravesar de `inventario` ni de `recetas` a `unidades` con un `include`— (R18); y NINGUNA
// columna `unit` de texto en las dos tablas ajenas (R10, R11). El test existe para que nadie
// las «arregle» sin darse cuenta.
//
// Cubre R1, R2, R3, R4 (la columna persistida; la funcion la cubre `unit-name.test.ts`), R5
// (el `@@unique` del esquema; el indice unico real lo cubre `unidades-migration.test.ts`), R6,
// R7, R8, R9, R10, R11, R14, R15, R18 y R20 DE QC-32.
//
// ---------------------------------------------------------------------------------------
// ACTUALIZADO EL 2026-09-07 POR QC-76 (`specs/QC-76-equivalencia-y-ambito-de-unidades/`, T4).
//
// CINCO casos de este archivo afirmaban lo CONTRARIO de lo que QC-76 decide y estaban en
// rojo. NO se han borrado ni relajado: se han reescrito para afirmar lo nuevo, y cada uno
// lleva escrito QUE afirmaba antes, QUE requisito lo deroga y POR QUE. No se borra historia,
// se explica. Los cinco son:
//
//   1. «Unit declara id uuid propio, nombre y simbolo»  -> la tabla tiene NUEVE columnas, no
//      seis (R1, R3, R11).
//   2. «... con su @@unique»                            -> SIN ningun `@@unique` (R14).
//   3. «no hay @unique ni indice sobre symbol»          -> el simbolo SI es unico, pero por
//      indices PARCIALES en el SQL (R15, decision cerrada 28, que cierra la pregunta abierta
//      1 de QC-32).
//   4. «Unit no declara factor, base ni equivalencia»   -> los declara, opcionales, y NO hay
//      bandera de sistema (R1, R3, R11, R12, decision cerrada 11).
//   5. «la tabla y sus columnas mapean a snake_case»    -> la lista exacta de indices cambia
//      (R31).
//
// Cubre ademas, de QC-76: R1, R3, R11, R12, R14 y R15 (su mitad de esquema: que la unicidad
// NO esta aqui), R31 y R32.
// ---------------------------------------------------------------------------------------
//
// ACTUALIZADO EL 2026-09-11 POR QC-80 (`specs/QC-80-unidad-desde-la-presentacion/`).
//
// TRES casos de este archivo afirmaban sobre `Product.unitId`, que YA NO EXISTE: la migracion
// `20260911120000_presentation_unit` borra la columna `products.unit_id`, su indice
// `products_unit_id_idx` y su FK. Es la version en `unidades` de la misma inversion que QC-80
// ya hizo en `tests/unit/inventario/schema/inventario-schema.test.ts`. NO se han borrado -un
// caso borrado no vigila nada-: se han INVERTIDO EN POSITIVO, y cada uno dice que afirmaba
// antes y que requisito lo deroga. Los tres son:
//
//   1. «Product declara unitId uuid OPCIONAL ...» -> `Product` NO declara NINGUNA unidad
//      (**R21**), y quien la declara ahora es `Presentation` (**R1**).
//   2. «las dos unitId son escalares SIN @relation» -> las dos siguen siendo dos, pero son
//      las de `Presentation` y `RecipeLine`: `Product` salio del grupo (**R21**).
//   3. «la tabla y sus columnas mapean a snake_case» -> la lista EXACTA de indices cambia:
//      `products_unit_id_idx` se va con la columna y entra `presentations_unit_id_idx`.
//
// Lo que NO cambia es el patron que estos casos protegen: toda referencia al catalogo desde
// otro modulo es un ESCALAR uuid sin `@relation` (QC-32 R18), y `Unit` no gana campos de
// vuelta. Lo que cambia es QUIEN referencia. La unidad de un producto se DERIVA ahora de la
// presentacion de su lote mas reciente (**R22**), o es «ninguna» si no tiene lotes (**R23**).
//
// Cubre ademas, de QC-80: R1, R21 (su mitad de esquema) y R10 en lo que el esquema puede
// decir de el (que `unitId` es NOT NULL y sin `@default`).
// ---------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

/** Texto crudo, con los `///`: lo necesita R15, que afirma sobre los comentarios. */
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

/** Quita comentarios `//` y `///`: el schema los usa para explicar, no para declarar. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const schema = stripComments(rawSchema)

interface PrismaField {
  readonly name: string
  readonly type: string
  readonly attributes: string
  readonly isOptional: boolean
  readonly isList: boolean
}

interface PrismaModel {
  readonly body: string
  readonly fields: readonly PrismaField[]
}

function parseModel(name: string): PrismaModel {
  const match = new RegExp(`^model\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) throw new Error(`no existe el modelo ${name}`)
  const body = match[1]
  const fields = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('@@'))
    .map((line): PrismaField | null => {
      const field = /^(\w+)\s+(\S+)\s*(.*)$/.exec(line)
      if (field === null || field[1] === undefined || field[2] === undefined) return null
      const rawType = field[2]
      return {
        name: field[1],
        type: rawType.replace(/[?[\]]/g, ''),
        attributes: field[3] ?? '',
        isOptional: rawType.endsWith('?'),
        isList: rawType.endsWith('[]'),
      }
    })
    .filter((field): field is PrismaField => field !== null)
  return { body, fields }
}

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

const unit = parseModel('Unit')
const product = parseModel('Product')
const presentation = parseModel('Presentation')
const recipeLine = parseModel('RecipeLine')

/**
 * Cada campo de `Unit`, con la columna en ingles que le toca (QC-32 R20, QC-76 R31).
 *
 * ACTUALIZADO EL 2026-09-07 POR QC-76 (`specs/QC-76-equivalencia-y-ambito-de-unidades/`):
 * la lista era de SEIS y sigue siendo EXACTA; ahora son NUEVE. Las tres nuevas las trae la
 * equivalencia entre unidades y el ambito por empresa (R1, R3, R11).
 */
const UNIT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['name', 'name'],
  ['nameNormalized', 'name_normalized'],
  ['symbol', 'symbol'],
  ['companyId', 'company_id'],
  ['baseUnitId', 'unit_id'],
  ['factor', 'factor'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
]

/**
 * Las dos referencias al catalogo que cruzan de modulo y por eso NO llevan `@relation` (R18).
 *
 * ACTUALIZADA EL 2026-09-11 POR QC-80: siguen siendo DOS, pero la primera ya no es `Product`
 * —dejo de declarar unidad (R21)— sino `Presentation`, y alli la unidad es OBLIGATORIA (R1),
 * no opcional. El tercer elemento de cada tupla es justamente eso: si `unitId` es opcional.
 */
const CROSS_MODULE_UNIT_SCALARS: ReadonlyArray<readonly [string, PrismaModel, boolean]> = [
  ['Presentation', presentation, false],
  // ANULABLE, a diferencia de las otras dos: un producto sin lotes no tiene de donde sacar
  // una unidad.
  ['Product', product, true],
  ['RecipeLine', recipeLine, false],
]

describe('db/schema.prisma — el catalogo de unidades', () => {
  it('Unit declara id uuid propio, nombre y simbolo', () => {
    // R1: identificador propio, estable y NO derivado de sus datos de negocio (el nombre no
    // forma parte de la clave), mas el nombre y el simbolo de la unidad.
    const id = field(unit, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    expect(unit.body).not.toMatch(/@@id\(/)

    expect(field(unit, 'name').type).toBe('String')
    expect(field(unit, 'symbol').type).toBe('String')

    // REESCRITO EL 2026-09-07 POR QC-76. ANTES afirmaba que la tabla tenia EXACTAMENTE seis
    // columnas —`id`, `name`, `name_normalized`, `symbol`, `created_at`, `updated_at`—, que
    // era la forma que dejo QC-32. LO DEROGAN R1 (equivalencia: de que unidad deriva y por
    // que factor), R3 (el factor, `decimal(14,4)`) y R11 (la empresa duena, opcional): son
    // tres columnas mas, y `UNIT_COLUMNS` las nombra arriba. Lo que NO cambia es que la
    // lista sea EXACTA: sigue siendo este caso quien avisa si alguien anade o quita una.
    // La forma completa de la tabla: si alguien anade o quita una columna, este test lo dice.
    expect([...unit.fields].map((candidate) => candidate.name).sort()).toEqual(
      UNIT_COLUMNS.map(([name]) => name).sort(),
    )
    expect(unit.body).toContain('@@map("units")')
  })

  it('name es obligatorio y sin default', () => {
    // R2: sin nombre no hay fila, y lo rechaza la BASE (el `NOT NULL` de la columna). Un
    // `@default` rellenaria el hueco en silencio y el rechazo no ocurriria nunca.
    const name = field(unit, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)
    expect(name.attributes).not.toMatch(/dbgenerated/)
  })

  it('symbol es opcional y no tiene default', () => {
    // R3 y decision cerrada 4: una unidad puede no tener simbolo, y esa ausencia se conserva
    // como AUSENCIA DE VALOR. Un `@default("")` la convertiria en cadena vacia y un
    // `@default` cualquiera en un valor inventado; en los dos casos «sin simbolo» y «con
    // simbolo vacio» dejarian de distinguirse (`design.md` seccion 2.1).
    const symbol = field(unit, 'symbol')
    expect(symbol.type).toBe('String')
    expect(symbol.isOptional).toBe(true)
    expect(symbol.attributes).not.toMatch(/@default\(/)
    expect(symbol.attributes).not.toMatch(/dbgenerated/)
    // Y no se copia del nombre por ningun mecanismo declarativo.
    expect(symbol.attributes).not.toMatch(/@map\("name"\)/)
  })

  it('Unit declara name_normalized obligatorio junto al nombre original, SIN ningun @@unique', () => {
    // QC-32 R4 y R5 en su parte de esquema (decision cerrada 5): el nombre normalizado se
    // PERSISTE en su propia COLUMNA, al lado del original. Eso NO cambia. La unica
    // definicion de la normalizacion la publica el contrato del modulo (`normalizeUnitName`)
    // y eso lo comprueba `module-contract.test.ts`; los indices unicos REALES en el SQL los
    // comprueba `unidades-migration.test.ts`.
    //
    // REESCRITO EL 2026-09-07 POR QC-76. ANTES este caso exigia
    // `@@unique([nameNormalized], map: "units_name_normalized_key")` en el modelo: la
    // unicidad del nombre era GLOBAL (QC-32 R5) y Prisma sabia modelarla. LO DEROGA **R14**
    // (decision cerrada 14): la unicidad pasa a ser POR AMBITO —dentro de la empresa, y las
    // de sistema entre ellas—, o sea CUATRO indices unicos PARCIALES que Prisma NO sabe
    // modelar y que viven escritos a mano en
    // `db/migrations/20260907190000_units_equivalence_and_scope/migration.sql`.
    //
    // POR QUE SE AFIRMA LA AUSENCIA EN POSITIVO, y no se borra el caso: si alguien vuelve a
    // poner un `@unique`/`@@unique` aqui, el esquema sigue validando, el cliente sigue
    // compilando y el siguiente `prisma migrate dev` genera un indice unico GLOBAL que rompe
    // R14 EN SILENCIO —dos empresas dejarian de poder tener cada una su «kilogramo»—. Este
    // caso es el unico sitio del repo que se entera.
    const nameNormalized = field(unit, 'nameNormalized')
    expect(nameNormalized.type).toBe('String')
    expect(nameNormalized.isOptional).toBe(false)
    expect(nameNormalized.attributes).toContain('@map("name_normalized")')
    expect(nameNormalized.attributes).not.toMatch(/@default\(/)
    // No es columna generada por la base: la escribe la aplicacion (`design.md` seccion 3),
    // porque quitar acentos en SQL no es `IMMUTABLE`.
    expect(nameNormalized.attributes).not.toMatch(/dbgenerated/)
    expect(has(unit, 'name')).toBe(true)

    // Ningun `@@unique` en el bloque, ni sobre `nameNormalized` ni sobre nada mas (R14).
    expect(unit.body).not.toMatch(/@@unique\(/)
    expect(unit.body).not.toMatch(/units_name_normalized_key/)
    // Ni ningun `@unique` de campo, que es la otra forma de decir lo mismo.
    for (const candidate of unit.fields) {
      expect(candidate.attributes, `Unit.${candidate.name} no debe llevar @unique`).not.toMatch(
        /@unique/,
      )
    }

    // Y el modelo lleva ENCIMA el aviso que explica por que no esta (`design.md > 2.1`,
    // T1 de `tasks.md`): sin el, la ausencia se lee como olvido y alguien la «arregla».
    const preamble = rawSchema.slice(0, rawSchema.indexOf('model Unit {')).split('\n')
    const docBlock: string[] = []
    for (let index = preamble.length - 1; index >= 0; index -= 1) {
      const line = (preamble[index] ?? '').trim()
      if (line.length === 0 && docBlock.length === 0) continue
      if (!line.startsWith('///')) break
      docBlock.unshift(line)
    }
    const unitComment = docBlock.join('\n')
    expect(unitComment).toMatch(/parcial/i)
    expect(unitComment).toMatch(/@unique/)
    expect(unitComment).toMatch(/units_equivalence_and_scope/)
  })

  it('name y symbol son TEXT, sin varchar ni limite declarado', () => {
    // R6: los limites de longitud, si los hay, son validacion de aplicacion y pertenecen a
    // QC-38. Un `@db.VarChar(n)` los bajaria a la columna, obligaria a una migracion para
    // cambiarlos y haria que la BASE rechazara una unidad por longitud, que es justo lo que
    // R6 prohibe.
    for (const fieldName of ['name', 'nameNormalized', 'symbol'] as const) {
      const candidate = field(unit, fieldName)
      expect(candidate.type, `Unit.${fieldName} debe ser String`).toBe('String')
      expect(candidate.attributes, `Unit.${fieldName} no debe declarar varchar`).not.toMatch(
        /@db\.(VarChar|Char)\s*\(/,
      )
      expect(candidate.attributes, `Unit.${fieldName} no debe declarar tipo nativo`).not.toMatch(
        /@db\.\w+/,
      )
    }
    // Ni ningun limite disfrazado de otra cosa dentro del modelo.
    expect(unit.body).not.toMatch(/length/i)
  })

  it('el simbolo es unico POR AMBITO en el SQL, y por eso NO lleva @unique en el esquema', () => {
    // REESCRITO EL 2026-09-07 POR QC-76, Y ESTE CAMBIA DE SENTIDO. ANTES afirmaba que el
    // simbolo NO era unico en ninguna parte: QC-32 lo dejo deliberadamente sin indice (su R7
    // y su pregunta abierta 1) porque «la identidad de la unidad es su NOMBRE». LO DEROGA
    // **R15** (decision cerrada 28, que cierra esa misma pregunta abierta 1): el simbolo SI
    // es unico ahora, CUANDO EXISTE —sigue siendo opcional— y con el MISMO AMBITO que el
    // nombre.
    //
    // EL MATIZ QUE DEJA ESTE CASO ESCRITO: que sea unico NO significa que aqui haya un
    // `@unique`. La unicidad son dos indices PARCIALES —`units_company_symbol_unique` y
    // `units_system_symbol_unique`, los dos con su `WHERE ... "symbol" IS NOT NULL`— que
    // viven en `migration.sql` y que comprueba `unidades-migration.test.ts`. Un `@unique`
    // aqui seria unicidad GLOBAL del simbolo: el «kg» de sistema bloquearia el «kg» de una
    // empresa que si puede tener su propio kilogramo (decision cerrada 28), y ademas dejaria
    // fuera la mitad «cuando existe». Por eso la ausencia se sigue afirmando en positivo,
    // pero por una razon distinta de la de QC-32.
    expect(field(unit, 'symbol').attributes).not.toMatch(/@unique/)
    expect(unit.body).not.toMatch(/@@unique\([^)]*symbol/)
    expect(unit.body).not.toMatch(/@@index\([^)]*symbol/)

    // NINGUN `@@unique` en el modelo (R14, R15). Los CUATRO unicos son parciales y viven en
    // el SQL; ver el caso del nombre normalizado, que explica por que volver a poner uno
    // aqui rompe el ambito en silencio.
    expect([...unit.body.matchAll(/@@unique\(/g)]).toHaveLength(0)
    // Y exactamente los DOS `@@index` de las FK que anade QC-76 (`design.md > 2.1`): el lado
    // hijo de una FK no se indexa solo, y por ahi pasa la verificacion de los dos RESTRICT.
    // NO son unicos: `@@index`, no `@@unique`.
    expect([...unit.body.matchAll(/@@index\(/g)]).toHaveLength(2)
    expect(unit.body).toMatch(/@@index\(\[companyId\],\s*map:\s*"units_company_id_idx"\)/)
    expect(unit.body).toMatch(/@@index\(\[baseUnitId\],\s*map:\s*"units_unit_id_idx"\)/)
    // Ningun campo lleva `@unique` suelto: la identidad no se reparte, y ya no es global.
    for (const candidate of unit.fields) {
      expect(candidate.attributes, `Unit.${candidate.name} no debe llevar @unique`).not.toMatch(
        /@unique/,
      )
    }
  })

  it('Unit no declara deletedAt', () => {
    // REAFIRMADO EL 2026-09-07 POR QC-76 **R32** (decision cerrada 21), que no deroga nada:
    // dice lo mismo que QC-32 y por una razon MAS. Ahora `units` tiene ademas
    // `units_unit_id_fkey` con `ON DELETE RESTRICT`, que es la unica garantia real de que no
    // se borra una unidad de la que otra deriva (R8): un `deleted_at` la neutralizaria en
    // silencio, porque un borrado logico es un UPDATE y ninguna FK reacciona a un UPDATE.
    //
    // QC-32 R8 y decision cerrada 11, afirmado en positivo para que nadie anada la columna «por
    // simetria» con `Product` o con `Recipe`: el borrado logico es un UPDATE y NINGUNA FK
    // reacciona a un UPDATE, asi que `deleted_at` neutralizaria en silencio el
    // `ON DELETE RESTRICT` que es la unica garantia real de R13.
    expect(has(unit, 'deletedAt')).toBe(false)
    expect(unit.body).not.toMatch(/deletedAt/)
    expect(unit.body).not.toMatch(/deleted_at/)
    for (const forbidden of ['deleted', 'archivedAt', 'isActive', 'active', 'disabledAt']) {
      expect(has(unit, forbidden), `Unit.${forbidden} no debe existir`).toBe(false)
    }
    // `Product` si lo lleva: las dos decisiones conviven a proposito.
    expect(has(product, 'deletedAt')).toBe(true)
  })

  it('Unit declara createdAt y updatedAt', () => {
    // R9: instante de creacion e instante de la ultima modificacion, y el segundo se
    // actualiza SOLO en cada cambio (`@updatedAt`), no a mano en cada llamada.
    const createdAt = field(unit, 'createdAt')
    expect(createdAt.type).toBe('DateTime')
    expect(createdAt.isOptional).toBe(false)
    expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
    expect(createdAt.attributes).toContain('@map("created_at")')
    expect(createdAt.attributes).toContain('@db.Timestamptz(6)')

    const updatedAt = field(unit, 'updatedAt')
    expect(updatedAt.type).toBe('DateTime')
    expect(updatedAt.isOptional).toBe(false)
    expect(updatedAt.attributes).toContain('@updatedAt')
    expect(updatedAt.attributes).toContain('@map("updated_at")')
    expect(updatedAt.attributes).toContain('@db.Timestamptz(6)')
  })

  it('Unit declara companyId, baseUnitId y factor OPCIONALES, y ninguna bandera de sistema', () => {
    // REESCRITO EL 2026-09-07 POR QC-76, Y ESTE TAMBIEN CAMBIA DE SENTIDO. ANTES afirmaba
    // que `Unit` NO declaraba «factor, base ni equivalencia» y que ninguna columna era
    // numerica: QC-32 (su R14 y su decision cerrada 12) fijo que la unidad era PURAMENTE
    // ANOTATIVA y que no habria conversion «y no la va a haber». LO DEROGAN **R1** (cada
    // unidad puede declarar de que unidad deriva y por que factor, los dos OPCIONALES),
    // **R3** (el factor, decimal exacto de cuatro decimales) y **R11** (la empresa duena, en
    // columna opcional). La conversion la calcula el dominio a partir de dos descriptores
    // (`design.md > 5`), no navegando: por eso las dos referencias son escalares.
    //
    // Lo que este caso conserva de QC-32 es la MITAD NEGATIVA, y sigue mandando: no hay
    // ningun modelo de conversion aparte, y —esto lo suma QC-76— no hay ninguna bandera de
    // sistema.

    // `companyId`: la empresa duena. OPCIONAL, y la AUSENCIA DE VALOR —y nada mas— significa
    // «unidad de sistema» (R11).
    const companyId = field(unit, 'companyId')
    expect(companyId.type).toBe('String')
    expect(companyId.isOptional).toBe(true)
    expect(companyId.attributes).toContain('@map("company_id")')
    expect(companyId.attributes).toContain('@db.Uuid')
    expect(companyId.attributes).not.toMatch(/@default\(/)
    // Escalar SIN `@relation` (`design.md > 2.1`): `Company` es de `identity`, asi que
    // ninguna consulta puede atravesar de una unidad a una empresa con un `include`.
    expect(companyId.attributes).not.toMatch(/@relation/)

    // `baseUnitId`: de que unidad deriva. OPCIONAL (R1), y mapea a `unit_id`, que es el
    // nombre que fija la decision cerrada 2. Tambien escalar, sin auto-relacion.
    const baseUnitId = field(unit, 'baseUnitId')
    expect(baseUnitId.type).toBe('String')
    expect(baseUnitId.isOptional).toBe(true)
    expect(baseUnitId.attributes).toContain('@map("unit_id")')
    expect(baseUnitId.attributes).toContain('@db.Uuid')
    expect(baseUnitId.attributes).not.toMatch(/@default\(/)
    expect(baseUnitId.attributes).not.toMatch(/@relation/)

    // `factor`: cuantas unidades de la apuntada caben en una de esta (R3). DECIMAL EXACTO de
    // cuatro decimales, NUNCA coma flotante: un `Float` aqui haria que 0.1 no fuera 0.1.
    const factor = field(unit, 'factor')
    expect(factor.type).toBe('Decimal')
    expect(factor.isOptional).toBe(true)
    expect(factor.attributes).toMatch(/@db\.Decimal\(14,\s*4\)/)
    expect(factor.attributes).not.toMatch(/@db\.(Float|Double|Real)/)
    expect(factor.attributes).not.toMatch(/@default\(/)
    // No lleva `@map`: la columna ya se llama `factor` (R31, ingles).
    expect(factor.attributes).not.toMatch(/@map\("/)

    // «Juntos o ninguno» (R2) NO se declara aqui y no puede: lo garantiza
    // `units_derivation_pair_check` en el SQL, y lo prueba
    // `tests/integration/unidades/unidades-constraints.int.test.ts`.

    // NINGUNA columna ni bandera de sistema (R12, decision cerrada 11). «De sistema»
    // significa EXACTAMENTE «sin company_id»: dos campos que dicen casi lo mismo acaban
    // contradiciendose y entonces nadie sabe interpretar la fila. La peticion original SI
    // pedia un `system` con default `false`; el humano lo rechazo por escrito.
    for (const forbidden of [
      'system',
      'isSystem',
      'sistema',
      'esSistema',
      'global',
      'isGlobal',
      'shared',
      'isShared',
      'builtIn',
      'isBuiltIn',
      'scope',
      'ownerType',
    ]) {
      expect(has(unit, forbidden), `Unit.${forbidden} no debe existir`).toBe(false)
    }
    expect(unit.body).not.toMatch(/\bsystem\b/i)
    // Ningun booleano en la tabla: cualquier bandera nueva tendria que pasar por aqui.
    for (const candidate of unit.fields) {
      expect(candidate.type, `Unit.${candidate.name} no puede ser Boolean`).not.toBe('Boolean')
    }

    // La conversion NO se guarda en ninguna columna (R23) ni se modela como entidad aparte:
    // la equivalencia son DOS columnas en la propia unidad y nada mas.
    for (const forbidden of [
      'conversion',
      'conversionFactor',
      'ratio',
      'multiplier',
      'equivalence',
      'precision',
      'decimals',
    ]) {
      expect(has(unit, forbidden), `Unit.${forbidden} no debe existir`).toBe(false)
    }
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['UnitConversion', 'Conversion', 'UnitEquivalence']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
  })

  it('Unit declara /// @module unidades', () => {
    // R15: modulo propietario declarado en el esquema, y la guardia de modulos lo exige para
    // TODO modelo. Se lee el texto CRUDO porque `stripComments` se lleva justamente lo que
    // aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Unit')).toBe('unidades')

    // `unidades` es dueno de UN solo modelo: esta feature no adopta modelos ajenos, y los
    // otros dos siguen siendo de su modulo aunque esta migracion altere sus columnas.
    const unidadesModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'unidades')
      .map(([modelName]) => modelName)
      .sort()
    expect(unidadesModels).toEqual(['Unit'])
    expect(owners.get('Product')).toBe('inventario')
    expect(owners.get('RecipeLine')).toBe('recetas')
  })
})

describe('db/schema.prisma — la unidad de la presentacion y la de la linea de receta', () => {
  it('QC-121 R1: Product vuelve a declarar unidad, GUARDADA y ANULABLE; Presentation la sigue declarando OBLIGATORIA', () => {
    // El producto guarda su unidad -fija desde su primer lote, sin recalculo posible por
    // ningun camino de la aplicacion-, no una derivacion de lectura. Sigue sin `@relation`
    // -mismo argumento que la de `Presentation`- y ANULABLE: un producto sin lotes no tiene
    // de donde sacar una unidad.
    const productUnitId = field(product, 'unitId')
    expect(productUnitId.type).toBe('String')
    expect(productUnitId.isOptional).toBe(true)
    expect(productUnitId.attributes).toContain('@map("unit_id")')
    expect(productUnitId.attributes).toContain('@db.Uuid')
    expect(productUnitId.attributes).not.toMatch(/@default\(/)
    expect(productUnitId.attributes).not.toMatch(/@relation/)
    expect(product.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"products_unit_id_idx"\)/)
    // Ni la unidad como texto libre vuelve por la puerta de atras (QC-32 R10, que sigue).
    expect(has(product, 'unit')).toBe(false)
    expect(product.body).not.toMatch(/@map\("unit"\)/)
    for (const forbidden of ['unit', 'unitName', 'unitText', 'unidad', 'measure', 'uom']) {
      expect(has(product, forbidden), `Product.${forbidden} no debe existir`).toBe(false)
    }
    // Ni el objeto de Prisma: el producto no atraviesa a `unidades` de ninguna forma.
    expect(product.body).not.toMatch(/\bUnit\b/)

    // Y el sujeto que nunca cambio: la unidad la declara la presentacion, obligatoria y sin `@default`
    // —un default convertiria «no dijo unidad» en «dijo kilogramo» en silencio—.
    const unitId = field(presentation, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional).toBe(false)
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).not.toMatch(/@default\(/)
    // Escalar SIN `@relation`, que es el patron que protege la frontera entre `unidades` e
    // `inventario` (QC-32 R18): con `@relation` el cliente ofreceria `include: { unit: true }`
    // y obligaria a declarar `presentations Presentation[]` dentro de `Unit`, que es ajeno.
    expect(unitId.attributes).not.toMatch(/@relation/)
    // Con su indice: Postgres no indexa el lado hijo de una FK, y por ahi pasa el RESTRICT.
    expect(presentation.body).toMatch(
      /@@index\(\[unitId\],\s*map:\s*"presentations_unit_id_idx"\)/,
    )
  })

  it('RecipeLine declara unitId uuid OBLIGATORIO y ninguna columna unit de texto', () => {
    // R11 y decision cerrada 8: la unidad de la linea sigue siendo OBLIGATORIA, como fijo
    // QC-24. Lo que cambia es la forma —referencia en vez de texto—, no la regla.
    const unitId = field(recipeLine, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional).toBe(false)
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).toContain('@db.Uuid')
    // Sin `@default`: un default sembraria referencias inventadas y «sin unidad» dejaria de
    // rechazarse.
    expect(unitId.attributes).not.toMatch(/@default\(/)
    expect(recipeLine.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"recipe_lines_unit_id_idx"\)/)

    expect(has(recipeLine, 'unit')).toBe(false)
    expect(recipeLine.body).not.toMatch(/@map\("unit"\)/)
    for (const forbidden of ['unit', 'unitName', 'unitText', 'unidad', 'measure', 'uom']) {
      expect(has(recipeLine, forbidden), `RecipeLine.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('las tres unitId son escalares uuid SIN @relation y Unit no tiene campos de vuelta (QC-80 R21, R1; QC-121 R1)', () => {
    // R18 y decision cerrada 13: la FK es REAL, pero vive escrita a mano en `migration.sql`
    // (`design.md` secciones 4.3 y 8.1). Declararla con `@relation` regalaria
    // `include: { unit: true }` desde `inventario` y desde `recetas`, y NINGUNA guardia lo
    // detectaria porque un `include` no es un import; ademas obligaria a declarar
    // colecciones de vuelta DENTRO de `Unit`, que es de otro modulo.
    //
    // ACTUALIZADO EL 2026-09-11 POR QC-80. ANTES las dos eran `Product.unitId` (opcional) y
    // `RecipeLine.unitId`. LO DEROGA **R21** para la primera: el producto dejo de declarar
    // unidad, y su lugar en este grupo lo ocupa `Presentation.unitId`, OBLIGATORIA (**R1**)
    // y con su FK `presentations_unit_id_fkey` tambien escrita A MANO en
    // `db/migrations/20260911120000_presentation_unit/migration.sql`. La REGLA no cambia —el
    // patron escalar sin `@relation` es lo que sostiene la frontera—; cambia quien la cumple,
    // y por eso el caso se reescribe en vez de borrarse.
    for (const [modelName, model, isOptional] of CROSS_MODULE_UNIT_SCALARS) {
      const candidate = field(model, 'unitId')
      expect(candidate.type, `${modelName}.unitId debe ser String`).toBe('String')
      expect(candidate.attributes, `${modelName}.unitId debe ser uuid`).toContain('@db.Uuid')
      expect(candidate.attributes, `${modelName}.unitId debe mapear a unit_id`).toContain(
        '@map("unit_id")',
      )
      expect(candidate.attributes, `${modelName}.unitId NO puede llevar @relation`).not.toMatch(
        /@relation/,
      )
      expect(candidate.isOptional, `${modelName}.unitId opcional=${String(isOptional)}`).toBe(
        isOptional,
      )
      // Ningun campo de esos modelos apunta a `Unit` como objeto: no hay por donde atravesar.
      for (const other of model.fields) {
        expect(other.type, `${modelName}.${other.name} no puede apuntar a Unit`).not.toBe('Unit')
      }
    }

    // Y `Unit` no gana ninguna coleccion del otro lado: ni `presentations` -la que intentaria
    // colar QC-80 si alguien pusiera `@relation` en `Presentation.unitId`- ni `products` ni
    // `lines`.
    expect(has(unit, 'presentations')).toBe(false)
    expect(has(unit, 'products')).toBe(false)
    expect(has(unit, 'lines')).toBe(false)
    expect(has(unit, 'recipeLines')).toBe(false)
    expect(unit.fields.some((candidate) => candidate.isList)).toBe(false)
    for (const candidate of unit.fields) {
      for (const ajeno of ['Product', 'RecipeLine', 'Recipe', 'User'] as const) {
        expect(candidate.type, `Unit.${candidate.name} no puede apuntar a ${ajeno}`).not.toBe(ajeno)
      }
    }
    // `Unit` no declara NINGUN `@relation`: no participa en ninguna relacion de Prisma.
    expect(unit.body).not.toMatch(/@relation/)
  })

  it('la tabla y sus columnas mapean a snake_case en ingles', () => {
    // QC-32 R20 y decision cerrada 16, que QC-76 **R31** reafirma para todo lo que crea esta
    // feature: tabla, columnas e indices en ingles y `snake_case`.
    //
    // REESCRITO EL 2026-09-07 POR QC-76: la lista de indices esperados empezaba por
    // `units_name_normalized_key`, el `@@unique` GLOBAL de QC-32, y se leia de los
    // `@@unique(... map:)` del modelo. Ese indice ya no esta —lo DEROGA R14, ver el caso del
    // nombre normalizado— y en su lugar `Unit` declara DOS `@@index` de FK. Los cuatro unicos
    // parciales que lo sustituyen NO se pueden leer desde aqui: viven en el SQL, y su idioma
    // lo vigila `unidades-migration.test.ts`.
    expect(unit.body).toContain('@@map("units")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [name, column] of UNIT_COLUMNS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(unit, name).attributes)
      expect(mapped?.[1] ?? name, `Unit.${name} debe mapear a ${column}`).toBe(column)
      expect(column, `Unit.${name} -> ${column}`).toMatch(SNAKE_CASE)
    }
    // Todo campo en `camelCase` con mayuscula dentro tiene que declarar su `@map`, o la
    // columna real saldria en `camelCase` y R20 se incumpliria sin aviso.
    for (const candidate of unit.fields) {
      if (!/[A-Z]/.test(candidate.name)) continue
      expect(candidate.attributes, `falta @map en Unit.${candidate.name}`).toMatch(/@map\("/)
    }

    // Los indices que el modelo declara, tambien en ingles. Lista EXACTA de CINCO: si alguien
    // anade uno con nombre en espanol, o vuelve a colar un `@@unique`, este caso lo dice.
    const indexNames = [
      ...unit.body.matchAll(/@@(?:unique|index)\([^)]*map:\s*"([^"]+)"/g),
      ...presentation.body.matchAll(/@@index\(\[unitId\][^)]*map:\s*"([^"]+)"/g),
      ...product.body.matchAll(/@@index\(\[unitId\][^)]*map:\s*"([^"]+)"/g),
      ...recipeLine.body.matchAll(/@@index\(\[unitId\][^)]*map:\s*"([^"]+)"/g),
    ]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    expect(indexNames).toEqual([
      'units_company_id_idx',
      'units_unit_id_idx',
      'presentations_unit_id_idx',
      'products_unit_id_idx',
      'recipe_lines_unit_id_idx',
    ])
    for (const name of indexNames) expect(name).toMatch(SNAKE_CASE)
  })
})
