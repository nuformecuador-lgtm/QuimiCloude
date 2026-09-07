// T10 (QC-43) — Autorizacion de los NUEVE casos de uso (R1, R2, R3, R4).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta
// como dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS no filtran
// NINGUNA consulta de esta app. La frontera real es el caso de uso. Un permiso que solo
// existiera como policy no estaria implementado, y un `requireAdmin` que se saltara UNO de
// los nueve seria justo el agujero que esta revision existe para encontrar.
//
// Por eso los DOS puertos que quedan -repositorio de proveedores y repositorio del
// catalogo- son dobles que FALLAN SI LOS LLAMAN: no basta con que la operacion lance; tiene
// que lanzar sin haber tocado nada.
//
// QC-52 (R25) lo reescribe en tres sitios: desaparece el tercer doble -el contrato de
// `inventario`, que este modulo ya no consume (R18)-, la entrada valida de la linea pasa a
// llevar nombre y presentacion, y las CUATRO operaciones de la linea se invocan con las
// firmas nuevas (`replaceAlive`, `softDeleteAlive`). Que la comprobacion siga siendo la
// PRIMERA linea de cada caso de uso no cambia, y es lo que este archivo mide.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line'
import { createCreateSupplier } from '@/lib/modules/proveedores/domain/create-supplier'
import { createDeleteCatalogLine } from '@/lib/modules/proveedores/domain/delete-catalog-line'
import { createDeleteSupplier } from '@/lib/modules/proveedores/domain/delete-supplier'
import { UnauthorizedError } from '@/lib/modules/proveedores/domain/errors'
import { createGetSupplier } from '@/lib/modules/proveedores/domain/get-supplier'
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines'
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers'
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line'
import { createUpdateSupplier } from '@/lib/modules/proveedores/domain/update-supplier'

import type { Actor } from '@/lib/modules/proveedores/domain/actor'
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository'
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository'

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'proveedores',
)

/** Todos los `.ts` del modulo, recursivamente. */
function fuentesDelModulo(dir: string = moduloDir): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) return fuentesDelModulo(ruta)
    return entrada.isFile() && ruta.endsWith('.ts') ? [ruta] : []
  })
}

const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '33333333-3333-4333-8333-333333333333'
const ENTRADA_PROVEEDOR = { name: 'Insumos Andinos', phone: '+593 99 000 0000', email: null }
/** Campos de negocio VALIDOS de una linea: la edicion los reemplaza todos (R24). */
const CAMPOS_LINEA = {
  name: 'Acido citrico',
  presentationId: PRESENTATION_ID,
  unitId: null,
  imagePath: null,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
}
const ENTRADA_LINEA = { supplierId: SUPPLIER_ID, ...CAMPOS_LINEA }

/**
 * Los dos dobles. Cada metodo explota si alguien lo llama: si un caso de uso comprobara el
 * rol DESPUES de tocar el puerto, el test caeria por la excepcion del doble aunque el
 * `rejects.toBeInstanceOf(UnauthorizedError)` pudiera enganarse.
 */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`)
    })

  const suppliers = {
    create: explota('suppliers.create'),
    findAliveById: explota('suppliers.findAliveById'),
    updateAlive: explota('suppliers.updateAlive'),
    softDeleteAlive: explota('suppliers.softDeleteAlive'),
    listAlive: explota('suppliers.listAlive'),
  }
  const catalog = {
    create: explota('catalog.create'),
    replaceAlive: explota('catalog.replaceAlive'),
    softDeleteAlive: explota('catalog.softDeleteAlive'),
    listBySupplierAlive: explota('catalog.listBySupplierAlive'),
  }

  // QC-57 (R34): el log del campo omitido tampoco puede sonar sin autorizacion. `requireAdmin`
  // es la PRIMERA linea de los dos listados, antes de zod y antes de sanear, asi que un actor
  // rechazado no llega ni a saber que su consulta traia campos raros.
  const log = { ignoredFields: explota('log.ignoredFields') }

  return {
    suppliers: suppliers as unknown as SupplierRepository,
    catalog: catalog as unknown as SupplierCatalogRepository,
    log,
    espias: [...Object.values(suppliers), ...Object.values(catalog), ...Object.values(log)],
  }
}

type Deps = ReturnType<typeof dobles>

/**
 * Los NUEVE casos de uso, cada uno invocado con entrada VALIDA: si la entrada fuera basura,
 * un `ValidationError` podria estar tapando la falta de `requireAdmin`. Todo lo que falla
 * aqui falla por autorizacion y por nada mas.
 */
const CASOS_DE_USO: readonly {
  readonly nombre: string
  readonly archivo: string
  readonly ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>
}[] = [
  {
    nombre: 'createSupplier',
    archivo: 'create-supplier.ts',
    ejecutar: (d, actor) => createCreateSupplier({ suppliers: d.suppliers })(ENTRADA_PROVEEDOR, actor),
  },
  {
    nombre: 'updateSupplier',
    archivo: 'update-supplier.ts',
    ejecutar: (d, actor) =>
      createUpdateSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, ENTRADA_PROVEEDOR, actor),
  },
  {
    nombre: 'deleteSupplier',
    archivo: 'delete-supplier.ts',
    ejecutar: (d, actor) => createDeleteSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, actor),
  },
  {
    nombre: 'getSupplier',
    archivo: 'get-supplier.ts',
    ejecutar: (d, actor) => createGetSupplier({ suppliers: d.suppliers })(SUPPLIER_ID, actor),
  },
  {
    nombre: 'listSuppliers',
    archivo: 'list-suppliers.ts',
    ejecutar: (d, actor) =>
      createListSuppliers({ suppliers: d.suppliers, log: d.log })({ page: 1 }, actor),
  },
  {
    nombre: 'createCatalogLine',
    archivo: 'create-catalog-line.ts',
    ejecutar: (d, actor) => createCreateCatalogLine({ catalog: d.catalog })(ENTRADA_LINEA, actor),
  },
  {
    nombre: 'updateCatalogLine',
    archivo: 'update-catalog-line.ts',
    ejecutar: (d, actor) =>
      createUpdateCatalogLine({ catalog: d.catalog })('linea-1', CAMPOS_LINEA, actor),
  },
  {
    nombre: 'deleteCatalogLine',
    archivo: 'delete-catalog-line.ts',
    ejecutar: (d, actor) => createDeleteCatalogLine({ catalog: d.catalog })('linea-1', actor),
  },
  {
    nombre: 'listCatalogLines',
    archivo: 'list-catalog-lines.ts',
    ejecutar: (d, actor) =>
      createListCatalogLines({ catalog: d.catalog, log: d.log })(SUPPLIER_ID, { page: 1 }, actor),
  },
]

/** Ejecuta un caso de uso con un actor no autorizado y exige rechazo SIN tocar ningun puerto. */
async function esperarRechazoSinTocarNada(
  caso: (typeof CASOS_DE_USO)[number],
  actor: Actor | null | undefined,
  etiqueta: string,
): Promise<void> {
  const d = dobles()
  const fallo = await caso.ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  )

  expect(fallo, `${caso.nombre} con ${etiqueta} no rechazo`).toBeInstanceOf(UnauthorizedError)
  expect((fallo as UnauthorizedError).code).toBe('unauthorized')
  for (const espia of d.espias) {
    expect(espia, `${caso.nombre} con ${etiqueta} toco un puerto`).not.toHaveBeenCalled()
  }
}

describe('autorizacion de los nueve casos de uso de proveedores (QC-43 T10)', () => {
  it('los nueve casos de uso estan cubiertos por esta tabla', () => {
    // Guardia de la propia guardia: si alguien anade un decimo caso de uso al dominio y no
    // lo mete en `CASOS_DE_USO`, este test cae. Sin esto, la cobertura «de los nueve» seria
    // una promesa del comentario de cabecera y no una afirmacion ejecutable.
    //
    // QC-57 anadio `domain/list-query.ts`, que empieza por `list-` y NO es un caso de uso: es el
    // contrato de consulta de lista -tipos, esquema zod y una funcion pura `sanitize`-, sin actor
    // y sin ningun puerto que tocar, asi que no tiene autorizacion que validar. Se excluye por
    // nombre, y no relajando el patron, para que la guardia siga cayendo con un caso de uso nuevo
    // de verdad. Si algun dia deja de ser una excepcion, el aserto de `toHaveLength(9)` lo dira.
    const NO_SON_CASOS_DE_USO: readonly string[] = ['list-query.ts']

    const factoriasEnElDominio = readdirSync(join(moduloDir, 'domain'))
      .filter(
        (archivo) =>
          /^(create|update|delete|get|list)-/.test(archivo) &&
          !NO_SON_CASOS_DE_USO.includes(archivo),
      )
      .sort()
    expect(factoriasEnElDominio).toEqual([...CASOS_DE_USO].map((c) => c.archivo).sort())
    expect(CASOS_DE_USO).toHaveLength(9)
  })

  it('un actor con rol Operador es rechazado en los nueve casos de uso sin llamar a ningun puerto', async () => {
    // R2. El Operador es el otro rol real del sistema, no un rol inventado: es el caso que
    // de verdad puede ocurrir. Mutacion que lo pone rojo: quitar `requireAdmin` de
    // CUALQUIERA de los nueve -el doble del puerto explota y la asercion cae-.
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinTocarNada(caso, { id: 'op-1', roleName: 'Operador' }, 'rol Operador')
    }
  })

  it('un actor ausente, con rol nulo, vacio o desconocido se rechaza igual que el Operador', async () => {
    // R3: falla CERRADO. Y la igualdad es exacta, sin `includes` ni normalizacion: un rol
    // llamado «Administradores externos» -que CONTIENE el nombre autorizado- se rechaza.
    const NO_AUTORIZADOS: readonly { readonly etiqueta: string; readonly actor: Actor | null | undefined }[] = [
      { etiqueta: 'actor ausente (null)', actor: null },
      { etiqueta: 'actor ausente (undefined)', actor: undefined },
      { etiqueta: 'rol nulo', actor: { id: 'u-1', roleName: null } },
      { etiqueta: 'rol vacio', actor: { id: 'u-1', roleName: '' } },
      { etiqueta: 'rol desconocido', actor: { id: 'u-1', roleName: 'Supervisor' } },
      {
        etiqueta: 'rol que contiene el autorizado',
        actor: { id: 'u-1', roleName: `${ROLE_ADMINISTRADOR}es externos` },
      },
      {
        etiqueta: 'rol autorizado con otra caja',
        actor: { id: 'u-1', roleName: ROLE_ADMINISTRADOR.toLowerCase() },
      },
    ]

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, actor } of NO_AUTORIZADOS) {
        await esperarRechazoSinTocarNada(caso, actor, etiqueta)
      }
    }
  })

  it('cada caso de uso recibe el actor por parametro y no lee ninguna sesion', async () => {
    // R1. Dos mitades:
    //
    // 1. TEXTO: ningun archivo del dominio nombra cookie, cabecera, sesion ni el lector de
    //    sesion de `identity`. Quien resuelve el actor es el adaptador driving (T14) con
    //    `identity.getSessionUser()` via `@/lib/composition`, y esa es la unica puerta.
    //    Mutacion que lo pone rojo: importar `cookies` de `next/headers` en cualquier caso
    //    de uso -tambien caeria la guardia de pureza del dominio, que es el cinturon-.
    for (const archivo of fuentesDelModulo(join(moduloDir, 'domain'))) {
      const fuente = readFileSync(archivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
      expect(fuente, `${archivo} lee la sesion`).not.toMatch(
        /getSessionUser|next\/headers|\bcookies?\b|\bheaders\(\)|@\/lib\/composition/i,
      )
    }

    // 2. COMPORTAMIENTO: el actor es un ARGUMENTO, asi que el mismo caso de uso con el
    //    mismo entorno acepta o rechaza segun lo que se le pase, sin nada ambiental.
    for (const caso of CASOS_DE_USO) {
      const d = dobles()
      const fallo = await caso.ejecutar(d, { id: 'u-1', roleName: 'Operador' }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(fallo, caso.nombre).toBeInstanceOf(UnauthorizedError)

      // Con el rol autorizado el caso de uso SI avanza hasta el puerto: se ve porque el
      // doble explota con SU mensaje, no con `unauthorized`. Esto es lo que impide que el
      // test pase por un `throw new UnauthorizedError()` incondicional.
      const conAdmin = await caso
        .ejecutar(d, { id: 'u-1', roleName: ROLE_ADMINISTRADOR })
        .then(
          () => null,
          (error: unknown) => error,
        )
      expect(conAdmin, `${caso.nombre} no llego al puerto con el rol autorizado`).not.toBeNull()
      expect(conAdmin).not.toBeInstanceOf(UnauthorizedError)
      expect((conAdmin as Error).message).toMatch(/no debe llamarse sin autorizacion/)
    }
  })

  it('el rol autorizado sale de identity via assertAdminRole y ningun archivo del modulo incrusta el literal', () => {
    // R4. `identity/domain/roles.ts` dice ser «el UNICO sitio del repo que escribe a mano
    // los literales de rol»; `proveedores` no declara ninguna constante propia ni copia el
    // texto. Mutacion que lo pone rojo: cambiar `actor.ts` por
    // `const ADMIN_ROLE_NAME = 'Administrador'` -que es exactamente lo que hoy hacen
    // `inventario` y `recetas`, y la ficha de arnes que unifica esas dos copias-.
    const archivos = fuentesDelModulo()
    expect(archivos.length).toBeGreaterThan(0)
    for (const archivo of archivos) {
      expect(readFileSync(archivo, 'utf8'), `${archivo} incrusta el literal del rol`).not.toMatch(
        /['"`]Administrador/,
      )
    }

    // Y lo toma del BARREL de `identity`, no por ruta profunda ni de `inventario`.
    //
    // Decision del humano (2026-09-07, QC-54): este centinela vigilaba un MEDIO -que
    // `actor.ts` importara `ROLE_ADMINISTRADOR`- para garantizar un FIN: que el rol
    // autorizado salga de `identity`, sin literal local y sin pasar por `inventario`.
    // Delegar en `assertAdminRole` (la UNICA implementacion de la regla «el actor es
    // Administrador», en `identity/domain/require-admin.ts`) cumple ese fin MEJOR que el
    // medio que esta asercion exigia antes, asi que se actualiza al nuevo medio: no se
    // afloja. La mutacion que sigue poniendola roja es la misma de siempre, declarar un
    // `const ADMIN_ROLE_NAME = 'Administrador'` propio en el modulo.
    const actor = readFileSync(join(moduloDir, 'domain', 'actor.ts'), 'utf8')
    expect(actor).toMatch(
      /import \{ assertAdminRole \} from '@\/lib\/modules\/identity'/,
    )
    expect(actor).not.toMatch(/@\/lib\/modules\/identity\//)
    expect(actor).not.toMatch(/@\/lib\/modules\/inventario/)

    // Y el literal que `identity` publica sigue existiendo: si desapareciera, el import de
    // arriba seria `undefined` y `requireAdmin` aceptaria a cualquiera con rol `undefined`.
    expect(typeof ROLE_ADMINISTRADOR).toBe('string')
    expect(ROLE_ADMINISTRADOR.length).toBeGreaterThan(0)
    expect(existsSync(join(moduloDir, 'domain', 'roles.ts'))).toBe(false)
  })
})
