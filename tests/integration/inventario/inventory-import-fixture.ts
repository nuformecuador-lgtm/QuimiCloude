/**
 * Siembra y limpieza compartidas por los tests de integracion del adaptador de importacion.
 * Cada empresa es efimera (randomUUID) y se borra entera por `company_id`, en el orden que
 * exigen las FK.
 */
import { randomUUID } from 'node:crypto';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { PRODUCT_TYPES } from '@/lib/modules/inventario/domain/product-type';
import { prisma } from '@/lib/shared/db/prisma';

import type { ProductType } from '@/lib/modules/inventario/domain/product-type';

export function token(): string {
  return randomUUID().replace(/-/gu, '');
}

export type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly unitIds: string[];
};

export async function sembrarEmpresa(): Promise<Empresa> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const nombreEmpresa = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombreEmpresa, nameNormalized: normalizeCompanyName(nombreEmpresa) },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return { companyId: company.id, userId: user.id, roleId: role.id, documentTypeCode: documentType.code, unitIds: [] };
}

export async function borrarEmpresa(empresa: Empresa): Promise<void> {
  const companyId = empresa.companyId;
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.inventoryImport.deleteMany({ where: { companyId } });
  await prisma.presentation.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.unit.deleteMany({ where: { id: { in: empresa.unitIds } } });
  await prisma.user.deleteMany({ where: { id: empresa.userId } });
  await prisma.role.deleteMany({ where: { id: empresa.roleId } });
  await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

export async function sembrarUnidad(empresa: Empresa): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  empresa.unitIds.push(id);
  return id;
}

export async function sembrarPresentacion(
  empresa: Empresa,
  unitId: string,
  options: { readonly content?: string | null; readonly name?: string } = {},
): Promise<string> {
  const nombre = options.name ?? `Presentacion ${token()}`;
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId,
      companyId: empresa.companyId,
      content: options.content === undefined ? '1' : options.content,
    },
    select: { id: true },
  });
  return id;
}

export async function sembrarReceta(empresa: Empresa, name?: string): Promise<string> {
  const nombre = name ?? `Receta ${token()}`;
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''), companyId: empresa.companyId },
    select: { id: true },
  });
  return id;
}

export async function sembrarProducto(
  empresa: Empresa,
  name: string,
  options: {
    readonly type?: ProductType;
    readonly unitId?: string | null;
    readonly recipeId?: string | null;
    readonly presentationId?: string | null;
    readonly createdAt?: Date;
    readonly deletedAt?: Date | null;
  } = {},
): Promise<string> {
  const { id } = await prisma.product.create({
    data: {
      name,
      nameNormalized: normalizeProductName(name),
      type: options.type ?? PRODUCT_TYPES.PRODUCT,
      unitId: options.unitId ?? null,
      recipeId: options.recipeId ?? null,
      presentationId: options.presentationId ?? null,
      companyId: empresa.companyId,
      createdAt: options.createdAt ?? new Date(),
      deletedAt: options.deletedAt ?? null,
    },
    select: { id: true },
  });
  return id;
}

export async function sembrarLote(empresa: Empresa, productId: string, lot: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId: null,
      stock: '1',
      unitCost: '1',
      lot,
      purchaseDate: new Date('2026-01-01T00:00:00Z'),
      companyId: empresa.companyId,
      createdBy: empresa.userId,
      updatedBy: empresa.userId,
    },
    select: { id: true },
  });
  return id;
}
