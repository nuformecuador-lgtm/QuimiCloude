/**
 * La vista de catalogo visual de proveedores contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor aplico el `some` de lineas, el
 * orden y el filtro sobre el conjunto completo antes de recortar la tanda. Solo Postgres puede
 * demostrar que encadenar la tanda inicial, la siguiente tanda de proveedores y «cargar mas» de
 * una fila da el prefijo exacto del listado completo, sin huecos ni repetidos.
 *
 * AISLAMIENTO: `listShowcaseAliveSuppliers` llama al cliente Prisma GLOBAL, no a un `tx`
 * inyectado, asi que una transaccion que se deshace NO lo envuelve. Se crean dos empresas
 * efimeras (con sus proveedores, lineas, presentacion y unidad) y se borran por su id exacto en
 * el `afterAll`, en el orden que exigen las claves foraneas.
 *
 * NINGUNA AFIRMACION GLOBAL: cada empresa es efimera (`randomUUID`), asi que una base con mas
 * proveedores cargados de otras corridas no puede volver rojo este archivo.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { proveedores } from '@/lib/composition';
import { SupplierNotFoundError } from '@/lib/modules/proveedores';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { ShowcaseRow } from '@/lib/modules/proveedores/domain/supplier-showcase';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let companyA: string;
let companyB: string;
let presentationA: string;
let actorA: Actor;

const suppliersCreated: string[] = [];
const linesCreated: string[] = [];

async function unidadDeSistema(): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function crearEmpresa(nombre: string): Promise<string> {
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  return company.id;
}

async function crearPresentacion(companyId: string): Promise<string> {
  const name = `Presentacion showcase ${token()}`;
  const presentation = await prisma.presentation.create({
    data: {
      name,
      nameNormalized: name.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId: await unidadDeSistema(),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

async function crearProveedor(
  companyId: string,
  name: string,
  opts: { readonly deletedAt?: Date } = {},
): Promise<string> {
  const supplier = await prisma.supplier.create({
    data: {
      name,
      nameNormalized: normalizeSupplierName(name),
      phone: '+57 300 000 0000',
      companyId,
      deletedAt: opts.deletedAt ?? null,
    },
    select: { id: true },
  });
  suppliersCreated.push(supplier.id);
  return supplier.id;
}

async function crearLinea(
  supplierId: string,
  companyId: string,
  presentationId: string,
  name: string,
  opts: { readonly imagePath?: string | null; readonly deletedAt?: Date } = {},
): Promise<string> {
  const line = await prisma.supplierCatalogLine.create({
    data: {
      supplierId,
      companyId,
      name,
      nameNormalized: normalizeSupplierName(name),
      presentationId,
      cost: new Prisma.Decimal('10.0000'),
      imagePath: opts.imagePath === undefined ? null : opts.imagePath,
      deletedAt: opts.deletedAt ?? null,
    },
    select: { id: true },
  });
  linesCreated.push(line.id);
  return line.id;
}

/** Los ids de proveedores de las suplencias de este archivo, por nombre. */
const suppliers: Record<string, string> = {};

beforeAll(async () => {
  companyA = await crearEmpresa(`Empresa showcase A ${token()}`);
  companyB = await crearEmpresa(`Empresa showcase B ${token()}`);
  presentationA = await crearPresentacion(companyA);
  actorA = { id: 'actor-showcase', companyId: companyA, permissions: ['proveedores.consultar'] };

  // Ocho proveedores VIVOS de la empresa A, en orden alfabetico estable (nombres con el numero
  // cero-rellenado: la comparacion de texto coincide con el orden numerico).
  suppliers['01'] = await crearProveedor(companyA, 'Proveedor 01');
  suppliers['02'] = await crearProveedor(companyA, 'Proveedor 02');
  suppliers['03'] = await crearProveedor(companyA, 'Proveedor 03');
  suppliers['04'] = await crearProveedor(companyA, 'Proveedor 04');
  // '05' se siembra MAS ABAJO, dado de baja: no cuenta entre los ocho vivos.
  suppliers['06'] = await crearProveedor(companyA, 'Proveedor 06');
  suppliers['07'] = await crearProveedor(companyA, 'Proveedor 07');
  suppliers['08'] = await crearProveedor(companyA, 'Proveedor 08');
  suppliers['09'] = await crearProveedor(companyA, 'Proveedor 09 Especial');

  // Proveedor 01: dos lineas vivas, una con imagen y otra sin ella (imagePath null).
  await crearLinea(suppliers['01']!, companyA, presentationA, 'Linea 01', {
    imagePath: '/catalogo/linea-01.png',
  });
  await crearLinea(suppliers['01']!, companyA, presentationA, 'Linea 02', { imagePath: null });

  // Proveedor 02: una linea con acentos y mayusculas que el filtro de producto tiene que
  // encontrar, y otra que no coincide y que el filtro tiene que dejar fuera del carrusel.
  await crearLinea(suppliers['02']!, companyA, presentationA, 'Ácido Cítrico Anhidro', {
    imagePath: '',
  });
  await crearLinea(suppliers['02']!, companyA, presentationA, 'Cloro granulado');

  // Proveedor 03: VIVO, sin ninguna linea.

  // Proveedor 04: una linea viva y una dada de baja: solo la viva sale en el carrusel.
  await crearLinea(suppliers['04']!, companyA, presentationA, 'Sosa caustica');
  const lineaBajaDe04 = await crearLinea(suppliers['04']!, companyA, presentationA, 'Retirada 04');
  await prisma.supplierCatalogLine.update({
    where: { id: lineaBajaDe04 },
    data: { deletedAt: new Date() },
  });

  // Proveedor 05: DADO DE BAJA, con una linea viva: no debe aparecer en ninguna tanda.
  suppliers['05'] = await crearProveedor(companyA, 'Proveedor 05', { deletedAt: new Date() });
  await crearLinea(suppliers['05']!, companyA, presentationA, 'Linea de proveedor dado de baja');

  // Proveedor 06: una linea que tampoco coincide con el filtro de producto de este archivo.
  await crearLinea(suppliers['06']!, companyA, presentationA, 'Guantes de nitrilo');

  // Proveedor 07: MAS DE 11 lineas (23), para encadenar tanda + dos "cargar mas".
  for (let i = 1; i <= 23; i += 1) {
    await crearLinea(
      suppliers['07']!,
      companyA,
      presentationA,
      `Linea 07-${String(i).padStart(2, '0')}`,
    );
  }

  // Proveedor 08: otra linea que coincide con el filtro de producto, en MAYUSCULAS.
  await crearLinea(suppliers['08']!, companyA, presentationA, 'ACIDO SULFURICO');
  await crearLinea(suppliers['08']!, companyA, presentationA, 'Sosa en escamas');

  // Empresa B: un proveedor ajeno, sin lineas, solo para el caso de aislamiento.
  suppliers['ajeno'] = await crearProveedor(companyB, 'Proveedor ajeno');
});

afterAll(async () => {
  if (linesCreated.length > 0) {
    await prisma.supplierCatalogLine.deleteMany({ where: { id: { in: linesCreated } } });
  }
  if (suppliersCreated.length > 0) {
    await prisma.supplier.deleteMany({ where: { id: { in: suppliersCreated } } });
  }
  await prisma.presentation.deleteMany({ where: { id: presentationA } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await prisma.$disconnect();
});

describe('proveedores ordenados alfabeticamente, sin huecos ni repetidos al encadenar tandas (R17, R31)', () => {
  it('tanda 1 trae los 5 primeros y tanda 2 el resto, sin solapar', async () => {
    const pagina1 = await proveedores.listSupplierShowcase({ page: 1 }, actorA);
    const pagina2 = await proveedores.listSupplierShowcase({ page: 2 }, actorA);

    expect(pagina1.items.map((row: ShowcaseRow) => row.id)).toEqual([
      suppliers['01'],
      suppliers['02'],
      suppliers['03'],
      suppliers['04'],
      suppliers['06'],
    ]);
    expect(pagina1.hasMore).toBe(true);

    expect(pagina2.items.map((row: ShowcaseRow) => row.id)).toEqual([
      suppliers['07'],
      suppliers['08'],
      suppliers['09'],
    ]);
    expect(pagina2.hasMore).toBe(false);

    const idsCombinados = [...pagina1.items, ...pagina2.items].map((row) => row.id);
    expect(new Set(idsCombinados).size).toBe(idsCombinados.length);
    expect(idsCombinados).toHaveLength(8);
  });
});

describe('un proveedor vivo sin lineas aparece con el carrusel vacio y cuenta en su tanda (R30)', () => {
  it('Proveedor 03 sale con lines: [] y hasMoreLines: false', async () => {
    const pagina1 = await proveedores.listSupplierShowcase({ page: 1 }, actorA);
    const fila = pagina1.items.find((row: ShowcaseRow) => row.id === suppliers['03']);

    expect(fila).toBeDefined();
    expect(fila?.lines).toEqual([]);
    expect(fila?.hasMoreLines).toBe(false);
  });
});

describe('el borrado logico se excluye en las dos capas (R27)', () => {
  it('el proveedor dado de baja no aparece en ninguna tanda', async () => {
    const pagina1 = await proveedores.listSupplierShowcase({ page: 1 }, actorA);
    const pagina2 = await proveedores.listSupplierShowcase({ page: 2 }, actorA);

    const ids = [...pagina1.items, ...pagina2.items].map((row) => row.id);
    expect(ids).not.toContain(suppliers['05']);
  });

  it('la linea dada de baja de un proveedor vivo no sale en su carrusel', async () => {
    const pagina1 = await proveedores.listSupplierShowcase({ page: 1 }, actorA);
    const fila = pagina1.items.find((row: ShowcaseRow) => row.id === suppliers['04']);

    expect(fila?.lines.map((line) => line.name)).toEqual(['Sosa caustica']);
  });
});

describe('el aislamiento por empresa: cargar mas sobre un proveedor ajeno responde igual que inexistente (R28)', () => {
  it('supplier_not_found, sin devolver ninguna linea', async () => {
    await expect(
      proveedores.listShowcaseLines(suppliers['ajeno']!, { page: 2 }, actorA),
    ).rejects.toBeInstanceOf(SupplierNotFoundError);
  });
});

describe('filtro de producto: solo los proveedores con una linea viva que coincide, y solo esas lineas (R19, R20, R21)', () => {
  it('buscar "acido" encuentra Proveedor 02 y Proveedor 08, cada uno con solo su linea que coincide', async () => {
    const pagina = await proveedores.listSupplierShowcase({ page: 1, productSearch: 'acido' }, actorA);

    const ids = pagina.items.map((row: ShowcaseRow) => row.id).sort();
    expect(ids).toEqual([suppliers['02'], suppliers['08']].sort());
    expect(pagina.hasMore).toBe(false);

    const fila02 = pagina.items.find((row: ShowcaseRow) => row.id === suppliers['02']);
    expect(fila02?.lines.map((line) => line.name)).toEqual(['Ácido Cítrico Anhidro']);

    const fila08 = pagina.items.find((row: ShowcaseRow) => row.id === suppliers['08']);
    expect(fila08?.lines.map((line) => line.name)).toEqual(['ACIDO SULFURICO']);
  });
});

describe('filtro de proveedor y de los dos filtros a la vez (R22, R23)', () => {
  it('supplierSearch encuentra solo el proveedor cuyo nombre coincide', async () => {
    const pagina = await proveedores.listSupplierShowcase(
      { page: 1, supplierSearch: 'especial' },
      actorA,
    );

    expect(pagina.items.map((row: ShowcaseRow) => row.id)).toEqual([suppliers['09']]);
  });

  it('con los dos filtros a la vez, solo pasa el proveedor que cumple los dos', async () => {
    const pagina = await proveedores.listSupplierShowcase(
      { page: 1, supplierSearch: '02', productSearch: 'acido' },
      actorA,
    );

    expect(pagina.items.map((row: ShowcaseRow) => row.id)).toEqual([suppliers['02']]);
  });
});

describe('un filtro de solo espacios cuenta como ausente (R24)', () => {
  it('supplierSearch y productSearch en blanco dan la misma tanda que sin filtro', async () => {
    const sinFiltro = await proveedores.listSupplierShowcase({ page: 1 }, actorA);
    const conEspacios = await proveedores.listSupplierShowcase(
      { page: 1, supplierSearch: '   ', productSearch: '\t' },
      actorA,
    );

    expect(conEspacios.items.map((row: ShowcaseRow) => row.id)).toEqual(
      sinFiltro.items.map((row: ShowcaseRow) => row.id),
    );
  });
});

describe('«cargar mas» encadenado: mismo orden y filtro que la primera tanda, sin huecos ni repetidos (R17, R31)', () => {
  it('las 23 lineas de Proveedor 07 se recorren enteras en tres tandas sin solapar', async () => {
    const pagina2 = await proveedores.listSupplierShowcase({ page: 2 }, actorA);
    const filaInicial = pagina2.items.find((row: ShowcaseRow) => row.id === suppliers['07']);
    expect(filaInicial?.lines).toHaveLength(10);
    expect(filaInicial?.hasMoreLines).toBe(true);
    expect(filaInicial?.lines.map((line) => line.name)).toEqual(
      Array.from({ length: 10 }, (_unused, i) => `Linea 07-${String(i + 1).padStart(2, '0')}`),
    );

    const cargarMas2 = await proveedores.listShowcaseLines(suppliers['07']!, { page: 2 }, actorA);
    expect(cargarMas2.items).toHaveLength(10);
    expect(cargarMas2.hasMore).toBe(true);
    expect(cargarMas2.items.map((line) => line.name)).toEqual(
      Array.from({ length: 10 }, (_unused, i) => `Linea 07-${String(i + 11).padStart(2, '0')}`),
    );

    const cargarMas3 = await proveedores.listShowcaseLines(suppliers['07']!, { page: 3 }, actorA);
    expect(cargarMas3.items).toHaveLength(3);
    expect(cargarMas3.hasMore).toBe(false);
    expect(cargarMas3.items.map((line) => line.name)).toEqual(['Linea 07-21', 'Linea 07-22', 'Linea 07-23']);

    const todas = [...filaInicial!.lines, ...cargarMas2.items, ...cargarMas3.items].map(
      (line) => line.name,
    );
    expect(new Set(todas).size).toBe(23);
    expect(todas).toEqual(
      Array.from({ length: 23 }, (_unused, i) => `Linea 07-${String(i + 1).padStart(2, '0')}`),
    );
  });
});
