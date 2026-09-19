/**
 * Casos de uso cableados con el adaptador Prisma real, porque solo la base demuestra que una unidad
 * inexistente vuelve como `invalid_input` traducida del rechazo de la FK y no de una comprobacion
 * previa.
 * Sin transaccion con ROLLBACK: el adaptador usa el cliente Prisma global, que corre en otra
 * conexion y no veria las filas de la transaccion. Cada fila se borra en el `afterAll` por su `id`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inventario } from '@/lib/composition';
import {
  PresentationDuplicateNameError,
  PresentationUnitLockedError,
  ValidationError,
} from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/inventario';

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Una sola empresa para el archivo: las filas sembradas por Prisma y las creadas por el caso de
 *  uso tienen que caer en la misma o dejarian de verse entre si. */
let empresaDelArchivo: string;

beforeAll(async () => {
  const nombre = `Empresa presentacion-unidad ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;
});

/** Actor autorizado, tal como lo construiria la Server Action a partir de la sesion. */
function actorAutorizado(): Actor {
  return { id: randomUUID(), companyId: empresaDelArchivo, permissions: ['inventario.modificar'] };
}

const lotesSembrados: string[] = [];
const productosSembrados: string[] = [];
const presentacionesSembradas: string[] = [];
const unidadesSembradas: string[] = [];

/** Simbolo derivado del marcador: es unico dentro del ambito y un literal fijo chocaria con el
 *  catalogo arrancador. */
async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  unidadesSembradas.push(id);
  return id;
}

/** Sin pasar por el caso de uso, para construir el estado de partida. */
async function sembrarPresentacion(unitId: string): Promise<{ id: string; marca: string }> {
  const marca = token();
  const { id } = await prisma.presentation.create({
    data: {
      name: `Presentacion ${marca}`,
      nameNormalized: `presentacion${marca}`,
      unitId,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  presentacionesSembradas.push(id);
  return { id, marca };
}

async function sembrarProducto(unitId: string | null = null): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Producto ${marca}`,
      nameNormalized: `producto${marca}`,
      unitId,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  productosSembrados.push(id);
  return id;
}

/** Existencia e importe reales: es la fila que escribir una presentacion no debe tocar. */
async function sembrarLote(productId: string, presentationId: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    // `product_batches_check_company` exige la misma empresa en lote, producto y presentacion,
    // y `lot` es unico por empresa.
    data: {
      productId,
      presentationId,
      stock: 17,
      unitCost: '123.4500',
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  lotesSembrados.push(id);
  return id;
}

/** Registra una presentacion creada POR EL CASO DE USO para que el `afterAll` la borre. */
function anotarParaBorrar(id: string): string {
  presentacionesSembradas.push(id);
  return id;
}

afterAll(async () => {
  // Por `id` exacto y en el orden que exigen las FK.
  await prisma.inventoryMovement.deleteMany({ where: { batchId: { in: lotesSembrados } } });
  await prisma.productBatch.deleteMany({ where: { id: { in: lotesSembrados } } });
  await prisma.product.deleteMany({ where: { id: { in: productosSembrados } } });
  await prisma.presentation.deleteMany({ where: { id: { in: presentacionesSembradas } } });
  await prisma.unit.deleteMany({ where: { id: { in: unidadesSembradas } } });
  // La empresa va la ultima: la referencian las tres tablas de inventario.
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

describe('R13 — la unidad que no existe en el catalogo se rechaza con invalid_input y no escribe nada', () => {
  it('el ALTA con una unidad inexistente falla y no deja ninguna presentacion', async () => {
    // El uuid pasa zod y no existe en `units`: solo `presentations_unit_id_fkey` puede
    // rechazarlo, y eso es lo que el unitario no demuestra.
    const marca = token();
    const nombre = `Bidon fantasma ${marca}`;

    await expect(
      inventario.createPresentation({ name: nombre, unitId: randomUUID() }, actorAutorizado()),
    ).rejects.toBeInstanceOf(ValidationError);

    const supervivientes = await prisma.presentation.findMany({
      where: { name: nombre },
      select: { id: true },
    });
    expect(supervivientes).toEqual([]);
  });

  it('el rechazo por unidad inexistente es DISTINGUIBLE del rechazo por nombre duplicado', async () => {
    // Si el adaptador tradujera cualquier rechazo a «ya existe ese nombre», la pantalla pediria
    // cambiar el nombre ante una unidad rota.
    const unitId = await sembrarUnidad();
    const marca = token();
    const nombre = `Caneca ${marca}`;

    const creada = await inventario.createPresentation({ name: nombre, unitId }, actorAutorizado());
    anotarParaBorrar(creada.id);

    await expect(
      inventario.createPresentation({ name: nombre, unitId }, actorAutorizado()),
    ).rejects.toBeInstanceOf(PresentationDuplicateNameError);

    await expect(
      inventario.createPresentation(
        { name: `Caneca otra ${marca}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // Descarta que el error de unidad sea un duplicado por herencia.
    await expect(
      inventario.createPresentation(
        { name: `Caneca otra ${marca}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.not.toBeInstanceOf(PresentationDuplicateNameError);
    expect(new ValidationError().code).toBe('invalid_input');
    expect(new PresentationDuplicateNameError().code).toBe('presentation_duplicate_name');
  });

  it('la EDICION con una unidad inexistente falla y deja la presentacion con su unidad anterior', async () => {
    // La fila no puede quedar a medias: ni el nombre nuevo sin la unidad nueva, ni al reves.
    const unitId = await sembrarUnidad();
    const { id, marca } = await sembrarPresentacion(unitId);

    await expect(
      inventario.updatePresentation(
        id,
        { name: `Renombrada ${marca}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id },
      select: { name: true, unitId: true },
    });
    expect(despues).toEqual({ name: `Presentacion ${marca}`, unitId });
  });
});

describe('R12 — la edicion REEMPLAZA la unidad', () => {
  it('editar con otra unidad deja la nueva en la columna, y no conserva la anterior', async () => {
    // Nombre y unidad a la vez, para que un adaptador que escribiera solo `name` se ponga rojo.
    const unidadVieja = await sembrarUnidad();
    const unidadNueva = await sembrarUnidad();
    const { id, marca } = await sembrarPresentacion(unidadVieja);

    await inventario.updatePresentation(
      id,
      { name: `Presentacion editada ${marca}`, unitId: unidadNueva },
      actorAutorizado(),
    );

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id },
      select: { name: true, nameNormalized: true, unitId: true },
    });
    expect(despues.unitId).toBe(unidadNueva);
    expect(despues.unitId).not.toBe(unidadVieja);
    expect(despues.name).toBe(`Presentacion editada ${marca}`);
    // Sin esto, la presentacion quedaria encontrable por su nombre viejo, en silencio.
    expect(despues.nameNormalized).toBe(`presentacioneditada${marca}`);
  });

  it('la unidad tambien se puede editar SIN cambiar el nombre', async () => {
    // Si la edicion solo tocara `unit_id` cuando cambia el nombre, aqui quedaria la unidad vieja.
    const unidadVieja = await sembrarUnidad();
    const unidadNueva = await sembrarUnidad();
    const { id, marca } = await sembrarPresentacion(unidadVieja);

    await inventario.updatePresentation(
      id,
      { name: `Presentacion ${marca}`, unitId: unidadNueva },
      actorAutorizado(),
    );

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id },
      select: { name: true, unitId: true },
    });
    expect(despues).toEqual({ name: `Presentacion ${marca}`, unitId: unidadNueva });
  });
});

describe('R28 — ni el alta ni la edicion de una presentacion mueven ninguna existencia ni ningun importe', () => {
  it('crear y editar presentaciones deja el lote del producto identico, hasta el ultimo decimal', async () => {
    // El lote apunta a la presentacion que se edita: un `update` en cascada o un recalculo se lo
    // llevaria por delante.
    const unidadVieja = await sembrarUnidad();
    const unidadNueva = await sembrarUnidad();
    const { id: presentationId, marca } = await sembrarPresentacion(unidadVieja);
    // La unidad de la presentacion: sin ella, `product_batches_check_unit` rechazaria el lote
    // de mas abajo.
    const productId = await sembrarProducto(unidadVieja);
    const loteId = await sembrarLote(productId, presentationId);

    const loteAntes = await prisma.productBatch.findUniqueOrThrow({ where: { id: loteId } });
    const lotesAntes = await prisma.productBatch.count({ where: { productId } });
    // La cuenta de pedidos se compara consigo misma: no afirma cuantos hay, sino que este camino
    // no escribe ninguno.
    const pedidosAntes = await prisma.order.count();

    const creada = await inventario.createPresentation(
      { name: `Presentacion nueva ${marca}`, unitId: unidadNueva },
      actorAutorizado(),
    );
    anotarParaBorrar(creada.id);
    // La MISMA unidad, no `unidadNueva`: la presentacion ya tiene el lote sembrado arriba, y
    // eso bloquea el cambio de unidad de una presentacion con lotes. Editar el nombre sin
    // tocar la unidad sigue aceptandose igual que antes.
    await inventario.updatePresentation(
      presentationId,
      { name: `Presentacion editada ${marca}`, unitId: unidadVieja },
      actorAutorizado(),
    );

    const loteDespues = await prisma.productBatch.findUniqueOrThrow({ where: { id: loteId } });
    expect(loteDespues).toEqual(loteAntes);
    expect(loteDespues.stock).toBe(17);
    expect(loteDespues.unitCost.toFixed(4)).toBe('123.4500');
    expect(loteDespues.presentationId).toBe(presentationId);

    expect(await prisma.productBatch.count({ where: { productId } })).toBe(lotesAntes);
    expect(await prisma.order.count()).toBe(pedidosAntes);

    const producto = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    // La unidad del producto es la que se le dio al sembrar, y la edicion de la presentacion
    // no la mueve -ni siquiera cuando toca el nombre-.
    expect(producto.unitId).toBe(unidadVieja);
  });
});

describe('R20/R21 — la presentacion con lotes no cambia de unidad, sin lotes o con la misma unidad si', () => {
  it('rechaza el cambio de unidad con PresentationUnitLockedError y deja la presentacion sin modificar', async () => {
    const unidadOriginal = await sembrarUnidad();
    const otraUnidad = await sembrarUnidad();
    const { id: presentationId, marca } = await sembrarPresentacion(unidadOriginal);
    const productId = await sembrarProducto(unidadOriginal);
    await sembrarLote(productId, presentationId);

    await expect(
      inventario.updatePresentation(
        presentationId,
        { name: `Renombrada ${marca}`, unitId: otraUnidad },
        actorAutorizado(),
      ),
    ).rejects.toBeInstanceOf(PresentationUnitLockedError);

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id: presentationId },
      select: { name: true, unitId: true },
    });
    expect(despues).toEqual({ name: `Presentacion ${marca}`, unitId: unidadOriginal });
  });

  it('el rechazo por unidad bloqueada es DISTINGUIBLE del rechazo por unidad inexistente', async () => {
    // Dos presentaciones distintas: una CON lote, para forzar `unit_locked`; otra SIN ninguno,
    // para que la unica causa posible de rechazo sea la FK de `invalid_unit`.
    const unidadOriginal = await sembrarUnidad();
    const { id: conLote, marca: marcaConLote } = await sembrarPresentacion(unidadOriginal);
    const productId = await sembrarProducto(unidadOriginal);
    await sembrarLote(productId, conLote);
    const { id: sinLote, marca: marcaSinLote } = await sembrarPresentacion(unidadOriginal);

    await expect(
      inventario.updatePresentation(
        conLote,
        { name: `Renombrada ${marcaConLote}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.toBeInstanceOf(PresentationUnitLockedError);

    await expect(
      inventario.updatePresentation(
        sinLote,
        { name: `Renombrada ${marcaSinLote}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      inventario.updatePresentation(
        sinLote,
        { name: `Renombrada ${marcaSinLote}`, unitId: randomUUID() },
        actorAutorizado(),
      ),
    ).rejects.not.toBeInstanceOf(PresentationUnitLockedError);
    expect(new PresentationUnitLockedError().code).toBe('presentation_unit_locked');
  });

  it('acepta el cambio de unidad de una presentacion sin lotes', async () => {
    const unidadOriginal = await sembrarUnidad();
    const otraUnidad = await sembrarUnidad();
    const { id: presentationId, marca } = await sembrarPresentacion(unidadOriginal);

    await inventario.updatePresentation(
      presentationId,
      { name: `Presentacion ${marca}`, unitId: otraUnidad },
      actorAutorizado(),
    );

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id: presentationId },
      select: { unitId: true },
    });
    expect(despues.unitId).toBe(otraUnidad);
  });

  it('acepta editar una presentacion con lotes cuando la unidad enviada es la misma que ya tenia', async () => {
    const unidad = await sembrarUnidad();
    const { id: presentationId, marca } = await sembrarPresentacion(unidad);
    const productId = await sembrarProducto(unidad);
    await sembrarLote(productId, presentationId);

    await inventario.updatePresentation(
      presentationId,
      { name: `Renombrada sin tocar unidad ${marca}`, unitId: unidad },
      actorAutorizado(),
    );

    const despues = await prisma.presentation.findUniqueOrThrow({
      where: { id: presentationId },
      select: { name: true, unitId: true },
    });
    expect(despues).toEqual({ name: `Renombrada sin tocar unidad ${marca}`, unitId: unidad });
  });
});
