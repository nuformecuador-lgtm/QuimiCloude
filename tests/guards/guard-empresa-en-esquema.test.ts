// Guardia: toda tabla de negocio declara su columna de empresa (o esta en la lista cerrada de
// exentas que vive aqui mismo, con su motivo).
//
// Lee `db/schema.prisma` como TEXTO: nada de `@prisma/client` ni del DMMF generado, porque ese
// cliente juzga el esquema de la ultima `prisma generate`, no el del disco.

import { basename, dirname, join, sep } from 'node:path'
import { readFileSync } from 'node:fs'
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

const COLUMNA_EMPRESA = 'company_id'

export type ModeloLeido = { modelo: string; tabla: string; columnas: ReadonlySet<string> }

function normalizarFinesDeLinea(source: string): string {
  return source.replace(/\r\n?/g, '\n')
}

/** Quita `//` y `///` linea a linea. El esquema no usa comentarios de bloque. */
function quitarComentariosDeLinea(source: string): string {
  return source
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Lee `db/schema.prisma` como texto y extrae cada modelo con su tabla y sus columnas fisicas. */
export function leerModelos(schemaSource: string): readonly ModeloLeido[] {
  const lineas = quitarComentariosDeLinea(normalizarFinesDeLinea(schemaSource)).split('\n')
  const modelos: ModeloLeido[] = []
  let i = 0
  while (i < lineas.length) {
    const inicioModelo = /^model\s+(\w+)\s*\{/.exec((lineas[i] ?? '').trim())
    if (!inicioModelo) {
      i += 1
      continue
    }
    const nombreModelo = inicioModelo[1] as string
    i += 1
    const cuerpo: string[] = []
    while (i < lineas.length && (lineas[i] ?? '').trim() !== '}') {
      cuerpo.push((lineas[i] ?? '').trim())
      i += 1
    }
    i += 1

    let tabla = nombreModelo
    const columnas = new Set<string>()
    for (const linea of cuerpo) {
      if (linea.startsWith('@@')) {
        const mapaTabla = /@@map\("([^"]+)"\)/.exec(linea)
        if (mapaTabla) tabla = mapaTabla[1] as string
        continue
      }
      const campo = /^(\w+)\s+\w+/.exec(linea)
      if (!campo) continue
      const mapaColumna = /@map\("([^"]+)"\)/.exec(linea)
      columnas.add(mapaColumna ? (mapaColumna[1] as string) : (campo[1] as string))
    }
    modelos.push({ modelo: nombreModelo, tabla, columnas })
  }
  return modelos
}

export type Exenta = { tabla: string; motivo: string }

export const EXENTAS: readonly Exenta[] = [
  { tabla: 'document_types', motivo: 'catalogo de tipos de documento, compartido por todas las empresas' },
  { tabla: 'roles', motivo: 'catalogo de roles, compartido por todas las empresas' },
  { tabla: 'permissions', motivo: 'catalogo de permisos, compartido por todas las empresas' },
  { tabla: 'role_permissions', motivo: 'cuelga de dos catalogos compartidos, roles y permisos' },
  { tabla: 'companies', motivo: 'es la propia fila de la empresa, no algo que le pertenezca' },
  { tabla: 'credential_setup_tokens', motivo: 'cuelga de un usuario: la empresa es la de su ficha, o ninguna si es el Maestro' },
  { tabla: 'revoked_sessions', motivo: 'cuelga de un usuario: la empresa es la de su ficha, o ninguna si es el Maestro' },
  { tabla: 'recipe_lines', motivo: 'hereda la empresa de la receta a la que pertenece' },
]

function mensajeSinEmpresa(modelo: ModeloLeido): string {
  return (
    `db/schema.prisma: el modelo '${modelo.modelo}' (tabla '${modelo.tabla}') no declara la ` +
    `columna company_id y su tabla no esta en EXENTAS; o se anade la columna, o se anade la ` +
    `tabla a EXENTAS con su motivo, en la revision`
  )
}

/** Un hallazgo por modelo que no declara la columna de empresa y cuya tabla no esta exenta. */
export function hallazgosSinEmpresa(
  modelos: readonly ModeloLeido[],
  exentas: readonly Exenta[],
): readonly string[] {
  const tablasExentas = new Set(exentas.map((exenta) => exenta.tabla))
  return modelos
    .filter((modelo) => !modelo.columnas.has(COLUMNA_EMPRESA) && !tablasExentas.has(modelo.tabla))
    .map(mensajeSinEmpresa)
}

/** Un hallazgo por entrada de EXENTAS sin motivo (o con motivo en blanco). */
export function hallazgosExentasSinMotivo(exentas: readonly Exenta[]): readonly string[] {
  return exentas
    .filter((exenta) => exenta.motivo.trim() === '')
    .map((exenta) => `EXENTAS: la entrada '${exenta.tabla}' no lleva motivo`)
}

/** Un hallazgo por entrada de EXENTAS que sobra: su tabla ya no existe o ya tiene empresa. */
export function hallazgosExentasQueSobran(
  modelos: readonly ModeloLeido[],
  exentas: readonly Exenta[],
): readonly string[] {
  const modeloPorTabla = new Map(modelos.map((modelo) => [modelo.tabla, modelo] as const))
  return exentas.flatMap((exenta) => {
    const modelo = modeloPorTabla.get(exenta.tabla)
    if (!modelo) return [`EXENTAS: la tabla '${exenta.tabla}' no existe en db/schema.prisma`]
    if (modelo.columnas.has(COLUMNA_EMPRESA)) {
      return [`EXENTAS: la tabla '${exenta.tabla}' ya declara la columna company_id`]
    }
    return []
  })
}

const FRASE_INICIAL_BULLET = 'Toda tabla de negocio nueva nace con su columna de empresa.'

/** Localiza el bullet de exentas de `docs/architecture.md > Dominio` por su frase inicial. */
function extraerBulletDeExentas(docSource: string): string | null {
  const lineas = normalizarFinesDeLinea(docSource).split('\n')
  const inicio = lineas.findIndex((linea) => linea.includes(FRASE_INICIAL_BULLET))
  if (inicio === -1) return null
  const cuerpo = [lineas[inicio] as string]
  let i = inicio + 1
  while (i < lineas.length && !/^\s+-\s+\*\*/.test(lineas[i] ?? '')) {
    cuerpo.push(lineas[i] as string)
    i += 1
  }
  return cuerpo.join('\n')
}

function extraerTablasEntreComillasInvertidas(bullet: string): readonly string[] {
  return [...bullet.matchAll(/`([^`]+)`/g)]
    .map((coincidencia) => coincidencia[1] as string)
    .filter((identificador) => /^[a-z][a-z_]*$/.test(identificador) && identificador !== COLUMNA_EMPRESA)
}

/** El bullet de exentas de `docs/architecture.md` nombra exactamente las tablas de EXENTAS. */
export function hallazgosDocExentas(docSource: string, exentas: readonly Exenta[]): readonly string[] {
  const bullet = extraerBulletDeExentas(docSource)
  if (bullet === null) return ['docs/architecture.md: no se encontro el bullet de tablas exentas']

  const tablasDelDoc = new Set(extraerTablasEntreComillasInvertidas(bullet))
  const tablasDeExentas = new Set(exentas.map((exenta) => exenta.tabla))

  const hallazgos: string[] = []
  const faltan = [...tablasDeExentas].filter((tabla) => !tablasDelDoc.has(tabla))
  if (faltan.length > 0) {
    hallazgos.push(`docs/architecture.md: el bullet de exentas no nombra ${faltan.join(', ')}`)
  }
  const sobran = [...tablasDelDoc].filter((tabla) => !tablasDeExentas.has(tabla))
  if (sobran.length > 0) {
    hallazgos.push(`docs/architecture.md: el bullet de exentas nombra de mas a ${sobran.join(', ')}`)
  }
  return hallazgos
}

const schemaSourceReal = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
const docSourceReal = readFileSync(join(repoRoot, 'docs', 'architecture.md'), 'utf8')
const modelosReales = leerModelos(schemaSourceReal)

describe('guardia — company_id en el esquema', () => {
  it('R1 lee db/schema.prisma sin cliente generado ni red', () => {
    expect(modelosReales.length, 'no se encontro ningun modelo en db/schema.prisma').toBeGreaterThan(0)
    expect(modelosReales.some((modelo) => modelo.modelo === 'User')).toBe(true)
  })

  it('R2 da rojo a un modelo sin company_id que no esta exento', () => {
    const modelos = leerModelos(['model Foo {', '  id String @id', '  @@map("foos")', '}'].join('\n'))
    expect(hallazgosSinEmpresa(modelos, EXENTAS)).toEqual([
      "db/schema.prisma: el modelo 'Foo' (tabla 'foos') no declara la columna company_id y su " +
        'tabla no esta en EXENTAS; o se anade la columna, o se anade la tabla a EXENTAS con su ' +
        'motivo, en la revision',
    ])
  })

  it('R3 acepta la columna obligatoria y la opcional', () => {
    const obligatoria = leerModelos(
      ['model Foo {', '  id String @id', '  companyId String @map("company_id")', '  @@map("foos")', '}'].join('\n'),
    )
    const opcional = leerModelos(
      ['model Foo {', '  id String @id', '  companyId String? @map("company_id")', '  @@map("foos")', '}'].join(
        '\n',
      ),
    )
    expect(hallazgosSinEmpresa(obligatoria, EXENTAS)).toEqual([])
    expect(hallazgosSinEmpresa(opcional, EXENTAS)).toEqual([])
  })

  it('R4 no juzga a una exenta sin columna', () => {
    const modelos = leerModelos(['model Role {', '  id String @id', '  @@map("roles")', '}'].join('\n'))
    expect(hallazgosSinEmpresa(modelos, EXENTAS)).toEqual([])
  })

  it('R5 no cuenta company_id en comentario ni en fields de una relacion', () => {
    const soloComentario = leerModelos(
      [
        'model Foo {',
        '  id String @id',
        '  // company_id String',
        '  /// company_id String',
        '  otroCampo String // @map("company_id") alias legado, no usar',
        '  @@map("foos")',
        '}',
      ].join('\n'),
    )
    const soloEnRelacion = leerModelos(
      [
        'model Foo {',
        '  id String @id',
        '  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict, onUpdate: Cascade)',
        '  @@map("foos")',
        '}',
      ].join('\n'),
    )
    expect(hallazgosSinEmpresa(soloComentario, EXENTAS)).toEqual([
      "db/schema.prisma: el modelo 'Foo' (tabla 'foos') no declara la columna company_id y su " +
        'tabla no esta en EXENTAS; o se anade la columna, o se anade la tabla a EXENTAS con su ' +
        'motivo, en la revision',
    ])
    expect(hallazgosSinEmpresa(soloEnRelacion, EXENTAS)).toEqual([
      "db/schema.prisma: el modelo 'Foo' (tabla 'foos') no declara la columna company_id y su " +
        'tabla no esta en EXENTAS; o se anade la columna, o se anade la tabla a EXENTAS con su ' +
        'motivo, en la revision',
    ])
    expect(soloEnRelacion[0]?.columnas.has('company')).toBe(true)
  })

  it('R6 un modelo llamado como una exenta con otra tabla da rojo', () => {
    const modelos = leerModelos(['model Role {', '  id String @id', '  @@map("roles_v2")', '}'].join('\n'))
    expect(hallazgosSinEmpresa(modelos, EXENTAS)).toEqual([
      "db/schema.prisma: el modelo 'Role' (tabla 'roles_v2') no declara la columna company_id y " +
        'su tabla no esta en EXENTAS; o se anade la columna, o se anade la tabla a EXENTAS con su ' +
        'motivo, en la revision',
    ])
  })

  it('R7 EXENTAS son exactamente las ocho y users no esta', () => {
    const tablas = EXENTAS.map((exenta) => exenta.tabla)
    expect(new Set(tablas)).toEqual(
      new Set([
        'document_types',
        'roles',
        'permissions',
        'role_permissions',
        'companies',
        'credential_setup_tokens',
        'revoked_sessions',
        'recipe_lines',
      ]),
    )
    expect(tablas).toHaveLength(8)
    expect(tablas).not.toContain('users')
  })

  it('R8 cada entrada de EXENTAS lleva su motivo', () => {
    expect(hallazgosExentasSinMotivo(EXENTAS)).toEqual([])
    for (const exenta of EXENTAS) {
      expect(exenta.motivo.trim().length, `la entrada '${exenta.tabla}' no lleva motivo`).toBeGreaterThan(0)
    }
  })

  it('R9 una exenta sin motivo da rojo', () => {
    expect(hallazgosExentasSinMotivo([{ tabla: 'x', motivo: '  ' }])).toEqual([
      "EXENTAS: la entrada 'x' no lleva motivo",
    ])
    expect(hallazgosExentasSinMotivo([{ tabla: 'x', motivo: 'con motivo' }])).toEqual([])
  })

  it('R10 el esquema real queda en verde y users se juzga por su columna', () => {
    expect(hallazgosSinEmpresa(modelosReales, EXENTAS)).toEqual([])
    const users = modelosReales.find((modelo) => modelo.tabla === 'users')
    expect(users, "no se encontro la tabla 'users' en db/schema.prisma").toBeDefined()
    expect((users as ModeloLeido).columnas.has(COLUMNA_EMPRESA)).toBe(true)
    expect(EXENTAS.some((exenta) => exenta.tabla === 'users')).toBe(false)
  })

  it('R11 CRLF y LF dan los mismos hallazgos', () => {
    const fuenteLf = [
      'model Foo {',
      '  id String @id',
      '  // company_id String',
      '  otroCampo String // @map("company_id") alias legado, no usar',
      '  company Company @relation(fields: [companyId], references: [id])',
      '  @@map("foos")',
      '}',
    ].join('\n')
    const fuenteCrlf = fuenteLf.replace(/\n/g, '\r\n')
    expect(hallazgosSinEmpresa(leerModelos(fuenteCrlf), EXENTAS)).toEqual(
      hallazgosSinEmpresa(leerModelos(fuenteLf), EXENTAS),
    )
    expect(hallazgosSinEmpresa(leerModelos(fuenteLf), EXENTAS)).toHaveLength(1)
  })

  it('R12 un esquema sin modelos da rojo', () => {
    expect(leerModelos('')).toEqual([])
    const soloEnum = ['enum EstadoDePrueba {', '  activo', '  inactivo', '}'].join('\n')
    expect(leerModelos(soloEnum)).toEqual([])
  })

  it('R13 la guardia vive en tests/guards y la selecciona el patron guard', () => {
    const rutaArchivo = fileURLToPath(import.meta.url)
    const rutaPosix = rutaArchivo.split(sep).join('/')
    expect(rutaPosix).toContain('/tests/guards/')
    expect(basename(rutaArchivo)).toMatch(/guard/)
  })

  it('R14 la lista de docs/architecture.md coincide con EXENTAS', () => {
    expect(hallazgosDocExentas(docSourceReal, EXENTAS)).toEqual([])

    const bulletSinRecipeLines = [
      '   - **Toda tabla de negocio nueva nace con su columna de empresa.** Basta con que la',
      '     columna `company_id` exista. Las exentas son `document_types`, `roles`,',
      '     `permissions`, `role_permissions`, `companies`, `credential_setup_tokens` y',
      '     `revoked_sessions`.',
      '   - **Lo que la regla vieja protegia sigue en pie.**',
    ].join('\n')
    expect(hallazgosDocExentas(bulletSinRecipeLines, EXENTAS)).toEqual([
      'docs/architecture.md: el bullet de exentas no nombra recipe_lines',
    ])

    const bulletConUsersDeMas = [
      '   - **Toda tabla de negocio nueva nace con su columna de empresa.** Basta con que la',
      '     columna `company_id` exista. Las exentas son `document_types`, `roles`,',
      '     `permissions`, `role_permissions`, `companies`, `credential_setup_tokens`,',
      '     `revoked_sessions`, `recipe_lines` y `users`.',
      '   - **Lo que la regla vieja protegia sigue en pie.**',
    ].join('\n')
    expect(hallazgosDocExentas(bulletConUsersDeMas, EXENTAS)).toEqual([
      'docs/architecture.md: el bullet de exentas nombra de mas a users',
    ])

    expect(hallazgosDocExentas('# doc sin el bullet\n', EXENTAS)).toEqual([
      'docs/architecture.md: no se encontro el bullet de tablas exentas',
    ])
  })

  it('R16 una exenta que sobra da rojo', () => {
    expect(hallazgosExentasQueSobran(modelosReales, EXENTAS)).toEqual([])

    const modelosSinTabla = leerModelos(['model Role {', '  id String @id', '  @@map("roles")', '}'].join('\n'))
    expect(hallazgosExentasQueSobran(modelosSinTabla, [{ tabla: 'permissions', motivo: 'no existe' }])).toEqual([
      "EXENTAS: la tabla 'permissions' no existe en db/schema.prisma",
    ])

    const modelosConEmpresa = leerModelos(
      ['model Role {', '  id String @id', '  companyId String @map("company_id")', '  @@map("roles")', '}'].join(
        '\n',
      ),
    )
    expect(hallazgosExentasQueSobran(modelosConEmpresa, [{ tabla: 'roles', motivo: 'ya no aplica' }])).toEqual([
      "EXENTAS: la tabla 'roles' ya declara la columna company_id",
    ])
  })
})
