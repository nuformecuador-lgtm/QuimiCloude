// QC-92 T8 — Los tres casos de uso del libro de inventario, con dobles del puerto.
//
// Cubre R1, R2, R3, R8, R13, R18, R20, R21 y R23. El barrido de autorizacion de los DOCE casos de
// uso del modulo vive en `authorization.test.ts`; aqui se mide el comportamiento propio de cada
// uno: que el permiso rechaza SIN tocar el repositorio, que la entrada invalida muere antes del
// puerto, que el delta viaja con su signo y sin ninguna lectura previa del stock, y que el autor
// del asiento se resuelve contra el directorio de personas.

import type { PeopleDirectory } from '@/lib/modules/identity';
import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createAdjustBatchStock } from '@/lib/modules/inventario/domain/adjust-batch-stock';
import {
  ActionNotAllowedError,
  BatchNotFoundError,
  ProductNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario/domain/errors';
import { createListBatchMovements } from '@/lib/modules/inventario/domain/list-batch-movements';
import { createListProductBatches } from '@/lib/modules/inventario/domain/list-product-batches';
import { MOVEMENT_REASONS } from '@/lib/modules/inventario/domain/movement-reason';
import type { ProductBatchView } from '@/lib/modules/inventario/domain/product-batch-view';
import type { BatchHistoryEntry, OrderNumberDirectory } from '@/lib/modules/inventario/domain/reservation';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const LOTE = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-18T10:00:00.000Z');

function actorCon(permissions: readonly string[], companyId = 'company-a', id = 'actor-1'): Actor {
  return { id, companyId, permissions };
}

const ADMINISTRADOR = actorCon(['inventario.consultar', 'inventario.modificar']);

/** El Operador: solo consulta. Es el actor nombrado por R20 y R21. */
const OPERADOR = actorCon(['inventario.consultar']);

type Dobles = {
  readonly adjustBatchStock: ReturnType<typeof vi.fn>;
  readonly findBatchesOfAliveProduct: ReturnType<typeof vi.fn>;
  readonly findBatchMovements: ReturnType<typeof vi.fn>;
  readonly products: ProductRepository;
};

/**
 * Solo los tres metodos del libro estan poblados: si un caso de uso llamara a cualquier otro del
 * puerto, el doble no lo tiene y el test explota, que es justo lo que se quiere ver (R2).
 */
function montarDobles(): Dobles {
  const adjustBatchStock = vi.fn(async (): Promise<{ stock: number } | null> => ({ stock: 7 }));
  const findBatchesOfAliveProduct = vi.fn(
    async (): Promise<readonly ProductBatchView[]> => [],
  );
  const findBatchMovements = vi.fn(
    async (): Promise<readonly BatchHistoryEntry[] | null> => [],
  );

  const products = {
    adjustBatchStock,
    findBatchesOfAliveProduct,
    findBatchMovements,
  } as unknown as ProductRepository;

  return { adjustBatchStock, findBatchesOfAliveProduct, findBatchMovements, products };
}

function directorioQueExplota(): PeopleDirectory {
  const explota = () => {
    throw new Error('el directorio no debe ser llamado');
  };
  return {
    findAliveRefsInCompany: vi.fn(explota),
    findRefsIncludingDeletedInCompany: vi.fn(explota),
    listAliveInCompany: vi.fn(explota),
  } as unknown as PeopleDirectory;
}

/** Sin pedidos citados en el historial no hay nada que resolver: el doble por defecto no
 *  necesita responder nada. */
function directorioDePedidosVacio(): OrderNumberDirectory {
  return { findNumberTexts: vi.fn(async () => new Map()) };
}

const ENTRADA_VALIDA = { batchId: LOTE, delta: '-3', reason: 'merma' };

describe('QC-92 R20 — el permiso se exige en la primera linea del ajuste', () => {
  const sinPermiso: ReadonlyArray<{ etiqueta: string; actor: Actor | null | undefined }> = [
    { etiqueta: 'sin actor (undefined)', actor: undefined },
    { etiqueta: 'sin actor (null)', actor: null },
    { etiqueta: 'con el conjunto de permisos vacio', actor: actorCon([]) },
    { etiqueta: 'el Operador, que solo tiene inventario.consultar', actor: OPERADOR },
  ];

  for (const { etiqueta, actor } of sinPermiso) {
    it(`R20: rechaza ${etiqueta} sin tocar el repositorio`, async () => {
      const dobles = montarDobles();
      const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

      await expect(ajustar(ENTRADA_VALIDA, actor)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(dobles.adjustBatchStock).not.toHaveBeenCalled();
    });
  }

  it('R20: el permiso se mira ANTES de zod, incluso con entrada invalida', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(ajustar({ campo: 'que no existe' }, OPERADOR)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(dobles.adjustBatchStock).not.toHaveBeenCalled();
  });
});

describe('QC-92 R4 — la cantidad decimal del ajuste', () => {
  const entradasInvalidas: ReadonlyArray<{ etiqueta: string; entrada: unknown }> = [
    { etiqueta: 'delta cero', entrada: { batchId: LOTE, delta: '0', reason: 'merma' } },
    { etiqueta: 'delta cero con decimales', entrada: { batchId: LOTE, delta: '-0.0000', reason: 'merma' } },
    { etiqueta: 'delta de mas de cuatro decimales', entrada: { batchId: LOTE, delta: '1.00001', reason: 'merma' } },
    { etiqueta: 'delta en notacion cientifica', entrada: { batchId: LOTE, delta: '1e3', reason: 'merma' } },
    { etiqueta: 'delta numerico, no cadena', entrada: { batchId: LOTE, delta: 1.5, reason: 'merma' } },
    { etiqueta: 'delta ausente', entrada: { batchId: LOTE, reason: 'merma' } },
    {
      etiqueta: 'batchId que no es uuid',
      entrada: { batchId: 'lote-1', delta: '2', reason: 'merma' },
    },
  ];

  for (const { etiqueta, entrada } of entradasInvalidas) {
    it(`R4: rechaza ${etiqueta} sin tocar el repositorio`, async () => {
      const dobles = montarDobles();
      const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

      await expect(ajustar(entrada, ADMINISTRADOR)).rejects.toBeInstanceOf(ValidationError);
      expect(dobles.adjustBatchStock).not.toHaveBeenCalled();
    });
  }

  it('R4: acepta un delta con hasta cuatro decimales', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(
      ajustar({ batchId: LOTE, delta: '1.5', reason: 'merma' }, ADMINISTRADOR),
    ).resolves.toEqual({ stock: 7 });
    expect(dobles.adjustBatchStock).toHaveBeenCalledWith(LOTE, '1.5', 'merma', 'actor-1', AHORA, {
      companyId: 'company-a',
    });
  });
});

describe('QC-92 R8 — el motivo del conjunto cerrado', () => {
  const motivosInvalidos: ReadonlyArray<{ etiqueta: string; entrada: unknown }> = [
    { etiqueta: 'motivo ausente', entrada: { batchId: LOTE, delta: 2 } },
    {
      etiqueta: 'motivo fuera del conjunto',
      entrada: { batchId: LOTE, delta: 2, reason: 'porque si' },
    },
    { etiqueta: 'motivo vacio', entrada: { batchId: LOTE, delta: 2, reason: '' } },
  ];

  for (const { etiqueta, entrada } of motivosInvalidos) {
    it(`R8: rechaza ${etiqueta} sin tocar el repositorio`, async () => {
      const dobles = montarDobles();
      const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

      await expect(ajustar(entrada, ADMINISTRADOR)).rejects.toBeInstanceOf(ValidationError);
      expect(dobles.adjustBatchStock).not.toHaveBeenCalled();
    });
  }

  it('R8: los cuatro motivos del conjunto pasan y llegan tal cual al puerto', async () => {
    expect(MOVEMENT_REASONS).toHaveLength(4);

    for (const reason of MOVEMENT_REASONS) {
      const dobles = montarDobles();
      const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

      await expect(ajustar({ batchId: LOTE, delta: '2', reason }, ADMINISTRADOR)).resolves.toEqual({
        stock: 7,
      });
      expect(dobles.adjustBatchStock).toHaveBeenCalledWith(LOTE, '2', reason, 'actor-1', AHORA, {
        companyId: 'company-a',
      });
    }
  });
});

describe('QC-92 R1/R2 — el delta viaja con signo y nadie lee el stock previo', () => {
  it('R2: un delta negativo llega al puerto tal cual, con su signo', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(
      ajustar({ batchId: LOTE, delta: '-5', reason: 'rotura' }, ADMINISTRADOR),
    ).resolves.toEqual({ stock: 7 });
    expect(dobles.adjustBatchStock).toHaveBeenCalledWith(LOTE, '-5', 'rotura', 'actor-1', AHORA, {
      companyId: 'company-a',
    });
  });

  it('R2: el caso de uso NO lee ningun stock previo: el puerto solo recibe adjustBatchStock', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await ajustar(ENTRADA_VALIDA, ADMINISTRADOR);

    expect(dobles.adjustBatchStock).toHaveBeenCalledTimes(1);
    // Falsable: si el caso de uso leyera el lote para calcular el total, alguna de estas dos habria
    // sido llamada; y si lo buscara por otro metodo, el doble no lo tiene y el test explotaria.
    expect(dobles.findBatchesOfAliveProduct).not.toHaveBeenCalled();
    expect(dobles.findBatchMovements).not.toHaveBeenCalled();
  });

  it('R1: el total lo devuelve el puerto y el caso de uso lo propaga sin recalcular', async () => {
    const dobles = montarDobles();
    dobles.adjustBatchStock.mockResolvedValue({ stock: 42 });
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(ajustar(ENTRADA_VALIDA, ADMINISTRADOR)).resolves.toEqual({ stock: 42 });
  });
});

describe('QC-92 R18 — el lote ajeno y el inexistente salen por el mismo camino', () => {
  it('R18: el puerto devuelve null y el caso de uso lanza BatchNotFoundError', async () => {
    const dobles = montarDobles();
    dobles.adjustBatchStock.mockResolvedValue(null);
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(ajustar(ENTRADA_VALIDA, ADMINISTRADOR)).rejects.toBeInstanceOf(BatchNotFoundError);
    // No es «producto no encontrado»: lo que no aparece es el LOTE.
    await expect(ajustar(ENTRADA_VALIDA, ADMINISTRADOR)).rejects.not.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});

describe('R31 — un ajuste que suma sobre un producto terminado se rechaza', () => {
  it("R31: el puerto devuelve 'increase_not_allowed' y el caso de uso lanza ActionNotAllowedError", async () => {
    const dobles = montarDobles();
    dobles.adjustBatchStock.mockResolvedValue('increase_not_allowed');
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(
      ajustar({ batchId: LOTE, delta: '1', reason: 'merma' }, ADMINISTRADOR),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
  });
});

describe('R32 — un ajuste que resta sobre un producto terminado sigue las reglas de cualquier lote', () => {
  it('R32: con delta negativo el puerto no devuelve el sentinela y el resultado se propaga', async () => {
    const dobles = montarDobles();
    dobles.adjustBatchStock.mockResolvedValue({ stock: 4 });
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(
      ajustar({ batchId: LOTE, delta: '-1', reason: 'merma' }, ADMINISTRADOR),
    ).resolves.toEqual({ stock: 4 });
  });
});

describe('QC-92 R18 — el ambito sale del actor', () => {
  it('R18: cambiar de actor cambia la empresa que llega al puerto', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await ajustar(ENTRADA_VALIDA, actorCon(['inventario.modificar'], 'company-a', 'actor-a'));
    await ajustar(ENTRADA_VALIDA, actorCon(['inventario.modificar'], 'company-b', 'actor-b'));

    // Falsable: una empresa cableada dentro del caso de uso daria lo mismo con los dos actores.
    expect(dobles.adjustBatchStock.mock.calls[0]?.[5]).toEqual({ companyId: 'company-a' });
    expect(dobles.adjustBatchStock.mock.calls[1]?.[5]).toEqual({ companyId: 'company-b' });
    expect(dobles.adjustBatchStock.mock.calls[0]?.[3]).toBe('actor-a');
    expect(dobles.adjustBatchStock.mock.calls[1]?.[3]).toBe('actor-b');
  });

  it('R13: el `now` inyectado es el que llega al puerto, sin reloj escondido', async () => {
    const dobles = montarDobles();
    const otroInstante = new Date('2030-01-01T00:00:00.000Z');
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => otroInstante });

    await ajustar(ENTRADA_VALIDA, ADMINISTRADOR);

    expect(dobles.adjustBatchStock.mock.calls[0]?.[4]).toBe(otroInstante);
  });
});

describe('QC-92 R21 — listar los lotes de un producto exige inventario.consultar', () => {
  it('R21: el Operador, que solo tiene inventario.consultar, SI puede listar los lotes', async () => {
    const dobles = montarDobles();
    const lotes: readonly ProductBatchView[] = [
      {
        id: LOTE,
        lot: '1',
        stock: '10',
        unitId: 'unidad-1',
        purchaseDate: '2026-09-01',
        expiryDate: null,
        packageContent: null,
      },
    ];
    dobles.findBatchesOfAliveProduct.mockResolvedValue(lotes);

    const listar = createListProductBatches({ products: dobles.products });

    await expect(listar('producto-1', OPERADOR)).resolves.toEqual(lotes);
    expect(dobles.findBatchesOfAliveProduct).toHaveBeenCalledWith('producto-1', {
      companyId: 'company-a',
    });
  });

  it('R21: un actor con solo inventario.modificar es rechazado, sin tocar el repositorio', async () => {
    const dobles = montarDobles();
    const listar = createListProductBatches({ products: dobles.products });

    await expect(listar('producto-1', actorCon(['inventario.modificar']))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(dobles.findBatchesOfAliveProduct).not.toHaveBeenCalled();
  });

  it('R18: el producto inexistente, borrado o ajeno vuelve como lista vacia', async () => {
    const dobles = montarDobles();
    const listar = createListProductBatches({ products: dobles.products });

    await expect(listar('producto-de-otra-empresa', OPERADOR)).resolves.toEqual([]);
  });
});

describe('QC-92 R21/R23 — el historial del lote y el nombre de su autor', () => {
  /** Lo que llega del puerto en `authorName` y `orderNumberText` es el IDENTIFICADOR crudo, no
   *  la forma mostrable. */
  const ASIENTOS: readonly BatchHistoryEntry[] = [
    {
      id: 'asiento-1',
      kind: 'adjustment',
      quantity: '-3',
      reason: 'merma',
      orderNumberText: null,
      authorName: 'usuario-conocido',
      createdAt: '2026-09-18T10:00:00.000Z',
    },
    {
      id: 'asiento-2',
      kind: 'opening',
      quantity: '10',
      reason: null,
      orderNumberText: null,
      authorName: 'usuario-desaparecido',
      createdAt: '2026-09-17T10:00:00.000Z',
    },
  ];

  function directorioCon(
    refs: ReadonlyArray<{ id: string; displayName: string; isActive: boolean }>,
  ): { people: PeopleDirectory; incluyendoBajas: ReturnType<typeof vi.fn> } {
    const incluyendoBajas = vi.fn(async () => refs);
    const people = {
      // Si el caso de uso preguntara por el metodo de ESCRITURA, los autores dados de baja
      // desapareceran del historial. Aqui eso es un fallo ruidoso.
      findAliveRefsInCompany: vi.fn(() => {
        throw new Error('el historial debe preguntar por el metodo que incluye a las bajas');
      }),
      findRefsIncludingDeletedInCompany: incluyendoBajas,
    } as unknown as PeopleDirectory;

    return { people, incluyendoBajas };
  }

  it('R21: un actor con solo inventario.modificar es rechazado, sin tocar el repositorio', async () => {
    const dobles = montarDobles();
    const listar = createListBatchMovements({
      products: dobles.products,
      people: directorioQueExplota(),
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });

    await expect(listar(LOTE, actorCon(['inventario.modificar']))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(dobles.findBatchMovements).not.toHaveBeenCalled();
  });

  it('R23: el autor que vuelve del directorio sale con su nombre mostrable y el que no, con su identificador', async () => {
    const dobles = montarDobles();
    dobles.findBatchMovements.mockResolvedValue(ASIENTOS);
    const { people, incluyendoBajas } = directorioCon([
      { id: 'usuario-conocido', displayName: 'Ana Perez', isActive: true },
    ]);

    const listar = createListBatchMovements({
      products: dobles.products,
      people,
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });
    const salida = await listar(LOTE, OPERADOR);

    expect(salida.map((asiento) => asiento.authorName)).toEqual([
      'Ana Perez',
      'usuario-desaparecido',
    ]);
    // El que no vuelve del directorio SIGUE SALIENDO: nada de `filter`.
    expect(salida).toHaveLength(ASIENTOS.length);
    expect(incluyendoBajas).toHaveBeenCalledWith(
      'company-a',
      ['usuario-conocido', 'usuario-desaparecido'],
      AHORA,
    );
  });

  it('R23: el resto del asiento no se toca al resolver el autor', async () => {
    const dobles = montarDobles();
    dobles.findBatchMovements.mockResolvedValue(ASIENTOS);
    const { people } = directorioCon([
      { id: 'usuario-conocido', displayName: 'Ana Perez', isActive: true },
    ]);

    const listar = createListBatchMovements({
      products: dobles.products,
      people,
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });
    const salida = await listar(LOTE, OPERADOR);

    expect(salida[0]).toEqual({ ...ASIENTOS[0], authorName: 'Ana Perez' });
    expect(salida[1]).toEqual({ ...ASIENTOS[1], authorName: 'usuario-desaparecido' });
  });

  it('R24: el lote sin asientos devuelve lista vacia y NO pregunta al directorio', async () => {
    const dobles = montarDobles();
    dobles.findBatchMovements.mockResolvedValue([]);
    const people = directorioQueExplota();

    const listar = createListBatchMovements({
      products: dobles.products,
      people,
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });

    await expect(listar(LOTE, OPERADOR)).resolves.toEqual([]);
    expect(people.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled();
  });

  it('R18: el lote inexistente o ajeno devuelve null y lanza BatchNotFoundError', async () => {
    const dobles = montarDobles();
    dobles.findBatchMovements.mockResolvedValue(null);

    const listar = createListBatchMovements({
      products: dobles.products,
      people: directorioQueExplota(),
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });

    await expect(listar(LOTE, OPERADOR)).rejects.toBeInstanceOf(BatchNotFoundError);
  });

  it('R18: el ambito de la lectura sale del actor y cambia con el', async () => {
    const dobles = montarDobles();
    const listar = createListBatchMovements({
      products: dobles.products,
      people: directorioQueExplota(),
      orders: directorioDePedidosVacio(),
      now: () => AHORA,
    });

    await listar(LOTE, actorCon(['inventario.consultar'], 'company-a'));
    await listar(LOTE, actorCon(['inventario.consultar'], 'company-b'));

    expect(dobles.findBatchMovements.mock.calls[0]?.[1]).toEqual({ companyId: 'company-a' });
    expect(dobles.findBatchMovements.mock.calls[1]?.[1]).toEqual({ companyId: 'company-b' });
  });

  it('R38: el pedido citado sale con su numero visible, y el que no vuelve del directorio con su identificador', async () => {
    const dobles = montarDobles();
    const asientos: readonly BatchHistoryEntry[] = [
      { ...ASIENTOS[0]!, kind: 'reserve', orderNumberText: 'pedido-conocido' },
      { ...ASIENTOS[1]!, kind: 'consume', orderNumberText: 'pedido-desaparecido' },
      { ...ASIENTOS[0]!, kind: 'opening', orderNumberText: null },
    ];
    dobles.findBatchMovements.mockResolvedValue(asientos);
    const { people } = directorioCon([]);
    const findNumberTexts = vi.fn(async () => new Map([['pedido-conocido', '2026-A-0007']]));
    const orders: OrderNumberDirectory = { findNumberTexts };

    const listar = createListBatchMovements({ products: dobles.products, people, orders, now: () => AHORA });
    const salida = await listar(LOTE, OPERADOR);

    expect(salida.map((asiento) => asiento.orderNumberText)).toEqual([
      '2026-A-0007',
      'pedido-desaparecido',
      null,
    ]);
    expect(findNumberTexts).toHaveBeenCalledWith('company-a', ['pedido-conocido', 'pedido-desaparecido']);
  });

  it('R38: sin ningun pedido citado no se pregunta al directorio de pedidos', async () => {
    const dobles = montarDobles();
    dobles.findBatchMovements.mockResolvedValue(ASIENTOS);
    const { people } = directorioCon([]);
    const findNumberTexts = vi.fn(async () => new Map());
    const orders: OrderNumberDirectory = { findNumberTexts };

    const listar = createListBatchMovements({ products: dobles.products, people, orders, now: () => AHORA });
    await listar(LOTE, OPERADOR);

    expect(findNumberTexts).not.toHaveBeenCalled();
  });
});

describe('QC-138 — el ajuste positivo avisa de la entrada de material (R13, R19, R20, R23)', () => {
  function oyente() {
    const orden: string[] = [];
    const onStockIncreased = vi.fn(async (input: { companyId: string; now: Date }) => {
      void input;
      orden.push('onStockIncreased');
    });
    return { stockIncreases: { onStockIncreased }, onStockIncreased, orden };
  }

  it('R13: un ajuste positivo avisa una vez, despues de que el puerto confirme, con la empresa del actor', async () => {
    const dobles = montarDobles();
    const o = oyente();
    dobles.adjustBatchStock.mockImplementation(async () => {
      o.orden.push('adjustBatchStock');
      return { stock: 7 };
    });
    const ajustar = createAdjustBatchStock({ products: dobles.products, stockIncreases: o.stockIncreases, now: () => AHORA });

    await ajustar({ batchId: LOTE, delta: '2.5', reason: 'conteo_fisico' }, ADMINISTRADOR);

    expect(o.orden).toEqual(['adjustBatchStock', 'onStockIncreased']);
    expect(o.onStockIncreased).toHaveBeenCalledTimes(1);
    expect(o.onStockIncreased).toHaveBeenCalledWith({ companyId: 'company-a', now: AHORA });
  });

  it('R19, R20: un ajuste negativo no avisa', async () => {
    const dobles = montarDobles();
    const o = oyente();
    const ajustar = createAdjustBatchStock({ products: dobles.products, stockIncreases: o.stockIncreases, now: () => AHORA });

    await ajustar({ batchId: LOTE, delta: '-3', reason: 'merma' }, ADMINISTRADOR);

    expect(o.onStockIncreased).not.toHaveBeenCalled();
  });

  it('R20: un ajuste rechazado no avisa: lote inexistente o producto terminado', async () => {
    for (const respuesta of [null, 'increase_not_allowed'] as const) {
      const dobles = montarDobles();
      const o = oyente();
      dobles.adjustBatchStock.mockResolvedValue(respuesta);
      const ajustar = createAdjustBatchStock({ products: dobles.products, stockIncreases: o.stockIncreases, now: () => AHORA });

      await expect(ajustar({ batchId: LOTE, delta: '1', reason: 'merma' }, ADMINISTRADOR)).rejects.toBeDefined();
      expect(o.onStockIncreased, String(respuesta)).not.toHaveBeenCalled();
    }
  });

  it('R13: sin oyente cableado el ajuste positivo funciona igual', async () => {
    const dobles = montarDobles();
    const ajustar = createAdjustBatchStock({ products: dobles.products, now: () => AHORA });

    await expect(ajustar({ batchId: LOTE, delta: '1', reason: 'merma' }, ADMINISTRADOR)).resolves.toEqual({ stock: 7 });
  });
});
