/**
 * `createConfirmCatalogImport` contra Postgres real, con los adaptadores de
 * Prisma de `documentos`, `proveedores`, `inventario` y `unidades` cableados a mano -el mismo
 * cableado que hara `lib/composition`, sin pasar por el-. Solo `CropCatalog` va doblado, porque
 * no hay almacenamiento real en el test.
 *
 * `createImportCatalogLines` abre SU PROPIA `prisma.$transaction` contra el cliente GLOBAL, y
 * la presentacion creada por OTRA llamada (a `inventario`, fuera de esa
 * transaccion) necesita sobrevivir a un fallo de la escritura de lineas: envolver la corrida en una
 * transaccion de test con `ROLLBACK` seria un aislamiento de mentira, igual que ya razona
 * `catalog-import-upsert.int.test.ts`. Por eso este archivo COMMITEA: cada caso fabrica su
 * propia empresa efimera y la limpia en un `finally`, en el orden que exigen las FK. Entrada en
 * `tests/integration/aislamiento.json > commit`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createConfirmCatalogImport } from '@/lib/modules/documentos/domain/confirm-catalog-import';
import type { CatalogImportDeps } from '@/lib/modules/documentos/domain/preview-catalog-import';
import type { Actor } from '@/lib/modules/documentos/domain/actor';
import type { CropCatalog } from '@/lib/modules/documentos/ports/crop-catalog';
import { documentBatchRepositoryPrisma } from '@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma';

import {
  createFindCatalogLinesByIdentity,
  createImportCatalogLines,
} from '@/lib/modules/proveedores';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import {
  findAliveCatalogLinesByIdentities,
  upsertCatalogLinesByIdentity,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-import-prisma';

import { createCreatePresentation } from '@/lib/modules/inventario';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  createPresentation,
  deletePresentationById,
  listPresentations,
  replacePresentation,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { PresentationCatalog } from '@/lib/modules/inventario/domain/presentation-catalog';

import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import type { UnitCatalog } from '@/lib/modules/unidades/domain/unit-catalog';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

type Empresa = { readonly companyId: string; readonly userId: string };

const empresasCreadas: Empresa[] = [];

async function crearEmpresa(): Promise<Empresa> {
  const marker = token();
  const companyName = `Empresa ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const empresa: Empresa = { companyId: company.id, userId: user.id };
  empresasCreadas.push(empresa);
  return empresa;
}

async function borrarEmpresa(empresa: Empresa): Promise<void> {
  await prisma.supplierCatalogLine.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.documentFile.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.documentBatch.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.supplier.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.presentation.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.unit.deleteMany({ where: { companyId: empresa.companyId } });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: empresa.userId },
    select: { roleId: true, documentTypeCode: true },
  });
  await prisma.user.delete({ where: { id: empresa.userId } });
  await prisma.role.delete({ where: { id: user.roleId } });
  await prisma.documentType.delete({ where: { code: user.documentTypeCode } });
  await prisma.company.delete({ where: { id: empresa.companyId } });
}

afterAll(async () => {
  for (const empresa of empresasCreadas) await borrarEmpresa(empresa);
  await prisma.$disconnect();
});

async function unidadDeSistema(): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function crearUnidadPropia(companyId: string, name: string): Promise<string> {
  const unit = await prisma.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol: null, companyId },
    select: { id: true },
  });
  return unit.id;
}

async function crearProveedor(companyId: string): Promise<string> {
  const name = `Proveedor ${token()}`;
  const supplier = await prisma.supplier.create({
    data: { name, nameNormalized: normalizeSupplierName(name), phone: '+57 300 000 0000', companyId },
    select: { id: true },
  });
  return supplier.id;
}

async function crearArchivoListo(companyId: string): Promise<string> {
  const batch = await prisma.documentBatch.create({
    data: { companyId, strategy: 'catalogo' },
    select: { id: true },
  });
  const file = await prisma.documentFile.create({
    data: {
      batchId: batch.id,
      companyId,
      path: `${companyId}/${token()}.pdf`,
      status: 'done',
      // El CHECK `document_files_text_matches_status` exige texto en toda fila `done`; la
      // confirmacion no lo lee, asi que su contenido aqui es irrelevante.
      extractedText: '{}',
    },
    select: { id: true },
  });
  return file.id;
}

function dobleDeRecortes(paths: readonly string[] = []): CropCatalog {
  return { list: async () => paths, createSignedReadUrl: async (path) => `https://firmada.invalid/${path}` };
}

const presentationRepository: PresentationRepository = {
  create: createPresentation,
  replace: replacePresentation,
  deleteById: deletePresentationById,
  list: listPresentations,
};

const presentationCatalog: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
};

const unitCatalog: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
};

function crearDeps(overrides: Partial<CatalogImportDeps> = {}): CatalogImportDeps {
  return {
    repository: documentBatchRepositoryPrisma,
    crops: dobleDeRecortes(),
    presentations: presentationCatalog,
    createPresentation: createCreatePresentation({ presentations: presentationRepository }),
    units: unitCatalog,
    catalog: {
      findAliveByIdentity: createFindCatalogLinesByIdentity({
        catalog: { findAliveByIdentities: findAliveCatalogLinesByIdentities, upsertCostByIdentity: upsertCatalogLinesByIdentity },
      }),
      importLines: createImportCatalogLines({
        catalog: { findAliveByIdentities: findAliveCatalogLinesByIdentities, upsertCostByIdentity: upsertCatalogLinesByIdentity },
      }),
    },
    ...overrides,
  };
}

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

describe('createConfirmCatalogImport — aislamiento contra Postgres real (R21, R22, R34)', () => {
  it('R21 — la presentacion creada QUEDA aunque la escritura de lineas falle despues; la segunda confirmacion la reutiliza', async () => {
    const empresa = await crearEmpresa();
    const supplierId = await crearProveedor(empresa.companyId);
    const documentFileId = await crearArchivoListo(empresa.companyId);
    const unitId = await unidadDeSistema();
    // La confirmacion exige el permiso de subida de documentos, ademas de los de proveedores e inventario.
    const actor: Actor = {
      id: empresa.userId,
      companyId: empresa.companyId,
      permissions: ['proveedores.modificar', 'inventario.modificar', 'documentos.modificar'],
    };

    const marker = token();
    const presentationName = `Bidon nuevo ${marker}`;
    const entrada = {
      supplierId,
      documentFileId,
      lines: [filaRevisada({ name: `Producto ${marker}`, presentation: presentationName })],
      newPresentationUnits: [{ presentation: presentationName, unitId }],
    };

    // La presentacion la crea `inventario.createPresentation`, en una llamada aparte de la
    // escritura de la linea: se envuelve para dejar de baja al proveedor
    // JUSTO DESPUES de que esa llamada haya terminado -y antes de escribir la linea-, sin
    // depender de ninguna espera arbitraria.
    let notificarPresentacionCreada: () => void = () => {};
    const presentacionCreada = new Promise<void>((resolve) => {
      notificarPresentacionCreada = resolve;
    });
    let liberarEscritura: () => void = () => {};
    const puertaDeEscritura = new Promise<void>((resolve) => {
      liberarEscritura = resolve;
    });
    const crearPresentacionReal = createCreatePresentation({ presentations: presentationRepository });
    const deps = crearDeps({
      createPresentation: async (input: unknown, quienConfirma) => {
        const resultado = await crearPresentacionReal(input, quienConfirma);
        notificarPresentacionCreada();
        await puertaDeEscritura;
        return resultado;
      },
    });
    const confirm = createConfirmCatalogImport(deps);

    const confirmacion = confirm(actor, entrada);
    await presentacionCreada;
    await prisma.supplier.update({ where: { id: supplierId }, data: { deletedAt: new Date() } });
    liberarEscritura();

    await expect(confirmacion).rejects.toThrow();

    const presentacion = await prisma.presentation.findFirst({
      where: { companyId: empresa.companyId, nameNormalized: normalizeForTest(presentationName) },
    });
    expect(presentacion).not.toBeNull();

    const lineas = await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId, supplierId } });
    expect(lineas).toBe(0);

    // Segunda confirmacion, proveedor de nuevo vivo: reutiliza la presentacion (no la duplica) y
    // esta vez si escribe la linea.
    await prisma.supplier.update({ where: { id: supplierId }, data: { deletedAt: null } });
    const resumen = await confirm(actor, entrada);

    expect(resumen.presentationsCreated).toBe(0);
    const presentacionesConEseNombre = await prisma.presentation.count({
      where: { companyId: empresa.companyId, nameNormalized: normalizeForTest(presentationName) },
    });
    expect(presentacionesConEseNombre).toBe(1);

    const lineaEscrita = await prisma.supplierCatalogLine.findFirst({
      where: { companyId: empresa.companyId, supplierId, presentationId: presentacion?.id },
    });
    expect(lineaEscrita).not.toBeNull();
    expect(lineaEscrita?.presentationId).toBe(presentacion?.id);
  });

  it('R22 — confirmar dos veces el mismo contenido deja el mismo estado final', async () => {
    const empresa = await crearEmpresa();
    const supplierId = await crearProveedor(empresa.companyId);
    const documentFileId = await crearArchivoListo(empresa.companyId);
    const unitId = await unidadDeSistema();
    // La confirmacion exige el permiso de subida de documentos, ademas de los de proveedores e inventario.
    const actor: Actor = {
      id: empresa.userId,
      companyId: empresa.companyId,
      permissions: ['proveedores.modificar', 'inventario.modificar', 'documentos.modificar'],
    };

    const marker = token();
    const presentationName = `Bidon repetido ${marker}`;
    const entrada = {
      supplierId,
      documentFileId,
      lines: [filaRevisada({ name: `Producto repetido ${marker}`, presentation: presentationName })],
      newPresentationUnits: [{ presentation: presentationName, unitId }],
    };
    const deps = crearDeps();
    const confirm = createConfirmCatalogImport(deps);

    const primero = await confirm(actor, entrada);
    expect(primero).toEqual({ created: 1, updated: 0, unchanged: 0, presentationsCreated: 1 });

    const segundo = await confirm(actor, entrada);
    expect(segundo).toEqual({ created: 0, updated: 0, unchanged: 1, presentationsCreated: 0 });

    const presentaciones = await prisma.presentation.count({
      where: { companyId: empresa.companyId, nameNormalized: normalizeForTest(presentationName) },
    });
    expect(presentaciones).toBe(1);
    const lineas = await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId, supplierId } });
    expect(lineas).toBe(1);
  });

  describe('R34 — archivo, proveedor, unidad y recorte de otra empresa se comportan como inexistentes', () => {
    it('archivo de otra empresa: invalid_input, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const supplierId = await crearProveedor(empresa.companyId);
      const documentFileDeOtra = await crearArchivoListo(otra.companyId);
      // La confirmacion exige el permiso de subida de documentos, ademas del de proveedores.
      const actor: Actor = {
        id: empresa.userId,
        companyId: empresa.companyId,
        permissions: ['proveedores.modificar', 'documentos.modificar'],
      };
      const deps = crearDeps();
      const confirm = createConfirmCatalogImport(deps);

      await expect(
        confirm(actor, {
          supplierId,
          documentFileId: documentFileDeOtra,
          lines: [filaRevisada()],
          newPresentationUnits: [],
        }),
      ).rejects.toThrow();

      const lineas = await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId } });
      expect(lineas).toBe(0);
    });

    it('proveedor de otra empresa: supplier_not_found, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const supplierDeOtra = await crearProveedor(otra.companyId);
      const documentFileId = await crearArchivoListo(empresa.companyId);
      // La confirmacion exige el permiso de subida de documentos, ademas del de proveedores.
      const actor: Actor = {
        id: empresa.userId,
        companyId: empresa.companyId,
        permissions: ['proveedores.modificar', 'documentos.modificar'],
      };
      const deps = crearDeps();
      const confirm = createConfirmCatalogImport(deps);

      await expect(
        confirm(actor, {
          supplierId: supplierDeOtra,
          documentFileId,
          lines: [filaRevisada({ presentation: 'Bidon ajeno' })],
          newPresentationUnits: [],
        }),
      ).rejects.toThrow();

      const lineas = await prisma.supplierCatalogLine.count({ where: { supplierId: supplierDeOtra } });
      expect(lineas).toBe(0);
    });

    it('unidad de otra empresa para una presentacion nueva: invalid_input, nada escrito ni creado', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const supplierId = await crearProveedor(empresa.companyId);
      const documentFileId = await crearArchivoListo(empresa.companyId);
      const unidadAjena = await crearUnidadPropia(otra.companyId, `Unidad ajena ${token()}`);
      // La confirmacion exige el permiso de subida de documentos, ademas de los de proveedores e inventario.
      const actor: Actor = {
        id: empresa.userId,
        companyId: empresa.companyId,
        permissions: ['proveedores.modificar', 'inventario.modificar', 'documentos.modificar'],
      };
      const deps = crearDeps();
      const confirm = createConfirmCatalogImport(deps);

      const presentationName = `Bidon con unidad ajena ${token()}`;
      await expect(
        confirm(actor, {
          supplierId,
          documentFileId,
          lines: [filaRevisada({ presentation: presentationName })],
          newPresentationUnits: [{ presentation: presentationName, unitId: unidadAjena }],
        }),
      ).rejects.toThrow();

      const presentaciones = await prisma.presentation.count({
        where: { companyId: empresa.companyId, nameNormalized: normalizeForTest(presentationName) },
      });
      expect(presentaciones).toBe(0);
      const lineas = await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId, supplierId } });
      expect(lineas).toBe(0);
    });

    it('recorte de otro archivo (aunque exista en la misma empresa): invalid_input, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const supplierId = await crearProveedor(empresa.companyId);
      const documentFileId = await crearArchivoListo(empresa.companyId);
      const otroArchivo = await crearArchivoListo(empresa.companyId);
      const rutaDeOtroArchivo = `${empresa.companyId}/${otroArchivo}/1-1.png`;
      const deps = crearDeps({ crops: dobleDeRecortes([rutaDeOtroArchivo]) });
      const confirm = createConfirmCatalogImport(deps);
      // La confirmacion exige el permiso de subida de documentos, ademas del de proveedores.
      const actor: Actor = {
        id: empresa.userId,
        companyId: empresa.companyId,
        permissions: ['proveedores.modificar', 'documentos.modificar'],
      };

      await expect(
        confirm(actor, {
          supplierId,
          documentFileId,
          lines: [filaRevisada({ imagePath: rutaDeOtroArchivo })],
          newPresentationUnits: [],
        }),
      ).rejects.toThrow();

      const lineas = await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId, supplierId } });
      expect(lineas).toBe(0);
    });
  });
});
