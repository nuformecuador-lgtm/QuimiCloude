/**
 * El listado de productos como selector de envases del reparto, contra Postgres real: el filtro
 * `presentationUnitId`, los cuatro campos de la presentacion fija y el disponible.
 *
 * AISLAMIENTO: commit. `listAliveProducts` y `createWithFirstBatch` usan el cliente Prisma global.
 * El caso fabrica su empresa efimera y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import {
  createWithFirstBatch,
  listAliveProducts,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { findPackageUnitId } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function systemUnit(nameNormalized: string): Promise<string> {
  return (await prisma.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized } })).id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-195 — el listado de productos sirve al selector de envases', () => {
  it('R8, R9, R10 — con type=PACKAGING y presentationUnitId={ml, l} salen solo los envases en ml/l con contenido, con su presentacion y su disponible', async () => {
    const marker = `envsel${token().slice(0, 10)}`;
    const documentType = await prisma.documentType.create({
      data: { code: `DOC${marker.slice(-8)}`, name: 'Tipo de documento de prueba' },
      select: { code: true },
    });
    const role = await prisma.role.create({ data: { name: `rol-${marker}`, description: 'Rol de prueba' }, select: { id: true } });
    const companyName = `Empresa ${marker}`;
    const company = await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    });
    const companyId = company.id;
    const scope = { companyId };

    try {
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
          companyId,
        },
        select: { id: true },
      });
      const [ml, l, gr, kg] = await Promise.all(['mililitro', 'litro', 'gramo', 'kilogramo'].map(systemUnit));
      const u = await findPackageUnitId();
      if (u === null || ml === undefined || l === undefined || gr === undefined || kg === undefined) {
        throw new Error('faltan unidades de sistema');
      }

      const presentation = async (unitId: string, content: string | null, label: string) => {
        const name = `${label} ${marker}`;
        return (
          await prisma.presentation.create({
            data: { name, nameNormalized: name.toLowerCase(), unitId, companyId, content },
            select: { id: true },
          })
        ).id;
      };
      const p500 = await presentation(ml, '500', 'Botella 500');
      const p1l = await presentation(l, '1', 'Botella 1 L');
      const p5kg = await presentation(kg, '5', 'Saco 5 kg');
      const p250g = await presentation(gr, '250', 'Bolsa 250 g');
      const pSinContenido = await presentation(ml, null, 'Botella sin contenido');

      const lote = (presentationId: string | null, stock: string): NewProductBatch => ({
        presentationId,
        stock,
        unitCost: '0.5000',
        lot: null,
        purchaseDate: '2026-09-01',
        expiryDate: null,
        createdBy: user.id,
      });
      const envase = (name: string, presentationId: string, stock = '10') =>
        createWithFirstBatch(
          { name: `${name} ${marker}`, qtyAlert: '0', type: PRODUCT_TYPES.PACKAGING },
          lote(null, stock),
          new Date(),
          scope,
          { presentationId, unitId: u },
        );

      const botella500 = await envase('Botella PET 500 ml', p500, '150');
      const botella1l = await envase('Botella PET 1 L', p1l);
      await envase('Saco 5 kg', p5kg);
      await envase('Bolsa 250 g', p250g);
      await envase('Botella sin contenido', pSinContenido);
      const agotada = await envase('Botella agotada', p500, '10');
      await createWithFirstBatch(
        { name: `Bidon legado ${marker}`, qtyAlert: '0', type: PRODUCT_TYPES.PACKAGING },
        lote(p500, '10'),
        new Date(),
        scope,
      );
      await createWithFirstBatch(
        { name: `Alcohol ${marker}`, qtyAlert: '0', type: PRODUCT_TYPES.PRODUCT },
        lote(p500, '10'),
        new Date(),
        scope,
      );

      const recipe = await prisma.recipe.create({
        data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}`, companyId },
        select: { id: true },
      });
      const reserve = async (productId: string, quantity: string) => {
        const order = await prisma.order.create({
          data: {
            companyId,
            orderYear: new Date().getUTCFullYear(),
            orderSequence: 980_000 + Math.floor(Math.random() * 10_000),
            recipeId: recipe.id,
            quantity: new Prisma.Decimal('1'),
          },
          select: { id: true },
        });
        await createMaterialReservations(prisma).syncForOrder({
          orderId: order.id,
          companyId,
          requirement: [{ productId, quantity }],
          actorId: user.id,
          now: new Date(),
        });
      };
      await reserve(botella500.id, '30');
      await reserve(agotada.id, '10');

      const query: ListQuery = {
        page: 1,
        pageSize: MAX_PAGE_SIZE,
        sort: null,
        search: marker,
        filters: {
          type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
          presentationUnitId: { kind: 'select', values: [ml, l] },
        },
      };
      const page = await listAliveProducts(query, scope);

      const byId = new Map(page.items.map((item) => [item.id, item]));
      expect(new Set(byId.keys())).toEqual(new Set([botella500.id, botella1l.id, agotada.id]));
      expect(page.total).toBe(3);
      expect(byId.get(botella500.id)).toEqual(
        expect.objectContaining({
          presentationId: p500,
          presentationName: `Botella 500 ${marker}`,
          presentationContent: '500.0000',
          presentationUnitId: ml,
          stock: '150.0000',
          unitId: u,
          available: '120.0000',
        }),
      );
      expect(byId.get(botella1l.id)).toEqual(
        expect.objectContaining({ presentationId: p1l, presentationContent: '1.0000', presentationUnitId: l, available: '10.0000' }),
      );
      expect(byId.get(agotada.id)?.available).toBe('0.0000');

      // Sin el filtro, el envase legado sale sin presentacion fija.
      const all = await listAliveProducts({ ...query, filters: { type: query.filters.type! } }, scope);
      const legado = all.items.find((item) => item.name.startsWith('Bidon legado'));
      expect(legado).toEqual(
        expect.objectContaining({ presentationId: null, presentationName: null, presentationContent: null, presentationUnitId: null }),
      );
    } finally {
      await prisma.reservationMovement.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.order.deleteMany({ where: { companyId } });
      await prisma.productBatch.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.presentation.deleteMany({ where: { companyId } });
      await prisma.recipe.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
      await prisma.role.delete({ where: { id: role.id } });
      await prisma.documentType.delete({ where: { code: documentType.code } });
    }
  });
});
