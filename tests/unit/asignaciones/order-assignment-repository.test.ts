// QC-87 T4 — El puerto `OrderAssignmentRepository` (`design.md > 3`).
//
// Un puerto no tiene comportamiento que ejercitar: es una INTERFAZ. Lo que se puede demostrar de
// el son propiedades de COMPILACION y de FORMA, y son exactamente las que la ficha promete:
//
//   1. `companyId` es el PRIMER parametro de los tres metodos que lo llevan, de modo que una
//      llamada que lo olvide **no compila** (R7). Va con `@ts-expect-error`, el patron del repo
//      para los casos negativos de tipos (`tests/unit/errores/catalogo.test.ts`,
//      `tests/unit/identity/require-any-permission.test.ts`): se pone rojo tanto si la llamada
//      pasara a compilar -«Unused '@ts-expect-error' directive»- como si el metodo desapareciera.
//   2. El puerto tiene CUATRO metodos y ni uno mas; en particular **ninguno de `update`** (QC-86
//      R8, R9) y **ningun borrado masivo por pedido**, que habilitaria el «borrar y reinsertar»
//      que `design.md > 10` marca como riesgo n.o 1.
//   3. El puerto es dominio PURO: su fuente no importa `@prisma/client` ni `next/*`.
//
// Las dos ultimas se comprueban sobre un doble que implementa la interfaz (si el puerto creciera
// un metodo, el doble deja de satisfacerlo y el typecheck cae) y sobre el TEXTO del fuente.
//
// Cubre R7, R15, R16, R22, R27, R29, R30, R32, R34 en su parte de CONTRATO; el comportamiento es
// de T5 (adaptador) y de T7-T9 (casos de uso).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type {
  AssignmentRow,
  NewAssignment,
  OrderAssignmentRepository,
  OrderAssignmentRowWithOrder,
} from '@/lib/modules/asignaciones/ports/order-assignment-repository'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const GROUP = '44444444-4444-4444-8444-444444444444'

/** Doble en memoria. Su valor NO es simular la base -eso es T5- sino que el TIPO obligue: si el
 *  puerto ganara un quinto metodo, esta clase dejaria de satisfacer la interfaz y el typecheck
 *  caeria; si perdiera uno, los usos de abajo no compilarian. */
class RepositorioDoble implements OrderAssignmentRepository {
  readonly llamadas: string[] = []
  readonly filas: AssignmentRow[] = []
  readonly enLote: OrderAssignmentRowWithOrder[] = []

  insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number> {
    this.llamadas.push(`insertMissing:${rows.length}:${now.toISOString()}`)
    return Promise.resolve(rows.length)
  }

  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly AssignmentRow[]> {
    this.llamadas.push(`listByOrderInCompany:${companyId}:${orderId}`)
    return Promise.resolve(this.filas)
  }

  // QC-102 T1 - la consulta EN LOTE, con `companyId` tambien PRIMERO (R3).
  listByOrdersInCompany(
    companyId: string,
    orderIds: readonly string[],
  ): Promise<readonly OrderAssignmentRowWithOrder[]> {
    // `String(...)` y no `.join(...)`: el caso NEGATIVO de tipos de abajo invoca este metodo con
    // la forma EQUIVOCADA a proposito, y el doble no debe reventar antes de que el test afirme.
    this.llamadas.push(`listByOrdersInCompany:${companyId}:${String(orderIds)}`)
    return Promise.resolve(this.enLote)
  }

  deleteOne(companyId: string, orderId: string, userId: string): Promise<'ok' | 'not_found'> {
    this.llamadas.push(`deleteOne:${companyId}:${orderId}:${userId}`)
    return Promise.resolve('ok')
  }

  deleteByWorkGroup(companyId: string, orderId: string, workGroupId: string): Promise<number> {
    this.llamadas.push(`deleteByWorkGroup:${companyId}:${orderId}:${workGroupId}`)
    return Promise.resolve(0)
  }
}

const PUERTO_ABS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../lib/modules/asignaciones/ports/order-assignment-repository.ts',
)

describe('QC-87 T4 — `companyId` primero: el caso NEGATIVO de tipos (R7)', () => {
  it('`deleteOne` SIN `companyId` no compila', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `deleteOne` (R7): omitirlo y pasar
    // solo `(orderId, userId)` es un error de TIPOS, no un fallo en tiempo de ejecucion. Si algun
    // dia esta llamada compilara -porque alguien quitara `companyId` de la firma o lo hiciera
    // opcional-, `tsc` se pondria rojo por la directiva sin usar. Es la unica forma de demostrar
    // que el borrado no puede caer sobre la empresa equivocada.
    await repo.deleteOne(ORDER, USER)

    // Y la llamada CORRECTA, sin `@ts-expect-error`: si dejara de compilar, el puerto cambio.
    await expect(repo.deleteOne(COMPANY, ORDER, USER)).resolves.toBe('ok')
  })

  it('`listByOrderInCompany` y `deleteByWorkGroup` tampoco aceptan la forma sin empresa', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `listByOrderInCompany` (R7, R38).
    await repo.listByOrderInCompany(ORDER)

    // @ts-expect-error `companyId` es el PRIMER parametro de `deleteByWorkGroup` (R7, R32).
    await repo.deleteByWorkGroup(ORDER, GROUP)

    await expect(repo.listByOrderInCompany(COMPANY, ORDER)).resolves.toEqual([])
    await expect(repo.deleteByWorkGroup(COMPANY, ORDER, GROUP)).resolves.toBe(0)
  })

  it('QC-102 R3: `listByOrdersInCompany` SIN `companyId` tampoco compila', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `listByOrdersInCompany` (QC-102 R3):
    // pasar solo la lista de pedidos es un error de TIPOS. La consulta EN LOTE resuelve una pagina
    // entera de una vez, asi que olvidar la empresa aqui seria el fallo mas caro de los cinco
    // metodos: devolveria las asignaciones de TODAS las empresas para esos identificadores.
    await repo.listByOrdersInCompany([ORDER])

    // Y la llamada CORRECTA, sin `@ts-expect-error`.
    await expect(repo.listByOrdersInCompany(COMPANY, [ORDER])).resolves.toEqual([])
  })

  it('la empresa llega al repositorio en la primera posicion, no se pierde por el camino', async () => {
    const repo = new RepositorioDoble()

    await repo.listByOrderInCompany(COMPANY, ORDER)
    await repo.listByOrdersInCompany(COMPANY, [ORDER])
    await repo.deleteOne(COMPANY, ORDER, USER)
    await repo.deleteByWorkGroup(COMPANY, ORDER, GROUP)

    expect(repo.llamadas).toEqual([
      `listByOrderInCompany:${COMPANY}:${ORDER}`,
      `listByOrdersInCompany:${COMPANY}:${ORDER}`,
      `deleteOne:${COMPANY}:${ORDER}:${USER}`,
      `deleteByWorkGroup:${COMPANY}:${ORDER}:${GROUP}`,
    ])
  })
})

describe('QC-87 T4 (+ QC-102 T1) — cinco metodos y ni uno mas', () => {
  it('el doble que satisface la interfaz expone exactamente esos cinco nombres', () => {
    const nombres = Object.getOwnPropertyNames(RepositorioDoble.prototype)
      .filter((n) => n !== 'constructor')
      .sort()

    expect(nombres).toEqual([
      'deleteByWorkGroup',
      'deleteOne',
      'insertMissing',
      'listByOrderInCompany',
      'listByOrdersInCompany',
    ])
  })

  it('el fuente no declara ningun `update*` ni ningun borrado masivo por pedido', () => {
    const fuente = readFileSync(PUERTO_ABS, 'utf8')
    const cuerpo = fuente.slice(fuente.indexOf('export interface OrderAssignmentRepository'))
    const metodos = [...cuerpo.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)\(/gm)].map((m) => m[1])

    expect(metodos).toEqual([
      'insertMissing',
      'listByOrderInCompany',
      // QC-102 T1: el quinto, en el orden en que lo declara el puerto.
      'listByOrdersInCompany',
      'deleteOne',
      'deleteByWorkGroup',
    ])
    // QC-86 R8/R9: la asignacion se crea o se borra, NUNCA se edita.
    expect(metodos.filter((m) => m.startsWith('update'))).toEqual([])
    // `design.md > 10`, riesgo n.o 1: sin borrado masivo por pedido, «borrar y reinsertar» no es
    // expresable a traves de este puerto.
    expect(metodos).not.toContain('deleteByOrder')
    expect(metodos.filter((m) => m.startsWith('delete') && !/WorkGroup$|One$/.test(m))).toEqual([])
  })
})

describe('QC-87 T4 — el puerto es dominio puro', () => {
  it('no importa `@prisma/client` ni `next/*`: su cierre de imports esta VACIO', () => {
    const fuente = readFileSync(PUERTO_ABS, 'utf8')
    // Se mira el CODIGO, no los comentarios: la cabecera de este puerto nombra `@prisma/client`
    // justo para decir que no entra, y esa mencion no es una dependencia.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const imports = [...codigo.matchAll(/^\s*import\s[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1])

    expect(imports).toEqual([])
    expect(codigo).not.toMatch(/@prisma\/client/)
    expect(codigo).not.toMatch(/'next\//)
    // Ni siquiera un `import type` suelto ni un `require`: el puerto no alcanza nada.
    expect(codigo).not.toMatch(/\bimport\b/)
    expect(codigo).not.toMatch(/\brequire\(/)
  })

  it('`NewAssignment` admite las DOS formas legales del CHECK de QC-86 (R7): juntos o ninguno', () => {
    const suelto: NewAssignment = {
      orderId: ORDER,
      userId: USER,
      companyId: COMPANY,
      workGroupId: null,
      workGroupName: null,
    }
    const deGrupo: NewAssignment = {
      orderId: ORDER,
      userId: USER,
      companyId: COMPANY,
      workGroupId: GROUP,
      workGroupName: 'Laboratorio',
    }

    expect(suelto.workGroupName).toBeNull()
    expect(deGrupo.workGroupName).toBe('Laboratorio')
  })
})
