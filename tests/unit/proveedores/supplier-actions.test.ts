// T14 — Las dos Server Actions de `proveedores` (`design.md > 9`, `> 6.4`). Mockea
// `@/lib/composition` igual que `tests/unit/inventario/product-actions.test.ts`: la action
// se prueba contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R5, R42 y R43 con los nombres EXACTOS que exige `tasks.md > Trazabilidad`.
//
// Los tres casos miden cosas distintas a proposito:
//  - R5  : de donde sale el actor, y que la action NO vuelve a decidir nada (ni rol, ni
//          ninguna otra regla de negocio).
//  - R42 : la FORMA de la entrada por operacion -mutacion con `FormData`, consulta con
//          argumentos tipados- y que no hay route handler por ninguna parte.
//  - R43 : que el error viaja por el `code` estable de la clase y NUNCA por el texto, y que
//          lo que no es error de dominio se relanza en vez de tragarse.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createSupplierAction,
  deleteSupplierAction,
  getSupplierAction,
  listSuppliersAction,
  updateSupplierAction,
  type CreateSupplierFormState,
  type SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions'
import {
  createCatalogLineAction,
  deleteCatalogLineAction,
  listCatalogLinesAction,
  updateCatalogLineAction,
  type CatalogLineMutationFormState,
  type CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions'
import { errorMessage } from '@/lib/modules/errores'
import {
  CatalogLineNotFoundError,
  DuplicateCatalogLineError,
  SupplierDuplicateNameError,
  SupplierNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/proveedores'

const {
  createSupplierMock,
  updateSupplierMock,
  deleteSupplierMock,
  getSupplierMock,
  listSuppliersMock,
  createCatalogLineMock,
  updateCatalogLineMock,
  deleteCatalogLineMock,
  listCatalogLinesMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  createSupplierMock: vi.fn(),
  updateSupplierMock: vi.fn(),
  deleteSupplierMock: vi.fn(),
  getSupplierMock: vi.fn(),
  listSuppliersMock: vi.fn(),
  createCatalogLineMock: vi.fn(),
  updateCatalogLineMock: vi.fn(),
  deleteCatalogLineMock: vi.fn(),
  listCatalogLinesMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}))

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
})

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  proveedores: {
    createSupplier: createSupplierMock,
    updateSupplier: updateSupplierMock,
    deleteSupplier: deleteSupplierMock,
    getSupplier: getSupplierMock,
    listSuppliers: listSuppliersMock,
    createCatalogLine: createCatalogLineMock,
    updateCatalogLine: updateCatalogLineMock,
    deleteCatalogLine: deleteCatalogLineMock,
    listCatalogLines: listCatalogLinesMock,
  },
}))

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  // QC-74 T8: `roleName` se queda porque es DISPLAY, pero lo que autoriza es `permissions`
  // (R18), y es lo unico que la action baja al caso de uso.
  roleName: 'Administrador',
  permissions: ['proveedores.consultar', 'proveedores.modificar'],
}

const ADMIN_SESSION_CONTEXT = { companyId: '22222222-2222-4222-8222-222222222222' }

const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333'
const PRESENTATION_ID = '44444444-4444-4444-8444-444444444444'
const UNIT_ID = '55555555-5555-4555-8555-555555555555'
const LINE_ID = '55555555-5555-4555-8555-555555555555'

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

const CREATE_SUPPLIER_INITIAL: CreateSupplierFormState = { status: 'idle' }
const SUPPLIER_MUTATION_INITIAL: SupplierMutationFormState = { status: 'idle' }
const CREATE_LINE_INITIAL: CreateCatalogLineFormState = { status: 'idle' }
const LINE_MUTATION_INITIAL: CatalogLineMutationFormState = { status: 'idle' }

const VALID_SUPPLIER_FIELDS = {
  name: 'Quimicos del Pacifico S.A.',
  phone: '+593 99 123 4567',
  email: 'ventas@quimpacifico.ec',
}

/**
 * Lo que el formulario de la linea envia tras QC-52 (R31): entra `name`, `presentationId`,
 * `unitId` e `imagePath`, y sale el identificador de articulo del inventario que QC-43 leia.
 * Todos los valores son CADENA porque eso es lo unico que `FormData` entrega.
 */
const VALID_LINE_FIELDS = {
  supplierId: SUPPLIER_ID,
  name: 'Acido citrico anhidro',
  presentationId: PRESENTATION_ID,
  unitId: UNIT_ID,
  imagePath: 'catalogo/acido-citrico.png',
  cost: '12.5000',
  minPurchase: '5',
  deliveryTime: '3',
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const drivingDir = join(repoRoot, 'lib', 'modules', 'proveedores', 'adapters', 'driving')

/** Fuente SIN comentarios: se vigila el codigo, no la prosa que lo explica. */
function readSource(file: string): string {
  return readFileSync(join(drivingDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const ACTION_FILES = ['supplier-actions.ts', 'supplier-catalog-actions.ts'] as const

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER)
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT)
})

describe('Server Actions de proveedores — actor, forma de entrada y errores', () => {
  it('la accion toma el actor de identity.getSessionUser y no vuelve a comprobar el permiso', async () => {
    // R5, primera mitad: el actor sale de la sesion, UNA vez por invocacion, y llega al caso
    // de uso tal cual. Se comprueba en las NUEVE actions, no en una de muestra: una sola que
    // se olvidara de pasarlo dejaria el caso de uso recibiendo `undefined`.
    createSupplierMock.mockResolvedValue({ id: 'supplier-1' })
    updateSupplierMock.mockResolvedValue(undefined)
    deleteSupplierMock.mockResolvedValue(undefined)
    getSupplierMock.mockResolvedValue({ id: SUPPLIER_ID })
    listSuppliersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    createCatalogLineMock.mockResolvedValue({ id: LINE_ID })
    updateCatalogLineMock.mockResolvedValue(undefined)
    deleteCatalogLineMock.mockResolvedValue(undefined)
    listCatalogLinesMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })

    const ESPERADO = {
      id: 'user-admin-1',
      companyId: ADMIN_SESSION_CONTEXT.companyId,
      permissions: ['proveedores.consultar', 'proveedores.modificar'],
    }

    await createSupplierAction(CREATE_SUPPLIER_INITIAL, formDataOf(VALID_SUPPLIER_FIELDS))
    expect(createSupplierMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await updateSupplierAction(SUPPLIER_ID, SUPPLIER_MUTATION_INITIAL, formDataOf(VALID_SUPPLIER_FIELDS))
    expect(updateSupplierMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    await deleteSupplierAction(SUPPLIER_MUTATION_INITIAL, formDataOf({ id: SUPPLIER_ID }))
    expect(deleteSupplierMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await getSupplierAction(SUPPLIER_ID)
    expect(getSupplierMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await listSuppliersAction({ page: 1 })
    expect(listSuppliersMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await createCatalogLineAction(CREATE_LINE_INITIAL, formDataOf(VALID_LINE_FIELDS))
    expect(createCatalogLineMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await updateCatalogLineAction(LINE_ID, LINE_MUTATION_INITIAL, formDataOf(VALID_LINE_FIELDS))
    expect(updateCatalogLineMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    await deleteCatalogLineAction(LINE_MUTATION_INITIAL, formDataOf({ id: LINE_ID }))
    expect(deleteCatalogLineMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await listCatalogLinesAction(SUPPLIER_ID, { page: 1 })
    expect(listCatalogLinesMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    expect(getSessionUserMock).toHaveBeenCalledTimes(9)

    // Sin sesion, el actor que baja es `null` -no un objeto inventado, no un `throw` de la
    // action-: quien rechaza es el caso de uso (R3, falla cerrado).
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue(null)
    createSupplierMock.mockRejectedValue(new UnauthorizedError())
    const sinSesion = await createSupplierAction(
      CREATE_SUPPLIER_INITIAL,
      formDataOf(VALID_SUPPLIER_FIELDS),
    )
    expect(createSupplierMock.mock.calls[0]?.[1]).toBeNull()
    expect(sinSesion).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) })

    // R5, segunda mitad: la action NO decide. Ningun archivo de `adapters/driving/` nombra
    // la comprobacion de permiso, el rol, ni ninguna regla de negocio del dominio -normalizacion
    // del nombre, esquemas de entrada, paginacion-. Todo eso vive en el caso de uso.
    for (const file of ACTION_FILES) {
      const source = readSource(file)
      expect(source, `${file} repite la comprobacion de permiso`).not.toMatch(
        /require(Admin|Permission)/,
      )
      expect(source, `${file} incrusta el nombre del rol`).not.toMatch(/Administrador/)
      expect(source, `${file} incrusta ROLE_ADMINISTRADOR`).not.toMatch(/ROLE_ADMINISTRADOR/)
      expect(source, `${file} valida con el esquema del dominio`).not.toMatch(/Schema\b/)
      expect(source, `${file} normaliza el nombre`).not.toMatch(/normalizeSupplierName/)
      expect(source, `${file} reimplementa la paginacion`).not.toMatch(
        /DEFAULT_PAGE_SIZE|MAX_PAGE_SIZE|pageSize\s*[-*]|Math\.(ceil|min)/,
      )
      // Y no toca la base ni por asomo: el driving pide todo a la composicion.
      expect(source, `${file} habla con el ORM`).not.toMatch(/@prisma\/client|prisma\./)
    }
  })

  it('las mutaciones reciben FormData y las consultas argumentos tipados', async () => {
    // R42. Se mide en tres planos, porque un solo plano se puede falsear:
    //
    //  1. COMPORTAMIENTO: las mutaciones leen de verdad los campos del `FormData` -si la
    //     action ignorara el formulario, el candidato que llega al caso de uso no llevaria
    //     estos valores-.
    //  2. FIRMA: las consultas NO admiten `FormData`; reciben argumentos ya tipados. Se
    //     comprueba por el numero de parametros declarados y por el texto de la firma.
    //  3. ALCANCE: no existe ningun route handler de proveedores, ni `fetch` a una ruta
    //     propia (la otra mitad de R42, con su censo de `app/api`, la cierra `scope.test.ts`).
    createSupplierMock.mockResolvedValue({ id: 'supplier-1' })
    createCatalogLineMock.mockResolvedValue({ id: LINE_ID })
    updateSupplierMock.mockResolvedValue(undefined)
    updateCatalogLineMock.mockResolvedValue(undefined)
    deleteSupplierMock.mockResolvedValue(undefined)
    deleteCatalogLineMock.mockResolvedValue(undefined)

    // 1. El alta del proveedor traslada los tres campos del formulario, sin tocarlos: el
    //    recorte y la conversion del blanco en ausencia son de `zod` (R13), no del borde.
    await createSupplierAction(
      CREATE_SUPPLIER_INITIAL,
      formDataOf({ name: '  Acme  ', phone: '  ', email: 'ventas@acme.ec' }),
    )
    expect(createSupplierMock.mock.calls[0]?.[0]).toEqual({
      name: '  Acme  ',
      phone: '  ',
      email: 'ventas@acme.ec',
    })

    // El id de la edicion NO viaja en el `FormData`: es argumento, y el `FormData` solo
    // lleva los campos de negocio (R14: reemplazo completo).
    await updateSupplierAction(
      SUPPLIER_ID,
      SUPPLIER_MUTATION_INITIAL,
      formDataOf(VALID_SUPPLIER_FIELDS),
    )
    expect(updateSupplierMock.mock.calls[0]?.[0]).toBe(SUPPLIER_ID)
    expect(updateSupplierMock.mock.calls[0]?.[1]).not.toHaveProperty('id')

    // La baja si lleva el id en el formulario (campo oculto de un boton), y sin el no llama
    // al caso de uso.
    await deleteSupplierAction(SUPPLIER_MUTATION_INITIAL, formDataOf({ id: SUPPLIER_ID }))
    expect(deleteSupplierMock.mock.calls[0]?.[0]).toBe(SUPPLIER_ID)
    const sinId = await deleteSupplierAction(SUPPLIER_MUTATION_INITIAL, formDataOf({}))
    expect(sinId).toEqual({ status: 'error', code: 'invalid_input', message: expect.any(String) })
    expect(deleteSupplierMock).toHaveBeenCalledTimes(1)

    // 1.b La linea del catalogo: `cost`/`minPurchase` siguen siendo CADENA hasta el
    //     adaptador driven, y `deliveryTime` se convierte a numero -si no, `z.number()` lo
    //     rechazaria y R30 no se podria cumplir nunca desde un formulario-.
    await createCatalogLineAction(CREATE_LINE_INITIAL, formDataOf(VALID_LINE_FIELDS))
    expect(createCatalogLineMock.mock.calls[0]?.[0]).toEqual({
      supplierId: SUPPLIER_ID,
      name: 'Acido citrico anhidro',
      presentationId: PRESENTATION_ID,
      unitId: UNIT_ID,
      imagePath: 'catalogo/acido-citrico.png',
      cost: '12.5000',
      minPurchase: '5',
      deliveryTime: 3,
    })

    // Un `deliveryTime` que no es entero se rechaza EN EL BORDE, sin llamar al caso de uso:
    // `Number('tres dias')` seria `NaN`, y `NaN` pasa `z.number().int()` como valido.
    const conBasura = await createCatalogLineAction(
      CREATE_LINE_INITIAL,
      formDataOf({ ...VALID_LINE_FIELDS, deliveryTime: 'tres dias' }),
    )
    expect(conBasura).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    })
    expect(createCatalogLineMock).toHaveBeenCalledTimes(1)

    // Los CUATRO opcionales vacios llegan como AUSENCIA, no como cadena vacia (R10). QC-52
    // anade `unitId` e `imagePath` a la lista: un `<input>` sin rellenar envia `''`, y `''`
    // no es un uuid ni una ruta, asi que dejarlo pasar convertiria «no lo indique» en
    // `invalid_input`. El costo, que es OBLIGATORIO, se entrega tal cual y su vacio lo
    // rechaza `zod`: eso es traduccion de la forma del borde, no una regla de negocio.
    await createCatalogLineAction(
      CREATE_LINE_INITIAL,
      formDataOf({
        ...VALID_LINE_FIELDS,
        unitId: '',
        imagePath: '',
        minPurchase: '',
        deliveryTime: '',
      }),
    )
    expect(createCatalogLineMock.mock.calls[1]?.[0]).toMatchObject({
      unitId: undefined,
      imagePath: undefined,
      minPurchase: undefined,
      deliveryTime: undefined,
    })
    // Y el nombre y la presentacion, que son OBLIGATORIOS, se entregan tal cual -incluso
    // vacios-: quien los rechaza es el esquema del dominio, no la action.
    expect(createCatalogLineMock.mock.calls[1]?.[0]).toMatchObject({
      name: 'Acido citrico anhidro',
      presentationId: PRESENTATION_ID,
      cost: '12.5000',
    })

    // La baja de la linea, igual que la del proveedor, lleva el id en el formulario y sin
    // el no llama al caso de uso.
    await deleteCatalogLineAction(LINE_MUTATION_INITIAL, formDataOf({ id: LINE_ID }))
    expect(deleteCatalogLineMock.mock.calls[0]?.[0]).toBe(LINE_ID)
    const lineaSinId = await deleteCatalogLineAction(LINE_MUTATION_INITIAL, formDataOf({}))
    expect(lineaSinId).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    })
    expect(deleteCatalogLineMock).toHaveBeenCalledTimes(1)

    // La edicion de la linea manda los SIETE campos de negocio y NO manda el proveedor
    // (R24, P6): el `FormData` trae `supplierId` -es el mismo formulario- y la action NO lo
    // lee. Si lo colara, `updateCatalogLineSchema` es `strictObject` y daria
    // `invalid_input`, pero la defensa util es que ni siquiera se lee.
    await updateCatalogLineAction(LINE_ID, LINE_MUTATION_INITIAL, formDataOf(VALID_LINE_FIELDS))
    expect(updateCatalogLineMock.mock.calls[0]?.[1]).toEqual({
      name: 'Acido citrico anhidro',
      presentationId: PRESENTATION_ID,
      unitId: UNIT_ID,
      imagePath: 'catalogo/acido-citrico.png',
      cost: '12.5000',
      minPurchase: '5',
      deliveryTime: 3,
    })
    expect(updateCatalogLineMock.mock.calls[0]?.[1]).not.toHaveProperty('supplierId')

    // 2. Firmas: las cinco mutaciones terminan en `FormData`; las cuatro consultas no lo
    //    mencionan siquiera.
    const MUTACIONES = [
      createSupplierAction,
      updateSupplierAction,
      deleteSupplierAction,
      createCatalogLineAction,
      updateCatalogLineAction,
      deleteCatalogLineAction,
    ]
    for (const action of MUTACIONES) {
      expect(action.length, `${action.name} deberia recibir prevState y FormData`).toBeGreaterThanOrEqual(2)
    }

    const fuentes = ACTION_FILES.map((file) => readSource(file)).join('\n')
    for (const consulta of [
      'getSupplierAction(id: string)',
      'listSuppliersAction(query: unknown)',
    ]) {
      expect(fuentes, `${consulta} deberia recibir argumentos tipados`).toContain(consulta)
    }
    expect(fuentes).toMatch(/listCatalogLinesAction\(\s*supplierId: string,\s*query: unknown,\s*\)/)
    // Ninguna consulta declara `FormData` en su firma.
    for (const consulta of ['getSupplierAction', 'listSuppliersAction', 'listCatalogLinesAction']) {
      const firma = fuentes.slice(fuentes.indexOf(`export async function ${consulta}(`))
      expect(
        firma.slice(0, firma.indexOf('{')),
        `${consulta} no puede recibir FormData`,
      ).not.toMatch(/FormData/)
    }

    // 3. Ningun route handler propio, y ningun `fetch` a una ruta interna.
    for (const ruta of ['proveedores', 'suppliers']) {
      expect(existsSync(join(repoRoot, 'app', 'api', ruta)), `app/api/${ruta}`).toBe(false)
    }
    expect(fuentes, 'una action llama por fetch a una ruta propia').not.toMatch(/fetch\(/)
  })

  it('traduce cada error de dominio a status error con el code estable de la clase, nunca con el texto', async () => {
    // R43. Los `code` se afirman como LITERALES escritos aqui: si alguien renombra
    // `supplier_duplicate_name` a `nombre_duplicado`, este test cae aunque el codigo siga
    // "funcionando" -que es justo lo que R43 protege, porque QC-44 decide por el `code`-.
    //
    // QC-70 (R17, R18) parte el antiguo `not_found` en `supplier_not_found` y
    // `catalog_line_not_found`, y `duplicate_name` pasa a `supplier_duplicate_name`.
    const CASOS = [
      { error: new UnauthorizedError(), code: 'unauthorized' },
      { error: new SupplierNotFoundError(), code: 'supplier_not_found' },
      { error: new SupplierDuplicateNameError(), code: 'supplier_duplicate_name' },
      { error: new ValidationError(), code: 'invalid_input' },
    ] as const

    for (const caso of CASOS) {
      createSupplierMock.mockRejectedValueOnce(caso.error)
      const result = await createSupplierAction(
        CREATE_SUPPLIER_INITIAL,
        formDataOf(VALID_SUPPLIER_FIELDS),
      )
      expect(result).toEqual({
        status: 'error',
        code: caso.code,
        message: caso.error.message,
      })
    }

    // El error propio del catalogo, por su action. QC-52 deja UNO donde QC-43 tenia dos: el
    // de «articulo del inventario no encontrado» se borro del modulo porque su caso ya no
    // puede ocurrir (R32), y `duplicate_catalog_line` se CONSERVA con su `code` intacto
    // porque el caso sigue existiendo y solo cambia la clave que lo dispara.
    for (const caso of [
      { error: new DuplicateCatalogLineError(), code: 'duplicate_catalog_line' },
      // QC-70 (R17): la linea que no existe tiene su PROPIO codigo, distinto del del
      // proveedor que no existe. Es el caso que obligo a partir el antiguo `not_found`.
      { error: new CatalogLineNotFoundError(), code: 'catalog_line_not_found' },
    ] as const) {
      createCatalogLineMock.mockRejectedValueOnce(caso.error)
      const result = await createCatalogLineAction(CREATE_LINE_INITIAL, formDataOf(VALID_LINE_FIELDS))
      expect(result).toEqual({ status: 'error', code: caso.code, message: caso.error.message })
    }

    // El `code` NO sale del texto ni del nombre de la clase. QC-70 (R7) lo lleva un paso
    // mas alla: el mensaje YA NO SE PUEDE pasar desde el sitio que lanza, y lo unico que la
    // clase acepta como segundo dato es el DIAGNOSTICO, que va al registro del servidor y
    // nunca al navegador (R28, R29). Con un diagnostico puesto, el `code` sigue siendo el
    // suyo y el `message` sigue siendo el del catalogo.
    createSupplierMock.mockRejectedValueOnce(
      new SupplierDuplicateNameError('nombre normalizado ya usado por sup-7'),
    )
    const traducido = await createSupplierAction(
      CREATE_SUPPLIER_INITIAL,
      formDataOf(VALID_SUPPLIER_FIELDS),
    )
    expect(traducido).toEqual({
      status: 'error',
      code: 'supplier_duplicate_name',
      message: errorMessage('supplier_duplicate_name'),
    })
    expect(JSON.stringify(traducido)).not.toContain('sup-7')

    // Lo que NO es error de dominio ya no se relanza: QC-70 (R12, decision cerrada del
    // 2026-09-08) lo traduce al codigo generico `unexpected` con su mensaje neutro, para
    // que la pantalla siga en pie en vez de caer en la de error del framework. Lo que NO
    // cambia es que el detalle interno -aqui, el texto del fallo de conexion- se queda en
    // el registro del servidor y NO viaja al navegador (R13): ningun campo del estado lo
    // contiene. Este caso sustituye al `rejects.toBe(ajeno)` que fijaba el relanzado.
    const ajeno = new Error('connection terminated unexpectedly')
    const SIN_FILTRACION = (estado: object): void => {
      for (const valor of Object.values(estado)) {
        expect(String(valor).toLowerCase()).not.toContain('connection terminated unexpectedly')
      }
    }

    createSupplierMock.mockRejectedValueOnce(ajeno)
    const altaConAjeno = await createSupplierAction(
      CREATE_SUPPLIER_INITIAL,
      formDataOf(VALID_SUPPLIER_FIELDS),
    )
    expect(altaConAjeno).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la peticion
      // —el mismo que se escribio en la linea del registro—, y su ausencia ya no compila (R16).
      reference: REQUEST_ID_DE_PRUEBA,
    })
    SIN_FILTRACION(altaConAjeno)

    listSuppliersMock.mockRejectedValueOnce(ajeno)
    const listaConAjeno = await listSuppliersAction({ page: 1 })
    expect(listaConAjeno).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la peticion
      // —el mismo que se escribio en la linea del registro—, y su ausencia ya no compila (R16).
      reference: REQUEST_ID_DE_PRUEBA,
    })
    SIN_FILTRACION(listaConAjeno)

    // Y ningun `catch` de las dos actions descarta el error sin traducirlo ni propagarlo:
    // todos pasan por `toErrorState`, la unica implementacion del traductor (R10).
    for (const file of ACTION_FILES) {
      const source = readSource(file)
      const catches = [...source.matchAll(/catch\s*\(([^)]*)\)\s*\{([^}]*)\}/g)]
      expect(catches.length, `${file} deberia tener un catch por operacion`).toBeGreaterThan(0)
      for (const bloque of catches) {
        expect(bloque[2], `${file}: catch que no traduce ni propaga`).toMatch(/toErrorState/)
      }
    }
  })
})
