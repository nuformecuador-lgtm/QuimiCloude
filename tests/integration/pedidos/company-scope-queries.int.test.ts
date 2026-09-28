/**
 * QC-60 T13 — el ambito por empresa de `pedidos`, contra Postgres REAL.
 *
 * Un doble diria que el ambito «llego» aunque el adaptador lo compusiera al mismo nivel que un
 * filtro: lo que aqui se mide es el `where` que de verdad viaja al motor, y el `total` que el motor
 * cuenta. Los adaptadores hablan con el cliente Prisma GLOBAL —y el alta abre ademas su PROPIA
 * `prisma.$transaction`—, asi que una transaccion del test no los envolveria: se COMMITEA y se
 * limpia lo propio. Las empresas nacen aqui con nombre irrepetible, y por eso los `total` se
 * afirman como IGUALDAD y no como «al menos».
 *
 * Un `'not_found'` no prueba que no se escribiera: la fila ajena se RELEE entera despues de cada
 * escritura cruzada, y cada una lleva su control positivo para que un `updateMany` que nunca
 * escribe no deje verde el archivo.
 *
 * Cubre R12, R19, R21, R22, R23, R24, R29, R30, el lado por empresa de R13 y, de paso, R27 y R34
 * (ninguna firma ni forma de salida cambio).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { findAliveOrderTargetById } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import {
  cancelAliveOrder,
  createOrderWriteRepository,
  findAliveOrderById,
  listAliveOrders,
  softDeleteAliveOrder,
  updateAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { ListQuery } from '@/lib/modules/pedidos/domain/list-query';
import type { OrderPriority } from '@/lib/modules/pedidos/domain/order-classification';
import type { OrderScope } from '@/lib/modules/pedidos/domain/order-scope';
import type { NewOrder, OrderRow } from '@/lib/modules/pedidos/domain/order-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** El ANO de todas las filas de este archivo. Sale del reloj porque el `CHECK`
 *  `orders_order_year_matches_created_at` (QC-33 R41) ata `order_year` al ano UTC de
 *  `created_at`, y el alta por el adaptador escribe el `now` que se le pasa. */
const AHORA = new Date();
const ANO = AHORA.getUTCFullYear();

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** QC-146: presentacion de la MISMA empresa, obligatoria en toda alta por el adaptador. */
  readonly presentationId: string;
  /** En orden de siembra. Los casos los toman por indice. */
  readonly pedidos: string[];
};

let recetaId: string;
/** Unidad de SISTEMA compartida: `presentations.unit_id` es obligatoria y una unidad no tiene
 *  que ser de una empresa concreta para servir a las cuatro presentaciones de este archivo. */
let unitId: string;

/** Tres pedidos vivos, uno con borrado logico (4) y uno cancelado (5). */
let A: Empresa;
/** Seis pedidos vivos: recuento distinto del de A, para que un `total` con filas ajenas no
 *  coincida por casualidad. */
let B: Empresa;
/** Sin ningun pedido: la primera alta de su serie tiene que recibir 1. */
let C: Empresa;
/** Con 37, 44 y 77 —lo que el backfill deja en la base real para QuimiCloud (R13)— sembrado en una
 *  empresa efimera propia: la base de la corrida es una copia de la plantilla, no la de desarrollo,
 *  y no trae esos tres pedidos. */
let Q: Empresa;

function ambitoDe(empresa: Empresa): OrderScope {
  return { companyId: empresa.companyId };
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
  // `orders.created_by` y `order_assignments.user_id` son FK reales a `users`.
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
      nameNormalized: normalizePresentationName(`Bidon ${marca}`),
      unitId,
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
    pedidos: [],
  };
}

type SiembraDePedido = {
  readonly sequence: number;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status?: 'PENDIENTE' | 'EN_CURSO' | 'CANCELADO';
  readonly cancellationReason?: string;
  readonly deleted?: boolean;
};

/** Con `prisma.order.create` y no con el adaptador: la siembra tiene que poder ELEGIR el
 *  correlativo —37, 44, 77— para montar el escenario del backfill. */
async function sembrarPedido(empresa: Empresa, datos: SiembraDePedido): Promise<string> {
  const { id } = await prisma.order.create({
    data: {
      companyId: empresa.companyId,
      orderYear: ANO,
      orderSequence: datos.sequence,
      recipeId: recetaId,
      quantity: datos.quantity,
      priority: datos.priority,
      status: datos.status ?? 'PENDIENTE',
      cancellationReason: datos.cancellationReason ?? null,
      createdBy: empresa.userId,
      updatedBy: empresa.userId,
      createdAt: AHORA,
      deletedAt: datos.deleted === true ? AHORA : null,
    },
    select: { id: true },
  });
  empresa.pedidos.push(id);
  return id;
}

function pedidoNuevo(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId: recetaId,
    quantity: '7.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    unitId,
    presentationLines: [],
    ...overrides,
  };
}

/** Alta por el adaptador REAL: la transaccion, el lock y el `max()+1` son los de produccion. */
async function alta(empresa: Empresa): Promise<OrderRow> {
  const resultado = await withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(
      pedidoNuevo(),
      ANO,
      empresa.userId,
      new Date(),
      null,
      ambitoDe(empresa),
    ),
  );
  empresa.pedidos.push(resultado.id);
  return resultado;
}

beforeAll(async () => {
  const marcaUnidad = token();
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marcaUnidad}`, nameNormalized: `unidad${marcaUnidad}`, symbol: `kg${marcaUnidad}` },
    select: { id: true },
  });
  unitId = unit.id;

  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');
  C = await sembrarEmpresa('C');
  Q = await sembrarEmpresa('Q');

  // Receta compartida por los cuatro escenarios de pedidos: lo que este archivo mide es el
  // ambito por empresa de `orders`, no el de `recetas`, asi que se ancla a la primera empresa
  // sembrada (A) igual que el resto del andamiaje comun de este archivo.
  const marcaReceta = token();
  const receta = await prisma.recipe.create({
    data: { name: `Receta ${marcaReceta}`, nameNormalized: `receta${marcaReceta}`, companyId: A.companyId },
    select: { id: true },
  });
  recetaId = receta.id;

  // A: tres vivos, el 4 BORRADO y el 5 CANCELADO. El maximo de su serie es 5.
  await sembrarPedido(A, { sequence: 1, quantity: '10.0000', priority: 'BAJA' });
  await sembrarPedido(A, { sequence: 2, quantity: '20.0000', priority: 'MEDIA', status: 'EN_CURSO' });
  await sembrarPedido(A, { sequence: 3, quantity: '30.0000', priority: 'ALTA' });
  await sembrarPedido(A, { sequence: 4, quantity: '40.0000', priority: 'BAJA', deleted: true });
  await sembrarPedido(A, {
    sequence: 5,
    quantity: '50.0000',
    priority: 'BAJA',
    status: 'CANCELADO',
    cancellationReason: 'cancelado en la siembra',
  });

  // B: seis vivos, todos CRITICA y con cantidades (910..960) que no se solapan con las de A.
  for (let i = 1; i <= 6; i += 1) {
    await sembrarPedido(B, {
      sequence: i,
      quantity: `${String(900 + i * 10)}.0000`,
      priority: 'CRITICA',
    });
  }

  // Una asignacion de B, para R29: el borrado logico de la empresa no puede llevarsela.
  await prisma.orderAssignment.create({
    data: { orderId: B.pedidos[0] ?? '', userId: B.userId, companyId: B.companyId },
  });

  // Q: el escenario del backfill, con sus huecos, sin renumerar.
  await sembrarPedido(Q, { sequence: 37, quantity: '1.0000', priority: 'BAJA' });
  await sembrarPedido(Q, { sequence: 44, quantity: '1.0000', priority: 'BAJA' });
  await sembrarPedido(Q, { sequence: 77, quantity: '1.0000', priority: 'BAJA' });
});

afterAll(async () => {
  const empresas = [A, B, C, Q].filter((empresa): empresa is Empresa => empresa !== undefined);
  // En el orden que exigen las FK: la del pedido desde la asignacion es `ON DELETE RESTRICT`, y
  // la receta compartida (ancla a A, QC-50) tambien es RESTRICT hacia `companies` -asi que se
  // borra ANTES que las empresas, no despues-.
  for (const empresa of empresas) {
    await prisma.orderAssignment.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.order.deleteMany({ where: { companyId: empresa.companyId } });
  }
  if (recetaId !== undefined) await prisma.recipe.deleteMany({ where: { id: recetaId } });
  // Las presentaciones DESPUES de borrar los pedidos (arriba) y ANTES que las empresas:
  // `orders_company_id_presentation_id_fkey` y `presentations_company_id_fkey` son RESTRICT.
  for (const empresa of empresas) {
    await prisma.presentation.deleteMany({ where: { id: empresa.presentationId } });
  }
  for (const empresa of empresas) {
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  if (unitId !== undefined) await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.$disconnect();
});

/** Todas las columnas: comparar solo el estado dejaria pasar un `updated_at` movido. */
async function foto(id: string): Promise<string> {
  const fila = await prisma.order.findUniqueOrThrow({ where: { id } });
  return JSON.stringify(fila);
}

/** De la columna, porque el contrato de salida no publica la empresa (R23). */
async function empresaDelPedido(id: string): Promise<string> {
  const fila = await prisma.order.findUniqueOrThrow({ where: { id }, select: { companyId: true } });
  return fila.companyId;
}

async function correlativosDe(empresa: Empresa): Promise<number[]> {
  const filas = await prisma.order.findMany({
    where: { companyId: empresa.companyId },
    select: { orderSequence: true },
    orderBy: { orderSequence: 'asc' },
  });
  return filas.map((fila) => fila.orderSequence);
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, pageSize: 25, sort: null, filters: {}, search: '', ...partial };
}

async function idsVisibles(empresa: Empresa): Promise<string[]> {
  const pagina = await listAliveOrders(consulta(), null, ambitoDe(empresa));
  return pagina.items.map((item) => item.id);
}

describe('R19 — el listado devuelve EXACTAMENTE los pedidos de su empresa, y el total tambien', () => {
  it('A ve sus cuatro vivos —el cancelado incluido— y ninguno de los seis de B', async () => {
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(A));

    const vivosDeA = [A.pedidos[0], A.pedidos[1], A.pedidos[2], A.pedidos[4]];
    expect([...pagina.items.map((o) => o.id)].sort()).toEqual([...vivosDeA].sort());
    // Si el `count` usara otro `where` que el `findMany`, aqui saldrian 10 con cuatro elementos.
    expect(pagina.total).toBe(4);
    expect(pagina.totalPages).toBe(1);

    for (const ajeno of B.pedidos) {
      expect(pagina.items.map((o) => o.id)).not.toContain(ajeno);
    }
  });

  it('B ve sus seis y ninguno de los de A', async () => {
    // Atrapa un adaptador que devolviera siempre las filas de la primera empresa sembrada.
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(B));

    expect([...pagina.items.map((o) => o.id)].sort()).toEqual([...B.pedidos].sort());
    expect(pagina.total).toBe(6);
    for (const ajeno of A.pedidos) {
      expect(pagina.items.map((o) => o.id)).not.toContain(ajeno);
    }
  });

  it('el pedido con borrado logico de A no aparece: el ambito no sustituye a deleted_at', async () => {
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(A));
    expect(pagina.items.map((o) => o.id)).not.toContain(A.pedidos[3]);
    expect(pagina.total).toBe(4);
  });

  it('una empresa sin pedidos ve la lista vacia, no la de al lado', async () => {
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(C));
    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);
  });

  it('R23: ni el resumen de la lista, ni la ficha, ni el catalogo publican la empresa', async () => {
    // Sobre las CLAVES y no sobre el JSON: un `companyId: undefined` no viajaria serializado pero
    // estaria en el contrato.
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(A));
    expect(pagina.items.length).toBeGreaterThan(0);
    for (const item of pagina.items) {
      expect(Object.keys(item)).not.toContain('companyId');
    }

    const ficha = await findAliveOrderById(A.pedidos[0] ?? '', ambitoDe(A));
    expect(ficha).not.toBeNull();
    expect(Object.keys(ficha ?? {})).not.toContain('companyId');

    const target = await findAliveOrderTargetById(A.pedidos[0] ?? '', A.companyId);
    expect(target).not.toBeNull();
    expect(Object.keys(target ?? {})).not.toContain('companyId');
  });
});

describe('R19 — los filtros, el orden y la paginacion NO ensanchan lo visible', () => {
  it('un filtro de prioridad que solo casa con filas de B devuelve cero desde A', async () => {
    // Si `companyId` y el filtro fueran hermanos dentro de un `OR`, las seis de B entrarian por
    // cumplir el filtro.
    const filters = { priority: { kind: 'select' as const, values: ['CRITICA'] } };
    const desdeA = await listAliveOrders(consulta({ filters }), null, ambitoDe(A));
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    // Sin este control, un filtro roto que devolviera siempre cero dejaria verde lo de arriba.
    const desdeB = await listAliveOrders(consulta({ filters }), null, ambitoDe(B));
    expect(desdeB.total).toBe(6);
  });

  it('un rango de cantidad que solo casa con filas de B devuelve cero desde A', async () => {
    const filters = { quantity: { kind: 'numberRange' as const, min: 900, max: 999 } };
    const desdeA = await listAliveOrders(consulta({ filters }), null, ambitoDe(A));
    expect(desdeA.items).toEqual([]);
    expect(desdeA.total).toBe(0);

    const desdeB = await listAliveOrders(consulta({ filters }), null, ambitoDe(B));
    expect(desdeB.total).toBe(6);
  });

  it('un filtro de estado que casa en las dos empresas solo trae los de la propia', async () => {
    // PENDIENTE casa con dos de A y con los seis de B: el total tiene que ser 2, no 8.
    const filters = { status: { kind: 'select' as const, values: ['PENDIENTE'] } };
    const desdeA = await listAliveOrders(consulta({ filters }), null, ambitoDe(A));
    expect([...desdeA.items.map((o) => o.id)].sort()).toEqual([A.pedidos[0], A.pedidos[2]].sort());
    expect(desdeA.total).toBe(2);
  });

  it('el orden por cantidad con una pagina corta tampoco cuela filas ajenas', async () => {
    // Si el ambito se aplicara DESPUES de paginar, aqui entrarian las de B, que ganan el orden.
    const pagina = await listAliveOrders(
      consulta({ pageSize: 2, sort: { columnId: 'quantity', direction: 'desc' } }),
      null,
      ambitoDe(A),
    );

    expect(pagina.total).toBe(4);
    expect(pagina.totalPages).toBe(2);
    expect(pagina.items.map((o) => o.quantity)).toEqual(['50.0000', '30.0000']);
    for (const ajeno of B.pedidos) {
      expect(pagina.items.map((o) => o.id)).not.toContain(ajeno);
    }
  });

  it('el orden por correlativo no mezcla los numeros homonimos de la otra empresa', async () => {
    // A y B comparten las parejas (ano, 1..3): con unicidad global no podrian existir, y ordenar
    // por el numero es la forma mas facil de que se intercalen.
    const pagina = await listAliveOrders(
      consulta({ sort: { columnId: 'orderNumber', direction: 'asc' } }),
      null,
      ambitoDe(A),
    );
    expect(pagina.items.map((o) => o.number.sequence)).toEqual([1, 2, 3, 5]);
    expect(pagina.total).toBe(4);
  });
});

describe('R21 — findAliveById / updateAlive / cancelAlive / softDeleteAlive con un id AJENO', () => {
  it('la ficha de un pedido de B, pedida desde A, es null —y desde B no lo es', async () => {
    expect(await findAliveOrderById(B.pedidos[1] ?? '', ambitoDe(A))).toBeNull();
    const propia = await findAliveOrderById(B.pedidos[1] ?? '', ambitoDe(B));
    expect(propia?.id).toBe(B.pedidos[1]);
  });

  it('R27: el catalogo que consume `asignaciones` tampoco resuelve el pedido ajeno', async () => {
    expect(await findAliveOrderTargetById(B.pedidos[1] ?? '', A.companyId)).toBeNull();
    const propio = await findAliveOrderTargetById(B.pedidos[1] ?? '', B.companyId);
    expect(propio?.id).toBe(B.pedidos[1]);
  });

  it('updateAlive de un pedido de B desde A devuelve not_found y NO toca la fila', async () => {
    const ajeno = B.pedidos[1] ?? '';
    const antes = await foto(ajeno);

    const resultado = await updateAliveOrder(
      ajeno,
      pedidoNuevo({ quantity: '1.0000' }),
      A.userId,
      new Date(),
      null,
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(await foto(ajeno)).toBe(antes);
  });

  it('control positivo: el mismo updateAlive, desde B, SI escribe', async () => {
    // Sin este caso, un `updateMany` que nunca actualizara dejaria verde el anterior.
    // ENMIENDA: `updateAliveOrder` ya no escribe `status` -el pedido se queda en `PENDIENTE`, con
    // el que nacio en la siembra-, asi que lo que demuestra el escrito es la prioridad y la
    // cantidad, no el estado.
    const propio = B.pedidos[1] ?? '';
    const antes = await foto(propio);

    const resultado = await updateAliveOrder(
      propio,
      pedidoNuevo({ quantity: '921.0000', priority: 'CRITICA' }),
      B.userId,
      new Date(),
      null,
      ambitoDe(B),
    );

    expect(resultado).toBe('ok');
    expect(await foto(propio)).not.toBe(antes);
    const fila = await prisma.order.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.status).toBe('PENDIENTE');
    expect(fila.priority).toBe('CRITICA');
    expect(fila.companyId).toBe(B.companyId);
  });

  it('cancelAlive de un pedido de B desde A devuelve not_found y NO lo cancela', async () => {
    const ajeno = B.pedidos[2] ?? '';
    const antes = await foto(ajeno);

    const resultado = await cancelAliveOrder(
      ajeno,
      'motivo inyectado desde A',
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(await foto(ajeno)).toBe(antes);
    const fila = await prisma.order.findUniqueOrThrow({ where: { id: ajeno } });
    expect(fila.status).not.toBe('CANCELADO');
    expect(fila.cancellationReason).toBeNull();
  });

  it('control positivo: el mismo cancelAlive, desde B, SI cancela', async () => {
    const propio = B.pedidos[2] ?? '';

    const resultado = await cancelAliveOrder(
      propio,
      'cancelado por su propia empresa',
      B.userId,
      new Date(),
      ambitoDe(B),
    );

    expect(resultado).toBe('ok');
    const fila = await prisma.order.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.status).toBe('CANCELADO');
    expect(fila.cancellationReason).toBe('cancelado por su propia empresa');
    // Un cancelado NO desaparece del listado: tiene estado propio para eso.
    expect(await idsVisibles(B)).toContain(propio);
  });

  it('softDeleteAlive de un pedido de B desde A devuelve not_found y NO le marca deleted_at', async () => {
    const ajeno = B.pedidos[3] ?? '';
    const antes = await foto(ajeno);

    const resultado = await softDeleteAliveOrder(ajeno, A.userId, new Date(), ambitoDe(A));

    expect(resultado).toBe('not_found');
    expect(await foto(ajeno)).toBe(antes);
    const fila = await prisma.order.findUniqueOrThrow({ where: { id: ajeno } });
    expect(fila.deletedAt).toBeNull();
    expect(await idsVisibles(B)).toContain(ajeno);
  });

  it('control positivo: softDeleteAlive desde B SI marca la fila, y desaparece de su listado', async () => {
    const propio = B.pedidos[3] ?? '';

    const resultado = await softDeleteAliveOrder(propio, B.userId, new Date(), ambitoDe(B));

    expect(resultado).toBe('ok');
    const fila = await prisma.order.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.deletedAt).not.toBeNull();
    const desdeB = await listAliveOrders(consulta(), null, ambitoDe(B));
    expect(desdeB.items.map((o) => o.id)).not.toContain(propio);
    expect(desdeB.total).toBe(5);
  });

  it('ninguna de las escrituras cruzadas creo, movio ni borro nada del lado de A', async () => {
    const pagina = await listAliveOrders(consulta(), null, ambitoDe(A));
    expect(pagina.total).toBe(4);
    expect(await correlativosDe(A)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('R22, R24, R12, R13 — el alta escribe la empresa del AMBITO y numera en SU serie', () => {
  it('R12: la primera alta de una empresa sin pedidos de ese ano recibe 1', async () => {
    const creado = await alta(C);

    expect(creado.number).toEqual({ year: ANO, sequence: 1 });
    // R22: la empresa escrita en la columna es la del ambito.
    expect(await empresaDelPedido(creado.id)).toBe(C.companyId);
    expect(await correlativosDe(C)).toEqual([1]);
    // Y no la ve nadie mas.
    expect(await idsVisibles(A)).not.toContain(creado.id);
    expect(await idsVisibles(B)).not.toContain(creado.id);
  });

  it('R13: la siguiente alta de la empresa con 37, 44 y 77 recibe 78 —no 1, ni 4, ni un hueco—', async () => {
    // El escenario que el backfill deja para QuimiCloud en 2026: la serie continua desde el MAXIMO
    // y no desde el recuento, asi que los huecos se conservan y nadie los rellena.
    const creado = await alta(Q);

    expect(creado.number.sequence).toBe(78);
    expect(await empresaDelPedido(creado.id)).toBe(Q.companyId);
    expect(await correlativosDe(Q)).toEqual([37, 44, 77, 78]);
  });

  it('R12: ni el pedido borrado ni el cancelado liberan su numero', async () => {
    // A tiene 1, 2, 3, el 4 BORRADO y el 5 CANCELADO. Si el maximo filtrara `deleted_at`, esta alta
    // recibiria 4; si filtrara ademas el estado, 4 tambien. Tiene que recibir 6.
    const creado = await alta(A);
    expect(creado.number.sequence).toBe(6);
    expect(await empresaDelPedido(creado.id)).toBe(A.companyId);

    // Y el numero recien entregado tampoco se libera al borrarlo.
    expect(await softDeleteAliveOrder(creado.id, A.userId, new Date(), ambitoDe(A))).toBe('ok');
    const siguiente = await alta(A);
    expect(siguiente.number.sequence).toBe(7);
    expect(await correlativosDe(A)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('R24: el maximo se lee de la empresa que se escribe, no de la de mas numeros', async () => {
    // Q va por el 78 y A por el 7: si el subselect del maximo no filtrara por la MISMA empresa que
    // la columna, el alta de B saldria 79 y no 7.
    const creado = await alta(B);
    expect(creado.number.sequence).toBe(7);
    expect(await empresaDelPedido(creado.id)).toBe(B.companyId);
    // Y la misma pareja (ano, 7) convive ya en A y en B.
    expect(await prisma.order.count({ where: { orderYear: ANO, orderSequence: 7, companyId: { in: [A.companyId, B.companyId] } } })).toBe(2);
  });

  it('R23: la salida del alta tampoco lleva la empresa', async () => {
    const creado = await alta(C);
    expect(creado.number.sequence).toBe(2);
    expect(Object.keys(creado)).not.toContain('companyId');
  });
});

/** Todo lo que el modulo sabe contestar sobre una empresa, en una cadena comparable. */
async function retrato(empresa: Empresa, ajena: Empresa): Promise<string> {
  const listado = await listAliveOrders(consulta(), null, ambitoDe(empresa));
  const fichaAjena = await findAliveOrderById(ajena.pedidos[0] ?? '', ambitoDe(empresa));
  const catalogoAjeno = await findAliveOrderTargetById(ajena.pedidos[0] ?? '', empresa.companyId);
  const escrituraAjena = await updateAliveOrder(
    ajena.pedidos[0] ?? '',
    pedidoNuevo({ quantity: '2.0000' }),
    empresa.userId,
    new Date(),
    null,
    ambitoDe(empresa),
  );
  const cancelacionAjena = await cancelAliveOrder(
    ajena.pedidos[0] ?? '',
    'no deberia escribirse',
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  return JSON.stringify({
    pedidos: [...listado.items.map((o) => o.id)].sort(),
    total: listado.total,
    fichaAjena,
    catalogoAjeno,
    escrituraAjena,
    cancelacionAjena,
    filaAjena: await foto(ajena.pedidos[0] ?? ''),
  });
}

async function forzarRls(forzar: boolean): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE "orders" ${forzar ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`);
}

async function forceDeOrders(): Promise<boolean | null> {
  const filas = await prisma.$queryRaw<{ relforcerowsecurity: boolean }[]>`
    SELECT c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'orders'`;
  return filas[0]?.relforcerowsecurity ?? null;
}

describe('R30 — quitar FORCE ROW LEVEL SECURITY no cambia NINGUN resultado', () => {
  it('el retrato de A y el de B son identicos con FORCE y sin FORCE', async () => {
    // No prueba que la RLS proteja —Prisma conecta como DUENO de las tablas y no setea
    // `auth.uid()`—: prueba que el aislamiento NO depende de ella. Si quitarla cambiara algo, la
    // frontera estaria en la base y no en el service.
    const conForceA = await retrato(A, B);
    const conForceB = await retrato(B, A);
    expect(await forceDeOrders()).toBe(true);

    let sinForceA = '';
    let sinForceB = '';
    try {
      await forzarRls(false);
      // Si el `ALTER` no hubiera entrado, dos retratos iguales no probarian nada.
      expect(await forceDeOrders()).toBe(false);
      sinForceA = await retrato(A, B);
      sinForceB = await retrato(B, A);
    } finally {
      // Sin el `finally`, un fallo dejaria la base de la corrida con la RLS relajada.
      await forzarRls(true);
    }

    expect(sinForceA).toBe(conForceA);
    expect(sinForceB).toBe(conForceB);

    // Del catalogo, sin fiarse del `finally`.
    expect(await forceDeOrders()).toBe(true);
  });
});

describe('R29 — marcar la empresa como borrada no toca sus pedidos ni sus asignaciones', () => {
  it('los pedidos y la asignacion de B sobreviven enteros a su propio borrado logico', async () => {
    const pedidosAntes = await prisma.order.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });
    const asignacionesAntes = await prisma.orderAssignment.findMany({
      where: { companyId: B.companyId },
      orderBy: { orderId: 'asc' },
    });
    expect(pedidosAntes.length).toBeGreaterThan(0);
    expect(asignacionesAntes.length).toBe(1);
    const listadoAntes = await idsVisibles(B);

    try {
      await prisma.company.update({
        where: { id: B.companyId },
        data: { deletedAt: new Date() },
      });
      // Si el `update` no hubiera escrito, lo de abajo no diria nada.
      const empresa = await prisma.company.findUniqueOrThrow({ where: { id: B.companyId } });
      expect(empresa.deletedAt).not.toBeNull();

      // Filas ENTERAS y no conteos: un borrado que vaciara el motivo conservaria el conteo.
      expect(
        JSON.stringify(
          await prisma.order.findMany({ where: { companyId: B.companyId }, orderBy: { id: 'asc' } }),
        ),
      ).toBe(JSON.stringify(pedidosAntes));
      expect(
        JSON.stringify(
          await prisma.orderAssignment.findMany({
            where: { companyId: B.companyId },
            orderBy: { orderId: 'asc' },
          }),
        ),
      ).toBe(JSON.stringify(asignacionesAntes));

      // El ambito mira la empresa, no si esta viva: si una empresa de baja puede operar lo decide
      // `identity`, no un filtro escondido en `pedidos`.
      expect(await idsVisibles(B)).toEqual(listadoAntes);
      expect(await idsVisibles(A)).not.toContain(B.pedidos[0]);
    } finally {
      await prisma.company.update({ where: { id: B.companyId }, data: { deletedAt: null } });
    }
  });
});
