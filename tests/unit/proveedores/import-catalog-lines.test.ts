// T4 (QC-158) — los dos casos de uso de la importacion por identidad en `proveedores`
// (`design.md > 5.2`, `> 8`). Cubre R31 (permiso como primera operacion, sin tocar el
// puerto) y la validacion de forma con los esquemas de T3.
//
// Mismo patron que `authorization.test.ts`: los puertos son dobles que EXPLOTAN si alguien
// los llama, para que un actor no autorizado no pueda «pasar» por casualidad.

import { describe, expect, it, vi } from 'vitest'

import { createFindCatalogLinesByIdentity } from '@/lib/modules/proveedores/domain/find-catalog-lines-by-identity'
import { createImportCatalogLines } from '@/lib/modules/proveedores/domain/import-catalog-lines'
import { SupplierNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/proveedores/domain/errors'

import type { SupplierCatalogImportRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-import-repository'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222'
const PRESENTATION_ID = '33333333-3333-4333-8333-333333333333'

function actorCon(...permissions: readonly string[]) {
  return { id: 'u-1', companyId: COMPANY_ID, permissions }
}

function catalogQueExplota(): SupplierCatalogImportRepository {
  return {
    findAliveByIdentities: vi.fn(() => {
      throw new Error('catalog.findAliveByIdentities no debe llamarse sin autorizacion')
    }),
    upsertCostByIdentity: vi.fn(() => {
      throw new Error('catalog.upsertCostByIdentity no debe llamarse sin autorizacion')
    }),
  } as unknown as SupplierCatalogImportRepository
}

const CAMPOS_LINEA_VALIDA = {
  name: 'Acido citrico anhidro',
  presentationId: PRESENTATION_ID,
  unitId: null,
  imagePath: null,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
  material: null,
  measurements: null,
}

describe('createFindCatalogLinesByIdentity — R31, primera linea', () => {
  it('rechaza sin `proveedores.modificar` y sin tocar el puerto', async () => {
    const catalog = catalogQueExplota()
    const findByIdentity = createFindCatalogLinesByIdentity({ catalog })

    const input = { supplierId: SUPPLIER_ID, keys: [] }

    for (const actor of [null, undefined, actorCon(), actorCon('proveedores.consultar')] as const) {
      const fallo = await findByIdentity(input, actor).then(
        () => null,
        (error: unknown) => error,
      )
      expect(fallo).toBeInstanceOf(UnauthorizedError)
      expect(catalog.findAliveByIdentities).not.toHaveBeenCalled()
    }
  })

  it('con el permiso, valida la entrada ANTES de tocar el puerto', async () => {
    const catalog = catalogQueExplota()
    const findByIdentity = createFindCatalogLinesByIdentity({ catalog })

    const fallo = await findByIdentity(
      { supplierId: 'no-es-un-uuid', keys: [] },
      actorCon('proveedores.modificar'),
    ).then(
      () => null,
      (error: unknown) => error,
    )
    expect(fallo).toBeInstanceOf(ValidationError)
    expect(catalog.findAliveByIdentities).not.toHaveBeenCalled()
  })

  it('con el permiso y entrada valida, llega al puerto y traduce `supplier_not_found`', async () => {
    const catalog = {
      findAliveByIdentities: vi.fn(async () => 'supplier_not_found' as const),
      upsertCostByIdentity: vi.fn(),
    } as unknown as SupplierCatalogImportRepository
    const findByIdentity = createFindCatalogLinesByIdentity({ catalog })

    const fallo = await findByIdentity(
      { supplierId: SUPPLIER_ID, keys: [] },
      actorCon('proveedores.modificar'),
    ).then(
      () => null,
      (error: unknown) => error,
    )
    expect(fallo).toBeInstanceOf(SupplierNotFoundError)
    expect(catalog.findAliveByIdentities).toHaveBeenCalledWith(SUPPLIER_ID, [], { companyId: COMPANY_ID })
  })

  it('devuelve las lineas del puerto tal cual', async () => {
    const lineas = [{ id: 'l-1', nameNormalized: 'acidocitrico', presentationId: PRESENTATION_ID, cost: '10.0000' }]
    const catalog = {
      findAliveByIdentities: vi.fn(async () => ({ lines: lineas })),
      upsertCostByIdentity: vi.fn(),
    } as unknown as SupplierCatalogImportRepository
    const findByIdentity = createFindCatalogLinesByIdentity({ catalog })

    const resultado = await findByIdentity(
      { supplierId: SUPPLIER_ID, keys: [{ nameNormalized: 'acidocitrico', presentationId: PRESENTATION_ID }] },
      actorCon('proveedores.modificar'),
    )
    expect(resultado).toEqual(lineas)
  })
})

describe('createImportCatalogLines — R31, primera linea; validacion por fila', () => {
  it('rechaza sin `proveedores.modificar` y sin tocar el puerto', async () => {
    const catalog = catalogQueExplota()
    const importLines = createImportCatalogLines({ catalog })

    for (const actor of [null, undefined, actorCon(), actorCon('proveedores.consultar')] as const) {
      const fallo = await importLines(SUPPLIER_ID, [CAMPOS_LINEA_VALIDA], actor).then(
        () => null,
        (error: unknown) => error,
      )
      expect(fallo).toBeInstanceOf(UnauthorizedError)
      expect(catalog.upsertCostByIdentity).not.toHaveBeenCalled()
    }
  })

  it('con el permiso, rechaza si CUALQUIER linea no pasa el esquema de T3, sin tocar el puerto', async () => {
    const catalog = catalogQueExplota()
    const importLines = createImportCatalogLines({ catalog })

    const lineas = [
      CAMPOS_LINEA_VALIDA,
      { ...CAMPOS_LINEA_VALIDA, cost: '0' }, // costo cero: lo rechaza costSchema
    ]

    const fallo = await importLines(SUPPLIER_ID, lineas, actorCon('proveedores.modificar')).then(
      () => null,
      (error: unknown) => error,
    )
    expect(fallo).toBeInstanceOf(ValidationError)
    expect(catalog.upsertCostByIdentity).not.toHaveBeenCalled()
  })

  it('con el permiso y entrada valida, llega al puerto con los NUEVE campos de negocio y traduce `supplier_not_found`', async () => {
    const catalog = {
      findAliveByIdentities: vi.fn(),
      upsertCostByIdentity: vi.fn(async () => 'supplier_not_found' as const),
    } as unknown as SupplierCatalogImportRepository
    const now = new Date('2026-09-23T10:00:00.000Z')
    const importLines = createImportCatalogLines({ catalog, now: () => now })

    const fallo = await importLines(SUPPLIER_ID, [CAMPOS_LINEA_VALIDA], actorCon('proveedores.modificar')).then(
      () => null,
      (error: unknown) => error,
    )
    expect(fallo).toBeInstanceOf(SupplierNotFoundError)
    expect(catalog.upsertCostByIdentity).toHaveBeenCalledWith(
      SUPPLIER_ID,
      [CAMPOS_LINEA_VALIDA],
      'u-1',
      now,
      { companyId: COMPANY_ID },
    )
  })

  it('devuelve el resumen del puerto tal cual', async () => {
    const resumen = { created: 1, updated: 2, unchanged: 3 }
    const catalog = {
      findAliveByIdentities: vi.fn(),
      upsertCostByIdentity: vi.fn(async () => resumen),
    } as unknown as SupplierCatalogImportRepository
    const importLines = createImportCatalogLines({ catalog })

    const resultado = await importLines(SUPPLIER_ID, [CAMPOS_LINEA_VALIDA], actorCon('proveedores.modificar'))
    expect(resultado).toEqual(resumen)
  })
})
