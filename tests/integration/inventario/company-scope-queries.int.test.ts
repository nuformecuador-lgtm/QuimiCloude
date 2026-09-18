/**
 * Contra Postgres real: un doble diria que llego el ambito aunque el adaptador lo compusiera al
 * nivel del `OR` de la busqueda. El adaptador usa el cliente Prisma global, asi que no hay rollback
 * que lo aisle: las filas se borran por id en `afterAll`. Las dos empresas nacen aqui, y por eso
 * `total` se afirma como igualdad.
 *
 * Un `false` o `'not_found'` no prueba que no se escribiera: la fila ajena se relee, y cada
 * escritura cruzada lleva su control positivo para que un adaptador que nunca escribe no pase.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName, normalizeProductName } from '@/lib/modules/inventario';
import {
  addBatchToAlive,
  createProduct,
  createWithFirstBatch,
  findAliveIdByName,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  createPresentation,
  deletePresentationById,
  listPresentations,
  replacePresentation,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/**
 * Alfanumerico en minusculas para sobrevivir a la normalizacion. Lo llevan las filas de las dos
 * empresas: si el ambito no acotara, buscarlo desde A traeria tambien las de B.
 */
const MARCA = `m${token().slice(0, 12)}`;

const SOLO_B = `b${token().slice(0, 12)}`;

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

const AHORA = new Date('2026-09-11T10:00:00.000Z');

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** En orden de creacion: los casos los toman por indice. */
  readonly productos: string[];
  readonly presentaciones: string[];
  readonly lotes: string[];
};

/** De sistema, para que `presentations_check_unit_scope` la acepte en las dos empresas. Se crea
 *  aqui para no depender de lo que haya en la base. */
let unidadDeSistema: string;

let A: Empresa;
let B: Empresa;

function ambitoDe(empresa: Empresa): InventoryScope {
  return { companyId: empresa.companyId };
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marker = token();
  const nombre = `Empresa ${etiqueta} ${marker}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
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
  // `product_batches.created_by` es FK real a `users`, aunque el esquema Prisma la declare escalar.
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
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    productos: [],
    presentaciones: [],
    lotes: [],
  };
}

async function sembrarProducto(
  empresa: Empresa,
  name: string,
  extras: { readonly qtyAlert?: number | null } = {},
): Promise<string> {
  const { id } = await prisma.product.create({
    data: {
      name,
      nameNormalized: normalizeProductName(name),
      qtyAlert: extras.qtyAlert ?? null,
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  empresa.productos.push(id);
  return id;
}

async function sembrarPresentacion(empresa: Empresa, name: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name,
      nameNormalized: normalizePresentationName(name),
      unitId: unidadDeSistema,
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  empresa.presentaciones.push(id);
  return id;
}

async function sembrarLote(
  empresa: Empresa,
  productId: string,
  presentationId: string,
): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: 7,
      unitCost: '3.0000',
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      createdBy: empresa.userId,
      updatedBy: empresa.userId,
      // El disparador exige que coincida con la empresa de su producto y su presentacion.
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  empresa.lotes.push(id);
  return id;
}

function loteNuevo(empresa: Empresa, presentationId: string): NewProductBatch {
  return {
    presentationId,
    stock: 2,
    unitCost: '1.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: empresa.userId,
  };
}

beforeAll(async () => {
  const nombreUnidad = `unidad ${MARCA}`;
  const unit = await prisma.unit.create({
    data: { name: nombreUnidad, nameNormalized: normalizeForTest(nombreUnidad), symbol: nombreUnidad },
    select: { id: true },
  });
  unidadDeSistema = unit.id;

  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');

  // Recuentos distintos en A y B para que un `total` con filas ajenas no coincida por casualidad.
  await sembrarProducto(A, `${MARCA} Producto A uno`, { qtyAlert: 1 });
  await sembrarProducto(A, `${MARCA} Producto A dos`, { qtyAlert: 2 });
  await sembrarProducto(A, `${MARCA} Producto A tres`, { qtyAlert: 3 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B uno`, { qtyAlert: 91 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B dos`, { qtyAlert: 92 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B tres`, { qtyAlert: 93 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B cuatro`, { qtyAlert: 94 });

  // Un borrado en A, para comprobar que el ambito no sustituye a `deleted_at IS NULL`.
  const borrado = await sembrarProducto(A, `${MARCA} Producto A borrado`);
  await prisma.product.update({ where: { id: borrado }, data: { deletedAt: AHORA } });

  // La primera de cada empresa comparte nombre normalizado, que la unicidad por empresa permite,
  // para comprobar que el listado de A no ve la homonima de B.
  await sembrarPresentacion(A, `${MARCA} Bidon compartido`);
  await sembrarPresentacion(A, `${MARCA} Bidon A dos`);
  await sembrarPresentacion(B, `${MARCA} Bidon compartido`);
  await sembrarPresentacion(B, `${MARCA} ${SOLO_B} Bidon B dos`);
  await sembrarPresentacion(B, `${MARCA} ${SOLO_B} Bidon B tres`);

  await sembrarLote(A, A.productos[0] ?? '', A.presentaciones[0] ?? '');
  await sembrarLote(B, B.productos[0] ?? '', B.presentaciones[0] ?? '');
});

afterAll(async () => {
  // En el orden que exigen las FK.
  const empresas = [A, B].filter((empresa): empresa is Empresa => empresa !== undefined);
  for (const empresa of empresas) {
    await prisma.inventoryMovement.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.productBatch.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.product.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.presentation.deleteMany({ where: { companyId: empresa.companyId } });
  }
  await prisma.unit.deleteMany({ where: { id: unidadDeSistema } });
  for (const empresa of empresas) {
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

/** Todas las columnas: comparar solo el nombre dejaria pasar un `updated_at` movido. */
async function fotoProducto(id: string): Promise<string> {
  const fila = await prisma.product.findUniqueOrThrow({ where: { id } });
  return JSON.stringify(fila);
}

async function fotoPresentacion(id: string): Promise<string> {
  const fila = await prisma.presentation.findUniqueOrThrow({ where: { id } });
  return JSON.stringify(fila);
}

/** De la columna, porque el contrato de salida no publica la empresa. */
async function empresaDelProducto(id: string): Promise<string> {
  const fila = await prisma.product.findUniqueOrThrow({
    where: { id },
    select: { companyId: true },
  });
  return fila.companyId;
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, pageSize: 25, sort: null, filters: {}, search: MARCA, ...partial };
}

describe('R14 — el listado devuelve EXACTAMENTE las filas de su empresa, y el total tambien', () => {
  it('productos: A ve sus tres y ninguna de las cuatro de B', async () => {
    const pagina = await listAliveProducts(consulta(), ambitoDe(A));

    expect([...pagina.items.map((p) => p.id)].sort()).toEqual([...A.productos.slice(0, 3)].sort());
    // Si el `count` usara otro `where` que el `findMany`, aqui saldrian 7 u 8 con tres elementos.
    expect(pagina.total).toBe(3);
    expect(pagina.totalPages).toBe(1);

    for (const ajeno of B.productos) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }
  });

  it('productos: B ve sus cuatro y ninguna de las de A', async () => {
    // Atrapa un adaptador que devolviera siempre las filas de la primera empresa sembrada.
    const pagina = await listAliveProducts(consulta(), ambitoDe(B));

    expect([...pagina.items.map((p) => p.id)].sort()).toEqual([...B.productos].sort());
    expect(pagina.total).toBe(4);
    for (const ajeno of A.productos) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }
  });

  it('presentaciones: A ve sus dos —incluida la homonima— y ninguna de las tres de B', async () => {
    const pagina = await listPresentations(consulta(), ambitoDe(A));

    expect([...pagina.items.map((p) => p.id)].sort()).toEqual([...A.presentaciones].sort());
    expect(pagina.total).toBe(2);
    for (const ajeno of B.presentaciones) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }

    const normalizado = normalizePresentationName(`${MARCA} Bidon compartido`);
    const enA = pagina.items.filter((p) => p.nameNormalized === normalizado);
    expect(enA).toHaveLength(1);
    expect(enA[0]?.id).toBe(A.presentaciones[0]);
  });

  it('presentaciones: B ve sus tres, con su propia homonima', async () => {
    const pagina = await listPresentations(consulta(), ambitoDe(B));

    expect([...pagina.items.map((p) => p.id)].sort()).toEqual([...B.presentaciones].sort());
    expect(pagina.total).toBe(3);
  });

  it('el producto con borrado logico de A no aparece: el ambito no sustituye a deleted_at', async () => {
    const pagina = await listAliveProducts(consulta(), ambitoDe(A));
    expect(A.productos).toHaveLength(4);
    expect(pagina.items.map((p) => p.id)).not.toContain(A.productos[3]);
    expect(pagina.total).toBe(3);
  });

  it('R19: ni la vista de producto ni la de presentacion publican la empresa', async () => {
    // Sobre las claves y no sobre el JSON: un `companyId: undefined` no viajaria serializado pero
    // estaria en el contrato.
    const productos = await listAliveProducts(consulta(), ambitoDe(A));
    const presentaciones = await listPresentations(consulta(), ambitoDe(A));

    expect(productos.items.length).toBeGreaterThan(0);
    expect(presentaciones.items.length).toBeGreaterThan(0);
    for (const item of productos.items) {
      expect(Object.keys(item)).not.toContain('companyId');
    }
    for (const item of presentaciones.items) {
      expect(Object.keys(item)).not.toContain('companyId');
    }

    const ficha = await findAliveProductById(A.productos[0] ?? '', ambitoDe(A));
    expect(ficha).not.toBeNull();
    expect(Object.keys(ficha ?? {})).not.toContain('companyId');
  });
});

describe('R14 — la busqueda y los filtros NO ensanchan lo visible', () => {
  it('productos: buscar el marcador que SOLO llevan las filas de B, desde A, no devuelve nada', async () => {
    // Si `companyId` y la busqueda fueran hermanos dentro de un `OR`, la fila de B entraria por
    // cumplir la busqueda.
    const pagina = await listAliveProducts(consulta({ search: SOLO_B }), ambitoDe(A));

    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);

    // Sin este control, una busqueda rota que devolviera siempre cero dejaria verde lo de arriba.
    const desdeB = await listAliveProducts(consulta({ search: SOLO_B }), ambitoDe(B));
    expect(desdeB.total).toBe(4);
  });

  it('presentaciones: el marcador de B, buscado desde A, tampoco devuelve nada', async () => {
    const desdeA = await listPresentations(consulta({ search: SOLO_B }), ambitoDe(A));
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    const desdeB = await listPresentations(consulta({ search: SOLO_B }), ambitoDe(B));
    expect(desdeB.total).toBe(2);
  });

  it('productos: un filtro numerico que solo casa con filas de B devuelve cero desde A', async () => {
    // Los `qtyAlert` de B (91..94) no se solapan con los de A (1..3).
    const desdeA = await listAliveProducts(
      consulta({ filters: { qtyAlert: { kind: 'numberRange', min: 90, max: 99 } } }),
      ambitoDe(A),
    );
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    const desdeB = await listAliveProducts(
      consulta({ filters: { qtyAlert: { kind: 'numberRange', min: 90, max: 99 } } }),
      ambitoDe(B),
    );
    expect(desdeB.total).toBe(4);
  });

  it('presentaciones: un filtro de texto sobre el nombre de B devuelve cero desde A', async () => {
    const desdeA = await listPresentations(
      consulta({ filters: { name: { kind: 'text', value: SOLO_B } } }),
      ambitoDe(A),
    );
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    const desdeB = await listPresentations(
      consulta({ filters: { name: { kind: 'text', value: SOLO_B } } }),
      ambitoDe(B),
    );
    expect(desdeB.total).toBe(2);
  });

  it('el orden inverso tampoco cuela filas ajenas: ordenar no es ensanchar', async () => {
    // Si el ambito se aplicara despues de paginar, aqui entraria la fila de B que gana el orden.
    const pagina = await listAliveProducts(
      consulta({ pageSize: 2, sort: { columnId: 'qtyAlert', direction: 'desc' } }),
      ambitoDe(A),
    );

    expect(pagina.total).toBe(3);
    expect(pagina.items.map((p) => p.qtyAlert)).toEqual([3, 2]);
    for (const ajeno of B.productos) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }
  });

  it('findAliveIdByName no resuelve el homonimo de otra empresa (R18 por el lado del SQL)', async () => {
    // Por eso el alta desde A crea un producto nuevo en vez de colgar el lote al de B.
    const nombreDeB = `${MARCA} ${SOLO_B} Producto B uno`;
    expect(await findAliveIdByName(nombreDeB, ambitoDe(A))).toBeNull();
    expect(await findAliveIdByName(nombreDeB, ambitoDe(B))).toBe(B.productos[0]);
  });
});

describe('R16 — updateAlive / softDeleteAlive / deleteById con un id AJENO', () => {
  it('la ficha de un producto de B, pedida desde A, es `null`', async () => {
    expect(await findAliveProductById(B.productos[1] ?? '', ambitoDe(A))).toBeNull();
    const propia = await findAliveProductById(B.productos[1] ?? '', ambitoDe(B));
    expect(propia?.id).toBe(B.productos[1]);
  });

  it('updateAlive de un producto de B desde A devuelve false y NO toca la fila', async () => {
    const ajeno = B.productos[1] ?? '';
    const antes = await fotoProducto(ajeno);

    const resultado = await updateAliveProduct(
      ajeno,
      { name: 'Nombre inyectado desde A', qtyAlert: 1 },
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe(false);
    expect(await fotoProducto(ajeno)).toBe(antes);
  });

  it('control positivo: el mismo updateAlive, desde B, SI escribe', async () => {
    // Sin este caso, un `updateMany` que nunca actualizara dejaria verde el anterior.
    const propio = B.productos[1] ?? '';
    const antes = await fotoProducto(propio);
    const nuevoNombre = `${MARCA} ${SOLO_B} Producto B dos editado`;

    const resultado = await updateAliveProduct(
      propio,
      { name: nuevoNombre, qtyAlert: 92 },
      new Date(),
      ambitoDe(B),
    );

    expect(resultado).toBe(true);
    expect(await fotoProducto(propio)).not.toBe(antes);
    const fila = await prisma.product.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.name).toBe(nuevoNombre);
    expect(fila.companyId).toBe(B.companyId);
  });

  it('softDeleteAlive de un producto de B desde A devuelve false y NO le marca deleted_at', async () => {
    const ajeno = B.productos[2] ?? '';
    const antes = await fotoProducto(ajeno);

    const resultado = await softDeleteAliveProduct(ajeno, new Date(), ambitoDe(A));

    expect(resultado).toBe(false);
    expect(await fotoProducto(ajeno)).toBe(antes);
    const fila = await prisma.product.findUniqueOrThrow({ where: { id: ajeno } });
    expect(fila.deletedAt).toBeNull();

    const desdeB = await listAliveProducts(consulta(), ambitoDe(B));
    expect(desdeB.items.map((p) => p.id)).toContain(ajeno);
  });

  it('control positivo: softDeleteAlive desde B SI marca la fila, y desaparece de su listado', async () => {
    const propio = B.productos[3] ?? '';

    const resultado = await softDeleteAliveProduct(propio, new Date(), ambitoDe(B));

    expect(resultado).toBe(true);
    const fila = await prisma.product.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.deletedAt).not.toBeNull();
    const desdeB = await listAliveProducts(consulta(), ambitoDe(B));
    expect(desdeB.items.map((p) => p.id)).not.toContain(propio);
    expect(desdeB.total).toBe(3);
  });

  it('addBatchToAlive sobre un producto de B desde A devuelve null y no escribe ningun lote', async () => {
    const ajeno = B.productos[0] ?? '';
    const lotesAntes = await prisma.productBatch.count({ where: { productId: ajeno } });

    const resultado = await addBatchToAlive(
      ajeno,
      loteNuevo(A, A.presentaciones[0] ?? ''),
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBeNull();
    expect(await prisma.productBatch.count({ where: { productId: ajeno } })).toBe(lotesAntes);
  });

  it('replace de una presentacion de B desde A devuelve not_found y NO toca la fila', async () => {
    const ajena = B.presentaciones[1] ?? '';
    const antes = await fotoPresentacion(ajena);
    const nombre = 'Bidon inyectado desde A';

    const resultado = await replacePresentation(
      ajena,
      { name: nombre, nameNormalized: normalizePresentationName(nombre), unitId: unidadDeSistema },
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(await fotoPresentacion(ajena)).toBe(antes);
  });

  it('control positivo: el mismo replace, desde B, devuelve ok y escribe', async () => {
    const propia = B.presentaciones[1] ?? '';
    const nombre = `${MARCA} ${SOLO_B} Bidon B dos editado`;

    const resultado = await replacePresentation(
      propia,
      { name: nombre, nameNormalized: normalizePresentationName(nombre), unitId: unidadDeSistema },
      ambitoDe(B),
    );

    expect(resultado).toBe('ok');
    const fila = await prisma.presentation.findUniqueOrThrow({ where: { id: propia } });
    expect(fila.name).toBe(nombre);
    expect(fila.companyId).toBe(B.companyId);
  });

  it('deleteById de una presentacion de B desde A devuelve not_found y la fila SIGUE AHI', async () => {
    // Sin lotes, para que `'not_found'` no se confunda con el `'in_use'` de la FK.
    const ajena = B.presentaciones[2] ?? '';
    expect(await prisma.productBatch.count({ where: { presentationId: ajena } })).toBe(0);
    const antes = await fotoPresentacion(ajena);

    const resultado = await deletePresentationById(ajena, ambitoDe(A));

    expect(resultado).toBe('not_found');
    expect(await prisma.presentation.count({ where: { id: ajena } })).toBe(1);
    expect(await fotoPresentacion(ajena)).toBe(antes);
  });

  it('control positivo: el mismo deleteById, desde B, borra de verdad', async () => {
    const propia = B.presentaciones[2] ?? '';

    const resultado = await deletePresentationById(propia, ambitoDe(B));

    expect(resultado).toBe('deleted');
    expect(await prisma.presentation.count({ where: { id: propia } })).toBe(0);
    B.presentaciones.splice(2, 1);
  });
});

describe('R17 — el alta escribe la empresa del AMBITO, no la de la entrada', () => {
  it('createProduct escribe la empresa del ambito en la columna', async () => {
    // `NewProduct` no declara empresa, asi que la entrada no puede elegirla: falta ver que se
    // escribe la correcta.
    const name = `${MARCA} Alta en A ${token().slice(0, 8)}`;
    const creado = await createProduct({ name, qtyAlert: 1 }, AHORA, ambitoDe(A));
    A.productos.push(creado.id);

    expect(await empresaDelProducto(creado.id)).toBe(A.companyId);
    const desdeA = await listAliveProducts(consulta({ search: name }), ambitoDe(A));
    expect(desdeA.items.map((p) => p.id)).toEqual([creado.id]);
    const desdeB = await listAliveProducts(consulta({ search: name }), ambitoDe(B));
    expect(desdeB.items).toEqual([]);
  });

  it('createWithFirstBatch escribe la MISMA empresa en el producto y en su lote', async () => {
    const name = `${MARCA} Alta con lote en A ${token().slice(0, 8)}`;
    const creado = await createWithFirstBatch(
      { name, qtyAlert: 1 },
      loteNuevo(A, A.presentaciones[0] ?? ''),
      AHORA,
      ambitoDe(A),
    );
    A.productos.push(creado.id);
    A.lotes.push(creado.batchId);

    expect(await empresaDelProducto(creado.id)).toBe(A.companyId);
    const lote = await prisma.productBatch.findUniqueOrThrow({
      where: { id: creado.batchId },
      select: { companyId: true, productId: true },
    });
    expect(lote.companyId).toBe(A.companyId);
    expect(lote.productId).toBe(creado.id);
  });

  it('addBatchToAlive escribe la empresa del ambito en el lote nuevo', async () => {
    const propio = A.productos[0] ?? '';
    const resultado = await addBatchToAlive(
      propio,
      loteNuevo(A, A.presentaciones[1] ?? ''),
      AHORA,
      ambitoDe(A),
    );

    expect(resultado).not.toBeNull();
    const batchId = resultado?.batchId ?? '';
    A.lotes.push(batchId);
    const lote = await prisma.productBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { companyId: true },
    });
    expect(lote.companyId).toBe(A.companyId);
  });

  it('createPresentation escribe la empresa del ambito, y el mismo nombre cabe en las dos', async () => {
    // Mismo nombre normalizado en las dos: con unicidad global la segunda seria `'duplicate'`.
    const name = `${MARCA} Bidon doble ${token().slice(0, 8)}`;
    const normalizado = normalizePresentationName(name);

    const enA = await createPresentation({ name, nameNormalized: normalizado, unitId: unidadDeSistema }, ambitoDe(A));
    const enB = await createPresentation({ name, nameNormalized: normalizado, unitId: unidadDeSistema }, ambitoDe(B));

    expect(enA).not.toBe('duplicate');
    expect(enB).not.toBe('duplicate');
    if (typeof enA === 'string' || typeof enB === 'string') throw new Error('el alta fallo');
    A.presentaciones.push(enA.id);
    B.presentaciones.push(enB.id);

    const filaA = await prisma.presentation.findUniqueOrThrow({ where: { id: enA.id } });
    const filaB = await prisma.presentation.findUniqueOrThrow({ where: { id: enB.id } });
    expect(filaA.companyId).toBe(A.companyId);
    expect(filaB.companyId).toBe(B.companyId);

    const vistaA = await listPresentations(consulta({ search: name }), ambitoDe(A));
    expect(vistaA.items.map((p) => p.id)).toEqual([enA.id]);
    const vistaB = await listPresentations(consulta({ search: name }), ambitoDe(B));
    expect(vistaB.items.map((p) => p.id)).toEqual([enB.id]);
  });
});

async function retrato(empresa: Empresa): Promise<string> {
  const productos = await listAliveProducts(consulta(), ambitoDe(empresa));
  const presentaciones = await listPresentations(consulta(), ambitoDe(empresa));
  const ajeno = empresa === A ? B : A;
  const fichaAjena = await findAliveProductById(ajeno.productos[0] ?? '', ambitoDe(empresa));
  const escrituraAjena = await updateAliveProduct(
    ajeno.productos[0] ?? '',
    { name: 'no deberia escribirse', qtyAlert: 0 },
    new Date(),
    ambitoDe(empresa),
  );
  return JSON.stringify({
    productos: [...productos.items.map((p) => p.id)].sort(),
    totalProductos: productos.total,
    presentaciones: [...presentaciones.items.map((p) => p.id)].sort(),
    totalPresentaciones: presentaciones.total,
    fichaAjena,
    escrituraAjena,
  });
}

const TABLAS_CON_RLS = ['products', 'presentations', 'product_batches'] as const;

async function forzarRls(forzar: boolean): Promise<void> {
  for (const tabla of TABLAS_CON_RLS) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tabla}" ${forzar ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`,
    );
  }
}

async function forceDeCadaTabla(): Promise<Record<string, boolean>> {
  const filas = await prisma.$queryRaw<{ relname: string; relforcerowsecurity: boolean }[]>`
    SELECT c.relname, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('products', 'presentations', 'product_batches')
  `;
  return Object.fromEntries(filas.map((fila) => [fila.relname, fila.relforcerowsecurity]));
}

describe('R26 — quitar FORCE ROW LEVEL SECURITY no cambia NINGUN resultado', () => {
  it('el retrato de A y el de B son identicos con FORCE y sin FORCE', async () => {
    // No prueba que la RLS proteja (Prisma se conecta como dueno de las tablas): prueba que el
    // aislamiento no depende de ella. Si quitarla cambiara algo, la frontera estaria en la base.
    const conForceA = await retrato(A);
    const conForceB = await retrato(B);
    expect(await forceDeCadaTabla()).toEqual({
      products: true,
      presentations: true,
      product_batches: true,
    });

    let sinForceA = '';
    let sinForceB = '';
    try {
      await forzarRls(false);
      // Si el `ALTER` no hubiera entrado, dos retratos iguales no probarian nada.
      expect(await forceDeCadaTabla()).toEqual({
        products: false,
        presentations: false,
        product_batches: false,
      });
      sinForceA = await retrato(A);
      sinForceB = await retrato(B);
    } finally {
      // Sin el `finally`, un fallo dejaria la base compartida con la RLS relajada.
      await forzarRls(true);
    }

    expect(sinForceA).toBe(conForceA);
    expect(sinForceB).toBe(conForceB);

    // Del catalogo, sin fiarse del `finally`.
    expect(await forceDeCadaTabla()).toEqual({
      products: true,
      presentations: true,
      product_batches: true,
    });
  });
});

describe('R25 — marcar la empresa como borrada no toca su inventario', () => {
  it('el inventario de B sobrevive entero a su propio borrado logico', async () => {
    const productosAntes = await prisma.product.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });
    const presentacionesAntes = await prisma.presentation.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });
    const lotesAntes = await prisma.productBatch.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });
    expect(productosAntes.length).toBeGreaterThan(0);
    expect(presentacionesAntes.length).toBeGreaterThan(0);
    expect(lotesAntes.length).toBeGreaterThan(0);
    const listadoAntes = await listAliveProducts(consulta(), ambitoDe(B));

    try {
      await prisma.company.update({
        where: { id: B.companyId },
        data: { deletedAt: new Date('2026-09-11T12:00:00.000Z') },
      });
      // Si el `update` no hubiera escrito, lo de abajo no diria nada.
      const empresa = await prisma.company.findUniqueOrThrow({ where: { id: B.companyId } });
      expect(empresa.deletedAt).not.toBeNull();

      // Filas enteras y no conteos: un borrado que vaciara `stock` conservaria el conteo.
      expect(
        JSON.stringify(
          await prisma.product.findMany({ where: { companyId: B.companyId }, orderBy: { id: 'asc' } }),
        ),
      ).toBe(JSON.stringify(productosAntes));
      expect(
        JSON.stringify(
          await prisma.presentation.findMany({
            where: { companyId: B.companyId },
            orderBy: { id: 'asc' },
          }),
        ),
      ).toBe(JSON.stringify(presentacionesAntes));
      expect(
        JSON.stringify(
          await prisma.productBatch.findMany({
            where: { companyId: B.companyId },
            orderBy: { id: 'asc' },
          }),
        ),
      ).toBe(JSON.stringify(lotesAntes));

      // El ambito mira la empresa, no si esta viva: si una empresa de baja opera lo decide
      // `identity`, no un filtro escondido en el inventario.
      const listadoDespues = await listAliveProducts(consulta(), ambitoDe(B));
      expect(listadoDespues.items.map((p) => p.id)).toEqual(listadoAntes.items.map((p) => p.id));
      expect(listadoDespues.total).toBe(listadoAntes.total);

      const desdeA = await listAliveProducts(consulta(), ambitoDe(A));
      expect(desdeA.items.map((p) => p.id)).not.toContain(B.productos[0]);
    } finally {
      await prisma.company.update({ where: { id: B.companyId }, data: { deletedAt: null } });
    }
  });
});
