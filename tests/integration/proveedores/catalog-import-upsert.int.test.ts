/**
 * T4 (QC-158) — `upsertCatalogLinesByIdentity` y `findAliveCatalogLinesByIdentities` contra
 * una base Postgres REAL (`design.md > 5.2`, `> 8`).
 *
 * `upsertCatalogLinesByIdentity` abre SU PROPIA `prisma.$transaction` contra el cliente
 * GLOBAL -el `SELECT ... FOR SHARE` del proveedor y, por cada linea, el `INSERT ... ON
 * CONFLICT`-, asi que envolver la corrida en una transaccion del test con `ROLLBACK` seria
 * un aislamiento de mentira: correria en otra conexion del pool y no veria el fixture. R22
 * ademas necesita DOS llamadas concurrentes de verdad, que es incompatible por construccion
 * con una unica transaccion de test. Por eso este archivo COMMITEA: cada caso fabrica su
 * propia empresa efimera (`randomUUID`) y la limpia en un `finally`, en el orden que exigen
 * las FK. Entrada en `tests/integration/aislamiento.json > commit`.
 *
 * Requisitos: R4, R15, R16, R21, R22, R34.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  findAliveCatalogLinesByIdentities,
  upsertCatalogLinesByIdentity,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-import-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { CatalogLineFields } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { SupplierScope } from '@/lib/modules/proveedores/domain/supplier-scope';

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

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
};

const empresasCreadas: Empresa[] = [];

/** Empresa efimera con su usuario -para `created_by`/`updated_by`-, limpiada en `afterAll`. */
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
  await prisma.supplier.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.presentation.deleteMany({ where: { companyId: empresa.companyId } });
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

async function crearPresentacion(companyId: string, name: string): Promise<string> {
  const presentation = await prisma.presentation.create({
    data: {
      name,
      nameNormalized: normalizeForTest(name),
      unitId: await unidadDeSistema(),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

async function crearProveedor(companyId: string, deletedAt: Date | null = null): Promise<string> {
  const name = `Proveedor ${token()}`;
  const supplier = await prisma.supplier.create({
    data: {
      name,
      nameNormalized: normalizeSupplierName(name),
      phone: '+57 300 000 0000',
      companyId,
      deletedAt,
    },
    select: { id: true },
  });
  return supplier.id;
}

function campos(
  name: string,
  presentationId: string,
  overrides: Partial<CatalogLineFields> = {},
): CatalogLineFields {
  return {
    name,
    presentationId,
    unitId: null,
    imagePath: null,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    material: null,
    measurements: null,
    ...overrides,
  };
}

async function lineaDe(companyId: string, supplierId: string, nameNormalized: string) {
  return prisma.supplierCatalogLine.findFirst({
    where: { companyId, supplierId, nameNormalized, deletedAt: null },
  });
}

describe('upsertCatalogLinesByIdentity — R15, R16, R21, R22, R4, R34', () => {
  it('R16 — sin linea viva con esa identidad, la crea con TODOS sus campos', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);
    const unitId = await unidadDeSistema();

    const linea = campos('Acido citrico anhidro', presentationId, {
      unitId,
      imagePath: 'catalogo/acido.png',
      cost: '12.5000',
      minPurchase: '5.0000',
      deliveryTime: 3,
      material: 'Vidrio',
      measurements: { diameter: { value: '7.5000', unit: 'cm' }, height: null, mouth: '28/410' },
    });

    const now = new Date('2026-09-23T10:00:00.000Z');
    const resultado = await upsertCatalogLinesByIdentity(
      supplierId,
      [linea],
      empresa.userId,
      now,
      scope,
    );
    expect(resultado).toEqual({ created: 1, updated: 0, unchanged: 0 });

    const fila = await lineaDe(empresa.companyId, supplierId, 'acidocitricoanhidro');
    expect(fila).not.toBeNull();
    expect(fila?.name).toBe('Acido citrico anhidro');
    expect(fila?.presentationId).toBe(presentationId);
    expect(fila?.unitId).toBe(unitId);
    expect(fila?.imagePath).toBe('catalogo/acido.png');
    expect(fila?.cost.toFixed(4)).toBe('12.5000');
    expect(fila?.minPurchase?.toFixed(4)).toBe('5.0000');
    expect(fila?.deliveryTime).toBe(3);
    expect(fila?.material).toBe('Vidrio');
    expect(fila?.measurements).toEqual({
      diameter: { value: '7.5000', unit: 'cm' },
      height: null,
      mouth: '28/410',
    });
    expect(fila?.createdBy).toBe(empresa.userId);
    expect(fila?.updatedBy).toBe(empresa.userId);
    expect(fila?.createdAt.toISOString()).toBe(now.toISOString());
    expect(fila?.updatedAt.toISOString()).toBe(now.toISOString());
  });

  it('R15 — con linea viva y otro costo, actualiza SOLO cost/updated_by/updated_at; el resto queda intacto', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);
    const unitOriginal = await unidadDeSistema();

    const actorOriginal = empresa.userId;
    const otraEmpresa = await crearEmpresa();
    const actorNuevo = otraEmpresa.userId;

    const t1 = new Date('2026-09-20T08:00:00.000Z');
    await upsertCatalogLinesByIdentity(
      supplierId,
      [
        campos('Acido Citrico Anhidro', presentationId, {
          unitId: unitOriginal,
          imagePath: 'catalogo/original.png',
          cost: '10.0000',
          minPurchase: '5.0000',
          deliveryTime: 3,
          material: 'Vidrio',
          measurements: { diameter: null, height: { value: '12.0000', unit: 'mm' }, mouth: null },
        }),
      ],
      actorOriginal,
      t1,
      scope,
    );

    const t2 = new Date('2026-09-23T09:00:00.000Z');
    // Mismo nombre normalizado -> ACIDOCITRICOANHIDRO! comparte identidad, pero la forma
    // cruda es distinta a proposito: si el UPDATE tocara el nombre, se veria aqui.
    const resultado = await upsertCatalogLinesByIdentity(
      supplierId,
      [
        campos('ACIDO CITRICO ANHIDRO!!!', presentationId, {
          unitId: null,
          imagePath: 'catalogo/nueva.png',
          cost: '99.0000',
          minPurchase: '77.0000',
          deliveryTime: 30,
          material: 'Plastico',
          measurements: null,
        }),
      ],
      actorNuevo,
      t2,
      scope,
    );
    expect(resultado).toEqual({ created: 0, updated: 1, unchanged: 0 });

    const fila = await lineaDe(empresa.companyId, supplierId, 'acidocitricoanhidro');
    expect(fila?.name).toBe('Acido Citrico Anhidro');
    expect(fila?.presentationId).toBe(presentationId);
    expect(fila?.unitId).toBe(unitOriginal);
    expect(fila?.imagePath).toBe('catalogo/original.png');
    expect(fila?.cost.toFixed(4)).toBe('99.0000');
    expect(fila?.minPurchase?.toFixed(4)).toBe('5.0000');
    expect(fila?.deliveryTime).toBe(3);
    expect(fila?.material).toBe('Vidrio');
    expect(fila?.measurements).toEqual({
      diameter: null,
      height: { value: '12.0000', unit: 'mm' },
      mouth: null,
    });
    expect(fila?.createdBy).toBe(actorOriginal);
    expect(fila?.updatedBy).toBe(actorNuevo);
    expect(fila?.createdAt.toISOString()).toBe(t1.toISOString());
    expect(fila?.updatedAt.toISOString()).toBe(t2.toISOString());
  });

  it('R15 — con linea viva y el MISMO costo, no escribe: `updated_at` no cambia', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);

    const t1 = new Date('2026-09-20T08:00:00.000Z');
    await upsertCatalogLinesByIdentity(
      supplierId,
      [campos('Acido citrico', presentationId, { cost: '10.0000' })],
      empresa.userId,
      t1,
      scope,
    );

    const t2 = new Date('2026-09-23T09:00:00.000Z');
    const resultado = await upsertCatalogLinesByIdentity(
      supplierId,
      // Cadena distinta, mismo valor decimal exacto: '10.00' === '10.0000'.
      [campos('Acido citrico', presentationId, { cost: '10.00' })],
      empresa.userId,
      t2,
      scope,
    );
    expect(resultado).toEqual({ created: 0, updated: 0, unchanged: 1 });

    const fila = await lineaDe(empresa.companyId, supplierId, 'acidocitrico');
    expect(fila?.cost.toFixed(4)).toBe('10.0000');
    expect(fila?.updatedAt.toISOString()).toBe(t1.toISOString());
  });

  it('R21 — un fallo forzado en la fila 3 de 5 no deja escrita NINGUNA de las cinco', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentaciones = await Promise.all(
      Array.from({ length: 4 }, () => crearPresentacion(empresa.companyId, `Bidon ${token()}`)),
    );

    const marcador = token();
    const lineas = [
      campos(`Linea A ${marcador}`, presentaciones[0] as string),
      campos(`Linea B ${marcador}`, presentaciones[1] as string),
      // Presentacion INEXISTENTE: la FK compuesta rechaza esta fila con 23503.
      campos(`Linea C ${marcador}`, randomUUID()),
      campos(`Linea D ${marcador}`, presentaciones[2] as string),
      campos(`Linea E ${marcador}`, presentaciones[3] as string),
    ];

    await expect(
      upsertCatalogLinesByIdentity(supplierId, lineas, empresa.userId, new Date(), scope),
    ).rejects.toThrow();

    const restantes = await prisma.supplierCatalogLine.count({
      where: { companyId: empresa.companyId, supplierId, nameNormalized: { contains: normalizeForTest(marcador) } },
    });
    expect(restantes).toBe(0);
  });

  it('R22 — dos confirmaciones simultaneas con el mismo contenido no duplican nada', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);

    const linea = campos(`Acido concurrente ${token()}`, presentationId, { cost: '20.0000' });

    const [r1, r2] = await Promise.all([
      upsertCatalogLinesByIdentity(supplierId, [linea], empresa.userId, new Date(), scope),
      upsertCatalogLinesByIdentity(supplierId, [linea], empresa.userId, new Date(), scope),
    ]);

    const resultados = [r1, r2] as const;
    const creadas = resultados.filter(
      (r) => typeof r === 'object' && r.created === 1,
    ).length;
    const sinCambios = resultados.filter(
      (r) => typeof r === 'object' && (r.unchanged === 1 || r.updated === 1),
    ).length;
    // Exactamente una de las dos CREA; la otra encuentra la fila ya escrita con el mismo
    // costo y no escribe nada ('unchanged') -o, si su transaccion corrio primero en el
    // instante exacto, 'updated' con el mismo costo nunca ocurre porque el costo es igual-.
    expect(creadas).toBe(1);
    expect(sinCambios).toBe(1);

    const filas = await prisma.supplierCatalogLine.count({
      where: {
        companyId: empresa.companyId,
        supplierId,
        nameNormalized: normalizeSupplierName(linea.name),
        presentationId,
        deletedAt: null,
      },
    });
    expect(filas).toBe(1);
  });

  it('R4, R34 — proveedor de otra empresa: `supplier_not_found`, nada escrito', async () => {
    const empresa = await crearEmpresa();
    const otra = await crearEmpresa();
    const supplierDeOtra = await crearProveedor(otra.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);

    const resultado = await upsertCatalogLinesByIdentity(
      supplierDeOtra,
      [campos('Acido ajeno', presentationId)],
      empresa.userId,
      new Date(),
      { companyId: empresa.companyId },
    );
    expect(resultado).toBe('supplier_not_found');

    const filas = await prisma.supplierCatalogLine.count({ where: { supplierId: supplierDeOtra } });
    expect(filas).toBe(0);
  });

  it('R4, R34 — proveedor dado de baja: `supplier_not_found`, nada escrito', async () => {
    const empresa = await crearEmpresa();
    const supplierDeBaja = await crearProveedor(empresa.companyId, new Date());
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);

    const resultado = await upsertCatalogLinesByIdentity(
      supplierDeBaja,
      [campos('Acido de baja', presentationId)],
      empresa.userId,
      new Date(),
      { companyId: empresa.companyId },
    );
    expect(resultado).toBe('supplier_not_found');

    const filas = await prisma.supplierCatalogLine.count({ where: { supplierId: supplierDeBaja } });
    expect(filas).toBe(0);
  });
});

describe('findAliveCatalogLinesByIdentities — R9 (lectura para clasificar)', () => {
  it('devuelve solo las lineas VIVAS de ese proveedor y esa empresa cuya identidad coincide', async () => {
    const empresa = await crearEmpresa();
    const scope: SupplierScope = { companyId: empresa.companyId };
    const supplierId = await crearProveedor(empresa.companyId);
    const presentationId = await crearPresentacion(empresa.companyId, `Bidon ${token()}`);

    await upsertCatalogLinesByIdentity(
      supplierId,
      [campos('Acido para buscar', presentationId, { cost: '15.0000' })],
      empresa.userId,
      new Date(),
      scope,
    );

    const resultado = await findAliveCatalogLinesByIdentities(
      supplierId,
      [
        { nameNormalized: normalizeSupplierName('Acido para buscar'), presentationId },
        { nameNormalized: normalizeSupplierName('No existe'), presentationId },
      ],
      scope,
    );
    expect(resultado).not.toBe('supplier_not_found');
    if (resultado === 'supplier_not_found') return;
    expect(resultado.lines).toHaveLength(1);
    expect(resultado.lines[0]?.nameNormalized).toBe(normalizeSupplierName('Acido para buscar'));
    expect(resultado.lines[0]?.cost).toBe('15.0000');
  });

  it('`supplier_not_found` con proveedor de otra empresa', async () => {
    const empresa = await crearEmpresa();
    const otra = await crearEmpresa();
    const supplierDeOtra = await crearProveedor(otra.companyId);

    const resultado = await findAliveCatalogLinesByIdentities(
      supplierDeOtra,
      [],
      { companyId: empresa.companyId },
    );
    expect(resultado).toBe('supplier_not_found');
  });
});
