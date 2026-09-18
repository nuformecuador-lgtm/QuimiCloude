// T9 — Adaptador driven de producto.
//
// HONESTIDAD (obligatoria por el prompt de esta task): este archivo NO toca Postgres.
// Solo prueba la funcion PURA de `product-prisma.ts` -el mapeo de fila a `ProductView`-,
// que es lo unico de ese archivo que se puede probar sin base. La garantia real de que
// `deleted_at IS NULL`, el orden `name ASC, id ASC` y la escritura de `name_normalized`
// funcionan contra Postgres es de los tests de INTEGRACION (T14).
//
// La presentacion y la autoria se mudaron a `product_batches` el 2026-09-09, asi que este
// archivo ya no prueba ni el `join` a `presentations` ni la clasificacion de la FK de
// autoria: ninguna de las dos vive ya en `products`.
//
// QC-80 (R21, R22, R23): `products.unit_id` tampoco vive ya ahi. La unidad de un producto se
// DERIVA de la presentacion de su lote mas reciente, asi que este archivo prueba dos cosas que
// antes eran una sola: el MAPEO (`toProductView` con un lote, con varios y sin ninguno) y el
// CRITERIO con el que el motor elige ese lote (`PRODUCT_SELECT`, afirmado como dato).

import {
  PRODUCT_SELECT,
  toProductView,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';

/** Un lote tal como lo devuelve `BATCH_STOCK_BY_UNIT`: su existencia y la unidad de su presentacion. */
function lote(unitId: string, stock = 1) {
  return { stock, presentation: { unitId } };
}

describe('toProductView', () => {
  const filaBase = {
    id: 'p-1',
    name: 'Cloro',
    // 2026-09-07: el producto expone su ruta de imagen. `null` en el fixture base porque hoy
    // nadie llena esa columna; el caso de abajo comprueba que la ruta se copia tal cual.
    imagePath: null,
    qtyAlert: 5,
    // QC-80 (R22): la fila YA NO trae `unit_id` -esa columna desaparecio de `products`-. Trae
    // `batches`, que el `select` acota al lote MAS RECIENTE y, de el, a la unidad de su
    // presentacion. El fixture base tiene un lote: el caso sin ninguno esta mas abajo.
    batches: [lote('u-1')],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('copia la ruta de imagen tal cual, sin componer ninguna URL', () => {
    // 2026-09-07: `inventario` no tiene puerto de almacenamiento -a diferencia de `recetas`-,
    // asi que aqui no se compone URL publica ninguna: lo que hay en la columna es lo que sale.
    expect(toProductView(filaBase).imagePath).toBeNull();
    expect(toProductView({ ...filaBase, imagePath: 'productos/cloro.png' }).imagePath).toBe(
      'productos/cloro.png',
    );
  });

  it('mapea la alerta de cantidad sin reinterpretarla', () => {
    const vista = toProductView(filaBase);
    expect(vista.qtyAlert).toBe(5);
    expect(toProductView({ ...filaBase, qtyAlert: null }).qtyAlert).toBeNull();
  });

  it('no devuelve costo, compra minima ni tiempo de entrega', () => {
    // QC-52 (R1): la vista NO puede llevar costo, compra minima ni tiempo de entrega. Se
    // comprueba sobre el objeto devuelto, no solo con el compilador: un `as any` en el
    // adaptador dejaria pasar el campo sin que el typecheck dijera nada.
    const vista = toProductView(filaBase);
    expect(Object.keys(vista)).not.toContain('cost');
    expect(Object.keys(vista)).not.toContain('minPurchase');
    expect(Object.keys(vista)).not.toContain('deliveryTime');
    expect(Object.keys(vista)).not.toContain('presentationId');
    expect(Object.keys(vista)).not.toContain('presentationName');
    expect(Object.keys(vista)).not.toContain('createdBy');
    expect(Object.keys(vista)).not.toContain('updatedBy');
  });

  it('no devuelve `stock`: la existencia sale unicamente de `stockByUnit` (R11)', () => {
    const vista = toProductView(filaBase);
    expect(Object.keys(vista)).not.toContain('stock');
    expect(Object.keys(PRODUCT_SELECT)).not.toContain('stock');
  });

  it('deriva la unidad de la presentacion del lote, sin resolver nombre ni simbolo (R22)', () => {
    // R22 — la vista lleva el IDENTIFICADOR de la unidad, no el nombre resuelto: resolverlo
    // obligaria a `inventario` a leer la tabla de `unidades`, que es justo lo que la frontera de
    // modulo prohibe. Lo que cambio en QC-80 es de DONDE sale -de `products.unit_id`, que ya no
    // existe, a la presentacion del lote-, no que siga siendo una referencia.
    const vista = toProductView(filaBase);
    expect(vista.latestBatchUnitId).toBe('u-1');
    // El nombre viejo no sobrevive con otro significado: se renombro a proposito.
    expect(Object.keys(vista)).not.toContain('unitId');
  });

  it('con VARIOS lotes `latestBatchUnitId` toma la PRIMERA fila, que es la mas reciente del `orderBy` (R22)', () => {
    // R22 — ELEGIR ES TRABAJO DEL MOTOR. El `select` trae todos los lotes con `created_at DESC,
    // id DESC`; el mapeo no reordena, solo mira la primera fila. Si se pusiera a ordenar aqui
    // habria DOS definiciones de «mas reciente» y podrian discrepar.
    //
    // Que el criterio del motor sea el correcto se afirma como DATO en el bloque de abajo
    // (`PRODUCT_SELECT`), y contra Postgres de verdad en el test de integracion.
    const vista = toProductView({ ...filaBase, batches: [lote('u-nueva'), lote('u-vieja')] });
    expect(vista.latestBatchUnitId).toBe('u-nueva');
  });

  it('sin ningun lote la unidad derivada es null, no una cadena vacia (R23)', () => {
    // R23 — «todavia no se ha comprado», no «sin unidad». Aguas abajo ese `null` es lo que hace
    // que la linea de receta ofrezca el CATALOGO ENTERO (`unitsOfGroup`) en vez de quedarse
    // bloqueada: se escriben recetas antes de comprar el ingrediente.
    const vista = toProductView({ ...filaBase, batches: [] });
    expect(vista.latestBatchUnitId).toBeNull();
  });

  it('sin ningun lote `stockByUnit` es un array vacio (R14)', () => {
    const vista = toProductView({ ...filaBase, batches: [] });
    expect(vista.stockByUnit).toEqual([]);
  });

  it('dos lotes de la misma unidad suman su existencia (R3)', () => {
    const vista = toProductView({ ...filaBase, batches: [lote('u-1', 4), lote('u-1', 6)] });
    expect(vista.stockByUnit).toEqual([{ unitId: 'u-1', quantity: 10 }]);
  });

  it('dos lotes de unidades distintas quedan separados', () => {
    const vista = toProductView({ ...filaBase, batches: [lote('u-1', 4), lote('u-2', 6)] });
    expect(vista.stockByUnit).toEqual([
      { unitId: 'u-2', quantity: 6 },
      { unitId: 'u-1', quantity: 4 },
    ]);
  });

  it('`latestBatchUnitId` sigue saliendo de la primera fila aunque haya mas de una unidad en `stockByUnit`', () => {
    const vista = toProductView({ ...filaBase, batches: [lote('u-nueva', 2), lote('u-vieja', 8)] });
    expect(vista.latestBatchUnitId).toBe('u-nueva');
    expect(vista.stockByUnit).toEqual([
      { unitId: 'u-vieja', quantity: 8 },
      { unitId: 'u-nueva', quantity: 2 },
    ]);
  });
});

describe('PRODUCT_SELECT: como se traen TODOS los lotes del producto (R22)', () => {
  // Se afirma sobre el OBJETO que viaja a Prisma, no sobre el texto del archivo: una asercion
  // sobre el fuente pasaria igual con el criterio equivocado -y no se puede probar contra la
  // base en un test unitario-. Es la unica parte de la derivacion que no vive en `toProductView`.

  it('no acota a un solo lote: trae todos, ordenados por creacion mas reciente primero', () => {
    expect(PRODUCT_SELECT.batches).not.toHaveProperty('take');
    // El desempate por `id` NO es adorno: no hay fecha de compra todavia (es QC-81) y el alta
    // con primer lote escribe producto y lote con un UNICO `now`, asi que dos lotes pueden
    // compartir `created_at` al milisegundo. Sin segundo criterio, la primera fila -de la que
    // sale `latestBatchUnitId`- no estaria definida.
    expect(PRODUCT_SELECT.batches.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('de cada lote lee su existencia y SOLO el `unitId` de su presentacion: no entra en `units`', () => {
    // La travesia `ProductBatch -> Presentation` es INTERNA a `inventario` (los dos modelos son
    // suyos). `units` es de `unidades` y se resuelve por su contrato publico, nunca con un
    // `include` que ninguna guardia de imports detectaria.
    expect(PRODUCT_SELECT.batches.select).toEqual({
      stock: true,
      presentation: { select: { unitId: true } },
    });
  });

  it('el producto ya no selecciona ninguna columna de unidad (R21)', () => {
    expect(Object.keys(PRODUCT_SELECT)).not.toContain('unitId');
  });
});
