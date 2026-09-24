/**
 * QC-59 T30 — el ambito por empresa de `proveedores`, contra Postgres REAL.
 *
 * AISLAMIENTO: `commit`. Mismo criterio que `recetas/company-scope-queries.int.test.ts` (QC-50)
 * y `pedidos/company-scope-queries.int.test.ts` (QC-60): los dos adaptadores driven de este
 * modulo hablan con el cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no con un `tx`
 * inyectado, asi que envolver la corrida en una transaccion del test no los alcanzaria -
 * correrian en otra conexion del pool y verian una base vacia-. La siembra y las escrituras
 * REALES por los adaptadores COMMITEAN, y este archivo limpia lo suyo en el `afterAll`, en el
 * orden que exigen las FK -que ahora incluye las DOS compuestas nuevas-: lineas -> proveedores
 * -> presentacion y unidad propias -> usuario -> rol y tipo de documento -> empresa; la unidad
 * de sistema, que es compartida, se borra la ultima. El `afterAll` AFIRMA que no quedo nada.
 * Las empresas nacen con nombre irrepetible (`token()`), y por eso los `total` se afirman como
 * IGUALDAD y no como «al menos».
 *
 * La UNICA parte que necesita `SAVEPOINT` es R16: para leer el `meta.target` REAL de un `23505`
 * hace falta el error crudo de Prisma, y `createSupplier` lo traduce a su resultado
 * discriminado. Ese sub-caso abre su PROPIA `prisma.$transaction` con ROLLBACK garantizado y un
 * `SAVEPOINT` alrededor de la escritura que se espera que falle, y no deja ninguna fila.
 *
 * Un `'not_found'` no prueba que no se escribiera nada: la fila ajena -y sus lineas- se RELEE
 * entera despues de cada escritura cruzada, y cada aserto negativo lleva su control positivo
 * para que un `updateMany`/`create` roto no deje verde el archivo.
 *
 * Cubre R16, R19, R25, R26, R27, R28, R29, R30, R31, R35.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  createCatalogLine,
  listCatalogLinesBySupplierAlive,
  replaceAliveCatalogLine,
  softDeleteAliveCatalogLine,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import {
  createSupplier,
  findAliveSupplierById,
  isUniqueNameViolation,
  listAliveSuppliers,
  softDeleteAliveSupplier,
  updateAliveSupplier,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { CatalogLineFields, NewCatalogLine } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { ListQuery } from '@/lib/modules/proveedores/domain/list-query';
import type { SupplierScope } from '@/lib/modules/proveedores/domain/supplier-scope';
import type { NewSupplier } from '@/lib/modules/proveedores/domain/supplier-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** El instante de toda la siembra: los adaptadores escriben el `now` que se les pasa, y el
 *  filtro de fecha -unico filtro que declara el listado de proveedores- se prueba contra ESTE
 *  dia UTC. */
const AHORA = new Date();
const DIA_UTC = AHORA.toISOString().slice(0, 10);

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** Presentacion y unidad PROPIAS: la presentacion la exige la FK compuesta de la linea, y la
   *  unidad sirve al caso de `findUnitRefs`. */
  readonly presentationId: string;
  readonly unitId: string;
  /** Ids de proveedor sembrados, en orden. Los casos los toman por indice. */
  readonly proveedores: string[];
  /** Ids de linea sembrados, en orden. */
  readonly lineas: string[];
};

/** Unidad de sistema (`company_id IS NULL`): compartida por las dos empresas (R19). */
let SYSTEM_UNIT_ID: string;

/** Tres vivos y uno con borrado logico (indice 3). */
let A: Empresa;
/** Dos vivos: recuento distinto del de A, para que un `total` con filas ajenas no coincida por
 *  casualidad. El primero lleva un nombre distintivo para el caso de busqueda. */
let B: Empresa;
/** Sin ningun proveedor: el listado tiene que verse vacio, no el de al lado. */
let C: Empresa;

const MARCA_BUSQUEDA_B = `jabonespecial${token()}`;

function ambitoDe(empresa: Empresa): SupplierScope {
  return { companyId: empresa.companyId };
}

async function unidadDeSistemaCompartida(): Promise<string> {
  const unit = await prisma.unit.findFirstOrThrow({
    where: { companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marca = token();
  const nombre = `Empresa ${etiqueta} ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  // `suppliers.created_by`/`updated_by` son FK reales a `users`.
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
  const presentation = await prisma.presentation.create({
    data: {
      name: `Bidon ${marca}`,
      nameNormalized: `bidon${marca}`,
      unitId: SYSTEM_UNIT_ID,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unit = await prisma.unit.create({
    data: {
      name: `Unidad ${marca}`,
      nameNormalized: `unidad${marca}`,
      symbol: `u${marca.slice(0, 8)}`,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    presentationId: presentation.id,
    unitId: unit.id,
    proveedores: [],
    lineas: [],
  };
}

function proveedorNuevo(name: string): NewSupplier {
  return {
    name,
    nameNormalized: normalizeSupplierName(name),
    phone: '+57 300 000 0000',
    email: null,
  };
}

/** Alta por el adaptador REAL: la columna de empresa la escribe produccion (R30). */
async function alta(empresa: Empresa, name: string): Promise<string> {
  const resultado = await createSupplier(proveedorNuevo(name), empresa.userId, AHORA, ambitoDe(empresa));
  if (resultado === 'duplicate') throw new Error('el alta de proveedor devolvio duplicate');
  empresa.proveedores.push(resultado.id);
  return resultado.id;
}

function camposDeLinea(
  empresa: Empresa,
  name: string,
  overrides: Partial<CatalogLineFields> = {},
): CatalogLineFields {
  return {
    name,
    presentationId: empresa.presentationId,
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

function lineaNueva(
  empresa: Empresa,
  supplierId: string,
  name: string,
  overrides: Partial<CatalogLineFields> = {},
): NewCatalogLine {
  return { supplierId, ...camposDeLinea(empresa, name, overrides) };
}

async function altaDeLinea(
  empresa: Empresa,
  supplierId: string,
  name: string,
): Promise<string> {
  const resultado = await createCatalogLine(
    lineaNueva(empresa, supplierId, name),
    empresa.userId,
    AHORA,
    ambitoDe(empresa),
  );
  if (resultado === 'duplicate' || resultado === 'supplier_not_found') {
    throw new Error(`el alta de linea devolvio ${resultado}`);
  }
  empresa.lineas.push(resultado.id);
  return resultado.id;
}

beforeAll(async () => {
  SYSTEM_UNIT_ID = await unidadDeSistemaCompartida();

  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');
  C = await sembrarEmpresa('C');

  // A: tres vivos y uno dado de baja (indice 3). El primero lleva dos lineas.
  const primeroDeA = await alta(A, `Solucion comun ${token()}`);
  await altaDeLinea(A, primeroDeA, `Linea uno de A ${token()}`);
  await altaDeLinea(A, primeroDeA, `Linea dos de A ${token()}`);
  await alta(A, `Segundo proveedor A ${token()}`);
  await alta(A, `Tercer proveedor A ${token()}`);
  const deBajaEnA = await alta(A, `Dado de baja A ${token()}`);
  expect(await softDeleteAliveSupplier(deBajaEnA, A.userId, AHORA, ambitoDe(A))).toBe(true);

  // B: dos vivos. El primero lleva el termino distintivo de la busqueda y una linea.
  const primeroDeB = await alta(B, `Jabon especial ${MARCA_BUSQUEDA_B}`);
  await altaDeLinea(B, primeroDeB, `Linea de B ${token()}`);
  await alta(B, `Segundo proveedor B ${token()}`);
});

afterAll(async () => {
  const empresas = [A, B, C].filter((empresa): empresa is Empresa => empresa !== undefined);
  // Las lineas primero: las sujetan la FK compuesta hacia la presentacion (`RESTRICT`) y la FK
  // simple hacia la unidad, asi que borrar presentacion o unidad antes las rechazaria la base.
  for (const empresa of empresas) {
    await prisma.supplierCatalogLine.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.supplier.deleteMany({ where: { companyId: empresa.companyId } });
  }
  for (const empresa of empresas) {
    await prisma.presentation.deleteMany({ where: { id: empresa.presentationId } });
    await prisma.unit.deleteMany({ where: { id: empresa.unitId } });
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }

  // El censo de aislamiento exige que un archivo `commit` deje la base como la encontro, y eso
  // se afirma, no se supone.
  for (const empresa of empresas) {
    expect(
      await prisma.supplierCatalogLine.count({ where: { companyId: empresa.companyId } }),
    ).toBe(0);
    expect(await prisma.supplier.count({ where: { companyId: empresa.companyId } })).toBe(0);
    expect(await prisma.company.count({ where: { id: empresa.companyId } })).toBe(0);
  }

  await prisma.$disconnect();
});

/** Proveedor entero CON sus lineas: comparar solo el estado dejaria pasar una linea movida. */
async function foto(id: string): Promise<string> {
  const fila = await prisma.supplier.findUniqueOrThrow({
    where: { id },
    include: { catalogLines: { orderBy: { id: 'asc' } } },
  });
  return JSON.stringify(fila);
}

/** De la columna, porque el contrato de salida no publica la empresa (R31). */
async function empresaDelProveedor(id: string): Promise<string> {
  const fila = await prisma.supplier.findUniqueOrThrow({
    where: { id },
    select: { companyId: true },
  });
  return fila.companyId;
}

async function empresaDeLaLinea(id: string): Promise<string> {
  const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({
    where: { id },
    select: { companyId: true },
  });
  return fila.companyId;
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, pageSize: 25, sort: null, filters: {}, search: '', ...partial };
}

async function idsVisibles(empresa: Empresa): Promise<string[]> {
  const pagina = await listAliveSuppliers(consulta(), ambitoDe(empresa));
  return pagina.items.map((item) => item.id);
}

// ---------------------------------------------------------------------------
// R25 — el listado de proveedores
// ---------------------------------------------------------------------------

describe('R25 — el listado devuelve EXACTAMENTE los proveedores de su empresa, y el total tambien', () => {
  it('R25: A ve sus tres vivos y ninguno de los dos de B', async () => {
    const pagina = await listAliveSuppliers(consulta(), ambitoDe(A));

    const vivosDeA = [A.proveedores[0], A.proveedores[1], A.proveedores[2]];
    expect([...pagina.items.map((r) => r.id)].sort()).toEqual([...vivosDeA].sort());
    // Si el `count` usara otro `where` que el `findMany`, aqui saldria 4 con tres elementos.
    expect(pagina.total).toBe(3);

    for (const ajeno of B.proveedores) {
      expect(pagina.items.map((r) => r.id)).not.toContain(ajeno);
    }
  });

  it('R25: B ve sus dos y ninguno de los de A', async () => {
    // Atrapa un adaptador que devolviera siempre las filas de la primera empresa sembrada.
    const pagina = await listAliveSuppliers(consulta(), ambitoDe(B));

    expect([...pagina.items.map((r) => r.id)].sort()).toEqual([...B.proveedores].sort());
    expect(pagina.total).toBe(2);
    for (const ajeno of A.proveedores) {
      expect(pagina.items.map((r) => r.id)).not.toContain(ajeno);
    }
  });

  it('R25: el proveedor con borrado logico de A no aparece — el ambito no sustituye a deleted_at', async () => {
    const pagina = await listAliveSuppliers(consulta(), ambitoDe(A));
    expect(pagina.items.map((r) => r.id)).not.toContain(A.proveedores[3]);
    expect(pagina.total).toBe(3);
  });

  it('R25: una empresa sin proveedores ve la lista vacia, no la de al lado', async () => {
    const pagina = await listAliveSuppliers(consulta(), ambitoDe(C));
    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);
  });

  it('R31: ni el resumen de la lista, ni la ficha, ni la linea publican la empresa', async () => {
    const pagina = await listAliveSuppliers(consulta(), ambitoDe(A));
    expect(pagina.items.length).toBeGreaterThan(0);
    for (const item of pagina.items) {
      expect(Object.keys(item)).not.toContain('companyId');
    }

    const ficha = await findAliveSupplierById(A.proveedores[0] ?? '', ambitoDe(A));
    expect(ficha).not.toBeNull();
    expect(Object.keys(ficha ?? {})).not.toContain('companyId');

    const catalogo = await listCatalogLinesBySupplierAlive(
      A.proveedores[0] ?? '',
      consulta(),
      ambitoDe(A),
    );
    expect(catalogo).not.toBe('supplier_not_found');
    if (catalogo === 'supplier_not_found') return;
    expect(catalogo.items.length).toBeGreaterThan(0);
    for (const item of catalogo.items) {
      expect(Object.keys(item)).not.toContain('companyId');
    }
  });
});

describe('R25 — la busqueda y los filtros NO ensanchan lo visible', () => {
  it('R25: una busqueda que solo casa con el nombre de B devuelve vacio desde A, con su control positivo desde B', async () => {
    // Si el ambito y la busqueda fueran hermanos dentro de un `OR`, el proveedor de B entraria
    // por cumplir el termino buscado.
    const desdeA = await listAliveSuppliers(consulta({ search: MARCA_BUSQUEDA_B }), ambitoDe(A));
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    // Sin este control, una busqueda rota que devolviera siempre cero dejaria verde lo de arriba.
    const desdeB = await listAliveSuppliers(consulta({ search: MARCA_BUSQUEDA_B }), ambitoDe(B));
    expect(desdeB.items.map((r) => r.id)).toEqual([B.proveedores[0]]);
    expect(desdeB.total).toBe(1);
  });

  it('R25: un filtro de fecha que casa en las dos empresas solo trae los de la propia', async () => {
    // Las dos empresas sembraron con el MISMO `now` (`AHORA`): el filtro por ese dia casa con
    // las filas de las dos, y por eso demuestra que el ambito no se disuelve en el filtro.
    const filters = { createdAt: { kind: 'dateRange' as const, from: DIA_UTC, to: DIA_UTC } };

    const desdeA = await listAliveSuppliers(consulta({ filters }), ambitoDe(A));
    expect([...desdeA.items.map((r) => r.id)].sort()).toEqual(
      [A.proveedores[0], A.proveedores[1], A.proveedores[2]].sort(),
    );
    expect(desdeA.total).toBe(3);

    const desdeB = await listAliveSuppliers(consulta({ filters }), ambitoDe(B));
    expect([...desdeB.items.map((r) => r.id)].sort()).toEqual([...B.proveedores].sort());
    expect(desdeB.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// R26 — el listado del catalogo acota LAS DOS tablas
// ---------------------------------------------------------------------------

describe('R26 — el catalogo de un proveedor ajeno responde igual que el de uno inexistente', () => {
  it('R26: listBySupplierAlive del proveedor de B, pedido desde A, devuelve supplier_not_found', async () => {
    const ajeno = B.proveedores[0] ?? '';
    expect(await listCatalogLinesBySupplierAlive(ajeno, consulta(), ambitoDe(A))).toBe(
      'supplier_not_found',
    );
    // Exactamente la misma respuesta que ante un identificador que no existe: no hay oraculo.
    expect(
      await listCatalogLinesBySupplierAlive(randomUUID(), consulta(), ambitoDe(A)),
    ).toBe('supplier_not_found');
  });

  it('R26: control positivo — desde B, el mismo proveedor devuelve su linea y su total', async () => {
    const propio = B.proveedores[0] ?? '';
    const pagina = await listCatalogLinesBySupplierAlive(propio, consulta(), ambitoDe(B));
    expect(pagina).not.toBe('supplier_not_found');
    if (pagina === 'supplier_not_found') return;
    expect(pagina.items.map((r) => r.id)).toEqual([B.lineas[0]]);
    expect(pagina.total).toBe(1);
  });

  it('R26: el catalogo de A trae sus dos lineas y el total tambien, y la busqueda no lo ensancha', async () => {
    const propio = A.proveedores[0] ?? '';
    const pagina = await listCatalogLinesBySupplierAlive(propio, consulta(), ambitoDe(A));
    expect(pagina).not.toBe('supplier_not_found');
    if (pagina === 'supplier_not_found') return;
    expect([...pagina.items.map((r) => r.id)].sort()).toEqual([...A.lineas].sort());
    expect(pagina.total).toBe(2);

    // El mismo filtro `select` por presentacion, con la presentacion de B: desde A no puede
    // traer nada, porque ninguna linea de A apunta a una presentacion de B -lo impide la clave
    // foranea compuesta- y el filtro no puede ensanchar el conjunto.
    const conPresentacionAjena = await listCatalogLinesBySupplierAlive(
      propio,
      consulta({
        filters: { presentationId: { kind: 'select' as const, values: [B.presentationId] } },
      }),
      ambitoDe(A),
    );
    expect(conPresentacionAjena).not.toBe('supplier_not_found');
    if (conPresentacionAjena === 'supplier_not_found') return;
    expect(conPresentacionAjena.items).toEqual([]);
    expect(conPresentacionAjena.total).toBe(0);

    // Control positivo del mismo filtro con la presentacion propia.
    const conPresentacionPropia = await listCatalogLinesBySupplierAlive(
      propio,
      consulta({
        filters: { presentationId: { kind: 'select' as const, values: [A.presentationId] } },
      }),
      ambitoDe(A),
    );
    expect(conPresentacionPropia).not.toBe('supplier_not_found');
    if (conPresentacionPropia === 'supplier_not_found') return;
    expect(conPresentacionPropia.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// R27, R28, R29 — lectura y escrituras con un id AJENO
// ---------------------------------------------------------------------------

describe('R27, R28 — findAliveById / updateAlive / softDeleteAlive con un id AJENO', () => {
  it('R27: la ficha de un proveedor de B, pedida desde A, es null — y desde B no lo es', async () => {
    expect(await findAliveSupplierById(B.proveedores[0] ?? '', ambitoDe(A))).toBeNull();
    const propia = await findAliveSupplierById(B.proveedores[0] ?? '', ambitoDe(B));
    expect(propia?.id).toBe(B.proveedores[0]);
  });

  it('R28: updateAlive de un proveedor de B desde A devuelve not_found y NO toca la fila ni sus lineas', async () => {
    const ajeno = B.proveedores[0] ?? '';
    const antes = await foto(ajeno);
    const lineasAntes = await prisma.supplierCatalogLine.count({ where: { supplierId: ajeno } });
    expect(lineasAntes).toBe(1);

    const resultado = await updateAliveSupplier(
      ajeno,
      proveedorNuevo(`Nombre inyectado desde A ${token()}`),
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(await foto(ajeno)).toBe(antes);
    expect(await prisma.supplierCatalogLine.count({ where: { supplierId: ajeno } })).toBe(
      lineasAntes,
    );
  });

  it('R28: control positivo — el mismo updateAlive, desde B, SI escribe', async () => {
    // Sin este caso, un `updateMany` que nunca escribiera dejaria verde el anterior.
    const propio = B.proveedores[0] ?? '';
    const antes = await foto(propio);
    const nuevoNombre = `Jabon especial ${MARCA_BUSQUEDA_B} renombrado`;

    const resultado = await updateAliveSupplier(
      propio,
      proveedorNuevo(nuevoNombre),
      B.userId,
      new Date(),
      ambitoDe(B),
    );

    expect(resultado).toBe('ok');
    expect(await foto(propio)).not.toBe(antes);
    const detalle = await findAliveSupplierById(propio, ambitoDe(B));
    expect(detalle?.name).toBe(nuevoNombre);
    expect(await empresaDelProveedor(propio)).toBe(B.companyId);
  });

  it('R28, R29: softDeleteAlive de un proveedor de B desde A devuelve false, no marca la fila y NO marca NINGUNA de sus lineas', async () => {
    const ajeno = B.proveedores[0] ?? '';
    const antes = await foto(ajeno);

    const resultado = await softDeleteAliveSupplier(ajeno, A.userId, new Date(), ambitoDe(A));

    expect(resultado).toBe(false);
    expect(await foto(ajeno)).toBe(antes);
    const fila = await prisma.supplier.findUniqueOrThrow({ where: { id: ajeno } });
    expect(fila.deletedAt).toBeNull();
    // El arrastre del catalogo va DENTRO de la misma transaccion y detras del cortocircuito: si
    // el primer `updateMany` no afecta una fila, ninguna linea se toca.
    expect(
      await prisma.supplierCatalogLine.count({ where: { supplierId: ajeno, deletedAt: null } }),
    ).toBe(1);
    expect(await idsVisibles(B)).toContain(ajeno);
  });

  it('R29: control positivo — la baja propia arrastra SOLO las lineas de su empresa, con el MISMO deleted_at', async () => {
    const propio = A.proveedores[0] ?? '';
    const ahora = new Date();
    const lineasDeB = await prisma.supplierCatalogLine.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });

    const resultado = await softDeleteAliveSupplier(propio, A.userId, ahora, ambitoDe(A));
    expect(resultado).toBe(true);

    const proveedor = await prisma.supplier.findUniqueOrThrow({ where: { id: propio } });
    expect(proveedor.deletedAt?.getTime()).toBe(ahora.getTime());

    const lineas = await prisma.supplierCatalogLine.findMany({
      where: { supplierId: propio },
      select: { id: true, deletedAt: true, companyId: true },
    });
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) {
      // La MISMA marca de tiempo que el proveedor, no dos relojes distintos.
      expect(linea.deletedAt?.getTime()).toBe(ahora.getTime());
      expect(linea.companyId).toBe(A.companyId);
    }

    // Y las lineas de la otra empresa no se movieron ni un milimetro.
    expect(
      JSON.stringify(
        await prisma.supplierCatalogLine.findMany({
          where: { companyId: B.companyId },
          orderBy: { id: 'asc' },
        }),
      ),
    ).toBe(JSON.stringify(lineasDeB));

    // Ya no aparece en el listado de A, y B sigue viendo los suyos.
    expect(await idsVisibles(A)).not.toContain(propio);
    expect((await listAliveSuppliers(consulta(), ambitoDe(B))).total).toBe(2);
  });
});

describe('R28 — las escrituras de linea con un proveedor o una linea AJENOS', () => {
  it('R28: create de linea sobre un proveedor de B, desde A, devuelve supplier_not_found y no escribe nada', async () => {
    const ajeno = B.proveedores[0] ?? '';
    const antes = await prisma.supplierCatalogLine.count();

    const resultado = await createCatalogLine(
      lineaNueva(A, ajeno, `Linea inyectada ${token()}`),
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe('supplier_not_found');
    expect(await prisma.supplierCatalogLine.count()).toBe(antes);
    expect(await prisma.supplierCatalogLine.count({ where: { supplierId: ajeno } })).toBe(1);
  });

  it('R28: replaceAlive de una linea de B desde A devuelve not_found y deja la fila ajena intacta', async () => {
    const lineaAjena = B.lineas[0] ?? '';
    const antes = JSON.stringify(
      await prisma.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineaAjena } }),
    );

    const resultado = await replaceAliveCatalogLine(
      lineaAjena,
      camposDeLinea(A, `Nombre inyectado ${token()}`),
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(
      JSON.stringify(
        await prisma.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineaAjena } }),
      ),
    ).toBe(antes);
  });

  it('R28: softDeleteAlive de una linea de B desde A devuelve false y no le marca deleted_at', async () => {
    const lineaAjena = B.lineas[0] ?? '';

    const resultado = await softDeleteAliveCatalogLine(
      lineaAjena,
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe(false);
    const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineaAjena } });
    expect(fila.deletedAt).toBeNull();
  });

  it('R28: controles positivos — desde B, la misma edicion y la misma baja SI escriben', async () => {
    const lineaPropia = B.lineas[0] ?? '';
    const nuevoNombre = `Linea de B renombrada ${token()}`;

    const editada = await replaceAliveCatalogLine(
      lineaPropia,
      camposDeLinea(B, nuevoNombre),
      B.userId,
      new Date(),
      ambitoDe(B),
    );
    expect(editada).toBe('ok');
    const trasEditar = await prisma.supplierCatalogLine.findUniqueOrThrow({
      where: { id: lineaPropia },
    });
    expect(trasEditar.name).toBe(nuevoNombre);
    expect(trasEditar.companyId).toBe(B.companyId);

    const borrada = await softDeleteAliveCatalogLine(
      lineaPropia,
      B.userId,
      new Date(),
      ambitoDe(B),
    );
    expect(borrada).toBe(true);
    const trasBorrar = await prisma.supplierCatalogLine.findUniqueOrThrow({
      where: { id: lineaPropia },
    });
    expect(trasBorrar.deletedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R30 — las dos altas escriben la empresa del AMBITO
// ---------------------------------------------------------------------------

describe('R30 — el alta de proveedor y el alta de linea escriben la empresa del ambito', () => {
  it('R30: cada proveedor y cada linea sembrados quedaron con la empresa de quien los dio de alta', async () => {
    for (const id of A.proveedores) {
      expect(await empresaDelProveedor(id)).toBe(A.companyId);
    }
    for (const id of A.lineas) {
      expect(await empresaDeLaLinea(id)).toBe(A.companyId);
    }
    for (const id of B.proveedores) {
      expect(await empresaDelProveedor(id)).toBe(B.companyId);
    }
  });

  it('R30: un alta nueva de C escribe la empresa de C, y no la ve nadie mas', async () => {
    const creado = await alta(C, `Proveedor de C ${token()}`);
    const linea = await altaDeLinea(C, creado, `Linea de C ${token()}`);

    expect(await empresaDelProveedor(creado)).toBe(C.companyId);
    expect(await empresaDeLaLinea(linea)).toBe(C.companyId);
    expect(await idsVisibles(A)).not.toContain(creado);
    expect(await idsVisibles(B)).not.toContain(creado);
    expect(await idsVisibles(C)).toContain(creado);
  });
});

// ---------------------------------------------------------------------------
// R19 — `findUnitRefs`, la unica costura nueva, y viene acotada
// ---------------------------------------------------------------------------

describe('R19 — findUnitRefs: de sistema, propia y ajena', () => {
  it('R19: la unidad de sistema vuelve para cualquier empresa', async () => {
    const desdeA = await findUnitRefs([SYSTEM_UNIT_ID], A.companyId);
    expect(desdeA.map((ref) => ref.id)).toEqual([SYSTEM_UNIT_ID]);

    const desdeB = await findUnitRefs([SYSTEM_UNIT_ID], B.companyId);
    expect(desdeB.map((ref) => ref.id)).toEqual([SYSTEM_UNIT_ID]);
  });

  it('R19: la unidad propia vuelve para su empresa', async () => {
    const propia = await findUnitRefs([A.unitId], A.companyId);
    expect(propia.map((ref) => ref.id)).toEqual([A.unitId]);
  });

  it('R19: la unidad de otra empresa NO vuelve', async () => {
    const ajena = await findUnitRefs([A.unitId], B.companyId);
    expect(ajena).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R16 — el duplicado de nombre, y el `meta.target` REAL del indice compuesto
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

let savepointSeq = 0;

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<unknown> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return error;
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

function metaTargetDe(error: unknown): readonly string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    throw new Error(`se esperaba un PrismaClientKnownRequestError, llego: ${String(error)}`);
  }
  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target as string[];
  throw new Error(`meta.target no vino: ${JSON.stringify(error.meta)}`);
}

describe("R16 — el duplicado de nombre llega al adaptador como 'duplicate', con el meta.target real", () => {
  it("R16: el adaptador traduce el 23505 del indice compuesto a 'duplicate', y acepta el mismo nombre en otra empresa", async () => {
    const nombre = `Quimicos del Pacifico ${token()}`;

    const primero = await alta(A, nombre);
    const segundoEnA = await createSupplier(
      proveedorNuevo(nombre.toUpperCase()),
      A.userId,
      new Date(),
      ambitoDe(A),
    );
    expect(segundoEnA).toBe('duplicate');

    // Control positivo: el MISMO nombre normalizado en OTRA empresa se acepta.
    const enB = await createSupplier(proveedorNuevo(nombre), B.userId, new Date(), ambitoDe(B));
    expect(enB).not.toBe('duplicate');
    if (enB !== 'duplicate') B.proveedores.push(enB.id);

    expect(primero).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('R16: el meta.target real del indice compuesto sigue siendo el que el adaptador reconoce', async () => {
    await inRolledBackTransaction(async (tx) => {
      const nombre = `Choque de nombre ${token()}`;
      const normalizado = normalizeSupplierName(nombre);
      await tx.supplier.create({
        data: {
          name: nombre,
          nameNormalized: normalizado,
          phone: '+57 300 000 0000',
          companyId: A.companyId,
        },
        select: { id: true },
      });

      const error = await expectRejectedByDatabase(
        tx,
        () =>
          tx.supplier.create({
            data: {
              name: nombre.toUpperCase(),
              nameNormalized: normalizado,
              phone: '+57 300 000 0000',
              companyId: A.companyId,
            },
            select: { id: true },
          }),
        'segundo proveedor vivo con el mismo nombre normalizado en la misma empresa',
      );

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      const target = metaTargetDe(error);
      // El indice paso a ser `(company_id, name_normalized)` y el `target` lo refleja: la
      // constante del adaptador compara contra la COLUMNA del nombre, asi que sigue
      // reconociendolo sin cambiar. Esto deja de ser una deduccion y pasa a estar medido.
      expect(target).toContain('name_normalized');
      expect(target).toContain('company_id');
      expect(isUniqueNameViolation(error)).toBe(true);
    });
  });

  it('R16: el unico de la LINEA no se confunde con el del nombre de proveedor', async () => {
    // Dos lineas con el mismo nombre normalizado y la misma presentacion en el mismo proveedor:
    // el 23505 que dispara es el de `supplier_catalog_lines`, y su objetivo NO es el del indice
    // de nombre de proveedor.
    const supplierId = C.proveedores[0] ?? '';
    const nombre = `Linea repetida ${token()}`;
    await altaDeLinea(C, supplierId, nombre);

    const segunda = await createCatalogLine(
      lineaNueva(C, supplierId, nombre.toUpperCase()),
      C.userId,
      new Date(),
      ambitoDe(C),
    );
    expect(segunda).toBe('duplicate');

    await inRolledBackTransaction(async (tx) => {
      const error = await expectRejectedByDatabase(
        tx,
        () =>
          tx.supplierCatalogLine.create({
            data: {
              companyId: C.companyId,
              supplierId,
              presentationId: C.presentationId,
              name: nombre,
              nameNormalized: normalizeSupplierName(nombre),
              cost: new Prisma.Decimal('10.0000'),
            },
            select: { id: true },
          }),
        'segunda linea viva con el mismo nombre y la misma presentacion',
      );

      const target = metaTargetDe(error);
      // Lo que importa: el objetivo del unico de la LINEA no es el indice de nombre de
      // proveedor, asi que nada de esto puede acabar contado como «nombre de proveedor
      // repetido».
      expect(target).not.toContain('suppliers_company_name_unique');
      expect(target.join(',')).not.toBe('company_id,name_normalized');
    });
  });
});

// ---------------------------------------------------------------------------
// R35 — quitar FORCE ROW LEVEL SECURITY no cambia NINGUN resultado
// ---------------------------------------------------------------------------

type Tabla = 'suppliers' | 'supplier_catalog_lines';

/** Todo lo que el modulo sabe contestar sobre una empresa, en una cadena comparable. */
async function retrato(empresa: Empresa, ajena: Empresa): Promise<string> {
  const ajeno = ajena.proveedores[0] ?? '';
  const lineaAjena = ajena.lineas[0] ?? '';
  const listado = await listAliveSuppliers(consulta(), ambitoDe(empresa));
  const fichaAjena = await findAliveSupplierById(ajeno, ambitoDe(empresa));
  const escrituraAjena = await updateAliveSupplier(
    ajeno,
    proveedorNuevo(`Inyectado ${token()}`),
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  const borradoAjeno = await softDeleteAliveSupplier(
    ajeno,
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  const catalogoAjeno = await listCatalogLinesBySupplierAlive(ajeno, consulta(), ambitoDe(empresa));
  const altaSobreAjeno = await createCatalogLine(
    lineaNueva(empresa, ajeno, `Inyectada ${token()}`),
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  const borradoDeLineaAjena = await softDeleteAliveCatalogLine(
    lineaAjena,
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  return JSON.stringify({
    proveedores: [...listado.items.map((r) => r.id)].sort(),
    total: listado.total,
    fichaAjena,
    escrituraAjena,
    borradoAjeno,
    catalogoAjeno,
    altaSobreAjeno,
    borradoDeLineaAjena,
    filaAjena: await foto(ajeno),
  });
}

async function forzarRls(tabla: Tabla, forzar: boolean): Promise<void> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${tabla}" ${forzar ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`,
  );
}

async function forceDe(tabla: Tabla): Promise<boolean | null> {
  const filas = await prisma.$queryRaw<{ relforcerowsecurity: boolean }[]>`
    SELECT c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ${tabla}`;
  return filas[0]?.relforcerowsecurity ?? null;
}

describe('R35 — quitar FORCE ROW LEVEL SECURITY no cambia NINGUN resultado', () => {
  it('R35: el retrato de A y el de B, sobre las dos tablas, es identico con FORCE y sin FORCE', async () => {
    // No prueba que la RLS proteja -Prisma conecta como DUENO de las tablas y no setea
    // `auth.uid()`-: prueba que el aislamiento NO depende de ella. Si quitarla cambiara algo, la
    // frontera estaria en la base y no en el adaptador.
    const conForceA = await retrato(A, B);
    const conForceB = await retrato(B, A);
    expect(await forceDe('suppliers')).toBe(true);
    expect(await forceDe('supplier_catalog_lines')).toBe(true);

    let sinForceA = '';
    let sinForceB = '';
    try {
      await forzarRls('suppliers', false);
      await forzarRls('supplier_catalog_lines', false);
      // Si el `ALTER` no hubiera entrado, dos retratos iguales no probarian nada.
      expect(await forceDe('suppliers')).toBe(false);
      expect(await forceDe('supplier_catalog_lines')).toBe(false);
      sinForceA = await retrato(A, B);
      sinForceB = await retrato(B, A);
    } finally {
      // Sin el `finally`, un fallo dejaria la base de la corrida con la RLS relajada.
      await forzarRls('suppliers', true);
      await forzarRls('supplier_catalog_lines', true);
    }

    expect(sinForceA).toBe(conForceA);
    expect(sinForceB).toBe(conForceB);

    // Del catalogo, sin fiarse del `finally`.
    expect(await forceDe('suppliers')).toBe(true);
    expect(await forceDe('supplier_catalog_lines')).toBe(true);
  });
});
