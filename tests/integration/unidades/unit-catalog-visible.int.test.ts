/**
 * `listVisibleUnitRefs` contra Postgres real: las unidades que ve una empresa son las suyas y las
 * de sistema, ordenadas por nombre, y ninguna de otra empresa.
 *
 * AISLAMIENTO: el adaptador usa el cliente Prisma GLOBAL, asi que lo sembrado queda confirmado y
 * se borra en un `finally`. Las unidades de sistema no se tocan: solo se leen.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { listVisibleUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function sembrarEmpresa(): Promise<string> {
  const nombre = `Empresa unidades ${token()}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  return company.id;
}

async function sembrarUnidad(companyId: string, nombre: string): Promise<string> {
  const unit = await prisma.unit.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, ''), symbol: null, companyId },
    select: { id: true },
  });
  return unit.id;
}

describe('UnitCatalog.listVisibleRefs', () => {
  it('R20 listVisibleRefs devuelve las unidades de la empresa y las de sistema, incluida unidad, y ninguna de otra empresa', async () => {
    const empresa = await sembrarEmpresa();
    const otra = await sembrarEmpresa();
    const marca = token();
    const propias: string[] = [];
    const ajenas: string[] = [];
    try {
      // Sufijos ASCII en minuscula: el orden de Postgres y el de JavaScript no pueden discrepar.
      propias.push(await sembrarUnidad(empresa, `saco ${marca} 02`));
      propias.push(await sembrarUnidad(empresa, `saco ${marca} 01`));
      ajenas.push(await sembrarUnidad(otra, `tambor ${marca}`));

      const visibles = await listVisibleUnitRefs(empresa);
      const ids = visibles.map((unidad) => unidad.id);

      const deSistema = await prisma.unit.findMany({ where: { companyId: null }, select: { id: true } });
      expect(deSistema.length).toBeGreaterThan(0);
      expect(new Set(ids)).toEqual(new Set([...deSistema.map((unidad) => unidad.id), ...propias]));
      expect(ids).not.toContain(ajenas[0]);

      const unidad = visibles.find((ref) => ref.symbol === 'u' && ref.name === 'unidad');
      expect(unidad).toMatchObject({ baseUnitId: null, factor: null });

      // Por nombre: la sembrada en segundo lugar sale primero.
      expect(ids.filter((id) => propias.includes(id))).toEqual([propias[1], propias[0]]);
    } finally {
      await prisma.unit.deleteMany({ where: { id: { in: [...propias, ...ajenas] } } });
      await prisma.company.deleteMany({ where: { id: { in: [empresa, otra] } } });
    }
  });
});
