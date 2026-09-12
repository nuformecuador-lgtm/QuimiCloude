// QC-90 T5 — El alta de producto CON su primer lote, con doble del puerto (`design.md > 3`,
// `> 6`). Sin base de datos: aqui se prueba la DECISION que vive en `domain/`, no la
// implementacion Prisma (esa es T6/T8).
//
// Los casos de alta ANTERIORES a QC-90 -nombre vacio, nombre de mas de 120, campo de mas-
// siguen en `product-service.test.ts` y no se duplican aqui.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Mock } from 'vitest';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import {
  ProductNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario/domain/errors';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

/** QC-49 (R11): la empresa EN CUYO NOMBRE opera el actor. Los casos de uso la convierten en
 *  `InventoryScope` y se la pasan al puerto; no autoriza nada por si sola. */
const EMPRESA = 'company-a';

const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** QC-74 (R13, R14): conjunto de permisos VACIO. El Operador de hoy si tiene
 *  `inventario.consultar`, asi que no sirve como caso de rechazo. */
const SIN_PERMISO: Actor = { id: 'sin-permiso-1', companyId: EMPRESA, permissions: [] };

/** Actor con OTRO permiso del modulo: consultar no concede modificar (QC-74 R13). */
const SOLO_CONSULTA: Actor = {
  id: 'consulta-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar'],
};

/** Instante fijo, inyectado como dependencia (`now`): ver el comentario en `create-product.ts`. */
const AHORA = new Date('2026-09-10T10:00:00.000Z');

const PRESENTACION = '11111111-1111-4111-8111-111111111111';

/** Entrada valida minima del alta: producto + presentacion + UNO de los dos costos (R11). */
const ALTA_VALIDA = {
  name: 'Acido sulfurico',
  stock: 4,
  qtyAlert: 1,
  presentationId: PRESENTACION,
  unitCost: '12.5000',
};

/**
 * El puerto ENTERO, con cada metodo como espia. Derivarlo de `ProductRepository` -y no
 * escribir la lista a mano- es lo que hace que un metodo nuevo en el puerto se note aqui, y
 * conserva `.mock.calls` TIPADO: sin esto, afirmar sobre los argumentos exigiria un `as`.
 */
type DobleDelPuerto = { [K in keyof ProductRepository]: Mock<ProductRepository[K]> };

/** Doble del puerto que REGISTRA cada llamada. El tipo de retorno lleva `ProductRepository`
 *  en la interseccion a proposito: el objeto tiene que cumplir el puerto entero. */
function montarRepositorio(overrides: Partial<DobleDelPuerto> = {}): DobleDelPuerto &
  ProductRepository {
  return {
    create: vi.fn<ProductRepository['create']>(async () => ({ id: 'producto-1' })),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => null),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => true),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => true),
    listAlive: vi.fn<ProductRepository['listAlive']>(async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    /** Por defecto NO hay producto vivo homonimo: el alta cae al camino de creacion (R16). */
    findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => null),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => ({
      id: 'producto-nuevo-1',
      batchId: 'lote-1',
    })),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => ({
      batchId: 'lote-1',
    })),
    ...overrides,
  };
}

type Repositorio = ReturnType<typeof montarRepositorio>;

/** Los OCHO metodos del puerto, sin llamar. Enumerarlos uno a uno -y no en bucle sobre las
 *  claves- es lo que hace que el mensaje de fallo diga cual se llamo. */
function afirmarPuertoIntacto(products: Repositorio): void {
  expect(products.create).not.toHaveBeenCalled();
  expect(products.findAliveById).not.toHaveBeenCalled();
  expect(products.updateAlive).not.toHaveBeenCalled();
  expect(products.softDeleteAlive).not.toHaveBeenCalled();
  expect(products.listAlive).not.toHaveBeenCalled();
  expect(products.findAliveIdByName).not.toHaveBeenCalled();
  expect(products.createWithFirstBatch).not.toHaveBeenCalled();
  expect(products.addBatchToAlive).not.toHaveBeenCalled();
}

/** El lote que llego al puerto por el camino de CREACION (R16). */
function loteCreado(products: Repositorio): NewProductBatch {
  const llamada = products.createWithFirstBatch.mock.calls[0];
  if (llamada === undefined) throw new Error('createWithFirstBatch no fue llamado');
  return llamada[1];
}

/** El producto que llego al puerto por el camino de CREACION (R16). */
function productoCreado(products: Repositorio): NewProduct {
  const llamada = products.createWithFirstBatch.mock.calls[0];
  if (llamada === undefined) throw new Error('createWithFirstBatch no fue llamado');
  return llamada[0];
}

describe('R23 — el permiso se comprueba antes que nada', () => {
  it.each([
    ['sin ningun permiso', SIN_PERMISO],
    ['con inventario.consultar pero sin modificar', SOLO_CONSULTA],
    ['ausente (null)', null],
    ['ausente (undefined)', undefined],
  ])('rechaza a un actor %s sin una sola llamada al repositorio', async (_etiqueta, actor) => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, actor)).rejects.toBeInstanceOf(UnauthorizedError);
    afirmarPuertoIntacto(products);
  });

  it('rechaza por permiso ANTES que por entrada invalida', async () => {
    // El orden importa y no es observable de otra forma: con una entrada que zod tambien
    // rechazaria, el error tiene que ser el de autorizacion, no el de validacion. Si zod
    // corriera primero, quien no tiene permiso averiguaria si su entrada era valida.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(
      createProduct({ campo: 'que no existe' }, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    afirmarPuertoIntacto(products);
  });
});

describe('R24 — la entrada invalida se rechaza sin tocar el puerto', () => {
  it.each([
    ['sin presentacion (R2)', { presentationId: undefined }],
    ['con una presentacion que no es uuid (R2)', { presentationId: 'bidon-20l' }],
    ['sin ninguno de los dos costos (R11)', { unitCost: undefined }],
    ['con un costo de cero (R5)', { unitCost: '0.0000' }],
    ['con un importe de coma flotante (R4)', { unitCost: 12.5 }],
    ['con un importe con signo (R4)', { unitCost: '-12.5' }],
    ['con un importe de cinco decimales (R4)', { unitCost: '12.50001' }],
    ['con un lote de mas de 60 caracteres (R14)', { lot: 'x'.repeat(61) }],
    ['con una expiracion que no es una fecha civil (R13)', { expiryDate: '10/09/2026' }],
    ['con un campo desconocido (R24)', { colorDelBidon: 'azul' }],
  ])('rechaza el alta %s', async (_etiqueta, sobra) => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct({ ...ALTA_VALIDA, ...sobra }, ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    afirmarPuertoIntacto(products);
  });

  it('rechaza solo-costo-total con existencia 0 (R8) y con un total insuficiente (R9)', async () => {
    // R8 y R9 los caza el esquema -con su `path`, que es lo que el formulario necesita para
    // pintarlos en su campo-. Lo que se mide aqui es que el CASO DE USO los convierte en
    // `ValidationError` y no llega a escribir: `resolverCostoUnitario` repite la comprobacion
    // como defensa en profundidad, pero ni siquiera deberia alcanzarla.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const sinExistencia = { ...ALTA_VALIDA, unitCost: undefined, totalCost: '10', stock: 0 };
    await expect(createProduct(sinExistencia, ADMIN)).rejects.toBeInstanceOf(ValidationError);

    const totalInsuficiente = {
      ...ALTA_VALIDA,
      unitCost: undefined,
      totalCost: '0.0001',
      stock: 5,
    };
    await expect(createProduct(totalInsuficiente, ADMIN)).rejects.toBeInstanceOf(ValidationError);

    afirmarPuertoIntacto(products);
  });
});

describe('R15, R16, R21 — producto nuevo', () => {
  it('busca por el nombre ESCRITO y crea producto y lote en una sola operacion del puerto', async () => {
    // R15: la decision de «ya existe» es por nombre contra los productos vivos, no por un
    // identificador que envie el navegador. Normalizar el nombre y filtrar los borrados es
    // del adaptador (R20 se cierra alli, con su `orderBy`): el caso de uso pasa el nombre tal
    // cual y USA lo que el puerto devuelva.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    // QC-49 (R13, R18): el nombre va TAL CUAL y el ambito de la empresa del actor detras.
    expect(products.findAliveIdByName).toHaveBeenCalledWith('Acido sulfurico', { companyId: EMPRESA });
    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: 'producto-nuevo-1' });
    // R21: UNA operacion del puerto para las dos filas. El dominio no puede dejar la mitad
    // escrita porque no tiene dos llamadas que descoordinar; la transaccion es del adaptador.
    expect(products.createWithFirstBatch.mock.calls[0][2]).toBe(AHORA);
  });

  it('escribe LA MISMA existencia en el producto y en el lote', async () => {
    // R16 + decision cerrada del 2026-09-10: transitoriamente la existencia va en las dos
    // filas, hasta que QC-91 convierta la del producto en la suma de sus lotes.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, stock: 7 }, ADMIN);

    expect(productoCreado(products).stock).toBe(7);
    expect(loteCreado(products).stock).toBe(7);
  });

  it('R1 — ningun camino escribe un producto sin lote', async () => {
    // El puerto no ofrece ninguna forma de crear un producto pelado desde el alta: `create`
    // -que si la ofrece- no se llama nunca. Es el candado de R1 y de `design.md > 10 C`.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);
    await createProduct({ ...ALTA_VALIDA, stock: 0 }, ADMIN);

    expect(products.create).not.toHaveBeenCalled();
  });
});

describe('R3 — existencia cero', () => {
  it('crea el lote igualmente, con stock 0', async () => {
    // El `CHECK` de la columna es `>= 0`: una existencia de 0 no es motivo de rechazo por si
    // sola. Solo lo es junto a «solo costo total», y entonces el rechazo va al campo de la
    // existencia (R8), que se prueba arriba.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, stock: 0 }, ADMIN);

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(loteCreado(products).stock).toBe(0);
  });
});

describe('R6, R7, R10 — el costo que se guarda', () => {
  it('R6 — guarda el costo unitario recibido tal cual, con sus cuatro decimales', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, unitCost: '1234.5678' }, ADMIN);

    expect(loteCreado(products).unitCost).toBe('1234.5678');
  });

  it('R7 — con solo el costo total, escribe el unitario DERIVADO', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(
      { ...ALTA_VALIDA, unitCost: undefined, totalCost: '10', stock: 3 },
      ADMIN,
    );

    // El valor exacto, como CADENA: 10/3 redondeado a los cuatro decimales de la columna.
    expect(loteCreado(products).unitCost).toBe('3.3333');
  });

  it('R10 — con los dos costos, guarda el unitario e ignora el total sin rechazar', async () => {
    // No se comparan uno con otro a proposito (pregunta abierta 4): `total / existencia`
    // redondea, y una discrepancia de un centimo seria un rechazo incorregible. Aqui el
    // total es DELIBERADAMENTE incoherente con el unitario y aun asi el alta pasa.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(
      { ...ALTA_VALIDA, unitCost: '12.5000', totalCost: '999999', stock: 4 },
      ADMIN,
    );

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(loteCreado(products).unitCost).toBe('12.5000');
    // El total no viaja al puerto: `NewProductBatch` no tiene donde ponerlo (`design.md > 10 D`).
    expect(Object.keys(loteCreado(products))).not.toContain('totalCost');
  });
});

describe('R12 — lote y expiracion opcionales', () => {
  it('los guarda en null cuando no vienen', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    // Ausentes por completo...
    await createProduct(ALTA_VALIDA, ADMIN);
    expect(loteCreado(products).lot).toBeNull();
    expect(loteCreado(products).expiryDate).toBeNull();

    // ...y explicitamente nulos, que es como los manda el borde cuando el campo va vacio
    // (`readOptionalFormString` no distingue «no escrito» de «escrito vacio»).
    const otros = montarRepositorio();
    await createCreateProduct({ products: otros, now: () => AHORA })(
      { ...ALTA_VALIDA, lot: null, expiryDate: null },
      ADMIN,
    );
    expect(loteCreado(otros).lot).toBeNull();
    expect(loteCreado(otros).expiryDate).toBeNull();
  });

  it('los guarda cuando vienen, con el lote recortado (R14) y la fecha como texto civil (R13)', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, lot: '  L-2026-01  ', expiryDate: '2026-12-31' }, ADMIN);

    expect(loteCreado(products).lot).toBe('L-2026-01');
    // R13: viaja como CADENA `YYYY-MM-DD`, no como `Date`. Convertirla en el dominio es
    // justo por donde se cuela el corrimiento de dia por zona horaria.
    expect(loteCreado(products).expiryDate).toBe('2026-12-31');
  });
});

describe('R22 — autoria del lote', () => {
  it('escribe el identificador del actor de la sesion en el lote', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, { id: 'usuario-42', companyId: EMPRESA, permissions: ['inventario.modificar'] });

    expect(loteCreado(products).createdBy).toBe('usuario-42');
  });

  it('tambien por el camino del producto que ya existe', async () => {
    const products = montarRepositorio({
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => 'producto-9'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, { id: 'usuario-42', companyId: EMPRESA, permissions: ['inventario.modificar'] });

    expect(products.addBatchToAlive.mock.calls[0][1].createdBy).toBe('usuario-42');
  });
});

describe('R17, R18 — el nombre corresponde a un producto que ya existe', () => {
  function montarConExistente() {
    const products = montarRepositorio({
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => 'producto-9'),
    });
    return { products, createProduct: createCreateProduct({ products, now: () => AHORA }) };
  }

  it('R17 — le agrega el lote y NO crea otro producto', async () => {
    const { products, createProduct } = montarConExistente();

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.addBatchToAlive).toHaveBeenCalledTimes(1);
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
    // El `id` devuelto es el del producto QUE YA EXISTIA: `CreateProductFormState` no cambia
    // de forma por esto (`design.md > 7`).
    expect(resultado).toEqual({ id: 'producto-9' });
  });

  it('R18 — el candidato del producto NO viaja al puerto', async () => {
    // Lo que no se pasa no se puede escribir por accidente: `addBatchToAlive` recibe el
    // identificador, el lote y el instante, y nada mas. El nombre, la existencia, la alerta
    // y la unidad escritos en el panel se quedan aqui.
    const { products, createProduct } = montarConExistente();

    await createProduct({ ...ALTA_VALIDA, stock: 999, qtyAlert: 888, name: 'Otro nombre' }, ADMIN);

    const llamada = products.addBatchToAlive.mock.calls[0];
    // QC-49 (R13): el cuarto argumento es el AMBITO, no un campo del producto. Lo que R18
    // vigila -que el candidato del producto no viaje- sigue intacto: se comprueba abajo, sobre
    // las claves de `llamada[1]`.
    expect(llamada).toHaveLength(4);
    expect(llamada[0]).toBe('producto-9');
    expect(llamada[2]).toBe(AHORA);
    expect(llamada[3]).toEqual({ companyId: EMPRESA });
    // El lote lleva SU existencia -la escrita, que es la del lote que se agrega-, pero no
    // lleva ningun campo del producto: nada que permita tocar `name`, `qty_alert` ni `unit_id`.
    expect(Object.keys(llamada[1]).sort()).toEqual([
      'createdBy',
      'expiryDate',
      'lot',
      'presentationId',
      'stock',
      'unitCost',
    ]);
  });

  it('R20 — usa el identificador que el puerto devuelve, sea cual sea', async () => {
    // El desempate entre homonimos vivos -el mas antiguo, por identificador ascendente- se
    // cierra en el ADAPTADOR, con su `orderBy` (`design.md > 6`), y se prueba en T8 contra la
    // base. Lo unico que le toca al caso de uso es no aplicar ningun criterio propio.
    const products = montarRepositorio({
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => 'el-mas-viejo'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).resolves.toEqual({ id: 'el-mas-viejo' });
    expect(products.addBatchToAlive.mock.calls[0][0]).toBe('el-mas-viejo');
  });

  it('rechaza si el producto dejo de estar vivo entre la consulta y la escritura', async () => {
    // Carrera: `addBatchToAlive` devuelve `null`. Se LANZA en vez de caer al camino de
    // creacion, porque crear aqui escribiria el nombre, la existencia y la alerta del panel
    // -que en este camino R18 declara IGNORADOS- y lo haria en silencio. R1 se mantiene: no
    // se escribio ningun producto, asi que no queda ninguno sin lote. Quien reintenta vuelve
    // a pasar por `findAliveIdByName`, que ya dira `null`, y creara.
    const products = montarRepositorio({
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => 'producto-9'),
      addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => null),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
  });
});

describe('R19 — sin id del puerto, el alta crea producto nuevo', () => {
  // ESTE NO ES EL TEST PRINCIPAL DE R19, y el nombre del `describe` ya no finge que lo sea.
  // R19 dice «el nombre solo coincide con productos BORRADOS logicamente», y esa distincion
  // -vivo contra borrado- vive entera en el ADAPTADOR, en su `deleted_at IS NULL` (R15).
  // Desde el caso de uso los dos escenarios son el MISMO montaje: el puerto devuelve `null`
  // tanto si no hay homonimo como si el unico homonimo esta borrado. Un doble que los
  // distinguiera solo estaria repitiendo aqui la semantica del adaptador, o sea afirmando la
  // premisa; por eso este caso se queda midiendo lo unico que si le toca al dominio -que sin
  // id del puerto se CREA en vez de agregar lote- y la prueba de verdad de R19 se hace contra
  // Postgres, con homonimos borrados sembrados a proposito:
  //
  //   tests/integration/inventario/product-batch-write.int.test.ts
  //   «devuelve null cuando todos los homonimos estan borrados logicamente»
  //
  // (Hallazgo m3 de la revision de QC-90. Si alguien viene a QC-90 buscando «¿donde se prueba
  // R19?», la respuesta es ese archivo, no este.)
  it('crea un producto nuevo en vez de agregarle el lote a otro', async () => {
    // El `null` explicito repite el valor por defecto del doble a proposito: deja el escenario
    // escrito en el propio caso en vez de obligar a ir a leer `montarRepositorio`.
    const products = montarRepositorio({
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => null),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
  });
});

describe('R4 — ningun importe pasa por coma flotante', () => {
  it('el caso de uso no convierte ningun importe a numero en su codigo fuente', () => {
    // Comprobado sobre el TEXTO del archivo y no sobre su comportamiento: un `Number()`
    // intermedio daria el mismo resultado en todos los casos de arriba y aun asi seria
    // exactamente lo que R4 prohibe. Mismo criterio que en `unit-cost.test.ts`.
    const fuente = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'lib',
        'modules',
        'inventario',
        'domain',
        'create-product.ts',
      ),
      'utf8',
    );

    for (const prohibido of ['Number(', 'parseFloat', 'parseInt', 'toFixed']) {
      expect(fuente.includes(prohibido), `create-product.ts no puede usar ${prohibido}`).toBe(
        false,
      );
    }
  });
});
