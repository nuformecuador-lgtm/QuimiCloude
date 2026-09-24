// Confirmacion de una importacion de catalogo (T10): R13, R14, R17, R18, R20, R26. Dobles de todos
// los puertos y de los casos de uso inyectados de `proveedores` e `inventario`; sin base ni red.

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_UPLOAD_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { ValidationError } from '@/lib/modules/documentos/domain/errors';
import { createConfirmCatalogImport } from '@/lib/modules/documentos/domain/confirm-catalog-import';
import type { CatalogImportDeps } from '@/lib/modules/documentos/domain/preview-catalog-import';

import { PresentationDuplicateNameError } from '@/lib/modules/inventario';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';
import type { CropCatalog } from '@/lib/modules/documentos/ports/crop-catalog';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRESENTACION_LITRO = '55555555-5555-4555-8555-555555555555';
const UNIDAD_LITRO = '66666666-6666-4666-8666-666666666666';

function actorConPermiso(): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions: [DOCUMENT_UPLOAD_PERMISSION, 'inventario.modificar'] };
}

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

function dobleDeRepositorio(archivo: FileForReview | null = ARCHIVO_LISTO): DocumentBatchRepository {
  return {
    createBatch: vi.fn(),
    attachMessageId: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    expireStale: vi.fn(),
    readBatch: vi.fn(),
    readFileForReview: vi.fn(async () => archivo),
  } as unknown as DocumentBatchRepository;
}

function dobleDeRecortes(paths: readonly string[] = []): CropCatalog {
  return {
    list: vi.fn(async () => paths),
    createSignedReadUrl: vi.fn(async (path: string) => `https://firmada.invalid/${path}`),
  };
}

function dobleDePresentaciones(
  encontradas: readonly { id: string; name: string; nameNormalized: string; unitId: string }[] = [],
) {
  return {
    findRefs: vi.fn(),
    findByNormalizedNames: vi.fn(async () => encontradas),
  };
}

function dobleDeUnidades(visibles: readonly { id: string; name: string; symbol: string | null; baseUnitId: string | null; factor: string | null }[] = []) {
  return {
    findRefs: vi.fn(async (ids: readonly string[]) => visibles.filter((unidad) => ids.includes(unidad.id))),
    findRefsSharingBaseInCompany: vi.fn(),
  };
}

/** Puerto de escritura que falla si alguien lo llama: sirve para afirmar que R13 no escribe nada. */
function dobleQueFallaSiSeLlama(nombre: string) {
  return vi.fn(async () => {
    throw new Error(`no debia llamarse: ${nombre}`);
  });
}

function crearDeps(overrides: Partial<CatalogImportDeps> = {}): CatalogImportDeps {
  return {
    repository: dobleDeRepositorio(),
    crops: dobleDeRecortes(),
    presentations: dobleDePresentaciones(),
    createPresentation: dobleQueFallaSiSeLlama('createPresentation') as CatalogImportDeps['createPresentation'],
    units: dobleDeUnidades(),
    catalog: {
      findAliveByIdentity: vi.fn(async () => []),
      importLines: dobleQueFallaSiSeLlama('catalog.importLines') as CatalogImportDeps['catalog']['importLines'],
    },
    ...overrides,
  };
}

function entradaBase(lines: readonly Record<string, unknown>[], newPresentationUnits: readonly Record<string, unknown>[] = []) {
  return { supplierId: PROVEEDOR, documentFileId: ARCHIVO, lines, newPresentationUnits };
}

describe('createConfirmCatalogImport', () => {
  it('R13 — sin confirmar no se escribe: la confirmacion con una fila valida crea la linea y devuelve el resumen', async () => {
    const importLines = vi.fn(async (..._args: [string, readonly unknown[], unknown?]) => ({ created: 1, updated: 0, unchanged: 0 }));
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
      catalog: { findAliveByIdentity: vi.fn(async () => []), importLines },
    });
    const confirm = createConfirmCatalogImport(deps);

    const resumen = await confirm(actorConPermiso(), entradaBase([filaRevisada()]));

    expect(resumen).toEqual({ created: 1, updated: 0, unchanged: 0, presentationsCreated: 0 });
    expect(importLines).toHaveBeenCalledTimes(1);
    const [, lineas] = importLines.mock.calls[0] as [string, readonly Record<string, unknown>[]];
    expect(lineas[0]?.presentationId).toBe(PRESENTACION_LITRO);
    expect(lineas[0]?.unitId).toBe(UNIDAD_LITRO);
  });

  it('R14 — ignora la clasificacion del cliente: una fila que llega como si fuera nueva pero ya existe en el servidor se escribe por identidad, no duplicada', async () => {
    const importLines = vi.fn(async (..._args: [string, readonly unknown[], unknown?]) => ({ created: 0, updated: 1, unchanged: 0 }));
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
      catalog: {
        findAliveByIdentity: vi.fn(async () => [
          { id: 'linea-viva', nameNormalized: 'acidocitrico', presentationId: PRESENTACION_LITRO, cost: '50.0000' },
        ]),
        importLines,
      },
    });
    const confirm = createConfirmCatalogImport(deps);

    const resumen = await confirm(actorConPermiso(), entradaBase([filaRevisada({ cost: '75.0000' })]));

    expect(resumen).toEqual({ created: 0, updated: 1, unchanged: 0, presentationsCreated: 0 });
    expect(deps.createPresentation).not.toHaveBeenCalled();
  });

  it('R17 — una presentacion nueva nombrada por tres filas se crea UNA sola vez', async () => {
    const createPresentation = vi.fn(async () => ({ id: 'presentacion-nueva' }));
    const importLines = vi.fn(async (..._args: [string, readonly unknown[], unknown?]) => ({ created: 3, updated: 0, unchanged: 0 }));
    const deps = crearDeps({
      presentations: dobleDePresentaciones([]),
      units: dobleDeUnidades([{ id: UNIDAD_LITRO, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]),
      createPresentation: createPresentation as CatalogImportDeps['createPresentation'],
      catalog: { findAliveByIdentity: vi.fn(async () => []), importLines },
    });
    const confirm = createConfirmCatalogImport(deps);

    const lines = [
      filaRevisada({ name: 'Producto A' }),
      filaRevisada({ name: 'Producto B' }),
      filaRevisada({ name: 'Producto C' }),
    ];
    const resumen = await confirm(
      actorConPermiso(),
      entradaBase(lines, [{ presentation: 'Bidon 20L', unitId: UNIDAD_LITRO }]),
    );

    expect(createPresentation).toHaveBeenCalledTimes(1);
    expect(resumen.presentationsCreated).toBe(1);
    const [, lineasEscritas] = importLines.mock.calls[0] as [string, readonly Record<string, unknown>[]];
    expect(lineasEscritas.every((linea) => linea.presentationId === 'presentacion-nueva')).toBe(true);
  });

  it('R17 — `PresentationDuplicateNameError` concurrente se reutiliza en vez de duplicar', async () => {
    const createPresentation = vi.fn(async () => {
      throw new PresentationDuplicateNameError();
    });
    // Primera llamada -SIN resultado, para que la fila clasifique como "nueva"-; la SEGUNDA -tras
    // el error de carrera- ya encuentra la presentacion que la creo otra confirmacion simultanea.
    const findByNormalizedNames = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'presentacion-existente', name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]);
    const importLines = vi.fn(async (..._args: [string, readonly unknown[], unknown?]) => ({ created: 1, updated: 0, unchanged: 0 }));
    const deps = crearDeps({
      presentations: { findRefs: vi.fn(), findByNormalizedNames },
      units: dobleDeUnidades([{ id: UNIDAD_LITRO, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }]),
      createPresentation: createPresentation as CatalogImportDeps['createPresentation'],
      catalog: { findAliveByIdentity: vi.fn(async () => []), importLines },
    });
    const confirm = createConfirmCatalogImport(deps);

    const resumen = await confirm(
      actorConPermiso(),
      entradaBase([filaRevisada()], [{ presentation: 'Bidon 20L', unitId: UNIDAD_LITRO }]),
    );

    expect(createPresentation).toHaveBeenCalledTimes(1);
    // La primera llamada a `findByNormalizedNames` es la resolucion inicial (sin resultado); la
    // segunda, la reutilizacion tras el error de carrera.
    expect(findByNormalizedNames).toHaveBeenCalledTimes(2);
    expect(resumen.presentationsCreated).toBe(0);
    const [, lineasEscritas] = importLines.mock.calls[0] as [string, readonly Record<string, unknown>[]];
    expect(lineasEscritas[0]?.presentationId).toBe('presentacion-existente');
  });

  it('R18 — presentacion nueva sin unidad elegida rechaza la confirmacion entera sin escribir nada', async () => {
    const deps = crearDeps({ presentations: dobleDePresentaciones([]) });
    const confirm = createConfirmCatalogImport(deps);

    await expect(confirm(actorConPermiso(), entradaBase([filaRevisada()]))).rejects.toBeInstanceOf(ValidationError);
    expect(deps.createPresentation).not.toHaveBeenCalled();
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R18 — unidad elegida pero no visible para la empresa rechaza la confirmacion entera', async () => {
    const deps = crearDeps({
      presentations: dobleDePresentaciones([]),
      units: dobleDeUnidades([]),
    });
    const confirm = createConfirmCatalogImport(deps);

    await expect(
      confirm(actorConPermiso(), entradaBase([filaRevisada()], [{ presentation: 'Bidon 20L', unitId: UNIDAD_LITRO }])),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deps.createPresentation).not.toHaveBeenCalled();
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R20 — fila incompleta rechaza la confirmacion entera sin escribir nada', async () => {
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
    });
    const confirm = createConfirmCatalogImport(deps);

    await expect(
      confirm(actorConPermiso(), entradaBase([filaRevisada({ name: '' })])),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R20 — dos filas incluidas con la misma identidad tras las correcciones rechazan la confirmacion entera', async () => {
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
    });
    const confirm = createConfirmCatalogImport(deps);

    await expect(
      confirm(actorConPermiso(), entradaBase([filaRevisada(), filaRevisada()])),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R26 — una imagen que no es recorte de ESE archivo rechaza la confirmacion entera', async () => {
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
      crops: dobleDeRecortes([`${EMPRESA}/${ARCHIVO}/1-1.png`]),
    });
    const confirm = createConfirmCatalogImport(deps);

    await expect(
      confirm(
        actorConPermiso(),
        entradaBase([filaRevisada({ imagePath: `${EMPRESA}/otro-archivo/1-1.png` })]),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('R26 — una imagen que ya no esta en la lista vigente de recortes rechaza la confirmacion entera', async () => {
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
      crops: dobleDeRecortes([]),
    });
    const confirm = createConfirmCatalogImport(deps);

    await expect(
      confirm(
        actorConPermiso(),
        entradaBase([filaRevisada({ imagePath: `${EMPRESA}/${ARCHIVO}/1-1.png` })]),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deps.catalog.importLines).not.toHaveBeenCalled();
  });

  it('una imagen real de ese archivo y esa empresa se escribe con la linea', async () => {
    const importLines = vi.fn(async (..._args: [string, readonly unknown[], unknown?]) => ({ created: 1, updated: 0, unchanged: 0 }));
    const rutaImagen = `${EMPRESA}/${ARCHIVO}/1-1.png`;
    const deps = crearDeps({
      presentations: dobleDePresentaciones([
        { id: PRESENTACION_LITRO, name: 'Bidon 20L', nameNormalized: 'bidon20l', unitId: UNIDAD_LITRO },
      ]),
      crops: dobleDeRecortes([rutaImagen]),
      catalog: { findAliveByIdentity: vi.fn(async () => []), importLines },
    });
    const confirm = createConfirmCatalogImport(deps);

    await confirm(actorConPermiso(), entradaBase([filaRevisada({ imagePath: rutaImagen })]));

    const [, lineas] = importLines.mock.calls[0] as [string, readonly Record<string, unknown>[]];
    expect(lineas[0]?.imagePath).toBe(rutaImagen);
  });
});
