// Vista previa de una importacion de catalogo. Dobles de todos los
// puertos y de los casos de uso inyectados de `proveedores` e `inventario`; sin base ni red.

import { describe, expect, it, vi } from 'vitest';

import { CATALOG_IMPORT_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/documentos/domain/errors';
import {
  createPreviewCatalogImport,
  type CatalogImportDeps,
} from '@/lib/modules/documentos/domain/preview-catalog-import';

import { SupplierNotFoundError } from '@/lib/modules/proveedores';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';
import type { CropCatalog } from '@/lib/modules/documentos/ports/crop-catalog';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRESENTACION_LITRO = '55555555-5555-4555-8555-555555555555';

function actorConPermiso(): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION] };
}

const JSON_UNA_LINEA_NUEVA = JSON.stringify({
  lines: [
    {
      name: 'Acido Citrico',
      presentation: 'Bidon 20L',
      unit: 'lt',
      cost: '100.0000',
      minPurchase: null,
      deliveryTime: null,
      material: null,
      measurements: null,
      page: 1,
    },
  ],
});

const ARCHIVO_LISTO: FileForReview = {
  status: 'done',
  strategy: 'catalogo',
  extractedText: JSON_UNA_LINEA_NUEVA,
};

/** Registro de llamadas COMPARTIDO por todos los dobles de un mismo caso: hace falta poder
 *  afirmar que, sin permiso, la lista queda vacia. */
type Bitacora = string[];

function dobleDeRepositorio(bitacora: Bitacora, archivo: FileForReview | null = ARCHIVO_LISTO): DocumentBatchRepository {
  return {
    createBatch: vi.fn(),
    attachMessageId: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    expireStale: vi.fn(),
    readBatch: vi.fn(),
    readFileForReview: vi.fn(async () => {
      bitacora.push('repository.readFileForReview');
      return archivo;
    }),
  } as unknown as DocumentBatchRepository;
}

function dobleDeRecortes(bitacora: Bitacora, paths: readonly string[] = []): CropCatalog {
  return {
    list: vi.fn(async () => {
      bitacora.push('crops.list');
      return paths;
    }),
    publicUrl: vi.fn((path: string) => {
      bitacora.push('crops.publicUrl');
      return `https://publica.invalid/${path}`;
    }),
  };
}

function dobleDePresentaciones(bitacora: Bitacora, encontradas: readonly { id: string; name: string; nameNormalized: string; unitId: string }[] = []) {
  return {
    findRefs: vi.fn(),
    findByNormalizedNames: vi.fn(async () => {
      bitacora.push('presentations.findByNormalizedNames');
      return encontradas;
    }),
  };
}

function dobleDeUnidades() {
  return { findRefs: vi.fn(), listVisibleRefs: () => Promise.reject(new Error('no se usa')), findMassVolumeBridge: () => Promise.reject(new Error('no se usa')), findRefsSharingBaseInCompany: vi.fn() };
}

/** Puerto de ESCRITURA que falla si alguien lo llama: la vista previa no debe escribir
 *  nada, y este doble convierte cualquier llamada en un test rojo en vez de en un `undefined`
 *  silencioso. */
function dobleQueFallaSiSeLlama(nombre: string) {
  return vi.fn(async () => {
    throw new Error(`no debia llamarse: ${nombre}`);
  });
}

function crearDeps(bitacora: Bitacora, overrides: Partial<CatalogImportDeps> = {}): CatalogImportDeps {
  return {
    repository: dobleDeRepositorio(bitacora),
    crops: dobleDeRecortes(bitacora),
    presentations: dobleDePresentaciones(bitacora),
    createPresentation: dobleQueFallaSiSeLlama('createPresentation') as CatalogImportDeps['createPresentation'],
    units: dobleDeUnidades(),
    catalog: {
      findAliveByIdentity: vi.fn(async () => {
        bitacora.push('catalog.findAliveByIdentity');
        return [];
      }),
      importLines: dobleQueFallaSiSeLlama('catalog.importLines') as CatalogImportDeps['catalog']['importLines'],
    },
    ...overrides,
  };
}

describe('createPreviewCatalogImport', () => {
  describe('R3 — archivo invalido: el mismo rechazo en los cuatro casos', () => {
    it('R3 — el archivo no existe: invalid_input', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, null) });
      const preview = createPreviewCatalogImport(deps);

      await expect(
        preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — el archivo es de otra empresa: el repositorio ya lo ve igual que «no existe», invalid_input', async () => {
      // `readFileForReview` documenta que «no existe» y «es de otra empresa» devuelven el MISMO
      // `null`: esta funcion no puede distinguirlos, y por eso no lo intenta.
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, null) });
      const preview = createPreviewCatalogImport(deps);

      await expect(
        preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — el archivo no esta en "done": invalid_input', async () => {
      const bitacora: Bitacora = [];
      const archivo: FileForReview = { status: 'processing', strategy: 'catalogo', extractedText: null };
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, archivo) });
      const preview = createPreviewCatalogImport(deps);

      await expect(
        preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — la tanda del archivo es "formula": invalid_input', async () => {
      const bitacora: Bitacora = [];
      const archivo: FileForReview = { status: 'done', strategy: 'formula', extractedText: '{}' };
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, archivo) });
      const preview = createPreviewCatalogImport(deps);

      await expect(
        preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it('R4 — proveedor no encontrado, de baja o de otra empresa: propaga supplier_not_found sin mostrar filas', async () => {
    const bitacora: Bitacora = [];
    const deps = crearDeps(bitacora, {
      catalog: {
        findAliveByIdentity: vi.fn(async () => {
          throw new SupplierNotFoundError();
        }),
        importLines: dobleQueFallaSiSeLlama('catalog.importLines') as CatalogImportDeps['catalog']['importLines'],
      },
    });
    const preview = createPreviewCatalogImport(deps);

    await expect(
      preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
    ).rejects.toBeInstanceOf(SupplierNotFoundError);
  });

  it('R8 — no escribe nada: los dobles de escritura no se llaman, y la vista previa devuelve las filas', async () => {
    const bitacora: Bitacora = [];
    const deps = crearDeps(bitacora);
    const preview = createPreviewCatalogImport(deps);

    const resultado = await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0]?.kind).toBe('nueva');
    expect(deps.createPresentation).not.toHaveBeenCalled();
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R10 — con lineas editadas, reclasifica: el mismo documento cambia de "sin cambios" a "cambia" segun el costo enviado', async () => {
    const bitacora: Bitacora = [];
    const presentacionEncontrada = {
      id: PRESENTACION_LITRO,
      name: 'Bidon 20L',
      nameNormalized: 'bidon20l',
      unitId: 'u-litro',
    };
    const deps = crearDeps(bitacora, {
      presentations: dobleDePresentaciones(bitacora, [presentacionEncontrada]),
      catalog: {
        findAliveByIdentity: vi.fn(async () => [
          {
            id: 'linea-viva-1',
            nameNormalized: 'acidocitrico',
            presentationId: PRESENTACION_LITRO,
            cost: '100.0000',
          },
        ]),
        importLines: dobleQueFallaSiSeLlama('catalog.importLines') as CatalogImportDeps['catalog']['importLines'],
      },
    });
    const preview = createPreviewCatalogImport(deps);

    const filaBase = {
      name: 'Acido Citrico',
      presentation: 'Bidon 20L',
      minPurchase: null,
      deliveryTime: null,
      material: null,
      measurements: null,
      imagePath: null,
    };

    const sinCambios = await preview(actorConPermiso(), {
      supplierId: PROVEEDOR,
      documentFileId: ARCHIVO,
      lines: [{ ...filaBase, cost: '100.0000' }],
    });
    expect(sinCambios.rows[0]?.kind).toBe('sin cambios');

    const cambia = await preview(actorConPermiso(), {
      supplierId: PROVEEDOR,
      documentFileId: ARCHIVO,
      lines: [{ ...filaBase, cost: '150.0000' }],
    });
    expect(cambia.rows[0]?.kind).toBe('cambia');
    expect(cambia.rows[0]?.currentCost).toBe('100.0000');
    expect(cambia.rows[0]?.newCost).toBe('150.0000');
  });

  describe('QC-171 — recortes con URL publica', () => {
    it('QC-171 R9 — crops[].url y rows[].imageUrl son publicUrl(ruta), sin ninguna firma', async () => {
      const bitacora: Bitacora = [];
      const ruta = `${EMPRESA}/${ARCHIVO}/1-1.png`;
      const deps = crearDeps(bitacora, { crops: dobleDeRecortes(bitacora, [ruta]) });
      const preview = createPreviewCatalogImport(deps);

      const resultado = await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      expect(resultado.crops).toEqual([{ path: ruta, url: `https://publica.invalid/${ruta}` }]);
      expect(resultado.rows[0]?.imageUrl).toBe(`https://publica.invalid/${ruta}`);
      expect(deps.crops.publicUrl).toHaveBeenCalledWith(ruta);
    });

    it('QC-171 R10 — list se llama UNA sola vez, sea cual sea el numero de recortes, y ningun otro metodo asincrono del puerto', async () => {
      const bitacora: Bitacora = [];
      const rutas = [`${EMPRESA}/${ARCHIVO}/1-1.png`, `${EMPRESA}/${ARCHIVO}/1-2.png`, `${EMPRESA}/${ARCHIVO}/1-3.png`];
      const deps = crearDeps(bitacora, { crops: dobleDeRecortes(bitacora, rutas) });
      const preview = createPreviewCatalogImport(deps);

      await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      expect(deps.crops.list).toHaveBeenCalledTimes(1);
      expect(bitacora.filter((entrada) => entrada === 'crops.list')).toHaveLength(1);
    });

    it('QC-171 R12 — el emparejamiento de filas con recortes no cambia: la ruta propuesta sigue siendo la de `pairCropsWithLines`', async () => {
      const bitacora: Bitacora = [];
      const ruta = `${EMPRESA}/${ARCHIVO}/1-1.png`;
      const deps = crearDeps(bitacora, { crops: dobleDeRecortes(bitacora, [ruta]) });
      const preview = createPreviewCatalogImport(deps);

      const resultado = await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      // La fila extraida trae `page: 1` y hay un unico recorte de esa pagina: el mismo
      // emparejamiento de siempre le propone esa ruta, solo cambia con que URL se pinta.
      expect(resultado.rows[0]?.imagePath).toBe(ruta);
    });

    it('QC-171 R2 — imagePath sigue siendo la ruta, nunca empieza por http', async () => {
      const bitacora: Bitacora = [];
      const ruta = `${EMPRESA}/${ARCHIVO}/1-1.png`;
      const deps = crearDeps(bitacora, { crops: dobleDeRecortes(bitacora, [ruta]) });
      const preview = createPreviewCatalogImport(deps);

      const resultado = await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      expect(resultado.rows[0]?.imagePath).toBe(ruta);
      expect(resultado.rows[0]?.imagePath).not.toMatch(/^https?:\/\//);
      expect(resultado.rows[0]?.imageUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('R31 — el permiso se exige primero: ningun puerto se toca sin el', () => {
    const actoresDenegados: readonly (readonly [string, Actor | null | undefined])[] = [
      ['actor nulo', null],
      ['actor ausente', undefined],
      ['sin el permiso exigido', { id: PERSONA, companyId: EMPRESA, permissions: ['inventario.consultar'] }],
      ['con el conjunto vacio', { id: PERSONA, companyId: EMPRESA, permissions: [] }],
      ['R8 — solo con `documentos.modificar`', { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.modificar'] }],
    ];

    for (const [nombre, actor] of actoresDenegados) {
      it(`R31 — ${nombre}: unauthorized y ningun puerto tocado`, async () => {
        const bitacora: Bitacora = [];
        const deps = crearDeps(bitacora);
        const preview = createPreviewCatalogImport(deps);

        await expect(
          preview(actor, { supplierId: PROVEEDOR, documentFileId: ARCHIVO }),
        ).rejects.toBeInstanceOf(UnauthorizedError);

        expect(bitacora).toEqual([]);
        expect(deps.repository.readFileForReview).not.toHaveBeenCalled();
        expect(deps.crops.list).not.toHaveBeenCalled();
        expect(deps.crops.publicUrl).not.toHaveBeenCalled();
        expect(deps.presentations.findByNormalizedNames).not.toHaveBeenCalled();
        expect(deps.catalog.findAliveByIdentity).not.toHaveBeenCalled();
        expect(deps.createPresentation).not.toHaveBeenCalled();
        expect(deps.catalog.importLines).not.toHaveBeenCalled();
      });
    }

    it('R31 — con permiso, la bitacora registra el orden: el archivo se lee ANTES que cualquier otro puerto', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewCatalogImport(deps);

      await preview(actorConPermiso(), { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      expect(bitacora[0]).toBe('repository.readFileForReview');
    });

    it('R9 — con solo `proveedores.modificar` (sin `documentos.modificar`) devuelve la vista previa', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewCatalogImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [CATALOG_IMPORT_PERMISSION] };

      const resultado = await preview(actor, { supplierId: PROVEEDOR, documentFileId: ARCHIVO });

      expect(resultado.rows).toHaveLength(1);
    });
  });
});
