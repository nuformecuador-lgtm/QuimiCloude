// tests/unit/pedidos/resolve-distribution.test.ts — R6, R7, R35, R36, R41, R42 (QC-170) y R11-R14,
// R34, R35 (QC-195).
//
// `resolveDistribution` es el paso compartido de `createOrder`/`updateOrder`: resuelve las
// lineas del borde -envases o lineas antiguas- contra los catalogos, corre
// `validateDistribution` y traduce su primer fallo. Aqui se prueba SOLO esa traduccion y la
// resolucion -`validateDistribution` en si ya tiene su propio archivo
// (`order-distribution.test.ts`).

import { describe, expect, it, vi } from 'vitest';

import {
  IncompatibleUnitsError,
  OrderDistributionExceedsQuantityError,
  PresentationNotFoundError,
  PresentationWithoutContentError,
  ProductNotFoundError,
  UnitNotFoundError,
  ValidationError,
} from '@/lib/modules/pedidos/domain/errors';
import { resolveDistribution, resolveDistributionLines } from '@/lib/modules/pedidos/domain/resolve-distribution';

import type { PackagingRef, PresentationCatalog } from '@/lib/modules/inventario';
import type { OrderPresentationLineRow } from '@/lib/modules/pedidos/domain/order-view';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double';

const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const UNIDAD_ML = '78787878-7878-4878-8878-787878787878';
const UNIDAD_KG = '79797979-7979-4979-8979-797979797979';
const PRESENTACION_A = '66666666-6666-4666-8666-666666666666';
const PRESENTACION_B = '11111111-2222-4333-8444-555555555555';
const PRESENTACION_500ML = '50505050-5050-4505-8505-505050505050';
const ENVASE_500ML = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ENVASE_1L = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const ENVASE_KG = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';

const BOTELLA_500ML: PackagingRef = packagingRef({
  id: ENVASE_500ML,
  name: 'Botella PET 500 ml',
  presentationId: PRESENTACION_500ML,
  presentationName: '500 ml',
  content: '500.0000',
  unitId: UNIDAD_ML,
});
const BOTELLA_1L: PackagingRef = packagingRef({
  id: ENVASE_1L,
  name: 'Botella PET 1 L',
  presentationId: PRESENTACION_A,
  presentationName: '1 L',
  content: '1.0000',
  unitId: UNIT_ID,
});
const SACO_KG: PackagingRef = packagingRef({
  id: ENVASE_KG,
  name: 'Saco 1 kg',
  presentationId: PRESENTACION_B,
  content: '1.0000',
  unitId: UNIDAD_KG,
});

function catalogos(
  opciones: {
    readonly presentaciones?: ReadonlyMap<string, { readonly content: string | null; readonly unitId: string }>;
    readonly unidades?: ReadonlyMap<string, { readonly baseUnitId: string | null; readonly factor: string | null }>;
    readonly envases?: readonly PackagingRef[];
  } = {},
) {
  const presentaciones =
    opciones.presentaciones ?? new Map([[PRESENTACION_A, { content: '5.0000', unitId: UNIT_ID }]]);
  const unidades =
    opciones.unidades ??
    new Map<string, { readonly baseUnitId: string | null; readonly factor: string | null }>([
      [UNIT_ID, { baseUnitId: null, factor: null }],
      [UNIDAD_ML, { baseUnitId: UNIT_ID, factor: '0.0010' }],
      [UNIDAD_KG, { baseUnitId: null, factor: null }],
    ]);
  const findRefsPresentaciones = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = presentaciones.get(id);
      return p === undefined ? [] : [{ id, name: 'Presentacion', content: p.content, unitId: p.unitId }];
    }),
  );
  const findRefsUnidades = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const u = unidades.get(id);
      return u === undefined ? [] : [{ id, name: id, symbol: null, ...u }];
    }),
  );
  const packaging = fakePackagingCatalog(opciones.envases ?? [BOTELLA_500ML, BOTELLA_1L, SACO_KG]);
  return {
    catalogs: {
      packaging,
      presentations: { findRefs: findRefsPresentaciones } as unknown as PresentationCatalog,
      units: { findRefs: findRefsUnidades, findRefsSharingBaseInCompany: vi.fn(async () => []) } as unknown as UnitCatalog,
    },
    findRefsPresentaciones,
    findRefsUnidades,
    findRefsEnvases: packaging.findRefs,
  };
}

/** Las lineas del pedido guardado antes de los envases: una antigua de 2 en `PRESENTACION_A`. */
const GUARDADAS: readonly OrderPresentationLineRow[] = [
  { presentationId: PRESENTACION_A, packages: 2, packagingProductId: null },
];

describe('resolveDistribution', () => {
  it('R41: unidad del pedido ausente del catalogo -> UnitNotFoundError, sin llamar a presentaciones si no hay lineas', async () => {
    const cat = catalogos({ unidades: new Map() });
    await expect(resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [])).rejects.toBeInstanceOf(
      UnitNotFoundError,
    );
    expect(cat.findRefsPresentaciones).not.toHaveBeenCalled();
  });

  it('una presentacion ausente del catalogo de la empresa -> PresentationNotFoundError', async () => {
    const cat = catalogos({ presentaciones: new Map() });
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 1 }]),
    ).rejects.toBeInstanceOf(PresentationNotFoundError);
  });

  it('R35: presentacion sin contenido -> PresentationWithoutContentError con el id en el diagnostico', async () => {
    const cat = catalogos({ presentaciones: new Map([[PRESENTACION_A, { content: null, unitId: UNIT_ID }]]) });
    const error = await resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 1 },
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PresentationWithoutContentError);
    expect((error as PresentationWithoutContentError).diagnostic).toBe(PRESENTACION_A);
  });

  it('R7: unidad de la presentacion sin base comun con la del pedido -> IncompatibleUnitsError', async () => {
    const OTRA_UNIDAD = '88888888-8888-4888-8888-888888888888';
    const cat = catalogos({
      presentaciones: new Map([[PRESENTACION_A, { content: '5.0000', unitId: OTRA_UNIDAD }]]),
      unidades: new Map([
        [UNIT_ID, { baseUnitId: null, factor: null }],
        [OTRA_UNIDAD, { baseUnitId: null, factor: null }],
      ]),
    });
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 1 }]),
    ).rejects.toBeInstanceOf(IncompatibleUnitsError);
  });

  it('R36: el reparto pasa del total -> OrderDistributionExceedsQuantityError', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 3 }]),
    ).rejects.toBeInstanceOf(OrderDistributionExceedsQuantityError);
  });

  it('R6, R8: sin fallo, devuelve las lineas con el contenido copiado en este instante', async () => {
    const cat = catalogos();
    const resultado = await resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 2 },
    ]);
    expect(resultado.lines).toEqual([
      { presentationId: PRESENTACION_A, packages: 2, content: '5.0000', packagingProductId: null },
    ]);
    expect(resultado.packagingLines).toEqual([]);
  });

  it('R9: sin ninguna linea, se acepta sin consultar el catalogo de presentaciones ni el de envases', async () => {
    const cat = catalogos();
    const resultado = await resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, []);
    expect(resultado.lines).toEqual([]);
    expect(cat.findRefsPresentaciones).not.toHaveBeenCalled();
    expect(cat.findRefsEnvases).not.toHaveBeenCalled();
  });

  it('UNA sola llamada a `UnitCatalog.findRefs`, con los ids UNICOS de la unidad del pedido y las presentaciones distintas', async () => {
    const cat = catalogos({
      presentaciones: new Map([
        [PRESENTACION_A, { content: '2.0000', unitId: UNIT_ID }],
        [PRESENTACION_B, { content: '1.0000', unitId: UNIT_ID }],
      ]),
    });
    await resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 1 },
      { presentationId: PRESENTACION_B, packages: 1 },
    ]);
    expect(cat.findRefsUnidades).toHaveBeenCalledTimes(1);
    expect(cat.findRefsUnidades).toHaveBeenCalledWith([UNIT_ID], COMPANY_ID);
  });
});

describe('QC-195 resolveDistribution — lineas con envase', () => {
  it('R13, R14, R15: 40 botellas de 500 ml cubren 20 l, copian la presentacion y el contenido del envase y piden 40 envases', async () => {
    const cat = catalogos();
    const resultado = await resolveDistribution(cat.catalogs, COMPANY_ID, '20', UNIT_ID, [
      { packagingProductId: ENVASE_500ML, packages: 40 },
    ]);
    expect(resultado.lines).toEqual([
      { presentationId: PRESENTACION_500ML, packages: 40, content: '500.0000', packagingProductId: ENVASE_500ML },
    ]);
    expect(resultado.packagingLines).toEqual([{ productId: ENVASE_500ML, packages: 40 }]);
    expect(cat.findRefsEnvases).toHaveBeenCalledWith([ENVASE_500ML], COMPANY_ID);
  });

  it('R13: un envase en ml y otro en l se suman convertidos a la unidad del pedido; pasar de la cantidad se rechaza', async () => {
    const cat = catalogos();
    const lineas = [
      { packagingProductId: ENVASE_500ML, packages: 10 },
      { packagingProductId: ENVASE_1L, packages: 5 },
    ];
    await expect(resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, lineas)).resolves.toBeDefined();
    await expect(resolveDistribution(cat.catalogs, COMPANY_ID, '9.9999', UNIT_ID, lineas)).rejects.toBeInstanceOf(
      OrderDistributionExceedsQuantityError,
    );
  });

  it('R11: un envase que no vuelve del catalogo (no existe, de otra empresa, de baja, no es envase o sin presentacion fija) -> ProductNotFoundError', async () => {
    const cat = catalogos({ envases: [] });
    const error = await resolveDistribution(cat.catalogs, COMPANY_ID, '20', UNIT_ID, [
      { packagingProductId: ENVASE_500ML, packages: 1 },
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProductNotFoundError);
    expect((error as ProductNotFoundError).code).toBe('product_not_found');
  });

  it('R11: un envase cuya presentacion no comparte unidad base con el pedido -> IncompatibleUnitsError', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '20', UNIT_ID, [{ packagingProductId: ENVASE_KG, packages: 1 }]),
    ).rejects.toBeInstanceOf(IncompatibleUnitsError);
  });

  it('R13: un envase cuya presentacion no tiene contenido -> PresentationWithoutContentError', async () => {
    const cat = catalogos({ envases: [{ ...BOTELLA_1L, content: null }] });
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '20', UNIT_ID, [{ packagingProductId: ENVASE_1L, packages: 1 }]),
    ).rejects.toBeInstanceOf(PresentationWithoutContentError);
  });

  it('R12: dos envases distintos con la misma presentacion -> ValidationError (invalid_input)', async () => {
    const GEMELA = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
    const cat = catalogos({ envases: [BOTELLA_1L, { ...BOTELLA_1L, id: GEMELA, name: 'Botella vidrio 1 L' }] });
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '20', UNIT_ID, [
        { packagingProductId: ENVASE_1L, packages: 1 },
        { packagingProductId: GEMELA, packages: 1 },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('R12: un envase con la misma presentacion que una linea antigua conservada -> ValidationError', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(
        cat.catalogs,
        COMPANY_ID,
        '20',
        UNIT_ID,
        [
          { presentationId: PRESENTACION_A, packages: 2 },
          { packagingProductId: ENVASE_1L, packages: 1 },
        ],
        { savedLines: GUARDADAS },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('QC-195 resolveDistribution — lineas antiguas', () => {
  it('R35: una linea antigua que llega igual (misma presentacion, mismos envases) se conserva sin envase', async () => {
    const cat = catalogos();
    const resultado = await resolveDistribution(
      cat.catalogs,
      COMPANY_ID,
      '10',
      UNIT_ID,
      [{ presentationId: PRESENTACION_A, packages: 2 }],
      { savedLines: GUARDADAS },
    );
    expect(resultado.lines).toEqual([
      { presentationId: PRESENTACION_A, packages: 2, content: '5.0000', packagingProductId: null },
    ]);
    expect(resultado.packagingLines).toEqual([]);
  });

  it('R34: una linea antigua con sus envases cambiados -> ValidationError sin consultar ningun catalogo', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 1 }], {
        savedLines: GUARDADAS,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(cat.findRefsPresentaciones).not.toHaveBeenCalled();
    expect(cat.findRefsUnidades).not.toHaveBeenCalled();
  });

  it('R34: una linea por presentacion que el pedido no tenia (o en un alta) -> ValidationError', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 2 }], {
        savedLines: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('R34: una linea guardada con envase no sirve para reenviarla por su presentacion', async () => {
    const cat = catalogos();
    await expect(
      resolveDistribution(cat.catalogs, COMPANY_ID, '10', UNIT_ID, [{ presentationId: PRESENTACION_A, packages: 1 }], {
        savedLines: [{ presentationId: PRESENTACION_A, packages: 1, packagingProductId: ENVASE_1L }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('QC-195 resolveDistributionLines — sin lanzar', () => {
  it('R11: el envase que no vuelve sale como packaging_not_found con su id', async () => {
    const cat = catalogos({ envases: [] });
    await expect(
      resolveDistributionLines(cat.catalogs, COMPANY_ID, UNIT_ID, [{ packagingProductId: ENVASE_1L, packages: 1 }]),
    ).resolves.toEqual({ kind: 'packaging_not_found', packagingProductId: ENVASE_1L });
  });

  it('sin lineas guardadas (la consulta del disponible) una linea antigua se resuelve sin compararla', async () => {
    const cat = catalogos();
    const resolucion = await resolveDistributionLines(cat.catalogs, COMPANY_ID, UNIT_ID, [
      { presentationId: PRESENTACION_A, packages: 7 },
    ]);
    expect(resolucion.kind).toBe('resolved');
  });
});
