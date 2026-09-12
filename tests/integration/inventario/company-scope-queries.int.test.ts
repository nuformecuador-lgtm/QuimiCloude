/**
 * T13 (QC-49, aislamiento-por-empresa-en-inventario) — Los LISTADOS y las ESCRITURAS del
 * modulo ven SOLO su empresa, contra Postgres REAL.
 *
 * QUE SE PRUEBA AQUI Y POR QUE NO BASTA UN UNITARIO. `company-isolation-service.test.ts`
 * (T12) demuestra, con dobles, que el caso de uso pasa el ambito del ACTOR al puerto. Eso deja
 * sin probar lo unico que puede filtrar de verdad: el SQL. Un doble diria «llego el ambito»
 * aunque el adaptador lo compusiera al mismo nivel que el `OR` de la busqueda -el fallo exacto
 * contra el que avisa QC-76- y las filas ajenas siguieran saliendo. Solo Postgres puede decir
 * si el `WHERE` acota. Por eso este archivo llama a los ADAPTADORES DRIVEN directamente, con
 * filas reales de DOS empresas sembradas a la vez.
 *
 * `company-scope.int.test.ts` (T11) es el otro archivo de integracion de la ficha y prueba otra
 * cosa: lo que la BASE rechaza (columnas NOT NULL, FK, disparadores de coherencia). Aqui no se
 * prueba ninguna restriccion: se prueba QUE SE VE y QUE SE ESCRIBE.
 *
 * AISLAMIENTO. Los adaptadores llaman al cliente Prisma GLOBAL, no a un `tx` inyectado, asi que
 * una transaccion que se deshace NO los envuelve. Se crean filas REALES y se borran en el
 * `afterAll` POR SU IDENTIFICADOR EXACTO, nunca por rango ni por nombre. Mismo patron que
 * `list-query-products.int.test.ts`.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo. Las dos empresas del archivo son EFIMERAS y
 * nacen aqui, asi que «todas las filas de la empresa A» es exactamente «las que sembro este
 * archivo»: ninguna otra sesion ni ningun residuo de la base puede entrar en un recuento. Eso
 * es lo que permite afirmar el `total` como IGUALDAD y no como «al menos».
 *
 * LA FILA AJENA SE RELEE SIEMPRE. Un rechazo que devuelve `false` o `'not_found'` no prueba
 * que no se escribio: podria haber escrito y despues haber devuelto el codigo equivocado. Cada
 * caso cruzado toma una foto JSON de la fila ajena ANTES y la compara DESPUES (R16).
 *
 * CONTROL POSITIVO EN CADA ESCRITURA CRUZADA. Junto al caso ajeno va el MISMO metodo con el
 * ambito CORRECTO. Sin el, un adaptador roto que devolviera siempre «no existe» dejaria este
 * archivo entero en verde: probaria que no escribe nada, no que aisla.
 *
 * Cubre R13, R14, R16, R17, R19, R25 y R26.
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

// ---------------------------------------------------------------------------------------
// Marcadores y utilidades
// ---------------------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/**
 * Marcador irrepetible de ESTE ARCHIVO, alfanumerico y en minusculas para que sobreviva intacto
 * a `normalizeProductName` y a `normalizePresentationName`. Va en el nombre de TODA fila
 * sembrada aqui, de las DOS empresas, y por eso sirve para el caso que mas importa: una
 * busqueda por el marcador casa con las siete filas, asi que si el ambito no acotara, la
 * busqueda desde A devolveria tambien las de B.
 */
const MARCA = `m${token().slice(0, 12)}`;

/** Marcador que SOLO llevan las filas de la empresa B. Es el termino con el que se comprueba
 *  que una busqueda desde A no las alcanza (R14). */
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

// ---------------------------------------------------------------------------------------
// Fixture: DOS empresas completas, sembradas a la vez
// ---------------------------------------------------------------------------------------

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** Productos vivos sembrados, en el orden en que se crearon. */
  readonly productos: string[];
  /** Presentaciones sembradas, en el orden en que se crearon. */
  readonly presentaciones: string[];
  readonly lotes: string[];
};

/** La unidad de apoyo: DE SISTEMA (`company_id IS NULL`), asi que el disparador
 *  `presentations_check_unit_scope` la acepta en las dos empresas. Se siembra aqui en vez de
 *  reutilizar la del catalogo arrancador para no depender de lo que haya en la base. */
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
  // Usuario REAL: `product_batches.created_by` es FK a `users`, aunque el esquema Prisma la
  // declare como escalar. No vale inventar un uuid.
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
  extras: { readonly stock?: number | null; readonly qtyAlert?: number | null } = {},
): Promise<string> {
  const { id } = await prisma.product.create({
    data: {
      name,
      nameNormalized: normalizeProductName(name),
      stock: extras.stock ?? null,
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
      createdBy: empresa.userId,
      updatedBy: empresa.userId,
      // R2/R22: el lote declara SU empresa y el disparador exige que coincida con la de su
      // producto y la de su presentacion.
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

  // TRES productos vivos en A y CUATRO en B: los recuentos de las dos son distintos a
  // proposito, de modo que un `total` que contara filas ajenas no pudiera coincidir por
  // casualidad con el correcto.
  await sembrarProducto(A, `${MARCA} Producto A uno`, { stock: 10, qtyAlert: 1 });
  await sembrarProducto(A, `${MARCA} Producto A dos`, { stock: 20, qtyAlert: 2 });
  await sembrarProducto(A, `${MARCA} Producto A tres`, { stock: 30, qtyAlert: 3 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B uno`, { stock: 910, qtyAlert: 91 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B dos`, { stock: 920, qtyAlert: 92 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B tres`, { stock: 930, qtyAlert: 93 });
  await sembrarProducto(B, `${MARCA} ${SOLO_B} Producto B cuatro`, { stock: 940, qtyAlert: 94 });

  // Un producto BORRADO logicamente en A, para que el ambito no se lleve por delante lo que
  // `deleted_at IS NULL` ya garantizaba: siguen siendo dos condiciones, no una.
  const borrado = await sembrarProducto(A, `${MARCA} Producto A borrado`);
  await prisma.product.update({ where: { id: borrado }, data: { deletedAt: AHORA } });

  // DOS presentaciones en A y TRES en B. La primera de cada una comparte NOMBRE NORMALIZADO:
  // desde QC-49 (R20) la unicidad es por empresa, asi que las dos pueden existir — y sirve para
  // comprobar que el listado de A no ve la homonima de B.
  await sembrarPresentacion(A, `${MARCA} Bidon compartido`);
  await sembrarPresentacion(A, `${MARCA} Bidon A dos`);
  await sembrarPresentacion(B, `${MARCA} Bidon compartido`);
  await sembrarPresentacion(B, `${MARCA} ${SOLO_B} Bidon B dos`);
  await sembrarPresentacion(B, `${MARCA} ${SOLO_B} Bidon B tres`);

  // Un lote en cada empresa, colgando de su primer producto y su primera presentacion.
  await sembrarLote(A, A.productos[0] ?? '', A.presentaciones[0] ?? '');
  await sembrarLote(B, B.productos[0] ?? '', B.presentaciones[0] ?? '');
});

afterAll(async () => {
  // Por `id` EXACTO y en el orden que exigen las FK (todas ON DELETE RESTRICT):
  // lotes -> productos -> presentaciones -> unidad -> usuario -> rol -> tipo doc -> empresa.
  const empresas = [A, B].filter((empresa): empresa is Empresa => empresa !== undefined);
  for (const empresa of empresas) {
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

// ---------------------------------------------------------------------------------------
// Lecturas crudas: lo que la COLUMNA guardo, sin pasar por el contrato de salida
// ---------------------------------------------------------------------------------------

/** Foto JSON de la fila de producto, TODAS sus columnas. Es lo que se compara antes y despues
 *  de una escritura cruzada: comparar solo el nombre dejaria pasar un `updated_at` movido. */
async function fotoProducto(id: string): Promise<string> {
  const fila = await prisma.product.findUniqueOrThrow({ where: { id } });
  return JSON.stringify(fila);
}

async function fotoPresentacion(id: string): Promise<string> {
  const fila = await prisma.presentation.findUniqueOrThrow({ where: { id } });
  return JSON.stringify(fila);
}

/** La empresa que quedo ESCRITA en la fila. Se lee de la columna, no del contrato de salida:
 *  el contrato no la publica (R19) y ese es justamente otro de los casos. */
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

// ---------------------------------------------------------------------------------------
// R13, R14 — los dos listados, y el `total` con ellos
// ---------------------------------------------------------------------------------------

describe('R14 — el listado devuelve EXACTAMENTE las filas de su empresa, y el total tambien', () => {
  it('productos: A ve sus tres y ninguna de las cuatro de B', async () => {
    const pagina = await listAliveProducts(consulta(), ambitoDe(A));

    // Las tres vivas de A, ni una mas. Igualdad de CONJUNTO, no «contiene».
    expect([...pagina.items.map((p) => p.id)].sort()).toEqual([...A.productos.slice(0, 3)].sort());
    // El recuento describe lo visible PARA A (R14). Si el `count` usara otro `where` que el
    // `findMany`, aqui saldrian 7 —o 8 con el borrado— con tres elementos en la pagina.
    expect(pagina.total).toBe(3);
    expect(pagina.totalPages).toBe(1);

    // Explicito y en negativo, por si el conjunto cambiara de forma manana: ningun id de B.
    for (const ajeno of B.productos) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }
  });

  it('productos: B ve sus cuatro y ninguna de las de A', async () => {
    // El caso simetrico no es adorno: un adaptador que devolviera SIEMPRE las filas de la
    // primera empresa sembrada pasaria el caso de arriba y caeria aqui.
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

    // La homonima existe en las DOS empresas con el mismo nombre normalizado (R20) y cada una
    // ve SOLO la suya: el nombre no es lo que las distingue, la empresa si.
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
    // A sembro CUATRO productos y uno esta borrado. El listado devuelve tres: las dos
    // condiciones siguen vivas y componen, no se pisan.
    const pagina = await listAliveProducts(consulta(), ambitoDe(A));
    expect(A.productos).toHaveLength(4);
    expect(pagina.items.map((p) => p.id)).not.toContain(A.productos[3]);
    expect(pagina.total).toBe(3);
  });

  it('R19: ni la vista de producto ni la de presentacion publican la empresa', async () => {
    // La empresa entra en la CONSULTA y no sale hacia el navegador. Se afirma sobre las claves
    // del objeto, no sobre su serializacion: un `companyId: undefined` no viajaria en el JSON
    // pero si estaria en el contrato.
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

// ---------------------------------------------------------------------------------------
// R14 — la busqueda y los filtros acotan DENTRO del ambito, nunca lo ensanchan
// ---------------------------------------------------------------------------------------

describe('R14 — la busqueda y los filtros NO ensanchan lo visible', () => {
  it('productos: buscar el marcador que SOLO llevan las filas de B, desde A, no devuelve nada', async () => {
    // ESTE es el caso que atrapa el bug de componer el ambito al mismo nivel que un `OR`: si
    // `companyId` y la busqueda fueran hermanos dentro de un `OR`, la fila de B entraria por
    // cumplir la busqueda. Con el ambito como capa de FUERA, la busqueda solo puede QUITAR.
    const pagina = await listAliveProducts(consulta({ search: SOLO_B }), ambitoDe(A));

    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);

    // Control positivo: el mismo termino, desde B, SI encuentra las cuatro. Sin esto, una
    // busqueda rota devolveria cero siempre y el caso de arriba no probaria nada.
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
    // Los `stock` de B (910..940) no se solapan con los de A (10..30) a proposito.
    const desdeA = await listAliveProducts(
      consulta({ filters: { stock: { kind: 'numberRange', min: 900, max: 999 } } }),
      ambitoDe(A),
    );
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    const desdeB = await listAliveProducts(
      consulta({ filters: { stock: { kind: 'numberRange', min: 900, max: 999 } } }),
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
    // Ordenar `desc` cambia QUE fila cae en la pagina 1. Si el ambito se aplicara despues de
    // paginar, aqui apareceria la primera fila de B, que es la que gana el orden global.
    const pagina = await listAliveProducts(
      consulta({ pageSize: 2, sort: { columnId: 'stock', direction: 'desc' } }),
      ambitoDe(A),
    );

    expect(pagina.total).toBe(3);
    expect(pagina.items.map((p) => p.stock)).toEqual([30, 20]);
    for (const ajeno of B.productos) {
      expect(pagina.items.map((p) => p.id)).not.toContain(ajeno);
    }
  });

  it('findAliveIdByName no resuelve el homonimo de otra empresa (R18 por el lado del SQL)', async () => {
    // El nombre existe, vivo, en B. Desde A no hay nada que resolver: `null`. Es lo que hace
    // que el alta cree un producto NUEVO en vez de colgarle el lote al de la otra empresa.
    const nombreDeB = `${MARCA} ${SOLO_B} Producto B uno`;
    expect(await findAliveIdByName(nombreDeB, ambitoDe(A))).toBeNull();
    expect(await findAliveIdByName(nombreDeB, ambitoDe(B))).toBe(B.productos[0]);
  });
});

// ---------------------------------------------------------------------------------------
// R16 — escribir sobre lo ajeno: «no existe», y la fila ajena INTACTA
// ---------------------------------------------------------------------------------------

describe('R16 — updateAlive / softDeleteAlive / deleteById con un id AJENO', () => {
  it('la ficha de un producto de B, pedida desde A, es `null`', async () => {
    expect(await findAliveProductById(B.productos[1] ?? '', ambitoDe(A))).toBeNull();
    // Control positivo: la misma fila, desde su empresa, SI existe.
    const propia = await findAliveProductById(B.productos[1] ?? '', ambitoDe(B));
    expect(propia?.id).toBe(B.productos[1]);
  });

  it('updateAlive de un producto de B desde A devuelve false y NO toca la fila', async () => {
    const ajeno = B.productos[1] ?? '';
    const antes = await fotoProducto(ajeno);

    const resultado = await updateAliveProduct(
      ajeno,
      { name: 'Nombre inyectado desde A', stock: 1, qtyAlert: 1 },
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe(false);
    // Releida de la base: ni el nombre, ni el stock, ni `updated_at` se movieron.
    expect(await fotoProducto(ajeno)).toBe(antes);
  });

  it('control positivo: el mismo updateAlive, desde B, SI escribe', async () => {
    // Sin este caso, un `updateMany` que no actualizara nunca dejaria el anterior en verde.
    const propio = B.productos[1] ?? '';
    const antes = await fotoProducto(propio);
    const nuevoNombre = `${MARCA} ${SOLO_B} Producto B dos editado`;

    const resultado = await updateAliveProduct(
      propio,
      { name: nuevoNombre, stock: 921, qtyAlert: 92 },
      new Date(),
      ambitoDe(B),
    );

    expect(resultado).toBe(true);
    expect(await fotoProducto(propio)).not.toBe(antes);
    const fila = await prisma.product.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.name).toBe(nuevoNombre);
    // La empresa NO se reescribe con una edicion: un producto no cambia de dueno.
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

    // Y sigue saliendo en el listado de SU empresa: el intento fallido no la escondio.
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
    // La presentacion elegida NO tiene lotes, asi que un `'not_found'` no puede confundirse con
    // el `'in_use'` de la FK: lo unico que puede haberlo producido es el ambito.
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

// ---------------------------------------------------------------------------------------
// R17 — el alta escribe la empresa DEL AMBITO
// ---------------------------------------------------------------------------------------

describe('R17 — el alta escribe la empresa del AMBITO, no la de la entrada', () => {
  it('createProduct escribe la empresa del ambito en la columna', async () => {
    // `NewProduct` no declara empresa: no hay forma de que la entrada la elija. Lo que se
    // comprueba aqui es la otra mitad —que la CORRECTA si se escribe—, leyendo la columna.
    const name = `${MARCA} Alta en A ${token().slice(0, 8)}`;
    const creado = await createProduct({ name, stock: 1, qtyAlert: 1 }, AHORA, ambitoDe(A));
    A.productos.push(creado.id);

    expect(await empresaDelProducto(creado.id)).toBe(A.companyId);
    // Y aparece en el listado de A, no en el de B.
    const desdeA = await listAliveProducts(consulta({ search: name }), ambitoDe(A));
    expect(desdeA.items.map((p) => p.id)).toEqual([creado.id]);
    const desdeB = await listAliveProducts(consulta({ search: name }), ambitoDe(B));
    expect(desdeB.items).toEqual([]);
  });

  it('createWithFirstBatch escribe la MISMA empresa en el producto y en su lote', async () => {
    const name = `${MARCA} Alta con lote en A ${token().slice(0, 8)}`;
    const creado = await createWithFirstBatch(
      { name, stock: 5, qtyAlert: 1 },
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
    // El nombre normalizado es IDENTICO en las dos altas. Con la unicidad global de antes de
    // QC-49 la segunda habria salido `'duplicate'`; con la unicidad por empresa (R20) las dos
    // entran, cada una en su empresa.
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

    // Y cada una ve SOLO la suya al buscarla por el nombre compartido.
    const vistaA = await listPresentations(consulta({ search: name }), ambitoDe(A));
    expect(vistaA.items.map((p) => p.id)).toEqual([enA.id]);
    const vistaB = await listPresentations(consulta({ search: name }), ambitoDe(B));
    expect(vistaB.items.map((p) => p.id)).toEqual([enB.id]);
  });
});

// ---------------------------------------------------------------------------------------
// R26 — la RLS es defensa en profundidad, NO la frontera
// ---------------------------------------------------------------------------------------

/** Retrato del estado visible para una empresa: lo que se compara con y sin `FORCE`. */
async function retrato(empresa: Empresa): Promise<string> {
  const productos = await listAliveProducts(consulta(), ambitoDe(empresa));
  const presentaciones = await listPresentations(consulta(), ambitoDe(empresa));
  const ajeno = empresa === A ? B : A;
  const fichaAjena = await findAliveProductById(ajeno.productos[0] ?? '', ambitoDe(empresa));
  const escrituraAjena = await updateAliveProduct(
    ajeno.productos[0] ?? '',
    { name: 'no deberia escribirse', stock: 0, qtyAlert: 0 },
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
    // QUE DEMUESTRA ESTE CASO, y que no. No demuestra que la RLS proteja: con Prisma no podria
    // (`docs/verification.md`, `docs/architecture.md > Acceso a datos y autorizacion`).
    // Demuestra lo CONTRARIO, que es lo que R26 pide: que el aislamiento del modulo NO DEPENDE
    // de la RLS. Si al quitarla algun resultado cambiara, significaria que la frontera real
    // estaba en la base y no en el modulo, y el aislamiento se caeria en cuanto alguien se
    // conectara con otro rol. La RLS queda como defensa en profundidad, y por eso se RESTAURA.
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
      // Se comprueba que el cambio ENTRO: si el `ALTER` no hubiera hecho nada, comparar dos
      // retratos identicos no probaria absolutamente nada.
      expect(await forceDeCadaTabla()).toEqual({
        products: false,
        presentations: false,
        product_batches: false,
      });
      sinForceA = await retrato(A);
      sinForceB = await retrato(B);
    } finally {
      // El `finally` no es cortesia: sin el, un fallo dentro del bloque dejaria la base con la
      // RLS relajada y `guard-rls-force` en rojo para todo el mundo.
      await forzarRls(true);
    }

    expect(sinForceA).toBe(conForceA);
    expect(sinForceB).toBe(conForceB);

    // Restaurado, y afirmado leyendo el catalogo de Postgres, no confiando en el `finally`.
    expect(await forceDeCadaTabla()).toEqual({
      products: true,
      presentations: true,
      product_batches: true,
    });
  });
});

// ---------------------------------------------------------------------------------------
// R25 — una empresa marcada como borrada conserva su inventario intacto
// ---------------------------------------------------------------------------------------

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
      // La empresa QUEDO marcada: si el `update` no hubiera escrito, lo de abajo no diria nada.
      const empresa = await prisma.company.findUniqueOrThrow({ where: { id: B.companyId } });
      expect(empresa.deletedAt).not.toBeNull();

      // Ni una fila menos, ni una columna distinta, en las TRES tablas. Se comparan las filas
      // enteras, no los conteos: un borrado que vaciara `stock` conservaria el conteo.
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

      // Y el modulo sigue devolviendo lo mismo: el ambito mira la EMPRESA, no si esta viva.
      // Que una empresa de baja pueda o no operar es una decision de `identity`, no un filtro
      // escondido en el inventario.
      const listadoDespues = await listAliveProducts(consulta(), ambitoDe(B));
      expect(listadoDespues.items.map((p) => p.id)).toEqual(listadoAntes.items.map((p) => p.id));
      expect(listadoDespues.total).toBe(listadoAntes.total);

      // El inventario de A tampoco se entera de nada.
      const desdeA = await listAliveProducts(consulta(), ambitoDe(A));
      expect(desdeA.items.map((p) => p.id)).not.toContain(B.productos[0]);
    } finally {
      await prisma.company.update({ where: { id: B.companyId }, data: { deletedAt: null } });
    }
  });
});
