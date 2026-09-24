/**
 * `findPresentationsByNormalizedNames` usa el cliente Prisma GLOBAL (mismo criterio que
 * `findPresentationRefs`, `tests/integration/inventario/company-scope-queries.int.test.ts`), asi
 * que una transaccion del test que termine en ROLLBACK no lo envolveria. Cada caso siembra su
 * propia empresa efimera con `randomUUID` y se limpia en `afterAll` por su id.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { findPresentationsByNormalizedNames } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Empresa = {
  readonly companyId: string;
};

const empresas: Empresa[] = [];
let unidadDeSistema: string;

async function crearEmpresa(): Promise<Empresa> {
  const marker = token();
  const nombre = `Empresa ${marker}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const empresa: Empresa = { companyId: company.id };
  empresas.push(empresa);
  return empresa;
}

async function crearPresentacion(empresa: Empresa, name: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name,
      nameNormalized: normalizePresentationName(name),
      unitId: unidadDeSistema,
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  return id;
}

beforeAll(async () => {
  const marker = token();
  const nombreUnidad = `unidad ${marker}`;
  const unit = await prisma.unit.create({
    data: { name: nombreUnidad, nameNormalized: nombreUnidad, symbol: nombreUnidad },
    select: { id: true },
  });
  unidadDeSistema = unit.id;
});

afterAll(async () => {
  for (const empresa of empresas) {
    await prisma.presentation.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  if (unidadDeSistema) await prisma.unit.deleteMany({ where: { id: unidadDeSistema } });
  await prisma.$disconnect();
});

describe('R34 — findByNormalizedNames devuelve solo las presentaciones de la empresa del actor', () => {
  it('con lista vacia no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findPresentationsByNormalizedNames([], randomUUID());

    expect(refs).toEqual([]);
  });

  it('devuelve las presentaciones propias por name_normalized e ignora las de otra empresa', async () => {
    const marker = token();
    const nombreCompartido = `Bidon compartido ${marker}`;
    const nombreSoloA = `Tambor exclusivo de A ${marker}`;
    const nombreDeB = `Bidon de B ${marker}`;

    const A = await crearEmpresa();
    const B = await crearEmpresa();

    const compartidaEnA = await crearPresentacion(A, nombreCompartido);
    const soloEnA = await crearPresentacion(A, nombreSoloA);
    const compartidaEnB = await crearPresentacion(B, nombreCompartido);
    await crearPresentacion(B, nombreDeB);

    const nombresPedidos = [
      normalizePresentationName(nombreCompartido),
      normalizePresentationName(nombreSoloA),
      normalizePresentationName(nombreDeB),
    ];

    const refs = await findPresentationsByNormalizedNames(nombresPedidos, A.companyId);

    expect(refs.map((ref) => ref.id).sort()).toEqual([compartidaEnA, soloEnA].sort());
    expect(refs.every((ref) => ref.id !== compartidaEnB)).toBe(true);
    const enA = refs.find((ref) => ref.id === compartidaEnA);
    expect(enA).toEqual({
      id: compartidaEnA,
      name: nombreCompartido,
      nameNormalized: normalizePresentationName(nombreCompartido),
      unitId: unidadDeSistema,
    });

    // Control positivo: el mismo nombre compartido, pedido con la empresa de B, si vuelve el de B.
    const desdeB = await findPresentationsByNormalizedNames(
      [normalizePresentationName(nombreCompartido)],
      B.companyId,
    );
    expect(desdeB.map((ref) => ref.id)).toEqual([compartidaEnB]);
  });

  it('un nombre normalizado inexistente y uno de otra empresa se resuelven igual: ninguno vuelve', async () => {
    const marker = token();
    const A = await crearEmpresa();
    const B = await crearEmpresa();
    const nombreDeB = `Nombre exclusivo de B ${marker}`;
    await crearPresentacion(B, nombreDeB);

    const refs = await findPresentationsByNormalizedNames(
      [normalizePresentationName(`inexistente ${marker}`), normalizePresentationName(nombreDeB)],
      A.companyId,
    );

    expect(refs).toEqual([]);
  });
});
