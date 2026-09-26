/**
 * QC-171 T4 (`design.md > 4.3`) — la URL publica de un recorte, contra Postgres REAL y con la
 * fachada `proveedores` ya cableada por `lib/composition`.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: `tests/unit/proveedores/catalog-image-url.test.ts`
 * mockea `CatalogImageUrl` entero, asi que nunca ejercita QUE bucket cablea la composicion. Aqui se
 * siembra una linea real con `image_path` en la base y se lee con los casos de uso REALES: si la
 * composicion dejara de pasar `images`, esto revienta con un `TypeError`, no con un doble callado.
 *
 * MISMO CRITERIO DE AISLAMIENTO que `supplier-showcase.int.test.ts`: una empresa efimera
 * (`randomUUID`), borrada por su id exacto en el `afterAll`, en el orden que exigen las FK.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { proveedores } from '@/lib/composition';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { cropPublicUrl } from '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function unidadDeSistema(): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { companyId: null },
    select: { id: true },
  });
  return unit.id;
}

let companyId: string;
let presentationId: string;
let supplierId: string;
let actor: Actor;

/** Ruta CON forma de recorte -`<empresa>/<archivo>/<pagina>-<n>.png`- subida ANTES de esta ficha:
 *  no pasa por ninguna importacion nueva, solo se siembra directo en la fila (R17). */
let previousCropPath: string;
let lineWithPreviousCropId: string;
let lineWithoutImageId: string;

const linesCreated: string[] = [];

beforeAll(async () => {
  const nombre = `Empresa QC-171 ${token()}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  companyId = company.id;

  const presentationName = `Presentacion QC-171 ${token()}`;
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: presentationName.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId: await unidadDeSistema(),
      companyId,
    },
    select: { id: true },
  });
  presentationId = presentation.id;

  const supplierName = `Proveedor QC-171 ${token()}`;
  const supplier = await prisma.supplier.create({
    data: {
      name: supplierName,
      nameNormalized: normalizeSupplierName(supplierName),
      phone: '+57 300 000 0000',
      companyId,
    },
    select: { id: true },
  });
  supplierId = supplier.id;

  actor = { id: 'actor-qc171', companyId, permissions: ['proveedores.consultar'] };

  previousCropPath = `${companyId}/${randomUUID()}/1-1.png`;

  const lineWithPreviousCrop = await prisma.supplierCatalogLine.create({
    data: {
      supplierId,
      companyId,
      name: 'Linea con recorte anterior',
      nameNormalized: normalizeSupplierName('Linea con recorte anterior'),
      presentationId,
      cost: new Prisma.Decimal('10.0000'),
      imagePath: previousCropPath,
    },
    select: { id: true },
  });
  lineWithPreviousCropId = lineWithPreviousCrop.id;
  linesCreated.push(lineWithPreviousCropId);

  const lineWithoutImage = await prisma.supplierCatalogLine.create({
    data: {
      supplierId,
      companyId,
      name: 'Linea sin imagen',
      nameNormalized: normalizeSupplierName('Linea sin imagen'),
      presentationId,
      cost: new Prisma.Decimal('10.0000'),
      imagePath: null,
    },
    select: { id: true },
  });
  lineWithoutImageId = lineWithoutImage.id;
  linesCreated.push(lineWithoutImageId);
});

afterAll(async () => {
  if (linesCreated.length > 0) {
    await prisma.supplierCatalogLine.deleteMany({ where: { id: { in: linesCreated } } });
  }
  await prisma.supplier.deleteMany({ where: { id: supplierId } });
  await prisma.presentation.deleteMany({ where: { id: presentationId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe('QC-171 R14, R16 — listCatalogLines devuelve imageUrl en la tabla del catalogo', () => {
  it('la linea con ruta trae imageUrl y la linea sin ruta trae imageUrl: null', async () => {
    const pagina = await proveedores.listCatalogLines(supplierId, { page: 1 }, actor);

    const conRecorte = pagina.items.find((line) => line.id === lineWithPreviousCropId);
    const sinImagen = pagina.items.find((line) => line.id === lineWithoutImageId);

    expect(conRecorte?.imagePath).toBe(previousCropPath);
    expect(conRecorte?.imageUrl).toBe(cropPublicUrl(previousCropPath));
    expect(sinImagen?.imagePath).toBeNull();
    expect(sinImagen?.imageUrl).toBeNull();
  });
});

describe('QC-171 R13 — listSupplierShowcase devuelve imageUrl en la vitrina', () => {
  it('la fila del proveedor trae sus lineas con imageUrl (con ruta) e imageUrl: null (sin ruta)', async () => {
    const pagina = await proveedores.listSupplierShowcase({ page: 1 }, actor);
    const fila = pagina.items.find((row) => row.id === supplierId);

    expect(fila).toBeDefined();
    const conRecorte = fila?.lines.find((line) => line.id === lineWithPreviousCropId);
    const sinImagen = fila?.lines.find((line) => line.id === lineWithoutImageId);

    expect(conRecorte?.imageUrl).toBe(cropPublicUrl(previousCropPath));
    expect(sinImagen?.imageUrl).toBeNull();
  });
});

describe('QC-171 R17 — una ruta de recorte YA EXISTENTE compone la misma URL publica que una nueva', () => {
  it('la URL de la linea sembrada con la ruta anterior es exactamente `cropPublicUrl(previousCropPath)`', async () => {
    const pagina = await proveedores.listCatalogLines(supplierId, { page: 1 }, actor);
    const conRecorte = pagina.items.find((line) => line.id === lineWithPreviousCropId);

    expect(conRecorte?.imageUrl).toBe(cropPublicUrl(previousCropPath));
  });

  it('`image_path` sigue intacto en la base: nada se movio ni se reescribio', async () => {
    const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({
      where: { id: lineWithPreviousCropId },
      select: { imagePath: true },
    });

    expect(fila.imagePath).toBe(previousCropPath);
  });
});
