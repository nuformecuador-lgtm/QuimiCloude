/**
 * QC-80 T13 — la unidad de la presentacion por el CAMINO DE USO, contra Postgres REAL.
 *
 * QUE PRUEBA ESTE ARCHIVO Y QUE NO. Aqui se ejercitan los CASOS DE USO de escritura de
 * presentacion (`inventario.createPresentation` y `inventario.updatePresentation`) cableados con
 * el adaptador Prisma de verdad -no un doble-, tal como los consume una Server Action: se
 * importan de `@/lib/composition`, igual que hace `tests/integration/unidades/unit-write.int.test.ts`
 * con `unidades`. Lo que se vigila es lo que solo la base puede demostrar: que un `unitId` que no
 * corresponde a ninguna unidad del catalogo vuelve como `invalid_input` -traducido desde el
 * rechazo REAL de `presentations_unit_id_fkey`, no desde una comprobacion previa optimista- y no
 * deja fila; que la edicion REEMPLAZA la unidad de verdad en la columna; y que ninguno de los dos
 * caminos escribe en `product_batches` ni mueve ningun importe.
 *
 * La ESTRUCTURA -que la columna sea NOT NULL, que la FK sea RESTRICT, el indice- la prueban
 * `inventario-constraints.int.test.ts` (R1, R2) y los tests estaticos sobre el SQL de la
 * migracion. La unidad DERIVADA del lote mas reciente (R22, R23) la prueba
 * `list-query-products.int.test.ts` por el camino del listado.
 *
 * POR QUE NO HAY `prisma.$transaction` CON ROLLBACK: los casos de uso, a traves del adaptador
 * `presentation-prisma.ts`, llaman al cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no a un
 * `tx` inyectado; una llamada hecha «dentro» del callback de `$transaction` correria en OTRA
 * conexion del pool y no veria las filas de la transaccion. Se usa entonces la estrategia de
 * `unit-write.int.test.ts`: cada caso siembra sus filas con `prisma` real y las borra por su `id`
 * EXACTO, en el orden que exigen las FK (lotes -> productos -> presentaciones -> unidades).
 *
 * NINGUNA AFIRMACION GLOBAL: no se afirma «la tabla esta vacia» ni «hay N filas». Cada caso mira
 * solo lo que el mismo sembro, localizado por `id` o por un marcador irrepetible. Las unidades de
 * apoyo se crean aqui; la unidad de SISTEMA que algun caso necesita se resuelve por
 * `name_normalized` -NUNCA por un uuid escrito a mano: los identificadores los genera
 * `gen_random_uuid()` y son distintos en cada base-.
 *
 * Cubre R12, R13 y R28.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { inventario } from '@/lib/composition';
import { PresentationDuplicateNameError, ValidationError } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/inventario';

// ---------------------------------------------------------------------------
// Datos de apoyo -sin transaccion, ver cabecera-
// ---------------------------------------------------------------------------

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Actor autorizado, tal como lo construiria la Server Action a partir de la sesion. */
function actorAutorizado(): Actor {
  return { id: randomUUID(), permissions: ['inventario.modificar'] };
}

const lotesSembrados: string[] = [];
const productosSembrados: string[] = [];
const presentacionesSembradas: string[] = [];
const unidadesSembradas: string[] = [];

/** Unidad de apoyo. SIN empresa -de sistema- y con simbolo derivado del nombre: desde QC-76
 *  (R15) el simbolo es unico dentro del ambito y un literal fijo chocaria con el catalogo
 *  arrancador. Ningun aserto de este archivo lee el simbolo. */
async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  unidadesSembradas.push(id);
  return id;
}

/** Presentacion sembrada DIRECTO por Prisma -sin pasar por el caso de uso-, para construir el
 *  estado de partida de un caso. */
async function sembrarPresentacion(unitId: string): Promise<{ id: string; marca: string }> {
  const marca = token();
  const { id } = await prisma.presentation.create({
    data: { name: `Presentacion ${marca}`, nameNormalized: `presentacion${marca}`, unitId },
    select: { id: true },
  });
  presentacionesSembradas.push(id);
  return { id, marca };
}

async function sembrarProducto(): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: { name: `Producto ${marca}`, nameNormalized: `producto${marca}` },
    select: { id: true },
  });
  productosSembrados.push(id);
  return id;
}

/** Lote con existencia e importe REALES: es la fila que R28 no deja tocar. */
async function sembrarLote(productId: string, presentationId: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: { productId, presentationId, stock: 17, unitCost: '123.4500' },
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
  // Por `id` EXACTO y en el orden que exigen las FK, todas ON DELETE RESTRICT.
  await prisma.productBatch.deleteMany({ where: { id: { in: lotesSembrados } } });
  await prisma.product.deleteMany({ where: { id: { in: productosSembrados } } });
  await prisma.presentation.deleteMany({ where: { id: { in: presentacionesSembradas } } });
  await prisma.unit.deleteMany({ where: { id: { in: unidadesSembradas } } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('R13 — la unidad que no existe en el catalogo se rechaza con invalid_input y no escribe nada', () => {
  it('el ALTA con una unidad inexistente falla y no deja ninguna presentacion', async () => {
    // R13. El uuid es sintacticamente valido -pasa zod- y no corresponde a ninguna fila de
    // `units`: el unico que puede rechazarlo es `presentations_unit_id_fkey`. Eso es lo que este
    // archivo aporta sobre el unitario, que puede afirmar la traduccion del `'invalid_unit'` pero
    // no que la base lo produzca.
    const marca = token();
    const nombre = `Bidon fantasma ${marca}`;

    await expect(
      inventario.createPresentation({ name: nombre, unitId: randomUUID() }, actorAutorizado()),
    ).rejects.toBeInstanceOf(ValidationError);

    // «Sin escribir nada»: se busca lo que el intento habria escrito, no el total de la tabla.
    const supervivientes = await prisma.presentation.findMany({
      where: { name: nombre },
      select: { id: true },
    });
    expect(supervivientes).toEqual([]);
  });

  it('el rechazo por unidad inexistente es DISTINGUIBLE del rechazo por nombre duplicado', async () => {
    // R13, la mitad que de verdad muerde: los dos caminos fallan, pero no con el mismo error. Si
    // el adaptador tradujera cualquier rechazo de la base a «ya existe ese nombre», la pantalla
    // pediria cambiar el nombre ante una unidad rota, y el usuario no saldria nunca de ahi.
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

    // Y el error de unidad NO es un duplicado disfrazado: `ValidationError` no hereda de
    // `PresentationDuplicateNameError` ni al reves, y el codigo que viaja a la pantalla es otro.
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
    // R13 en el otro camino. Lo que se comprueba despues del rechazo es que la fila no quedo a
    // medias: ni el nombre nuevo sin la unidad nueva, ni al reves.
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
    // R12. La edicion es reemplazo completo: nombre Y unidad. El caso pide las dos cosas a la vez
    // para que un adaptador que escribiera solo `name` -olvidandose de `unit_id`- se pusiera rojo.
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
    // El nombre normalizado se recalcula en la misma escritura: sin esto, la presentacion
    // quedaria encontrable por su nombre VIEJO, en silencio.
    expect(despues.nameNormalized).toBe(`presentacioneditada${marca}`);
  });

  it('la unidad tambien se puede editar SIN cambiar el nombre', async () => {
    // R12, el borde que un reemplazo mal escrito se come: si la edicion solo tocara `unit_id`
    // cuando el nombre cambia, este caso se quedaria con la unidad vieja.
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
    // R28. El lote se siembra con existencia (17) e importe (123.4500) y APUNTA a la presentacion
    // que luego se edita: es el caso en el que una escritura descuidada -un `update` en cascada,
    // un recalculo «de conveniencia»- se llevaria algo por delante.
    const unidadVieja = await sembrarUnidad();
    const unidadNueva = await sembrarUnidad();
    const { id: presentationId, marca } = await sembrarPresentacion(unidadVieja);
    const productId = await sembrarProducto();
    const loteId = await sembrarLote(productId, presentationId);

    const loteAntes = await prisma.productBatch.findUniqueOrThrow({ where: { id: loteId } });
    const lotesAntes = await prisma.productBatch.count({ where: { productId } });
    // La cuenta de pedidos se compara CONSIGO MISMA antes y despues, en la misma consulta y con
    // milisegundos de diferencia: no es una afirmacion sobre cuantos pedidos hay en la base -eso
    // seria fragil-, sino sobre que este camino no escribe ninguno.
    const pedidosAntes = await prisma.order.count();

    const creada = await inventario.createPresentation(
      { name: `Presentacion nueva ${marca}`, unitId: unidadNueva },
      actorAutorizado(),
    );
    anotarParaBorrar(creada.id);
    await inventario.updatePresentation(
      presentationId,
      { name: `Presentacion editada ${marca}`, unitId: unidadNueva },
      actorAutorizado(),
    );

    // El lote entero, columna por columna: misma existencia, mismo costo unitario, misma
    // presentacion y NI SIQUIERA otra marca de modificacion.
    const loteDespues = await prisma.productBatch.findUniqueOrThrow({ where: { id: loteId } });
    expect(loteDespues).toEqual(loteAntes);
    expect(loteDespues.stock).toBe(17);
    expect(loteDespues.unitCost.toFixed(4)).toBe('123.4500');
    expect(loteDespues.presentationId).toBe(presentationId);

    // Ni un lote de mas ni uno de menos para ese producto, y ningun pedido nuevo.
    expect(await prisma.productBatch.count({ where: { productId } })).toBe(lotesAntes);
    expect(await prisma.order.count()).toBe(pedidosAntes);

    // Y el producto tampoco se movio: sigue sin declarar unidad (R21) y con sus propias marcas.
    const producto = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(Object.keys(producto)).not.toContain('unitId');
  });
});
