// Permiso de la confirmacion de una importacion de catalogo. Dobles de todos los
// puertos y de los casos de uso inyectados; sin base ni red.

import { describe, expect, it, vi } from 'vitest';

import { CATALOG_IMPORT_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { UnauthorizedError } from '@/lib/modules/documentos/domain/errors';
import { createConfirmCatalogImport } from '@/lib/modules/documentos/domain/confirm-catalog-import';
import type { CatalogImportDeps } from '@/lib/modules/documentos/domain/preview-catalog-import';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';
import type { CropCatalog } from '@/lib/modules/documentos/ports/crop-catalog';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRESENTACION_LITRO = '55555555-5555-4555-8555-555555555555';
const UNIDAD_LITRO = '66666666-6666-4666-8666-666666666666';

const ARCHIVO_LISTO: FileForReview = { status: 'done', strategy: 'catalogo', extractedText: null };

function filaRevisada(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Acido Citrico',
    presentation: 'Bidon 20L',
    cost: '100.0000',
    minPurchase: null,
    deliveryTime: null,
    material: null,
    measurements: null,
    imagePath: null,
    ...overrides,
  };
}

function entradaBase(lines: readonly Record<string, unknown>[], newPresentationUnits: readonly Record<string, unknown>[] = []) {
  return { supplierId: PROVEEDOR, documentFileId: ARCHIVO, lines, newPresentationUnits };
}

type Bitacora = string[];

function dobleDeRepositorio(bitacora: Bitacora): DocumentBatchRepository {
  return {
    createBatch: vi.fn(),
    attachMessageId: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    expireStale: vi.fn(),
    readBatch: vi.fn(),
    readFileForReview: vi.fn(async () => {
      bitacora.push('repository.readFileForReview');
      return ARCHIVO_LISTO;
    }),
  } as unknown as DocumentBatchRepository;
}

function dobleDeRecortes(bitacora: Bitacora): CropCatalog {
  return {
    list: vi.fn(async () => {
      bitacora.push('crops.list');
      return [];
    }),
    publicUrl: vi.fn((path: string) => {
      bitacora.push('crops.publicUrl');
      return `https://publica.invalid/${path}`;
    }),
  };
}

function dobleDePresentaciones(
  bitacora: Bitacora,
  encontradas: readonly { id: string; name: string; nameNormalized: string; unitId: string }[],
) {
  return {
    findRefs: vi.fn(),
    findByNormalizedNames: vi.fn(async () => {
      bitacora.push('presentations.findByNormalizedNames');
      return encontradas;
    }),
  };
}

function dobleDeUnidades(
  bitacora: Bitacora,
  visibles: readonly { id: string; name: string; symbol: string | null; baseUnitId: string | null; factor: string | null }[],
) {
  return {
    findRefs: vi.fn(async (ids: readonly string[]) => {
      bitacora.push('units.findRefs');
      return visibles.filter((unidad) => ids.includes(unidad.id));
    }),
    listVisibleRefs: () => Promise.reject(new Error('no se usa')),
    findRefsSharingBaseInCompany: vi.fn(),
  };
}

function dobleDeCreatePresentation(bitacora: Bitacora) {
  return vi.fn(async () => {
    bitacora.push('createPresentation');
    return { id: 'presentacion-nueva' };
  });
}

function dobleDeImportLines(bitacora: Bitacora) {
  return vi.fn(async () => {
    bitacora.push('catalog.importLines');
    return { created: 1, updated: 0, unchanged: 0 };
  });
}

function crearDeps(bitacora: Bitacora, overrides: Partial<CatalogImportDeps> = {}): CatalogImportDeps {
  return {
    repository: dobleDeRepositorio(bitacora),
    crops: dobleDeRecortes(bitacora),
    presentations: dobleDePresentaciones(bitacora, []),
    createPresentation: dobleDeCreatePresentation(bitacora) as CatalogImportDeps['createPresentation'],
    units: dobleDeUnidades(bitacora, []),
    catalog: {
      findAliveByIdentity: vi.fn(async () => {
        bitacora.push('catalog.findAliveByIdentity');
        return [];
      }),
      importLines: dobleDeImportLines(bitacora) as CatalogImportDeps['catalog']['importLines'],
    },
    ...overrides,
  };
}

describe('createConfirmCatalogImport — autorizacion', () => {
  describe('R31 — el permiso de documentos se exige primero: ningun puerto se toca sin el', () => {
    const actoresDenegados: readonly (readonly [string, Actor | null | undefined])[] = [
      ['actor nulo', null],
      ['actor ausente', undefined],
      ['sin el permiso exigido', { id: PERSONA, companyId: EMPRESA, permissions: ['inventario.consultar'] }],
      ['con el conjunto vacio', { id: PERSONA, companyId: EMPRESA, permissions: [] }],
    ];

    for (const [nombre, actor] of actoresDenegados) {
      it(`R31, R19 — ${nombre}: unauthorized, y ni list ni publicUrl se llegan a llamar`, async () => {
        const bitacora: Bitacora = [];
        const deps = crearDeps(bitacora);
        const confirm = createConfirmCatalogImport(deps);

        await expect(confirm(actor, entradaBase([filaRevisada()]))).rejects.toBeInstanceOf(UnauthorizedError);

        expect(bitacora).toEqual([]);
        expect(deps.crops.list).not.toHaveBeenCalled();
        expect(deps.crops.publicUrl).not.toHaveBeenCalled();
      });
    }

    it('R31 — con permiso, el archivo se lee ANTES que cualquier otro puerto', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        presentations: dobleDePresentaciones(bitacora, [
          { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
        ]),
      });
      const confirm = createConfirmCatalogImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION, 'inventario.modificar'] };

      await confirm(actor, entradaBase([filaRevisada()]));

      expect(bitacora[0]).toBe('repository.readFileForReview');
    });

    it('R3 — el actor tiene solo `documentos.modificar`: unauthorized y ningun puerto tocado', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmCatalogImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.modificar'] };

      await expect(confirm(actor, entradaBase([filaRevisada()]))).rejects.toBeInstanceOf(UnauthorizedError);

      expect(bitacora).toEqual([]);
    });

    it('R4 — el actor tiene solo `proveedores.modificar` y no hay presentacion nueva: devuelve el resumen', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        presentations: dobleDePresentaciones(bitacora, [
          { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
        ]),
      });
      const confirm = createConfirmCatalogImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION] };

      const resumen = await confirm(actor, entradaBase([filaRevisada()]));

      expect(resumen).toEqual({ created: 1, updated: 0, unchanged: 0, presentationsCreated: 0 });
    });
  });

  describe('R33 — presentacion nueva sin `inventario.modificar`: unauthorized sin escribir nada', () => {
    it('R33 — rechaza ANTES de crear la presentacion o escribir ninguna linea', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        presentations: dobleDePresentaciones(bitacora, []),
        units: dobleDeUnidades(bitacora, [{ id: UNIDAD_LITRO, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]),
      });
      const confirm = createConfirmCatalogImport(deps);
      const actorSinInventario: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION] };

      await expect(
        confirm(
          actorSinInventario,
          entradaBase([filaRevisada()], [{ presentation: 'Bidon 20L', unitId: UNIDAD_LITRO }]),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(bitacora).not.toContain('createPresentation');
      expect(bitacora).not.toContain('catalog.importLines');
    });

    it('R33 — sin presentacion nueva, confirma sin `inventario.modificar`', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        presentations: dobleDePresentaciones(bitacora, [
          { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
        ]),
      });
      const confirm = createConfirmCatalogImport(deps);
      const actorSinInventario: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION] };

      const resumen = await confirm(actorSinInventario, entradaBase([filaRevisada()]));

      expect(resumen).toEqual({ created: 1, updated: 0, unchanged: 0, presentationsCreated: 0 });
      expect(bitacora).not.toContain('createPresentation');
    });
  });
});
